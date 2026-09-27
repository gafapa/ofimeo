// Printing: renders the used range of a sheet as an HTML table (styles,
// merges, column widths, row heights and formatted values) for the browser's
// print dialog, with the sheet's charts (SVG) laid over it at their position.

import type * as Y from 'yjs'
import type { ICellData, IRange, IStyleData, IWorkbookData } from '@univerjs/presets'
import { t } from '../../core/i18n'
import { el, showDialog } from '../../ui/widgets'

const H_ALIGN: Record<number, string> = { 1: 'left', 2: 'center', 3: 'right', 4: 'justify', 5: 'justify', 6: 'justify' }
const V_ALIGN: Record<number, string> = { 1: 'top', 2: 'middle', 3: 'bottom' }
const DEFAULT_COL_WIDTH = 88
const DEFAULT_ROW_HEIGHT = 24

// A chart anchored at a cell (Univer's sheetTransform.from), with its size in pixels.
export interface PrintOverlay {
  from: { column: number; columnOffset: number; row: number; rowOffset: number }
  width: number
  height: number
  svg: string
}

// ---------- Page setup (File ▸ Page setup…) ----------

export interface PrintSettings {
  paper: 'A4' | 'Letter'
  // 'auto': landscape when the used range is wider than a portrait page.
  orientation: 'auto' | 'portrait' | 'landscape'
  // Shrinks wide sheets to the page width (never enlarges).
  fitWidth: boolean
  // Percent, used when fitWidth is off.
  scale: number
  margins: 'normal' | 'narrow' | 'wide'
  gridlines: boolean
  // Repeats the first printed row at the top of every page.
  repeatHeader: boolean
}

const DEFAULT_SETTINGS: PrintSettings = { paper: 'A4', orientation: 'auto', fitWidth: true, scale: 100, margins: 'normal', gridlines: true, repeatHeader: false }
const PAPER_MM = { A4: [210, 297], Letter: [215.9, 279.4] } as const
const MARGIN_MM = { normal: 12, narrow: 6, wide: 20 } as const
const PX_PER_MM = 96 / 25.4

export const printSettingsMap = (doc: Y.Doc) => doc.getMap<unknown>('sheet-print')

export function readPrintSettings(doc: Y.Doc): PrintSettings {
  const map = printSettingsMap(doc)
  const out = { ...DEFAULT_SETTINGS }
  for (const key of Object.keys(out) as (keyof PrintSettings)[]) {
    const v = map.get(key)
    if (v !== undefined && typeof v === typeof out[key]) (out as Record<string, unknown>)[key] = v
  }
  out.scale = Math.min(400, Math.max(10, out.scale))
  return out
}

// Page CSS for the settings and the printed width (px); returns the zoom used.
export function pageCss(s: PrintSettings, contentWidth: number): { css: string; zoom: number } {
  const [w, h] = PAPER_MM[s.paper]
  const margin = MARGIN_MM[s.margins]
  const printable = (mm: number) => (mm - 2 * margin) * PX_PER_MM
  const landscape = s.orientation === 'landscape' || (s.orientation === 'auto' && contentWidth > printable(w))
  const width = printable(landscape ? h : w)
  const zoom = s.fitWidth ? Math.min(1, width / Math.max(1, contentWidth)) : s.scale / 100
  const css =
    `@page { size: ${s.paper} ${landscape ? 'landscape' : 'portrait'}; margin: ${margin}mm; }\n` +
    `@media print { .sheet-print-page { zoom: ${Math.round(zoom * 1000) / 1000}; }` +
    (s.gridlines ? '' : ' .sheet-print td { border-color: transparent; }') +
    ' }'
  return { css, zoom }
}

export async function pageSetupDialog(doc: Y.Doc, canEdit: boolean, local: Partial<PrintSettings>): Promise<void> {
  const s = { ...readPrintSettings(doc), ...local }
  const select = (value: string, options: [string, string][]) => {
    const node = el('select', { class: 'field' }, ...options.map(([v, l]) => el('option', { value: v, textContent: l })))
    node.value = value
    return node
  }
  const paper = select(s.paper, [
    ['A4', 'A4 (210 × 297 mm)'],
    ['Letter', `${t('Letter')} (216 × 279 mm)`],
  ])
  const orientation = select(s.orientation, [
    ['auto', t('Automatic (landscape for wide sheets)')],
    ['portrait', t('Portrait')],
    ['landscape', t('Landscape')],
  ])
  const margins = select(s.margins, [
    ['normal', t('Normal')],
    ['narrow', t('Narrow')],
    ['wide', t('Wide')],
  ])
  const fit = el('input', { type: 'checkbox', checked: s.fitWidth })
  const scale = el('input', { type: 'number', class: 'field', min: '10', max: '400', step: '5', value: String(s.scale), disabled: s.fitWidth })
  fit.addEventListener('change', () => (scale.disabled = fit.checked))
  const gridlines = el('input', { type: 'checkbox', checked: s.gridlines })
  const header = el('input', { type: 'checkbox', checked: s.repeatHeader })
  const body = el(
    'div',
    { class: 'form grid2' },
    el('label', { class: 'field-label' }, t('Paper size'), paper),
    el('label', { class: 'field-label' }, t('Orientation'), orientation),
    el('label', { class: 'field-label' }, t('Margins'), margins),
    el('label', { class: 'field-label' }, t('Scale (%)'), scale),
    el('label', { class: 'check-label span2' }, fit, t('Fit to page width')),
    el('label', { class: 'check-label span2' }, gridlines, t('Print gridlines')),
    el('label', { class: 'check-label span2' }, header, t('Repeat the first row on every page')),
    el('p', { class: 'hint span2', textContent: canEdit ? t('Page setup applies to everyone editing this document.') : t('Page setup applies to your printouts only.') }),
  )
  if ((await showDialog(t('Page setup'), body, [{ label: t('Cancel'), value: 'cancel' }, { label: t('Apply'), value: 'ok', primary: true }])) !== 'ok') return
  const next: PrintSettings = {
    paper: paper.value as PrintSettings['paper'],
    orientation: orientation.value as PrintSettings['orientation'],
    margins: margins.value as PrintSettings['margins'],
    fitWidth: fit.checked,
    scale: Math.min(400, Math.max(10, Number(scale.value) || 100)),
    gridlines: gridlines.checked,
    repeatHeader: header.checked,
  }
  if (canEdit) {
    const map = printSettingsMap(doc)
    doc.transact(() => (Object.keys(next) as (keyof PrintSettings)[]).forEach((k) => map.set(k, next[k])))
  } else Object.assign(local, next)
}

// ---------- Printed HTML ----------

export interface PrintOptions {
  // Prints only these cells (the selection).
  range?: IRange
  repeatHeader?: boolean
}

// Width in pixels of what prints: the used columns and the charts.
export function printWidth(data: IWorkbookData, sheetId: string, overlays: PrintOverlay[], range?: IRange): number {
  const sheet = data.sheets[sheetId]
  if (!sheet) return 0
  const width = (c: number) => sheet.columnData?.[c]?.w ?? sheet.defaultColumnWidth ?? DEFAULT_COL_WIDTH
  const { firstCol, lastCol } = usedRange(data, sheetId, range)
  let total = 0
  for (let c = firstCol; c <= lastCol; c++) total += width(c)
  if (range) return total
  for (const o of overlays) {
    let right = o.from.columnOffset + o.width
    for (let c = 0; c < o.from.column; c++) right += width(c)
    total = Math.max(total, right)
  }
  return total
}

function usedRange(data: IWorkbookData, sheetId: string, range?: IRange) {
  const sheet = data.sheets[sheetId]
  // Used range: the last row/column holding a value.
  let lastRow = -1
  let lastCol = -1
  for (const [r, cols] of Object.entries(sheet?.cellData ?? {})) {
    for (const [c, cell] of Object.entries(cols ?? {}) as [string, ICellData | undefined][]) {
      if (cell && cell.v !== undefined && cell.v !== null && cell.v !== '') {
        lastRow = Math.max(lastRow, Number(r))
        lastCol = Math.max(lastCol, Number(c))
      }
    }
  }
  for (const m of sheet?.mergeData ?? []) {
    lastRow = Math.max(lastRow, m.endRow)
    lastCol = Math.max(lastCol, m.endColumn)
  }
  if (range) return { firstRow: range.startRow, firstCol: range.startColumn, lastRow: Math.min(range.endRow, Math.max(lastRow, range.startRow)), lastCol: Math.min(range.endColumn, Math.max(lastCol, range.startColumn)) }
  return { firstRow: 0, firstCol: 0, lastRow, lastCol }
}

export function renderPrintHtml(data: IWorkbookData, sheetId: string, display: (row: number, col: number) => string, overlays: PrintOverlay[] = [], options: PrintOptions = {}): string {
  const sheet = data.sheets[sheetId]
  if (!sheet) return ''
  const cells = sheet.cellData ?? {}
  const merges: IRange[] = (sheet.mergeData ?? []).filter((m) => !options.range || (m.startRow >= options.range.startRow && m.endRow <= options.range.endRow && m.startColumn >= options.range.startColumn && m.endColumn <= options.range.endColumn))
  const { firstRow, firstCol, lastRow, lastCol } = usedRange(data, sheetId, options.range)
  // Charts print with the whole sheet only.
  if (options.range) overlays = []
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
    for (let c = firstCol; c <= lastCol; c++) total += width(c)
    html += `<table style="width:${total}px"><colgroup>`
    for (let c = firstCol; c <= lastCol; c++) html += `<col style="width:${width(c)}px">`
    html += '</colgroup>'
  }
  for (let r = firstRow; r <= lastRow; r++) {
    if (sheet.rowData?.[r]?.hd) continue
    const height = sheet.rowData?.[r]?.h ?? sheet.defaultRowHeight ?? DEFAULT_ROW_HEIGHT
    // The first row repeats on every page as the table header.
    const head = options.repeatHeader && r === firstRow
    html += `${head ? '<thead>' : ''}<tr style="height:${height}px">`
    for (let c = firstCol; c <= lastCol; c++) {
      if (covered.has(`${r}:${c}`)) continue
      const cell = cells[r]?.[c]
      const span = spans.get(`${r}:${c}`)
      const attrs = span ? ` rowspan="${span.endRow - span.startRow + 1}" colspan="${span.endColumn - span.startColumn + 1}"` : ''
      const css = cellCss(style(cell), typeof cell?.v === 'number')
      html += `<td${attrs}${css ? ` style="${css}"` : ''}>${escape(display(r, c))}</td>`
    }
    html += `</tr>${head ? '</thead>' : ''}`
  }
  if (lastRow >= 0) html += '</table>'
  const rowHeight = (r: number) => (sheet.rowData?.[r]?.hd ? 0 : (sheet.rowData?.[r]?.h ?? sheet.defaultRowHeight ?? DEFAULT_ROW_HEIGHT))
  for (const o of overlays) {
    let left = o.from.columnOffset
    let top = o.from.rowOffset
    for (let c = 0; c < o.from.column; c++) left += width(c)
    for (let r = 0; r < o.from.row; r++) top += rowHeight(r)
    html += `<div class="sheet-print-chart" style="left:${left}px;top:${top}px;width:${o.width}px;height:${o.height}px">${o.svg}</div>`
  }
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
