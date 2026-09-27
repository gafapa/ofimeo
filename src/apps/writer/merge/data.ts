// Mail merge settings and data, kept in the document so every editor (and a
// later session) sees the same fields and preview:
//   meta.mailMerge      JSON MergeSettings (source, sheet, header row, filter, file name field)
//   meta.mailMergeData  JSON MergeTable (the chosen sheet as text: a snapshot of the source)
// Records are the non-empty rows under the header row, as field → text.

import type * as Y from 'yjs'
import { t } from '../../../core/i18n'
import { displayText, type SheetTable } from '../../charts/sheets'
import type { MergeRecord } from '../editor/merge'

export type MergeSource = { kind: 'sheet'; docId: string; title: string } | { kind: 'file'; name: string }

export type FilterOp = '=' | '<>' | 'contains' | '>' | '<' | 'empty' | 'notEmpty'

export interface MergeFilter {
  field: string
  op: FilterOp
  value: string
}

export interface MergeSettings {
  source: MergeSource | null
  // Table (sheet) id within the source.
  sheet: string
  sheetName: string
  // 1-based row holding the field names.
  headerRow: number
  filter: MergeFilter | null
  // Field that names the files of a ZIP output.
  nameField: string
}

export interface MergeTable {
  rows: string[][]
}

const SETTINGS_KEY = 'mailMerge'
const DATA_KEY = 'mailMergeData'

export const DEFAULT_SETTINGS: MergeSettings = { source: null, sheet: '', sheetName: '', headerRow: 1, filter: null, nameField: '' }

function parse<T>(raw: unknown): T | null {
  if (typeof raw !== 'string') return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export const readSettings = (meta: Y.Map<unknown>): MergeSettings => ({ ...DEFAULT_SETTINGS, ...(parse<MergeSettings>(meta.get(SETTINGS_KEY)) ?? {}) })
export const readTable = (meta: Y.Map<unknown>): MergeTable => ({ rows: parse<MergeTable>(meta.get(DATA_KEY))?.rows ?? [] })

export function writeSettings(meta: Y.Map<unknown>, settings: MergeSettings): void {
  meta.set(SETTINGS_KEY, JSON.stringify(settings))
}

export function writeTable(meta: Y.Map<unknown>, table: MergeTable): void {
  const json = JSON.stringify(table)
  if (meta.get(DATA_KEY) !== json) meta.set(DATA_KEY, json)
}

export const hasMergeSettings = (meta: Y.Map<unknown>) => meta.has(SETTINGS_KEY)

// A sheet as text rows (dates and percentages formatted).
export function tableText(table: SheetTable): MergeTable {
  return {
    rows: table.rows.map((row, r) => Array.from(row ?? [], (v, c) => displayText(v, table.formats?.[`${r}:${c}`]))),
  }
}

// Field names: the header row's cells ("Column 3" for empty ones), without duplicates.
export function fieldNames(table: MergeTable, headerRow: number): string[] {
  const header = table.rows[headerRow - 1] ?? []
  const width = Math.max(header.length, ...table.rows.slice(headerRow).map((r) => r.length), 0)
  const seen = new Set<string>()
  const out: string[] = []
  for (let c = 0; c < width; c++) {
    let name = (header[c] ?? '').trim() || t('Column {n}', { n: c + 1 })
    for (let i = 2; seen.has(name.toLowerCase()); i++) name = `${(header[c] ?? '').trim() || t('Column {n}', { n: c + 1 })} ${i}`
    seen.add(name.toLowerCase())
    out.push(name)
  }
  return out
}

export function allRecords(table: MergeTable, headerRow: number): MergeRecord[] {
  const names = fieldNames(table, headerRow)
  return table.rows
    .slice(Math.max(0, headerRow))
    .filter((row) => row?.some((v) => (v ?? '').trim() !== ''))
    .map((row) => Object.fromEntries(names.map((n, c) => [n, row[c] ?? ''])))
}

const asNumber = (s: string) => {
  const n = Number(s.trim().replace(',', '.'))
  return s.trim() !== '' && Number.isFinite(n) ? n : null
}

export function matches(record: MergeRecord, filter: MergeFilter | null): boolean {
  if (!filter?.field) return true
  const raw = record[filter.field] ?? ''
  const v = raw.trim().toLowerCase()
  const want = filter.value.trim().toLowerCase()
  switch (filter.op) {
    case 'empty':
      return v === ''
    case 'notEmpty':
      return v !== ''
    case 'contains':
      return v.includes(want)
    case '>':
    case '<': {
      const a = asNumber(raw)
      const b = asNumber(filter.value)
      const cmp = a !== null && b !== null ? a - b : v.localeCompare(want)
      return filter.op === '>' ? cmp > 0 : cmp < 0
    }
    case '<>':
      return v !== want && !(asNumber(raw) !== null && asNumber(raw) === asNumber(filter.value))
    default:
      return v === want || (asNumber(raw) !== null && asNumber(raw) === asNumber(filter.value))
  }
}

export function mergeRecords(meta: Y.Map<unknown>): { fields: string[]; records: MergeRecord[]; total: number } {
  const settings = readSettings(meta)
  const table = readTable(meta)
  const all = allRecords(table, settings.headerRow)
  return { fields: fieldNames(table, settings.headerRow), records: all.filter((r) => matches(r, settings.filter)), total: all.length }
}
