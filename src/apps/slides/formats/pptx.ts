// PowerPoint (.pptx) export with pptxgenjs: text boxes and basic shapes stay
// editable, lines keep their arrows, tables become native tables; other shapes
// are embedded as pictures. Speaker notes are included.

import PptxGenJS from 'pptxgenjs'
import type { PresentationData } from '../model'
import type { SlideRenderer } from '../render'
import { gradientPng, slideContents, toPng, type NativeChart, type Paragraph, type Run, type SlideElement, type TextElement } from './elements'
import { addPptxAnimations } from './pptx-anim'

const PX = 1 / 96 // inches per CSS pixel
const PT = 0.75 // points per CSS pixel

type Pptx = InstanceType<typeof PptxGenJS>
type Slide = ReturnType<Pptx['addSlide']>
type TextRun = PptxGenJS.TextProps

const hex = (c: string | null | undefined) => (c ? c.replace('#', '').toUpperCase() : undefined)
const data = (url: string) => url.replace(/^data:/, '')

export async function exportPptx(pres: PresentationData, renderer: SlideRenderer): Promise<Blob> {
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'WORDS_ONLINE', width: pres.width * PX, height: pres.height * PX })
  pptx.layout = 'WORDS_ONLINE'
  pptx.title = pres.slides[0]?.name ?? ''
  const shapes = pptx.ShapeType
  const geomShape: Record<TextElement['geom'], PptxGenJS.SHAPE_NAME> = {
    rect: shapes.rect,
    roundRect: shapes.roundRect,
    ellipse: shapes.ellipse,
    triangle: shapes.triangle,
    diamond: shapes.diamond,
    hexagon: shapes.hexagon,
    parallelogram: shapes.parallelogram,
    cloud: shapes.cloud,
  }

  // Per slide: the objects pptxgenjs added for each cell (for animations).
  const objects: Map<string, number[]>[] = []
  for (const content of await slideContents(pres, renderer)) {
    const slide = pptx.addSlide()
    const bg = content.background
    slide.background = Array.isArray(bg) ? { data: data(gradientPng(bg, pres.width, pres.height)) } : { color: hex(bg) }
    const added = new Map<string, number[]>()
    let count = 0
    for (const element of content.elements) {
      const n = await addElement(slide, element, geomShape, shapes)
      if (element.cell) added.set(element.cell, [...(added.get(element.cell) ?? []), ...Array.from({ length: n }, (_, i) => count + i)])
      count += n
    }
    objects.push(added)
    if (content.slide.notes) slide.addNotes(content.slide.notes)
  }
  const blob = (await pptx.write({ outputType: 'blob' })) as Blob
  return addPptxAnimations(
    blob,
    pres.slides.map((s, i) => ({ objects: objects[i] ?? new Map(), animations: s.animations ?? [], transition: s.transition, transitionDuration: s.transitionDuration })),
    pres.theme.id,
  )
}

// Adds an element; returns the number of objects (shapes) it became.
async function addElement(slide: Slide, e: SlideElement, geomShape: Record<TextElement['geom'], PptxGenJS.SHAPE_NAME>, shapes: Pptx['ShapeType']): Promise<number> {
  if (e.kind === 'image' && e.chart && addChart(slide, e, e.chart)) return 1
  if (e.kind === 'image') {
    slide.addImage({ data: data(await toPng(e.data, e.w, e.h)), x: e.x * PX, y: e.y * PX, w: e.w * PX, h: e.h * PX, rotate: e.rotation || undefined, ...(e.name ? { objectName: e.name } : {}), ...(e.alt ? { altText: e.alt } : {}) })
    return 1
  }
  if (e.kind === 'line') {
    const dash = e.dash === 'dash' ? 'dash' : e.dash === 'dot' ? 'sysDot' : 'solid'
    for (let i = 0; i < e.points.length - 1; i++) {
      const [x1, y1] = e.points[i]
      const [x2, y2] = e.points[i + 1]
      slide.addShape(shapes.line, {
        x: Math.min(x1, x2) * PX,
        y: Math.min(y1, y2) * PX,
        w: Math.max(Math.abs(x2 - x1), 0.01) * PX,
        h: Math.max(Math.abs(y2 - y1), 0.01) * PX,
        flipH: x2 < x1,
        flipV: y2 < y1,
        line: {
          color: hex(e.stroke),
          width: e.strokeWidth * PT,
          dashType: dash,
          beginArrowType: i === 0 && e.startArrow !== 'none' ? e.startArrow : undefined,
          endArrowType: i === e.points.length - 2 && e.endArrow !== 'none' ? e.endArrow : undefined,
        },
      })
    }
    return Math.max(0, e.points.length - 1)
  }
  if (e.kind === 'table') {
    const rows: PptxGenJS.TableRow[] = e.rows.map((row) =>
      row.map((cell) => ({
        text: runs(cell.paragraphs, cell.base),
        options: {
          fill: cell.fill ? { color: hex(cell.fill) } : undefined,
          align: cell.align,
          valign: cell.valign,
          fontFace: cell.base.font,
          fontSize: (cell.base.size ?? 12) * PT,
          color: hex(cell.base.color),
          bold: cell.base.bold,
          margin: 4,
        },
      })),
    )
    slide.addTable(rows, {
      x: e.x * PX,
      y: e.y * PX,
      w: e.w * PX,
      colW: e.colWidths.map((w) => w * PX),
      rowH: e.rowHeights.map((h) => h * PX),
      border: { type: 'solid', pt: 1, color: hex(e.border) },
    })
    return 1
  }
  const text = runs(e.paragraphs, e.base)
  const options: PptxGenJS.TextPropsOptions = {
    x: e.x * PX,
    y: e.y * PX,
    w: e.w * PX,
    h: e.h * PX,
    rotate: e.rotation || undefined,
    shape: geomShape[e.geom],
    fill: e.fill ? { color: hex(e.fill), transparency: Math.round((1 - e.fillOpacity) * 100) || undefined } : undefined,
    line: e.stroke ? { color: hex(e.stroke), width: e.strokeWidth * PT, dashType: e.dash === 'dash' ? 'dash' : e.dash === 'dot' ? 'sysDot' : 'solid' } : undefined,
    rectRadius: e.geom === 'roundRect' ? 0.1 : undefined,
    align: e.align,
    valign: e.valign,
    margin: e.padding.map((p) => Math.max(0, p * PT)) as [number, number, number, number],
    fontFace: e.base.font,
    fontSize: (e.base.size ?? 12) * PT,
    color: hex(e.base.color),
    fit: 'none',
    wrap: true,
  }
  if (!text.length && !e.fill && !e.stroke) return 0
  slide.addText(text.length ? text : '', options)
  return 1
}

// A native PowerPoint chart; false when pptxgenjs cannot write it.
function addChart(slide: Slide, e: { x: number; y: number; w: number; h: number }, c: NativeChart): boolean {
  const types = { column: 'bar', bar: 'bar', line: 'line', area: 'area', pie: 'pie', doughnut: 'doughnut', scatter: 'scatter' } as const
  const data =
    c.type === 'scatter'
      ? [{ name: 'X', values: c.x ?? c.series[0]?.values.map((_, i) => i + 1) ?? [] }, ...c.series.map((s) => ({ name: s.name, values: s.values.map((v) => v ?? 0) }))]
      : (c.type === 'pie' || c.type === 'doughnut' ? c.series.slice(0, 1) : c.series).map((s) => ({ name: s.name, labels: c.categories, values: s.values.map((v) => v ?? 0) }))
  if (!data.length) return false
  try {
    slide.addChart(types[c.type] as PptxGenJS.CHART_NAME, data, {
      x: e.x * PX,
      y: e.y * PX,
      w: e.w * PX,
      h: e.h * PX,
      barDir: c.type === 'bar' ? 'bar' : 'col',
      barGrouping: c.percent ? 'percentStacked' : c.stacked ? 'stacked' : 'clustered',
      title: c.title || undefined,
      showTitle: !!c.title,
      showLegend: c.legend !== 'none',
      legendPos: c.legend === 'top' ? 't' : c.legend === 'right' ? 'r' : 'b',
      chartColors: c.colors.length ? c.colors.map((x) => hex(x)!) : undefined,
      holeSize: c.type === 'doughnut' ? 50 : undefined,
      showValAxisTitle: !!c.yTitle && c.type !== 'pie' && c.type !== 'doughnut',
      valAxisTitle: c.yTitle || undefined,
      showCatAxisTitle: !!c.xTitle && c.type !== 'pie' && c.type !== 'doughnut',
      catAxisTitle: c.xTitle || undefined,
      lineDataSymbol: c.type === 'scatter' ? 'circle' : undefined,
      lineSize: c.type === 'scatter' ? 0 : undefined,
    })
    return true
  } catch {
    return false
  }
}

// Paragraphs → pptxgenjs text runs (a line break ends each paragraph).
function runs(paragraphs: Paragraph[], base: Run): TextRun[] {
  const out: TextRun[] = []
  paragraphs.forEach((p, pi) => {
    const list = p.runs.length ? p.runs : [{ ...base, text: '' }]
    list.forEach((r, ri) => {
      const last = ri === list.length - 1 && pi < paragraphs.length - 1
      out.push({
        text: r.text,
        options: {
          bold: r.bold || undefined,
          italic: r.italic || undefined,
          underline: r.underline ? { style: 'sng' } : undefined,
          strike: r.strike ? 'sngStrike' : undefined,
          color: hex(r.color),
          fontSize: r.size ? Math.round(r.size * PT * 10) / 10 : undefined,
          fontFace: r.font,
          bullet: ri === 0 && p.bullet ? (p.bullet === 'number' ? { type: 'number' } : true) : undefined,
          align: p.align,
          breakLine: last || undefined,
        },
      })
    })
  })
  return out
}
