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
        if (source === './i18n') return '\0i18n'
        if (source === '../home/storage') return '\0storage-ui'
        if (source === './nextcloud') return '\0nextcloud'
      },
      load(id) {
        if (id === '\0i18n') return 'export const t = (key) => key'
        if (id === '\0storage-ui') return 'export const showPersistenceNotice = () => {}'
        if (id === '\0nextcloud') return `export const currentAccount = () => ({}); export const stat = async () => ({}); export const createFolder = async () => {}; export const joinPath = (a,b) => a+'/'+b; export const upload = async () => { if (window.failUpload) throw new Error('Synthetic upload failure') };`
        if (id === '\0fixture') return [
          `import * as backup from ${JSON.stringify(resolve('src/core/backup.ts'))};`,
          `import * as store from ${JSON.stringify(resolve('src/core/store.ts'))};`,
          `import * as library from ${JSON.stringify(resolve('src/core/library.ts'))};`,
          `import * as kv from ${JSON.stringify(resolve('src/core/idb.ts'))};`,
          `import * as storage from ${JSON.stringify(resolve('src/core/y-storage.ts'))};`,
          `import * as keys from ${JSON.stringify(resolve('src/core/keys.ts'))};`,
          `import * as Y from 'yjs'; import JSZip from 'jszip';`,
          `window.fixture = {backup,store,library,kv,storage,keys,Y,JSZip};`,
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
