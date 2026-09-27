// Ink layer of a page: pen and highlighter strokes drawn over the text with a
// mouse, a finger or a stylus (the pen follows the stylus pressure), and a
// stroke eraser. Strokes are page pixels (the page has a fixed width, see
// PAGE_WIDTH) in the Y.Array nb-ink:<page>; a stroke is added when it is
// finished and removed whole by the eraser. With "Draw with the stylus" on,
// a stylus draws even when the Type tool is selected (fingers and the mouse
// still select text).

import * as Y from 'yjs'
import { inkArray, NB_ORIGIN, newId, type InkTool, type Stroke } from './model'

export type Tool = 'type' | InkTool | 'eraser'

const SVG_NS = 'http://www.w3.org/2000/svg'
const HIGHLIGHT_OPACITY = 0.35

const round = (n: number) => Math.round(n * 10) / 10

// Outline of a pen stroke whose width follows the pressure: a filled polygon
// with round ends (a circle for a dot).
export function penPath(points: number[], width: number): string {
  const n = points.length / 3
  if (!n) return ''
  const r = (i: number) => (width * (0.35 + 0.9 * (points[i * 3 + 2] || 0.5))) / 2
  if (n === 1 || (n === 2 && Math.hypot(points[3] - points[0], points[4] - points[1]) < 0.5)) {
    const [x, y] = points
    const rr = round(r(0))
    return `M${round(x - rr)} ${round(y)}a${rr} ${rr} 0 1 0 ${rr * 2} 0a${rr} ${rr} 0 1 0 ${-rr * 2} 0Z`
  }
  const left: string[] = []
  const right: string[] = []
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1)
    const b = Math.min(n - 1, i + 1)
    let dx = points[b * 3] - points[a * 3]
    let dy = points[b * 3 + 1] - points[a * 3 + 1]
    const len = Math.hypot(dx, dy) || 1
    dx /= len
    dy /= len
    const w = r(i)
    const x = points[i * 3]
    const y = points[i * 3 + 1]
    left.push(`${round(x - dy * w)} ${round(y + dx * w)}`)
    right.push(`${round(x + dy * w)} ${round(y - dx * w)}`)
  }
  const endR = round(r(n - 1))
  const startR = round(r(0))
  return `M${left[0]}L${left.join('L')}A${endR} ${endR} 0 0 0 ${right[n - 1]}L${right.reverse().join('L')}A${startR} ${startR} 0 0 0 ${left[0]}Z`
}

export function linePath(points: number[]): string {
  const out: string[] = []
  for (let i = 0; i < points.length; i += 3) out.push(`${round(points[i])} ${round(points[i + 1])}`)
  if (out.length === 1) out.push(out[0])
  return `M${out.join('L')}`
}

function strokeElement(s: Stroke): SVGPathElement {
  const path = document.createElementNS(SVG_NS, 'path')
  applyStroke(path, s)
  path.dataset.id = s.id
  return path
}

function applyStroke(path: SVGPathElement, s: Stroke): void {
  if (s.tool === 'highlighter') {
    path.setAttribute('d', linePath(s.points))
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke', s.color)
    path.setAttribute('stroke-width', String(s.width))
    path.setAttribute('stroke-linecap', 'round')
    path.setAttribute('stroke-linejoin', 'round')
    path.setAttribute('opacity', String(HIGHLIGHT_OPACITY))
    path.classList.add('nb-hl')
  } else {
    path.setAttribute('d', penPath(s.points, s.width))
    path.setAttribute('fill', s.color)
  }
}

// Bounding box of strokes (with their width).
export function inkBounds(strokes: Stroke[]): { x: number; y: number; width: number; height: number } | null {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const s of strokes) {
    const pad = s.width
    for (let i = 0; i < s.points.length; i += 3) {
      x0 = Math.min(x0, s.points[i] - pad)
      y0 = Math.min(y0, s.points[i + 1] - pad)
      x1 = Math.max(x1, s.points[i] + pad)
      y1 = Math.max(y1, s.points[i + 1] + pad)
    }
  }
  return Number.isFinite(x0) ? { x: Math.max(0, x0), y: Math.max(0, y0), width: x1 - Math.max(0, x0), height: y1 - Math.max(0, y0) } : null
}

const escapeAttr = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!)

// SVG markup of the strokes, cropped to their bounds (exports), or at page coordinates.
export function inkSvg(strokes: Stroke[], crop = true): string | null {
  const box = inkBounds(strokes)
  if (!box) return null
  const vb = crop ? `${round(box.x)} ${round(box.y)} ${round(box.width)} ${round(box.height)}` : `0 0 ${round(box.x + box.width)} ${round(box.y + box.height)}`
  const [, , w, h] = vb.split(' ')
  const body = strokes
    .map((s) =>
      s.tool === 'highlighter'
        ? `<path d="${linePath(s.points)}" fill="none" stroke="${escapeAttr(s.color)}" stroke-width="${s.width}" stroke-linecap="round" stroke-linejoin="round" opacity="${HIGHLIGHT_OPACITY}"/>`
        : `<path d="${penPath(s.points, s.width)}" fill="${escapeAttr(s.color)}"/>`,
    )
    .join('')
  return `<svg xmlns="${SVG_NS}" viewBox="${vb}" width="${w}" height="${h}">${body}</svg>`
}

// PNG picture of the strokes (for Word, OpenDocument and PDF exports), cropped, at 2x.
export async function inkPng(strokes: Stroke[]): Promise<{ src: string; width: number; height: number } | null> {
  const box = inkBounds(strokes)
  if (!box || typeof document === 'undefined') return null
  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(box.width * scale))
  canvas.height = Math.max(1, Math.ceil(box.height * scale))
  const g = canvas.getContext('2d')
  if (!g) return null
  g.scale(scale, scale)
  g.translate(-box.x, -box.y)
  for (const s of strokes) {
    if (s.tool === 'highlighter') {
      g.globalAlpha = HIGHLIGHT_OPACITY
      g.strokeStyle = s.color
      g.lineWidth = s.width
      g.lineCap = 'round'
      g.lineJoin = 'round'
      g.stroke(new Path2D(linePath(s.points)))
    } else {
      g.globalAlpha = 1
      g.fillStyle = s.color
      g.fill(new Path2D(penPath(s.points, s.width)))
    }
  }
  return { src: canvas.toDataURL('image/png'), width: Math.round(box.width), height: Math.round(box.height) }
}

export interface InkOptions {
  doc: Y.Doc
  // The page element the layer covers (its unscaled size is the page size).
  host: HTMLElement
  // Current zoom of the page (CSS transform scale).
  scale: () => number
  canEdit: () => boolean
  // Called before a gesture that changes the ink (one undo step per gesture).
  onGesture: () => void
  onChange: () => void
}

export class InkLayer {
  readonly svg: SVGSVGElement
  tool: Tool = 'type'
  color = '#1a237e'
  width = 3
  highlightColor = '#ffeb3b'
  // A stylus draws with the pen while the Type tool is selected.
  stylusDraws = true
  private page: string | null = null
  private array: Y.Array<Stroke> | null = null
  private live: { path: SVGPathElement; stroke: Stroke; pointer: number } | null = null
  private erasing: number | null = null
  private observer = () => this.render()

  constructor(private o: InkOptions) {
    this.svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement
    this.svg.classList.add('nb-ink')
    this.svg.setAttribute('aria-hidden', 'true')
    o.host.append(this.svg)
    this.svg.addEventListener('pointerdown', (e) => this.down(e, this.tool))
    // Stylus on the text (Type tool): draw instead of selecting.
    o.host.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType === 'pen' && this.tool === 'type' && this.stylusDraws && this.o.canEdit() && e.button === 0) {
          e.preventDefault()
          e.stopPropagation()
          this.down(e, 'pen')
        }
      },
      true,
    )
    this.svg.addEventListener('pointermove', (e) => this.move(e))
    this.svg.addEventListener('pointerup', (e) => this.up(e))
    this.svg.addEventListener('pointercancel', (e) => this.up(e))
  }

  setPage(id: string | null): void {
    this.array?.unobserve(this.observer)
    this.page = id
    this.array = id ? inkArray(this.o.doc, id) : null
    this.array?.observe(this.observer)
    this.live = null
    this.render()
  }

  setTool(tool: Tool): void {
    this.tool = tool
    this.svg.classList.toggle('active', tool !== 'type')
    this.svg.classList.toggle('erasing', tool === 'eraser')
  }

  strokes(): Stroke[] {
    return this.array?.toArray().filter((s) => s && Array.isArray(s.points)) ?? []
  }

  // Lowest point of the ink (the page grows to show it).
  bottom(): number {
    const box = inkBounds(this.strokes())
    return box ? box.y + box.height : 0
  }

  render(): void {
    const strokes = this.strokes()
    const nodes = strokes.map(strokeElement)
    if (this.live) nodes.push(this.live.path)
    this.svg.replaceChildren(...nodes)
    this.o.onChange()
  }

  private point(e: PointerEvent): [number, number, number] {
    const rect = this.svg.getBoundingClientRect()
    const s = this.o.scale() || 1
    // Mice report 0.5 while pressed (or 0); fingers usually 1 or 0.5.
    const pressure = e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5
    return [round((e.clientX - rect.left) / s), round((e.clientY - rect.top) / s), Math.round(pressure * 100) / 100]
  }

  private down(e: PointerEvent, tool: Tool): void {
    if (!this.array || !this.o.canEdit() || tool === 'type' || e.button > 0) return
    e.preventDefault()
    this.svg.setPointerCapture?.(e.pointerId)
    this.o.onGesture()
    if (tool === 'eraser') {
      this.erasing = e.pointerId
      this.erase(e)
      return
    }
    const stroke: Stroke =
      tool === 'highlighter'
        ? { id: newId(), tool, color: this.highlightColor, width: Math.max(12, this.width * 5), points: this.point(e) }
        : { id: newId(), tool: 'pen', color: this.color, width: this.width, points: this.point(e) }
    const path = document.createElementNS(SVG_NS, 'path') as SVGPathElement
    applyStroke(path, stroke)
    this.svg.append(path)
    this.live = { path, stroke, pointer: e.pointerId }
  }

  private move(e: PointerEvent): void {
    if (this.erasing === e.pointerId) return this.erase(e)
    const live = this.live
    if (!live || live.pointer !== e.pointerId) return
    const events = e.getCoalescedEvents?.() ?? [e]
    for (const ev of events.length ? events : [e]) {
      const [x, y, p] = this.point(ev)
      const pts = live.stroke.points
      if (Math.hypot(x - pts[pts.length - 3], y - pts[pts.length - 2]) < 1.2) continue
      pts.push(x, y, p)
    }
    applyStroke(live.path, live.stroke)
  }

  private up(e: PointerEvent): void {
    if (this.erasing === e.pointerId) {
      this.erasing = null
      return
    }
    const live = this.live
    if (!live || live.pointer !== e.pointerId) return
    this.live = null
    const array = this.array
    if (!array) return
    this.o.doc.transact(() => array.push([live.stroke]), NB_ORIGIN)
  }

  private erase(e: PointerEvent): void {
    const array = this.array
    if (!array) return
    const [x, y] = this.point(e)
    const radius = 8 / (this.o.scale() || 1)
    const hits: number[] = []
    array.toArray().forEach((s, i) => {
      const reach = radius + s.width / 2
      const pts = s.points
      for (let j = 0; j < pts.length; j += 3) {
        const x1 = pts[j]
        const y1 = pts[j + 1]
        const x2 = pts[j + 3] ?? x1
        const y2 = pts[j + 4] ?? y1
        if (segmentDistance(x, y, x1, y1, x2, y2) <= reach) {
          hits.push(i)
          break
        }
      }
    })
    if (hits.length) this.o.doc.transact(() => hits.reverse().forEach((i) => array.delete(i, 1)), NB_ORIGIN)
  }

  // Removes all strokes of the page (one undo step).
  clear(): void {
    const array = this.array
    if (!array?.length || !this.o.canEdit()) return
    this.o.onGesture()
    this.o.doc.transact(() => array.delete(0, array.length), NB_ORIGIN)
  }

  get pageId(): string | null {
    return this.page
  }
}

function segmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = dx * dx + dy * dy
  const t = len ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len)) : 0
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}
