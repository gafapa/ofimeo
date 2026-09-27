// OpenDocument presentation (.odp) import, the counterpart of odp.ts: text
// boxes and placeholders (formatted paragraphs, bullets), custom shapes,
// rectangles and ellipses, lines and connectors, pictures, groups, tables (as
// one text box), backgrounds, speaker notes, slide transitions and the main
// sequence of animations. Works for files from this app and from LibreOffice
// Impress.

import JSZip from 'jszip'
import { t } from '../../../core/i18n'
import { newCellId, type CellRecord } from '../../diagram/model'
import { SLIDE_SIZES, THEMES, type Ratio, type SlideData } from '../model'
import { animationsFromStarts, defaultDuration, type AnimEffect, type AnimKind, type Animation, type Direction, type Trigger } from '../animations'

const NS = {
  draw: 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
  style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
  text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
  svg: 'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0',
  fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
  xlink: 'http://www.w3.org/1999/xlink',
  presentation: 'urn:oasis:names:tc:opendocument:xmlns:presentation:1.0',
  smil: 'urn:oasis:names:tc:opendocument:xmlns:smil-compatible:1.0',
  anim: 'urn:oasis:names:tc:opendocument:xmlns:animation:1.0',
  xml: 'http://www.w3.org/XML/1998/namespace',
  meta: 'urn:oasis:names:tc:opendocument:xmlns:meta:1.0',
  table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
} as const
type Prefix = keyof typeof NS

const a = (el: Element | null | undefined, prefix: Prefix, name: string) => el?.getAttributeNS(NS[prefix], name) ?? null
const kids = (el: Element | null | undefined, prefix?: Prefix, name?: string) =>
  el ? [...el.children].filter((c) => (!prefix || c.namespaceURI === NS[prefix]) && (!name || c.localName === name)) : []
const kid = (el: Element | null | undefined, prefix: Prefix, name: string) => kids(el, prefix, name)[0] ?? null
const all = (el: Element | Document | null | undefined, prefix: Prefix, name: string) => (el ? [...el.getElementsByTagNameNS(NS[prefix], name)] : [])
const round = (n: number) => Math.round(n * 100) / 100

// A length ("2.5cm", "12pt", "1in"…) in CSS pixels.
function length(value: string | null, fallback = 0): number {
  const m = /^(-?[\d.]+)(in|cm|mm|pt|pc|px)?$/.exec(value?.trim() ?? '')
  if (!m) return fallback
  const n = Number(m[1])
  return n * ({ in: 96, cm: 96 / 2.54, mm: 96 / 25.4, pt: 96 / 72, pc: 16, px: 1 }[m[2] ?? 'px'] ?? 1)
}
const seconds = (value: string | null) => {
  const m = /^(-?[\d.]+)(s|ms)?$/.exec(value?.trim() ?? '')
  return m ? Number(m[1]) * (m[2] === 'ms' ? 1 : 1000) : 0
}

// ---------- Styles ----------

// Named styles of both files (automatic ones of content.xml win), with their parents.
class Styles {
  private readonly byName = new Map<string, Element>()
  private readonly defaults = new Map<string, Element>()

  add(doc: Document | null): void {
    if (!doc) return
    for (const s of all(doc, 'style', 'style')) {
      const family = a(s, 'style', 'family') ?? ''
      this.byName.set(`${family}|${a(s, 'style', 'name')}`, s)
    }
    for (const s of all(doc, 'style', 'default-style')) this.defaults.set(a(s, 'style', 'family') ?? '', s)
  }

  // The style and its ancestors, nearest first.
  chain(family: string, name: string | null): Element[] {
    const out: Element[] = []
    let current = name ? this.byName.get(`${family}|${name}`) : undefined
    while (current && out.length < 20) {
      out.push(current)
      const parent = a(current, 'style', 'parent-style-name')
      current = parent ? this.byName.get(`${family}|${parent}`) : undefined
    }
    return out
  }

  // The default styles of these families (the last resort of every lookup).
  defaultsOf(...families: string[]): Element[] {
    return families.map((f) => this.defaults.get(f)).filter((s): s is Element => !!s)
  }

  // A property of a style: the first ancestor's <style:{kind}-properties> that sets it.
  prop(chain: Element[], kind: string, prefix: Prefix, name: string): string | null {
    for (const s of chain) {
      const value = a(kid(s, 'style', `${kind}-properties`), prefix, name)
      if (value !== null) return value
    }
    return null
  }
}

// ---------- Entry ----------

interface Ctx {
  zip: JSZip
  styles: Styles
  scale: number
  cells: CellRecord[]
  previous: string | undefined
  // draw:id / xml:id of shapes → their cells (animation targets).
  targets: Map<string, string[]>
}

export async function parseOdp(buffer: ArrayBuffer): Promise<{ ratio: Ratio; themeId?: string; slides: SlideData[] }> {
  const zip = await JSZip.loadAsync(buffer)
  const read = async (path: string) => {
    const file = zip.file(path)
    return file ? new DOMParser().parseFromString(await file.async('text'), 'application/xml') : null
  }
  const mimetype = await zip.file('mimetype')?.async('text')
  const content = await read('content.xml')
  if (!content || (mimetype && !mimetype.includes('opendocument.presentation'))) throw new Error(t('Not an OpenDocument presentation'))
  const stylesDoc = await read('styles.xml')
  const meta = await read('meta.xml')
  const styles = new Styles()
  styles.add(stylesDoc)
  styles.add(content)

  // Page size: the page layout of the first master page.
  const master = all(stylesDoc, 'style', 'master-page')[0]
  const layoutName = a(master, 'style', 'page-layout-name')
  const layout = all(stylesDoc, 'style', 'page-layout').find((l) => a(l, 'style', 'name') === layoutName) ?? all(stylesDoc, 'style', 'page-layout')[0]
  const props = kid(layout, 'style', 'page-layout-properties')
  const width = length(a(props, 'fo', 'page-width'), 1066.67)
  const height = length(a(props, 'fo', 'page-height'), 600)
  const ratio: Ratio = Math.abs(width / height - 4 / 3) < 0.05 ? '4:3' : '16:9'
  const target = SLIDE_SIZES[ratio]
  const scale = target.width / width

  const slides: SlideData[] = []
  for (const page of all(content, 'draw', 'page')) {
    const ctx: Ctx = { zip, styles, scale, cells: [{ id: '0' }, { id: '1', parent: '0' }], previous: undefined, targets: new Map() }
    const pageStyle = styles.chain('drawing-page', a(page, 'draw', 'style-name'))
    let background = pageBackground(styles, pageStyle, stylesDoc)
    // A picture as the page fill: a gradient (read back as one) or a full-page picture.
    if (!background && styles.prop(pageStyle, 'drawing-page', 'draw', 'fill') === 'bitmap') {
      const name = styles.prop(pageStyle, 'drawing-page', 'draw', 'fill-image-name')
      const href = a([...all(stylesDoc, 'draw', 'fill-image'), ...all(content, 'draw', 'fill-image')].find((f) => a(f, 'draw', 'name') === name), 'xlink', 'href')
      background = await gradientOf(zip, href)
      const image = background ? null : await imageData(zip, href)
      if (image) push(ctx, null, { vertex: 1, style: `shape=image;imageAspect=0;image=${image};`, geometry: JSON.stringify({ x: 0, y: 0, width: target.width, height: target.height }) })
    }
    const children = kids(page).filter((c) => !(c.namespaceURI === NS.presentation && c.localName === 'notes'))
    // A full-page picture behind everything on a page without fill: the
    // gradient background odp.ts writes (read back from its top and bottom rows).
    const first = children[0]
    if (!background && first && isFullPageImage(first, width, height)) {
      background = await gradientOf(zip, a(kid(first, 'draw', 'image'), 'xlink', 'href'))
      if (background) children.shift()
    }
    for (const node of children) await shapeNode(ctx, node)
    const notesFrame = all(kid(page, 'presentation', 'notes'), 'draw', 'frame').find((f) => a(f, 'presentation', 'class') === 'notes')
    const notes = notesFrame ? paragraphsText(kid(notesFrame, 'draw', 'text-box')) : ''
    slides.push({
      id: crypto.randomUUID(),
      name: a(page, 'draw', 'name') || `Slide ${slides.length + 1}`,
      cells: ctx.cells,
      notes,
      background,
      animations: readAnimations(page, ctx.targets),
      ...readTransition(styles, pageStyle),
    })
  }
  if (!slides.length) throw new Error(t('The presentation has no slides'))
  // Presentations exported by this app keep the id of their theme.
  const own = all(meta, 'meta', 'user-defined').find((u) => a(u, 'meta', 'name') === 'OfimeoTheme')?.textContent ?? ''
  return { ratio, themeId: THEMES.some((th) => th.id === own) ? own : 'imported', slides }
}

// ---------- Backgrounds ----------

function pageBackground(styles: Styles, chain: Element[], stylesDoc: Document | null): string | undefined {
  const fill = styles.prop(chain, 'drawing-page', 'draw', 'fill')
  if (fill === 'solid') return styles.prop(chain, 'drawing-page', 'draw', 'fill-color') ?? undefined
  if (fill === 'gradient') {
    const name = styles.prop(chain, 'drawing-page', 'draw', 'fill-gradient-name')
    const gradient = all(stylesDoc, 'draw', 'gradient').find((g) => a(g, 'draw', 'name') === name)
    const start = a(gradient, 'draw', 'start-color')
    const end = a(gradient, 'draw', 'end-color')
    if (start && end) return `${start},${end}`
  }
  return undefined
}

function isFullPageImage(node: Element, width: number, height: number): boolean {
  if (node.localName !== 'frame' || !kid(node, 'draw', 'image') || a(node, 'draw', 'transform')) return false
  const near = (v: string | null, target: number) => Math.abs(length(v, -1) - target) < 1
  return near(a(node, 'svg', 'x'), 0) && near(a(node, 'svg', 'y'), 0) && near(a(node, 'svg', 'width'), width) && near(a(node, 'svg', 'height'), height)
}

// "#top,#bottom" of a vertical gradient picture, or undefined for other pictures.
async function gradientOf(zip: JSZip, href: string | null): Promise<string | undefined> {
  const file = href ? zip.file(href) : null
  if (!file || typeof createImageBitmap !== 'function') return undefined
  try {
    const bitmap = await createImageBitmap(new Blob([await file.async('arraybuffer')], { type: 'image/png' }))
    const canvas = document.createElement('canvas')
    canvas.width = 3
    canvas.height = bitmap.height
    const g = canvas.getContext('2d', { willReadFrequently: true })!
    g.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, 3, bitmap.height)
    const px = (y: number) => [...g.getImageData(0, y, 3, 1).data]
    const hex = (d: number[]) => `#${d.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('')}`
    // Only a picture of uniform rows is a gradient.
    for (const y of [0, Math.floor(bitmap.height / 2), bitmap.height - 1]) {
      const row = px(y)
      if (Math.abs(row[0] - row[8]) > 2 || Math.abs(row[1] - row[9]) > 2 || Math.abs(row[2] - row[10]) > 2) return undefined
    }
    return `${hex(px(0))},${hex(px(bitmap.height - 1))}`
  } catch {
    return undefined
  }
}

// ---------- Shapes ----------

interface Box {
  x: number
  y: number
  w: number
  h: number
  rotation: number
}

// Position and size, undoing the rotation odp.ts (and Impress) write as a transform.
function boxOf(ctx: Ctx, node: Element): Box | null {
  const w = length(a(node, 'svg', 'width'))
  const h = length(a(node, 'svg', 'height'))
  let x = length(a(node, 'svg', 'x'))
  let y = length(a(node, 'svg', 'y'))
  let rotation = 0
  const transform = a(node, 'draw', 'transform')
  if (transform) {
    const rot = /rotate\s*\(\s*(-?[\d.eE-]+)\s*\)/.exec(transform)
    const tr = /translate\s*\(\s*(\S+)\s+([^)\s]+)\s*\)/.exec(transform)
    const angle = rot ? Number(rot[1]) : 0
    const tx = tr ? length(tr[1]) : x
    const ty = tr ? length(tr[2]) : y
    const rx = (w / 2) * Math.cos(angle) + (h / 2) * Math.sin(angle)
    const ry = -(w / 2) * Math.sin(angle) + (h / 2) * Math.cos(angle)
    x = tx + rx - w / 2
    y = ty + ry - h / 2
    rotation = round((-angle * 180) / Math.PI)
  }
  if (!(w > 0) && !(h > 0)) return null
  const s = ctx.scale
  return { x: round(x * s), y: round(y * s), w: Math.max(1, round(w * s)), h: Math.max(1, round(h * s)), rotation }
}

function push(ctx: Ctx, node: Element | null, rec: Omit<CellRecord, 'id' | 'parent'>): string {
  const id = newCellId()
  ctx.cells.push({ id, parent: '1', ...(ctx.previous ? { previous: ctx.previous } : {}), ...rec })
  ctx.previous = id
  const target = a(node, 'draw', 'id') ?? a(node, 'xml', 'id')
  if (target) ctx.targets.set(target, [...(ctx.targets.get(target) ?? []), id])
  return id
}

const GEOMETRY: Record<string, string> = {
  rectangle: '', rect: '', 'round-rectangle': 'rounded=1;arcSize=12;', 'round-quadrat': 'rounded=1;arcSize=12;', ellipse: 'ellipse;', circle: 'ellipse;',
  'isosceles-triangle': 'triangle;direction=north;', diamond: 'rhombus;', hexagon: 'shape=hexagon;perimeter=hexagonPerimeter2;',
  parallelogram: 'shape=parallelogram;perimeter=parallelogramPerimeter;', cloud: 'ellipse;shape=cloud;', 'right-arrow': 'shape=singleArrow;',
  'left-arrow': 'shape=singleArrow;direction=west;', 'up-arrow': 'shape=singleArrow;direction=north;', 'down-arrow': 'shape=singleArrow;direction=south;',
  'flowchart-process': '', 'flowchart-decision': 'rhombus;', 'flowchart-terminator': 'rounded=1;arcSize=50;',
}

async function shapeNode(ctx: Ctx, node: Element): Promise<void> {
  if (node.namespaceURI !== NS.draw) return
  switch (node.localName) {
    case 'g':
      for (const child of kids(node)) await shapeNode(ctx, child)
      return
    case 'line':
    case 'connector':
      return line(ctx, node)
    case 'frame':
      return frame(ctx, node)
    case 'custom-shape':
    case 'rect':
    case 'ellipse':
    case 'circle': {
      const type = node.localName === 'custom-shape' ? (a(kid(node, 'draw', 'enhanced-geometry'), 'draw', 'type') ?? 'rectangle') : node.localName
      return textShape(ctx, node, GEOMETRY[type] ?? '', node, true)
    }
  }
}

async function frame(ctx: Ctx, node: Element): Promise<void> {
  const textBox = kid(node, 'draw', 'text-box')
  if (textBox) return textShape(ctx, node, '', textBox, false)
  const table = kid(node, 'table', 'table')
  if (table) return textShape(ctx, node, '', table, false)
  // Pictures (and the picture that stands in for charts and other objects).
  for (const image of kids(node, 'draw', 'image')) {
    const data = await imageData(ctx.zip, a(image, 'xlink', 'href'))
    const box = boxOf(ctx, node)
    if (!data || !box) continue
    const style = `shape=image;verticalLabelPosition=bottom;verticalAlign=top;imageAspect=0;image=${data};` + (box.rotation ? `rotation=${box.rotation};` : '')
    push(ctx, node, { vertex: 1, style, geometry: JSON.stringify({ x: box.x, y: box.y, width: box.w, height: box.h }) })
    return
  }
}

async function imageData(zip: JSZip, href: string | null): Promise<string | null> {
  const file = href ? zip.file(href.replace(/^\.\//, '')) : null
  const ext = href?.split('.').pop()!.toLowerCase() ?? ''
  const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', bmp: 'image/bmp', webp: 'image/webp' }[ext]
  if (!file || !mime) return null
  // No ";base64": the style string uses ";" as its separator (as in pptx-import.ts).
  return `data:${mime},${await file.async('base64')}`
}

function line(ctx: Ctx, node: Element): void {
  const s = ctx.scale
  const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((k) => round(length(a(node, 'svg', k)) * s))
  const chain = [...ctx.styles.chain('graphic', a(node, 'draw', 'style-name')), ...ctx.styles.defaultsOf('graphic')]
  const prop = (name: string, prefix: Prefix = 'draw') => ctx.styles.prop(chain, 'graphic', prefix, name)
  const arrow = (marker: string | null) => (!marker ? 'none' : /circle/i.test(marker) ? 'oval' : /square|diamond/i.test(marker) ? 'diamond' : 'block')
  const color = prop('stroke-color', 'svg') ?? '#000000'
  const width = Math.max(0.5, round(length(prop('stroke-width', 'svg'), 1) * s)) || 1
  const style = `endArrow=${arrow(prop('marker-end'))};startArrow=${arrow(prop('marker-start'))};html=1;strokeColor=${color};strokeWidth=${width};` + (prop('stroke') === 'dash' ? 'dashed=1;' : '')
  push(ctx, node, { edge: 1, style, geometry: JSON.stringify({ x: 0, y: 0, width: 0, height: 0, relative: 1, sourcePoint: [x1, y1], targetPoint: [x2, y2] }) })
}

// A shape or text frame with its text. Shapes without fill settings get
// Impress's default blue fill and outline; text frames are transparent.
function textShape(ctx: Ctx, node: Element, geometry: string, textRoot: Element, isShape: boolean): void {
  const box = boxOf(ctx, node)
  if (!box) return
  const graphic = ctx.styles.chain('graphic', a(node, 'draw', 'style-name'))
  const presentation = ctx.styles.chain('presentation', a(node, 'presentation', 'style-name'))
  const chain = [...graphic, ...presentation, ...ctx.styles.defaultsOf('graphic')]
  const prop = (name: string, prefix: Prefix = 'draw') => ctx.styles.prop(chain, 'graphic', prefix, name)
  const fillType = prop('fill') ?? (isShape ? 'solid' : 'none')
  const fill = fillType === 'solid' ? (prop('fill-color') ?? '#729fcf') : null
  const strokeType = prop('stroke') ?? (isShape ? 'solid' : 'none')
  const stroke = strokeType !== 'none' ? (prop('stroke-color', 'svg') ?? '#3465a4') : null
  const strokeWidth = Math.max(0.5, round(length(prop('stroke-width', 'svg'), 1) * ctx.scale)) || 1
  const opacity = prop('opacity')
  const valign = prop('textarea-vertical-align') ?? (isShape ? 'middle' : 'top')
  const pad = (side: string, fallback: number) => round(length(prop(`padding-${side}`, 'fo'), fallback) * ctx.scale)
  const insets = [pad('top', 4.8), pad('right', 9.6), pad('bottom', 4.8), pad('left', 9.6)]
  const cls = a(node, 'presentation', 'class')
  const text = textOf(ctx, textRoot, chain, cls)
  if (!text.html && !fill && !stroke) return
  const style =
    (geometry || (fill || stroke ? '' : 'text;')) +
    `html=1;whiteSpace=wrap;overflow=hidden;spacing=0;spacingLeft=${insets[3]};spacingRight=${insets[1]};spacingTop=${insets[0] - 5};spacingBottom=${insets[2] - 1};` +
    `fillColor=${fill ?? 'none'};strokeColor=${stroke ?? 'none'};` +
    (fill && opacity && opacity !== '100%' ? `fillOpacity=${parseFloat(opacity)};` : '') +
    (stroke ? `strokeWidth=${strokeWidth};` : '') +
    (strokeType === 'dash' ? 'dashed=1;' : '') +
    `align=${text.align};verticalAlign=${valign === 'middle' ? 'middle' : valign === 'bottom' ? 'bottom' : 'top'};fontSize=${text.size};fontColor=${text.color};` +
    (text.font ? `fontFamily=${text.font};` : '') +
    (box.rotation ? `rotation=${box.rotation};` : '')
  push(ctx, node, { vertex: 1, value: text.html, style, geometry: JSON.stringify({ x: box.x, y: box.y, width: box.w, height: box.h }) })
}

// ---------- Text ----------

interface TextInfo {
  html: string
  align: string
  size: number
  color: string
  font: string
}

interface RunProps {
  size: number
  color: string
  font: string
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
}

function textOf(ctx: Ctx, root: Element, shapeChain: Element[], cls: string | null): TextInfo {
  const styles = ctx.styles
  const px = (pt: number) => round((pt / 0.75) * ctx.scale)
  const defaultPt = cls === 'title' ? 44 : cls === 'subtitle' ? 32 : cls === 'outline' ? 32 : 18
  const runProps = (chains: Element[][]): RunProps => {
    const get = (prefix: Prefix, name: string) => {
      for (const chain of chains) {
        const v = styles.prop(chain, 'text', prefix, name)
        if (v !== null) return v
      }
      return null
    }
    const size = get('fo', 'font-size')
    const family = get('fo', 'font-family') ?? get('style', 'font-name')
    return {
      size: size && !size.endsWith('%') ? px(length(size) * 0.75) : px(defaultPt),
      color: get('fo', 'color') ?? '#000000',
      font: family ? family.replace(/^'|'$/g, '') : '',
      bold: get('fo', 'font-weight') === 'bold',
      italic: get('fo', 'font-style') === 'italic',
      underline: !!get('style', 'text-underline-style') && get('style', 'text-underline-style') !== 'none',
      strike: !!get('style', 'text-line-through-style') && get('style', 'text-line-through-style') !== 'none',
    }
  }
  const alignOf = (value: string | null) => (value === 'center' ? 'center' : value === 'end' || value === 'right' ? 'right' : value === 'justify' ? 'justify' : 'left')

  // Paragraphs in order, with the list they belong to.
  const paragraphs: { p: Element; list: 'ul' | 'ol' | null }[] = []
  const listKind = (list: Element): 'ul' | 'ol' => {
    const name = a(list, 'text', 'style-name')
    const style = [...(list.ownerDocument?.getElementsByTagNameNS(NS.text, 'list-style') ?? [])].find((s) => a(s, 'style', 'name') === name)
    return style && kid(style, 'text', 'list-level-style-number') ? 'ol' : 'ul'
  }
  const walk = (el: Element, list: 'ul' | 'ol' | null) => {
    for (const c of kids(el)) {
      if (c.namespaceURI === NS.text && (c.localName === 'p' || c.localName === 'h')) paragraphs.push({ p: c, list })
      else if (c.namespaceURI === NS.text && c.localName === 'list') walk(c, listKind(c))
      else if (c.localName === 'list-item' || c.localName === 'list-header' || c.localName === 'table-row' || c.localName === 'table-cell' || c.localName === 'table-rows' || c.localName === 'table-header-rows') walk(c, list)
    }
  }
  walk(root, null)

  // Shape styles and default styles come after the paragraph and span styles.
  const outer = [shapeChain, styles.defaultsOf('text', 'paragraph', 'graphic')]
  const firstSpan = paragraphs.flatMap(({ p }) => all(p, 'text', 'span'))[0]
  const firstP = paragraphs[0]?.p
  const base = runProps(
    [firstSpan ? styles.chain('text', a(firstSpan, 'text', 'style-name')) : [], firstP ? styles.chain('paragraph', a(firstP, 'text', 'style-name')) : [], ...outer],
  )
  const paraAlign = (p: Element) =>
    alignOf(styles.prop(styles.chain('paragraph', a(p, 'text', 'style-name')), 'paragraph', 'fo', 'text-align') ?? styles.prop(shapeChain, 'paragraph', 'fo', 'text-align'))
  const align0 = firstP ? paraAlign(firstP) : 'left'
  const align = align0 === 'justify' ? 'left' : align0
  const parts: string[] = []
  let open: 'ul' | 'ol' | null = null
  for (const { p, list } of paragraphs) {
    const pChain = styles.chain('paragraph', a(p, 'text', 'style-name'))
    const pAlign = paraAlign(p)
    let content = ''
    const inline = (el: Element, chains: Element[][]) => {
      for (const n of [...el.childNodes]) {
        if (n.nodeType === Node.TEXT_NODE) {
          const text = escapeHtml(n.textContent ?? '')
          if (text) content += format(text, runProps(chains))
        } else if (n instanceof Element) {
          if (n.localName === 's') content += ' '.repeat(Math.max(1, Number(a(n, 'text', 'c') ?? 1)))
          else if (n.localName === 'tab') content += ' '
          else if (n.localName === 'line-break') content += '<br>'
          else if (n.localName === 'span' || n.localName === 'a') inline(n, [styles.chain('text', a(n, 'text', 'style-name')), ...chains])
        }
      }
    }
    const format = (text: string, r: RunProps) => {
      const css: string[] = []
      if (r.size !== base.size) css.push(`font-size:${r.size}px`)
      if (r.color !== base.color) css.push(`color:${r.color}`)
      if (r.font && r.font !== base.font) css.push(`font-family:${cssFont(r.font)}`)
      let html = css.length ? `<span style="${css.join(';')}">${text}</span>` : text
      if (r.bold) html = `<b>${html}</b>`
      if (r.italic) html = `<i>${html}</i>`
      if (r.underline) html = `<u>${html}</u>`
      if (r.strike) html = `<s>${html}</s>`
      return html
    }
    inline(p, [pChain, ...outer])
    const style = pAlign !== align ? ` style="text-align:${pAlign}"` : ''
    if (list && content) {
      if (open !== list) {
        if (open) parts.push(`</${open}>`)
        parts.push(`<${list}>`)
        open = list
      }
      parts.push(`<li${style}>${content}</li>`)
    } else {
      if (open) parts.push(`</${open}>`)
      open = null
      parts.push(`<div${style}>${content || '<br>'}</div>`)
    }
  }
  if (open) parts.push(`</${open}>`)
  while (parts.length && parts.at(-1) === '<div><br></div>') parts.pop()
  return { html: parts.join(''), align, size: base.size, color: base.color, font: base.font ? cssFont(base.font) : '' }
}

// Plain text of the paragraphs (speaker notes).
function paragraphsText(root: Element | null): string {
  if (!root) return ''
  const lines: string[] = []
  const walk = (el: Element) => {
    for (const c of kids(el)) {
      if (c.localName === 'p' || c.localName === 'h') lines.push(lineText(c))
      else walk(c)
    }
  }
  const lineText = (el: Element): string =>
    [...el.childNodes]
      .map((n) => (n.nodeType === Node.TEXT_NODE ? (n.textContent ?? '') : n instanceof Element ? (n.localName === 's' ? ' '.repeat(Number(a(n, 'text', 'c') ?? 1)) : n.localName === 'line-break' ? '\n' : n.localName === 'tab' ? '\t' : lineText(n)) : ''))
      .join('')
  walk(root)
  return lines.join('\n').replace(/\n+$/, '')
}

function cssFont(face: string): string {
  return /,/.test(face) ? face : `${face}, ${/serif|times|georgia|garamond|cambria|book|roman/i.test(face) && !/sans/i.test(face) ? 'serif' : 'sans-serif'}`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

// ---------- Transitions and animations ----------

function readTransition(styles: Styles, chain: Element[]): { transition?: string; transitionDuration?: number } {
  const type = styles.prop(chain, 'drawing-page', 'smil', 'type')
  if (!type) return {}
  const transition = /fade/i.test(type) ? 'fade' : /push|slide/i.test(type) ? 'push' : /wipe|zigzag|iris|clock|fan|snake|spiral|checker|blinds|random/i.test(type) ? 'wipe' : 'fade'
  const dur = seconds(styles.prop(chain, 'drawing-page', 'smil', 'dur'))
  const speed = styles.prop(chain, 'drawing-page', 'presentation', 'transition-speed')
  return { transition, transitionDuration: dur > 0 ? Math.round(dur) : speed === 'slow' ? 1000 : speed === 'medium' ? 750 : 500 }
}

const DIRECTIONS: Record<string, Direction> = { 'from-left': 'left', 'from-right': 'right', 'from-top': 'top', 'from-bottom': 'bottom', 'to-left': 'left', 'to-right': 'right', 'to-top': 'top', 'to-bottom': 'bottom' }

function effectOf(kind: AnimKind, preset: string): AnimEffect {
  if (kind === 'emphasis') return /spin/.test(preset) ? 'spin' : /teeter|wave|shimmer/.test(preset) ? 'teeter' : 'pulse'
  return /appear|disappear/.test(preset) ? 'appear' : /fly|move|peek|crawl/.test(preset) ? 'fly' : /zoom|grow|stretch/.test(preset) ? 'zoom' : /wipe|venetian|box|split|wheel|diagonal|checker|random-bars/.test(preset) ? 'wipe' : 'fade'
}

// The main sequence: each child is a click step; inside it, time groups
// (delayed from the start of the step) hold the effects.
function readAnimations(page: Element, targets: Map<string, string[]>): Animation[] {
  const main = all(page, 'anim', 'seq').find((s) => a(s, 'presentation', 'node-type') === 'main-sequence')
  if (!main) return []
  const found: (Omit<Animation, 'id' | 'pos' | 'delay'> & { start: number })[] = []
  for (const step of kids(main, 'anim', 'par')) {
    let first = true
    for (const group of kids(step, 'anim', 'par')) {
      const groupStart = seconds(a(group, 'smil', 'begin'))
      for (const effect of kids(group, 'anim', 'par')) {
        const cls = a(effect, 'presentation', 'preset-class')
        const kind: AnimKind | null = cls === 'entrance' || cls === 'exit' || cls === 'emphasis' ? cls : null
        const body = [...effect.getElementsByTagName('*')]
        const target = body.map((b) => a(b, 'smil', 'targetElement')).find(Boolean)
        const cells = target ? targets.get(target) : undefined
        if (!kind || !cells?.length) continue
        const effectName = effectOf(kind, a(effect, 'presentation', 'preset-id') ?? '')
        let duration = 0
        for (const b of body) {
          const d = seconds(a(b, 'smil', 'dur')) * (a(b, 'smil', 'autoReverse') === 'true' ? 2 : 1)
          if (d > 1 && d > duration) duration = d
        }
        duration = effectName === 'appear' ? 0 : Math.round(duration) || defaultDuration(effectName)
        const nodeType = a(effect, 'presentation', 'node-type')
        const trigger: Trigger = nodeType === 'after-previous' ? 'after' : nodeType === 'with-previous' || !first ? 'with' : 'click'
        first = false
        const start = groupStart + seconds(a(effect, 'smil', 'begin'))
        const direction = DIRECTIONS[a(effect, 'presentation', 'preset-sub-type') ?? ''] ?? 'left'
        cells.forEach((cell, i) => found.push({ cell, kind, effect: effectName, trigger: i ? 'with' : trigger, duration, direction, start }))
      }
    }
  }
  return animationsFromStarts(found)
}
