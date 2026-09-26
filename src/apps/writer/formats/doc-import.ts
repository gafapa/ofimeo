// Word 97-2003 (.doc) import: text from the piece table with paragraphs,
// headings and title styles, bold / italic / underline / strike / size /
// color / super- and subscript, alignment, bulleted and numbered lists,
// tables, footnotes, hyperlinks, page breaks and inline pictures (JPEG/PNG).
// Not imported: headers/footers, floating shapes, comments, tracked changes.

import type { JSONContent } from '@tiptap/core'
import { readCompoundFile } from '../../../core/cfb'
import { bytesToDataUrl } from '../../../core/formats'
import { t } from '../../../core/i18n'
import { DEFAULT_PAGE, type ImportedDocument, type PageSettings } from './types'

// FibRgFcLcb97 indexes (MS-DOC 2.5.6).
const FC = { stshf: 1, plcffndRef: 2, plcffndTxt: 3, plcfSed: 6, plcfBteChpx: 12, plcfBtePapx: 13, clx: 33, plfLst: 73, plfLfo: 74 }

// Windows-1252 characters 0x80-0x9F (compressed pieces).
const CP1252 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ'

interface Chp {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  size?: number
  color?: string
  vert?: 'sup' | 'sub'
  highlight?: string
  picture?: number
  special?: boolean
}

interface Pap {
  istd: number
  align?: 'center' | 'right' | 'justify'
  ilfo?: number
  ilvl?: number
  inTable?: boolean
  rowEnd?: boolean
  pageBreakBefore?: boolean
}

interface Run {
  fcStart: number
  fcEnd: number
  grpprl: Uint8Array
}

const ICO = ['', '#000000', '#0000ff', '#00ffff', '#00ff00', '#ff00ff', '#ff0000', '#ffff00', '#ffffff', '#000080', '#008080', '#008000', '#800080', '#800000', '#808000', '#808080', '#c0c0c0']

// Operand size of a property modifier (sprm).
function sprmSize(sprm: number, data: Uint8Array, at: number): number {
  switch ((sprm >> 13) & 7) {
    case 0:
    case 1:
      return 1
    case 2:
    case 4:
    case 5:
      return 2
    case 3:
      return 4
    case 7:
      return 3
    default:
      // Variable: sprmTDefTable / sprmPChgTabs have 2-byte lengths.
      if (sprm === 0xd608) return 2 + (data[at] | (data[at + 1] << 8))
      if (sprm === 0xc615) return 1 + (data[at] === 255 ? 0 : data[at])
      return 1 + data[at]
  }
}

function* sprms(grpprl: Uint8Array): Generator<[number, Uint8Array]> {
  let i = 0
  while (i + 2 <= grpprl.length) {
    const sprm = grpprl[i] | (grpprl[i + 1] << 8)
    i += 2
    const size = sprmSize(sprm, grpprl, i)
    yield [sprm, grpprl.subarray(i, i + size)]
    i += size
  }
}

function toggle(op: number): boolean | undefined {
  return op === 0 ? false : op === 1 ? true : op === 0x81 ? true : undefined
}

function chpOf(grpprl: Uint8Array): Chp {
  const c: Chp = {}
  for (const [sprm, op] of sprms(grpprl)) {
    const u16 = op[0] | (op[1] << 8)
    switch (sprm) {
      case 0x0835:
        c.bold = toggle(op[0])
        break
      case 0x0836:
        c.italic = toggle(op[0])
        break
      case 0x0837:
      case 0x2a53:
        c.strike = toggle(op[0])
        break
      case 0x2a3e:
        c.underline = op[0] !== 0
        break
      case 0x4a43:
        c.size = u16 / 2
        break
      case 0x2a42:
        c.color = ICO[op[0]] || undefined
        break
      case 0x6870:
        if (op[3] === 0) c.color = `#${[op[0], op[1], op[2]].map((b) => b.toString(16).padStart(2, '0')).join('')}`
        break
      case 0x2a48:
        c.vert = op[0] === 1 ? 'sup' : op[0] === 2 ? 'sub' : undefined
        break
      case 0x2a0c:
        c.highlight = ICO[op[0]] || undefined
        break
      case 0x6a03:
        c.picture = op[0] | (op[1] << 8) | (op[2] << 16) | (op[3] << 24)
        break
      case 0x0855:
        c.special = op[0] === 1
        break
    }
  }
  return c
}

function papOf(data: Uint8Array): Pap {
  const p: Pap = { istd: data[0] | (data[1] << 8) }
  for (const [sprm, op] of sprms(data.subarray(2))) {
    switch (sprm) {
      case 0x2403:
      case 0x2461: {
        const jc = op[0]
        p.align = jc === 1 ? 'center' : jc === 2 ? 'right' : jc === 3 || jc === 4 ? 'justify' : undefined
        break
      }
      case 0x460b:
        p.ilfo = op[0] | (op[1] << 8)
        break
      case 0x260a:
        p.ilvl = op[0]
        break
      case 0x2416:
        p.inTable = op[0] === 1
        break
      case 0x2417:
        p.rowEnd = op[0] === 1
        break
      case 0x2407:
        p.pageBreakBefore = op[0] === 1
        break
    }
  }
  return p
}

export async function importDoc(buffer: ArrayBuffer): Promise<ImportedDocument> {
  const cfb = readCompoundFile(buffer)
  const word = cfb.get('WordDocument')
  if (!word) throw new Error(t('Not a Word document'))
  const wv = new DataView(word.buffer, word.byteOffset, word.byteLength)
  if (wv.getUint16(0, true) !== 0xa5ec) throw new Error(t('Not a Word document'))
  const flags = wv.getUint16(0x0a, true)
  if (flags & 0x0100) throw new Error(t('The document is protected with a password'))
  const table = cfb.get(flags & 0x0200 ? '1Table' : '0Table')
  if (!table) throw new Error(t('Not a Word document'))
  const tv = new DataView(table.buffer, table.byteOffset, table.byteLength)
  const data = cfb.get('Data')

  // FIB: counts and the (fc, lcb) pairs.
  const csw = wv.getUint16(32, true)
  const lwStart = 34 + csw * 2
  const cslw = wv.getUint16(lwStart, true)
  const lw = (i: number) => wv.getInt32(lwStart + 2 + i * 4, true)
  const ccpText = lw(3)
  const ccpFtn = lw(4)
  const fcStart = lwStart + 2 + cslw * 4 + 2
  const fcLcb = (i: number): [number, number] => [wv.getUint32(fcStart + i * 8, true), wv.getUint32(fcStart + i * 8 + 4, true)]

  // Piece table: character positions → file offsets.
  const [fcClx, lcbClx] = fcLcb(FC.clx)
  let p = fcClx
  while (p < fcClx + lcbClx && table[p] === 0x01) p += 3 + tv.getInt16(p + 1, true)
  if (table[p] !== 0x02) throw new Error(t('Could not read the document text'))
  const lcbPcd = tv.getUint32(p + 1, true)
  const n = (lcbPcd - 4) / 12
  const cps: number[] = []
  for (let i = 0; i <= n; i++) cps.push(tv.getUint32(p + 5 + i * 4, true))
  const pieces = Array.from({ length: n }, (_, i) => {
    const fcRaw = tv.getUint32(p + 5 + (n + 1) * 4 + i * 8 + 2, true)
    const compressed = (fcRaw & 0x40000000) !== 0
    return { cpStart: cps[i], cpEnd: cps[i + 1], fc: compressed ? (fcRaw & 0x3fffffff) / 2 : fcRaw, compressed }
  })
  // Characters and their file offsets.
  const chars: string[] = []
  const fcs: number[] = []
  for (const pc of pieces) {
    for (let cp = pc.cpStart; cp < pc.cpEnd; cp++) {
      const fc = pc.fc + (cp - pc.cpStart) * (pc.compressed ? 1 : 2)
      let ch: string
      if (pc.compressed) {
        const b = word[fc]
        ch = b >= 0x80 && b <= 0x9f ? CP1252[b - 0x80] : String.fromCharCode(b)
      } else ch = String.fromCharCode(word[fc] | (word[fc + 1] << 8))
      chars.push(ch)
      fcs.push(fc)
    }
  }

  // Formatting runs from the FKPs.
  const bte = (index: number): number[] => {
    const [fc, lcb] = fcLcb(index)
    const count = (lcb - 4) / 8
    return Array.from({ length: count }, (_, i) => tv.getUint32(fc + (count + 1) * 4 + i * 4, true) & 0x3fffff)
  }
  const chpRuns: Run[] = []
  for (const pn of bte(FC.plcfBteChpx)) {
    const base = pn * 512
    const crun = word[base + 511]
    for (let i = 0; i < crun; i++) {
      const off = word[base + (crun + 1) * 4 + i] * 2
      const grpprl = off ? word.subarray(base + off + 1, base + off + 1 + word[base + off]) : new Uint8Array()
      chpRuns.push({ fcStart: wv.getUint32(base + i * 4, true), fcEnd: wv.getUint32(base + (i + 1) * 4, true), grpprl })
    }
  }
  const papRuns: Run[] = []
  for (const pn of bte(FC.plcfBtePapx)) {
    const base = pn * 512
    const crun = word[base + 511]
    for (let i = 0; i < crun; i++) {
      const off = word[base + (crun + 1) * 4 + i * 13] * 2
      let grpprl: Uint8Array = new Uint8Array([0, 0])
      if (off) {
        let cb = word[base + off]
        let start = base + off + 1
        let size = cb * 2 - 1
        if (cb === 0) {
          cb = word[start]
          start++
          size = cb * 2
        }
        grpprl = word.subarray(start, start + size)
      }
      papRuns.push({ fcStart: wv.getUint32(base + i * 4, true), fcEnd: wv.getUint32(base + (i + 1) * 4, true), grpprl })
    }
  }
  const find = (runs: Run[], fc: number) => {
    let lo = 0
    let hi = runs.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (fc < runs[mid].fcStart) hi = mid - 1
      else if (fc >= runs[mid].fcEnd) lo = mid + 1
      else return runs[mid]
    }
    return null
  }
  const chpCache = new Map<Run, Chp>()
  const chpAt = (i: number): Chp => {
    const run = find(chpRuns, fcs[i])
    if (!run) return {}
    let c = chpCache.get(run)
    if (!c) chpCache.set(run, (c = chpOf(run.grpprl)))
    return c
  }
  const papAt = (i: number): Pap => {
    const run = find(papRuns, fcs[i])
    return run ? papOf(run.grpprl) : { istd: 0 }
  }

  const styles = readStyles(table, tv, fcLcb(FC.stshf))
  const lists = readLists(table, tv, fcLcb(FC.plfLst), fcLcb(FC.plfLfo))

  // Footnotes: reference positions and their text.
  const notes = new Map<number, string>()
  {
    const [fcRef, lcbRef] = fcLcb(FC.plcffndRef)
    const [fcTxt, lcbTxt] = fcLcb(FC.plcffndTxt)
    const count = lcbRef ? (lcbRef - 4) / 6 : 0
    const txt = lcbTxt ? Array.from({ length: lcbTxt / 4 }, (_, i) => tv.getUint32(fcTxt + i * 4, true)) : []
    for (let i = 0; i < count; i++) {
      const ref = tv.getUint32(fcRef + i * 4, true)
      const from = ccpText + (txt[i] ?? 0)
      const to = ccpText + (txt[i + 1] ?? txt[i] ?? 0)
      notes.set(ref, clean(chars.slice(from, Math.min(to, ccpText + ccpFtn)).join('')).replace(/^\u0002\s*/, '').trim())
    }
  }

  // ---- Paragraphs → blocks ----
  const body: JSONContent[] = []
  let inline: JSONContent[] = []
  let fieldDepth = 0
  const fieldStack: { code: string; result: boolean; link?: string }[] = []
  let table_: { rows: JSONContent[][]; cell: JSONContent[]; row: JSONContent[] } | null = null
  const listStack: { node: JSONContent; kind: string; level: number }[] = []
  // A TOC field being read: its paragraphs become the entries of one node.
  let toc: { maxLevel: number; entries: { level: number; text: string; page?: number }[]; depth: number } | null = null

  const pushText = (text: string, i: number) => {
    const c = chpAt(i)
    const marks: JSONContent['marks'] = []
    if (c.bold) marks.push({ type: 'bold' })
    if (c.italic) marks.push({ type: 'italic' })
    const link = [...fieldStack].reverse().find((f) => f.link)?.link
    if (link) marks.push({ type: 'link', attrs: { href: link } })
    if (c.strike) marks.push({ type: 'strike' })
    if (c.underline && !link) marks.push({ type: 'underline' })
    const style: Record<string, string> = {}
    if (c.color && c.color !== '#000000') style.color = c.color
    if (c.size && c.size !== 11 && c.size !== 12) style.fontSize = `${c.size}pt`
    if (Object.keys(style).length) marks.push({ type: 'textStyle', attrs: style })
    if (c.highlight) marks.push({ type: 'highlight', attrs: { color: c.highlight } })
    if (c.vert === 'sup') marks.push({ type: 'superscript' })
    if (c.vert === 'sub') marks.push({ type: 'subscript' })
    const last = inline[inline.length - 1]
    if (last?.type === 'text' && JSON.stringify(last.marks ?? []) === JSON.stringify(marks)) last.text += text
    else inline.push(marks.length ? { type: 'text', text, marks } : { type: 'text', text })
  }

  const finishParagraph = (i: number) => {
    const pap = papAt(i)
    const style = styles.get(pap.istd)
    if (toc) {
      const text = inline.map((n) => n.text ?? '').join('')
      inline = []
      const tab = text.lastIndexOf('\t')
      const label = (tab >= 0 ? text.slice(0, tab) : text).replace(/\t/g, ' ').trim()
      const page = tab >= 0 ? Number(text.slice(tab + 1).trim()) : NaN
      if (label) toc.entries.push({ level: style?.toc ?? 1, text: label, ...(page > 0 ? { page } : {}) })
      return
    }
    const content = inline.length ? inline : undefined
    inline = []
    let node: JSONContent
    if (style?.heading) node = { type: 'heading', attrs: { level: style.heading, ...(pap.align ? { textAlign: pap.align } : {}) }, content }
    else {
      const attrs: Record<string, unknown> = {}
      if (pap.align) attrs.textAlign = pap.align
      if (style?.kind) attrs.styleId = style.kind
      node = { type: 'paragraph', ...(Object.keys(attrs).length ? { attrs } : {}), content }
    }
    if (pap.pageBreakBefore && !pap.inTable) body.push({ type: 'pageBreak' })
    // Tables: paragraphs until the cell mark; the row mark ends the row.
    if (pap.inTable) {
      table_ ??= { rows: [], cell: [], row: [] }
      if (pap.rowEnd) {
        table_.rows.push(table_.row)
        table_.row = []
        table_.cell = []
        return
      }
      table_.cell.push(node.type === 'heading' ? { ...node, type: 'paragraph', attrs: {} } : node)
      if (chars[i] === '\u0007') {
        table_.row.push({ type: 'tableCell', content: table_.cell })
        table_.cell = []
      }
      return
    }
    flushTable()
    const list = pap.ilfo ? lists(pap.ilfo, pap.ilvl ?? 0) : null
    if (list) {
      const level = Math.min(pap.ilvl ?? 0, listStack.length)
      listStack.length = Math.min(listStack.length, level + 1)
      if (listStack[level] && listStack[level].kind !== list) listStack.length = level
      if (listStack.length === level) {
        const l: JSONContent = { type: list === 'bullet' ? 'bulletList' : 'orderedList', content: [] }
        if (level === 0) body.push(l)
        else {
          const items = listStack[level - 1].node.content!
          items[items.length - 1].content!.push(l)
        }
        listStack.push({ node: l, kind: list, level })
      }
      listStack[level].node.content!.push({ type: 'listItem', content: [{ ...node, type: 'paragraph', attrs: node.type === 'heading' ? {} : node.attrs }] })
      return
    }
    listStack.length = 0
    body.push(node)
  }
  const flushTable = () => {
    if (!table_) return
    const rows = table_.rows.filter((r) => r.length)
    if (rows.length) body.push({ type: 'table', content: rows.map((cells) => ({ type: 'tableRow', content: cells })) })
    table_ = null
  }

  for (let i = 0; i < Math.min(ccpText, chars.length); i++) {
    const ch = chars[i]
    const code = ch.charCodeAt(0)
    if (code === 0x13) {
      fieldDepth++
      fieldStack.push({ code: '', result: false })
      continue
    }
    if (code === 0x14 && fieldStack.length) {
      const f = fieldStack[fieldStack.length - 1]
      f.result = true
      const m = /^\s*HYPERLINK\s+(?:\\l\s+)?"([^"]+)"/i.exec(f.code)
      if (m) f.link = /\\l/.test(f.code) ? `#${m[1]}` : m[1]
      if (/^\s*TOC\b/.test(f.code) && !toc) {
        const range = /\\o\s+"?(\d)-(\d)/.exec(f.code)
        if (inline.length) finishParagraph(i)
        toc = { maxLevel: range ? Math.min(6, Number(range[2])) : 3, entries: [], depth: fieldStack.length }
      }
      continue
    }
    if (code === 0x15 && fieldStack.length) {
      if (toc && fieldStack.length === toc.depth) {
        if (inline.length) finishParagraph(i)
        body.push({ type: 'tableOfContents', attrs: { maxLevel: toc.maxLevel, title: '', entries: toc.entries } })
        toc = null
      }
      fieldStack.pop()
      fieldDepth--
      continue
    }
    const field = fieldStack[fieldStack.length - 1]
    if (field && !field.result) {
      field.code += ch
      continue
    }
    if (ch === '\r' || code === 0x07) {
      finishParagraph(i)
      continue
    }
    if (code === 0x0c) {
      // Page or section break.
      if (inline.length) finishParagraph(i)
      flushTable()
      listStack.length = 0
      body.push({ type: 'pageBreak' })
      continue
    }
    if (code === 0x0b) {
      inline.push({ type: 'hardBreak' })
      continue
    }
    if (code === 0x02 && chpAt(i).special) {
      const note = notes.get(i)
      if (note !== undefined) inline.push({ type: 'footnote', attrs: { content: note } })
      continue
    }
    if (code === 0x01 && chpAt(i).special) {
      const img = data ? picture(data, chpAt(i).picture ?? -1) : null
      if (img) inline.push(img)
      continue
    }
    if (code < 0x20 && code !== 0x09) continue
    if (code === 0x1e) {
      pushText('‑', i)
      continue
    }
    if (code === 0x1f) continue
    pushText(ch, i)
  }
  if (inline.length) finishParagraph(Math.min(ccpText, chars.length) - 1)
  flushTable()
  void fieldDepth

  return {
    body: { type: 'doc', content: body.length ? body : [{ type: 'paragraph' }] },
    header: null,
    footer: null,
    page: pageSettings(table, tv, fcLcb(FC.plcfSed), word) ?? DEFAULT_PAGE,
  }
}

function clean(s: string): string {
  return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\r/g, '\n')
}

// Style sheet: headings (built-in sti 1-9) and title / subtitle.
interface StyleInfo {
  heading?: number
  kind?: 'title' | 'subtitle'
  toc?: number
}

function readStyles(table: Uint8Array, tv: DataView, [fc, lcb]: [number, number]): Map<number, StyleInfo> {
  const out = new Map<number, StyleInfo>()
  if (!lcb) return out
  const cbStshi = tv.getUint16(fc, true)
  const cstd = tv.getUint16(fc + 2, true)
  const cbBase = tv.getUint16(fc + 4, true)
  let p = fc + 2 + cbStshi
  for (let istd = 0; istd < cstd && p < fc + lcb; istd++) {
    const cbStd = tv.getUint16(p, true)
    if (cbStd) {
      const sti = tv.getUint16(p + 2, true) & 0x0fff
      let name = ''
      const at = p + 2 + cbBase
      if (at + 2 < table.length) {
        const len = tv.getUint16(at, true)
        for (let k = 0; k < len && at + 2 + k * 2 + 1 < table.length; k++) name += String.fromCharCode(tv.getUint16(at + 2 + k * 2, true))
      }
      const heading = sti >= 1 && sti <= 9 ? sti : Number(/^heading (\d)$/i.exec(name)?.[1] ?? 0)
      if (heading) out.set(istd, { heading: Math.min(6, heading) })
      else if (sti === 62 || /^title$/i.test(name)) out.set(istd, { kind: 'title' })
      else if (sti === 74 || /^subtitle$/i.test(name)) out.set(istd, { kind: 'subtitle' })
      else if ((sti >= 19 && sti <= 27) || /^(toc|contents) \d$/i.test(name)) out.set(istd, { toc: sti >= 19 && sti <= 27 ? sti - 18 : Number(name.slice(-1)) })
    }
    p += 2 + cbStd
  }
  return out
}

// Lists: bullet or numbered for (ilfo, ilvl).
function readLists(table: Uint8Array, tv: DataView, [fcLst, lcbLst]: [number, number], [fcLfo, lcbLfo]: [number, number]): (ilfo: number, ilvl: number) => string | null {
  const levels = new Map<number, number[]>() // lsid → nfc per level
  if (lcbLst) {
    const count = tv.getInt16(fcLst, true)
    let lvlAt = fcLst + 2 + count * 28
    for (let i = 0; i < count; i++) {
      const at = fcLst + 2 + i * 28
      const lsid = tv.getInt32(at, true)
      const simple = (table[at + 26] & 1) !== 0
      const nfcs: number[] = []
      for (let l = 0; l < (simple ? 1 : 9); l++) {
        nfcs.push(table[lvlAt + 4])
        const cbChpx = table[lvlAt + 24]
        const cbPapx = table[lvlAt + 25]
        lvlAt += 28 + cbPapx + cbChpx
        const xst = tv.getUint16(lvlAt, true)
        lvlAt += 2 + xst * 2
      }
      levels.set(lsid, nfcs)
    }
  }
  const lfos: number[] = []
  if (lcbLfo) {
    const count = tv.getInt32(fcLfo, true)
    for (let i = 0; i < count; i++) lfos.push(tv.getInt32(fcLfo + 4 + i * 16, true))
  }
  return (ilfo, ilvl) => {
    const lsid = lfos[ilfo - 1]
    const nfcs = lsid !== undefined ? levels.get(lsid) : undefined
    const nfc = nfcs ? (nfcs[Math.min(ilvl, nfcs.length - 1)] ?? 23) : 23
    return nfc === 23 || nfc === 255 ? 'bullet' : 'ordered'
  }
}

// Page size and margins of the first section (SEP in the WordDocument stream).
function pageSettings(_table: Uint8Array, tv: DataView, [fc, lcb]: [number, number], word: Uint8Array): PageSettings | null {
  if (!lcb) return null
  const count = (lcb - 4) / 16
  if (count < 1) return null
  const fcSepx = tv.getInt32(fc + (count + 1) * 4 + 2, true)
  if (fcSepx < 0 || fcSepx + 2 > word.length) return null
  const cb = word[fcSepx] | (word[fcSepx + 1] << 8)
  let w = 0
  let h = 0
  const m = { ...DEFAULT_PAGE.margins }
  const mm = (tw: number) => Math.round((tw / 1440) * 254) / 10
  for (const [sprm, op] of sprms(word.subarray(fcSepx + 2, fcSepx + 2 + cb))) {
    const v = op[0] | (op[1] << 8)
    if (sprm === 0xb01f) w = v
    else if (sprm === 0xb020) h = v
    else if (sprm === 0xb021) m.left = mm(v)
    else if (sprm === 0xb022) m.right = mm(v)
    else if (sprm === 0x9023) m.top = mm((v << 16) >> 16)
    else if (sprm === 0x9024) m.bottom = mm((v << 16) >> 16)
  }
  const landscape = w > h && h > 0
  const short = Math.min(w, h) / 56.7
  const size = !w ? DEFAULT_PAGE.size : Math.abs(short - 215.9) < 3 ? (Math.max(w, h) / 56.7 > 300 ? 'Legal' : 'Letter') : Math.abs(short - 148) < 3 ? 'A5' : 'A4'
  return { size, orientation: landscape ? 'landscape' : 'portrait', margins: m }
}

// Inline picture: the image data (JPEG / PNG blip) at `offset` in the Data stream.
function picture(data: Uint8Array, offset: number): JSONContent | null {
  if (offset < 0 || offset + 68 > data.length) return null
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const lcb = v.getInt32(offset, true)
  const cbHeader = v.getUint16(offset + 4, true)
  const dxaGoal = v.getInt16(offset + 28, true)
  const dyaGoal = v.getInt16(offset + 30, true)
  const mx = v.getUint16(offset + 32, true) || 1000
  const my = v.getUint16(offset + 34, true) || 1000
  const end = Math.min(data.length, offset + lcb)
  // Walk the OfficeArt records for a blip.
  for (let p = offset + cbHeader; p + 8 <= end; ) {
    const verInst = v.getUint16(p, true)
    const type = v.getUint16(p + 2, true)
    const len = v.getUint32(p + 4, true)
    const container = (verInst & 0xf) === 0xf
    if (type >= 0xf01a && type <= 0xf029) {
      const inst = verInst >> 4
      const mime = type === 0xf01d || type === 0xf02a ? 'image/jpeg' : type === 0xf01e ? 'image/png' : type === 0xf01f ? 'image/bmp' : null
      if (!mime) return null
      // 16-byte UID (two when the instance is odd), then a tag byte.
      const skip = 17 + ((mime === 'image/jpeg' && (inst === 0x46b || inst === 0x6e3)) || (mime === 'image/png' && inst === 0x6e1) || (mime === 'image/bmp' && inst === 0x7a9) ? 16 : 0)
      const bytes = data.subarray(p + 8 + skip, p + 8 + len)
      const width = Math.round(((dxaGoal * mx) / 1000) / 15)
      const height = Math.round(((dyaGoal * my) / 1000) / 15)
      return { type: 'image', attrs: { src: bytesToDataUrl(bytes, mime), ...(width > 0 && height > 0 ? { width, height } : {}) } }
    }
    if (type === 0xf007) {
      // BSE: the blip follows its 36-byte header.
      p += 8 + 36
      continue
    }
    p += container ? 8 : 8 + len
  }
  return null
}
