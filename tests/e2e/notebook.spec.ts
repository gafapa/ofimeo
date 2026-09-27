import { expect, test, type Page } from '@playwright/test'
import JSZip from 'jszip'
import { readFile } from 'node:fs/promises'
import { RELAYS, trackErrors } from './helpers'

// Ofimeo Notebook: sections, pages, tags, ink, sync and export.

// E2E_RELAYS lets a run with its own relay port reuse the spec.
const relays = process.env.E2E_RELAYS ?? RELAYS

test.beforeEach(async ({ page }) => {
  // (about:blank has no storage.)
  await page.addInitScript(() => {
    try {
      localStorage.setItem('words-online:language', 'en')
    } catch {
      // ignore
    }
  })
})

async function newNotebook(page: Page): Promise<void> {
  await page.goto(`/${relays}#new=notebook`)
  await page.locator('.nb-content .ProseMirror').waitFor()
  await expect(page).toHaveURL(/doc=/)
}

const editor = (page: Page) => page.locator('.nb-content .ProseMirror')

async function drawStroke(page: Page, x: number, y: number) {
  const box = (await page.locator('.nb-sheet').boundingBox())!
  await page.mouse.move(box.x + x, box.y + y)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + x + i * 12, box.y + y + Math.sin(i / 2) * 20)
  await page.mouse.up()
}

async function viewLink(page: Page): Promise<string> {
  await page.locator('#btn-share').click()
  const dialog = page.locator('dialog.dlg')
  await dialog.getByRole('tab', { name: 'Can view' }).click()
  const url = await dialog.locator('input.field').inputValue()
  await dialog.getByRole('button', { name: 'Done' }).click()
  return url
}

test('notebook: sections, pages, subpages, typing, tags and the tag summary', async ({ page }) => {
  const errors = trackErrors(page)
  await newNotebook(page)
  await expect(page.locator('.nb-section')).toHaveCount(1)
  await page.locator('.nb-page-title').fill('Photosynthesis')
  await editor(page).click()
  await page.keyboard.type('Plants turn light into sugar.')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Learn the equation')
  await page.keyboard.press('Control+Shift+1')
  await expect(editor(page).locator('p[data-nb-tag="todo"]')).toHaveText('Learn the equation')
  // Ticking the To do box.
  const todo = editor(page).locator('p[data-nb-tag="todo"]')
  const tb = (await todo.boundingBox())!
  await page.mouse.click(tb.x + 8, tb.y + tb.height / 2)
  await expect(editor(page).locator('p[data-nb-tag="done"]')).toHaveCount(1)

  // A second page, then a subpage of it.
  await page.locator('.nb-pages .nb-add').click()
  await page.locator('.nb-page-title').fill('Respiration')
  await editor(page).click()
  await page.keyboard.type('Why do cells need oxygen?')
  await page.locator('.nb-tag-btn').click()
  await page.locator('.nb-tag-menu .menu-row', { hasText: 'Question' }).click()
  await expect(editor(page).locator('p[data-nb-tag="question"]')).toHaveCount(1)
  await page.locator('.nb-page.current .nb-more').click()
  await page.getByText('New subpage', { exact: true }).click()
  await page.locator('.nb-page-title').fill('Mitochondria')
  await expect(page.locator('.nb-page.level-1')).toHaveText(/Mitochondria/)
  await expect(page.locator('.nb-page .nb-page-name')).toHaveText(['Photosynthesis', 'Respiration', 'Mitochondria'])

  // Keyboard reorder: Respiration moves above Photosynthesis.
  await page.locator('.nb-page', { hasText: 'Respiration' }).focus()
  await page.keyboard.press('Alt+ArrowUp')
  await expect(page.locator('.nb-page .nb-page-name').first()).toHaveText('Respiration')

  // A new section with its own page.
  await page.locator('.nb-sections .nb-add').click()
  await page.locator('dialog input').fill('Maths')
  await page.locator('dialog button.primary').click()
  await expect(page.locator('.nb-section')).toHaveCount(2)
  await expect(page.locator('.nb-section.current')).toContainText('Maths')
  await editor(page).click()
  await page.keyboard.type('Revise fractions')
  await page.keyboard.press('Control+Shift+2')

  // Tag summary across pages and sections; choosing an item opens its page.
  await page.getByRole('button', { name: 'Tag summary' }).click()
  const dialog = page.locator('dialog[open]')
  await expect(dialog.locator('.nb-tagsum-item')).toHaveCount(3)
  await expect(dialog.locator('.nb-tagsum-group', { hasText: 'Important' })).toContainText('Revise fractions')
  await dialog.locator('.nb-tagsum-item', { hasText: 'Why do cells need oxygen?' }).click()
  await expect(page.locator('.nb-page-title')).toHaveValue('Respiration')

  // Search across the notebook.
  await page.keyboard.press('Control+f')
  await page.keyboard.type('sugar')
  await expect(page.locator('.nb-result')).toHaveCount(1)
  await page.locator('.nb-result').click()
  await expect(page.locator('.nb-page-title')).toHaveValue('Photosynthesis')
  expect(errors).toEqual([])
})

test('notebook: ink strokes with the pen, undo and the eraser', async ({ page }) => {
  const errors = trackErrors(page)
  await newNotebook(page)
  await editor(page).click()
  await page.keyboard.type('Diagram of a cell')
  await page.locator('.nb-tool-pen').click()
  await expect(page.locator('.nb-ink.active')).toHaveCount(1)
  await drawStroke(page, 200, 320)
  await drawStroke(page, 200, 420)
  await expect(page.locator('.nb-ink path')).toHaveCount(2)
  await page.keyboard.press('Control+z')
  await expect(page.locator('.nb-ink path')).toHaveCount(1)
  await page.keyboard.press('Control+y')
  await expect(page.locator('.nb-ink path')).toHaveCount(2)
  // The eraser removes the stroke it touches.
  await page.locator('.nb-tool-eraser').click()
  await drawStroke(page, 200, 420)
  await expect(page.locator('.nb-ink path')).toHaveCount(1)
  // Back to typing: the text is still editable.
  await page.keyboard.press('Escape')
  await expect(page.locator('.nb-ink.active')).toHaveCount(0)
  await editor(page).click()
  await page.keyboard.press('End')
  await page.keyboard.type('!')
  await expect(editor(page)).toContainText('Diagram of a cell!')
  expect(errors).toEqual([])
})

test('notebook: two browsers see pages, text and ink live; a view link is read-only', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage()
  const b = await (await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true })).newPage()
  for (const p of [a, b]) await p.addInitScript(() => localStorage.setItem('words-online:language', 'en'))
  const errors = [...trackErrors(a), ...trackErrors(b)]
  await newNotebook(a)
  await a.locator('.nb-page-title').fill('Shared notes')
  await editor(a).click()
  await a.keyboard.type('Hello from the teacher')

  await b.goto(a.url())
  await expect(editor(b)).toContainText('Hello from the teacher', { timeout: 30_000 })
  await expect(b.locator('.nb-page-title')).toHaveValue('Shared notes')
  // Phones: sections and pages are in a drawer.
  await expect(b.locator('.nb-nav')).not.toBeInViewport()
  await b.locator('.nb-nav-toggle').click()
  await expect(b.locator('.nb-nav')).toBeInViewport()
  await b.locator('.nb-pages .nb-add').click()
  await expect(b.locator('.nb-nav')).not.toBeInViewport()
  await b.locator('.nb-page-title').fill('From the phone')
  await expect(a.locator('.nb-page', { hasText: 'From the phone' })).toHaveCount(1, { timeout: 30_000 })

  // Ink drawn in A appears in B.
  await a.locator('.nb-tool-pen').click()
  await drawStroke(a, 180, 360)
  await b.locator('.nb-nav-toggle').click()
  await b.locator('.nb-page', { hasText: 'Shared notes' }).click()
  await expect(b.locator('.nb-ink path')).toHaveCount(1, { timeout: 30_000 })

  // Text typed in B appears in A.
  await editor(b).click()
  await b.keyboard.press('End')
  await b.keyboard.type(' and students')
  await expect(editor(a)).toContainText('and students', { timeout: 30_000 })

  // A view link: no editing, no ink, no new pages.
  const view = await viewLink(a)
  const c = await (await browser.newContext()).newPage()
  await c.addInitScript(() => localStorage.setItem('words-online:language', 'en'))
  await c.goto(view)
  await expect(editor(c)).toContainText('and students', { timeout: 30_000 })
  await expect(editor(c)).toHaveAttribute('contenteditable', 'false')
  await expect(c.locator('.nb-page-title')).toHaveAttribute('readonly', '')
  await expect(c.locator('.nb-tool-pen')).toBeDisabled()
  await expect(c.locator('.nb-pages .nb-add')).toBeHidden()
  expect(errors).toEqual([])
})

test('notebook: export a page to Word and the notebook as a ZIP of Markdown that imports back', async ({ page }) => {
  const errors = trackErrors(page)
  await newNotebook(page)
  await page.locator('.nb-page-title').fill('Cells')
  await editor(page).click()
  await page.keyboard.type('The nucleus holds DNA')
  await page.keyboard.press('Control+Shift+2')
  await page.locator('.nb-tool-pen').click()
  await drawStroke(page, 200, 360)
  await page.keyboard.press('Escape')

  const docx = page.waitForEvent('download')
  await page.locator('.nb-page.current .nb-more').click()
  await page.getByText('Export page', { exact: true }).hover()
  await page.locator('.context-menu').getByText('Word (.docx)', { exact: true }).click()
  const file = await docx
  expect(file.suggestedFilename()).toMatch(/Cells\.docx$/)
  const zip = await JSZip.loadAsync(await readFile((await file.path())!))
  const xml = await zip.file('word/document.xml')!.async('string')
  expect(xml).toContain('Cells')
  expect(xml).toContain('The nucleus holds DNA')
  expect(xml).toContain('★')
  // The ink is a picture after the text.
  expect(Object.keys(zip.files).some((n) => n.startsWith('word/media/'))).toBe(true)

  // The whole notebook as a ZIP of Markdown.
  await page.locator('#menubar').getByText('File', { exact: true }).click()
  await page.getByText('Download as', { exact: true }).hover()
  const download = page.waitForEvent('download')
  await page.getByText('Notebook as Markdown (.zip)', { exact: true }).click()
  const nbZip = await download
  const path = test.info().outputPath('notebook.zip')
  await nbZip.saveAs(path)
  const archive = await JSZip.loadAsync(await readFile(path))
  const md = await archive.file('Section 1/01 Cells.md')!.async('string')
  expect(md).toContain('# Cells')
  expect(md).toContain('★ The nucleus holds DNA')
  expect(Object.keys(archive.files).some((n) => /^assets\/ink-.*\.svg$/.test(n))).toBe(true)

  // Importing it into another notebook brings the page, the tag and the ink back.
  // (A hash-only navigation would reload the page later: leave it first.)
  await page.goto('about:blank')
  await newNotebook(page)
  await page.locator('#menubar').getByText('File', { exact: true }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByText('Open…', { exact: true }).click()
  await (await chooser).setFiles(path)
  await expect(page.locator('.nb-section', { hasText: 'Section 1' })).toHaveCount(2)
  await page.locator('.nb-section').nth(1).click()
  await expect(page.locator('.nb-page-title')).toHaveValue('Cells')
  await expect(editor(page).locator('p[data-nb-tag="important"]')).toHaveText('The nucleus holds DNA')
  await expect(page.locator('.nb-ink path')).toHaveCount(1)
  expect(errors).toEqual([])
})
