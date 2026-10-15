import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { openApp, RELAYS, trackErrors } from './helpers'
import { makeFixturePdf } from './pdf-fixture'
import { call, ENABLED, ENGLISH, toolNames } from './webmcp-helpers'

// Review mode (proposals), batches as one undo step, and the tools that
// delete or reorganise (confirmed by the user).

const REVIEW = () => localStorage.setItem('ofimeo:webmcp:review', '1')

async function setup(page: Page, app: string, tool: string, ...scripts: (() => void)[]) {
  await page.addInitScript(ENGLISH)
  await page.addInitScript(ENABLED)
  for (const script of scripts) await page.addInitScript(script)
  const created: Record<string, string> = { forms: '.fm-tab.active', notebook: '.nb-content .ProseMirror' }
  if (created[app]) {
    await page.goto(`/${RELAYS}#new=${app}`)
    await page.locator(created[app]).waitFor({ timeout: 60_000 })
  } else await openApp(page, app)
  await expect.poll(() => toolNames(page)).toContain(tool)
}

const allow = (page: Page) => page.locator('dialog[open]').getByRole('button', { name: 'Allow', exact: true }).click()
const display = async (page: Page, range: string) => ((await call(page, 'read_range', { range })).data as { display: string[][] }).display

test('review mode: changes wait in the proposals panel until the user accepts or rejects them', async ({ page }) => {
  const errors = trackErrors(page)
  await setup(page, 'sheet', 'write_range', REVIEW)
  expect((await call(page, 'get_document_info')).data).toMatchObject({ review_mode: true })

  const first = await call(page, 'write_range', { range: 'A1', values: [['Kept']] })
  expect(first.data).toMatchObject({ status: 'proposed' })
  const second = await call(page, 'write_range', { range: 'A2', values: [['Dropped']] })
  const panel = page.locator('.webmcp-proposals')
  await expect(panel).toBeVisible()
  await expect(panel.locator('.webmcp-proposal.pending')).toHaveCount(2)
  await expect(panel).toContainText('Write values from A1 in Sheet1')
  await expect(page.locator('.webmcp-badge')).toHaveText('2')
  // Nothing changed yet.
  expect(await display(page, 'A1:A2')).toEqual([[''], ['']])

  await panel.locator('.webmcp-proposal.pending').first().getByRole('button', { name: 'Accept', exact: true }).click()
  await panel.locator('.webmcp-proposal.pending').first().getByRole('button', { name: 'Reject', exact: true }).click()
  await expect(panel.locator('.webmcp-proposal.pending')).toHaveCount(0)
  await expect.poll(() => display(page, 'A1:A2')).toEqual([['Kept'], ['']])
  const decided = (await call(page, 'list_proposals')).data as { id: string; status: string }[]
  expect(decided.map((p) => [p.id, p.status])).toEqual([
    [(first.data as { proposal: string }).proposal, 'accepted'],
    [(second.data as { proposal: string }).proposal, 'rejected'],
  ])
  await expect(page.locator('.webmcp-badge')).toBeHidden()

  // Destructive changes are proposals too (accepting is the confirmation).
  expect((await call(page, 'clear_range', { range: 'A1' })).data).toMatchObject({ status: 'proposed' })
  await expect(page.locator('dialog[open]')).toHaveCount(0)
  await panel.getByRole('button', { name: 'Accept all' }).click()
  await expect.poll(() => display(page, 'A1')).toEqual([['']])

  // The switch is in the indicator's dialog.
  await panel.getByRole('button', { name: 'Close' }).click()
  await page.locator('.webmcp-indicator').click()
  const review = page.locator('dialog[open]').getByLabel('Review the assistant’s changes before they are applied')
  await expect(review).toBeChecked()
  await review.uncheck()
  await page.locator('dialog[open]').getByRole('button', { name: 'Close' }).click()
  expect((await call(page, 'write_range', { range: 'B1', values: [['Direct']] })).data).toMatchObject({ written: 'B1' })
  expect(errors).toEqual([])
})

test('sheet: a batch is one undo step; rows and sheets are inserted, renamed and deleted with confirmation', async ({ page }) => {
  const errors = trackErrors(page)
  await setup(page, 'sheet', 'apply_batch')
  const batch = await call(page, 'apply_batch', {
    operations: [
      { tool: 'write_range', args: { range: 'A1', values: [['a'], ['b'], ['c']] } },
      { tool: 'write_range', args: { range: 'B1', values: [[1], [2], [3]] } },
    ],
  })
  expect(batch.data).toMatchObject({ done: 2, of: 2 })
  await expect.poll(() => display(page, 'A1:B3')).toEqual([['a', '1'], ['b', '2'], ['c', '3']])
  expect((await call(page, 'undo')).error).toBe(false)
  await expect.poll(() => display(page, 'A1:B3')).toEqual([['', ''], ['', ''], ['', '']])
  expect((await call(page, 'redo')).error).toBe(false)
  await expect.poll(() => display(page, 'A1:B3')).toEqual([['a', '1'], ['b', '2'], ['c', '3']])

  expect((await call(page, 'insert_rows', { before: 1, count: 1 })).error).toBe(false)
  await expect.poll(() => display(page, 'A1:A2')).toEqual([[''], ['a']])
  // Deleting asks the user; declining changes nothing.
  let pending = call(page, 'delete_rows', { from: 1, count: 2 })
  await expect(page.locator('dialog[open]')).toContainText('Delete 2 rows from row 1 in Sheet1')
  await page.locator('dialog[open]').getByRole('button', { name: 'Do not allow' }).click()
  expect((await pending).error).toBe(true)
  pending = call(page, 'delete_rows', { from: 1, count: 2 })
  await allow(page)
  expect((await pending).data).toMatchObject({ deleted: 2 })
  await expect.poll(() => display(page, 'A1')).toEqual([['b']])

  expect((await call(page, 'rename_sheet', { name: 'Data' })).data).toEqual({ name: 'Data' })
  expect((await call(page, 'duplicate_sheet', { sheet: 'Data' })).error).toBe(false)
  const copy = ((await call(page, 'list_sheets')).data as { name: string }[])[1].name
  pending = call(page, 'delete_sheet', { sheet: copy })
  await allow(page)
  expect((await pending).data).toEqual({ deleted: copy })
  expect(((await call(page, 'list_sheets')).data as unknown[]).length).toBe(1)
  expect(errors).toEqual([])
})

test('diagram and slides: objects and pages are moved, resized and deleted', async ({ page }) => {
  const errors = trackErrors(page)
  await setup(page, 'diagram', 'delete_objects')
  const a = ((await call(page, 'add_shape', { label: 'A', x: 40, y: 40 })).data as { id: string }).id
  const b = ((await call(page, 'add_shape', { label: 'B' })).data as { id: string }).id
  expect((await call(page, 'connect', { source_id: a, target_id: b })).error).toBe(false)
  expect((await call(page, 'move_object', { id: a, x: 100, width: 200 })).data).toMatchObject({ x: 100, width: 200 })
  const pending = call(page, 'delete_objects', { ids: [b] })
  await allow(page)
  expect((await pending).data).toMatchObject({ deleted: 2 })
  const summary = (await call(page, 'get_diagram')).data as { shapes: { id: string; x: number }[]; connectors: unknown[] }
  expect(summary.shapes).toEqual([expect.objectContaining({ id: a, x: 100 })])
  expect(summary.connectors).toEqual([])

  // Pages: a batch spanning two pages keeps each change on its page.
  expect((await call(page, 'add_page', { name: 'Second' })).data).toEqual({ page: 2 })
  const batch = await call(page, 'apply_batch', {
    operations: [
      { tool: 'add_shape', args: { label: 'On two', page: 2 } },
      { tool: 'add_shape', args: { label: 'On one', page: 1 } },
    ],
  })
  expect(batch.data).toMatchObject({ done: 2 })
  const labels = async (n: number) => ((await call(page, 'get_diagram', { page: n })).data as { shapes: { label: string }[] }).shapes.map((s) => s.label).sort()
  expect(await labels(1)).toEqual(['A', 'On one'])
  expect(await labels(2)).toEqual(['On two'])
  expect((await call(page, 'move_page', { page: 2, to: 1 })).data).toEqual({ page: 1 })
  expect((await call(page, 'rename_page', { page: 1, name: 'First' })).error).toBe(false)
  const del = call(page, 'delete_page', { page: 1 })
  await allow(page)
  expect((await del).data).toMatchObject({ deleted: 'First', pages: 1 })
  expect(errors).toEqual([])
})

test('slides: duplicate, move and delete slides', async ({ page }) => {
  const errors = trackErrors(page)
  await setup(page, 'slides', 'delete_slide')
  expect((await call(page, 'add_slide', { title: 'Two', notes: 'n2' })).data).toEqual({ slide: 2 })
  expect((await call(page, 'duplicate_slide', { slide: 2 })).data).toEqual({ slide: 3 })
  expect((await call(page, 'move_slide', { slide: 3, to: 1 })).data).toEqual({ slide: 1 })
  const titles = async () => ((await call(page, 'list_slides')).data as { title: string }[]).map((s) => s.title)
  expect(await titles()).toEqual(['Two', '', 'Two'])
  const del = call(page, 'delete_slide', { slide: 1 })
  await allow(page)
  expect((await del).data).toEqual({ slides: 2 })
  expect(await titles()).toEqual(['', 'Two'])
  expect(errors).toEqual([])
})

test('drawing: elements are changed and deleted', async ({ page }) => {
  const errors = trackErrors(page)
  await setup(page, 'draw', 'update_element')
  const box = ((await call(page, 'add_element', { type: 'rectangle', text: 'Old' })).data as { id: string }).id
  expect((await call(page, 'update_element', { id: box, text: 'New', x: 300, fill: '#ffec99' })).error).toBe(false)
  expect((await call(page, 'get_scene')).data).toEqual([expect.objectContaining({ id: box, x: 300, label: 'New', fill: '#ffec99' })])
  const pending = call(page, 'delete_elements', { ids: [box] })
  await allow(page)
  expect((await pending).data).toEqual({ deleted: 1 })
  expect((await call(page, 'get_scene')).data).toEqual([])
  expect(errors).toEqual([])
})

test('forms: questions are changed, moved and deleted', async ({ page }) => {
  const errors = trackErrors(page)
  await setup(page, 'forms', 'update_question')
  const q1 = ((await call(page, 'add_question', { type: 'choice', title: 'Colour?', options: ['Red', 'Blue'] })).data as { id: string }).id
  const q2 = ((await call(page, 'add_question', { type: 'short', title: 'Name' })).data as { id: string }).id
  expect((await call(page, 'update_question', { id: q1, title: 'Favourite colour?', options: ['Red', 'Green', 'Blue'], required: true })).error).toBe(false)
  expect((await call(page, 'move_question', { id: q2, to: 1 })).data).toMatchObject({ position: 1 })
  const form = (await call(page, 'get_form')).data as { items: { id: string; title: string; options?: string[]; required?: boolean }[] }
  expect(form.items.map((i) => i.title)).toEqual(['Name', 'Favourite colour?'])
  expect(form.items[1]).toMatchObject({ options: ['Red', 'Green', 'Blue'], required: true })
  const pending = call(page, 'delete_question', { id: q2 })
  await allow(page)
  expect((await pending).error).toBe(false)
  expect(((await call(page, 'get_form')).data as { items: unknown[] }).items).toHaveLength(1)
  // A batch is one step of the form's undo history.
  expect((await call(page, 'apply_batch', { operations: [{ tool: 'add_question', args: { type: 'short', title: 'X' } }, { tool: 'add_question', args: { type: 'short', title: 'Y' } }] })).error).toBe(false)
  expect(((await call(page, 'get_form')).data as { items: unknown[] }).items).toHaveLength(3)
  expect((await call(page, 'undo')).error).toBe(false)
  expect(((await call(page, 'get_form')).data as { items: unknown[] }).items).toHaveLength(1)
  expect(errors).toEqual([])
})

test('notebook: pages are renamed, moved and deleted', async ({ page }) => {
  const errors = trackErrors(page)
  await setup(page, 'notebook', 'rename_page')
  await call(page, 'add_page', { title: 'One', section: 'Maths' })
  await call(page, 'add_page', { title: 'Two', section: 'Maths' })
  expect((await call(page, 'rename_page', { page: 'One', title: 'First' })).error).toBe(false)
  expect((await call(page, 'move_page', { page: 'Two', target: 'First', place: 'before' })).error).toBe(false)
  const maths = async () => ((await call(page, 'list_pages')).data as { section: string; pages: { title: string }[] }[]).find((s) => s.section === 'Maths')!.pages.map((p) => p.title)
  expect(await maths()).toEqual(['Two', 'First'])
  const pending = call(page, 'delete_page', { page: 'Two' })
  await allow(page)
  expect((await pending).error).toBe(false)
  expect(await maths()).toEqual(['First'])
  expect(errors).toEqual([])
})

test('pdf: annotations are listed and deleted', async ({ page }) => {
  const errors = trackErrors(page)
  await page.addInitScript(ENGLISH)
  await page.addInitScript(ENABLED)
  const path = join(tmpdir(), `webmcp-${Date.now()}.pdf`)
  writeFileSync(path, await makeFixturePdf(false))
  await page.goto(`/${RELAYS}`)
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.home-open').first().click()])
  await chooser.setFiles(path)
  await page.locator('.pdf-page canvas').first().waitFor({ timeout: 60_000 })
  await expect.poll(() => toolNames(page)).toContain('delete_annotation')
  const id = ((await call(page, 'add_highlight', { page: 1, text: 'speed of light' })).data as { id: string }).id
  expect((await call(page, 'list_annotations')).data).toEqual([expect.objectContaining({ id, page: 1, type: 'highlight' })])
  const pending = call(page, 'delete_annotation', { id })
  await expect(page.locator('dialog[open]')).toContainText('Delete the annotation')
  await allow(page)
  expect((await pending).data).toEqual({ deleted: id })
  expect((await call(page, 'list_annotations')).data).toEqual([])
  expect(errors).toEqual([])
})

test('writer and drawing: a batch is one undo step', async ({ page }) => {
  const errors = trackErrors(page)
  await setup(page, 'writer', 'apply_batch')
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('Red green blue.')
  await page.waitForTimeout(2200)
  const batch = await call(page, 'apply_batch', { operations: [{ tool: 'format', args: { match: 'Red', bold: true } }, { tool: 'format', args: { match: 'blue', italic: true } }] })
  expect(batch.data).toMatchObject({ done: 2, of: 2 })
  await expect(editor.locator('strong')).toHaveText('Red')
  await expect(editor.locator('em')).toHaveText('blue')
  expect((await call(page, 'undo')).error).toBe(false)
  await expect(editor.locator('strong, em')).toHaveCount(0)
  await expect(editor).toHaveText('Red green blue.')

  // An unknown tool in a batch is refused before anything changes.
  expect((await call(page, 'apply_batch', { operations: [{ tool: 'format', args: { match: 'Red', bold: true } }, { tool: 'no_such_tool' }] })).error).toBe(true)
  await expect(editor.locator('strong')).toHaveCount(0)

  await setup(page, 'draw', 'apply_batch')
  expect((await call(page, 'apply_batch', { operations: [{ tool: 'add_element', args: { type: 'rectangle' } }, { tool: 'add_element', args: { type: 'ellipse', x: 300 } }] })).data).toMatchObject({ done: 2 })
  expect((await call(page, 'get_scene')).data).toHaveLength(2)
  expect((await call(page, 'undo')).error).toBe(false)
  await expect.poll(async () => (await call(page, 'get_scene')).data).toEqual([])
  expect(errors).toEqual([])
})

test('the proposals panel and the assistant dialogs pass axe in light and dark themes, also at phone width', async ({ browser }) => {
  const axe = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
  const run = (page: Page, selector: string) =>
    page.evaluate(async (selector) => {
      const a = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: { id: string; impact: string; nodes: { target: string[] }[] }[] }> } }).axe
      const result = await a.run({ include: [[selector]] }, { resultTypes: ['violations'] })
      return result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
    }, selector)
  for (const [theme, width] of [['light', 1366], ['dark', 1366], ['light', 390]] as const) {
    const context = await browser.newContext({ viewport: { width, height: 820 } })
    const page = await context.newPage()
    await page.addInitScript((theme) => localStorage.setItem('ofimeo:a11y', JSON.stringify({ theme })), theme)
    await setup(page, 'sheet', 'write_range', REVIEW)
    await page.locator('.persist-notice button').first().click({ timeout: 3000 }).catch(() => {})
    await call(page, 'write_range', { range: 'A1', values: [['x']] })
    const panel = page.locator('.webmcp-proposals')
    await expect(panel).toBeVisible()
    const box = await panel.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    await page.evaluate(axe)
    expect(await run(page, '.webmcp-proposals'), `${theme} ${width}`).toEqual([])
    // A confirmation and a question.
    const asked = call(page, 'ask_user', { question: 'Which tone?', choices: ['A', 'B'] })
    await expect(page.locator('dialog[open]')).toBeVisible()
    expect(await run(page, 'dialog[open]'), `${theme} ${width} question`).toEqual([])
    await page.locator('dialog[open]').getByRole('button', { name: 'Cancel' }).click()
    await asked
    await panel.getByRole('button', { name: 'Reject all' }).click()
    await panel.getByRole('button', { name: 'Close' }).click()
    await page.locator('.webmcp-indicator').click()
    expect(await run(page, 'dialog[open]'), `${theme} ${width} status`).toEqual([])
    await context.close()
  }
})
