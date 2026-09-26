// WebMCP runtime (loaded only when the switch is on): finds the page's model
// context and registers the allowed tools on it.
//
// The WebMCP draft exposes `document.modelContext` (earlier drafts:
// `navigator.modelContext`) with `registerTool(tool, { signal })`. When the
// browser has no native implementation, the MIT-licensed @mcp-b/global
// polyfill is loaded; its transport only accepts clients of this page's own
// origin (browser extensions talk to it through the page) and never the
// parent page of an iframe. It also installs navigator.modelContextTesting,
// which the end-to-end tests use to call the tools.

import type { ModelContext } from '@mcp-b/webmcp-types'
import type { Session } from '../session'
import { afterAiChange, announce, beforeAiChange } from './ai'
import { allowedTools, assertAllowed } from './gate'
import { isWebMcpEnabled } from './state'
import type { OfimeoTool, ToolArgs } from './types'

let contextPromise: Promise<ModelContext> | null = null

export function modelContext(): Promise<ModelContext> {
  contextPromise ??= (async () => {
    const native = document.modelContext ?? navigator.modelContext
    if (native) return native
    window.__webModelContextOptions = { autoInitialize: false }
    const { initializeWebModelContext } = await import('@mcp-b/global')
    initializeWebModelContext({ transport: { tabServer: { allowedOrigins: [location.origin] }, iframeServer: false } })
    const ctx = document.modelContext ?? navigator.modelContext
    if (!ctx) throw new Error('WebMCP is not available in this browser')
    return ctx
  })()
  contextPromise.catch(() => (contextPromise = null))
  return contextPromise
}

interface CallResult {
  content: { type: 'text'; text: string }[]
  isError?: boolean
}

const text = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value ?? null, null, 1))

// The tool as registered: gate, attribution and result format around the app's execute().
function wrap(session: Session, tool: OfimeoTool) {
  const readOnly = tool.readOnly ?? tool.access === 'view'
  return async (input: unknown): Promise<CallResult> => {
    let ok = false
    try {
      assertAllowed(session, tool, isWebMcpEnabled)
      const args = (typeof input === 'string' ? JSON.parse(input || '{}') : (input ?? {})) as ToolArgs
      if (tool.changesDocument) beforeAiChange(session)
      const result = await tool.execute(args)
      if (tool.changesDocument) afterAiChange(session)
      ok = true
      return { content: [{ type: 'text', text: text(result) }] }
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${(err as Error)?.message ?? String(err)}` }], isError: true }
    } finally {
      announce({ tool: tool.name, write: !readOnly, ok })
    }
  }
}

export class ToolRegistration {
  private controller: AbortController | null = null
  names: string[] = []

  constructor(private readonly session: Session) {}

  // Replaces the registered tools with the allowed ones of `tools`.
  async register(tools: OfimeoTool[]): Promise<string[]> {
    this.unregister()
    const controller = new AbortController()
    this.controller = controller
    const ctx = await modelContext()
    if (controller.signal.aborted) return []
    const names: string[] = []
    const seen = new Set<string>()
    for (const tool of allowedTools(this.session, tools)) {
      if (seen.has(tool.name)) continue
      seen.add(tool.name)
      const readOnly = tool.readOnly ?? tool.access === 'view'
      try {
        await ctx.registerTool(
          {
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema as never,
            annotations: { readOnlyHint: readOnly },
            execute: wrap(this.session, tool),
          },
          { signal: controller.signal },
        )
        names.push(tool.name)
      } catch (err) {
        console.warn(`WebMCP: could not register ${tool.name}`, err)
      }
      if (controller.signal.aborted) return []
    }
    this.names = names
    return names
  }

  unregister(): void {
    this.controller?.abort()
    this.controller = null
    this.names = []
  }
}
