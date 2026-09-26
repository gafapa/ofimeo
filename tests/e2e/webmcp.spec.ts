import { expect, test, type Page } from '@playwright/test'
import { openApp, trackErrors } from './helpers'

// WebMCP: tools are called through navigator.modelContextTesting, the testing
// hook of the @mcp-b/global polyfill (loaded because headless Chromium has no
// native WebMCP).

const ENGLISH = () => localStorage.setItem('words-online:language', 'en')
const ENABLED = () => localStorage.setItem('words-online:webmcp', '1')

type Tools = { listTools(): { name: string }[]; executeTool(name: string, args: string): Promise<string | null> }

async function toolNames(page: Page): Promise<string[]> {
  return page.evaluate(() => ((navigator as unknown as { modelContextTesting?: Tools }).modelContextTesting?.listTools() ?? []).map((t) => t.name).sort())
}

async function waitForTool(page: Page, name: string): Promise<void> {
  await page.waitForFunction((n) => ((navigator as unknown as { modelContextTesting?: Tools }).modelContextTesting?.listTools() ?? []).some((t) => t.name === n), name, { timeout: 30_000 })
}

// Calls a tool; returns the parsed JSON of its text result (or the text).
async function call(page: Page, name: string, args: Record<string, unknown> = {}): Promise<{ error: boolean; data: unknown }> {
  const raw = await page.evaluate(([n, a]) => (navigator as unknown as { modelContextTesting: Tools }).modelContextTesting.executeTool(n, JSON.stringify(a)), [name, args] as const)
  const result = JSON.parse(raw ?? 'null') as { content: { text: string }[]; isError?: boolean }
  const text = result.content[0]?.text ?? ''
  let data: unknown = text
  try {
    data = JSON.parse(text)
  } catch {
    // Plain text result.
  }
  return { error: !!result.isError, data }
}

async function menu(page: Page, name: string, item: string) {
  await page.locator('#menubar').getByText(name, { exact: true }).click()
  await page.getByText(item, { exact: true }).last().click()
}

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
  await waitForTool(page, 'format')
  expect(await toolNames(page)).toEqual(
    ['add_comment', 'apply_heading', 'find', 'format', 'get_document_info', 'get_outline', 'get_text', 'insert_text', 'list_comments', 'replace_range'].sort(),
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
  await waitForTool(page, 'add_comment')
  expect(await toolNames(page)).toEqual(['add_comment', 'add_sheet', 'get_document_info', 'insert_chart', 'list_comments', 'list_sheets', 'read_range', 'write_range'])

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
  await openApp(owner, 'writer')
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
  await waitForTool(reader, 'get_text')
  expect(await toolNames(reader)).toEqual(['find', 'get_document_info', 'get_outline', 'get_text', 'list_comments'])
  expect((await call(reader, 'get_document_info')).data).toMatchObject({ access: 'view', allowed: ['read'] })
  await expect.poll(async () => (await call(reader, 'get_text')).data, { timeout: 60_000 }).toBe('Read me')
  expect(errors).toEqual([])
})
