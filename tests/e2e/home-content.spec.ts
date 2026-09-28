// Home screen features that read documents without opening them: Download
// (also of PDFs, alone or in a zip) and the content search (forms and PDFs).
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import JSZip from 'jszip'
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib'
import { RELAYS, openApp, trackErrors } from './helpers'
import { makeFixturePdf } from './pdf-fixture'

async function importPdf(page: Page): Promise<void> {
  const path = join(tmpdir(), `home-${Date.now()}.pdf`)
  writeFileSync(path, await makeFixturePdf(true))
  await page.goto(`/${RELAYS}`)
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.home-open').first().click()])
  await chooser.setFiles(path)
  await page.locator('.pdf-page canvas').first().waitFor({ timeout: 60_000 })
}

const pdfRow = (page: Page) => page.locator('a.doc-row', { hasText: 'PDF' }).first()

async function annotationTypes(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes)
  return doc.getPages().flatMap((p) => (p.node.Annots()?.asArray() ?? []).map((ref) => String((doc.context.lookup(ref) as PDFDict).get(PDFName.of('Subtype'))).replace('/', '')))
}

test('home Download builds a PDF without opening it, alone and in a zip', async ({ page }) => {
  const errors = trackErrors(page)
  await importPdf(page)

  // In the app, the two PDF formats get different file names.
  await page.locator('.menubar-item', { hasText: 'File' }).click()
  await page.locator('.menu-row', { hasText: 'Download as' }).first().hover()
  const [flat] = await Promise.all([page.waitForEvent('download'), page.locator('.menu-row', { hasText: 'flattened' }).first().click()])
  expect(flat.suggestedFilename()).toMatch(/ \(flattened\)\.pdf$/)

  // A drawing to put in the same zip.
  await openApp(page, 'draw')
  await page.goto(`/${RELAYS}`)
  await expect(pdfRow(page)).toBeVisible()

  // One PDF: ⋮ ▸ Download gives the PDF with its (imported) annotations.
  await pdfRow(page).locator('.row-more').click()
  const [single] = await Promise.all([page.waitForEvent('download'), page.locator('.menu-row', { hasText: /^Download$/ }).first().click()])
  expect(single.suggestedFilename()).toMatch(/\.pdf$/)
  expect(single.suggestedFilename()).not.toContain('flattened')
  const bytes = readFileSync(await single.path())
  const types = await annotationTypes(bytes)
  expect(types).toContain('Highlight')
  expect(types).toContain('Text')

  // A PDF and a drawing: one zip with both.
  await pdfRow(page).locator('.row-check').click()
  await page.locator('a.doc-row', { hasText: 'Drawing' }).first().locator('.row-check').click()
  const [zipped] = await Promise.all([page.waitForEvent('download'), page.locator('button:visible', { hasText: /^Download$/ }).first().click()])
  expect(zipped.suggestedFilename()).toMatch(/\.zip$/)
  const zip = await JSZip.loadAsync(readFileSync(await zipped.path()))
  const names = Object.keys(zip.files)
  expect(names.some((n) => n.endsWith('.pdf'))).toBe(true)
  expect(names.some((n) => n.endsWith('.excalidraw'))).toBe(true)
  expect(errors).toEqual([])
})

test('content search finds form questions and PDF text and notes', async ({ page }) => {
  const errors = trackErrors(page)
  // A form from the review quiz template (Spanish content chosen in the English UI).
  await page.goto(`/${RELAYS}`)
  await page.locator('.tpl-lang-select').selectOption('es')
  await page.getByRole('button', { name: /Show all templates/ }).click()
  await page.locator('.tpl-filters .chip', { hasText: 'Form' }).first().click()
  await page.locator('.tpl-card', { hasText: 'Cuestionario de repaso' }).click()
  await page.locator('.app-forms').waitFor({ timeout: 60_000 })
  await page.waitForTimeout(1000)
  await importPdf(page)
  await page.waitForTimeout(1000)

  await page.goto(`/${RELAYS}`)
  const search = page.locator('.home-search')
  const rows = page.locator('a.doc-row')
  await search.fill('capital de Portugal')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Form')
  await expect(rows.first().locator('.doc-snippet mark').first()).toBeVisible()
  // Page text of the PDF (pdf.js in the search worker)…
  await search.fill('water boils')
  await expect(rows).toHaveCount(1, { timeout: 30_000 })
  await expect(rows.first()).toContainText('PDF')
  // …and the text of a sticky note it came with.
  await search.fill('check units')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('PDF')
  // The answer key is not indexed: the form's correct answer is also an option,
  // so search for its feedback instead.
  await search.fill('capitales europeas')
  await expect(rows).toHaveCount(0)
  expect(errors).toEqual([])
})

test('a new library shows a light home screen', async ({ page }) => {
  const errors = trackErrors(page)
  await page.addInitScript(() => localStorage.setItem('ofimeo:language', 'en'))
  await page.goto(`/${RELAYS}`)
  // No documents yet: only the empty list, without search, folders or filters.
  await expect(page.locator('.docs-bare .empty')).toBeVisible()
  await expect(page.locator('.home-search')).toBeHidden()
  await expect(page.locator('.lib-side')).toBeHidden()
  // Four templates; the app filters and "My templates" come with the whole gallery.
  await expect(page.locator('.home-templates .tpl-card')).toHaveCount(4)
  await expect(page.locator('.tpl-filters')).toBeHidden()
  await expect(page.locator('.my-templates')).toBeHidden()
  await page.getByRole('button', { name: /Show all templates/ }).click()
  await expect(page.locator('.tpl-filters')).toBeVisible()
  await expect(page.locator('.my-templates')).toBeVisible()
  // Other ways to open are in the More menu.
  await page.getByRole('button', { name: 'More', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: 'Import from link…' })).toBeVisible()
  await page.keyboard.press('Escape')

  // With a document, the library tools appear.
  await page.locator('.new-card[href*="app=writer"]').click()
  await page.locator('.ProseMirror').first().waitFor({ timeout: 60_000 })
  await page.goto(`/${RELAYS}`)
  await expect(page.locator('.home-search')).toBeVisible()
  await expect(page.locator('.docs-bare')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('templates have English content for the English interface', async ({ page }) => {
  const errors = trackErrors(page)
  await page.addInitScript(() => localStorage.setItem('ofimeo:language', 'en'))
  const create = async (name: string, ready: string) => {
    await page.goto(`/${RELAYS}`)
    await expect(page.locator('.tpl-lang-select')).toHaveValue('en')
    await page.getByRole('button', { name: /Show all templates/ }).click()
    await page.locator('.tpl-card', { hasText: name }).first().click()
    await page.locator(ready).first().waitFor({ timeout: 60_000 })
  }
  await page.goto(`/${RELAYS}`)
  await page.getByRole('button', { name: /Show all templates/ }).click()
  // Every template except the two tied to Spanish regulations.
  await expect(page.locator('.home-templates .tpl-grid:not(.my-tpl-grid) .tpl-card')).toHaveCount(27)

  await create('Student report', '.ProseMirror')
  await expect(page.locator('.ProseMirror').first()).toContainText('Title of the work')
  await create('Review quiz', '.app-forms')
  await expect(page.getByRole('textbox', { name: 'Question' }).first()).toHaveValue('What is the capital of Portugal?')
  await create('Class notes', '.app-notebook')
  await expect(page.locator('.app-notebook')).toContainText('Unit 1')
  expect(errors).toEqual([])
})
