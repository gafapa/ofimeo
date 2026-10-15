// WebMCP tools of the diagram editor (see src/core/webmcp). Loaded only while
// the switch is on. Changes go through the maxGraph model in one batch, so
// each one is a single step of the editor's undo history, and the core records
// them as the AI assistant's in the version history. Diagrams have no comments.
//
// Wired in src/apps/diagram/app.ts (after mountFrame):
//   provideWebMcpTools(session, () => import('./webmcp').then((m) => m.diagramTools(session, editor)))

import { Cell, Geometry } from '@maxgraph/core'
import { t } from '../../core/i18n'
import type { Session } from '../../core/session'
import type * as Y from 'yjs'
import { htmlToText, imageResult, num, optNum, optStr, str, textToHtml, type AppTools, type OfimeoTool, type TextPart, type ToolArgs } from '../../core/webmcp/types'
import { serializeDrawio } from './formats/drawio'
import { styleFromString, type EditorGraph } from './graph'
import { parseGeometry, parseStyle, type CellRecord } from './model'
import { DiagramSync } from './sync'

// What the tools need from the editor (createDiagramEditor's result has it).
export interface GraphEditor {
  graph: EditorGraph
  sync: DiagramSync
  readOnly: boolean
  inBatch: <T>(fn: () => T) => T
  undo: () => void
  redo: () => void
}

export const SHAPES: Record<string, string> = {
  rectangle: 'rounded=0;whiteSpace=wrap;html=1;',
  rounded: 'rounded=1;whiteSpace=wrap;html=1;',
  ellipse: 'ellipse;whiteSpace=wrap;html=1;',
  circle: 'ellipse;whiteSpace=wrap;html=1;aspect=fixed;',
  rhombus: 'rhombus;whiteSpace=wrap;html=1;',
  triangle: 'triangle;whiteSpace=wrap;html=1;',
  hexagon: 'shape=hexagon;perimeter=hexagonPerimeter2;whiteSpace=wrap;html=1;fixedSize=1;',
  parallelogram: 'shape=parallelogram;perimeter=parallelogramPerimeter;whiteSpace=wrap;html=1;fixedSize=1;',
  cylinder: 'shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;',
  document: 'shape=document;whiteSpace=wrap;html=1;boundedLbl=1;',
  cloud: 'ellipse;shape=cloud;whiteSpace=wrap;html=1;',
  actor: 'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;',
  text: 'text;html=1;align=center;verticalAlign=middle;whiteSpace=wrap;',
}

const EDGE_STYLES: Record<string, string> = {
  orthogonal: 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;',
  straight: 'html=1;',
  curved: 'edgeStyle=orthogonalEdgeStyle;curved=1;html=1;',
}

// ---------- Shared with the slides tools ----------

export const pageArg = { page: { type: 'integer', minimum: 1, description: 'Page number (1 = first; default: the page shown).' } }

// Shows a page. Inside apply_batch the model update is open (groupGraph):
// it is closed first so the changes are saved to the page they belong to,
// and opened again for the next ones.
export function showPageSafely(editor: GraphEditor, id: string): void {
  if (id === editor.sync.page) return
  const model = editor.graph.getDataModel()
  const level = model.updateLevel
  for (let i = 0; i < level; i++) model.endUpdate()
  editor.sync.showPage(id)
  for (let i = 0; i < level; i++) model.beginUpdate()
}

// apply_batch: the changes to a page are one step of its undo history.
export async function groupGraph<T>(editor: GraphEditor, fn: () => Promise<T>): Promise<T> {
  const model = editor.graph.getDataModel()
  model.beginUpdate()
  try {
    return await fn()
  } finally {
    model.endUpdate()
  }
}

// Page `n` (1-based) of the diagram or presentation.
export function pageAt(editor: GraphEditor, args: ToolArgs, key = 'page') {
  const list = editor.sync.pageList()
  const n = optNum(args, key)
  const index = n === undefined ? list.findIndex((p) => p.id === editor.sync.page) : Math.round(n) - 1
  const page = list[index]
  if (!page) throw new Error(`There is no ${key} ${n} (there are ${list.length})`)
  return { page, n: index + 1 }
}

// Shows page `n` (1-based) when given; returns its id.
export function goToPage(editor: GraphEditor, args: ToolArgs, key = 'page'): string {
  if (optNum(args, key) === undefined) return editor.sync.page
  const { page } = pageAt(editor, args, key)
  showPageSafely(editor, page.id)
  return page.id
}

// Moves page `id` so that it becomes number `to` (1-based).
export function movePageTo(editor: GraphEditor, id: string, to: number): number {
  const others = editor.sync.pageList().filter((p) => p.id !== id)
  const index = Math.max(0, Math.min(others.length, Math.round(to) - 1))
  editor.sync.movePage(id, others[index]?.id ?? null)
  return editor.sync.pageList().findIndex((p) => p.id === id) + 1
}

const idList = (args: ToolArgs, key = 'ids'): string[] => {
  const v = args[key]
  const list = Array.isArray(v) ? v.map(String) : typeof v === 'string' ? [v] : []
  if (!list.length) throw new Error(`Give "${key}": the ids of the objects`)
  return list
}

// Deletes objects of the page shown (connectors attached to deleted shapes too).
export function deleteCells(editor: GraphEditor, ids: string[]): number {
  const cells = ids.map((id) => cellById(editor, id))
  let removed = 0
  editor.inBatch(() => (removed = editor.graph.removeCells(cells, true).length))
  return removed
}

// Moves and/or resizes an object of the page shown.
export function setBounds(editor: GraphEditor, id: string, bounds: { x?: number; y?: number; width?: number; height?: number }) {
  const cell = cellById(editor, id)
  const geo = cell.getGeometry()
  if (!geo || cell.isEdge()) throw new Error('Connectors cannot be moved or resized this way')
  const next = geo.clone()
  if (bounds.x !== undefined) next.x = bounds.x
  if (bounds.y !== undefined) next.y = bounds.y
  if (bounds.width !== undefined) next.width = Math.max(1, bounds.width)
  if (bounds.height !== undefined) next.height = Math.max(1, bounds.height)
  editor.inBatch(() => editor.graph.getDataModel().setGeometry(cell, next))
  return { id, x: Math.round(next.x), y: Math.round(next.y), width: Math.round(next.width), height: Math.round(next.height) }
}

// Tools shared by diagrams and presentations to move, resize and delete objects.
export function objectTools(editor: GraphEditor, editable: () => void, pageKey: 'page' | 'slide'): OfimeoTool[] {
  const where = { [pageKey]: { type: 'integer', minimum: 1, description: `${pageKey === 'page' ? 'Page' : 'Slide'} number (default: the one shown).` } }
  return [
    {
      name: 'delete_objects',
      description: `Deletes shapes or connectors (ids from ${pageKey === 'page' ? 'get_diagram' : 'get_slide'}) of a ${pageKey}; connectors attached to deleted shapes go too. The user confirms it.`,
      inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } }, ...where }, required: ['ids'] },
      access: 'edit',
      changesDocument: true,
      destructive: true,
      summary: (args) => t('Delete {n} objects', { n: Array.isArray(args.ids) ? args.ids.length : 1 }),
      execute: (args) => {
        editable()
        goToPage(editor, args, pageKey)
        return { deleted: deleteCells(editor, idList(args)) }
      },
    },
    {
      name: 'move_object',
      description: 'Moves and/or resizes a shape: new x, y (top left corner) and/or width, height. One undo step.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' }, ...where },
        required: ['id'],
      },
      access: 'edit',
      changesDocument: true,
      summary: () => t('Move or resize an object'),
      execute: (args) => {
        editable()
        goToPage(editor, args, pageKey)
        return setBounds(editor, str(args, 'id'), { x: optNum(args, 'x'), y: optNum(args, 'y'), width: optNum(args, 'width'), height: optNum(args, 'height') })
      },
    },
  ]
}

export function cellById(editor: GraphEditor, id: string): Cell {
  const cell = editor.graph.getDataModel().getCell(id)
  if (!cell || cell === editor.graph.getDefaultParent() || !cell.getParent()) throw new Error(`No object with id "${id}" on this page`)
  return cell
}

// Sets a cell's label (HTML labels get escaped text with line breaks).
export function setLabel(editor: GraphEditor, cell: Cell, text: string): void {
  const html = String((cell.getStyle() as Record<string, unknown> | null)?.html ?? '') === '1'
  editor.inBatch(() => editor.graph.getDataModel().setValue(cell, html ? textToHtml(text) : text))
}

// Summary of a page's cells: shapes and connectors with plain-text labels.
export function summarize(records: CellRecord[]) {
  const shapes: Record<string, unknown>[] = []
  const connectors: Record<string, unknown>[] = []
  for (const r of records) {
    if (!r.parent) continue
    const label = htmlToText(r.value ?? '')
    const style = parseStyle(r.style)
    if (r.edge) {
      connectors.push({ id: r.id, source: r.source ?? null, target: r.target ?? null, ...(label ? { label } : {}) })
    } else if (r.vertex) {
      const g = parseGeometry(r.geometry)
      shapes.push({
        id: r.id,
        label,
        shape: style.values.get('shape') ?? style.bases[0] ?? 'rectangle',
        ...(g ? { x: Math.round(g.x), y: Math.round(g.y), width: Math.round(g.width), height: Math.round(g.height) } : {}),
        ...(r.parent !== '1' ? { parent: r.parent } : {}),
      })
    }
  }
  return { shapes, connectors }
}

// The selected shapes and connectors of the page shown.
export function selectedCells(editor: GraphEditor) {
  return editor.graph.getSelectionCells().map((c) => ({
    id: c.getId(),
    kind: c.isEdge() ? 'connector' : 'shape',
    label: htmlToText(String(c.getValue() ?? '')),
    ...(c.isEdge() ? { source: c.getTerminal(true)?.getId() ?? null, target: c.getTerminal(false)?.getId() ?? null } : {}),
  }))
}

// Shows a page (and selects an object of it).
export function showCell(editor: GraphEditor, args: ToolArgs, key = 'page') {
  goToPage(editor, args, key)
  const id = optStr(args, 'id')
  if (id) {
    const cell = cellById(editor, id)
    editor.graph.setSelectionCell(cell)
    editor.graph.scrollCellToVisible(cell)
  }
  return { shown: true, [key]: editor.sync.pageList().findIndex((p) => p.id === editor.sync.page) + 1, ...(id ? { id } : {}) }
}

// A page as text lines for diffs: shapes and connectors by their labels.
export function pageLines(cells: CellRecord[]): string[] {
  const label = new Map(cells.map((r) => [r.id, htmlToText(r.value ?? '').replace(/\s+/g, ' ').trim()]))
  const name = (id?: string | null) => (id ? label.get(id) || `#${id}` : '?')
  const lines: string[] = []
  for (const r of cells) {
    if (!r.parent) continue
    if (r.edge) lines.push(`connector ${name(r.source)} → ${name(r.target)}${label.get(r.id) ? ` “${label.get(r.id)}”` : ''}`)
    else if (r.vertex) lines.push(`shape “${label.get(r.id) ?? ''}” (${parseStyle(r.style).values.get('shape') ?? parseStyle(r.style).bases[0] ?? 'rectangle'})`)
  }
  return lines
}

// Labels to check for spelling: page n · object id.
export function labelParts(doc: Y.Doc, unit: string): TextPart[] {
  return DiagramSync.readPages(doc).flatMap((p, i) =>
    p.cells.filter((r) => r.parent && r.value).map((r) => ({ where: `${unit} ${i + 1} · ${r.id}`, text: htmlToText(r.value ?? '') })),
  )
}

// ---------- Graphs (add_graph, import_mermaid) ----------

export interface GraphNode {
  key: string
  label: string
  shape: string
  fill?: string
  stroke?: string
  width?: number
  height?: number
  // Given position (mermaid layout); otherwise laid out in layers.
  x?: number
  y?: number
}

export interface GraphEdge {
  from: string
  to: string
  label?: string
  style?: string
}

// Layers by longest path from the nodes nobody points to (cycles are cut).
function layers(nodes: GraphNode[], edges: GraphEdge[]): Map<string, number> {
  const out = new Map(nodes.map((n) => [n.key, [] as string[]]))
  const indegree = new Map(nodes.map((n) => [n.key, 0]))
  for (const e of edges) {
    if (!out.has(e.from) || !out.has(e.to) || e.from === e.to) continue
    out.get(e.from)!.push(e.to)
    indegree.set(e.to, indegree.get(e.to)! + 1)
  }
  const layer = new Map<string, number>()
  const visit = (key: string, depth: number, path: Set<string>) => {
    if (path.has(key) || (layer.get(key) ?? -1) >= depth) return
    layer.set(key, depth)
    path.add(key)
    for (const next of out.get(key)!) visit(next, depth + 1, path)
    path.delete(key)
  }
  const roots = nodes.filter((n) => !indegree.get(n.key))
  for (const n of roots.length ? roots : nodes.slice(0, 1)) visit(n.key, 0, new Set())
  for (const n of nodes) if (!layer.has(n.key)) visit(n.key, 0, new Set())
  return layer
}

// Adds the nodes and edges to the page shown in one model update, placed
// right of the existing content; returns cell id by node key.
export function addGraphCells(editor: GraphEditor, nodes: GraphNode[], edges: GraphEdge[], direction: 'down' | 'right', origin: { x: number; y: number }): Record<string, string> {
  const { graph } = editor
  const keys = new Set<string>()
  for (const n of nodes) {
    if (!n.key || keys.has(n.key)) throw new Error(`Node ids must be unique and not empty ("${n.key}")`)
    if (!SHAPES[n.shape]) throw new Error(`Unknown shape "${n.shape}"`)
    keys.add(n.key)
  }
  for (const e of edges) if (!keys.has(e.from) || !keys.has(e.to)) throw new Error(`Edge ${e.from} → ${e.to}: unknown node`)
  const layer = layers(nodes, edges)
  const slot = new Map<number, number>()
  const gapX = 60
  const gapY = 50
  const ids: Record<string, string> = {}
  const cells = new Map<string, Cell>()
  editor.inBatch(() => {
    const parent = graph.getDefaultParent()
    for (const n of nodes) {
      const w = n.width ?? (n.shape === 'actor' ? 30 : 120)
      const h = n.height ?? 60
      let x = n.x
      let y = n.y
      if (x === undefined || y === undefined) {
        const l = layer.get(n.key) ?? 0
        const i = slot.get(l) ?? 0
        slot.set(l, i + 1)
        x = direction === 'right' ? l * (120 + gapX * 1.5) : i * (120 + gapX)
        y = direction === 'right' ? i * (60 + gapY) : l * (60 + gapY * 1.5)
      }
      let style = SHAPES[n.shape]
      if (n.fill) style += `fillColor=${n.fill};`
      if (n.stroke) style += `strokeColor=${n.stroke};`
      const cell = new Cell(textToHtml(n.label), new Geometry(origin.x + x, origin.y + y, w, h), styleFromString(style))
      cell.setVertex(true)
      graph.addCell(cell, parent)
      cells.set(n.key, cell)
      ids[n.key] = cell.getId()!
    }
    for (const e of edges) {
      const geo = new Geometry()
      geo.relative = true
      const edge = new Cell(textToHtml(e.label ?? ''), geo, styleFromString(EDGE_STYLES[e.style ?? 'orthogonal'] ?? EDGE_STYLES.orthogonal))
      edge.setEdge(true)
      graph.addEdge(edge, parent, cells.get(e.from)!, cells.get(e.to)!)
    }
  })
  return ids
}

// Mermaid → the skeleton of mermaid-to-excalidraw → shapes and connectors.
export async function mermaidGraph(definition: string): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const { parseMermaidToExcalidraw } = await import('@excalidraw/mermaid-to-excalidraw')
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const { elements } = (await parseMermaidToExcalidraw(definition, { themeVariables: { fontSize: '16px' } })) as { elements: any[] }
  const kinds: Record<string, string> = { rectangle: 'rectangle', ellipse: 'ellipse', diamond: 'rhombus', text: 'text' }
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const minX = Math.min(0, ...elements.map((e) => Number(e.x) || 0))
  const minY = Math.min(0, ...elements.map((e) => Number(e.y) || 0))
  for (const e of elements) {
    if (e.type === 'arrow' || e.type === 'line') {
      if (e.start?.id && e.end?.id) edges.push({ from: String(e.start.id), to: String(e.end.id), label: e.label?.text ?? '' })
    } else if (kinds[e.type] && (e.type !== 'text' || e.text)) {
      nodes.push({
        key: String(e.id ?? `n${nodes.length}`),
        label: String(e.label?.text ?? e.text ?? ''),
        shape: e.type === 'rectangle' && e.roundness ? 'rounded' : kinds[e.type],
        x: Math.round((Number(e.x) || 0) - minX),
        y: Math.round((Number(e.y) || 0) - minY),
        width: Math.max(20, Math.round(Number(e.width) || 120)),
        height: Math.max(20, Math.round(Number(e.height) || 60)),
      })
    }
  }
  const known = new Set(nodes.map((n) => n.key))
  if (!nodes.length) throw new Error('Only Mermaid flowcharts (and similar graphs with nodes and arrows) can be turned into shapes here')
  return { nodes, edges: edges.filter((e) => known.has(e.from) && known.has(e.to)) }
}

const nodeSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'Your key for edges (not the cell id).' },
    label: { type: 'string' },
    shape: { type: 'string', enum: Object.keys(SHAPES) },
    fill: { type: 'string' },
    stroke: { type: 'string' },
    width: { type: 'number' },
    height: { type: 'number' },
  },
  required: ['id'],
}

// ---------- Diagram tools ----------

export function diagramTools(session: Session, editor: GraphEditor): AppTools {
  const { graph, sync } = editor
  const editable = () => {
    if (editor.readOnly) throw new Error('The diagram is read-only in this tab')
  }
  // Right of the existing content, or at the top left of an empty page.
  const freeSpot = () => {
    let x = 40
    let y = 40
    for (const c of graph.getChildVertices(graph.getDefaultParent())) {
      const g = c.getGeometry()
      if (g && g.x + g.width + 40 > x) {
        x = g.x + g.width + 40
        y = g.y
      }
    }
    return { x, y }
  }

  const tools: OfimeoTool[] = [
    {
      name: 'get_diagram',
      description:
        'Returns a page of the diagram: format "summary" (default) lists shapes (id, label, shape, position, size) and connectors (id, source, target, label); format "xml" returns draw.io XML. Also lists the pages.',
      inputSchema: {
        type: 'object',
        properties: { format: { type: 'string', enum: ['summary', 'xml'] }, ...pageArg },
      },
      access: 'view',
      execute: (args) => {
        const pages = sync.pageList()
        const n = optNum(args, 'page')
        const page = n === undefined ? pages.find((p) => p.id === sync.page) : pages[Math.round(n) - 1]
        if (!page) throw new Error(`There is no page ${n}`)
        const records = sync.pageRecords(page.id)
        const list = pages.map((p, i) => ({ page: i + 1, name: p.name, shown: p.id === sync.page }))
        if (optStr(args, 'format') === 'xml') return { pages: list, xml: serializeDrawio([{ id: page.id, name: page.name, ...sync.pageAttrs(page.id), cells: records }]) }
        return { pages: list, page: pages.indexOf(page) + 1, ...summarize(records) }
      },
    },
    {
      name: 'add_shape',
      description: `Adds a shape with a label to a page (default: the page shown). Shapes: ${Object.keys(SHAPES).join(', ')}. Without x/y it is placed right of the existing content. Returns its id (for connect).`,
      inputSchema: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          shape: { type: 'string', enum: Object.keys(SHAPES), description: 'Default rectangle.' },
          x: { type: 'number' },
          y: { type: 'number' },
          width: { type: 'number', description: 'Default 120.' },
          height: { type: 'number', description: 'Default 60.' },
          fill: { type: 'string', description: 'Fill color, e.g. "#dae8fc".' },
          stroke: { type: 'string', description: 'Line color.' },
          ...pageArg,
        },
      },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Add the shape “{label}”', { label: String(args.label ?? '') }),
      execute: (args) => {
        editable()
        goToPage(editor, args)
        const shape = optStr(args, 'shape') ?? 'rectangle'
        let style = SHAPES[shape]
        if (!style) throw new Error(`Unknown shape "${shape}"`)
        const fill = optStr(args, 'fill')
        const stroke = optStr(args, 'stroke')
        if (fill) style += `fillColor=${fill};`
        if (stroke) style += `strokeColor=${stroke};`
        const spot = freeSpot()
        const w = num(args, 'width', shape === 'actor' ? 30 : 120)
        const h = num(args, 'height', shape === 'actor' ? 60 : 60)
        const label = optStr(args, 'label') ?? ''
        const cell = new Cell(textToHtml(label), new Geometry(num(args, 'x', spot.x), num(args, 'y', spot.y), w, h), styleFromString(style))
        cell.setVertex(true)
        editor.inBatch(() => graph.addCell(cell, graph.getDefaultParent()))
        return { id: cell.getId() }
      },
    },
    {
      name: 'connect',
      description: 'Connects two shapes of the page shown with an arrow (optionally labelled). Returns the connector id.',
      inputSchema: {
        type: 'object',
        properties: {
          source_id: { type: 'string' },
          target_id: { type: 'string' },
          label: { type: 'string' },
          style: { type: 'string', enum: Object.keys(EDGE_STYLES), description: 'Default orthogonal.' },
        },
        required: ['source_id', 'target_id'],
      },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Connect two shapes{label}', { label: args.label ? ` (“${String(args.label)}”)` : '' }),
      execute: (args) => {
        editable()
        const source = cellById(editor, str(args, 'source_id'))
        const target = cellById(editor, str(args, 'target_id'))
        const style = EDGE_STYLES[optStr(args, 'style') ?? 'orthogonal'] ?? EDGE_STYLES.orthogonal
        const geo = new Geometry()
        geo.relative = true
        const edge = new Cell(textToHtml(optStr(args, 'label') ?? ''), geo, styleFromString(style))
        edge.setEdge(true)
        editor.inBatch(() => graph.addEdge(edge, graph.getDefaultParent(), source, target))
        return { id: edge.getId() }
      },
    },
    ...objectTools(editor, editable, 'page'),
    {
      name: 'add_graph',
      description:
        'Adds a whole graph in one step: nodes (id = your key, label, shape, colors) and edges (from, to, label) laid out in layers (direction "down" or "right") to the right of the existing content of a page. One undo step. Returns the cell id of each node key.',
      inputSchema: {
        type: 'object',
        properties: {
          nodes: { type: 'array', items: nodeSchema, maxItems: 300 },
          edges: { type: 'array', items: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, label: { type: 'string' }, style: { type: 'string', enum: Object.keys(EDGE_STYLES) } }, required: ['from', 'to'] } },
          direction: { type: 'string', enum: ['down', 'right'] },
          ...pageArg,
        },
        required: ['nodes'],
      },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Add a graph of {n} shapes', { n: Array.isArray(args.nodes) ? args.nodes.length : 0 }),
      execute: (args) => {
        editable()
        goToPage(editor, args)
        const nodes = (Array.isArray(args.nodes) ? args.nodes : []).slice(0, 300).map((n: Record<string, unknown>) => ({
          key: String(n.id ?? ''),
          label: String(n.label ?? n.id ?? ''),
          shape: String(n.shape ?? 'rounded'),
          fill: n.fill ? String(n.fill) : undefined,
          stroke: n.stroke ? String(n.stroke) : undefined,
          width: typeof n.width === 'number' ? n.width : undefined,
          height: typeof n.height === 'number' ? n.height : undefined,
        }))
        if (!nodes.length) throw new Error('Give at least one node')
        const edges = (Array.isArray(args.edges) ? args.edges : []).map((e: Record<string, unknown>) => ({ from: String(e.from), to: String(e.to), label: e.label ? String(e.label) : '', style: e.style ? String(e.style) : undefined }))
        return { ids: addGraphCells(editor, nodes, edges, optStr(args, 'direction') === 'right' ? 'right' : 'down', freeSpot()) }
      },
    },
    {
      name: 'import_mermaid',
      description: 'Turns a Mermaid flowchart ("flowchart TD; A[Start] --> B{Ok?}" …) into shapes and connectors on a page, laid out by Mermaid, to the right of the existing content. One undo step.',
      inputSchema: { type: 'object', properties: { definition: { type: 'string' }, ...pageArg }, required: ['definition'] },
      access: 'edit',
      changesDocument: true,
      summary: () => t('Add a diagram from Mermaid'),
      execute: async (args) => {
        editable()
        const { nodes, edges } = await mermaidGraph(str(args, 'definition'))
        goToPage(editor, args)
        return { ids: addGraphCells(editor, nodes, edges, 'down', freeSpot()) }
      },
    },
    {
      name: 'import_drawio',
      description: 'Adds the pages of draw.io XML (an mxfile or one mxGraphModel) as new pages of the diagram and shows the first one.',
      inputSchema: { type: 'object', properties: { xml: { type: 'string' } }, required: ['xml'] },
      access: 'edit',
      changesDocument: true,
      summary: () => t('Add pages from draw.io'),
      execute: async (args) => {
        editable()
        const { parseDrawio } = await import('./formats/drawio')
        const xml = str(args, 'xml')
        const pages = await parseDrawio(/<mxfile[\s>]/.test(xml) ? xml : `<mxfile><diagram name="Imported">${xml}</diagram></mxfile>`)
        if (!pages.length) throw new Error('No pages in that XML')
        const ids = pages.map((p) => sync.addPage(p.name || `Page ${sync.pageList().length + 1}`, p.cells, { background: p.background, pageWidth: p.pageWidth, pageHeight: p.pageHeight }))
        showPageSafely(editor, ids[0])
        return { pages: ids.map((id) => sync.pageList().findIndex((p) => p.id === id) + 1) }
      },
    },
    {
      name: 'add_page',
      description: 'Adds an empty page (optionally named) after the last one and shows it.',
      inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Add the page {name}', { name: optStr(args, 'name') ?? '' }),
      execute: (args) => {
        editable()
        const id = sync.addPage(optStr(args, 'name')?.trim() || `Page ${sync.pageList().length + 1}`)
        showPageSafely(editor, id)
        return { page: sync.pageList().findIndex((p) => p.id === id) + 1 }
      },
    },
    {
      name: 'rename_page',
      description: 'Renames a page (default: the page shown).',
      inputSchema: { type: 'object', properties: { ...pageArg, name: { type: 'string' } }, required: ['name'] },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Rename a page to {name}', { name: String(args.name ?? '') }),
      execute: (args) => {
        editable()
        const { page, n } = pageAt(editor, args)
        sync.renamePage(page.id, str(args, 'name').trim() || page.name)
        return { page: n, name: str(args, 'name') }
      },
    },
    {
      name: 'move_page',
      description: 'Moves a page (default: the page shown) so that it becomes page number "to".',
      inputSchema: { type: 'object', properties: { ...pageArg, to: { type: 'integer', minimum: 1 } }, required: ['to'] },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Move a page to position {n}', { n: String(args.to) }),
      execute: (args) => {
        editable()
        const { page } = pageAt(editor, args)
        return { page: movePageTo(editor, page.id, num(args, 'to')) }
      },
    },
    {
      name: 'delete_page',
      description: 'Deletes a page with everything on it (not the last page). The user confirms it.',
      inputSchema: { type: 'object', properties: { ...pageArg }, required: ['page'] },
      access: 'edit',
      changesDocument: true,
      destructive: true,
      summary: (args) => t('Delete page {n} and everything on it', { n: String(args.page) }),
      execute: (args) => {
        editable()
        if (sync.pageList().length <= 1) throw new Error('The last page cannot be deleted')
        const { page } = pageAt(editor, args)
        const model = graph.getDataModel()
        const level = model.updateLevel
        for (let i = 0; i < level; i++) model.endUpdate()
        sync.deletePage(page.id)
        for (let i = 0; i < level; i++) model.beginUpdate()
        return { deleted: page.name, pages: sync.pageList().length }
      },
    },
    {
      name: 'set_label',
      description: 'Changes the label of a shape or connector of the page shown (by id from get_diagram).',
      inputSchema: { type: 'object', properties: { id: { type: 'string' }, label: { type: 'string' } }, required: ['id', 'label'] },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Change a label to “{label}”', { label: String(args.label ?? '') }),
      execute: (args) => {
        editable()
        setLabel(editor, cellById(editor, str(args, 'id')), str(args, 'label', ''))
        return { ok: true }
      },
    },
  ]

  return {
    tools,
    selection: () => {
      const cells = selectedCells(editor)
      const page = sync.pageList().findIndex((p) => p.id === sync.page) + 1
      return cells.length ? { kind: 'shapes', page, cells } : { kind: 'none', page }
    },
    group: (fn) => groupGraph(editor, fn),
    render: async (args) => {
      const pages = DiagramSync.readPages(session.doc)
      const shown = pages.findIndex((p) => p.id === sync.page)
      const n = Math.round(optNum(args, 'page') ?? shown + 1)
      const page = pages[n - 1]
      if (!page) throw new Error(`There is no page ${n} (there are ${pages.length})`)
      const [{ renderPages }, { orderCells }, { svgToPng }, { svgScale }] = await Promise.all([import('./index'), import('./formats/drawio'), import('./export'), import('../../core/webmcp/render')])
      const [svg] = await renderPages([orderCells(page.cells)], [page.background && page.background !== 'none' ? page.background : '#ffffff'])
      const width = Number(svg.getAttribute('width')) || 800
      const height = Number(svg.getAttribute('height')) || 600
      return imageResult(await svgToPng(svg, svgScale(width, height)), `Page ${n} “${page.name}”`)
    },
    renderSchema: { ...pageArg },
    serialize: (doc) => DiagramSync.readPages(doc).map((p) => [`## ${p.name}`, ...pageLines(p.cells)].join('\n')).join('\n'),
    paragraphs: () => labelParts(session.doc, 'page'),
    show: (args) => showCell(editor, args),
    showSchema: { ...pageArg, id: { type: 'string', description: 'Object to select (id from get_diagram).' } },
    undo: editor.undo,
    redo: editor.redo,
    info: () => ({
      pages: sync.pageList().map((p) => p.name),
      page_shown: sync.pageList().findIndex((p) => p.id === sync.page) + 1,
      ai_changes: session.canEdit ? 'Each change is one undo step (Edit ▸ Undo) and is recorded as the AI assistant’s in the version history.' : 'none (read-only)',
    }),
  }
}
