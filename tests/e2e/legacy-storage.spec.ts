import { expect, test } from '@playwright/test'
import { RELAYS, openApp, openLibrary, trackErrors, uniqueDoc } from './helpers'

// Data saved before the rename (words-online → ofimeo) is moved on start-up.
test('documents saved under the former name are migrated', async ({ page }) => {
  const errors = trackErrors(page)
  const id = uniqueDoc('legacy')
  await openApp(page, 'writer', id)
  await page.locator('#doc-title').fill('Saved before the rename')
  await page.locator('#doc-title').press('Enter')
  await page.locator('.ProseMirror').first().click()
  await page.keyboard.type('Written by an older version.')
  await page.waitForTimeout(1000)

  // Outside the app (same origin), rename everything back to the former names.
  await page.goto('/manifest.webmanifest')
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
  // Listed on the Home tab (recent) and in the library.
  await expect(page.locator(`.recent-row[data-id="${id}"]`)).toContainText('Saved before the rename')
  await openLibrary(page)
  await expect(page.locator(`.doc-row[data-id="${id}"]`)).toContainText('Saved before the rename')
  const names = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))
  expect(names).toContain(`ofimeo:${id}`)
  await expect.poll(async () => page.evaluate(async () => (await indexedDB.databases()).filter((d) => d.name?.startsWith('words-online')).length)).toBe(0)
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('words-online')))).toEqual([])

  await page.goto(`/${RELAYS}#app=writer&doc=${id}`)
  await expect(page.locator('.ProseMirror').first()).toContainText('Written by an older version.')
  expect(errors).toEqual([])
})
