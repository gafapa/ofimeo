// Slide rendering: the theme applied to a graph (fonts and colors of
// placeholders and text boxes), and an offscreen renderer that draws any slide
// as a standalone SVG (thumbnails, presenting, printing and exports).

import { CellEditorHandler, Graph, type Cell, type CellState } from '@maxgraph/core'
import { renderSvg } from '../diagram/export'
import { applyLook, buildCells } from '../diagram/graph'
import { prepareItems } from '../diagram/libraries'
import type { CellRecord } from '../diagram/model'
import { PLACEHOLDER_HINTS, type Role, type Theme } from './model'
import type { SlideLayer } from './player'

const SVG_NS = 'http://www.w3.org/2000/svg'

type Style = Record<string, unknown>

// Placeholders and text boxes take the theme's fonts and colors unless they set their own.
export function installTheme(graph: Graph, getTheme: () => Theme, editing: boolean): void {
  const getCellStyle = graph.getCellStyle.bind(graph)
  graph.getCellStyle = (cell: Cell) => {
    const style = getCellStyle(cell) as Style
    const own = (cell.getStyle() ?? {}) as Style
    const role = own.slidePh as Role | undefined
    const isText = role || own.slideText || (own.baseStyleNames as string[] | undefined)?.includes('text')
    if (isText) {
      const theme = getTheme()
      const title = role === 'title'
      if (own.fontFamily === undefined) style.fontFamily = title ? theme.titleFont : theme.bodyFont
      if (own.fontColor === undefined) style.fontColor = title ? theme.titleColor : theme.bodyColor
      // Empty placeholders show a dashed outline while editing.
      if (editing && role && isEmpty(cell)) {
        style.strokeColor = '#9aa0a6'
        style.dashed = 1
        style.dashPattern = '4 4'
      }
    }
    return style as ReturnType<typeof getCellStyle>
  }
  if (!editing) return
  // "Click to add title" in empty placeholders.
  const renderer = graph.cellRenderer
  const getLabelValue = renderer.getLabelValue.bind(renderer)
  renderer.getLabelValue = (state: CellState) => {
    const role = (state.cell.getStyle() as Style | null)?.slidePh as Role | undefined
    if (role && isEmpty(state.cell) && !(graph.isEditing() && editingCell(graph) === state.cell)) {
      return `<span style="opacity:0.5">${PLACEHOLDER_HINTS[role] ?? PLACEHOLDER_HINTS.body}</span>`
    }
    return getLabelValue(state)
  }
}

export function editingCell(graph: Graph): Cell | null {
  return graph.getPlugin<CellEditorHandler>('CellEditorHandler')?.getEditingCell() ?? null
}

function isEmpty(cell: Cell): boolean {
  const v = cell.getValue()
  return v === null || v === undefined || String(v).replace(/<br\s*\/?>|&nbsp;|\s/g, '') === ''
}

let gradientId = 0

// Adds the slide background behind the content of an SVG.
export function addBackground(svg: SVGSVGElement, background: string | [string, string], width: number, height: number): void {
  const rect = document.createElementNS(SVG_NS, 'rect')
  rect.setAttribute('width', String(width))
  rect.setAttribute('height', String(height))
  if (Array.isArray(background)) {
    const id = `slide-bg-${++gradientId}`
    const defs = document.createElementNS(SVG_NS, 'defs')
    const gradient = document.createElementNS(SVG_NS, 'linearGradient')
    gradient.id = id
    gradient.setAttribute('x1', '0')
    gradient.setAttribute('y1', '0')
    gradient.setAttribute('x2', '0')
    gradient.setAttribute('y2', '1')
    background.forEach((color, i) => {
      const stop = document.createElementNS(SVG_NS, 'stop')
      stop.setAttribute('offset', String(i))
      stop.setAttribute('stop-color', color)
      gradient.append(stop)
    })
    defs.append(gradient)
    svg.prepend(defs, rect)
    rect.setAttribute('fill', `url(#${id})`)
  } else {
    rect.setAttribute('fill', background)
    svg.prepend(rect)
  }
}

export interface RenderInput {
  cells: CellRecord[]
  background: string | [string, string] | null
}

// Draws slides with an offscreen graph that has the editor's look and theme.
export class SlideRenderer {
  readonly graph: Graph
  private loaded: CellRecord[] | null = null

  private readonly host: HTMLElement

  constructor(getTheme: () => Theme) {
    const host = (this.host = document.createElement('div'))
    host.className = 'sidebar-thumb-host'
    document.body.append(host)
    this.graph = new Graph(host, undefined, [])
    applyLook(this.graph)
    installTheme(this.graph, getTheme, false)
  }

  destroy(): void {
    this.graph.destroy()
    this.host.remove()
  }

  // Loads the stencils and shape code the cells need (library shapes); null when nothing is missing.
  prepare(cells: CellRecord[]): Promise<unknown> | null {
    return prepareItems([{ label: '', style: '', width: 1, height: 1, cells }])
  }

  // Shows a slide's cells in the offscreen graph.
  load(cells: CellRecord[]): void {
    if (this.loaded === cells) return
    const model = this.graph.getDataModel()
    const top = buildCells(cells)
    const root = top.find((c) => c.getId() === '0') ?? top[0]
    model.beginUpdate()
    try {
      model.clear()
      if (root) model.setRoot(root)
    } finally {
      model.endUpdate()
    }
    this.loaded = cells
  }

  // Standalone SVG of a slide at (0, 0, width, height), scaled.
  render(input: RenderInput, width: number, height: number, scale = 1): SVGSVGElement {
    this.load(input.cells)
    this.graph.refresh()
    const svg = renderSvg(this.graph, { area: { x: 0, y: 0, width, height }, border: 0, background: null, scale })
    // Background in slide coordinates, under the content group.
    const w = Math.ceil(width * scale)
    const h = Math.ceil(height * scale)
    if (input.background) addBackground(svg, input.background, w, h)
    return svg
  }

  // The slide as layers for presenting: runs of static objects, and each
  // animated top-level object alone, in drawing order (the first with the background).
  renderLayers(input: RenderInput, animated: Set<string>, width: number, height: number): SlideLayer[] {
    this.load(input.cells)
    this.graph.refresh()
    const area = { x: 0, y: 0, width, height }
    const layers: SlideLayer[] = []
    let run: Cell[] = []
    const flush = (force = false) => {
      if (!run.length && !(force && !layers.length)) return
      const svg = renderSvg(this.graph, { area, border: 0, background: null, cells: run.length ? run : [] })
      if (!layers.length && input.background) addBackground(svg, input.background, Math.ceil(width), Math.ceil(height))
      layers.push({ svg })
      run = []
    }
    const view = this.graph.view
    for (const cell of this.topCells()) {
      const id = cell.getId() ?? ''
      if (!animated.has(id)) {
        run.push(cell)
        continue
      }
      flush(true)
      const state = view.getState(cell)
      const s = view.scale
      const tr = view.translate
      const b = state ? this.graph.getBoundingBox([cell]) : null
      const box = b ? { x: b.x / s - tr.x, y: b.y / s - tr.y, w: b.width / s, h: b.height / s } : { x: 0, y: 0, w: width, h: height }
      layers.push({ svg: renderSvg(this.graph, { area, border: 0, background: null, cells: [cell] }), cell: id, box })
    }
    flush(true)
    return layers
  }

  // The rendered states of the loaded slide, top-level cells in drawing order.
  topCells(): Cell[] {
    const layer = this.graph.getDefaultParent()
    const out: Cell[] = []
    const root = this.graph.getDataModel().getRoot()
    if (!root) return out
    // Every layer, in order.
    for (let i = 0; i < root.getChildCount(); i++) {
      const l = root.getChildAt(i)
      for (let j = 0; j < l.getChildCount(); j++) out.push(l.getChildAt(j))
    }
    return layer ? out : []
  }
}

export function svgDataUrl(svg: SVGSVGElement): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`
}
