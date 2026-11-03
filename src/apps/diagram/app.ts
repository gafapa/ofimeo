// Diagram app: our own editor on maxGraph inside the shared app frame
// (src/ui/frame.ts: menu bar, keys, toolbar, status bar with page tabs, save
// state and zoom), synced over Yjs. Files are compatible with draw.io
// (.drawio / mxGraphModel XML). The editor itself (graph, commands, panels,
// keyboard, find) lives in editor.ts and is shared with the slides app.

import { BringToFront, CalendarDays, Grid3x3, PaintBucket, PanelLeft, PanelRight, Pencil, Plus, Redo2, SendToBack, Trash2, Undo2 } from 'lucide'
import { appInfo } from '../registry'
import type { Session } from '../../core/session'
import { t } from '../../core/i18n'
import { setupChrome } from '../../ui/chrome'
import { mountFrame } from '../../ui/frame'
import { provideWebMcpTools } from '../../core/webmcp'
import { renderShell } from '../../ui/shell'
import { mod } from '../../ui/shortcuts'
import { colorPalette, confirmDialog, el, icon, openPopover, promptText, showContextMenu, toast, type Menu, type MenuEntry } from '../../ui/widgets'
import { createDiagramEditor, shortcutSections } from './editor'
import { renderSvg, svgToPng, svgToString } from './export'
import { DiagramSync } from './sync'
import { createPageSettings, type PageSettings } from './page'
import { pageDisplayName } from './model'
import { graphSpelling } from './spell'
import { GanttView } from './gantt-view'
import { ganttRasterScale, sampleGantt } from './gantt-model'

export const DIAGRAM_ACCEPT = '.drawio,.xml,.vsdx,.vssx'

const formats = () => import('./formats/drawio')

export function mountDiagram(session: Session, root: HTMLElement): void {
  const pagePreference = 'ofimeo:diagram-page'
  let preferredPage: string | undefined
  try {
    const saved = JSON.parse(sessionStorage.getItem(pagePreference) ?? 'null') as { doc?: string; page?: string } | null
    if (saved?.doc === session.docId && typeof saved.page === 'string') preferredPage = saved.page
  } catch { /* Page selection is optional when session storage is unavailable. */ }
  const info = appInfo('diagram')
  const shell = renderShell(info, root)
  setupChrome(session, info.untitled)

  const canvas = el('div', { class: 'diagram-canvas grid' })
  const body = el('div', { class: 'diagram-body' })
  const printArea = el('div', { class: 'diagram-print' })
  const fileInput = el('input', { type: 'file', accept: DIAGRAM_ACCEPT, hidden: true })
  const imageInput = el('input', { type: 'file', accept: 'image/*', hidden: true })
  document.body.append(printArea, fileInput, imageInput)

  const meta = session.doc.getMap<unknown>('meta')
  const title = () => String(meta.get('title') || info.untitled).replace(/[\\/:*?"<>|]+/g, '_')

  const openFile = async (file: File) => {
    try {
      toast(t('Opening…'))
      const { importFile } = await import('./index')
      location.href = await importFile(file)
    } catch (err) {
      toast(t('Could not open the file: {error}', { error: (err as Error).message }))
    }
  }
  // Print (Ctrl+P, File ▸ Print…, and "Hand in" through session.hooks.print): the current page.
  const print = async () => {
    try {
      graph.clearSelection()
      printArea.replaceChildren(await currentSvg())
      window.print()
    } catch (error) { toast((error as Error).message) }
    finally { printArea.replaceChildren() }
  }

  let page: PageSettings | undefined
  let gantt: GanttView | undefined
  const editor = createDiagramEditor(session, {
    canvas,
    diagramOptions: () => page?.formatRows() ?? [],
    // Links with view or comment access open the diagram read-only.
    readOnly: !session.canEdit,
    openFile: (file) => void openFile(file),
    onPagesChange: () => {
      if (preferredPage && sync.pages.has(preferredPage) && sync.page !== preferredPage) {
        const id = preferredPage
        preferredPage = undefined
        sync.showPage(id)
        return
      }
      if (sync.pages.size) {
        preferredPage = undefined
        try { sessionStorage.setItem(pagePreference, JSON.stringify({ doc: session.docId, page: sync.page })) } catch { /* Optional UI state. */ }
      }
      renderTabs()
      page?.update()
      updateMode()
    },
    onPageShown: () => page?.update(),
    onKey: (event) => gantt?.onKey(event) ?? false,
  })
  const { graph, sync, readOnly, sidebar, format, hasSelection } = editor
  const isGantt = () => !!sync.pageAttrs().gantt
  const editable = (predicate?: () => boolean) => () => !isGantt() && editor.editable(predicate)()
  const diagramEntries = (items: MenuEntry[]): MenuEntry[] => items.map((item) => item === '-' ? item : ({ ...item, enabled: () => !isGantt() && (item.enabled?.() ?? true) }))
  page = createPageSettings(editor, canvas)
  gantt = new GanttView(session)
  const background = () => page!.background() ?? '#ffffff'
  const updateMode = () => {
    const active = isGantt()
    body.classList.toggle('gantt-active', active)
    shell.toolbar.hidden = readOnly || active
    graph.setEnabled(!readOnly && !active)
    gantt!.show(active ? sync.page : null)
    editor.selectionLabel.hidden = active
  }
  const currentSvg = async (): Promise<SVGSVGElement> => {
    if (!isGantt()) return renderSvg(graph, { background: background() })
    const current = DiagramSync.readPages(session.doc).find((entry) => entry.id === sync.page)!
    const [{ renderPages }, { orderCells }] = await Promise.all([import('./index'), formats()])
    return (await renderPages([orderCells(current.cells)], ['#ffffff']))[0]
  }

  // ---------- Files ----------

  const download = (blob: Blob, ext: string) => {
    const a = el('a', { href: URL.createObjectURL(blob), download: `${title()}.${ext}` })
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const selectionSvg = () => renderSvg(graph, { cells: editor.selection(), background: background() })
  const downloadSelectionPng = async () => {
    try {
      download(await svgToPng(selectionSvg()), 'png')
    } catch (err) {
      toast(t('PNG export failed: {error}', { error: (err as Error).message }))
    }
  }
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (file) void openFile(file)
  })
  imageInput.addEventListener('change', () => {
    const file = imageInput.files?.[0]
    imageInput.value = ''
    if (file) editor.insertImage(file)
  })
  // File ▸ Download as and "Save to Nextcloud" (the whole current page for images).
  session.hooks.exportFormats = () => [
    { ext: 'drawio', label: t('draw.io diagram (.drawio)'), build: async () => new Blob([(await formats()).serializeDrawio(DiagramSync.readPages(session.doc))], { type: 'application/vnd.jgraph.mxfile' }) },
    { ext: 'svg', label: t('SVG image (current page)'), build: async () => new Blob([svgToString(await currentSvg())], { type: 'image/svg+xml' }) },
    { ext: 'png', label: t('PNG image (current page)'), build: async () => {
      const structured = isGantt()
      const svg = await currentSvg()
      return svgToPng(svg, structured ? ganttRasterScale(Number(svg.getAttribute('width')), Number(svg.getAttribute('height'))) : 2)
    } },
    { ext: 'pdf', label: t('PDF document (all pages)'), build: async () => (await import('./pdf')).diagramPdf(DiagramSync.readPages(session.doc), title()) },
  ]
  // Document details: pages, shapes and connectors of the whole diagram.
  const details = (): [string, string][] => {
    const pages = DiagramSync.readPages(session.doc)
    const cells = pages.flatMap((p) => p.cells)
    return [
      [t('Pages'), String(pages.length)],
      [t('Shapes'), String(cells.filter((c) => c.vertex).length)],
      [t('Connectors'), String(cells.filter((c) => c.edge).length)],
    ]
  }

  // ---------- Pages ----------

  // The page tabs and, after their tab list, the New page button.
  const pageTabs = el('div', { class: 'page-tabs' })
  const pageTabList = el('div', { class: 'page-tab-list', role: 'tablist' })
  pageTabList.setAttribute('aria-label', t('Pages'))
  // Arrow keys, Home and End move between the tabs; Enter or Space shows the page.
  pageTabList.addEventListener('keydown', (e) => {
    const tabs = [...pageTabList.querySelectorAll<HTMLElement>('.page-tab')]
    const i = tabs.indexOf(document.activeElement as HTMLElement)
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null
    if (i < 0 || next === null) return
    e.preventDefault()
    tabs[(next + tabs.length) % tabs.length].focus()
  })
  // New pages get a translated name; the first page of a new document keeps the
  // fixed name "Page-1" so collaborators who create it at the same time agree.
  const addPage = () => {
    if (readOnly) return
    const id = sync.addPage(t('Page {n}', { n: sync.pageList().length + 1 }))
    sync.showPage(id)
  }
  const duplicatePage = () => {
    if (readOnly) return
    const current = DiagramSync.readPages(session.doc).find((p) => p.id === sync.page)!
    const id = sync.addPage(`${pageDisplayName(current.name)} (${t('copy')})`, current.cells, { ...sync.pageAttrs(sync.page), gantt: current.gantt })
    sync.showPage(id)
  }
  const addGantt = () => {
    if (readOnly) return
    const project = sampleGantt([t('Define the project'), t('Research'), t('Create the work'), t('Review the work'), t('Final delivery')])
    const id = sync.addPage(t('Gantt chart'), undefined, { gantt: JSON.stringify(project) })
    sync.showPage(id)
  }
  const renamePage = async (id = sync.page) => {
    if (readOnly) return
    const current = sync.pageList().find((p) => p.id === id)
    if (!current) return
    const name = await promptText(t('Rename page'), t('Name'), pageDisplayName(current.name))
    if (name?.trim()) sync.renamePage(id, name.trim())
  }
  const deletePage = async (id = sync.page) => {
    if (readOnly) return
    if (sync.pageList().length <= 1) return
    if (await confirmDialog(t('Delete page'), t('Delete this page for everyone?'), { confirmLabel: t('Delete'), danger: true })) sync.deletePage(id)
  }
  const movePage = (dir: -1 | 1) => {
    if (readOnly) return
    const list = sync.pageList()
    const index = list.findIndex((p) => p.id === sync.page)
    if (dir < 0 && index > 0) sync.movePage(sync.page, list[index - 1].id)
    if (dir > 0 && index < list.length - 1) sync.movePage(sync.page, list[index + 2]?.id ?? null)
  }
  const renderTabs = () => {
    const peers = editor.presence()?.pagesOfPeers() ?? new Map()
    const hadFocus = pageTabList.contains(document.activeElement)
    pageTabList.replaceChildren()
    pageTabs.replaceChildren(pageTabList)
    for (const page of sync.pageList()) {
      const tab = el('button', { type: 'button', class: 'page-tab', textContent: pageDisplayName(page.name) || t('Untitled page'), role: 'tab' })
      tab.classList.toggle('active', page.id === sync.page)
      tab.setAttribute('aria-selected', String(page.id === sync.page))
      // One stop in the tab order: the current page's tab.
      tab.tabIndex = page.id === sync.page ? 0 : -1
      for (const user of peers.get(page.id) ?? []) {
        const dot = el('span', { class: 'page-peer', title: user.name })
        dot.style.background = user.color
        tab.append(dot)
      }
      tab.addEventListener('click', () => page.id !== sync.page && sync.showPage(page.id))
      tab.addEventListener('dblclick', () => void renamePage(page.id))
      tab.addEventListener('contextmenu', (e) => {
        e.preventDefault()
        if (page.id !== sync.page) sync.showPage(page.id)
        showContextMenu(e.clientX, e.clientY, pageMenu())
      })
      pageTabList.append(tab)
    }
    if (hadFocus) pageTabList.querySelector<HTMLElement>('.page-tab.active')?.focus()
    if (readOnly) return
    const add = el('button', { type: 'button', class: 'page-add', title: t('New page') }, icon(Plus, 16))
    add.setAttribute('aria-label', t('New page'))
    add.addEventListener('click', addPage)
    pageTabs.append(add)
  }
  const pageMenu = (): MenuEntry[] => [
    { label: t('New page'), run: addPage, enabled: editor.editable() },
    { label: t('Gantt chart'), run: addGantt, enabled: editor.editable() },
    { label: t('Duplicate page'), run: duplicatePage, enabled: editor.editable() },
    { label: t('Rename page…'), run: () => void renamePage(), enabled: editor.editable() },
    { label: t('Delete page'), run: () => void deletePage(), enabled: editor.editable(() => sync.pageList().length > 1) },
    '-',
    { label: t('Move page left'), run: () => movePage(-1), enabled: editor.editable() },
    { label: t('Move page right'), run: () => movePage(1), enabled: editor.editable() },
    '-',
    ...diagramEntries(page!.menu(() => pageTabs)),
  ]

  // ---------- Menus ----------

  // Color menus open their palette under the matching toolbar button (or the toolbar).
  const colorAnchor = (selector: string) => shell.toolbar.querySelector<HTMLElement>(`${selector}:not(.tb-overflowed *)`) ?? shell.toolbar
  const chooseColor = (selector: string, apply: (c: string | null) => void, reset: string) => openPopover(colorAnchor(selector), colorPalette(apply, reset))
  const fontItem = (label: string, bit: number, shortcut?: string): MenuEntry => ({
    label,
    shortcut,
    run: () => editor.toggleFontStyle(bit),
    active: () => editor.hasFontStyle(bit),
    enabled: editable(hasSelection),
  })
  const view: Menu = { label: t('View'), items: diagramEntries([...editor.panelMenu(), ...page.viewMenu(), '-', ...editor.zoomMenu()]) }
  const insert: Menu = {
    label: t('Insert'),
    items: [
      { label: t('Gantt chart'), run: addGantt, enabled: editor.editable() },
      { label: t('Add task'), run: () => gantt!.addTask(), visible: isGantt, enabled: editor.editable() },
      '-',
      { label: t('Text'), run: editor.insertText, enabled: editable() },
      { label: t('Image…'), run: () => imageInput.click(), enabled: editable() },
      '-',
      { label: t('Shapes'), run: () => (sidebar.element.hidden ? editor.togglePanel(sidebar.element) : undefined), enabled: editable() },
      { label: t('More shapes…'), run: editor.moreShapes, enabled: editable() },
      '-',
      { label: t('New page'), run: addPage, enabled: editor.editable() },
    ],
  }
  const formatMenu: Menu = {
    label: t('Format'),
    items: [
      fontItem(t('Bold'), 1),
      fontItem(t('Italic'), 2),
      fontItem(t('Underline'), 4),
      fontItem(t('Strikethrough'), 8),
      '-',
      { label: t('Fill color…'), run: () => chooseColor('.diagram-fill', editor.setFill, t('No fill')), enabled: editable(hasSelection) },
      { label: t('Line color…'), run: () => chooseColor('.diagram-line', editor.setStroke, t('No line')), enabled: editable(hasSelection) },
      '-',
      { label: t('Edit style…'), run: editor.editStyle, enabled: editable(hasSelection) },
      { label: t('Format panel'), run: () => editor.togglePanel(format.element), active: () => !format.element.hidden, enabled: editable() },
    ],
  }
  const spelling = graphSpelling(session, editor, { pageLabel: (name) => pageDisplayName(name) || t('Untitled page') })
  const frame = mountFrame({
    session,
    shell,
    file: {
      openFile: () => fileInput.click(),
      print,
      download: [
        { label: t('SVG image (selection)'), visible: hasSelection, run: () => download(new Blob([svgToString(selectionSvg())], { type: 'image/svg+xml' }), 'svg') },
        { label: t('PNG image (selection)'), visible: hasSelection, run: () => void downloadSelectionPng() },
      ],
      details,
    },
    edit: { label: t('Edit'), items: [
      { label: t('Undo'), run: () => gantt!.undo(), visible: isGantt, enabled: () => session.canEdit && gantt!.canUndo() },
      { label: t('Redo'), run: () => gantt!.redo(), visible: isGantt, enabled: () => session.canEdit && gantt!.canRedo() },
      ...editor.editMenu().map((item): MenuEntry => item === '-' ? item : ({ ...item, visible: () => !isGantt() && (item.visible?.() ?? true) })),
    ] },
    menus: { view, insert, format: formatMenu, app: [{ label: t('Arrange'), items: diagramEntries(editor.arrangeMenu()) }, { label: t('Page'), items: pageMenu() }], tools: { label: t('Tools'), items: diagramEntries(spelling.menu()) } },
    help: { sections: () => shortcutSections(t('Diagram'), [[t('Spelling and grammar'), 'F7']]) },
    keys: { find: () => { if (!isGantt()) editor.find() } },
    zoom: editor.zoomTarget,
  })
  // AI assistants (WebMCP, off by default): the tool module loads only when turned on.
  provideWebMcpTools(session, () => import('./webmcp').then((m) => m.diagramTools(session, editor, gantt)))

  // ---------- Toolbar ----------

  const tb = frame.toolbar
  const styleColor = (key: string) => () => {
    const cell = editor.selection()[0]
    const value = cell ? String((graph.getCellStyle(cell) as Record<string, unknown>)[key] ?? '') : ''
    return value && value !== 'none' ? value : undefined
  }
  const colorTool = (node: typeof PaintBucket, label: string, key: string, apply: (c: string | null) => void, reset: string, className: string) => {
    const b = tb.colorButton(node, label, styleColor(key), apply, reset)
    b.classList.add(className)
    tb.onRefresh(() => (b.disabled = !editable(hasSelection)()))
    return b
  }
  if (readOnly) shell.toolbar.hidden = true
  else {
    tb.group(
      tb.button(CalendarDays, t('Gantt chart'), addGantt),
      tb.button(PanelLeft, t('Shapes panel'), () => editor.togglePanel(sidebar.element), { active: () => !sidebar.element.hidden }),
      tb.button(PanelRight, t('Format panel'), () => editor.togglePanel(format.element), { active: () => !format.element.hidden }),
    )
    tb.group(
      tb.button(Undo2, t('Undo'), editor.undo, { shortcut: mod('Z'), enabled: editable(() => editor.undoManager.canUndo()) }),
      tb.button(Redo2, t('Redo'), editor.redo, { shortcut: mod('Y'), enabled: editable(() => editor.undoManager.canRedo()) }),
    )
    tb.group(
      tb.button(Trash2, t('Delete'), editor.remove, { shortcut: t('Del'), enabled: editable(hasSelection) }),
      tb.button(BringToFront, t('To front'), editor.toFront, { shortcut: mod('Shift+F'), enabled: editable(hasSelection) }),
      tb.button(SendToBack, t('To back'), editor.toBack, { shortcut: mod('Shift+B'), enabled: editable(hasSelection) }),
    )
    tb.group(
      colorTool(PaintBucket, t('Fill color'), 'fillColor', editor.setFill, t('No fill'), 'diagram-fill'),
      colorTool(Pencil, t('Line color'), 'strokeColor', editor.setStroke, t('No line'), 'diagram-line'),
      tb.button(Grid3x3, t('Grid'), () => editor.setGridVisible(!editor.isGridVisible()), { active: () => editor.isGridVisible() }),
    )
  }
  editor.onToolbar(tb.refresh)

  // ---------- Layout and status bar ----------

  body.append(sidebar.element, canvas, format.element, gantt.element)
  shell.main.append(body)
  frame.status?.left.append(pageTabs)
  frame.status?.addRight(editor.selectionLabel)
  editor.onZoom(() => frame.status?.zoom?.update())

  editor.start(() => {
    // Show the diagram at 100% when it fits, else fit it.
    const b = graph.getGraphBounds()
    const rect = canvas.getBoundingClientRect()
    if (b.width && (b.width > rect.width - 40 || b.height > rect.height - 40)) editor.fit()
    else graph.view.scaleAndTranslate(1, b.width ? 20 - (b.x - 0) : 20, b.width ? 20 - b.y : 20)
  })
  tb.refresh()
}
