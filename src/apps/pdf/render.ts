// Annotations on screen: one SVG group per annotation, drawn from the same
// primitives as the PDF export (draw.ts).

import { t } from '../../core/i18n'
import { prims, svgPath, type Measure } from './draw'
import { bounds, type Annot } from './model'

const NS = 'http://www.w3.org/2000/svg'
export const FONT = 'Helvetica, Arial, "Liberation Sans", sans-serif'

let ctx: CanvasRenderingContext2D | null = null
// Text width with the metrics of Helvetica (Arial and Liberation Sans share them).
export const measure: Measure = (text, size, bold) => {
  ctx ??= document.createElement('canvas').getContext('2d')!
  ctx.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`
  return ctx.measureText(text).width
}

export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number | undefined> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) node.setAttribute(k, String(v))
  return node
}

// Accessible name of an annotation.
export function describe(a: Annot): string {
  const by = a.author ? ` · ${a.author}` : ''
  switch (a.type) {
    case 'highlight':
      return t('Highlight: {text}', { text: a.quote ?? '' }) + by
    case 'underline':
      return t('Underline: {text}', { text: a.quote ?? '' }) + by
    case 'strike':
      return t('Strikeout: {text}', { text: a.quote ?? '' }) + by
    case 'ink':
      return (a.signature ? a.alt || t('Signature') : t('Freehand drawing')) + by
    case 'rect':
      return t('Rectangle') + by
    case 'ellipse':
      return t('Ellipse') + by
    case 'line':
      return t('Line') + by
    case 'arrow':
      return t('Arrow') + by
    case 'text':
      return t('Text box: {text}', { text: a.text ?? '' }) + by
    case 'stamp':
      return t('Stamp: {text}', { text: a.alt || a.text || '' }) + by
  }
}

export function annotElement(a: Annot, interactive: boolean): SVGGElement {
  const g = svg('g', { class: `pdf-annot pdf-annot-${a.type}`, 'data-id': a.id })
  const [x, y, w, h] = bounds(a)
  // Hit area: the box (thin lines get a wide invisible stroke).
  if (a.type === 'line' || a.type === 'arrow') {
    const [x1, y1, x2, y2] = a.line!
    g.append(svg('path', { d: `M ${x1} ${y1} L ${x2} ${y2}`, class: 'pdf-hit', 'stroke-width': Math.max(10, (a.width ?? 2) * 3) }))
  } else g.append(svg('rect', { x, y, width: Math.max(w, 1), height: Math.max(h, 1), class: 'pdf-hit' }))
  for (const p of prims(a, measure)) {
    if (p.k === 'path') {
      g.append(
        svg('path', {
          d: svgPath(p.d),
          stroke: p.stroke ?? 'none',
          fill: p.fill ?? 'none',
          'stroke-width': p.width,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          opacity: p.opacity,
          style: p.multiply ? 'mix-blend-mode:multiply' : undefined,
        }),
      )
    } else {
      const text = svg('text', { 'font-size': p.size, fill: p.color, 'font-family': FONT, 'font-weight': p.bold ? 'bold' : undefined })
      p.lines.forEach((line, i) => {
        const span = svg('tspan', { x: p.x, y: p.y + i * p.lineHeight })
        span.textContent = line
        text.append(span)
      })
      g.append(text)
    }
  }
  const label = describe(a)
  g.setAttribute('role', 'img')
  g.setAttribute('aria-label', label)
  const title = svg('title')
  title.textContent = label
  g.prepend(title)
  if (interactive) g.setAttribute('tabindex', '0')
  return g
}
