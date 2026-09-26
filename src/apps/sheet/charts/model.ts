// Chart model shared by the live view, the dialog, printing and the file
// formats. A chart is a Univer float DOM drawing whose `data` is a ChartSpec:
// Univer keeps it in the workbook snapshot and emits drawing mutations, so the
// mutation log syncs charts like any other change. Nothing here loads ECharts.

export type ChartType = 'column' | 'bar' | 'line' | 'area' | 'pie' | 'doughnut' | 'scatter'
export type LegendPosition = 'bottom' | 'top' | 'right' | 'none'
export type PaletteName = 'ofimeo' | 'colorblind' | 'warm' | 'cool' | 'gray'

export const CHART_KIND = 'ofimeo-chart'
export const CHART_COMPONENT = 'ofimeo-chart'
export const CHART_TYPES: ChartType[] = ['column', 'bar', 'line', 'area', 'pie', 'doughnut', 'scatter']

export interface ChartSpec {
  kind: typeof CHART_KIND
  type: ChartType
  // Source cells: sheet id and A1 range (no sheet name), e.g. 'A1:C5'.
  sheetId: string
  range: string
  seriesIn: 'columns' | 'rows'
  // The range's first row / first column hold labels (series names, categories).
  headerRow: boolean
  headerCol: boolean
  title: string
  legend: LegendPosition
  xTitle: string
  yTitle: string
  palette: PaletteName
  // Scatter only: linear trendline with its equation and R².
  trendline?: boolean
}

export const PALETTES: Record<PaletteName, string[]> = {
  ofimeo: ['#1a73e8', '#e8710a', '#188038', '#d93025', '#9334e6', '#f9ab00', '#12b5cb', '#e52592'],
  // Okabe–Ito, distinguishable with color vision deficiencies.
  colorblind: ['#0072b2', '#e69f00', '#009e73', '#d55e00', '#cc79a7', '#56b4e9', '#f0e442', '#000000'],
  warm: ['#d93025', '#e8710a', '#f9ab00', '#b31412', '#e37400', '#c5221f', '#ea8600', '#a50e0e'],
  cool: ['#174ea6', '#1a73e8', '#12b5cb', '#188038', '#4285f4', '#0d652d', '#129eaf', '#8ab4f8'],
  gray: ['#202124', '#5f6368', '#9aa0a6', '#3c4043', '#80868b', '#bdc1c6', '#dadce0', '#000000'],
}

export function isChartSpec(data: unknown): data is ChartSpec {
  return !!data && typeof data === 'object' && (data as ChartSpec).kind === CHART_KIND
}

// Fills in fields missing in charts written by older versions or imported files.
export function normalizeSpec(data: Partial<ChartSpec> & { sheetId: string; range: string }): ChartSpec {
  return {
    kind: CHART_KIND,
    type: CHART_TYPES.includes(data.type as ChartType) ? (data.type as ChartType) : 'column',
    sheetId: data.sheetId,
    range: data.range,
    seriesIn: data.seriesIn === 'rows' ? 'rows' : 'columns',
    headerRow: data.headerRow ?? true,
    headerCol: data.headerCol ?? true,
    title: data.title ?? '',
    legend: data.legend ?? 'bottom',
    xTitle: data.xTitle ?? '',
    yTitle: data.yTitle ?? '',
    palette: data.palette && PALETTES[data.palette] ? data.palette : 'ofimeo',
    trendline: !!data.trendline,
  }
}

// ---------- A1 references ----------

export interface CellRange {
  startRow: number
  endRow: number
  startColumn: number
  endColumn: number
}

export const colName = (c: number): string => {
  let s = ''
  for (c++; c > 0; c = Math.floor((c - 1) / 26)) s = String.fromCharCode(65 + ((c - 1) % 26)) + s
  return s
}
const colIndex = (s: string): number => [...s.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1

// 'A1:C5' (or 'A1', '$A$1:$C$5') → range; null when invalid.
export function parseA1(ref: string): CellRange | null {
  const m = /^\s*\$?([A-Za-z]{1,3})\$?(\d+)(?::\$?([A-Za-z]{1,3})\$?(\d+))?\s*$/.exec(ref)
  if (!m) return null
  const [c1, r1] = [colIndex(m[1]), Number(m[2]) - 1]
  const [c2, r2] = m[3] ? [colIndex(m[3]), Number(m[4]) - 1] : [c1, r1]
  if (r1 < 0 || r2 < 0) return null
  return { startRow: Math.min(r1, r2), endRow: Math.max(r1, r2), startColumn: Math.min(c1, c2), endColumn: Math.max(c1, c2) }
}

export const toA1 = (r: CellRange): string =>
  `${colName(r.startColumn)}${r.startRow + 1}` + (r.startRow === r.endRow && r.startColumn === r.endColumn ? '' : `:${colName(r.endColumn)}${r.endRow + 1}`)

// ---------- Data ----------

export type Cell = string | number | boolean | null | undefined

export interface ChartData {
  categories: string[]
  // Scatter: x values of every point (first data column).
  x?: number[]
  series: { name: string; values: (number | null)[] }[]
}

const toNumber = (v: Cell): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v)
  return null
}
const label = (v: Cell): string => (v === null || v === undefined ? '' : String(v))
const isText = (v: Cell) => typeof v === 'string' && v.trim() !== '' && Number.isNaN(Number(v))

// Guesses whether the first row / column of a block hold labels.
export function detectHeaders(values: Cell[][]): { headerRow: boolean; headerCol: boolean } {
  const first = values[0] ?? []
  const headerRow = first.slice(1).some(isText) || (first.length === 1 && isText(first[0]))
  const headerCol = values.slice(1).some((row) => isText(row[0])) || (values.length === 1 && isText(first[0]))
  return { headerRow, headerCol: headerCol && (values[0]?.length ?? 0) > 1 }
}

export function chartData(spec: ChartSpec, raw: Cell[][], seriesLabel: (n: number) => string): ChartData {
  let values = raw
  let headerRow = spec.headerRow
  let headerCol = spec.headerCol
  if (spec.seriesIn === 'rows') {
    const width = Math.max(0, ...raw.map((r) => r.length))
    values = Array.from({ length: width }, (_, c) => raw.map((r) => r[c]))
    ;[headerRow, headerCol] = [headerCol, headerRow]
  }
  const width = Math.max(0, ...values.map((r) => r.length))
  const body = headerRow ? values.slice(1) : values
  const names = headerRow ? values[0] ?? [] : []
  if (spec.type === 'scatter') {
    // First column: x values; every other column is a series.
    const x = body.map((r) => toNumber(r[0]))
    const series = []
    for (let c = 1; c < width; c++) series.push({ name: label(names[c]) || seriesLabel(c), values: body.map((r) => toNumber(r[c])) })
    if (width === 1) series.push({ name: label(names[0]) || seriesLabel(1), values: body.map((r) => toNumber(r[0])) })
    return { categories: [], x: width === 1 ? body.map((_, i) => i + 1) : (x as number[]), series }
  }
  const first = headerCol ? 1 : 0
  const categories = body.map((r, i) => (headerCol ? label(r[0]) : String(i + 1)))
  const series = []
  for (let c = first; c < width; c++) series.push({ name: label(names[c]) || seriesLabel(c - first + 1), values: body.map((r) => toNumber(r[c])) })
  return { categories, series }
}

// ---------- Linear regression (trendline) ----------

export interface Regression {
  slope: number
  intercept: number
  r2: number
}

export function linearRegression(x: (number | null)[], y: (number | null)[]): Regression | null {
  const pts: [number, number][] = []
  x.forEach((xi, i) => {
    const yi = y[i]
    if (xi !== null && yi !== null && Number.isFinite(xi) && Number.isFinite(yi)) pts.push([xi, yi])
  })
  const n = pts.length
  if (n < 2) return null
  const mx = pts.reduce((s, p) => s + p[0], 0) / n
  const my = pts.reduce((s, p) => s + p[1], 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (const [a, b] of pts) {
    sxy += (a - mx) * (b - my)
    sxx += (a - mx) ** 2
    syy += (b - my) ** 2
  }
  if (sxx === 0) return null
  const slope = sxy / sxx
  return { slope, intercept: my - slope * mx, r2: syy === 0 ? 1 : (sxy * sxy) / (sxx * syy) }
}

export function equationText(reg: Regression, format: (n: number) => string): string {
  const sign = reg.intercept < 0 ? '−' : '+'
  return `y = ${format(reg.slope)}x ${sign} ${format(Math.abs(reg.intercept))} · R² = ${format(reg.r2)}`
}

// ---------- Charts in a workbook snapshot (printing, exports) ----------

export const DRAWING_RESOURCE = 'SHEET_DRAWING_PLUGIN'
export const DRAWING_TYPE_DOM = 8
export const DRAWING_TYPE_IMAGE = 0

export interface CellAnchor {
  column: number
  columnOffset: number
  row: number
  rowOffset: number
}

export interface SnapshotDrawing {
  id: string
  hostSheetId: string
  drawingType: number
  from: CellAnchor
  to: CellAnchor
  // Scene pixels (they include Univer's row/column headers).
  transform: { left: number; top: number; width: number; height: number }
  raw: Record<string, unknown>
}

interface DrawingResource {
  [sheetId: string]: { data?: Record<string, Record<string, unknown>>; order?: string[] }
}

export function snapshotDrawings(resources: { name: string; data: string }[] | undefined): SnapshotDrawing[] {
  const res = resources?.find((r) => r.name === DRAWING_RESOURCE)
  if (!res) return []
  let parsed: DrawingResource
  try {
    parsed = JSON.parse(res.data)
  } catch {
    return []
  }
  const out: SnapshotDrawing[] = []
  for (const [hostSheetId, sheet] of Object.entries(parsed)) {
    for (const id of sheet.order ?? Object.keys(sheet.data ?? {})) {
      const d = sheet.data?.[id] as Record<string, unknown> & { sheetTransform?: { from: CellAnchor; to: CellAnchor }; transform?: SnapshotDrawing['transform']; drawingType?: number }
      if (!d?.sheetTransform) continue
      out.push({ id, hostSheetId, drawingType: Number(d.drawingType ?? 0), from: d.sheetTransform.from, to: d.sheetTransform.to, transform: d.transform ?? { left: 0, top: 0, width: 0, height: 0 }, raw: d })
    }
  }
  return out
}

export function snapshotCharts(resources: { name: string; data: string }[] | undefined): (SnapshotDrawing & { spec: ChartSpec })[] {
  return snapshotDrawings(resources)
    .filter((d) => isChartSpec(d.raw.data))
    .map((d) => ({ ...d, spec: normalizeSpec(d.raw.data as ChartSpec) }))
}

// ---------- Series as cell blocks (native charts in .xlsx / .ods) ----------

export interface SeriesRefs {
  name: CellRange | null
  categories: CellRange | null // scatter: x values
  values: CellRange
}

// The cells of each series of a chart, following chartData's reading rules.
export function seriesRefs(spec: ChartSpec): SeriesRefs[] {
  const r = parseA1(spec.range)
  if (!r) return []
  const byColumns = spec.seriesIn === 'columns'
  const headerRow = byColumns ? spec.headerRow : spec.headerCol
  // In "rows" mode the roles of rows and columns swap.
  const line = (a: number, b1: number, b2: number): CellRange =>
    byColumns ? { startColumn: a, endColumn: a, startRow: b1, endRow: b2 } : { startRow: a, endRow: a, startColumn: b1, endColumn: b2 }
  const cell = (a: number, b: number): CellRange => line(a, b, b)
  const [a1, a2] = byColumns ? [r.startColumn, r.endColumn] : [r.startRow, r.endRow]
  const [b1, b2] = byColumns ? [r.startRow, r.endRow] : [r.startColumn, r.endColumn]
  const body = headerRow ? b1 + 1 : b1
  if (body > b2) return []
  const out: SeriesRefs[] = []
  if (spec.type === 'scatter') {
    if (a1 === a2) return [{ name: headerRow ? cell(a1, b1) : null, categories: null, values: line(a1, body, b2) }]
    for (let a = a1 + 1; a <= a2; a++) out.push({ name: headerRow ? cell(a, b1) : null, categories: line(a1, body, b2), values: line(a, body, b2) })
    return out
  }
  const labels = byColumns ? spec.headerCol : spec.headerRow
  const first = labels ? a1 + 1 : a1
  for (let a = first; a <= a2; a++) out.push({ name: headerRow ? cell(a, b1) : null, categories: labels ? line(a1, body, b2) : null, values: line(a, body, b2) })
  return spec.type === 'pie' || spec.type === 'doughnut' ? out.slice(0, 1) : out
}

// Rebuilds a spec from series blocks read from a file.
export function specFromSeries(base: Omit<ChartSpec, 'range' | 'seriesIn' | 'headerRow' | 'headerCol'>, series: SeriesRefs[]): ChartSpec | null {
  if (!series.length) return null
  const blocks = series.flatMap((s) => [s.name, s.categories, s.values].filter((b): b is CellRange => !!b))
  const box = {
    startRow: Math.min(...blocks.map((b) => b.startRow)),
    endRow: Math.max(...blocks.map((b) => b.endRow)),
    startColumn: Math.min(...blocks.map((b) => b.startColumn)),
    endColumn: Math.max(...blocks.map((b) => b.endColumn)),
  }
  const v = series[0].values
  const byColumns = !(v.startRow === v.endRow && v.startColumn !== v.endColumn)
  const hasNames = series.some((s) => s.name)
  const hasCats = series.some((s) => s.categories) && base.type !== 'scatter'
  return {
    ...base,
    range: toA1(box),
    seriesIn: byColumns ? 'columns' : 'rows',
    headerRow: byColumns ? hasNames : hasCats,
    headerCol: byColumns ? hasCats : hasNames,
  }
}

// Value of a snapshot cell (the cached result for formulas).
export function snapshotValue(cellData: Record<number, Record<number, { v?: unknown } | undefined> | undefined> | undefined, row: number, col: number): Cell {
  const v = cellData?.[row]?.[col]?.v
  return v === undefined ? null : (v as Cell)
}
