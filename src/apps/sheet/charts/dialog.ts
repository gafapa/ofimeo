// Insert chart / Edit chart dialog: type, source range (headers detected
// automatically), series in rows or columns, title, legend, axis titles,
// palette and, for scatter charts, a linear trendline. A live preview is drawn
// with ECharts while the fields change.

import { ChartArea, ChartBar, ChartColumn, ChartLine, ChartPie, ChartScatter, Donut, type IconNode } from 'lucide'
import type { FUniver } from '@univerjs/presets'
import { t } from '../../../core/i18n'
import { el, icon, showDialog } from '../../../ui/widgets'
import { CHART_KIND, chartData, detectHeaders, parseA1, PALETTES, toA1, type ChartSpec, type ChartType, type LegendPosition, type PaletteName } from './model'
import { chartOption } from './option'
import { formatChartNumber, loadECharts, readValues, screenColors, seriesLabel } from './view'

const TYPES: [ChartType, IconNode, () => string][] = [
  ['column', ChartColumn, () => t('Column')],
  ['bar', ChartBar, () => t('Bar')],
  ['line', ChartLine, () => t('Line')],
  ['area', ChartArea, () => t('Area')],
  ['pie', ChartPie, () => t('Pie')],
  ['doughnut', Donut, () => t('Doughnut')],
  ['scatter', ChartScatter, () => t('Scatter')],
]

const PALETTE_LABELS: Record<PaletteName, () => string> = {
  ofimeo: () => t('Ofimeo'),
  colorblind: () => t('Colorblind-safe'),
  warm: () => t('Warm'),
  cool: () => t('Cool'),
  gray: () => t('Grayscale'),
}

// Sheet name prefix of a reference: "Notas!A1:C5" or "'Mis notas'!A1:C5".
function splitRef(ref: string): { sheetName: string | null; a1: string } {
  const m = /^\s*(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/.exec(ref)
  if (!m) return { sheetName: null, a1: ref.trim() }
  return { sheetName: (m[1] ?? m[2]).replace(/''/g, "'").trim(), a1: m[3].trim() }
}

const quoteSheet = (name: string) => (/^[\p{L}\d_]+$/u.test(name) ? name : `'${name.replace(/'/g, "''")}'`)

// The used block around the selection when a single cell is selected.
export function defaultRange(univerAPI: FUniver): string {
  const sheet = univerAPI.getActiveWorkbook()!.getActiveSheet()
  const sel = sheet.getSelection()?.getActiveRange()?.getRange()
  if (!sel) return 'A1:B5'
  if (sel.startRow !== sel.endRow || sel.startColumn !== sel.endColumn) return toA1(sel)
  return toA1(dataRegion(univerAPI, sel.startRow, sel.startColumn))
}

// The contiguous data region around a cell. An empty cell next to the data
// (just below or right of a table) starts from its filled neighbour, so the
// region does not grow by an empty row or column.
export function dataRegion(univerAPI: FUniver, row: number, col: number): { startRow: number; endRow: number; startColumn: number; endColumn: number } {
  const sheet = univerAPI.getActiveWorkbook()!.getActiveSheet()
  const filled = (r: number, c: number) => r >= 0 && c >= 0 && (sheet.getRange(r, c).getValue() ?? '') !== ''
  let start = { row, col }
  if (!filled(row, col)) {
    const near = [
      [row - 1, col],
      [row, col - 1],
      [row + 1, col],
      [row, col + 1],
    ].find(([r, c]) => filled(r, c))
    if (near) start = { row: near[0], col: near[1] }
  }
  const box = { startRow: start.row, endRow: start.row, startColumn: start.col, endColumn: start.col }
  let grew = true
  for (let i = 0; grew && i < 200; i++) {
    grew = false
    for (let c = box.startColumn; c <= box.endColumn; c++) {
      if (filled(box.startRow - 1, c)) (box.startRow--, (grew = true))
      if (filled(box.endRow + 1, c)) (box.endRow++, (grew = true))
    }
    for (let r = box.startRow; r <= box.endRow; r++) {
      if (filled(r, box.startColumn - 1)) (box.startColumn--, (grew = true))
      if (filled(r, box.endColumn + 1)) (box.endColumn++, (grew = true))
    }
  }
  return box
}

export async function chartDialog(univerAPI: FUniver, current?: ChartSpec): Promise<ChartSpec | null> {
  const wb = univerAPI.getActiveWorkbook()!
  const active = wb.getActiveSheet()
  const refText = (sheetId: string, a1: string) => (sheetId === active.getSheetId() ? a1 : `${quoteSheet(wb.getSheetBySheetId(sheetId)?.getSheetName() ?? '')}!${a1}`)

  let type: ChartType = current?.type ?? 'column'
  const typeButtons = TYPES.map(([value, node, label]) => {
    const b = el('button', { type: 'button', class: 'chart-type', title: label() }, icon(node, 22), el('span', { textContent: label() }))
    b.setAttribute('role', 'radio')
    b.dataset.type = value
    b.addEventListener('click', () => {
      type = value
      sync()
    })
    return b
  })
  const typeGroup = el('div', { class: 'chart-types', role: 'radiogroup' }, ...typeButtons)
  typeGroup.setAttribute('aria-label', t('Chart type'))

  const range = el('input', { class: 'field', value: current ? refText(current.sheetId, current.range) : defaultRange(univerAPI), spellcheck: false })
  const seriesIn = el('select', { class: 'field' }, el('option', { value: 'columns', textContent: t('Columns') }), el('option', { value: 'rows', textContent: t('Rows') }))
  seriesIn.value = current?.seriesIn ?? 'columns'
  const headerRow = el('input', { type: 'checkbox' })
  const headerCol = el('input', { type: 'checkbox' })
  const title = el('input', { class: 'field', value: current?.title ?? '' })
  const xTitle = el('input', { class: 'field', value: current?.xTitle ?? '' })
  const yTitle = el('input', { class: 'field', value: current?.yTitle ?? '' })
  const legend = el('select', { class: 'field' }, ...(
    [['bottom', t('Bottom')], ['top', t('Top')], ['right', t('Right')], ['none', t('None')]] as const
  ).map(([v, l]) => el('option', { value: v, textContent: l })))
  legend.value = current?.legend ?? 'bottom'
  const palette = el('select', { class: 'field' }, ...(Object.keys(PALETTES) as PaletteName[]).map((p) => el('option', { value: p, textContent: PALETTE_LABELS[p]() })))
  palette.value = current?.palette ?? 'ofimeo'
  const swatches = el('div', { class: 'chart-swatches' })
  swatches.setAttribute('aria-hidden', 'true')
  const trendline = el('input', { type: 'checkbox', checked: !!current?.trendline })
  const trendRow = el('label', { class: 'check-label' }, trendline, t('Linear trendline with equation and R²'))
  const error = el('div', { class: 'chart-error', role: 'alert' })
  const preview = el('div', { class: 'chart-preview' })

  // Headers follow the range until the user changes them.
  let headersTouched = !!current
  headerRow.checked = current?.headerRow ?? true
  headerCol.checked = current?.headerCol ?? true
  headerRow.addEventListener('change', () => (headersTouched = true))
  headerCol.addEventListener('change', () => (headersTouched = true))

  const resolve = (): { spec: ChartSpec | null; message: string } => {
    const { sheetName, a1 } = splitRef(range.value)
    const sheet = sheetName ? wb.getSheets().find((s) => s.getSheetName().toLowerCase() === sheetName.toLowerCase()) : active
    const r = parseA1(a1)
    if (!sheet) return { spec: null, message: t('There is no sheet named {name}', { name: sheetName ?? '' }) }
    if (!r) return { spec: null, message: t('Enter a range such as A1:C6') }
    return {
      message: '',
      spec: {
        kind: CHART_KIND,
        type,
        sheetId: sheet.getSheetId(),
        range: toA1(r),
        seriesIn: seriesIn.value as ChartSpec['seriesIn'],
        headerRow: headerRow.checked,
        headerCol: headerCol.checked,
        title: title.value.trim(),
        legend: legend.value as LegendPosition,
        xTitle: xTitle.value.trim(),
        yTitle: yTitle.value.trim(),
        palette: palette.value as PaletteName,
        trendline: type === 'scatter' && trendline.checked,
      },
    }
  }

  let chart: import('echarts/core').ECharts | null = null
  const sync = () => {
    for (const b of typeButtons) b.setAttribute('aria-checked', String(b.dataset.type === type))
    trendRow.hidden = type !== 'scatter'
    const axes = type !== 'pie' && type !== 'doughnut'
    xTitle.disabled = yTitle.disabled = !axes
    swatches.replaceChildren(...PALETTES[palette.value as PaletteName].slice(0, 6).map((c) => {
      const s = el('span')
      s.style.background = c
      return s
    }))
    const { spec, message } = resolve()
    error.textContent = message
    if (!spec || !chart) return
    chart.setOption(chartOption(spec, chartData(spec, readValues(univerAPI, spec), seriesLabel), screenColors(), formatChartNumber, preview.clientWidth || 480) as never, true)
  }
  const detect = () => {
    const { spec } = resolve()
    if (spec && !headersTouched) {
      const h = detectHeaders(readValues(univerAPI, spec))
      headerRow.checked = h.headerRow
      headerCol.checked = h.headerCol
    }
    sync()
  }
  range.addEventListener('input', detect)
  for (const f of [seriesIn, headerRow, headerCol, title, xTitle, yTitle, legend, palette, trendline]) f.addEventListener(f.tagName === 'INPUT' && (f as HTMLInputElement).type !== 'checkbox' ? 'input' : 'change', sync)

  const field = (label: string, input: HTMLElement) => el('label', { class: 'field-label' }, label, input)
  const form = el(
    'div',
    { class: 'chart-form' },
    el('div', { class: 'field-label' }, t('Chart type'), typeGroup),
    field(t('Data range'), range),
    el('div', { class: 'chart-row' }, field(t('Series in'), seriesIn), el('div', { class: 'chart-checks' }, el('label', { class: 'check-label' }, headerRow, t('First row as headers')), el('label', { class: 'check-label' }, headerCol, t('First column as labels')))),
    field(t('Title'), title),
    el('div', { class: 'chart-row' }, field(t('Horizontal axis title'), xTitle), field(t('Vertical axis title'), yTitle)),
    el('div', { class: 'chart-row' }, field(t('Legend'), legend), el('div', { class: 'field-label' }, t('Colors'), el('div', { class: 'chart-palette' }, palette, swatches))),
    trendRow,
    error,
  )
  const body = el('div', { class: 'chart-dialog' }, form, preview)
  const opened = showDialog(current ? t('Edit chart') : t('Insert chart'), body, [
    { label: t('Cancel'), value: 'cancel' },
    { label: current ? t('Save') : t('Insert'), value: 'ok', primary: true },
  ], true)
  if (!current) detect()
  else sync()
  loadECharts().then(({ echarts }) => {
    if (!preview.isConnected) return
    chart = echarts.init(preview, null, { renderer: 'canvas' })
    sync()
  })
  // Enter in a text field confirms; an invalid range keeps the dialog open.
  const dialog = body.closest('dialog')!
  dialog.addEventListener('close', () => chart?.dispose())
  const submit = dialog.querySelector<HTMLButtonElement>('button[value="ok"]')!
  submit.addEventListener('click', (e) => {
    if (!resolve().spec) {
      e.preventDefault()
      sync()
      range.focus()
    }
  })
  const result = await opened
  return result === 'ok' ? resolve().spec : null
}
