import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import JSZip from 'jszip'
import { openApp, trackErrors } from './helpers'

// Opens a menu of the menu bar and clicks an item (optionally in a submenu).
async function menu(page: Page, top: string, item: string, sub?: string): Promise<void> {
  await page.locator('.menubar-item', { hasText: new RegExp(`^${top}$`) }).dispatchEvent('mousedown')
  const panel = page.locator('body > .menu-panel')
  const row = panel.locator(':scope > .menu-row', { has: page.locator('.menu-label', { hasText: new RegExp(`^${item}$`) }) })
  if (!sub) return row.click()
  await row.dispatchEvent('mouseenter')
  await panel.locator('.menu-list .menu-row', { has: page.locator('.menu-label', { hasText: new RegExp(`^${sub.replace(/[()]/g, '\\$&')}$`) }) }).click()
}

const canvasText = (page: Page) => page.evaluate(() => document.querySelector('.diagram-canvas svg')?.textContent ?? '')

// A presentation with a title, notes, a "Fly in" animation, a fade transition
// and the Ocean theme.
async function buildDeck(page: Page): Promise<void> {
  await openApp(page, 'slides')
  const canvas = page.locator('.diagram-canvas')
  const box = (await canvas.boundingBox())!
  const title = { x: box.width / 2, y: box.height * 0.42 }
  await canvas.dblclick({ position: title })
  await page.keyboard.type('Photosynthesis')
  await canvas.click({ position: { x: 8, y: 8 } })
  await page.locator('.slides-notes-area').fill('Ask about chlorophyll')
  await canvas.click({ position: title })
  await menu(page, 'View', 'Animations')
  await page.locator('.slides-anim-pane button', { hasText: 'Add animation…' }).click()
  await page.locator('.menu-panel .menu-row', { hasText: 'Entrance' }).first().hover()
  await page.locator('.menu-list .menu-list .menu-row', { hasText: 'Fly in' }).click()
  await menu(page, 'Slide', 'Transition', 'Fade')
  await menu(page, 'Format', 'Theme', 'Ocean')
  await expect(page.locator('.slides-anim-list li')).toHaveCount(1)
}

// Downloads the deck in a format and opens the file with File ▸ Open….
async function roundTrip(page: Page, format: string): Promise<void> {
  const [download] = await Promise.all([page.waitForEvent('download'), menu(page, 'File', 'Download as', format)])
  const path = await download.path()
  await page.locator('input[type=file][accept*=".odp"]').first().setInputFiles({ name: download.suggestedFilename(), mimeType: 'application/octet-stream', buffer: await readFile(path) })
  await expect(page).toHaveURL(/doc=(?!slides-)/, { timeout: 30_000 })
  await page.locator('.diagram-canvas svg').first().waitFor()
  await expect.poll(() => canvasText(page)).toContain('Photosynthesis')
  await expect(page.locator('.slides-notes-area')).toHaveValue('Ask about chlorophyll')
  await menu(page, 'View', 'Animations')
  await expect(page.locator('.slides-anim-list li')).toHaveCount(1)
  await expect(page.locator('.slides-anim-list li')).toContainText('Fly in')
  await expect(page.locator('.slides-anim-pane select').first()).toHaveValue('fade')
  await expect(page.locator('.slides-theme-card.active')).toHaveAttribute('title', 'Ocean')
}

test('Esc keeps the text typed in a label', async ({ page }) => {
  const errors = trackErrors(page)
  await openApp(page, 'slides')
  const canvas = page.locator('.diagram-canvas')
  const box = (await canvas.boundingBox())!
  await canvas.dblclick({ position: { x: box.width / 2, y: box.height * 0.42 } })
  await page.keyboard.type('Water cycle')
  await page.keyboard.press('Escape')
  await expect.poll(() => canvasText(page)).toContain('Water cycle')

  await openApp(page, 'diagram')
  await menu(page, 'Insert', 'Text')
  await page.keyboard.press('Escape')
  await page.keyboard.press('F2')
  await page.keyboard.type('Evaporation')
  await page.keyboard.press('Escape')
  await expect.poll(() => canvasText(page)).toContain('Evaporation')
  expect(errors).toEqual([])
})

test('a presentation keeps its animations, transition and theme through .pptx', async ({ page }) => {
  const errors = trackErrors(page)
  await buildDeck(page)
  await roundTrip(page, 'PowerPoint (.pptx)')
  expect(errors).toEqual([])
})

test('a presentation opens back from .odp', async ({ page }) => {
  const errors = trackErrors(page)
  await buildDeck(page)
  await roundTrip(page, 'OpenDocument presentation (.odp)')
  expect(errors).toEqual([])
})

test('handing in an untouched presentation includes its first slide', async ({ page }) => {
  await openApp(page, 'slides')
  await menu(page, 'File', 'Hand in…')
  await page.locator('dialog[open] input').fill('Ana Perez')
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')])
  const zip = await JSZip.loadAsync(await readFile(await download.path()))
  const names = Object.keys(zip.files)
  expect(names.some((n) => n.endsWith(' - 01.png'))).toBe(true)
  const pptx = await JSZip.loadAsync(await zip.file(names.find((n) => n.endsWith('.pptx'))!)!.async('uint8array'))
  expect(pptx.file('ppt/slides/slide1.xml')).not.toBeNull()
})

test('Tab walks through the objects of the canvas', async ({ page }) => {
  await openApp(page, 'slides')
  const canvas = page.locator('.diagram-canvas')
  await canvas.focus()
  await page.keyboard.press('Tab')
  await expect(page.locator('.sr-only[role=status]').last()).toContainText('(1 of 2)')
  await expect(canvas).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.locator('.sr-only[role=status]').last()).toContainText('(2 of 2)')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Subtitle by keyboard')
  await page.keyboard.press('Escape')
  await expect.poll(() => canvasText(page)).toContain('Subtitle by keyboard')
  // Past the last object, focus leaves the canvas.
  await canvas.focus()
  await page.keyboard.press('Tab')
  await expect(canvas).not.toBeFocused()
})
