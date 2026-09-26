// WebMCP: lets an AI assistant in this browser (an extension or the browser's
// own agent implementing the WebMCP draft) use the open document through a
// small set of tools. Off by default; turned on per browser (Tools ▸ Allow AI
// assistants (WebMCP), src/ui/webmcp.ts). See docs/webmcp.md.
//
// This module is tiny and eagerly imported by apps; the runtime (registry.ts,
// polyfill) and the app tool modules load only while the switch is on.
//
//   provideWebMcpTools(session, () => import('./webmcp').then((m) => m.writerTools(ctx)))
//
// Tools are offered according to session.access (gate.ts): view → read tools,
// comment → + comments, edit → + changes. Changes are recorded as the AI
// assistant's (ai.ts).

import type { Session } from '../session'
import { isWebMcpEnabled, onWebMcpChange } from './state'
import type { ToolProvider } from './types'
import type { ToolRegistration } from './registry'

export { isWebMcpEnabled, setWebMcpEnabled, onWebMcpChange } from './state'
export type { AppTools, OfimeoTool, ToolProvider } from './types'

interface Entry {
  providers: ToolProvider[]
  registration: ToolRegistration | null
  names: string[]
  queued: boolean
  listeners: Set<(names: string[]) => void>
}

const entries = new WeakMap<Session, Entry>()

function entry(session: Session): Entry {
  let e = entries.get(session)
  if (!e) {
    const created: Entry = { providers: [], registration: null, names: [], queued: false, listeners: new Set() }
    entries.set(session, created)
    onWebMcpChange(() => schedule(session, created))
    e = created
  }
  return e
}

// Registers (or removes) the tools after the switch or the providers changed.
function schedule(session: Session, e: Entry): void {
  if (e.queued) return
  e.queued = true
  queueMicrotask(() => {
    e.queued = false
    void refresh(session, e)
  })
}

async function refresh(session: Session, e: Entry): Promise<void> {
  if (!isWebMcpEnabled()) {
    e.registration?.unregister()
    setNames(e, [])
    return
  }
  try {
    const [{ ToolRegistration }, { commonTools }] = await Promise.all([import('./registry'), import('./common')])
    const apps = await Promise.all(e.providers.map((p) => p()))
    if (!isWebMcpEnabled()) return
    e.registration ??= new ToolRegistration(session)
    const names = await e.registration.register([...commonTools(session, apps), ...apps.flatMap((a) => a.tools)])
    setNames(e, names)
  } catch (err) {
    console.warn('WebMCP: tools could not be registered', err)
    setNames(e, [])
  }
}

function setNames(e: Entry, names: string[]): void {
  e.names = names
  e.listeners.forEach((fn) => fn(names))
}

// Adds an app's tools to the session (registered now if the switch is on).
export function provideWebMcpTools(session: Session, provider: ToolProvider): void {
  const e = entry(session)
  e.providers.push(provider)
  schedule(session, e)
}

// Starts following the switch for a session without app tools (only get_document_info).
export function startWebMcp(session: Session): void {
  schedule(session, entry(session))
}

// Names of the tools currently registered for the session, and their changes.
export function webMcpToolNames(session: Session): string[] {
  return entries.get(session)?.names ?? []
}

export function onWebMcpTools(session: Session, fn: (names: string[]) => void): void {
  entry(session).listeners.add(fn)
}
