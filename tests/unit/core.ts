import assert from 'node:assert/strict'
import { accessOf, keysForAccess, mergeKeys, newLinkKeys, resolveKeys, sign, verify } from '../../src/core/keys'
import { isParsed, parseShareLink } from '../../src/core/import-link'
import { listAccounts, saveAccount, removeAccount, startLoginFlow, type NcAccount } from '../../src/core/nextcloud'
import { clearMoodleAccount, loadMoodleAccount, saveMoodleAccount, type MoodleAccount } from '../../src/core/moodle-store'
import * as Y from 'yjs'
import { Channel, RoomProvider } from '../../src/core/network'
import { Awareness } from 'y-protocols/awareness'
import { checkRate, localChange, aiCallStarted, aiCallEnded, userChangedLast, resetActivity, summarizeArgs, MAX_CHANGES_PER_MINUTE } from '../../src/core/webmcp/activity'
import { allowedTools, confirmationOf } from '../../src/core/webmcp/gate'
import type { OfimeoTool } from '../../src/core/webmcp/types'
import { acceptAll, acceptProposal, listProposals, pendingProposals, propose, rejectProposal } from '../../src/core/webmcp/proposals'
import type { Session as OfimeoSession } from '../../src/core/session'
import { describeDiff, diffLines } from '../../src/core/webmcp/diff'

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
  await check('Ed25519 fallback interoperates with native signatures without losing permissions', async () => {
    const originalImport = crypto.subtle.importKey.bind(crypto.subtle)
    crypto.subtle.importKey = ((...args: Parameters<typeof crypto.subtle.importKey>) => {
      const algorithm = args[2]
      if (algorithm === 'Ed25519' || (typeof algorithm === 'object' && algorithm.name === 'Ed25519')) throw new DOMException('Synthetic unsupported algorithm', 'NotSupportedError')
      return originalImport(...args)
    }) as typeof crypto.subtle.importKey
    try {
      const fallback = await resolveKeys({ edit: editor.link.edit })
      assert.equal(fallback.link.verify, editor.link.verify)
      assert.equal(fallback.link.cverify, editor.link.cverify)
      assert.equal(fallback.access, 'edit')
      const payload = new TextEncoder().encode('synthetic compatibility check')
      const signature = await sign(fallback.editSigner!, payload)
      assert.equal(await verify(editor.editVerifier!, signature, payload), true)
      const nativeSignature = await sign(editor.editSigner!, payload)
      assert.equal(await verify(fallback.editVerifier!, nativeSignature, payload), true)
      assert.equal(await verify(fallback.editVerifier!, nativeSignature, new Uint8Array([1])), false)
      const view = await resolveKeys(keysForAccess(fallback.link, 'view'))
      assert.equal(view.access, 'view')
      assert.equal(view.editSigner, undefined)
      await assert.rejects(sign(view.editVerifier!, payload))
    } finally { crypto.subtle.importKey = originalImport }
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
  await check('the Nextcloud login flow only opens web addresses', async () => {
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })
    const realFetch = globalThis.fetch
    const answer = (login: string) => (globalThis.fetch = (async () => new Response(JSON.stringify({ login, poll: { token: 't', endpoint: 'x' } }), { status: 200 })) as typeof fetch)
    try {
      answer('javascript:alert(document.domain)')
      await assert.rejects(startLoginFlow('https://cloud.example'))
      answer('https://cloud.example/login/v2/flow/abc')
      assert.equal((await startLoginFlow('https://cloud.example')).login, 'https://cloud.example/login/v2/flow/abc')
    } finally {
      globalThis.fetch = realFetch
    }
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
  await check('missing WebRTC preserves local documents without claiming peers', async () => {
    const doc = new Y.Doc()
    const awareness = new Awareness(doc)
    const room = new RoomProvider(doc, awareness, { roomId: 'synthetic-local', password: 'synthetic-key' })
    try {
      await room.whenReady()
      assert.equal(room.realtimeAvailable, false)
      assert.equal(room.peerCount, 0)
      assert.deepEqual(room.connections(), {})
      doc.getText('t').insert(0, 'synthetic local edit')
      assert.equal(doc.getText('t').toString(), 'synthetic local edit')
      await room.makeAction('synthetic').send(new Uint8Array([1]))
    } finally { await room.destroy(); awareness.destroy(); doc.destroy() }
  })
  await check('WebMCP: tools are offered by access level', () => {
    const tool = (name: string, access: OfimeoTool['access']): OfimeoTool => ({ name, description: '', inputSchema: { type: 'object', properties: {} }, access, execute: () => null })
    const all = [tool('read', 'view'), tool('note', 'comment'), tool('change', 'edit')]
    assert.deepEqual(allowedTools({ access: 'view' }, all).map((x) => x.name), ['read'])
    assert.deepEqual(allowedTools({ access: 'comment' }, all).map((x) => x.name), ['read', 'note'])
    assert.deepEqual(allowedTools({ access: 'edit' }, all).map((x) => x.name), ['read', 'note', 'change'])
  })
  await check('WebMCP: destructive and large changes are confirmed', () => {
    const base: OfimeoTool = { name: 'delete_rows', description: '', inputSchema: { type: 'object', properties: {} }, access: 'edit', execute: () => null }
    assert.equal(confirmationOf(base, {}), null)
    assert.match(confirmationOf({ ...base, destructive: true }, { rows: '2:4' }) ?? '', /delete_rows .*2:4/)
    assert.equal(confirmationOf({ ...base, confirm: (a) => (Number(a.n) > 10 ? 'many' : null) }, { n: 3 }), null)
    assert.equal(confirmationOf({ ...base, confirm: (a) => (Number(a.n) > 10 ? 'many' : null) }, { n: 30 }), 'many')
  })
  await check('WebMCP: changes are rate limited', () => {
    resetActivity()
    const now = 1_000_000
    for (let i = 0; i < MAX_CHANGES_PER_MINUTE; i++) checkRate(now + i)
    assert.throws(() => checkRate(now + MAX_CHANGES_PER_MINUTE), /Too many changes/)
    checkRate(now + 61_000 + MAX_CHANGES_PER_MINUTE)
    assert.ok(summarizeArgs({ text: 'x'.repeat(1000) }).length <= 200)
  })
  await check('WebMCP: knows whether the user changed the document after the assistant', () => {
    resetActivity()
    aiCallStarted()
    localChange(Date.now())
    aiCallEnded(true)
    assert.equal(userChangedLast(), false)
    localChange(Date.now() + 5000)
    assert.equal(userChangedLast(), true)
    resetActivity()
  })
  await check('WebMCP: proposals run only when accepted, in order, and report failures', async () => {
    const fake = {} as OfimeoSession
    const ran: string[] = []
    const a = propose(fake, 'write_range', 'A', {}, async () => (ran.push('a'), 'done'))
    const b = propose(fake, 'clear_range', 'B', {}, async () => { ran.push('b'); throw new Error('nope') })
    const c = propose(fake, 'add_sheet', 'C', {}, async () => ran.push('c'))
    assert.equal(pendingProposals(fake).length, 3)
    rejectProposal(fake, c.id)
    assert.deepEqual(ran, [])
    await acceptProposal(fake, a.id)
    await acceptAll(fake)
    assert.deepEqual(ran, ['a', 'b'])
    assert.deepEqual(listProposals(fake).map((p) => [p.id, p.status]), [[a.id, 'accepted'], [b.id, 'failed'], [c.id, 'rejected']])
    assert.equal(listProposals(fake)[1].error, 'nope')
    await assert.rejects(acceptProposal(fake, a.id), /No pending proposal/)
  })
  await check('WebMCP: line differences', () => {
    assert.deepEqual(diffLines(['a', 'b', 'c'], ['a', 'x', 'c']), [{ op: '-', line: 'b' }, { op: '+', line: 'x' }])
    assert.deepEqual(diffLines(['a'], ['a', 'b']), [{ op: '+', line: 'b' }])
    assert.deepEqual(diffLines(['a', 'b'], ['b']), [{ op: '-', line: 'a' }])
    assert.deepEqual(diffLines(['same'], ['same']), [])
    const lines = (prefix: string) => Array.from({ length: 50 }, (_x, i) => `${prefix}${i}`).join('\n')
    const big = describeDiff(lines('l'), lines('m'), 10)
    assert.equal(big.added, 50)
    assert.equal(big.removed, 50)
    assert.equal(big.changes.length, 10)
    assert.equal(big.truncated, 90)
  })
  console.log(`${count}/${count} core tests passed`)
}
