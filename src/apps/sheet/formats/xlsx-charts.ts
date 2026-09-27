// Native Excel charts (DrawingML) for .xlsx. ExcelJS has no chart support, so
// chart parts are added to its zip afterwards; they reference the sheet cells
// (Sheet!$A$1) and carry a value cache, so Excel, LibreOffice and Google
// Sheets show them and keep them live. Reading does the reverse: every chart
// of a drawing part becomes a ChartSpec anchored at the same cells.

import JSZip from 'jszip'
import { escapeXml } from '../../../core/formats'
import {
  colName,
  PALETTES,
  seriesRefs,
  specFromSeries,
  type Cell,
  type CellAnchor,
  type CellRange,
  type ChartSpec,
  type ChartType,
  type LegendPosition,
  type SeriesRefs,
} from '../charts/model'

export const EMU_PER_PX = 9525

const quote = (name: string) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`)
const ref = (sheet: string, r: CellRange) =>
  `${quote(sheet)}!$${colName(r.startColumn)}$${r.startRow + 1}` + (r.startRow === r.endRow && r.startColumn === r.endColumn ? '' : `:$${colName(r.endColumn)}$${r.endRow + 1}`)
const cells = (r: CellRange) => {
  const out: [number, number][] = []
  for (let row = r.startRow; row <= r.endRow; row++) for (let col = r.startColumn; col <= r.endColumn; col++) out.push([row, col])
  return out
}
const hex = (c: string) => c.replace('#', '').toUpperCase()

export interface XlsxChart {
  spec: ChartSpec
  // Name of the source sheet (as written in the file).
  sourceName: string
  value: (row: number, col: number) => Cell
  from: CellAnchor
  to: CellAnchor
}

function strCache(values: Cell[]) {
  return `<c:strCache><c:ptCount val="${values.length}"/>${values.map((v, i) => `<c:pt idx="${i}"><c:v>${escapeXml(v === null || v === undefined ? '' : String(v))}</c:v></c:pt>`).join('')}</c:strCache>`
}
function numCache(values: Cell[]) {
  const pts = values.map((v, i) => (typeof v === 'number' && Number.isFinite(v) ? `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>` : '')).join('')
  return `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${pts}</c:numCache>`
}
const richTitle = (text: string) =>
  `<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>${escapeXml(text)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`

export function chartXml(chart: XlsxChart): string {
  const { spec, sourceName: sn, value } = chart
  const palette = PALETTES[spec.palette] ?? PALETTES.ofimeo
  const pie = spec.type === 'pie' || spec.type === 'doughnut'
  const scatter = spec.type === 'scatter'
  const line = spec.type === 'line'
  const fill = (color: string) =>
    line || scatter
      ? `<c:spPr>${line ? `<a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="${hex(color)}"/></a:solidFill></a:ln>` : '<a:ln w="25400"><a:noFill/></a:ln>'}</c:spPr>`
      : `<c:spPr><a:solidFill><a:srgbClr val="${hex(color)}"/></a:solidFill></c:spPr>`
  const series = seriesRefs(spec).map((s, i) => {
    const color = palette[i % palette.length]
    const tx = s.name ? `<c:tx><c:strRef><c:f>${escapeXml(ref(sn, s.name))}</c:f>${strCache([value(s.name.startRow, s.name.startColumn)])}</c:strRef></c:tx>` : ''
    const catValues = s.categories ? cells(s.categories).map(([r, c]) => value(r, c)) : []
    const vals = cells(s.values).map(([r, c]) => value(r, c))
    const points = pie ? catValues.map((_, j) => `<c:dPt><c:idx val="${j}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${hex(palette[j % palette.length])}"/></a:solidFill></c:spPr></c:dPt>`).join('') : ''
    const marker = line ? '<c:marker><c:symbol val="circle"/><c:size val="5"/></c:marker>' : scatter ? `<c:marker><c:symbol val="circle"/><c:size val="6"/><c:spPr><a:solidFill><a:srgbClr val="${hex(color)}"/></a:solidFill></c:spPr></c:marker>` : ''
    const trend = scatter && spec.trendline ? '<c:trendline><c:trendlineType val="linear"/><c:dispRSqr val="1"/><c:dispEq val="1"/><c:trendlineLbl><c:numFmt formatCode="General" sourceLinked="0"/></c:trendlineLbl></c:trendline>' : ''
    const cat = s.categories
      ? scatter
        ? `<c:xVal><c:numRef><c:f>${escapeXml(ref(sn, s.categories))}</c:f>${numCache(catValues)}</c:numRef></c:xVal>`
        : `<c:cat><c:strRef><c:f>${escapeXml(ref(sn, s.categories))}</c:f>${strCache(catValues)}</c:strRef></c:cat>`
      : ''
    const val = `<c:${scatter ? 'yVal' : 'val'}><c:numRef><c:f>${escapeXml(ref(sn, s.values))}</c:f>${numCache(vals)}</c:numRef></c:${scatter ? 'yVal' : 'val'}>`
    return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${tx}${pie ? '' : fill(color)}${marker}${points}${trend}${cat}${val}${line || scatter ? '<c:smooth val="0"/>' : ''}</c:ser>`
  })
  const axIds = '<c:axId val="111"/><c:axId val="222"/>'
  const plot = (() => {
    switch (spec.type) {
      case 'pie':
        return `<c:pieChart><c:varyColors val="1"/>${series.join('')}<c:firstSliceAng val="0"/></c:pieChart>`
      case 'doughnut':
        return `<c:doughnutChart><c:varyColors val="1"/>${series.join('')}<c:firstSliceAng val="0"/><c:holeSize val="50"/></c:doughnutChart>`
      case 'line':
        return `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${series.join('')}<c:marker val="1"/>${axIds}</c:lineChart>`
      case 'area':
        return `<c:areaChart><c:grouping val="standard"/><c:varyColors val="0"/>${series.join('')}${axIds}</c:areaChart>`
      case 'scatter':
        return `<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${series.join('')}${axIds}</c:scatterChart>`
      default:
        return `<c:barChart><c:barDir val="${spec.type === 'bar' ? 'bar' : 'col'}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${series.join('')}<c:gapWidth val="150"/>${axIds}</c:barChart>`
    }
  })()
  const axisTitle = (text: string) => (text ? richTitle(text) : '')
  const bar = spec.type === 'bar'
  // Horizontal bars: categories on the left axis, values at the bottom.
  const [catPos, valPos] = bar ? ['l', 'b'] : ['b', 'l']
  const [catTitle, valTitle] = bar ? [spec.yTitle, spec.xTitle] : [spec.xTitle, spec.yTitle]
  const axes = pie
    ? ''
    : scatter
      ? `<c:valAx><c:axId val="111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>${axisTitle(spec.xTitle)}<c:numFmt formatCode="General" sourceLinked="1"/><c:tickLblPos val="nextTo"/><c:crossAx val="222"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>` +
        `<c:valAx><c:axId val="222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines/>${axisTitle(spec.yTitle)}<c:numFmt formatCode="General" sourceLinked="1"/><c:tickLblPos val="nextTo"/><c:crossAx val="111"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>`
      : `<c:catAx><c:axId val="111"/><c:scaling><c:orientation val="${bar ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${catPos}"/>${axisTitle(catTitle)}<c:numFmt formatCode="General" sourceLinked="1"/><c:tickLblPos val="nextTo"/><c:crossAx val="222"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/></c:catAx>` +
        `<c:valAx><c:axId val="222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${valPos}"/><c:majorGridlines/>${axisTitle(valTitle)}<c:numFmt formatCode="General" sourceLinked="1"/><c:tickLblPos val="nextTo"/><c:crossAx val="111"/><c:crosses val="${bar ? 'max' : 'autoZero'}"/><c:crossBetween val="between"/></c:valAx>`
  const legendPos = { bottom: 'b', top: 't', right: 'r', none: '' }[spec.legend]
  const legend = legendPos ? `<c:legend><c:legendPos val="${legendPos}"/><c:overlay val="0"/></c:legend>` : ''
  const title = spec.title ? `${richTitle(spec.title)}<c:autoTitleDeleted val="0"/>` : '<c:autoTitleDeleted val="1"/>'
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<c:roundedCorners val="0"/><c:chart>${title}<c:plotArea><c:layout/>${plot}${axes}</c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`
  )
}

const anchorXml = (a: { from: CellAnchor; to: CellAnchor }, rid: string, id: number, name: string) => {
  const pos = (p: CellAnchor) =>
    `<xdr:col>${p.column}</xdr:col><xdr:colOff>${Math.round(p.columnOffset * EMU_PER_PX)}</xdr:colOff><xdr:row>${p.row}</xdr:row><xdr:rowOff>${Math.round(p.rowOffset * EMU_PER_PX)}</xdr:rowOff>`
  return (
    `<xdr:twoCellAnchor editAs="oneCell"><xdr:from>${pos(a.from)}</xdr:from><xdr:to>${pos(a.to)}</xdr:to>` +
    `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${id}" name="${escapeXml(name)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="${rid}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`
  )
}

const EMPTY_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
const R_NS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'

// Adds charts to an ExcelJS zip. `sheetIndex` is the 1-based worksheet part number.
export async function addXlsxCharts(zip: JSZip, charts: (XlsxChart & { sheetIndex: number })[]): Promise<void> {
  if (!charts.length) return
  let types = await zip.file('[Content_Types].xml')!.async('string')
  const addOverride = (part: string, type: string) => {
    if (!types.includes(`PartName="/${part}"`)) types = types.replace('</Types>', `<Override PartName="/${part}" ContentType="${type}"/></Types>`)
  }
  const nextFree = (prefix: string) => {
    let n = 1
    while (zip.file(`${prefix}${n}.xml`)) n++
    return n
  }
  const bySheet = new Map<number, XlsxChart[]>()
  charts.forEach((c) => bySheet.set(c.sheetIndex, [...(bySheet.get(c.sheetIndex) ?? []), c]))
  for (const [sheetIndex, list] of bySheet) {
    const sheetPath = `xl/worksheets/sheet${sheetIndex}.xml`
    const sheetRelsPath = `xl/worksheets/_rels/sheet${sheetIndex}.xml.rels`
    let sheetXml = await zip.file(sheetPath)!.async('string')
    let sheetRels = (await zip.file(sheetRelsPath)?.async('string')) ?? EMPTY_RELS
    // Reuse the sheet's drawing (images written by ExcelJS) or create one.
    let drawingPath: string
    const existing = /<drawing r:id="([^"]+)"/.exec(sheetXml)
    const relTarget = (rels: string, id: string) => new RegExp(`<Relationship [^>]*Id="${id}"[^>]*>`).exec(rels)?.[0].match(/Target="([^"]+)"/)?.[1]
    if (existing) {
      drawingPath = 'xl/' + relTarget(sheetRels, existing[1])!.replace(/^(\.\.\/|\/xl\/)/, '')
    } else {
      drawingPath = `xl/drawings/drawing${nextFree('xl/drawings/drawing')}.xml`
      zip.file(drawingPath, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ${R_NS}></xdr:wsDr>`)
      const rid = 'rIdChartDrawing'
      sheetRels = sheetRels.replace('</Relationships>', `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../${drawingPath.slice(3)}"/></Relationships>`)
      if (!/<worksheet [^>]*xmlns:r=/.test(sheetXml)) sheetXml = sheetXml.replace('<worksheet ', `<worksheet ${R_NS} `)
      // <drawing> goes after pageMargins/pageSetup/headerFooter, before legacyDrawing/tableParts/extLst.
      const before = /<(legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)[ >]/.exec(sheetXml)
      sheetXml = before ? sheetXml.replace(before[0], `<drawing r:id="${rid}"/>${before[0]}`) : sheetXml.replace('</worksheet>', `<drawing r:id="${rid}"/></worksheet>`)
      addOverride(drawingPath, 'application/vnd.openxmlformats-officedocument.drawing+xml')
    }
    const drawingRelsPath = drawingPath.replace('drawings/', 'drawings/_rels/') + '.rels'
    let drawingXml = await zip.file(drawingPath)!.async('string')
    let drawingRels = (await zip.file(drawingRelsPath)?.async('string')) ?? EMPTY_RELS
    if (!/<xdr:wsDr [^>]*xmlns:r=/.test(drawingXml)) drawingXml = drawingXml.replace('<xdr:wsDr ', `<xdr:wsDr ${R_NS} `)
    for (const chart of list) {
      const n = nextFree('xl/charts/chart')
      zip.file(`xl/charts/chart${n}.xml`, chartXml(chart))
      addOverride(`xl/charts/chart${n}.xml`, 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml')
      const rid = `rIdChart${n}`
      drawingRels = drawingRels.replace('</Relationships>', `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${n}.xml"/></Relationships>`)
      drawingXml = drawingXml.replace('</xdr:wsDr>', anchorXml(chart, rid, 1000 + n, chart.spec.title || `Chart ${n}`) + '</xdr:wsDr>')
    }
    zip.file(drawingPath, drawingXml)
    zip.file(drawingRelsPath, drawingRels)
    zip.file(sheetPath, sheetXml)
    zip.file(sheetRelsPath, sheetRels)
  }
  zip.file('[Content_Types].xml', types)
}

// ---------- Reading ----------

export interface ReadChart {
  hostSheet: string
  sourceSheet: string
  spec: Omit<ChartSpec, 'sheetId'>
  from: CellAnchor
  to: CellAnchor
}

const unescape = (v: string) => v.replace(/&(quot|apos|lt|gt|amp);/g, (_, e) => ({ quot: '"', apos: "'", lt: '<', gt: '>', amp: '&' })[e as 'quot']!)

// "'My sheet'!$A$1:$B$4" → sheet name and block.
function parseRef(f: string): { sheet: string; range: CellRange } | null {
  const m = /^(?:'((?:[^']|'')+)'|([^!]+))!\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/.exec(unescape(f).trim())
  if (!m) return null
  const col = (s: string) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1
  const [c1, r1] = [col(m[3]), Number(m[4]) - 1]
  const [c2, r2] = m[5] ? [col(m[5]), Number(m[6]) - 1] : [c1, r1]
  return { sheet: (m[1] ?? m[2]).replace(/''/g, "'"), range: { startRow: Math.min(r1, r2), endRow: Math.max(r1, r2), startColumn: Math.min(c1, c2), endColumn: Math.max(c1, c2) } }
}

const text = (xml: string) => [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => unescape(t[1])).join('')

function chartFromXml(xml: string): { spec: Omit<ChartSpec, 'sheetId'>; sourceSheet: string } | null {
  const kind = /<c:(barChart|bar3DChart|lineChart|line3DChart|areaChart|area3DChart|pieChart|pie3DChart|doughnutChart|scatterChart)>/.exec(xml)?.[1]
  if (!kind) return null
  const barDir = /<c:barDir val="(\w+)"/.exec(xml)?.[1]
  const type: ChartType = kind.startsWith('bar')
    ? barDir === 'bar' ? 'bar' : 'column'
    : kind.startsWith('line') ? 'line' : kind.startsWith('area') ? 'area' : kind === 'doughnutChart' ? 'doughnut' : kind.startsWith('pie') ? 'pie' : 'scatter'
  let sourceSheet = ''
  const series: SeriesRefs[] = []
  for (const ser of xml.matchAll(/<c:ser>([\s\S]*?)<\/c:ser>/g)) {
    const part = ser[1]
    const f = (tag: string) => {
      const m = new RegExp(`<c:${tag}>[\\s\\S]*?<c:f>([^<]+)</c:f>`).exec(part)
      return m ? parseRef(m[1]) : null
    }
    const values = f(type === 'scatter' ? 'yVal' : 'val')
    if (!values) continue
    sourceSheet ||= values.sheet
    series.push({ name: f('tx')?.range ?? null, categories: f(type === 'scatter' ? 'xVal' : 'cat')?.range ?? null, values: values.range })
  }
  const titleXml = /<c:chart>\s*(?:<[^>]*>\s*)*?<c:title>([\s\S]*?)<\/c:title>/.exec(xml)?.[1] ?? ''
  const axisTitle = (axis: string) => {
    const ax = new RegExp(`<c:${axis}>([\\s\\S]*?)</c:${axis}>`, 'g')
    return [...xml.matchAll(ax)].map((m) => ({ pos: /<c:axPos val="(\w)"/.exec(m[1])?.[1], title: text(/<c:title>([\s\S]*?)<\/c:title>/.exec(m[1])?.[1] ?? '') }))
  }
  const axes = [...axisTitle('catAx'), ...axisTitle('valAx')]
  const legendPos = /<c:legend>[\s\S]*?<c:legendPos val="(\w+)"/.exec(xml)?.[1]
  const legend: LegendPosition = !/<c:legend>/.test(xml) ? 'none' : legendPos === 't' ? 'top' : legendPos === 'r' || legendPos === 'l' ? 'right' : 'bottom'
  const spec = specFromSeries(
    {
      kind: 'ofimeo-chart',
      type,
      sheetId: '',
      title: text(titleXml),
      legend,
      xTitle: axes.find((a) => a.pos === 'b')?.title ?? '',
      yTitle: axes.find((a) => a.pos === 'l')?.title ?? '',
      palette: 'ofimeo',
      trendline: type === 'scatter' && /<c:trendline>/.test(xml),
    },
    series,
  )
  if (!spec) return null
  const { sheetId: _sheetId, ...rest } = spec
  void _sheetId
  return { spec: rest, sourceSheet }
}

// Every chart of an .xlsx, with the sheet it is drawn on and its cell anchors.
export async function readXlsxCharts(buffer: ArrayBuffer): Promise<ReadChart[]> {
  const zip = await JSZip.loadAsync(buffer)
  const out: ReadChart[] = []
  const read = async (p: string) => (await zip.file(p)?.async('string')) ?? ''
  const resolve = (base: string, target: string) => {
    if (target.startsWith('/')) return target.slice(1)
    const parts = base.split('/').slice(0, -1)
    for (const seg of target.split('/')) seg === '..' ? parts.pop() : parts.push(seg)
    return parts.join('/')
  }
  const relTarget = (rels: string, id: string) => new RegExp(`<Relationship [^>]*Id="${id}"[^>]*>`).exec(rels)?.[0].match(/Target="([^"]+)"/)?.[1]
  const wbXml = await read('xl/workbook.xml')
  const wbRels = await read('xl/_rels/workbook.xml.rels')
  for (const m of wbXml.matchAll(/<sheet [^>]*>/g)) {
    const name = unescape(/name="([^"]*)"/.exec(m[0])?.[1] ?? '')
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1]
    const target = rid && relTarget(wbRels, rid)
    if (!target) continue
    const sheetPath = resolve('xl/workbook.xml', target)
    const sheetRels = await read(sheetPath.replace('worksheets/', 'worksheets/_rels/') + '.rels')
    const drawingRel = /<drawing r:id="([^"]+)"/.exec(await read(sheetPath))
    const dTarget = drawingRel && relTarget(sheetRels, drawingRel[1])
    if (!dTarget) continue
    const drawingPath = resolve(sheetPath, dTarget)
    const drawingXml = await read(drawingPath)
    const dRels = await read(drawingPath.replace('drawings/', 'drawings/_rels/') + '.rels')
    for (const anchor of drawingXml.matchAll(/<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g)) {
      const crid = /<c:chart [^>]*r:id="([^"]+)"/.exec(anchor[0])?.[1]
      const cTarget = crid && relTarget(dRels, crid)
      if (!cTarget) continue
      const parsed = chartFromXml(await read(resolve(drawingPath, cTarget)))
      if (!parsed) continue
      const pos = (tag: string): CellAnchor => {
        const x = new RegExp(`<xdr:${tag}>([\\s\\S]*?)</xdr:${tag}>`).exec(anchor[0])?.[1] ?? ''
        const g = (k: string) => Number(new RegExp(`<xdr:${k}>(-?\\d+)<`).exec(x)?.[1] ?? 0)
        return { column: g('col'), columnOffset: Math.round(g('colOff') / EMU_PER_PX), row: g('row'), rowOffset: Math.round(g('rowOff') / EMU_PER_PX) }
      }
      out.push({ hostSheet: name, sourceSheet: parsed.sourceSheet || name, spec: parsed.spec, from: pos('from'), to: pos('to') })
    }
  }
  return out
}
