import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib'
import { RELAYS, trackErrors } from './helpers'
import { makeFixturePdf } from './pdf-fixture'

async function fixture(name: string, withAnnotations: boolean): Promise<string> {
  const path = join(tmpdir(), `${name}-${Date.now()}.pdf`)
  writeFileSync(path, await makeFixturePdf(withAnnotations))
  return path
}

async function openFromHome(page: Page, path: string): Promise<void> {
  await page.goto(`/${RELAYS}`)
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.home-open').first().click()])
  await chooser.setFiles(path)
  await page.locator('.pdf-page canvas').first().waitFor({ timeout: 60_000 })
}

// Subtypes of the annotations on each page of a PDF.
async function annotationTypes(bytes: Uint8Array): Promise<string[][]> {
  const doc = await PDFDocument.load(bytes)
  return doc.getPages().map((p) =>
    (p.node.Annots()?.asArray() ?? []).map((ref) => String((doc.context.lookup(ref) as PDFDict).get(PDFName.of('Subtype'))).replace('/', '')),
  )
}

async function drawStroke(page: Page, x: number, y: number): Promise<void> {
  const box = (await page.locator('.pdf-page').first().boundingBox())!
  await page.mouse.move(box.x + x, box.y + y)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + x + i * 10, box.y + y + (i % 2) * 12)
  await page.mouse.up()
}

test('a PDF is annotated, exported with real annotations and reopened', async ({ page }) => {
  const errors = trackErrors(page)
  await openFromHome(page, await fixture('exam', true))
  await expect(page.locator('#doc-title')).toHaveValue(/exam/)
  // Existing annotations of the file were imported (highlight, sticky note with a reply).
  await expect(page.locator('.pdf-overlay .pdf-annot-highlight')).toHaveCount(1)
  await expect(page.locator('.pdf-note-marker')).toHaveCount(1)
  // Text layer: select a line and highlight it with the bubble.
  const line = page.locator('.textLayer span', { hasText: 'Question 2' }).first()
  const lb = (await line.boundingBox())!
  await page.mouse.move(lb.x + 2, lb.y + lb.height / 2)
  await page.mouse.down()
  await page.mouse.move(lb.x + lb.width - 2, lb.y + lb.height / 2, { steps: 5 })
  await page.mouse.up()
  await page.locator('.pdf-bubble button', { hasText: 'Underline' }).click()
  await expect(page.locator('.pdf-overlay .pdf-annot-underline')).toHaveCount(1)
  // Pen (keyboard shortcut P), a check stamp and a text box.
  await page.keyboard.press('p')
  await drawStroke(page, 100, 420)
  await expect(page.locator('.pdf-overlay .pdf-annot-ink')).toHaveCount(1)
  await page.getByRole('button', { name: 'Stamp' }).click()
  await page.locator('.pdf-stamp-choice').first().click()
  const box = (await page.locator('.pdf-page').first().boundingBox())!
  await page.mouse.click(box.x + 500, box.y + 300)
  await page.keyboard.press('Escape')
  await expect(page.locator('.pdf-overlay .pdf-annot-stamp')).toHaveCount(1)
  await expect(page.locator('.pdf-overlay .pdf-annot-stamp')).toHaveAttribute('aria-label', /Check mark/)
  await page.keyboard.press('t')
  await page.mouse.click(box.x + 100, box.y + 520)
  await page.keyboard.type('Revisa la pregunta 2')
  await page.keyboard.press('Control+Enter')
  await expect(page.locator('.pdf-overlay .pdf-annot-text')).toContainText('Revisa la pregunta 2')
  // Undo and redo the text box.
  await page.keyboard.press('Control+z')
  await expect(page.locator('.pdf-overlay .pdf-annot-text')).toHaveCount(0)
  await page.keyboard.press('Control+y')
  await expect(page.locator('.pdf-overlay .pdf-annot-text')).toHaveCount(1)

  // File ▸ Download as ▸ PDF with annotations (editable).
  await page.locator('.menubar-item', { hasText: 'File' }).click()
  await page.locator('.menu-panel .menu-item, .menu-panel [role="menuitem"]', { hasText: 'Download as' }).first().hover()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByText('PDF with annotations (editable)').click()])
  const path = await download.path()
  const { readFileSync } = await import('node:fs')
  const bytes = new Uint8Array(readFileSync(path!))
  const types = await annotationTypes(bytes)
  for (const type of ['Highlight', 'Underline', 'Ink', 'Stamp', 'FreeText', 'Text', 'Popup', 'Link']) expect(types[0]).toContain(type)

  // The exported file reopens with the same annotations as objects.
  const copy = join(tmpdir(), `reopen-${Date.now()}.pdf`)
  writeFileSync(copy, bytes)
  await openFromHome(page, copy)
  await expect(page.locator('.pdf-overlay .pdf-annot-ink')).toHaveCount(1)
  await expect(page.locator('.pdf-overlay .pdf-annot-stamp')).toHaveCount(1)
  await expect(page.locator('.pdf-overlay .pdf-annot-text')).toContainText('Revisa la pregunta 2')
  await expect(page.locator('.pdf-note-marker')).toHaveCount(1)
  expect(errors).toEqual([])
})

test('two browsers annotate the same PDF live', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage()
  const b = await (await browser.newContext()).newPage()
  await openFromHome(a, await fixture('live', false))
  await b.goto(a.url())
  // The PDF itself travels to the second browser.
  await b.locator('.pdf-page canvas').first().waitFor({ timeout: 60_000 })
  await a.keyboard.press('p')
  await drawStroke(a, 120, 300)
  await expect(b.locator('.pdf-overlay .pdf-annot-ink')).toHaveCount(1, { timeout: 60_000 })
  await b.keyboard.press('r')
  const box = (await b.locator('.pdf-page').first().boundingBox())!
  await b.mouse.move(box.x + 200, box.y + 400)
  await b.mouse.down()
  await b.mouse.move(box.x + 300, box.y + 460, { steps: 4 })
  await b.mouse.up()
  await expect(a.locator('.pdf-overlay .pdf-annot-rect')).toHaveCount(1, { timeout: 60_000 })
  // Sticky note from B, visible to A.
  await b.keyboard.press('n')
  await b.mouse.click(box.x + 400, box.y + 150)
  await b.keyboard.type('Muy bien')
  await b.keyboard.press('Control+Enter')
  await expect(a.locator('.pdf-note-marker')).toHaveCount(1, { timeout: 60_000 })
})
