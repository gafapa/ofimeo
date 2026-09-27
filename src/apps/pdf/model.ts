// Shared data of a PDF document (Yjs):
//   pdf-file     Y.Array<Uint8Array>: the original PDF, stored once, in chunks
//   pdf-meta     Y.Map: name, size
//   pdf-pages    Y.Array<PageEntry>: pages in order (original pages and inserted blank ones)
//   pdf-annots   Y.Map<Annot>: annotations by id (view-space coordinates, see geometry.ts)
//   pdf-pending-notes  Y.Map<Note>: notes of an imported file, moved to the comments channel
//                      the first time an editor opens the document
// Sticky notes and their replies live in the comments channel
// (session.commentsDoc, map 'pdf-notes') so commenters can write them.

import * as Y from 'yjs'
import type { Session } from '../../core/session'
import type { PageGeom } from './geometry'

export const CHUNK = 512 * 1024
// Above this size the user is warned: every collaborator and version keeps a copy.
export const WARN_SIZE = 20 * 1024 * 1024

export interface PageEntry extends PageGeom {
  id: string
  // Index of the page in the original PDF; -1 for an inserted blank page.
  src: number
  // Size in view space (points).
  w: number
  h: number
}

export type AnnotType = 'highlight' | 'underline' | 'strike' | 'ink' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'text' | 'stamp'

export interface Annot {
  id: string
  type: AnnotType
  page: string
  color: string
  author?: string
  time: number
  opacity?: number
  // Markup: rectangles [x, y, w, h] of the marked text, and the text itself.
  rects?: [number, number, number, number][]
  quote?: string
  // Ink: strokes as flat [x, y, width, x, y, width, …] lists.
  strokes?: number[][]
  // Line width (shapes, lines).
  width?: number
  // Box of rect, ellipse, text and stamp.
  x?: number
  y?: number
  w?: number
  h?: number
  fill?: string
  // Line and arrow: [x1, y1, x2, y2].
  line?: [number, number, number, number]
  // Text box and stamp.
  text?: string
  size?: number
  // Stamp: glyph drawn next to (or instead of) the text.
  glyph?: 'check' | 'cross'
  // Alternative text (stamps, signatures).
  alt?: string
  // Signature (ink drawn from the saved signature).
  signature?: boolean
}

export interface Note {
  id: string
  // Replies point to the note they answer; only top-level notes have a position.
  parent?: string
  page?: string
  x?: number
  y?: number
  authorId: string
  author: string
  color: string
  time: number
  text: string
  edited?: number
  resolved?: boolean
}

export const LOCAL = Symbol('pdf-local')

export const fileArray = (doc: Y.Doc) => doc.getArray<Uint8Array>('pdf-file')
export const metaMap = (doc: Y.Doc) => doc.getMap<unknown>('pdf-meta')
export const pagesArray = (doc: Y.Doc) => doc.getArray<PageEntry>('pdf-pages')
export const annotsMap = (doc: Y.Doc) => doc.getMap<Annot>('pdf-annots')
export const pendingNotes = (doc: Y.Doc) => doc.getMap<Note>('pdf-pending-notes')
export const notesMap = (session: Session) => session.commentsDoc.getMap<Note>('pdf-notes')

export const newId = () => Math.random().toString(36).slice(2, 11)

export function hasFile(doc: Y.Doc): boolean {
  return fileArray(doc).length > 0 || pagesArray(doc).length > 0
}

// The original PDF bytes (null for documents made of blank pages only).
export function readFile(doc: Y.Doc): Uint8Array | null {
  const chunks = fileArray(doc).toArray()
  if (!chunks.length) return null
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

export interface Prepared {
  bytes: Uint8Array | null
  name: string
  pages: PageEntry[]
  annots: Annot[]
  notes: Note[]
}

// Fills an empty document with a prepared PDF (see import.ts).
export function fillDoc(doc: Y.Doc, p: Prepared, notesTarget?: Y.Map<Note>): void {
  doc.transact(() => {
    if (p.bytes) {
      const chunks: Uint8Array[] = []
      for (let i = 0; i < p.bytes.length; i += CHUNK) chunks.push(p.bytes.slice(i, i + CHUNK))
      fileArray(doc).push(chunks)
    }
    const meta = metaMap(doc)
    meta.set('name', p.name)
    meta.set('size', p.bytes?.length ?? 0)
    pagesArray(doc).push(p.pages)
    const annots = annotsMap(doc)
    for (const a of p.annots) annots.set(a.id, a)
    if (!notesTarget) for (const n of p.notes) pendingNotes(doc).set(n.id, n)
  }, LOCAL)
  if (notesTarget) notesTarget.doc!.transact(() => p.notes.forEach((n) => notesTarget.set(n.id, n)))
}

// A4 portrait, in points.
export const A4: [number, number] = [595.28, 841.89]

export function blankPage(w = A4[0], h = A4[1]): PageEntry {
  return { id: newId(), src: -1, w, h, view: [0, 0, w, h], rotate: 0 }
}

// Hex color → [r, g, b] in 0..1.
export function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  const n = m ? parseInt(m[1], 16) : 0
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export function hex(c: number[]): string {
  const [r, g, b] = c.length === 1 ? [c[0], c[0], c[0]] : c.length === 4 ? cmyk(c) : c
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('')
}

const cmyk = ([c, m, y, k]: number[]) => [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)]

// Bounding box [x, y, w, h] of an annotation in view space.
export function bounds(a: Annot): [number, number, number, number] {
  if (a.rects?.length) {
    const x0 = Math.min(...a.rects.map((r) => r[0]))
    const y0 = Math.min(...a.rects.map((r) => r[1]))
    const x1 = Math.max(...a.rects.map((r) => r[0] + r[2]))
    const y1 = Math.max(...a.rects.map((r) => r[1] + r[3]))
    return [x0, y0, x1 - x0, y1 - y0]
  }
  if (a.strokes?.length) {
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const s of a.strokes) {
      for (let i = 0; i < s.length; i += 3) {
        const r = s[i + 2] / 2
        x0 = Math.min(x0, s[i] - r)
        y0 = Math.min(y0, s[i + 1] - r)
        x1 = Math.max(x1, s[i] + r)
        y1 = Math.max(y1, s[i + 1] + r)
      }
    }
    return [x0, y0, x1 - x0, y1 - y0]
  }
  if (a.line) {
    const [x1, y1, x2, y2] = a.line
    const pad = (a.width ?? 2) * (a.type === 'arrow' ? 4 : 1)
    return [Math.min(x1, x2) - pad, Math.min(y1, y2) - pad, Math.abs(x2 - x1) + 2 * pad, Math.abs(y2 - y1) + 2 * pad]
  }
  return [a.x ?? 0, a.y ?? 0, a.w ?? 0, a.h ?? 0]
}

// Moves an annotation by (dx, dy); returns a new record.
export function moved(a: Annot, dx: number, dy: number): Annot {
  const r = (n: number) => Math.round(n * 100) / 100
  const b: Annot = { ...a }
  if (a.rects) b.rects = a.rects.map(([x, y, w, h]) => [r(x + dx), r(y + dy), w, h])
  if (a.strokes) b.strokes = a.strokes.map((s) => s.map((v, i) => (i % 3 === 0 ? r(v + dx) : i % 3 === 1 ? r(v + dy) : v)))
  if (a.line) b.line = [r(a.line[0] + dx), r(a.line[1] + dy), r(a.line[2] + dx), r(a.line[3] + dy)]
  if (a.x !== undefined) b.x = r(a.x + dx)
  if (a.y !== undefined) b.y = r(a.y + dy)
  return b
}

// Scales an annotation's box to a new size (box types and ink).
export function resized(a: Annot, w: number, h: number): Annot {
  const [x0, y0, bw, bh] = bounds(a)
  const sx = bw ? w / bw : 1
  const sy = bh ? h / bh : 1
  const r = (n: number) => Math.round(n * 100) / 100
  const b: Annot = { ...a }
  if (a.strokes) b.strokes = a.strokes.map((s) => s.map((v, i) => (i % 3 === 0 ? r(x0 + (v - x0) * sx) : i % 3 === 1 ? r(y0 + (v - y0) * sy) : v)))
  if (a.w !== undefined) b.w = r(Math.max(4, w))
  if (a.h !== undefined) b.h = r(Math.max(4, h))
  if (a.type === 'stamp' && a.size) b.size = r(Math.max(4, a.size * sy))
  return b
}
