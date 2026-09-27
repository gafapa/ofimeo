import { expect, test, type Page } from '@playwright/test'
import JSZip from 'jszip'
import { readFileSync } from 'node:fs'
import { openApp, trackErrors } from './helpers'

const CSV = 'Name,City,Amount\nAna,Vigo,10\nBruno,Lugo,20\nCarla,Ourense,30\n'

// Opens a menu of the menu bar and picks an item (submenus by hovering).
async function menu(page: Page, top: string, ...path: string[]) {
  await page.locator('.menubar-item', { hasText: top }).first().click()
  for (const [i, label] of path.entries()) {
    const row = page.locator('.menu-row', { hasText: label }).last()
    if (i < path.length - 1) await row.hover()
    else await row.click()
  }
}

async function setup(page: Page) {
  await page.addInitScript(() => localStorage.setItem('ofimeo:language', 'en'))
}

// Values column by column from A1 (see sheet-charts.spec.ts).
async function fillSheet(page: Page, columns: string[][]) {
  const host = (await page.locator('.sheet-host').boundingBox())!
  await page.mouse.click(host.x + 90, host.y + 59)
  for (let c = 0; c < columns.length; c++) {
    if (c) {
      for (let i = 0; i < columns[c - 1].length; i++) await page.keyboard.press('ArrowUp')
      await page.keyboard.press('ArrowRight')
    }
    for (const value of columns[c]) {
      await page.keyboard.type(value, { delay: 30 })
      await page.keyboard.press('Enter')
    }
  }
}

const svgOf = async (page: Page) => {
  const src = (await page.locator('.chart-figure .chart-img').first().getAttribute('src')) ?? ''
  return Buffer.from(src.split(',')[1] ?? '', 'base64').toString('utf8')
}

test('mail merge from a CSV file: fields, preview, filter, combined document and PDF', async ({ page, context }) => {
  const errors = trackErrors(page)
  await setup(page)
  await openApp(page, 'writer')
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('Dear ')

  await menu(page, 'Tools', 'Mail merge…')
  const panel = page.locator('.merge-panel')
  await expect(panel).toBeVisible()
  await panel.locator('input[type=file]').setInputFiles({ name: 'people.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) })
  await expect(panel.locator('.merge-note').first()).toContainText('3 records')
  await panel.locator('.merge-fields button', { hasText: 'Name' }).click()
  await page.keyboard.type(' from ')
  await panel.locator('.merge-fields button', { hasText: 'City' }).click()
  await expect(editor.locator('.merge-chip')).toHaveCount(2)
  await expect(editor).toContainText('Dear «Name» from «City»')

  // Conditional text.
  await panel.getByText('Conditional text…').click()
  const dialog = page.locator('dialog[open]')
  await dialog.locator('select').first().selectOption('City')
  await dialog.locator('input').nth(0).fill('Vigo')
  await dialog.locator('input').nth(1).fill(' (local)')
  await dialog.locator('button[value=ok]').click()
  await expect(editor.locator('.merge-chip.merge-if')).toHaveCount(1)

  // Preview record by record.
  await panel.getByText('Show the data of a record').click()
  await expect(editor).toContainText('Dear Ana from Vigo (local)')
  await panel.locator('button[title="Next record"]').click()
  await expect(editor).toContainText('Dear Bruno from Lugo')
  await expect(panel.locator('.merge-position')).toHaveText('Record 2 of 3')

  // Filter: two records with Amount > 15, then back to all three.
  await panel.locator('select[aria-label="Filter field"]').selectOption('Amount')
  await panel.locator('select[aria-label="Condition"]').selectOption('>')
  await panel.locator('input[aria-label="Value"]').fill('15')
  await expect(panel.locator('.merge-position')).toHaveText('Record 1 of 2')
  await expect(editor).toContainText('Dear Bruno from Lugo')
  await panel.locator('select[aria-label="Filter field"]').selectOption('')
  await expect(panel.locator('.merge-position')).toHaveText('Record 1 of 3')

  // One combined document: three records, one page each.
  const [merged] = await Promise.all([context.waitForEvent('page'), panel.getByRole('button', { name: 'New document' }).click()])
  await merged.locator('.ProseMirror').waitFor()
  const body = merged.locator('.ProseMirror')
  await expect(body).toContainText('Dear Ana from Vigo (local)')
  await expect(body).toContainText('Dear Bruno from Lugo')
  await expect(body).toContainText('Dear Carla from Ourense')
  await expect(merged.locator('.merge-chip')).toHaveCount(0)
  await expect(merged.locator('.page-sheet')).toHaveCount(3)
  await merged.close()

  // A single PDF with one page per record.
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), panel.getByRole('button', { name: 'PDF', exact: true }).click()])
  const pdf = readFileSync((await download.path())!).toString('latin1')
  expect(pdf.startsWith('%PDF')).toBe(true)
  expect((pdf.match(/\/Type \/Page /g) ?? []).length).toBe(3)

  // The template's DOCX keeps the merge fields.
  const [docx] = await Promise.all([page.waitForEvent('download'), menu(page, 'File', 'Download as', 'Word (.docx)')])
  const zip = await JSZip.loadAsync(readFileSync((await docx.path())!))
  const xml = await zip.file('word/document.xml')!.async('string')
  expect(xml).toContain('MERGEFIELD &quot;Name&quot;')
  expect(xml).toMatch(/IF <\/w:instrText>.*MERGEFIELD &quot;City&quot;.*= &quot;Vigo&quot;/s)
  expect(errors).toEqual([])
})

test('a chart linked to a spreadsheet updates when the sheet changes', async ({ page, context }) => {
  const errors = trackErrors(page)
  await setup(page)
  await openApp(page, 'sheet')
  await page.locator('.persist-notice button').first().click({ timeout: 3000 }).catch(() => {})
  await fillSheet(page, [
    ['Month', 'Jan', 'Feb'],
    ['Sales', '10', '20'],
  ])
  // Let the sheet save.
  await page.waitForTimeout(1500)

  const writer = await context.newPage()
  const writerErrors = trackErrors(writer)
  await openApp(writer, 'writer')
  await writer.locator('.ProseMirror').click()
  await menu(writer, 'Insert', 'Chart…')
  const dialog = writer.locator('dialog[open]')
  await expect(dialog.locator('input[type=radio][value=sheet]')).toBeChecked()
  await expect(dialog.locator('.chart-source-pane input.field').first()).toHaveValue('A1:B3')
  await dialog.locator('label', { hasText: 'Caption' }).locator('input').fill('Monthly sales')
  await dialog.locator('button[value=ok]').click()
  const figure = writer.locator('.chart-figure')
  await expect(figure.locator('figcaption')).toHaveText('Monthly sales')
  await expect.poll(async () => (await svgOf(writer)).includes('>Feb<')).toBe(true)
  expect(await svgOf(writer)).not.toContain('>100<')

  // Change Feb's sales in the sheet: the chart in the document follows.
  await page.bringToFront()
  const host = (await page.locator('.sheet-host').boundingBox())!
  await page.mouse.click(host.x + 90 + 88, host.y + 59 + 48)
  await page.keyboard.type('95', { delay: 30 })
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await svgOf(writer)).includes('>100<'), { timeout: 30_000 }).toBe(true)
  await expect(figure).toHaveAttribute('title', /A1:B3/)

  // DOCX round trip: native chart part with its data, back as a chart.
  const [docx] = await Promise.all([writer.waitForEvent('download'), menu(writer, 'File', 'Download as', 'Word (.docx)')])
  const docxPath = (await docx.path())!
  const zip = await JSZip.loadAsync(readFileSync(docxPath))
  const chartXml = await zip.file('word/charts/chart1.xml')!.async('string')
  expect(chartXml).toContain('<c:barChart>')
  expect(chartXml).toContain('<c:v>95</c:v>')
  expect(zip.file('word/embeddings/Microsoft_Excel_Worksheet1.xlsx')).toBeTruthy()
  expect(await zip.file('word/document.xml')!.async('string')).toContain('drawingml/2006/chart')
  await writer.locator('#file-input').setInputFiles({ name: 'chart.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: readFileSync(docxPath) })
  await writer.waitForURL(/doc=/)
  await expect(writer.locator('.chart-figure figcaption')).toHaveText('Monthly sales', { timeout: 60_000 })
  await expect.poll(async () => (await svgOf(writer)).includes('>100<')).toBe(true)
  expect(errors).toEqual([])
  expect(writerErrors).toEqual([])
})

test('DOCX round trip keeps merge fields; slides insert a chart and export it natively', async ({ page }) => {
  const errors = trackErrors(page)
  await setup(page)
  await openApp(page, 'writer')
  await page.locator('.ProseMirror').click()
  await menu(page, 'Tools', 'Mail merge…')
  const panel = page.locator('.merge-panel')
  await panel.locator('input[type=file]').setInputFiles({ name: 'people.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) })
  await page.locator('.ProseMirror').click()
  await page.keyboard.type('Hello ')
  await panel.locator('.merge-fields button', { hasText: 'Name' }).click()
  await panel.locator('button[title="Close"]').click()
  // A chart with typed data.
  await menu(page, 'Insert', 'Chart…')
  const dialog = page.locator('dialog[open]')
  await dialog.locator('input[type=radio][value=inline]').check()
  await dialog.getByRole('radio', { name: 'Pie' }).click()
  await dialog.locator('button[value=ok]').click()
  await expect(page.locator('.chart-figure .chart-img')).toHaveAttribute('src', /^data:image\/svg/)

  const [docx] = await Promise.all([page.waitForEvent('download'), menu(page, 'File', 'Download as', 'Word (.docx)')])
  const docxPath = (await docx.path())!
  await page.locator('#file-input').setInputFiles({ name: 'template.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: readFileSync(docxPath) })
  await page.waitForURL(/doc=/)
  await expect(page.locator('.ProseMirror .merge-chip')).toHaveText('«Name»', { timeout: 60_000 })
  await expect(page.locator('.ProseMirror')).toContainText('Hello «Name»')
  await expect(page.locator('.chart-figure .chart-img')).toHaveAttribute('src', /^data:image\/svg/)

  // Slides: Insert ▸ Chart… and native chart in the .pptx.
  await openApp(page, 'slides')
  await menu(page, 'Insert', 'Chart…')
  await page.locator('dialog[open] input[type=radio][value=inline]').check()
  await page.locator('dialog[open] button[value=ok]').click()
  await expect(page.locator('.diagram-canvas image').first()).toBeVisible()
  const [pptx] = await Promise.all([page.waitForEvent('download'), menu(page, 'File', 'Download as', 'PowerPoint (.pptx)')])
  const pzip = await JSZip.loadAsync(readFileSync((await pptx.path())!))
  expect(Object.keys(pzip.files).some((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f))).toBe(true)
  expect(errors).toEqual([])
})
