// OpenDocument Spreadsheet (.ods) import into a Univer workbook snapshot.

import JSZip from 'jszip'
import type { IBorderData, IBorderStyleData, ICellData, IRange, IStyleData, IWorkbookData, IWorksheetData } from '@univerjs/presets'
import { attr, child, children, parseXml, toHex } from '../../../core/formats'
import { t } from '../../../core/i18n'
import { CHART_COMPONENT, DRAWING_TYPE_DOM, DRAWING_TYPE_IMAGE } from '../charts/model'
import { DrawingCollector } from './drawings'
import { odsFrames, pxToAnchor, readOdsCharts, type OdsFrame } from './ods-charts'
import { emptyFeatures, featureResources, filteredRows, GLOBAL_SCOPE, type SheetNote } from './features'
import { readOdsConditionalFormats, readOdsFilters, readOdsNames, readOdsNote } from './ods-features'

// Limits against huge repeats (LibreOffice pads sheets to 1M rows × 16K columns).
const MAX_ROWS = 100_000
const MAX_COLS = 16_384
// Style-only runs longer than this are sheet padding, not real cells.
const FILLER_RUN = 256
const MAX_STYLED_CELLS = 500_000

const PX_PER_IN = 96
// LibreOffice's default column width (0.889in); treated as "no explicit width".
const LO_DEFAULT_COL_PX = 0.889 * PX_PER_IN
const DEFAULT_COL_PX = 88
const DEFAULT_ROW_PX = 24
const DAY_MS = 86_400_000
const EPOCH_1899 = Date.UTC(1899, 11, 30)

// Univer enum values (kept numeric so this chunk doesn't need the Univer runtime).
const T_STRING = 1
const T_NUMBER = 2
const T_BOOLEAN = 3
const T_FORCE_STRING = 4
const B = {
  THIN: 1,
  HAIR: 2,
  DOTTED: 3,
  DASHED: 4,
  DASH_DOT: 5,
  DASH_DOT_DOT: 6,
  DOUBLE: 7,
  MEDIUM: 8,
  MEDIUM_DASHED: 9,
  MEDIUM_DASH_DOT: 10,
  MEDIUM_DASH_DOT_DOT: 11,
  THICK: 13,
} as const

export async function importOds(buf: ArrayBuffer): Promise<Partial<IWorkbookData>> {
  const zip = await JSZip.loadAsync(buf)
  const read = async (path: string) => {
    const f = zip.file(path)
    return f ? parseXml(await f.async('string')) : null
  }
  const content = await read('content.xml')
  if (!content) throw new Error(t('Not an OpenDocument spreadsheet (content.xml missing)'))
  const data = convertOds(content, await read('styles.xml'), await read('settings.xml'))
  try {
    await importDrawings(zip, content, data)
  } catch (err) {
    console.warn('Could not read the charts and images', err)
  }
  return data
}

// Charts and images (draw:frame) become Univer drawings at the same place.
async function importDrawings(zip: JSZip, content: Document, data: Partial<IWorkbookData>): Promise<void> {
  const sheets = data.sheets ?? {}
  const idOf = new Map(Object.entries(sheets).map(([id, s]) => [s.name ?? '', id]))
  const drawings = new DrawingCollector(sheets as IWorkbookData['sheets'])
  const place = (f: OdsFrame, sheetId: string, fields: Record<string, unknown>) => {
    const s = sheets[sheetId]
    const colWidth = (c: number) => s?.columnData?.[c]?.w ?? s?.defaultColumnWidth ?? DEFAULT_COL_PX
    const rowHeight = (r: number) => s?.rowData?.[r]?.h ?? s?.defaultRowHeight ?? DEFAULT_ROW_PX
    // Frames anchored to a cell are positioned from that cell's corner.
    let x = f.x
    let y = f.y
    for (let c = 0; c < f.col; c++) x += colWidth(c)
    for (let r = 0; r < f.row; r++) y += rowHeight(r)
    const w = f.width || 100
    const h = f.height || 100
    drawings.add(sheetId, pxToAnchor(x, y, colWidth, rowHeight), pxToAnchor(x + w, y + h, colWidth, rowHeight), fields)
  }
  for (const c of await readOdsCharts(zip, content)) {
    const host = idOf.get(c.table)
    const source = idOf.get(c.sourceSheet)
    if (host && source) place(c, host, { drawingType: DRAWING_TYPE_DOM, componentKey: CHART_COMPONENT, allowTransform: true, data: { ...c.spec, sheetId: source } })
  }
  for (const f of odsFrames(content)) {
    const host = idOf.get(f.table)
    const href = attr(child(f.frame, 'image'), 'href')
    const file = href && zip.file(href.replace(/^\.\//, ''))
    // Chart frames also hold a replacement picture of the chart.
    if (!host || !href || !file || child(f.frame, 'object')) continue
    const ext = href.split('.').pop()!.toLowerCase()
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : ext === 'svg' ? 'image/svg+xml' : 'image/png'
    place(f, host, { drawingType: DRAWING_TYPE_IMAGE, imageSourceType: 'URL', source: `data:${mime};base64,${await file.async('base64')}` })
  }
  if (!drawings.empty) data.resources = [...(data.resources ?? []), drawings.resource()]
}

// Also used for flat .fods documents, where all three parts are the same document.
export function convertOds(content: Document, stylesDoc: Document | null, settings: Document | null): Partial<IWorkbookData> {
  const styles = new StyleResolver(content, stylesDoc)
  const view = readViewSettings(settings)
  const spreadsheet = child(child(content.documentElement, 'body'), 'spreadsheet')
  if (!spreadsheet) throw new Error(t('The document is not a spreadsheet'))

  const sheetOrder: string[] = []
  const sheets: IWorkbookData['sheets'] = {}
  const features = emptyFeatures()
  const filters = readOdsFilters(spreadsheet)
  const styleOf = (name: string | null) => styles.styleProps(name)
  children(spreadsheet, 'table').forEach((table, i) => {
    const id = `sheet-${i + 1}`
    sheetOrder.push(id)
    const extra: TableExtras = { notes: [], filtered: [] }
    const sheet = (sheets[id] = readTable(table, id, styles, view, extra))
    if (extra.notes.length) features.notes[id] = extra.notes
    const cf = readOdsConditionalFormats(table, styleOf, odfFormulaToExcel)
    if (cf.length) features.cf[id] = cf
    features.names.push(...readOdsNames(child(table, 'named-expressions'), id, odfFormulaToExcel, features.names.length))
    const filter = filters.get(sheet.name ?? '')
    if (filter) {
      // Rows the filter hides belong to the filter, not to the sheet.
      const hidden = filter.filterColumns?.length ? extra.filtered.filter((r) => r > filter.ref.startRow && r <= filter.ref.endRow) : []
      for (const r of hidden) if (sheet.rowData?.[r]) delete sheet.rowData[r].hd
      const cellText = (r: number, c: number) => String(sheet.cellData?.[r]?.[c]?.v ?? '')
      features.filters[id] = { ...filter, cachedFilteredOut: hidden.length ? hidden : filteredRows(filter, cellText) }
    }
  })
  features.names.push(...readOdsNames(child(spreadsheet, 'named-expressions'), GLOBAL_SCOPE, odfFormulaToExcel, features.names.length))
  if (!sheetOrder.length) {
    sheetOrder.push('sheet-1')
    sheets['sheet-1'] = { id: 'sheet-1', name: 'Sheet1', rowCount: 1000, columnCount: 26, cellData: {} }
  }
  return { name: '', locale: 'enUS' as IWorkbookData['locale'], styles: styles.registry, sheetOrder, sheets, resources: featureResources(features) }
}

interface TableExtras {
  notes: SheetNote[]
  // Rows hidden by a filter (visibility="filter").
  filtered: number[]
}

// ---------------------------------------------------------------------------
// Tables

interface Span {
  start: number
  end: number
}

interface ParsedCell {
  col: number
  n: number
  cell?: ICellData
  // Number format implied by the value type when the cell style has none.
  fallback?: string
  styleName: string | null
  rs: number
  cs: number
}

function readTable(table: Element, id: string, styles: StyleResolver, view: ViewSettings, extra: TableExtras): Partial<IWorksheetData> {
  const name = attr(table, 'name') || id
  const cellData: Record<number, Record<number, ICellData>> = {}
  const mergeData: IRange[] = []
  const rowMeta: Array<Span & { h?: number; hd?: boolean; s?: string }> = []
  const colMeta: Array<Span & { w?: number; hd?: boolean; s?: string }> = []
  // Column default cell styles (ODF names), used by cells without their own style.
  const colDefault: Array<Span & { name: string }> = []
  let maxRow = -1
  let maxCol = -1
  let styledCells = 0
  let sheetStyle: string | undefined

  let c = 0
  for (const col of walk(table, 'table-column', ['table-column-group', 'table-header-columns', 'table-columns'])) {
    const n = Math.min(int(attr(col, 'number-columns-repeated'), 1), MAX_COLS - c)
    if (n <= 0) break
    const span = { start: c, end: c + n - 1 }
    const w = styles.columnWidth(attr(col, 'style-name'))
    const hd = attr(col, 'visibility') === 'collapse' || attr(col, 'visibility') === 'filter'
    const defName = attr(col, 'default-cell-style-name')
    let def = styles.cellStyleId(defName)
    // A style on the columns up to the sheet's end becomes the sheet default.
    if (def && c + n >= 1024 && n >= FILLER_RUN) {
      sheetStyle = def
      def = undefined
    }
    if (w !== undefined || hd || def) colMeta.push({ ...span, w, hd, s: def })
    if (defName && (def || sheetStyle)) colDefault.push({ ...span, name: defName })
    if (n < FILLER_RUN && (w !== undefined || hd || def)) maxCol = Math.max(maxCol, span.end)
    c += n
  }
  const columnStyle = (col: number) => colDefault.find((d) => col >= d.start && col <= d.end)?.name ?? null

  let r = 0
  for (const row of walk(table, 'table-row', ['table-row-group', 'table-header-rows', 'table-rows'])) {
    if (r >= MAX_ROWS) break
    const repeat = Math.min(int(attr(row, 'number-rows-repeated'), 1), MAX_ROWS - r)
    const cells = children(row).filter((el) => el.localName === 'table-cell' || el.localName === 'covered-table-cell')
    const hasContent = cells.some((el) => el.localName === 'table-cell' && isContentCell(el))
    const h = styles.rowHeight(attr(row, 'style-name'))
    const hd = attr(row, 'visibility') === 'collapse' || attr(row, 'visibility') === 'filter'
    if (attr(row, 'visibility') === 'filter') for (let k = 0; k < Math.min(repeat, 10_000); k++) extra.filtered.push(r + k)
    let rowStyle = styles.cellStyleId(attr(row, 'default-cell-style-name'))
    // Padding rows (style-only, repeated to the end of the sheet) don't create cells.
    const padding = !hasContent && repeat >= FILLER_RUN

    // Parse the row once, then replicate it for each repeat.
    const parsed: ParsedCell[] = []
    let col = 0
    for (const el of cells) {
      if (col >= MAX_COLS) break
      const n = Math.min(int(attr(el, 'number-columns-repeated'), 1), MAX_COLS - col)
      if (el.localName === 'table-cell') {
        const note = readOdsNote(el)
        if (note) extra.notes.push({ ...note, row: r, col })
        const styleName = attr(el, 'style-name')
        const read = readCell(el)
        const cs = int(attr(el, 'number-columns-spanned'), 1)
        const rs = int(attr(el, 'number-rows-spanned'), 1)
        if (read) parsed.push({ col, n, ...read, styleName, rs, cs })
        else if (styleName && n >= FILLER_RUN) {
          // A style applied to the rest of the row: keep it as the row style.
          if (!padding) rowStyle ??= styles.cellStyleId(styleName)
        } else if (styleName || rs > 1 || cs > 1) parsed.push({ col, n, styleName, rs, cs })
      }
      col += n
    }

    if (h !== undefined || hd || rowStyle) {
      rowMeta.push({ start: r, end: r + repeat - 1, h, hd, s: rowStyle })
      if (!padding) maxRow = Math.max(maxRow, r + repeat - 1)
    }
    if (!padding) {
      for (let k = 0; k < repeat; k++) {
        const rr = r + k
        for (const p of parsed) {
          for (let j = 0; j < p.n; j++) {
            const cc = p.col + j
            if (p.rs > 1 || p.cs > 1) {
              mergeData.push({ startRow: rr, endRow: rr + p.rs - 1, startColumn: cc, endColumn: cc + p.cs - 1 })
              maxRow = Math.max(maxRow, rr + p.rs - 1)
              maxCol = Math.max(maxCol, cc + p.cs - 1)
            }
            // Cells without their own style use the column default.
            const s = styles.cellStyleId(p.styleName ?? columnStyle(cc), p.fallback)
            if (!p.cell) {
              // Style-only cell: skip unstyled ones and those already covered by the column style.
              if (!s || s === rowStyle || styledCells > MAX_STYLED_CELLS || (!p.styleName && !p.fallback)) continue
              styledCells++
            }
            const cell: ICellData = p.cell ? { ...p.cell } : {}
            if (s) cell.s = s
            ;(cellData[rr] ??= {})[cc] = cell
            maxRow = Math.max(maxRow, rr)
            maxCol = Math.max(maxCol, cc)
          }
        }
      }
    }
    r += repeat
  }

  const rowCount = Math.max(1000, maxRow + 1 + 100)
  const columnCount = Math.max(26, maxCol + 1 + 10)
  const rowData: Record<number, { h?: number; hd?: number; s?: string }> = {}
  for (const m of rowMeta) {
    for (let i = m.start; i <= Math.min(m.end, rowCount - 1); i++) {
      const d: { h?: number; hd?: number; s?: string } = {}
      if (m.h !== undefined) d.h = m.h
      if (m.hd) d.hd = 1
      if (m.s) d.s = m.s
      rowData[i] = d
    }
  }
  const columnData: Record<number, { w?: number; hd?: number; s?: string }> = {}
  for (const m of colMeta) {
    for (let i = m.start; i <= Math.min(m.end, columnCount - 1); i++) {
      const d: { w?: number; hd?: number; s?: string } = {}
      if (m.w !== undefined) d.w = m.w
      if (m.hd) d.hd = 1
      if (m.s) d.s = m.s
      columnData[i] = d
    }
  }

  const tableStyle = styles.tableProps(attr(table, 'style-name'))
  const tv = view.tables.get(name)
  const xSplit = tv?.xSplit ?? 0
  const ySplit = tv?.ySplit ?? 0
  const sheet: Partial<IWorksheetData> = {
    id,
    name,
    rowCount,
    columnCount,
    defaultColumnWidth: DEFAULT_COL_PX,
    defaultRowHeight: DEFAULT_ROW_PX,
    cellData,
    rowData,
    columnData,
    mergeData,
    hidden: tableStyle.hidden ? 1 : 0,
    showGridlines: (tv?.showGrid ?? view.showGrid ?? true) ? 1 : 0,
    freeze: { xSplit, ySplit, startRow: ySplit > 0 ? ySplit : -1, startColumn: xSplit > 0 ? xSplit : -1 },
  }
  if (tableStyle.tabColor) sheet.tabColor = tableStyle.tabColor
  if (sheetStyle) sheet.defaultStyle = sheetStyle
  return sheet
}

// Yields `name` elements, descending into grouping elements.
function* walk(el: Element, name: string, groups: string[]): Generator<Element> {
  for (const c of children(el)) {
    if (c.localName === name) yield c
    else if (groups.includes(c.localName)) yield* walk(c, name, groups)
  }
}

function int(value: string | null, fallback: number): number {
  const n = value ? parseInt(value, 10) : NaN
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function isContentCell(el: Element): boolean {
  return !!(attr(el, 'value-type') || attr(el, 'formula') || children(el, 'p').length)
}

// ---------------------------------------------------------------------------
// Cells

function readCell(el: Element): { cell: ICellData; fallback?: string } | null {
  const type = attr(el, 'value-type')
  const formula = attr(el, 'formula')
  const text = cellText(el)
  if (!type && !formula && !text) return null
  const cell: ICellData = {}
  let fallback: string | undefined

  switch (type) {
    case 'float':
    case 'percentage':
    case 'currency': {
      cell.v = num(attr(el, 'value'))
      cell.t = T_NUMBER
      if (type === 'percentage') fallback = '0%'
      if (type === 'currency') fallback = '#,##0.00'
      break
    }
    case 'date': {
      const dv = attr(el, 'date-value')
      cell.v = dv ? dateSerial(dv) : 0
      cell.t = T_NUMBER
      fallback = dv && dv.includes('T') ? 'yyyy-mm-dd hh:mm:ss' : 'yyyy-mm-dd'
      break
    }
    case 'time': {
      cell.v = durationDays(attr(el, 'time-value') || '')
      cell.t = T_NUMBER
      fallback = 'hh:mm:ss'
      break
    }
    case 'boolean': {
      const b = attr(el, 'boolean-value')
      cell.v = b === 'true' || b === '1' ? 1 : 0
      cell.t = T_BOOLEAN
      break
    }
    default: {
      // Strings, errors (calcext:value-type="error") and untyped text.
      const sv = attr(el, 'string-value')
      const v = sv !== null && sv !== '' ? sv : text
      const isError = [...el.attributes].some((a) => a.localName === 'value-type' && a.value === 'error')
      if (v || !formula) {
        cell.v = v
        cell.t = isError || isNumericText(v) ? T_FORCE_STRING : T_STRING
      }
    }
  }
  if (formula) cell.f = odfFormulaToExcel(formula)
  return { cell, fallback }
}

function num(value: string | null): number {
  const n = value === null ? NaN : Number(value)
  return Number.isFinite(n) ? n : 0
}

function isNumericText(v: string): boolean {
  return v.trim() !== '' && Number.isFinite(Number(v))
}

// "2023-03-15" or "2023-03-15T18:00:00[.123][Z]" → spreadsheet serial (1899-12-30 epoch).
export function dateSerial(value: string): number {
  const m = /^(-?\d{4,})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d)(?::(\d\d(?:\.\d+)?))?)?/.exec(value)
  if (!m) return 0
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), 0) + parseFloat(m[6] || '0') * 1000
  return round((ms - EPOCH_1899) / DAY_MS)
}

// ISO 8601 duration ("PT12H30M00S", "-P1DT2H") → days.
export function durationDays(value: string): number {
  const m = /^(-)?P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value.trim())
  if (!m) return 0
  const days = +(m[2] || 0) + +(m[3] || 0) / 24 + +(m[4] || 0) / 1440 + +(m[5] || 0) / 86400
  return round(m[1] ? -days : days)
}

// Drops binary noise from date arithmetic (e.g. 0.7500000001).
function round(n: number): number {
  return Math.round(n * 1e10) / 1e10
}

// Plain text of a cell: paragraphs joined by newlines.
function cellText(el: Element): string {
  return children(el, 'p').map(inlineText).join('\n')
}

function inlineText(el: Element): string {
  let out = ''
  for (const node of el.childNodes) {
    if (node.nodeType === 3) out += node.nodeValue
    else if (node.nodeType === 1) {
      const e = node as Element
      if (e.localName === 's') out += ' '.repeat(int(attr(e, 'c'), 1))
      else if (e.localName === 'tab') out += '\t'
      else if (e.localName === 'line-break') out += '\n'
      else if (e.localName === 'annotation' || e.localName === 'note') continue
      else out += inlineText(e)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Formulas: OpenFormula ("of:=SUM([.A1:.A3];[$Sheet2.B1])") → Excel syntax ("=SUM(A1:A3,Sheet2!B1)").

const FUNCTION_NAMES: Record<string, string> = {
  'LEGACY.CHIDIST': 'CHIDIST',
  'LEGACY.CHIINV': 'CHIINV',
  'LEGACY.FDIST': 'FDIST',
  'LEGACY.FINV': 'FINV',
  'LEGACY.NORMSDIST': 'NORMSDIST',
  'LEGACY.NORMSINV': 'NORMSINV',
  'LEGACY.TDIST': 'TDIST',
  'LEGACY.TINV': 'TINV',
  'ERRORTYPE': 'ERROR.TYPE',
}

export function odfFormulaToExcel(formula: string): string {
  const m = /^([a-z]+):(?==)/.exec(formula)
  const ns = m?.[1]
  let s = m ? formula.slice(m[0].length) : formula
  if (!s.startsWith('=')) s = '=' + s
  // Excel-syntax formulas (written by some generators) need no conversion.
  if (ns === 'msoxl') return s

  let out = ''
  let braces = 0
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (ch === '"') {
      const j = skipQuoted(s, i, '"')
      out += s.slice(i, j)
      i = j
    } else if (ch === '[') {
      let j = i + 1
      while (j < s.length && s[j] !== ']') j = s[j] === "'" ? skipQuoted(s, j, "'") : j + 1
      out += odfRefToExcel(s.slice(i + 1, j))
      i = j + 1
    } else if (ch === '{') {
      braces++
      out += ch
      i++
    } else if (ch === '}') {
      braces--
      out += ch
      i++
    } else if (ch === ';' || ch === '~') {
      out += ','
      i++
    } else if (ch === '|' && braces > 0) {
      out += ';'
      i++
    } else if (ch === '!') {
      out += ' '
      i++
    } else if (/[A-Za-z_]/.test(ch) && !/[\w.$]/.test(s[i - 1] || '')) {
      const id = /^[A-Za-z_][\w.]*/.exec(s.slice(i))![0]
      i += id.length
      if (s[i] === '(') out += functionToExcel(id)
      else out += id
    } else {
      out += ch
      i++
    }
  }
  return out
}

function functionToExcel(name: string): string {
  const upper = name.toUpperCase()
  if (FUNCTION_NAMES[upper]) return FUNCTION_NAMES[upper]
  if (upper.startsWith('COM.MICROSOFT.')) return name.slice('COM.MICROSOFT.'.length)
  if (upper.startsWith('_XLFN.')) return name.slice(6)
  return name
}

// Index just past a quoted run starting at `i` (doubled quotes escape).
function skipQuoted(s: string, i: number, q: string): number {
  let j = i + 1
  while (j < s.length) {
    if (s[j] === q) {
      if (s[j + 1] === q) j += 2
      else return j + 1
    } else j++
  }
  return j
}

// ".A1", ".A1:.B2", "$Sheet1.A1", "$'My sheet'.A1:.B2", "Sheet1.A1:Sheet3.B2", "#REF!"
function odfRefToExcel(ref: string): string {
  const parts: string[] = []
  let start = 0
  for (let i = 0; i < ref.length; i++) {
    if (ref[i] === "'") i = skipQuoted(ref, i, "'") - 1
    else if (ref[i] === ':') {
      parts.push(ref.slice(start, i))
      start = i + 1
    }
  }
  parts.push(ref.slice(start))
  const parsed = parts.map(parseRefPart)
  if (parsed.some((p) => !p)) return ref.replace(/^\$?\.?/, '')
  const [a, b] = parsed as Array<{ sheet?: string; cell: string }>
  let cellA = a.cell
  let cellB = b?.cell
  // Whole columns / rows written as full-height / full-width areas.
  if (cellB) {
    const ca = /^(\$?[A-Z]+)\$?1$/i.exec(cellA)
    const cb = /^(\$?[A-Z]+)\$?1048576$/i.exec(cellB)
    if (ca && cb) [cellA, cellB] = [ca[1], cb[1]]
    const ra = /^\$?A(\$?\d+)$/i.exec(cellA)
    const rb = /^\$?(?:XFD|AMJ)(\$?\d+)$/i.exec(cellB)
    if (ra && rb) [cellA, cellB] = [ra[1], rb[1]]
  }
  let prefix = ''
  if (a.sheet !== undefined) {
    prefix = excelSheetName(a.sheet)
    if (b?.sheet !== undefined && b.sheet !== a.sheet) prefix += ':' + excelSheetName(b.sheet)
    prefix += '!'
  }
  return prefix + cellA + (cellB ? ':' + cellB : '')
}

function parseRefPart(part: string): { sheet?: string; cell: string } | null {
  let p = part.trim()
  // External document reference: 'file:///…'#$Sheet1.A1 (the document is dropped).
  const ext = /^'(?:[^']|'')*'#/.exec(p)
  if (ext) p = p.slice(ext[0].length)
  if (p.startsWith('#') || /^\$?\.?#/.test(p)) return null
  const m = /^\$?('(?:[^']|'')*'|[^']*)\.(\$?[A-Za-z]*\$?\d*)$/.exec(p)
  if (!m || !m[2]) return null
  let sheet: string | undefined = m[1]
  if (sheet === '') sheet = undefined
  else if (sheet.startsWith("'")) sheet = sheet.slice(1, -1).replace(/''/g, "'")
  return { sheet, cell: m[2] }
}

export function excelSheetName(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) && !/^[A-Za-z]{1,3}\d+$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`
}

// ---------------------------------------------------------------------------
// Styles

interface StyleEntry {
  el: Element
  parent: string | null
}

class StyleResolver {
  // Univer style registry: id → style.
  registry: Record<string, IStyleData> = {}
  private byKey = new Map<string, string>()
  private cellCache = new Map<string, string | undefined>()
  private resolved = new Map<string, { style: IStyleData; pattern?: string }>()
  private cellStyles = new Map<string, StyleEntry>()
  private displayNames = new Map<string, string>()
  private otherStyles = new Map<string, Element>()
  private dataStyles = new Map<string, Element>()
  private fonts = new Map<string, string>()

  constructor(content: Document, stylesDoc: Document | null) {
    // styles.xml first, so content.xml automatic styles win on name clashes.
    for (const doc of [stylesDoc, content]) {
      if (!doc) continue
      const root = doc.documentElement
      for (const decls of children(root, 'font-face-decls')) {
        for (const f of children(decls, 'font-face')) {
          const family = attr(f, 'font-family')
          this.fonts.set(attr(f, 'name') || '', unquoteFont(family || attr(f, 'name') || ''))
        }
      }
      for (const section of ['styles', 'automatic-styles']) {
        for (const container of children(root, section)) {
          for (const el of children(container)) {
            const name = attr(el, 'name')
            if (!name) continue
            if (el.namespaceURI?.includes(':datastyle:')) this.dataStyles.set(name, el)
            else if (el.localName === 'style') {
              const family = attr(el, 'family')
              if (family === 'table-cell') {
                this.cellStyles.set(name, { el, parent: attr(el, 'parent-style-name') })
                // Conditions refer to styles by their display name.
                const display = attr(el, 'display-name')
                if (display && display !== name) this.displayNames.set(display, name)
              }
              else this.otherStyles.set(`${family}:${name}`, el)
            }
          }
        }
      }
    }
  }

  // Univer style id for an ODF cell style name (undefined for empty styles).
  // `fallback` is the number format to use when the style has none.
  cellStyleId(name: string | null, fallback?: string): string | undefined {
    if (!name && !fallback) return undefined
    const cacheKey = `${name ?? ''}\n${fallback ?? ''}`
    if (this.cellCache.has(cacheKey)) return this.cellCache.get(cacheKey)
    const { style, pattern } = name ? this.resolve(name, 0) : { style: {}, pattern: undefined }
    const full: IStyleData = { ...style }
    // "Off" values only matter while inheriting; the resolved style drops them.
    if (full.ul?.s === 0) delete full.ul
    if (full.st?.s === 0) delete full.st
    if (full.tb === 1) delete full.tb
    if (pattern || fallback) full.n = { pattern: (pattern || fallback)! }
    let id: string | undefined
    if (Object.keys(full).length) {
      const key = JSON.stringify(full)
      id = this.byKey.get(key)
      if (!id) {
        id = `s${this.byKey.size + 1}`
        this.byKey.set(key, id)
        this.registry[id] = full
      }
    }
    this.cellCache.set(cacheKey, id)
    return id
  }

  // Properties of a named style (conditional formatting), without inherited defaults.
  styleProps(name: string | null): IStyleData {
    if (!name) return {}
    const own = this.cellStyles.has(name) ? name : this.displayNames.get(name)
    if (!own) return {}
    // Only the style's own properties: its parents are the cell's usual style.
    const style: IStyleData = cellStyleProps(this.cellStyles.get(own)!.el, this.fonts)
    if (!style.bl) delete style.bl
    if (!style.it) delete style.it
    if (!style.ul?.s) delete style.ul
    if (!style.st?.s) delete style.st
    const keep: (keyof IStyleData)[] = ['bg', 'cl', 'bl', 'it', 'ul', 'st']
    return Object.fromEntries(Object.entries(style).filter(([k]) => keep.includes(k as keyof IStyleData))) as IStyleData
  }

  private resolve(name: string, depth: number): { style: IStyleData; pattern?: string } {
    const cached = this.resolved.get(name)
    if (cached) return cached
    const entry = this.cellStyles.get(name)
    let result: { style: IStyleData; pattern?: string } = { style: {} }
    if (entry && depth < 20) {
      const base = entry.parent ? this.resolve(entry.parent, depth + 1) : { style: {} }
      const own = cellStyleProps(entry.el, this.fonts)
      const dataName = attr(entry.el, 'data-style-name')
      const pattern = dataName ? this.pattern(dataName) : base.pattern
      const style = mergeStyle(base.style, own)
      result = { style, pattern }
    }
    this.resolved.set(name, result)
    return result
  }

  private pattern(name: string): string | undefined {
    const el = this.dataStyles.get(name)
    return el ? dataStylePattern(el, this.dataStyles) : undefined
  }

  columnWidth(name: string | null): number | undefined {
    const props = child(this.otherStyles.get(`table-column:${name}`), 'table-column-properties')
    const w = lengthPx(attr(props, 'column-width'))
    if (w === undefined || Math.abs(w - LO_DEFAULT_COL_PX) < 1 || Math.abs(w - DEFAULT_COL_PX) < 0.75) return undefined
    return Math.round(w)
  }

  // Only manual heights: rows with "optimal height" follow their content.
  rowHeight(name: string | null): number | undefined {
    const props = child(this.otherStyles.get(`table-row:${name}`), 'table-row-properties')
    if (!props || attr(props, 'use-optimal-row-height') === 'true') return undefined
    const h = lengthPx(attr(props, 'row-height'))
    return h === undefined ? undefined : Math.round(h)
  }

  tableProps(name: string | null): { hidden: boolean; tabColor?: string } {
    const props = child(this.otherStyles.get(`table:${name}`), 'table-properties')
    return { hidden: attr(props, 'display') === 'false', tabColor: toHex(attr(props, 'tab-color')) }
  }
}

function unquoteFont(family: string): string {
  return family.split(',')[0].trim().replace(/^['"]|['"]$/g, '')
}

function mergeStyle(base: IStyleData, own: IStyleData): IStyleData {
  const out: IStyleData = { ...base, ...own }
  if (base.bd && own.bd) out.bd = { ...base.bd, ...own.bd }
  return out
}

// Converts "1.5in", "2.54cm", "12pt", "30px" to pixels at 96 dpi.
function lengthPx(value: string | null): number | undefined {
  if (!value) return undefined
  const m = /^(-?[\d.]+)\s*(in|cm|mm|pt|pc|px)?$/.exec(value.trim())
  if (!m) return undefined
  const n = parseFloat(m[1])
  const factor = { in: 96, cm: 96 / 2.54, mm: 96 / 25.4, pt: 96 / 72, pc: 16, px: 1 }[m[2] || 'px'] ?? 1
  return n * factor
}

function cellStyleProps(el: Element, fonts: Map<string, string>): IStyleData {
  const s: IStyleData = {}
  const text = child(el, 'text-properties')
  if (text) {
    const fontName = attr(text, 'font-name')
    const family = fontName ? fonts.get(fontName) || fontName : attr(text, 'font-family')
    if (family) s.ff = unquoteFont(family)
    const size = attr(text, 'font-size')
    if (size && size.endsWith('pt')) s.fs = parseFloat(size)
    const weight = attr(text, 'font-weight')
    if (weight) s.bl = weight === 'bold' || parseInt(weight, 10) >= 600 ? 1 : 0
    const fontStyle = attr(text, 'font-style')
    if (fontStyle) s.it = fontStyle === 'italic' || fontStyle === 'oblique' ? 1 : 0
    const ul = attr(text, 'text-underline-style')
    if (ul) s.ul = ul === 'none' ? { s: 0 } : attr(text, 'text-underline-type') === 'double' ? { s: 1, t: 10 } : { s: 1 }
    const st = attr(text, 'text-line-through-style')
    if (st) s.st = { s: st === 'none' ? 0 : 1 }
    const color = toHex(attr(text, 'color'))
    if (color) s.cl = { rgb: color }
    const pos = attr(text, 'text-position')
    if (pos) {
      const first = pos.split(/\s+/)[0]
      if (first === 'sub' || first.startsWith('-')) s.va = 2
      else if (first === 'super' || (parseFloat(first) > 0)) s.va = 3
    }
  }
  const cell = child(el, 'table-cell-properties')
  if (cell) {
    const bg = attr(cell, 'background-color')
    if (bg && bg !== 'transparent') {
      const hex = toHex(bg)
      if (hex) s.bg = { rgb: hex }
    }
    const bd: IBorderData = {}
    const all = attr(cell, 'border')
    for (const [side, key] of [['top', 't'], ['bottom', 'b'], ['left', 'l'], ['right', 'r']] as const) {
      const b = parseBorder(attr(cell, `border-${side}`) ?? all)
      if (b) bd[key] = b
    }
    const tlbr = parseBorder(attr(cell, 'diagonal-tl-br'))
    if (tlbr) bd.tl_br = tlbr
    const bltr = parseBorder(attr(cell, 'diagonal-bl-tr'))
    if (bltr) bd.bl_tr = bltr
    if (Object.keys(bd).length) s.bd = bd
    const wrap = attr(cell, 'wrap-option')
    if (wrap) s.tb = wrap === 'wrap' ? 3 : 1
    const va = attr(cell, 'vertical-align')
    if (va) s.vt = va === 'top' ? 1 : va === 'middle' ? 2 : va === 'bottom' ? 3 : 0
    const angle = parseFloat(attr(cell, 'rotation-angle') || '')
    // ODF angles are counter-clockwise; Univer's positive angles rotate clockwise ("angle down").
    if (Number.isFinite(angle) && angle % 360 !== 0) {
      const ccw = ((angle % 360) + 360) % 360
      s.tr = { a: ccw > 180 ? 360 - ccw : -ccw }
    }
    if (attr(cell, 'direction') === 'ttb') s.tr = { a: 0, v: 1 }
  }
  const para = child(el, 'paragraph-properties')
  const align = attr(para, 'text-align')
  if (align && attr(cell, 'text-align-source') !== 'value-type') {
    const ht = { start: 1, left: 1, center: 2, end: 3, right: 3, justify: 4 }[align]
    if (ht) s.ht = ht
  }
  return s
}

// "0.74pt solid #000000" → Univer border.
function parseBorder(value: string | null): IBorderStyleData | undefined {
  if (!value || value === 'none' || value === 'hidden') return undefined
  const parts = value.trim().split(/\s+/)
  let width = 0.75
  let style = 'solid'
  let color = '#000000'
  for (const p of parts) {
    const px = lengthPx(p)
    if (px !== undefined && /\d/.test(p)) width = (px * 72) / 96
    else if (p.startsWith('#') || p.startsWith('rgb')) color = toHex(p) || color
    else if (/^[a-z-]+$/.test(p)) style = p
  }
  if (style === 'none' || style === 'hidden') return undefined
  const medium = width >= 1.2
  let s: number
  switch (style) {
    case 'double':
      s = B.DOUBLE
      break
    case 'dotted':
      s = B.DOTTED
      break
    case 'dashed':
    case 'fine-dashed':
    case 'dash':
      s = medium ? B.MEDIUM_DASHED : B.DASHED
      break
    case 'dot-dash':
    case 'dash-dot':
      s = medium ? B.MEDIUM_DASH_DOT : B.DASH_DOT
      break
    case 'dot-dot-dash':
    case 'dash-dot-dot':
      s = medium ? B.MEDIUM_DASH_DOT_DOT : B.DASH_DOT_DOT
      break
    default:
      s = width < 0.4 ? B.HAIR : width < 1.2 ? B.THIN : width < 2.3 ? B.MEDIUM : B.THICK
  }
  return { s, cl: { rgb: color } } as IBorderStyleData
}

// ---------------------------------------------------------------------------
// Data styles (number:*-style) → number format patterns

const COLOR_NAMES: Record<string, string> = {
  '#000000': 'Black',
  '#0000ff': 'Blue',
  '#00ffff': 'Cyan',
  '#00ff00': 'Green',
  '#ff00ff': 'Magenta',
  '#ff0000': 'Red',
  '#ffffff': 'White',
  '#ffff00': 'Yellow',
}

export function dataStylePattern(el: Element, all: Map<string, Element>, depth = 0): string | undefined {
  if (el.localName === 'boolean-style') return undefined
  const main = sectionPattern(el)
  const maps = children(el, 'map')
    .map((m) => {
      const target = all.get(attr(m, 'apply-style-name') || '')
      const cond = /^value\(\)\s*(>=|<=|<>|!=|=|>|<)\s*(-?[\d.]+)$/.exec((attr(m, 'condition') || '').trim())
      return target && cond && depth < 3 ? { op: cond[1] === '!=' ? '<>' : cond[1], n: cond[2], pattern: sectionPattern(target) } : null
    })
    .filter((m) => m !== null)
  let pattern: string
  if (maps.length === 1 && maps[0].op === '>=' && maps[0].n === '0') pattern = `${maps[0].pattern};${main}`
  else if (maps.length === 2 && maps[0].op === '>' && maps[1].op === '<' && maps[0].n === '0' && maps[1].n === '0')
    pattern = `${maps[0].pattern};${maps[1].pattern};${main}`
  else if (maps.length) pattern = [...maps.map((m) => `[${m.op}${m.n}]${m.pattern}`), main].join(';')
  else pattern = main
  return pattern && pattern !== 'General' ? pattern : undefined
}

function sectionPattern(el: Element): string {
  const kind = el.localName
  const isDate = kind === 'date-style' || kind === 'time-style'
  const elapsed = kind === 'time-style' && attr(el, 'truncate-on-overflow') === 'false'
  let out = ''
  for (const c of children(el)) {
    switch (c.localName) {
      case 'text-properties': {
        const name = COLOR_NAMES[toHex(attr(c, 'color')) || '']
        if (name) out = `[${name}]` + out
        break
      }
      case 'text':
        out += literal(c.textContent || '', isDate, kind === 'percentage-style')
        break
      case 'text-content':
        out += '@'
        break
      case 'fill-character':
        out += '*' + (c.textContent || ' ')
        break
      case 'currency-symbol': {
        const sym = c.textContent || ''
        out += sym === '$' ? '$' : sym ? `[$${sym}]` : ''
        break
      }
      case 'number':
        out += numberPart(c)
        break
      case 'scientific-number': {
        const exp = int(attr(c, 'min-exponent-digits'), 2)
        const sign = attr(c, 'forced-exponent-sign') === 'false' ? '-' : '+'
        out += numberPart(c) + 'E' + sign + '0'.repeat(exp)
        break
      }
      case 'fraction': {
        const minInt = attr(c, 'min-integer-digits')
        if (minInt !== null) out += (+minInt > 0 ? '0'.repeat(+minInt) : '#') + ' '
        const numDigits = int(attr(c, 'min-numerator-digits'), 1)
        const fixed = attr(c, 'denominator-value')
        const denDigits = int(attr(c, 'min-denominator-digits'), 1)
        out += '?'.repeat(numDigits) + '/' + (fixed ? fixed : '?'.repeat(denDigits))
        break
      }
      case 'year':
        out += long(c) ? 'yyyy' : 'yy'
        break
      case 'month':
        out += attr(c, 'textual') === 'true' ? (long(c) ? 'mmmm' : 'mmm') : long(c) ? 'mm' : 'm'
        break
      case 'day':
        out += long(c) ? 'dd' : 'd'
        break
      case 'day-of-week':
        out += long(c) ? 'dddd' : 'ddd'
        break
      case 'hours':
        out += elapsed ? (long(c) ? '[hh]' : '[h]') : long(c) ? 'hh' : 'h'
        break
      case 'minutes':
        out += long(c) ? 'mm' : 'm'
        break
      case 'seconds': {
        const dp = int(attr(c, 'decimal-places'), 0)
        out += (long(c) ? 'ss' : 's') + (dp ? '.' + '0'.repeat(dp) : '')
        break
      }
      case 'am-pm':
        out += 'AM/PM'
        break
    }
  }
  if (kind === 'text-style' && !out.includes('@')) out += '@'
  return out
}

function long(el: Element): boolean {
  return attr(el, 'style') === 'long'
}

// number:number (or the mantissa of number:scientific-number) → "#,##0.00".
function numberPart(el: Element): string {
  const decimals = attr(el, 'decimal-places')
  const minInt = parseInt(attr(el, 'min-integer-digits') ?? '1', 10) || 0
  const grouping = attr(el, 'grouping') === 'true'
  // A number without decimal places is LibreOffice's "General".
  if (decimals === null && el.localName === 'number' && !grouping && minInt <= 1) return 'General'
  let int: string
  if (grouping) {
    const digits = '#'.repeat(Math.max(4, minInt) - minInt) + '0'.repeat(minInt)
    const chars = [...digits]
    int = ''
    chars.forEach((d, i) => {
      int += d
      const left = chars.length - 1 - i
      if (left > 0 && left % 3 === 0) int += ','
    })
  } else int = minInt > 0 ? '0'.repeat(minInt) : '#'
  const dp = parseInt(decimals ?? '0', 10) || 0
  const minDp = Math.min(dp, parseInt(attr(el, 'min-decimal-places') ?? String(dp), 10))
  const frac = dp ? '.' + '0'.repeat(minDp) + '#'.repeat(dp - minDp) : ''
  const factor = parseFloat(attr(el, 'display-factor') || '1')
  const scale = factor > 1 ? ','.repeat(Math.round(Math.log10(factor) / 3)) : ''
  return int + frac + scale
}

// Quotes literal text unless it's made of characters that need no quoting.
function literal(text: string, isDate: boolean, isPercent: boolean): string {
  if (!text) return ''
  if (isPercent && text === '%') return '%'
  const plain = isDate ? /^[\s$\-+/():!^&'~{}<>=,.]+$/ : /^[\s$\-+/():!^&'~{}<>=]+$/
  return plain.test(text) ? text : `"${text.replace(/"/g, '\\"')}"`
}

// ---------------------------------------------------------------------------
// settings.xml: frozen panes and grid lines per sheet

interface ViewSettings {
  showGrid?: boolean
  tables: Map<string, { xSplit: number; ySplit: number; showGrid?: boolean }>
}

function readViewSettings(doc: Document | null): ViewSettings {
  const result: ViewSettings = { tables: new Map() }
  if (!doc) return result
  const sets = [...doc.getElementsByTagNameNS('*', 'config-item-set')].filter((s) => attr(s, 'name') === 'ooo:view-settings')
  const views = sets[0] && [...sets[0].children].find((e) => e.localName === 'config-item-map-indexed' && attr(e, 'name') === 'Views')
  const view = views && child(views, 'config-item-map-entry')
  if (!view) return result
  const items = (el: Element) => {
    const map = new Map<string, string>()
    for (const c of children(el, 'config-item')) map.set(attr(c, 'name') || '', c.textContent || '')
    return map
  }
  const own = items(view)
  if (own.has('ShowGrid')) result.showGrid = own.get('ShowGrid') === 'true'
  const tables = children(view, 'config-item-map-named').find((e) => attr(e, 'name') === 'Tables')
  for (const entry of tables ? children(tables, 'config-item-map-entry') : []) {
    const it = items(entry)
    const frozenX = it.get('HorizontalSplitMode') === '2'
    const frozenY = it.get('VerticalSplitMode') === '2'
    result.tables.set(attr(entry, 'name') || '', {
      xSplit: frozenX ? parseInt(it.get('HorizontalSplitPosition') || '0', 10) || 0 : 0,
      ySplit: frozenY ? parseInt(it.get('VerticalSplitPosition') || '0', 10) || 0 : 0,
      showGrid: it.has('ShowGrid') ? it.get('ShowGrid') === 'true' : undefined,
    })
  }
  return result
}
