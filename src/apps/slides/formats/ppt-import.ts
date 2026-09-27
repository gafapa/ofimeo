// PowerPoint 97-2003 (.ppt) import: slides with their text boxes and
// placeholders (position, size, titles, bullet paragraphs) and filled
// rectangles. Pictures, charts, animations and speaker notes are not imported.

import { readCompoundFile } from '../../../core/cfb'
import { t } from '../../../core/i18n'
import { newCellId, type CellRecord } from '../../diagram/model'
import { SLIDE_SIZES, type Ratio, type SlideData } from '../model'

interface Rec {
  type: number
  instance: number
  container: boolean
  start: number // data offset
  end: number
}

const REC = {
  document: 0x03e8,
  documentAtom: 0x03e9,
  slide: 0x03ee,
  slidePersist: 0x03f3,
  slideListWithText: 0x0ff0,
  textHeader: 0x0f9f,
  textChars: 0x0fa0,
  textBytes: 0x0fa8,
  outlineTextRef: 0x0f9e,
  userEdit: 0x0ff5,
  persistDirectory: 0x1772,
  spContainer: 0xf004,
  fopt: 0xf00b,
  childAnchor: 0xf00f,
  clientAnchor: 0xf010,
  clientTextbox: 0xf00d,
  styleTextProp: 0x0fa1,
}

// First paragraph and character formatting of a text (StyleTextPropAtom).
interface TextStyle {
  bullet?: boolean
  align?: 'left' | 'center' | 'right' | 'justify'
  size?: number
  bold?: boolean
  italic?: boolean
  color?: string
}

interface Text {
  type: number
  text: string
  style?: TextStyle
}

function styleOf(v: DataView, rec: Rec): TextStyle {
  const out: TextStyle = {}
  let p = rec.start
  const u16 = () => {
    const x = v.getUint16(p, true)
    p += 2
    return x
  }
  const u32 = () => {
    const x = v.getUint32(p, true)
    p += 4
    return x
  }
  try {
    u32() // character count of the first paragraph run
    u16() // indent level
    const pf = u32()
    if (pf & 0xf) out.bullet = (u16() & 1) !== 0
    if (pf & 0x80) u16()
    if (pf & 0x10) u16()
    if (pf & 0x40) u16()
    if (pf & 0x20) u32()
    if (pf & 0x800) out.align = (['left', 'center', 'right', 'justify'] as const)[u16()] ?? 'left'
    if (pf & 0x1000) u16()
    if (pf & 0x2000) u16()
    if (pf & 0x4000) u16()
    if (pf & 0x100) u16()
    if (pf & 0x400) u16()
    if (pf & 0x8000) u16()
    if (pf & 0x100000) p += u16() * 4
    if (pf & 0x10000) u16()
    if (pf & 0xe0000) u16()
    if (pf & 0x200000) u16()
    // Only the first paragraph run is read; the character runs follow all of them.
    return out
  } catch {
    return out
  }
}

function charStyleOf(v: DataView, rec: Rec, textLength: number): TextStyle {
  // Skip the paragraph runs (they cover textLength + 1 characters), then read the first character run.
  const out: TextStyle = {}
  let p = rec.start
  const u16 = () => {
    const x = v.getUint16(p, true)
    p += 2
    return x
  }
  const u32 = () => {
    const x = v.getUint32(p, true)
    p += 4
    return x
  }
  try {
    let covered = 0
    while (covered < textLength + 1 && p < rec.end) {
      covered += u32()
      u16()
      const pf = u32()
      if (pf & 0xf) u16()
      if (pf & 0x80) u16()
      if (pf & 0x10) u16()
      if (pf & 0x40) u16()
      if (pf & 0x20) u32()
      for (const bit of [0x800, 0x1000, 0x2000, 0x4000, 0x100, 0x400, 0x8000]) if (pf & bit) u16()
      if (pf & 0x100000) p += u16() * 4
      if (pf & 0x10000) u16()
      if (pf & 0xe0000) u16()
      if (pf & 0x200000) u16()
    }
    if (p + 8 > rec.end) return out
    u32()
    const cf = u32()
    if (cf & 0xffff) {
      const style = u16()
      if (cf & 0x1) out.bold = (style & 1) !== 0
      if (cf & 0x2) out.italic = (style & 2) !== 0
    }
    if (cf & 0x10000) u16()
    if (cf & 0x200000) u16()
    if (cf & 0x400000) u16()
    if (cf & 0x800000) u16()
    if (cf & 0x20000) out.size = u16()
    if (cf & 0x40000) {
      const c = u32()
      // Only direct RGB colors (index 0xFE); scheme colors keep the default.
      if (c >>> 24 === 0xfe) out.color = `#${[c & 0xff, (c >> 8) & 0xff, (c >> 16) & 0xff].map((b) => b.toString(16).padStart(2, '0')).join('')}`
    }
  } catch {
    // Truncated: what was read is kept.
  }
  return out
}

export async function parsePpt(buffer: ArrayBuffer): Promise<{ ratio: Ratio; slides: SlideData[] }> {
  const cfb = readCompoundFile(buffer)
  const doc = cfb.get('PowerPoint Document')
  const user = cfb.get('Current User')
  if (!doc) throw new Error(t('Not a PowerPoint presentation'))
  const v = new DataView(doc.buffer, doc.byteOffset, doc.byteLength)
  const header = (at: number): Rec | null => {
    if (at + 8 > doc.length) return null
    const verInst = v.getUint16(at, true)
    const len = v.getUint32(at + 4, true)
    return { type: v.getUint16(at + 2, true), instance: verInst >> 4, container: (verInst & 0xf) === 0xf, start: at + 8, end: Math.min(doc.length, at + 8 + len) }
  }
  const kids = (rec: Rec): Rec[] => {
    const out: Rec[] = []
    for (let p = rec.start; p + 8 <= rec.end; ) {
      const h = header(p)
      if (!h) break
      out.push(h)
      p = h.end
    }
    return out
  }
  const descendants = (rec: Rec, depth = 0): Rec[] => kids(rec).flatMap((k) => [k, ...(k.container && depth < 12 ? descendants(k, depth + 1) : [])])

  // Persist directory (newest edit first; older entries do not override).
  const persist = new Map<number, number>()
  let edit = user && user.length >= 20 ? new DataView(user.buffer, user.byteOffset, user.byteLength).getUint32(16, true) : -1
  let docRef = -1
  for (let guard = 0; edit >= 0 && edit < doc.length && guard < 64; guard++) {
    const ue = header(edit)
    if (!ue || ue.type !== REC.userEdit) break
    if (docRef < 0) docRef = v.getUint32(ue.start + 16, true)
    const dir = header(v.getUint32(ue.start + 12, true))
    if (dir?.type === REC.persistDirectory) {
      for (let p = dir.start; p + 4 <= dir.end; ) {
        const entry = v.getUint32(p, true)
        const id = entry & 0xfffff
        const count = entry >>> 20
        for (let k = 0; k < count && p + 8 + k * 4 <= dir.end; k++) if (!persist.has(id + k)) persist.set(id + k, v.getUint32(p + 4 + k * 4, true))
        p += 4 + count * 4
      }
    }
    const last = v.getUint32(ue.start + 8, true)
    edit = last && last !== edit ? last : -1
  }
  let documentRec = docRef >= 0 && persist.has(docRef) ? header(persist.get(docRef)!) : null
  if (documentRec?.type !== REC.document) {
    // Fall back to scanning the stream.
    documentRec = null
    for (let p = 0; p + 8 <= doc.length; ) {
      const h = header(p)
      if (!h) break
      if (h.type === REC.document) {
        documentRec = h
        break
      }
      p = h.end
    }
  }
  if (!documentRec) throw new Error(t('Not a PowerPoint presentation'))

  const docKids = kids(documentRec)
  const atom = docKids.find((k) => k.type === REC.documentAtom)
  const width = atom ? v.getInt32(atom.start, true) : 5760
  const height = atom ? v.getInt32(atom.start + 4, true) : 4320
  const ratio: Ratio = Math.abs(width / height - 4 / 3) < 0.05 ? '4:3' : '16:9'
  const target = SLIDE_SIZES[ratio]
  const scale = target.width / width

  // Slide list: slide persist ids with the placeholder texts that follow each.
  const slides: { persistId: number; texts: Text[] }[] = []
  const list = docKids.find((k) => k.type === REC.slideListWithText && k.instance === 0)
  if (list) {
    let pendingType = 1
    for (const k of kids(list)) {
      if (k.type === REC.slidePersist) slides.push({ persistId: v.getUint32(k.start, true), texts: [] })
      else if (k.type === REC.textHeader) pendingType = v.getUint32(k.start, true)
      else if ((k.type === REC.textChars || k.type === REC.textBytes) && slides.length) slides[slides.length - 1].texts.push({ type: pendingType, text: textOf(doc, k) })
      else if (k.type === REC.styleTextProp && slides.length) {
        const last = slides[slides.length - 1].texts.at(-1)
        if (last && !last.style) last.style = { ...styleOf(v, k), ...charStyleOf(v, k, last.text.length) }
      }
    }
  }

  const out: SlideData[] = []
  for (const s of slides) {
    const cells: CellRecord[] = [{ id: '0' }, { id: '1', parent: '0' }]
    let previous: string | undefined
    const push = (rec: Omit<CellRecord, 'id' | 'parent'>) => {
      const id = newCellId()
      cells.push({ id, parent: '1', ...(previous ? { previous } : {}), ...rec })
      previous = id
    }
    const offset = persist.get(s.persistId)
    const slideRec = offset !== undefined ? header(offset) : null
    const shapes = slideRec?.type === REC.slide ? descendants(slideRec).filter((r) => r.type === REC.spContainer) : []
    let placed = 0
    for (const sp of shapes) {
      const parts = kids(sp)
      const anchor = parts.find((p) => p.type === REC.clientAnchor) ?? parts.find((p) => p.type === REC.childAnchor)
      if (!anchor) continue
      let top: number, left: number, right: number, bottom: number
      if (anchor.end - anchor.start >= 16) [left, top, right, bottom] = [0, 4, 8, 12].map((o) => v.getInt32(anchor.start + o, true))
      else [top, left, right, bottom] = [0, 2, 4, 6].map((o) => v.getInt16(anchor.start + o, true))
      const geometry = JSON.stringify({ x: round(left * scale), y: round(top * scale), width: Math.max(1, round((right - left) * scale)), height: Math.max(1, round((bottom - top) * scale)) })
      const box = parts.find((p) => p.type === REC.clientTextbox)
      let text: Text | null = null
      if (box) {
        let type = 1
        for (const k of kids(box)) {
          if (k.type === REC.textHeader) type = v.getUint32(k.start, true)
          else if (k.type === REC.textChars || k.type === REC.textBytes) text = { type, text: textOf(doc, k) }
          else if (k.type === REC.styleTextProp && text && !text.style) text.style = { ...styleOf(v, k), ...charStyleOf(v, k, text.text.length) }
          else if (k.type === REC.outlineTextRef) text = s.texts[v.getUint32(k.start, true)] ?? null
        }
      }
      const fill = fillOf(v, parts.find((p) => p.type === REC.fopt))
      if (!text?.text.trim() && !fill) continue
      if (text?.text.trim()) placed++
      push(textCell(text, fill, geometry))
    }
    // Older files keep the texts only in the slide list: lay them out as title and body.
    if (!placed) {
      let y = 40
      for (const tx of s.texts) {
        if (!tx.text.trim()) continue
        const title = tx.type === 0 || tx.type === 6
        const h = title ? 90 : target.height - y - 40
        push(textCell(tx, null, JSON.stringify({ x: 60, y, width: target.width - 120, height: Math.max(60, h) })))
        y += h + 20
      }
    }
    out.push({ id: crypto.randomUUID(), name: `Slide ${out.length + 1}`, cells, notes: '' })
  }
  if (!out.length) throw new Error(t('The presentation has no slides'))
  return { ratio, slides: out }
}

const round = (n: number) => Math.round(n * 100) / 100

function textOf(doc: Uint8Array, rec: Rec): string {
  let s = ''
  if (rec.type === REC.textChars) for (let p = rec.start; p + 1 < rec.end; p += 2) s += String.fromCharCode(doc[p] | (doc[p + 1] << 8))
  else for (let p = rec.start; p < rec.end; p++) s += String.fromCharCode(doc[p])
  return s
}

// Solid fill of a shape (FOPT fillColor when the shape is filled), as #rrggbb.
function fillOf(v: DataView, fopt: Rec | undefined): string | null {
  if (!fopt) return null
  let color: string | null = null
  let filled = true
  const count = fopt.instance
  for (let i = 0; i < count; i++) {
    const at = fopt.start + i * 6
    if (at + 6 > fopt.end) break
    const id = v.getUint16(at, true) & 0x3fff
    const value = v.getUint32(at + 2, true)
    if (id === 0x0181 && !(value & 0xff000000)) color = `#${[value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff].map((b) => b.toString(16).padStart(2, '0')).join('')}`
    // fFilled (bit 4) counts only when fUsefFilled (bit 20) is set.
    if (id === 0x01bf && value & 0x100000) filled = (value & 0x10) !== 0
  }
  return filled ? color : null
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

// A text box cell; titles are large and bold, body placeholders get bullets.
function textCell(text: Text | null, fill: string | null, geometry: string): Omit<CellRecord, 'id' | 'parent'> {
  const type = text?.type ?? 4
  const title = type === 0 || type === 6
  const st = text?.style ?? {}
  const bullets = st.bullet ?? (type === 1 || type === 5)
  const paragraphs = (text?.text ?? '').split('\r').map((p) => escapeHtml(p).replace(/\v/g, '<br>'))
  const html = bullets && paragraphs.length > 0 && !title ? `<ul>${paragraphs.map((p) => `<li>${p}</li>`).join('')}</ul>` : paragraphs.map((p) => `<div>${p || '<br>'}</div>`).join('')
  const size = st.size ?? (title ? 36 : 20)
  const align = st.align ?? (type === 5 || type === 6 ? 'center' : 'left')
  const bold = st.bold ?? title
  const style =
    (fill ? '' : 'text;') +
    `html=1;whiteSpace=wrap;overflow=hidden;spacing=4;fillColor=${fill ?? 'none'};strokeColor=none;` +
    `align=${align};verticalAlign=${title ? 'middle' : 'top'};fontSize=${size};fontColor=${st.color ?? '#000000'};` +
    `fontStyle=${(bold ? 1 : 0) | (st.italic ? 2 : 0)};`
  return { vertex: 1, value: text?.text.trim() ? html : '', style, geometry }
}
