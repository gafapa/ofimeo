// Univer drawing resource for imported files (images and charts).

import type { IWorkbookData } from '@univerjs/presets'
import { DRAWING_RESOURCE, type CellAnchor } from '../charts/model'

// Builds Univer's drawing resource: cell anchors plus scene pixels (which include
// the default row/column header sizes).
export class DrawingCollector {
  private data: Record<string, { data: Record<string, unknown>; order: string[] }> = {}
  private n = 0
  constructor(private readonly sheets: IWorkbookData['sheets']) {}
  get empty() {
    return !Object.keys(this.data).length
  }
  // `to` may be a size in pixels instead of the end cell (one-cell anchors).
  add(sheetId: string, from: CellAnchor, end: CellAnchor | { width: number; height: number }, fields: Record<string, unknown>) {
    const sheet = this.sheets[sheetId]
    const colWidth = (c: number) => sheet?.columnData?.[c]?.w ?? sheet?.defaultColumnWidth ?? 88
    const rowHeight = (r: number) => sheet?.rowData?.[r]?.h ?? sheet?.defaultRowHeight ?? 24
    const x = (a: CellAnchor) => {
      let v = 46 + a.columnOffset
      for (let c = 0; c < a.column; c++) v += colWidth(c)
      return v
    }
    const y = (a: CellAnchor) => {
      let v = 20 + a.rowOffset
      for (let r = 0; r < a.row; r++) v += rowHeight(r)
      return v
    }
    let to: CellAnchor
    if ('column' in end) to = end
    else {
      let rest = x(from) - 46 + end.width
      let column = 0
      while (column < 16383 && rest >= colWidth(column)) rest -= colWidth(column++)
      let down = y(from) - 20 + end.height
      let row = 0
      while (row < 1_000_000 && down >= rowHeight(row)) down -= rowHeight(row++)
      to = { column, columnOffset: Math.round(rest), row, rowOffset: Math.round(down) }
    }
    const drawingId = `imported-${++this.n}`
    const sheetTransform = { from, to, flipY: false, flipX: false, angle: 0, skewX: 0, skewY: 0 }
    const entry = (this.data[sheetId] ??= { data: {}, order: [] })
    entry.data[drawingId] = {
      unitId: 'workbook',
      subUnitId: sheetId,
      drawingId,
      ...fields,
      sheetTransform,
      axisAlignSheetTransform: sheetTransform,
      transform: { left: x(from), top: y(from), width: Math.max(1, x(to) - x(from)), height: Math.max(1, y(to) - y(from)), flipY: false, flipX: false, angle: 0, skewX: 0, skewY: 0 },
    }
    entry.order.push(drawingId)
  }
  resource() {
    return { name: DRAWING_RESOURCE, data: JSON.stringify(this.data) }
  }
}
