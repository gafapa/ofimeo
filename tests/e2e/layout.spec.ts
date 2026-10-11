import { expect, test } from '@playwright/test'
import { APP_READY, RELAYS } from './helpers'

// Narrow screens: the app bar on tablets and the storage notice on phones.

test('on a tablet the menu bar takes one row under the title', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true })
  // Spanish has some of the longest menu bars.
  await context.addInitScript(() => localStorage.setItem('ofimeo:language', 'es'))
  for (const app of ['writer', 'slides']) {
    const page = await context.newPage()
    await page.goto(`/${RELAYS}#new=${app}`)
    await page.locator(APP_READY[app]).first().waitFor({ timeout: 60_000 })
    const rows = await page.locator('.menubar-item').evaluateAll((items) => new Set(items.map((e) => Math.round(e.getBoundingClientRect().top))).size)
    expect(rows, app).toBe(1)
    expect((await page.locator('#doc-title').boundingBox())!.width, app).toBeGreaterThan(200)
    await page.close()
  }
  await context.close()
})

test('on a phone the storage notice leaves the document visible', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  await page.addInitScript(() => localStorage.setItem('ofimeo:language', 'es'))
  await page.goto(`/${RELAYS}#new=writer`)
  const notice = page.locator('.persist-notice')
  await expect(notice).toBeVisible({ timeout: 60_000 })
  expect((await notice.boundingBox())!.height).toBeLessThan(844 * 0.2)
  await context.close()
})
