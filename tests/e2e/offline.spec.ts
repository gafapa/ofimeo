import { expect, test } from '@playwright/test'
import { RELAYS, uniqueDoc } from './helpers'

test('works offline once installed', async ({ page, context }) => {
  await page.goto(`/${RELAYS}`)
  await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 60_000 })
  await expect(page.locator('.offline-ready')).toBeVisible({ timeout: 60_000 })
  const doc = uniqueDoc('offline')
  await page.goto('about:blank')
  await page.goto(`/${RELAYS}#app=writer&doc=${doc}`)
  await page.locator('.ProseMirror').click()
  await page.keyboard.type('Texto sin conexión')
  await page.waitForTimeout(1500)
  await context.setOffline(true)
  await page.goto('about:blank')
  await page.goto(`/${RELAYS}#app=writer&doc=${doc}`)
  await expect(page.locator('.ProseMirror')).toContainText('Texto sin conexión', { timeout: 30_000 })
  for (const app of ['sheet', 'diagram', 'slides']) {
    await page.goto('about:blank')
    await page.goto(`/${RELAYS}#app=${app}&doc=${uniqueDoc(app)}`)
    await expect(page.locator(app === 'sheet' ? '.app-sheet canvas' : '.diagram-canvas svg').first()).toBeVisible({ timeout: 30_000 })
  }
})
