import type { Page } from '@playwright/test'

// WebMCP: tools are called through navigator.modelContextTesting, the testing
// hook of the @mcp-b/global polyfill (loaded because headless Chromium has no
// native WebMCP).

export const ENGLISH = () => localStorage.setItem('ofimeo:language', 'en')
export const ENABLED = () => localStorage.setItem('ofimeo:webmcp', '1')

// Tools every app offers (by access).
export const COMMON_VIEW = ['ask_user', 'get_document_info', 'get_selection', 'notify']
export const COMMON_COMMENT = [...COMMON_VIEW, 'list_participants']
export const COMMON_EDIT = [...COMMON_COMMENT, 'redo', 'revert_ai_changes', 'undo']

type Tools = { listTools(): { name: string }[]; executeTool(name: string, args: string): Promise<string | null> }

export async function toolNames(page: Page): Promise<string[]> {
  return page.evaluate(() => ((navigator as unknown as { modelContextTesting?: Tools }).modelContextTesting?.listTools() ?? []).map((t) => t.name).sort())
}

export const sorted = (...lists: string[][]) => [...new Set(lists.flat())].sort()

export interface CallResult {
  error: boolean
  data: unknown
  // Raw MCP content items (images included).
  content: { type: string; text?: string; data?: string; mimeType?: string }[]
}

// Calls a tool; returns the parsed JSON of its text result (or the text).
export async function call(page: Page, name: string, args: Record<string, unknown> = {}): Promise<CallResult> {
  const raw = await page.evaluate(([n, a]) => (navigator as unknown as { modelContextTesting: Tools }).modelContextTesting.executeTool(n, JSON.stringify(a)), [name, args] as const)
  const result = JSON.parse(raw ?? 'null') as { content: CallResult['content']; isError?: boolean }
  const text = result.content.find((c) => c.type === 'text')?.text ?? ''
  let data: unknown = text
  try {
    data = JSON.parse(text)
  } catch {
    // Plain text result.
  }
  return { error: !!result.isError, data, content: result.content }
}

export async function menu(page: Page, name: string, item: string) {
  await page.locator('#menubar').getByText(name, { exact: true }).click()
  await page.getByText(item, { exact: true }).last().click()
}
