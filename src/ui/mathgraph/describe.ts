// Text readouts of a graph for everyone and for screen readers: one line per
// object (function with its roots and extrema, points, lengths, angles,
// areas…). Also the alternative text of the embedded picture.

import { locale, t } from '../../core/i18n'
import { specialPoints, type Special } from './analysis'
import { area, perimeter, type Computed, type RowResult } from './compute'
import type { GraphDoc } from './model'

const decimalComma = new Intl.NumberFormat(locale).format(1.5).includes(',')

export function fmt(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return t('undefined')
  const r = Math.round(v * 10 ** digits) / 10 ** digits
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits, useGrouping: false }).format(Object.is(r, -0) ? 0 : r)
}

export function fmtPoint(x: number, y: number): string {
  return `(${fmt(x)}${decimalComma ? '; ' : ', '}${fmt(y)})`
}

export function functionSpecials(doc: GraphDoc, computed: Computed): Special[] {
  const fns = computed.results
    .filter((r) => r.kind === 'function' && r.value?.t === 'function' && !r.row.hidden)
    .map((r) => ({ name: r.name, f: (r.value as { f: (x: number) => number }).f }))
  return fns.length ? specialPoints(fns, doc.view) : []
}

function list(values: string[]): string {
  return values.join(decimalComma ? '; ' : ', ')
}

export function describeRow(r: RowResult, computed: Computed, specials: Special[]): string {
  const v = r.value
  const text = r.row.text.trim()
  if (r.kind === 'error') return `${text}: ${r.error ?? t('error')}`
  if (!v) {
    if (r.kind === 'definition') return text
    return r.command ? t('{name} does not exist (the objects do not meet)', { name: r.name }) : text
  }
  const args = r.args ?? []
  switch (v.t) {
    case 'function': {
      const own = specials.filter((s) => s.of.length === 1 && s.of[0] === r.name)
      // f(x) = …, or the automatic name before y = … (as in the table of values).
      const head = r.named ? text : /^\s*y\s*=/.test(text) ? `${r.name}: ${text}` : `${r.name}(x) = ${text}`
      const parts = [head]
      const roots = own.filter((s) => s.kind === 'root').map((s) => `x = ${fmt(s.x)}`)
      const mins = own.filter((s) => s.kind === 'min').map((s) => fmtPoint(s.x, s.y))
      const maxs = own.filter((s) => s.kind === 'max').map((s) => fmtPoint(s.x, s.y))
      const yint = own.find((s) => s.kind === 'yint')
      if (roots.length) parts.push(t('Roots: {list}', { list: list(roots) }))
      else parts.push(t('No roots in view'))
      if (mins.length) parts.push(t('Minimum: {list}', { list: list(mins) }))
      if (maxs.length) parts.push(t('Maximum: {list}', { list: list(maxs) }))
      if (yint) parts.push(t('y-intercept: {value}', { value: fmt(yint.y) }))
      return parts.join('. ')
    }
    case 'point': {
      const coords = `${r.name} = ${fmtPoint(v.x, v.y)}`
      if (r.kind === 'midpoint') return `${coords}, ${t('midpoint of {a} and {b}', { a: args[0] ?? '', b: args[1] ?? '' })}`
      if (r.kind === 'intersect') return `${coords}, ${t('intersection of {a} and {b}', { a: args[0] ?? '', b: args[1] ?? '' })}`
      return coords
    }
    case 'segment':
      return t('Segment {name} from {a} to {b}, length {length}', { name: r.name, a: args[0] ?? '', b: args[1] ?? '', length: fmt(Math.hypot(v.b.x - v.a.x, v.b.y - v.a.y)) })
    case 'line':
      return t('Line {name}: {equation}', { name: r.name, equation: lineEquation(v.a, v.b) })
    case 'ray':
      return t('Ray {name} from {a} through {b}', { name: r.name, a: args[0] ?? fmtPoint(v.a.x, v.a.y), b: args[1] ?? fmtPoint(v.b.x, v.b.y) })
    case 'circle':
      return t('Circle {name}: center {center}, radius {radius}', { name: r.name, center: fmtPoint(v.c.x, v.c.y), radius: fmt(v.r) })
    case 'polygon':
      return t('Polygon {name}: area {area}, perimeter {perimeter}', { name: r.name, area: fmt(area(v.pts)), perimeter: fmt(perimeter(v.pts)) })
    case 'angle':
      return t('Angle {name} = {value}°', { name: r.name, value: fmt(v.deg, 2) })
    case 'number':
      return `${r.name} = ${fmt(v.value)}`
    case 'vline':
      return `x = ${fmt(v.x)}`
    default:
      return text
  }
}

function lineEquation(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (Math.abs(dx) < 1e-12) return `x = ${fmt(a.x)}`
  const m = dy / dx
  const c = a.y - m * a.x
  const mText = Math.abs(m) < 1e-12 ? '' : `${Math.abs(m - 1) < 1e-12 ? '' : Math.abs(m + 1) < 1e-12 ? '−' : fmt(m)}x`
  const cText = Math.abs(c) < 1e-12 ? '' : c < 0 ? ` − ${fmt(-c)}` : mText ? ` + ${fmt(c)}` : fmt(c)
  return `y = ${mText}${cText}` || 'y = 0'
}

export function describeGraph(doc: GraphDoc, computed: Computed, specials: Special[]): string[] {
  const lines: string[] = []
  for (const s of doc.sliders) lines.push(`${s.name} = ${fmt(s.value)}`)
  for (const r of computed.results) if (r.kind !== 'empty' && !r.row.hidden) lines.push(describeRow(r, computed, specials))
  for (const s of specials) if (s.kind === 'intersection') lines.push(t('{f} and {g} meet at {point}', { f: s.of[0], g: s.of[1], point: fmtPoint(s.x, s.y) }))
  return lines
}

// Alternative text of the picture (a summary, not too long).
export function altText(doc: GraphDoc, computed: Computed): string {
  const lines = describeGraph(doc, computed, functionSpecials(doc, computed))
  const text = `${t('Math graph')}: ${lines.join('. ')}`
  return text.length > 1500 ? `${text.slice(0, 1497)}…` : text
}
