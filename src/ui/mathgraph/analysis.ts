// Special points of functions in the visible window: roots, local extrema,
// the y-intercept and intersections between two functions (numerically, by
// sampling and refining).

import type { Pt } from './compute'

export interface Special {
  kind: 'root' | 'min' | 'max' | 'yint' | 'intersection'
  x: number
  y: number
  // Function names (two for intersections).
  of: string[]
}

const SAMPLES = 400

function bisect(f: (x: number) => number, a: number, b: number): number {
  let fa = f(a)
  for (let i = 0; i < 60; i++) {
    const m = (a + b) / 2
    const fm = f(m)
    if (fm === 0) return m
    if (Math.sign(fm) === Math.sign(fa)) {
      a = m
      fa = fm
    } else b = m
  }
  return (a + b) / 2
}

// Golden-section search for a minimum of f on [a, b].
function golden(f: (x: number) => number, a: number, b: number): number {
  const r = (Math.sqrt(5) - 1) / 2
  let c = b - r * (b - a)
  let d = a + r * (b - a)
  for (let i = 0; i < 60; i++) {
    if (f(c) < f(d)) b = d
    else a = c
    c = b - r * (b - a)
    d = a + r * (b - a)
  }
  return (a + b) / 2
}

export function zeros(f: (x: number) => number, xmin: number, xmax: number, scale: number): number[] {
  const out: number[] = []
  const h = (xmax - xmin) / SAMPLES
  let px = xmin
  let py = f(px)
  for (let i = 1; i <= SAMPLES; i++) {
    const x = xmin + i * h
    const y = f(x)
    if (Number.isFinite(py) && Number.isFinite(y)) {
      if (py === 0) push(out, px, h)
      else if (Math.sign(py) !== Math.sign(y) && y !== 0) {
        const r = bisect(f, px, x)
        // A sign change across a pole is not a root.
        if (Math.abs(f(r)) < scale * 1e-3) push(out, r, h)
      }
    }
    px = x
    py = y
  }
  if (py === 0) push(out, px, h)
  // Roots that touch the axis without crossing it (x² at 0).
  const abs = (x: number) => Math.abs(f(x))
  for (const m of minima(abs, xmin, xmax)) if (abs(m) < scale * 1e-6) push(out, m, h)
  return out.sort((a, b) => a - b)
}

function push(list: number[], x: number, h: number) {
  if (!list.some((v) => Math.abs(v - x) < h)) list.push(Math.abs(x) < 1e-9 ? 0 : x)
}

function minima(f: (x: number) => number, xmin: number, xmax: number): number[] {
  const h = (xmax - xmin) / SAMPLES
  const out: number[] = []
  let y0 = f(xmin)
  let y1 = f(xmin + h)
  for (let i = 2; i <= SAMPLES; i++) {
    const y2 = f(xmin + i * h)
    if (Number.isFinite(y0) && Number.isFinite(y1) && Number.isFinite(y2) && y1 <= y0 && y1 < y2) {
      out.push(golden(f, xmin + (i - 2) * h, xmin + i * h))
    }
    y0 = y1
    y1 = y2
  }
  return out
}

export function extrema(f: (x: number) => number, xmin: number, xmax: number, scale: number): Special[] {
  const out: Special[] = []
  const neg = (x: number) => -f(x)
  const smooth = (x: number) => {
    // Skip corners of discontinuities (the values next to it jump).
    const h = (xmax - xmin) / SAMPLES
    return Math.abs(f(x - h) - f(x + h)) < scale * 0.2
  }
  for (const x of minima(f, xmin, xmax)) if (smooth(x)) out.push({ kind: 'min', x: clean(x), y: clean(f(x)), of: [] })
  for (const x of minima(neg, xmin, xmax)) if (smooth(x)) out.push({ kind: 'max', x: clean(x), y: clean(f(x)), of: [] })
  return out.filter((p) => Number.isFinite(p.y)).sort((a, b) => a.x - b.x)
}

function clean(v: number): number {
  const r = Math.round(v * 1e7) / 1e7
  return Math.abs(r) < 1e-7 ? 0 : r
}

export interface Fn {
  name: string
  f: (x: number) => number
}

// All special points of the given functions in the window [xmin, xmax] × [ymin, ymax].
export function specialPoints(fns: Fn[], view: { xmin: number; xmax: number; ymin: number; ymax: number }): Special[] {
  const scale = view.ymax - view.ymin
  const out: Special[] = []
  for (const { name, f } of fns) {
    for (const x of zeros(f, view.xmin, view.xmax, scale)) out.push({ kind: 'root', x: clean(x), y: 0, of: [name] })
    for (const e of extrema(f, view.xmin, view.xmax, scale)) out.push({ ...e, of: [name] })
    const y0 = f(0)
    if (view.xmin <= 0 && view.xmax >= 0 && Number.isFinite(y0)) out.push({ kind: 'yint', x: 0, y: clean(y0), of: [name] })
  }
  for (let i = 0; i < fns.length; i++) {
    for (let j = i + 1; j < fns.length; j++) {
      const f = fns[i].f
      const g = fns[j].f
      const d = (x: number) => f(x) - g(x)
      // Identical functions have no isolated intersections.
      if ([0.13, 0.57, 0.91].every((k) => Math.abs(d(view.xmin + k * (view.xmax - view.xmin))) < 1e-12)) continue
      for (const x of zeros(d, view.xmin, view.xmax, scale)) out.push({ kind: 'intersection', x: clean(x), y: clean(f(x)), of: [fns[i].name, fns[j].name] })
    }
  }
  return out.filter((p) => p.y >= view.ymin - scale && p.y <= view.ymax + scale)
}

export type { Pt }
