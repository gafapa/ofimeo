// Excel 97-2003 (.xls, BIFF8) import into a Univer workbook snapshot: sheets,
// values (numbers, text, booleans, errors, dates through number formats),
// formulas (common functions and references; others keep their last value),
// fonts, fills, alignment, merged cells, column widths and row heights.

import type { ICellData, IRange, IStyleData, IWorkbookData, IWorksheetData } from '@univerjs/presets'
import { readCompoundFile } from '../../../core/cfb'
import { t } from '../../../core/i18n'

const T_STRING = 1
const T_NUMBER = 2
const T_BOOLEAN = 3
const T_FORCE_STRING = 4
const DEFAULT_COL_PX = 88
const DEFAULT_ROW_PX = 24

const BUILTIN_FORMATS: Record<number, string> = {
  1: '0',
  2: '0.00',
  3: '#,##0',
  4: '#,##0.00',
  9: '0%',
  10: '0.00%',
  11: '0.00E+00',
  12: '# ?/?',
  13: '# ??/??',
  14: 'yyyy-mm-dd',
  15: 'd-mmm-yy',
  16: 'd-mmm',
  17: 'mmm-yy',
  18: 'h:mm AM/PM',
  19: 'h:mm:ss AM/PM',
  20: 'h:mm',
  21: 'h:mm:ss',
  22: 'yyyy-mm-dd h:mm',
  37: '#,##0 ;(#,##0)',
  38: '#,##0 ;[Red](#,##0)',
  39: '#,##0.00;(#,##0.00)',
  40: '#,##0.00;[Red](#,##0.00)',
  45: 'mm:ss',
  46: '[h]:mm:ss',
  47: 'mm:ss.0',
  48: '##0.0E+0',
  49: '@',
}

// Default BIFF8 palette (indexes 8-63).
const PALETTE = [
  '000000', 'ffffff', 'ff0000', '00ff00', '0000ff', 'ffff00', 'ff00ff', '00ffff', '800000', '008000', '000080', '808000', '800080', '008080', 'c0c0c0', '808080',
  '9999ff', '993366', 'ffffcc', 'ccffff', '660066', 'ff8080', '0066cc', 'ccccff', '000080', 'ff00ff', 'ffff00', '00ffff', '800080', '800000', '008080', '0000ff',
  '00ccff', 'ccffff', 'ccffcc', 'ffff99', '99ccff', 'ff99cc', 'cc99ff', 'ffcc99', '3366ff', '33cccc', '99cc00', 'ffcc00', 'ff9900', 'ff6600', '666699', '969696',
  '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333',
]

const ERRORS: Record<number, string> = { 0x00: '#NULL!', 0x07: '#DIV/0!', 0x0f: '#VALUE!', 0x17: '#REF!', 0x1d: '#NAME?', 0x24: '#NUM!', 0x2a: '#N/A' }

// Function number → name and fixed argument count (-1: variable only).
const FUNCS: Record<number, [string, number]> = {
  0: ['COUNT', -1], 1: ['IF', -1], 2: ['ISNA', 1], 3: ['ISERROR', 1], 4: ['SUM', -1], 5: ['AVERAGE', -1], 6: ['MIN', -1], 7: ['MAX', -1], 8: ['ROW', -1], 9: ['COLUMN', -1],
  10: ['NA', 0], 11: ['NPV', -1], 12: ['STDEV', -1], 13: ['DOLLAR', -1], 14: ['FIXED', -1], 15: ['SIN', 1], 16: ['COS', 1], 17: ['TAN', 1], 18: ['ATAN', 1], 19: ['PI', 0],
  20: ['SQRT', 1], 21: ['EXP', 1], 22: ['LN', 1], 23: ['LOG10', 1], 24: ['ABS', 1], 25: ['INT', 1], 26: ['SIGN', 1], 27: ['ROUND', 2], 28: ['LOOKUP', -1], 29: ['INDEX', -1],
  30: ['REPT', 2], 31: ['MID', 3], 32: ['LEN', 1], 33: ['VALUE', 1], 34: ['TRUE', 0], 35: ['FALSE', 0], 36: ['AND', -1], 37: ['OR', -1], 38: ['NOT', 1], 39: ['MOD', 2],
  46: ['VAR', -1], 48: ['TEXT', 2], 56: ['PV', -1], 57: ['FV', -1], 58: ['NPER', -1], 59: ['PMT', -1], 60: ['RATE', -1], 62: ['IRR', -1], 63: ['RAND', 0], 64: ['MATCH', -1],
  65: ['DATE', 3], 66: ['TIME', 3], 67: ['DAY', 1], 68: ['MONTH', 1], 69: ['YEAR', 1], 70: ['WEEKDAY', -1], 71: ['HOUR', 1], 72: ['MINUTE', 1], 73: ['SECOND', 1], 74: ['NOW', 0],
  76: ['ROWS', 1], 77: ['COLUMNS', 1], 78: ['OFFSET', -1], 82: ['SEARCH', -1], 86: ['TYPE', 1], 97: ['ATAN2', 2], 98: ['ASIN', 1], 99: ['ACOS', 1], 100: ['CHOOSE', -1],
  101: ['HLOOKUP', -1], 102: ['VLOOKUP', -1], 105: ['ISREF', 1], 109: ['LOG', -1], 111: ['CHAR', 1], 112: ['LOWER', 1], 113: ['UPPER', 1], 114: ['PROPER', 1], 115: ['LEFT', -1],
  116: ['RIGHT', -1], 117: ['EXACT', 2], 118: ['TRIM', 1], 119: ['REPLACE', 4], 120: ['SUBSTITUTE', -1], 121: ['CODE', 1], 124: ['FIND', -1], 126: ['ISERR', 1], 127: ['ISTEXT', 1],
  128: ['ISNUMBER', 1], 129: ['ISBLANK', 1], 130: ['T', 1], 131: ['N', 1], 140: ['DATEVALUE', 1], 141: ['TIMEVALUE', 1], 148: ['INDIRECT', -1], 162: ['CLEAN', 1], 169: ['COUNTA', -1],
  183: ['PRODUCT', -1], 184: ['FACT', 1], 190: ['ISNONTEXT', 1], 193: ['STDEVP', -1], 194: ['VARP', -1], 197: ['TRUNC', -1], 198: ['ISLOGICAL', 1], 212: ['ROUNDUP', 2],
  213: ['ROUNDDOWN', 2], 216: ['RANK', -1], 219: ['ADDRESS', -1], 220: ['DAYS360', -1], 221: ['TODAY', 0], 227: ['MEDIAN', -1], 228: ['SUMPRODUCT', -1], 229: ['SINH', 1],
  230: ['COSH', 1], 231: ['TANH', 1], 269: ['AVEDEV', -1], 276: ['COMBIN', 2], 279: ['EVEN', 1], 285: ['FLOOR', 2], 288: ['CEILING', 2], 298: ['ODD', 1], 321: ['SUMSQ', -1],
  325: ['LARGE', 2], 326: ['SMALL', 2], 328: ['PERCENTILE', 2], 330: ['MODE', -1], 336: ['CONCATENATE', -1], 337: ['POWER', 2], 342: ['RADIANS', 1], 343: ['DEGREES', 1],
  344: ['SUBTOTAL', -1], 345: ['SUMIF', -1], 346: ['COUNTIF', 2], 347: ['COUNTBLANK', 1], 354: ['ROMAN', -1], 359: ['HYPERLINK', -1], 361: ['AVERAGEA', -1], 362: ['MAXA', -1],
  363: ['MINA', -1],
}

const BINARY: Record<number, string> = { 0x03: '+', 0x04: '-', 0x05: '*', 0x06: '/', 0x07: '^', 0x08: '&', 0x09: '<', 0x0a: '<=', 0x0b: '=', 0x0c: '>=', 0x0d: '>', 0x0e: '<>', 0x0f: ' ', 0x10: ',', 0x11: ':' }

interface Rec {
  type: number
  data: Uint8Array
  // CONTINUE records that follow it.
  more: Uint8Array[]
}

function records(stream: Uint8Array): Rec[] {
  const out: Rec[] = []
  const v = new DataView(stream.buffer, stream.byteOffset, stream.byteLength)
  for (let p = 0; p + 4 <= stream.length; ) {
    const type = v.getUint16(p, true)
    const len = v.getUint16(p + 2, true)
    const data = stream.subarray(p + 4, p + 4 + len)
    if (type === 0x3c && out.length) out[out.length - 1].more.push(data)
    else out.push({ type, data, more: [] })
    p += 4 + len
  }
  return out
}

const dv = (d: Uint8Array) => new DataView(d.buffer, d.byteOffset, d.byteLength)

function chars(d: Uint8Array, at: number, count: number, wide: boolean): string {
  let s = ''
  for (let i = 0; i < count; i++) s += String.fromCharCode(wide ? d[at + i * 2] | (d[at + i * 2 + 1] << 8) : d[at + i])
  return s
}

// XLUnicodeString (16-bit length) or ShortXLUnicodeString (8-bit length) at `at`; returns the text and its size.
function xlString(d: Uint8Array, at: number, short = false): [string, number] {
  const cch = short ? d[at] : d[at] | (d[at + 1] << 8)
  const head = short ? 1 : 2
  const wide = (d[at + head] & 1) !== 0
  return [chars(d, at + head + 1, cch, wide), head + 1 + cch * (wide ? 2 : 1)]
}

// Shared string table: strings may be split across CONTINUE records.
function readSst(rec: Rec): string[] {
  const segments = [rec.data, ...rec.more]
  let seg = 0
  let p = 8
  const out: string[] = []
  const count = dv(rec.data).getUint32(4, true)
  const byte = () => {
    if (p >= segments[seg].length && seg + 1 < segments.length) {
      seg++
      p = 0
    }
    return segments[seg][p++] ?? 0
  }
  const u16 = () => byte() | (byte() << 8)
  const u32 = () => (u16() | (u16() << 16)) >>> 0
  const skip = (n: number) => {
    while (n > 0) {
      if (p >= segments[seg].length) {
        if (seg + 1 >= segments.length) return
        seg++
        p = 0
      }
      const k = Math.min(n, segments[seg].length - p)
      p += k
      n -= k
    }
  }
  for (let i = 0; i < count && seg < segments.length; i++) {
    const cch = u16()
    const flags = byte()
    let wide = (flags & 1) !== 0
    const runs = flags & 8 ? u16() : 0
    const ext = flags & 4 ? u32() : 0
    let s = ''
    let left = cch
    while (left > 0) {
      if (p >= segments[seg].length) {
        if (seg + 1 >= segments.length) break
        seg++
        p = 0
        // A continued string restates its character width.
        wide = (segments[seg][p++] & 1) !== 0
      }
      const d = segments[seg]
      const avail = Math.floor((d.length - p) / (wide ? 2 : 1))
      const k = Math.min(left, avail)
      s += chars(d, p, k, wide)
      p += k * (wide ? 2 : 1)
      left -= k
      if (k === 0) p = d.length
    }
    skip(runs * 4 + ext)
    out.push(s)
  }
  return out
}

function rk(value: number): number {
  let n: number
  if (value & 2) n = value >> 2
  else {
    const buf = new DataView(new ArrayBuffer(8))
    buf.setUint32(4, value & 0xfffffffc, true)
    buf.setUint32(0, 0, true)
    n = buf.getFloat64(0, true)
  }
  return value & 1 ? n / 100 : n
}

function colName(c: number): string {
  let s = ''
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

interface Font {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  size: number
  color?: string
  name: string
}

interface Formula {
  sheetNames: string[]
  xti: number[]
  // Shared formulas by the cell of their first formula.
  shared: Map<string, { rgce: Uint8Array; row: number; col: number }>
}

// Parsed formula tokens → "=…" text, or null when a token is not supported.
function formulaText(rgce: Uint8Array, row: number, col: number, f: Formula, base?: { row: number; col: number }): string | null {
  const v = dv(rgce)
  const stack: string[] = []
  const ref = (rw: number, c: number, relative: boolean) => {
    const colRel = (c & 0x4000) !== 0
    const rowRel = (c & 0x8000) !== 0
    let cc = c & 0x3fff
    let rr = rw
    if (relative) {
      // RefN / AreaN in shared formulas: offsets from the cell.
      // BIFF8 stores the column offset in the low 8 bits.
      if (colRel) cc = (col + ((cc << 24) >> 24)) & 0x3fff
      if (rowRel) rr = (row + ((rw << 16) >> 16)) & 0xffff
    }
    return `${colRel ? '' : '$'}${colName(cc)}${rowRel ? '' : '$'}${rr + 1}`
  }
  const sheet = (ixti: number) => {
    const name = f.sheetNames[f.xti[ixti]] ?? 'Sheet1'
    return /^[A-Za-z_][\w.]*$/.test(name) ? `${name}!` : `'${name.replace(/'/g, "''")}'!`
  }
  for (let p = 0; p < rgce.length; ) {
    const ptg = rgce[p++]
    const tok = ptg < 0x20 ? ptg : (ptg & 0x1f) | 0x20
    switch (tok) {
      case 0x01: {
        const rw = v.getUint16(p, true)
        const c = v.getUint16(p + 2, true)
        const sh = f.shared.get(`${rw}:${c}`)
        if (!sh) return null
        return formulaText(sh.rgce, row, col, f, { row: rw, col: c })
      }
      case 0x03:
      case 0x04:
      case 0x05:
      case 0x06:
      case 0x07:
      case 0x08:
      case 0x09:
      case 0x0a:
      case 0x0b:
      case 0x0c:
      case 0x0d:
      case 0x0e:
      case 0x0f:
      case 0x10:
      case 0x11: {
        const b = stack.pop()
        const a = stack.pop()
        if (a === undefined || b === undefined) return null
        stack.push(`${a}${BINARY[tok]}${b}`)
        break
      }
      case 0x12:
        stack.push(`+${stack.pop()}`)
        break
      case 0x13:
        stack.push(`-${stack.pop()}`)
        break
      case 0x14:
        stack.push(`${stack.pop()}%`)
        break
      case 0x15:
        stack.push(`(${stack.pop()})`)
        break
      case 0x16:
        stack.push('')
        break
      case 0x17: {
        const [s, size] = xlString(rgce, p, true)
        stack.push(`"${s.replace(/"/g, '""')}"`)
        p += size
        break
      }
      case 0x19: {
        const grbit = rgce[p]
        const w = v.getUint16(p + 1, true)
        p += 3
        if (grbit & 0x04) p += (w + 1) * 2
        if (grbit & 0x10) stack.push(`SUM(${stack.pop()})`)
        break
      }
      case 0x1c:
        stack.push(ERRORS[rgce[p++]] ?? '#N/A')
        break
      case 0x1d:
        stack.push(rgce[p++] ? 'TRUE' : 'FALSE')
        break
      case 0x1e:
        stack.push(String(v.getUint16(p, true)))
        p += 2
        break
      case 0x1f:
        stack.push(String(v.getFloat64(p, true)))
        p += 8
        break
      case 0x21:
      case 0x22: {
        const argc = tok === 0x22 ? rgce[p++] & 0x7f : -1
        const id = v.getUint16(p, true) & 0x7fff
        p += 2
        const fn = FUNCS[id]
        if (!fn) return null
        const n = argc >= 0 ? argc : fn[1]
        if (n < 0 || stack.length < n) return null
        const args = stack.splice(stack.length - n, n)
        stack.push(`${fn[0]}(${args.join(',')})`)
        break
      }
      case 0x24:
        stack.push(ref(v.getUint16(p, true), v.getUint16(p + 2, true), false))
        p += 4
        break
      case 0x25:
        stack.push(`${ref(v.getUint16(p, true), v.getUint16(p + 4, true), false)}:${ref(v.getUint16(p + 2, true), v.getUint16(p + 6, true), false)}`)
        p += 8
        break
      case 0x26:
        p += 6
        break
      case 0x29:
        p += 2
        break
      case 0x2a:
        stack.push('#REF!')
        p += 4
        break
      case 0x2b:
        stack.push('#REF!')
        p += 8
        break
      case 0x2c:
        if (!base) return null
        stack.push(ref(v.getUint16(p, true), v.getUint16(p + 2, true), true))
        p += 4
        break
      case 0x2d:
        if (!base) return null
        stack.push(`${ref(v.getUint16(p, true), v.getUint16(p + 4, true), true)}:${ref(v.getUint16(p + 2, true), v.getUint16(p + 6, true), true)}`)
        p += 8
        break
      case 0x3a:
        stack.push(sheet(v.getUint16(p, true)) + ref(v.getUint16(p + 2, true), v.getUint16(p + 4, true), false))
        p += 6
        break
      case 0x3b:
        stack.push(`${sheet(v.getUint16(p, true))}${ref(v.getUint16(p + 2, true), v.getUint16(p + 6, true), false)}:${ref(v.getUint16(p + 4, true), v.getUint16(p + 8, true), false)}`)
        p += 10
        break
      default:
        return null
    }
  }
  return stack.length === 1 ? `=${stack[0]}` : null
}

export async function importXls(buffer: ArrayBuffer): Promise<Partial<IWorkbookData>> {
  const cfb = readCompoundFile(buffer)
  const stream = cfb.get('Workbook') ?? cfb.get('Book')
  if (!stream) throw new Error(t('Not an Excel workbook'))
  const recs = records(stream)
  if (recs[0]?.type !== 0x809 || dv(recs[0].data).getUint16(0, true) !== 0x600) throw new Error(t('Only Excel 97-2003 (BIFF8) workbooks can be opened'))

  // Globals.
  const fonts: Font[] = []
  const formats = new Map<number, string>()
  const xfs: { font: number; format: number; align: number; wrap: boolean; valign: number; fill: number; pattern: number }[] = []
  const palette = [...PALETTE]
  let sst: string[] = []
  const sheets: { name: string; offset: number; hidden: boolean }[] = []
  const f: Formula = { sheetNames: [], xti: [], shared: new Map() }
  let i = 0
  for (; i < recs.length; i++) {
    const { type, data } = recs[i]
    const v = dv(data)
    if (type === 0x2f) throw new Error(t('The workbook is protected with a password'))
    if (type === 0x31) {
      const grbit = v.getUint16(2, true)
      const icv = v.getUint16(4, true)
      fonts.push({
        size: v.getUint16(0, true) / 20,
        italic: (grbit & 2) !== 0,
        strike: (grbit & 8) !== 0,
        bold: v.getUint16(6, true) >= 700,
        underline: data[10] !== 0,
        color: icv >= 8 && icv < 64 ? palette[icv - 8] : undefined,
        name: xlString(data, 14, true)[0],
      })
      // Font index 4 does not exist in BIFF.
      if (fonts.length === 4) fonts.push(fonts[3])
    } else if (type === 0x41e) formats.set(v.getUint16(0, true), xlString(data, 2)[0])
    else if (type === 0xe0) {
      const color = v.getUint16(18, true)
      xfs.push({
        font: v.getUint16(0, true),
        format: v.getUint16(2, true),
        align: data[6] & 7,
        wrap: (data[6] & 8) !== 0,
        valign: (data[6] >> 4) & 7,
        fill: color & 0x7f,
        pattern: (v.getUint32(14, true) >>> 26) & 0x3f,
      })
    } else if (type === 0x92) {
      const n = v.getUint16(0, true)
      for (let k = 0; k < n && k < 56; k++) palette[k] = [data[2 + k * 4], data[3 + k * 4], data[4 + k * 4]].map((b) => b.toString(16).padStart(2, '0')).join('')
    } else if (type === 0xfc) sst = readSst(recs[i])
    else if (type === 0x85) {
      sheets.push({ offset: v.getUint32(0, true), hidden: data[4] !== 0, name: xlString(data, 6, true)[0] })
      // Worksheets only (dt = 0).
      if (data[5] !== 0) sheets[sheets.length - 1].offset = -1
    } else if (type === 0x17) {
      const n = v.getUint16(0, true)
      for (let k = 0; k < n; k++) f.xti.push(v.getUint16(2 + k * 6 + 2, true))
    } else if (type === 0x0a) break
  }
  f.sheetNames = sheets.map((s) => s.name)
  // The palette may have changed after the fonts were read.
  const fontColor = (fi: number) => fonts[fi]?.color

  // Styles: XF index → Univer style id.
  const registry: Record<string, IStyleData> = {}
  const byKey = new Map<string, string>()
  const styleOf = new Map<number, string | undefined>()
  const xfStyle = (ixfe: number): string | undefined => {
    if (styleOf.has(ixfe)) return styleOf.get(ixfe)
    const xf = xfs[ixfe]
    let id: string | undefined
    if (xf) {
      const s: IStyleData = {}
      const font = fonts[xf.font]
      if (font) {
        if (font.bold) s.bl = 1
        if (font.italic) s.it = 1
        if (font.underline) s.ul = { s: 1 }
        if (font.strike) s.st = { s: 1 }
        if (font.size && font.size !== 10 && font.size !== 11) s.fs = font.size
        const color = fontColor(xf.font)
        if (color && color !== '000000') s.cl = { rgb: `#${color}` }
        if (font.name && !/^(arial|calibri)$/i.test(font.name)) s.ff = font.name
      }
      if (xf.pattern === 1 && xf.fill >= 8 && xf.fill < 64) s.bg = { rgb: `#${palette[xf.fill - 8]}` }
      if (xf.align === 1) s.ht = 1
      else if (xf.align === 2 || xf.align === 6) s.ht = 2
      else if (xf.align === 3) s.ht = 3
      if (xf.valign === 0) s.vt = 1
      else if (xf.valign === 1) s.vt = 2
      if (xf.wrap) s.tb = 3
      const pattern = formats.get(xf.format) ?? BUILTIN_FORMATS[xf.format]
      if (pattern && pattern !== 'General') s.n = { pattern }
      if (Object.keys(s).length) {
        const key = JSON.stringify(s)
        id = byKey.get(key)
        if (!id) {
          id = `x${byKey.size + 1}`
          byKey.set(key, id)
          registry[id] = s
        }
      }
    }
    styleOf.set(ixfe, id)
    return id
  }

  // Sheets: records from each sheet's BOF.
  // Index of the logical record (CONTINUE merged) for each stream offset.
  const recAt = new Map<number, number>()
  {
    let p = 0
    let r = -1
    const v = dv(stream)
    while (p + 4 <= stream.length) {
      if (v.getUint16(p, true) !== 0x3c) r++
      recAt.set(p, r)
      p += 4 + v.getUint16(p + 2, true)
    }
  }

  const out: IWorkbookData['sheets'] = {}
  const order: string[] = []
  sheets.forEach((sh, index) => {
    if (sh.offset < 0) return
    const start = recAt.get(sh.offset)
    if (start === undefined) return
    const id = `sheet-${index + 1}`
    const cellData: Record<number, Record<number, ICellData>> = {}
    const mergeData: IRange[] = []
    const columnData: Record<number, { w?: number; hd?: number }> = {}
    const rowData: Record<number, { h?: number; hd?: number }> = {}
    let maxRow = 0
    let maxCol = 0
    let pendingString: { row: number; col: number } | null = null
    const put = (row: number, col: number, cell: ICellData, xf: number) => {
      const s = xfStyle(xf)
      if (s) cell.s = s
      ;(cellData[row] ??= {})[col] = cell
      maxRow = Math.max(maxRow, row)
      maxCol = Math.max(maxCol, col)
    }
    const number = (value: number): ICellData => ({ v: value, t: T_NUMBER })
    for (let r = start + 1; r < recs.length; r++) {
      const { type, data } = recs[r]
      const v = dv(data)
      if (type === 0x0a) break
      const row = data.length >= 4 ? v.getUint16(0, true) : 0
      const col = data.length >= 4 ? v.getUint16(2, true) : 0
      switch (type) {
        case 0xfd: {
          const text = sst[v.getUint32(6, true)] ?? ''
          put(row, col, { v: text, t: text.trim() && Number.isFinite(Number(text)) ? T_FORCE_STRING : T_STRING }, v.getUint16(4, true))
          break
        }
        case 0x204:
          put(row, col, { v: xlString(data, 6)[0], t: T_STRING }, v.getUint16(4, true))
          break
        case 0x203:
          put(row, col, number(v.getFloat64(6, true)), v.getUint16(4, true))
          break
        case 0x27e:
          put(row, col, number(rk(v.getInt32(6, true))), v.getUint16(4, true))
          break
        case 0xbd: {
          const last = v.getUint16(data.length - 2, true)
          for (let c = col, p = 4; c <= last; c++, p += 6) put(row, c, number(rk(v.getInt32(p + 2, true))), v.getUint16(p, true))
          break
        }
        case 0x201:
          put(row, col, {}, v.getUint16(4, true))
          break
        case 0xbe: {
          const last = v.getUint16(data.length - 2, true)
          for (let c = col, p = 4; c <= last; c++, p += 2) if (xfStyle(v.getUint16(p, true))) put(row, c, {}, v.getUint16(p, true))
          break
        }
        case 0x205: {
          const value = data[6]
          put(row, col, data[7] ? { v: ERRORS[value] ?? '#N/A', t: T_FORCE_STRING } : { v: value ? 1 : 0, t: T_BOOLEAN }, v.getUint16(4, true))
          break
        }
        case 0x06: {
          const xf = v.getUint16(4, true)
          const cce = v.getUint16(20, true)
          const rgce = data.subarray(22, 22 + cce)
          // Shared formula definition right after its first formula.
          if (recs[r + 1]?.type === 0x4bc) {
            const sd = dv(recs[r + 1].data)
            const scce = sd.getUint16(8, true)
            f.shared.set(`${row}:${col}`, { rgce: recs[r + 1].data.subarray(10, 10 + scce), row, col })
          }
          const cell: ICellData = {}
          if (v.getUint16(12, true) === 0xffff) {
            const kind = data[6]
            if (kind === 0) pendingString = { row, col }
            else if (kind === 1) Object.assign(cell, { v: data[8] ? 1 : 0, t: T_BOOLEAN })
            else if (kind === 2) Object.assign(cell, { v: ERRORS[data[8]] ?? '#N/A', t: T_FORCE_STRING })
          } else Object.assign(cell, number(v.getFloat64(6, true)))
          const formula = formulaText(rgce, row, col, f)
          if (formula) cell.f = formula
          put(row, col, cell, xf)
          break
        }
        case 0x207:
          if (pendingString) {
            const cell = cellData[pendingString.row]?.[pendingString.col]
            if (cell) Object.assign(cell, { v: xlString(data, 0)[0], t: T_STRING })
            pendingString = null
          }
          break
        case 0xe5: {
          const n = v.getUint16(0, true)
          for (let k = 0; k < n; k++) {
            const o = 2 + k * 8
            mergeData.push({ startRow: v.getUint16(o, true), endRow: v.getUint16(o + 2, true), startColumn: v.getUint16(o + 4, true), endColumn: v.getUint16(o + 6, true) })
          }
          break
        }
        case 0x7d: {
          const first = v.getUint16(0, true)
          // Ranges to the last column only restate the default width.
          const last = v.getUint16(2, true)
          if (last - first > 64) break
          const w = Math.round((v.getUint16(4, true) / 256) * 7 + 5)
          const hidden = (v.getUint16(8, true) & 1) !== 0
          for (let c = first; c <= last; c++) columnData[c] = hidden ? { w, hd: 1 } : { w }
          break
        }
        case 0x208: {
          const h = v.getUint16(6, true) & 0x7fff
          const flags = v.getUint32(12, true)
          if (flags & 0x40) rowData[row] = { h: Math.round(h / 15) }
          if (flags & 0x20) rowData[row] = { ...rowData[row], hd: 1 }
          break
        }
      }
    }
    const sheet: Partial<IWorksheetData> = {
      id,
      name: sh.name,
      rowCount: Math.max(1000, maxRow + 101),
      columnCount: Math.max(26, maxCol + 11),
      defaultColumnWidth: DEFAULT_COL_PX,
      defaultRowHeight: DEFAULT_ROW_PX,
      cellData,
      rowData,
      columnData,
      mergeData,
      hidden: sh.hidden ? 1 : 0,
    }
    out[id] = sheet
    order.push(id)
  })
  if (!order.length) {
    order.push('sheet-1')
    out['sheet-1'] = { id: 'sheet-1', name: 'Sheet1', rowCount: 1000, columnCount: 26, cellData: {} }
  }
  return { name: '', locale: 'enUS' as IWorkbookData['locale'], styles: registry, sheetOrder: order, sheets: out, resources: [] }
}
