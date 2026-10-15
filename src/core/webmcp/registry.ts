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
import { aiCallEnded, aiCallStarted, checkRate, logActivity, MAX_INPUT_CHARS, summarizeArgs } from './activity'
import { afterAiChange, announce, beforeAiChange } from './ai'
import { requestConfirmation } from './confirm'
import { allowedTools, assertAllowed, confirmationOf, summaryOf } from './gate'
import { propose } from './proposals'
import { isReviewMode, isWebMcpEnabled } from './state'
import { isImageResult, type OfimeoTool, type ToolArgs } from './types'

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
  content: ({ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string })[]
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

const text = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value ?? null, null, 1))

export const isReadOnly = (tool: OfimeoTool) => tool.readOnly ?? tool.access === 'view'

function toResult(tool: OfimeoTool, result: unknown): CallResult {
  if (isImageResult(result)) {
    return { content: [{ type: 'image', data: result.data, mimeType: result.mimeType }, ...(result.text ? [{ type: 'text' as const, text: result.text }] : [])] }
  }
  const out: CallResult = { content: [{ type: 'text', text: text(result) }] }
  if (tool.outputSchema && result && typeof result === 'object' && !Array.isArray(result)) out.structuredContent = result as Record<string, unknown>
  return out
}

// Runs the tool's change as the assistant's (version history framing).
async function perform(session: Session, tool: OfimeoTool, args: ToolArgs): Promise<unknown> {
  if (tool.changesDocument) beforeAiChange(session)
  const result = await tool.execute(args)
  if (tool.changesDocument) afterAiChange(session)
  return result
}

// In review mode, changes wait for the user (except writer suggestions, which
// are reviewed as suggestions anyway).
const proposes = (session: Session, tool: OfimeoTool) => isReviewMode() && !!tool.changesDocument && !tool.suggestion && session.canEdit

// A proposal the user accepted.
async function runAccepted(session: Session, tool: OfimeoTool, args: ToolArgs): Promise<unknown> {
  let ok = false
  aiCallStarted()
  try {
    const result = await perform(session, tool, args)
    ok = true
    return result
  } finally {
    aiCallEnded(ok)
    logActivity({ time: Date.now(), tool: tool.name, args: summarizeArgs(args), ok, write: true, note: ok ? 'accepted' : 'failed' })
    announce({ tool: tool.name, write: true, ok })
  }
}

// The tool as registered: gate, limits, review mode, confirmation,
// attribution and result format around the app's execute().
function wrap(session: Session, tool: OfimeoTool) {
  const readOnly = isReadOnly(tool)
  return async (input: unknown): Promise<CallResult> => {
    let ok = false
    let changed = false
    let note: string | undefined
    let args: ToolArgs = {}
    aiCallStarted()
    try {
      assertAllowed(session, tool, isWebMcpEnabled)
      if (tool.available && !tool.available()) throw new Error(`${tool.name} is not available right now`)
      const raw = typeof input === 'string' ? input : (JSON.stringify(input ?? {}) ?? '')
      if (raw.length > MAX_INPUT_CHARS) throw new Error(`The arguments are too large (more than ${MAX_INPUT_CHARS} characters); split the work into several calls`)
      args = (typeof input === 'string' ? JSON.parse(input || '{}') : (input ?? {})) as ToolArgs
      if (!readOnly) checkRate()
      if (proposes(session, tool)) {
        const callArgs = args
        const proposal = propose(session, tool.name, summaryOf(tool, args), args, () => runAccepted(session, tool, callArgs))
        note = 'proposed'
        ok = true
        return toResult(
          { ...tool, outputSchema: undefined },
          { status: 'proposed', proposal: proposal.id, message: 'Review mode is on: the user accepts or rejects this change. list_proposals tells the outcome.' },
        )
      }
      const question = confirmationOf(tool, args)
      if (question && !(await requestConfirmation(question))) {
        note = 'declined'
        throw new Error('The user did not allow this change.')
      }
      const result = await perform(session, tool, args)
      changed = !!tool.changesDocument
      ok = true
      return toResult(tool, result)
    } catch (err) {
      const message = (err as Error)?.message ?? String(err)
      note ??= message
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
    } finally {
      aiCallEnded(changed)
      logActivity({ time: Date.now(), tool: tool.name, args: summarizeArgs(args), ok, write: !readOnly, ...(note ? { note } : {}) })
      announce({ tool: tool.name, write: !readOnly, ok })
    }
  }
}

// 'get_text' → 'Get text'.
const titleOf = (name: string) => name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' ')

export class ToolRegistration {
  private controller: AbortController | null = null
  names: string[] = []

  constructor(private readonly session: Session) {}

  // Replaces the registered tools with the allowed ones of `all` (registered together).
  async register(all: OfimeoTool[]): Promise<string[]> {
    this.unregister()
    const controller = new AbortController()
    this.controller = controller
    const ctx = await modelContext()
    if (controller.signal.aborted) return []
    const seen = new Set<string>()
    const tools = allowedTools(this.session, all).filter((tool) => (tool.available?.() ?? true) && !seen.has(tool.name) && !!seen.add(tool.name))
    const results = await Promise.allSettled(
      tools.map(async (tool) =>
        ctx.registerTool(
          {
            name: tool.name,
            title: tool.title ?? titleOf(tool.name),
            description: tool.description,
            inputSchema: tool.inputSchema as never,
            ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
            annotations: { readOnlyHint: isReadOnly(tool), untrustedContentHint: tool.untrusted ?? isReadOnly(tool) },
            execute: wrap(this.session, tool),
          },
          { signal: controller.signal },
        ),
      ),
    )
    if (controller.signal.aborted) return []
    const names: string[] = []
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') names.push(tools[i].name)
      else console.warn(`WebMCP: could not register ${tools[i].name}`, r.reason)
    })
    this.names = names
    return names
  }

  unregister(): void {
    this.controller?.abort()
    this.controller = null
    this.names = []
  }
}
