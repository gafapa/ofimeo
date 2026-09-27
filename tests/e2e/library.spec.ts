import { expect, test, type Page } from '@playwright/test'
import { RELAYS, openApp, trackErrors } from './helpers'

// Deletes everything this site stored (as "Clear browsing data" would).
async function clearStorage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    localStorage.clear()
    for (const db of await indexedDB.databases())
      await new Promise((resolve) => {
        const req = indexedDB.deleteDatabase(db.name!)
        req.onsuccess = req.onerror = req.onblocked = resolve
      })
  })
}

async function fileMenu(page: Page, item: string): Promise<void> {
  await page.locator('.menubar-item', { hasText: 'File' }).click()
  await page.locator('.menu-row', { hasText: item }).first().click()
}

const topDialog = (page: Page) => page.locator('dialog.dlg').last()

test('backup and restore keep content, versions and comments', async ({ page }, testInfo) => {
  const errors = trackErrors(page)
  await openApp(page, 'writer')
  await page.locator('#doc-title').fill('Backup round trip')
  await page.locator('#doc-title').press('Enter')
  const editor = page.locator('.ProseMirror').first()
  await editor.click()
  await page.keyboard.type('Physical education is compulsory.')
  // A comment on the whole text and a named version.
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.press('Control+Alt+M')
  await page.locator('.rv-draft-input').fill('Check this sentence')
  await page.locator('.rv-draft-input').press('Control+Enter')
  await expect(page.locator('.rv-comment .rv-text')).toHaveText('Check this sentence')
  await fileMenu(page, 'Save version…')
  await topDialog(page).locator('input').fill('Checkpoint A')
  await topDialog(page).locator('button.primary').click()
  await page.waitForTimeout(500)

  // Back up everything with a password.
  await page.goto(`/${RELAYS}`)
  await expect(page.locator('.doc-row')).toHaveCount(1)
  await page.locator('.home-storage').click()
  await page.getByRole('button', { name: 'Back up all documents…' }).click()
  await topDialog(page).locator('input[type=password]').nth(0).fill('s3cret')
  await topDialog(page).locator('input[type=password]').nth(1).fill('s3cret')
  const [download] = await Promise.all([page.waitForEvent('download'), topDialog(page).locator('.dlg-actions button.primary').click()])
  expect(download.suggestedFilename()).toMatch(/\.ofimeo-backup$/)
  const file = testInfo.outputPath('backup.ofimeo-backup')
  await download.saveAs(file)
  await page.keyboard.press('Escape')

  // Clearing the browser data deletes the documents…
  await clearStorage(page)
  await page.goto('about:blank')
  await page.goto(`/${RELAYS}`)
  await expect(page.locator('.doc-table .empty')).toBeVisible()

  // …and the backup brings them back.
  const restore = async () => {
    await page.locator('.home-storage').click()
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Restore backup…' }).click()])
    await chooser.setFiles(file)
    await page.locator('dialog.dlg input[autocomplete=current-password]').fill('s3cret')
    await page.locator('dialog.dlg:has(input[autocomplete=current-password]) .dlg-actions button.primary').click()
    await page.locator('dialog.dlg:has(.confirm-body) .dlg-actions button.primary').click()
    const report = page.locator('.storage-report')
    await expect(report).toBeVisible()
    const summary = await report.locator('p').first().textContent()
    await page.locator('dialog.dlg:has(.storage-report) .dlg-actions button.primary').click()
    await page.keyboard.press('Escape')
    return summary
  }
  expect(await restore()).toContain('1 added')
  await expect(page.locator('.doc-row')).toHaveCount(1)
  // Restoring again merges: nothing new.
  expect(await restore()).toContain('1 already up to date')

  await page.locator('.doc-row', { hasText: 'Backup round trip' }).click()
  await expect(page.locator('.ProseMirror').first()).toContainText('Physical education is compulsory.')
  await expect(page.locator('.rv-comment .rv-text')).toHaveText('Check this sentence')
  await fileMenu(page, 'Version history…')
  await expect(topDialog(page)).toContainText('Checkpoint A')
  expect(errors).toEqual([])
})

test('deleted documents go to the trash until it is emptied', async ({ page }) => {
  const errors = trackErrors(page)
  await openApp(page, 'writer')
  await page.locator('.ProseMirror').first().click()
  await page.keyboard.type('To the trash')
  await page.waitForTimeout(300)
  await page.goto(`/${RELAYS}`)
  const row = page.locator('.doc-table .doc-row').first()
  const id = await row.getAttribute('data-id')
  const count = await page.locator('.doc-table .doc-row').count()

  await row.locator('.row-more').click()
  await page.locator('.menu-row', { hasText: 'Move to the trash' }).click()
  await expect(page.locator('.doc-table .doc-row')).toHaveCount(count - 1)
  await page.locator('.lib-item', { hasText: 'Trash' }).click()
  await expect(page.locator(`.doc-row[data-id="${id}"]`)).toBeVisible()

  // Restore it, then delete it again and empty the trash.
  await page.locator(`.doc-row[data-id="${id}"] .row-more`).click()
  await page.locator('.menu-row', { hasText: 'Restore' }).click()
  await page.locator('.lib-item', { hasText: 'All documents' }).click()
  await expect(page.locator(`.doc-row[data-id="${id}"]`)).toBeVisible()
  await page.locator(`.doc-row[data-id="${id}"] .row-more`).click()
  await page.locator('.menu-row', { hasText: 'Move to the trash' }).click()
  // The data stays in IndexedDB while the document is in the trash.
  const hasDb = () => page.evaluate(async (name) => (await indexedDB.databases()).some((d) => d.name === name), `words-online:${id}`)
  expect(await hasDb()).toBe(true)
  await page.locator('.lib-item', { hasText: 'Trash' }).click()
  await page.getByRole('button', { name: 'Empty trash…' }).click()
  await page.locator('dialog.dlg .dlg-actions button.primary').click()
  await expect(page.locator('.doc-table .empty')).toBeVisible()
  await expect.poll(hasDb).toBe(false)
  expect(errors).toEqual([])
})
