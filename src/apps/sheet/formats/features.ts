// Workbook features that Univer keeps in plugin resources (conditional
// formatting, notes, defined names and filters), read from and written to
// snapshots by the file converters. Plain data only: the converter chunks do
// not load the Univer runtime.

import type { ICellData, IRange, IStyleData, IWorkbookData } from '@univerjs/presets'

export const CF_RESOURCE = 'SHEET_CONDITIONAL_FORMATTING_PLUGIN'
export const NOTE_RESOURCE = 'SHEET_NOTE_PLUGIN'
export const NAME_RESOURCE = 'SHEET_DEFINED_NAME_PLUGIN'
export const VALIDATION_RESOURCE = 'SHEET_DATA_VALIDATION_PLUGIN'
export const FILTER_RESOURCE = 'SHEET_FILTER_PLUGIN'
// Univer's scope of workbook-wide defined names.
export const GLOBAL_SCOPE = 'AllDefaultWorkbook'

// Univer's default cell font, written as the files' default font.
export const DEFAULT_FONT_NAME = 'Arial'
export const DEFAULT_FONT_SIZE = 11

// Univer's default text color (its theme's gray 900). Earlier versions stored
// it on every typed cell; files treat it as the automatic color.
export const isThemeTextColor = (rgb: unknown) => typeof rgb === 'string' && rgb.replace(/\s/g, '').toLowerCase() === '#1b1c1f'

export type CfValueType = 'num' | 'min' | 'max' | 'percent' | 'percentile' | 'formula'
export interface CfValue {
  type: CfValueType
  value?: number | string
}

export interface HighlightRule {
  type: 'highlightCell'
  // number, text, timePeriod, duplicateValues, uniqueValues, rank, average, formula
  subType: string
  operator?: string
  value?: unknown
  isBottom?: boolean
  isPercent?: boolean
  style: IStyleData
}
export interface ColorScaleRule {
  type: 'colorScale'
  config: { index: number; color: string; value: CfValue }[]
}
export interface DataBarRule {
  type: 'dataBar'
  isShowValue: boolean
  config: { min: CfValue; max: CfValue; isGradient: boolean; positiveColor: string; nativeColor: string }
}
export interface IconSetRule {
  type: 'iconSet'
  isShowValue: boolean
  // Highest values first: every entry but the last has a threshold.
  config: { operator: string; value: CfValue; iconType: string; iconId: string }[]
}
export type CfRuleConfig = HighlightRule | ColorScaleRule | DataBarRule | IconSetRule

export interface CfRule {
  cfId: string
  ranges: IRange[]
  stopIfTrue: boolean
  rule: CfRuleConfig
}

export interface SheetNote {
  note: string
  row: number
  col: number
  width?: number
  height?: number
  id?: string
}

export interface DefinedName {
  id: string
  name: string
  // Excel syntax without "=": "Sheet1!$B$2:$B$5", "0.21", "SUM(Sheet1!$A:$A)".
  formulaOrRefString: string
  // Sheet id for sheet-scoped names, GLOBAL_SCOPE otherwise.
  localSheetId?: string
  comment?: string
  hidden?: boolean
}

export interface FilterColumn {
  colId: number
  filters?: { blank?: true; filters?: string[] }
  customFilters?: { and?: 1; customFilters: { val: string | number; operator?: string }[] }
}

export interface SheetFilter {
  ref: IRange
  filterColumns?: FilterColumn[]
  // Rows hidden by the filter.
  cachedFilteredOut?: number[]
}

// Univer data validation rule (the fields the converters use).
export interface ValidationRule {
  uid?: string
  type: string
  ranges: IRange[]
  formula1?: string
  formula2?: string
  operator?: string
  allowBlank?: boolean
  showDropDown?: boolean
  showErrorMessage?: boolean
  showInputMessage?: boolean
  errorStyle?: number
  error?: string
  errorTitle?: string
  prompt?: string
  promptTitle?: string
}

// Options of a list rule: a JSON array or comma-separated text.
export function listOptions(formula: string): string[] {
  try {
    const arr = JSON.parse(formula)
    if (Array.isArray(arr)) return arr.map(String).filter(Boolean)
  } catch {
    // Comma-separated list.
  }
  return formula
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

// Groups cells into rectangles: horizontal runs per row, then stacked vertically.
export function cellsToRanges(cells: { row: number; col: number }[]): IRange[] {
  cells.sort((a, b) => a.row - b.row || a.col - b.col)
  const runs: IRange[] = []
  for (const c of cells) {
    const last = runs[runs.length - 1]
    if (last && last.startRow === c.row && last.endColumn === c.col - 1) last.endColumn = c.col
    else runs.push({ startRow: c.row, endRow: c.row, startColumn: c.col, endColumn: c.col })
  }
  const out: IRange[] = []
  for (const r of runs) {
    const prev = out.find((o) => o.endRow === r.startRow - 1 && o.startColumn === r.startColumn && o.endColumn === r.endColumn)
    if (prev) prev.endRow = r.endRow
    else out.push(r)
  }
  return out
}

export interface WorkbookFeatures {
  cf: Record<string, CfRule[]>
  notes: Record<string, SheetNote[]>
  names: DefinedName[]
  filters: Record<string, SheetFilter>
  // Written by the ODS converters only (the XLSX ones handle validation themselves).
  validations: Record<string, ValidationRule[]>
}

export const emptyFeatures = (): WorkbookFeatures => ({ cf: {}, notes: {}, names: [], filters: {}, validations: {} })

function resource<T>(data: Partial<IWorkbookData>, name: string): T | undefined {
  const raw = data.resources?.find((r) => r.name === name)?.data
  if (!raw) return undefined
  try {
    return JSON.parse(raw) as T
  } catch {
    return undefined
  }
}

export function readFeatures(data: Partial<IWorkbookData>): WorkbookFeatures {
  const out = emptyFeatures()
  const sheets = data.sheets ?? {}
  for (const [sheetId, rules] of Object.entries(resource<Record<string, CfRule[]>>(data, CF_RESOURCE) ?? {})) {
    if (sheets[sheetId] && Array.isArray(rules) && rules.length) out.cf[sheetId] = rules.filter((r) => r?.rule && Array.isArray(r.ranges))
  }
  for (const [sheetId, rows] of Object.entries(resource<Record<string, Record<string, Record<string, SheetNote>>>>(data, NOTE_RESOURCE) ?? {})) {
    if (!sheets[sheetId]) continue
    const list: SheetNote[] = []
    for (const [r, cols] of Object.entries(rows ?? {})) {
      for (const [c, note] of Object.entries(cols ?? {})) {
        if (note && typeof note.note === 'string' && note.note !== '') list.push({ ...note, row: Number(r), col: Number(c) })
      }
    }
    if (list.length) out.notes[sheetId] = list
  }
  for (const name of Object.values(resource<Record<string, DefinedName>>(data, NAME_RESOURCE) ?? {})) {
    if (name?.name && name.formulaOrRefString) out.names.push({ ...name, formulaOrRefString: name.formulaOrRefString.replace(/^=/, '') })
  }
  for (const [sheetId, filter] of Object.entries(resource<Record<string, SheetFilter>>(data, FILTER_RESOURCE) ?? {})) {
    if (sheets[sheetId] && filter?.ref) out.filters[sheetId] = filter
  }
  for (const [sheetId, rules] of Object.entries(resource<Record<string, ValidationRule[]>>(data, VALIDATION_RESOURCE) ?? {})) {
    if (sheets[sheetId] && Array.isArray(rules) && rules.length) out.validations[sheetId] = rules.filter((r) => r?.type && Array.isArray(r.ranges))
  }
  return out
}

// Univer plugin resources for the features (only the non-empty ones).
export function featureResources(f: WorkbookFeatures): { name: string; data: string }[] {
  const out: { name: string; data: string }[] = []
  if (Object.keys(f.cf).length) out.push({ name: CF_RESOURCE, data: JSON.stringify(f.cf) })
  if (Object.keys(f.notes).length) {
    const nested: Record<string, Record<number, Record<number, SheetNote>>> = {}
    let n = 0
    for (const [sheetId, notes] of Object.entries(f.notes)) {
      const rows: Record<number, Record<number, SheetNote>> = (nested[sheetId] = {})
      for (const note of notes) (rows[note.row] ??= {})[note.col] = { width: 160, height: 72, ...note, id: note.id ?? `note-${++n}` }
    }
    out.push({ name: NOTE_RESOURCE, data: JSON.stringify(nested) })
  }
  if (f.names.length) out.push({ name: NAME_RESOURCE, data: JSON.stringify(Object.fromEntries(f.names.map((d) => [d.id, { localSheetId: GLOBAL_SCOPE, ...d }]))) })
  if (Object.keys(f.filters).length) out.push({ name: FILTER_RESOURCE, data: JSON.stringify(f.filters) })
  if (Object.keys(f.validations).length) out.push({ name: VALIDATION_RESOURCE, data: JSON.stringify(f.validations) })
  return out
}

// Rows a filter hides, for files that keep the criteria but not the hidden
// rows (value lists only; `text(row, col)` is the cell's text).
export function filteredRows(filter: SheetFilter, text: (row: number, col: number) => string): number[] {
  const lists = (filter.filterColumns ?? []).filter((c) => c.filters)
  if (!lists.length) return []
  const out: number[] = []
  for (let r = filter.ref.startRow + 1; r <= filter.ref.endRow; r++) {
    const hidden = lists.some((c) => {
      const v = text(r, c.colId)
      return v === '' ? !c.filters!.blank : !(c.filters!.filters ?? []).includes(v)
    })
    if (hidden) out.push(r)
  }
  return out
}

// Minimal cell document holding plain text with optional hyperlink / rich text runs.
export function cellDocument(text: string, runs?: { st: number; ed: number; ts: IStyleData }[], url?: string, linkId = 'link'): NonNullable<ICellData['p']> {
  return {
    id: 'd',
    documentStyle: {},
    body: {
      dataStream: text.replace(/\r?\n/g, '\r') + '\r\n',
      textRuns: runs,
      paragraphs: [{ startIndex: text.length }],
      ...(url
        ? {
            customRanges: [
              {
                startIndex: 0,
                endIndex: Math.max(0, text.length - 1),
                rangeId: linkId,
                rangeType: 0 /* HYPERLINK */,
                properties: { url },
              },
            ],
          }
        : {}),
    },
  } as NonNullable<ICellData['p']>
}

// ---------- A1 helpers ----------

export function colLetters(col: number): string {
  let s = ''
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

export const cellA1 = (row: number, col: number, abs = false) => (abs ? `$${colLetters(col)}$${row + 1}` : `${colLetters(col)}${row + 1}`)

export function rangeA1(r: IRange, abs = false): string {
  const a = cellA1(r.startRow, r.startColumn, abs)
  const b = cellA1(r.endRow, r.endColumn, abs)
  return a === b ? a : `${a}:${b}`
}

export function parseCellA1(s: string): { row: number; col: number } | undefined {
  const m = /^\$?([A-Z]{1,3})\$?(\d+)$/i.exec(s.trim())
  if (!m) return undefined
  let col = 0
  for (const ch of m[1].toUpperCase()) col = col * 26 + ch.charCodeAt(0) - 64
  return { row: Number(m[2]) - 1, col: col - 1 }
}

export function parseRangeA1(s: string): IRange | undefined {
  const [a, b] = s.split(':')
  const x = parseCellA1(a)
  const y = parseCellA1(b ?? a)
  if (!x || !y) return undefined
  return { startRow: Math.min(x.row, y.row), endRow: Math.max(x.row, y.row), startColumn: Math.min(x.col, y.col), endColumn: Math.max(x.col, y.col) }
}

// ---------- Rules shared by the formats ----------

export const CF_NUMBER_OPERATORS = ['greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual', 'equal', 'notEqual', 'between', 'notBetween']
export const TIME_PERIODS = ['today', 'yesterday', 'tomorrow', 'last7Days', 'thisMonth', 'lastMonth', 'nextMonth', 'thisWeek', 'lastWeek', 'nextWeek']
export const COMPARISON: Record<string, string> = { greaterThan: '>', greaterThanOrEqual: '>=', lessThan: '<', lessThanOrEqual: '<=', equal: '=', notEqual: '<>' }

// A string literal for a formula.
export const quoteText = (s: string) => `"${s.replace(/"/g, '""')}"`

// The first string literal of a formula (text rules keep their text there).
export function firstLiteral(formula: string): string | undefined {
  const m = /"((?:[^"]|"")*)"/.exec(formula)
  return m ? m[1].replace(/""/g, '"') : undefined
}

// Excel-syntax formula (without "=") for a text rule, relative to the cell `tl`.
export function textRuleFormula(operator: string, text: string, tl: string): string {
  const q = quoteText(text)
  switch (operator) {
    case 'containsText':
      return `NOT(ISERROR(SEARCH(${q},${tl})))`
    case 'notContainsText':
      return `ISERROR(SEARCH(${q},${tl}))`
    case 'beginsWith':
      return `LEFT(${tl},LEN(${q}))=${q}`
    case 'endsWith':
      return `RIGHT(${tl},LEN(${q}))=${q}`
    case 'equal':
      return `${tl}=${q}`
    case 'notEqual':
      return `${tl}<>${q}`
    case 'containsBlanks':
      return `LEN(TRIM(${tl}))=0`
    case 'notContainsBlanks':
      return `LEN(TRIM(${tl}))>0`
    case 'containsErrors':
      return `ISERROR(${tl})`
    case 'notContainsErrors':
      return `NOT(ISERROR(${tl}))`
  }
  return 'FALSE'
}

// A number rule as an Excel-syntax condition on the cell `tl` (for non-numeric bounds).
export function numberRuleFormula(operator: string, value: unknown, tl: string): string {
  const v = (x: unknown) => (typeof x === 'number' ? String(x) : String(x ?? '').replace(/^=/, '') || '0')
  if (operator === 'between' || operator === 'notBetween') {
    const [a, b] = Array.isArray(value) ? value : [value, value]
    const inside = `AND(${tl}>=MIN(${v(a)},${v(b)}),${tl}<=MAX(${v(a)},${v(b)}))`
    return operator === 'between' ? inside : `NOT(${inside})`
  }
  return `${tl}${COMPARISON[operator] ?? '='}${v(value)}`
}

// Univer icon set entries from thresholds listed lowest first (Excel, ODF):
// entry j (highest icon first) uses threshold n-1-j; the last one catches the
// rest, as Univer's own rules do.
export function iconConfig(iconType: string, n: number, reverse: boolean, threshold: (k: number) => CfValue): IconSetRule['config'] {
  const config: IconSetRule['config'] = []
  for (let j = 0; j < n; j++) {
    const iconId = String(reverse ? n - 1 - j : j)
    if (j < n - 1) config.push({ operator: 'greaterThanOrEqual', value: threshold(n - 1 - j), iconType, iconId })
    else config.push({ operator: 'lessThanOrEqual', value: { type: config[0]?.value.type === 'formula' ? 'num' : (config[0]?.value.type ?? 'num'), value: Number.MAX_SAFE_INTEGER }, iconType, iconId })
  }
  return config
}

let cfCounter = 0
export const newCfId = () => `cf-${Date.now().toString(36)}-${++cfCounter}`

export const highlight = (subType: string, style: IStyleData, extra: Partial<HighlightRule> = {}): HighlightRule => ({ type: 'highlightCell', subType, style, ...extra })
