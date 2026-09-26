// Presentations app: slides built on the diagram editor (maxGraph, draw.io
// shapes, Yjs pages/cells sync, presence, shape and format panels) inside the
// shared app frame (src/ui/frame.ts: menu bar, keys, toolbar with a pinned
// "Present" button, status bar with save state and zoom). Each slide
// is a diagram page with a fixed frame at (0, 0) of the slide size; what lies
// outside the frame stays in the document but is not presented or exported.

import { Cell, Geometry, InternalEvent, type EventObject } from '@maxgraph/core'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AArrowDown,
  AArrowUp,
  Baseline,
  Bold,
  ImagePlus,
  Italic,
  PaintBucket,
  List,
  ListOrdered,
  MessageSquarePlus,
  Sparkles,
  PanelRight,
  Play,
  Plus,
  Redo2,
  Shapes,
  Sigma,
  Table,
  Type,
  Underline,
  Undo2,
} from 'lucide'
import { appInfo } from '../registry'
import type { Session } from '../../core/session'
import { t } from '../../core/i18n'
import { setupChrome } from '../../ui/chrome'
import { mountFrame } from '../../ui/frame'
import { provideWebMcpTools } from '../../core/webmcp'
import { renderShell } from '../../ui/shell'
import { mod } from '../../ui/shortcuts'
import { colorPalette, confirmDialog, el, icon, openPopover, showContextMenu, tableGrid, toast, type Menu, type MenuEntry } from '../../ui/widgets'
import { createDiagramEditor, shortcutSections } from '../diagram/editor'
import { svgToPng } from '../diagram/export'
import { setStyleKey, styleFromString } from '../diagram/graph'
import { cellsKey } from '../diagram/sync'
import {
  LAYOUTS,
  META_RATIO,
  META_THEME,
  TEXT_BOX_STYLE,
  THEMES,
  backgroundCss,
  blankSlide,
  layoutName,
  layoutPlaceholders,
  notesText,
  parseBackground,
  placeholderStyle,
  presentationSize,
  presentationTheme,
  readSlideMeta,
  slideCells,
  slideMetaMap,
  writeSlideMeta,
  type LayoutId,
  type PresentationData,
  type Ratio,
  type Role,
} from './model'
import { NotesEditor } from './notes'
import { Presentation, presenters } from './present'
import { SlideRenderer, editingCell, installTheme, svgDataUrl } from './render'
import { SlideList } from './slidelist'
import { TRANSITION_NAMES, animationsMap, copyAnimations, readAnimations, timeline, type TransitionType } from './animations'
import { AnimationPane } from './animpane'
import { CommentsPane } from './comments'
import type { PlayableSlide } from './player'

export const SLIDES_ACCEPT = '.pptx,.ppt'
const THUMB_WIDTH = 176

type Style = Record<string, unknown>

export function mountSlides(session: Session, root: HTMLElement): void {
  const info = appInfo('slides')
  const shell = renderShell(info, root)
  setupChrome(session, info.untitled)
  // Links with view or comment access open the presentation read-only (presenting and following still work).
  const readOnly = !session.canEdit
  const doc = session.doc
  const meta = doc.getMap<unknown>('meta')
  let theme = presentationTheme(doc)
  let size = presentationSize(doc)
  const title = () => String(meta.get('title') || info.untitled).replace(/[\\/:*?"<>|]+/g, '_')

  const canvas = el('div', { class: 'diagram-canvas slides-canvas' })
  const slideFrame = el('div', { class: 'slide-frame' })
  const printArea = el('div', { class: 'slides-print' })
  const fileInput = el('input', { type: 'file', accept: SLIDES_ACCEPT, hidden: true })
  const imageInput = el('input', { type: 'file', accept: 'image/*', hidden: true })
  document.body.append(printArea, fileInput, imageInput)

  const openFile = async (file: File) => {
    try {
      toast(t('Opening…'))
      const { importFile } = await import('./index')
      location.href = await importFile(file)
    } catch (err) {
      toast(t('Could not open the file: {error}', { error: (err as Error).message }))
    }
  }

  // The format panel renders once before the slide options below exist.
  let ready = false
  const editor = createDiagramEditor(session, {
    canvas,
    readOnly,
    gridKey: 'slides-grid',
    gridDefault: false,
    fitBounds: () => ({ x: 0, y: 0, width: size.width, height: size.height }),
    textStyle: TEXT_BOX_STYLE,
    textSize: [320, 60],
    formatEmpty: () => (ready ? slideSection() : el('div')),
    openFile: (file) => void openFile(file),
    onKey: (e) => onKey(e),
    contextItems: (selected) => (selected ? objectContextItems() : slideContextItems()),
    onPagesChange: () => refreshList(),
    onPageShown: () => pageShown(),
    blankPage: blankSlide,
  })
  const { graph, sync, view } = editor
  const editable = editor.editable
  installTheme(graph, () => theme, !readOnly)
  // Groups and tables scale their content when resized.
  graph.setRecursiveResize(true)
  canvas.prepend(slideFrame)
  const renderer = new SlideRenderer(() => theme)

  // ---------- Slide frame ----------

  const slideBackground = (id = sync.page) => parseBackground(readSlideMeta(doc, id).background, theme)
  const updateFrame = () => {
    const s = view.scale
    const tr = view.translate
    slideFrame.style.left = `${tr.x * s}px`
    slideFrame.style.top = `${tr.y * s}px`
    slideFrame.style.width = `${size.width * s}px`
    slideFrame.style.height = `${size.height * s}px`
    slideFrame.style.background = backgroundCss(slideBackground())
  }
  for (const event of [InternalEvent.SCALE, InternalEvent.TRANSLATE, InternalEvent.SCALE_AND_TRANSLATE]) view.addListener(event, updateFrame)

  // ---------- Slides ----------

  const slides = () => sync.pageList()
  const slideIndex = () => Math.max(0, slides().findIndex((p) => p.id === sync.page))
  const showSlide = (id: string) => id !== sync.page && sync.showPage(id)
  const go = (delta: number) => {
    const list = slides()
    const next = list[slideIndex() + delta]
    if (next) showSlide(next.id)
  }

  const addSlide = (layout: LayoutId = 'titleContent', after = sync.page) => {
    if (readOnly) return
    const id = sync.addPage(t('Slide {n}', { n: slides().length + 1 }), slideCells(layout, size.width, size.height))
    placeAfter(id, after)
    writeSlideMeta(doc, id, { layout })
    sync.showPage(id)
  }
  const placeAfter = (id: string, after: string) => {
    const list = slides().filter((p) => p.id !== id)
    const index = list.findIndex((p) => p.id === after)
    if (index >= 0) sync.movePage(id, list[index + 1]?.id ?? null)
  }
  const duplicateSlide = (source = sync.page) => {
    if (readOnly) return
    const page = slides().find((p) => p.id === source)
    if (!page) return
    const id = sync.addPage(`${page.name} (${t('copy')})`, sync.pageRecords(source))
    placeAfter(id, source)
    const m = readSlideMeta(doc, source)
    writeSlideMeta(doc, id, { layout: m.layout ?? null, background: m.background ?? null, transition: m.transition ?? null, transitionDuration: m.transitionDuration ?? null })
    copyAnimations(doc, source, id)
    const notes = notesText(doc, source).toString()
    if (notes) notesText(doc, id).insert(0, notes)
    sync.showPage(id)
  }
  const hasContent = (id: string) => sync.pageRecords(id).some((r) => r.parent && r.value)
  const deleteSlide = async (id = sync.page) => {
    if (readOnly || slides().length <= 1) return
    if (hasContent(id) && !(await confirmDialog(t('Delete slide'), t('Delete this slide for everyone?'), { confirmLabel: t('Delete'), danger: true }))) return
    sync.deletePage(id)
  }
  const moveSlide = (dir: -1 | 1) => {
    const list = slides()
    const index = slideIndex()
    if (dir < 0 && index > 0) sync.movePage(sync.page, list[index - 1].id)
    if (dir > 0 && index < list.length - 1) sync.movePage(sync.page, list[index + 2]?.id ?? null)
  }

  // Applies a layout to the current slide: placeholders move to the layout's
  // boxes, missing ones are added and empty ones the layout lacks are removed.
  const applyLayout = (layout: LayoutId) => {
    if (readOnly) return
    const model = graph.getDataModel()
    const parent = graph.getDefaultParent()
    const boxes = layoutPlaceholders(layout, size.width, size.height)
    const existing = new Map<Role, Cell>()
    for (const cell of graph.getChildVertices(parent)) {
      const role = (cell.getStyle() as Style | null)?.slidePh as Role | undefined
      if (role && !existing.has(role)) existing.set(role, cell)
    }
    editor.inBatch(() => {
      for (const box of boxes) {
        const cell = existing.get(box.role)
        const geo = new Geometry(Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height))
        if (cell) {
          model.setGeometry(cell, geo)
          existing.delete(box.role)
        } else {
          const c = new Cell('', geo, styleFromString(placeholderStyle(box)))
          c.setVertex(true)
          graph.addCell(c, parent)
        }
      }
      for (const cell of existing.values()) if (!cell.getValue()) model.remove(cell)
    })
    writeSlideMeta(doc, sync.page, { layout })
  }

  const setBackground = (color: string | null) => {
    if (readOnly) return
    sync.materialize()
    writeSlideMeta(doc, sync.page, { background: color })
  }
  const setTheme = (id: string) => !readOnly && meta.set(META_THEME, id)
  const setRatio = (ratio: Ratio) => !readOnly && meta.set(META_RATIO, ratio)

  // ---------- Text formatting ----------

  // While a label is being edited, commands apply to the selected text; otherwise to the selected boxes.
  const editingText = () => graph.isEditing()
  const textCells = () => (graph.isEditing() ? [editingCell(graph)!].filter(Boolean) : editor.selection().filter((c) => c.isVertex()))
  const exec = (command: string, value?: string) => {
    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand(command, false, value)
  }
  const toggleFontBit = (bit: number, command: string) => {
    if (editingText()) return exec(command)
    const cells = textCells()
    if (!cells.length) return
    const current = Number((graph.getCellStyle(cells[0]) as Style).fontStyle ?? 0)
    setStyleKey(graph, cells, 'fontStyle', current & bit ? current & ~bit || null : current | bit)
  }
  const fontSizeStep = (dir: 1 | -1) => {
    const cells = textCells()
    if (!cells.length) return
    const current = Number((graph.getCellStyle(cells[0]) as Style).fontSize ?? 12)
    const steps = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 72, 88, 96, 120]
    const next = dir > 0 ? (steps.find((s) => s > current) ?? current + 12) : ([...steps].reverse().find((s) => s < current) ?? Math.max(4, current - 2))
    setStyleKey(graph, cells, 'fontSize', next)
  }
  const setTextColor = (color: string | null) => {
    if (editingText()) return exec('foreColor', color ?? theme.bodyColor)
    setStyleKey(graph, textCells(), 'fontColor', color)
  }
  const setAlign = (align: 'left' | 'center' | 'right') => setStyleKey(graph, textCells(), 'align', align)
  const toggleList = (ordered: boolean) => {
    if (editingText()) return exec(ordered ? 'insertOrderedList' : 'insertUnorderedList')
    const cells = textCells()
    if (!cells.length) return
    const tag = ordered ? 'ol' : 'ul'
    editor.inBatch(() => {
      for (const cell of cells) {
        const value = String(cell.getValue() ?? '')
        const list = new RegExp(`^\\s*<${tag}[^>]*>`, 'i').test(value)
        const html = list ? listToLines(value) : linesToList(value, tag)
        graph.getDataModel().setValue(cell, html)
        if ((cell.getStyle() as Style).html !== 1) setStyleKey(graph, [cell], 'html', 1)
      }
    })
  }

  // ---------- Insert ----------

  const insertTextBox = () => {
    if (readOnly) return
    const cell = new Cell(t('Text'), new Geometry(0, 0, 320, 60), styleFromString(TEXT_BOX_STYLE))
    cell.setVertex(true)
    editor.insertAtCenter([cell])
    graph.startEditingAtCell(cell)
    document.execCommand('selectAll')
  }
  const insertTable = (rows: number, cols: number) => {
    if (readOnly) return
    const cw = Math.min(160, Math.floor((size.width - 96) / cols))
    const rh = 40
    const table = new Cell('', new Geometry(0, 0, cw * cols, rh * rows), styleFromString('group;slideTable=1;container=1;collapsible=0;'))
    table.setVertex(true)
    table.setConnectable(false)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const header = r === 0
        const style =
          `rounded=0;whiteSpace=wrap;html=1;overflow=hidden;fontSize=16;align=center;verticalAlign=middle;slideCell=1;strokeColor=#9aa0a6;` +
          (header ? `fillColor=${theme.accent};fontColor=#ffffff;fontStyle=1;` : `fillColor=#ffffff;fontColor=#202124;`)
        const cell = new Cell('', new Geometry(c * cw, r * rh, cw, rh), styleFromString(style))
        cell.setVertex(true)
        cell.setConnectable(false)
        table.insert(cell)
      }
    }
    editor.insertAtCenter([table])
  }
  const insertEquation = async (cell?: Cell) => {
    if (readOnly) return
    const { editEquation, latexToMathML, measureEquation } = await import('../../ui/equation')
    const data = cell ? parseData(cell) : {}
    const value = await editEquation({ latex: String(data.latex ?? ''), display: true, displayChoice: false })
    if (!value?.latex) return
    const fontSize = cell ? Number((graph.getCellStyle(cell) as Style).fontSize ?? 28) : 28
    const box = measureEquation(value.latex, true, fontSize * 0.75)
    const html = latexToMathML(value.latex, true)
    const w = Math.ceil(box.width + 24)
    const h = Math.ceil(box.height + 16)
    if (cell) {
      editor.inBatch(() => {
        graph.getDataModel().setValue(cell, html)
        ;(cell as Cell & { woData?: string }).woData = JSON.stringify({ ...data, latex: value.latex })
        const geo = cell.getGeometry()!.clone()
        geo.width = w
        geo.height = h
        graph.getDataModel().setGeometry(cell, geo)
      })
    } else {
      const c = new Cell(html, new Geometry(0, 0, w, h), styleFromString(`text;html=1;slideEq=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;fontSize=${fontSize};`))
      c.setVertex(true)
      ;(c as Cell & { woData?: string }).woData = JSON.stringify({ latex: value.latex })
      editor.insertAtCenter([c])
    }
  }
  const isEquation = (cell: Cell | null) => !!cell && String((cell.getStyle() as Style | null)?.slideEq ?? '') === '1'
  const isCellEditable = graph.isCellEditable.bind(graph)
  graph.isCellEditable = (cell: Cell) => !isEquation(cell) && isCellEditable(cell)
  graph.addListener(InternalEvent.DOUBLE_CLICK, (_sender: unknown, evt: EventObject) => {
    const cell = evt.getProperty('cell') as Cell | null
    if (isEquation(cell)) {
      evt.consume()
      void insertEquation(cell!)
    }
  })
  imageInput.addEventListener('change', () => {
    const file = imageInput.files?.[0]
    imageInput.value = ''
    if (file) editor.insertImage(file, size.width / 2, size.height / 2, 480)
  })

  // ---------- Panels ----------

  const list = new SlideList(
    {
      show: showSlide,
      move: (id, before) => sync.movePage(id, before),
      menu: (_id, x, y) => showContextMenu(x, y, slideMenu()),
      remove: (id) => void deleteSlide(id),
      duplicate: (id) => duplicateSlide(id),
    },
    readOnly,
  )
  const notes = new NotesEditor(readOnly, () => sync.materialize())

  // Animation and comment panes (right side).
  const relayout = () => requestAnimationFrame(() => editor.fit())
  const animPane = new AnimationPane({
    doc,
    graph,
    canvas,
    readOnly,
    page: () => sync.page,
    materialize: () => sync.materialize(),
    preview: () => present(true),
    onToggle: relayout,
  })
  const commentsPane = new CommentsPane({
    session,
    graph,
    canvas,
    page: () => sync.page,
    slides: () => slides(),
    showSlide: (id) => showSlide(id),
    onToggle: relayout,
    onCounts: (counts) => {
      list.setComments(counts)
      refreshList()
    },
  })
  const toggleAnimations = () => {
    if (!animPane.visible) commentsPane.toggle(false)
    animPane.toggle()
  }
  const toggleComments = () => {
    if (!commentsPane.visible) animPane.toggle(false)
    commentsPane.toggle()
  }
  const addComment = () => {
    animPane.toggle(false)
    commentsPane.startComment()
  }
  const leftTabs = el('div', { class: 'slides-left-tabs', role: 'tablist' })
  const left = el('aside', { class: 'slides-left' }, leftTabs, list.element, editor.sidebar.element)
  const tabButton = (label: string, panel: 'slides' | 'shapes') => {
    const b = el('button', { type: 'button', class: 'slides-left-tab', textContent: label, role: 'tab' })
    b.addEventListener('click', () => showLeft(panel))
    leftTabs.append(b)
    return b
  }
  const slidesTab = tabButton(t('Slides'), 'slides')
  const shapesTab = readOnly ? null : tabButton(t('Shapes'), 'shapes')
  const showLeft = (panel: 'slides' | 'shapes') => {
    left.hidden = false
    list.element.hidden = panel !== 'slides'
    editor.sidebar.element.hidden = panel !== 'shapes'
    slidesTab.classList.toggle('active', panel === 'slides')
    shapesTab?.classList.toggle('active', panel === 'shapes')
    editor.updateToolbar()
  }
  showLeft('slides')
  const toggleNotes = () => {
    notes.element.hidden = !notes.element.hidden
    requestAnimationFrame(() => editor.fit())
  }
  const toggleLeft = () => {
    left.hidden = !left.hidden
    requestAnimationFrame(() => editor.fit())
  }

  // ---------- Thumbnails ----------

  const thumbKeys = new Map<string, string>()
  const dirty = new Set<string>()
  const observed = new Set<string>()
  let thumbTimer = 0
  const markDirty = (id?: string) => {
    if (id) dirty.add(id)
    else slides().forEach((p) => dirty.add(p.id))
    clearTimeout(thumbTimer)
    thumbTimer = window.setTimeout(drawThumbs, 250)
  }
  const drawThumbs = () => {
    const ids = slides().map((p) => p.id)
    const pending = ids.filter((id) => dirty.has(id) || !thumbKeys.has(id))
    dirty.clear()
    let i = 0
    const step = () => {
      const end = Math.min(i + 4, pending.length)
      for (; i < end; i++) {
        const id = pending[i]
        const cells = sync.pageRecords(id)
        const waiting = renderer.prepare(cells)
        if (waiting) void waiting.then(() => markDirty(id))
        const svg = renderer.render({ cells, background: slideBackground(id) }, size.width, size.height, THUMB_WIDTH / size.width)
        list.setThumb(id, svgDataUrl(svg))
        thumbKeys.set(id, '1')
      }
      if (i < pending.length) requestAnimationFrame(step)
    }
    step()
  }
  const observePages = () => {
    for (const page of slides()) {
      if (observed.has(page.id)) continue
      observed.add(page.id)
      doc.getMap(cellsKey(page.id)).observeDeep(() => {
        markDirty(page.id)
        presentation.refresh()
      })
      animationsMap(doc, page.id).observeDeep(() => presentation.refresh())
    }
  }
  slideMetaMap(doc).observeDeep((events) => {
    for (const e of events) {
      const keys = e.path.length ? [String(e.path[0])] : [...(e as unknown as { keysChanged: Set<string> }).keysChanged]
      keys.forEach((k) => markDirty(k))
    }
    updateFrame()
    editor.format.render()
    animPane.schedule()
    presentation.refresh()
  })
  meta.observe((e) => {
    if (!e.keysChanged.has(META_THEME) && !e.keysChanged.has(META_RATIO)) return
    theme = presentationTheme(doc)
    size = presentationSize(doc)
    list.setAspect(size.width, size.height)
    graph.refresh()
    updateFrame()
    editor.fit()
    editor.format.render()
    markDirty()
    presentation.refresh()
  })

  // ---------- Status, list and page changes ----------

  let lastContext = { x: 0, y: 0 }
  const slideLabel = el('span', { class: 'slides-count' })
  const refreshList = () => {
    observePages()
    const peers = editor.presence()?.pagesOfPeers() ?? new Map()
    list.update(slides(), sync.page, peers)
    slideLabel.textContent = t('Slide {n} of {total}', { n: slideIndex() + 1, total: slides().length })
    markDirtyMissing()
    updateFollow()
  }
  const markDirtyMissing = () => {
    if (slides().some((p) => !thumbKeys.has(p.id))) markDirty()
  }
  const pageShown = () => {
    animPane.pageShown()
    commentsPane.pageShown()
    notes.bind(notesText(doc, sync.page))
    updateFrame()
    refreshList()
  }

  // ---------- Presenting ----------

  // A slide as layers with its animations and transition, for presenting.
  const playable = (id: string): PlayableSlide => {
    const cells = sync.pageRecords(id)
    const rootId = cells.find((c) => !c.parent)?.id
    const layers = new Set(cells.filter((c) => c.parent === rootId).map((c) => c.id))
    const top = new Set(cells.filter((c) => c.parent && layers.has(c.parent)).map((c) => c.id))
    const tl = timeline(readAnimations(doc, id), top)
    const animated = new Set(tl.steps.flatMap((st) => st.effects.map((e) => e.anim.cell)))
    const m = readSlideMeta(doc, id)
    const type = (m.transition && m.transition in TRANSITION_NAMES ? m.transition : 'none') as TransitionType
    return {
      id,
      width: size.width,
      height: size.height,
      layers: renderer.renderLayers({ cells, background: slideBackground(id) }, animated, size.width, size.height),
      timeline: tl,
      transition: { type, duration: Number(m.transitionDuration) || 500 },
    }
  }
  const presentation = new Presentation({
    slides: () => slides(),
    render: (id) => renderer.render({ cells: sync.pageRecords(id), background: slideBackground(id) }, size.width, size.height),
    playable,
    notes: (id) => notesText(doc, id).toString(),
    size: () => size,
    awareness: session.awareness,
    clientId: doc.clientID,
    onEnd: (id) => showSlide(id),
  })
  const present = (fromCurrent: boolean, presenterView = false) => {
    graph.stopEditing(false)
    presentation.start(fromCurrent ? slideIndex() : 0, presenterView)
  }
  const followBtn = el('button', { type: 'button', class: 'slides-follow', hidden: true })
  const followPresenter = () => {
    const [first] = presenters(session.awareness, doc.clientID)
    if (!first) return toast(t('Nobody is presenting right now'))
    presentation.follow(first.clientId)
  }
  followBtn.addEventListener('click', followPresenter)
  let knownPresenters = new Set<number>()
  const updateFollow = () => {
    const list = presenters(session.awareness, doc.clientID)
    followBtn.hidden = !list.length || presentation.isFollowing
    if (list.length) followBtn.textContent = `▶ ${t('Follow {name}', { name: list[0].name })}`
    const now = new Set(list.map((p) => p.clientId))
    for (const p of list) if (!knownPresenters.has(p.clientId) && !presentation.active) toast(t('{name} is presenting: click “Follow” to watch', { name: p.name }))
    knownPresenters = now
  }

  // ---------- Exports ----------

  const presentationData = (): PresentationData => ({
    width: size.width,
    height: size.height,
    ratio: size.ratio,
    theme,
    slides: slides().map((p) => {
      const m = readSlideMeta(doc, p.id)
      return {
        id: p.id,
        name: p.name,
        cells: sync.pageRecords(p.id),
        notes: notesText(doc, p.id).toString(),
        background: m.background,
        layout: m.layout,
        animations: readAnimations(doc, p.id),
        transition: m.transition,
        transitionDuration: Number(m.transitionDuration) || undefined,
      }
    }),
  })
  const download = (blob: Blob, name: string) => {
    const a = el('a', { href: URL.createObjectURL(blob), download: name })
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const renderSlide = (id: string, scale = 1) => renderer.render({ cells: sync.pageRecords(id), background: slideBackground(id) }, size.width, size.height, scale)
  const printPdf = async () => {
    graph.stopEditing(false)
    const style = el('style', { textContent: `@page { size: ${size.width}px ${size.height}px; margin: 0; }` })
    document.head.append(style)
    printArea.replaceChildren(
      ...slides().map((p) => {
        const svg = renderSlide(p.id)
        svg.setAttribute('width', `${size.width}px`)
        svg.setAttribute('height', `${size.height}px`)
        return el('div', { class: 'slides-print-page' }, svg)
      }),
    )
    printArea.style.setProperty('--w', `${size.width}px`)
    printArea.style.setProperty('--h', `${size.height}px`)
    await document.fonts.ready
    window.print()
    printArea.replaceChildren()
    style.remove()
  }
  const downloadPng = async (all: boolean) => {
    try {
      if (!all) {
        download(await svgToPng(renderSlide(sync.page), 2), `${title()} - ${slideIndex() + 1}.png`)
        return
      }
      toast(t('Preparing images…'))
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      let n = 0
      for (const p of slides()) zip.file(`${title()} - ${String(++n).padStart(2, '0')}.png`, await svgToPng(renderSlide(p.id), 2))
      download(await zip.generateAsync({ type: 'blob' }), `${title()}.zip`)
    } catch (err) {
      toast(t('PNG export failed: {error}', { error: (err as Error).message }))
    }
  }
  const downloadPptx = async () => {
    try {
      toast(t('Preparing the presentation…'))
      const { exportPptx } = await import('./formats/pptx')
      download(await exportPptx(presentationData(), renderer), `${title()}.pptx`)
    } catch (err) {
      console.error(err)
      toast(t('Export failed: {error}', { error: (err as Error).message }))
    }
  }
  const downloadOdp = async () => {
    try {
      toast(t('Preparing the presentation…'))
      const { exportOdp } = await import('./formats/odp')
      download(await exportOdp(presentationData(), renderer), `${title()}.odp`)
    } catch (err) {
      console.error(err)
      toast(t('Export failed: {error}', { error: (err as Error).message }))
    }
  }
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (file) void openFile(file)
  })
  // "Hand in" → print (also File ▸ Print… and Ctrl+P): one slide per page.
  session.hooks.print = () => void printPdf()
  // File ▸ Download as and "Save to Nextcloud".
  session.hooks.exportFormats = () => [
    { ext: 'pptx', label: t('PowerPoint (.pptx)'), build: async () => (await import('./formats/pptx')).exportPptx(presentationData(), renderer) },
    { ext: 'odp', label: t('OpenDocument presentation (.odp)'), build: async () => (await import('./formats/odp')).exportOdp(presentationData(), renderer) },
  ]

  // ---------- Menus ----------

  const layoutMenu = (): MenuEntry[] =>
    LAYOUTS.map((l) => ({ label: layoutName(l.id), run: () => applyLayout(l.id), active: () => readSlideMeta(doc, sync.page).layout === l.id, enabled: editable() }))
  const newSlideMenu = (): MenuEntry[] => LAYOUTS.map((l) => ({ label: layoutName(l.id), run: () => addSlide(l.id), enabled: editable() }))
  const themeMenu = (): MenuEntry[] => THEMES.map((th) => ({ label: th.name, run: () => setTheme(th.id), active: () => theme.id === th.id, enabled: editable() }))
  const sizeMenu = (): MenuEntry[] => [
    { label: t('Widescreen (16:9)'), run: () => setRatio('16:9'), active: () => size.ratio === '16:9', enabled: editable() },
    { label: t('Standard (4:3)'), run: () => setRatio('4:3'), active: () => size.ratio === '4:3', enabled: editable() },
  ]
  const slideMenu = (): MenuEntry[] => [
    { label: t('New slide'), shortcut: mod('M'), run: () => addSlide(), enabled: editable() },
    { label: t('New slide with layout'), submenu: newSlideMenu(), enabled: editable() },
    { label: t('Duplicate slide'), run: () => duplicateSlide(), enabled: editable() },
    { label: t('Delete slide'), run: () => void deleteSlide(), enabled: editable(() => slides().length > 1) },
    '-',
    { label: t('Move slide up'), run: () => moveSlide(-1), enabled: editable(() => slideIndex() > 0) },
    { label: t('Move slide down'), run: () => moveSlide(1), enabled: editable(() => slideIndex() < slides().length - 1) },
    '-',
    { label: t('Layout'), submenu: layoutMenu(), enabled: editable() },
    { label: t('Background color…'), run: () => chooseBackground(), enabled: editable() },
    { label: t('Reset background'), run: () => setBackground(null), enabled: editable(() => !!readSlideMeta(doc, sync.page).background) },
    '-',
    { label: t('Transition'), submenu: transitionMenu(), enabled: editable() },
    { label: t('Animations…'), run: () => animPane.toggle(true), active: () => animPane.visible },
  ]
  const transitionMenu = (): MenuEntry[] =>
    (Object.entries(TRANSITION_NAMES) as [TransitionType, string][]).map(([id, name]) => ({
      label: name,
      run: () => {
        sync.materialize()
        writeSlideMeta(doc, sync.page, { transition: id === 'none' ? null : id })
      },
      active: () => (readSlideMeta(doc, sync.page).transition ?? 'none') === id,
      enabled: editable(),
    }))
  const objectContextItems = (): MenuEntry[] => [
    { label: t('Add animation…'), run: () => animPane.addMenu(lastContext.x, lastContext.y), enabled: editable() },
    { label: t('Comment'), run: addComment, enabled: () => session.canComment },
  ]
  const slideContextItems = (): MenuEntry[] => [
    { label: t('New slide'), run: () => addSlide(), enabled: editable() },
    { label: t('Layout'), submenu: layoutMenu(), enabled: editable() },
    { label: t('Background color…'), run: () => chooseBackground(), enabled: editable() },
  ]
  const chooseBackground = () => openPopover(bgAnchor(), colorPalette((c) => setBackground(c), t('Theme background')))
  const bgAnchor = () => shell.toolbar.querySelector<HTMLElement>('.slides-bg-button:not(.tb-overflowed *)') ?? shell.toolbar

  const viewMenu: Menu = {
    label: t('View'),
    items: [
      { label: t('Slides panel'), run: toggleLeft, active: () => !left.hidden },
      { label: t('Speaker notes'), run: toggleNotes, active: () => !notes.element.hidden },
      { label: t('Animations'), run: toggleAnimations, active: () => animPane.visible },
      { label: t('Comments'), run: toggleComments, active: () => commentsPane.visible },
      ...editor.panelMenu().filter((item) => item === '-' || item.label !== t('Shapes')),
      '-',
      ...editor.zoomMenu(),
    ],
  }
  const insert: Menu = {
    label: t('Insert'),
    items: [
      { label: t('New slide'), shortcut: mod('M'), run: () => addSlide(), enabled: editable() },
      { label: t('Text box'), run: insertTextBox, enabled: editable() },
      { label: t('Image…'), run: () => imageInput.click(), enabled: editable() },
      { label: t('Table…'), run: () => openPopover(tableAnchor(), tableGrid(insertTable, 8)), enabled: editable() },
      { label: t('Equation…'), run: () => void insertEquation(), enabled: editable() },
      { label: t('Comment'), shortcut: mod('Alt+M'), run: addComment, enabled: () => session.canComment },
      { label: t('Shapes'), run: () => showLeft('shapes'), enabled: editable() },
    ],
  }
  const formatMenu: Menu = {
    label: t('Format'),
    items: [
      { label: t('Bold'), shortcut: mod('B'), run: () => toggleFontBit(1, 'bold'), enabled: editable() },
      { label: t('Italic'), shortcut: mod('I'), run: () => toggleFontBit(2, 'italic'), enabled: editable() },
      { label: t('Underline'), shortcut: mod('U'), run: () => toggleFontBit(4, 'underline'), enabled: editable() },
      { label: t('Bulleted list'), run: () => toggleList(false), enabled: editable() },
      { label: t('Numbered list'), run: () => toggleList(true), enabled: editable() },
      { label: t('Bigger text'), shortcut: mod('Shift+>'), run: () => fontSizeStep(1), enabled: editable() },
      { label: t('Smaller text'), shortcut: mod('Shift+<'), run: () => fontSizeStep(-1), enabled: editable() },
      '-',
      { label: t('Theme'), submenu: themeMenu(), enabled: editable() },
      { label: t('Slide size'), submenu: sizeMenu(), enabled: editable() },
      { label: t('Layout'), submenu: layoutMenu(), enabled: editable() },
      { label: t('Background color…'), run: () => chooseBackground(), enabled: editable() },
    ],
  }
  const presentMenu: Menu = {
    label: t('Present'),
    items: [
      { label: t('From the beginning'), shortcut: 'F5', run: () => present(false) },
      { label: t('From the current slide'), shortcut: 'Shift+F5', run: () => present(true) },
      { label: t('Presenter view'), run: () => present(true, true) },
      '-',
      { label: t('Follow the presenter'), run: followPresenter, enabled: () => presenters(session.awareness, doc.clientID).length > 0 },
    ],
  }
  // Keys of the frame do nothing while presenting (the presentation owns the keyboard).
  const unlessPresenting = (fn: () => void) => () => {
    if (!presentation.active) fn()
  }
  const frame = mountFrame({
    session,
    shell,
    file: {
      openFile: unlessPresenting(() => fileInput.click()),
      print: () => void printPdf(),
      download: [
        { label: t('PDF (via Print)'), run: () => void printPdf() },
        { label: t('Current slide as PNG'), run: () => void downloadPng(false) },
        { label: t('All slides as PNG (.zip)'), run: () => void downloadPng(true) },
      ],
      slots: { print: [{ label: t('Slide size'), submenu: sizeMenu(), enabled: editable() }] },
      details: () => [
        [t('Slides'), String(slides().length)],
        [t('Theme'), theme.name],
        [t('Slide size'), size.ratio],
      ],
    },
    edit: { label: t('Edit'), items: editor.editMenu() },
    menus: { view: viewMenu, insert, format: formatMenu, app: [{ label: t('Arrange'), items: editor.arrangeMenu(false) }, { label: t('Slide'), items: slideMenu() }], review: [presentMenu] },
    help: {
      sections: () =>
        shortcutSections(t('Presentation'), [
          [t('New slide'), 'Ctrl+M'],
          [t('Bold / italic / underline'), 'Ctrl+B / Ctrl+I / Ctrl+U'],
          [t('Bigger / smaller text'), 'Ctrl+Shift+> / Ctrl+Shift+<'],
          [t('Comment'), 'Ctrl+Alt+M'],
          [t('Next / previous slide'), t('Page Down / Page Up')],
          [t('Present from the beginning / current slide'), 'F5 / Shift+F5'],
          [t('While presenting'), t('Arrows, Space, click · L: laser · B: black screen · Esc')],
        ]),
    },
    keys: { find: unlessPresenting(editor.find) },
    zoom: editor.zoomTarget,
  })
  // AI assistants (WebMCP, off by default): the tool module loads only when turned on.
  provideWebMcpTools(session, () => import('./webmcp').then((m) => m.slidesTools(session, editor)))

  // ---------- Toolbar ----------

  const tb = frame.toolbar
  const always = () => true
  const hasText = () => editingText() || editor.hasSelection()
  const tableButton = tb.button(Table, t('Insert table'), () => openPopover(tableButton, tableGrid(insertTable, 8)), { enabled: editable(always) })
  const tableAnchor = () => (tableButton.closest('.tb-overflowed') ? shell.toolbar : tableButton)
  const bgButton = tb.button(PaintBucket, t('Slide background'), () => chooseBackground(), { enabled: editable(always), class: 'slides-bg-button' })
  const layoutSelect = el('select', { class: 'tb-select', title: t('Layout') })
  layoutSelect.setAttribute('aria-label', t('Layout'))
  layoutSelect.append(el('option', { value: '', textContent: t('Layout'), disabled: true }), ...LAYOUTS.map((l) => el('option', { value: l.id, textContent: layoutName(l.id) })))
  layoutSelect.addEventListener('change', () => {
    if (layoutSelect.value) applyLayout(layoutSelect.value as LayoutId)
    layoutSelect.value = ''
    canvas.focus()
  })
  layoutSelect.value = ''
  const textColor = tb.colorButton(Baseline, t('Text color'), () => undefined, setTextColor, t('Theme color'))
  tb.onRefresh(() => (textColor.disabled = !editable(hasText)()))
  const presentButton = el('button', { type: 'button', class: 'primary slides-present-btn' })
  presentButton.append(icon(Play), document.createTextNode(t('Present')))
  presentButton.addEventListener('click', () => present(true))
  presentButton.title = t('Present from the current slide (Shift+F5)')

  if (!readOnly) {
    tb.group(tb.button(Plus, t('New slide'), () => addSlide(), { shortcut: mod('M'), enabled: editable(always) }), layoutSelect)
    tb.group(
      tb.button(Undo2, t('Undo'), editor.undo, { shortcut: mod('Z'), enabled: editable(() => editor.undoManager.canUndo()) }),
      tb.button(Redo2, t('Redo'), editor.redo, { shortcut: mod('Y'), enabled: editable(() => editor.undoManager.canRedo()) }),
    )
    tb.group(
      tb.button(Bold, t('Bold'), () => toggleFontBit(1, 'bold'), { shortcut: mod('B'), enabled: editable(hasText) }),
      tb.button(Italic, t('Italic'), () => toggleFontBit(2, 'italic'), { shortcut: mod('I'), enabled: editable(hasText) }),
      tb.button(Underline, t('Underline'), () => toggleFontBit(4, 'underline'), { shortcut: mod('U'), enabled: editable(hasText) }),
      textColor,
      tb.button(AArrowUp, t('Bigger text'), () => fontSizeStep(1), { shortcut: mod('Shift+>'), enabled: editable(hasText) }),
      tb.button(AArrowDown, t('Smaller text'), () => fontSizeStep(-1), { shortcut: mod('Shift+<'), enabled: editable(hasText) }),
    )
    tb.group(
      tb.button(AlignLeft, t('Align left'), () => setAlign('left'), { enabled: editable(hasText) }),
      tb.button(AlignCenter, t('Center'), () => setAlign('center'), { enabled: editable(hasText) }),
      tb.button(AlignRight, t('Align right'), () => setAlign('right'), { enabled: editable(hasText) }),
      tb.button(List, t('Bulleted list'), () => toggleList(false), { enabled: editable(hasText) }),
      tb.button(ListOrdered, t('Numbered list'), () => toggleList(true), { enabled: editable(hasText) }),
    )
    tb.group(
      tb.button(Type, t('Text box'), insertTextBox, { enabled: editable(always) }),
      tb.button(ImagePlus, t('Image'), () => imageInput.click(), { enabled: editable(always) }),
      tb.button(Shapes, t('Shapes'), () => showLeft(editor.sidebar.element.hidden ? 'shapes' : 'slides'), { enabled: editable(always), active: () => !editor.sidebar.element.hidden }),
      tableButton,
      tb.button(Sigma, t('Equation'), () => void insertEquation(), { enabled: editable(always) }),
    )
    tb.group(bgButton, tb.button(PanelRight, t('Format panel'), () => editor.togglePanel(editor.format.element), { active: () => !editor.format.element.hidden }))
  }
  const panes = [
    ...(readOnly ? [] : [tb.button(Sparkles, t('Animations'), toggleAnimations, { active: () => animPane.visible })]),
    ...(session.canComment ? [tb.button(MessageSquarePlus, t('Comments'), toggleComments, { active: () => commentsPane.visible })] : []),
  ]
  if (panes.length) tb.group(...panes, { keep: true })
  // "Present" (and "Follow" while someone presents) stays visible at the right end.
  tb.group(followBtn, presentButton, { pinned: true, keep: true, class: 'slides-present-group' })
  editor.onToolbar(tb.refresh)

  // ---------- Keyboard ----------

  const onKey = (e: KeyboardEvent): boolean => {
    if (presentation.active) return true
    const modKey = e.ctrlKey || e.metaKey
    const key = e.key
    const done = () => {
      e.preventDefault()
      return true
    }
    if (key === 'F5') {
      present(e.shiftKey)
      return done()
    }
    if (modKey && e.altKey && e.code === 'KeyM') {
      addComment()
      return done()
    }
    if (modKey && key.toLowerCase() === 'm' && !readOnly) {
      addSlide()
      return done()
    }
    if (!editor.hasSelection() && (key === 'PageDown' || key === 'PageUp' || (readOnly && key.startsWith('Arrow')))) {
      go(key === 'PageDown' || key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1)
      return done()
    }
    if (readOnly) return false
    if (modKey && !e.shiftKey && ['b', 'i', 'u'].includes(key.toLowerCase()) && editor.hasSelection()) {
      const k = key.toLowerCase()
      toggleFontBit(k === 'b' ? 1 : k === 'i' ? 2 : 4, k === 'b' ? 'bold' : k === 'i' ? 'italic' : 'underline')
      return done()
    }
    if (modKey && e.shiftKey && (key === '>' || key === '<' || key === '.' || key === ',')) {
      fontSizeStep(key === '>' || key === '.' ? 1 : -1)
      return done()
    }
    // Typing on a selected text box starts editing it, like in other presentation apps.
    const cell = graph.getSelectionCount() === 1 ? graph.getSelectionCell() : null
    if (cell?.isVertex() && key.length === 1 && !modKey && !e.altKey && key !== ' ' && graph.isCellEditable(cell)) {
      graph.startEditingAtCell(cell)
      return true
    }
    return false
  }

  // ---------- Format panel: slide options ----------

  const slideSection = (): HTMLElement => {
    const m = readSlideMeta(doc, sync.page)
    const section = (heading: string, ...children: HTMLElement[]) => el('section', { class: 'fmt-section' }, el('h3', { textContent: heading }), ...children)
    const row = (label: string, control: HTMLElement) => el('label', { class: 'fmt-row' }, el('span', { class: 'fmt-label', textContent: label }), control)
    const select = (options: [string, string][], value: string, apply: (v: string) => void) => {
      const s = el('select', { class: 'fmt-select', disabled: readOnly })
      for (const [v, label] of options) s.append(el('option', { value: v, textContent: label }))
      s.value = value
      s.addEventListener('change', () => apply(s.value))
      return s
    }
    const bg = parseBackground(m.background, theme)
    const swatch = el('span', { class: 'fmt-swatch' })
    swatch.style.background = backgroundCss(bg)
    const bgBtn = el('button', { type: 'button', class: 'fmt-color', disabled: readOnly }, swatch, el('span', { textContent: m.background ? m.background : t('Theme') }))
    bgBtn.addEventListener('click', () => openPopover(bgBtn, colorPalette((c) => setBackground(c), t('Theme background'))))
    const themes = el('div', { class: 'slides-theme-grid' })
    for (const th of THEMES) {
      const b = el('button', { type: 'button', class: 'slides-theme-card', title: th.name, disabled: readOnly })
      b.style.background = backgroundCss(th.background)
      const aa = el('span', { textContent: t('Aa') })
      aa.style.cssText = `color:${th.titleColor};font-family:${th.titleFont}`
      const name = el('small', { textContent: th.name })
      name.style.color = th.bodyColor
      b.append(aa, name)
      b.classList.toggle('active', th.id === theme.id)
      b.addEventListener('click', () => setTheme(th.id))
      themes.append(b)
    }
    return el(
      'div',
      {},
      section(
        t('Slide'),
        row(t('Layout'), select([['', '—'], ...LAYOUTS.map((l) => [l.id, layoutName(l.id)] as [string, string])], m.layout ?? (sync.page === blankSlide().id ? 'title' : ''), (v) => v && applyLayout(v as LayoutId))),
        row(t('Background'), bgBtn),
      ),
      section(
        t('Presentation'),
        row(t('Slide size'), select([['16:9', t('Widescreen (16:9)')], ['4:3', t('Standard (4:3)')]], size.ratio, (v) => setRatio(v as Ratio))),
        el('div', { class: 'fmt-subtitle', textContent: t('Theme') }),
        themes,
        el('p', { class: 'fmt-hint', textContent: t('Only what is inside the slide is presented and exported. Double click to add text.') }),
      ),
    )
  }

  // ---------- Layout ----------

  const center = el('div', { class: 'slides-center' }, canvas, notes.element)
  const body = el('div', { class: 'diagram-body slides-body' }, left, center, editor.format.element, animPane.element, commentsPane.element)
  // Where the last context menu opened (for menus opened from it).
  canvas.addEventListener('contextmenu', (e) => (lastContext = { x: e.clientX, y: e.clientY }), true)
  shell.main.append(body)
  frame.status?.left.append(slideLabel)
  frame.status?.addRight(editor.selectionLabel)
  editor.onZoom(() => frame.status?.zoom?.update())
  list.setAspect(size.width, size.height)
  if (window.matchMedia('(max-width: 800px)').matches) {
    left.hidden = true
    notes.element.hidden = true
  }
  session.awareness.on('change', () => updateFollow())

  ready = true
  editor.start()
  tb.refresh()
  // Remote edits while presenting show up on the presented slide.
  if (import.meta.env.DEV) Object.assign(window, { slidesPresentation: presentation, slidesData: presentationData, slidesApp: { addSlide, applyLayout, present, followPresenter, downloadPptx, downloadOdp, printPdf, insertTable } })
}

function parseData(cell: Cell): Record<string, unknown> {
  try {
    return JSON.parse((cell as Cell & { woData?: string }).woData ?? '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}

// "<ul><li>a</li><li>b</li></ul>" → "a<br>b" and back.
function listToLines(html: string): string {
  const box = document.createElement('div')
  box.innerHTML = html
  return [...box.querySelectorAll('li')].map((li) => li.innerHTML).join('<br>')
}

function linesToList(html: string, tag: 'ul' | 'ol'): string {
  const box = document.createElement('div')
  box.innerHTML = html
  // Lines separated by <br> or block elements.
  const lines: string[] = []
  let current = ''
  const flush = () => {
    if (current.trim()) lines.push(current)
    current = ''
  }
  for (const node of [...box.childNodes]) {
    if (node.nodeName === 'BR') flush()
    else if (node.nodeType === 1 && /^(DIV|P|LI|UL|OL)$/.test(node.nodeName)) {
      flush()
      const items = (node as HTMLElement).querySelectorAll('li')
      if (items.length) items.forEach((li) => lines.push(li.innerHTML))
      else lines.push((node as HTMLElement).innerHTML)
    } else current += node.nodeType === 1 ? (node as HTMLElement).outerHTML : (node.textContent ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  }
  flush()
  return `<${tag}>${(lines.length ? lines : ['']).map((l) => `<li>${l}</li>`).join('')}</${tag}>`
}
