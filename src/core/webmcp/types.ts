// Tool definitions shared by the WebMCP core and the app tool modules
// (src/apps/<app>/webmcp.ts). Apps describe their tools with these types; the
// core (registry.ts) turns them into WebMCP registrations after the permission
// gate (gate.ts) has filtered them for this browser's access.

import type { Access } from '../keys'

// JSON Schema of a tool's input (always an object).
export interface JsonSchema {
  type: 'object'
  properties: Record<string, unknown>
  required?: string[]
  additionalProperties?: boolean
}

export type ToolArgs = Record<string, unknown>

export interface OfimeoTool {
  // snake_case, unique within the page (e.g. 'get_text').
  name: string
  // Short human-readable name (default: derived from name).
  title?: string
  // What the tool does, for the assistant (English; not translated).
  description: string
  inputSchema: JsonSchema
  // Least access the link must grant for the tool to be offered:
  // 'view' = read tools, 'comment' = comments, 'edit' = changes to the document.
  access: Access
  // True when the tool changes nothing (default: access === 'view').
  readOnly?: boolean
  // True when the tool changes the document itself (not only comments):
  // the core then records the change as the AI assistant's in the version history.
  changesDocument?: boolean
  // True when the result carries text written by people (the document, its
  // comments): the assistant is told not to follow instructions found in it.
  // Default: true for tools that change nothing.
  untrusted?: boolean
  // Deletes or overwrites content: the user confirms every call (confirm.ts).
  destructive?: boolean
  // Asks the user to confirm this call when it returns a text (e.g. large changes).
  confirm?: (args: ToolArgs) => string | null
  // Offered only while this returns true (re-checked when AppTools.watch fires).
  available?: () => boolean
  // JSON Schema of an object result (structured content for the assistant).
  outputSchema?: Record<string, unknown>
  // Returns JSON-serialisable data, a string or an image (imageResult); throw
  // an Error to report a failure.
  execute: (args: ToolArgs) => unknown | Promise<unknown>
}

// A picture result (render): base64 data plus an optional caption.
export interface ImageResult {
  kind: 'image'
  data: string
  mimeType: string
  text?: string
}

export const isImageResult = (value: unknown): value is ImageResult =>
  !!value && typeof value === 'object' && (value as ImageResult).kind === 'image' && typeof (value as ImageResult).data === 'string'

export async function imageResult(image: Blob | string, text?: string): Promise<ImageResult> {
  if (typeof image === 'string') {
    const m = /^data:([^;,]+);base64,(.*)$/.exec(image)
    if (!m) throw new Error('Not a base64 data URL')
    return { kind: 'image', data: m[2], mimeType: m[1], ...(text ? { text } : {}) }
  }
  const bytes = new Uint8Array(await image.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return { kind: 'image', data: btoa(binary), mimeType: image.type || 'image/png', ...(text ? { text } : {}) }
}

// What the selection tool returns (app-specific fields).
export type SelectionInfo = Record<string, unknown> & { kind: string }

// What an app offers: its tools and extra facts for get_document_info
// (counts, current page…). Never keys, share links or other documents.
export interface AppTools {
  tools: OfimeoTool[]
  info?: () => Record<string, unknown> | Promise<Record<string, unknown>>
  // What the user has selected (get_selection).
  selection?: () => SelectionInfo | Promise<SelectionInfo>
  // Shows a place of the document (show): its arguments are described by showSchema.
  show?: (args: ToolArgs) => unknown | Promise<unknown>
  showSchema?: JsonSchema['properties']
  // Undo/redo of the app (default: the Edit menu actions given to the frame).
  undo?: () => void
  redo?: () => void
  // Calls fn whenever the set of tools offered may change (e.g. a slide show
  // starts). Tools hide themselves with `available`.
  watch?: (fn: () => void) => void
}


// Built lazily: the app's tool module is only loaded when WebMCP is on.
export type ToolProvider = () => AppTools | Promise<AppTools>

// Small helpers for tool modules.

export function str(args: ToolArgs, key: string, fallback?: string): string {
  const v = args[key]
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  if (fallback !== undefined) return fallback
  throw new Error(`Missing string argument "${key}"`)
}

export function optStr(args: ToolArgs, key: string): string | undefined {
  const v = args[key]
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined
}

export function num(args: ToolArgs, key: string, fallback?: number): number {
  const v = typeof args[key] === 'string' ? Number(args[key]) : args[key]
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (fallback !== undefined) return fallback
  throw new Error(`Missing number argument "${key}"`)
}

export function optNum(args: ToolArgs, key: string): number | undefined {
  const v = typeof args[key] === 'string' && args[key] !== '' ? Number(args[key]) : args[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

export function bool(args: ToolArgs, key: string, fallback = false): boolean {
  const v = args[key]
  return typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : fallback
}

// Plain text of an HTML fragment (labels of diagram cells and slide text boxes).
export function htmlToText(html: string): string {
  if (!/[<&]/.test(html)) return html
  const doc = new DOMParser().parseFromString(`<body>${html.replace(/<br\s*\/?>/gi, '\n')}</body>`, 'text/html')
  for (const block of doc.body.querySelectorAll('div, p, li, tr, h1, h2, h3, h4, h5, h6')) block.append('\n')
  return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
}

// HTML for plain text (newlines become line breaks).
export function textToHtml(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
    .join('<br>')
}
