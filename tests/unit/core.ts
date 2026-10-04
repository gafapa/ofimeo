import assert from 'node:assert/strict'
import { accessOf, keysForAccess, mergeKeys, newLinkKeys, resolveKeys, sign, verify } from '../../src/core/keys'
import { isParsed, parseShareLink } from '../../src/core/import-link'
import { listAccounts, saveAccount, removeAccount, type NcAccount } from '../../src/core/nextcloud'
import { clearMoodleAccount, loadMoodleAccount, saveMoodleAccount, type MoodleAccount } from '../../src/core/moodle-store'
import * as Y from 'yjs'
import { Channel, type RoomProvider } from '../../src/core/network'

class TestStorage {
  values = new Map<string, string>()
  blocked = false
  getItem(key: string) { if (this.blocked) throw new Error('Storage disabled'); return this.values.get(key) ?? null }
  setItem(key: string, value: string) { if (this.blocked) throw new Error('Quota exceeded'); this.values.set(key, value) }
  removeItem(key: string) { if (this.blocked) throw new Error('Storage disabled'); this.values.delete(key) }
}

export async function runTests(): Promise<void> {
  let count = 0
  const check = async (name: string, run: () => void | Promise<void>) => {
    try { await run(); count++ } catch (error) { throw new Error(name, { cause: error }) }
  }
  const local = new TestStorage()
  const session = new TestStorage()
  Object.assign(globalThis, { localStorage: local, sessionStorage: session })
  const editor = await resolveKeys(newLinkKeys())
  const viewer = keysForAccess(editor.link, 'view')
  const commenter = keysForAccess(editor.link, 'comment')
  await check('view links contain no signing seeds', () => {
    assert.equal(viewer.edit, undefined)
    assert.equal(viewer.comment, undefined)
    assert.equal(accessOf(keysForAccess(viewer, 'edit')), 'view')
  })
  await check('comment links cannot acquire editor seeds', () => {
    assert.equal(keysForAccess(commenter, 'edit').edit, undefined)
    assert.equal(accessOf(keysForAccess(commenter, 'edit')), 'comment')
  })
  await check('missing keys do not downgrade a protected document', async () => {
    const result = await mergeKeys(viewer, {})
    assert.equal(result.keys.signed, true)
    assert.equal(result.keys.access, 'view')
  })
  await check('unrelated editor keys cannot replace stored public keys', async () => {
    const result = await mergeKeys(viewer, newLinkKeys())
    assert.equal(result.ignoredLink, true)
    assert.equal(result.keys.access, 'view')
  })
  await check('inconsistent public keys are rejected', async () => {
    const other = await resolveKeys(newLinkKeys())
    await assert.rejects(resolveKeys({ ...editor.link, verify: other.link.verify }))
  })
  await check('signatures reject changed payloads and unrelated signers', async () => {
    const payload = new TextEncoder().encode('authorized update')
    const signature = await sign(editor.editSigner!, payload)
    assert.equal(await verify(editor.editVerifier!, signature, payload), true)
    assert.equal(await verify(editor.editVerifier!, signature, new TextEncoder().encode('changed update')), false)
    const other = await resolveKeys(newLinkKeys())
    assert.equal(await verify(other.editVerifier!, signature, payload), false)
  })
  await check('untrusted hosts and executable URLs cannot become imports', () => {
    for (const url of ['https://docs.google.com.evil.example/document/d/1234567890/edit', 'javascript://docs.google.com/document/d/1234567890', 'data:text/html,<script>evil()</script>']) assert.equal(isParsed(parseShareLink(url)), false)
  })
  await check('Google imports keep the requested sheet', () => {
    const parsed = parseShareLink('https://docs.google.com/spreadsheets/d/1234567890/edit#gid=42')
    assert.ok(isParsed(parsed))
    assert.ok(parsed.exports.some((entry) => entry.url.endsWith('&gid=42')))
  })
  const account: NcAccount = { id: 'student', server: 'https://cloud.example', user: 'student', loginName: 'student', appPassword: 'test-session', remember: false }
  await check('session Nextcloud credentials never enter persistent storage', () => {
    saveAccount(account)
    assert.ok(!local.getItem('ofimeo:nextcloud')?.includes(account.appPassword))
    assert.ok(session.getItem('ofimeo:nextcloud')?.includes(account.appPassword))
    assert.equal(listAccounts()[0].id, account.id)
  })
  await check('persistent and session accounts can both be selected', () => {
    const teacher = { ...account, id: 'teacher', appPassword: 'test-persistent', remember: true }
    saveAccount(teacher)
    assert.equal(listAccounts()[0].id, 'teacher')
    saveAccount(account)
    assert.equal(listAccounts()[0].id, 'student')
    assert.equal(listAccounts().length, 2)
  })
  await check('unavailable Nextcloud storage retains this page connection and signs out', () => {
    local.blocked = session.blocked = true
    saveAccount(account)
    assert.equal(listAccounts()[0].id, account.id)
    removeAccount(account.id)
    assert.equal(listAccounts().length, 0)
    local.blocked = session.blocked = false
  })
  const moodle: MoodleAccount = { site: 'https://moodle.example', token: 'test-token', siteName: 'School', fullName: 'Student', userId: 1, transport: 'direct', connectedAt: 1, remember: false }
  await check('session Moodle credentials stay out of localStorage and disconnect clears them', () => {
    saveMoodleAccount(moodle)
    assert.equal(local.getItem('ofimeo:moodle'), null)
    assert.ok(session.getItem('ofimeo:moodle')?.includes(moodle.token))
    clearMoodleAccount()
    assert.equal(loadMoodleAccount(), null)
    assert.equal(session.getItem('ofimeo:moodle'), null)
  })
  await check('Moodle can connect and disconnect without browser storage', () => {
    local.blocked = session.blocked = true
    saveMoodleAccount(moodle)
    assert.equal(loadMoodleAccount()?.token, moodle.token)
    clearMoodleAccount()
    assert.equal(loadMoodleAccount(), null)
  })
  await check('a forged copy with a genuine signature does not hide the real change', async () => {
    Object.assign(globalThis, { window: globalThis })
    // A room with one remote peer; nothing is sent anywhere.
    const peers = new Map<string, { id: string }>()
    const provider = { peers, peerCount: 0, peer: (id: string) => peers.get(id) ?? peers.set(id, { id }).get(id)! } as unknown as RoomProvider
    const action = () => ({ send: async () => {}, onMessage: (() => {}) as (data: Uint8Array, meta: { peerId: string }) => void })
    const context = 'doc:main'
    const writerDoc = new Y.Doc()
    const writer = new Channel(provider, action() as never, writerDoc, { verifier: editor.editVerifier!, signer: editor.editSigner!, context })
    writerDoc.getText('t').insert(0, 'genuine change')
    const genuine = await writer.sealForStore(Y.encodeStateAsUpdate(writerDoc))
    writer.destroy()
    // Same signature, altered payload: one byte of the update flipped.
    const forged = genuine.slice()
    forged[6] ^= 0xff
    const viewerDoc = new Y.Doc()
    const viewerAction = action()
    const reader = new Channel(provider, viewerAction as never, viewerDoc, { verifier: editor.editVerifier!, context })
    viewerAction.onMessage(forged, { peerId: 'attacker' })
    await new Promise((resolve) => setTimeout(resolve, 50))
    viewerAction.onMessage(genuine, { peerId: 'editor' })
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(viewerDoc.getText('t').toString(), 'genuine change')
    reader.destroy()
  })
  console.log(`${count}/${count} core tests passed`)
}
