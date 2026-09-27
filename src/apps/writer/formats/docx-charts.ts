// Native Word charts for charts of a document. The exporter writes each chart
// as a picture first (docx library), then this module swaps the picture's
// graphic for a DrawingML chart part (the sheet's .xlsx chart writer) with its
// values cached, an embedded workbook holding the data (so Word can edit it),
// and the Ofimeo chart (spec, data, link) in an extension for a lossless round
// trip. The picture stays in the file as the fallback of an
// mc:AlternateContent for readers without chart support.
// Reading: a chart part becomes a chart node (the Ofimeo extension when
// present, else the cached series of any Word chart).

import JSZip from 'jszip'
import { escapeXml } from '../../../core/formats'
import { parseA1, toA1, type Cell, type ChartType } from '../../sheet/charts/model'
import { chartXml } from '../../sheet/formats/xlsx-charts'
import { parseChart } from '../../slides/formats/chart'
import { readEmbedded, type EmbeddedChart } from '../../charts/embedded'

export const CHART_MARK = 'OfimeoChart'
const EXT_URI = '{7B7F2F4E-0F1C-4F5B-9E0A-0F1C0FE1C0DE}'
const EXT_NS = 'urn:ofimeo:chart'
const SHEET = 'Sheet1'

// The chart's rows placed at its range, as a cell lookup.
function lookup(chart: EmbeddedChart): (row: number, col: number) => Cell {
  const r = parseA1(chart.spec.range) ?? { startRow: 0, startColumn: 0, endRow: 0, endColumn: 0 }
  return (row, col) => chart.rows[row - r.startRow]?.[col - r.startColumn] ?? null
}

// A copy of the chart whose range starts at A1 (the embedded workbook's layout).
function atOrigin(chart: EmbeddedChart): EmbeddedChart {
  const width = Math.max(1, ...chart.rows.map((r) => r.length))
  const range = toA1({ startRow: 0, startColumn: 0, endRow: Math.max(0, chart.rows.length - 1), endColumn: width - 1 })
  return { ...chart, spec: { ...chart.spec, range } }
}

export function docxChartXml(chart: EmbeddedChart, embedRid: string | null): string {
  const local = atOrigin(chart)
  const at = { column: 0, columnOffset: 0, row: 0, rowOffset: 0 }
  const xml = chartXml({ spec: local.spec, sourceName: SHEET, value: lookup(local), from: at, to: at })
  const ext = `<c:extLst><c:ext uri="${EXT_URI}" xmlns:o="${EXT_NS}"><o:chart>${escapeXml(JSON.stringify(chart))}</o:chart></c:ext></c:extLst>`
  const external = embedRid ? `<c:externalData r:id="${embedRid}"><c:autoUpdate val="0"/></c:externalData>` : ''
  return xml.replace('</c:chartSpace>', `${external}${ext}</c:chartSpace>`)
}

// A minimal workbook with the chart's rows from A1 (one sheet, inline strings).
export async function chartWorkbook(chart: EmbeddedChart): Promise<Uint8Array> {
  const zip = new JSZip()
  const col = (c: number) => toA1({ startRow: 0, endRow: 0, startColumn: c, endColumn: c }).replace(/\d+$/, '')
  const rows = chart.rows
    .map((row, r) => {
      const cells = row
        .map((v, c) => {
          const ref = `${col(c)}${r + 1}`
          if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`
          if (typeof v === 'boolean') return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`
          if (v === null || v === undefined || v === '') return ''
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(v))}</t></is></c>`
        })
        .join('')
      return `<row r="${r + 1}">${cells}</row>`
    })
    .join('')
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
  zip.file(
    '[Content_Types].xml',
    head +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
  )
  zip.file('_rels/.rels', head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
  zip.file(
    'xl/workbook.xml',
    head + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${SHEET}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  )
  zip.file('xl/_rels/workbook.xml.rels', head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>')
  zip.file('xl/worksheets/sheet1.xml', head + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`)
  return zip.generateAsync({ type: 'uint8array' })
}

const CHART_GRAPHIC = (rid: string) =>
  `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${rid}"/></a:graphicData></a:graphic>`

// Replaces the pictures named OfimeoChart<n> with native charts (charts[n - 1]).
export async function addDocxCharts(blob: Blob, charts: EmbeddedChart[]): Promise<Blob> {
  if (!charts.length) return blob
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const docPath = 'word/document.xml'
  const relsPath = 'word/_rels/document.xml.rels'
  let xml = await zip.file(docPath)!.async('string')
  let rels = await zip.file(relsPath)!.async('string')
  let types = await zip.file('[Content_Types].xml')!.async('string')
  if (!/Extension="xlsx"/.test(types)) types = types.replace('</Types>', '<Default Extension="xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/></Types>')
  for (const [i, chart] of charts.entries()) {
    const n = i + 1
    const mark = xml.indexOf(`name="${CHART_MARK}${n}"`)
    if (mark < 0) continue
    const start = xml.lastIndexOf('<w:drawing>', mark)
    const end = xml.indexOf('</w:drawing>', mark) + '</w:drawing>'.length
    const gStart = xml.indexOf('<a:graphic', mark)
    const gEnd = xml.indexOf('</a:graphic>', gStart) + '</a:graphic>'.length
    if (start < 0 || gStart < 0 || gEnd > end) continue
    const rid = `rIdOfimeoChart${n}`
    const picture = xml.slice(start, end)
    const native = xml.slice(start, gStart) + CHART_GRAPHIC(rid) + xml.slice(gEnd, end)
    xml =
      xml.slice(0, start) +
      `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" Requires="c">${native}</mc:Choice><mc:Fallback>${picture}</mc:Fallback></mc:AlternateContent>` +
      xml.slice(end)
    zip.file(`word/embeddings/Microsoft_Excel_Worksheet${n}.xlsx`, await chartWorkbook(chart))
    zip.file(
      `word/charts/_rels/chart${n}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/package" Target="../embeddings/Microsoft_Excel_Worksheet${n}.xlsx"/></Relationships>`,
    )
    zip.file(`word/charts/chart${n}.xml`, docxChartXml(chart, 'rId1'))
    rels = rels.replace('</Relationships>', `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="charts/chart${n}.xml"/></Relationships>`)
    types = types.replace('</Types>', `<Override PartName="/word/charts/chart${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`)
  }
  zip.file(docPath, xml)
  zip.file(relsPath, rels)
  zip.file('[Content_Types].xml', types)
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
}

// ---------- Reading ----------

const SLIDE_TYPES: Record<string, ChartType> = { column: 'column', bar: 'bar', line: 'line', area: 'area', pie: 'pie', doughnut: 'doughnut' }

// A chart part → embedded chart: the Ofimeo extension, else the cached data.
export function readChartPart(xml: string): EmbeddedChart | null {
  const ext = /<o:chart>([\s\S]*?)<\/o:chart>/.exec(xml)?.[1]
  if (ext) {
    const text = new DOMParser().parseFromString(`<x>${ext}</x>`, 'application/xml').documentElement.textContent ?? ''
    const own = readEmbedded(text)
    if (own) return own
  }
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const data = parseChart(doc, (fill) => {
    const v = fill?.getElementsByTagNameNS('*', 'srgbClr')[0]?.getAttribute('val')
    return v ? `#${v}` : null
  })
  if (!data) return null
  const scatter = !!doc.getElementsByTagNameNS('*', 'scatterChart')[0]
  const type: ChartType = scatter ? 'scatter' : (SLIDE_TYPES[data.type] ?? 'column')
  const rows: Cell[][] = [['', ...data.series.map((s) => s.name)], ...data.categories.map((c, i) => [scatter ? Number(c) : c, ...data.series.map((s) => s.values[i] ?? null)] as Cell[])]
  const width = data.series.length + 1
  const text = (tag: string) => {
    const el = doc.getElementsByTagNameNS('*', tag)[0]
    const title = el?.getElementsByTagNameNS('*', 'title')[0]
    return title ? [...title.getElementsByTagNameNS('*', 't')].map((t) => t.textContent ?? '').join('') : ''
  }
  const legendPos = doc.getElementsByTagNameNS('*', 'legendPos')[0]?.getAttribute('val')
  return {
    spec: {
      kind: 'ofimeo-chart',
      type,
      sheetId: '',
      range: toA1({ startRow: 0, startColumn: 0, endRow: rows.length - 1, endColumn: width - 1 }),
      seriesIn: 'columns',
      headerRow: true,
      headerCol: true,
      title: data.title,
      legend: !data.legend ? 'none' : legendPos === 't' ? 'top' : legendPos === 'r' || legendPos === 'l' ? 'right' : 'bottom',
      xTitle: text(type === 'bar' ? 'valAx' : 'catAx'),
      yTitle: text(type === 'bar' ? 'catAx' : 'valAx'),
      palette: 'ofimeo',
    },
    rows,
  }
}
