// Excel (.xlsx) export: Univer workbook snapshot -> ExcelJS workbook.

import type { Alignment, Borders, CellValue, DataValidation, Font, Style, Worksheet } from 'exceljs'
import type { IBorderStyleData, ICellData, IStyleData, IWorkbookData, IWorksheetData } from '@univerjs/presets'
import JSZip from 'jszip'
import { escapeXml, toHex } from '../../../core/formats'
import {
  BORDER_STYLES,
  DV_RESOURCE,
  ExcelJS,
  H_ALIGN,
  HYPERLINK_RANGE,
  pxToColWidth,
  pxToPt,
  T_BOOLEAN,
  T_NUMBER,
  V_ALIGN,
} from './xlsx-import'
import { addXlsxCharts, type XlsxChart } from './xlsx-charts'
import { DRAWING_TYPE_IMAGE, snapshotCharts, snapshotDrawings, snapshotValue } from '../charts/model'

type StyleRef = IStyleData | string | null | undefined

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const MAX_ROWS = 1048576
const MAX_COLS = 16384

export function encodeCol(col: number): string {
  let s = ''
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

const encodeCell = (row: number, col: number) => `${encodeCol(col)}${row + 1}`

function decodeCol(s: string): number {
  let col = 0
  for (const ch of s.toUpperCase()) col = col * 26 + ch.charCodeAt(0) - 64
  return col - 1
}

// Shifts the relative references of an A1 formula by (dr, dc), as when a
// shared formula is filled from its origin cell. String literals and quoted
// sheet names are left untouched.
export function shiftFormula(formula: string, dr: number, dc: number): string {
  if (!dr && !dc) return formula
  const shiftRow = (abs: string, row: string) => {
    const r = abs ? Number(row) : Number(row) + dr
    return r < 1 || r > MAX_ROWS ? null : `${abs}${r}`
  }
  const shiftCol = (abs: string, col: string) => {
    const c = abs ? decodeCol(col) : decodeCol(col) + dc
    return c < 0 || c >= MAX_COLS ? null : `${abs}${encodeCol(c)}`
  }
  return formula
    .split(/("(?:[^"]|"")*"|'(?:[^']|'')*')/)
    .map((part, i) => {
      if (i % 2) return part
      return (
        part
          // Cell references: A1, $A$1, Sheet1!B2
          .replace(/(^|[^A-Za-z0-9_.$])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![A-Za-z0-9_(.])/g, (m, pre, ac, col, ar, row) => {
            const c = shiftCol(ac, col)
            const r = shiftRow(ar, row)
            return c && r ? `${pre}${c}${r}` : `${pre}#REF!`
          })
          // Whole columns: A:C
          .replace(/(^|[^A-Za-z0-9_.$])(\$?)([A-Z]{1,3}):(\$?)([A-Z]{1,3})(?![A-Za-z0-9_(])/g, (m, pre, a1, c1, a2, c2) => {
            const x = shiftCol(a1, c1)
            const y = shiftCol(a2, c2)
            return x && y ? `${pre}${x}:${y}` : `${pre}#REF!`
          })
          // Whole rows: 1:3
          .replace(/(^|[^A-Za-z0-9_.$:])(\$?)(\d+):(\$?)(\d+)(?![\d.:A-Za-z])/g, (m, pre, a1, r1, a2, r2) => {
            const x = shiftRow(a1, r1)
            const y = shiftRow(a2, r2)
            return x && y ? `${pre}${x}:${y}` : `${pre}#REF!`
          })
      )
    })
    .join('')
}

const argb = (c: unknown) => {
  const hex = toHex(c)
  return hex ? 'FF' + hex.slice(1).toUpperCase() : undefined
}

// Merges style layers (later wins); borders merge per side.
function compose(...layers: (IStyleData | undefined)[]): IStyleData | undefined {
  let out: IStyleData | undefined
  for (const l of layers) {
    if (!l) continue
    const bd = out?.bd && l.bd ? { ...out.bd, ...l.bd } : (l.bd ?? out?.bd)
    out = { ...out, ...l }
    if (bd) out.bd = bd
  }
  return out
}

function fontOf(s: IStyleData): Partial<Font> | undefined {
  const f: Partial<Font> = {}
  if (s.ff) f.name = s.ff
  if (s.fs) f.size = s.fs
  if (s.bl) f.bold = true
  if (s.it) f.italic = true
  if (s.ul?.s) f.underline = s.ul.t === 10 ? 'double' : true
  if (s.st?.s) f.strike = true
  if (s.va === 3) f.vertAlign = 'superscript'
  else if (s.va === 2) f.vertAlign = 'subscript'
  const cl = argb(s.cl?.rgb)
  if (cl) f.color = { argb: cl }
  return Object.keys(f).length ? f : undefined
}

function toExcelStyle(s: IStyleData | undefined): Partial<Style> | undefined {
  if (!s) return undefined
  const out: Partial<Style> = {}
  const font = fontOf(s)
  if (font) out.font = font
  const bg = argb(s.bg?.rgb)
  if (bg) out.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg }, bgColor: { indexed: 64 } as never }
  if (s.bd) {
    const b: Partial<Borders> = {}
    const side = (x: IBorderStyleData | null | undefined | void) => {
      const style = x && x.s ? BORDER_STYLES[x.s] : undefined
      return style ? { style, color: { argb: argb(x!.cl?.rgb) ?? 'FF000000' } } : undefined
    }
    const sides = { top: side(s.bd.t), bottom: side(s.bd.b), left: side(s.bd.l), right: side(s.bd.r) }
    for (const [k, v] of Object.entries(sides)) if (v) (b as Record<string, unknown>)[k] = v
    const down = side(s.bd.tl_br)
    const up = side(s.bd.bl_tr)
    if (down || up) b.diagonal = { ...(down || up)!, up: !!up, down: !!down }
    if (Object.keys(b).length) out.border = b
  }
  const al: Partial<Alignment> = {}
  const h = s.ht ? H_ALIGN[s.ht] : ''
  if (h) al.horizontal = h
  const v = s.vt ? V_ALIGN[s.vt] : ''
  if (v) al.vertical = v
  if (s.tb === 3) al.wrapText = true
  if (s.tr?.v) al.textRotation = 'vertical'
  // ExcelJS takes -90..90 (positive = counter-clockwise, the opposite of Univer).
  else if (s.tr?.a) al.textRotation = -Math.max(-90, Math.min(90, Math.round(s.tr.a)))
  if (Object.keys(al).length) out.alignment = al
  if (s.n?.pattern) out.numFmt = s.n.pattern
  return Object.keys(out).length ? out : undefined
}

function sanitizeName(name: string, used: Set<string>): string {
  let base = (name || 'Sheet').replace(/[*?:/\\[\]]/g, '_').replace(/^'+|'+$/g, '').slice(0, 31) || 'Sheet'
  if (base === 'History') base = 'History_'
  let out = base
  for (let i = 2; used.has(out.toLowerCase()); i++) out = `${base.slice(0, 31 - String(i).length - 1)}_${i}`
  used.add(out.toLowerCase())
  return out
}

function cellText(cell: ICellData): string | undefined {
  const ds = cell.p?.body?.dataStream
  if (typeof ds !== 'string') return undefined
  return ds.replace(/\r\n$/, '').replace(/\r/g, '\n')
}

export async function exportXlsx(data: IWorkbookData): Promise<Blob> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Ofimeo'
  wb.created = new Date()
  const styles = data.styles || {}
  const resolve = (s: StyleRef): IStyleData | undefined => (typeof s === 'string' ? styles[s] || undefined : s || undefined)
  const sheetIds = (data.sheetOrder || Object.keys(data.sheets)).filter((id) => data.sheets[id])
  const used = new Set<string>()
  const names = new Map(sheetIds.map((id) => [id, sanitizeName(data.sheets[id].name || id, used)]))
  const rules = parseResource(data, DV_RESOURCE)
  const drawings = snapshotDrawings(data.resources)

  // Excel needs at least one visible sheet, which must also be the active one.
  const visible = sheetIds.filter((id) => !data.sheets[id].hidden)
  const forceVisible = visible.length ? undefined : sheetIds[0]

  for (const id of sheetIds) {
    const sheet = data.sheets[id]
    const ws = wb.addWorksheet(names.get(id)!, {
      state: sheet.hidden && id !== forceVisible ? 'hidden' : 'visible',
    })
    writeSheet(ws, sheet, resolve(data.defaultStyle as StyleRef), resolve, names)
    addImages(wb, ws, sheet, drawings.filter((d) => d.hostSheetId === id && d.drawingType === DRAWING_TYPE_IMAGE))
    for (const rule of (rules[id] as DvRule[] | undefined) || []) addValidation(ws, rule)
  }
  if (!sheetIds.length) wb.addWorksheet('Sheet1')

  const active = Math.max(0, sheetIds.indexOf(visible[0] ?? forceVisible ?? sheetIds[0]))
  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: active, activeTab: active, visibility: 'visible' }]

  const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer
  // Charts are written as native DrawingML charts after ExcelJS.
  const charts = snapshotCharts(data.resources).flatMap((c) => {
    const host = sheetIds.indexOf(c.hostSheetId)
    const source = data.sheets[c.spec.sheetId]
    if (host < 0 || !source) return []
    const chart: XlsxChart & { sheetIndex: number } = {
      sheetIndex: host + 1,
      spec: c.spec,
      sourceName: names.get(c.spec.sheetId)!,
      value: (r, col) => snapshotValue(source.cellData as never, r, col),
      from: c.from,
      to: c.to,
    }
    return [chart]
  })
  return new Blob([await postProcess(buf, resolve(data.defaultStyle as StyleRef), charts)], { type: XLSX_MIME })
}

function writeSheet(
  ws: Worksheet,
  sheet: Partial<IWorksheetData>,
  bookDefault: IStyleData | undefined,
  resolve: (s: StyleRef) => IStyleData | undefined,
  names: Map<string, string>,
) {
  const defaultRowHeight = sheet.defaultRowHeight || 24
  const defaultColumnWidth = sheet.defaultColumnWidth || 88
  const sheetDefault = compose(bookDefault, resolve(sheet.defaultStyle as StyleRef))
  ws.properties.defaultRowHeight = pxToPt(defaultRowHeight)
  ;(ws.properties as { defaultColWidth?: number }).defaultColWidth = pxToColWidth(defaultColumnWidth)
  const tab = argb(sheet.tabColor)
  if (tab) ws.properties.tabColor = { argb: tab }

  // Views
  const fz = sheet.freeze
  const xSplit = fz && fz.xSplit > 0 ? fz.xSplit : 0
  const ySplit = fz && fz.ySplit > 0 ? fz.ySplit : 0
  const common = {
    showGridLines: sheet.showGridlines !== 0,
    ...(sheet.zoomRatio && sheet.zoomRatio !== 1 ? { zoomScale: Math.round(sheet.zoomRatio * 100) } : {}),
    ...(sheet.rightToLeft ? { rightToLeft: true } : {}),
  }
  if (xSplit || ySplit) {
    const top = ySplit ? Math.max(ySplit, fz!.startRow) : 0
    const left = xSplit ? Math.max(xSplit, fz!.startColumn) : 0
    ws.views = [{ state: 'frozen', xSplit, ySplit, topLeftCell: encodeCell(top, left), ...common }]
  } else ws.views = [{ state: 'normal', ...common } as never]

  // Columns
  const colStyles = new Map<number, IStyleData>()
  for (const [k, cd] of Object.entries(sheet.columnData || {})) {
    const c = Number(k)
    if (!cd || c >= MAX_COLS) continue
    const col = ws.getColumn(c + 1)
    col.width = pxToColWidth(cd.w ?? defaultColumnWidth)
    if (cd.hd) col.hidden = true
    const st = resolve(cd.s as StyleRef)
    if (st) {
      colStyles.set(c, st)
      const xs = toExcelStyle(compose(sheetDefault, st))
      if (xs) col.style = xs as Style
    }
  }

  // Rows
  const rowStyles = new Map<number, IStyleData>()
  for (const [k, rd] of Object.entries(sheet.rowData || {})) {
    const r = Number(k)
    if (!rd || r >= MAX_ROWS) continue
    const hasHeight = rd.h !== undefined && Math.abs(rd.h - defaultRowHeight) >= 1
    const st = resolve(rd.s as StyleRef)
    if (!hasHeight && !rd.hd && !st) continue
    const row = ws.getRow(r + 1)
    // ExcelJS only writes rows that have cells or a height.
    row.height = pxToPt(hasHeight ? rd.h! : defaultRowHeight)
    if (rd.hd) row.hidden = true
    if (st) {
      rowStyles.set(r, st)
      const xs = toExcelStyle(compose(sheetDefault, st))
      if (xs) (row as unknown as { style: Partial<Style> }).style = xs
    }
  }

  // Merges (before values, so slave cells are known)
  const slaves = new Set<string>()
  for (const m of sheet.mergeData || []) {
    if (m.endRow < m.startRow || m.endColumn < m.startColumn) continue
    if (m.endRow === m.startRow && m.endColumn === m.startColumn) continue
    try {
      ws.mergeCellsWithoutStyle(m.startRow + 1, m.startColumn + 1, m.endRow + 1, m.endColumn + 1)
      for (let r = m.startRow; r <= m.endRow; r++)
        for (let c = m.startColumn; c <= m.endColumn; c++) if (r !== m.startRow || c !== m.startColumn) slaves.add(`${r}:${c}`)
    } catch {
      // Overlapping merges are skipped.
    }
  }

  // Shared formulas: cells with `si` but no `f` reuse the formula of the cell defining that id.
  const cellData = (sheet.cellData || {}) as Record<string, Record<string, ICellData | undefined> | undefined>
  const shared = new Map<string, { f: string; row: number; col: number }>()
  for (const [rk, row] of Object.entries(cellData)) {
    for (const [ck, cell] of Object.entries(row || {})) {
      if (cell?.si && cell.f) shared.set(cell.si, { f: cell.f, row: Number(rk), col: Number(ck) })
    }
  }

  for (const [rk, row] of Object.entries(cellData)) {
    const r = Number(rk)
    if (r >= MAX_ROWS) continue
    for (const [ck, cell] of Object.entries(row || {})) {
      const c = Number(ck)
      if (!cell || c >= MAX_COLS) continue
      const own = resolve(cell.s as StyleRef)
      const style = compose(sheetDefault, rowStyles.get(r), colStyles.get(c), own)
      const xc = ws.getCell(r + 1, c + 1)
      const xs = toExcelStyle(style)
      if (xs) xc.style = xs as Style
      else if (rowStyles.has(r) || colStyles.has(c)) xc.style = {}
      if (slaves.has(`${r}:${c}`)) continue
      const value = cellValue(cell, r, c, shared, style, names)
      if (value !== undefined) xc.value = value
    }
  }
}

function cellValue(
  cell: ICellData,
  row: number,
  col: number,
  shared: Map<string, { f: string; row: number; col: number }>,
  style: IStyleData | undefined,
  names: Map<string, string>,
): CellValue | undefined {
  let f = cell.f || undefined
  if (!f && cell.si) {
    const origin = shared.get(cell.si)
    if (origin) f = shiftFormula(origin.f, row - origin.row, col - origin.col)
  }
  const text = cellText(cell)
  const v = cell.v ?? text
  const t = cell.t
  let result: CellValue | undefined
  if (v === null || v === undefined || v === '') result = undefined
  else if (t === T_BOOLEAN || typeof v === 'boolean') {
    result = typeof v === 'string' ? /^true$/i.test(v) || v === '1' : !!v
  } else if (t === T_NUMBER || (t === undefined && typeof v === 'number')) {
    const n = typeof v === 'number' ? v : Number(v)
    result = Number.isFinite(n) && String(v).trim() !== '' ? n : String(v)
  } else result = String(v)

  if (f) {
    const formula = f.replace(/^=/, '')
    if (typeof result === 'string' && /^#(NULL!|DIV\/0!|VALUE!|REF!|NAME\?|NUM!|N\/A|SPILL!|CALC!)$/.test(result)) {
      return { formula, result: { error: result } } as CellValue
    }
    return (result === undefined ? { formula } : { formula, result }) as CellValue
  }

  const body = cell.p?.body
  const link = body?.customRanges?.find((r) => r.rangeType === HYPERLINK_RANGE && r.properties?.url)
  if (link && typeof result === 'string') {
    return { text: result, hyperlink: linkTarget(String(link.properties!.url), names) } as CellValue
  }
  if (body?.textRuns?.length && typeof result === 'string' && text !== undefined) {
    return { richText: richText(text, body.textRuns, style) } as CellValue
  }
  return result
}

// Fixes up ExcelJS output:
// - the workbook default font (styles.xml font 0) follows the snapshot's default style;
// - internal links (location="Sheet!A1") are written with an extra external
//   relationship pointing at the same text, which Excel would follow, so it is dropped.
async function postProcess(buf: ArrayBuffer, defaultStyle: IStyleData | undefined, charts: (XlsxChart & { sheetIndex: number })[]): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(buf)
  let changed = charts.length > 0
  await addXlsxCharts(zip, charts)
  const font = defaultStyle && fontOf(defaultStyle)
  const styles = font && (await zip.file('xl/styles.xml')?.async('string'))
  if (font && styles) {
    const xml =
      '<font>' +
      (font.bold ? '<b/>' : '') +
      (font.italic ? '<i/>' : '') +
      `<sz val="${font.size ?? 11}"/>` +
      (font.color?.argb ? `<color rgb="${font.color.argb}"/>` : '') +
      `<name val="${escapeXml(font.name ?? 'Calibri')}"/><family val="2"/></font>`
    zip.file('xl/styles.xml', styles.replace(/(<fonts\b[^>]*>)\s*<font>[\s\S]*?<\/font>/, `$1${xml}`))
    changed = true
  }
  for (const path of Object.keys(zip.files)) {
    const m = /^xl\/worksheets\/([^/]+\.xml)$/.exec(path)
    if (!m) continue
    const xml = await zip.file(path)!.async('string')
    if (!xml.includes(' location="')) continue
    const ids: string[] = []
    const fixed = xml.replace(/<hyperlink\s[^>]*location="[^>]*>/g, (tag) =>
      tag.replace(/\sr:id="([^"]*)"/, (_, id: string) => {
        ids.push(id)
        return ''
      }),
    )
    if (!ids.length) continue
    zip.file(path, fixed)
    const relsPath = `xl/worksheets/_rels/${m[1]}.rels`
    const rels = await zip.file(relsPath)?.async('string')
    if (rels) {
      const cleaned = rels.replace(/<Relationship\s[^>]*>/g, (tag) => (ids.some((id) => tag.includes(`Id="${id}"`)) ? '' : tag))
      zip.file(relsPath, cleaned)
    }
    changed = true
  }
  return changed ? zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' }) : buf
}

// Univer internal links (#gid=<sheetId>&range=A1) become "Sheet!A1" locations.
function linkTarget(url: string, names: Map<string, string>): string {
  const m = /^#gid=([^&]+)(?:&range=([A-Z]+\d+(?::[A-Z]+\d+)?))?/i.exec(url)
  if (m && names.has(m[1])) {
    const name = names.get(m[1])!
    const quoted = /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`
    return `${quoted}!${(m[2] || 'A1').split(':')[0]}`
  }
  return url
}

function richText(text: string, runs: { st: number; ed: number; ts?: IStyleData }[], base: IStyleData | undefined) {
  const out: { text: string; font?: Partial<Font> }[] = []
  const sorted = [...runs].sort((a, b) => a.st - b.st)
  let pos = 0
  const push = (end: number, ts?: IStyleData) => {
    if (end <= pos) return
    const font = fontOf(compose(base, ts) || {})
    out.push({ text: text.slice(pos, end), ...(font ? { font } : {}) })
    pos = end
  }
  for (const r of sorted) {
    const st = Math.max(pos, Math.min(r.st, text.length))
    push(st)
    push(Math.min(r.ed, text.length), r.ts)
  }
  push(text.length)
  return out
}

type DvRule = {
  type: string
  ranges: { startRow: number; endRow: number; startColumn: number; endColumn: number }[]
  formula1?: string
  formula2?: string
  operator?: string
  allowBlank?: boolean
  showErrorMessage?: boolean
  showInputMessage?: boolean
  errorStyle?: number
  error?: string
  errorTitle?: string
  prompt?: string
  promptTitle?: string
}

function parseResource(data: IWorkbookData, name: string): Record<string, unknown[]> {
  const res = data.resources?.find((r) => r.name === name)
  if (!res?.data) return {}
  try {
    return JSON.parse(res.data) || {}
  } catch {
    return {}
  }
}

function listOptions(formula: string): string[] {
  try {
    const arr = JSON.parse(formula)
    if (Array.isArray(arr)) return arr.map(String).filter(Boolean)
  } catch {
    // Comma-separated list.
  }
  return formula
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function addValidation(ws: Worksheet, rule: DvRule) {
  let type = rule.type
  if (type === 'listMultiple') type = 'list'
  if (!['list', 'whole', 'decimal', 'date', 'time', 'textLength', 'custom'].includes(type)) return
  const fx = (f: string | undefined) => {
    if (f === undefined || f === '') return undefined
    if (f.startsWith('=')) return f.slice(1)
    if (type === 'list') return `"${listOptions(f).join(',').replace(/"/g, '""')}"`
    if (type === 'date' && !/^-?[\d.]+$/.test(f)) {
      const d = Date.parse(f.includes('T') ? f : f + 'T00:00:00Z')
      if (!Number.isNaN(d)) return String(25569 + d / 86400000)
    }
    return f
  }
  const formulae = [fx(rule.formula1), fx(rule.formula2)].filter((x): x is string => x !== undefined)
  if (!formulae.length && type !== 'custom') return
  const dv = {
    type,
    formulae,
    allowBlank: rule.allowBlank !== false,
    showErrorMessage: !!rule.showErrorMessage,
    showInputMessage: !!rule.showInputMessage,
    errorStyle: (['information', 'stop', 'warning'] as const)[rule.errorStyle ?? 1] ?? 'stop',
    ...(rule.operator && type !== 'list' && type !== 'custom' ? { operator: rule.operator } : {}),
    ...(rule.error ? { error: rule.error } : {}),
    ...(rule.errorTitle ? { errorTitle: rule.errorTitle } : {}),
    ...(rule.prompt ? { prompt: rule.prompt } : {}),
    ...(rule.promptTitle ? { promptTitle: rule.promptTitle } : {}),
  } as DataValidation
  const dvs = (ws as unknown as { dataValidations: { add(addr: string, dv: DataValidation): void } }).dataValidations
  for (const r of rule.ranges || []) {
    const a = encodeCell(r.startRow, r.startColumn)
    const b = encodeCell(Math.min(r.endRow, MAX_ROWS - 1), Math.min(r.endColumn, MAX_COLS - 1))
    dvs.add(a === b ? a : `${a}:${b}`, dv)
  }
}

// Floating images (data: URLs) anchored at their cells; linked (http) images are skipped.
function addImages(wb: InstanceType<typeof ExcelJS.Workbook>, ws: Worksheet, sheet: Partial<IWorksheetData>, images: ReturnType<typeof snapshotDrawings>) {
  const colWidth = (c: number) => sheet.columnData?.[c]?.w ?? sheet.defaultColumnWidth ?? 88
  const rowHeight = (r: number) => sheet.rowData?.[r]?.h ?? sheet.defaultRowHeight ?? 24
  for (const img of images) {
    const m = /^data:image\/(png|jpe?g|gif);base64,(.+)$/i.exec(String(img.raw.source ?? ''))
    if (!m) continue
    const extension = m[1].toLowerCase() === 'jpg' ? 'jpeg' : (m[1].toLowerCase() as 'png' | 'jpeg' | 'gif')
    const imageId = wb.addImage({ base64: m[2], extension })
    ws.addImage(imageId, {
      tl: { col: img.from.column + img.from.columnOffset / colWidth(img.from.column), row: img.from.row + img.from.rowOffset / rowHeight(img.from.row) } as never,
      ext: { width: img.transform.width, height: img.transform.height },
      editAs: 'oneCell',
    })
  }
}
