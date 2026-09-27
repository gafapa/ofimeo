import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { RELAYS, trackErrors } from './helpers'

const b64 = (n: number) => randomBytes(n).toString('base64url')
const newDoc = (app: string) => `/${RELAYS}#app=${app}&doc=${app}-${Date.now()}&key=${b64(18)}&edit=${b64(32)}`

async function menu(page: Page, ...path: string[]) {
  await page.locator('#menubar').getByText(path[0], { exact: true }).click()
  for (let i = 1; i < path.length - 1; i++) await page.locator('.menu-row', { hasText: path[i] }).last().hover()
  await page.locator('.menu-row', { hasText: path[path.length - 1] }).last().click()
}

// A workbook with a conditional format, a note, a filter and a named range used by a formula.
async function featureWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Grades')
  ws.addRows([
    ['Name', 'Score'],
    ['Ana', 3],
    ['Bea', 9],
    ['Carl', 5],
  ])
  ws.addConditionalFormatting({ ref: 'B2:B4', rules: [{ type: 'cellIs', operator: 'lessThan', formulae: [5], priority: 1, style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFF0000' } } } }] })
  ws.getCell('A2').note = 'Absent twice'
  ws.autoFilter = 'A1:B4'
  wb.definedNames.add('Grades!$B$2:$B$4', 'scores')
  ws.getCell('D1').value = { formula: 'SUM(scores)' }
  return Buffer.from(await wb.xlsx.writeBuffer())
}

test('xlsx round trip keeps notes, named ranges, conditional formatting and filters', async ({ page }) => {
  const errors = trackErrors(page)
  await page.addInitScript(() => localStorage.setItem('ofimeo:language', 'en'))
  await page.goto(`/${RELAYS}`)
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.home-open').first().click()])
  await chooser.setFiles({ name: 'grades.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await featureWorkbook() })
  await page.locator('.app-sheet canvas').first().waitFor({ timeout: 60_000 })
  await page.locator('.persist-notice button').first().click({ timeout: 3000 }).catch(() => {})

  // The named range works: D1 (=SUM(scores)) and E1 selected show a sum of 17.
  // Selected through the name box (the imported columns keep the file's widths).
  const nameBox = page.locator('[data-u-comp="defined-name"] input')
  await nameBox.click()
  await nameBox.fill('D1:E1')
  await nameBox.press('Enter')
  await expect(page.locator('.sheet-stats')).toContainText('Sum: 17')

  // Download as .xlsx: every feature is in the file.
  await page.locator('#menubar').getByText('File', { exact: true }).click()
  await page.getByText('Download as', { exact: true }).hover()
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByText('Microsoft Excel (.xlsx)', { exact: true }).click()])
  const zip = await JSZip.loadAsync(readFileSync(await file.path()))
  const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
  expect(sheet).toContain('<conditionalFormatting sqref="B2:B4">')
  expect(sheet).toMatch(/<autoFilter ref="A1:B4"/)
  expect(await zip.file('xl/workbook.xml')!.async('string')).toContain('<definedName name="scores">Grades!$B$2:$B$4</definedName>')
  const comments = Object.keys(zip.files).find((p) => /^xl\/comments\d*\.xml$/.test(p))
  expect(comments && (await zip.file(comments)!.async('string'))).toContain('Absent twice')
  // Styled cells name their font (no theme serif fallback in other programs).
  expect(await zip.file('xl/styles.xml')!.async('string')).not.toMatch(/<font>(?:(?!<name)[\s\S])*?<\/font>/)

  // Opening the downloaded file again keeps them (read back with ExcelJS as well).
  const again = new ExcelJS.Workbook()
  await again.xlsx.load(readFileSync(await file.path()))
  const ws = again.getWorksheet('Grades')!
  expect(ws.getCell('A2').note).toBeTruthy()
  expect((ws as unknown as { conditionalFormattings: unknown[] }).conditionalFormattings).toHaveLength(1)
  expect(again.definedNames.model).toContainEqual({ name: 'scores', ranges: ['Grades!$B$2:$B$4'] })
  expect(errors).toEqual([])
})

test('a copy of a quiz keeps its answer key', async ({ page }) => {
  const errors = trackErrors(page)
  await page.addInitScript(() => localStorage.setItem('ofimeo:language', 'en'))
  await page.goto(newDoc('forms'))
  await page.locator('.fm-editor').waitFor({ timeout: 60_000 })
  await page.locator('[data-f="meta:title"]').fill('Capitals')
  await page.getByRole('button', { name: 'Quiz mode' }).click()
  await page.locator('.fm-add-question').click()
  await page.getByRole('menuitem', { name: 'Multiple choice', exact: true }).click()
  const card = page.locator('.fm-question').last()
  await card.locator('textarea.fm-q-input').fill('Capital of Portugal')
  await card.locator('.fm-opt-row input.field').first().fill('Porto')
  await card.getByText('Add option').click()
  await card.locator('.fm-opt-row input.field').nth(1).fill('Lisbon')
  await card.locator('.fm-opt-row').nth(1).getByRole('button', { name: 'Mark correct' }).click()
  await expect(card.locator('.fm-opt-row').nth(1).getByRole('button', { name: 'Correct' })).toBeVisible()
  const original = page.url()

  await menu(page, 'File', 'Make a copy')
  await page.waitForURL((u) => u.href !== original, { timeout: 30_000 })
  await page.locator('.fm-editor').waitFor({ timeout: 60_000 })
  await expect(page.locator('[data-f="meta:title"]')).toHaveValue('Copy of Capitals')
  await page.locator('.fm-question').first().click()
  const rows = page.locator('.fm-question .fm-opt-row')
  await expect(rows.nth(1).getByRole('button', { name: 'Correct' })).toBeVisible()
  await expect(rows.nth(0).getByRole('button', { name: 'Mark correct' })).toBeVisible()
  expect(errors).toEqual([])
})

test('a spreadsheet view link refuses edits without page errors', async ({ browser }) => {
  const editor = await (await browser.newContext()).newPage()
  await editor.addInitScript(() => localStorage.setItem('ofimeo:language', 'en'))
  await editor.goto(newDoc('sheet'))
  await editor.locator('.app-sheet canvas').first().waitFor({ timeout: 60_000 })
  await editor.locator('.persist-notice button').first().click({ timeout: 3000 }).catch(() => {})
  const host = (await editor.locator('.sheet-host').boundingBox())!
  await editor.mouse.click(host.x + 90, host.y + 59)
  await editor.keyboard.type('Kept')
  await editor.keyboard.press('Enter')
  await menu(editor, 'File', 'Share…')
  await editor.locator('.share-tab[data-value=view]').click()
  const link = await editor.locator('dialog[open] input.field').inputValue()
  await editor.keyboard.press('Escape')

  const viewer = await (await browser.newContext()).newPage()
  await viewer.addInitScript(() => localStorage.setItem('ofimeo:language', 'en'))
  const errors = trackErrors(viewer)
  await viewer.goto(link.replace(/^https?:\/\/[^/#]+\/[^#]*/, `/${RELAYS}`))
  await viewer.locator('.app-sheet canvas').first().waitFor({ timeout: 60_000 })
  await expect(viewer.locator('#access-badge')).toHaveText('View only', { timeout: 30_000 })
  const vhost = (await viewer.locator('.sheet-host').boundingBox())!
  // Typing, deleting, bold, renaming the tab: all refused quietly.
  await viewer.mouse.click(vhost.x + 90, vhost.y + 59)
  await viewer.keyboard.type('Changed')
  await viewer.keyboard.press('Enter')
  await viewer.mouse.click(vhost.x + 90, vhost.y + 59)
  await viewer.keyboard.press('Delete')
  await viewer.keyboard.press('Control+b')
  const tab = viewer.locator('[data-u-comp="slide-tab-item"]').first()
  await tab.dblclick()
  await viewer.keyboard.type('Renamed')
  await viewer.keyboard.press('Enter')
  await expect(tab).toHaveText('Sheet1')
  // No Univer tool bar and no "+" sheet button for viewers.
  await expect(viewer.locator('[data-u-comp="ribbon-toolbar"]')).toHaveCount(0)
  await expect(viewer.locator('.sheet-host [data-u-comp="sheet-bar-append-button"]').first()).toBeHidden()
  await viewer.waitForTimeout(1000)
  expect(errors).toEqual([])
})
