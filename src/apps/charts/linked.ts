// Refreshing linked charts from their source spreadsheets (when those are
// stored in this browser).

import { getDoc } from '../../core/store'
import { parseA1 } from '../sheet/charts/model'
import { sameRows, type EmbeddedChart } from './embedded'
import { blockValues, loadLibrarySheet } from './sheets'

export type RefreshResult = { status: 'updated'; chart: EmbeddedChart } | { status: 'same' } | { status: 'unavailable' }

// Reads the chart's range again. `force` reads it even if the source has not
// been saved since the snapshot.
export async function refreshLinked(chart: EmbeddedChart, force = false): Promise<RefreshResult> {
  const src = chart.source
  if (!src) return { status: 'unavailable' }
  const entry = getDoc(src.docId)
  if (!entry || entry.trashed) return { status: 'unavailable' }
  if (!force && chart.updated && entry.updated <= chart.updated) return { status: 'same' }
  const loaded = await loadLibrarySheet(src.docId).catch(() => null)
  const range = parseA1(src.range)
  if (!loaded || !range) return { status: 'unavailable' }
  // The sheet may have been renamed; its id stays.
  const table = loaded.tables.find((t) => t.id === src.sheetId) ?? loaded.tables.find((t) => t.name === src.sheetName)
  if (!table) return { status: 'unavailable' }
  const rows = blockValues(table, range)
  const title = loaded.entry.title
  if (sameRows(rows, chart.rows) && title === src.title && table.name === src.sheetName) return { status: 'same' }
  return { status: 'updated', chart: { ...chart, rows, source: { ...src, title, sheetName: table.name, sheetId: table.id }, updated: Date.now() } }
}

// Whether the chart's source spreadsheet is in this browser.
export const sourceAvailable = (chart: EmbeddedChart) => !!chart.source && !!getDoc(chart.source.docId) && !getDoc(chart.source.docId)?.trashed
