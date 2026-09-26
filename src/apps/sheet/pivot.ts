// Pivot tables as formulas: the distinct row/column keys are read from the
// source when the table is created or refreshed; every value cell is a
// SUMIFS / AVERAGEIFS / COUNTIFS / MINIFS / MAXIFS formula over the source, so
// values stay live, sync as ordinary cell edits and export to XLSX/ODS
// without pivot caches. The table's definition is kept as custom metadata of
// its top-left cell, so it moves with the table and "Refresh" can rebuild it.

import type { FUniver } from '@univerjs/presets'
import type { FWorksheet } from '@univerjs/sheets/facade'
import { t } from '../../core/i18n'
import { el, showDialog, toast } from '../../ui/widgets'
import { colName, parseA1, toA1, type Cell, type CellRange } from './charts/model'
import { defaultRange } from './charts/dialog'
import { PIVOT_LIMITATIONS } from './menus'
import { absRange, uniqueSheetName } from './stats'

export type PivotAgg = 'SUM' | 'AVERAGE' | 'COUNT' | 'MIN' | 'MAX'

export interface PivotSpec {
  v: 1
  sourceSheetId: string
  // Source block with its header row (A1, no sheet name); grows on refresh.
  source: string
  rows: string
  columns: string
  values: string
  agg: PivotAgg
  filter: string
  // Size written last time (cleared before a refresh).
  size?: { rows: number; cols: number }
}

const PIVOT_KEY = 'ofimeoPivot'
const AGGS: [PivotAgg, () => string][] = [
  ['SUM', () => t('Sum')],
  ['AVERAGE', () => t('Average')],
  ['COUNT', () => t('Count')],
  ['MIN', () => t('Minimum')],
  ['MAX', () => t('Maximum')],
]
const aggLabel = (agg: PivotAgg) => AGGS.find((a) => a[0] === agg)![1]()

const values2d = (sheet: FWorksheet, r: CellRange) =>
  sheet.getRange(r.startRow, r.startColumn, r.endRow - r.startRow + 1, r.endColumn - r.startColumn + 1).getValues() as Cell[][]

const empty = (v: Cell) => v === null || v === undefined || v === ''

// The source grows down while the rows below it hold data (new records).
function currentSource(sheet: FWorksheet, source: CellRange): CellRange {
  const r = { ...source }
  const width = r.endColumn - r.startColumn + 1
  while (r.endRow < 100000 && (sheet.getRange(r.endRow + 1, r.startColumn, 1, width).getValues()[0] as Cell[]).some((v) => !empty(v))) r.endRow++
  return r
}

export async function pivotDialog(univerAPI: FUniver): Promise<void> {
  const wb = univerAPI.getActiveWorkbook()!
  const sheet = wb.getActiveSheet()
  const range = el('input', { class: 'field', value: defaultRange(univerAPI), spellcheck: false })
  const rows = el('select', { class: 'field' })
  const columns = el('select', { class: 'field' })
  const values = el('select', { class: 'field' })
  const filter = el('select', { class: 'field' })
  const agg = el('select', { class: 'field' }, ...AGGS.map(([v, l]) => el('option', { value: v, textContent: l() })))
  const where = el('select', { class: 'field' }, el('option', { value: 'sheet', textContent: t('New sheet') }), el('option', { value: 'cell', textContent: t('At a cell…') }))
  const cell = el('input', { class: 'field', placeholder: 'H1', hidden: true, spellcheck: false })
  where.addEventListener('change', () => (cell.hidden = where.value !== 'cell'))
  const none = () => el('option', { value: '', textContent: t('(none)') })
  const fill = () => {
    const r = parseA1(range.value)
    const header = r ? (values2d(sheet, { ...r, endRow: r.startRow })[0] ?? []).map((v) => (empty(v) ? '' : String(v))).filter(Boolean) : []
    const options = () => header.map((h) => el('option', { value: h, textContent: h }))
    rows.replaceChildren(...options())
    columns.replaceChildren(none(), ...options())
    values.replaceChildren(...options())
    filter.replaceChildren(none(), ...options())
    // Guesses: first column as rows, a numeric last column as values.
    if (header.length > 1) values.value = header[header.length - 1]
    if (header.length > 2) columns.value = header[1] !== values.value ? header[1] : ''
  }
  range.addEventListener('change', fill)
  fill()
  const field = (label: string, input: HTMLElement) => el('label', { class: 'field-label' }, label, input)
  const body = el(
    'div',
    { class: 'form pivot-form' },
    field(t('Source data (with a header row)'), range),
    el('div', { class: 'chart-row' }, field(t('Rows'), rows), field(t('Columns'), columns)),
    el('div', { class: 'chart-row' }, field(t('Values'), values), field(t('Summarize by'), agg)),
    field(t('Filter (optional)'), filter),
    field(t('Place the table'), el('div', { class: 'chart-row' }, where, cell)),
    el('p', { class: 'dialog-note', textContent: PIVOT_LIMITATIONS() }),
  )
  if ((await showDialog(t('Pivot table'), body, [{ label: t('Cancel'), value: 'cancel' }, { label: t('Create'), value: 'ok', primary: true }], true)) !== 'ok') return
  const src = parseA1(range.value)
  if (!src || src.endRow <= src.startRow) return toast(t('Select a range with a header row and data'))
  if (!rows.value || !values.value) return toast(t('Choose the rows and the values'))
  const spec: PivotSpec = {
    v: 1,
    sourceSheetId: sheet.getSheetId(),
    source: toA1(src),
    rows: rows.value,
    columns: columns.value === rows.value ? '' : columns.value,
    values: values.value,
    agg: agg.value as PivotAgg,
    filter: filter.value,
  }
  let target: FWorksheet = sheet
  let at = { row: 0, col: 0 }
  if (where.value === 'sheet') {
    target = wb.insertSheet(uniqueSheetName(univerAPI, t('Pivot table')))
  } else {
    const c = parseA1(cell.value)
    if (!c) return toast(t('Enter a cell such as H1'))
    at = { row: c.startRow, col: c.startColumn }
  }
  writePivot(univerAPI, target, at, spec)
  target.activate()
}

// Writes (or rewrites) a pivot table with its top-left cell at `at`.
function writePivot(univerAPI: FUniver, target: FWorksheet, at: { row: number; col: number }, spec: PivotSpec): boolean {
  const wb = univerAPI.getActiveWorkbook()!
  const source = wb.getSheetBySheetId(spec.sourceSheetId)
  const first = parseA1(spec.source)
  if (!source || !first) return false
  const src = currentSource(source, first)
  const data = values2d(source, src)
  const header = (data[0] ?? []).map((v) => (empty(v) ? '' : String(v)))
  const index = (name: string) => (name ? header.indexOf(name) : -1)
  const [ri, ci, vi, fi] = [index(spec.rows), index(spec.columns), index(spec.values), index(spec.filter)]
  if (ri < 0 || vi < 0) {
    toast(t('The pivot table source no longer has the column {name}', { name: ri < 0 ? spec.rows : spec.values }))
    return false
  }
  const distinct = (i: number) => {
    const seen = new Map<string, string | number>()
    for (const row of data.slice(1)) if (!empty(row[i])) seen.set(String(row[i]), row[i] as string | number)
    return [...seen.values()].sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true })))
  }
  const rowKeys = distinct(ri)
  const colKeys = ci >= 0 ? distinct(ci) : []
  const sameSheet = target.getSheetId() === source.getSheetId()
  const sourceName = sameSheet ? undefined : source.getSheetName()
  const column = (i: number) => absRange({ startRow: src.startRow + 1, endRow: src.endRow, startColumn: src.startColumn + i, endColumn: src.startColumn + i }, sourceName)
  const [valR, rowR, colR, filtR] = [column(vi), column(ri), ci >= 0 ? column(ci) : '', fi >= 0 ? column(fi) : '']

  // Layout: optional filter row and a blank row, then the table.
  const out: (string | number)[][] = []
  const top = at.row + (fi >= 0 ? 2 : 0)
  const ref = (r: number, c: number, absCol: boolean, absRow: boolean) => `${absCol ? '$' : ''}${colName(at.col + c)}${absRow ? '$' : ''}${top + r + 1}`
  const filterCell = `$${colName(at.col + 1)}$${at.row + 1}`
  const crit = (pairs: [string, string][]) => {
    const all = fi >= 0 ? [...pairs, [filtR, `IF(${filterCell}="","<>§",${filterCell})`] as [string, string]] : pairs
    return all.map(([r, c]) => `${r},${c}`).join(',')
  }
  const cellFormula = (pairs: [string, string][]) => {
    const c = crit(pairs)
    switch (spec.agg) {
      case 'COUNT':
        return `=COUNTIFS(${c})`
      case 'AVERAGE':
        return `=IFERROR(AVERAGEIFS(${valR},${c}),"")`
      case 'MIN':
      case 'MAX':
        return `=IF(COUNTIFS(${c})=0,"",${spec.agg}IFS(${valR},${c}))`
      default:
        return `=SUMIFS(${valR},${c})`
    }
  }
  const allRows: [string, string] = [rowR, '"<>§"']
  const title = `${aggLabel(spec.agg)} · ${spec.values}`
  if (colKeys.length) {
    out.push([title, ...colKeys, t('Total')])
    rowKeys.forEach((key, i) => {
      const rk = ref(i + 1, 0, true, false)
      out.push([key, ...colKeys.map((_, j) => cellFormula([[rowR, rk], [colR, ref(0, j + 1, false, true)]])), cellFormula([[rowR, rk]])])
    })
    out.push([t('Total'), ...colKeys.map((_, j) => cellFormula([allRows, [colR, ref(0, j + 1, false, true)]])), cellFormula([allRows])])
  } else {
    out.push([spec.rows, title])
    rowKeys.forEach((key, i) => out.push([key, cellFormula([[rowR, ref(i + 1, 0, true, false)]])]))
    out.push([t('Total'), cellFormula([allRows])])
  }

  // Clear what the previous version wrote, then write.
  const prev = spec.size
  if (prev) target.getRange(at.row, at.col, prev.rows, prev.cols).clear()
  const width = out[0].length
  const size = { rows: top - at.row + out.length, cols: Math.max(width, fi >= 0 ? 2 : 0) }
  if (fi >= 0) {
    target.getRange(at.row, at.col, 1, 3).setValues([[spec.filter, '', t('(empty = all)')]] as never)
    target.getRange(at.row, at.col).setFontWeight('bold')
    target.getRange(at.row, at.col + 1).setBackgroundColor('#fef7e0')
    target.getRange(at.row, at.col + 2).setFontStyle('italic')
    size.cols = Math.max(size.cols, 3)
  }
  target.getRange(top, at.col, out.length, width).setValues(out as never)
  target.getRange(top, at.col, 1, width).setFontWeight('bold').setBackgroundColor('#e6f4ea')
  target.getRange(top, at.col, out.length, 1).setFontWeight('bold')
  target.getRange(top + out.length - 1, at.col, 1, width).setFontWeight('bold').setBackgroundColor('#f1f3f4')
  if (spec.agg !== 'COUNT') target.getRange(top + 1, at.col + 1, out.length - 1, width - 1).setNumberFormat(spec.agg === 'AVERAGE' ? '0.00' : '#,##0.##')
  target.getRange(at.row, at.col).setCustomMetaData({ [PIVOT_KEY]: { ...spec, source: toA1(src), size } })
  return true
}

// Rebuilds every pivot table of the workbook (new keys, grown source).
export function refreshPivots(univerAPI: FUniver): number {
  const wb = univerAPI.getActiveWorkbook()!
  let n = 0
  for (const sheet of wb.getSheets()) {
    const snapshot = sheet.getSheet().getCellMatrix()
    const found: { row: number; col: number; spec: PivotSpec }[] = []
    snapshot.forValue((row, col, cell) => {
      const spec = (cell?.custom as Record<string, unknown> | undefined)?.[PIVOT_KEY] as PivotSpec | undefined
      if (spec?.v === 1) found.push({ row, col, spec })
    })
    for (const { row, col, spec } of found) if (writePivot(univerAPI, sheet, { row, col }, spec)) n++
  }
  toast(n ? t('Pivot tables refreshed: {n}', { n }) : t('There are no pivot tables in this spreadsheet'))
  return n
}
