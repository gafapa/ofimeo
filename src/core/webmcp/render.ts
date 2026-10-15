// Pictures for the render tool: a PDF page (pdf.js), an SVG or a table of
// cell values drawn on a canvas. At most MAX_SIDE pixels on the longer side.

import type { PDFPageProxy } from 'pdfjs-dist'

export const MAX_SIDE = 2048

const toBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The picture could not be made'))), 'image/png'))

export async function pdfPageToPng(page: PDFPageProxy, maxSide = MAX_SIDE): Promise<Blob> {
  const base = page.getViewport({ scale: 1 })
  const scale = Math.min(2, maxSide / Math.max(base.width, base.height))
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  const context = canvas.getContext('2d')!
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: context, viewport, canvas }).promise
  return toBlob(canvas)
}

// Scale for an SVG of this size so the picture fits MAX_SIDE (at most 2×).
export const svgScale = (width: number, height: number) => Math.max(0.1, Math.min(2, MAX_SIDE / Math.max(width, height, 1)))

export interface CellPicture {
  // Column letters and row numbers of the range.
  columns: string[]
  rows: number[]
  values: string[][]
  bold?: boolean[][]
  background?: (string | null)[][]
}

// Cell values as a spreadsheet-like grid.
export function cellsToPng({ columns, rows, values, bold, background }: CellPicture): Promise<Blob> {
  const font = '13px system-ui, sans-serif'
  const pad = 6
  const rowHeight = 22
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  ctx.font = font
  const headerWidth = Math.max(32, ...rows.map((r) => ctx.measureText(String(r)).width + 2 * pad))
  const widths = columns.map((c, i) => Math.min(240, Math.max(48, ctx.measureText(c).width + 2 * pad, ...values.map((row) => ctx.measureText(row[i] ?? '').width + 2 * pad))))
  const width = Math.min(MAX_SIDE, Math.ceil(headerWidth + widths.reduce((a, b) => a + b, 0)))
  const height = Math.min(MAX_SIDE, rowHeight * (rows.length + 1))
  canvas.width = width
  canvas.height = height
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.textBaseline = 'middle'
  const cell = (x: number, y: number, w: number, text: string, opts: { head?: boolean; bold?: boolean; fill?: string | null } = {}) => {
    ctx.fillStyle = opts.head ? '#f1f3f4' : (opts.fill ?? '#ffffff')
    ctx.fillRect(x, y, w, rowHeight)
    ctx.strokeStyle = '#dadce0'
    ctx.strokeRect(x + 0.5, y + 0.5, w, rowHeight)
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, w, rowHeight)
    ctx.clip()
    ctx.font = opts.bold ? `bold ${font}` : font
    ctx.fillStyle = opts.head ? '#5f6368' : '#202124'
    ctx.textAlign = opts.head ? 'center' : 'left'
    ctx.fillText(text, opts.head ? x + w / 2 : x + pad, y + rowHeight / 2)
    ctx.restore()
  }
  cell(0, 0, headerWidth, '', { head: true })
  let x = headerWidth
  columns.forEach((c, i) => {
    cell(x, 0, widths[i], c, { head: true })
    x += widths[i]
  })
  rows.forEach((r, ri) => {
    const y = rowHeight * (ri + 1)
    cell(0, y, headerWidth, String(r), { head: true })
    let cx = headerWidth
    columns.forEach((_c, ci) => {
      cell(cx, y, widths[ci], values[ri]?.[ci] ?? '', { bold: bold?.[ri]?.[ci], fill: background?.[ri]?.[ci] })
      cx += widths[ci]
    })
  })
  return toBlob(canvas)
}
