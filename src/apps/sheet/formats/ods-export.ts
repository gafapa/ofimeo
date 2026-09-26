// OpenDocument Spreadsheet (.ods) export from a Univer workbook snapshot.

import JSZip from 'jszip'
import type { IBorderStyleData, ICellData, IStyleData, IWorkbookData, IWorksheetData } from '@univerjs/presets'
import { escapeXml, toHex } from '../../../core/formats'
import { DRAWING_TYPE_IMAGE, isChartSpec, normalizeSpec, snapshotDrawings, type CellAnchor } from '../charts/model'
import { odsChartContent, odsChartFrame, odsChartManifest, odsImageFrame } from './ods-charts'

const MIME = 'application/vnd.oasis.opendocument.spreadsheet'

const NS = [
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
  'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"',
  'xmlns:number="urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0"',
  'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
  'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"',
  'xmlns:of="urn:oasis:names:tc:opendocument:xmlns:of:1.2"',
  'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"',
  'xmlns:xlink="http://www.w3.org/1999/xlink"',
  'xmlns:dc="http://purl.org/dc/elements/1.1/"',
  'xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"',
  'xmlns:tableooo="http://openoffice.org/2009/table"',
  'xmlns:loext="urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0"',
  'xmlns:calcext="urn:org:documentfoundation:names:experimental:calc:xmlns:calcext:1.0"',
].join(' ')

const DEFAULT_FONT = 'Arial'
const DEFAULT_FONT_PT = 11
const DEFAULT_COL_PX = 88
const DEFAULT_ROW_PX = 24
const MAX_COLUMNS = 16_384
const DAY_MS = 86_400_000
const ERRORS = new Set(['#NULL!', '#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#N/A', '#SPILL!', '#CALC!'])
const EPOCH_1899 = Date.UTC(1899, 11, 30)

export async function exportOds(data: IWorkbookData): Promise<Blob> {
  const writer = new ContentWriter(data)
  const zip = new JSZip()
  // Charts and images: frames in each table's <table:shapes>, positioned in the sheet.
  const drawings = snapshotDrawings(data.resources)
  const manifestExtra: string[] = []
  let objects = 0
  const shapes = (id: string): string => {
    const sheet = data.sheets[id]
    const colWidth = (c: number) => sheet.columnData?.[c]?.w ?? sheet.defaultColumnWidth ?? DEFAULT_COL_PX
    const rowHeight = (r: number) => sheet.rowData?.[r]?.h ?? sheet.defaultRowHeight ?? DEFAULT_ROW_PX
    const pos = (a: CellAnchor) => {
      let x = a.columnOffset
      let y = a.rowOffset
      for (let c = 0; c < a.column; c++) x += colWidth(c)
      for (let r = 0; r < a.row; r++) y += rowHeight(r)
      return { x, y }
    }
    let xml = ''
    for (const d of drawings.filter((d) => d.hostSheetId === id)) {
      const { x, y } = pos(d.from)
      const { width, height } = d.transform
      if (isChartSpec(d.raw.data)) {
        const spec = normalizeSpec(d.raw.data)
        const source = data.sheets[spec.sheetId]
        if (!source) continue
        const n = ++objects
        zip.file(`Object ${n}/content.xml`, odsChartContent(spec, source.name || 'Sheet', width, height))
        manifestExtra.push(odsChartManifest(n))
        xml += odsChartFrame(n, spec.title || `Chart ${n}`, x, y, width, height)
      } else if (d.drawingType === DRAWING_TYPE_IMAGE) {
        const m = /^data:image\/(png|jpe?g|gif|svg\+xml);base64,(.+)$/i.exec(String(d.raw.source ?? ''))
        if (!m) continue
        const n = ++objects
        const ext = m[1].toLowerCase().replace('jpeg', 'jpg').replace('svg+xml', 'svg')
        const path = `Pictures/image${n}.${ext}`
        zip.file(path, m[2], { base64: true })
        manifestExtra.push(`<manifest:file-entry manifest:full-path="${path}" manifest:media-type="image/${m[1].toLowerCase()}"/>`)
        xml += odsImageFrame(n, path, x, y, width, height)
      }
    }
    return xml ? `<table:shapes>${xml}</table:shapes>` : ''
  }
  const body = data.sheetOrder
    .filter((id) => data.sheets[id])
    .map((id) => {
      const table = writer.table(data.sheets[id])
      const extra = shapes(id)
      return extra ? table.replace(/^(<table:table [^>]*>)/, `$1${extra}`) : table
    })
    .join('')

  // The mimetype entry must be first and uncompressed.
  zip.file('mimetype', MIME, { compression: 'STORE' })
  zip.file(
    'content.xml',
    `<?xml version="1.0" encoding="UTF-8"?>` +
      `<office:document-content ${NS} office:version="1.3">` +
      `<office:font-face-decls>${writer.fontDecls()}</office:font-face-decls>` +
      `<office:automatic-styles>${writer.automaticStyles()}</office:automatic-styles>` +
      `<office:body><office:spreadsheet>${body}</office:spreadsheet></office:body>` +
      `</office:document-content>`,
  )
  zip.file('styles.xml', stylesXml(writer.fontDecls()))
  zip.file('meta.xml', metaXml())
  zip.file('settings.xml', settingsXml(data))
  zip.file('META-INF/manifest.xml', manifestXml().replace('</manifest:manifest>', `${manifestExtra.join('')}</manifest:manifest>`))
  return zip.generateAsync({ type: 'blob', mimeType: MIME, compression: 'DEFLATE' })
}

// ---------------------------------------------------------------------------
// content.xml

type CellKind = 'float' | 'percentage' | 'currency' | 'date' | 'time'

class ContentWriter {
  private fonts = new Set<string>([DEFAULT_FONT])
  private cellStyles = new Map<string, string>()
  private cellStyleXml: string[] = []
  private dataStyles = new Map<string, { name: string; kind: CellKind | 'boolean' | 'text'; currency?: string }>()
  private dataStyleXml: string[] = []
  private colStyles = new Map<number, string>()
  private rowStyles = new Map<number, string>()
  private tableStyles: string[] = []

  constructor(private data: IWorkbookData) {}

  fontDecls(): string {
    return [...this.fonts]
      .map((f) => `<style:font-face style:name="${escapeXml(f)}" svg:font-family="${escapeXml(/\s/.test(f) ? `'${f}'` : f)}"/>`)
      .join('')
  }

  automaticStyles(): string {
    const cols = [...this.colStyles].map(
      ([px, name]) =>
        `<style:style style:name="${name}" style:family="table-column"><style:table-column-properties fo:break-before="auto" style:column-width="${inches(px)}"/></style:style>`,
    )
    const rows = [...this.rowStyles].map(
      ([px, name]) =>
        `<style:style style:name="${name}" style:family="table-row"><style:table-row-properties style:row-height="${inches(px)}" fo:break-before="auto" style:use-optimal-row-height="false"/></style:style>`,
    )
    return [...cols, ...rows, ...this.tableStyles, ...this.dataStyleXml, ...this.cellStyleXml].join('')
  }

  // Resolves a style reference (id or inline object) from a snapshot.
  private styleOf(s: ICellData['s']): IStyleData | undefined {
    if (!s) return undefined
    return typeof s === 'string' ? (this.data.styles[s] ?? undefined) : s
  }

  table(sheet: Partial<IWorksheetData>): string {
    const name = sheet.name || 'Sheet'
    const tableStyle = `ta${this.tableStyles.length + 1}`
    const tab = toHex(sheet.tabColor)
    this.tableStyles.push(
      `<style:style style:name="${tableStyle}" style:family="table" style:master-page-name="Default">` +
        `<style:table-properties table:display="${sheet.hidden ? 'false' : 'true'}" style:writing-mode="${sheet.rightToLeft ? 'rl-tb' : 'lr-tb'}"` +
        (tab ? ` tableooo:tab-color="${tab}"` : '') +
        `/></style:style>`,
    )

    const cellData = sheet.cellData ?? {}
    const rowData = sheet.rowData ?? {}
    const columnData = sheet.columnData ?? {}
    const defaultWidth = sheet.defaultColumnWidth || DEFAULT_COL_PX
    const defaultHeight = sheet.defaultRowHeight || DEFAULT_ROW_PX

    // Merges: top-left cell → span; other cells are covered.
    const spans = new Map<string, { rows: number; cols: number }>()
    const covered = new Set<string>()
    let lastRow = -1
    let lastCol = -1
    for (const m of sheet.mergeData ?? []) {
      if (m.endRow < m.startRow || m.endColumn < m.startColumn) continue
      spans.set(`${m.startRow},${m.startColumn}`, { rows: m.endRow - m.startRow + 1, cols: m.endColumn - m.startColumn + 1 })
      for (let r = m.startRow; r <= m.endRow; r++)
        for (let c = m.startColumn; c <= m.endColumn; c++) if (r !== m.startRow || c !== m.startColumn) covered.add(`${r},${c}`)
      lastRow = Math.max(lastRow, m.endRow)
      lastCol = Math.max(lastCol, m.endColumn)
    }
    for (const [r, row] of Object.entries(cellData)) {
      for (const [c, cell] of Object.entries(row ?? {})) {
        if (!cell || isEmptyCell(cell)) continue
        lastRow = Math.max(lastRow, +r)
        lastCol = Math.max(lastCol, +c)
      }
    }
    for (const [r, rd] of Object.entries(rowData)) if (rd && (rd.hd || rd.h || rd.s)) lastRow = Math.max(lastRow, +r)

    // Columns: every column up to the sheet width, grouped into runs.
    const columnCount = Math.min(MAX_COLUMNS, Math.max(sheet.columnCount ?? 26, lastCol + 1, 1))
    let columns = ''
    let run: { xml: string; n: number } | null = null
    const flushCol = () => {
      if (run) columns += run.xml.replace('/>', run.n > 1 ? ` table:number-columns-repeated="${run.n}"/>` : '/>')
    }
    const colStyles: Array<IStyleData | undefined> = []
    const sheetStyle = this.styleOf(sheet.defaultStyle as ICellData['s'])
    const columnXml = (width: number, hidden: boolean, style: IStyleData | undefined) =>
      `<table:table-column table:style-name="${this.colStyle(width)}"` +
      (hidden ? ` table:visibility="collapse"` : '') +
      ` table:default-cell-style-name="${style ? this.cellStyle(style) : 'Default'}"/>`
    const plainColumn = columnXml(defaultWidth, false, sheetStyle)
    // With a sheet default style, the columns run to the sheet's end so it covers them all.
    const columnEnd = sheetStyle ? MAX_COLUMNS : columnCount
    for (let c = 0; c < columnEnd; c++) {
      const cd = c < columnCount ? columnData[c] : undefined
      const own = this.styleOf(cd?.s)
      const colStyle = sheetStyle && own ? { ...sheetStyle, ...own } : (own ?? sheetStyle)
      if (c < columnCount) colStyles[c] = colStyle
      const xml = cd ? columnXml(cd.w ?? defaultWidth, !!cd.hd, colStyle) : plainColumn
      if (run && run.xml === xml) run.n++
      else {
        flushCol()
        run = { xml, n: 1 }
      }
    }
    flushCol()

    // Rows up to the last used one.
    let rows = ''
    let rowRun: { xml: string; n: number } | null = null
    const flushRow = () => {
      if (!rowRun) return
      rows += rowRun.n > 1 ? rowRun.xml.replace('<table:table-row', `<table:table-row table:number-rows-repeated="${rowRun.n}"`) : rowRun.xml
      rowRun = null
    }
    const colSpan = Math.max(lastCol + 1, 1)
    for (let r = 0; r <= lastRow; r++) {
      const rd = rowData[r]
      const ownRowStyle = this.styleOf(rd?.s)
      const rowStyle = ownRowStyle && sheetStyle ? { ...sheetStyle, ...ownRowStyle } : ownRowStyle
      // Manual heights only (ia = 1 means the row follows its content).
      const h = rd?.h && rd.ia !== 1 && Math.abs(rd.h - defaultHeight) >= 0.5 ? rd.h : undefined
      let attrs = h ? ` table:style-name="${this.rowStyle(h)}"` : ''
      if (rd?.hd) attrs += ` table:visibility="collapse"`

      const row = cellData[r] ?? {}
      let cells = ''
      let pending: { xml: string; n: number } | null = null
      const flushCell = () => {
        if (!pending) return
        cells += pending.n > 1 ? pending.xml.replace(/^<table:(covered-)?table-cell/, (m) => `${m} table:number-columns-repeated="${pending!.n}"`) : pending.xml
        pending = null
      }
      for (let c = 0; c < colSpan; c++) {
        const key = `${r},${c}`
        const cell = row[c]
        let xml: string
        if (covered.has(key)) xml = '<table:covered-table-cell/>'
        else {
          // Univer layers cell styles over row and column styles; ODF cell styles replace them.
          // Row styles are written on each cell (LibreOffice mishandles row default styles).
          const own = this.styleOf(cell?.s)
          const style = own && (rowStyle || colStyles[c]) ? { ...colStyles[c], ...rowStyle, ...own } : own || (rowStyle && { ...colStyles[c], ...rowStyle })
          xml = this.cell(cell, style, spans.get(key))
        }
        if (pending && pending.xml === xml && !xml.includes('<text:p')) pending.n++
        else {
          flushCell()
          pending = { xml, n: 1 }
        }
      }
      // Trailing empty cells carry no information.
      if (pending && (pending as { xml: string }).xml === '<table:table-cell/>') pending = null
      flushCell()
      // A styled row extends to the sheet's end, as LibreOffice writes it.
      if (rowStyle) cells += `<table:table-cell table:style-name="${this.cellStyle(rowStyle)}" table:number-columns-repeated="${MAX_COLUMNS - colSpan}"/>`
      const xml = `<table:table-row${attrs}>${cells || '<table:table-cell/>'}</table:table-row>`
      if (rowRun && rowRun.xml === xml && !xml.includes('office:value') && !xml.includes('<text:p')) rowRun.n++
      else {
        flushRow()
        rowRun = { xml, n: 1 }
      }
    }
    flushRow()
    if (!rows) rows = '<table:table-row><table:table-cell/></table:table-row>'

    return `<table:table table:name="${escapeXml(name)}" table:style-name="${tableStyle}">${columns}${rows}</table:table>`
  }

  private cell(cell: ICellData | undefined, style: IStyleData | undefined, span?: { rows: number; cols: number }): string {
    let attrs = ''
    let content = ''
    const pattern = style?.n?.pattern
    const formula = typeof cell?.f === 'string' && cell.f.startsWith('=') ? cell.f : null
    // Rich text cells keep their content in `p`.
    let v = cell?.v
    const rich = cell?.p ? richText(cell.p) : ''
    if (rich && !formula) v = rich
    let dataStyle: string | undefined

    if (formula) attrs += ` table:formula="${escapeXml('of:' + excelFormulaToOdf(formula))}"`
    if (v !== undefined && v !== null && v !== '') {
      if (cell?.t === 3 || typeof v === 'boolean') {
        const b = v === true || v === 1 || String(v).toUpperCase() === 'TRUE' || v === '1'
        attrs += ` office:value-type="boolean" office:boolean-value="${b}"`
        content = b ? 'TRUE' : 'FALSE'
        if (!pattern) dataStyle = this.dataStyle('BOOLEAN')?.name
      } else if (typeof v === 'number' || (cell?.t === 2 && v !== '' && Number.isFinite(Number(v)))) {
        const n = Number(v)
        const ds = pattern ? this.dataStyle(pattern) : undefined
        const kind = ds && ds.kind !== 'boolean' && ds.kind !== 'text' ? ds.kind : 'float'
        if (kind === 'date') {
          const iso = serialToIso(n)
          attrs += ` office:value-type="date" office:date-value="${iso}"`
          content = iso
        } else if (kind === 'time') {
          attrs += ` office:value-type="time" office:time-value="${serialToDuration(n)}"`
          content = String(n)
        } else {
          attrs += ` office:value-type="${kind}"` + (kind === 'currency' && ds?.currency ? ` office:currency="${ds.currency}"` : '') + ` office:value="${n}"`
          content = String(n)
        }
      } else {
        const s = String(v)
        if (formula && ERRORS.has(s)) attrs += ` office:value-type="string" office:string-value="" calcext:value-type="error"`
        else attrs += ` office:value-type="string"` + (formula ? ` office:string-value="${escapeXml(s)}"` : '')
        content = s
      }
    } else if (formula) {
      attrs += ` office:value-type="string" office:string-value=""`
    }

    const styleName = style || dataStyle ? this.cellStyle(style ?? {}, dataStyle) : undefined
    let xml = '<table:table-cell'
    if (styleName && styleName !== 'Default') xml += ` table:style-name="${styleName}"`
    xml += attrs
    if (span && (span.rows > 1 || span.cols > 1)) xml += ` table:number-columns-spanned="${span.cols}" table:number-rows-spanned="${span.rows}"`
    if (!content && !attrs) return xml + '/>'
    return xml + '>' + paragraphs(content) + '</table:table-cell>'
  }

  private colStyle(px: number): string {
    const key = Math.round(px * 100) / 100
    let name = this.colStyles.get(key)
    if (!name) this.colStyles.set(key, (name = `co${this.colStyles.size + 1}`))
    return name
  }

  private rowStyle(px: number): string {
    const key = Math.round(px * 100) / 100
    let name = this.rowStyles.get(key)
    if (!name) this.rowStyles.set(key, (name = `ro${this.rowStyles.size + 1}`))
    return name
  }

  // Automatic cell style for a Univer style; 'Default' when it has no properties.
  private cellStyle(s: IStyleData, dataStyleName?: string): string {
    const cellProps: string[] = []
    const paraProps: string[] = []
    const textProps: string[] = []

    const bg = toHex(s.bg?.rgb)
    if (bg) cellProps.push(`fo:background-color="${bg}"`)
    for (const [key, side] of [['t', 'top'], ['b', 'bottom'], ['l', 'left'], ['r', 'right']] as const) {
      const b = border(s.bd?.[key])
      if (b) cellProps.push(`fo:border-${side}="${b}"`)
    }
    const tlbr = border(s.bd?.tl_br)
    if (tlbr) cellProps.push(`style:diagonal-tl-br="${tlbr}"`)
    const bltr = border(s.bd?.bl_tr)
    if (bltr) cellProps.push(`style:diagonal-bl-tr="${bltr}"`)
    if (s.tb === 3) cellProps.push('fo:wrap-option="wrap"')
    const vt = { 1: 'top', 2: 'middle', 3: 'bottom' }[s.vt as number]
    if (vt) cellProps.push(`style:vertical-align="${vt}"`)
    if (s.tr?.v) cellProps.push('style:direction="ttb"')
    else if (s.tr?.a) cellProps.push(`style:rotation-angle="${((-s.tr.a % 360) + 360) % 360}"`)
    const ht = { 1: 'start', 2: 'center', 3: 'end', 4: 'justify', 5: 'justify', 6: 'justify' }[s.ht as number]
    if (ht) {
      cellProps.push('style:text-align-source="fix"', 'style:repeat-content="false"')
      paraProps.push(`fo:text-align="${ht}"`)
    }

    if (s.ff) {
      this.fonts.add(s.ff)
      textProps.push(`style:font-name="${escapeXml(s.ff)}"`)
    }
    if (s.fs) textProps.push(`fo:font-size="${s.fs}pt"`, `style:font-size-asian="${s.fs}pt"`, `style:font-size-complex="${s.fs}pt"`)
    if (s.bl !== undefined && s.bl !== null) {
      const w = s.bl ? 'bold' : 'normal'
      textProps.push(`fo:font-weight="${w}"`, `style:font-weight-asian="${w}"`, `style:font-weight-complex="${w}"`)
    }
    if (s.it !== undefined && s.it !== null) {
      const it = s.it ? 'italic' : 'normal'
      textProps.push(`fo:font-style="${it}"`, `style:font-style-asian="${it}"`, `style:font-style-complex="${it}"`)
    }
    if (s.ul?.s) {
      textProps.push(
        'style:text-underline-style="solid"',
        `style:text-underline-type="${s.ul.t === 10 ? 'double' : 'single'}"`,
        'style:text-underline-width="auto"',
        'style:text-underline-color="font-color"',
      )
    }
    if (s.st?.s) textProps.push('style:text-line-through-style="solid"', 'style:text-line-through-type="single"')
    const cl = toHex(s.cl?.rgb)
    if (cl) textProps.push(`fo:color="${cl}"`)
    if (s.va === 2) textProps.push('style:text-position="sub 58%"')
    else if (s.va === 3) textProps.push('style:text-position="super 58%"')

    const pattern = s.n?.pattern
    const ds = dataStyleName ?? (pattern ? this.dataStyle(pattern)?.name : undefined)
    if (!cellProps.length && !paraProps.length && !textProps.length && !ds) return 'Default'

    const key = JSON.stringify([cellProps, paraProps, textProps, ds])
    let name = this.cellStyles.get(key)
    if (name) return name
    name = `ce${this.cellStyles.size + 1}`
    this.cellStyles.set(key, name)
    this.cellStyleXml.push(
      `<style:style style:name="${name}" style:family="table-cell" style:parent-style-name="Default"${ds ? ` style:data-style-name="${ds}"` : ''}>` +
        (cellProps.length ? `<style:table-cell-properties ${cellProps.join(' ')}/>` : '') +
        (paraProps.length ? `<style:paragraph-properties ${paraProps.join(' ')}/>` : '') +
        (textProps.length ? `<style:text-properties ${textProps.join(' ')}/>` : '') +
        `</style:style>`,
    )
    return name
  }

  // Data style for a number format pattern (undefined for "General").
  private dataStyle(pattern: string) {
    const cached = this.dataStyles.get(pattern)
    if (cached) return cached
    const name = `N${this.dataStyles.size + 1}`
    const built = buildDataStyle(pattern, name)
    if (!built) return undefined
    const entry = { name, kind: built.kind, currency: built.currency }
    this.dataStyles.set(pattern, entry)
    this.dataStyleXml.push(built.xml)
    return entry
  }
}

function isEmptyCell(cell: ICellData): boolean {
  return (cell.v === undefined || cell.v === null || cell.v === '') && !cell.f && !cell.p && !cell.s
}

// Plain text of a Univer rich-text cell.
function richText(p: ICellData['p']): string {
  const stream = (p || undefined)?.body?.dataStream ?? ''
  return stream.replace(/\r\n$/, '').replace(/\r/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
}

// Text → <text:p> paragraphs, preserving runs of spaces and tabs.
function paragraphs(text: string): string {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => {
      const body = escapeXml(line)
        .replace(/\t/g, '<text:tab/>')
        .replace(/ {2,}/g, (m) => ` <text:s text:c="${m.length - 1}"/>`)
        .replace(/^ /, '<text:s/>')
      return `<text:p>${body}</text:p>`
    })
    .join('')
}

function inches(px: number): string {
  return `${(Math.round((px / 96) * 10000) / 10000).toString()}in`
}

const BORDER_STYLES: Record<number, string> = {
  1: '0.74pt solid',
  2: '0.26pt solid',
  3: '0.74pt dotted',
  4: '0.74pt dashed',
  5: '0.74pt dash-dot',
  6: '0.74pt dash-dot-dot',
  7: '2.01pt double',
  8: '1.76pt solid',
  9: '1.76pt dashed',
  10: '1.76pt dash-dot',
  11: '1.76pt dash-dot-dot',
  12: '1.76pt dash-dot',
  13: '2.49pt solid',
}

function border(value: IBorderStyleData | null | undefined | void): string | undefined {
  const b = value || undefined
  if (!b || !b.s) return undefined
  const style = BORDER_STYLES[b.s]
  return style ? `${style} ${toHex(b.cl?.rgb) ?? '#000000'}` : undefined
}

export function serialToIso(serial: number): string {
  const iso = new Date(Math.round(serial * DAY_MS) + EPOCH_1899).toISOString()
  const time = iso.slice(11, 23).replace(/\.?0+$/, '')
  return time === '00:00:00' || time === '00:00' ? iso.slice(0, 10) : `${iso.slice(0, 10)}T${time}`
}

export function serialToDuration(serial: number): string {
  const total = Math.round(Math.abs(serial) * 86400 * 1000) / 1000
  const h = Math.floor(total / 3600)
  const m = Math.floor((total - h * 3600) / 60)
  const s = Math.round((total - h * 3600 - m * 60) * 1000) / 1000
  const pad = (n: number) => String(n).padStart(2, '0')
  const secs = Number.isInteger(s) ? pad(s) : pad(Math.floor(s)) + String(s % 1 ? s.toFixed(3) : '').slice(-4).replace(/0+$/, '')
  return `${serial < 0 ? '-' : ''}PT${pad(h)}H${pad(m)}M${secs}S`
}

// ---------------------------------------------------------------------------
// Formulas: Excel syntax ("=SUM(A1:A3,Sheet2!B1)") → OpenFormula ("=SUM([.A1:.A3];[$Sheet2.B1])").

// Functions that ODF files carry with the COM.MICROSOFT. prefix.
const MS_FUNCTIONS = new Set([
  'CONCAT', 'TEXTJOIN', 'IFS', 'SWITCH', 'MAXIFS', 'MINIFS', 'XLOOKUP', 'XMATCH', 'FILTER', 'SORT', 'SORTBY', 'UNIQUE',
  'SEQUENCE', 'RANDARRAY', 'LET', 'FORECAST.LINEAR', 'CEILING.MATH', 'FLOOR.MATH', 'CEILING.PRECISE', 'FLOOR.PRECISE',
])

const SHEET = `(?:'(?:[^']|'')+'|[A-Za-z_\\u00a1-\\uffff][\\w.\\u00a1-\\uffff]*)`
const CELL = `\\$?[A-Za-z]{1,3}\\$?\\d+`
const AREA = `(?:${CELL}(?::${CELL})?|\\$?[A-Za-z]{1,3}:\\$?[A-Za-z]{1,3}|\\$?\\d+:\\$?\\d+)`
const REF_RE = new RegExp(`(?:(${SHEET})(?::(${SHEET}))?!)?(${AREA})(?![\\w(!.])`, 'y')

export function excelFormulaToOdf(formula: string): string {
  const s = formula.startsWith('=') ? formula : '=' + formula
  let out = ''
  let braces = 0
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    const prev = s[i - 1] || ''
    if (ch === '"') {
      let j = i + 1
      while (j < s.length && !(s[j] === '"' && s[j + 1] !== '"')) j += s[j] === '"' ? 2 : 1
      out += s.slice(i, j + 1)
      i = j + 1
      continue
    }
    if (ch === '{' || ch === '}') {
      braces += ch === '{' ? 1 : -1
      out += ch
      i++
      continue
    }
    if (ch === ',') {
      out += ';'
      i++
      continue
    }
    if (ch === ';' && braces > 0) {
      out += '|'
      i++
      continue
    }
    if (!/[\w.$¡-￿]/.test(prev)) {
      REF_RE.lastIndex = i
      const m = REF_RE.exec(s)
      if (m && (m[1] || m[3])) {
        out += odfRef(m[1], m[2], m[3])
        i = REF_RE.lastIndex
        continue
      }
      const id = /^[A-Za-z_][\w.]*/.exec(s.slice(i))
      if (id) {
        const name = id[0]
        i += name.length
        if (s[i] === '(') out += functionToOdf(name)
        else if (/^(TRUE|FALSE)$/i.test(name)) out += name.toUpperCase() + '()'
        else out += name
        continue
      }
    }
    out += ch
    i++
  }
  return out
}

function functionToOdf(name: string): string {
  let n = name.replace(/^_xlfn\./i, '').replace(/^_xlws\./i, '')
  if (MS_FUNCTIONS.has(n.toUpperCase())) n = 'COM.MICROSOFT.' + n
  return n
}

function odfRef(sheet: string | undefined, sheet2: string | undefined, area: string): string {
  const [a, b] = area.split(':')
  const first = (sheet ? '$' + odfSheet(sheet) : '') + '.' + a
  if (b === undefined) return `[${first}]`
  return `[${first}:${sheet2 ? '$' + odfSheet(sheet2) : ''}.${b}]`
}

function odfSheet(name: string): string {
  const raw = name.startsWith("'") ? name.slice(1, -1).replace(/''/g, "'") : name
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(raw) ? raw : `'${raw.replace(/'/g, "''")}'`
}

// ---------------------------------------------------------------------------
// Number format patterns → number:*-style data styles

interface Token {
  type: 'text' | 'num' | 'frac' | 'date' | 'color' | 'cond' | 'currency' | 'at' | 'elapsed' | 'ampm'
  value: string
}

const COLORS: Record<string, string> = {
  black: '#000000',
  blue: '#0000ff',
  cyan: '#00ffff',
  green: '#00ff00',
  magenta: '#ff00ff',
  red: '#ff0000',
  white: '#ffffff',
  yellow: '#ffff00',
}

const CURRENCY_CODES: Record<string, string> = { $: 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR', '₩': 'KRW', CHF: 'CHF' }

function splitSections(pattern: string): string[] {
  const out: string[] = []
  let cur = ''
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]
    if (ch === '"') {
      const j = pattern.indexOf('"', i + 1)
      const end = j < 0 ? pattern.length : j
      cur += pattern.slice(i, end + 1)
      i = end
    } else if (ch === '\\') {
      cur += pattern.slice(i, i + 2)
      i++
    } else if (ch === '[') {
      const j = pattern.indexOf(']', i)
      const end = j < 0 ? pattern.length : j
      cur += pattern.slice(i, end + 1)
      i = end
    } else if (ch === ';') {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

function tokenize(section: string): Token[] {
  const tokens: Token[] = []
  const text = (t: string) => {
    const last = tokens[tokens.length - 1]
    if (last?.type === 'text') last.value += t
    else tokens.push({ type: 'text', value: t })
  }
  let i = 0
  while (i < section.length) {
    const ch = section[i]
    const rest = section.slice(i)
    let m: RegExpExecArray | null
    if (ch === '"') {
      const j = section.indexOf('"', i + 1)
      const end = j < 0 ? section.length : j
      text(section.slice(i + 1, end))
      i = end + 1
    } else if (ch === '\\') {
      text(section[i + 1] ?? '')
      i += 2
    } else if (ch === '_') {
      text(' ')
      i += 2
    } else if (ch === '*') {
      i += 2
    } else if (ch === '[') {
      const j = section.indexOf(']', i)
      const inner = section.slice(i + 1, j < 0 ? section.length : j)
      i = j < 0 ? section.length : j + 1
      if (COLORS[inner.toLowerCase()]) tokens.push({ type: 'color', value: COLORS[inner.toLowerCase()] })
      else if (/^(>=|<=|<>|=|>|<)-?[\d.]+$/.test(inner)) tokens.push({ type: 'cond', value: inner })
      else if (/^(h+|m+|s+)$/i.test(inner)) tokens.push({ type: 'elapsed', value: inner.toLowerCase() })
      else if (inner.startsWith('$')) {
        const sym = inner.slice(1).split('-')[0]
        if (sym) tokens.push({ type: 'currency', value: sym })
      }
    } else if ((m = /^(AM\/PM|A\/P)/i.exec(rest))) {
      tokens.push({ type: 'ampm', value: m[0] })
      i += m[0].length
    } else if ((m = /^(y+|m+|d+|h+|s+|e+)/i.exec(rest))) {
      tokens.push({ type: 'date', value: m[0].toLowerCase() })
      i += m[0].length
    } else if ((m = /^(General)/i.exec(rest))) {
      tokens.push({ type: 'num', value: 'General' })
      i += m[0].length
    } else if ((m = /^(?:[#0?,]+ +)?[#0?]+\/(?:[#0?]+|\d+)/.exec(rest))) {
      tokens.push({ type: 'frac', value: m[0] })
      i += m[0].length
    } else if ((m = /^[0#?,.]*[0#?][0#?,.]*(?:[eE][+-][0#?]+)?/.exec(rest)) && m[0]) {
      tokens.push({ type: 'num', value: m[0] })
      i += m[0].length
    } else if (ch === '@') {
      tokens.push({ type: 'at', value: '@' })
      i++
    } else if (ch === '$' || ch === '€' || ch === '£' || ch === '¥') {
      tokens.push({ type: 'currency', value: ch })
      i++
    } else {
      text(ch)
      i++
    }
  }
  // A '.' followed by zeros right after seconds is the fractional seconds part.
  for (let k = 0; k < tokens.length - 1; k++) {
    const t = tokens[k]
    const next = tokens[k + 1]
    if (t.type === 'date' && t.value.startsWith('s') && next.type === 'num' && /^\.0+$/.test(next.value)) {
      t.value += next.value
      tokens.splice(k + 1, 1)
    }
  }
  return tokens
}

type Kind = CellKind | 'boolean' | 'text'

function sectionKind(tokens: Token[]): Kind {
  const dates = tokens.filter((t) => t.type === 'date' || t.type === 'elapsed' || t.type === 'ampm')
  if (dates.length) return dates.some((t) => /^[yde]/.test(t.value) || isMonth(tokens, tokens.indexOf(t))) ? 'date' : 'time'
  if (tokens.some((t) => t.type === 'at') && !tokens.some((t) => t.type === 'num')) return 'text'
  if (tokens.some((t) => t.type === 'text' && t.value.includes('%'))) return 'percentage'
  if (tokens.some((t) => t.type === 'currency')) return 'currency'
  return 'float'
}

// Whether the m/mm token at index `i` is a month (not minutes).
function isMonth(tokens: Token[], i: number): boolean {
  const t = tokens[i]
  if (t.type !== 'date' || !t.value.startsWith('m')) return false
  if (t.value.length > 2) return true
  const find = (dir: number) => {
    for (let k = i + dir; k >= 0 && k < tokens.length; k += dir) {
      const o = tokens[k]
      if (o.type === 'date' || o.type === 'elapsed') return o.value
      if (o.type === 'num') return null
    }
    return null
  }
  const before = find(-1)
  const after = find(1)
  return !(before?.replace(/[\[\]]/g, '').startsWith('h') || after?.startsWith('s'))
}

export function buildDataStyle(pattern: string, name: string): { xml: string; kind: Kind; currency?: string } | undefined {
  if (!pattern || /^general$/i.test(pattern.trim())) return undefined
  if (pattern === 'BOOLEAN') return { xml: `<number:boolean-style style:name="${name}"><number:boolean/></number:boolean-style>`, kind: 'boolean' }
  // The text section (4th) has no ODF equivalent here; conditions pick among the others.
  const sections = splitSections(pattern)
    .slice(0, 3)
    .map(tokenize)
  const kinds = sections.map(sectionKind)
  const order: Kind[] = ['date', 'time', 'percentage', 'currency', 'float', 'text']
  const kind = order.find((k) => kinds.includes(k))!
  const main = kind === 'text' ? sections.find((s) => sectionKind(s) === 'text')! : sections[0]
  let currency: string | undefined
  for (const s of sections) for (const t of s) if (t.type === 'currency') currency ??= CURRENCY_CODES[t.value]

  const element = { date: 'date-style', time: 'time-style', percentage: 'percentage-style', currency: 'currency-style', float: 'number-style', text: 'text-style', boolean: 'boolean-style' }[kind]
  const write = (styleName: string, tokens: Token[], maps: string, volatile: boolean) =>
    `<number:${element} style:name="${styleName}"${volatile ? ' style:volatile="true"' : ''}` +
    (kind === 'time' && tokens.some((t) => t.type === 'elapsed') ? ' number:truncate-on-overflow="false"' : '') +
    `>${sectionXml(tokens, kind)}${maps}</number:${element}>`

  if (sections.length === 1 || kind === 'text') return { xml: write(name, main, '', false), kind, currency }

  // Conditions: explicit ones, else Excel's positive;negative;zero convention.
  const cond = (tokens: Token[]) => tokens.find((t) => t.type === 'cond')?.value
  const conds = sections.map(cond)
  let parts: Array<{ tokens: Token[]; condition: string }>
  let last: Token[]
  if (conds[0] || conds[1]) {
    const withCond = sections.slice(0, sections.length === 2 && !conds[1] ? 1 : 2)
    parts = withCond.map((tokens, k) => ({ tokens, condition: conds[k] || '<0' }))
    last = sections[withCond.length] ?? sections[sections.length - 1]
  } else if (sections.length === 2) {
    parts = [{ tokens: sections[0], condition: '>=0' }]
    last = sections[1]
  } else {
    parts = [
      { tokens: sections[0], condition: '>0' },
      { tokens: sections[1], condition: '<0' },
    ]
    last = sections[2]
  }
  let xml = ''
  let maps = ''
  parts.forEach((p, k) => {
    const sub = `${name}P${k}`
    xml += write(sub, p.tokens, '', true)
    maps += `<style:map style:condition="value()${escapeXml(p.condition)}" style:apply-style-name="${sub}"/>`
  })
  xml += write(name, last, maps, false)
  return { xml, kind, currency }
}

function sectionXml(tokens: Token[], kind: Kind): string {
  let out = ''
  const color = tokens.find((t) => t.type === 'color')
  if (color) out += `<style:text-properties fo:color="${color.value}"/>`
  const text = (t: string) => (t ? `<number:text>${escapeXml(t)}</number:text>` : '')
  tokens.forEach((t, i) => {
    switch (t.type) {
      case 'text':
        out += text(t.value)
        break
      case 'currency':
        out += `<number:currency-symbol>${escapeXml(t.value)}</number:currency-symbol>`
        break
      case 'at':
        out += '<number:text-content/>'
        break
      case 'num':
        out += numberXml(t.value)
        break
      case 'frac':
        out += fractionXml(t.value)
        break
      case 'ampm':
        out += '<number:am-pm/>'
        break
      case 'elapsed':
        if (t.value.startsWith('h')) out += `<number:hours${t.value.length > 1 ? ' number:style="long"' : ''}/>`
        else if (t.value.startsWith('m')) out += `<number:minutes${t.value.length > 1 ? ' number:style="long"' : ''}/>`
        else out += `<number:seconds${t.value.length > 1 ? ' number:style="long"' : ''}/>`
        break
      case 'date':
        out += dateXml(t.value, isMonth(tokens, i))
        break
    }
  })
  if (kind === 'text' && !out.includes('text-content')) out += '<number:text-content/>'
  return out
}

function dateXml(v: string, month: boolean): string {
  const long = ' number:style="long"'
  switch (v[0]) {
    case 'y':
    case 'e':
      return `<number:year${v.length > 2 || v[0] === 'e' ? long : ''}/>`
    case 'd':
      if (v.length >= 4) return `<number:day-of-week${long}/>`
      if (v.length === 3) return '<number:day-of-week/>'
      return `<number:day${v.length === 2 ? long : ''}/>`
    case 'h':
      return `<number:hours${v.length >= 2 ? long : ''}/>`
    case 's': {
      const [secs, frac] = v.split('.')
      return `<number:seconds${secs.length >= 2 ? long : ''}${frac ? ` number:decimal-places="${frac.length}"` : ''}/>`
    }
    case 'm':
      if (!month) return `<number:minutes${v.length >= 2 ? long : ''}/>`
      if (v.length >= 4) return `<number:month number:textual="true"${long}/>`
      if (v.length === 3 || v.length === 5) return '<number:month number:textual="true"/>'
      return `<number:month${v.length === 2 ? long : ''}/>`
  }
  return ''
}

function numberXml(v: string): string {
  if (v === 'General') return '<number:number number:min-integer-digits="1"/>'
  const sci = /^([^eE]*)[eE]([+-])(.+)$/.exec(v)
  const body = sci ? sci[1] : v
  // Commas after the last digit scale by thousands.
  const scaleMatch = /,+$/.exec(body)
  const core = scaleMatch ? body.slice(0, -scaleMatch[0].length) : body
  const [int, frac = ''] = core.split('.')
  const minInt = (int.match(/0/g) || []).length
  const grouping = /[0#?],[0#?]/.test(int)
  const decimals = (frac.match(/[0#?]/g) || []).length
  const minDecimals = (frac.match(/0/g) || []).length
  let attrs = ` number:decimal-places="${decimals}" number:min-decimal-places="${minDecimals}" number:min-integer-digits="${minInt}"`
  if (grouping) attrs += ' number:grouping="true"'
  if (sci) {
    const expDigits = (sci[3].match(/[0#?]/g) || []).length
    return `<number:scientific-number${attrs} number:min-exponent-digits="${expDigits}" number:forced-exponent-sign="${sci[2] === '+'}"/>`
  }
  if (scaleMatch) attrs += ` number:display-factor="${Math.pow(1000, scaleMatch[0].length)}"`
  return `<number:number${attrs}/>`
}

// "# ?/?", "?/8", "0 ??/??"
function fractionXml(v: string): string {
  const m = /^(?:([#0?,]+) +)?([#0?]+)\/([#0?]+|\d+)$/.exec(v)!
  let attrs = ''
  if (m[1] !== undefined) attrs += ` number:min-integer-digits="${(m[1].match(/0/g) || []).length}"`
  attrs += ` number:min-numerator-digits="${m[2].length}"`
  if (/^\d+$/.test(m[3])) attrs += ` number:denominator-value="${m[3]}"`
  else attrs += ` number:min-denominator-digits="${m[3].length}" number:max-denominator-value="${'9'.repeat(m[3].length)}"`
  return `<number:fraction${attrs}/>`
}

// ---------------------------------------------------------------------------
// Other parts

function stylesXml(fontDecls: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<office:document-styles ${NS} office:version="1.3">` +
    `<office:font-face-decls>${fontDecls}</office:font-face-decls>` +
    `<office:styles>` +
    `<style:default-style style:family="table-cell">` +
    `<style:paragraph-properties style:tab-stop-distance="0.5in"/>` +
    `<style:text-properties style:font-name="${DEFAULT_FONT}" fo:font-size="${DEFAULT_FONT_PT}pt" style:font-size-asian="${DEFAULT_FONT_PT}pt" style:font-size-complex="${DEFAULT_FONT_PT}pt" fo:language="en" fo:country="US"/>` +
    `</style:default-style>` +
    `<number:number-style style:name="N0"><number:number number:min-integer-digits="1"/></number:number-style>` +
    `<style:style style:name="Default" style:family="table-cell"/>` +
    `</office:styles>` +
    `<office:automatic-styles>` +
    `<style:page-layout style:name="pm1"><style:page-layout-properties style:writing-mode="lr-tb"/></style:page-layout>` +
    `</office:automatic-styles>` +
    `<office:master-styles><style:master-page style:name="Default" style:page-layout-name="pm1"/></office:master-styles>` +
    `</office:document-styles>`
  )
}

function metaXml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<office:document-meta ${NS} office:version="1.3"><office:meta>` +
    `<meta:generator>Ofimeo</meta:generator>` +
    `<meta:creation-date>${new Date().toISOString().slice(0, 19)}</meta:creation-date>` +
    `</office:meta></office:document-meta>`
  )
}

function settingsXml(data: IWorkbookData): string {
  const item = (name: string, type: string, value: string | number | boolean) =>
    `<config:config-item config:name="${name}" config:type="${type}">${value}</config:config-item>`
  const sheets = data.sheetOrder.map((id) => data.sheets[id]).filter((s) => s)
  const tables = sheets
    .map((s) => {
      const x = Math.max(0, s.freeze?.xSplit ?? 0)
      const y = Math.max(0, s.freeze?.ySplit ?? 0)
      return (
        `<config:config-item-map-entry config:name="${escapeXml(s.name || '')}">` +
        item('HorizontalSplitMode', 'short', x ? 2 : 0) +
        item('VerticalSplitMode', 'short', y ? 2 : 0) +
        item('HorizontalSplitPosition', 'int', x) +
        item('VerticalSplitPosition', 'int', y) +
        item('ActiveSplitRange', 'short', y ? 2 : x ? 3 : 2) +
        item('PositionLeft', 'int', 0) +
        item('PositionRight', 'int', x) +
        item('PositionTop', 'int', 0) +
        item('PositionBottom', 'int', y) +
        item('ShowGrid', 'boolean', s.showGridlines !== 0) +
        `</config:config-item-map-entry>`
      )
    })
    .join('')
  const first = sheets.find((s) => !s.hidden) ?? sheets[0]
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<office:document-settings xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0" office:version="1.3">` +
    `<office:settings><config:config-item-set config:name="ooo:view-settings">` +
    `<config:config-item-map-indexed config:name="Views"><config:config-item-map-entry>` +
    item('ViewId', 'string', 'view1') +
    `<config:config-item-map-named config:name="Tables">${tables}</config:config-item-map-named>` +
    item('ActiveTable', 'string', escapeXml(first?.name || '')) +
    item('ShowGrid', 'boolean', first?.showGridlines !== 0) +
    `</config:config-item-map-entry></config:config-item-map-indexed>` +
    `</config:config-item-set></office:settings></office:document-settings>`
  )
}

function manifestXml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">` +
    `<manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="${MIME}"/>` +
    `<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>` +
    `<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>` +
    `<manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>` +
    `<manifest:file-entry manifest:full-path="settings.xml" manifest:media-type="text/xml"/>` +
    `</manifest:manifest>`
  )
}
