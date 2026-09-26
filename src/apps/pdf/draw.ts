// Annotations as drawing primitives in view space, shared by the screen (SVG,
// render.ts) and the PDF exporters (export.ts), so both look the same.

import type { Annot } from './model'

export type Cmd = (string | number)[]

export interface PathPrim {
  k: 'path'
  // SVG-like commands: 'M' x y, 'L' x y, 'C' x1 y1 x2 y2 x y, 'Z'.
  d: Cmd
  stroke?: string
  fill?: string
  width?: number
  opacity?: number
  multiply?: boolean
}

export interface TextPrim {
  k: 'text'
  x: number
  // Baseline of the first line.
  y: number
  size: number
  color: string
  lines: string[]
  bold?: boolean
  lineHeight: number
}

export type Prim = PathPrim | TextPrim

export type Measure = (text: string, size: number, bold?: boolean) => number

const K = 0.5523 // Bézier circle constant

export function ellipseCmds(x: number, y: number, w: number, h: number): Cmd {
  const rx = w / 2
  const ry = h / 2
  const cx = x + rx
  const cy = y + ry
  const ox = rx * K
  const oy = ry * K
  return ['M', cx - rx, cy, 'C', cx - rx, cy - oy, cx - ox, cy - ry, cx, cy - ry, 'C', cx + ox, cy - ry, cx + rx, cy - oy, cx + rx, cy,
    'C', cx + rx, cy + oy, cx + ox, cy + ry, cx, cy + ry, 'C', cx - ox, cy + ry, cx - rx, cy + oy, cx - rx, cy, 'Z']
}

export function roundRectCmds(x: number, y: number, w: number, h: number, r: number): Cmd {
  r = Math.min(r, w / 2, h / 2)
  const o = r * (1 - K)
  return ['M', x + r, y, 'L', x + w - r, y, 'C', x + w - o, y, x + w, y + o, x + w, y + r, 'L', x + w, y + h - r,
    'C', x + w, y + h - o, x + w - o, y + h, x + w - r, y + h, 'L', x + r, y + h, 'C', x + o, y + h, x, y + h - o, x, y + h - r,
    'L', x, y + r, 'C', x, y + o, x + o, y, x + r, y, 'Z']
}

const rectCmds = (x: number, y: number, w: number, h: number): Cmd => ['M', x, y, 'L', x + w, y, 'L', x + w, y + h, 'L', x, y + h, 'Z']

// Check mark and cross inside a square box.
export function glyphCmds(glyph: 'check' | 'cross', x: number, y: number, s: number): Cmd {
  if (glyph === 'check') return ['M', x + s * 0.12, y + s * 0.55, 'L', x + s * 0.4, y + s * 0.82, 'L', x + s * 0.9, y + s * 0.18]
  return ['M', x + s * 0.18, y + s * 0.18, 'L', x + s * 0.82, y + s * 0.82, 'M', x + s * 0.82, y + s * 0.18, 'L', x + s * 0.18, y + s * 0.82]
}

// Splits text into lines that fit `width` (explicit line breaks are kept).
export function wrap(text: string, width: number, size: number, measure: Measure, bold = false): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/(\s+)/)) {
      const next = line + word
      if (line && measure(next.trimEnd(), size, bold) > width) {
        out.push(line.trimEnd())
        line = word.trimStart()
      } else line = next
    }
    out.push(line)
  }
  return out
}

export const TEXT_PAD = 3

// Layout of a stamp: box size for its text and glyph.
export function stampSize(a: Pick<Annot, 'text' | 'glyph' | 'size'>, measure: Measure): [number, number] {
  const size = a.size ?? 16
  const h = size * 1.7
  if (!a.text) return [h, h]
  const glyph = a.glyph ? h * 0.8 : 0
  return [measure(a.text, size, true) + size * 1.2 + glyph, h]
}

export function prims(a: Annot, measure: Measure): Prim[] {
  const color = a.color
  const opacity = a.opacity
  switch (a.type) {
    case 'highlight':
      return (a.rects ?? []).map(([x, y, w, h]) => ({ k: 'path', d: rectCmds(x, y, w, h), fill: color, opacity: opacity ?? 0.45, multiply: true }))
    case 'underline':
    case 'strike':
      return (a.rects ?? []).map(([x, y, w, h]) => {
        const ly = a.type === 'underline' ? y + h * 0.94 : y + h * 0.55
        return { k: 'path', d: ['M', x, ly, 'L', x + w, ly], stroke: color, width: Math.max(0.8, h * 0.07), opacity }
      })
    case 'ink':
      return (a.strokes ?? []).flatMap((s) => inkPrims(s, color, opacity))
    case 'rect':
    case 'ellipse': {
      const lw = a.width ?? 2
      const [x, y, w, h] = [a.x! + lw / 2, a.y! + lw / 2, a.w! - lw, a.h! - lw]
      const d = a.type === 'rect' ? rectCmds(x, y, w, h) : ellipseCmds(x, y, w, h)
      return [{ k: 'path', d, stroke: color, width: lw, fill: a.fill, opacity }]
    }
    case 'line':
    case 'arrow': {
      const [x1, y1, x2, y2] = a.line!
      const lw = a.width ?? 2
      const out: Prim[] = [{ k: 'path', d: ['M', x1, y1, 'L', x2, y2], stroke: color, width: lw, opacity }]
      if (a.type === 'arrow') {
        const len = Math.max(8, lw * 4)
        const ang = Math.atan2(y2 - y1, x2 - x1)
        const p = (da: number) => [x2 - len * Math.cos(ang + da), y2 - len * Math.sin(ang + da)]
        out.push({ k: 'path', d: ['M', ...p(0.45), 'L', x2, y2, 'L', ...p(-0.45)], stroke: color, width: lw, opacity })
      }
      return out
    }
    case 'text': {
      const size = a.size ?? 12
      const out: Prim[] = []
      if (a.fill) out.push({ k: 'path', d: rectCmds(a.x!, a.y!, a.w!, a.h!), fill: a.fill, opacity: 0.9 })
      const lines = wrap(a.text ?? '', a.w! - 2 * TEXT_PAD, size, measure)
      out.push({ k: 'text', x: a.x! + TEXT_PAD, y: a.y! + TEXT_PAD + size * 0.9, size, color, lines, lineHeight: size * 1.2 })
      return out
    }
    case 'stamp': {
      const { x = 0, y = 0, w = 0, h = 0 } = a
      if (!a.text) return [{ k: 'path', d: glyphCmds(a.glyph ?? 'check', x, y, Math.min(w, h)), stroke: color, width: Math.min(w, h) * 0.13, opacity }]
      const size = a.size ?? 16
      const frame = roundRectCmds(x + 1, y + 1, w - 2, h - 2, h * 0.2)
      // A light background keeps the stamp readable over the page's text.
      const out: Prim[] = [
        { k: 'path', d: frame, fill: '#ffffff', opacity: 0.85 },
        { k: 'path', d: frame, stroke: color, width: Math.max(1, size * 0.1), opacity },
      ]
      let tx = x + size * 0.6
      if (a.glyph) {
        const g = h * 0.6
        out.push({ k: 'path', d: glyphCmds(a.glyph, x + size * 0.45, y + (h - g) / 2, g), stroke: color, width: g * 0.14, opacity })
        tx += h * 0.8 - size * 0.1
      }
      out.push({ k: 'text', x: tx, y: y + h / 2 + size * 0.35, size, color, lines: [a.text], bold: true, lineHeight: size })
      return out
    }
  }
  return []
}

// A stroke: one path when the width is constant, else one segment per width.
function inkPrims(s: number[], color: string, opacity?: number): PathPrim[] {
  if (s.length < 3) return []
  if (s.length === 3) return [{ k: 'path', d: ['M', s[0], s[1], 'L', s[0] + 0.01, s[1]], stroke: color, width: s[2], opacity }]
  const constant = s.every((v, i) => i % 3 !== 2 || Math.abs(v - s[2]) < 0.05)
  if (constant) {
    const d: Cmd = ['M', s[0], s[1]]
    for (let i = 3; i < s.length; i += 3) d.push('L', s[i], s[i + 1])
    return [{ k: 'path', d, stroke: color, width: s[2], opacity }]
  }
  // Varying width (stylus pressure): runs of similar width share a path.
  const out: PathPrim[] = []
  let d: Cmd = ['M', s[0], s[1]]
  let w = s[2]
  for (let i = 3; i < s.length; i += 3) {
    const sw = (s[i - 1] + s[i + 2]) / 2
    if (Math.abs(sw - w) > 0.25 && d.length > 3) {
      out.push({ k: 'path', d, stroke: color, width: w, opacity })
      d = ['M', s[i - 3], s[i - 2]]
      w = sw
    } else if (d.length <= 3) w = sw
    d.push('L', s[i], s[i + 1])
  }
  out.push({ k: 'path', d, stroke: color, width: w, opacity })
  return out
}

export const svgPath = (d: Cmd) => d.map((v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)).join(' ')
