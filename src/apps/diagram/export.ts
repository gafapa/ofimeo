// SVG and PNG rendering of the diagram (downloads, printing, palette thumbnails).

import { ImageExport, Rectangle, SvgCanvas2D, type AbstractGraph, type AlignValue, type Cell, type OverflowValue, type TextDirectionValue, type VAlignValue } from '@maxgraph/core'
import { embedSketchFont } from './shapes/sketch'
import { t } from '../../core/i18n'

const SVG_NS = 'http://www.w3.org/2000/svg'

export interface SvgOptions {
  // Output scale (1 = 100%).
  scale?: number
  border?: number
  background?: string | null
  // Only these cells (and their descendants); default: the whole page.
  cells?: Cell[]
  // A fixed area in graph coordinates (e.g. a slide); what lies outside is clipped.
  area?: { x: number; y: number; width: number; height: number }
}

// Labels are HTML in a <foreignObject>, which only browsers draw. Like draw.io,
// each one goes in a <switch> with a plain <text> fallback, so LibreOffice,
// Inkscape, Word and PowerPoint show the words too.
class ExportCanvas extends SvgCanvas2D {
  addForeignObject(x: number, y: number, w: number, h: number, str: string, align: AlignValue, valign: VAlignValue, wrap: boolean, format: string, overflow: OverflowValue, clip: boolean, rotation: number, _dir: TextDirectionValue, div: HTMLElement, root: SVGElement): void {
    const group = this.createElement('g') as SVGElement
    const fo = this.createElement('foreignObject') as SVGForeignObjectElement
    fo.setAttribute('style', 'overflow: visible; text-align: left;')
    fo.setAttribute('pointer-events', 'none')
    fo.appendChild(div)
    group.appendChild(fo)
    this.updateTextNodes(x, y, w, h, align, valign, wrap, overflow, clip, rotation, group)
    const alt = this.createAlternateContent(fo, x, y, w, h, str, align, valign, wrap, format, overflow, clip, rotation)
    if (alt) {
      fo.setAttribute('requiredFeatures', 'http://www.w3.org/TR/SVG11/feature#Extensibility')
      const sw = this.createElement('switch') as SVGElement
      sw.appendChild(fo)
      sw.appendChild(alt)
      group.appendChild(sw)
    }
    root.appendChild(group)
  }

  // The label as plain lines, one <tspan> each, centered on the label's anchor.
  createAlternateContent(fo: SVGForeignObjectElement, x: number, y: number, w: number, h: number, str: string, align: AlignValue, valign: VAlignValue, wrap: boolean, format: string, overflow: OverflowValue, clip: boolean, rotation: number): SVGElement | null {
    const lines = plainLines(str, format)
    const alt = super.createAlternateContent(fo, x, y, w, h, lines.length ? 'x' : (null as unknown as string), align, valign, wrap, format, overflow, clip, rotation)
    if (!alt) return null
    alt.textContent = ''
    const size = this.state.fontSize
    const lineHeight = size * 1.2
    const shift = valign === 'top' ? 0 : valign === 'bottom' ? -(lines.length - 1) * lineHeight : (-(lines.length - 1) * lineHeight) / 2
    const ax = alt.getAttribute('x') ?? '0'
    lines.forEach((line, i) => {
      const span = this.createElement('tspan') as SVGElement
      span.setAttribute('x', ax)
      span.setAttribute('dy', String(Math.round(i ? lineHeight : shift)))
      span.textContent = line
      alt.appendChild(span)
    })
    return alt
  }
}

// Text lines of a label (HTML labels: one per block, list item or line break).
function plainLines(str: unknown, format: string): string[] {
  if (str === null || str === undefined) return []
  let text = typeof str === 'string' ? str : ((str as Element).textContent ?? '')
  if (format === 'html' && typeof str === 'string') {
    const doc = new DOMParser().parseFromString(`<body>${str.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|li|h[1-6]|tr)>/gi, '$&\n')}</body>`, 'text/html')
    text = doc.body.textContent ?? ''
  }
  return text
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l, i, all) => l || (i > 0 && i < all.length - 1))
}

// Renders the graph (as currently laid out) into a standalone SVG element.
export function renderSvg(graph: AbstractGraph, options: SvgOptions = {}): SVGSVGElement {
  const { scale = 1, border = 10, background = '#ffffff', cells, area } = options
  const view = graph.view
  const vs = view.scale
  const t = view.translate
  const bounds = area
    ? new Rectangle((area.x + t.x) * vs, (area.y + t.y) * vs, area.width * vs, area.height * vs)
    : ((cells ? graph.getBoundingBox(cells) : graph.getGraphBounds()) ?? null)
  const width = bounds && bounds.width > 0 ? bounds.width : 0
  const height = bounds && bounds.height > 0 ? bounds.height : 0
  const w = Math.max(1, Math.ceil((width * scale) / vs + 2 * border))
  const h = Math.max(1, Math.ceil((height * scale) / vs + 2 * border))

  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('xmlns', SVG_NS)
  svg.setAttribute('width', String(w))
  svg.setAttribute('height', String(h))
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
  if (background) {
    const rect = document.createElementNS(SVG_NS, 'rect')
    rect.setAttribute('width', '100%')
    rect.setAttribute('height', '100%')
    rect.setAttribute('fill', background)
    svg.append(rect)
  }
  const group = document.createElementNS(SVG_NS, 'g')
  svg.append(group)
  if (!bounds || !width || !height) return svg

  const canvas = new ExportCanvas(group, false)
  canvas.translate(Math.floor((border / scale - bounds.x) / vs), Math.floor((border / scale - bounds.y) / vs))
  canvas.scale(scale / vs)
  const exporter = new ImageExport()
  if (cells) {
    for (const cell of cells) {
      const state = view.getState(cell)
      if (state) exporter.drawState(state, canvas)
    }
  } else {
    const root = view.getState(graph.getDataModel().getRoot()!)
    if (root) exporter.drawState(root, canvas)
  }
  embedSketchFont(svg)
  return svg
}

export function svgToString(svg: SVGSVGElement): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}`
}

export async function svgToPng(svg: SVGSVGElement, pixelRatio = 2): Promise<Blob> {
  const w = Number(svg.getAttribute('width'))
  const h = Number(svg.getAttribute('height'))
  // A data URI (not a blob URL) keeps the canvas exportable with HTML labels (foreignObject) in Chrome.
  const img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgToString(svg))}`
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(w * pixelRatio)
  canvas.height = Math.ceil(h * pixelRatio)
  const ctx = canvas.getContext('2d')!
  ctx.scale(pixelRatio, pixelRatio)
  ctx.drawImage(img, 0, 0, w, h)
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(t('PNG export failed')))), 'image/png'),
  )
}
