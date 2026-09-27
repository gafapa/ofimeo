// Draws a computed construction as an SVG string: grid and axes, function
// curves (explicit, parametric, polar, implicit), shaded inequalities,
// geometry objects with labels, special points and the trace marker. The same
// output is shown in the editor and embedded (as PNG) in documents.

import type { Special } from './analysis'
import type { Computed, Pt, RowResult, Value } from './compute'
import type { GraphDoc, View } from './model'

export interface RenderExtras {
  specials?: Special[]
  trace?: { x: number; y: number; color: string; label: string }
  // Names of highlighted objects (selected row, tool picks).
  highlight?: Set<string>
  // Points picked so far by a construction tool.
  picks?: Pt[]
  // Output pixel ratio (width/height attributes); the viewBox stays in CSS pixels.
  scale?: number
  numberFormat?: (v: number) => string
}

export interface Transform {
  w: number
  h: number
  view: View
  px: (x: number) => number
  py: (y: number) => number
  wx: (px: number) => number
  wy: (py: number) => number
}

export function transform(doc: GraphDoc): Transform {
  const { width: w, height: h, view } = doc
  const sx = w / (view.xmax - view.xmin)
  const sy = h / (view.ymax - view.ymin)
  return {
    w,
    h,
    view,
    px: (x) => (x - view.xmin) * sx,
    py: (y) => h - (y - view.ymin) * sy,
    wx: (px) => view.xmin + px / sx,
    wy: (py) => view.ymin + (h - py) / sy,
  }
}

// 1, 2 or 5 times a power of ten, about `target` long.
export function niceStep(target: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(target)))
  const m = target / p
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p
}

export function gridStep(doc: GraphDoc): { x: number; y: number } {
  const t = transform(doc)
  const unit = Math.abs(t.px(1) - t.px(0))
  const unitY = Math.abs(t.py(1) - t.py(0))
  return { x: niceStep(70 / unit), y: niceStep(70 / unitY) }
}

export function formatNumber(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return v > 0 ? '∞' : v < 0 ? '−∞' : '?'
  const r = Math.round(v * 10 ** digits) / 10 ** digits
  return (Object.is(r, -0) ? 0 : r).toString().replace('-', '−')
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const f2 = (v: number) => (Math.round(v * 100) / 100).toString()

const AXIS = '#5f6368'
const GRID = '#e3e6ea'
const LABEL = '#3c4043'

export function renderSvg(doc: GraphDoc, computed: Computed, extras: RenderExtras = {}): string {
  const tr = transform(doc)
  const { w, h } = tr
  const fmt = extras.numberFormat ?? ((v: number) => formatNumber(v))
  const scale = extras.scale ?? 1
  const parts: string[] = []
  const fills: string[] = []
  const curves: string[] = []
  const geometry: string[] = []
  const points: string[] = []
  const labels: string[] = []
  const hl = extras.highlight ?? new Set<string>()

  for (const r of computed.results) {
    if (r.row.hidden || !r.value || r.kind === 'error') continue
    const color = r.row.color
    const width = hl.has(r.name) ? 3.5 : 2.2
    drawValue(r, r.value, color, width)
  }

  function drawValue(r: RowResult, v: Value, color: string, width: number) {
    switch (v.t) {
      case 'function':
        curves.push(pathEl(functionPath(v.f, tr), color, width))
        break
      case 'vline':
        curves.push(`<line x1="${f2(tr.px(v.x))}" y1="0" x2="${f2(tr.px(v.x))}" y2="${h}" stroke="${color}" stroke-width="${width}"/>`)
        break
      case 'parametric':
        curves.push(pathEl(curvePath((t) => ({ x: v.x(t), y: v.y(t) }), v.tmin, v.tmax, tr), color, width))
        break
      case 'polar':
        curves.push(pathEl(curvePath((t) => ({ x: v.r(t) * Math.cos(t), y: v.r(t) * Math.sin(t) }), v.tmin, v.tmax, tr), color, width))
        break
      case 'ineq': {
        const d = functionPath(v.f, tr)
        const strict = v.op === '<' || v.op === '>'
        fills.push(ineqFill(v.f, v.op === '>' || v.op === '>=', tr, color))
        curves.push(pathEl(d, color, width, strict))
        break
      }
      case 'implicit': {
        const { segments, cells } = marching(v.F, tr, v.op !== '=' ? v.op : null)
        if (v.op !== '=') fills.push(`<path d="${cells}" fill="${color}" fill-opacity="0.18"/>`)
        curves.push(pathEl(segments, color, width, v.op === '<' || v.op === '>'))
        break
      }
      case 'point': {
        const x = tr.px(v.x)
        const y = tr.py(v.y)
        const radius = r.free ? 5 : 4
        points.push(`<circle cx="${f2(x)}" cy="${f2(y)}" r="${hl.has(r.name) ? radius + 2 : radius}" fill="${r.free ? color : '#ffffff'}" stroke="${color}" stroke-width="2"/>`)
        labels.push(textEl(x + 7, y - 7, r.name, color, 'start', true))
        break
      }
      case 'segment':
      case 'line':
      case 'ray': {
        let [a, b] = [v.a, v.b]
        if (v.t !== 'segment') {
          const dx = b.x - a.x
          const dy = b.y - a.y
          const len = Math.hypot(dx, dy) || 1
          const far = (2 * Math.hypot(tr.view.xmax - tr.view.xmin, tr.view.ymax - tr.view.ymin) + Math.hypot(a.x - tr.view.xmin, a.y - tr.view.ymin)) / len
          if (v.t === 'line') a = { x: a.x - dx * far, y: a.y - dy * far }
          b = { x: v.a.x + dx * far, y: v.a.y + dy * far }
        }
        geometry.push(`<line x1="${f2(tr.px(a.x))}" y1="${f2(tr.py(a.y))}" x2="${f2(tr.px(b.x))}" y2="${f2(tr.py(b.y))}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`)
        if (v.t === 'segment' && doc.options.lengths) {
          const mx = tr.px((v.a.x + v.b.x) / 2)
          const my = tr.py((v.a.y + v.b.y) / 2)
          labels.push(textEl(mx + 5, my - 5, fmt(Math.hypot(v.b.x - v.a.x, v.b.y - v.a.y)), color, 'start', false))
        }
        break
      }
      case 'circle': {
        const rx = Math.abs(tr.px(v.r) - tr.px(0))
        const ry = Math.abs(tr.py(v.r) - tr.py(0))
        geometry.push(`<ellipse cx="${f2(tr.px(v.c.x))}" cy="${f2(tr.py(v.c.y))}" rx="${f2(rx)}" ry="${f2(ry)}" fill="none" stroke="${color}" stroke-width="${width}"/>`)
        break
      }
      case 'polygon': {
        const d = v.pts.map((p) => `${f2(tr.px(p.x))},${f2(tr.py(p.y))}`).join(' ')
        geometry.unshift(`<polygon points="${d}" fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-width="${width}" stroke-linejoin="round"/>`)
        break
      }
      case 'angle': {
        const vx = tr.px(v.v.x)
        const vy = tr.py(v.v.y)
        // Screen angles (y down), the smaller arc between the two arms.
        let a1 = Math.atan2(tr.py(v.a.y) - vy, tr.px(v.a.x) - vx)
        let a2 = Math.atan2(tr.py(v.c.y) - vy, tr.px(v.c.x) - vx)
        let diff = a2 - a1
        while (diff > Math.PI) diff -= 2 * Math.PI
        while (diff < -Math.PI) diff += 2 * Math.PI
        if (diff < 0) [a1, a2, diff] = [a2, a1, -diff]
        const rad = 22
        const x1 = vx + rad * Math.cos(a1)
        const y1 = vy + rad * Math.sin(a1)
        const x2 = vx + rad * Math.cos(a1 + diff)
        const y2 = vy + rad * Math.sin(a1 + diff)
        const right = Math.abs(v.deg - 90) < 1e-6
        if (right) {
          const s = 12
          const ux = Math.cos(a1), uy = Math.sin(a1)
          const wx = Math.cos(a1 + diff), wy = Math.sin(a1 + diff)
          geometry.push(`<path d="M${f2(vx + s * ux)},${f2(vy + s * uy)} L${f2(vx + s * (ux + wx))},${f2(vy + s * (uy + wy))} L${f2(vx + s * wx)},${f2(vy + s * wy)}" fill="none" stroke="${color}" stroke-width="1.6"/>`)
        } else {
          geometry.push(`<path d="M${f2(vx)},${f2(vy)} L${f2(x1)},${f2(y1)} A${rad},${rad} 0 0 1 ${f2(x2)},${f2(y2)} Z" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="1.6"/>`)
        }
        const mid = a1 + diff / 2
        labels.push(textEl(vx + (rad + 16) * Math.cos(mid), vy + (rad + 16) * Math.sin(mid) + 4, `${r.name} = ${fmt(v.deg)}°`, color, 'middle', false))
        break
      }
      case 'number':
        break
    }
  }

  // Grid and axes.
  const step = gridStep(doc)
  const grid: string[] = []
  const axes: string[] = []
  const ticks: string[] = []
  const x0 = tr.px(0)
  const y0 = tr.py(0)
  const axisY = Math.min(h - 4, Math.max(4, y0))
  const axisX = Math.min(w - 4, Math.max(4, x0))
  for (let k = Math.ceil(tr.view.xmin / step.x); k * step.x <= tr.view.xmax; k++) {
    const x = tr.px(k * step.x)
    if (doc.options.grid) grid.push(`M${f2(x)},0V${h}`)
    if (doc.options.axes && doc.options.numbers && k !== 0 && x > 12 && x < w - 12) {
      ticks.push(textEl(x, axisY + (y0 > h - 20 ? -6 : 15), fmt(k * step.x), LABEL, 'middle', false, true))
    }
  }
  for (let k = Math.ceil(tr.view.ymin / step.y); k * step.y <= tr.view.ymax; k++) {
    const y = tr.py(k * step.y)
    if (doc.options.grid) grid.push(`M0,${f2(y)}H${w}`)
    if (doc.options.axes && doc.options.numbers && k !== 0 && y > 10 && y < h - 6) {
      ticks.push(textEl(axisX + (x0 < 30 ? 6 : -6), y + 4, fmt(k * step.y), LABEL, x0 < 30 ? 'start' : 'end', false, true))
    }
  }
  if (doc.options.axes) {
    if (y0 >= 0 && y0 <= h) axes.push(`<line x1="0" y1="${f2(y0)}" x2="${w}" y2="${f2(y0)}" stroke="${AXIS}" stroke-width="1.3"/><path d="M${w},${f2(y0)} l-8,-4 v8 z" fill="${AXIS}"/>`)
    if (x0 >= 0 && x0 <= w) axes.push(`<line x1="${f2(x0)}" y1="0" x2="${f2(x0)}" y2="${h}" stroke="${AXIS}" stroke-width="1.3"/><path d="M${f2(x0)},0 l-4,8 h8 z" fill="${AXIS}"/>`)
    if (doc.options.numbers && x0 >= 0 && x0 <= w && y0 >= 0 && y0 <= h) ticks.push(textEl(x0 - 5, y0 + 14, '0', LABEL, 'end', false, true))
    if (y0 >= 0 && y0 <= h) ticks.push(textEl(w - 6, y0 - 8, 'x', LABEL, 'end', true, false, true))
    if (x0 >= 0 && x0 <= w) ticks.push(textEl(x0 + 8, 14, 'y', LABEL, 'start', true, false, true))
  }

  // Special points and the trace marker.
  for (const s of extras.specials ?? []) {
    points.push(`<circle cx="${f2(tr.px(s.x))}" cy="${f2(tr.py(s.y))}" r="3.5" fill="#ffffff" stroke="${LABEL}" stroke-width="1.5"/>`)
  }
  for (const p of extras.picks ?? []) {
    points.push(`<circle cx="${f2(tr.px(p.x))}" cy="${f2(tr.py(p.y))}" r="7" fill="none" stroke="#1a73e8" stroke-width="2" stroke-dasharray="3 2"/>`)
  }
  if (extras.trace) {
    const { x, y, color, label } = extras.trace
    const px = tr.px(x)
    const py = tr.py(y)
    points.push(`<line x1="${f2(px)}" y1="0" x2="${f2(px)}" y2="${h}" stroke="${color}" stroke-width="1" stroke-dasharray="4 3" opacity="0.6"/>`)
    points.push(`<circle cx="${f2(px)}" cy="${f2(py)}" r="5" fill="${color}" stroke="#ffffff" stroke-width="1.5"/>`)
    const anchor = px > w - 120 ? 'end' : 'start'
    labels.push(textEl(px + (anchor === 'end' ? -9 : 9), Math.max(14, py - 9), label, color, anchor, false))
  }

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w * scale}" height="${h * scale}" viewBox="0 0 ${w} ${h}" font-family="Arial, Helvetica, sans-serif" font-size="12">`,
    `<rect width="${w}" height="${h}" fill="#ffffff"/>`,
    ...fills,
    grid.length ? `<path d="${grid.join('')}" stroke="${GRID}" stroke-width="1" fill="none"/>` : '',
    ...axes,
    ...ticks,
    ...geometry,
    ...curves,
    ...points,
    ...labels,
    `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" fill="none" stroke="#dadce0"/>`,
    '</svg>',
  )
  return parts.join('')
}

function pathEl(d: string, color: string, width: number, dashed = false): string {
  if (!d) return ''
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"${dashed ? ' stroke-dasharray="7 5"' : ''}/>`
}

// White halo behind the text keeps labels readable over the grid and curves.
function textEl(x: number, y: number, text: string, color: string, anchor: 'start' | 'middle' | 'end', bold: boolean, small = false, italic = false): string {
  const attrs = `x="${f2(x)}" y="${f2(y)}" text-anchor="${anchor}"${bold ? ' font-weight="bold"' : ''}${small ? ' font-size="11"' : ''}${italic ? ' font-style="italic"' : ''}`
  return `<text ${attrs} fill="${color}" stroke="#ffffff" stroke-width="3" stroke-linejoin="round" paint-order="stroke">${esc(text)}</text>`
}

// y = f(x) sampled twice per pixel; pieces break at gaps and vertical asymptotes.
export function functionPath(f: (x: number) => number, tr: Transform): string {
  const n = tr.w * 2
  const lim = tr.h * 4
  let d = ''
  let pen = false
  let prevY = NaN
  for (let i = 0; i <= n; i++) {
    const x = tr.wx((i * tr.w) / n)
    const y = f(x)
    if (!Number.isFinite(y)) {
      pen = false
      prevY = NaN
      continue
    }
    const py = tr.py(y)
    // A jump across the whole window between neighbours: an asymptote.
    if (pen && Math.abs(py - prevY) > tr.h * 1.5) {
      const mid = f(tr.wx(((i - 0.5) * tr.w) / n))
      const midPy = tr.py(mid)
      if (!Number.isFinite(mid) || Math.abs(midPy - prevY) > Math.abs(py - prevY) || Math.abs(midPy - py) > Math.abs(py - prevY)) pen = false
    }
    const cy = Math.max(-lim, Math.min(lim + tr.h, py))
    d += `${pen ? 'L' : 'M'}${f2((i * tr.w) / n)},${f2(cy)}`
    pen = true
    prevY = py
  }
  return d
}

function curvePath(p: (t: number) => Pt, tmin: number, tmax: number, tr: Transform): string {
  const n = 1000
  const lim = Math.max(tr.w, tr.h) * 4
  let d = ''
  let pen = false
  let prev: [number, number] | null = null
  for (let i = 0; i <= n; i++) {
    const q = p(tmin + ((tmax - tmin) * i) / n)
    if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) {
      pen = false
      continue
    }
    const x = Math.max(-lim, Math.min(lim, tr.px(q.x)))
    const y = Math.max(-lim, Math.min(lim, tr.py(q.y)))
    if (pen && prev && Math.hypot(x - prev[0], y - prev[1]) > Math.max(tr.w, tr.h)) pen = false
    d += `${pen ? 'L' : 'M'}${f2(x)},${f2(y)}`
    pen = true
    prev = [x, y]
  }
  return d
}

function ineqFill(f: (x: number) => number, above: boolean, tr: Transform, color: string): string {
  const n = tr.w
  const edge = above ? -2 : tr.h + 2
  const lim = tr.h * 4
  let d = ''
  let open = false
  let lastX = 0
  for (let i = 0; i <= n; i++) {
    const x = tr.wx(i)
    const y = f(x)
    if (!Number.isFinite(y)) {
      if (open) d += `L${lastX},${edge}Z`
      open = false
      continue
    }
    const py = Math.max(-lim, Math.min(lim, tr.py(y)))
    if (!open) d += `M${i},${edge}`
    d += `L${i},${f2(py)}`
    open = true
    lastX = i
  }
  if (open) d += `L${lastX},${edge}Z`
  return `<path d="${d}" fill="${color}" fill-opacity="0.18"/>`
}

// Marching squares on a 4 px grid: the curve F = 0 as segments, and for
// inequalities the cells where the condition holds (merged in horizontal runs).
function marching(F: (x: number, y: number) => number, tr: Transform, op: '<' | '>' | '<=' | '>=' | null): { segments: string; cells: string } {
  const cell = 4
  const nx = Math.ceil(tr.w / cell)
  const ny = Math.ceil(tr.h / cell)
  const v: number[] = new Array((nx + 1) * (ny + 1))
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) v[j * (nx + 1) + i] = F(tr.wx(i * cell), tr.wy(j * cell))
  const at = (i: number, j: number) => v[j * (nx + 1) + i]
  let segments = ''
  const lerp = (a: number, b: number) => (Math.abs(a - b) < 1e-300 ? 0.5 : a / (a - b))
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1)
      if (![a, b, c, d].every(Number.isFinite)) continue
      const x = i * cell, y = j * cell
      const pts: [number, number][] = []
      if (a > 0 !== b > 0) pts.push([x + cell * lerp(a, b), y])
      if (b > 0 !== c > 0) pts.push([x + cell, y + cell * lerp(b, c)])
      if (d > 0 !== c > 0) pts.push([x + cell * lerp(d, c), y + cell])
      if (a > 0 !== d > 0) pts.push([x, y + cell * lerp(a, d)])
      // Sign changes through a pole (1/x = y): the values are huge on both sides.
      const big = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d))
      const center = F(tr.wx(x + cell / 2), tr.wy(y + cell / 2))
      if (Math.abs(center) > big * 2 && big > 1) continue
      for (let k = 0; k + 1 < pts.length; k += 2) segments += `M${f2(pts[k][0])},${f2(pts[k][1])}L${f2(pts[k + 1][0])},${f2(pts[k + 1][1])}`
    }
  }
  let cells = ''
  if (op) {
    const holds = (val: number) => (op === '<' || op === '<=' ? val < 0 : val > 0)
    for (let j = 0; j < ny; j++) {
      let start = -1
      for (let i = 0; i <= nx; i++) {
        const val = i < nx ? F(tr.wx(i * cell + cell / 2), tr.wy(j * cell + cell / 2)) : NaN
        const on = i < nx && Number.isFinite(val) && holds(val)
        if (on && start < 0) start = i
        if (!on && start >= 0) {
          cells += `M${start * cell},${j * cell}h${(i - start) * cell}v${cell}h${-(i - start) * cell}z`
          start = -1
        }
      }
    }
  }
  return { segments, cells }
}
