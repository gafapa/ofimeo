// Charts embedded in other documents (writer, slides): the sheet chart model
// (../sheet/charts/model.ts) plus a snapshot of the data it draws, so everyone
// sees the chart without the source spreadsheet. A linked chart also records
// where its data comes from (an Ofimeo spreadsheet of the library, a sheet
// and a range) and is refreshed from it when that spreadsheet is available
// in this browser. Drawing uses the sheet's ECharts option and renderer.

import { locale, t } from '../../core/i18n'
import { chartData, normalizeSpec, type Cell, type ChartSpec } from '../sheet/charts/model'
import { chartOption, PAPER_COLORS } from '../sheet/charts/option'

export interface ChartSourceLink {
  // Library document id of the spreadsheet and its title when linked.
  docId: string
  title: string
  sheetId: string
  sheetName: string
  range: string
}

export interface EmbeddedChart {
  spec: ChartSpec
  // Values of the chart's range (a snapshot for linked charts).
  rows: Cell[][]
  // Absent: the data was typed in the document (inline data).
  source?: ChartSourceLink
  // Time the snapshot was taken from the source.
  updated?: number
}

const numberFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 4 })
export const formatChartNumber = (n: number) => numberFormat.format(n)
export const seriesLabel = (n: number) => t('Series {n}', { n })

// Parses a stored chart (JSON text or object); null when unusable.
export function readEmbedded(raw: unknown): EmbeddedChart | null {
  let v = raw
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v)
    } catch {
      return null
    }
  }
  const c = v as Partial<EmbeddedChart> | null
  if (!c || typeof c !== 'object' || !c.spec || !Array.isArray(c.rows)) return null
  const spec = normalizeSpec({ ...c.spec, sheetId: c.spec.sheetId ?? '', range: c.spec.range ?? '' })
  const rows = c.rows.map((r) => (Array.isArray(r) ? r.map((x) => (x === undefined ? null : x)) : []))
  const source = c.source && typeof c.source.docId === 'string' ? c.source : undefined
  return { spec, rows, ...(source ? { source } : {}), ...(c.updated ? { updated: c.updated } : {}) }
}

export const chartJson = (c: EmbeddedChart) => JSON.stringify(c)

export function optionOf(c: EmbeddedChart, width: number) {
  return chartOption(c.spec, chartData(c.spec, c.rows, seriesLabel), PAPER_COLORS, formatChartNumber, width)
}

type EChartsModule = typeof import('../sheet/charts/echarts')
let echartsModule: Promise<EChartsModule> | null = null
export const loadECharts = () => (echartsModule ??= import('../sheet/charts/echarts'))

// SVG of the chart at a size in CSS pixels. `scale` enlarges the declared size
// (not the drawing), so pictures made from it stay sharp when printed.
export async function chartSvg(c: EmbeddedChart, width: number, height: number, scale = 1): Promise<string> {
  const { renderSvg } = await loadECharts()
  const w = Math.max(80, Math.round(width))
  const h = Math.max(60, Math.round(height))
  let svg = renderSvg(optionOf(c, w), w, h)
  if (!/viewBox=/.test(svg.slice(0, 400))) svg = svg.replace('<svg ', `<svg viewBox="0 0 ${w} ${h}" `)
  if (scale !== 1) svg = svg.replace(/^<svg([^>]*?) width="[^"]*" height="[^"]*"/, `<svg$1 width="${w * scale}" height="${h * scale}"`)
  return svg
}

export function svgDataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:image/svg+xml;base64,${btoa(binary)}`
}

// PNG data URL of an SVG drawn at `width` × `height` pixels.
export async function svgToPng(svg: string, width: number, height: number): Promise<string> {
  const img = new Image()
  img.src = svgDataUrl(svg)
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const g = canvas.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, canvas.width, canvas.height)
  g.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

// A PNG of the chart (twice the size, for print quality).
export async function chartPng(c: EmbeddedChart, width: number, height: number): Promise<string> {
  return svgToPng(await chartSvg(c, width, height), width * 2, height * 2)
}

export const sameRows = (a: Cell[][], b: Cell[][]) => JSON.stringify(a) === JSON.stringify(b)

// Series and categories as plain data (native charts in .pptx and .docx).
export function plainSeries(c: EmbeddedChart) {
  return chartData(c.spec, c.rows, seriesLabel)
}

// Name of the source for display: "Sales › Sheet1 › A1:C5" or "Data typed in the document".
export function sourceLabel(c: EmbeddedChart): string {
  if (!c.source) return t('Data typed in the document')
  return [c.source.title || t('Untitled spreadsheet'), c.source.sheetName, c.source.range].filter(Boolean).join(' › ')
}
