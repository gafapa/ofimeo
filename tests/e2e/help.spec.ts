import { expect, test } from '@playwright/test'
import { openApp, RELAYS } from './helpers'

// Onboarding stays out of the other tests: it is skipped under WebDriver unless the URL has ?tour.

test('the help center searches the bundled articles', async ({ page }) => {
  await page.goto(`/${RELAYS}`)
  await expect(page.locator('dialog.tour')).toHaveCount(0)
  await page.getByRole('button', { name: 'Help', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Help center' }).click()
  const dialog = page.locator('dialog.help-dialog')
  await expect(dialog.getByRole('heading', { name: 'Getting started' })).toBeVisible()

  const search = dialog.getByRole('searchbox', { name: 'Search help' })
  await search.fill('backup password')
  const results = dialog.locator('.help-results .help-link')
  await expect(results.first()).toContainText('Backups and restoring')
  await expect(results.first().locator('mark').first()).toHaveText(/backup/i)
  await search.press('Enter')
  await expect(dialog.getByRole('heading', { name: 'Backups and restoring' })).toBeVisible()

  // Accents and case are ignored; links move between articles.
  await search.fill('Wi-Fi FÍREWALL')
  await expect(results.first()).toContainText('School networks')
  await search.fill('zzzz no such words')
  await expect(dialog.getByText('No articles match your search').first()).toBeVisible()
  await search.fill('')
  await dialog.getByRole('button', { name: 'Sharing and permissions' }).click()
  await dialog.locator('.help-article').getByRole('link', { name: 'connection test' }).click()
  await expect(dialog.getByRole('heading', { name: 'School networks: connection test and relay' })).toBeVisible()
})

test('the welcome tour shows once and dialogs link to their article', async ({ page }) => {
  await page.goto(`/${RELAYS}&tour`)
  const tour = page.locator('dialog.tour')
  await expect(tour.getByRole('heading', { name: 'Welcome to Ofimeo' })).toBeVisible()
  for (let i = 0; i < 4; i++) await tour.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(tour).toContainText('Step 5 of 5')
  await tour.getByRole('button', { name: 'Get started' }).click()
  await expect(tour).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Start something new' })).toBeVisible()
  await expect(page.locator('dialog.tour')).toHaveCount(0)

  // Quick start of an app (first visit only), then the "?" of the Share dialog.
  await page.goto(`/${RELAYS}&tour#app=writer&doc=help-${Date.now()}`)
  await expect(page.locator('.quickstart')).toContainText('Quick start')
  await page.getByRole('button', { name: 'Got it' }).click()
  await expect(page.locator('.quickstart')).toHaveCount(0)
  await page.locator('#btn-share').click()
  await page.getByRole('button', { name: 'Help about this' }).click()
  await expect(page.locator('dialog.help-dialog').getByRole('heading', { name: 'Sharing and permissions' })).toBeVisible()
})

test('Help ▸ Getting started reopens the quick start of the app', async ({ page }) => {
  await openApp(page, 'sheet')
  await expect(page.locator('.quickstart')).toHaveCount(0)
  await page.getByRole('menuitem', { name: 'Help', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Getting started' }).click()
  const panel = page.locator('.quickstart')
  await expect(panel).toContainText('Ofimeo Sheets')
  await expect(panel.getByRole('button', { name: 'Got it' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
})
