// Word 97-2003 (.doc) import: text from the piece table with paragraphs,
// headings and title styles, bold / italic / underline / strike / size /
// color / highlight / super- and subscript, alignment, bulleted and numbered
// lists, tables (with merged cells), footnotes, hyperlinks, page breaks,
// inline pictures (JPEG/PNG), the default header and footer (with page
// numbers) and comments (with their ranges and authors).
// Not imported (listed in `notImported` so the app can tell the user):
// endnotes, text boxes and floating shapes, other picture formats.

import type { JSONContent } from '@tiptap/core'
import { readCompoundFile } from '../../../core/cfb'
import { bytesToDataUrl } from '../../../core/formats'
import { t } from '../../../core/i18n'
import { DEFAULT_PAGE, type CommentData, type ImportedDocument, type PageSettings } from './types'

// FibRgFcLcb97 indexes (MS-DOC 2.5.6).
const FC = {
  stshf: 1,
  plcffndRef: 2,
  plcffndTxt: 3,
  plcfandRef: 4,
  plcfandTxt: 5,
  plcfSed: 6,
  plcfHdd: 11,
  plcfBteChpx: 12,
  plcfBtePapx: 13,
  clx: 33,
  grpXstAtnOwners: 36,
  sttbfAtnBkmk: 37,
  plcfAtnBkf: 42,
  plcfAtnBkl: 43,
  plfLst: 73,
  plfLfo: 74,
}

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
  // Row end paragraphs: cell boundaries (twips) and merge flags (TDefTable).
  cells?: { centers: number[]; merge: number[]; vmerge: number[] }
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
      // sprmTDefTable: the 2-byte count includes one byte of itself.
      if (sprm === 0xd608) return 1 + (data[at] | (data[at + 1] << 8))
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
      // Character shading (what LibreOffice writes for highlighting).
      case 0x4866: {
        const back = ((op[0] | (op[1] << 8)) >> 5) & 31
        if (!c.highlight && back && ICO[back] && ICO[back] !== '#ffffff') c.highlight = ICO[back]
        break
      }
      case 0xca71:
        // cb, cvFore (4), cvBack (4: r g b, 0xff = automatic), ipat.
        if (op.length >= 9 && op[8] !== 0xff) {
          const hex = `#${[op[5], op[6], op[7]].map((b) => b.toString(16).padStart(2, '0')).join('')}`
          if (hex !== '#ffffff') c.highlight = hex
        }
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
  const vertMerge: [number, number][] = []
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
      case 0xd608: {
        // cb (2), itcMac, rgdxaCenter[itcMac + 1], TC80[itcMac] (20 bytes; flags first).
        const dv = new DataView(op.buffer, op.byteOffset, op.byteLength)
        const count = op[2]
        if (op.length < 3 + (count + 1) * 2) break
        const centers = Array.from({ length: count + 1 }, (_, k) => dv.getInt16(3 + k * 2, true))
        const tcAt = 3 + (count + 1) * 2
        const flags = Array.from({ length: count }, (_, k) => (tcAt + k * 20 + 2 <= op.length ? dv.getUint16(tcAt + k * 20, true) : 0))
        p.cells = {
          centers,
          merge: flags.map((f) => (f & 2 ? 1 : 0)),
          // 0 none, 1 continues the cell above, 2 starts a vertical merge.
          vmerge: flags.map((f) => (f & 0x20 ? (f & 0x40 ? 2 : 1) : 0)),
        }
        break
      }
      case 0xd62b:
        // sprmTVertMerge: cb, itc, vertMerge (1 continue, 3 restart).
        vertMerge.push([op[1], op[2] === 1 ? 1 : op[2] === 3 ? 2 : 0])
        break
    }
  }
  for (const [itc, v] of vertMerge) if (p.cells && itc < p.cells.vmerge.length) p.cells.vmerge[itc] = v
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

  // Comments (annotations): text, author and the commented range.
  const ccpHdd = lw(5)
  const ccpMcr = lw(6)
  const ccpAtn = lw(7)
  const comments: CommentData[] = []
  const commentRanges: { id: string; from: number; to: number }[] = []
  {
    const [fcRef, lcbRef] = fcLcb(FC.plcfandRef)
    const [fcTxt, lcbTxt] = fcLcb(FC.plcfandTxt)
    const count = lcbRef >= 4 ? Math.floor((lcbRef - 4) / 34) : 0
    if (count && lcbTxt) {
      const base = ccpText + ccpFtn + ccpHdd + ccpMcr
      const txt = Array.from({ length: lcbTxt / 4 }, (_, i) => tv.getUint32(fcTxt + i * 4, true))
      // Authors: a list of length-prefixed UTF-16 strings.
      const owners: string[] = []
      {
        const [fc, lcb] = fcLcb(FC.grpXstAtnOwners)
        for (let q = fc; q + 2 <= fc + lcb; ) {
          const len = tv.getUint16(q, true)
          let name = ''
          for (let k = 0; k < len; k++) name += String.fromCharCode(tv.getUint16(q + 2 + k * 2, true))
          owners.push(name)
          q += 2 + len * 2
        }
      }
      // Range bookmarks: tag → [start, end] character positions.
      const bookmarks = new Map<number, [number, number]>()
      try {
        const [fcS, lcbS] = fcLcb(FC.sttbfAtnBkmk)
        const [fcF, lcbF] = fcLcb(FC.plcfAtnBkf)
        const [fcL, lcbL] = fcLcb(FC.plcfAtnBkl)
        if (lcbS && lcbF && lcbL && tv.getUint16(fcS, true) === 0xffff) {
          const n = tv.getUint16(fcS + 2, true)
          const cbExtra = tv.getUint16(fcS + 4, true)
          const nf = (lcbF - 4) / 8
          const nl = (lcbL - 4) / 4
          let q = fcS + 6
          for (let k = 0; k < n && k < nf; k++) {
            const cch = tv.getUint16(q, true)
            q += 2 + cch * 2
            const tag = cbExtra >= 6 ? tv.getInt32(q + 2, true) : -1
            q += cbExtra
            const start = tv.getUint32(fcF + k * 4, true)
            const ibkl = tv.getUint16(fcF + (nf + 1) * 4 + k * 4, true)
            if (ibkl < nl) bookmarks.set(tag, [start, tv.getUint32(fcL + ibkl * 4, true)])
          }
        }
      } catch {
        // Without bookmarks, comments anchor on the word before their mark.
      }
      for (let k = 0; k < count; k++) {
        const ref = tv.getUint32(fcRef + k * 4, true)
        const at = fcRef + (count + 1) * 4 + k * 30
        const ibst = tv.getInt16(at + 20, true)
        const tag = tv.getInt32(at + 26, true)
        const from = base + (txt[k] ?? 0)
        const to = base + (txt[k + 1] ?? txt[k] ?? 0)
        const text = clean(chars.slice(from, Math.min(to, base + ccpAtn)).join(''))
          .replace(/\u0005/g, '')
          .replace(/\u0007/g, '\n')
          .trim()
        let range = bookmarks.get(tag)
        if (!range || range[0] >= range[1] || range[1] > ccpText) {
          let start = ref
          while (start > 0 && /\s/.test(chars[start - 1] ?? '')) start--
          while (start > 0 && /\S/.test(chars[start - 1] ?? '') && chars[start - 1] >= ' ') start--
          range = [start, ref]
        }
        const id = String(k + 1)
        comments.push({ id, author: owners[ibst] ?? '', date: 0, text })
        if (range[0] < range[1]) commentRanges.push({ id, from: range[0], to: range[1] })
      }
    }
  }

  // Parses the characters [start, end) into blocks (the body or a header / footer story).
  const parseStory = (start: number, end: number): JSONContent[] => {
    const body: JSONContent[] = []
    let inline: JSONContent[] = []
    const fieldStack: { code: string; result: boolean; link?: string; skip?: boolean }[] = []
    type Cell = { node: JSONContent; merge: number; vmerge: number }
    let table_: { rows: { cells: Cell[]; centers: number[] }[]; cell: JSONContent[]; row: JSONContent[] } | null = null
    const listStack: { node: JSONContent; kind: string; level: number }[] = []
    // A TOC field being read: its paragraphs become the entries of one node.
    let toc: { maxLevel: number; entries: { level: number; text: string; page?: number }[]; depth: number } | null = null

    const pushText = (text: string, i: number) => {
      const c = chpAt(i)
      const marks: NonNullable<JSONContent['marks']> = []
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
      for (const r of commentRanges) if (i >= r.from && i < r.to) marks.push({ type: 'commentRange', attrs: { id: r.id } })
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
          const cells = pap.cells
          table_.rows.push({
            cells: table_.row.map((node, k) => ({ node, merge: cells?.merge[k] ?? 0, vmerge: cells?.vmerge[k] ?? 0 })),
            centers: cells && cells.centers.length === table_.row.length + 1 ? cells.centers : [],
          })
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
      // Headings keep their level: outline numbering attached to heading styles is not a list.
      const list = pap.ilfo && !style?.heading ? lists(pap.ilfo, pap.ilvl ?? 0) : null
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
        listStack[level].node.content!.push({ type: 'listItem', content: [node] })
        return
      }
      listStack.length = 0
      body.push(node)
    }
    // Builds the table: cell boundaries give column spans; merge flags give
    // horizontal (old style) and vertical merges.
    const flushTable = () => {
      if (!table_) return
      const rows = table_.rows.filter((r) => r.cells.length)
      table_ = null
      if (!rows.length) return
      const grid: number[] = []
      for (const r of rows) for (const x of r.centers) if (!grid.some((g) => Math.abs(g - x) < 30)) grid.push(x)
      grid.sort((a, b) => a - b)
      const col = (x: number) => grid.findIndex((g) => Math.abs(g - x) < 30)
      // Per row: [cell, start column, span].
      const laid = rows.map((r) => {
        const out: { cell: Cell; start: number; span: number }[] = []
        r.cells.forEach((cell, k) => {
          const a = r.centers.length ? col(r.centers[k]) : k
          const b = r.centers.length ? col(r.centers[k + 1]) : k + 1
          const span = Math.max(1, b - a)
          const prev = out[out.length - 1]
          if (cell.merge && prev) prev.span += span
          else out.push({ cell, start: a, span })
        })
        return out
      })
      const content: JSONContent[] = []
      laid.forEach((row, ri) => {
        const cells: JSONContent[] = []
        for (const { cell, start, span } of row) {
          if (cell.vmerge === 1 && ri > 0) continue
          let rowspan = 1
          if (cell.vmerge === 2) {
            for (let rj = ri + 1; rj < laid.length; rj++) {
              if (laid[rj].some((c) => c.start === start && c.cell.vmerge === 1)) rowspan++
              else break
            }
          }
          const attrs: Record<string, unknown> = {}
          if (span > 1) attrs.colspan = span
          if (rowspan > 1) attrs.rowspan = rowspan
          cells.push(Object.keys(attrs).length ? { ...cell.node, attrs: { ...cell.node.attrs, ...attrs } } : cell.node)
        }
        if (cells.length) content.push({ type: 'tableRow', content: cells })
      })
      if (content.length) body.push({ type: 'table', content })
    }

    for (let i = start; i < Math.min(end, chars.length); i++) {
      const ch = chars[i]
      const code = ch.charCodeAt(0)
      if (code === 0x13) {
        fieldStack.push({ code: '', result: false })
        continue
      }
      if (code === 0x14 && fieldStack.length) {
        const f = fieldStack[fieldStack.length - 1]
        f.result = true
        const m = /^\s*HYPERLINK\s+(?:\\l\s+)?"([^"]+)"/i.exec(f.code)
        if (m) f.link = /\\l/.test(f.code) ? `#${m[1]}` : m[1]
        // Page numbers (headers and footers) become live fields.
        const page = /^\s*(PAGE|NUMPAGES|SECTIONPAGES)\b/i.exec(f.code)?.[1].toUpperCase()
        if (page) {
          inline.push({ type: 'pageNumber', attrs: { kind: page === 'PAGE' ? 'page' : 'total' } })
          f.skip = true
        }
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
        continue
      }
      const field = fieldStack[fieldStack.length - 1]
      if (field && !field.result) {
        field.code += ch
        continue
      }
      if (field?.skip && ch !== '\r' && code !== 0x07) continue
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
        else notImported.add('pictures')
        continue
      }
      if (code === 0x08 && chpAt(i).special) notImported.add('shapes')
      if (code < 0x20 && code !== 0x09) continue
      if (code === 0x1e) {
        pushText('‑', i)
        continue
      }
      if (code === 0x1f) continue
      pushText(ch, i)
    }
    if (inline.length) finishParagraph(Math.min(end, chars.length) - 1)
    flushTable()
    // Trailing empty paragraph of a story.
    while (body.length > 1 && body[body.length - 1].type === 'paragraph' && !body[body.length - 1].content?.length) body.pop()
    return body
  }

  const notImported = new Set<string>()
  const body = parseStory(0, ccpText)
  // Headers and footers of the first section: stories 6-11 of the header
  // document (even header, odd header, even footer, odd footer, first header,
  // first footer); the odd ones are the default, the others are fallbacks.
  let header: JSONContent | null = null
  let footer: JSONContent | null = null
  {
    const [fc, lcb] = fcLcb(FC.plcfHdd)
    const cps = lcb ? Array.from({ length: lcb / 4 }, (_, i) => tv.getUint32(fc + i * 4, true)) : []
    const base = ccpText + ccpFtn
    const story = (k: number): JSONContent | null => {
      if (k + 1 >= cps.length || cps[k + 1] <= cps[k]) return null
      const blocks = parseStory(base + cps[k], base + Math.min(cps[k + 1], ccpHdd))
      const empty = blocks.every((b) => b.type === 'paragraph' && !b.content?.length)
      return empty ? null : { type: 'doc', content: blocks }
    }
    header = story(7) ?? story(10) ?? story(6)
    footer = story(9) ?? story(11) ?? story(8)
  }
  if (lw(8) > 0) notImported.add('endnotes')
  if (lw(9) > 0 || lw(10) > 0) notImported.add('shapes')

  return {
    body: { type: 'doc', content: body.length ? body : [{ type: 'paragraph' }] },
    header,
    footer,
    page: pageSettings(table, tv, fcLcb(FC.plcfSed), word) ?? DEFAULT_PAGE,
    ...(comments.length ? { comments } : {}),
    ...(notImported.size ? { notImported: [...notImported] } : {}),
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
