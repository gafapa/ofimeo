// Visio (.vsdx drawings, .vssx stencils, .vstx templates) import: pages,
// shapes with their masters and style sheets, geometry, text, connectors,
// groups and pictures, converted to the diagram model with draw.io styles.
// Follows the behaviour of draw.io's importer (js/diagramly/vsdx/importer.js,
// Copyright (c) 2006-2025 JGraph Holdings Ltd / draw.io AG, Apache-2.0):
// 1 inch = 101.6 px, Visio geometry becomes an inline stencil
// (shape=stencil(…)) unless it is a plain rectangle, ellipse or a well-known
// master (flowchart and basic shapes), which map to draw.io's own shapes.

import JSZip from 'jszip'
import { t } from '../../../core/i18n'
import { encodeStencil } from '../shapes/stencils'
import { newCellId, type CellRecord, type PageRecord } from '../model'

// draw.io's conversion factor: 40 px per cm.
const CF = 40 * 2.54
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

type Kind = 'line' | 'fill' | 'text' | null

const LINE_CELLS = new Set(['LineWeight', 'LineColor', 'LinePattern', 'Rounding', 'BeginArrow', 'EndArrow', 'BeginArrowSize', 'EndArrowSize', 'LineCap', 'LineColorTrans'])
const FILL_CELLS = new Set(['FillForegnd', 'FillBkgnd', 'FillPattern', 'FillForegndTrans', 'FillBkgndTrans', 'ShdwForegnd', 'ShdwPattern', 'ShdwForegndTrans', 'ShapeShdwType', 'ShapeShdwOffsetX', 'ShapeShdwOffsetY'])
const TEXT_CELLS = new Set(['LeftMargin', 'RightMargin', 'TopMargin', 'BottomMargin', 'VerticalAlign', 'TextBkgnd', 'TextDirection'])
const kindOf = (name: string): Kind => (LINE_CELLS.has(name) ? 'line' : FILL_CELLS.has(name) ? 'fill' : TEXT_CELLS.has(name) ? 'text' : null)
const STYLE_ATTR: Record<Exclude<Kind, null>, string> = { line: 'LineStyle', fill: 'FillStyle', text: 'TextStyle' }

// Visio's default color table (draw.io's mxPropertiesManager).
const COLORS = ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#800000', '#008000', '#000080', '#808000', '#800080', '#008080', '#C0C0C0', '#E6E6E6', '#CDCDCD', '#B3B3B3', '#9A9A9A', '#808080', '#666666', '#4D4D4D', '#333333', '#1A1A1A']

// Visio arrow ids → draw.io markers (VsdxShape.arrowTypes); "!" means unfilled.
const ARROWS: Record<number, string> = {
  1: 'open', 2: 'blockThin', 3: 'open', 4: 'block', 5: 'classic', 6: 'block', 7: 'open', 8: 'classic', 9: 'openAsync', 10: 'oval', 13: 'block',
  14: '!block', 17: '!classic', 20: '!oval', 22: '!diamond', 11: 'diamond', 23: 'dash', 24: 'ERone', 25: 'ERmandOne', 27: 'ERmany', 28: 'ERoneToMany', 29: 'ERzeroToMany', 30: 'ERzeroToOne',
}

// Well-known masters (by universal name) → draw.io styles.
const MASTER_STYLES: [RegExp, string][] = [
  [/^(decision|diamond)$/, 'rhombus;'],
  [/^(data|parallelogram)$/, 'shape=parallelogram;perimeter=parallelogramPerimeter;fixedSize=1;'],
  [/^document$/, 'shape=document;boundedLbl=1;'],
  [/^(start\/end|terminator)$/, 'rounded=1;arcSize=50;'],
  [/^(circle|ellipse|on-page reference)$/, 'ellipse;'],
  [/^off-page reference$/, 'shape=offPageConnector;'],
  [/^manual input$/, 'shape=manualInput;boundedLbl=1;'],
  [/^(predefined process|subprocess)$/, 'shape=process;backgroundOutline=1;'],
  [/^(database|stored data|direct data)$/, 'shape=cylinder3;boundedLbl=1;backgroundOutline=1;size=15;'],
  [/^(triangle|isosceles triangle)$/, 'triangle;direction=north;'],
  [/^(hexagon|preparation)$/, 'shape=hexagon;perimeter=hexagonPerimeter2;fixedSize=1;'],
  [/^(rectangle|square|process)$/, ''],
  [/^rounded rectangle$/, 'rounded=1;'],
  [/^manual operation$/, 'shape=trapezoid;perimeter=trapezoidPerimeter;flipV=1;fixedSize=1;'],
  [/^(internal storage)$/, 'shape=internalStorage;'],
  [/^cloud$/, 'ellipse;shape=cloud;'],
  [/^(cross|plus)$/, 'shape=cross;'],
  [/^(5-point star|star)$/, ''],
]

interface Pkg {
  zip: JSZip
  stylesheets: Map<string, Sheet>
  colors: string[]
  theme: Record<string, string>
  masters: Map<string, Master>
  media: Map<string, string | null>
}

interface Master {
  id: string
  name: string
  top: Element | null
  shapes: Map<string, Element>
  part: Part
  sheets: Map<string, Sheet>
}

interface Part {
  path: string
  doc: Document
  rels: Map<string, string>
}

// ---------- XML helpers ----------

const kids = (el: Element | null | undefined, name?: string) => (el ? [...el.children].filter((c) => !name || c.localName === name) : [])
const kid = (el: Element | null | undefined, name: string) => kids(el, name)[0] ?? null
const round = (n: number) => Math.round(n * 100) / 100

function resolvePath(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = base.split('/').slice(0, -1)
  for (const p of target.split('/')) {
    if (p === '..') parts.pop()
    else if (p !== '.') parts.push(p)
  }
  return parts.join('/')
}

async function readPart(zip: JSZip, path: string): Promise<Part | null> {
  const file = zip.file(path)
  if (!file) return null
  const doc = new DOMParser().parseFromString((await file.async('text')).replace(/^\uFEFF/, ''), 'application/xml')
  const rels = new Map<string, string>()
  const relsFile = zip.file(path.replace(/([^/]+)$/, '_rels/$1.rels'))
  if (relsFile) {
    const relsDoc = new DOMParser().parseFromString(await relsFile.async('text'), 'application/xml')
    for (const rel of relsDoc.getElementsByTagNameNS('*', 'Relationship')) {
      if (rel.getAttribute('TargetMode') === 'External') continue
      rels.set(rel.getAttribute('Id') ?? '', resolvePath(path, rel.getAttribute('Target') ?? ''))
    }
  }
  return { path, doc, rels }
}

const relId = (el: Element | null) => el?.getAttributeNS(NS_R, 'id') ?? el?.getAttribute('r:id') ?? null

// ---------- Sheets: shapes, master shapes and style sheets with inheritance ----------

class Sheet {
  readonly cells = new Map<string, Element>()
  readonly sections = new Map<string, Element>()

  constructor(
    readonly el: Element,
    readonly pkg: Pkg,
    readonly master: Sheet | null = null,
    readonly part: Part | null = null,
  ) {
    for (const c of kids(el, 'Cell')) this.cells.set(c.getAttribute('N') ?? '', c)
    for (const s of kids(el, 'Section')) {
      const n = s.getAttribute('N') ?? ''
      this.sections.set(n === 'Geometry' ? `Geometry:${s.getAttribute('IX') ?? '0'}` : n, s)
    }
  }

  get id(): string {
    return this.el.getAttribute('ID') ?? ''
  }

  // The style sheet id of a kind: own attribute, else the master's.
  styleId(kind: Exclude<Kind, null>): string | null {
    return this.el.getAttribute(STYLE_ATTR[kind]) ?? this.master?.styleId(kind) ?? null
  }

  // Cell element by name: own, master's, then the style sheets for style cells.
  cell(name: string): Element | null {
    for (let s: Sheet | null = this; s; s = s.master) {
      const c = s.cells.get(name)
      if (c && !isInherited(c)) return c
    }
    for (let s: Sheet | null = this; s; s = s.master) {
      const c = s.cells.get(name)
      if (c) return c
    }
    const kind = kindOf(name)
    return kind ? this.styleCell(kind, (ss) => ss.cells.get(name) ?? null) : null
  }

  private styleCell<T>(kind: Exclude<Kind, null>, get: (ss: Sheet) => T | null): T | null {
    const seen = new Set<string>()
    let id = this.styleId(kind)
    while (id !== null && !seen.has(id)) {
      seen.add(id)
      const ss = this.pkg.stylesheets.get(id)
      if (!ss) break
      const v = get(ss)
      if (v !== null) return v
      id = ss.el.getAttribute(STYLE_ATTR[kind])
    }
    return null
  }

  value(name: string): string | null {
    const c = this.cell(name)
    return c?.getAttribute('V') ?? null
  }

  num(name: string, def = 0): number {
    const v = Number(this.value(name))
    return this.value(name) === null || !Number.isFinite(v) ? def : v
  }

  has(name: string): boolean {
    for (let s: Sheet | null = this; s; s = s.master) if (s.cells.has(name)) return true
    return false
  }

  // A cell of a row (by IX) of an indexed section such as Character or Paragraph.
  rowValue(section: string, ix: string, name: string): string | null {
    const find = (s: Sheet) => {
      const row = kids(s.sections.get(section), 'Row').find((r) => (r.getAttribute('IX') ?? '0') === ix)
      return kids(row, 'Cell').find((c) => c.getAttribute('N') === name)?.getAttribute('V') ?? null
    }
    for (let s: Sheet | null = this; s; s = s.master) {
      const v = find(s)
      if (v !== null) return v
    }
    return this.styleCell('text', (ss) => find(ss))
  }

  text(): Element | null {
    for (let s: Sheet | null = this; s; s = s.master) {
      const tx = kid(s.el, 'Text')
      if (tx) return tx
    }
    return null
  }

  foreign(): { el: Element; part: Part | null } | null {
    for (let s: Sheet | null = this; s; s = s.master) {
      const f = kid(s.el, 'ForeignData')
      if (f) return { el: f, part: s.part }
    }
    return null
  }

  // Geometry sections merged with the master's, by section and row index.
  geometry(): GeoSection[] {
    const base = this.master?.geometry() ?? []
    const map = new Map(base.map((g) => [g.ix, { ...g, rows: new Map(g.rows) }]))
    for (const [key, section] of this.sections) {
      if (!key.startsWith('Geometry:')) continue
      const ix = Number(key.slice(9))
      if (section.getAttribute('Del') === '1') {
        map.delete(ix)
        continue
      }
      const geo = map.get(ix) ?? { ix, flags: {}, rows: new Map<number, GeoRow>() }
      const flags = { ...geo.flags }
      for (const c of kids(section, 'Cell')) flags[c.getAttribute('N') ?? ''] = c.getAttribute('V') ?? ''
      for (const r of kids(section, 'Row')) {
        const rix = Number(r.getAttribute('IX') ?? geo.rows.size + 1)
        if (r.getAttribute('Del') === '1') {
          geo.rows.delete(rix)
          continue
        }
        const old = geo.rows.get(rix)
        const type = r.getAttribute('T') ?? old?.t ?? ''
        const cells: Record<string, string> = old && old.t === type ? { ...old.cells } : {}
        for (const c of kids(r, 'Cell')) cells[c.getAttribute('N') ?? ''] = c.getAttribute('V') ?? c.getAttribute('F') ?? ''
        geo.rows.set(rix, { t: type, cells })
      }
      map.set(ix, { ...geo, flags })
    }
    return [...map.values()].sort((a, b) => a.ix - b.ix)
  }
}

interface GeoRow {
  t: string
  cells: Record<string, string>
}

interface GeoSection {
  ix: number
  flags: Record<string, string>
  rows: Map<number, GeoRow>
}

const isInherited = (c: Element) => c.getAttribute('V') === 'Themed'

// ---------- Entry ----------

export async function parseVsdx(buffer: ArrayBuffer): Promise<PageRecord[]> {
  const zip = await JSZip.loadAsync(buffer)
  const docPath = zip.file('visio/document.xml') ? 'visio/document.xml' : Object.keys(zip.files).find((p) => /(^|\/)document\.xml$/.test(p))
  const document = docPath ? await readPart(zip, docPath) : null
  if (!document) throw new Error(t('Not a Visio file'))
  const pkg: Pkg = { zip, stylesheets: new Map(), colors: [...COLORS], theme: {}, masters: new Map(), media: new Map() }

  // Color table and style sheets.
  for (const entry of document.doc.getElementsByTagNameNS('*', 'ColorEntry')) {
    const ix = Number(entry.getAttribute('IX'))
    const rgb = entry.getAttribute('RGB')
    if (Number.isFinite(ix) && rgb) pkg.colors[ix] = rgb
  }
  for (const ss of document.doc.getElementsByTagNameNS('*', 'StyleSheet')) pkg.stylesheets.set(ss.getAttribute('ID') ?? '', new Sheet(ss, pkg))

  // Theme colors for "Themed" values.
  const themePath = [...document.rels.values()].find((p) => /theme\/theme\d*\.xml$/.test(p))
  const theme = themePath ? await readPart(zip, themePath) : null
  const scheme = theme?.doc.getElementsByTagNameNS('*', 'clrScheme')[0]
  for (const c of kids(scheme)) {
    const v = kid(c, 'srgbClr')?.getAttribute('val') ?? kid(c, 'sysClr')?.getAttribute('lastClr')
    if (v) pkg.theme[c.localName] = `#${v.toLowerCase()}`
  }
  // Visio's variant colors (the first variation), for QuickStyle color indexes 100 and up.
  const variation = theme?.doc.getElementsByTagNameNS('*', 'variationClrScheme')[0]
  for (const c of kids(variation)) {
    const v = kid(c, 'srgbClr')?.getAttribute('val')
    if (v) pkg.theme[c.localName] = `#${v.toLowerCase()}`
  }

  // Masters.
  const mastersPath = [...document.rels.values()].find((p) => /masters\/masters\.xml$/.test(p))
  const masters = mastersPath ? await readPart(zip, mastersPath) : null
  for (const m of masters ? [...masters.doc.getElementsByTagNameNS('*', 'Master')] : []) {
    const path = masters!.rels.get(relId(kid(m, 'Rel')) ?? '')
    const part = path ? await readPart(zip, path) : null
    if (!part) continue
    const shapes = new Map<string, Element>()
    for (const s of part.doc.getElementsByTagNameNS('*', 'Shape')) shapes.set(s.getAttribute('ID') ?? '', s)
    const top = kids(kid(part.doc.documentElement, 'Shapes'), 'Shape')[0] ?? null
    pkg.masters.set(m.getAttribute('ID') ?? '', { id: m.getAttribute('ID') ?? '', name: m.getAttribute('NameU') ?? m.getAttribute('Name') ?? '', top, shapes, part, sheets: new Map() })
  }

  const pages: PageRecord[] = []
  const pagesPath = [...document.rels.values()].find((p) => /pages\/pages\.xml$/.test(p))
  const pagesPart = pagesPath ? await readPart(zip, pagesPath) : null
  const pageEls = pagesPart ? [...pagesPart.doc.getElementsByTagNameNS('*', 'Page')] : []
  for (const pageEl of pageEls) {
    if (pageEl.getAttribute('Background') === '1' && pageEls.length > 1) continue
    const path = pagesPart!.rels.get(relId(kid(pageEl, 'Rel')) ?? '')
    const part = path ? await readPart(zip, path) : null
    if (!part) continue
    pages.push(await convertPage(pkg, pageEl, part, pages.length))
  }
  // Stencils (.vssx) have masters only: one page with every master.
  if (!pages.length && pkg.masters.size) pages.push(await stencilPage(pkg))
  if (!pages.length) throw new Error(t('The Visio file has no pages'))
  return pages
}

// ---------- Pages ----------

interface Ctx {
  pkg: Pkg
  part: Part
  cells: CellRecord[]
  // Visio shape id → cell id, and absolute bounds of vertices (px) for connections.
  ids: Map<string, string>
  bounds: Map<string, { x: number; y: number; w: number; h: number; rotated: boolean }>
  edges: { sheet: Sheet; parent: string; box: Box; ox: number; oy: number }[]
  last: Map<string, string>
  scale: number
}

// A parent's coordinate system: height (inches, for flipping Y) and its absolute origin (px).
interface Box {
  height: number
}

function pageSheetValue(pageEl: Element, name: string): number | null {
  const c = kids(kid(pageEl, 'PageSheet'), 'Cell').find((e) => e.getAttribute('N') === name)
  const v = Number(c?.getAttribute('V'))
  return c && Number.isFinite(v) ? v : null
}

async function convertPage(pkg: Pkg, pageEl: Element, part: Part, index: number): Promise<PageRecord> {
  const pageScale = pageSheetValue(pageEl, 'PageScale') ?? 1
  const drawingScale = pageSheetValue(pageEl, 'DrawingScale') ?? 1
  const scale = drawingScale ? pageScale / drawingScale : 1
  const width = (pageSheetValue(pageEl, 'PageWidth') ?? 8.5) * scale
  const height = (pageSheetValue(pageEl, 'PageHeight') ?? 11) * scale
  const ctx = newCtx(pkg, part, scale)
  const shapes = kids(kid(part.doc.documentElement, 'Shapes'), 'Shape')
  for (const el of shapes) await addShape(ctx, el, null, '1', { height }, 0, 0)
  addEdges(ctx, connectsOf(part))
  return {
    id: `page-${index + 1}`,
    name: pageEl.getAttribute('Name') ?? pageEl.getAttribute('NameU') ?? `Page-${index + 1}`,
    pageWidth: Math.round(width * CF),
    pageHeight: Math.round(height * CF),
    cells: ctx.cells,
  }
}

function newCtx(pkg: Pkg, part: Part, scale: number): Ctx {
  return { pkg, part, cells: [{ id: '0' }, { id: '1', parent: '0' }], ids: new Map(), bounds: new Map(), edges: [], last: new Map(), scale }
}

// Every master of a stencil laid out in a grid, with its name.
async function stencilPage(pkg: Pkg): Promise<PageRecord> {
  const first = [...pkg.masters.values()][0]
  const ctx = newCtx(pkg, first.part, 1)
  const slot = 160
  const cols = 5
  let i = 0
  for (const master of pkg.masters.values()) {
    if (!master.top) continue
    ctx.part = master.part
    const x = (i % cols) * slot + 20
    const y = Math.floor(i / cols) * (slot + 30) + 20
    const sheet = new Sheet(master.top, pkg, null, master.part)
    const w = sheet.num('Width', 1) * CF
    const h = sheet.num('Height', 1) * CF
    const f = Math.min(1, (slot - 20) / Math.max(w, h, 1))
    const before = ctx.cells.length
    await addShape(ctx, master.top, null, '1', { height: sheet.num('Height', 1) }, 0, 0, master)
    // 1-D masters (connectors): a sample line in the slot.
    if (ctx.edges.length) {
      addEdges(ctx, new Map())
      ctx.edges = []
      const edge = ctx.cells[before]
      edge.geometry = JSON.stringify({ x: 0, y: 0, width: 0, height: 0, relative: 1, sourcePoint: [x, y + 60], targetPoint: [x + slot - 20, y + 60] })
    }
    // Moves (and shrinks) the master's cell into its slot.
    const top = ctx.cells[before]
    if (top?.vertex && top.geometry) {
      const g = JSON.parse(top.geometry) as { x: number; y: number; width: number; height: number }
      g.x = x + (slot - 20 - g.width * f) / 2
      g.y = y
      g.width = round(g.width * f)
      g.height = round(g.height * f)
      top.geometry = JSON.stringify(g)
    }
    push(ctx, '1', { vertex: 1, value: escapeHtml(master.name), style: 'text;html=1;align=center;verticalAlign=top;whiteSpace=wrap;fontSize=11;', geometry: JSON.stringify({ x, y: y + slot - 16, width: slot - 20, height: 30 }) })
    i++
  }
  return { id: 'page-1', name: t('Stencil'), cells: ctx.cells }
}

function connectsOf(part: Part): Map<string, { begin?: Connect; end?: Connect }> {
  const out = new Map<string, { begin?: Connect; end?: Connect }>()
  for (const c of part.doc.getElementsByTagNameNS('*', 'Connect')) {
    const from = c.getAttribute('FromSheet') ?? ''
    const fromCell = c.getAttribute('FromCell') ?? ''
    const entry = out.get(from) ?? {}
    const connect = { to: c.getAttribute('ToSheet') ?? '', toCell: c.getAttribute('ToCell') ?? '' }
    if (fromCell.startsWith('Begin')) entry.begin = connect
    else if (fromCell.startsWith('End')) entry.end = connect
    out.set(from, entry)
  }
  return out
}

interface Connect {
  to: string
  toCell: string
}

function push(ctx: Ctx, parent: string, rec: Omit<CellRecord, 'id' | 'parent'>, id = newCellId()): string {
  const previous = ctx.last.get(parent)
  ctx.cells.push({ id, parent, ...(previous ? { previous } : {}), ...rec })
  ctx.last.set(parent, id)
  return id
}

function sheetFor(ctx: Ctx, el: Element, inherited: Master | null): { sheet: Sheet; master: Master | null } {
  const masterId = el.getAttribute('Master')
  const master = masterId ? (ctx.pkg.masters.get(masterId) ?? null) : inherited
  let masterSheet: Sheet | null = null
  if (master) {
    const shapeId = el.getAttribute('MasterShape')
    const mel = shapeId ? master.shapes.get(shapeId) : masterId ? master.top : null
    if (mel && mel !== el) {
      const key = mel.getAttribute('ID') ?? ''
      masterSheet = master.sheets.get(key) ?? new Sheet(mel, ctx.pkg, null, master.part)
      master.sheets.set(key, masterSheet)
    }
  }
  return { sheet: new Sheet(el, ctx.pkg, masterSheet, ctx.part), master }
}

// Adds a shape (vertex, group or, later, edge) under `parent`; (ox, oy) is the parent's absolute origin in px.
async function addShape(ctx: Ctx, el: Element, inherited: Master | null, parent: string, box: Box, ox: number, oy: number, forceMaster?: Master): Promise<void> {
  const { sheet, master } = forceMaster ? { sheet: new Sheet(el, ctx.pkg, null, forceMaster.part), master: forceMaster } : sheetFor(ctx, el, inherited)
  const type = el.getAttribute('Type') ?? 'Shape'
  if (type === 'Guide' || sheet.value('Visible') === '0') return
  if (sheet.has('BeginX') && sheet.has('EndX') && type !== 'Group') {
    ctx.edges.push({ sheet, parent, box, ox, oy })
    return
  }
  const s = ctx.scale
  const w = sheet.num('Width') * s
  const h = sheet.num('Height') * s
  const pinX = sheet.num('PinX') * s
  const pinY = sheet.num('PinY') * s
  const locX = sheet.has('LocPinX') ? sheet.num('LocPinX') * s : w / 2
  const locY = sheet.has('LocPinY') ? sheet.num('LocPinY') * s : h / 2
  const angle = sheet.num('Angle')
  // The center after rotating about the pin (Visio) → box around it (draw.io rotates about the center).
  const vx = w / 2 - locX
  const vy = h / 2 - locY
  const cx = pinX + vx * Math.cos(angle) - vy * Math.sin(angle)
  const cy = pinY + vx * Math.sin(angle) + vy * Math.cos(angle)
  const x = (cx - w / 2) * CF
  const y = (box.height - (cy + h / 2)) * CF
  const geometry = { x: round(x), y: round(y), width: round(Math.max(w * CF, 1)), height: round(Math.max(h * CF, 1)) }

  const style = await vertexStyle(ctx, sheet, master, w, h)
  const label = textLabel(sheet, /fillColor=(#[0-9a-f]{6})/i.exec(style.style)?.[1])
  const rotation = -(angle * 180) / Math.PI
  let full = label.style + style.style
  if (Math.abs(rotation) > 0.01) full += `rotation=${round(((rotation % 360) + 360) % 360)};`
  if (sheet.value('FlipX') === '1') full += 'flipH=1;'
  if (sheet.value('FlipY') === '1') full += 'flipV=1;'
  const children = type === 'Group' ? kids(kid(el, 'Shapes'), 'Shape') : []
  if (!style.visible && !label.html && !children.length) return
  if (!style.visible) full = (children.length ? 'group;' : 'text;') + 'strokeColor=none;fillColor=none;' + label.style
  if (children.length) full += 'container=1;collapsible=0;recursiveResize=0;'
  const id = push(ctx, parent, { vertex: 1, value: label.html || undefined, style: full, geometry: JSON.stringify(geometry), ...(children.length ? { connectable: 0 as const } : {}) })
  ctx.ids.set(sheet.id, id)
  ctx.bounds.set(sheet.id, { x: ox + geometry.x, y: oy + geometry.y, w: geometry.width, h: geometry.height, rotated: Math.abs(rotation) > 0.01 })
  for (const child of children) await addShape(ctx, child, master, id, { height: h }, ox + geometry.x, oy + geometry.y)
}

// ---------- Vertex style ----------

async function vertexStyle(ctx: Ctx, sheet: Sheet, master: Master | null, w: number, h: number): Promise<{ style: string; visible: boolean }> {
  // Pictures.
  const foreign = sheet.foreign()
  if (foreign) {
    const image = await imageOf(ctx, foreign.el, foreign.part)
    if (image) return { style: `shape=image;imageAspect=0;verticalLabelPosition=bottom;verticalAlign=top;image=${image};`, visible: true }
  }
  const geo = sheet.geometry().filter((g) => g.flags.NoShow !== '1' && g.rows.size)
  if (!geo.length) return { style: '', visible: false }
  const noFill = geo.every((g) => g.flags.NoFill === '1')
  const noLine = geo.every((g) => g.flags.NoLine === '1')
  const paint = paintStyle(ctx, sheet, noFill, noLine)
  const rounding = sheet.num('Rounding') * ctx.scale
  const roundStyle = rounding > 0 ? `rounded=1;absoluteArcSize=1;arcSize=${round(rounding * CF * 2)};` : ''
  // A single closed geometry: plain rectangle or ellipse.
  const simple = geo.length === 1 ? simpleShape(geo[0], sheet, w / ctx.scale, h / ctx.scale) : null
  const name = normalizeName(sheet.el.getAttribute('NameU') ?? master?.name ?? '')
  const known = MASTER_STYLES.find(([re]) => re.test(name))
  if (simple === 'rect') return { style: `${known && known[1] ? known[1] : roundStyle}whiteSpace=wrap;html=1;${paint}`, visible: true }
  if (simple === 'ellipse') return { style: `ellipse;whiteSpace=wrap;html=1;${paint}`, visible: true }
  if (known && known[1] && !sheet.el.getAttribute('MasterShape')) return { style: `${known[1]}whiteSpace=wrap;html=1;${paint}`, visible: true }
  const xml = stencilXml(geo, w / ctx.scale, h / ctx.scale, rounding)
  if (!xml) return { style: '', visible: false }
  return { style: `shape=${encodeStencil(xml)};whiteSpace=wrap;html=1;${paint}`, visible: true }
}

const normalizeName = (name: string) => name.replace(/\.\d+$/, '').trim().toLowerCase()

function paintStyle(ctx: Ctx, sheet: Sheet, noFill: boolean, noLine: boolean): string {
  const out: string[] = []
  const pattern = themedNum(sheet, 'FillPattern', 1)
  const fg = colorOf(ctx, sheet.value('FillForegnd'), quickFill(ctx, sheet))
  if (noFill || pattern === 0) out.push('fillColor=none')
  else {
    out.push(`fillColor=${fg}`)
    const opacity = 1 - themedNum(sheet, 'FillForegndTrans', 0)
    if (opacity < 0.99) out.push(`fillOpacity=${Math.round(opacity * 100)}`)
    if (pattern >= 25 && pattern <= 40) {
      out.push(`gradientColor=${colorOf(ctx, sheet.value('FillBkgnd'), '#ffffff')}`)
      const dir = [26, 32, 33].includes(pattern) ? 'east' : [27, 35].includes(pattern) ? 'west' : pattern === 29 ? 'north' : 'south'
      if (dir !== 'south') out.push(`gradientDirection=${dir}`)
    }
  }
  const linePattern = themedNum(sheet, 'LinePattern', 1)
  if (noLine || linePattern === 0) out.push('strokeColor=none')
  else {
    out.push(`strokeColor=${colorOf(ctx, sheet.value('LineColor'), quickLine(ctx, sheet))}`)
    out.push(...lineWidthAndDash(ctx, sheet, linePattern))
  }
  if (themedNum(sheet, 'ShdwPattern', 0) > 0 && themedNum(sheet, 'ShapeShdwShow', 1) !== 0) out.push('shadow=1')
  return out.length ? `${out.join(';')};` : ''
}

function lineWidthAndDash(ctx: Ctx, sheet: Sheet, pattern: number): string[] {
  const out: string[] = []
  const width = round(themedNum(sheet, 'LineWeight', 0.01041666) * CF)
  if (Math.abs(width - 1) > 0.1) out.push(`strokeWidth=${Math.max(0.5, width)}`)
  if (pattern > 1) {
    out.push('dashed=1')
    if (pattern === 3 || pattern === 10) out.push('dashPattern=1 2')
    else if (pattern === 4 || pattern === 5) out.push('dashPattern=8 3 1 3')
  }
  const opacity = 1 - themedNum(sheet, 'LineColorTrans', 0)
  if (opacity < 0.99) out.push(`strokeOpacity=${Math.round(opacity * 100)}`)
  void ctx
  return out
}

// A number cell whose value may be "Themed" (then the default).
function themedNum(sheet: Sheet, name: string, def: number): number {
  const v = sheet.value(name)
  const n = Number(v)
  return v === null || v === '' || v === 'Themed' || !Number.isFinite(n) ? def : n
}

// Themed colors from the shape's QuickStyle cells (an approximation of Visio's
// theme matrix): color index 0-7 = dk1, lt1, accent1-6; 100+ = variant colors.
function quickColor(ctx: Ctx, sheet: Sheet, kind: 'Fill' | 'Line' | 'Font'): string {
  const th = ctx.pkg.theme
  const ix = themedNum(sheet, `QuickStyle${kind}Color`, 2)
  const list = [th.dk1, th.lt1, th.accent1, th.accent2, th.accent3, th.accent4, th.accent5, th.accent6]
  return (ix >= 100 ? th[`varColor${ix - 99}`] : list[ix]) ?? th.accent1 ?? '#5b9bd5'
}

function quickFill(ctx: Ctx, sheet: Sheet): string {
  const matrix = themedNum(sheet, 'QuickStyleFillMatrix', 3)
  const color = quickColor(ctx, sheet, 'Fill')
  return matrix <= 1 ? (ctx.pkg.theme.lt1 ?? '#ffffff') : matrix === 2 ? tint(color, 0.8) : color
}

function quickLine(ctx: Ctx, sheet: Sheet): string {
  const color = quickColor(ctx, sheet, 'Line')
  return themedNum(sheet, 'QuickStyleLineMatrix', 3) >= 3 ? darker(color) : color
}

function tint(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * amount))
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

function colorOf(ctx: Ctx, value: string | null, themed: string): string {
  if (!value || value === 'Themed') return themed
  if (value.startsWith('#')) return value.toLowerCase()
  const ix = Number(value)
  if (Number.isFinite(ix) && ctx.pkg.colors[ix]) return ctx.pkg.colors[ix].toLowerCase()
  return themed
}

function darker(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * 0.75))
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

function isDark(hex: string): boolean {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16)
  if (!Number.isFinite(n)) return false
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 128
}

// ---------- Geometry ----------

type P = [number, number]

function rowNum(row: GeoRow, name: string, def = 0): number {
  const v = Number(row.cells[name])
  return row.cells[name] === undefined || row.cells[name] === '' || !Number.isFinite(v) ? def : v
}

// "rect" or "ellipse" when a section draws exactly the shape's box.
function simpleShape(geo: GeoSection, sheet: Sheet, w: number, h: number): 'rect' | 'ellipse' | null {
  const rows = [...geo.rows.values()]
  const eps = Math.max(w, h) * 0.002 + 1e-6
  const near = (a: number, b: number) => Math.abs(a - b) <= eps
  if (rows.length === 1 && rows[0].t === 'Ellipse') {
    const r = rows[0]
    const [x, y, a, b, c, d] = ['X', 'Y', 'A', 'B', 'C', 'D'].map((k) => rowNum(r, k))
    if (near(x, w / 2) && near(y, h / 2) && ((near(Math.abs(a - x), w / 2) && near(Math.abs(d - y), h / 2)) || (near(Math.abs(c - x), w / 2) && near(Math.abs(b - y), h / 2)))) return 'ellipse'
    return null
  }
  if (geo.flags.NoFill === '1') return null
  const pts = rows.map((r) => {
    if (r.t === 'MoveTo' || r.t === 'LineTo') return [rowNum(r, 'X'), rowNum(r, 'Y')] as P
    if (r.t === 'RelMoveTo' || r.t === 'RelLineTo') return [rowNum(r, 'X') * w, rowNum(r, 'Y') * h] as P
    return null
  })
  if (pts.some((p) => !p) || (pts.length !== 5 && pts.length !== 4)) return null
  const corners = new Set<string>()
  for (const p of pts as P[]) {
    const cx = near(p[0], 0) ? 0 : near(p[0], w) ? 1 : -1
    const cy = near(p[1], 0) ? 0 : near(p[1], h) ? 1 : -1
    if (cx < 0 || cy < 0) return null
    corners.add(`${cx}${cy}`)
  }
  void sheet
  return corners.size === 4 ? 'rect' : null
}

// Stencil XML (draw.io <shape>) in the shape's own px size for the geometry sections.
function stencilXml(sections: GeoSection[], w: number, h: number, rounding: number): string {
  const W = w * CF
  const H = h * CF
  const f = (n: number) => String(round(n))
  const toPx = (p: P): P => [p[0] * CF, (h - p[1]) * CF]
  const parts: string[] = []
  // Filled sections first, then outlines (as draw.io does).
  const ordered = [...sections.filter((g) => g.flags.NoFill !== '1'), ...sections.filter((g) => g.flags.NoFill === '1')]
  let open: string | null = null
  const close = () => {
    if (open) parts.push('</path>', open === 'fs' ? '<fillstroke/>' : open === 'f' ? '<fill/>' : '<stroke/>')
    open = null
  }
  const arc = rounding > 0 ? ` rounded="1" arcSize="${f(rounding * CF * 2)}"` : ''
  for (const g of ordered) {
    const path = sectionPath(g, w, h, toPx, f)
    if (!path) continue
    const kind = g.flags.NoFill === '1' ? (g.flags.NoLine === '1' ? null : 's') : g.flags.NoLine === '1' ? 'f' : 'fs'
    if (!kind) continue
    if (kind !== open) {
      close()
      parts.push(`<path${arc}>`)
      open = kind
    }
    parts.push(path)
  }
  close()
  if (!parts.length) return ''
  return `<shape w="${f(W)}" h="${f(H)}" aspect="variable" strokewidth="inherit"><foreground>${parts.join('')}</foreground></shape>`
}

function sectionPath(g: GeoSection, w: number, h: number, toPx: (p: P) => P, f: (n: number) => string): string {
  const out: string[] = []
  let cur: P = [0, 0]
  let start: P = [0, 0]
  let started = false
  const move = (p: P) => {
    const [x, y] = toPx(p)
    out.push(`<move x="${f(x)}" y="${f(y)}"/>`)
    cur = p
    start = p
    started = true
  }
  const line = (p: P) => {
    if (!started) move(cur)
    const [x, y] = toPx(p)
    out.push(`<line x="${f(x)}" y="${f(y)}"/>`)
    cur = p
  }
  const curve = (c1: P, c2: P, p: P) => {
    if (!started) move(cur)
    const [a, b, c] = [toPx(c1), toPx(c2), toPx(p)]
    out.push(`<curve x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" x3="${f(c[0])}" y3="${f(c[1])}"/>`)
    cur = p
  }
  const closeIfBack = () => {
    if (started && Math.abs(cur[0] - start[0]) < 1e-6 && Math.abs(cur[1] - start[1]) < 1e-6) out.push('<close/>')
  }
  const rows = [...g.rows.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r)
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const X = rowNum(r, 'X')
    const Y = rowNum(r, 'Y')
    switch (r.t) {
      case 'MoveTo':
        move([X, Y])
        break
      case 'RelMoveTo':
        move([X * w, Y * h])
        break
      case 'LineTo':
        line([X, Y])
        closeIfBack()
        break
      case 'RelLineTo':
        line([X * w, Y * h])
        closeIfBack()
        break
      case 'ArcTo': {
        const end: P = [X, Y]
        const a = rowNum(r, 'A')
        const dx = end[0] - cur[0]
        const dy = end[1] - cur[1]
        const len = Math.hypot(dx, dy)
        if (!len || Math.abs(a) < 1e-9) line(end)
        else {
          const mid: P = [(cur[0] + end[0]) / 2 + (a * dy) / len, (cur[1] + end[1]) / 2 - (a * dx) / len]
          arcThrough(cur, mid, end, (p) => p, (p) => p, line, curve)
        }
        closeIfBack()
        break
      }
      case 'EllipticalArcTo':
      case 'RelEllipticalArcTo': {
        const rel = r.t === 'RelEllipticalArcTo'
        const end: P = rel ? [X * w, Y * h] : [X, Y]
        const ctrl: P = rel ? [rowNum(r, 'A') * w, rowNum(r, 'B') * h] : [rowNum(r, 'A'), rowNum(r, 'B')]
        const angle = rowNum(r, 'C')
        const ratio = rowNum(r, 'D', 1) || 1
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        const toWork = (p: P): P => [(p[0] * cos + p[1] * sin) / ratio, -p[0] * sin + p[1] * cos]
        const fromWork = (p: P): P => [p[0] * ratio * cos - p[1] * sin, p[0] * ratio * sin + p[1] * cos]
        arcThrough(cur, ctrl, end, toWork, fromWork, line, curve)
        closeIfBack()
        break
      }
      case 'Ellipse': {
        const c: P = [X, Y]
        const u: P = [rowNum(r, 'A') - X, rowNum(r, 'B') - Y]
        const v: P = [rowNum(r, 'C') - X, rowNum(r, 'D') - Y]
        const k = 0.5522847498
        const at = (a: number, b: number): P => [c[0] + a * u[0] + b * v[0], c[1] + a * u[1] + b * v[1]]
        move(at(1, 0))
        curve(at(1, k), at(k, 1), at(0, 1))
        curve(at(-k, 1), at(-1, k), at(-1, 0))
        curve(at(-1, -k), at(-k, -1), at(0, -1))
        curve(at(k, -1), at(1, -k), at(1, 0))
        out.push('<close/>')
        break
      }
      case 'RelCubBezTo':
        curve([rowNum(r, 'A') * w, rowNum(r, 'B') * h], [rowNum(r, 'C') * w, rowNum(r, 'D') * h], [X * w, Y * h])
        closeIfBack()
        break
      case 'RelQuadBezTo': {
        const q: P = [rowNum(r, 'A') * w, rowNum(r, 'B') * h]
        const end: P = [X * w, Y * h]
        curve([cur[0] + ((q[0] - cur[0]) * 2) / 3, cur[1] + ((q[1] - cur[1]) * 2) / 3], [end[0] + ((q[0] - end[0]) * 2) / 3, end[1] + ((q[1] - end[1]) * 2) / 3], end)
        closeIfBack()
        break
      }
      case 'PolylineTo': {
        const m = /POLYLINE\s*\(([^)]*)\)/i.exec(r.cells.A ?? '')
        if (m) {
          const v = m[1].split(',').map((s) => Number(s.trim()))
          const [xRel, yRel] = v
          for (let j = 2; j + 1 < v.length; j += 2) line([xRel === 0 ? v[j] * w : v[j], yRel === 0 ? v[j + 1] * h : v[j + 1]])
        }
        line([X, Y])
        closeIfBack()
        break
      }
      case 'NURBSTo':
        for (const p of nurbsPoints(r, cur, w, h)) line(p)
        closeIfBack()
        break
      case 'SplineStart':
      case 'SplineKnot':
        line([X, Y])
        closeIfBack()
        break
      default:
        break
    }
  }
  // Filled sections are closed paths.
  if (started && g.flags.NoFill !== '1' && !out.at(-1)?.startsWith('<close')) out.push('<close/>')
  return out.join('')
}

// A circular arc (in "work" space, where the ellipse is a circle) from p0 through pm to p1, as cubic curves.
function arcThrough(p0: P, pm: P, p1: P, toWork: (p: P) => P, fromWork: (p: P) => P, line: (p: P) => void, curve: (a: P, b: P, c: P) => void): void {
  const [a, m, b] = [toWork(p0), toWork(pm), toWork(p1)]
  const d = 2 * (a[0] * (m[1] - b[1]) + m[0] * (b[1] - a[1]) + b[0] * (a[1] - m[1]))
  if (Math.abs(d) < 1e-12) return line(p1)
  const sq = (p: P) => p[0] * p[0] + p[1] * p[1]
  const cx = (sq(a) * (m[1] - b[1]) + sq(m) * (b[1] - a[1]) + sq(b) * (a[1] - m[1])) / d
  const cy = (sq(a) * (b[0] - m[0]) + sq(m) * (a[0] - b[0]) + sq(b) * (m[0] - a[0])) / d
  const r = Math.hypot(a[0] - cx, a[1] - cy)
  const th0 = Math.atan2(a[1] - cy, a[0] - cx)
  const thm = Math.atan2(m[1] - cy, m[0] - cx)
  const th1 = Math.atan2(b[1] - cy, b[0] - cx)
  const TWO = 2 * Math.PI
  const ccw1 = (th1 - th0 + TWO) % TWO
  const ccwm = (thm - th0 + TWO) % TWO
  const sweep = ccwm <= ccw1 ? ccw1 : ccw1 - TWO
  if (!sweep) return line(p1)
  const n = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2)))
  const delta = sweep / n
  const k = (4 / 3) * Math.tan(delta / 4)
  for (let i = 0; i < n; i++) {
    const t0 = th0 + i * delta
    const t1 = t0 + delta
    const c1: P = [cx + r * (Math.cos(t0) - k * Math.sin(t0)), cy + r * (Math.sin(t0) + k * Math.cos(t0))]
    const c2: P = [cx + r * (Math.cos(t1) + k * Math.sin(t1)), cy + r * (Math.sin(t1) - k * Math.cos(t1))]
    const e: P = i === n - 1 ? p1 : fromWork([cx + r * Math.cos(t1), cy + r * Math.sin(t1)])
    curve(fromWork(c1), fromWork(c2), e)
  }
}

// Points along a NURBSTo row (sampled; see draw.io's nurbsSegsTo for the knot convention).
function nurbsPoints(r: GeoRow, cur: P, w: number, h: number): P[] {
  const end: P = [rowNum(r, 'X'), rowNum(r, 'Y')]
  const m = /NURBS\s*\(([^)]*)\)/i.exec(r.cells.E ?? '')
  if (!m) return [end]
  const v = m[1].split(',').map((s) => Number(s.trim()))
  if (v.length < 8) return [end]
  const [knotLast, degree, xType, yType] = v
  const ctrl: { x: number; y: number; w: number }[] = [{ x: cur[0], y: cur[1], w: rowNum(r, 'D', 1) || 1 }]
  const inner: number[] = []
  for (let j = 4; j + 3 < v.length; j += 4) {
    ctrl.push({ x: xType === 0 ? v[j] * w : v[j], y: yType === 0 ? v[j + 1] * h : v[j + 1], w: v[j + 3] || 1 })
    inner.push(v[j + 2] || 0)
  }
  ctrl.push({ x: end[0], y: end[1], w: rowNum(r, 'B', 1) || 1 })
  const n = ctrl.length - 1
  const p = Math.max(1, Math.min(Math.round(degree) || 3, n))
  let knots = [rowNum(r, 'C'), ...inner, rowNum(r, 'A')]
  for (let k = 0; k <= p; k++) knots.push(knotLast)
  let ok = knots.every((k, i) => i === 0 || k >= knots[i - 1])
  for (let k = 0; k <= n && ok; k++) ok = knots[k] < knots[k + p + 1]
  if (!ok || knots.length !== n + p + 2) {
    knots = []
    for (let k = 0; k <= p; k++) knots.push(0)
    for (let k = 1; k <= n - p; k++) knots.push(k / (n - p + 1))
    for (let k = 0; k <= p; k++) knots.push(1)
  }
  const u0 = knots[p]
  const u1 = knots[n + 1]
  if (!(u1 > u0)) return [end]
  const span = (u: number) => {
    if (u >= knots[n + 1]) return n
    let i = p
    while (i < n && knots[i + 1] <= u) i++
    return i
  }
  const at = (u: number): P => {
    const s = span(u)
    const d = Array.from({ length: p + 1 }, (_, j) => {
      const c = ctrl[s - p + j]
      return [c.x * c.w, c.y * c.w, c.w]
    })
    for (let rr = 1; rr <= p; rr++) {
      for (let j = p; j >= rr; j--) {
        const i = s - p + j
        const den = knots[i + p - rr + 1] - knots[i]
        const alpha = den ? (u - knots[i]) / den : 0
        for (let k = 0; k < 3; k++) d[j][k] = (1 - alpha) * d[j - 1][k] + alpha * d[j][k]
      }
    }
    return [d[p][0] / d[p][2], d[p][1] / d[p][2]]
  }
  const steps = Math.max(8, n * 8)
  const out: P[] = []
  for (let i = 1; i < steps; i++) out.push(at(u0 + ((u1 - u0) * i) / steps))
  out.push(end)
  return out
}

// ---------- Text ----------

interface Run {
  text: string
  row: string
}

function textLabel(sheet: Sheet, fillColor?: string): { html: string; style: string } {
  const tx = sheet.value('HideText') === '1' ? null : sheet.text()
  const paragraphs: { row: string; runs: Run[] }[] = [{ row: '0', runs: [] }]
  let charRow = '0'
  const walk = (node: Node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) {
        const parts = (child.textContent ?? '').replace(/\r\n?/g, '\n').split(/[\n\u2028\u2029]/)
        parts.forEach((part, i) => {
          if (i > 0) paragraphs.push({ row: paragraphs.at(-1)!.row, runs: [] })
          if (part) paragraphs.at(-1)!.runs.push({ text: part, row: charRow })
        })
      } else if (child.nodeType === 1) {
        const el = child as Element
        if (el.localName === 'cp') charRow = el.getAttribute('IX') ?? '0'
        else if (el.localName === 'pp') paragraphs.at(-1)!.row = el.getAttribute('IX') ?? '0'
        else if (el.localName === 'fld') walk(el)
      }
    }
  }
  if (tx) walk(tx)
  while (paragraphs.length > 1 && !paragraphs.at(-1)!.runs.length) paragraphs.pop()
  const hasText = paragraphs.some((p) => p.runs.some((r) => r.text.trim()))

  const char = (row: string) => {
    const size = Number(sheet.rowValue('Character', row, 'Size'))
    const styleBits = Number(sheet.rowValue('Character', row, 'Style')) || 0
    const font = sheet.rowValue('Character', row, 'Font')
    return {
      color: sheet.rowValue('Character', row, 'Color'),
      size: Number.isFinite(size) && size > 0 ? round(size * 72) : 12,
      bits: (styleBits & 1 ? 1 : 0) | (styleBits & 2 ? 2 : 0) | (styleBits & 4 ? 4 : 0),
      font: font && font !== 'Themed' && !/^\d+$/.test(font) ? font : null,
    }
  }
  // Themed text is dark, or light on a dark fill.
  const autoColor = (c: string | null) => {
    if (c && c !== 'Themed' && c.startsWith('#')) return c.toLowerCase()
    if (c && /^\d+$/.test(c)) return (sheet.pkg.colors[Number(c)] ?? '#000000').toLowerCase()
    return fillColor && isDark(fillColor) ? '#ffffff' : '#000000'
  }
  const base = char('0')
  const baseColor = autoColor(base.color)
  const halign = (row: string) => ['left', 'center', 'right', 'justify'][Number(sheet.rowValue('Paragraph', row, 'HorzAlign') ?? 1)] ?? 'center'
  const valign = ['top', 'middle', 'bottom'][themedNum(sheet, 'VerticalAlign', 1)] ?? 'middle'
  const baseAlign = halign(paragraphs[0].row)
  const style: string[] = [`fontColor=${baseColor}`, `fontSize=${base.size}`, `align=${baseAlign === 'justify' ? 'left' : baseAlign}`, `verticalAlign=${valign}`]
  if (base.bits) style.push(`fontStyle=${base.bits}`)
  if (base.font) style.push(`fontFamily=${base.font}`)
  const margin = (name: string) => round(themedNum(sheet, name, 0.0555) * CF)
  const m = [margin('TopMargin'), margin('RightMargin'), margin('BottomMargin'), margin('LeftMargin')]
  if (m.some((v) => Math.abs(v - 5.64) > 0.5)) style.push('spacing=0', `spacingTop=${m[0]}`, `spacingRight=${m[1]}`, `spacingBottom=${m[2]}`, `spacingLeft=${m[3]}`)
  // Text blocks placed outside the shape (e.g. labels under icons).
  const tw = sheet.num('TxtWidth', sheet.num('Width'))
  const th = sheet.num('TxtHeight', sheet.num('Height'))
  const tpy = sheet.num('TxtPinY', sheet.num('Height') / 2) - sheet.num('TxtLocPinY', th / 2)
  const H = sheet.num('Height')
  if (hasText && H > 0 && tpy + th <= 0.01) style.push('verticalLabelPosition=bottom', 'verticalAlign=top')
  else if (hasText && H > 0 && tpy >= H - 0.01) style.push('verticalLabelPosition=top', 'verticalAlign=bottom')
  void tw

  if (!hasText) return { html: '', style: `${style.join(';')};` }
  const html = paragraphs
    .map((p) => {
      const align = halign(p.row)
      const inner =
        p.runs
          .map((r) => {
            const c = char(r.row)
            const css: string[] = []
            const color = autoColor(c.color)
            if (color !== baseColor) css.push(`color:${color}`)
            if (c.size !== base.size) css.push(`font-size:${c.size}px`)
            if (c.font && c.font !== base.font) css.push(`font-family:${c.font}`)
            let h = escapeHtml(r.text)
            if (css.length) h = `<span style="${css.join(';')}">${h}</span>`
            const extra = c.bits & ~base.bits
            if (extra & 1) h = `<b>${h}</b>`
            if (extra & 2) h = `<i>${h}</i>`
            if (extra & 4) h = `<u>${h}</u>`
            return h
          })
          .join('') || '<br>'
      return align !== baseAlign ? `<div style="text-align:${align}">${inner}</div>` : inner
    })
    .join('<br>')
  return { html: html.replace(/(<br>)+$/, ''), style: `${style.join(';')};` }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!).replace(/\t/g, '&emsp;')
}

// ---------- Pictures ----------

async function imageOf(ctx: Ctx, foreign: Element, part: Part | null): Promise<string | null> {
  const path = (part ?? ctx.part).rels.get(relId(kid(foreign, 'Rel')) ?? '')
  if (!path) return null
  if (ctx.pkg.media.has(path)) return ctx.pkg.media.get(path)!
  const file = ctx.pkg.zip.file(path)
  const ext = path.split('.').pop()!.toLowerCase()
  const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', bmp: 'image/bmp', webp: 'image/webp' }[ext]
  // draw.io keeps data URIs without ";base64" (";" separates style entries).
  const data = file && mime ? `data:${mime},${await file.async('base64')}` : null
  ctx.pkg.media.set(path, data)
  return data
}

// ---------- Connectors ----------

function addEdges(ctx: Ctx, connects: Map<string, { begin?: Connect; end?: Connect }>): void {
  for (const { sheet, parent, box, ox, oy } of ctx.edges) {
    const s = ctx.scale
    const toParent = (x: number, y: number): P => [round(x * s * CF), round((box.height - y * s) * CF)]
    // Local geometry point → parent coordinates (rotation about the pin).
    const angle = sheet.num('Angle')
    const pin: P = [sheet.num('PinX'), sheet.num('PinY')]
    const loc: P = [sheet.num('LocPinX', sheet.num('Width') / 2), sheet.num('LocPinY', sheet.num('Height') / 2)]
    const local = (x: number, y: number): P => {
      const dx = x - loc[0]
      const dy = y - loc[1]
      return toParent(pin[0] + dx * Math.cos(angle) - dy * Math.sin(angle), pin[1] + dx * Math.sin(angle) + dy * Math.cos(angle))
    }
    const begin = toParent(sheet.num('BeginX'), sheet.num('BeginY'))
    const end = toParent(sheet.num('EndX'), sheet.num('EndY'))
    // Waypoints: the vertices of the connector's path between its ends.
    const geo = sheet.geometry().filter((g) => g.flags.NoShow !== '1')
    const w = sheet.num('Width')
    const h = sheet.num('Height')
    const pts: P[] = []
    let curved = false
    for (const g of geo.slice(0, 1)) {
      for (const r of [...g.rows.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r)) {
        if (/NURBS|Arc|Spline|Bez/.test(r.t)) curved = true
        const rel = r.t.startsWith('Rel')
        if (!('X' in r.cells)) continue
        pts.push(local(rowNum(r, 'X') * (rel ? w : 1), rowNum(r, 'Y') * (rel ? h : 1)))
      }
    }
    const inner = pts.slice(1, -1).filter((p, i, all) => i === 0 || p[0] !== all[i - 1][0] || p[1] !== all[i - 1][1])
    const c = connects.get(sheet.id) ?? {}
    const source = c.begin ? ctx.ids.get(c.begin.to) : undefined
    const target = c.end ? ctx.ids.get(c.end.to) : undefined
    const style: string[] = ['html=1', 'rounded=0', curved ? 'curved=1' : 'edgeStyle=none']
    const linePattern = themedNum(sheet, 'LinePattern', 1)
    style.push(`strokeColor=${linePattern === 0 ? 'none' : colorOf(ctx, sheet.value('LineColor'), quickLine(ctx, sheet))}`)
    style.push(...lineWidthAndDash(ctx, sheet, linePattern))
    const arrow = (id: number, key: 'startArrow' | 'endArrow', sizeCell: string) => {
      const name = ARROWS[id]
      if (!name) return style.push(`${key}=none`)
      style.push(`${key}=${name.replace('!', '')}`)
      if (name.startsWith('!')) style.push(`${key === 'startArrow' ? 'startFill' : 'endFill'}=0`)
      const size = themedNum(sheet, sizeCell, 2)
      style.push(`${key === 'startArrow' ? 'startSize' : 'endSize'}=${[4, 5, 6, 8, 10, 14, 20][size] ?? 6}`)
    }
    arrow(themedNum(sheet, 'BeginArrow', 0), 'startArrow', 'BeginArrowSize')
    arrow(themedNum(sheet, 'EndArrow', 0), 'endArrow', 'EndArrowSize')
    // Exact attachment points on unrotated terminals.
    const attach = (id: string | undefined, p: P, prefix: 'exit' | 'entry') => {
      const b = id ? ctx.bounds.get(id) : undefined
      if (!b || b.rotated || !b.w || !b.h) return
      const fx = (ox + p[0] - b.x) / b.w
      const fy = (oy + p[1] - b.y) / b.h
      if (fx < -0.01 || fx > 1.01 || fy < -0.01 || fy > 1.01) return
      style.push(`${prefix}X=${round(Math.min(1, Math.max(0, fx)))}`, `${prefix}Y=${round(Math.min(1, Math.max(0, fy)))}`, `${prefix}Dx=0`, `${prefix}Dy=0`)
    }
    const srcVisio = c.begin?.to
    const tgtVisio = c.end?.to
    if (source) attach(srcVisio, begin, 'exit')
    if (target) attach(tgtVisio, end, 'entry')
    const label = textLabel(sheet)
    const labelStyle = label.html ? label.style.replace(/fillColor=[^;]*;?/, '') + 'labelBackgroundColor=#ffffff;' : ''
    const geometry = { x: 0, y: 0, width: 0, height: 0, relative: 1 as const, ...(inner.length ? { points: inner } : {}), sourcePoint: begin, targetPoint: end }
    const id = push(ctx, parent, {
      edge: 1,
      value: label.html || undefined,
      style: `${style.join(';')};${labelStyle}`,
      geometry: JSON.stringify(geometry),
      ...(source ? { source } : {}),
      ...(target ? { target } : {}),
    })
    ctx.ids.set(sheet.id, id)
  }
}
