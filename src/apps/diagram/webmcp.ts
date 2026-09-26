// WebMCP tools of the diagram editor (see src/core/webmcp). Loaded only while
// the switch is on. Changes go through the maxGraph model in one batch, so
// each one is a single step of the editor's undo history, and the core records
// them as the AI assistant's in the version history. Diagrams have no comments.
//
// Wiring (src/apps/diagram/app.ts, after the editor is created):
//   provideWebMcpTools(session, () => import('./webmcp').then((m) => m.diagramTools(session, editor)))

import { Cell, Geometry } from '@maxgraph/core'
import type { Session } from '../../core/session'
import { htmlToText, num, optNum, optStr, str, textToHtml, type AppTools, type OfimeoTool, type ToolArgs } from '../../core/webmcp/types'
import { serializeDrawio } from './formats/drawio'
import { styleFromString, type EditorGraph } from './graph'
import { parseGeometry, parseStyle, type CellRecord } from './model'
import type { DiagramSync } from './sync'

// What the tools need from the editor (createDiagramEditor's result has it).
export interface GraphEditor {
  graph: EditorGraph
  sync: DiagramSync
  readOnly: boolean
  inBatch: <T>(fn: () => T) => T
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

// Shows page `n` (1-based) when given; returns its id.
export function goToPage(editor: GraphEditor, args: ToolArgs, key = 'page'): string {
  const n = optNum(args, key)
  if (n === undefined) return editor.sync.page
  const page = editor.sync.pageList()[Math.round(n) - 1]
  if (!page) throw new Error(`There is no ${key} ${n} (there are ${editor.sync.pageList().length})`)
  if (page.id !== editor.sync.page) editor.sync.showPage(page.id)
  return page.id
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
    {
      name: 'set_label',
      description: 'Changes the label of a shape or connector of the page shown (by id from get_diagram).',
      inputSchema: { type: 'object', properties: { id: { type: 'string' }, label: { type: 'string' } }, required: ['id', 'label'] },
      access: 'edit',
      changesDocument: true,
      execute: (args) => {
        editable()
        setLabel(editor, cellById(editor, str(args, 'id')), str(args, 'label', ''))
        return { ok: true }
      },
    },
  ]

  return {
    tools,
    info: () => ({
      pages: sync.pageList().map((p) => p.name),
      page_shown: sync.pageList().findIndex((p) => p.id === sync.page) + 1,
      ai_changes: session.canEdit ? 'Each change is one undo step (Edit ▸ Undo) and is recorded as the AI assistant’s in the version history.' : 'none (read-only)',
    }),
  }
}
