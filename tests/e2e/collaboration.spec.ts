import { expect, test } from '@playwright/test'
import { openApp, uniqueDoc } from './helpers'

test('two browsers edit the same document in real time', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage()
  const b = await (await browser.newContext()).newPage()
  await openApp(a, 'writer', uniqueDoc('sync'))
  await a.locator('.ProseMirror').click()
  await a.keyboard.type('Hola desde A')
  // The second person opens the same link (with its keys).
  await b.goto(a.url())
  await b.locator('.ProseMirror').waitFor()
  await expect(b.locator('.ProseMirror')).toContainText('Hola desde A', { timeout: 60_000 })
  await b.locator('.ProseMirror').click()
  await b.keyboard.press('End')
  await b.keyboard.type(' y B')
  await expect(a.locator('.ProseMirror')).toContainText('y B', { timeout: 60_000 })
})
