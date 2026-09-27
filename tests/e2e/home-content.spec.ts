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
  // A form from the review quiz template (Spanish content in the English UI).
  await page.goto(`/${RELAYS}`)
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
