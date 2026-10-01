import { expect, test } from '@playwright/test'
import { RELAYS } from './helpers'

test('Nextcloud switches between persistent and session accounts and can add another', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ofimeo:language', 'en')
    localStorage.setItem('ofimeo:nextcloud', JSON.stringify([{ id: 'teacher', server: 'https://cloud.example', user: 'teacher', loginName: 'teacher', appPassword: 'test-only', remember: true }]))
    sessionStorage.setItem('ofimeo:nextcloud', JSON.stringify([{ id: 'student', server: 'https://cloud.example', user: 'student', loginName: 'student', appPassword: 'test-only-session', remember: false }]))
  })
  await page.goto(`/${RELAYS}`)
  await page.locator('.home-accounts').click()
  await page.getByRole('menuitem', { name: 'Nextcloud account…' }).click()
  const dialog = page.locator('dialog.dlg')
  await expect(dialog.locator('.nc-who')).toContainText('teacher')
  await dialog.getByLabel('Accounts', { exact: true }).selectOption('student')
  await expect(dialog.locator('.nc-who')).toContainText('student')
  expect(await page.evaluate(() => localStorage.getItem('ofimeo:nextcloud'))).not.toContain('test-only-session')
  await dialog.getByLabel('Accounts', { exact: true }).selectOption('teacher')
  await expect(dialog.locator('.nc-who')).toContainText('teacher')
  await dialog.getByRole('button', { name: 'Add account' }).click()
  await expect(dialog.getByLabel('Remember this connection on this device')).not.toBeChecked()
  await expect(dialog.getByLabel('Nextcloud address')).toBeVisible()
})
