import { expect, test, type Page } from '@playwright/test'
import JSZip from 'jszip'
import { readFileSync } from 'node:fs'
import { openApp, RELAYS, trackErrors } from './helpers'

// Types values column by column from A1 (Enter moves down, arrows move back up).
// A1 is found from the grid's default geometry: formula bar, 46 × 20 px headers, 88 × 24 px cells.
async function fill(page: Page, columns: string[][]) {
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
  // Back to A1.
  for (let i = 0; i < columns[columns.length - 1].length; i++) await page.keyboard.press('ArrowUp')
  for (let c = 1; c < columns.length; c++) await page.keyboard.press('ArrowLeft')
}

async function menu(page: Page, name: string, item: string) {
  await page.locator('#menubar').getByText(name, { exact: true }).click()
  await page.getByText(item, { exact: true }).last().click()
}

test('insert a chart, save it as native charts in .xlsx and .ods, and open it again', async ({ page }) => {
  const errors = trackErrors(page)
  await page.addInitScript(() => localStorage.setItem('words-online:language', 'en'))
  await openApp(page, 'sheet')
  await page.locator('.persist-notice button').first().click({ timeout: 3000 }).catch(() => {})
  await fill(page, [
    ['Month', 'Sep', 'Oct', 'Nov'],
    ['Grade', '6', '7.5', '8'],
  ])
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Shift+ArrowRight')

  await menu(page, 'Insert', 'Chart…')
  const dialog = page.locator('dialog[open]')
  await expect(dialog.locator('input.field').first()).toHaveValue('A1:B4')
  await dialog.getByRole('radio', { name: 'Line' }).click()
  await dialog.locator('input.field').nth(1).fill('Average grade')
  await expect(dialog.locator('.chart-preview canvas')).toBeVisible()
  await dialog.locator('button[value=ok]').click()
  const chart = page.locator('.ofimeo-chart')
  await expect(chart).toHaveAttribute('aria-label', 'Average grade')
  await expect(chart.locator('canvas')).toBeVisible()

  // Native chart parts in both formats.
  const download = async (label: string) => {
    await page.locator('#menubar').getByText('File', { exact: true }).click()
    await page.getByText('Download as', { exact: true }).hover()
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByText(label, { exact: true }).click()])
    return file.path()
  }
  const xlsxPath = await download('Microsoft Excel (.xlsx)')
  const xlsx = await JSZip.loadAsync(readFileSync(xlsxPath))
  const chartXml = await xlsx.file('xl/charts/chart1.xml')!.async('string')
  expect(chartXml).toContain('<c:lineChart>')
  expect(chartXml).toContain('Average grade')
  expect(chartXml).toContain('$B$2:$B$4')
  const odsPath = await download('OpenDocument spreadsheet (.ods)')
  const ods = await JSZip.loadAsync(readFileSync(odsPath))
  expect(await ods.file('Object 1/content.xml')!.async('string')).toContain('chart:class="chart:line"')

  // Opening the .xlsx brings the chart back.
  await page.goto(`/${RELAYS}`)
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.home-open').first().click()])
  await chooser.setFiles({ name: 'grades.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: readFileSync(xlsxPath) })
  await expect(page.locator('.ofimeo-chart')).toHaveAttribute('aria-label', 'Average grade', { timeout: 60_000 })
  expect(errors).toEqual([])
})
