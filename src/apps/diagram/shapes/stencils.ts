// Bundled draw.io stencil sets (XML shape descriptions) registered under
// draw.io's names, e.g. "mxgraph.flowchart.multi-document".
import { StencilShape, StencilShapeRegistry } from '@maxgraph/core'
import type { AbstractCanvas2D, Rectangle, Shape } from '@maxgraph/core'
import basicXml from './stencils/basic.xml?raw'
import flowchartXml from './stencils/flowchart.xml?raw'
import { deflateRawSync, inflateRawSync } from '../formats/deflate'

export const STENCIL_SETS = [basicXml, flowchartXml]

const COLOR = /^(#|rgb|hsl)/i

// draw.io stencils may name a style key as color (e.g. <fillcolor
// color="accentColor" default="#ffff00"/>), plus "stroke"/"fill"/"font".
export class DrawioStencil extends StencilShape {
  private color(shape: Shape, node: Element): string | null {
    const value = node.getAttribute('color')
    if (!value || value === 'none' || COLOR.test(value)) return value
    const style = (shape.style ?? {}) as Record<string, unknown>
    if (value === 'stroke') return shape.stroke
    if (value === 'fill') return shape.fill
    if (value === 'font') return String(style.fontColor ?? '#000000')
    const v = style[value]
    if (v != null && v !== 'default') return String(v)
    const def = node.getAttribute('default')
    if (def != null) return def
    return node.nodeName === 'fillcolor' ? '#ffffff' : '#000000'
  }
  drawNode(canvas: AbstractCanvas2D, shape: Shape, node: Element, aspect: Rectangle, disableShadow: boolean, paint: boolean) {
    const name = node.nodeName
    if (paint && (name === 'fillcolor' || name === 'strokecolor' || name === 'fontcolor')) {
      const color = this.color(shape, node)
      if (name === 'fillcolor') canvas.setFillColor(color)
      else if (name === 'strokecolor') canvas.setStrokeColor(color)
      else canvas.setFontColor(color)
      return
    }
    super.drawNode(canvas, shape, node, aspect, disableShadow, paint)
  }
}

// Mirrors draw.io's mxStencilRegistry.parseStencilSet naming: lowercase
// package name + shape name with spaces replaced by underscores.
export function registerStencilSet(xml: string): string[] {
  const root = new DOMParser().parseFromString(xml, 'text/xml').documentElement
  const pkg = (root.getAttribute('name') ?? '').toLowerCase()
  const names: string[] = []
  for (let node = root.firstElementChild; node; node = node.nextElementSibling) {
    const name = node.getAttribute('name')
    if (node.nodeName !== 'shape' || !name) continue
    const id = (pkg ? pkg + '.' : '') + name.replace(/ /g, '_').toLowerCase()
    // Registration is idempotent: the first definition of a name wins.
    if (!StencilShapeRegistry.get(id)) StencilShapeRegistry.add(id, new DrawioStencil(node))
    names.push(id)
  }
  return names
}

export function registerStencils() {
  for (const xml of STENCIL_SETS) registerStencilSet(xml)
  inlineStencils()
}

// draw.io's inline stencils: shape=stencil(<base64 of the raw-deflated,
// URI-encoded <shape> XML>), used by imported Visio shapes among others.
// Decoded on first use, like draw.io's mxStencilRegistry.getStencil.
function inlineStencils() {
  const get = StencilShapeRegistry.get.bind(StencilShapeRegistry)
  const bad = new Set<string>()
  StencilShapeRegistry.get = (name: string) => {
    const found = get(name)
    if (found || typeof name !== 'string' || !name.startsWith('stencil(') || bad.has(name)) return found
    try {
      const xml = decodeStencil(name.slice(8, -1))
      const node = new DOMParser().parseFromString(xml, 'text/xml').documentElement
      if (node.nodeName !== 'shape') throw new Error(node.nodeName)
      const stencil = new DrawioStencil(node)
      StencilShapeRegistry.add(name, stencil)
      return stencil
    } catch (e) {
      bad.add(name)
      console.warn('Invalid inline stencil', e)
      return null
    }
  }
}

function decodeStencil(text: string): string {
  if (text.trimStart().startsWith('<')) return text
  const binary = atob(text.replace(/\s+/g, ''))
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  const inflated = new TextDecoder().decode(inflateRawSync(bytes))
  try {
    return decodeURIComponent(inflated)
  } catch {
    return inflated
  }
}

// The style value of an inline stencil for a <shape> element's XML.
export function encodeStencil(xml: string): string {
  const bytes = deflateRawSync(new TextEncoder().encode(encodeURIComponent(xml)))
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `stencil(${btoa(binary)})`
}
