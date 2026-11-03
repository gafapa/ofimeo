import { expect, test } from '@playwright/test'
import { RELAYS, openApp, openLibrary, trackErrors, uniqueDoc } from './helpers'

test.use({ serviceWorkers: 'block' })

test.beforeEach(async ({ page }) => {
  // A same-origin page without app code lets us prepare storage safely.
  // Firefox downloads manifests instead of navigating to them.
  await page.route('**/legacy-storage-fixture.html', (route) => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><html lang="en"><body></body></html>',
  }))
})

// Data saved before the rename is copied; originals stay available for recovery.
test('documents saved under the former name are copied without deleting the originals', async ({ page }) => {
  const errors = trackErrors(page)
  const id = uniqueDoc('legacy')
  await openApp(page, 'writer', id)
  await page.locator('#doc-title').fill('Saved before the rename')
  await page.locator('#doc-title').press('Enter')
  await page.locator('.ProseMirror').first().click()
  await page.keyboard.type('Written by an older version.')
  await expect(page.locator('.save-indicator')).not.toHaveClass(/\bsaving\b/)
  await expect.poll(() => page.evaluate((id) => JSON.parse(localStorage.getItem('ofimeo:docs') ?? '[]').find((entry: { id: string }) => entry.id === id)?.title, id)).toBe('Saved before the rename')
  // Verify the durable precondition before renaming any store. In particular,
  // a title entered during startup must not be lost before migration runs.
  await page.reload()
  await expect(page.locator('#doc-title')).toHaveValue('Saved before the rename')
  await expect(page.locator('.ProseMirror').first()).toContainText('Written by an older version.')

  // Outside the app (same origin), rename everything back to the former names.
  await page.goto('/legacy-storage-fixture.html')
  await page.evaluate(async () => {
    const done = <T>(req: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
    for (const key of Object.keys(localStorage))
      if (key.startsWith('ofimeo:')) {
        localStorage.setItem(key.replace(/^ofimeo/, 'words-online'), localStorage.getItem(key)!)
        localStorage.removeItem(key)
      }
    for (const { name } of await indexedDB.databases()) {
      if (!name?.startsWith('ofimeo')) continue
      const source = await done(indexedDB.open(name))
      const stores = [...source.objectStoreNames]
      const open = indexedDB.open(name.replace(/^ofimeo/, 'words-online'), source.version)
      open.onupgradeneeded = () => {
        const tx = source.transaction(stores, 'readonly')
        for (const s of stores) {
          const from = tx.objectStore(s)
          open.result.createObjectStore(s, { keyPath: from.keyPath, autoIncrement: from.autoIncrement })
        }
      }
      const target = await done(open)
      for (const s of stores) {
        const from = source.transaction(s, 'readonly').objectStore(s)
        const [keys, values] = await Promise.all([done(from.getAllKeys()), done(from.getAll())])
        const to = target.transaction(s, 'readwrite').objectStore(s)
        await Promise.all(keys.map((k, i) => done(to.keyPath === null ? to.put(values[i], k) : to.put(values[i]))))
      }
      source.close()
      target.close()
      await done(indexedDB.deleteDatabase(name))
    }
  })

  await page.goto(`/${RELAYS}`)
  await openLibrary(page)
  await expect(page.locator(`.doc-row[data-id="${id}"]`)).toContainText('Saved before the rename')
  const names = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))
  expect(names).toContain(`ofimeo:${id}`)
  expect(names).toContain(`words-online:${id}`)
  expect(await page.evaluate(() => localStorage.getItem('words-online:docs'))).toContain('Saved before the rename')

  await page.goto(`/${RELAYS}#app=writer&doc=${id}`)
  await expect(page.locator('.ProseMirror').first()).toContainText('Written by an older version.')
  await page.locator('.ProseMirror').first().click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(' Continued in Ofimeo.')
  await page.waitForTimeout(1000)
  await page.reload()
  await expect(page.locator('.ProseMirror').first()).toContainText('Continued in Ofimeo.')
  expect(errors).toEqual([])
})

test('coexisting databases and indexes stay independent, including colliding sequence keys', async ({ page }) => {
  await page.goto('/legacy-storage-fixture.html')
  const result = await page.evaluate(async () => {
    const open = (name: string, version: number) => new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(name, version)
      req.onupgradeneeded = () => req.result.createObjectStore('updates')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const seed = async (name: string, version: number, records: [number, string][]) => {
      const db = await open(name, version)
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('updates', 'readwrite')
        tx.oncomplete = () => resolve()
        tx.onabort = () => reject(tx.error)
        for (const [key, value] of records) tx.objectStore('updates').put(value, key)
      })
      db.close()
    }
    localStorage.setItem('words-online:docs', '[{"id":"old-only","title":"Old index"}]')
    localStorage.setItem('ofimeo:docs', '[]')
    localStorage.setItem('words-online:user', '{"name":"Old identity"}')
    localStorage.setItem('ofimeo:user', '{"name":"Current identity"}')
    await seed('words-online:coexist', 2, [[1, 'old history'], [2, 'old second update']])
    await seed('ofimeo:coexist', 1, [[1, 'different current history']])
    // A higher current schema must also stay untouched.
    await seed('words-online:higher', 1, [[1, 'old']])
    await seed('ofimeo:higher', 3, [[1, 'current']])
    return true
  })
  expect(result).toBe(true)
  await page.goto(`/${RELAYS}`)
  await page.locator('#home-tab-docs').waitFor()
  const stored = await page.evaluate(async () => {
    const read = (name: string) => new Promise<{ version: number; values: unknown[] }>((resolve, reject) => {
      const req = indexedDB.open(name)
      req.onerror = () => reject(req.error)
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction('updates', 'readonly')
        const values = tx.objectStore('updates').getAll()
        tx.oncomplete = () => { db.close(); resolve({ version: db.version, values: values.result }) }
      }
    })
    return {
      old: await read('words-online:coexist'), current: await read('ofimeo:coexist'), higher: await read('ofimeo:higher'),
      oldIndex: localStorage.getItem('words-online:docs'), index: localStorage.getItem('ofimeo:docs'),
      oldUser: localStorage.getItem('words-online:user'), user: localStorage.getItem('ofimeo:user'),
    }
  })
  expect(stored.old).toEqual({ version: 2, values: ['old history', 'old second update'] })
  expect(stored.current).toEqual({ version: 1, values: ['different current history'] })
  expect(stored.higher).toEqual({ version: 3, values: ['current'] })
  expect(stored.oldIndex).toContain('Old index')
  expect(stored.index).toBe('[]')
  expect(stored.oldUser).toContain('Old identity')
  expect(stored.user).toContain('Current identity')
})

test('an aborted migration rolls back all stores and can be retried', async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto('/legacy-storage-fixture.html')
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('words-online:atomic-copy', 3)
      req.onupgradeneeded = () => {
        req.result.createObjectStore('updates', { autoIncrement: true }).put('preserve this update', 1)
        const metadata = req.result.createObjectStore('metadata', { keyPath: ['id', 'kind'] })
        metadata.createIndex('by-label', 'label', { unique: true })
        metadata.put({ id: 'document', kind: 'meta', label: 'preserve this metadata' })
      }
      req.onsuccess = () => { req.result.close(); resolve() }
      req.onerror = () => reject(req.error)
    })
    sessionStorage.setItem('abort-legacy-copy', 'yes')
  })
  await page.addInitScript(() => {
    if (sessionStorage.getItem('abort-legacy-copy') !== 'yes') return
    sessionStorage.removeItem('abort-legacy-copy')
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      const req = put.apply(this, args)
      if (this.transaction.db.name === 'ofimeo:atomic-copy' && this.name === 'metadata') {
        req.addEventListener('success', () => this.transaction.abort(), { once: true })
      }
      return req
    }
  })
  await page.goto(`/${RELAYS}`)
  await page.locator('#home-tab-docs').waitFor()
  const names = await page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name))
  expect(names).toContain('words-online:atomic-copy')
  expect(names).not.toContain('ofimeo:atomic-copy')
  await page.reload()
  await page.locator('#home-tab-docs').waitFor()
  const snapshot = await page.evaluate(async () => {
    const req = indexedDB.open('ofimeo:atomic-copy')
    const db = await new Promise<IDBDatabase>((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })
    const tx = db.transaction(['updates', 'metadata'], 'readonly')
    const updates = tx.objectStore('updates')
    const metadata = tx.objectStore('metadata')
    const values = updates.getAll()
    const indexed = metadata.index('by-label').get('preserve this metadata')
    const schema = { version: db.version, keyPath: metadata.keyPath, autoIncrement: updates.autoIncrement, unique: metadata.index('by-label').unique }
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error) })
    db.close()
    return { ...schema, values: values.result, indexed: indexed.result }
  })
  expect(snapshot).toEqual({ version: 3, keyPath: ['id', 'kind'], autoIncrement: true, unique: true, values: ['preserve this update'], indexed: { id: 'document', kind: 'meta', label: 'preserve this metadata' } })
  expect(errors).toEqual([])
})

test('database enumeration fallback reads both indexes even if one is corrupt', async ({ page }) => {
  await page.goto('/legacy-storage-fixture.html')
  await page.evaluate(async () => {
    localStorage.setItem('words-online:docs', '[{"id":"fallback-old"}]')
    localStorage.setItem('ofimeo:docs', '{broken')
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('words-online:fallback-old')
      req.onupgradeneeded = () => req.result.createObjectStore('updates').put('old-only document', 1)
      req.onsuccess = () => { req.result.close(); resolve() }
      req.onerror = () => reject(req.error)
    })
  })
  await page.addInitScript(() => Object.defineProperty(indexedDB, 'databases', { value: undefined }))
  await page.goto(`/${RELAYS}`)
  // The corrupt current index may prevent the home screen from opening. The
  // migration still runs first and must preserve both indexes and copy the DB.
  await expect.poll(() => page.evaluate(async () => {
    const req = indexedDB.open('ofimeo:fallback-old')
    req.onupgradeneeded = () => req.transaction!.abort()
    const db = await new Promise<IDBDatabase | null>((resolve) => { req.onsuccess = () => resolve(req.result); req.onerror = () => resolve(null) })
    if (!db) return null
    if (!db.objectStoreNames.contains('updates')) { db.close(); return null }
    const read = db.transaction('updates', 'readonly').objectStore('updates').get(1)
    const value = await new Promise((resolve) => { read.onsuccess = () => resolve(read.result) })
    db.close()
    return value
  })).toBe('old-only document')
  expect(await page.evaluate(() => localStorage.getItem('ofimeo:docs'))).toBe('{broken')
  expect(await page.evaluate(() => localStorage.getItem('words-online:docs'))).toContain('fallback-old')
})

test('retained originals do not restore disconnected credentials or deleted databases', async ({ page }) => {
  await page.goto('/legacy-storage-fixture.html')
  await page.evaluate(async () => {
    localStorage.setItem('words-online:moodle', '{"token":"synthetic-old-token"}')
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('words-online:deleted-after-copy')
      req.onupgradeneeded = () => req.result.createObjectStore('updates').put('retained original', 1)
      req.onsuccess = () => { req.result.close(); resolve() }
      req.onerror = () => reject(req.error)
    })
  })
  await page.goto(`/${RELAYS}`)
  await page.locator('#home-tab-docs').waitFor()
  expect(await page.evaluate(() => localStorage.getItem('ofimeo:moodle'))).toContain('synthetic-old-token')
  await page.goto('/legacy-storage-fixture.html')
  await page.evaluate(async () => {
    localStorage.removeItem('ofimeo:moodle')
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase('ofimeo:deleted-after-copy')
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  })
  await page.goto(`/${RELAYS}`)
  await page.locator('#home-tab-docs').waitFor()
  expect(await page.evaluate(() => localStorage.getItem('ofimeo:moodle'))).toBeNull()
  const names = await page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name))
  expect(names).not.toContain('ofimeo:deleted-after-copy')
  expect(names).toContain('words-online:deleted-after-copy')
})
