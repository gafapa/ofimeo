import { expect, test, type Page } from '@playwright/test'
import { build } from 'rolldown'
import { resolve } from 'node:path'
import { RELAYS } from './helpers'

// Bundle production modules into a same-origin diagnostic script, not a product API.
let fixture: string
test.beforeAll(async () => {
  const result = await build({
    input: 'storage-fixture', platform: 'browser', write: false,
    output: { format: 'iife', codeSplitting: false }, logLevel: 'silent',
    plugins: [{
      name: 'storage-fixture',
      resolveId(source) {
        if (source === 'storage-fixture') return '\0fixture'
        if (source.endsWith('/i18n')) return '\0i18n'
        if (source === '../home/storage') return '\0storage-ui'
        if (source === './nextcloud') return '\0nextcloud'
        if (source === './network') return '\0network'
        if (source === './store-forward') return '\0store-forward'
      },
      load(id) {
        if (id === '\0i18n') return 'export const t = (key) => key; export const locale = () => "en"'
        if (id === '\0network') return 'export const isRemoteOrigin = () => false; export class RoomProvider {}'
        if (id === '\0store-forward') return 'export const startStoreForward = () => undefined'
        if (id === '\0storage-ui') return 'export const showPersistenceNotice = () => {}'
        if (id === '\0nextcloud') return `export const currentAccount = () => ({}); export const stat = async () => ({}); export const createFolder = async () => {}; export const joinPath = (a,b) => a+'/'+b; export const upload = async () => { if (window.failUpload) throw new Error('Synthetic upload failure') };`
        if (id === '\0fixture') return [
          `import * as backup from ${JSON.stringify(resolve('src/core/backup.ts'))};`,
          `import * as store from ${JSON.stringify(resolve('src/core/store.ts'))};`,
          `import * as library from ${JSON.stringify(resolve('src/core/library.ts'))};`,
          `import * as kv from ${JSON.stringify(resolve('src/core/idb.ts'))};`,
          `import * as storage from ${JSON.stringify(resolve('src/core/y-storage.ts'))};`,
          `import { DocumentPersistence } from ${JSON.stringify(resolve('src/core/document-persistence.ts'))};`,
          `import { createLocalDocument } from ${JSON.stringify(resolve('src/core/session.ts'))};`,
          `import { receiveSealed } from ${JSON.stringify(resolve('src/apps/forms/state.ts'))};`,
          `import * as formCrypto from ${JSON.stringify(resolve('src/apps/forms/crypto.ts'))};`,
          `import * as keys from ${JSON.stringify(resolve('src/core/keys.ts'))};`,
          `import * as Y from 'yjs'; import JSZip from 'jszip';`,
          `window.fixture = {backup,store,library,kv,storage,keys,Y,JSZip,DocumentPersistence,receiveSealed,formCrypto,createLocalDocument};`,
        ].join('\n')
      },
    }],
  })
  fixture = result.output.find((item) => item.type === 'chunk')!.code
})

test.beforeEach(async ({ page }) => {
  await page.route('**/storage-fixture.html', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="script-src \'self\'"></head><body></body></html>' }))
  await page.route('**/storage-fixture.js', (route) => route.fulfill({ contentType: 'text/javascript', body: fixture }))
  await page.goto('/storage-fixture.html')
  await page.addScriptTag({ url: '/storage-fixture.js' })
})

// Functions execute in an isolated browser with synthetic data only.
const run = <T>(page: Page, callback: () => T | Promise<T>) => page.evaluate(callback)

test('form backup restores private answers, responses, grades, versions and template bytes', async ({ page }) => {
  const result = await run(page, async () => {
    const { backup, store, library, storage, keys, Y } = (window as any).fixture
    const link = await keys.resolveKeys(keys.newLinkKeys())
    store.putDoc({ id: 'form-fixture', type: 'forms', key: 'room', title: 'Synthetic form', updated: 1, keys: link.link, access: 'edit' })
    const privateDocument = new Y.Doc()
    for (const name of ['answers', 'responses', 'grades', 'versions']) privateDocument.getMap(name).set('record', `synthetic-${name}`)
    const privateState = Y.encodeStateAsUpdate(privateDocument)
    await storage.mergeState(store.privateDbName('forms', 'form-fixture'), privateState)
    await library.dbPut('templates', { id: 'quiz-template', app: 'forms', name: 'Quiz', description: '', thumb: '', created: 1, state: new Uint8Array([0, 0]), privateState })
    const archive = await backup.openBackup(await backup.buildBackup({ password: 'synthetic-password' }), 'synthetic-password')
    localStorage.clear()
    await library.dbDelete('templates', 'quiz-template')
    await new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase(store.privateDbName('forms', 'form-fixture')); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error) })
    const report = await backup.restoreBackup(archive)
    const restored = new Y.Doc()
    Y.applyUpdate(restored, await storage.readState(store.privateDbName('forms', 'form-fixture')))
    const template = await library.dbGet('templates', 'quiz-template')
    const answers = new Y.Doc()
    Y.applyUpdate(answers, template.privateState)
    return { added: report.added.length, privateData: ['answers', 'responses', 'grades', 'versions'].map((name) => restored.getMap(name).get('record')), templateBytes: template.privateState instanceof Uint8Array, templateAnswer: answers.getMap('answers').get('record'), repeat: (await backup.restoreBackup(archive)).unchanged.length }
  })
  expect(result).toEqual({ added: 1, privateData: ['synthetic-answers', 'synthetic-responses', 'synthetic-grades', 'synthetic-versions'], templateBytes: true, templateAnswer: 'synthetic-answers', repeat: 1 })
})

test('aborts after request success reject KV, library and Yjs writes', async ({ page }) => {
  const result = await run(page, async () => {
    const { kv, library, storage, Y } = (window as any).fixture
    const originalPut = IDBObjectStore.prototype.put
    const originalAdd = IDBObjectStore.prototype.add
    const abort = function (this: IDBObjectStore, original: any, args: any[]) {
      const request = original.apply(this, args)
      request.addEventListener('success', () => this.transaction.abort())
      return request
    }
    IDBObjectStore.prototype.put = function (...args: any[]) { return abort.call(this, originalPut, args) }
    IDBObjectStore.prototype.add = function (...args: any[]) { return abort.call(this, originalAdd, args) }
    const document = new Y.Doc(); document.getMap('data').set('x', 1)
    let results
    try { results = await Promise.allSettled([kv.kvSet('aborted', 'value'), library.dbPut('templates', { id: 'aborted' }), storage.mergeState('ofimeo:aborted', Y.encodeStateAsUpdate(document))]) }
    finally { IDBObjectStore.prototype.put = originalPut; IDBObjectStore.prototype.add = originalAdd }
    return { statuses: results.map((result: any) => result.status), kv: await kv.kvGet('aborted') ?? null, library: await library.dbGet('templates', 'aborted') ?? null }
  })
  expect(result).toEqual({ statuses: ['rejected', 'rejected', 'rejected'], kv: null, library: null })
})

test('live persistence rejects aborted writes and retries all retained changes', async ({ page }) => {
  const result = await run(page, async () => {
    const { DocumentPersistence, storage, Y } = (window as any).fixture
    const doc = new Y.Doc()
    const persistence = new DocumentPersistence('ofimeo:live-abort', doc)
    await persistence.whenSynced
    let warnings = 0
    window.addEventListener('ofimeo-storage-error', () => warnings++)
    const original = IDBObjectStore.prototype.add
    IDBObjectStore.prototype.add = function (...args: any[]) {
      const request = original.apply(this, args as any)
      request.addEventListener('success', () => this.transaction.abort())
      return request
    }
    let rejected = false
    doc.getMap('data').set('first', 'retained after failure')
    try { await persistence.flush() } catch { rejected = true }
    finally { IDBObjectStore.prototype.add = original }
    const before = new Y.Doc()
    Y.applyUpdate(before, await storage.readState(persistence.name))
    doc.getMap('data').set('second', 'next change')
    await persistence.flush()
    await persistence.destroy()
    const after = new Y.Doc()
    Y.applyUpdate(after, await storage.readState(persistence.name))
    return { rejected, warned: warnings > 0, before: before.getMap('data').size, after: after.getMap('data').toJSON() }
  })
  expect(result).toEqual({ rejected: true, warned: true, before: 0, after: { first: 'retained after failure', second: 'next change' } })
})

test('initial persistence rejects a late transaction abort instead of reporting a saved copy', async ({ page }) => {
  const result = await run(page, async () => {
    const { DocumentPersistence, Y } = (window as any).fixture
    const original = IDBObjectStore.prototype.add
    IDBObjectStore.prototype.add = function (...args: any[]) {
      const request = original.apply(this, args as any)
      request.addEventListener('success', () => this.transaction.abort())
      return request
    }
    const doc = new Y.Doc(); doc.getText('content').insert(0, 'prepared copy')
    const persistence = new DocumentPersistence('ofimeo:initial-abort', doc)
    try { await persistence.whenSynced; return false } catch { return true }
    finally { IDBObjectStore.prototype.add = original }
  })
  expect(result).toBe(true)
})

test('log compaction retains changes committed by another open document', async ({ page }) => {
  const result = await run(page, async () => {
    const { DocumentPersistence, storage, Y } = (window as any).fixture
    const name = 'ofimeo:compaction'
    const first = new Y.Doc(), second = new Y.Doc()
    const a = new DocumentPersistence(name, first), b = new DocumentPersistence(name, second)
    await Promise.all([a.whenSynced, b.whenSynced])
    second.getMap('data').set('other-tab', 'keep this')
    await b.flush()
    for (let i = 0; i < 505; i++) { first.getMap('data').set('counter', i); await a.flush() }
    await Promise.all([a.destroy(), b.destroy()])
    const restored = new Y.Doc(); Y.applyUpdate(restored, await storage.readState(name))
    return restored.getMap('data').toJSON()
  })
  expect(result).toEqual({ 'other-tab': 'keep this', counter: 504 })
})

test('a form receipt waits for durable private storage and can retry a failed answer', async ({ page }) => {
  test.skip(!await page.evaluate(() => (window as any).fixture.formCrypto.x25519Available()), 'Native X25519 is unavailable')
  const result = await run(page, async () => {
    const { DocumentPersistence, storage, Y, keys, receiveSealed, formCrypto } = (window as any).fixture
    const editor = await formCrypto.editorKeys(keys.newLinkKeys().edit)
    const priv = new Y.Doc(), doc = new Y.Doc()
    doc.getMap('form-settings').set('quiz', true)
    doc.getMap('form-settings').set('release', 'immediate')
    const persistence = new DocumentPersistence('ofimeo:receipt-private', priv)
    await persistence.whenSynced
    const state = { priv, keys: editor, session: { docId: 'receipt-form', doc }, persistence }
    const { sealed } = await formCrypto.sealResponse('receipt-form', editor.responsePublic, { id: 'answer-1', answers: {} })
    const original = IDBObjectStore.prototype.add
    IDBObjectStore.prototype.add = function (...args: any[]) {
      const request = original.apply(this, args as any)
      request.addEventListener('success', () => this.transaction.abort())
      return request
    }
    let rejected = false
    try { await receiveSealed(state, sealed, 'p2p') } catch { rejected = true }
    finally { IDBObjectStore.prototype.add = original }
    const before = doc.getMap('form-receipts').size
    await receiveSealed(state, sealed, 'p2p')
    const stored = new Y.Doc(); Y.applyUpdate(stored, await storage.readState(persistence.name))
    await persistence.destroy()
    return { rejected, before, acknowledged: doc.getMap('form-receipts').has('answer-1'), persisted: stored.getMap('responses').has('answer-1'), released: doc.getMap('form-results').has('answer-1') }
  })
  expect(result).toEqual({ rejected: true, before: 0, acknowledged: true, persisted: true, released: true })
})

test('copies are not indexed when private state cannot be committed', async ({ page }) => {
  const result = await run(page, async () => {
    const { createLocalDocument, store, Y } = (window as any).fixture
    const priv = new Y.Doc(); priv.getMap('answers').set('q1', { value: 'synthetic' })
    const original = IDBObjectStore.prototype.add
    IDBObjectStore.prototype.add = function (...args: any[]) {
      const request = original.apply(this, args as any)
      if (this.transaction.db.name.endsWith(':forms-private')) request.addEventListener('success', () => this.transaction.abort())
      return request
    }
    let rejected = false
    try { await createLocalDocument('forms', 'Synthetic copy', () => {}, Y.encodeStateAsUpdate(priv)) } catch { rejected = true }
    finally { IDBObjectStore.prototype.add = original }
    return { rejected, docs: store.listDocs().length }
  })
  expect(result).toEqual({ rejected: true, docs: 0 })
})

test('quota failure is reported and the staged restore is retryable', async ({ page }) => {
  const result = await run(page, async () => {
    const { backup, store, kv } = (window as any).fixture
    store.putDoc({ id: 'quota-fixture', type: 'writer', key: 'room', title: 'Synthetic document', updated: 1 })
    const archive = await backup.openBackup(await backup.buildBackup())
    localStorage.clear()
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) { if (key === 'ofimeo:docs') throw new DOMException('Synthetic quota failure', 'QuotaExceededError'); return original.call(this, key, value) }
    let report
    try { report = await backup.restoreBackup(archive) } finally { Storage.prototype.setItem = original }
    const pending = !!await kv.kvGet('restore:quota-fixture')
    const before = store.listDocs().length
    const retry = await backup.restoreBackup(archive)
    return { failed: report.failed.length, added: report.added.length, before, pending, retried: retry.added.length, cleared: !await kv.kvGet('restore:quota-fixture') }
  })
  expect(result).toEqual({ failed: 1, added: 0, before: 0, pending: true, retried: 1, cleared: true })
})

for (const damage of ['missing-index', 'missing-state', 'invalid-update', 'duplicate-id', 'unsafe-id', 'key-conflict', 'type-conflict', 'signer-conflict', 'invalid-template', 'private-without-editor']) {
  test(`invalid backup ${damage} is rejected before local changes`, async ({ page }) => {
    const result = await page.evaluate(async (damage) => {
      const { backup, store, library, keys } = (window as any).fixture
      const resolved = await keys.resolveKeys(keys.newLinkKeys())
      store.putDoc({ id: 'invalid-fixture', type: 'forms', key: 'room', title: 'Synthetic form', updated: 1, keys: resolved.link, access: 'edit' })
      const archive = await backup.openBackup(await backup.buildBackup())
      localStorage.clear()
      if (damage === 'missing-index') { archive.zip.remove('index.json'); try { await backup.openBackup(await archive.zip.generateAsync({ type: 'blob' })); return { rejected: false } } catch { return { rejected: true, docs: store.listDocs().length, folders: library.listFolders().length } } }
      if (damage === 'missing-state') archive.zip.remove('docs/invalid-fixture/doc.yjs')
      if (damage === 'invalid-update') archive.zip.file('docs/invalid-fixture/comments.yjs', new Uint8Array([255]))
      if (damage === 'duplicate-id') archive.index.docs.push(archive.index.docs[0])
      if (damage === 'unsafe-id') archive.index.docs[0].id = '../outside'
      if (damage === 'key-conflict' || damage === 'type-conflict') store.putDoc({ ...archive.index.docs[0], ...(damage === 'key-conflict' ? { key: 'other-room' } : { type: 'writer' }) })
      if (damage === 'signer-conflict') store.putDoc({ ...archive.index.docs[0], keys: (await keys.resolveKeys(keys.newLinkKeys())).link })
      if (damage === 'invalid-template') archive.zip.file('templates.json', '[{"id":"bad"}]')
      if (damage === 'private-without-editor') archive.index.docs[0].keys = keys.keysForAccess(resolved.link, 'view')
      archive.index.library = { folders: [{ id: 'new-folder', name: 'Should not be saved' }], tags: [] }
      const before = JSON.stringify(store.listDocs())
      let rejected = false
      try { await backup.restoreBackup(archive) } catch { rejected = true }
      return { rejected, unchanged: JSON.stringify(store.listDocs()) === before, folders: library.listFolders().length }
    }, damage)
    expect(result.rejected).toBe(true)
    expect(result.folders).toBe(0)
    if ('unchanged' in result) expect(result.unchanged).toBe(true)
  })
}

test('old backups repair numeric private template bytes and warn about missing form records', async ({ page }) => {
  const result = await run(page, async () => {
    const { backup, store, library } = (window as any).fixture
    store.putDoc({ id: 'legacy-form', type: 'forms', key: 'room', title: 'Legacy form', updated: 1 })
    const archive = await backup.openBackup(await backup.buildBackup())
    archive.version = 1
    archive.zip.remove('docs/legacy-form/private.yjs')
    archive.zip.file('templates.json', JSON.stringify([{ id: 'old-template', app: 'forms', name: 'Legacy quiz', description: '', thumb: '', created: 1, state: 'AAA=', privateState: { 0: 0, 1: 0 } }]))
    const report = await backup.restoreBackup(archive)
    const template = await library.dbGet('templates', 'old-template')
    return { warning: report.warnings.length, bytes: Array.from(template.privateState), typed: template.privateState instanceof Uint8Array }
  })
  expect(result).toEqual({ warning: 1, bytes: [0, 0], typed: true })
})

test('archive generation and rejected uploads do not mark a successful backup', async ({ page }) => {
  const result = await run(page, async () => {
    const { backup, store } = (window as any).fixture
    store.putDoc({ id: 'auto-fixture', type: 'writer', key: 'room', title: 'Synthetic document', updated: 1 })
    backup.saveSettings({ lastBackup: 1, firstDocAt: 1, dismissedAt: 2 })
    await backup.buildBackup()
    const generated = backup.loadSettings().lastBackup
    ;(window as any).failUpload = true
    try { await backup.runAutoBackup(true) } catch { /* Expected synthetic upload failure. */ }
    const failed = backup.loadSettings()
    ;(window as any).failUpload = false
    await backup.runAutoBackup(true)
    return { generated, failed: failed.lastBackup, dismissed: failed.dismissedAt, error: failed.auto.lastError, success: backup.loadSettings().lastBackup > 1 }
  })
  expect(result).toEqual({ generated: 1, failed: 1, dismissed: 2, error: 'Synthetic upload failure', success: true })
})

test('corrupted indexes are preserved instead of overwritten with an empty collection', async ({ page }) => {
  const result = await run(page, () => {
    const { store, library } = (window as any).fixture
    localStorage.setItem('ofimeo:docs', 'null')
    localStorage.setItem('ofimeo:library', '{broken')
    let documentRejected = false
    let libraryRejected = false
    try { store.putDoc({ id: 'new', type: 'writer', key: 'room', title: 'Synthetic', updated: 1 }) } catch { documentRejected = true }
    try { library.createFolder('Synthetic') } catch { libraryRejected = true }
    return { documentRejected, libraryRejected, docs: localStorage.getItem('ofimeo:docs'), library: localStorage.getItem('ofimeo:library') }
  })
  expect(result).toEqual({ documentRejected: true, libraryRejected: true, docs: 'null', library: '{broken' })
})

test('storage failures leave an accessible warning while the editor remains usable', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`/${RELAYS}#app=writer&doc=storage-warning`)
  await page.locator('.ProseMirror').waitFor()
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'ofimeo:docs') throw new DOMException('Synthetic quota failure', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  await page.locator('.ProseMirror').fill('Synthetic unsaved edit')
  await expect(page.locator('#storage-failure')).toHaveAttribute('role', 'alert')
  await expect(page.locator('#storage-failure')).toContainText('could not be saved')
  await expect(page.locator('.ProseMirror')).toContainText('Synthetic unsaved edit')
  expect(errors).toEqual([])
})

test('live editor reports an IndexedDB abort and retries before reopening', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`/${RELAYS}#app=writer&doc=live-editor-abort`)
  const editor = page.locator('.ProseMirror')
  await editor.waitFor()
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add
    Object.assign(window, { restoreStorage: () => { IDBObjectStore.prototype.add = original } })
    IDBObjectStore.prototype.add = function (...args: any[]) {
      const request = original.apply(this, args as any)
      if (this.transaction.db.name === 'ofimeo:live-editor-abort') request.addEventListener('success', () => this.transaction.abort())
      return request
    }
  })
  await editor.fill('Retained after an IndexedDB abort')
  await expect(page.locator('#storage-failure')).toContainText('could not be saved')
  await expect(editor).toContainText('Retained after an IndexedDB abort')
  await page.evaluate(() => {
    ;(window as any).restoreStorage()
    const original = IDBObjectStore.prototype.add
    IDBObjectStore.prototype.add = function (...args: any[]) {
      const request = original.apply(this, args as any)
      if (this.transaction.db.name === 'ofimeo:live-editor-abort') this.transaction.addEventListener('complete', () => { (window as any).retryCommitted = true })
      return request
    }
  })
  await editor.press('End')
  await page.keyboard.type(' and retried')
  await expect.poll(() => page.evaluate(() => !!(window as any).retryCommitted)).toBe(true)
  await page.reload()
  await expect(editor).toContainText('Retained after an IndexedDB abort and retried')
  expect(errors).toEqual([])
})
