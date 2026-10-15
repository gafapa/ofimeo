import { expect, test, type Page } from '@playwright/test'
import { openApp, trackErrors } from './helpers'
import { call, ENABLED, ENGLISH, toolNames } from './webmcp-helpers'

// The remaining per-app tools: writer tables, links, charts, comments,
// suggestions and statistics; sheet formats, sorting, freezing, conditional
// formats, pivots and search; slide layouts, notes, text boxes, charts,
// transitions, animations and themes; diagram styles.

async function setup(page: Page, app: string, tool: string) {
  await page.addInitScript(ENGLISH)
  await page.addInitScript(ENABLED)
  await openApp(page, app)
  await expect.poll(() => toolNames(page)).toContain(tool)
}
const ok = (r: { error: boolean; data: unknown }) => expect(r.error, JSON.stringify(r.data)).toBe(false)

test('writer: tables, links, charts, comments, own suggestions and statistics', async ({ page }) => {
  const errors = trackErrors(page)
  await setup(page, 'writer', 'insert_table')
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('The cat sat on the mat. It was a sunny day. Everyone was happy and the garden looked green.')
  ok(await call(page, 'insert_table', { rows: [['Animal', 'Legs'], ['Cat', 4], ['Bird', 2]] }))
  await expect(editor.locator('table th')).toHaveCount(2)
  await expect(editor.locator('table ins[data-suggestion]').first()).toBeVisible()
  ok(await call(page, 'insert_link', { match: 'garden', url: 'https://example.org/garden' }))
  await expect(editor.locator('a[href="https://example.org/garden"]')).toHaveText('garden')
  expect((await call(page, 'insert_link', { match: 'cat', url: 'javascript:alert(1)' })).error).toBe(true)
  ok(await call(page, 'insert_chart', { type: 'column', title: 'Legs', labels: ['Cat', 'Bird'], series: [{ name: 'Legs', values: [4, 2] }] }))
  await expect(editor.locator('.chart-box')).toHaveCount(1)

  const comment = (await call(page, 'add_comment', { match: 'sunny', text: 'Nice' })).data as { id: string }
  ok(await call(page, 'resolve_comment', { id: comment.id }))
  expect((await call(page, 'list_comments')).data).toEqual([])

  const suggestions = (await call(page, 'list_suggestions')).data as { id: string; mine: boolean }[]
  expect(suggestions.length).toBeGreaterThan(0)
  expect(suggestions.every((x) => x.mine)).toBe(true)
  for (const x of suggestions) ok(await call(page, 'withdraw_suggestion', { id: x.id }))
  await expect(editor.locator('table')).toHaveCount(0)
  expect((await call(page, 'withdraw_suggestion', { id: 'nope' })).error).toBe(true)

  const stats = (await call(page, 'get_stats')).data as { words: number; sentences: number; readability: { index: string; score: number } }
  expect(stats.sentences).toBe(3)
  expect(stats.words).toBe(19)
  expect(stats.readability.index).toBe('Flesch reading ease')
  expect(stats.readability.score).toBeGreaterThan(60)
  expect(errors).toEqual([])
})

test('sheet: formats, sorting, freezing, conditional formats, pivots and search', async ({ page }) => {
  const errors = trackErrors(page)
  await setup(page, 'sheet', 'format_range')
  ok(await call(page, 'write_range', { range: 'A1', values: [['Team', 'Score', 'Share'], ['Blue', 30, 0.25], ['Red', 10, 0.5], ['Blue', 20, 0.25]] }))
  ok(await call(page, 'format_range', { range: 'C2:C4', number_format: '0%', bold: true, background: '#fff2cc' }))
  await expect.poll(async () => ((await call(page, 'read_range', { range: 'C2:C4' })).data as { display: string[][] }).display).toEqual([['25%'], ['50%'], ['25%']])
  ok(await call(page, 'sort_range', { range: 'A1:C4', column: 'B', has_header: true }))
  await expect.poll(async () => ((await call(page, 'read_range', { range: 'A1:B4' })).data as { display: string[][] }).display).toEqual([['Team', 'Score'], ['Red', '10'], ['Blue', '20'], ['Blue', '30']])
  ok(await call(page, 'freeze', { rows: 1 }))
  ok(await call(page, 'add_conditional_format', { range: 'B2:B4', when: 'greater_than', value: 15, background: '#f4cccc' }))
  const found = (await call(page, 'find', { query: 'red' })).data as { cells: { cell: string }[] }
  expect(found.cells.map((c) => c.cell)).toEqual(['A2'])
  const pivot = (await call(page, 'create_pivot', { source: 'A1:C4', rows: 'Team', values: 'Score', agg: 'SUM' })).data as { sheet: string }
  await expect.poll(async () => ((await call(page, 'read_range', { sheet: pivot.sheet, range: 'A1:B4' })).data as { display: string[][] }).display.flat().join(' ')).toMatch(/Blue.*50.*Red.*10/)
  expect((await call(page, 'create_pivot', { source: 'A1:C4', rows: 'Nope', values: 'Score' })).error).toBe(true)
  expect(errors).toEqual([])
})

test('slides: layouts, notes, text boxes, charts, transitions, animations and themes', async ({ page }) => {
  const errors = trackErrors(page)
  await setup(page, 'slides', 'set_layout')
  ok(await call(page, 'add_slide', { title: 'Plan' }))
  ok(await call(page, 'set_layout', { slide: 2, layout: 'twoColumns' }))
  expect(((await call(page, 'list_slides')).data as { layout: string }[])[1].layout).toBe('twoColumns')
  ok(await call(page, 'set_notes', { slide: 2, notes: 'Speak slowly' }))
  const box = (await call(page, 'add_text_box', { slide: 2, text: 'Footnote', font_size: 14 })).data as { id: string }
  ok(await call(page, 'insert_chart', { slide: 2, type: 'pie', title: 'Votes', labels: ['Yes', 'No'], series: [{ name: 'Votes', values: [7, 3] }] }))
  ok(await call(page, 'set_transition', { slide: 2, type: 'fade', duration: 800 }))
  ok(await call(page, 'add_animation', { slide: 2, id: box.id, kind: 'entrance', effect: 'fly', direction: 'left' }))
  expect((await call(page, 'add_animation', { slide: 2, id: box.id, kind: 'emphasis', effect: 'fly' })).error).toBe(true)
  ok(await call(page, 'apply_theme', { theme: 'ocean' }))
  const slide = (await call(page, 'get_slide', { slide: 2 })).data as { notes: string; objects: { id: string; text?: string; label?: string }[] }
  expect(slide.notes).toBe('Speak slowly')
  expect(slide.objects.map((o) => o.id)).toContain(box.id)
  expect(slide.objects.length).toBeGreaterThanOrEqual(4)
  expect(errors).toEqual([])
})

test('diagram: styles', async ({ page }) => {
  const errors = trackErrors(page)
  await setup(page, 'diagram', 'set_style')
  const a = ((await call(page, 'add_shape', { label: 'A' })).data as { id: string }).id
  ok(await call(page, 'set_style', { ids: [a], fill: '#ff0000', bold: true, dashed: true }))
  const xml = ((await call(page, 'get_diagram', { format: 'xml' })).data as { xml: string }).xml
  expect(xml).toMatch(/fillColor=#ff0000/)
  expect(xml).toMatch(/dashed=1/)
  expect(xml).toMatch(/fontStyle=1/)
  expect(errors).toEqual([])
})
