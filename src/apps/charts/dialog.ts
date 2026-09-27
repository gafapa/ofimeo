// Insert chart / Edit chart dialog for documents and presentations: the data
// comes from an Ofimeo spreadsheet of the library (a sheet and a range, kept
// linked or copied once) or is typed into a small table; the chart options
// are those of the sheet charts, with a live ECharts preview.

import { ChartArea, ChartBar, ChartColumn, ChartLine, ChartPie, ChartScatter, Donut, Minus, Plus, type IconNode } from 'lucide'
import { t } from '../../core/i18n'
import { el, icon, showDialog } from '../../ui/widgets'
import { CHART_KIND, detectHeaders, parseA1, PALETTES, toA1, type Cell, type ChartSpec, type ChartType, type LegendPosition, type PaletteName } from '../sheet/charts/model'
import { loadECharts, optionOf, type EmbeddedChart } from './embedded'
import { blockValues, librarySheets, loadLibrarySheet, usedRange, type SheetTable } from './sheets'
import './charts.css'

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

const DEFAULT_ROWS = (): Cell[][] => [
  ['', t('Series {n}', { n: 1 }), t('Series {n}', { n: 2 })],
  ['A', 4, 3],
  ['B', 6, 5],
  ['C', 5, 7],
]

// Typed text → number when it reads as one.
const typed = (s: string): Cell => {
  const v = s.trim()
  if (v === '') return null
  const n = Number(v.replace(',', '.'))
  return /^-?[\d.,]+(e-?\d+)?$/i.test(v) && Number.isFinite(n) ? n : s
}

// `caption`: shows a caption field with this value (documents).
export async function chartEmbedDialog(current?: EmbeddedChart, opts: { caption?: string } = {}): Promise<{ chart: EmbeddedChart; caption: string } | null> {
  const sheets = librarySheets()
  let mode: 'sheet' | 'inline' = current ? (current.source ? 'sheet' : 'inline') : sheets.length ? 'sheet' : 'inline'
  let type: ChartType = current?.spec.type ?? 'column'
  let inlineRows: Cell[][] = current && !current.source ? current.rows.map((r) => [...r]) : DEFAULT_ROWS()
  let tables: SheetTable[] = []
  let loadedDoc = ''

  // ---------- Source ----------
  const modeSheet = el('input', { type: 'radio', name: 'chart-source', value: 'sheet', checked: mode === 'sheet', disabled: !sheets.length })
  const modeInline = el('input', { type: 'radio', name: 'chart-source', value: 'inline', checked: mode === 'inline' })
  const docSelect = el('select', { class: 'field' }, ...sheets.map((d) => el('option', { value: d.id, textContent: d.title || t('Untitled spreadsheet') })))
  if (current?.source && !sheets.some((d) => d.id === current.source!.docId)) {
    docSelect.prepend(el('option', { value: current.source.docId, textContent: current.source.title || t('Untitled spreadsheet') }))
  }
  docSelect.value = current?.source?.docId ?? sheets[0]?.id ?? ''
  const sheetSelect = el('select', { class: 'field' })
  const range = el('input', { class: 'field', value: current?.source?.range ?? current?.spec.range ?? '', spellcheck: false })
  const linked = el('input', { type: 'checkbox', checked: current ? !!current.source : true })
  const sheetPane = el(
    'div',
    { class: 'chart-source-pane' },
    el('div', { class: 'chart-row' }, field(t('Spreadsheet'), docSelect), field(t('Sheet'), sheetSelect)),
    field(t('Data range'), range),
    el('label', { class: 'check-label' }, linked, t('Keep linked to the spreadsheet')),
  )
  const grid = el('div', { class: 'chart-data-grid', role: 'grid' })
  grid.setAttribute('aria-label', t('Chart data'))
  const gridButton = (node: IconNode, label: string, run: () => void) => {
    const b = el('button', { type: 'button', class: 'chart-grid-btn', title: label }, icon(node, 14), el('span', { textContent: label }))
    b.addEventListener('click', () => {
      run()
      drawGrid()
      sync()
    })
    return b
  }
  const inlinePane = el(
    'div',
    { class: 'chart-source-pane' },
    grid,
    el(
      'div',
      { class: 'chart-grid-actions' },
      gridButton(Plus, t('Add row'), () => inlineRows.push(Array(inlineRows[0]?.length ?? 2).fill(null))),
      gridButton(Plus, t('Add column'), () => inlineRows.forEach((r) => r.push(null))),
      gridButton(Minus, t('Remove row'), () => inlineRows.length > 2 && inlineRows.pop()),
      gridButton(Minus, t('Remove column'), () => (inlineRows[0]?.length ?? 0) > 2 && inlineRows.forEach((r) => r.pop())),
    ),
  )
  const drawGrid = () => {
    const width = Math.max(...inlineRows.map((r) => r.length))
    grid.style.gridTemplateColumns = `repeat(${width}, minmax(64px, 1fr))`
    grid.replaceChildren(
      ...inlineRows.flatMap((row, r) =>
        Array.from({ length: width }, (_, c) => {
          const v = row[c]
          const input = el('input', { class: 'chart-cell' + (r === 0 || c === 0 ? ' head' : ''), value: v === null || v === undefined ? '' : String(v) })
          input.setAttribute('aria-label', t('Row {row}, column {col}', { row: r + 1, col: c + 1 }))
          input.addEventListener('input', () => {
            row[c] = typed(input.value)
            sync()
          })
          return input
        }),
      ),
    )
  }
  const noSheets = el('p', { class: 'chart-hint', textContent: t('There are no spreadsheets in this browser yet: type the data or create a spreadsheet first.') })
  noSheets.hidden = sheets.length > 0

  // ---------- Options ----------
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
  const seriesIn = el('select', { class: 'field' }, el('option', { value: 'columns', textContent: t('Columns') }), el('option', { value: 'rows', textContent: t('Rows') }))
  seriesIn.value = current?.spec.seriesIn ?? 'columns'
  const headerRow = el('input', { type: 'checkbox', checked: current?.spec.headerRow ?? true })
  const headerCol = el('input', { type: 'checkbox', checked: current?.spec.headerCol ?? true })
  let headersTouched = !!current
  headerRow.addEventListener('change', () => (headersTouched = true))
  headerCol.addEventListener('change', () => (headersTouched = true))
  const title = el('input', { class: 'field', value: current?.spec.title ?? '' })
  const caption = el('input', { class: 'field', value: opts.caption ?? '' })
  const xTitle = el('input', { class: 'field', value: current?.spec.xTitle ?? '' })
  const yTitle = el('input', { class: 'field', value: current?.spec.yTitle ?? '' })
  const legend = el('select', { class: 'field' }, ...([['bottom', t('Bottom')], ['top', t('Top')], ['right', t('Right')], ['none', t('None')]] as const).map(([v, l]) => el('option', { value: v, textContent: l })))
  legend.value = current?.spec.legend ?? 'bottom'
  const palette = el('select', { class: 'field' }, ...(Object.keys(PALETTES) as PaletteName[]).map((p) => el('option', { value: p, textContent: PALETTE_LABELS[p]() })))
  palette.value = current?.spec.palette ?? 'ofimeo'
  const swatches = el('div', { class: 'chart-swatches' })
  swatches.setAttribute('aria-hidden', 'true')
  const trendline = el('input', { type: 'checkbox', checked: !!current?.spec.trendline })
  const trendRow = el('label', { class: 'check-label' }, trendline, t('Linear trendline with equation and R²'))
  const error = el('div', { class: 'chart-error', role: 'alert' })
  const preview = el('div', { class: 'chart-preview' })

  // ---------- State ----------
  const table = () => tables.find((s) => s.id === sheetSelect.value) ?? tables[0]
  const resolve = (): { chart: EmbeddedChart | null; message: string } => {
    let rows: Cell[][]
    let sheetId = ''
    let a1: string
    if (mode === 'sheet') {
      const tb = table()
      const r = parseA1(range.value)
      if (!tb) return { chart: null, message: loadedDoc === docSelect.value ? t('This spreadsheet has no data') : t('Loading…') }
      if (!r) return { chart: null, message: t('Enter a range such as A1:C6') }
      rows = blockValues(tb, r)
      sheetId = tb.id
      a1 = toA1(r)
    } else {
      rows = inlineRows.map((r) => [...r])
      a1 = toA1({ startRow: 0, startColumn: 0, endRow: rows.length - 1, endColumn: Math.max(0, ...rows.map((r) => r.length)) - 1 })
    }
    const spec: ChartSpec = {
      kind: CHART_KIND,
      type,
      sheetId,
      range: a1,
      seriesIn: seriesIn.value as ChartSpec['seriesIn'],
      headerRow: headerRow.checked,
      headerCol: headerCol.checked,
      title: title.value.trim(),
      legend: legend.value as LegendPosition,
      xTitle: xTitle.value.trim(),
      yTitle: yTitle.value.trim(),
      palette: palette.value as PaletteName,
      trendline: type === 'scatter' && trendline.checked,
    }
    const doc = sheets.find((d) => d.id === docSelect.value)
    const source =
      mode === 'sheet' && linked.checked
        ? { docId: docSelect.value, title: doc?.title ?? current?.source?.title ?? '', sheetId, sheetName: table()?.name ?? '', range: a1 }
        : undefined
    return { message: '', chart: { spec, rows, ...(source ? { source, updated: Date.now() } : {}) } }
  }

  let chart: import('echarts/core').ECharts | null = null
  const sync = () => {
    modeSheet.checked = mode === 'sheet'
    modeInline.checked = mode === 'inline'
    sheetPane.hidden = mode !== 'sheet'
    inlinePane.hidden = mode !== 'inline'
    for (const b of typeButtons) b.setAttribute('aria-checked', String(b.dataset.type === type))
    trendRow.hidden = type !== 'scatter'
    xTitle.disabled = yTitle.disabled = type === 'pie' || type === 'doughnut'
    swatches.replaceChildren(
      ...PALETTES[palette.value as PaletteName].slice(0, 6).map((c) => {
        const s = el('span')
        s.style.background = c
        return s
      }),
    )
    const { chart: c, message } = resolve()
    error.textContent = message
    if (c && chart) chart.setOption(optionOf(c, preview.clientWidth || 480) as never, true)
    else chart?.clear()
  }
  const detect = () => {
    const { chart: c } = resolve()
    if (c && !headersTouched) {
      const h = detectHeaders(c.rows)
      headerRow.checked = h.headerRow
      headerCol.checked = h.headerCol
    }
    sync()
  }
  const loadDoc = async () => {
    const id = docSelect.value
    if (!id) return
    tables = []
    sheetSelect.replaceChildren()
    sync()
    const loaded = await loadLibrarySheet(id).catch(() => null)
    if (docSelect.value !== id) return
    loadedDoc = id
    tables = (loaded?.tables ?? []).filter((tb) => tb.rows.length)
    if (!tables.length) tables = loaded?.tables ?? []
    // A linked spreadsheet that is not in this browser: its snapshot stands in for it.
    const src = current?.source
    const at = src ? parseA1(src.range) : null
    if (!loaded && src?.docId === id && at) {
      const rows: Cell[][] = []
      current!.rows.forEach((r, i) => (rows[at.startRow + i] = [...Array(at.startColumn).fill(null), ...r]))
      tables = [{ id: src.sheetId, name: src.sheetName, rows: Array.from(rows, (r) => r ?? []) }]
    }
    sheetSelect.replaceChildren(...tables.map((tb) => el('option', { value: tb.id, textContent: tb.name })))
    const keep = current?.source?.docId === id ? current.source.sheetId : ''
    if (keep && tables.some((tb) => tb.id === keep)) sheetSelect.value = keep
    else if (tables[0]) {
      sheetSelect.value = tables[0].id
      range.value = toA1(usedRange(tables[0]))
    }
    detect()
  }
  docSelect.addEventListener('change', () => void loadDoc())
  sheetSelect.addEventListener('change', () => {
    const tb = table()
    if (tb) range.value = toA1(usedRange(tb))
    detect()
  })
  range.addEventListener('input', detect)
  for (const radio of [modeSheet, modeInline])
    radio.addEventListener('change', () => {
      mode = radio.value as typeof mode
      detect()
    })
  for (const f of [seriesIn, headerRow, headerCol, title, xTitle, yTitle, legend, palette, trendline]) f.addEventListener(f.tagName === 'INPUT' && (f as HTMLInputElement).type !== 'checkbox' ? 'input' : 'change', sync)

  const sourceGroup = el(
    'div',
    { class: 'chart-source', role: 'radiogroup' },
    el('label', { class: 'check-label' }, modeSheet, t('From a spreadsheet')),
    el('label', { class: 'check-label' }, modeInline, t('Type the data')),
  )
  sourceGroup.setAttribute('aria-label', t('Data'))
  const form = el(
    'div',
    { class: 'chart-form' },
    el('div', { class: 'field-label' }, t('Data'), sourceGroup),
    noSheets,
    sheetPane,
    inlinePane,
    el('div', { class: 'field-label' }, t('Chart type'), typeGroup),
    el('div', { class: 'chart-row' }, field(t('Series in'), seriesIn), el('div', { class: 'chart-checks' }, el('label', { class: 'check-label' }, headerRow, t('First row as headers')), el('label', { class: 'check-label' }, headerCol, t('First column as labels')))),
    field(t('Title'), title),
    ...(opts.caption !== undefined ? [field(t('Caption'), caption)] : []),
    el('div', { class: 'chart-row' }, field(t('Horizontal axis title'), xTitle), field(t('Vertical axis title'), yTitle)),
    el('div', { class: 'chart-row' }, field(t('Legend'), legend), el('div', { class: 'field-label' }, t('Colors'), el('div', { class: 'chart-palette' }, palette, swatches))),
    trendRow,
    error,
  )
  const body = el('div', { class: 'chart-dialog embed-chart-dialog' }, form, preview)
  drawGrid()
  const opened = showDialog(current ? t('Edit chart') : t('Insert chart'), body, [
    { label: t('Cancel'), value: 'cancel' },
    { label: current ? t('Save') : t('Insert'), value: 'ok', primary: true },
  ], true)
  sync()
  if (mode === 'sheet' || sheets.length) void loadDoc()
  loadECharts().then(({ echarts }) => {
    if (!preview.isConnected) return
    chart = echarts.init(preview, null, { renderer: 'canvas' })
    sync()
  })
  const dialog = body.closest('dialog')!
  dialog.addEventListener('close', () => chart?.dispose())
  dialog.querySelector<HTMLButtonElement>('button[value="ok"]')!.addEventListener('click', (e) => {
    if (!resolve().chart) {
      e.preventDefault()
      sync()
    }
  })
  const result = await opened
  const chart = result === 'ok' ? resolve().chart : null
  return chart ? { chart, caption: caption.value.trim() } : null
}

function field(label: string, input: HTMLElement): HTMLElement {
  return el('label', { class: 'field-label' }, label, input)
}
