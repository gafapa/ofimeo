// Plain text of a document from its Yjs state, per app, for the content
// search (runs in library-search.worker.ts). Reads the shared types directly,
// without loading any editor:
//   writer   XmlFragments body, header, footer
//   sheet    workbook snapshot (sheet.checkpoint or sheet.base) plus the set-range-values log
//   draw     text of the Excalidraw elements (draw-elements)
//   diagram  cell labels (diagram-cells:*) and page names; slides also speaker notes
//   forms    description, section and question titles, descriptions and options
//            (form-settings, form-items; the answer key is private and never indexed)
//   pdf      file name, text boxes, stamps and marked text (pdf-annots), sticky
//            notes (pdf-notes in the comments document, pdf-pending-notes) and
//            the page text, which the worker extracts with pdf.js (pdfText)
//   notebook section names, page titles and page text (nb-sections, nb-pages,
//            XmlFragments nb-page:<id>)

import * as Y from 'yjs'
import type { DocType } from './store'

export interface ExtractExtra {
  // Comments document (PDF sticky notes).
  comments?: Y.Doc
  // Text of the original PDF pages, by source page index.
  pdfPages?: string[]
}

export function extractText(type: DocType, doc: Y.Doc, extra: ExtractExtra = {}): string {
  const title = String(doc.getMap('meta').get('title') ?? '')
  const parts: string[] = [title]
  try {
    if (type === 'writer') for (const name of ['body', 'header', 'footer']) parts.push(xmlText(doc.getXmlFragment(name)))
    else if (type === 'sheet') parts.push(sheetText(doc))
    else if (type === 'draw') parts.push(drawText(doc))
    else if (type === 'forms') parts.push(formsText(doc))
    else if (type === 'pdf') parts.push(pdfText(doc, extra))
    else if (type === 'notebook') parts.push(notebookText(doc))
    else parts.push(diagramText(doc))
  } catch {
    // Unexpected structure: index what was read.
  }
  return parts
    .join('\n')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

const BLOCKS = new Set(['paragraph', 'heading', 'listItem', 'taskItem', 'tableCell', 'tableHeader', 'tableRow', 'blockquote', 'codeBlock', 'hardBreak', 'horizontalRule'])

function xmlText(node: Y.XmlFragment | Y.XmlElement): string {
  let out = ''
  for (const child of node.toArray()) {
    if (child instanceof Y.XmlText) {
      for (const op of child.toDelta() as { insert?: unknown }[]) if (typeof op.insert === 'string') out += op.insert
    } else if (child instanceof Y.XmlElement) {
      const inner = xmlText(child)
      out += BLOCKS.has(child.nodeName) ? `${inner}\n` : inner
      // Equations and similar atoms keep their source in attributes.
      const latex = child.getAttribute('latex')
      if (typeof latex === 'string') out += ` ${latex} `
    }
  }
  return out
}

function notebookText(doc: Y.Doc): string {
  const parts: string[] = []
  doc.getMap<{ name?: string }>('nb-sections').forEach((s) => parts.push(String(s?.name ?? '')))
  doc.getMap<{ title?: string }>('nb-pages').forEach((p, id) => parts.push(String(p?.title ?? ''), xmlText(doc.getXmlFragment(`nb-page:${id}`))))
  return parts.join('\n')
}

type Cells = Record<string, Record<string, { v?: unknown } | null> | null>
interface SheetData {
  sheets?: Record<string, { name?: string; cellData?: Cells } | null>
}

function sheetText(doc: Y.Doc): string {
  const state = doc.getMap('sheet')
  const values = new Map<string, string>()
  const names: string[] = []
  const put = (sheet: string, cells: Cells | undefined) => {
    for (const [r, row] of Object.entries(cells ?? {}))
      for (const [c, cell] of Object.entries(row ?? {})) {
        const v = cell?.v
        if (v === undefined || v === null || v === '') values.delete(`${sheet}:${r}:${c}`)
        else values.set(`${sheet}:${r}:${c}`, String(v))
      }
  }
  const checkpoint = parse<{ snapshot?: SheetData }>(state.get('checkpoint'))?.snapshot
  const base = checkpoint ?? parse<SheetData>(state.get('base'))
  for (const [id, sheet] of Object.entries(base?.sheets ?? {})) {
    if (sheet?.name) names.push(sheet.name)
    put(id, sheet?.cellData)
  }
  for (const entry of doc.getArray<{ m?: string; p?: string }>('sheet-ops').toArray()) {
    if (entry?.m !== 'sheet.mutation.set-range-values') continue
    const params = parse<{ subUnitId?: string; cellValue?: Cells }>(entry.p)
    if (params?.subUnitId) put(params.subUnitId, params.cellValue)
  }
  return [...names, ...values.values()].join('\n')
}

function drawText(doc: Y.Doc): string {
  const out: string[] = []
  for (const element of doc.getMap<{ isDeleted?: boolean; text?: string; originalText?: string; name?: string }>('draw-elements').values()) {
    if (!element || element.isDeleted) continue
    const text = element.originalText ?? element.text ?? element.name
    if (text) out.push(text)
  }
  return out.join('\n')
}

interface Labelled {
  label?: unknown
}

function formsText(doc: Y.Doc): string {
  const out: string[] = []
  const settings = doc.getMap<unknown>('form-settings')
  const add = (v: unknown) => typeof v === 'string' && v.trim() && out.push(v)
  add(settings.get('description'))
  for (const item of doc.getArray<Y.Map<unknown>>('form-items').toArray()) {
    if (!(item instanceof Y.Map)) continue
    for (const key of ['title', 'description', 'minLabel', 'maxLabel']) add(item.get(key))
    for (const key of ['options', 'rows']) {
      const list = item.get(key)
      if (Array.isArray(list)) for (const o of list as Labelled[]) add(o?.label)
    }
  }
  return out.join('\n')
}

// Key of the stored PDF file: its text is extracted again only when it changes.
export function pdfFileKey(doc: Y.Doc): string {
  const meta = doc.getMap<unknown>('pdf-meta')
  const chunks = doc.getArray<Uint8Array>('pdf-file')
  const have = chunks.toArray().reduce((n, c) => n + (c?.length ?? 0), 0)
  return `${String(meta.get('name') ?? '')}|${String(meta.get('size') ?? 0)}|${have}`
}

function pdfText(doc: Y.Doc, extra: ExtractExtra): string {
  const out: string[] = []
  const name = doc.getMap<unknown>('pdf-meta').get('name')
  if (typeof name === 'string' && name) out.push(name)
  const pages = doc.getArray<{ src?: number }>('pdf-pages').toArray()
  if (extra.pdfPages) for (const p of pages) if (typeof p?.src === 'number' && p.src >= 0 && extra.pdfPages[p.src]) out.push(extra.pdfPages[p.src])
  for (const a of doc.getMap<{ text?: string; quote?: string; alt?: string }>('pdf-annots').values()) {
    for (const v of [a?.text, a?.quote, a?.alt]) if (typeof v === 'string' && v.trim()) out.push(v)
  }
  const notes = [doc.getMap<{ text?: string }>('pdf-pending-notes'), extra.comments?.getMap<{ text?: string }>('pdf-notes')]
  for (const map of notes) for (const n of map?.values() ?? []) if (typeof n?.text === 'string' && n.text.trim()) out.push(n.text)
  return out.join('\n')
}

function diagramText(doc: Y.Doc): string {
  const out: string[] = []
  for (const name of [...doc.share.keys()]) {
    if (name === 'diagram-pages') {
      for (const page of doc.getMap<Y.Map<unknown>>(name).values()) if (page instanceof Y.Map && page.get('name')) out.push(String(page.get('name')))
    } else if (name.startsWith('diagram-cells:')) {
      for (const cell of doc.getMap<Y.Map<unknown>>(name).values()) {
        const value = cell instanceof Y.Map ? cell.get('value') : undefined
        if (typeof value === 'string' && value) out.push(htmlText(value))
      }
    } else if (name.startsWith('slides-notes:')) {
      out.push(doc.getText(name).toString())
    }
  }
  return out.join('\n')
}

// Labels may be HTML (rich text labels): tags become spaces, entities are decoded.
function htmlText(value: string): string {
  if (!/[<&]/.test(value)) return value
  return value
    .replace(/<br\s*\/?>|<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

function parse<T>(raw: unknown): T | null {
  if (typeof raw !== 'string') return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}
