import { expect, test } from '@playwright/test'
import { RELAYS } from './helpers'

const fixture = (name: string) => new URL(`../fixtures/${name}`, import.meta.url).pathname

test('a .drawio file opens from the home screen', async ({ page }) => {
  await page.goto(`/${RELAYS}`)
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.home-open').first().click()])
  await chooser.setFiles(fixture('flow.drawio'))
  await page.locator('.diagram-canvas svg').waitFor({ timeout: 60_000 })
  await expect(page.locator('.diagram-canvas')).toContainText('Start')
  await expect(page.locator('.diagram-canvas')).toContainText('Decide')
  await expect(page.locator('#doc-title')).toHaveValue('flow')
})

test('a text document opens from the home screen', async ({ page }) => {
  await page.goto(`/${RELAYS}`)
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.home-open').first().click()])
  await chooser.setFiles(fixture('notes.html'))
  await page.locator('.ProseMirror').waitFor({ timeout: 60_000 })
  await expect(page.locator('.ProseMirror h1')).toHaveText('Apuntes')
})
