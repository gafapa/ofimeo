// Tabular data for charts and mail merge, read without the spreadsheet app:
//   - Ofimeo spreadsheets of the library: their Yjs state from this browser's
//     IndexedDB (workbook checkpoint or base, plus the logged cell edits, as
//     the content search reads them; formula results come from the last
//     checkpoint);
//   - files: CSV / TSV (raw text), XLSX, ODS and XLS (through the sheet
//     importers).
// A table is a sheet as rows of cell values; `displayText` formats a value
// for text (dates, percentages).

import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { activeDocs, dbName, getDoc, type DocEntry } from '../../core/store'
import { t } from '../../core/i18n'
import type { Cell } from '../sheet/charts/model'

export interface SheetTable {
  id: string
  name: string
  rows: Cell[][]
  // Number format pattern per cell ("r:c"), when it has one.
  formats?: Record<string, string>
}

type CellData = Record<string, Record<string, { v?: unknown; s?: unknown; f?: unknown } | null> | null>
interface Workbook {
  sheetOrder?: string[]
  styles?: Record<string, { n?: { pattern?: string } } | null>
  sheets?: Record<string, { id?: string; name?: string; cellData?: CellData } | null>
}

// Spreadsheets of the library (not in the trash), newest first.
export const librarySheets = (): DocEntry[] => activeDocs().filter((d) => d.type === 'sheet')

// Tables of a workbook snapshot, in sheet order.
export function workbookTables(wb: Workbook): SheetTable[] {
  const ids = wb.sheetOrder?.length ? wb.sheetOrder : Object.keys(wb.sheets ?? {})
  const out: SheetTable[] = []
  for (const id of ids) {
    const sheet = wb.sheets?.[id]
    if (!sheet) continue
    const rows: Cell[][] = []
    const formats: Record<string, string> = {}
    for (const [r, row] of Object.entries(sheet.cellData ?? {})) {
      for (const [c, cell] of Object.entries(row ?? {})) {
        const v = cell?.v
        if (v === undefined || v === null || v === '') continue
        ;(rows[Number(r)] ??= [])[Number(c)] = v as Cell
        const style = typeof cell?.s === 'string' ? wb.styles?.[cell.s] : cell?.s && typeof cell.s === 'object' ? (cell.s as { n?: { pattern?: string } }) : null
        const pattern = style?.n?.pattern
        if (pattern) formats[`${r}:${c}`] = pattern
      }
    }
    out.push({ id, name: sheet.name || id, rows: Array.from(rows, (r) => Array.from(r ?? [], (v) => v ?? null)), formats })
  }
  return out
}

const parse = <T>(raw: unknown): T | null => {
  if (typeof raw !== 'string') return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

// Workbook of an Ofimeo spreadsheet's Yjs state (see sheet/sync.ts).
export function sheetDocWorkbook(doc: Y.Doc): Workbook {
  const state = doc.getMap('sheet')
  const base = parse<{ snapshot?: Workbook }>(state.get('checkpoint'))?.snapshot ?? parse<Workbook>(state.get('base')) ?? {}
  const wb: Workbook = { ...base, sheets: { ...(base.sheets ?? {}) } }
  for (const entry of doc.getArray<{ m?: string; p?: string }>('sheet-ops').toArray()) {
    if (entry?.m !== 'sheet.mutation.set-range-values') continue
    const params = parse<{ subUnitId?: string; cellValue?: CellData }>(entry.p)
    const sheet = params?.subUnitId ? wb.sheets![params.subUnitId] : null
    if (!sheet) continue
    const cells = (sheet.cellData = { ...(sheet.cellData ?? {}) })
    for (const [r, row] of Object.entries(params!.cellValue ?? {})) {
      const target = (cells[r] = { ...(cells[r] ?? {}) })
      for (const [c, cell] of Object.entries(row ?? {})) {
        if (!cell) {
          delete target[c]
          continue
        }
        const next = { ...(target[c] ?? {}) }
        // A formula logged without its result keeps the last known value.
        if ('v' in cell) next.v = cell.v
        if ('s' in cell) next.s = cell.s
        target[c] = next
      }
    }
  }
  return wb
}

// Tables of a library spreadsheet stored in this browser; null when it is not here.
export async function loadLibrarySheet(docId: string): Promise<{ entry: DocEntry; tables: SheetTable[] } | null> {
  const entry = getDoc(docId)
  if (!entry || entry.type !== 'sheet' || entry.trashed) return null
  const doc = new Y.Doc()
  const persistence = new IndexeddbPersistence(dbName(docId), doc)
  try {
    await persistence.whenSynced
    return { entry, tables: workbookTables(sheetDocWorkbook(doc)) }
  } finally {
    await persistence.destroy()
    doc.destroy()
  }
}

export const DATA_FILE_ACCEPT = '.csv,.tsv,.txt,.xlsx,.ods,.xls'

// Tables of a CSV / TSV / XLSX / ODS / XLS file.
export async function readDataFile(file: File): Promise<SheetTable[]> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
    const { parseCsv } = await import('../sheet/formats/csv')
    const text = (await file.text()).replace(/^﻿/, '')
    const rows = parseCsv(text, ext === 'tsv' ? '\t' : detectDelimiter(text, parseCsv))
    while (rows.length && rows[rows.length - 1].every((v) => v === '')) rows.pop()
    return [{ id: 'csv', name: file.name.replace(/\.[^.]+$/, ''), rows }]
  }
  if (ext === 'xlsx' || ext === 'ods' || ext === 'xls') {
    const { importSheetFile } = await import('../sheet/formats/index')
    return workbookTables((await importSheetFile(file)) as Workbook)
  }
  throw new Error(t('Unsupported file type'))
}

function detectDelimiter(text: string, parseCsv: (text: string, delim: string) => string[][]): string {
  const sample = text.slice(0, 32 * 1024)
  let best = ','
  let bestScore = -1
  for (const d of [',', ';', '\t']) {
    const rows = parseCsv(sample, d).slice(0, 20).filter((r) => r.length > 1 || r[0] !== '')
    if (!rows.length) continue
    const width = rows[0].length
    const score = (rows.filter((r) => r.length === width).length / rows.length) * 10 + Math.min(width - 1, 9)
    if (width > 1 && score > bestScore) {
      best = d
      bestScore = score
    }
  }
  return best
}

// A value as text: dates and percentages follow the cell's number format.
export function displayText(v: Cell, pattern?: string): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? t('TRUE') : t('FALSE')
  if (typeof v !== 'number') return String(v)
  if (pattern) {
    const p = pattern.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')
    if (/[dy]/i.test(p) || (/m/i.test(p) && /[hs]/i.test(p))) {
      const date = new Date(Math.round((v - 25569) * 86400000))
      const time = /[hs]/i.test(p)
      return time && !/[dy]/i.test(p)
        ? date.toLocaleTimeString(undefined, { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' })
        : time
          ? date.toLocaleString(undefined, { timeZone: 'UTC' })
          : date.toLocaleDateString(undefined, { timeZone: 'UTC' })
    }
    if (p.includes('%')) {
      const decimals = /\.(0+)%/.exec(p)?.[1].length ?? 0
      return `${(v * 100).toFixed(decimals)}%`
    }
    const fixed = /\.(0+)/.exec(p)?.[1].length
    if (fixed !== undefined) return v.toFixed(fixed)
  }
  return String(Math.round(v * 1e10) / 1e10)
}

// Calls `onChange(docId)` when another tab saves a library document (the
// document index in localStorage changes). Returns a function that stops it.
export function watchLibrary(onChange: (docId: string) => void): () => void {
  const stamps = new Map(activeDocs().map((d) => [d.id, d.updated]))
  const listener = (e: StorageEvent) => {
    if (e.key !== 'words-online:docs') return
    for (const d of activeDocs()) {
      if (stamps.get(d.id) !== d.updated) {
        stamps.set(d.id, d.updated)
        onChange(d.id)
      }
    }
  }
  window.addEventListener('storage', listener)
  return () => window.removeEventListener('storage', listener)
}

// Values of an A1 block of a table.
export function blockValues(table: SheetTable, range: { startRow: number; endRow: number; startColumn: number; endColumn: number }): Cell[][] {
  const out: Cell[][] = []
  for (let r = range.startRow; r <= range.endRow; r++) {
    const row: Cell[] = []
    for (let c = range.startColumn; c <= range.endColumn; c++) row.push(table.rows[r]?.[c] ?? null)
    out.push(row)
  }
  return out
}

// The used block of a table (from A1 to the last filled cell).
export function usedRange(table: SheetTable): { startRow: number; endRow: number; startColumn: number; endColumn: number } {
  const endRow = Math.max(0, table.rows.length - 1)
  const endColumn = Math.max(0, ...table.rows.map((r) => (r?.length ?? 1) - 1))
  return { startRow: 0, endRow, startColumn: 0, endColumn }
}
