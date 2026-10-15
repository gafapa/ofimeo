import type { Page } from '@playwright/test'

// WebMCP: tools are listed and called through document.modelContext
// (getTools / executeTool), installed by the @mcp-b/global polyfill because
// headless Chromium has no native WebMCP.

export const ENGLISH = () => localStorage.setItem('ofimeo:language', 'en')
export const ENABLED = () => localStorage.setItem('ofimeo:webmcp', '1')

// Tools every app offers (by access).
export const COMMON_VIEW = ['ask_user', 'create_document', 'create_from_template', 'get_assignments', 'get_document_info', 'get_selection', 'list_templates', 'list_versions', 'notify']
// In apps that can show, compare and check their content.
export const SEE = ['check_accessibility', 'diff_versions', 'get_changes_since', 'get_spelling_issues', 'render']
export const COMMON_COMMENT = [...COMMON_VIEW, 'list_participants']
export const COMMON_EDIT = [...COMMON_COMMENT, 'apply_batch', 'list_proposals', 'redo', 'revert_ai_changes', 'undo']

type Context = { getTools(): Promise<{ name: string }[]>; executeTool(tool: { name: string }, input: object): Promise<string> }

export async function toolNames(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const ctx = (document as unknown as { modelContext?: Context }).modelContext
    return ctx ? (await ctx.getTools()).map((t) => t.name).sort() : []
  })
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
  const raw = await page.evaluate(
    async ([n, a]) => {
      const ctx = (document as unknown as { modelContext: Context }).modelContext
      const tool = (await ctx.getTools()).find((t) => t.name === n)
      if (!tool) throw new Error(`No tool ${n}`)
      return ctx.executeTool(tool, a)
    },
    [name, args] as const,
  )
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
