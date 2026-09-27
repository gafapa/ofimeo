// Slide content as neutral elements for the PowerPoint and OpenDocument
// writers: text boxes and basic shapes with formatted paragraphs, images,
// lines with arrows and tables. Anything without a native equivalent (library
// shapes, hand-drawn style, curves, equations) becomes a picture of itself.

import type { Cell, CellState, Graph } from '@maxgraph/core'
import { renderSvg, svgToPng } from '../../diagram/export'
import type { PresentationData, SlideData } from '../model'
import { parseBackground } from '../model'
import type { SlideRenderer } from '../render'
import { graphPictureMeta } from '../mathgraph'
import type { DataCell } from '../../diagram/graph'
import type { ChartData } from './chart'

export interface Run {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  color?: string
  // CSS pixels.
  size?: number
  font?: string
}

export interface Paragraph {
  runs: Run[]
  bullet?: 'bullet' | 'number'
  align?: 'left' | 'center' | 'right' | 'justify'
}

export type Geom = 'rect' | 'roundRect' | 'ellipse' | 'triangle' | 'diamond' | 'hexagon' | 'parallelogram' | 'cloud'

interface Box {
  x: number
  y: number
  w: number
  h: number
  rotation: number
}

export interface TextElement extends Box {
  kind: 'text'
  geom: Geom
  fill: string | null
  fillOpacity: number
  stroke: string | null
  strokeWidth: number
  dash: 'solid' | 'dash' | 'dot'
  paragraphs: Paragraph[]
  align: 'left' | 'center' | 'right'
  valign: 'top' | 'middle' | 'bottom'
  // Inner margins in px: top, right, bottom, left.
  padding: [number, number, number, number]
  base: Run
}

export interface ImageElement extends Box {
  kind: 'image'
  // data: URL (PNG, JPEG, GIF or SVG).
  data: string
  // Math graphs: picture name ("ofimeo-graph:{…}", restored on import) and alternative text.
  name?: string
  alt?: string
  // Charts: their data, for formats with native charts (the picture is the fallback).
  chart?: NativeChart
}

export interface NativeChart {
  type: 'column' | 'bar' | 'line' | 'area' | 'pie' | 'doughnut' | 'scatter'
  title: string
  legend: 'bottom' | 'top' | 'right' | 'none'
  categories: string[]
  // Scatter: x of every point.
  x?: number[]
  series: { name: string; values: (number | null)[] }[]
  colors: string[]
  stacked?: boolean
  percent?: boolean
  xTitle?: string
  yTitle?: string
}

export interface LineElement {
  kind: 'line'
  points: [number, number][]
  stroke: string
  strokeWidth: number
  dash: 'solid' | 'dash' | 'dot'
  startArrow: Arrow
  endArrow: Arrow
}
export type Arrow = 'none' | 'triangle' | 'arrow' | 'oval' | 'diamond'

export interface TableCellElement {
  paragraphs: Paragraph[]
  fill: string | null
  base: Run
  align: 'left' | 'center' | 'right'
  valign: 'top' | 'middle' | 'bottom'
}

export interface TableElement extends Box {
  kind: 'table'
  colWidths: number[]
  rowHeights: number[]
  rows: TableCellElement[][]
  border: string
}

// `cell`: the top-level cell of the slide the element comes from (animations).
export type SlideElement = (TextElement | ImageElement | LineElement | TableElement) & { cell?: string }

export interface SlideContent {
  slide: SlideData
  background: string | [string, string]
  elements: SlideElement[]
}

type Style = Record<string, unknown>

const GEOMS: Record<string, Geom> = {
  rectangle: 'rect', label: 'rect', text: 'rect', ellipse: 'ellipse', doubleEllipse: 'ellipse', rhombus: 'diamond', triangle: 'triangle',
  hexagon: 'hexagon', parallelogram: 'parallelogram', cloud: 'cloud', process: 'rect',
}

// Every slide as elements, in drawing order.
export async function slideContents(data: PresentationData, renderer: SlideRenderer): Promise<SlideContent[]> {
  const out: SlideContent[] = []
  for (const slide of data.slides) {
    await renderer.prepare(slide.cells)
    const background = parseBackground(slide.background, data.theme)
    // Laid out (and themed) by the offscreen graph.
    renderer.render({ cells: slide.cells, background }, data.width, data.height)
    const elements: SlideElement[] = []
    for (const cell of renderer.topCells()) {
      const start = elements.length
      await collect(renderer.graph, cell, elements)
      for (let i = start; i < elements.length; i++) elements[i].cell = cell.getId() ?? undefined
    }
    out.push({ slide, background, elements })
  }
  return out
}

async function collect(graph: Graph, cell: Cell, out: SlideElement[]): Promise<void> {
  if (!cell.isVisible()) return
  const state = graph.view.getState(cell)
  if (!state) return
  const style = state.style as Style
  if (cell.isEdge()) return edge(graph, cell, state, out)
  const own = (cell.getStyle() ?? {}) as Style
  if (flag(own.slideTable)) {
    const table = tableOf(graph, cell, state)
    if (table) return void out.push(table)
  }
  const bases = (own.baseStyleNames as string[] | undefined) ?? []
  const isGroup = bases.includes('group') && cell.getChildCount() > 0
  if (isGroup) {
    for (let i = 0; i < cell.getChildCount(); i++) await collect(graph, cell.getChildAt(i), out)
    return
  }
  const shape = String(style.shape ?? 'rectangle')
  const geom = GEOMS[shape]
  const native = geom && !flag(style.sketch) && !flag(own.slideEq) && !flag(style.glass) && style.labelPosition === undefined && style.verticalLabelPosition === undefined
  if (shape === 'image' && typeof style.image === 'string') {
    const box = boxOf(state, style)
    const src = String(style.image)
    const chart = flag(own.slideChart) ? await nativeChart((cell as DataCell).woData) : undefined
    const mathGraph = flag(own.slideGraph) ? graphPictureMeta((cell as DataCell).woData) : undefined
    out.push({ kind: 'image', ...box, data: src.startsWith('data:') ? src : await pictureOf(graph, [cell], box), ...(chart ? { chart } : {}), ...mathGraph })
    const label = labelText(cell)
    if (label) out.push(textElement(cell, state, style, { ...box, y: box.y + box.h + 2, h: 30, rotation: 0 }, 'rect', true))
  } else if (native) {
    out.push(textElement(cell, state, style, boxOf(state, style), style.rounded && geom === 'rect' ? 'roundRect' : geom, false))
  } else {
    const bounds = graph.getBoundingBox([cell])
    if (!bounds) return
    const box = { x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height, rotation: 0 }
    out.push({ kind: 'image', ...box, data: await pictureOf(graph, [cell], box) })
    return
  }
  // Children of shapes that are not groups (e.g. containers).
  for (let i = 0; i < cell.getChildCount(); i++) await collect(graph, cell.getChildAt(i), out)
}

// The chart of a chart cell: an Ofimeo chart (charts.ts) or one imported from PowerPoint.
async function nativeChart(woData: string | undefined): Promise<NativeChart | undefined> {
  let data: { ofimeoChart?: unknown; chart?: ChartData } = {}
  try {
    data = JSON.parse(woData ?? '{}')
  } catch {
    return undefined
  }
  if (data.ofimeoChart) {
    const { readEmbedded, plainSeries } = await import('../../charts/embedded')
    const { PALETTES } = await import('../../sheet/charts/model')
    const c = readEmbedded(data.ofimeoChart)
    if (!c) return undefined
    const d = plainSeries(c)
    return { type: c.spec.type, title: c.spec.title, legend: c.spec.legend, categories: d.categories, x: d.x?.map((v) => v ?? 0), series: d.series, colors: PALETTES[c.spec.palette] ?? PALETTES.ofimeo, xTitle: c.spec.xTitle, yTitle: c.spec.yTitle }
  }
  const c = data.chart
  if (!c?.series) return undefined
  return {
    type: c.type,
    title: c.title,
    legend: c.legend ? 'bottom' : 'none',
    categories: c.categories,
    series: c.series.map((s) => ({ name: s.name, values: s.values })),
    colors: c.type === 'pie' || c.type === 'doughnut' ? (c.series[0]?.pointColors?.filter((x): x is string => !!x) ?? []) : c.series.map((s) => s.color).filter((x): x is string => !!x),
    stacked: c.stacked,
    percent: c.percent,
  }
}

function boxOf(state: CellState, style: Style): Box {
  return { x: state.x, y: state.y, w: state.width, h: state.height, rotation: Number(style.rotation ?? 0) || 0 }
}

function labelText(cell: Cell): string {
  const v = cell.getValue()
  return v === null || v === undefined ? '' : String(v)
}

function textElement(cell: Cell, _state: CellState, style: Style, box: Box, geom: Geom, labelOnly: boolean): TextElement {
  const fill = labelOnly ? null : color(style.fillColor)
  const stroke = labelOnly ? null : color(style.strokeColor)
  const base = baseRun(style)
  const spacing = Number(style.spacing ?? 2)
  const pad = (key: string, extra: number) => (Number(style[key] ?? 0) || 0) + spacing + extra
  return {
    kind: 'text',
    ...box,
    geom,
    fill,
    fillOpacity: (Number(style.fillOpacity ?? 100) * Number(style.opacity ?? 100)) / 10000,
    stroke,
    strokeWidth: Number(style.strokeWidth ?? 1) || 1,
    dash: dashOf(style),
    paragraphs: toParagraphs(labelText(cell), String(style.html ?? '') === '1' || style.whiteSpace === 'wrap', base),
    align: (['left', 'center', 'right'].includes(String(style.align)) ? style.align : 'center') as TextElement['align'],
    valign: (['top', 'middle', 'bottom'].includes(String(style.verticalAlign)) ? style.verticalAlign : 'middle') as TextElement['valign'],
    padding: [pad('spacingTop', 5), pad('spacingRight', 0), pad('spacingBottom', 1), pad('spacingLeft', 0)],
    base,
  }
}

function baseRun(style: Style): Run {
  const fontStyle = Number(style.fontStyle ?? 0)
  return {
    text: '',
    bold: (fontStyle & 1) !== 0,
    italic: (fontStyle & 2) !== 0,
    underline: (fontStyle & 4) !== 0,
    strike: (fontStyle & 8) !== 0,
    color: color(style.fontColor) ?? '#000000',
    size: Number(style.fontSize ?? 12),
    font: String(style.fontFamily ?? 'Helvetica').split(',')[0].replace(/['"]/g, '').trim(),
  }
}

function dashOf(style: Style): 'solid' | 'dash' | 'dot' {
  if (!flag(style.dashed)) return 'solid'
  return String(style.dashPattern ?? '').startsWith('1 ') ? 'dot' : 'dash'
}

function edge(graph: Graph, cell: Cell, state: CellState, out: SlideElement[]): Promise<void> | void {
  const style = state.style as Style
  const points = (state.absolutePoints ?? []).filter(Boolean).map((p) => [p!.x, p!.y] as [number, number])
  if (points.length < 2 || flag(style.curved) || flag(style.sketch) || (style.shape && style.shape !== 'connector')) {
    const bounds = graph.getBoundingBox([cell])
    if (!bounds) return
    const box = { x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height, rotation: 0 }
    return pictureOf(graph, [cell], box).then((data) => void out.push({ kind: 'image', ...box, data }))
  }
  out.push({
    kind: 'line',
    points,
    stroke: color(style.strokeColor) ?? '#000000',
    strokeWidth: Number(style.strokeWidth ?? 1) || 1,
    dash: dashOf(style),
    startArrow: arrowOf(style.startArrow),
    endArrow: arrowOf(style.endArrow),
  })
  // The label, as a text box where it is drawn.
  const text = state.text?.boundingBox
  const label = labelText(cell)
  if (label && text) {
    const base = baseRun(style)
    out.push({
      kind: 'text', x: text.x, y: text.y, w: text.width, h: text.height, rotation: 0, geom: 'rect',
      fill: color(style.labelBackgroundColor), fillOpacity: 1, stroke: null, strokeWidth: 1, dash: 'solid',
      paragraphs: toParagraphs(label, String(style.html ?? '') === '1', base), align: 'center', valign: 'middle', padding: [0, 0, 0, 0], base,
    })
  }
}

function arrowOf(value: unknown): Arrow {
  const v = String(value ?? 'none')
  if (v === 'none' || !v) return 'none'
  if (v.startsWith('oval')) return 'oval'
  if (v.startsWith('diamond')) return 'diamond'
  if (v === 'open' || v === 'openThin') return 'arrow'
  return 'triangle'
}

// Tables inserted from the slides toolbar: a group of cells on a grid.
function tableOf(graph: Graph, table: Cell, state: CellState): TableElement | null {
  const cells: { cell: Cell; x: number; y: number; w: number; h: number }[] = []
  for (let i = 0; i < table.getChildCount(); i++) {
    const cell = table.getChildAt(i)
    const s = graph.view.getState(cell)
    if (s) cells.push({ cell, x: s.x, y: s.y, w: s.width, h: s.height })
  }
  if (!cells.length) return null
  const xs = [...new Set(cells.map((c) => Math.round(c.x)))].sort((a, b) => a - b)
  const ys = [...new Set(cells.map((c) => Math.round(c.y)))].sort((a, b) => a - b)
  if (xs.length * ys.length !== cells.length) return null
  const grid: TableCellElement[][] = ys.map(() => [])
  let border = '#9aa0a6'
  for (const c of cells) {
    const style = graph.view.getState(c.cell)!.style as Style
    border = color(style.strokeColor) ?? border
    const base = baseRun(style)
    grid[ys.indexOf(Math.round(c.y))][xs.indexOf(Math.round(c.x))] = {
      paragraphs: toParagraphs(labelText(c.cell), true, base),
      fill: color(style.fillColor),
      base,
      align: (['left', 'center', 'right'].includes(String(style.align)) ? style.align : 'center') as TableCellElement['align'],
      valign: (['top', 'middle', 'bottom'].includes(String(style.verticalAlign)) ? style.verticalAlign : 'middle') as TableCellElement['valign'],
    }
  }
  const colWidths = xs.map((x) => cells.find((c) => Math.round(c.x) === x)!.w)
  const rowHeights = ys.map((y) => cells.find((c) => Math.round(c.y) === y)!.h)
  return { kind: 'table', x: state.x, y: state.y, w: state.width, h: state.height, rotation: 0, colWidths, rowHeights, rows: grid, border }
}

// PNG (data URL) of cells as drawn, at twice the resolution.
async function pictureOf(graph: Graph, cells: Cell[], _box: Box): Promise<string> {
  const svg = renderSvg(graph, { cells, border: 0, background: null })
  const png = await svgToPng(svg, 2)
  return blobToDataUrl(png)
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

// Any image data URL as PNG (for SVG images, which not every reader supports).
export async function toPng(data: string, width: number, height: number): Promise<string> {
  if (!data.startsWith('data:image/svg')) return data
  const img = new Image()
  img.src = data
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * 2))
  canvas.height = Math.max(1, Math.round(height * 2))
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

// A background as a PNG (gradients).
export function gradientPng(colors: [string, string], width: number, height: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width)
  canvas.height = Math.round(height)
  const ctx = canvas.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height)
  g.addColorStop(0, colors[0])
  g.addColorStop(1, colors[1])
  ctx.fillStyle = g
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

// ---------- Labels → paragraphs ----------

export function toParagraphs(label: string, html: boolean, base: Run): Paragraph[] {
  if (!label) return []
  if (!html) return label.split('\n').map((line) => ({ runs: line ? [{ ...base, text: line }] : [] }))
  const doc = new DOMParser().parseFromString(`<body>${label}</body>`, 'text/html')
  const out: Paragraph[] = []
  let current: Paragraph = { runs: [] }
  let open = false
  const flush = (force = false) => {
    if (open || force || current.runs.length) out.push(current)
    current = { runs: [], bullet: current.bullet }
    open = false
  }
  const walk = (node: Node, run: Run, list: 'bullet' | 'number' | undefined, align: Paragraph['align']) => {
    if (node.nodeType === 3) {
      const text = (node.textContent ?? '').replace(/[\s\n\r\t]+/g, ' ').replace(/ /g, ' ')
      if (!text) return
      if (!current.runs.length && !text.trim() && !open) return
      current.runs.push({ ...run, text })
      open = true
      return
    }
    if (node.nodeType !== 1) return
    const elm = node as HTMLElement
    const tag = elm.tagName
    if (tag === 'BR') {
      flush(true)
      current.bullet = list
      current.align = align
      return
    }
    const next = { ...run }
    if (tag === 'B' || tag === 'STRONG') next.bold = true
    if (tag === 'I' || tag === 'EM') next.italic = true
    if (tag === 'U') next.underline = true
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') next.strike = true
    if (tag === 'FONT') {
      const c = elm.getAttribute('color')
      if (c) next.color = color(c) ?? next.color
      const face = elm.getAttribute('face')
      if (face) next.font = face.split(',')[0].replace(/['"]/g, '').trim()
      const size = Number(elm.getAttribute('size'))
      if (size) next.size = [10, 13, 16, 18, 24, 32, 48][Math.min(7, Math.max(1, size)) - 1]
    }
    const s = elm.style
    if (s.color) next.color = color(s.color) ?? next.color
    if (s.fontWeight) next.bold = s.fontWeight === 'bold' || Number(s.fontWeight) >= 600
    if (s.fontStyle) next.italic = s.fontStyle === 'italic'
    if (s.textDecoration || s.textDecorationLine) {
      const d = s.textDecoration || s.textDecorationLine
      next.underline = d.includes('underline')
      next.strike = d.includes('line-through')
    }
    if (s.fontSize) {
      const m = /^([\d.]+)(px|pt)$/.exec(s.fontSize)
      if (m) next.size = m[2] === 'pt' ? Number(m[1]) / 0.75 : Number(m[1])
    }
    if (s.fontFamily) next.font = s.fontFamily.split(',')[0].replace(/['"]/g, '').trim()
    let nextAlign = align
    const a = s.textAlign || elm.getAttribute('align')
    if (a === 'left' || a === 'center' || a === 'right' || a === 'justify') nextAlign = a
    const block = /^(DIV|P|LI|H[1-6]|BLOCKQUOTE|PRE|UL|OL|TABLE|TR)$/.test(tag)
    const nextList = tag === 'UL' ? 'bullet' : tag === 'OL' ? 'number' : list
    if (/^H[1-6]$/.test(tag)) next.bold = true
    if (block) {
      if (current.runs.length || open) flush()
      current.bullet = tag === 'LI' ? list : undefined
      current.align = nextAlign
    }
    for (const child of [...elm.childNodes]) walk(child, next, nextList, nextAlign)
    if (block && (current.runs.length || open)) {
      flush()
      current.bullet = undefined
    }
  }
  walk(doc.body, base, undefined, undefined)
  if (current.runs.length) out.push(current)
  // Trim trailing whitespace of each paragraph and trailing empty paragraphs.
  for (const p of out) {
    const last = p.runs.at(-1)
    if (last) last.text = last.text.replace(/\s+$/, '')
    const first = p.runs[0]
    if (first) first.text = first.text.replace(/^\s+/, '')
    p.runs = p.runs.filter((r) => r.text)
  }
  while (out.length && !out.at(-1)!.runs.length) out.pop()
  return out
}

// ---------- Helpers ----------

function flag(v: unknown): boolean {
  return v === true || v === 1 || v === '1'
}

let colorCtx: CanvasRenderingContext2D | null = null

// Any CSS color → "#rrggbb" (null for none / transparent).
export function color(value: unknown): string | null {
  if (value === undefined || value === null) return null
  const v = String(value).trim()
  if (!v || v === 'none' || v === 'transparent') return null
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase()
  if (/^#[0-9a-f]{3}$/i.test(v)) return `#${[...v.slice(1)].map((c) => c + c).join('')}`.toLowerCase()
  colorCtx ??= document.createElement('canvas').getContext('2d')
  if (!colorCtx) return null
  colorCtx.fillStyle = '#000000'
  colorCtx.fillStyle = v
  const out = String(colorCtx.fillStyle)
  if (out.startsWith('#')) return out
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(out)
  if (!m) return null
  if (m[4] !== undefined && Number(m[4]) === 0) return null
  return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`
}
