// OpenDocument charts for .ods: each chart is an embedded chart object
// ("Object N/") in a draw:frame of the table's <table:shapes>, positioned in
// the sheet; the chart's series point at the sheet ranges, so LibreOffice keeps
// it live. Images are written the same way (Pictures/). Reading turns chart
// objects (cell-anchored or not) back into ChartSpecs.

import type JSZip from 'jszip'
import { attr, child, children, escapeXml } from '../../../core/formats'

const TABLE_NS = 'urn:oasis:names:tc:opendocument:xmlns:table:1.0'
import { colName, PALETTES, seriesRefs, specFromSeries, type CellAnchor, type CellRange, type ChartSpec, type ChartType, type LegendPosition, type SeriesRefs } from '../charts/model'

const PX_PER_CM = 96 / 2.54
const cm = (px: number) => `${(px / PX_PER_CM).toFixed(3)}cm`
const q = (sheet: string) => (/^[A-Za-z0-9_]+$/.test(sheet) ? sheet : `'${sheet.replace(/'/g, "''")}'`)
const cell = (sheet: string, r: number, c: number) => `${q(sheet)}.${colName(c)}${r + 1}`
const area = (sheet: string, r: CellRange) => `${cell(sheet, r.startRow, r.startColumn)}:${cell(sheet, r.endRow, r.endColumn)}`

const CLASS: Record<ChartType, string> = { column: 'bar', bar: 'bar', line: 'line', area: 'area', pie: 'circle', doughnut: 'ring', scatter: 'scatter' }

export function odsChartContent(spec: ChartSpec, sourceName: string, widthPx: number, heightPx: number): string {
  const s = sourceName
  const cls = `chart:${CLASS[spec.type]}`
  const palette = PALETTES[spec.palette] ?? PALETTES.ofimeo
  const refs = seriesRefs(spec)
  const pie = spec.type === 'pie' || spec.type === 'doughnut'
  const line = spec.type === 'line'
  const scatter = spec.type === 'scatter'
  const styles = refs.map((_, i) => {
    const color = palette[i % palette.length]
    const graphic = line || scatter ? `<style:graphic-properties svg:stroke-color="${color}" draw:fill-color="${color}" svg:stroke-width="0.07cm"${scatter ? ' draw:stroke="none"' : ''}/>` : `<style:graphic-properties draw:fill-color="${color}" draw:fill="solid"/>`
    return `<style:style style:name="ser${i}" style:family="chart"><style:chart-properties${line || scatter ? ' chart:symbol-type="automatic"' : ''}${spec.trendline && scatter ? ` chart:regression-type="linear"` : ''}/>${pie ? '' : graphic}</style:style>`
  })
  const axisStyle = '<style:style style:name="ax" style:family="chart"><style:chart-properties chart:display-label="true" chart:logarithmic="false" chart:reverse-direction="false"/></style:style>'
  const regression = `<style:style style:name="reg" style:family="chart"><style:chart-properties chart:regression-type="linear"/><style:graphic-properties svg:stroke-style="dash" svg:stroke-width="0.05cm"/></style:style><style:style style:name="eq" style:family="chart"><style:chart-properties chart:display-equation="true" chart:display-r-square="true"/></style:style>`
  const series = refs.map((r, i) => {
    const label = r.name ? ` chart:label-cell-address="${cell(s, r.name.startRow, r.name.startColumn)}"` : ''
    const domain = scatter && r.categories ? `<chart:domain table:cell-range-address="${area(s, r.categories)}"/>` : ''
    const trend = scatter && spec.trendline ? '<chart:regression-curve chart:style-name="reg"><chart:equation chart:style-name="eq" chart:display-equation="true" chart:display-r-square="true"/></chart:regression-curve>' : ''
    const points = pie && r.categories ? Array.from({ length: r.categories.endRow - r.categories.startRow + r.categories.endColumn - r.categories.startColumn + 1 }, (_, j) => `<chart:data-point chart:style-name="pt${j % palette.length}"/>`).join('') : ''
    return `<chart:series chart:style-name="ser${i}" chart:values-cell-range-address="${area(s, r.values)}"${label} chart:class="${spec.type === 'doughnut' ? 'chart:circle' : cls}">${domain}${trend}${points}</chart:series>`
  })
  const pointStyles = pie ? palette.map((c, j) => `<style:style style:name="pt${j}" style:family="chart"><style:graphic-properties draw:fill-color="${c}" draw:fill="solid"/></style:style>`).join('') : ''
  const cats = refs.find((r) => r.categories && !scatter)?.categories
  const title = (text: string) => (text ? `<chart:title><text:p>${escapeXml(text)}</text:p></chart:title>` : '')
  const bar = spec.type === 'bar'
  const axes = pie
    ? cats ? `<chart:axis chart:dimension="x" chart:name="primary-x" chart:style-name="ax"><chart:categories table:cell-range-address="${area(s, cats)}"/></chart:axis>` : ''
    : `<chart:axis chart:dimension="x" chart:name="primary-x" chart:style-name="ax">${title(bar ? spec.yTitle : spec.xTitle)}${cats ? `<chart:categories table:cell-range-address="${area(s, cats)}"/>` : ''}</chart:axis>` +
      `<chart:axis chart:dimension="y" chart:name="primary-y" chart:style-name="ax">${title(bar ? spec.xTitle : spec.yTitle)}<chart:grid chart:class="major"/></chart:axis>`
  const legendPos = { bottom: 'bottom', top: 'top', right: 'end', none: '' }[spec.legend]
  const legend = legendPos ? `<chart:legend chart:legend-position="${legendPos}" style:legend-expansion="wide"/>` : ''
  const allBlocks = refs.flatMap((r) => [r.name, r.categories, r.values].filter((b): b is CellRange => !!b))
  const box = allBlocks.length
    ? { startRow: Math.min(...allBlocks.map((b) => b.startRow)), endRow: Math.max(...allBlocks.map((b) => b.endRow)), startColumn: Math.min(...allBlocks.map((b) => b.startColumn)), endColumn: Math.max(...allBlocks.map((b) => b.endColumn)) }
    : null
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:chart="urn:oasis:names:tc:opendocument:xmlns:chart:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.3">' +
    `<office:automatic-styles><style:style style:name="pa" style:family="chart"><style:chart-properties chart:vertical="${bar}"${line ? ' chart:symbol-type="automatic"' : ''}/></style:style>${styles.join('')}${axisStyle}${regression}${pointStyles}</office:automatic-styles>` +
    `<office:body><office:chart><chart:chart svg:width="${cm(widthPx)}" svg:height="${cm(heightPx)}" chart:class="${cls}">${title(spec.title)}${legend}` +
    `<chart:plot-area chart:style-name="pa"${box && spec.seriesIn === 'columns' ? ` table:cell-range-address="${area(s, box)}"` : ''} chart:data-source-has-labels="${spec.headerRow && spec.headerCol ? 'both' : spec.headerRow ? 'row' : spec.headerCol ? 'column' : 'none'}">${axes}${series.join('')}</chart:plot-area></chart:chart></office:chart></office:body></office:document-content>`
  )
}

export interface OdsDrawing {
  x: number
  y: number
  width: number
  height: number
  xml: string // the draw:frame
}

export const odsChartFrame = (n: number, name: string, x: number, y: number, w: number, h: number) =>
  `<draw:frame draw:z-index="${n}" draw:name="${escapeXml(name)}" svg:width="${cm(w)}" svg:height="${cm(h)}" svg:x="${cm(x)}" svg:y="${cm(y)}"><draw:object xlink:href="./Object ${n}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>`

export const odsImageFrame = (n: number, path: string, x: number, y: number, w: number, h: number) =>
  `<draw:frame draw:z-index="${n}" draw:name="Image ${n}" svg:width="${cm(w)}" svg:height="${cm(h)}" svg:x="${cm(x)}" svg:y="${cm(y)}"><draw:image xlink:href="${path}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>`

export const odsChartManifest = (n: number) =>
  `<manifest:file-entry manifest:full-path="Object ${n}/" manifest:media-type="application/vnd.oasis.opendocument.chart"/><manifest:file-entry manifest:full-path="Object ${n}/content.xml" manifest:media-type="text/xml"/>`

// ---------- Reading ----------

const unescape = (v: string) => v.replace(/&(quot|apos|lt|gt|amp);/g, (_, e) => ({ quot: '"', apos: "'", lt: '<', gt: '>', amp: '&' })[e as 'quot']!)
const lengthPx = (v: string | undefined) => {
  const m = v && /^(-?[\d.]+)(cm|mm|in|pt|px)?$/.exec(v)
  return m ? Number(m[1]) * ({ cm: PX_PER_CM, mm: PX_PER_CM / 10, in: 96, pt: 96 / 72, px: 1 }[m[2] ?? 'px'] ?? 1) : 0
}
const attrOf = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]

// "'My sheet'.A1:'My sheet'.B4" or "$Sheet1.$A$1:.$B$4" → sheet and block.
function parseOdfRange(ref: string): { sheet: string; range: CellRange } | null {
  const m = /^\$?(?:'((?:[^']|'')+)'|([^.']+))\.\$?([A-Z]+)\$?(\d+)(?::(?:\$?(?:'(?:[^']|'')+'|[^.']+))?\.\$?([A-Z]+)\$?(\d+))?$/.exec(unescape(ref.trim().split(' ')[0]))
  if (!m) return null
  const col = (s: string) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1
  const [c1, r1] = [col(m[3]), Number(m[4]) - 1]
  const [c2, r2] = m[5] ? [col(m[5]), Number(m[6]) - 1] : [c1, r1]
  return { sheet: (m[1] ?? m[2]).replace(/''/g, "'"), range: { startRow: Math.min(r1, r2), endRow: Math.max(r1, r2), startColumn: Math.min(c1, c2), endColumn: Math.max(c1, c2) } }
}

function specFromObject(obj: string): { spec: Omit<ChartSpec, 'sheetId'>; sourceSheet: string } | null {
  const chartTag = /<chart:chart [^>]*>/.exec(obj)?.[0]
  const cls = chartTag && attrOf(chartTag, 'chart:class')?.replace('chart:', '')
  if (!cls) return null
  const vertical = /chart:vertical="true"/.test(obj)
  const type: ChartType | null =
    cls === 'bar' ? (vertical ? 'bar' : 'column') : cls === 'line' ? 'line' : cls === 'area' ? 'area' : cls === 'circle' ? 'pie' : cls === 'ring' ? 'doughnut' : cls === 'scatter' ? 'scatter' : null
  if (!type) return null
  const cats = /<chart:categories [^>]*table:cell-range-address="([^"]+)"/.exec(obj)?.[1]
  const catRange = cats ? parseOdfRange(cats) : null
  let sourceSheet = ''
  const series: SeriesRefs[] = []
  for (const m of obj.matchAll(/<chart:series ([^>]*?)(\/>|>([\s\S]*?)<\/chart:series>)/g)) {
    const values = parseOdfRange(attrOf(' ' + m[1], 'chart:values-cell-range-address') ?? '')
    if (!values) continue
    sourceSheet ||= values.sheet
    const label = attrOf(' ' + m[1], 'chart:label-cell-address')
    const domain = /<chart:domain [^>]*table:cell-range-address="([^"]+)"/.exec(m[3] ?? '')?.[1]
    series.push({
      name: label ? (parseOdfRange(label)?.range ?? null) : null,
      categories: type === 'scatter' ? (domain ? (parseOdfRange(domain)?.range ?? null) : null) : (catRange?.range ?? null),
      values: values.range,
    })
  }
  const titleOf = (xml: string | undefined) => (xml ? [...xml.matchAll(/<text:p[^>]*>([^<]*)<\/text:p>/g)].map((t) => unescape(t[1])).join(' ') : '')
  const axisTitle = (dim: string) => titleOf(new RegExp(`<chart:axis [^>]*chart:dimension="${dim}"[^>]*>(?:(?!</chart:axis>)[\\s\\S])*?<chart:title[^>]*>([\\s\\S]*?)</chart:title>`).exec(obj)?.[1])
  const legendPos = /<chart:legend [^>]*chart:legend-position="([^"]+)"/.exec(obj)?.[1]
  const legend: LegendPosition = !legendPos ? 'none' : legendPos === 'top' ? 'top' : legendPos === 'end' || legendPos === 'start' ? 'right' : 'bottom'
  const [xT, yT] = [axisTitle('x'), axisTitle('y')]
  const spec = specFromSeries(
    {
      kind: 'ofimeo-chart',
      type,
      sheetId: '',
      title: titleOf(/<chart:chart [^>]*>\s*<chart:title[^>]*>([\s\S]*?)<\/chart:title>/.exec(obj)?.[1]),
      legend,
      xTitle: type === 'bar' ? yT : xT,
      yTitle: type === 'bar' ? xT : yT,
      palette: 'ofimeo',
      trendline: type === 'scatter' && /<chart:regression-curve/.test(obj),
    },
    series,
  )
  if (!spec) return null
  const { sheetId: _sheetId, ...rest } = spec
  void _sheetId
  return { spec: rest, sourceSheet }
}

export interface OdsFrame {
  table: string
  // Anchor cell (0,0 for frames of <table:shapes>) and offset from its corner.
  row: number
  col: number
  x: number
  y: number
  width: number
  height: number
  frame: Element
}

// Every draw:frame of every table, with the cell it is anchored to.
export function odsFrames(content: Document): OdsFrame[] {
  const out: OdsFrame[] = []
  const add = (table: string, row: number, col: number, frame: Element) =>
    out.push({
      table,
      row,
      col,
      frame,
      x: lengthPx(attr(frame, 'x') ?? undefined),
      y: lengthPx(attr(frame, 'y') ?? undefined),
      width: lengthPx(attr(frame, 'width') ?? undefined),
      height: lengthPx(attr(frame, 'height') ?? undefined),
    })
  for (const table of [...content.getElementsByTagNameNS(TABLE_NS, 'table')]) {
    const name = attr(table, 'name') ?? ''
    for (const shapes of children(table, 'shapes')) for (const f of children(shapes, 'frame')) add(name, 0, 0, f)
    let row = 0
    const rows = (parent: Element) => {
      for (const el of children(parent)) {
        if (el.localName === 'table-row-group' || el.localName === 'table-header-rows' || el.localName === 'table-rows') {
          rows(el)
          continue
        }
        if (el.localName !== 'table-row') continue
        const repeat = Math.min(Number(attr(el, 'number-rows-repeated') ?? 1) || 1, 100_000)
        let col = 0
        for (const cell of children(el)) {
          if (cell.localName !== 'table-cell' && cell.localName !== 'covered-table-cell') continue
          for (const f of children(cell, 'frame')) add(name, row, col, f)
          col += Math.min(Number(attr(cell, 'number-columns-repeated') ?? 1) || 1, 16_384)
        }
        row += repeat
      }
    }
    rows(table)
  }
  return out
}

// Charts of an .ods: chart objects referenced by frames.
export async function readOdsCharts(zip: JSZip, content: Document): Promise<(OdsFrame & { sourceSheet: string; spec: Omit<ChartSpec, 'sheetId'> })[]> {
  const out = []
  for (const f of odsFrames(content)) {
    const href = attr(child(f.frame, 'object'), 'href')
    if (!href) continue
    const obj = await zip.file(`${href.replace(/^\.\//, '').replace(/\/$/, '')}/content.xml`)?.async('string')
    const parsed = obj && specFromObject(obj)
    if (!parsed) continue
    out.push({ ...f, width: f.width || 480, height: f.height || 300, sourceSheet: parsed.sourceSheet || f.table, spec: parsed.spec })
  }
  return out
}

// Sheet pixels → cell anchor, given the column widths and row heights.
export function pxToAnchor(x: number, y: number, colWidth: (c: number) => number, rowHeight: (r: number) => number): CellAnchor {
  let column = 0
  let row = 0
  while (column < 16383 && x >= colWidth(column)) x -= colWidth(column++)
  while (row < 1_000_000 && y >= rowHeight(row)) y -= rowHeight(row++)
  return { column, columnOffset: Math.round(x), row, rowOffset: Math.round(y) }
}
