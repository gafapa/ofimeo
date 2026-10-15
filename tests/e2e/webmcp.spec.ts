import { expect, test } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import { APP_READY, openApp, RELAYS, trackErrors, uniqueDoc } from './helpers'
import { call, COMMON_EDIT, COMMON_VIEW, ENABLED, ENGLISH, menu, SEE, sorted, toolNames } from './webmcp-helpers'

test('writer: turned on from Tools, the assistant reads the text and its changes become suggestions', async ({ page }) => {
  const errors = trackErrors(page)
  await page.addInitScript(ENGLISH)
  await openApp(page, 'writer')
  await page.locator('.ProseMirror').click()
  await page.keyboard.type('The quick brown fox.')

  // Off by default: no indicator and no tools.
  await expect(page.locator('.webmcp-indicator')).toBeHidden()
  expect(await page.evaluate(() => 'modelContextTesting' in navigator)).toBe(false)

  await menu(page, 'Tools', 'Allow AI assistants (WebMCP)…')
  const dialog = page.locator('dialog[open]')
  await expect(dialog).toContainText('never gets your share links')
  await dialog.getByRole('button', { name: 'Allow', exact: true }).click()
  await expect(page.locator('.webmcp-indicator')).toBeVisible()
  await expect.poll(() => toolNames(page)).toEqual(
    sorted(COMMON_EDIT, SEE, ['add_comment', 'add_function_graph', 'add_reference', 'apply_heading', 'cite', 'delete_text', 'find', 'format', 'get_stats', 'insert_bibliography', 'insert_chart', 'insert_equation', 'insert_link', 'insert_markdown', 'insert_table', 'list_references', 'list_suggestions', 'resolve_comment', 'set_alt_text', 'withdraw_suggestion', 'get_outline', 'get_text', 'insert_text', 'list_comments', 'replace_range', 'show']),
  )

  const info = await call(page, 'get_document_info')
  expect(info.data).toMatchObject({ app: 'writer', access: 'edit', allowed: ['read', 'comment', 'edit'] })
  expect(JSON.stringify(info.data)).not.toMatch(/key=|edit=|#app=/)
  expect((await call(page, 'get_text')).data).toBe('The quick brown fox.')
  expect(((await call(page, 'find', { query: 'brown' })).data as { count: number }).count).toBe(1)

  // Text changes are tracked suggestions by the AI assistant.
  expect((await call(page, 'insert_text', { text: 'Added by the assistant.', position: 'end' })).error).toBe(false)
  expect((await call(page, 'replace_range', { match: 'quick', replacement: 'slow' })).error).toBe(false)
  const editor = page.locator('.ProseMirror')
  await expect(editor.locator('ins[data-suggestion]', { hasText: 'Added by the assistant.' })).toHaveAttribute('title', /AI assistant/)
  await expect(editor.locator('del[data-suggestion]')).toHaveText('quick')
  await expect(editor.locator('ins[data-suggestion]', { hasText: 'slow' })).toBeVisible()
  expect((await call(page, 'get_text')).data).toBe('The {--quick--}{++slow++} brown fox.\n\n{++Added by the assistant.++}')
  await expect(page.locator('.review-rail')).toContainText('AI assistant')

  // Comments, headings and formatting.
  expect((await call(page, 'add_comment', { match: 'brown', text: 'Nice colour' })).error).toBe(false)
  const comments = (await call(page, 'list_comments')).data as { text: string; author: string; on_text: string }[]
  expect(comments).toEqual([expect.objectContaining({ text: 'Nice colour', on_text: 'brown', author: expect.stringContaining('AI assistant') })])
  expect((await call(page, 'format', { match: 'fox', bold: true })).error).toBe(false)
  await expect(editor.locator('strong', { hasText: 'fox' })).toBeVisible()
  expect((await call(page, 'apply_heading', { match: 'Added by', level: 2 })).error).toBe(false)
  await expect(editor.locator('h2')).toContainText('Added by the assistant.')
  expect((await call(page, 'get_outline')).data).toEqual([expect.objectContaining({ level: 2, text: 'Added by the assistant.' })])
  // Errors are reported to the assistant, not thrown.
  expect((await call(page, 'replace_range', { match: 'no such text', replacement: 'x' })).error).toBe(true)

  // The version history frames the assistant's changes.
  await menu(page, 'File', 'Version history…')
  await expect(page.locator('dialog[open]')).toContainText('Before changes by the AI assistant')
  await page.keyboard.press('Escape')

  // Turning it off removes the tools.
  await page.locator('.webmcp-indicator').click()
  await page.locator('dialog[open]').getByRole('button', { name: 'Turn off' }).click()
  await expect(page.locator('.webmcp-indicator')).toBeHidden()
  await expect.poll(() => toolNames(page)).toEqual([])
  expect(errors).toEqual([])
})

test('sheet: the assistant reads and writes ranges, adds sheets and charts', async ({ page }) => {
  const errors = trackErrors(page)
  await page.addInitScript(ENGLISH)
  await page.addInitScript(ENABLED)
  await openApp(page, 'sheet')
  await expect.poll(() => toolNames(page)).toEqual(sorted(COMMON_EDIT, SEE, ['add_comment', 'add_conditional_format', 'add_sheet', 'clear_range', 'create_pivot', 'find', 'format_range', 'freeze', 'sort_range', 'delete_columns', 'delete_rows', 'delete_sheet', 'duplicate_sheet', 'insert_chart', 'insert_columns', 'insert_rows', 'list_comments', 'describe_range', 'list_formula_errors', 'list_sheets', 'read_range', 'rename_sheet', 'show', 'write_range']))

  const written = await call(page, 'write_range', { range: 'A1', values: [['Month', 'Sales'], ['Jan', 10], ['Feb', 20], ['Total', '=SUM(B2:B3)']] })
  expect(written.data).toMatchObject({ written: 'A1:B4' })
  await expect
    .poll(async () => ((await call(page, 'read_range', { range: 'A1:B4' })).data as { display: string[][] }).display)
    .toEqual([['Month', 'Sales'], ['Jan', '10'], ['Feb', '20'], ['Total', '30']])
  expect(((await call(page, 'read_range', { range: 'B4' })).data as { formulas: string[][] }).formulas).toEqual([['=SUM(B2:B3)']])

  const chart = await call(page, 'insert_chart', { range: 'A1:B3', type: 'line', title: 'Sales by month' })
  expect(chart.error).toBe(false)
  await expect(page.locator('.ofimeo-chart')).toHaveAttribute('aria-label', 'Sales by month')
  expect((await call(page, 'add_comment', { cell: 'B4', text: 'Check the total' })).error).toBe(false)
  expect((await call(page, 'list_comments')).data).toEqual([expect.objectContaining({ cell: 'B4', text: expect.stringContaining('Check the total') })])

  expect((await call(page, 'add_sheet', { name: 'Plan' })).data).toEqual({ name: 'Plan' })
  const sheets = (await call(page, 'list_sheets')).data as { name: string; active: boolean }[]
  expect(sheets.map((s) => [s.name, s.active])).toEqual([
    ['Sheet1', false],
    ['Plan', true],
  ])
  expect(errors).toEqual([])
})

test('a view link only gets read tools', async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage()
  await owner.addInitScript(ENGLISH)
  // A protected document (permission keys in the link: key and edit seed).
  const b64 = (n: number) => randomBytes(n).toString('base64url')
  await owner.goto(`/${RELAYS}#app=writer&doc=${uniqueDoc('webmcp-view')}&key=${b64(18)}&edit=${b64(32)}`)
  await owner.locator(APP_READY.writer).waitFor({ timeout: 60_000 })
  await owner.locator('.ProseMirror').click()
  await owner.keyboard.type('Read me')
  await owner.locator('#btn-share').click()
  await owner.locator('dialog[open] .share-tab[data-value=view]').click()
  const link = await owner.locator('dialog[open] input.field.mono').inputValue()
  expect(link).not.toContain('edit=')
  await owner.keyboard.press('Escape')

  const reader = await (await browser.newContext()).newPage()
  const errors = trackErrors(reader)
  await reader.addInitScript(ENGLISH)
  await reader.addInitScript(ENABLED)
  await reader.goto(link)
  await reader.locator('.ProseMirror').waitFor({ timeout: 60_000 })
  await expect(reader.locator('.webmcp-indicator')).toBeVisible()
  await expect.poll(() => toolNames(reader)).toEqual(sorted(COMMON_VIEW, SEE, ['find', 'get_outline', 'get_stats', 'get_text', 'list_comments', 'list_references', 'list_suggestions', 'show']))
  expect((await call(reader, 'get_document_info')).data).toMatchObject({ access: 'view', allowed: ['read'] })
  await expect.poll(async () => (await call(reader, 'get_text')).data, { timeout: 60_000 }).toBe('Read me')
  expect(errors).toEqual([])
})
