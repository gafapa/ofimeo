// Charts on slides: Insert ▸ Chart… (data from an Ofimeo spreadsheet, kept
// linked, or typed in), editing on double click, and linked charts kept up to
// date from their source when it is saved in this browser. A chart is a
// picture cell (slideChart=1) whose data (woData) holds the chart and its data
// snapshot, so everyone sees it without the source; PowerPoint export writes
// it as a native chart (formats/pptx.ts).

import * as Y from 'yjs'
import { Cell, Geometry } from '@maxgraph/core'
import { t } from '../../core/i18n'
import type { Session } from '../../core/session'
import { toast } from '../../ui/widgets'
import type { DiagramEditor } from '../diagram/editor'
import { styleFromString, styleToString, type DataCell } from '../diagram/graph'
import { chartSvg, readEmbedded, type EmbeddedChart } from '../charts/embedded'
import { refreshLinked } from '../charts/linked'
import { watchLibrary } from '../charts/sheets'
import { svgDataUri } from './formats/chart'

const WIDTH = 560
const HEIGHT = 340

// The chart stored in a cell, if it is an Ofimeo chart.
export function cellChart(data: string | undefined): EmbeddedChart | null {
  if (!data) return null
  try {
    return readEmbedded((JSON.parse(data) as { ofimeoChart?: unknown }).ofimeoChart)
  } catch {
    return null
  }
}

async function chartStyle(chart: EmbeddedChart, width: number, height: number, previous?: string): Promise<string> {
  const image = svgDataUri(await chartSvg(chart, width, height))
  // Keep the other keys (rotation, opacity…) of an existing chart.
  const keep = (previous ?? '').split(';').filter((p) => p && !/^(shape|image|imageAspect|slideChart)=/.test(p))
  return ['shape=image', 'imageAspect=0', 'slideChart=1', ...keep, `image=${image}`].join(';') + ';'
}

export function setupSlideCharts(session: Session, editor: DiagramEditor) {
  const { graph } = editor
  const readOnly = !session.canEdit
  const isChart = (cell: Cell | null): cell is DataCell => !!cell && !!cellChart((cell as DataCell).woData)

  const insert = async () => {
    if (readOnly) return
    const { chartEmbedDialog } = await import('../charts/dialog')
    const result = await chartEmbedDialog()
    if (!result) return
    const cell = new Cell('', new Geometry(0, 0, WIDTH, HEIGHT), styleFromString(await chartStyle(result.chart, WIDTH, HEIGHT))) as DataCell
    cell.setVertex(true)
    cell.woData = JSON.stringify({ ofimeoChart: result.chart })
    editor.insertAtCenter([cell])
  }

  const update = async (cell: DataCell, chart: EmbeddedChart) => {
    const geo = cell.getGeometry()
    const style = await chartStyle(chart, geo?.width ?? WIDTH, geo?.height ?? HEIGHT, styleToString(cell.getStyle()))
    editor.inBatch(() => {
      cell.woData = JSON.stringify({ ofimeoChart: chart })
      graph.getDataModel().setStyle(cell, styleFromString(style))
    })
  }

  const edit = async (cell: DataCell) => {
    const current = cellChart(cell.woData)
    if (readOnly || !current) return
    const { chartEmbedDialog } = await import('../charts/dialog')
    const result = await chartEmbedDialog(current)
    if (result) await update(cell, result.chart)
  }

  const refresh = async (cell: DataCell) => {
    const chart = cellChart(cell.woData)
    if (readOnly || !chart?.source) return
    const result = await refreshLinked(chart, true)
    if (result.status === 'unavailable') toast(t('The source spreadsheet is not available in this browser; the chart keeps its last data.'), 5000)
    else if (result.status === 'same') toast(t('The chart is up to date'))
    else await update(cell, result.chart)
  }

  // Linked charts of every slide, updated in the shared document (the shown
  // slide follows through the sync, like any remote change).
  const refreshStored = async (docId?: string) => {
    if (readOnly) return
    const doc = session.doc
    for (const name of [...doc.share.keys()]) {
      if (!name.startsWith('diagram-cells:')) continue
      const cells = doc.getMap<Y.Map<string | number>>(name)
      for (const [, fields] of cells) {
        if (!(fields instanceof Y.Map)) continue
        const chart = cellChart(fields.get('data') as string | undefined)
        if (!chart?.source || (docId && chart.source.docId !== docId)) continue
        const result = await refreshLinked(chart)
        if (result.status !== 'updated') continue
        let geo = { width: WIDTH, height: HEIGHT }
        try {
          geo = { ...geo, ...JSON.parse(String(fields.get('geometry') ?? '{}')) }
        } catch {
          // Default size.
        }
        const style = await chartStyle(result.chart, geo.width, geo.height, String(fields.get('style') ?? ''))
        doc.transact(() => {
          fields.set('data', JSON.stringify({ ofimeoChart: result.chart }))
          fields.set('style', style)
        })
      }
    }
  }
  if (!readOnly) {
    setTimeout(() => void refreshStored(), 1500)
    const timers = new Map<string, number>()
    watchLibrary((docId) => {
      clearTimeout(timers.get(docId))
      timers.set(
        docId,
        window.setTimeout(() => {
          void refreshStored(docId)
          window.setTimeout(() => void refreshStored(docId), 2500)
        }, 700),
      )
    })
  }

  return { insert, edit, refresh, isChart }
}
