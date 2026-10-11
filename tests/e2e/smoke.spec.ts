import { expect, test } from '@playwright/test'
import { APP_READY, RELAYS, openApp, trackErrors } from './helpers'

test('home screen lists every app and the templates', async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto(`/${RELAYS}`)
  await expect(page.locator('.home')).toBeVisible()
  // One card per app (writer, sheet, draw, diagram, slides, forms…).
  expect(await page.locator('.new-card').count()).toBeGreaterThanOrEqual(6)
  await expect(page.locator('.new-card', { hasText: 'New form' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
  expect(errors).toEqual([])
})

for (const app of Object.keys(APP_READY)) {
  test(`${app} opens a new document without errors`, async ({ page }) => {
    const errors = trackErrors(page)
    await openApp(page, app)
    await expect(page.locator('#doc-title')).toBeVisible()
    await expect(page.locator('#btn-share')).toBeVisible()
    // Let lazy chunks and workers settle.
    await page.waitForTimeout(1500)
    expect(errors).toEqual([])
  })
}

test('the UI follows the browser language', async ({ browser }) => {
  for (const [locale, fileMenu] of [['es-ES', 'Archivo'], ['gl-ES', 'Arquivo'], ['fr-FR', 'Fichier'], ['de-DE', 'Datei']]) {
    const context = await browser.newContext({ locale })
    const page = await context.newPage()
    await openApp(page, 'writer')
    await expect(page.locator('.menubar-item').first()).toHaveText(fileMenu)
    await context.close()
  }
})

test('a browser without WebRTC can edit a local document with an honest connection status', async ({ page }) => {
  const errors = trackErrors(page)
  await page.addInitScript(() => Object.defineProperty(window, 'RTCPeerConnection', { configurable: true, value: undefined }))
  await openApp(page, 'writer')
  await page.locator('.ProseMirror').fill('Synthetic local document')
  await expect(page.locator('.ProseMirror')).toContainText('Synthetic local document')
  await expect(page.locator('#peer-status')).toHaveText('Local only')
  await expect(page.locator('#peer-status')).toHaveAttribute('title', /Local editing and backups still work/)
  expect(errors).toEqual([])
})
