// The diagram editor without its app frame: graph, sync, undo, zoom, clipboard,
// commands, find, shape and format panels, keyboard, context menu and presence.
// The diagram app (app.ts) and the presentations app (apps/slides) put it in the
// shared app frame (src/ui/frame.ts): editMenu(), arrangeMenu(), zoomMenu() and
// panelMenu() fill their menus, zoomTarget drives the status-bar zoom control,
// shortcutSections() the shortcuts dialog and find() the Edit ▸ Find… panel.

import {
  Cell,
  CircleLayout,
  CompactTreeLayout,
  FastOrganicLayout,
  Geometry,
  HierarchicalLayout,
  InternalEvent,
  UndoManager,
  type EventObject,
  type GraphLayout,
  type UndoableEdit,
} from '@maxgraph/core'
import { ChevronDown, ChevronUp, X } from 'lucide'
import type { Session } from '../../core/session'
import { t, tn } from '../../core/i18n'
import { mod, type ShortcutSection } from '../../ui/shortcuts'
import { el, icon, promptText, showContextMenu, toast, uiZoom, type MenuEntry } from '../../ui/widgets'
import type { ZoomTarget } from '../../ui/zoom'
import { FormatPanel } from './format'
import { buildCells, cellsToRecords, createGraph, isTyping, setStyleKey, styleFromString, styleToString, type EditorGraph } from './graph'
import { chooseLibraries, loadEnabledLibraries, prepareItems, watchGraph } from './libraries'
import type { CellRecord, PageRecord } from './model'
import { PALETTE } from './palette'
import { DiagramPresence } from './presence'
import { registerShapes } from './shapes'
import { ShapeSidebar } from './sidebar'
import { DiagramSync } from './sync'

export { isMac, mod } from '../../ui/shortcuts'
const ZOOMS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]
const MIN_ZOOM = 0.1
const MAX_ZOOM = 8
const CLIPBOARD_PREFIX = 'words-online-diagram:'
const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const TEXT_STYLE = 'text;html=1;align=center;verticalAlign=middle;whiteSpace=wrap;'

const formats = () => import('./formats/drawio')

export type Align = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface EditorOptions {
  canvas: HTMLElement
  // View only (the session's access is not 'edit'): zoom, pan, pages and export still work.
  readOnly?: boolean
  // localStorage key of the grid toggle and its default.
  gridKey?: string
  gridDefault?: boolean
  // Graph area that Fit shows (e.g. a slide); default: all the content.
  fitBounds?: () => Bounds | null
  // Style and size of the text added by double clicking the canvas or pasting text.
  textStyle?: string
  textSize?: [number, number]
  // Format panel content when nothing is selected.
  formatEmpty?: () => HTMLElement
  // More rows for the diagram options of the format panel.
  diagramOptions?: () => HTMLElement[]
  // Files other than images dropped on the canvas.
  openFile?: (file: File) => void
  // Keys handled by the app first; return true when handled (it calls preventDefault as needed).
  onKey?: (e: KeyboardEvent) => boolean
  // Extra context menu entries (with the current selection).
  contextItems?: (selected: boolean) => MenuEntry[]
  onPagesChange?: () => void
  onPageShown?: () => void
  // First page of an empty document (default: a blank page).
  blankPage?: (id?: string, name?: string) => PageRecord
}

export type DiagramEditor = ReturnType<typeof createDiagramEditor>

export function createDiagramEditor(session: Session, options: EditorOptions) {
  registerShapes()
  const { canvas } = options
  const readOnly = !!options.readOnly
  const graph: EditorGraph = createGraph(canvas)
  // Loads draw.io stencils and shape code for the cells that need them.
  watchGraph(graph)
  const model = graph.getDataModel()
  const view = graph.view
  const sync = new DiagramSync(session.doc, graph, options.blankPage)
  if (readOnly) {
    // No selection, moving, resizing, connecting or label editing; panning and zoom stay.
    graph.setEnabled(false)
    canvas.classList.add('read-only')
  }
  const editable = (fn?: () => boolean) => () => !readOnly && (fn ? fn() : true)

  // ---------- Undo ----------

  const undoManager = new UndoManager()
  model.addListener(InternalEvent.UNDO, (_sender: unknown, evt: EventObject) => {
    // Remote changes never enter the local history.
    if (!sync.applying) undoManager.undoableEditHappened(evt.getProperty('edit') as UndoableEdit)
  })
  const selectChanged = (_sender: unknown, evt: EventObject) => {
    const edit = evt.getProperty('edit') as UndoableEdit
    const cells = new Set<Cell>()
    for (const change of edit.changes as Record<string, unknown>[]) {
      const cell = (change.cell ?? change.child) as Cell | undefined
      if (cell && model.getCell(cell.getId()!) === cell) cells.add(cell)
    }
    graph.setSelectionCells([...cells])
  }
  undoManager.addListener(InternalEvent.UNDO, selectChanged)
  undoManager.addListener(InternalEvent.REDO, selectChanged)
  const undo = () => readOnly || graph.isEditing() || undoManager.undo()
  const redo = () => readOnly || graph.isEditing() || undoManager.redo()

  // ---------- View: zoom, pan, grid ----------

  const gridKey = options.gridKey ?? 'diagram-grid'
  const zoomListeners: (() => void)[] = []
  const selectionLabel = el('span', { class: 'hide-narrow' })
  let gridVisible = (localStorage.getItem(gridKey) ?? (options.gridDefault === false ? '0' : '1')) !== '0'
  const updateGrid = () => {
    const s = view.scale
    const size = graph.gridSize * s
    canvas.classList.toggle('grid', gridVisible && size >= 4)
    canvas.style.setProperty('--grid', `${size}px`)
    canvas.style.setProperty('--grid-major', `${size * 4}px`)
    canvas.style.backgroundPosition = `${view.translate.x * s}px ${view.translate.y * s}px`
    zoomListeners.forEach((fn) => fn())
  }
  const setGridVisible = (on: boolean) => {
    gridVisible = on
    localStorage.setItem(gridKey, on ? '1' : '0')
    updateGrid()
  }

  const zoomAt = (scale: number, clientX?: number, clientY?: number) => {
    const s = view.scale
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale))
    const rect = canvas.getBoundingClientRect()
    const px = clientX === undefined ? rect.width / 2 : clientX - rect.left
    const py = clientY === undefined ? rect.height / 2 : clientY - rect.top
    const t = view.translate
    view.scaleAndTranslate(next, px / next - (px / s - t.x), py / next - (py / s - t.y))
  }
  const zoomStep = (dir: 1 | -1) => {
    const s = view.scale
    const next = dir > 0 ? (ZOOMS.find((z) => z > s + 0.001) ?? s * 1.25) : ([...ZOOMS].reverse().find((z) => z < s - 0.001) ?? s / 1.25)
    zoomAt(next)
  }
  // Shows an area given in graph coordinates.
  const fitArea = (area: Bounds, margin = 32, maxScale = 1) => {
    const rect = canvas.getBoundingClientRect()
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((rect.width - 2 * margin) / area.width, (rect.height - 2 * margin) / area.height, maxScale)))
    view.scaleAndTranslate(next, (rect.width / next - area.width) / 2 - area.x, (rect.height / next - area.height) / 2 - area.y)
  }
  const fit = () => {
    const custom = options.fitBounds?.()
    if (custom) return fitArea(custom, 24, MAX_ZOOM)
    const b = graph.getGraphBounds()
    const s = view.scale
    const t = view.translate
    if (!b.width || !b.height) {
      view.scaleAndTranslate(1, 20, 20)
      return
    }
    fitArea({ x: b.x / s - t.x, y: b.y / s - t.y, width: b.width / s, height: b.height / s })
  }
  const actualSize = () => zoomAt(1)
  // The status-bar zoom control and View ▸ Zoom of the app frame; Ctrl++ / Ctrl+- / Ctrl+0 come from the frame keys.
  const zoomTarget: ZoomTarget = { get: () => view.scale, set: (z) => zoomAt(z), fit, min: MIN_ZOOM, max: MAX_ZOOM, presets: ZOOMS, keys: true }

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) zoomAt(view.scale * Math.exp(-e.deltaY * 0.002), e.clientX, e.clientY)
      else {
        const s = view.scale
        const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX
        const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY
        view.setTranslate(view.translate.x - dx / s, view.translate.y - dy / s)
      }
    },
    { passive: false },
  )
  for (const event of [InternalEvent.SCALE, InternalEvent.TRANSLATE, InternalEvent.SCALE_AND_TRANSLATE]) view.addListener(event, updateGrid)

  // ---------- Commands ----------

  const selection = () => graph.getSelectionCells()
  const hasSelection = () => !graph.isSelectionEmpty()
  const vertices = () => selection().filter((c) => c.isVertex())

  const inBatch = <T>(fn: () => T): T => {
    model.beginUpdate()
    try {
      return fn()
    } finally {
      model.endUpdate()
    }
  }

  const insertCells = (cells: Cell[], x: number, y: number, target: Cell | null) => {
    if (readOnly) return
    // maxGraph's moveCells drops parentless edges with relative geometry: give them a scratch parent.
    const scratch = new Cell()
    cells.forEach((cell) => cell.getParent() || scratch.insert(cell))
    const inserted = inBatch(() => graph.importCells(cells, x, y, target ?? graph.getDefaultParent()))
    graph.setSelectionCells(inserted)
    canvas.focus()
  }

  // Inserts at the center of the view, shifted if something is already there.
  const insertAtCenter = (cells: Cell[]) => {
    const rect = canvas.getBoundingClientRect()
    const s = view.scale
    const t = view.translate
    const geo = cells[0].getGeometry() ?? new Geometry(0, 0, 0, 0)
    let x = graph.snap(rect.width / 2 / s - t.x - geo.width / 2)
    let y = graph.snap(rect.height / 2 / s - t.y - geo.height / 2)
    const occupied = (px: number, py: number) =>
      graph.getChildVertices(graph.getDefaultParent()).some((c) => {
        const g = c.getGeometry()
        return g && Math.abs(g.x - px) < 1 && Math.abs(g.y - py) < 1
      })
    while (occupied(x, y)) {
      x += graph.gridSize * 2
      y += graph.gridSize * 2
    }
    insertCells(cells, x, y, null)
  }

  const remove = () => {
    if (readOnly || !hasSelection()) return
    inBatch(() => graph.removeCells(selection(), true))
  }
  const duplicate = () => {
    if (readOnly || !hasSelection()) return
    const cells = graph.moveCells(graph.getSelectionCells(), graph.gridSize, graph.gridSize, true)
    graph.setSelectionCells(cells)
  }
  const selectAll = () => graph.selectAll(graph.getDefaultParent(), true)
  const selectVertices = () => graph.setSelectionCells(graph.getChildVertices(graph.getDefaultParent()))
  const selectEdges = () => graph.setSelectionCells(graph.getChildEdges(graph.getDefaultParent()))
  const toFront = () => hasSelection() && graph.orderCells(false, selection())
  const toBack = () => hasSelection() && graph.orderCells(true, selection())
  const group = () => {
    const cells = selection()
    if (cells.length < 2) return
    const groupCell = inBatch(() => graph.groupCells(null as unknown as Cell, 0, cells))
    graph.setSelectionCell(groupCell)
  }
  const ungroup = () => {
    if (!hasSelection()) return
    graph.setSelectionCells(inBatch(() => graph.ungroupCells(selection())))
  }
  graph.createGroupCell = () => {
    const cell = new Cell('', new Geometry(), styleFromString('group;'))
    cell.setVertex(true)
    cell.setConnectable(false)
    return cell
  }
  const align = (where: Align) => graph.alignCells(where, vertices())
  const distribute = (horizontal: boolean) => {
    const cells = vertices()
      .map((cell) => ({ cell, geo: cell.getGeometry()! }))
      .filter((c) => c.geo)
      .sort((a, b) => (horizontal ? a.geo.getCenterX() - b.geo.getCenterX() : a.geo.getCenterY() - b.geo.getCenterY()))
    if (cells.length < 3) return
    const first = horizontal ? cells[0].geo.getCenterX() : cells[0].geo.getCenterY()
    const last = horizontal ? cells.at(-1)!.geo.getCenterX() : cells.at(-1)!.geo.getCenterY()
    const step = (last - first) / (cells.length - 1)
    inBatch(() =>
      cells.forEach(({ cell, geo }, i) => {
        const g = geo.clone()
        if (horizontal) g.x = Math.round(first + step * i - g.width / 2)
        else g.y = Math.round(first + step * i - g.height / 2)
        model.setGeometry(cell, g)
      }),
    )
  }
  const flip = (key: 'flipH' | 'flipV') => {
    const cells = vertices()
    if (!cells.length) return
    const on = String((graph.getCellStyle(cells[0]) as Record<string, unknown>)[key] ?? '') === '1' || (graph.getCellStyle(cells[0]) as Record<string, unknown>)[key] === true
    setStyleKey(graph, cells, key, on ? null : 1)
  }
  const rotate = () => {
    const cells = vertices()
    if (!cells.length) return
    inBatch(() =>
      cells.forEach((cell) => {
        const current = Number((graph.getCellStyle(cell) as Record<string, unknown>).rotation ?? 0)
        setStyleKey(graph, [cell], 'rotation', (current + 90) % 360 || null)
      }),
    )
  }
  const editLabel = () => {
    const cell = graph.getSelectionCell()
    if (cell && !readOnly) graph.startEditingAtCell(cell)
  }
  const editStyle = async () => {
    const cells = selection()
    if (!cells.length || readOnly) return
    const value = await promptText(t('Edit style'), t('Style (draw.io format)'), styleToString(cells[0].getStyle()), true)
    if (value === null) return
    const style = styleFromString(value.replace(/\s*\n\s*/g, ''))
    inBatch(() => cells.forEach((cell) => model.setStyle(cell, { ...style })))
  }
  const setFill = (color: string | null) => setStyleKey(graph, vertices(), 'fillColor', color ?? 'none')
  const setStroke = (color: string | null) => setStyleKey(graph, selection(), 'strokeColor', color ?? 'none')
  // Bold 1, italic 2, underline 4, strikethrough 8 (draw.io's fontStyle bits).
  const fontStyleOf = (cell: Cell | undefined) => (cell ? Number((graph.getCellStyle(cell) as Record<string, unknown>).fontStyle ?? 0) : 0)
  const hasFontStyle = (bit: number) => (fontStyleOf(selection()[0]) & bit) !== 0
  const toggleFontStyle = (bit: number) => {
    const cells = selection()
    if (readOnly || !cells.length) return
    const current = fontStyleOf(cells[0])
    setStyleKey(graph, cells, 'fontStyle', current & bit ? current & ~bit || null : current | bit)
  }

  // Tree layouts start from the selected shape, else from the root they find.
  const layout = (make: () => GraphLayout) => {
    const parent = graph.getDefaultParent()
    const selected = graph.getSelectionCell()
    const rootCell = selected?.isVertex() ? selected : undefined
    const instance = make() as GraphLayout & { execute(parent: Cell, root?: Cell): void }
    inBatch(() => instance.execute(parent, rootCell))
    fit()
  }
  const treeLayout = (horizontal: boolean) => () => {
    const l = new CompactTreeLayout(graph, horizontal)
    l.levelDistance = 40
    l.nodeDistance = 20
    return l
  }

  // ---------- Clipboard ----------

  let pasteCount = 0
  let lastClipboard = ''

  const copyText = (): string => {
    const cells = graph.getExportableCells(graph.getSelectionCells())
    if (!cells.length) return ''
    return CLIPBOARD_PREFIX + JSON.stringify(cellsToRecords(cells))
  }
  const pasteRecords = (records: CellRecord[], offset: number) => {
    const cells = buildCells(records)
    if (!cells.length) return
    insertCells(cells, offset, offset, null)
  }
  const textSize = options.textSize ?? [120, 40]
  const pasteText = async (text: string) => {
    if (readOnly) return
    if (text.startsWith(CLIPBOARD_PREFIX)) {
      pasteCount = text === lastClipboard ? pasteCount + 1 : 1
      lastClipboard = text
      pasteRecords(JSON.parse(text.slice(CLIPBOARD_PREFIX.length)) as CellRecord[], pasteCount * graph.gridSize)
      return
    }
    if (/<mxGraphModel|<mxfile/.test(text)) {
      try {
        const { parseDrawio } = await formats()
        const [page] = await parseDrawio(text)
        const rootId = page.cells.find((c) => !c.parent)?.id
        const layers = new Set(page.cells.filter((c) => c.parent === rootId).map((c) => c.id))
        const records = page.cells
          .filter((c) => c.id !== rootId && !layers.has(c.id))
          .map((c) => (c.parent && layers.has(c.parent) ? { ...c, parent: undefined, previous: undefined } : c))
        pasteRecords(records, 0)
      } catch (err) {
        toast(t('Could not paste: {error}', { error: (err as Error).message }))
      }
      return
    }
    const trimmed = text.trim()
    if (!trimmed) return
    const cell = new Cell(escapeHtml(trimmed).replace(/\n/g, '<br>'), new Geometry(0, 0, textSize[0], textSize[1]), styleFromString(options.textStyle ?? TEXT_STYLE))
    cell.setVertex(true)
    insertAtCenter([cell])
    if (!options.textStyle) graph.updateCellSize(cell, true)
  }
  const insertImage = (file: File, x?: number, y?: number, maxSize = 400) => {
    if (readOnly) return
    if (file.size > MAX_IMAGE_BYTES) {
      toast(t('Images larger than 2 MB are not supported'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        // draw.io keeps data URIs without ";base64" in style strings.
        const data = url.replace(';base64,', ',')
        const cell = new Cell('', new Geometry(0, 0, w, h), styleFromString(`shape=image;verticalLabelPosition=bottom;verticalAlign=top;imageAspect=0;aspect=fixed;image=${data};`))
        cell.setVertex(true)
        if (x === undefined || y === undefined) insertAtCenter([cell])
        else insertCells([cell], x - w / 2, y - h / 2, null)
      }
      img.src = url
    }
    reader.readAsDataURL(file)
  }
  const handlesClipboard = () => !isTyping(document.activeElement) && !graph.isEditing() && !document.querySelector('dialog[open]')

  document.addEventListener('copy', (e) => {
    if (!handlesClipboard()) return
    const text = copyText()
    if (!text) return
    e.clipboardData?.setData('text/plain', text)
    lastClipboard = text
    pasteCount = 0
    e.preventDefault()
  })
  document.addEventListener('cut', (e) => {
    if (!handlesClipboard() || readOnly) return
    const text = copyText()
    if (!text) return
    e.clipboardData?.setData('text/plain', text)
    lastClipboard = text
    pasteCount = -1
    e.preventDefault()
    remove()
  })
  document.addEventListener('paste', (e) => {
    if (!handlesClipboard() || !e.clipboardData || readOnly) return
    const image = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'))
    e.preventDefault()
    if (image) insertImage(image)
    else void pasteText(e.clipboardData.getData('text/plain'))
  })
  const menuCopy = (cut: boolean) => {
    const text = copyText()
    if (!text) return
    lastClipboard = text
    pasteCount = cut ? -1 : 0
    navigator.clipboard?.writeText(text).catch(() => {})
    if (cut) remove()
  }
  const menuPaste = async () => {
    let text = lastClipboard
    try {
      text = (await navigator.clipboard.readText()) || lastClipboard
    } catch {
      // Clipboard access denied: use what was copied here.
    }
    if (text) await pasteText(text)
  }

  canvas.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
  })
  canvas.addEventListener('drop', (e) => {
    const file = [...(e.dataTransfer?.files ?? [])][0]
    if (!file) return
    e.preventDefault()
    if (file.type.startsWith('image/')) {
      const p = graph.getPointForEvent(e as unknown as MouseEvent, false)
      insertImage(file, p.x, p.y)
    } else options.openFile?.(file)
  })

  // ---------- Panels ----------

  const sidebar = new ShapeSidebar(graph, PALETTE, insertCells, insertAtCenter, { more: () => void moreShapes(), prepare: prepareItems })
  const moreShapes = async () => {
    const ids = await chooseLibraries()
    if (ids) sidebar.setExtraLibraries(await loadEnabledLibraries(ids))
  }
  if (!readOnly) void loadEnabledLibraries().then((libs) => libs.length && sidebar.setExtraLibraries(libs))
  const format = new FormatPanel(graph, {
    toFront,
    toBack,
    group,
    ungroup,
    align,
    distribute,
    editStyle: () => void editStyle(),
    isGridVisible: () => gridVisible,
    setGridVisible,
    pageName: () => sync.pageList().find((p) => p.id === sync.page)?.name ?? '',
    renamePage: (name) => sync.renamePage(sync.page, name),
    emptySection: options.formatEmpty,
    diagramOptions: options.diagramOptions,
  })
  const narrow = window.matchMedia('(max-width: 800px)').matches
  sidebar.element.hidden = narrow || readOnly
  format.element.hidden = narrow || readOnly
  const togglePanel = (panel: HTMLElement) => {
    if (readOnly) return
    panel.hidden = !panel.hidden
    updateToolbar()
  }

  // ---------- Menus ----------

  const one = () => graph.getSelectionCount() === 1
  const many = (n: number) => () => vertices().length >= n
  const editMenu = (): MenuEntry[] => [
    { label: t('Undo'), shortcut: mod('Z'), run: undo, enabled: editable(() => undoManager.canUndo()) },
    { label: t('Redo'), shortcut: mod('Y'), run: redo, enabled: editable(() => undoManager.canRedo()) },
    '-',
    { label: t('Cut'), shortcut: mod('X'), run: () => menuCopy(true), enabled: editable(hasSelection) },
    { label: t('Copy'), shortcut: mod('C'), run: () => menuCopy(false), enabled: hasSelection },
    { label: t('Paste'), shortcut: mod('V'), run: () => void menuPaste(), enabled: editable() },
    { label: t('Duplicate'), shortcut: mod('D'), run: duplicate, enabled: editable(hasSelection) },
    { label: t('Delete'), shortcut: t('Del'), run: remove, enabled: editable(hasSelection) },
    '-',
    { label: t('Select all'), shortcut: mod('A'), run: selectAll, enabled: editable() },
    { label: t('Select shapes'), run: selectVertices, enabled: editable() },
    { label: t('Select connectors'), run: selectEdges, enabled: editable() },
    { label: t('Select none'), shortcut: 'Esc', run: () => graph.clearSelection() },
    '-',
    { label: t('Find…'), shortcut: mod('F'), run: find },
    '-',
    { label: t('Edit label'), shortcut: 'F2', run: editLabel, enabled: editable(one) },
    { label: t('Edit style…'), run: () => void editStyle(), enabled: editable(hasSelection) },
  ]
  const panelMenu = (shapesLabel = t('Shapes')): MenuEntry[] => [
    { label: shapesLabel, run: () => togglePanel(sidebar.element), active: () => !sidebar.element.hidden, enabled: editable() },
    { label: t('Format'), run: () => togglePanel(format.element), active: () => !format.element.hidden, enabled: editable() },
    { label: t('More shapes…'), run: () => void moreShapes(), enabled: editable() },
    { label: t('Grid'), run: () => setGridVisible(!gridVisible), active: () => gridVisible },
  ]
  const zoomMenu = (): MenuEntry[] => [
    { label: t('Zoom in'), shortcut: mod('+'), run: () => zoomStep(1) },
    { label: t('Zoom out'), shortcut: mod('-'), run: () => zoomStep(-1) },
    { label: t('Actual size'), shortcut: mod('0'), run: actualSize },
    { label: t('Fit'), shortcut: `${mod('Shift+H')}`, run: fit },
  ]
  const arrangeMenu = (layouts = true): MenuEntry[] => [
    { label: t('To front'), shortcut: mod('Shift+F'), run: toFront, enabled: editable(hasSelection) },
    { label: t('To back'), shortcut: mod('Shift+B'), run: toBack, enabled: editable(hasSelection) },
    '-',
    { label: t('Group'), shortcut: mod('G'), run: group, enabled: editable(() => graph.getSelectionCount() > 1) },
    { label: t('Ungroup'), shortcut: mod('Shift+U'), run: ungroup, enabled: editable(hasSelection) },
    '-',
    {
      label: t('Align'),
      submenu: [
        { label: t('Left'), run: () => align('left'), enabled: many(2) },
        { label: t('Center'), run: () => align('center'), enabled: many(2) },
        { label: t('Right'), run: () => align('right'), enabled: many(2) },
        '-',
        { label: t('Top'), run: () => align('top'), enabled: many(2) },
        { label: t('Middle'), run: () => align('middle'), enabled: many(2) },
        { label: t('Bottom'), run: () => align('bottom'), enabled: many(2) },
      ],
    },
    {
      label: t('Distribute'),
      submenu: [
        { label: t('Horizontally'), run: () => distribute(true), enabled: many(3) },
        { label: t('Vertically'), run: () => distribute(false), enabled: many(3) },
      ],
    },
    ...(layouts
      ? [
          {
            label: t('Layout'),
            enabled: editable(),
            submenu: [
              { label: t('Vertical tree'), run: () => layout(treeLayout(false)) },
              { label: t('Horizontal tree'), run: () => layout(treeLayout(true)) },
              { label: t('Hierarchical (top to bottom)'), run: () => layout(() => new HierarchicalLayout(graph, 'north')) },
              { label: t('Hierarchical (left to right)'), run: () => layout(() => new HierarchicalLayout(graph, 'west')) },
              { label: t('Circle'), run: () => layout(() => new CircleLayout(graph)) },
              { label: t('Organic'), run: () => layout(() => new FastOrganicLayout(graph)) },
            ] as MenuEntry[],
          },
        ]
      : []),
    '-',
    { label: t('Rotate 90°'), shortcut: mod('R'), run: rotate, enabled: editable(many(1)) },
    { label: t('Flip horizontally'), run: () => flip('flipH'), enabled: editable(many(1)) },
    { label: t('Flip vertically'), run: () => flip('flipV'), enabled: editable(many(1)) },
  ]

  // ---------- Toolbar ----------

  // The app's toolbar (frame.toolbar.refresh) re-evaluates its buttons on selection, model and panel changes.
  const toolbarListeners: (() => void)[] = []
  const updateToolbar = () => toolbarListeners.forEach((fn) => fn())

  // ---------- Find ----------

  // Label search over every page, the current one first: selects each match and scrolls it into view.
  const labelText = (record: CellRecord) => {
    const value = record.value ?? ''
    // DOMParser documents are inert (no scripts, no image loads).
    const text = /(^|;)html=1/.test(record.style ?? '') ? (new DOMParser().parseFromString(value, 'text/html').body.textContent ?? '') : value
    return text.replace(/\s+/g, ' ').trim()
  }
  const findInput = el('input', { type: 'search', class: 'diagram-find-input', placeholder: t('Find in labels'), spellcheck: false })
  findInput.setAttribute('aria-label', t('Find in labels'))
  const findCount = el('span', { class: 'diagram-find-count', role: 'status' })
  const findButton = (node: typeof X, label: string, run: () => void) => {
    const b = el('button', { type: 'button', class: 'diagram-find-btn', title: label }, icon(node, 16))
    b.setAttribute('aria-label', label)
    b.addEventListener('click', run)
    return b
  }
  const findPanel = el('div', { class: 'diagram-find', role: 'search', hidden: true })
  findPanel.append(
    findInput,
    findCount,
    findButton(ChevronUp, t('Previous match'), () => findStep(-1)),
    findButton(ChevronDown, t('Next match'), () => findStep(1)),
    findButton(X, t('Close'), () => closeFind()),
  )
  document.body.append(findPanel)
  let matches: { page: string; id: string }[] = []
  let matchIndex = -1
  const searchLabels = () => {
    const query = findInput.value.trim().toLocaleLowerCase()
    const pages = sync.pageList().map((p) => p.id)
    const current = Math.max(0, pages.indexOf(sync.page))
    matches = []
    if (query) {
      for (const page of [...pages.slice(current), ...pages.slice(0, current)]) {
        for (const record of sync.pageRecords(page)) if (record.parent && record.value && labelText(record).toLocaleLowerCase().includes(query)) matches.push({ page, id: record.id })
      }
    }
    matchIndex = -1
  }
  const showMatch = () => {
    const match = matches[matchIndex]
    findCount.textContent = !findInput.value.trim() ? '' : matches.length ? t('{n} of {total}', { n: matchIndex + 1, total: matches.length }) : t('No results')
    if (!match) return
    if (match.page !== sync.page) sync.showPage(match.page)
    const cell = model.getCell(match.id)
    if (!cell) return
    graph.setSelectionCell(cell)
    const state = view.getState(cell)
    if (!state) return
    // Centers the match when it is not fully visible.
    const rect = canvas.getBoundingClientRect()
    const z = uiZoom()
    const width = rect.width / z
    const height = rect.height / z
    if (state.x < 0 || state.y < 0 || state.x + state.width > width || state.y + state.height > height) {
      const s = view.scale
      view.setTranslate(view.translate.x + (width / 2 - state.getCenterX()) / s, view.translate.y + (height / 2 - state.getCenterY()) / s)
    }
  }
  const findStep = (dir: 1 | -1) => {
    if (!matches.length) searchLabels()
    if (!matches.length) return showMatch()
    matchIndex = (matchIndex + dir + matches.length) % matches.length
    showMatch()
  }
  const placeFind = () => {
    const rect = canvas.getBoundingClientRect()
    const z = uiZoom()
    findPanel.style.top = `${rect.top / z + 8}px`
    findPanel.style.right = `${Math.max(8, (window.innerWidth - rect.right) / z + 8)}px`
  }
  const closeFind = () => {
    findPanel.hidden = true
    window.removeEventListener('resize', placeFind)
    canvas.focus()
  }
  const find = () => {
    if (graph.isEditing()) graph.stopEditing(false)
    placeFind()
    if (findPanel.hidden) window.addEventListener('resize', placeFind)
    findPanel.hidden = false
    findInput.focus()
    findInput.select()
  }
  findInput.addEventListener('input', () => {
    searchLabels()
    findStep(1)
  })
  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      findStep(e.shiftKey ? -1 : 1)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      closeFind()
    }
  })
  // Edits and page changes make the list stale: it is rebuilt on the next step.
  model.addListener(InternalEvent.CHANGE, () => {
    if (!findPanel.hidden && !sync.applying) matches = []
  })

  // ---------- Keyboard ----------

  canvas.tabIndex = 0
  // Clicking the canvas takes the keyboard from fields outside it (e.g. the format panel).
  canvas.addEventListener('pointerdown', () => {
    const active = document.activeElement as HTMLElement | null
    if (active && !canvas.contains(active) && isTyping(active)) active.blur()
  })
  document.addEventListener('keydown', (e) => {
    if (isTyping(e.target) || graph.isEditing() || document.querySelector('dialog[open]')) return
    if (options.onKey?.(e)) return
    const modKey = e.ctrlKey || e.metaKey
    const key = e.key.toLowerCase()
    let handled = true
    // Ctrl+O/S/P/F, Ctrl+/ and the zoom keys come from the app frame (src/ui/shortcuts.ts).
    if (modKey && key === 'h' && e.shiftKey) fit()
    else if (key === 'escape') graph.clearSelection()
    else if (readOnly) handled = false
    else if (modKey && key === 'z' && !e.shiftKey) undo()
    else if (modKey && (key === 'y' || (key === 'z' && e.shiftKey))) redo()
    else if (modKey && key === 'a') selectAll()
    else if (modKey && key === 'd') duplicate()
    else if (modKey && key === 'g' && !e.shiftKey) group()
    else if (modKey && key === 'u' && e.shiftKey) ungroup()
    else if (modKey && key === 'f' && e.shiftKey) toFront()
    else if (modKey && key === 'b' && e.shiftKey) toBack()
    else if (modKey && key === 'r') rotate()
    else if (modKey) handled = false
    else if (key === 'delete' || key === 'backspace') remove()
    else if (key === 'f2' || key === 'enter') editLabel()
    else if (key.startsWith('arrow') && hasSelection()) {
      const step = e.shiftKey ? graph.gridSize : 1
      const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0
      const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0
      graph.moveCells(graph.getMovableCells(selection()), dx, dy)
    } else handled = false
    if (handled) e.preventDefault()
  })

  // ---------- Context menu ----------

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    if (readOnly) {
      const extra = options.contextItems?.(false) ?? []
      showContextMenu(e.clientX, e.clientY, [...zoomMenu(), ...(extra.length ? ['-' as const, ...extra] : [])])
      return
    }
    const rect = canvas.getBoundingClientRect()
    const cell = graph.getCellAt(e.clientX - rect.left, e.clientY - rect.top)
    if (cell && !graph.isCellSelected(cell)) graph.setSelectionCell(cell)
    if (!cell) graph.clearSelection()
    const items: MenuEntry[] = hasSelection()
      ? [
          { label: t('Cut'), shortcut: mod('X'), run: () => menuCopy(true) },
          { label: t('Copy'), shortcut: mod('C'), run: () => menuCopy(false) },
          { label: t('Paste'), shortcut: mod('V'), run: () => void menuPaste() },
          { label: t('Duplicate'), shortcut: mod('D'), run: duplicate },
          { label: t('Delete'), shortcut: t('Del'), run: remove },
          '-',
          { label: t('Edit label'), shortcut: 'F2', run: editLabel, enabled: one },
          { label: t('Edit style…'), run: () => void editStyle() },
          '-',
          { label: t('To front'), run: toFront },
          { label: t('To back'), run: toBack },
          { label: t('Group'), run: group, enabled: () => graph.getSelectionCount() > 1 },
          { label: t('Ungroup'), run: ungroup },
        ]
      : [
          { label: t('Paste'), shortcut: mod('V'), run: () => void menuPaste() },
          { label: t('Select all'), shortcut: mod('A'), run: selectAll },
          '-',
          { label: t('Fit'), run: fit },
          { label: t('Grid'), run: () => setGridVisible(!gridVisible), active: () => gridVisible },
        ]
    const extraItems = options.contextItems?.(hasSelection()) ?? []
    showContextMenu(e.clientX, e.clientY, extraItems.length ? [...items, '-', ...extraItems] : items)
  })

  // Insert ▸ Text: a text box in the middle of the view, ready to type.
  const insertText = () => {
    if (readOnly) return
    const [w, h] = options.textStyle ? textSize : [60, 30]
    const cell = new Cell(t('Text'), new Geometry(0, 0, w, h), styleFromString(options.textStyle ?? TEXT_STYLE))
    cell.setVertex(true)
    insertAtCenter([cell])
    // The inserted cell is a copy; it is the selection now.
    const inserted = graph.getSelectionCell()
    if (inserted) graph.startEditingAtCell(inserted)
  }

  // Double click on an empty spot adds a text box there.
  graph.addListener(InternalEvent.DOUBLE_CLICK, (_sender: unknown, evt: EventObject) => {
    if (evt.getProperty('cell') || readOnly) return
    const me = evt.getProperty('event') as MouseEvent
    const p = graph.getPointForEvent(me, false)
    const [w, h] = options.textStyle ? textSize : [60, 30]
    const cell = new Cell(t('Text'), new Geometry(graph.snap(p.x - w / 2), graph.snap(p.y - h / 2), w, h), styleFromString(options.textStyle ?? TEXT_STYLE))
    cell.setVertex(true)
    inBatch(() => graph.addCell(cell, graph.getDefaultParent()))
    graph.setSelectionCell(cell)
    graph.startEditingAtCell(cell)
    evt.consume()
  })

  // ---------- Status and wiring ----------

  const statusListeners: (() => void)[] = []
  const updateStatus = () => {
    const n = graph.getSelectionCount()
    selectionLabel.textContent = n ? tn(n, '{n} object selected', '{n} objects selected') : ''
    updateToolbar()
    statusListeners.forEach((fn) => fn())
  }
  graph.getSelectionModel().addListener(InternalEvent.CHANGE, updateStatus)
  model.addListener(InternalEvent.CHANGE, updateStatus)
  undoManager.addListener(InternalEvent.CHANGE, updateStatus)
  undoManager.addListener(InternalEvent.ADD, updateStatus)

  let presence: DiagramPresence | undefined
  let fitted = false
  // Starts sync and presence once the app has placed the canvas in the page.
  const start = (initialView?: () => void) => {
    sync.onPagesChange = () => options.onPagesChange?.()
    sync.onPageShown = () => {
      undoManager.clear()
      presence?.pageChanged()
      format.render()
      if (fitted) fit()
      options.onPageShown?.()
    }
    sync.start()
    presence = new DiagramPresence(graph, session.awareness, session.doc.clientID)
    session.awareness.on('change', () => options.onPagesChange?.())
    requestAnimationFrame(() => {
      if (initialView) initialView()
      else fit()
      fitted = true
      updateGrid()
      updateStatus()
    })
    updateGrid()
    updateStatus()
    // Handles for automated browser tests in development builds only.
    if (import.meta.env.DEV) Object.assign(window, { diagramGraph: graph, diagramSync: sync, diagramUndo: undoManager })
  }

  return {
    graph,
    model,
    view,
    sync,
    readOnly,
    undoManager,
    sidebar,
    format,
    zoomTarget,
    selectionLabel,
    presence: () => presence,
    start,
    undo,
    redo,
    zoomAt,
    zoomStep,
    fit,
    fitArea,
    actualSize,
    isGridVisible: () => gridVisible,
    setGridVisible,
    inBatch,
    insertCells,
    insertAtCenter,
    insertImage,
    pasteText,
    menuCopy,
    menuPaste,
    remove,
    duplicate,
    toFront,
    toBack,
    selection,
    hasSelection,
    vertices,
    setFill,
    setStroke,
    hasFontStyle,
    toggleFontStyle,
    insertText,
    editLabel,
    editStyle: () => void editStyle(),
    moreShapes: () => void moreShapes(),
    togglePanel,
    editMenu,
    panelMenu,
    zoomMenu,
    arrangeMenu,
    find,
    updateToolbar,
    onToolbar: (fn: () => void) => toolbarListeners.push(fn),
    onZoom: (fn: () => void) => zoomListeners.push(fn),
    updateStatus,
    onStatus: (fn: () => void) => statusListeners.push(fn),
    editable,
  }
}

// The editor's section of the shortcuts dialog (the frame adds the common keys:
// undo, clipboard, select all, find, zoom, file and help). Keys use "Ctrl+".
export function shortcutSections(title: string, extra: [string, string][] = []): ShortcutSection[] {
  return [
    {
      title,
      rows: [
        [t('Duplicate'), 'Ctrl+D'],
        [t('Delete'), 'Del'],
        [t('Edit label'), t('F2 / Enter / double click')],
        [t('Add text'), t('Double click on the canvas')],
        [t('Move'), t('Arrow keys (Shift: grid step)')],
        [t('Group / ungroup'), 'Ctrl+G / Ctrl+Shift+U'],
        [t('To front / to back'), 'Ctrl+Shift+F / Ctrl+Shift+B'],
        [t('Rotate 90°'), 'Ctrl+R'],
        [t('Zoom'), 'Ctrl+Wheel'],
        [t('Fit'), 'Ctrl+Shift+H'],
        [t('Pan'), t('Wheel, Space + drag or middle button')],
        [t('Connect'), t('Drag from the blue points of a shape')],
        [t('Straight lines while dragging'), 'Shift'],
        ...extra,
      ],
    },
  ]
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}
