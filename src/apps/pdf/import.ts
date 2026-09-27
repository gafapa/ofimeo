// Opening a PDF: page geometry and the annotations it already has.
// Supported annotations (Highlight, Underline, StrikeOut, Squiggly, Ink, Square,
// Circle, Line, FreeText, Stamp, Text with replies) become editable records and
// are removed from the stored file, so pdf.js does not draw them twice. Files
// exported by this app carry the exact records (/OfimeoAnnot, /OfimeoNote).

import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRef, PDFString, type PDFPage } from 'pdf-lib'
import { apply, normalizeBox, round, viewTransform, type Matrix } from './geometry'
import { hex, newId, type Annot, type Note, type PageEntry, type Prepared } from './model'

const SUPPORTED = new Set(['Highlight', 'Underline', 'StrikeOut', 'Squiggly', 'Ink', 'Square', 'Circle', 'Line', 'FreeText', 'Stamp', 'Text', 'Popup'])

export interface ImportOptions {
  author?: string
  authorId?: string
  userColor?: string
}

export async function preparePdf(bytes: Uint8Array, name: string, options: ImportOptions = {}): Promise<Prepared> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false })
  const pages: PageEntry[] = []
  const annots: Annot[] = []
  const notes: Note[] = []
  let removed = false
  const encrypted = doc.isEncrypted
  for (const [index, page] of doc.getPages().entries()) {
    const entry = pageEntry(page, index)
    pages.push(entry)
    // Strings of encrypted files cannot be read: keep their annotations as they are.
    if (encrypted) continue
    if (readAnnotations(doc, page, entry, annots, notes, options)) removed = true
  }
  // Only rewrite the file when annotations were taken out of it.
  const out = removed ? await doc.save() : bytes
  return { bytes: out, name, pages, annots, notes }
}

function pageEntry(page: PDFPage, index: number): PageEntry {
  const media = page.getMediaBox()
  const crop = page.getCropBox()
  const m = [media.x, media.y, media.x + media.width, media.y + media.height]
  const c = [crop.x, crop.y, crop.x + crop.width, crop.y + crop.height]
  // pdf.js shows the intersection of both boxes.
  let view = normalizeBox([Math.max(m[0], c[0]), Math.max(m[1], c[1]), Math.min(m[2], c[2]), Math.min(m[3], c[3])])
  if (view[2] <= view[0] || view[3] <= view[1]) view = normalizeBox(m)
  const rotate = (((page.getRotation().angle % 360) + 360) % 360) as number
  const { w, h } = viewTransform({ view, rotate })
  return { id: newId(), src: index, view, rotate, w: round(w), h: round(h) }
}

const str = (d: PDFDict, key: string): string | undefined => {
  const v = d.lookup(PDFName.of(key))
  return v instanceof PDFString || v instanceof PDFHexString ? v.decodeText() : undefined
}
const num = (d: PDFDict, key: string): number | undefined => {
  const v = d.lookup(PDFName.of(key))
  return v instanceof PDFNumber ? v.asNumber() : undefined
}
const nums = (d: PDFDict, key: string): number[] | undefined => {
  const v = d.lookup(PDFName.of(key))
  return v instanceof PDFArray ? v.asArray().map((x) => (x instanceof PDFNumber ? x.asNumber() : Number(d.context.lookup(x)?.toString() ?? 0))) : undefined
}
const nameOf = (d: PDFDict, key: string) => d.lookup(PDFName.of(key))?.toString().replace(/^\//, '')

function readAnnotations(doc: PDFDocument, page: PDFPage, entry: PageEntry, annots: Annot[], notes: Note[], options: ImportOptions): boolean {
  const list = page.node.Annots()
  if (!list) return false
  const { toView } = viewTransform(entry)
  const V = (x: number, y: number) => apply(toView, x, y).map(round) as [number, number]
  const noteIds = new Map<string, string>()
  const keep: (PDFRef | PDFDict)[] = []
  const pendingReplies: [PDFDict, Note][] = []
  let removed = false
  for (let i = 0; i < list.size(); i++) {
    const raw = list.get(i)
    const dict = raw instanceof PDFRef ? doc.context.lookup(raw) : raw
    if (!(dict instanceof PDFDict)) continue
    const subtype = nameOf(dict, 'Subtype') ?? ''
    if (!SUPPORTED.has(subtype)) {
      keep.push(raw as PDFRef)
      continue
    }
    removed = true
    if (subtype === 'Popup') continue
    try {
      if (subtype === 'Text') {
        const note = readNote(dict, entry, V, options)
        if (raw instanceof PDFRef) noteIds.set(raw.toString(), note.id)
        const irt = dict.get(PDFName.of('IRT'))
        if (irt instanceof PDFRef) pendingReplies.push([dict, note])
        notes.push(note)
      } else {
        const a = readAnnot(dict, subtype, entry, toView, V, options)
        if (a) annots.push(a)
      }
    } catch {
      // A malformed annotation is dropped.
    }
  }
  for (const [dict, note] of pendingReplies) {
    const parent = noteIds.get(dict.get(PDFName.of('IRT'))!.toString())
    if (parent) {
      note.parent = parent
      delete note.page
      delete note.x
      delete note.y
    }
  }
  if (removed) {
    if (keep.length) page.node.set(PDFName.of('Annots'), doc.context.obj(keep))
    else page.node.delete(PDFName.of('Annots'))
  }
  return removed
}

function readNote(d: PDFDict, entry: PageEntry, V: (x: number, y: number) => [number, number], o: ImportOptions): Note {
  const own = str(d, 'OfimeoNote')
  if (own) return { ...(JSON.parse(own) as Note), page: entry.id }
  const r = nums(d, 'Rect') ?? [0, 0, 20, 20]
  const [x, y] = V(Math.min(r[0], r[2]), Math.max(r[1], r[3]))
  const color = nums(d, 'C')
  return {
    id: newId(),
    page: entry.id,
    x,
    y,
    authorId: 'imported',
    author: str(d, 'T') ?? o.author ?? '',
    color: color?.length ? hex(color) : (o.userColor ?? '#f5b400'),
    time: parseDate(str(d, 'M')) ?? Date.now(),
    text: str(d, 'Contents') ?? '',
    resolved: str(d, 'State') === 'Completed' || undefined,
  }
}

function readAnnot(d: PDFDict, subtype: string, entry: PageEntry, toView: Matrix, V: (x: number, y: number) => [number, number], o: ImportOptions): Annot | null {
  const own = str(d, 'OfimeoAnnot')
  if (own) return { ...(JSON.parse(own) as Annot), page: entry.id }
  const c = nums(d, 'C')
  const color = c?.length ? hex(c) : '#000000'
  const base = {
    id: newId(),
    page: entry.id,
    color,
    author: str(d, 'T') ?? o.author,
    time: parseDate(str(d, 'M')) ?? Date.now(),
    ...(num(d, 'CA') !== undefined && num(d, 'CA')! < 1 ? { opacity: num(d, 'CA') } : {}),
  }
  const bs = d.lookup(PDFName.of('BS'))
  const width = (bs instanceof PDFDict ? num(bs, 'W') : undefined) ?? nums(d, 'Border')?.[2] ?? 1
  const rect = nums(d, 'Rect') ?? [0, 0, 0, 0]
  const box = (): { x: number; y: number; w: number; h: number } => {
    const pts = [V(rect[0], rect[1]), V(rect[2], rect[3])]
    const x = Math.min(pts[0][0], pts[1][0])
    const y = Math.min(pts[0][1], pts[1][1])
    return { x, y, w: round(Math.abs(pts[1][0] - pts[0][0])), h: round(Math.abs(pts[1][1] - pts[0][1])) }
  }
  switch (subtype) {
    case 'Highlight':
    case 'Underline':
    case 'StrikeOut':
    case 'Squiggly': {
      const q = nums(d, 'QuadPoints') ?? []
      const rects: [number, number, number, number][] = []
      for (let i = 0; i + 7 < q.length; i += 8) {
        const pts = [0, 2, 4, 6].map((k) => V(q[i + k], q[i + k + 1]))
        const xs = pts.map((p) => p[0])
        const ys = pts.map((p) => p[1])
        rects.push([Math.min(...xs), Math.min(...ys), round(Math.max(...xs) - Math.min(...xs)), round(Math.max(...ys) - Math.min(...ys))])
      }
      if (!rects.length) {
        const b = box()
        rects.push([b.x, b.y, b.w, b.h])
      }
      const type = subtype === 'Highlight' ? 'highlight' : subtype === 'StrikeOut' ? 'strike' : 'underline'
      return { ...base, type, rects, quote: str(d, 'Contents') }
    }
    case 'Ink': {
      const ink = d.lookup(PDFName.of('InkList'))
      if (!(ink instanceof PDFArray)) return null
      const strokes = ink.asArray().map((s) => {
        const arr = d.context.lookup(s)
        const values = arr instanceof PDFArray ? arr.asArray().map((x) => (d.context.lookup(x) as PDFNumber).asNumber()) : []
        const out: number[] = []
        for (let i = 0; i + 1 < values.length; i += 2) out.push(...V(values[i], values[i + 1]), width)
        return out
      })
      return { ...base, type: 'ink', strokes, width }
    }
    case 'Square':
    case 'Circle': {
      const b = box()
      const ic = nums(d, 'IC')
      return { ...base, type: subtype === 'Square' ? 'rect' : 'ellipse', ...b, width, ...(ic?.length ? { fill: hex(ic) } : {}) }
    }
    case 'Line': {
      const l = nums(d, 'L') ?? [0, 0, 0, 0]
      const le = d.lookup(PDFName.of('LE'))
      const arrow = le instanceof PDFArray && /Arrow/.test(le.toString())
      return { ...base, type: arrow ? 'arrow' : 'line', line: [...V(l[0], l[1]), ...V(l[2], l[3])], width }
    }
    case 'FreeText': {
      const da = str(d, 'DA') ?? ''
      const size = Number(/([\d.]+)\s+Tf/.exec(da)?.[1]) || 12
      const rg = /([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+rg/.exec(da)
      return { ...base, type: 'text', ...box(), text: str(d, 'Contents') ?? '', size, color: rg ? hex([+rg[1], +rg[2], +rg[3]]) : color }
    }
    case 'Stamp': {
      const b = box()
      const name = nameOf(d, 'Name') ?? 'Stamp'
      const contents = str(d, 'Contents')
      const label = name === 'Approved' ? '' : name.replace(/^#?[0-9A-F]{2}/, '').replace(/([a-z])([A-Z])/g, '$1 $2')
      const size = Math.max(6, round(b.h / 1.7))
      return { ...base, type: 'stamp', ...b, text: label || undefined, glyph: name === 'Approved' ? 'check' : undefined, size, alt: contents ?? label, color: c?.length ? color : '#c62828' }
    }
  }
  void toView
  return null
}

// PDF date "D:YYYYMMDDHHmmSS…" → milliseconds.
function parseDate(s?: string): number | undefined {
  const m = /D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/.exec(s ?? '')
  if (!m) return undefined
  return Date.UTC(+m[1], +(m[2] ?? 1) - 1, +(m[3] ?? 1), +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0))
}
