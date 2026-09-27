// PDF export with pdf-lib:
//   'annotations'  real PDF annotation objects (Highlight, Underline, StrikeOut, Ink,
//                  Square, Circle, Line, FreeText, Stamp, Text + Popup) with appearance
//                  streams, so they show everywhere and stay editable in other readers
//   'flatten'      the same drawings merged into the page content (vector); sticky
//                  notes stay as Text annotations
// Every annotation also carries its own record (/OfimeoAnnot, /OfimeoNote) so a
// file exported here reopens with the exact same annotations (import.ts).

import { degrees, PDFDocument, PDFHexString, PDFName, PDFString, StandardFonts, type PDFDict, type PDFFont, type PDFPage, type PDFRef } from 'pdf-lib'
import { prims, type Cmd, type Measure, type Prim } from './draw'
import { apply, normalizeBox, userBox, viewTransform, type Matrix } from './geometry'
import { rgb, type Annot, type Note, type PageEntry } from './model'
import { loadUnicodeFonts, type UnicodeFace, type UnicodeFonts } from './unicode-fonts'

export interface ExportInput {
  bytes: Uint8Array | null
  pages: PageEntry[]
  annots: Annot[]
  notes: Note[]
  title?: string
  // Renders an original page as PNG (used when the PDF is encrypted and cannot be rewritten).
  raster?: (src: number, rotation?: number) => Promise<Uint8Array>
}

export const NOTE_SIZE = 20

const f = (n: number) => (Math.round(n * 1000) / 1000).toString()

interface Fonts {
  regular: PDFFont
  bold: PDFFont
  measure: Measure
  // Text split into runs: Helvetica (face null) or an embedded Unicode face.
  runs: (text: string, bold?: boolean) => { face: UnicodeFace | null; text: string }[]
  unicode: UnicodeFonts | null
}

// Helvetica for WinAnsi text; characters it lacks use embedded Unicode fonts
// (loaded only when some text needs them), and "?" only when no font has them.
async function loadFonts(doc: PDFDocument, texts: string[]): Promise<Fonts> {
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const chars = new Set(regular.getCharacterSet())
  const winAnsi = (c: string) => chars.has(c.codePointAt(0)!)
  const needed = texts.some((t) => [...t.normalize('NFC')].some((c) => c >= ' ' && !winAnsi(c)))
  const unicode = needed ? await loadUnicodeFonts(doc).catch(() => null) : null
  const runs = (text: string, b = false) => {
    const out: { face: UnicodeFace | null; text: string }[] = []
    for (const c of text.normalize('NFC')) {
      let face: UnicodeFace | null = null
      let ch = c
      if (!winAnsi(c)) {
        face = unicode?.faceFor(c, b) ?? null
        if (!face) ch = '?'
      }
      const last = out[out.length - 1]
      if (last && last.face === face) last.text += ch
      else out.push({ face, text: ch })
    }
    return out
  }
  const measure: Measure = (text, size, b) =>
    runs(text, b).reduce((w, r) => {
      if (!r.face) return w + (b ? bold : regular).widthOfTextAtSize(r.text, size)
      const { font } = r.face
      for (const c of r.text) w += ((font.advances[font.cmap.get(c.codePointAt(0)!) ?? 0] ?? 0) * size) / font.unitsPerEm
      return w
    }, 0)
  return { regular, bold, measure, runs, unicode }
}

const fontResources = (fonts: Fonts): Record<string, PDFRef> => {
  const out: Record<string, PDFRef> = { OfHelv: fonts.regular.ref, OfHelvB: fonts.bold.ref }
  fonts.unicode?.faces.forEach((face, i) => (out[`OfU${i}`] = face.ref))
  return out
}

// Content stream operators for primitives drawn in view space.
class Writer {
  states = new Map<string, number>()
  ops: string[] = []
  constructor(
    private fonts: Fonts,
    matrix: Matrix,
  ) {
    this.ops.push('q', `${matrix.map(f).join(' ')} cm`)
  }

  private gs(opacity?: number, multiply?: boolean) {
    if ((opacity === undefined || opacity >= 1) && !multiply) return
    const key = `${opacity ?? 1}|${multiply ? 'M' : ''}`
    if (!this.states.has(key)) this.states.set(key, this.states.size)
    this.ops.push(`/OfGS${this.states.get(key)} gs`)
  }

  path(d: Cmd) {
    for (let i = 0; i < d.length; ) {
      const c = d[i++]
      if (c === 'M') this.ops.push(`${f(d[i++] as number)} ${f(d[i++] as number)} m`)
      else if (c === 'L') this.ops.push(`${f(d[i++] as number)} ${f(d[i++] as number)} l`)
      else if (c === 'C') this.ops.push(`${d.slice(i, i + 6).map((v) => f(v as number)).join(' ')} c`), (i += 6)
      else if (c === 'Z') this.ops.push('h')
    }
  }

  prim(p: Prim) {
    this.ops.push('q')
    if (p.k === 'path') {
      this.gs(p.opacity, p.multiply)
      if (p.stroke) this.ops.push(`${rgb(p.stroke).map(f).join(' ')} RG`, `${f(p.width ?? 1)} w`, '1 J', '1 j')
      if (p.fill) this.ops.push(`${rgb(p.fill).map(f).join(' ')} rg`)
      this.path(p.d)
      this.ops.push(p.stroke && p.fill ? 'B' : p.stroke ? 'S' : 'f')
    } else {
      const font = p.bold ? 'OfHelvB' : 'OfHelv'
      const encoder = p.bold ? this.fonts.bold : this.fonts.regular
      const faces = this.fonts.unicode?.faces ?? []
      this.ops.push('BT', `${rgb(p.color).map(f).join(' ')} rg`)
      p.lines.forEach((line, i) => {
        // The view space has y down: flip the text matrix so glyphs stay upright.
        this.ops.push(`1 0 0 -1 ${f(p.x)} ${f(p.y + i * p.lineHeight)} Tm`)
        for (const run of this.fonts.runs(line, p.bold)) {
          if (!run.face) {
            this.ops.push(`/${font} ${f(p.size)} Tf`, `${encoder.encodeText(run.text).toString()} Tj`)
            continue
          }
          const face = run.face
          let hex = ''
          for (const c of run.text) {
            const gid = face.font.cmap.get(c.codePointAt(0)!) ?? 0
            face.used.set(gid, c)
            hex += gid.toString(16).padStart(4, '0')
          }
          this.ops.push(`/OfU${faces.indexOf(face)} ${f(p.size)} Tf`, `<${hex}> Tj`)
        }
      })
      this.ops.push('ET')
    }
    this.ops.push('Q')
  }

  end(): string {
    return [...this.ops, 'Q'].join('\n')
  }

  extGStates(doc: PDFDocument): Record<string, PDFDict> {
    const out: Record<string, PDFDict> = {}
    for (const [key, n] of this.states) {
      const [opacity, mode] = key.split('|')
      out[`OfGS${n}`] = doc.context.obj({ Type: 'ExtGState', CA: Number(opacity), ca: Number(opacity), ...(mode ? { BM: 'Multiply' } : {}) })
    }
    return out
  }
}

const noteIcon = (x: number, y: number, color: string): Prim[] => {
  const s = NOTE_SIZE
  return [
    { k: 'path', d: ['M', x + 1, y + 1, 'L', x + s - 1, y + 1, 'L', x + s - 1, y + s * 0.72, 'L', x + s * 0.45, y + s * 0.72, 'L', x + s * 0.25, y + s - 1, 'L', x + s * 0.28, y + s * 0.72, 'L', x + 1, y + s * 0.72, 'Z'], fill: color, stroke: '#333333', width: 0.8 },
    { k: 'path', d: ['M', x + 4, y + 6, 'L', x + s - 4, y + 6, 'M', x + 4, y + 10, 'L', x + s - 4, y + 10], stroke: '#333333', width: 0.8 },
  ]
}

const SUBTYPES: Record<Annot['type'], string> = {
  highlight: 'Highlight',
  underline: 'Underline',
  strike: 'StrikeOut',
  ink: 'Ink',
  rect: 'Square',
  ellipse: 'Circle',
  line: 'Line',
  arrow: 'Line',
  text: 'FreeText',
  stamp: 'Stamp',
}

export async function exportPdf(input: ExportInput, mode: 'annotations' | 'flatten'): Promise<Uint8Array> {
  let doc: PDFDocument
  const rasterized = new Set<number>()
  if (input.bytes) {
    doc = await PDFDocument.load(input.bytes, { ignoreEncryption: true, updateMetadata: false })
    if (doc.isEncrypted) doc = await rasterize(input, rasterized)
  } else doc = await PDFDocument.create()
  if (input.title) doc.setTitle(input.title)
  doc.setModificationDate(new Date())

  if (input.bytes && !rasterized.size) arrangePages(doc, input.pages)
  else {
    // Blank pages inserted in the app (rasterized pages already follow the page map).
    input.pages.forEach((p, i) => {
      if (p.src === -1) doc.insertPage(Math.min(i, doc.getPageCount()), [p.w, p.h])
    })
  }
  const fonts = await loadFonts(
    doc,
    input.annots.flatMap((a) => [a.text ?? '']),
  )
  const ctx = doc.context
  const push = ctx.getPushGraphicsStateContentStream()
  const pop = ctx.getPopGraphicsStateContentStream()

  for (const [index, entry] of input.pages.entries()) {
    if (index >= doc.getPageCount()) break
    const page = doc.getPage(index)
    const geom = entry.src === -1 || rasterized.has(index) ? { view: [0, 0, entry.w, entry.h] as [number, number, number, number], rotate: 0 } : entry
    const { toUser } = viewTransform(geom)
    const annots = input.annots.filter((a) => a.page === entry.id).sort((a, b) => a.time - b.time)
    const refs: PDFRef[] = []

    if (mode === 'flatten' && annots.length) {
      const w = new Writer(fonts, toUser)
      for (const a of annots) prims(a, fonts.measure).forEach((p) => w.prim(p))
      page.node.wrapContentStreams(push, pop)
      page.node.addContentStream(ctx.register(ctx.flateStream(w.end())))
      setResources(doc, page, fonts, w)
    } else {
      for (const a of annots) refs.push(annotation(doc, page, fonts, a, toUser))
    }
    // Sticky notes and replies.
    const notes = input.notes.filter((n) => !n.parent && n.page === entry.id)
    for (const n of notes) {
      const parent = noteAnnotation(doc, page, fonts, n, toUser)
      refs.push(parent, ...parent.popup ? [parent.popup] : [])
      for (const r of input.notes.filter((c) => c.parent === n.id).sort((a, b) => a.time - b.time)) refs.push(noteAnnotation(doc, page, fonts, { ...r, page: n.page, x: n.x, y: n.y }, toUser, parent))
    }
    if (refs.length) {
      const existing = page.node.Annots()
      if (existing) refs.forEach((r) => existing.push(r))
      else page.node.set(PDFName.of('Annots'), ctx.obj(refs))
    }
  }
  fonts.unicode?.finish()
  return doc.save()
}

function setResources(doc: PDFDocument, page: PDFPage, fonts: Fonts, w: Writer) {
  for (const [name, ref] of Object.entries(fontResources(fonts))) page.node.setFontDictionary(PDFName.of(name), ref)
  for (const [name, dict] of Object.entries(w.extGStates(doc))) page.node.setExtGState(PDFName.of(name), dict)
}

function appearance(doc: PDFDocument, fonts: Fonts, list: Prim[], toUser: Matrix, rect: number[]): PDFRef {
  const w = new Writer(fonts, toUser)
  list.forEach((p) => w.prim(p))
  const stream = doc.context.flateStream(w.end(), {
    Type: 'XObject',
    Subtype: 'Form',
    BBox: rect,
    Resources: { Font: fontResources(fonts), ExtGState: w.extGStates(doc) },
  })
  return doc.context.register(stream)
}

const text = (s: string) => PDFHexString.fromText(s)

function annotation(doc: PDFDocument, page: PDFPage, fonts: Fonts, a: Annot, toUser: Matrix): PDFRef {
  const [bx, by, bw, bh] = boundsOf(a, fonts.measure)
  const rect = userBox(toUser, [[bx, by], [bx + bw, by + bh]])
  const P = (x: number, y: number) => apply(toUser, x, y)
  const extra: Record<string, unknown> = {}
  switch (a.type) {
    case 'highlight':
    case 'underline':
    case 'strike':
      extra.QuadPoints = (a.rects ?? []).flatMap(([x, y, w, h]) => [...P(x, y), ...P(x + w, y), ...P(x, y + h), ...P(x + w, y + h)])
      break
    case 'ink':
      extra.InkList = (a.strokes ?? []).map((s) => s.flatMap((v, i) => (i % 3 === 0 ? P(v, s[i + 1]) : [])))
      extra.BS = { W: avgWidth(a), S: 'S' }
      break
    case 'rect':
    case 'ellipse':
      extra.BS = { W: a.width ?? 2, S: 'S' }
      if (a.fill) extra.IC = rgb(a.fill)
      break
    case 'line':
    case 'arrow':
      extra.L = [...P(a.line![0], a.line![1]), ...P(a.line![2], a.line![3])]
      extra.BS = { W: a.width ?? 2, S: 'S' }
      if (a.type === 'arrow') extra.LE = ['None', 'OpenArrow']
      break
    case 'text': {
      const [r, g, b] = rgb(a.color).map(f)
      extra.DA = PDFString.of(`/Helv ${f(a.size ?? 12)} Tf ${r} ${g} ${b} rg`)
      break
    }
    case 'stamp':
      extra.Name = a.glyph === 'check' && !a.text ? 'Approved' : a.glyph === 'cross' && !a.text ? 'NotApproved' : 'Ofimeo'
      break
  }
  const contents = a.type === 'text' ? a.text : a.type === 'stamp' ? a.alt || a.text : a.quote
  const ap = appearance(doc, fonts, prims(a, fonts.measure), toUser, rect)
  const dict = doc.context.obj({
    Type: 'Annot',
    Subtype: SUBTYPES[a.type],
    Rect: rect,
    F: 4,
    P: page.ref,
    NM: PDFString.of(a.id),
    M: PDFString.fromDate(new Date(a.time)),
    ...(a.type === 'text' ? {} : { C: rgb(a.color) }),
    ...(a.opacity !== undefined || a.type === 'highlight' ? { CA: a.opacity ?? 0.45 } : {}),
    ...extra,
    AP: { N: ap },
  })
  if (a.author) dict.set(PDFName.of('T'), text(a.author))
  if (contents) dict.set(PDFName.of('Contents'), text(contents))
  dict.set(PDFName.of('OfimeoAnnot'), text(JSON.stringify({ ...a, page: undefined })))
  return doc.context.register(dict)
}

type NoteRef = PDFRef & { popup?: PDFRef }

function noteAnnotation(doc: PDFDocument, page: PDFPage, fonts: Fonts, n: Note, toUser: Matrix, parent?: PDFRef): NoteRef {
  const x = n.x ?? 0
  const y = n.y ?? 0
  const rect = userBox(toUser, [[x, y], [x + NOTE_SIZE, y + NOTE_SIZE]])
  const dict = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Text',
    Rect: rect,
    F: 4 | 8 | 16, // print, no zoom, no rotate
    P: page.ref,
    NM: PDFString.of(n.id),
    M: PDFString.fromDate(new Date(n.edited ?? n.time)),
    C: rgb(n.color),
    Name: 'Comment',
    Open: false,
    T: text(n.author),
    Contents: text(n.text),
    AP: { N: appearance(doc, fonts, noteIcon(x, y, '#ffd400'), toUser, rect) },
    ...(parent ? { IRT: parent, RT: 'R' } : {}),
    ...(n.resolved ? { State: PDFString.of('Completed'), StateModel: PDFString.of('Review') } : {}),
  })
  dict.set(PDFName.of('OfimeoNote'), text(JSON.stringify({ ...n, page: undefined })))
  const ref: NoteRef = doc.context.register(dict)
  if (!parent) {
    const popup = doc.context.obj({ Type: 'Annot', Subtype: 'Popup', Rect: normalizeBox([rect[2], rect[3] - 100, rect[2] + 200, rect[3]]), Parent: ref, Open: false, F: 28 })
    const popupRef = doc.context.register(popup)
    dict.set(PDFName.of('Popup'), popupRef)
    ref.popup = popupRef
  }
  return ref
}

function avgWidth(a: Annot): number {
  const ws = (a.strokes ?? []).flatMap((s) => s.filter((_, i) => i % 3 === 2))
  return ws.length ? Math.round((ws.reduce((x, y) => x + y, 0) / ws.length) * 100) / 100 : 1
}

// Box of what the annotation draws (text boxes may grow with their text).
function boundsOf(a: Annot, measure: Measure): [number, number, number, number] {
  const pad = (a.width ?? 1) + 1
  if (a.type === 'text' || a.type === 'stamp') {
    const list = prims(a, measure)
    let y1 = a.y! + a.h!
    for (const p of list) if (p.k === 'text') y1 = Math.max(y1, p.y + (p.lines.length - 1) * p.lineHeight + p.size * 0.3)
    return [a.x!, a.y!, a.w!, y1 - a.y!]
  }
  if (a.type === 'ink') {
    const b = inkBounds(a)
    return [b[0] - 1, b[1] - 1, b[2] + 2, b[3] + 2]
  }
  if (a.line) {
    const [x1, y1, x2, y2] = a.line
    const p = pad * (a.type === 'arrow' ? 5 : 1)
    return [Math.min(x1, x2) - p, Math.min(y1, y2) - p, Math.abs(x2 - x1) + 2 * p, Math.abs(y2 - y1) + 2 * p]
  }
  if (a.rects?.length) {
    const xs = a.rects.flatMap((r) => [r[0], r[0] + r[2]])
    const ys = a.rects.flatMap((r) => [r[1], r[1] + r[3]])
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]
  }
  return [a.x!, a.y!, a.w!, a.h!]
}

function inkBounds(a: Annot): [number, number, number, number] {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const s of a.strokes ?? [])
    for (let i = 0; i < s.length; i += 3) {
      const r = s[i + 2] / 2
      x0 = Math.min(x0, s[i] - r)
      y0 = Math.min(y0, s[i + 1] - r)
      x1 = Math.max(x1, s[i] + r)
      y1 = Math.max(y1, s[i + 1] + r)
    }
  return [x0, y0, x1 - x0, y1 - y0]
}

// Applies the page map: original pages in the stored order and rotation
// (deleted ones left out) and the blank pages inserted in the app.
function arrangePages(doc: PDFDocument, entries: PageEntry[]) {
  const original = doc.getPages()
  const inOrder = entries.filter((p) => p.src >= 0).every((p, i) => p.src === i) && entries.filter((p) => p.src >= 0).length === original.length
  if (inOrder) {
    entries.forEach((p, i) => {
      if (p.src === -1) doc.insertPage(Math.min(i, doc.getPageCount()), [p.w, p.h])
    })
  } else {
    for (let i = original.length - 1; i >= 0; i--) doc.removePage(i)
    for (const p of entries) {
      if (p.src === -1) doc.addPage([p.w, p.h])
      else if (original[p.src]) doc.addPage(original[p.src])
    }
  }
  // Rotation of every original page (turned in the app or not).
  let i = 0
  for (const p of entries) {
    const page = doc.getPage(i++)
    if (p.src >= 0 && ((page.getRotation().angle % 360) + 360) % 360 !== p.rotate) page.setRotation(degrees(p.rotate))
  }
}

// Encrypted PDFs cannot be rewritten: rebuild them from page images.
async function rasterize(input: ExportInput, rasterized: Set<number>): Promise<PDFDocument> {
  if (!input.raster) throw new Error('encrypted')
  const doc = await PDFDocument.create()
  for (const [i, p] of input.pages.entries()) {
    if (p.src === -1) continue
    const png = await doc.embedPng(await input.raster(p.src, p.rotate))
    const page = doc.addPage([p.w, p.h])
    page.drawImage(png, { x: 0, y: 0, width: p.w, height: p.h })
    rasterized.add(i)
  }
  return doc
}
