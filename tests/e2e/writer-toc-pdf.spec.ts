import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { openApp, trackErrors } from './helpers'

// Opens a menu of the writer's menu bar and picks an item (submenus by hovering).
async function menu(page: Page, top: string, ...path: string[]) {
  await page.locator('.menubar-item', { hasText: top }).first().click()
  for (const [i, label] of path.entries()) {
    const row = page.locator('.menu-row', { hasText: label }).last()
    if (i < path.length - 1) await row.hover()
    else await row.click()
  }
}

test('table of contents follows the headings and the PDF export has text, bookmarks and links', async ({ page }) => {
  const errors = trackErrors(page)
  await openApp(page, 'writer')
  const editor = page.locator('.ProseMirror')
  await editor.click()
  // Two chapters with a long paragraph each, so the second lands on page 2.
  const long = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(70)
  for (const title of ['Chapter one', 'Chapter two']) {
    await page.keyboard.press('Control+Alt+1')
    await page.keyboard.type(title)
    await page.keyboard.press('Enter')
    await page.keyboard.insertText(long)
    await page.keyboard.press('Enter')
  }
  await page.keyboard.press('Control+Home')
  await menu(page, 'Insert', 'Table of contents', 'Headings 1–3')
  const entries = page.locator('.toc .toc-entry')
  await expect(entries).toHaveCount(2)
  await expect(entries.first()).toContainText('Chapter one')
  await expect(page.locator('.page-sheet')).toHaveCount(2)
  await expect(entries.nth(1).locator('.toc-page')).toHaveText('2')

  // Renaming a heading updates the table (debounced, local edits only).
  await page.locator('.ProseMirror h1', { hasText: 'Chapter two' }).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' revised')
  await expect(entries.nth(1)).toContainText('Chapter two revised')

  // Clicking an entry moves the cursor to its heading.
  await entries.first().locator('a').click()
  await expect.poll(() => page.evaluate(() => window.getSelection()?.anchorNode?.parentElement?.closest('h1')?.textContent ?? '')).toBe('Chapter one')

  // Direct PDF export.
  const [download] = await Promise.all([page.waitForEvent('download'), menu(page, 'File', 'Download as', 'PDF document (.pdf)')])
  const pdf = readFileSync((await download.path())!).toString('latin1')
  expect(pdf.startsWith('%PDF-1.7')).toBe(true)
  expect(pdf).toContain('/Type /Pages')
  expect((pdf.match(/\/Type \/Page /g) ?? []).length).toBe(2)
  // Bookmarks (outline) for both headings, internal links from the table of contents, tagged PDF.
  expect(pdf).toContain('/Title (Chapter one)')
  expect(pdf).toContain('/Title (Chapter two revised)')
  expect(pdf).toContain('/Outlines')
  expect(pdf).toMatch(/\/Subtype \/Link [^>]*\/Dest \[/)
  expect(pdf).toContain('/StructTreeRoot')
  // Text is embedded as real text (subset TrueType font with a ToUnicode map).
  expect(pdf).toContain('/FontFile2')
  expect(pdf).toContain('/ToUnicode')
  expect(errors).toEqual([])
})
