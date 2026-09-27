// .drawio file format ↔ PageRecord[] converter. Pure: DOMParser for reading,
// string building for writing (so writing also works without a DOM).
// File layout and compression follow draw.io (Apache-2.0, JGraph Ltd):
// <mxfile><diagram id name>(<mxGraphModel>… | base64(deflateRaw(encodeURIComponent(xml))))</diagram></mxfile>

import { emptyPage, newCellId, type CellRecord, type GeometryRecord, type PageAttrs, type PageRecord } from '../model'
import { deflateRawSync } from './deflate'
import { t } from '../../../core/i18n'

// Extra geometry kept in the JSON for fidelity: the collapsed/expanded size of
// containers (draw.io's <mxRectangle as="alternateBounds">), as [x, y, width, height].
export interface DrawioGeometry extends GeometryRecord {
  alternateBounds?: [number, number, number, number]
}

export interface SerializeOptions {
  // Writes each page as draw.io's compressed text instead of plain XML.
  compressed?: boolean
  // Value of the mxfile host attribute.
  host?: string
}

const USER_OBJECT_TAGS = new Set(['UserObject', 'object'])

// ---------------------------------------------------------------------------
// Parsing

// Parses a .drawio / .xml file: an <mxfile> with one or more <diagram> (plain or
// compressed), a bare <mxGraphModel> or a single <diagram>.
export async function parseDrawio(text: string): Promise<PageRecord[]> {
  const root = parseXml(text)
  const pages: PageRecord[] = []
  const usedIds = new Set<string>()
  const addPage = (id: string | null, name: string | null, model: Element | null) => {
    const index = pages.length + 1
    let pageId = id || `page-${index}`
    for (let n = 2; usedIds.has(pageId); n++) pageId = `${id || `page-${index}`}-${n}`
    usedIds.add(pageId)
    pages.push({ id: pageId, name: name ?? `Page-${index}`, ...(model ? modelAttrs(model) : {}), cells: model ? parseModel(model) : emptyPage().cells })
  }
  switch (root.localName) {
    case 'mxfile':
      for (const diagram of childElements(root, 'diagram')) addPage(diagram.getAttribute('id'), diagram.getAttribute('name'), await diagramModel(diagram))
      break
    case 'diagram':
      addPage(root.getAttribute('id'), root.getAttribute('name'), await diagramModel(root))
      break
    case 'mxGraphModel':
      addPage(null, null, root)
      break
    default:
      throw new Error(t('Not a draw.io file (root element <{name}>)', { name: root.localName }))
  }
  if (!pages.length) addPage(null, null, null)
  return pages
}

function parseXml(text: string): Element {
  const doc = new DOMParser().parseFromString(text.replace(/^﻿/, '').trim(), 'text/xml')
  const error = doc.getElementsByTagName('parsererror')[0]
  if (error || !doc.documentElement) throw new Error(`Invalid XML: ${error?.textContent?.trim() ?? 'empty document'}`)
  return doc.documentElement
}

function childElements(el: Element, name?: string): Element[] {
  return Array.from(el.children).filter((c) => !name || c.localName === name)
}

// The <mxGraphModel> of a <diagram>: an element child or compressed text.
async function diagramModel(diagram: Element): Promise<Element | null> {
  const model = childElements(diagram, 'mxGraphModel')[0]
  if (model) return model
  const text = (diagram.textContent ?? '').trim()
  if (!text) return null
  const xml = text.startsWith('<') ? text : await decompressDiagram(text)
  if (!xml.trim()) return null
  const root = parseXml(xml)
  return root.localName === 'mxGraphModel' ? root : childElements(root, 'mxGraphModel')[0] ?? null
}

// base64 → raw inflate → URI-decoded XML, like draw.io's Graph.decompress.
export async function decompressDiagram(text: string): Promise<string> {
  const binary = atob(text.replace(/\s+/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  const inflated = new TextDecoder().decode(await new Response(stream).arrayBuffer())
  try {
    return decodeURIComponent(inflated)
  } catch {
    return inflated
  }
}

// Page settings of an <mxGraphModel>: background color and page size.
function modelAttrs(model: Element): PageAttrs {
  const attrs: PageAttrs = {}
  const bg = model.getAttribute('background')
  if (bg && bg !== 'none') attrs.background = bg
  for (const k of ['pageWidth', 'pageHeight'] as const) {
    const v = Number(model.getAttribute(k))
    if (v > 0) attrs[k] = v
  }
  return attrs
}

interface RawCell {
  cell: CellRecord
  parentAttr: string | null
}

function parseModel(model: Element): CellRecord[] {
  const rootEl = childElements(model, 'root')[0]
  if (!rootEl) return emptyPage().cells
  const raws: RawCell[] = []
  const elements = childElements(rootEl).filter((el) => el.localName === 'mxCell' || USER_OBJECT_TAGS.has(el.localName))
  // Explicit ids are reserved up front so generated ones never collide with later cells.
  const explicit = new Set(elements.map((el) => el.getAttribute('id')).filter((id): id is string => !!id))
  const used = new Set<string>()
  let autoId = 0
  const uniqueId = (id: string | null) => {
    let result = id && !used.has(id) ? id : null
    while (!result || used.has(result) || (result !== id && explicit.has(result))) result = id ? `${id}-${++autoId}` : `auto-${++autoId}`
    used.add(result)
    return result
  }
  for (const el of elements) {
    const wrapper = el.localName === 'mxCell' ? null : el
    const cellEl = wrapper ? childElements(wrapper, 'mxCell')[0] ?? null : el
    const cell: CellRecord = { id: uniqueId((wrapper ?? el).getAttribute('id')) }
    if (wrapper) {
      const data: Record<string, string> = {}
      for (const attr of Array.from(wrapper.attributes)) {
        if (attr.name === 'id') continue
        if (attr.name === 'label') cell.value = attr.value
        else data[attr.name] = attr.value
      }
      cell.data = JSON.stringify(data)
    } else if (el.hasAttribute('value')) {
      cell.value = el.getAttribute('value')!
    }
    const get = (name: string) => cellEl?.getAttribute(name) ?? null
    const style = get('style')
    if (style !== null) cell.style = style
    if (get('vertex') === '1') cell.vertex = 1
    if (get('edge') === '1') cell.edge = 1
    const source = get('source')
    if (source) cell.source = source
    const target = get('target')
    if (target) cell.target = target
    if (get('connectable') === '0') cell.connectable = 0
    if (get('collapsed') === '1') cell.collapsed = 1
    if (get('visible') === '0') cell.visible = 0
    const geometryEl = cellEl && childElements(cellEl, 'mxGeometry')[0]
    if (geometryEl) cell.geometry = JSON.stringify(parseGeometryElement(geometryEl))
    raws.push({ cell, parentAttr: get('parent') })
  }
  return linkCells(raws)
}

// Sets parent (dangling parentless cells go to the first layer) and previous.
function linkCells(raws: RawCell[]): CellRecord[] {
  const rootId = raws.find((r) => !r.parentAttr)?.cell.id
  const firstLayer = raws.find((r) => r.parentAttr && r.parentAttr === rootId)?.cell.id
  const last = new Map<string, string>()
  const cells: CellRecord[] = []
  for (const { cell, parentAttr } of raws) {
    const parent = parentAttr || (cell.id === rootId ? undefined : firstLayer ?? rootId)
    const ordered: CellRecord = { id: cell.id }
    if (parent !== undefined) {
      ordered.parent = parent
      const previous = last.get(parent)
      if (previous !== undefined) ordered.previous = previous
      last.set(parent, cell.id)
    }
    cells.push({ ...ordered, ...withoutId(cell) })
  }
  return cells
}

function withoutId(cell: CellRecord): Omit<CellRecord, 'id'> {
  const { id: _id, ...rest } = cell
  return rest
}

function num(el: Element, name: string): number {
  const value = parseFloat(el.getAttribute(name) ?? '')
  return Number.isFinite(value) ? value : 0
}

function point(el: Element): [number, number] {
  return [num(el, 'x'), num(el, 'y')]
}

function parseGeometryElement(el: Element): DrawioGeometry {
  const geometry: DrawioGeometry = { x: num(el, 'x'), y: num(el, 'y'), width: num(el, 'width'), height: num(el, 'height') }
  if (el.getAttribute('relative') === '1') geometry.relative = 1
  let points: [number, number][] | undefined
  let sourcePoint: [number, number] | undefined
  let targetPoint: [number, number] | undefined
  let offset: [number, number] | undefined
  let alternateBounds: [number, number, number, number] | undefined
  for (const child of childElements(el)) {
    const as = child.getAttribute('as')
    if (child.localName === 'mxPoint') {
      if (as === 'sourcePoint') sourcePoint = point(child)
      else if (as === 'targetPoint') targetPoint = point(child)
      else if (as === 'offset') offset = point(child)
    } else if (child.localName === 'Array' && as === 'points') {
      points = childElements(child, 'mxPoint').map(point)
    } else if (child.localName === 'mxRectangle' && as === 'alternateBounds') {
      alternateBounds = [num(child, 'x'), num(child, 'y'), num(child, 'width'), num(child, 'height')]
    }
  }
  // Fixed key order keeps the JSON stable across round trips.
  if (points) geometry.points = points
  if (sourcePoint) geometry.sourcePoint = sourcePoint
  if (targetPoint) geometry.targetPoint = targetPoint
  if (offset) geometry.offset = offset
  if (alternateBounds) geometry.alternateBounds = alternateBounds
  return geometry
}

// ---------------------------------------------------------------------------
// Serializing

// Writes an <mxfile> that draw.io opens. Plain XML by default; with
// `compressed: true` each page is written in draw.io's compressed form.
export function serializeDrawio(pages: PageRecord[], options: SerializeOptions = {}): string {
  const compressed = !!options.compressed
  const out = [`<mxfile host="${escapeAttr(options.host ?? 'words-online')}" compressed="${compressed}">`]
  for (const page of pages) {
    const open = `  <diagram id="${escapeAttr(page.id)}" name="${escapeAttr(page.name)}">`
    if (compressed) {
      out.push(`${open}${compressDiagram(modelXml(page.cells, '', '', page))}</diagram>`)
    } else {
      out.push(open, modelXml(page.cells, '    ', '\n', page), '  </diagram>')
    }
  }
  out.push('</mxfile>')
  return out.join('\n') + '\n'
}

// encodeURIComponent → raw deflate → base64, like draw.io's Graph.compress.
export function compressDiagram(xml: string): string {
  const bytes = deflateRawSync(new TextEncoder().encode(encodeURIComponent(xml)))
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

// A single <mxGraphModel> element for the given cells.
export function serializeModel(cells: CellRecord[]): string {
  return modelXml(cells, '', '\n')
}

function modelXml(cells: CellRecord[], indent: string, nl: string, attrs: PageAttrs = {}): string {
  const step = nl ? '  ' : ''
  const modelAttrs = attrString([['background', attrs.background], ['pageWidth', attrs.pageWidth], ['pageHeight', attrs.pageHeight]])
  const lines = [`${indent}<mxGraphModel${modelAttrs}>`, `${indent}${step}<root>`]
  for (const cell of orderCells(cells)) lines.push(cellXml(cell, indent + step + step, step, nl))
  lines.push(`${indent}${step}</root>`, `${indent}</mxGraphModel>`)
  return lines.join(nl)
}

// Depth-first order (parents before children), siblings by their previous chain.
export function orderCells(cells: CellRecord[]): CellRecord[] {
  const byId = new Map(cells.map((c) => [c.id, c]))
  const children = new Map<string, CellRecord[]>()
  const roots: CellRecord[] = []
  for (const cell of cells) {
    if (cell.parent === undefined || !byId.has(cell.parent) || cell.parent === cell.id) roots.push(cell)
    else {
      const list = children.get(cell.parent)
      if (list) list.push(cell)
      else children.set(cell.parent, [cell])
    }
  }
  const result: CellRecord[] = []
  const visited = new Set<string>()
  const visit = (cell: CellRecord) => {
    if (visited.has(cell.id)) return
    visited.add(cell.id)
    result.push(cell)
    for (const child of sortSiblings(children.get(cell.id) ?? [])) visit(child)
  }
  // True roots first, then cells whose parent is missing (kept so nothing is lost).
  for (const cell of roots) if (cell.parent === undefined) visit(cell)
  for (const cell of roots) visit(cell)
  // Parent cycles: unreachable from any root.
  for (const cell of cells) visit(cell)
  return result
}

function sortSiblings(siblings: CellRecord[]): CellRecord[] {
  if (siblings.length < 2) return siblings
  const ids = new Set(siblings.map((c) => c.id))
  const next = new Map<string, CellRecord[]>()
  const heads: CellRecord[] = []
  for (const cell of siblings) {
    if (cell.previous === undefined || !ids.has(cell.previous) || cell.previous === cell.id) heads.push(cell)
    else {
      const list = next.get(cell.previous)
      if (list) list.push(cell)
      else next.set(cell.previous, [cell])
    }
  }
  const result: CellRecord[] = []
  const seen = new Set<string>()
  const walk = (cell: CellRecord) => {
    // Iterative along the chain; forks (two cells claiming one predecessor) recurse.
    let current: CellRecord | undefined = cell
    while (current && !seen.has(current.id)) {
      seen.add(current.id)
      result.push(current)
      const following: CellRecord[] = next.get(current.id) ?? []
      for (const extra of following.slice(1)) walk(extra)
      current = following[0]
    }
  }
  for (const head of heads) walk(head)
  // Cycles in the previous chain: keep array order.
  for (const cell of siblings) walk(cell)
  return result
}

function cellXml(cell: CellRecord, indent: string, step: string, nl: string): string {
  let data: Record<string, unknown> | null = null
  if (cell.data !== undefined) {
    try {
      const parsed: unknown = JSON.parse(cell.data)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed as Record<string, unknown>
    } catch {
      data = null
    }
  }
  const attrs: [string, string | number | undefined][] = [
    ['style', cell.style],
    ['parent', cell.parent],
    ['vertex', cell.vertex],
    ['edge', cell.edge],
    ['connectable', cell.connectable],
    ['collapsed', cell.collapsed],
    ['visible', cell.visible],
    ['source', cell.source],
    ['target', cell.target],
  ]
  const geometry = geometryXml(cell.geometry, indent + (data ? step + step : step), step, nl)
  if (data) {
    const userAttrs: [string, string | undefined][] = [['label', cell.value ?? undefined]]
    for (const [key, value] of Object.entries(data)) {
      if (key === 'id' || key === 'label' || !isXmlName(key) || value === null || value === undefined) continue
      userAttrs.push([key, typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value)])
    }
    userAttrs.push(['id', cell.id])
    const inner = element('mxCell', attrs, geometry, indent + step, nl)
    return `${indent}<UserObject${attrString(userAttrs)}>${nl}${inner}${nl}${indent}</UserObject>`
  }
  return element('mxCell', [['id', cell.id], ['value', cell.value], ...attrs], geometry, indent, nl)
}

function element(name: string, attrs: [string, string | number | undefined][], body: string | null, indent: string, nl: string): string {
  const open = `${indent}<${name}${attrString(attrs)}`
  return body ? `${open}>${nl}${body}${nl}${indent}</${name}>` : `${open} />`
}

function attrString(attrs: [string, string | number | undefined][]): string {
  return attrs.map(([k, v]) => (v === undefined ? '' : ` ${k}="${escapeAttr(String(v))}"`)).join('')
}

function geometryXml(json: string | undefined, indent: string, step: string, nl: string): string | null {
  if (!json) return null
  let g: DrawioGeometry
  try {
    g = JSON.parse(json) as DrawioGeometry
  } catch {
    return null
  }
  if (!g || typeof g !== 'object') return null
  const attrs: [string, string | number | undefined][] = [
    ['x', nonZero(g.x)],
    ['y', nonZero(g.y)],
    ['width', nonZero(g.width)],
    ['height', nonZero(g.height)],
    ['relative', g.relative ? 1 : undefined],
    ['as', 'geometry'],
  ]
  const inner = indent + step
  const children: string[] = []
  const pointXml = (p: [number, number] | undefined, as: string | null, ind: string) =>
    p && children.push(`${ind}<mxPoint${attrString([['x', nonZero(p[0])], ['y', nonZero(p[1])], ['as', as ?? undefined]])} />`)
  pointXml(g.sourcePoint, 'sourcePoint', inner)
  pointXml(g.targetPoint, 'targetPoint', inner)
  if (Array.isArray(g.points)) {
    children.push(`${inner}<Array as="points">`)
    for (const p of g.points) pointXml(p, null, inner + step)
    children.push(`${inner}</Array>`)
  }
  pointXml(g.offset, 'offset', inner)
  const b = g.alternateBounds
  if (Array.isArray(b)) {
    children.push(`${inner}<mxRectangle${attrString([['x', nonZero(b[0])], ['y', nonZero(b[1])], ['width', nonZero(b[2])], ['height', nonZero(b[3])], ['as', 'alternateBounds']])} />`)
  }
  return element('mxGeometry', attrs, children.length ? children.join(nl) : null, indent, nl)
}

// draw.io omits geometry values equal to their default (0).
function nonZero(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value !== 0 ? value : undefined
}

function isXmlName(name: string): boolean {
  return /^[A-Za-z_][\w.-]*$/.test(name)
}

// Attribute escaping; control characters that XML cannot hold are dropped.
function escapeAttr(value: string): string {
  return value
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '&#xa;')
    .replace(/\r/g, '&#xd;')
    .replace(/\t/g, '&#x9;')
}

// ---------------------------------------------------------------------------
// Helpers

// A random cell id in draw.io's style (20 URL-safe characters).
export { newCellId }

// An empty one-page .drawio file.
export const DEFAULT_DRAWIO = serializeDrawio([emptyPage()])
