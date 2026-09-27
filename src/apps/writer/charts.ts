// Charts in documents: Insert ▸ Chart…, editing, and linked charts kept up to
// date from their source spreadsheets (on opening and whenever another tab
// saves the spreadsheet). Only editors change the document; everyone sees
// the stored data snapshot.

import type { Node as PMNode } from '@tiptap/pm/model'
import type { WriterContext } from './app'
import { t } from '../../core/i18n'
import { toast } from '../../ui/widgets'
import { chartJson, readEmbedded, type EmbeddedChart } from '../charts/embedded'
import { refreshLinked } from '../charts/linked'
import { watchLibrary } from '../charts/sheets'
import { CHART_HEIGHT, CHART_WIDTH, type ChartEventDetail } from './editor/chart'

export async function insertChart(ctx: WriterContext): Promise<void> {
  const { editor } = ctx
  if (!editor.isEditable) return
  const { from, to } = editor.state.selection
  const { chartEmbedDialog } = await import('../charts/dialog')
  const result = await chartEmbedDialog(undefined, { caption: '' })
  if (!result || !editor.isEditable) return
  const width = Math.min(CHART_WIDTH, Math.round(ctx.layout().pages[0]?.geo.width ? ctx.layout().pages[0].geo.width - 200 : CHART_WIDTH))
  editor
    .chain()
    .focus()
    .insertContentAt({ from, to }, { type: 'chart', attrs: { chart: chartJson(result.chart), width: Math.max(320, width), height: CHART_HEIGHT, caption: result.caption } })
    .run()
}

function chartAt(ctx: WriterContext, pos: number): PMNode | null {
  const node = ctx.editor.state.doc.nodeAt(pos)
  return node?.type.name === 'chart' ? node : null
}

function setChart(ctx: WriterContext, pos: number, chart: EmbeddedChart, extra: Record<string, unknown> = {}): void {
  const node = chartAt(ctx, pos)
  if (!node) return
  ctx.editor
    .chain()
    .command(({ tr }) => {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...extra, chart: chartJson(chart) })
      return true
    })
    .run()
}

export async function editChart(ctx: WriterContext, pos: number): Promise<void> {
  const node = chartAt(ctx, pos)
  const current = node ? readEmbedded(node.attrs.chart) : null
  if (!node || !ctx.editor.isEditable) return
  const { chartEmbedDialog } = await import('../charts/dialog')
  const result = await chartEmbedDialog(current ?? undefined, { caption: String(node.attrs.caption ?? '') })
  if (!result || !ctx.editor.isEditable) return
  // The node may have moved while the dialog was open.
  let at = pos
  if (chartAt(ctx, pos) !== node) {
    at = -1
    ctx.editor.state.doc.descendants((n, p) => {
      if (n === node) at = p
      return at < 0
    })
  }
  if (at >= 0) setChart(ctx, at, result.chart, { caption: result.caption })
}

export async function refreshChart(ctx: WriterContext, pos: number, force = true): Promise<boolean> {
  const node = chartAt(ctx, pos)
  const chart = node ? readEmbedded(node.attrs.chart) : null
  if (!chart?.source || !ctx.editor.isEditable) return false
  const result = await refreshLinked(chart, force)
  if (result.status === 'unavailable') {
    if (force) toast(t('The source spreadsheet is not available in this browser; the chart keeps its last data.'), 5000)
    return false
  }
  if (result.status === 'same') {
    if (force) toast(t('The chart is up to date'))
    return false
  }
  // Find the node again: the document may have changed while reading.
  let at = -1
  ctx.editor.state.doc.descendants((n, p) => {
    if (at < 0 && n.type.name === 'chart' && n.attrs.chart === node!.attrs.chart) at = p
    return at < 0
  })
  if (at >= 0) setChart(ctx, at, result.chart)
  return at >= 0
}

// Linked charts whose source is `docId` (or all linked charts), with their positions.
function linkedCharts(ctx: WriterContext, docId?: string): number[] {
  const out: number[] = []
  ctx.editor.state.doc.descendants((n, p) => {
    if (n.type.name === 'chart') {
      const c = readEmbedded(n.attrs.chart)
      if (c?.source && (!docId || c.source.docId === docId)) out.push(p)
    }
    return !n.isAtom
  })
  return out
}

async function refreshAll(ctx: WriterContext, docId?: string): Promise<void> {
  // Positions shift as charts change: refresh one at a time, from the end.
  for (const pos of linkedCharts(ctx, docId).reverse()) await refreshChart(ctx, pos, false)
}

export function setupCharts(ctx: WriterContext): void {
  const dom = ctx.editor.view.dom
  dom.addEventListener('chart-edit', (e) => void editChart(ctx, (e as CustomEvent<ChartEventDetail>).detail.pos))
  dom.addEventListener('chart-refresh', (e) => void refreshChart(ctx, (e as CustomEvent<ChartEventDetail>).detail.pos, true))
  if (!ctx.session.canEdit) return
  // On opening (once the document has loaded) and when a source is saved in another tab.
  setTimeout(() => void refreshAll(ctx), 1500)
  const timers = new Map<string, number>()
  watchLibrary((docId) => {
    if (!linkedCharts(ctx, docId).length) return
    // Let the other tab finish writing to IndexedDB; check again a bit later.
    clearTimeout(timers.get(docId))
    timers.set(
      docId,
      window.setTimeout(() => {
        void refreshAll(ctx, docId)
        window.setTimeout(() => void refreshAll(ctx, docId), 2500)
      }, 700),
    )
  })
}
