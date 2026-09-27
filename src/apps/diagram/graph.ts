// maxGraph set up to behave and look like draw.io: its stylesheet, draw.io
// style strings on cells, HTML labels, connection points, guides and handles.
// Also converts between maxGraph cells and the plain CellRecord model.

import {
  Cell,
  CellEditorHandler,
  CellState,
  ConnectionConstraint,
  ConnectionHandler,
  EdgeHandlerConfig,
  Geometry,
  Graph,
  HandleConfig,
  InternalEvent,
  PanningHandler,
  Point,
  Rectangle,
  RubberBandHandler,
  StyleDefaultsConfig,
  TextShape,
  SelectionCellsHandler,
  SelectionHandler,
  VertexHandlerConfig,
  type CellStateStyle,
  type CellStyle,
  type InternalMouseEvent,
} from '@maxgraph/core'
import { configureDrawioStylesheet } from './shapes'
import { installSketch } from './shapes/sketch'
import { installHandles } from './handles'
import { attachSpellcheck } from '../../ui/spell/inline'
import { newCellId, parseGeometry, type CellRecord, type GeometryRecord } from './model'

// Generated draw.io shape libraries (scripts/build-diagram-libs.mjs, see libraries.ts).
export const LIBS_BASE = `${import.meta.env.BASE_URL}diagram-libs/`
// draw.io's library images, referenced by files as img/lib/…, are served from there.
const LIB_IMAGE = /^img\/(lib|clipart)\//

export const DEFAULT_EDGE_STYLE = 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;'
const SELECTION_COLOR = '#29b6f2'

// ---------- Style strings ----------

// draw.io style string → maxGraph style object (as maxGraph's own mxGraph codec does).
// Keys whose values stay strings even when they look numeric.
const STRING_KEYS = new Set(['dashPattern', 'image', 'fontFamily', 'points', 'link', 'tooltip', 'label'])

export function styleFromString(input: string | undefined): CellStyle {
  const style: Record<string, unknown> = {}
  if (!input) return style as CellStyle
  if (input.startsWith(';')) style.ignoreDefaultStyle = true
  for (const part of input.split(';')) {
    if (!part) continue
    const eq = part.indexOf('=')
    if (eq < 0) {
      ;((style.baseStyleNames ??= []) as string[]).push(part)
      continue
    }
    const key = part.slice(0, eq)
    const value = part.slice(eq + 1)
    style[key === 'autosize' ? 'autoSize' : key] = !STRING_KEYS.has(key) && /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value
  }
  return style as CellStyle
}

export function styleToString(style: CellStyle | null | undefined): string {
  if (!style) return ''
  const s = style as Record<string, unknown>
  const parts: string[] = [...((s.baseStyleNames as string[] | undefined) ?? [])]
  for (const [key, value] of Object.entries(s)) {
    if (key === 'baseStyleNames' || key === 'ignoreDefaultStyle' || value === undefined || value === null) continue
    const v = typeof value === 'boolean' ? (value ? 1 : 0) : value
    parts.push(`${key === 'autoSize' ? 'autosize' : key}=${v}`)
  }
  const out = parts.length ? `${parts.join(';')};` : ''
  return s.ignoreDefaultStyle ? `;${out}` : out
}

// ---------- draw.io look ----------

// draw.io writes theme-dependent colors ("default", "light-dark(a,b)"); resolve them for a light page.
const DEFAULT_COLORS: Record<string, string> = {
  fillColor: '#ffffff', strokeColor: '#000000', fontColor: '#000000', labelBackgroundColor: '#ffffff',
  labelBorderColor: '#000000', swimlaneFillColor: '#ffffff', gradientColor: '#ffffff', imageBackground: '#ffffff', imageBorder: '#000000',
}
function resolveColors(graph: Graph, cell: Cell, style: CellStateStyle): CellStateStyle {
  const s = style as Record<string, unknown>
  for (const [key, value] of Object.entries(s)) {
    if (typeof value !== 'string') continue
    if (value === 'inherit') {
      // The parent's value (e.g. UML fields take their class's line color).
      const parent = cell.getParent()
      const inherited = parent?.getParent() ? (graph.getCellStyle(parent) as Record<string, unknown>)[key] : undefined
      if (inherited === undefined) delete s[key]
      else s[key] = inherited
    } else if (value === 'default' && key in DEFAULT_COLORS) s[key] = DEFAULT_COLORS[key]
    else if (value.startsWith('light-dark(')) s[key] = value.slice(11, value.indexOf(',')).trim()
  }
  // draw.io stores data URIs without ";base64" (";" separates style entries).
  const image = s.image
  if (typeof image === 'string' && image.startsWith('data:') && !image.includes(';base64,')) {
    const comma = image.indexOf(',')
    if (comma > 0) s.image = `${image.slice(0, comma)};base64,${image.slice(comma + 1)}`
  } else if (typeof image === 'string' && LIB_IMAGE.test(image)) s.image = LIBS_BASE + image
  // Gradients only apply to filled shapes.
  if (!s.fillColor || s.fillColor === 'none') delete s.gradientColor
  return style
}

// draw.io placeholders: with placeholders=1, %name% in a label shows the
// attribute "name" of the cell's (or an ancestor's) user object data.
function placeholderLabels(graph: Graph): void {
  const renderer = graph.cellRenderer
  const getLabelValue = renderer.getLabelValue.bind(renderer)
  const dataOf = (cell: Cell | null): Record<string, string> => {
    try {
      return JSON.parse((cell as DataCell | null)?.woData ?? '{}') as Record<string, string>
    } catch {
      return {}
    }
  }
  renderer.getLabelValue = (state: CellState) => {
    const value = getLabelValue(state)
    if (!value || !value.includes('%')) return value
    const own = dataOf(state.cell)
    if (String(own.placeholders ?? (state.style as Record<string, unknown>).placeholders ?? '') !== '1') return value
    return value.replace(/%([\w.-]+)%/g, (match, name: string) => {
      for (let cell: Cell | null = state.cell; cell; cell = cell.getParent()) {
        const data = dataOf(cell)
        if (name in data && name !== 'placeholders') return data[name]
      }
      return match
    })
  }
}

// Rendering like draw.io: its stylesheet, HTML labels only with html=1, theme colors.
export function applyLook(graph: Graph): void {
  configureDrawioStylesheet(graph.getStylesheet())
  // Hand-drawn shapes (sketch=1), like draw.io.
  installSketch()
  StyleDefaultsConfig.shadowOpacity = 0.25
  graph.setHtmlLabels(true)
  graph.isHtmlLabel = (cell: Cell) => String((cell.getStyle() as Record<string, unknown>)?.html ?? '') === '1'
  labelAndTerminalTweaks(graph)
  placeholderLabels(graph)
  const getCellStyle = graph.getCellStyle.bind(graph)
  graph.getCellStyle = (cell: Cell) => resolveColors(graph, cell, getCellStyle(cell))
  // draw.io's label spacing (maxGraph uses 0).
  graph.cellRenderer.defaultTextShape = DrawioTextShape

  // draw.io also routes edges that have no source terminal (e.g. new connectors).
  const view = graph.view
  const updatePoints = view.updatePoints.bind(view)
  view.updatePoints = (edge, points, source, target) => {
    const edgeStyle = source ? null : view.getEdgeStyle(edge, points, source, target)
    if (!edgeStyle || !edge.absolutePoints.length) return updatePoints(edge, points, source, target)
    const pts = [edge.absolutePoints[0]] as Point[]
    edgeStyle(edge, null as unknown as CellState, target ? view.getTerminalPort(edge, target, false) : null, points, pts)
    pts.push(edge.absolutePoints[edge.absolutePoints.length - 1]!)
    edge.absolutePoints = pts
  }
}

// Like draw.io: whiteSpace=wrap also wraps labels without html=1 (rendered as
// escaped HTML), and edges end at the center of centerPerimeter terminals (waypoints).
function labelAndTerminalTweaks(graph: Graph): void {
  const isHtml = graph.isHtmlLabel
  const wraps = (cell: Cell) => (cell.getStyle() as Record<string, unknown> | null)?.whiteSpace === 'wrap'
  graph.isHtmlLabel = (cell: Cell) => isHtml(cell) || wraps(cell)
  const renderer = graph.cellRenderer
  const getLabelValue = renderer.getLabelValue.bind(renderer)
  renderer.getLabelValue = (state: CellState) => {
    const value = getLabelValue(state)
    if (value == null || isHtml(state.cell) || !wraps(state.cell)) return value
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }
  const view = graph.view
  const getFixedTerminalPoint = view.getFixedTerminalPoint.bind(view)
  view.getFixedTerminalPoint = (edge, terminal, source, constraint) =>
    terminal?.style.perimeter === 'centerPerimeter' ? new Point(terminal.getCenterX(), terminal.getCenterY()) : getFixedTerminalPoint(edge, terminal, source, constraint)
}

class DrawioTextShape extends TextShape {
  constructor(...args: ConstructorParameters<typeof TextShape>) {
    super(...args)
    this.baseSpacingTop = 5
    this.baseSpacingBottom = 1
  }
}

// ---------- Connection points ----------

// draw.io's default connection points for shapes that do not declare their own.
const RECT_POINTS: [number, number][] = [
  [0, 0], [0.25, 0], [0.5, 0], [0.75, 0], [1, 0],
  [0, 0.25], [1, 0.25], [0, 0.5], [1, 0.5], [0, 0.75], [1, 0.75],
  [0, 1], [0.25, 1], [0.5, 1], [0.75, 1], [1, 1],
]
const DEFAULT_CONSTRAINTS = RECT_POINTS.map(([x, y]) => new ConnectionConstraint(new Point(x, y), true))

// ---------- Graph ----------

export interface EditorGraph extends Graph {
  pageId?: string
}

export function createGraph(container: HTMLElement): EditorGraph {
  VertexHandlerConfig.rotationEnabled = true
  VertexHandlerConfig.selectionColor = SELECTION_COLOR
  EdgeHandlerConfig.selectionColor = SELECTION_COLOR
  EdgeHandlerConfig.virtualBendsEnabled = true
  HandleConfig.fillColor = SELECTION_COLOR
  HandleConfig.strokeColor = SELECTION_COLOR
  // Yellow handles for shape parameters (size, arcSize, callout tail…), like draw.io.
  installHandles()

  const graph = new Graph(container, undefined, [
    CellEditorHandler,
    SelectionCellsHandler,
    ConnectionHandler,
    SelectionHandler,
    PanningHandler,
    RubberBandHandler,
  ]) as EditorGraph
  applyLook(graph)

  const model = graph.getDataModel()
  // Random ids: several people add cells at the same time.
  model.createId = () => newCellId()

  graph.setConnectable(true)
  graph.setAllowDanglingEdges(true)
  graph.setDisconnectOnMove(false)
  graph.setDropEnabled(true)
  graph.setSplitEnabled(false)
  graph.setTooltips(false)
  graph.setPanning(true)
  graph.setGridEnabled(true)
  graph.gridSize = 10
  graph.useScrollbarsForPanning = false
  graph.setCellsEditable(true)
  graph.options.foldingEnabled = true

  // Containers: swimlanes and anything with container=1 accept dropped children.
  graph.isValidDropTarget = (cell: Cell | null) => {
    if (!cell || !cell.isVertex()) return false
    const style = graph.getCellStyle(cell) as Record<string, unknown>
    return graph.isSwimlane(cell) || String(style.container ?? '') === '1'
  }
  graph.isCellFoldable = (cell: Cell) => {
    const style = graph.getCellStyle(cell) as Record<string, unknown>
    return (cell.getChildCount() > 0 || graph.isSwimlane(cell)) && String(style.collapsible ?? '1') !== '0'
  }

  graph.getAllConnectionConstraints = (terminal: CellState | null) => {
    if (!terminal?.cell || !terminal.cell.isVertex()) return null
    const style = terminal.style as Record<string, unknown>
    if (String(style.points ?? '') === '[]') return null
    const shape = terminal.shape as unknown as {
      stencil?: { constraints?: ConnectionConstraint[] }
      constraints?: ConnectionConstraint[]
      getConstraints?: (style: CellStateStyle, w: number, h: number) => ConnectionConstraint[] | null
    } | null
    // draw.io shapes may compute their points from the style and size.
    const s = graph.view.scale
    const computed = shape?.getConstraints?.(terminal.style, terminal.width / s, terminal.height / s)
    return computed ?? shape?.stencil?.constraints ?? shape?.constraints ?? DEFAULT_CONSTRAINTS
  }

  // Guides while moving, like draw.io.
  const selection = graph.getPlugin<SelectionHandler>('SelectionHandler')!
  selection.guidesEnabled = true

  const connection = graph.getPlugin<ConnectionHandler>('ConnectionHandler')!
  // Connections start from the connection points (or the outline), not from the middle of shapes.
  connection.isStartEvent = (me: InternalMouseEvent) =>
    connection.constraintHandler.currentFocus !== null && connection.constraintHandler.currentConstraint !== null
  connection.factoryMethod = (_source, _target, style) => {
    const edge = new Cell('', new Geometry(), style && Object.keys(style).length ? style : styleFromString(DEFAULT_EDGE_STYLE))
    edge.setEdge(true)
    edge.getGeometry()!.relative = true
    return edge
  }
  connection.createEdgeState = () => {
    const edge = connection.createEdge(null, null, null)
    return new CellState(graph.view, edge, graph.getCellStyle(edge))
  }

  // Space + drag or the middle button pans; the right button opens the context menu.
  const panning = graph.getPlugin<PanningHandler>('PanningHandler')!
  panning.usePopupTrigger = false
  panning.isPanningTrigger = (me: InternalMouseEvent) => {
    const evt = me.getEvent()
    return spaceDown || evt.button === 1
  }
  let spaceDown = false
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !isTyping(e.target)) {
      spaceDown = true
      container.style.cursor = 'grab'
    }
  })
  document.addEventListener('keyup', (e) => {
    if (e.code !== 'Space') return
    spaceDown = false
    container.style.cursor = ''
  })

  richTextEditing(graph)
  InternalEvent.disableContextMenu(container)
  // Keep text being typed in a label when the page is hidden or closed.
  const commitEditing = () => graph.isEditing() && graph.stopEditing(false)
  window.addEventListener('pagehide', commitEditing)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && commitEditing())
  return graph
}

// maxGraph edits every label as plain text; labels with html=1 are edited as
// HTML instead (bold, lists, colors… typed or applied with execCommand), like draw.io.
function richTextEditing(graph: Graph): void {
  const editor = graph.getPlugin<CellEditorHandler>('CellEditorHandler')
  if (!editor) return
  // Esc ends editing and keeps the typed text, like draw.io and PowerPoint.
  editor.escapeCancelsEditing = false
  // The browser's spell checker (when ours is off), in the document language
  // (the container's lang attribute, see spell.ts) while a label is edited.
  const init = editor.init.bind(editor)
  editor.init = () => {
    init()
    editor.textarea?.setAttribute('spellcheck', 'true')
    editor.textarea?.setAttribute('lang', graph.container?.closest('[lang]')?.getAttribute('lang') ?? document.documentElement.lang)
  }
  // Our spelling and grammar checker (language: the container's lang attribute). The
  // editor reuses one element that leaves the page after each edit, which
  // detaches the checker, so it is attached again every time editing starts.
  const startEditing = editor.startEditing.bind(editor)
  let detachSpellcheck: (() => void) | null = null
  editor.startEditing = (cell, trigger) => {
    startEditing(cell, trigger)
    detachSpellcheck?.()
    detachSpellcheck = editor.textarea?.isConnected ? attachSpellcheck(editor.textarea, () => graph.container?.closest('[lang]')?.getAttribute('lang')) : null
  }
  const isRich = (cell: Cell) => String((cell.getStyle() as Record<string, unknown> | null)?.html ?? '') === '1'
  const getInitialValue = editor.getInitialValue.bind(editor)
  editor.getInitialValue = (state, trigger) => (isRich(state.cell) ? sanitizeHtml(String(graph.getEditingValue(state.cell, trigger) ?? '')) : getInitialValue(state, trigger))
  const getCurrentValue = editor.getCurrentValue.bind(editor)
  editor.getCurrentValue = (state) => {
    if (!isRich(state.cell) || !editor.textarea) return getCurrentValue(state)
    return sanitizeHtml(editor.textarea.innerHTML).replace(/(<br\s*\/?>|<div><br\s*\/?><\/div>)+$/i, '')
  }
}

// Removes scripts, event handlers and script URLs from label HTML.
export function sanitizeHtml(html: string): string {
  if (!/<|&/.test(html)) return html
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  doc.body.querySelectorAll('script, style, iframe, object, embed, link, meta').forEach((n) => n.remove())
  for (const node of doc.body.querySelectorAll('*')) {
    for (const attr of [...node.attributes]) {
      if (/^on/i.test(attr.name) || /^\s*javascript:/i.test(attr.value)) node.removeAttribute(attr.name)
    }
  }
  return doc.body.innerHTML
}

export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
}

// ---------- Cells ↔ records ----------

export type DataCell = Cell & { woData?: string }

const round = (n: number) => Math.round(n * 100) / 100

export function geometryToJson(geo: Geometry | null): string | undefined {
  if (!geo) return undefined
  const g: GeometryRecord = { x: round(geo.x), y: round(geo.y), width: round(geo.width), height: round(geo.height) }
  if (geo.relative) g.relative = 1
  if (geo.points?.length) g.points = geo.points.map((p) => [round(p.x), round(p.y)])
  if (geo.sourcePoint) g.sourcePoint = [round(geo.sourcePoint.x), round(geo.sourcePoint.y)]
  if (geo.targetPoint) g.targetPoint = [round(geo.targetPoint.x), round(geo.targetPoint.y)]
  if (geo.offset && (geo.offset.x || geo.offset.y)) g.offset = [round(geo.offset.x), round(geo.offset.y)]
  const b = geo.alternateBounds
  if (b) g.alternateBounds = [round(b.x), round(b.y), round(b.width), round(b.height)]
  return JSON.stringify(g)
}

export function geometryFromJson(json: string | undefined): Geometry | null {
  const g = parseGeometry(json)
  if (!g) return null
  const geo = new Geometry(g.x ?? 0, g.y ?? 0, g.width ?? 0, g.height ?? 0)
  geo.relative = !!g.relative
  if (g.points) geo.points = g.points.map(([x, y]) => new Point(x, y))
  if (g.sourcePoint) geo.sourcePoint = new Point(...g.sourcePoint)
  if (g.targetPoint) geo.targetPoint = new Point(...g.targetPoint)
  if (g.offset) geo.offset = new Point(...g.offset)
  if (g.alternateBounds) geo.alternateBounds = new Rectangle(...g.alternateBounds)
  return geo
}

export function labelOf(cell: Cell): string {
  const v = cell.getValue()
  return v === null || v === undefined ? '' : String(v)
}

// Plain record of a cell as it is in the graph now.
export function cellToRecord(cell: DataCell): CellRecord {
  const rec: CellRecord = { id: cell.getId()! }
  const parent = cell.getParent()
  if (parent) {
    rec.parent = parent.getId()!
    const index = parent.getIndex(cell)
    if (index > 0) rec.previous = parent.getChildAt(index - 1).getId()!
  }
  if (cell.isVertex()) rec.vertex = 1
  if (cell.isEdge()) rec.edge = 1
  const value = labelOf(cell)
  if (value) rec.value = value
  const style = styleToString(cell.getStyle())
  if (style) rec.style = style
  const geometry = geometryToJson(cell.getGeometry())
  if (geometry) rec.geometry = geometry
  const source = cell.getTerminal(true)?.getId()
  const target = cell.getTerminal(false)?.getId()
  if (source) rec.source = source
  if (target) rec.target = target
  if (cell.isVertex() && !cell.isConnectable()) rec.connectable = 0
  if (cell.isCollapsed()) rec.collapsed = 1
  if (!cell.isVisible()) rec.visible = 0
  if (cell.woData) rec.data = cell.woData
  return rec
}

// A new detached cell for a record (without parent or terminals).
export function recordToCell(rec: CellRecord): DataCell {
  const cell: DataCell = new Cell(rec.value ?? '', geometryFromJson(rec.geometry), styleFromString(rec.style))
  cell.setId(rec.id)
  cell.setVertex(rec.vertex === 1)
  cell.setEdge(rec.edge === 1)
  cell.setConnectable(rec.connectable !== 0)
  cell.setCollapsed(rec.collapsed === 1)
  cell.setVisible(rec.visible !== 0)
  if (rec.data) cell.woData = rec.data
  return cell
}

// Detached cell trees from records (e.g. clipboard); returns the top-level cells in order.
export function buildCells(records: CellRecord[]): Cell[] {
  const cells = new Map<string, DataCell>()
  for (const rec of records) cells.set(rec.id, recordToCell(rec))
  const top: Cell[] = []
  for (const rec of records) {
    const cell = cells.get(rec.id)!
    const parent = rec.parent ? cells.get(rec.parent) : undefined
    if (parent) parent.insert(cell)
    else top.push(cell)
  }
  for (const rec of records) {
    const cell = cells.get(rec.id)!
    const source = rec.source ? cells.get(rec.source) : undefined
    const target = rec.target ? cells.get(rec.target) : undefined
    if (source) source.insertEdge(cell, true)
    if (target) target.insertEdge(cell, false)
  }
  return top
}

// Records of cells and their descendants; parents outside the set are dropped.
export function cellsToRecords(roots: Cell[]): CellRecord[] {
  const out: CellRecord[] = []
  const ids = new Set<string>()
  const visit = (cell: Cell) => {
    ids.add(cell.getId()!)
    out.push(cellToRecord(cell))
    for (let i = 0; i < cell.getChildCount(); i++) visit(cell.getChildAt(i))
  }
  roots.forEach(visit)
  for (const rec of out) {
    if (rec.parent && !ids.has(rec.parent)) {
      delete rec.parent
      delete rec.previous
    }
    if (rec.source && !ids.has(rec.source)) delete rec.source
    if (rec.target && !ids.has(rec.target)) delete rec.target
  }
  return out
}

// Sets (or removes, with null) one style key on cells, as one undoable change.
export function setStyleKey(graph: Graph, cells: Cell[], key: string, value: string | number | null): void {
  const model = graph.getDataModel()
  model.beginUpdate()
  try {
    for (const cell of cells) {
      const style = cell.getClonedStyle() as Record<string, unknown>
      if (value === null) delete style[key]
      else style[key] = value
      model.setStyle(cell, style as CellStyle)
    }
  } finally {
    model.endUpdate()
  }
}
