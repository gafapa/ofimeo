import { expect, test, type Locator, type Page } from '@playwright/test'
import JSZip from 'jszip'
import { readFile } from 'node:fs/promises'
import { openApp, trackErrors } from './helpers'

// Math graph: graphing calculator and geometry, embedded as an editable picture.

async function menu(page: Page, name: string, item: string) {
  await page.locator('#menubar').getByText(name, { exact: true }).click()
  await page.getByText(item, { exact: true }).last().click()
}

const graphDialog = (page: Page) => page.locator('dialog.mg-dialog[open]')
const expression = (dialog: Locator, n: number) => dialog.getByRole('textbox', { name: `Expression ${n}`, exact: true })

// Screen position of a point (x, y) of the graph shown in the dialog.
async function screenPoint(dialog: Locator, x: number, y: number, view: { xmin: number; xmax: number; ymin: number; ymax: number }) {
  const box = (await dialog.locator('.mg-canvas').boundingBox())!
  return {
    x: box.x + ((x - view.xmin) / (view.xmax - view.xmin)) * box.width,
    y: box.y + (1 - (y - view.ymin) / (view.ymax - view.ymin)) * box.height,
  }
}
const VIEW = { xmin: -10, xmax: 10, ymin: -7.5, ymax: 7.5 }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ofimeo:language', 'en'))
})

test('writer: graph of y = a·x² with a slider, edit a, export DOCX with the picture and reopen it editable', async ({ page }) => {
  const errors = trackErrors(page)
  await openApp(page, 'writer')
  await page.locator('.persist-notice button').first().click({ timeout: 3000 }).catch(() => {})
  await page.locator('.ProseMirror').click()
  await menu(page, 'Insert', 'Math graph…')
  const dialog = graphDialog(page)
  await expression(dialog, 1).fill('y = a*x^2')
  // Enter adds a slider for the free letter a.
  await expression(dialog, 1).press('Enter')
  const slider = dialog.getByRole('slider', { name: 'Slider a' })
  await expect(slider).toHaveValue('1')
  await expect(dialog.locator('.mg-canvas svg path[stroke="#1a73e8"]')).toHaveCount(1)
  await expect(dialog.locator('.mg-readout')).toContainText('Roots: x = 0')
  await expect(dialog.locator('.mg-readout')).toContainText('Minimum: (0, 0)')
  // The table of values follows the slider.
  await dialog.getByRole('tab', { name: 'Table' }).click()
  await expect(dialog.locator('.mg-table tbody tr').nth(7)).toContainText('4')
  await dialog.getByRole('tab', { name: 'Algebra' }).click()
  await dialog.getByRole('spinbutton', { name: 'Value of a' }).fill('3')
  await dialog.getByRole('spinbutton', { name: 'Value of a' }).press('Tab')
  await expect(dialog.locator('.mg-readout')).toContainText('a = 3')
  await dialog.getByRole('button', { name: 'Insert', exact: true }).click()
  await expect(dialog).toHaveCount(0)

  const img = page.locator('.ProseMirror img[data-graph]')
  await expect(img).toHaveCount(1)
  await expect(img).toHaveAttribute('src', /^data:image\/png;base64,/)
  await expect(img).toHaveAttribute('alt', /a = 3/)
  const before = await img.getAttribute('src')

  // Double click edits it: change a.
  await img.dblclick()
  await expect(dialog.getByRole('spinbutton', { name: 'Value of a' })).toHaveValue('3')
  await dialog.getByRole('spinbutton', { name: 'Value of a' }).fill('-2')
  await dialog.getByRole('spinbutton', { name: 'Value of a' }).press('Tab')
  await expect(dialog.locator('.mg-readout')).toContainText('Maximum: (0, 0)')
  await dialog.getByRole('button', { name: 'Update', exact: true }).click()
  await expect(img).toHaveAttribute('alt', /a = -2/)
  expect(await img.getAttribute('src')).not.toBe(before)
  expect(JSON.parse((await img.getAttribute('data-graph'))!).sliders[0].value).toBe(-2)

  // DOCX: a picture whose title keeps the construction.
  await page.locator('#menubar').getByText('File', { exact: true }).click()
  await page.getByText('Download as', { exact: true }).hover()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByText('Word (.docx)', { exact: true }).click()])
  const buffer = await readFile((await download.path())!)
  const zip = await JSZip.loadAsync(buffer)
  const media = Object.keys(zip.files).filter((n) => n.startsWith('word/media/'))
  expect(media.some((n) => n.endsWith('.png'))).toBe(true)
  const xml = await zip.file('word/document.xml')!.async('string')
  expect(xml).toContain('<pic:pic')
  expect(xml).toContain('ofimeo-graph:')

  // Opening the file restores an editable graph (in a new document: wait for it,
  // or the old document's picture would match first).
  const current = page.url()
  await page.locator('#file-input').setInputFiles({ name: 'graph.docx', mimeType: 'application/octet-stream', buffer })
  await page.waitForURL((url) => url.toString() !== current, { timeout: 30_000 })
  await expect(page.locator('.ProseMirror img[data-graph]')).toHaveCount(1, { timeout: 30_000 })
  await page.locator('.ProseMirror img[data-graph]').dblclick()
  await expect(dialog.getByRole('textbox', { name: 'Expression 1', exact: true })).toHaveValue('y = a*x^2')
  await expect(dialog.getByRole('spinbutton', { name: 'Value of a' })).toHaveValue('-2')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  expect(errors).toEqual([])
})

test('geometry: a midpoint follows when a point is dragged, and keyboard moves points', async ({ page }) => {
  const errors = trackErrors(page)
  await openApp(page, 'writer')
  await page.locator('.persist-notice button').first().click({ timeout: 3000 }).catch(() => {})
  await page.locator('.ProseMirror').click()
  await menu(page, 'Insert', 'Math graph…')
  const dialog = graphDialog(page)
  await expression(dialog, 1).fill('A = (1, 1)')
  await expression(dialog, 1).press('Enter')
  await expression(dialog, 2).fill('B = (5, 3)')

  // Midpoint tool: click A, then B.
  await dialog.getByRole('tab', { name: 'Geometry' }).click()
  await dialog.getByRole('button', { name: 'Midpoint', exact: true }).click()
  for (const [x, y] of [[1, 1], [5, 3]]) {
    const p = await screenPoint(dialog, x, y, VIEW)
    await page.mouse.click(p.x, p.y)
  }
  const readout = dialog.locator('.mg-readout')
  await expect(readout).toContainText('C = (3, 2), midpoint of A and B')

  // Drag A to (-3, 5): the midpoint moves with it.
  await dialog.getByRole('button', { name: 'Move', exact: true }).click()
  const from = await screenPoint(dialog, 1, 1, VIEW)
  const to = await screenPoint(dialog, -3, 5, VIEW)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 })
  await page.mouse.move(to.x, to.y, { steps: 4 })
  await page.mouse.up()
  await expect(readout).toContainText('A = (-3, 5)')
  await expect(readout).toContainText('C = (1, 4), midpoint of A and B')

  // Keyboard: select B through its row, then move it with the arrow keys on the graph.
  await dialog.getByRole('tab', { name: 'Algebra' }).click()
  await expect(expression(dialog, 3)).toHaveValue('C = Midpoint(A, B)')
  await expression(dialog, 2).focus()
  await dialog.locator('.mg-canvas').focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  // One grid snap step (1) per key.
  await expect(readout).toContainText('B = (7, 3)')
  await expect(readout).toContainText('C = (2, 4)')
  await expect(dialog.locator('.mg-live')).toContainText('B = (7, 3)')

  // Segment and measurements typed as commands.
  await expression(dialog, 3).press('Enter')
  await expression(dialog, 4).fill('s1 = Segment(A, B)')
  await expect(readout).toContainText('Segment s1 from A to B, length 10.198')
  await dialog.getByRole('button', { name: 'Insert', exact: true }).click()
  await expect(page.locator('.ProseMirror img[data-graph]')).toHaveAttribute('alt', /midpoint of A and B/)
  expect(errors).toEqual([])
})

test('slides: insert a math graph shape and edit it', async ({ page }) => {
  const errors = trackErrors(page)
  await openApp(page, 'slides')
  await page.locator('.persist-notice button').first().click({ timeout: 3000 }).catch(() => {})
  await menu(page, 'Insert', 'Math graph…')
  const dialog = graphDialog(page)
  await expression(dialog, 1).fill('y = sin(x)')
  await dialog.getByRole('button', { name: 'Insert', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  const image = page.locator('.diagram-canvas svg image')
  await expect(image).toHaveCount(1)
  const box = (await image.boundingBox())!
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
  await expect(expression(dialog, 1)).toHaveValue('y = sin(x)')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  expect(errors).toEqual([])
})
