// CSV / TSV import and export (RFC 4180).

import type { ICellData, IStyleData, IWorkbookData } from '@univerjs/presets'

const DELIMITERS = [',', ';', '\t']
const DAY_MS = 86_400_000
const EPOCH_1899 = Date.UTC(1899, 11, 30)

export function importCsv(text: string, delimiter?: string, sheetName = 'Sheet1'): Partial<IWorkbookData> {
  const src = text.replace(/^﻿/, '')
  const delim = delimiter ?? detectDelimiter(src)
  const rows = parseCsv(src, delim)
  const styles: Record<string, IStyleData> = {}
  const styleIds = new Map<string, string>()
  const styleFor = (pattern: string) => {
    let id = styleIds.get(pattern)
    if (!id) {
      id = `s${styleIds.size + 1}`
      styleIds.set(pattern, id)
      styles[id] = { n: { pattern } }
    }
    return id
  }

  const cellData: Record<number, Record<number, ICellData>> = {}
  let maxCol = 0
  rows.forEach((row, r) => {
    row.forEach((raw, c) => {
      if (raw === '') return
      const cell = parseValue(raw, delim)
      if (cell.pattern) cell.data.s = styleFor(cell.pattern)
      ;(cellData[r] ??= {})[c] = cell.data
      maxCol = Math.max(maxCol, c)
    })
  })
  return {
    name: '',
    locale: 'enUS' as IWorkbookData['locale'],
    styles,
    sheetOrder: ['sheet-1'],
    sheets: {
      'sheet-1': {
        id: 'sheet-1',
        name: sheetName,
        rowCount: Math.max(1000, rows.length + 100),
        columnCount: Math.max(26, maxCol + 1 + 10),
        cellData,
      },
    },
    resources: [],
  }
}

// Picks the candidate that splits the first lines most consistently.
function detectDelimiter(text: string): string {
  const sample = text.slice(0, 64 * 1024)
  let best = ','
  let bestScore = 0
  for (const d of DELIMITERS) {
    const rows = parseCsv(sample, d).slice(0, 20)
    // The last sampled row may be cut off.
    if (rows.length > 1 && sample.length < text.length) rows.pop()
    const counts = rows.filter((r) => r.length > 1 || r[0] !== '').map((r) => r.length - 1)
    if (!counts.length || counts[0] === 0) continue
    const consistent = counts.filter((n) => n === counts[0]).length / counts.length
    const score = consistent * 10 + Math.min(counts[0], 9)
    if (score > bestScore) {
      best = d
      bestScore = score
    }
  }
  return best
}

// Splits text into rows of fields; quotes may span lines and escape quotes by doubling.
export function parseCsv(text: string, delim: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let i = 0
  const n = text.length
  while (i < n) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        quoted = false
      } else field += ch
      i++
      continue
    }
    if (ch === '"' && field === '') {
      quoted = true
      i++
    } else if (ch === delim) {
      row.push(field)
      field = ''
      i++
    } else if (ch === '\r' || ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1
    } else {
      field += ch
      i++
    }
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function parseValue(raw: string, delim: string): { data: ICellData; pattern?: string } {
  const v = raw.trim()
  // Numbers (leading zeros are kept as text: codes, phone numbers, …).
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(v) && !/^[+-]?0\d/.test(v)) return { data: { v: Number(v), t: 2 } }
  if (delim === ';' && /^[+-]?\d+,\d+$/.test(v)) return { data: { v: Number(v.replace(',', '.')), t: 2 } }
  const pct = /^([+-]?(?:\d+\.?\d*|\.\d+))\s?%$/.exec(v)
  if (pct) {
    const decimals = pct[1].split('.')[1]?.length ?? 0
    return { data: { v: Number(pct[1]) / 100, t: 2 }, pattern: decimals ? `0.${'0'.repeat(decimals)}%` : '0%' }
  }
  if (/^(true|false)$/i.test(v)) return { data: { v: /^true$/i.test(v) ? 1 : 0, t: 3 } }
  const date = /^(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d):(\d\d)(?::(\d\d))?)?$/.exec(v)
  if (date) {
    const [, y, mo, d, h, mi, s] = date
    const ms = Date.UTC(+y, +mo - 1, +d, +(h || 0), +(mi || 0), +(s || 0))
    if (!Number.isNaN(ms) && new Date(ms).getUTCDate() === +d) {
      const pattern = h ? (s ? 'yyyy-mm-dd hh:mm:ss' : 'yyyy-mm-dd hh:mm') : 'yyyy-mm-dd'
      return { data: { v: (ms - EPOCH_1899) / DAY_MS, t: 2 }, pattern }
    }
  }
  const time = /^(\d{1,2}):(\d\d)(?::(\d\d))?$/.exec(v)
  if (time && +time[2] < 60 && +(time[3] || 0) < 60) {
    const days = (+time[1] * 3600 + +time[2] * 60 + +(time[3] || 0)) / 86400
    return { data: { v: days, t: 2 }, pattern: time[3] ? 'hh:mm:ss' : 'hh:mm' }
  }
  // Numeric-looking text is forced to stay text.
  return { data: { v: raw.replace(/\r\n?/g, '\n'), t: /^[+-]?[\d.,]+$/.test(v) ? 4 : 1 } }
}

export interface CsvOptions {
  // Field separator (',' by default; ';' where the decimal separator is a comma).
  delimiter?: string
  // Plain numbers with a decimal comma (for ';' files read by European Excel).
  decimalComma?: boolean
  // The values as the sheet shows them (number formats applied), when given.
  display?: (row: number, col: number) => string
}

// Exports one sheet (the first one by default). Formulas export their computed values.
export function exportCsv(data: IWorkbookData, sheetId?: string, options: CsvOptions = {}): string {
  const delimiter = options.delimiter ?? ','
  const sheet = data.sheets[sheetId ?? ''] ?? data.sheets[data.sheetOrder[0]]
  const cellData = sheet?.cellData ?? {}
  let maxRow = -1
  let maxCol = -1
  for (const [r, row] of Object.entries(cellData)) {
    for (const [c, cell] of Object.entries(row ?? {}) as Array<[string, ICellData]>) {
      if (cellText(cell, data) === '') continue
      maxRow = Math.max(maxRow, +r)
      maxCol = Math.max(maxCol, +c)
    }
  }
  const text = (r: number, c: number) => {
    const cell = cellData[r]?.[c]
    const plain = cellText(cell, data)
    if (plain === '') return ''
    if (options.display) return options.display(r, c)
    const numeric = !!cell && (typeof cell.v === 'number' || cell.t === 2) && /^-?[\d.]+(e[+-]?\d+)?$/i.test(plain)
    return options.decimalComma && numeric ? plain.replace('.', ',') : plain
  }
  const lines: string[] = []
  for (let r = 0; r <= maxRow; r++) {
    const fields: string[] = []
    for (let c = 0; c <= maxCol; c++) fields.push(quote(text(r, c), delimiter))
    lines.push(fields.join(delimiter))
  }
  return lines.length ? lines.join('\r\n') + '\r\n' : ''
}

function cellText(cell: ICellData | null | undefined, data: IWorkbookData): string {
  if (!cell) return ''
  let v = cell.v
  const rich = (cell.p?.body?.dataStream ?? '').replace(/\r\n$/, '').replace(/\r/g, '\n')
  if (rich && !cell.f) v = rich
  if (v === undefined || v === null) return ''
  if (cell.t === 3 || typeof v === 'boolean') return v === true || v === 1 || String(v).toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE'
  if (typeof v === 'number') {
    const style = typeof cell.s === 'string' ? data.styles[cell.s] : cell.s
    const pattern = style?.n?.pattern
    return pattern && isDatePattern(pattern) ? formatDate(v, pattern) : numberText(v)
  }
  return String(v)
}

function numberText(n: number): string {
  if (!Number.isFinite(n)) return ''
  // Trims float noise such as 0.30000000000000004.
  return String(Number.isInteger(n) ? n : parseFloat(n.toPrecision(15)))
}

// Date/time patterns: y, d, h, s or m outside quotes/brackets.
function isDatePattern(pattern: string): boolean {
  const bare = pattern.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')
  return /[ydhs]/i.test(bare) || /m/i.test(bare.replace(/AM\/PM|A\/P/gi, ''))
}

// Dates export as ISO text, which importCsv reads back as dates.
function formatDate(serial: number, pattern: string): string {
  const d = new Date(Math.round(serial * 86400) * 1000 + EPOCH_1899)
  const iso = d.toISOString()
  const bare = pattern.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')
  const hasDate = /[yd]/i.test(bare) || /m{3,}/i.test(bare)
  const hasTime = /[hs]/i.test(bare)
  if (hasDate && hasTime) return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`
  if (hasTime) return iso.slice(11, 19)
  return iso.slice(0, 10)
}

function quote(field: string, delimiter = ','): string {
  return /["\r\n]|^\s|\s$/.test(field) || field.includes(delimiter) ? `"${field.replace(/"/g, '""')}"` : field
}
