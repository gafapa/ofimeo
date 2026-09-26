// Printing: renders the used range of a sheet as an HTML table (styles,
// merges, column widths, row heights and formatted values) for the browser's
// print dialog, with the sheet's charts (SVG) laid over it at their position.

import type { ICellData, IRange, IStyleData, IWorkbookData } from '@univerjs/presets'
import { t } from '../../core/i18n'

const H_ALIGN: Record<number, string> = { 1: 'left', 2: 'center', 3: 'right', 4: 'justify', 5: 'justify', 6: 'justify' }
const V_ALIGN: Record<number, string> = { 1: 'top', 2: 'middle', 3: 'bottom' }
const DEFAULT_COL_WIDTH = 88
const DEFAULT_ROW_HEIGHT = 24

// A chart (or other drawing) in sheet pixels, relative to cell A1.
export interface PrintOverlay {
  left: number
  top: number
  width: number
  height: number
  svg: string
}

export function renderPrintHtml(data: IWorkbookData, sheetId: string, display: (row: number, col: number) => string, overlays: PrintOverlay[] = []): string {
  const sheet = data.sheets[sheetId]
  if (!sheet) return ''
  const cells = sheet.cellData ?? {}
  const merges: IRange[] = sheet.mergeData ?? []

  // Used range: the last row/column holding a value.
  let lastRow = -1
  let lastCol = -1
  for (const [r, cols] of Object.entries(cells)) {
    for (const [c, cell] of Object.entries(cols ?? {}) as [string, ICellData | undefined][]) {
      if (cell && cell.v !== undefined && cell.v !== null && cell.v !== '') {
        lastRow = Math.max(lastRow, Number(r))
        lastCol = Math.max(lastCol, Number(c))
      }
    }
  }
  for (const m of merges) {
    lastRow = Math.max(lastRow, m.endRow)
    lastCol = Math.max(lastCol, m.endColumn)
  }
  if (lastRow < 0 && !overlays.length) return `<p>${t('(empty sheet)')}</p>`

  const covered = new Set<string>()
  const spans = new Map<string, IRange>()
  for (const m of merges) {
    spans.set(`${m.startRow}:${m.startColumn}`, m)
    for (let r = m.startRow; r <= m.endRow; r++) for (let c = m.startColumn; c <= m.endColumn; c++) if (r !== m.startRow || c !== m.startColumn) covered.add(`${r}:${c}`)
  }

  const style = (cell: ICellData | undefined): IStyleData | undefined => {
    if (!cell?.s) return undefined
    return typeof cell.s === 'string' ? (data.styles?.[cell.s] ?? undefined) : cell.s
  }

  // Rows and columns keep their sheet size so charts land on the same cells.
  const width = (c: number) => sheet.columnData?.[c]?.w ?? sheet.defaultColumnWidth ?? DEFAULT_COL_WIDTH
  let html = `<h1>${escape(sheet.name ?? '')}</h1><div class="sheet-print-page">`
  if (lastRow >= 0) {
    let total = 0
    for (let c = 0; c <= lastCol; c++) total += width(c)
    html += `<table style="width:${total}px"><colgroup>`
    for (let c = 0; c <= lastCol; c++) html += `<col style="width:${width(c)}px">`
    html += '</colgroup>'
  }
  for (let r = 0; r <= lastRow; r++) {
    if (sheet.rowData?.[r]?.hd) continue
    const height = sheet.rowData?.[r]?.h ?? sheet.defaultRowHeight ?? DEFAULT_ROW_HEIGHT
    html += `<tr style="height:${height}px">`
    for (let c = 0; c <= lastCol; c++) {
      if (covered.has(`${r}:${c}`)) continue
      const cell = cells[r]?.[c]
      const span = spans.get(`${r}:${c}`)
      const attrs = span ? ` rowspan="${span.endRow - span.startRow + 1}" colspan="${span.endColumn - span.startColumn + 1}"` : ''
      const css = cellCss(style(cell), typeof cell?.v === 'number')
      html += `<td${attrs}${css ? ` style="${css}"` : ''}>${escape(display(r, c))}</td>`
    }
    html += '</tr>'
  }
  if (lastRow >= 0) html += '</table>'
  for (const o of overlays) html += `<div class="sheet-print-chart" style="left:${o.left}px;top:${o.top}px;width:${o.width}px;height:${o.height}px">${o.svg}</div>`
  return `${html}</div>`
}

function cellCss(s: IStyleData | undefined, numeric: boolean): string {
  const css: string[] = []
  if (numeric) css.push('text-align:right')
  if (!s) return css.join(';')
  if (s.ff) css.push(`font-family:"${s.ff}"`)
  if (s.fs) css.push(`font-size:${s.fs}pt`)
  if (s.bl) css.push('font-weight:bold')
  if (s.it) css.push('font-style:italic')
  const deco = [s.ul?.s ? 'underline' : '', s.st?.s ? 'line-through' : ''].filter(Boolean).join(' ')
  if (deco) css.push(`text-decoration:${deco}`)
  if (s.cl?.rgb) css.push(`color:${s.cl.rgb}`)
  if (s.bg?.rgb) css.push(`background:${s.bg.rgb}`)
  if (s.ht && H_ALIGN[s.ht]) css.push(`text-align:${H_ALIGN[s.ht]}`)
  if (s.vt && V_ALIGN[s.vt]) css.push(`vertical-align:${V_ALIGN[s.vt]}`)
  if (s.tb === 3) css.push('white-space:pre-wrap')
  for (const [side, key] of [['top', 't'], ['right', 'r'], ['bottom', 'b'], ['left', 'l']] as const) {
    const b = s.bd?.[key]
    if (b?.s) css.push(`border-${side}:${b.s >= 8 ? 2 : 1}px ${b.s === 7 ? 'double' : b.s === 3 ? 'dotted' : b.s === 4 ? 'dashed' : 'solid'} ${b.cl?.rgb ?? '#000'}`)
  }
  return css.join(';')
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}
