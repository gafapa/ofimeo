// Live charts on the grid: the float DOM component (rendered by Univer inside
// its React tree) draws the chart with ECharts, loaded on first use, and
// redraws it when cells change (local, remote or formula results). Source
// ranges follow row/column insertions and deletions through Univer's
// RefRangeService: the range update is added to the structural command, so it
// is undone with it and logged and synced like any mutation.

import { createElement, useEffect, useRef } from 'react'
import { ICommandService, type FUniver, type IDisposable, type Univer } from '@univerjs/presets'
import { handleDefaultRangeChangeWithEffectRefCommands, RefRangeService } from '@univerjs/preset-sheets-core'
import { locale, t } from '../../../core/i18n'
import { UNIVER_COMMANDS } from '../commands'
import { CHART_COMPONENT, chartData, DRAWING_TYPE_DOM, isChartSpec, normalizeSpec, parseA1, toA1, type Cell, type ChartSpec } from './model'
import { chartOption, type ChartColors } from './option'
import { chartSummary } from './summary'

export interface ChartInfo {
  id: string
  // Sheet the chart is drawn on (the source may be another sheet).
  hostSheetId: string
  spec: ChartSpec
  position: { left: number; top: number; width: number; height: number }
}

export interface ChartHost {
  univerAPI: FUniver
  canEdit: () => boolean
  // Double click or context menu on a chart.
  onEdit: (id: string) => void
  onContextMenu: (id: string, x: number, y: number) => void
}

const numberFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 4 })
export const formatChartNumber = (n: number) => numberFormat.format(n)
export const seriesLabel = (n: number) => t('Series {n}', { n })

// Colors of charts on screen follow the theme; prints and exports use paper colors.
export function screenColors(): ChartColors {
  const css = getComputedStyle(document.querySelector('.app') ?? document.documentElement)
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
  return { background: v('--surface', '#ffffff'), text: v('--text', '#202124'), muted: v('--muted', '#5f6368'), grid: v('--border', '#e0e0e0') }
}

// Values of the chart's source range in the live workbook (formula results included).
export function readValues(univerAPI: FUniver, spec: ChartSpec): Cell[][] {
  const sheet = univerAPI.getActiveWorkbook()?.getSheetBySheetId(spec.sheetId)
  const range = parseA1(spec.range)
  if (!sheet || !range) return []
  return sheet.getRange(range.startRow, range.startColumn, range.endRow - range.startRow + 1, range.endColumn - range.startColumn + 1).getValues() as Cell[][]
}

// Screen reader description of a chart from the live values.
export const liveSummary = (univerAPI: FUniver, spec: ChartSpec) => chartSummary(spec, chartData(spec, readValues(univerAPI, spec), seriesLabel), formatChartNumber)

export function liveOption(univerAPI: FUniver, spec: ChartSpec, colors = screenColors(), width = 480) {
  return chartOption(spec, chartData(spec, readValues(univerAPI, spec), seriesLabel), colors, formatChartNumber, width)
}

type EChartsModule = typeof import('./echarts')
let echartsModule: Promise<EChartsModule> | null = null
export const loadECharts = () => (echartsModule ??= import('./echarts'))

// Registers the chart component and the range following for one Univer instance.
export function registerCharts(univer: Univer, host: ChartHost): { redraw: () => void } {
  const { univerAPI } = host
  const commands = univer.__getInjector().get(ICommandService)
  const listeners = new Set<() => void>()
  let frame = 0
  const redraw = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => listeners.forEach((l) => l()))
  }
  // Any sheet or formula mutation may change chart data.
  commands.onCommandExecuted((info) => {
    if (info.id.startsWith('sheet.mutation.') || info.id.startsWith('formula.mutation.')) redraw()
  })

  function ChartView(props: { data?: unknown; floatDomId?: string }) {
    const ref = useRef<HTMLDivElement>(null)
    const desc = useRef<HTMLSpanElement>(null)
    const spec = isChartSpec(props.data) ? normalizeSpec(props.data) : null
    const key = JSON.stringify(spec)
    useEffect(() => {
      const node = ref.current
      if (!node || !spec) return
      let disposed = false
      let chart: import('echarts/core').ECharts | null = null
      let resize: ResizeObserver | null = null
      const render = () => {
        if (desc.current) desc.current.textContent = liveSummary(univerAPI, spec)
        chart?.setOption(liveOption(univerAPI, spec, screenColors(), node.clientWidth || 480) as never, true)
      }
      render()
      loadECharts().then(({ echarts }) => {
        if (disposed) return
        chart = echarts.init(node, null, { renderer: 'canvas' })
        render()
        resize = new ResizeObserver(() => {
          chart?.resize()
          render()
        })
        resize.observe(node)
        listeners.add(render)
      })
      return () => {
        disposed = true
        listeners.delete(render)
        resize?.disconnect()
        chart?.dispose()
      }
    }, [key, props.floatDomId])
    // The title names the chart; the hidden summary (series and values) describes it.
    const descId = `chart-desc-${props.floatDomId ?? ''}`
    return createElement(
      'div',
      { ref, className: 'ofimeo-chart', role: 'img', 'aria-label': spec?.title || t('Chart'), 'aria-describedby': descId, 'data-chart-id': props.floatDomId ?? '' },
      createElement('span', { ref: desc, id: descId, hidden: true }),
    )
  }
  univerAPI.registerComponent(CHART_COMPONENT, ChartView as never)
  // Double click and right click on a chart. Univer re-renders the float DOM when
  // the drawing gets selected, so the chart is found under the pointer instead
  // of listening on its element.
  const chartAt = (e: MouseEvent) =>
    (document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.classList.contains('ofimeo-chart')) as HTMLElement | undefined)?.dataset.chartId
  window.addEventListener('dblclick', (e) => {
    const id = chartAt(e)
    if (id && host.canEdit()) host.onEdit(id)
  }, true)
  // A right button press on a chart opens our menu, not Univer's drawing menu.
  for (const type of ['pointerdown', 'mousedown'] as const) {
    window.addEventListener(type, (e) => {
      if (e.button === 2 && chartAt(e)) e.stopPropagation()
    }, true)
  }
  window.addEventListener('contextmenu', (e) => {
    const id = chartAt(e)
    if (!id) return
    e.preventDefault()
    e.stopPropagation()
    host.onContextMenu(id, e.clientX, e.clientY)
  }, true)
  followRanges(univer, univerAPI)
  return { redraw }
}

// All charts of every sheet.
export function listCharts(univerAPI: FUniver): ChartInfo[] {
  const wb = univerAPI.getActiveWorkbook()
  if (!wb) return []
  return wb.getSheets().flatMap((sheet) =>
    sheet
      .getAllFloatDoms()
      .filter((f) => isChartSpec(f.data))
      .map((f) => {
        const p = f.position as unknown as { left: number; top: number; width: number; height: number }
        return { id: f.id, hostSheetId: sheet.getSheetId(), spec: normalizeSpec(f.data as unknown as ChartSpec), position: { left: p.left, top: p.top, width: p.width, height: p.height } }
      }),
  )
}

export const findChart = (univerAPI: FUniver, id: string) => listCharts(univerAPI).find((c) => c.id === id)

// Adds a chart on the active sheet, to the right of its source range unless a position is given.
export function insertChart(univerAPI: FUniver, spec: ChartSpec, pos?: { x: number; y: number; w: number; h: number }): string | null {
  const sheet = univerAPI.getActiveWorkbook()!.getActiveSheet()
  let p = pos
  if (!p) {
    const r = parseA1(spec.range)
    let x = 0
    let y = 0
    const sameSheet = spec.sheetId === sheet.getSheetId()
    if (r && sameSheet) {
      for (let c = 0; c <= r.endColumn + 1; c++) x += sheet.getColumnWidth(c)
      for (let row = 0; row < r.startRow; row++) y += sheet.getRowHeight(row)
    }
    // Drawing positions are scene pixels, which include the row and column headers.
    const skeleton = sheet.getSkeleton() as unknown as { rowHeaderWidth?: number; columnHeaderHeight?: number } | undefined
    p = { x: x + 8 + (skeleton?.rowHeaderWidth ?? 46), y: y + 4 + (skeleton?.columnHeaderHeight ?? 20), w: 480, h: 300 }
  }
  const res = sheet.addFloatDomToPosition({
    componentKey: CHART_COMPONENT,
    initPosition: { startX: p.x, endX: p.x + p.w, startY: p.y, endY: p.y + p.h },
    data: spec as never,
    allowTransform: true,
  })
  return res?.id ?? null
}

export function updateChart(univerAPI: FUniver, id: string, spec: ChartSpec): void {
  const info = findChart(univerAPI, id)
  if (!info) return
  univerAPI.getActiveWorkbook()!.getSheetBySheetId(info.hostSheetId)!.updateFloatDom(id, { data: spec as never })
}

export function deleteChart(univerAPI: FUniver, id: string): void {
  const info = findChart(univerAPI, id)
  if (!info) return
  // Univer's own removal command, so the deletion is undoable like any drawing's.
  const unitId = univerAPI.getActiveWorkbook()!.getId()
  void univerAPI.executeCommand(UNIVER_COMMANDS.removeDrawings, { unitId, drawings: [{ unitId, subUnitId: info.hostSheetId, drawingId: id, drawingType: DRAWING_TYPE_DOM }] })
}

// Keeps every chart's source range on the same cells when rows or columns are
// inserted, removed or moved. Registrations are refreshed whenever drawings,
// sheets or the workbook change.
function followRanges(univer: Univer, univerAPI: FUniver): void {
  const injector = univer.__getInjector()
  const commands = injector.get(ICommandService)
  let registered: IDisposable[] = []
  let timer = 0
  const refresh = () => {
    registered.forEach((d) => d.dispose())
    registered = []
    const wb = univerAPI.getActiveWorkbook()
    if (!wb) return
    const refRange = injector.get(RefRangeService)
    const unitId = wb.getId()
    for (const { id, hostSheetId, spec } of listCharts(univerAPI)) {
      const range = parseA1(spec.range)
      if (!range || !wb.getSheetBySheetId(spec.sheetId)) continue
      registered.push(
        refRange.registerRefRange(
          range,
          (cmd) => {
            const next = handleDefaultRangeChangeWithEffectRefCommands(range, cmd as never)
            const ref = next ? toA1(next) : null
            if (!ref || ref === spec.range) return { redos: [], undos: [] }
            const apply = (from: string, to: string) => ({
              id: UNIVER_COMMANDS.drawingApply,
              params: {
                unitId,
                subUnitId: hostSheetId,
                op: [unitId, hostSheetId, 'data', id, 'data', 'range', { r: from, i: to }],
                objects: [{ unitId, subUnitId: hostSheetId, drawingId: id }],
                type: 2,
              },
            })
            return { redos: [apply(spec.range, ref)], undos: [apply(ref, spec.range)] }
          },
          unitId,
          spec.sheetId,
        ),
      )
    }
  }
  const schedule = () => {
    clearTimeout(timer)
    timer = window.setTimeout(refresh, 0)
  }
  commands.onCommandExecuted((info) => {
    if (info.id === UNIVER_COMMANDS.drawingApply || info.id === UNIVER_COMMANDS.setActiveSheet || info.id.includes('workbook') || info.id.includes('worksheet')) schedule()
  })
  univerAPI.addEvent(univerAPI.Event.WorkbookCreated, schedule)
  schedule()
}
