import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { expect, test, type Page } from '@playwright/test'
import { RELAYS, trackErrors } from './helpers'

// Accessible table view of the spreadsheet: keyboard editing that reaches a
// second browser, no serious axe-core violations, read-only view links, and
// text alternatives of charts.

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js')
// E2E_RELAYS lets a run with its own relay port reuse the spec.
const relays = process.env.E2E_RELAYS ?? RELAYS
const b64 = (n: number) => randomBytes(n).toString('base64url')
const newDoc = () => `/${relays}#app=sheet&doc=sheet-a11y-${Date.now()}&key=${b64(18)}&edit=${b64(32)}`
const english = () => localStorage.setItem('words-online:language', 'en')

async function open(page: Page, url: string) {
  await page.goto(url)
  await page.locator('.app-sheet canvas').first().waitFor({ timeout: 60_000 })
  await page.locator('.persist-notice button').first().click({ timeout: 3000 }).catch(() => {})
}

async function menu(page: Page, ...path: string[]) {
  await page.locator('#menubar').getByText(path[0], { exact: true }).click()
  for (let i = 1; i < path.length - 1; i++) await page.locator('.menu-row', { hasText: path[i] }).last().hover()
  await page.locator('.menu-row', { hasText: path[path.length - 1] }).last().click()
}

const grid = (page: Page) => page.getByRole('grid')
const cell = (page: Page, ref: string) => {
  const [, col, row] = /^([A-Z]+)(\d+)$/.exec(ref)!
  return page.locator(`.sheet-a11y-grid td[data-r="${Number(row) - 1}"][data-c="${col.charCodeAt(0) - 65}"]`)
}
const live = (page: Page) => page.locator('.app > [role=status][aria-live]')

async function seriousViolations(page: Page) {
  await page.addScriptTag({ path: AXE })
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: { id: string; impact: string; nodes: { target: string[] }[] }[] }> } }).axe
    // The accessible view and the app frame around it (Univer's canvas grid is hidden and inert meanwhile).
    const result = await axe.run({ include: [['.app']], exclude: [['.sheet-host']] }, { resultTypes: ['violations'] })
    return result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
  })
}

test('the accessible table view edits with the keyboard, syncs to a second browser and passes axe', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage()
  await a.addInitScript(english)
  const errors = trackErrors(a)
  await open(a, newDoc())

  // The skip link at the top switches views.
  await a.getByRole('button', { name: 'Switch to accessible table view' }).focus()
  await a.keyboard.press('Enter')
  await expect(grid(a)).toBeVisible()
  await expect(grid(a)).toHaveAttribute('aria-readonly', 'false')
  await expect(grid(a)).toHaveAttribute('aria-rowcount', /\d+/)
  await expect(a.locator('.sheet-a11y-grid td[tabindex="0"]')).toBeFocused()
  await expect(live(a)).toContainText('A1: empty')

  const type = async (text: string) => {
    await a.keyboard.type(text)
    await a.keyboard.press('Enter')
  }
  await a.keyboard.press('Control+Home')
  await type('Name')
  await type('Ana')
  await type('Luis')
  await a.keyboard.press('Control+Home')
  await a.keyboard.press('ArrowRight')
  await type('Grade')
  await type('7')
  await type('8.5')
  await a.keyboard.press('F2')
  await expect(a.getByRole('textbox', { name: 'Edit cell B4' })).toBeFocused()
  await a.keyboard.type('=AVERAGE(B2:B3)')
  await a.keyboard.press('Enter')
  await a.keyboard.press('ArrowUp')
  await expect(live(a)).toHaveText('B4: 7.75. Formula: =AVERAGE(B2:B3)')
  await expect(a.locator('.sheet-a11y-current')).toContainText('=AVERAGE(B2:B3)')
  await expect(cell(a, 'A3')).toHaveText('Luis')

  // Ctrl+End goes to the end of the data; Enter shows the formula for editing; Escape keeps it.
  await a.keyboard.press('Control+Home')
  await a.keyboard.press('Control+End')
  await expect(live(a)).toContainText('B4: 7.75')
  await a.keyboard.press('Enter')
  await expect(a.getByRole('textbox', { name: 'Edit cell B4' })).toHaveValue('=AVERAGE(B2:B3)')
  await a.keyboard.press('Escape')
  await expect(a.locator('.sheet-a11y-grid td[tabindex="0"]')).toBeFocused()

  // Undo and redo run Univer's commands.
  await a.keyboard.press('Control+Home')
  await a.keyboard.press('ArrowDown')
  await a.keyboard.press('Delete')
  await expect(cell(a, 'A2')).toHaveText('')
  await a.keyboard.press('Control+z')
  await expect(cell(a, 'A2')).toHaveText('Ana')

  expect(await seriousViolations(a)).toEqual([])

  // A second browser sees the edits, in its own table view (View menu).
  const b = await (await browser.newContext()).newPage()
  await b.addInitScript(english)
  await open(b, a.url())
  await menu(b, 'View', 'Accessible table view')
  await expect(cell(b, 'B4')).toHaveText('7.75', { timeout: 60_000 })
  await expect(cell(b, 'A2')).toHaveText('Ana')
  // And an edit made there comes back.
  await cell(b, 'C1').click()
  await b.keyboard.type('Passed')
  await b.keyboard.press('Enter')
  await expect(cell(a, 'C1')).toHaveText('Passed', { timeout: 60_000 })

  // Back to the grid: the live region reads the selected cell as it moves.
  await a.keyboard.press('Alt+Shift+T')
  await expect(a.locator('.sheet-a11y-view')).toBeHidden()
  await expect(a.locator('.sheet-host')).not.toHaveAttribute('aria-hidden', 'true')
  await expect(a.locator('[data-u-comp="defined-name"] input')).toHaveAttribute('aria-label', 'Name box (cell reference)')
  await expect(a.locator('[data-u-comp="formula-bar"]')).toHaveAttribute('aria-label', 'Formula bar')
  await a.locator('#__editor___INTERNAL_EDITOR__DOCS_NORMAL').focus()
  await a.keyboard.press('ArrowDown')
  await expect(live(a)).toHaveText(/^A\d: (Name|Ana|Luis)$/)
  expect(errors).toEqual([])
})

test('charts get a text summary and their data as a table', async ({ page }) => {
  await page.addInitScript(english)
  await open(page, newDoc())
  await page.keyboard.press('Alt+Shift+T')
  for (const text of ['Month', 'Sep', 'Oct', 'Nov']) {
    await page.keyboard.type(text)
    await page.keyboard.press('Enter')
  }
  await page.keyboard.press('Control+Home')
  await page.keyboard.press('ArrowRight')
  for (const text of ['Grade', '6', '7.5', '8']) {
    await page.keyboard.type(text)
    await page.keyboard.press('Enter')
  }
  await page.keyboard.press('Alt+Shift+T')
  // Select A1:B4 through the name box and insert a chart.
  const nameBox = page.locator('[data-u-comp="defined-name"] input')
  await nameBox.click()
  await nameBox.fill('A1:B4')
  await nameBox.press('Enter')
  await menu(page, 'Insert', 'Chart…')
  const dialog = page.locator('dialog[open]')
  await expect(dialog.locator('input.field').first()).toHaveValue('A1:B4')
  await dialog.locator('input.field').nth(1).fill('Average grade')
  await dialog.locator('button[value=ok]').click()
  const chart = page.locator('.ofimeo-chart')
  await expect(chart).toHaveAttribute('aria-label', 'Average grade')
  const describedBy = await chart.getAttribute('aria-describedby')
  await expect(page.locator(`[id="${describedBy}"]`)).toHaveText(/Column chart: Average grade\. 1 series, 3 points\. Grade: Sep 6, Oct 7\.5, Nov 8\./)

  // In the table view the charts are listed with their summary and data.
  await page.keyboard.press('Alt+Shift+T')
  const item = page.locator('.sheet-a11y-charts li')
  await expect(item).toContainText('Average grade')
  await item.getByRole('button', { name: 'Chart data as table' }).click()
  const table = page.locator('dialog[open] table.chart-data-table')
  await expect(table.locator('caption')).toHaveText('Average grade')
  await expect(table.locator('tbody tr')).toHaveCount(3)
  await expect(table.locator('tbody tr').nth(1)).toHaveText(/Oct\s*7\.5/)
})

test('a view link gets a read-only table view', async ({ browser }) => {
  const editor = await (await browser.newContext()).newPage()
  await editor.addInitScript(english)
  await open(editor, newDoc())
  // The shortcut works once the accessible view is set up (its skip link exists).
  await editor.getByRole('button', { name: 'Switch to accessible table view' }).waitFor({ state: 'attached' })
  await editor.keyboard.press('Alt+Shift+T')
  await expect(editor.locator('.sheet-a11y-grid td[tabindex="0"]')).toBeFocused()
  await editor.keyboard.type('Kept')
  await editor.keyboard.press('Enter')
  await expect(cell(editor, 'A1')).toHaveText('Kept')
  await menu(editor, 'File', 'Share…')
  await editor.locator('.share-tab[data-value=view]').click()
  const link = await editor.locator('dialog[open] input.field').inputValue()
  await editor.keyboard.press('Escape')

  const viewer = await (await browser.newContext({ viewport: { width: 683, height: 410 }, deviceScaleFactor: 2 })).newPage()
  await viewer.addInitScript(english)
  const errors = trackErrors(viewer)
  await open(viewer, link.replace(/^https?:\/\/[^/#]+\/[^#]*/, `/${relays}`))
  await expect(viewer.locator('#access-badge')).toHaveText('View only', { timeout: 30_000 })
  await viewer.getByRole('button', { name: 'Switch to accessible table view' }).waitFor({ state: 'attached' })
  await viewer.keyboard.press('Alt+Shift+T')
  await expect(grid(viewer)).toHaveAttribute('aria-readonly', 'true')
  await expect(cell(viewer, 'A1')).toHaveText('Kept', { timeout: 60_000 })
  // At the size of 200 % zoom the view fits without scrolling the page sideways.
  expect(await viewer.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await viewer.keyboard.press('Control+Home')
  await viewer.keyboard.press('Enter')
  await expect(viewer.getByRole('textbox', { name: /Edit cell/ })).toHaveCount(0)
  await expect(live(viewer)).toHaveText('This spreadsheet is view only')
  await viewer.keyboard.type('X')
  await viewer.keyboard.press('Delete')
  await expect(cell(viewer, 'A1')).toHaveText('Kept')
  expect(await seriousViolations(viewer)).toEqual([])
  expect(errors).toEqual([])
})
