// Excel (.xlsx) import: ExcelJS workbook -> Univer workbook snapshot.

import * as ExcelJSModule from 'exceljs'
import JSZip from 'jszip'
import type { Alignment, Borders, Cell, Color, Fill, Font, Style, Workbook, Worksheet } from 'exceljs'
import type { ICellData, IColumnData, IRange, IRowData, IStyleData, IWorkbookData, IWorksheetData } from '@univerjs/presets'
import { CHART_COMPONENT, DRAWING_TYPE_DOM, DRAWING_TYPE_IMAGE } from '../charts/model'
import { DrawingCollector } from './drawings'
import { readXlsxCharts } from './xlsx-charts'

// The browser build of ExcelJS is a UMD bundle; Vite exposes it as a default export.
export const ExcelJS = ((ExcelJSModule as unknown as { default?: typeof ExcelJSModule }).default ?? ExcelJSModule) as typeof ExcelJSModule

// Univer enum values (inlined to avoid pulling the Univer runtime into the converter chunk).
export const T_STRING = 1
export const T_NUMBER = 2
export const T_BOOLEAN = 3
export const T_FORCE_STRING = 4
export const HYPERLINK_RANGE = 0
export const DV_RESOURCE = 'SHEET_DATA_VALIDATION_PLUGIN'

// Excel border style names, indexed by Univer's BorderStyleTypes.
export const BORDER_STYLES = [
  '',
  'thin',
  'hair',
  'dotted',
  'dashed',
  'dashDot',
  'dashDotDot',
  'double',
  'medium',
  'mediumDashed',
  'mediumDashDot',
  'mediumDashDotDot',
  'slantDashDot',
  'thick',
] as const

// Excel horizontal alignment names, indexed by Univer's HorizontalAlign.
export const H_ALIGN = ['', 'left', 'center', 'right', 'justify', 'justify', 'distributed'] as const
export const V_ALIGN = ['', 'top', 'middle', 'bottom'] as const

// Column widths: Excel stores characters of the default font's max digit width
// (7px at Calibri 11 / Arial 10), padding included. Row heights are points.
export const colWidthToPx = (w: number) => Math.round(w * 7)
export const pxToColWidth = (px: number) => Math.round((px / 7) * 1000) / 1000
export const ptToPx = (pt: number) => Math.round((pt * 96) / 72)
export const pxToPt = (px: number) => Math.round(px * 0.75 * 100) / 100

// Serial day of 1970-01-01 in the 1900 date system.
const EPOCH_SERIAL = 25569
const DAY_MS = 86400000

export function dateToSerial(d: Date): number {
  return Math.round((EPOCH_SERIAL + d.getTime() / DAY_MS) * 1e10) / 1e10
}

const MIN_ROWS = 1000
const MIN_COLS = 26

// Legacy indexed palette (indices 0-63).
const INDEXED = (
  '000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF 000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF ' +
  '800000 008000 000080 808000 800080 008080 C0C0C0 808080 9999FF 993366 FFFFCC CCFFFF 660066 FF8080 0066CC CCCCFF ' +
  '000080 FF00FF FFFF00 00FFFF 800080 800000 008080 0000FF 00CCFF CCFFFF CCFFCC FFFF99 99CCFF FF99CC CC99FF FFCC99 ' +
  '3366FF 33CCCC 99CC00 FFCC00 FF9900 FF6600 666699 969696 003366 339966 003300 333300 993300 993366 333399 333333'
).split(' ')

// Office default theme colors, in Excel's theme index order (lt1, dk1, lt2, dk2, accent1-6, hlink, folHlink).
const DEFAULT_THEME = 'FFFFFF 000000 E7E6E6 44546A 4472C4 ED7D31 A5A5A5 FFC000 5B9BD5 70AD47 0563C1 954F72'.split(' ')

function parseTheme(xml: string | undefined): string[] {
  if (!xml || typeof DOMParser === 'undefined') return DEFAULT_THEME
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const scheme = doc.getElementsByTagNameNS('*', 'clrScheme')[0]
  if (!scheme) return DEFAULT_THEME
  const byName: Record<string, string> = {}
  for (const el of Array.from(scheme.children)) {
    const c = el.firstElementChild
    const v = c?.getAttribute('lastClr') || c?.getAttribute('val')
    if (v && /^[0-9a-f]{6}$/i.test(v)) byName[el.localName] = v.toUpperCase()
  }
  const order = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']
  return order.map((n, i) => byName[n] || DEFAULT_THEME[i])
}

// Applies an Excel tint (-1..1) to a hex color through its HSL lightness.
function applyTint(hex: string, tint: number): string {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  let l = (max + min) / 2
  const d = max - min
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h /= 6
  }
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint
  const hue = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  let rgb: number[]
  if (!s) rgb = [l, l, l]
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    rgb = [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)]
  }
  return rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()
}

type XColor = Partial<Color> & { indexed?: number; tint?: number }

class Converter {
  styles: Record<string, IStyleData> = {}
  private styleIds = new Map<string, string>()
  private theme: string[]
  // Workbook default font (styles.xml font 0); cells only record differences from it.
  defaultFont: { ff?: string; fs?: number; cl?: string } = {}

  constructor(wb: Workbook, font?: DefaultFont) {
    this.theme = parseTheme((wb as unknown as { _themes?: Record<string, string> })._themes?.theme1)
    if (font) this.defaultFont = { ff: font.name, fs: font.size, cl: this.color(font.color) }
  }

  // Returns '#rrggbb', or undefined for automatic / unknown colors.
  color(c: XColor | undefined): string | undefined {
    if (!c) return undefined
    let hex: string | undefined
    if (typeof c.argb === 'string' && /^[0-9a-f]{6,8}$/i.test(c.argb)) hex = c.argb.slice(-6)
    else if (typeof c.theme === 'number') hex = this.theme[c.theme]
    else if (typeof c.indexed === 'number') hex = INDEXED[c.indexed]
    if (!hex) return undefined
    if (c.tint) hex = applyTint(hex, c.tint)
    return '#' + hex.toLowerCase()
  }

  styleData(st: Partial<Style> | undefined): IStyleData | undefined {
    if (!st) return undefined
    const s: IStyleData = {}
    this.font(st.font, s)
    const bg = this.fill(st.fill)
    if (bg) s.bg = { rgb: bg }
    const bd = this.border(st.border)
    if (bd) s.bd = bd
    this.alignment(st.alignment, s)
    if (st.numFmt && st.numFmt !== 'General') s.n = { pattern: st.numFmt }
    return Object.keys(s).length ? s : undefined
  }

  // Registers a style and returns its id (identical styles share one id).
  styleId(s: IStyleData | undefined): string | undefined {
    if (!s) return undefined
    const key = JSON.stringify(s)
    let id = this.styleIds.get(key)
    if (!id) {
      id = `s${this.styleIds.size + 1}`
      this.styleIds.set(key, id)
      this.styles[id] = s
    }
    return id
  }

  font(f: Partial<Font> | undefined, s: IStyleData) {
    if (!f) return
    const d = this.defaultFont
    if (f.name && f.name !== d.ff) s.ff = f.name
    if (f.size && f.size !== d.fs) s.fs = f.size
    if (f.bold) s.bl = 1
    if (f.italic) s.it = 1
    if (f.underline && f.underline !== 'none') s.ul = { s: 1, ...(/double/i.test(String(f.underline)) ? { t: 10 } : {}) }
    if (f.strike) s.st = { s: 1 }
    if (f.vertAlign === 'superscript') s.va = 3
    else if (f.vertAlign === 'subscript') s.va = 2
    const cl = this.color(f.color as XColor)
    if (cl && cl !== d.cl) s.cl = { rgb: cl }
  }

  fill(f: Fill | undefined): string | undefined {
    if (!f) return undefined
    if (f.type === 'pattern') {
      if (!f.pattern || f.pattern === 'none') return undefined
      // Solid fills use the foreground color; other patterns approximate to it too.
      return this.color(f.fgColor as XColor) ?? (f.pattern === 'solid' ? undefined : this.color(f.bgColor as XColor))
    }
    if (f.type === 'gradient') return this.color(f.stops?.[0]?.color as XColor)
    return undefined
  }

  border(b: Partial<Borders> | undefined): IStyleData['bd'] {
    if (!b) return undefined
    const out: NonNullable<IStyleData['bd']> = {}
    const side = (x: { style?: string; color?: Partial<Color> } | undefined) => {
      const s = x?.style ? BORDER_STYLES.indexOf(x.style as (typeof BORDER_STYLES)[number]) : -1
      if (s <= 0) return undefined
      return { s, cl: { rgb: this.color(x!.color as XColor) ?? '#000000' } }
    }
    const t = side(b.top)
    const bt = side(b.bottom)
    const l = side(b.left)
    const r = side(b.right)
    if (t) out.t = t
    if (bt) out.b = bt
    if (l) out.l = l
    if (r) out.r = r
    const d = side(b.diagonal)
    if (d && b.diagonal?.down) out.tl_br = d
    if (d && b.diagonal?.up) out.bl_tr = d
    return Object.keys(out).length ? out : undefined
  }

  alignment(a: Partial<Alignment> | undefined, s: IStyleData) {
    if (!a) return
    const h = { left: 1, center: 2, centerContinuous: 2, right: 3, justify: 4, fill: 1, distributed: 6 }[a.horizontal as string]
    if (h) s.ht = h
    const v = { top: 1, middle: 2, center: 2, bottom: 3, justify: 2, distributed: 2 }[a.vertical as string]
    if (v) s.vt = v
    if (a.wrapText) s.tb = 3
    const rot = a.textRotation
    if (rot === 'vertical' || rot === 255) s.tr = { a: 0, v: 1 }
    // ExcelJS maps Excel's 91-180 to -1..-90 (positive = counter-clockwise);
    // Univer's angle has the opposite sign.
    else if (typeof rot === 'number' && rot) s.tr = { a: -(rot > 90 ? 90 - rot : rot) }
  }
}

// Minimal cell document holding plain text with optional hyperlink / rich text runs.
export function cellDocument(text: string, runs?: { st: number; ed: number; ts: IStyleData }[], url?: string, linkId = 'link'): NonNullable<ICellData['p']> {
  return {
    id: 'd',
    documentStyle: {},
    body: {
      dataStream: text.replace(/\r?\n/g, '\r') + '\r\n',
      textRuns: runs,
      paragraphs: [{ startIndex: text.length }],
      ...(url
        ? {
            customRanges: [
              {
                startIndex: 0,
                endIndex: Math.max(0, text.length - 1),
                rangeId: linkId,
                rangeType: HYPERLINK_RANGE,
                properties: { url },
              },
            ],
          }
        : {}),
    },
  } as NonNullable<ICellData['p']>
}

type RichRun = { text: string; font?: Partial<Font> }

function isFormula(v: object): v is { formula?: string; sharedFormula?: string; result?: unknown } {
  return 'formula' in v || 'sharedFormula' in v
}

// Converts a scalar (formula result or plain value) into Univer v/t.
function scalar(v: unknown): Pick<ICellData, 'v' | 't'> | undefined {
  if (v === null || v === undefined) return undefined
  if (typeof v === 'number') return Number.isFinite(v) ? { v, t: T_NUMBER } : undefined
  if (typeof v === 'string') return { v, t: T_STRING }
  if (typeof v === 'boolean') return { v: v ? 1 : 0, t: T_BOOLEAN }
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : { v: dateToSerial(v), t: T_NUMBER }
  if (typeof v === 'object' && 'error' in v) return { v: String((v as { error: unknown }).error), t: T_STRING }
  return undefined
}

function hasVisibleStyle(st: Partial<Style>): boolean {
  const f = st.fill
  const filled = !!f && (f.type === 'gradient' || (f.type === 'pattern' && !!f.pattern && f.pattern !== 'none'))
  const b = st.border
  const bordered = !!b && ['top', 'bottom', 'left', 'right', 'diagonal'].some((k) => !!(b as Record<string, { style?: string }>)[k]?.style)
  return filled || bordered
}

// Maps an Excel sheet name reference (e.g. "Sheet2!A1") to a Univer link payload.
function linkPayload(target: string, sheetIds: Map<string, string>): string {
  const m = /^#?'?([^'!]+)'?!\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/i.exec(target)
  if (m && sheetIds.has(m[1])) {
    const range = m[4] ? `${m[2]}${m[3]}:${m[4]}${m[5]}` : `${m[2]}${m[3]}`
    return `#gid=${sheetIds.get(m[1])}&range=${range.toUpperCase()}`
  }
  return target
}

export async function importXlsx(buf: ArrayBuffer): Promise<Partial<IWorkbookData>> {
  const wb = new ExcelJS.Workbook()
  const norm = await normalize(buf)
  await wb.xlsx.load(norm.buf)
  const conv = new Converter(wb, norm.font)
  const sheetOrder: string[] = []
  const sheets: IWorkbookData['sheets'] = {}
  const dvRes: Record<string, unknown[]> = {}
  const worksheets = wb.worksheets
  const sheetIds = new Map(worksheets.map((ws, i) => [ws.name, `sheet-${i + 1}`]))

  worksheets.forEach((ws, i) => {
    const id = `sheet-${i + 1}`
    sheetOrder.push(id)
    const { sheet, dv } = convertSheet(ws, id, conv, sheetIds)
    for (const link of norm.links[i] || []) {
      const c = decodeCell(link.ref.split(':')[0])
      const cell = c && sheet.cellData?.[c.row]?.[c.col]
      if (!cell || cell.p || cell.f || cell.v === undefined || cell.v === null) continue
      cell.p = cellDocument(String(cell.v), undefined, linkPayload(link.location, sheetIds), `link-${ws.id}-${link.ref}`)
    }
    sheets[id] = sheet
    if (dv.length) dvRes[id] = dv
  })

  const resources: NonNullable<IWorkbookData['resources']> = []
  if (Object.keys(dvRes).length) resources.push({ name: DV_RESOURCE, data: JSON.stringify(dvRes) })

  // Floating images and native charts become Univer drawings anchored at the same cells.
  const drawings = new DrawingCollector(sheets)
  worksheets.forEach((ws, i) => {
    for (const image of ws.getImages()) {
      const media = wb.getImage(Number(image.imageId)) as { buffer?: ArrayBuffer; base64?: string; extension?: string }
      const base64 = media.base64 ?? (media.buffer ? bytesToBase64(new Uint8Array(media.buffer)) : '')
      const { tl, br, ext } = image.range as unknown as { tl: { nativeCol: number; nativeColOff: number; nativeRow: number; nativeRowOff: number }; br?: { nativeCol: number; nativeColOff: number; nativeRow: number; nativeRowOff: number }; ext?: { width: number; height: number } }
      if (!base64 || !tl || (!br && !ext)) continue
      const anchor = (a: typeof tl) => ({ column: a.nativeCol, columnOffset: Math.round(a.nativeColOff / 9525), row: a.nativeRow, rowOffset: Math.round(a.nativeRowOff / 9525) })
      const source = base64.startsWith('data:') ? base64 : `data:image/${media.extension === 'jpeg' ? 'jpeg' : media.extension ?? 'png'};base64,${base64}`
      drawings.add(`sheet-${i + 1}`, anchor(tl), br ? anchor(br) : { width: ext!.width, height: ext!.height }, { drawingType: DRAWING_TYPE_IMAGE, imageSourceType: 'URL', source })
    }
  })
  try {
    for (const chart of await readXlsxCharts(buf)) {
      const host = sheetIds.get(chart.hostSheet)
      const source = sheetIds.get(chart.sourceSheet)
      if (!host || !source) continue
      drawings.add(host, chart.from, chart.to, { drawingType: DRAWING_TYPE_DOM, componentKey: CHART_COMPONENT, allowTransform: true, data: { ...chart.spec, sheetId: source } })
    }
  } catch (err) {
    console.warn('Could not read the charts', err)
  }
  if (!drawings.empty) resources.push(drawings.resource())

  if (!sheetOrder.length) {
    sheetOrder.push('sheet-1')
    sheets['sheet-1'] = { id: 'sheet-1', name: 'Sheet1', rowCount: MIN_ROWS, columnCount: MIN_COLS, cellData: {} }
  }
  const { ff, fs, cl } = conv.defaultFont
  const defaultStyle: IStyleData = { ...(ff ? { ff } : {}), ...(fs ? { fs } : {}), ...(cl ? { cl: { rgb: cl } } : {}) }
  return {
    id: 'workbook',
    name: '',
    styles: conv.styles,
    sheetOrder,
    sheets,
    resources,
    ...(Object.keys(defaultStyle).length ? { defaultStyle } : {}),
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

type InternalLink = { ref: string; location: string }
type DefaultFont = { name?: string; size?: number; color?: XColor }

const attrOf = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]
const unescapeXml = (v: string) =>
  v.replace(/&(quot|apos|lt|gt|amp);/g, (_, e) => ({ quot: '"', apos: "'", lt: '<', gt: '>', amp: '&' })[e as 'quot']!)

// Rewrites XML that ExcelJS misreads: boolean attributes written as "true"/"false"
// (LibreOffice) and font flags explicitly turned off (<b val="0"/>). Also collects
// internal hyperlinks (location="Sheet!A1"), which ExcelJS drops, per sheet index.
async function normalize(buf: ArrayBuffer): Promise<{ buf: ArrayBuffer; links: InternalLink[][]; font?: DefaultFont }> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(buf)
  } catch {
    return { buf, links: [] }
  }
  let changed = false
  const linksByPath = new Map<string, InternalLink[]>()
  for (const path of Object.keys(zip.files)) {
    if (!/^xl\/(worksheets\/[^/]+|styles|sharedStrings)\.xml$/.test(path)) continue
    const xml = await zip.file(path)!.async('string')
    const fixed = xml
      .replace(/<sheetView\b[^>]*>/g, (tag) => tag.replace(/="true"/g, '="1"').replace(/="false"/g, '="0"'))
      .replace(/<(?:\w+:)?(?:b|i|strike|outline|shadow|condense|extend)\s+val="(?:false|0)"\s*\/>/g, '')
    if (fixed !== xml) {
      zip.file(path, fixed)
      changed = true
    }
    const links: InternalLink[] = []
    for (const tag of xml.match(/<(?:\w+:)?hyperlink\s[^>]*>/g) || []) {
      const ref = attrOf(tag, 'ref')
      const location = attrOf(tag, 'location')
      if (ref && location && !/\sr:id="/.test(tag)) links.push({ ref, location: unescapeXml(location) })
    }
    if (links.length) linksByPath.set(path, links)
  }
  const links: InternalLink[][] = []
  if (linksByPath.size) {
    const book = (await zip.file('xl/workbook.xml')?.async('string')) || ''
    const rels = (await zip.file('xl/_rels/workbook.xml.rels')?.async('string')) || ''
    const targets = new Map<string, string>()
    for (const tag of rels.match(/<(?:\w+:)?Relationship\s[^>]*>/g) || []) {
      const id = attrOf(tag, 'Id')
      const target = attrOf(tag, 'Target')
      if (id && target) targets.set(id, target.startsWith('/') ? target.slice(1) : 'xl/' + target)
    }
    for (const tag of book.match(/<(?:\w+:)?sheet\s[^>]*>/g) || []) {
      const rid = attrOf(tag, 'r:id')
      links.push((rid && linksByPath.get(targets.get(rid) || '')) || [])
    }
  }
  // Default font: the first <font> of styles.xml.
  let font: DefaultFont | undefined
  const styles = (await zip.file('xl/styles.xml')?.async('string')) || ''
  const f0 = /<(?:\w+:)?fonts\b[^>]*>\s*<(?:\w+:)?font\b[^>]*>([\s\S]*?)<\/(?:\w+:)?font>/.exec(styles)?.[1]
  if (f0) {
    const tagOf = (name: string) => new RegExp(`<(?:\\w+:)?${name}\\s[^>]*>`).exec(f0)?.[0]
    const sz = tagOf('sz')
    const nm = tagOf('name')
    const cl = tagOf('color')
    const color: XColor = {}
    if (cl) {
      const rgb = attrOf(cl, 'rgb')
      const theme = attrOf(cl, 'theme')
      const indexed = attrOf(cl, 'indexed')
      const tint = attrOf(cl, 'tint')
      if (rgb) color.argb = rgb
      else if (theme) color.theme = Number(theme)
      else if (indexed) color.indexed = Number(indexed)
      if (tint) color.tint = Number(tint)
    }
    font = {
      name: nm ? unescapeXml(attrOf(nm, 'val') || '') || undefined : undefined,
      size: sz ? Number(attrOf(sz, 'val')) || undefined : undefined,
      color: cl ? color : undefined,
    }
  }
  return { buf: changed ? await zip.generateAsync({ type: 'arraybuffer' }) : buf, links, font }
}

function convertSheet(ws: Worksheet, id: string, conv: Converter, sheetIds: Map<string, string>) {
  const cellData: Record<number, Record<number, ICellData>> = {}
  const rowData: Record<number, Partial<IRowData>> = {}
  const columnData: Record<number, Partial<IColumnData>> = {}
  let maxRow = 0
  let maxCol = 0

  const props = ws.properties as Partial<Worksheet['properties']> & { defaultColWidth?: number }
  const defaultRowHeight = ptToPx(props.defaultRowHeight || 15)
  const defaultColumnWidth = props.defaultColWidth ? colWidthToPx(props.defaultColWidth) : 64

  // Columns
  const cols = ws.columns || []
  cols.forEach((col, i) => {
    if (!col) return
    const cd: Partial<IColumnData> = {}
    if (col.width !== undefined && Math.abs(colWidthToPx(col.width) - defaultColumnWidth) >= 1) cd.w = colWidthToPx(col.width)
    if (col.hidden) cd.hd = 1
    const s = conv.styleId(conv.styleData(col.style))
    if (s) cd.s = s
    if (Object.keys(cd).length) {
      columnData[i] = cd
      maxCol = Math.max(maxCol, i + 1)
    }
  })

  // Rows and cells
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const r = rowNumber - 1
    const rd: Partial<IRowData> = {}
    if (row.height && Math.abs(ptToPx(row.height) - defaultRowHeight) >= 1) rd.h = ptToPx(row.height)
    if (row.hidden) rd.hd = 1
    const rs = conv.styleId(conv.styleData((row as unknown as { style?: Partial<Style> }).style))
    if (rs) rd.s = rs
    if (Object.keys(rd).length) {
      rowData[r] = rd
      maxRow = Math.max(maxRow, rowNumber)
    }
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const cd = convertCell(cell, conv, sheetIds)
      if (!cd) return
      ;(cellData[r] ||= {})[colNumber - 1] = cd
      maxRow = Math.max(maxRow, rowNumber)
      maxCol = Math.max(maxCol, colNumber)
    })
  })

  // Merges
  const mergeData: IRange[] = []
  for (const ref of ws.model.merges || []) {
    const rg = decodeRange(ref)
    if (!rg) continue
    mergeData.push(rg)
    maxRow = Math.max(maxRow, rg.endRow + 1)
    maxCol = Math.max(maxCol, rg.endColumn + 1)
  }

  // Views: frozen panes, gridlines, zoom, direction
  const view = (ws.views?.[0] || {}) as Partial<{
    state: string
    xSplit: number
    ySplit: number
    topLeftCell: string
    showGridLines: boolean
    zoomScale: number
    rightToLeft: boolean
  }>
  const freeze = { xSplit: 0, ySplit: 0, startRow: -1, startColumn: -1 }
  if (view.state === 'frozen' && (view.xSplit || view.ySplit)) {
    const xSplit = Math.max(0, Math.round(view.xSplit || 0))
    const ySplit = Math.max(0, Math.round(view.ySplit || 0))
    const tl = view.topLeftCell ? decodeCell(view.topLeftCell) : undefined
    freeze.xSplit = xSplit
    freeze.ySplit = ySplit
    freeze.startRow = ySplit ? Math.max(ySplit, tl?.row ?? ySplit) : -1
    freeze.startColumn = xSplit ? Math.max(xSplit, tl?.col ?? xSplit) : -1
  }

  const sheet: Partial<IWorksheetData> = {
    id,
    name: ws.name,
    rowCount: Math.max(MIN_ROWS, maxRow + 100),
    columnCount: Math.max(MIN_COLS, maxCol + 10),
    defaultColumnWidth,
    defaultRowHeight,
    cellData,
    rowData,
    columnData,
    mergeData,
    freeze,
    hidden: ws.state === 'hidden' || ws.state === 'veryHidden' ? 1 : 0,
    showGridlines: view.showGridLines === false ? 0 : 1,
  }
  const tab = conv.color(props.tabColor as XColor)
  if (tab) sheet.tabColor = tab
  if (view.zoomScale && view.zoomScale !== 100) sheet.zoomRatio = view.zoomScale / 100
  if (view.rightToLeft) sheet.rightToLeft = 1

  return { sheet, dv: dataValidations(ws) }
}

function convertCell(cell: Cell, conv: Converter, sheetIds: Map<string, string>): ICellData | undefined {
  const st = cell.style as Partial<Style> | undefined
  const out: ICellData = {}
  const value = cell.value as unknown
  const isSlave = cell.isMerged && cell.master !== cell
  const styleData = conv.styleData(st)

  if (!isSlave && value !== null && value !== undefined) {
    if (typeof value === 'object' && !(value instanceof Date)) {
      const obj = value as Record<string, unknown>
      if (isFormula(obj)) {
        const f = cell.formula
        if (f) out.f = '=' + f.replace(/^=/, '')
        Object.assign(out, scalar(obj.result))
      } else if (Array.isArray(obj.richText)) {
        const runs = obj.richText as RichRun[]
        const text = runs.map((r) => r.text).join('')
        out.v = text
        out.t = T_STRING
        if (runs.length > 1 || runs.some((r) => r.font)) {
          let pos = 0
          const textRuns = runs
            .map((r) => {
              const ts: IStyleData = {}
              conv.font(r.font, ts)
              const run = { st: pos, ed: pos + r.text.length, ts }
              pos += r.text.length
              return run
            })
            .filter((r) => r.ed > r.st && Object.keys(r.ts).length)
          if (textRuns.length) out.p = cellDocument(text, textRuns)
        }
      } else if (typeof obj.hyperlink === 'string') {
        const text = typeof obj.text === 'string' ? obj.text : Array.isArray((obj.text as { richText?: RichRun[] })?.richText) ? (obj.text as { richText: RichRun[] }).richText.map((r) => r.text).join('') : String(obj.hyperlink)
        out.v = text
        out.t = T_STRING
        out.p = cellDocument(text, undefined, linkPayload(obj.hyperlink, sheetIds), `link-${cell.worksheet.id}-${cell.address}`)
      } else Object.assign(out, scalar(value))
    } else Object.assign(out, scalar(value))
  }

  const hasValue = out.v !== undefined || out.f !== undefined
  if (styleData && (hasValue || (st && hasVisibleStyle(st)) || isSlave)) out.s = conv.styleId(styleData)
  // Keep numbers typed as text in the file as text.
  if (out.t === T_STRING && st?.numFmt === '@') out.t = T_FORCE_STRING
  return Object.keys(out).length ? out : undefined
}

// Excel data validation -> Univer rules. ExcelJS expands ranges to one entry per
// cell sharing the same object, so cells are regrouped into rectangles.
function dataValidations(ws: Worksheet): unknown[] {
  const model = (ws as unknown as { dataValidations?: { model?: Record<string, Record<string, unknown> | undefined> } }).dataValidations?.model
  if (!model) return []
  const groups = new Map<Record<string, unknown>, { row: number; col: number }[]>()
  for (const [addr, dv] of Object.entries(model)) {
    if (!dv) continue
    const c = decodeCell(addr)
    if (!c) continue
    const list = groups.get(dv) || []
    list.push(c)
    groups.set(dv, list)
  }
  const rules: unknown[] = []
  let n = 0
  for (const [dv, cells] of groups) {
    const type = String(dv.type || 'any')
    if (!['list', 'whole', 'decimal', 'date', 'time', 'textLength', 'custom'].includes(type)) continue
    const formulae = (dv.formulae as unknown[] | undefined) || []
    const fx = (v: unknown) => {
      if (v === undefined || v === null) return undefined
      if (v instanceof Date) return String(dateToSerial(v))
      return String(v)
    }
    let formula1 = fx(formulae[0])
    const formula2 = type === 'list' || type === 'custom' ? undefined : fx(formulae[1])
    if (type === 'list' && formula1 !== undefined) {
      const quoted = /^"(.*)"$/s.exec(formula1)
      formula1 = quoted ? quoted[1].replace(/""/g, '"') : '=' + formula1.replace(/^=/, '')
    } else if (type === 'custom' && formula1 !== undefined) formula1 = '=' + formula1.replace(/^=/, '')
    const errorStyle = { stop: 1, warning: 2, information: 0 }[String(dv.errorStyle || 'stop')] ?? 1
    rules.push({
      uid: `dv-${ws.id}-${++n}`,
      type,
      ranges: toRanges(cells),
      ...(formula1 !== undefined ? { formula1 } : {}),
      ...(formula2 !== undefined ? { formula2 } : {}),
      ...(dv.operator && type !== 'list' && type !== 'custom' ? { operator: dv.operator } : {}),
      allowBlank: dv.allowBlank !== false,
      showDropDown: true,
      showErrorMessage: !!dv.showErrorMessage,
      showInputMessage: !!dv.showInputMessage,
      errorStyle,
      ...(dv.error ? { error: String(dv.error) } : {}),
      ...(dv.errorTitle ? { errorTitle: String(dv.errorTitle) } : {}),
      ...(dv.prompt ? { prompt: String(dv.prompt) } : {}),
      ...(dv.promptTitle ? { promptTitle: String(dv.promptTitle) } : {}),
    })
  }
  return rules
}

// Groups cells into rectangles: horizontal runs per row, then stacked vertically.
function toRanges(cells: { row: number; col: number }[]): IRange[] {
  cells.sort((a, b) => a.row - b.row || a.col - b.col)
  const runs: IRange[] = []
  for (const c of cells) {
    const last = runs[runs.length - 1]
    if (last && last.startRow === c.row && last.endColumn === c.col - 1) last.endColumn = c.col
    else runs.push({ startRow: c.row, endRow: c.row, startColumn: c.col, endColumn: c.col })
  }
  const out: IRange[] = []
  for (const r of runs) {
    const prev = out.find((o) => o.endRow === r.startRow - 1 && o.startColumn === r.startColumn && o.endColumn === r.endColumn)
    if (prev) prev.endRow = r.endRow
    else out.push(r)
  }
  return out
}

export function decodeCell(addr: string): { row: number; col: number } | undefined {
  const m = /^\$?([A-Z]{1,3})\$?(\d+)$/i.exec(addr.trim())
  if (!m) return undefined
  let col = 0
  for (const ch of m[1].toUpperCase()) col = col * 26 + ch.charCodeAt(0) - 64
  return { row: Number(m[2]) - 1, col: col - 1 }
}

function decodeRange(ref: string): IRange | undefined {
  const [a, b] = ref.split(':')
  const s = decodeCell(a)
  const e = decodeCell(b || a)
  if (!s || !e) return undefined
  return {
    startRow: Math.min(s.row, e.row),
    endRow: Math.max(s.row, e.row),
    startColumn: Math.min(s.col, e.col),
    endColumn: Math.max(s.col, e.col),
  }
}
