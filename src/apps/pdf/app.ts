// Ofimeo PDF: open a PDF, annotate it together (highlights, ink, notes,
// shapes, stamps, signature) and export it with real PDF annotations or
// flattened. Runs on the shared Ofimeo frame (menus, keys, status bar).

import {
  ArrowUpRight, Circle, Eraser, FileUp, Highlighter, MessageSquare, Minus, MousePointer2, Palette, PanelLeft, PenLine, Redo2,
  Signature, Square, Stamp, StickyNote, Strikethrough, Type, Underline, Undo2, ChevronDown, ChevronUp, X,
} from 'lucide'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { printImages } from '../../core/handin'
import { t, tn } from '../../core/i18n'
import type { Session } from '../../core/session'
import { setupChrome } from '../../ui/chrome'
import { mountFrame } from '../../ui/frame'
import { pdfSpelling } from './spell'
import { provideWebMcpTools } from '../../core/webmcp'
import { renderShell } from '../../ui/shell'
import { isMac, mod, type ShortcutSection } from '../../ui/shortcuts'
import { closePopover, colorPalette, confirmDialog, el, icon, openPopover, showContextMenu, toast, type Menu, type MenuEntry } from '../../ui/widgets'
import { zoomMenuItems, type ZoomTarget } from '../../ui/zoom'
import { appInfo } from '../registry'
import { copySelection, Editor, MARKUP_TOOLS, type Tool } from './editor'
import { fileArray, blankPage, fillDoc, LOCAL, metaMap, notesMap, pagesArray, readFile, type Annot, type PageEntry } from './model'
import { round, viewTransform } from './geometry'
import { Notes } from './notes'
import { askPdfPassword, openPdf, PasswordCancelled } from './pdfjs'
import { annotElement } from './render'
import { drawSignature, forgetSignature, loadSignature, stampPresets } from './stamps'
import { findAll, markMatches, Viewer, type Match, type PageView } from './viewer'

export const PDF_ACCEPT = '.pdf,.zip'

export interface PdfApp {
  exportBytes(mode: 'annotations' | 'flatten'): Promise<Uint8Array>
  editor: Editor
  viewer: Viewer
}

export const pdfApps = new WeakMap<Session, PdfApp>()

const blob = (bytes: Uint8Array) => new Blob([bytes as BlobPart], { type: 'application/pdf' })

export async function mountPdf(session: Session, root: HTMLElement): Promise<void> {
  const info = appInfo('pdf')
  const shell = renderShell(info, root)
  setupChrome(session, info.untitled)
  const doc = session.doc
  const pages = pagesArray(doc)

  const layout = el('div', { class: 'pdf-layout' })
  const thumbs = el('aside', { class: 'pdf-side pdf-thumbs' })
  thumbs.setAttribute('aria-label', t('Page thumbnails'))
  const center = el('div', { class: 'pdf-center' })
  shell.main.append(layout)
  layout.append(thumbs, center)
  const viewer = new Viewer(center)
  const notes = new Notes(session, viewer)
  layout.append(notes.panel)
  const editor = new Editor(session, viewer, notes, layout)
  const spelling = pdfSpelling(session, viewer, editor, notes, center)
  if (window.innerWidth < 760) thumbs.hidden = true

  const fileInput = el('input', { type: 'file', accept: PDF_ACCEPT, hidden: true })
  document.body.append(fileInput)

  // ---------- Loading ----------

  let pdf: PDFDocumentProxy | null = null
  let loadedSize = -1
  const empty = el('div', { class: 'pdf-empty' })

  const reload = async () => {
    const size = Number(metaMap(doc).get('size') ?? 0)
    const chunks = fileArray(doc).toArray()
    const have = chunks.reduce((n, c) => n + c.length, 0)
    if (size && have < size) {
      // Waiting for the rest of the file from a collaborator.
      showEmpty(t('Receiving the PDF… {percent} %', { percent: Math.floor((have / size) * 100) }))
      return
    }
    if (size && size !== loadedSize) {
      loadedSize = size
      try {
        pdf = await openPdf(readFile(doc)!, { askPassword: askPdfPassword })
      } catch (err) {
        // Protected file and the prompt was cancelled: offer to try again.
        const retry = err instanceof PasswordCancelled
        showEmpty(retry ? t('This PDF is protected with a password.') : t('This PDF cannot be shown: {message}', { message: (err as Error).message }))
        if (retry) {
          const again = el('button', { type: 'button', class: 'primary', textContent: t('Enter the password…') })
          again.addEventListener('click', () => {
            loadedSize = -1
            void reload()
          })
          empty.append(again)
        }
        return
      }
      viewer.setDocument(pdf)
    }
    syncPages()
  }

  const syncPages = () => {
    const list = pages.toArray()
    if (!list.length) return showEmpty()
    empty.remove()
    viewer.setPages(list)
    for (const v of viewer.views) editor.renderPage(v)
    notes.refresh()
    renderThumbs()
    updateStatus()
    frame.toolbar.refresh()
  }

  function showEmpty(message?: string) {
    viewer.setPages([])
    empty.replaceChildren()
    if (message) empty.append(el('p', { textContent: message }))
    else {
      const open = el('button', { type: 'button', class: 'primary' }, icon(FileUp), el('span', { textContent: t('Open a PDF…') }))
      open.addEventListener('click', () => fileInput.click())
      const blank = el('button', { type: 'button', textContent: t('Start with a blank page') })
      blank.addEventListener('click', () => doc.transact(() => pages.push([blankPage()]), LOCAL))
      empty.append(
        el('h2', { textContent: t('Annotate a PDF') }),
        el('p', { textContent: t('Open a PDF (or a hand-in ZIP) or drop it here. Highlight, write, add stamps and comments, then download it or hand it back.') }),
        ...(session.canEdit ? [el('div', { class: 'pdf-empty-actions' }, open, blank)] : [el('p', { textContent: t('Waiting for the document…') })]),
      )
    }
    center.append(empty)
  }

  // Opens a file: into this document when it is still empty, else as a new document.
  const openFile = async (file: File) => {
    const { pickPdf, importFile, checkPdf } = await import('./index')
    try {
      if (!pages.length && session.canEdit) {
        const picked = await pickPdf(file)
        if (!picked) return
        const bytes = new Uint8Array(await picked.arrayBuffer())
        if (!(await checkPdf(bytes))) return
        const { preparePdf } = await import('./import')
        toast(t('Opening…'))
        const prepared = await preparePdf(bytes, picked.name, { author: session.user.name })
        fillDoc(doc, prepared, notesMap(session))
        if (!String(doc.getMap('meta').get('title') ?? '')) doc.getMap('meta').set('title', picked.name.replace(/\.pdf$/i, ''))
      } else {
        toast(t('Opening…'))
        const path = await importFile(file)
        if (path) location.href = path
      }
    } catch (err) {
      toast(t('Could not open the file: {message}', { message: (err as Error).message }))
    }
  }
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (file) void openFile(file)
  })
  layout.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes('Files')) {
      e.preventDefault()
      layout.classList.add('pdf-drop')
    }
  })
  layout.addEventListener('dragleave', () => layout.classList.remove('pdf-drop'))
  layout.addEventListener('drop', (e) => {
    layout.classList.remove('pdf-drop')
    const file = e.dataTransfer?.files[0]
    if (!file) return
    e.preventDefault()
    void openFile(file)
  })

  // ---------- Export ----------

  const raster = async (src: number, rotation?: number): Promise<Uint8Array> => {
    const page = await viewer.page(src)
    const viewport = page.getViewport({ scale: 2, rotation })
    const canvas = el('canvas', { width: Math.floor(viewport.width), height: Math.floor(viewport.height) })
    await page.render({ canvas, viewport }).promise
    const png = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'))
    return new Uint8Array(await png.arrayBuffer())
  }

  const exportBytes = async (mode: 'annotations' | 'flatten'): Promise<Uint8Array> => {
    const { exportPdf } = await import('./export')
    editor.finishEditing()
    return exportPdf(
      {
        bytes: readFile(doc),
        pages: pages.toArray(),
        annots: [...editor.annots.values()],
        notes: [...notes.map.values()],
        title: String(doc.getMap('meta').get('title') ?? '') || undefined,
        raster: pdf ? raster : undefined,
      },
      mode,
    )
  }
  pdfApps.set(session, { exportBytes, editor, viewer })

  session.hooks.exportFormats = () => [
    { ext: 'pdf', label: t('PDF with annotations (editable)'), build: async () => blob(await exportBytes('annotations')) },
    { ext: 'pdf', suffix: ` (${t('flattened')})`, label: t('PDF with annotations merged (flattened)'), build: async () => blob(await exportBytes('flatten')) },
  ]

  // Prints the flattened PDF as page images.
  const print = async () => {
    if (!pages.length) return toast(t('Open a PDF first'))
    toast(t('Preparing to print…'))
    const out = await openPdf(await exportBytes('flatten'))
    const images: Blob[] = []
    for (let i = 1; i <= out.numPages; i++) {
      const page = await out.getPage(i)
      const viewport = page.getViewport({ scale: 2 })
      const canvas = el('canvas', { width: Math.floor(viewport.width), height: Math.floor(viewport.height) })
      await page.render({ canvas, viewport }).promise
      images.push(await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png')))
    }
    await out.loadingTask.destroy()
    await printImages(images)
  }

  // ---------- Pages ----------

  const insertBlank = (after: boolean) => {
    const index = Math.min(pages.length, viewer.currentIndex() + (after ? 1 : 0))
    const near = pages.get(Math.min(index, pages.length - 1))
    const page = near ? blankPage(near.w, near.h) : blankPage()
    doc.transact(() => pages.insert(index, [page]), LOCAL)
    requestAnimationFrame(() => viewer.scrollToPage(index))
  }
  const currentEntry = (): PageEntry | undefined => pages.get(viewer.currentIndex())
  const indexOf = (id: string) => pages.toArray().findIndex((p) => p.id === id)

  // Page map: the pages array lists original pages (src) and blank ones in
  // their order and rotation; the viewer and the exporters follow it. Every
  // change is one undoable step (the undo manager tracks pages and annotations).

  // Deletes a page (original or blank). Its annotations stay stored, so Undo brings them back.
  const deletePage = async (entry = currentEntry()) => {
    if (!entry || !session.canEdit) return
    if (pages.length <= 1) return toast(t('A document needs at least one page.'))
    if (!(await confirmDialog(t('Delete page'), t('This removes the page and everything written on it from the document. Undo brings it back.'), { confirmLabel: t('Delete'), danger: true }))) return
    const index = indexOf(entry.id)
    if (index >= 0) doc.transact(() => pages.delete(index, 1), LOCAL)
  }

  // Rotates a page by 90° (clockwise when dir is 1); annotations and notes turn with it.
  const rotatePage = (dir: 1 | -1, entry = currentEntry()) => {
    if (!entry || !session.canEdit) return
    const index = indexOf(entry.id)
    if (index < 0) return
    const W = entry.w
    const H = entry.h
    // View-space point on the old page → the rotated page.
    const P = (x: number, y: number): [number, number] => (dir > 0 ? [round(H - y), round(x)] : [round(y), round(W - x)])
    const box = (x: number, y: number, w: number, h: number): [number, number, number, number] => {
      const [ax, ay] = P(x, y)
      const [bx, by] = P(x + w, y + h)
      return [Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay)]
    }
    const turn = (a: Annot): Annot => {
      const out: Annot = { ...a }
      if (a.rects) out.rects = a.rects.map(([x, y, w, h]) => box(x, y, w, h))
      if (a.strokes) out.strokes = a.strokes.map((st) => st.flatMap((v, i) => (i % 3 === 0 ? [...P(v, st[i + 1]), st[i + 2]] : [])))
      if (a.line) out.line = [...P(a.line[0], a.line[1]), ...P(a.line[2], a.line[3])]
      if (a.x !== undefined && a.y !== undefined && a.w !== undefined && a.h !== undefined) {
        if (a.type === 'text' || a.type === 'stamp') {
          // Text stays upright: move the box's centre.
          const [cx, cy] = P(a.x + a.w / 2, a.y + a.h / 2)
          out.x = round(cx - a.w / 2)
          out.y = round(cy - a.h / 2)
        } else [out.x, out.y, out.w, out.h] = box(a.x, a.y, a.w, a.h)
      }
      return out
    }
    let next: PageEntry
    if (entry.src === -1) next = { ...entry, w: H, h: W, view: [0, 0, H, W] }
    else {
      const rotate = (((entry.rotate + dir * 90) % 360) + 360) % 360
      const { w, h } = viewTransform({ view: entry.view, rotate })
      next = { ...entry, rotate, w: round(w), h: round(h) }
    }
    doc.transact(() => {
      pages.delete(index, 1)
      pages.insert(index, [next])
      for (const a of editor.pageAnnots(entry.id)) editor.annots.set(a.id, turn(a))
    }, LOCAL)
    session.commentsDoc.transact(() => {
      for (const [id, n] of notes.map) {
        if (n.page !== entry.id || n.x === undefined || n.y === undefined) continue
        const [x, y] = P(n.x + 10, n.y + 10)
        notes.map.set(id, { ...n, x: round(x - 10), y: round(y - 10) })
      }
    })
  }

  // Moves a page to another position (thumbnail drag, Page ▸ Move up / down).
  const movePage = (from: number, to: number) => {
    if (!session.canEdit || from === to || from < 0 || to < 0 || from >= pages.length || to >= pages.length) return
    const entry = pages.get(from)
    doc.transact(() => {
      pages.delete(from, 1)
      pages.insert(to, [entry])
    }, LOCAL)
    requestAnimationFrame(() => viewer.scrollToPage(to))
  }

  // ---------- Thumbnails ----------

  const thumbList = el('div', { class: 'pdf-thumb-list' })
  thumbs.append(el('div', { class: 'pdf-side-head' }, el('h2', { textContent: t('Pages') })), thumbList)
  const thumbObserver = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) void drawThumb(e.target as HTMLElement)
    },
    { root: thumbList, rootMargin: '200px 0px' },
  )
  const THUMB_W = 110
  async function drawThumb(node: HTMLElement) {
    const entry = pages.toArray().find((p) => p.id === node.dataset.pageId)
    if (!entry || node.dataset.drawn || !pdf) return
    node.dataset.drawn = '1'
    if (entry.src === -1) return
    const page = await viewer.page(entry.src)
    const viewport = page.getViewport({ scale: (THUMB_W / entry.w) * Math.min(2, window.devicePixelRatio || 1), rotation: entry.rotate })
    const canvas = el('canvas', { width: Math.floor(viewport.width), height: Math.floor(viewport.height) })
    await page.render({ canvas, viewport }).promise
    node.querySelector('.pdf-thumb-page')?.prepend(canvas)
  }
  const thumbOverlay = (entry: PageEntry) => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    s.setAttribute('viewBox', `0 0 ${entry.w} ${entry.h}`)
    s.setAttribute('preserveAspectRatio', 'none')
    s.setAttribute('aria-hidden', 'true')
    s.classList.add('pdf-thumb-overlay')
    if (editor.showAnnotations) for (const a of editor.pageAnnots(entry.id)) s.append(annotElement(a, false))
    return s
  }
  // Thumbnail context menu (rotate, move, delete) and drag to reorder.
  function bindThumb(node: HTMLElement, id: string) {
    const entry = () => pages.toArray().find((p) => p.id === id)
    node.addEventListener('contextmenu', (e) => {
      if (!session.canEdit) return
      e.preventDefault()
      showContextMenu(e.clientX, e.clientY, pageMenuItems(entry))
    })
    node.addEventListener('keydown', (e) => {
      // Shift+F10 / the context menu key, and Alt+↑/↓ to move the page.
      if (!session.canEdit) return
      if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
        e.preventDefault()
        const r = node.getBoundingClientRect()
        showContextMenu(r.left + r.width / 2, r.top + r.height / 2, pageMenuItems(entry))
      } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault()
        const from = indexOf(id)
        movePage(from, from + (e.key === 'ArrowUp' ? -1 : 1))
        requestAnimationFrame(() => thumbList.querySelector<HTMLElement>(`[data-page-id="${id}"]`)?.focus())
      }
    })
    node.draggable = session.canEdit
    node.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('application/x-ofimeo-page', id)
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
      node.classList.add('dragging')
    })
    node.addEventListener('dragend', () => node.classList.remove('dragging'))
    node.addEventListener('dragover', (e) => {
      if (!e.dataTransfer?.types.includes('application/x-ofimeo-page')) return
      e.preventDefault()
      e.stopPropagation()
      node.classList.add('drop-target')
    })
    node.addEventListener('dragleave', () => node.classList.remove('drop-target'))
    node.addEventListener('drop', (e) => {
      const from = e.dataTransfer?.getData('application/x-ofimeo-page')
      node.classList.remove('drop-target')
      if (!from) return
      e.preventDefault()
      e.stopPropagation()
      movePage(indexOf(from), indexOf(id))
    })
  }

  function renderThumbs() {
    const current = viewer.currentIndex()
    const existing = new Map([...thumbList.children].map((c) => [(c as HTMLElement).dataset.pageId, c as HTMLElement]))
    const nodes = pages.toArray().map((entry, i) => {
      let node = existing.get(entry.id)
      if (!node) {
        node = el('button', { type: 'button', class: 'pdf-thumb' })
        node.dataset.pageId = entry.id
        const box = el('div', { class: 'pdf-thumb-page' })
        box.style.aspectRatio = `${entry.w} / ${entry.h}`
        node.append(box, el('span', { class: 'pdf-thumb-num' }))
        node.addEventListener('click', () => viewer.scrollToPage(indexOf(entry.id)))
        bindThumb(node, entry.id)
        thumbObserver.observe(node)
      }
      // Rotated page: draw the thumbnail again.
      const shape = `${entry.rotate}|${entry.w}|${entry.h}`
      if (node.dataset.shape && node.dataset.shape !== shape) {
        node.querySelector('.pdf-thumb-page canvas')?.remove()
        delete node.dataset.drawn
        thumbObserver.unobserve(node)
        thumbObserver.observe(node)
      }
      node.dataset.shape = shape
      ;(node.querySelector('.pdf-thumb-page') as HTMLElement).style.aspectRatio = `${entry.w} / ${entry.h}`
      node.querySelector('.pdf-thumb-overlay')?.remove()
      node.querySelector('.pdf-thumb-page')!.append(thumbOverlay(entry))
      node.querySelector('.pdf-thumb-num')!.textContent = String(i + 1)
      node.setAttribute('aria-label', t('Page {n}', { n: i + 1 }))
      node.classList.toggle('current', i === current)
      node.setAttribute('aria-current', i === current ? 'page' : 'false')
      return node
    })
    thumbList.replaceChildren(...nodes)
  }
  let thumbTimer = 0
  const scheduleThumbs = () => {
    clearTimeout(thumbTimer)
    thumbTimer = window.setTimeout(renderThumbs, 300)
  }

  // ---------- Find ----------

  const findInput = el('input', { type: 'search', class: 'pdf-find-input', placeholder: t('Find in document') })
  findInput.setAttribute('aria-label', t('Find in document'))
  const findCount = el('span', { class: 'pdf-find-count' })
  findCount.setAttribute('aria-live', 'polite')
  const findBtn = (node: typeof X, label: string, run: () => void) => {
    const b = el('button', { type: 'button', class: 'pdf-icon-btn', title: label }, icon(node, 16))
    b.setAttribute('aria-label', label)
    b.addEventListener('click', run)
    return b
  }
  let matches: Match[] = []
  let matchIndex = -1
  const findBar = el('div', { class: 'pdf-find', hidden: true, role: 'search' })
  const showMatch = async () => {
    const m = matches[matchIndex] ?? null
    findCount.textContent = matches.length ? t('{n} of {m}', { n: matchIndex + 1, m: matches.length }) : findInput.value ? t('No results') : ''
    for (const v of viewer.views) void markMatches(viewer, v, matches, m)
    if (m) {
      viewer.scrollToPage(m.index)
      requestAnimationFrame(() => viewer.views[m.index]?.text.querySelector('.selected')?.scrollIntoView({ block: 'center' }))
    }
  }
  let findTimer = 0
  findInput.addEventListener('input', () => {
    clearTimeout(findTimer)
    findTimer = window.setTimeout(async () => {
      matches = await findAll(viewer, findInput.value)
      matchIndex = matches.length ? 0 : -1
      await showMatch()
    }, 200)
  })
  const step = (dir: number) => {
    if (!matches.length) return
    matchIndex = (matchIndex + dir + matches.length) % matches.length
    void showMatch()
  }
  const closeFind = () => {
    findBar.hidden = true
    matches = []
    void showMatch()
    viewer.scroller.focus()
  }
  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') step(e.shiftKey ? -1 : 1)
    if (e.key === 'Escape') closeFind()
  })
  findBar.append(findInput, findCount, findBtn(ChevronUp, t('Previous'), () => step(-1)), findBtn(ChevronDown, t('Next'), () => step(1)), findBtn(X, t('Close'), closeFind))
  center.prepend(findBar)
  const openFind = () => {
    findBar.hidden = false
    findInput.focus()
    findInput.select()
  }
  viewer.onTextLayer = (v: PageView) => {
    if (matches.length) void markMatches(viewer, v, matches, matches[matchIndex] ?? null)
  }

  // ---------- Frame ----------

  const zoom: ZoomTarget = {
    get: () => viewer.zoom,
    set: (z) => {
      viewer.fitWidth = false
      viewer.setZoom(z)
    },
    fit: () => {
      viewer.fitWidth = true
      viewer.applyFit()
    },
    isFit: () => viewer.fitWidth,
    min: 0.25,
    max: 5,
    presets: [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4],
    keys: true,
  }

  const toolItem = (tool: Tool, label: string, key: string): MenuEntry => ({
    label,
    shortcut: key,
    active: () => editor.tool === tool,
    enabled: () => session.canEdit || tool === 'select' || (tool === 'note' && session.canComment),
    run: () => editor.setTool(tool),
  })
  const stampItems = (): MenuEntry[] =>
    stampPresets().map((s) => ({ label: s.label, enabled: () => session.canEdit && pages.length > 0, run: () => void editor.chooseStamp(s) }))
  const signatureTool = async () => {
    if (!session.canEdit) return
    if (!loadSignature() && !(await drawSignature())) return
    editor.setTool('sign')
    toast(t('Click on a page, or press Enter, to place your signature.'))
  }
  editor.onNeedSignature = () => void signatureTool()
  const hasSelection = () => !!editor.selectedAnnot() && session.canEdit
  const editAlt = async () => {
    const a = editor.selectedAnnot()
    if (!a) return
    const { promptText } = await import('../../ui/widgets')
    const value = await promptText(t('Alternative text'), t('Describe this annotation for people who cannot see it'), a.alt ?? '')
    if (value !== null) editor.update(a.id, { alt: value.trim() || undefined })
  }

  const widths: [string, string][] = [['1', t('Thin')], ['2', t('Medium')], ['4', t('Thick')], ['8', t('Very thick')]]
  const sizes = ['10', '12', '14', '18', '24', '32']

  const view: Menu = {
    label: t('View'),
    items: [
      { label: t('Zoom'), submenu: zoomMenuItems(zoom) },
      { label: t('Fit width'), active: () => viewer.fitWidth, run: () => zoom.fit!() },
      '-',
      { label: t('Page thumbnails'), active: () => !thumbs.hidden, run: () => toggleThumbs() },
      { label: t('Comments'), active: () => !notes.panel.hidden, run: () => notes.toggle() },
      { label: t('Show annotations'), active: () => editor.showAnnotations, run: () => toggleAnnotations() },
    ],
  }
  const insert: Menu = {
    label: t('Insert'),
    items: [
      toolItem('text', t('Text box'), 'T'),
      toolItem('note', t('Sticky note'), 'N'),
      { label: t('Stamp'), submenu: stampItems() },
      { label: t('Signature'), shortcut: 'G', enabled: () => session.canEdit, run: () => void signatureTool() },
      '-',
      toolItem('rect', t('Rectangle'), 'R'),
      toolItem('ellipse', t('Ellipse'), 'O'),
      toolItem('line', t('Line'), 'L'),
      toolItem('arrow', t('Arrow'), 'A'),
      '-',
      { label: t('Blank page after this one'), enabled: () => session.canEdit, run: () => insertBlank(true) },
      { label: t('Blank page before this one'), enabled: () => session.canEdit && pages.length > 0, run: () => insertBlank(false) },
    ],
  }
  const pageMenuItems = (entry?: () => PageEntry | undefined): MenuEntry[] => {
    const target = entry ?? currentEntry
    const at = () => {
      const e = target()
      return e ? indexOf(e.id) : -1
    }
    return [
      { label: t('Rotate right'), shortcut: isMac ? '⌘]' : 'Ctrl+]', enabled: () => session.canEdit && !!target(), run: () => rotatePage(1, target()) },
      { label: t('Rotate left'), shortcut: isMac ? '⌘[' : 'Ctrl+[', enabled: () => session.canEdit && !!target(), run: () => rotatePage(-1, target()) },
      '-',
      { label: t('Move page up'), enabled: () => session.canEdit && at() > 0, run: () => movePage(at(), at() - 1) },
      { label: t('Move page down'), enabled: () => session.canEdit && at() >= 0 && at() < pages.length - 1, run: () => movePage(at(), at() + 1) },
      '-',
      { label: t('Delete page…'), enabled: () => session.canEdit && pages.length > 1 && !!target(), run: () => void deletePage(target()) },
    ]
  }
  const pageMenu: Menu = {
    label: t('Page'),
    items: [
      { label: t('Blank page after this one'), enabled: () => session.canEdit, run: () => insertBlank(true) },
      { label: t('Blank page before this one'), enabled: () => session.canEdit && pages.length > 0, run: () => insertBlank(false) },
      '-',
      ...pageMenuItems(),
    ],
  }
  const format: Menu = {
    label: t('Format'),
    items: [
      {
        label: t('Line width'),
        get submenu() {
          return widths.map(([value, label]) => ({ label, active: () => editor.lineWidth === Number(value), run: () => editor.setWidth(Number(value)) }))
        },
      },
      {
        label: t('Text size'),
        get submenu() {
          return sizes.map((value) => ({ label: `${value} pt`, active: () => editor.textSize === Number(value), run: () => editor.setTextSize(Number(value)) }))
        },
      },
      '-',
      { label: t('Alternative text…'), enabled: hasSelection, run: () => void editAlt() },
      { label: t('Edit text'), enabled: () => hasSelection() && ['text', 'stamp'].includes(editor.selectedAnnot()!.type), run: () => editor.editText(editor.selectedAnnot()!) },
    ],
  }
  const tools: Menu = {
    label: t('Tools'),
    items: [
      toolItem('select', t('Select'), 'V'),
      toolItem('highlight', t('Highlight'), 'H'),
      toolItem('underline', t('Underline'), 'U'),
      toolItem('strike', t('Strikeout'), 'K'),
      toolItem('pen', t('Pen'), 'P'),
      toolItem('eraser', t('Eraser'), 'E'),
      '-',
      { label: t('Draw a new signature…'), enabled: () => session.canEdit, run: () => void drawSignature().then((s) => s && editor.setTool('sign')) },
      { label: t('Forget my signature'), enabled: () => !!loadSignature(), run: () => forgetSignature() },
      '-',
      ...spelling.menu(),
    ],
  }

  const frame = mountFrame({
    session,
    shell,
    file: {
      openFile: () => fileInput.click(),
      print: () => void print(),
      details: () => [
        [t('Pages'), String(pages.length)],
        [t('Annotations'), String(editor.annots.size)],
        [t('Comments'), String(notes.threads().length)],
        [t('Original file'), String(metaMap(doc).get('name') ?? '—')],
        [t('File size'), `${(Number(metaMap(doc).get('size') ?? 0) / 1048576).toLocaleString(undefined, { maximumFractionDigits: 1 })} MB`],
      ],
    },
    edit: {
      editable: () => session.canEdit,
      undo: () => editor.undo.undo(),
      redo: () => editor.undo.redo(),
      canUndo: () => editor.undo.canUndo(),
      canRedo: () => editor.undo.canRedo(),
      copy: () => copySelection(),
      canCopy: () => !!document.getSelection()?.toString(),
      find: openFind,
      slots: { clipboard: [{ label: t('Delete annotation'), shortcut: 'Del', enabled: hasSelection, run: () => editor.deleteSelected() }] },
    },
    menus: { view, insert, format, app: [pageMenu], tools },
    help: { sections: shortcutSections },
    zoom,
    afterToolbarAction: () => undefined,
  })
  viewer.onZoom = () => {
    frame.status?.zoom?.update()
    editor.renderAll()
  }

  // Toolbar.
  const tb = frame.toolbar
  const toolButton = (node: typeof Square, tool: Tool, label: string, key: string) =>
    tb.button(node, label, () => editor.setTool(editor.tool === tool && tool !== 'select' ? 'select' : tool), {
      shortcut: key,
      active: () => editor.tool === tool,
      enabled: () => session.canEdit || tool === 'select' || (tool === 'note' && session.canComment),
    })
  tb.group(
    tb.button(Undo2, t('Undo'), () => editor.undo.undo(), { shortcut: mod('Z'), enabled: () => session.canEdit && editor.undo.canUndo() }),
    tb.button(Redo2, t('Redo'), () => editor.undo.redo(), { shortcut: mod('Y'), enabled: () => session.canEdit && editor.undo.canRedo() }),
  )
  // Select and sticky notes stay usable with a comment link (keep).
  tb.group(toolButton(MousePointer2, 'select', t('Select'), 'V'), toolButton(StickyNote, 'note', t('Sticky note'), 'N'), { keep: true })
  tb.group(
    toolButton(Highlighter, 'highlight', t('Highlight'), 'H'),
    toolButton(Underline, 'underline', t('Underline'), 'U'),
    toolButton(Strikethrough, 'strike', t('Strikeout'), 'K'),
  )
  tb.group(toolButton(PenLine, 'pen', t('Pen'), 'P'), toolButton(Eraser, 'eraser', t('Eraser'), 'E'))
  tb.group(
    toolButton(Type, 'text', t('Text box'), 'T'),
    toolButton(Square, 'rect', t('Rectangle'), 'R'),
    toolButton(Circle, 'ellipse', t('Ellipse'), 'O'),
    toolButton(Minus, 'line', t('Line'), 'L'),
    toolButton(ArrowUpRight, 'arrow', t('Arrow'), 'A'),
  )
  const stampBtn = tb.button(Stamp, t('Stamp'), () => openStampMenu(), { shortcut: 'S', active: () => editor.tool === 'stamp', enabled: () => session.canEdit })
  stampBtn.setAttribute('aria-haspopup', 'true')
  function openStampMenu() {
    if (!session.canEdit) return
    const list = el('div', { class: 'pdf-stamp-menu', role: 'menu' })
    for (const s of stampPresets()) {
      const b = el('button', { type: 'button', role: 'menuitem', class: 'pdf-stamp-choice' }, el('span', { class: 'pdf-stamp-sample', textContent: s.glyph === 'check' && !s.text ? '✓' : s.glyph === 'cross' ? '✗' : (s.text ?? s.label) }), el('span', { textContent: s.label }))
      b.style.setProperty('--stamp-color', s.color)
      b.addEventListener('click', () => {
        closePopover()
        void editor.chooseStamp(s)
      })
      list.append(b)
    }
    openPopover(stampBtn, list)
    list.querySelector('button')?.focus()
  }
  tb.group(stampBtn, tb.button(Signature, t('Signature'), () => void signatureTool(), { shortcut: 'G', active: () => editor.tool === 'sign', enabled: () => session.canEdit }))
  const colorBtn = tb.colorButton(Palette, t('Color'), () => editor.currentColor(), (c) => c && editor.setColor(c), t('Default'))
  const widthSelect = tb.select(t('Line width'), widths, () => String(editor.selectedAnnot()?.width ?? editor.lineWidth), (v) => editor.setWidth(Number(v)))
  const sizeSelect = tb.select(t('Text size'), sizes.map((s) => [s, `${s} pt`] as [string, string]), () => String(editor.selectedAnnot()?.size ?? editor.textSize), (v) => editor.setTextSize(Number(v)))
  tb.group(colorBtn, widthSelect, sizeSelect)
  const thumbsBtn = tb.button(PanelLeft, t('Page thumbnails'), () => toggleThumbs(), { active: () => !thumbs.hidden })
  const notesBtn = tb.button(MessageSquare, t('Comments'), () => notes.toggle(), { active: () => !notes.panel.hidden })
  tb.group(thumbsBtn, notesBtn, { pinned: true, keep: true })
  if (!session.canEdit) tb.element.classList.add('readonly')

  function toggleThumbs() {
    thumbs.hidden = !thumbs.hidden
    tb.refresh()
  }
  function toggleAnnotations() {
    editor.showAnnotations = !editor.showAnnotations
    editor.renderAll()
    renderThumbs()
  }
  notes.onToggle = () => tb.refresh()
  editor.onToolChange = () => tb.refresh()
  editor.onChange = () => {
    tb.refresh()
    scheduleThumbs()
    updateStatus()
  }

  // Status bar.
  const pageInfo = el('span', { class: 'pdf-page-info' })
  const toolInfo = el('span', { class: 'pdf-tool-info' })
  frame.status?.left.append(pageInfo, toolInfo)
  function updateStatus() {
    const n = pages.length
    pageInfo.textContent = n ? t('Page {n} of {m}', { n: viewer.currentIndex() + 1, m: n }) : ''
    const count = editor.annots.size
    toolInfo.textContent = n ? tn(count, '{n} annotation', '{n} annotations') : ''
  }
  viewer.onCurrentPage = () => {
    updateStatus()
    for (const [i, node] of [...thumbList.children].entries()) {
      node.classList.toggle('current', i === viewer.currentIndex())
      node.setAttribute('aria-current', i === viewer.currentIndex() ? 'page' : 'false')
    }
    thumbList.querySelector('.current')?.scrollIntoView({ block: 'nearest' })
  }
  viewer.onPageCreated = (v) => editor.attachPage(v)
  notes.onAdd = () => {
    editor.setTool('note')
    if (editor.tool === 'note') editor.placeWithKeyboard()
  }

  // Tool keys (single letters, outside text fields), undo and redo.
  const TOOL_KEYS: Record<string, Tool> = { v: 'select', h: 'highlight', u: 'underline', k: 'strike', p: 'pen', e: 'eraser', t: 'text', n: 'note', r: 'rect', o: 'ellipse', l: 'line', a: 'arrow' }
  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement
    if (target.closest('input, textarea, select, [contenteditable="true"], dialog') || document.querySelector('dialog[open]')) return
    const primary = isMac ? e.metaKey : e.ctrlKey
    const key = e.key.toLowerCase()
    if (primary && !e.altKey && (key === 'z' || key === 'y')) {
      e.preventDefault()
      if (key === 'y' || e.shiftKey) editor.undo.redo()
      else editor.undo.undo()
      return
    }
    if (primary && !e.altKey && (e.key === ']' || e.key === '[') && pages.length) {
      e.preventDefault()
      rotatePage(e.key === ']' ? 1 : -1)
      return
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (key === 'escape') {
      editor.hideBubble()
      if (editor.tool !== 'select') editor.setTool('select')
      else editor.select(null)
      return
    }
    if ((key === 'delete' || key === 'backspace') && editor.selected) {
      e.preventDefault()
      editor.deleteSelected()
      return
    }
    if (!pages.length) return
    // Enter (or Space on the pages) places the chosen annotation on the current page.
    if ((key === 'enter' || (key === ' ' && target === viewer.scroller)) && (target === viewer.scroller || target === document.body)) {
      if (editor.placeWithKeyboard()) e.preventDefault()
      return
    }
    if (TOOL_KEYS[key]) {
      e.preventDefault()
      editor.setTool(TOOL_KEYS[key])
      // A text selection made before choosing a markup tool is marked right away.
      if (MARKUP_TOOLS.includes(TOOL_KEYS[key])) editor.markSelection(TOOL_KEYS[key] as 'highlight')
    } else if (key === 's' && session.canEdit) {
      e.preventDefault()
      if (editor.stamp) editor.setTool('stamp')
      else openStampMenu()
    } else if (key === 'g' && session.canEdit) {
      e.preventDefault()
      void signatureTool()
    }
  })

  // Remote and local changes.
  pages.observe(() => syncPages())
  fileArray(doc).observe(() => void reload())
  metaMap(doc).observe(() => void reload())
  editor.annots.observe(() => scheduleThumbs())
  await reload()
  tb.refresh()
  // AI assistants (WebMCP, off by default): the tool module loads only when turned on.
  provideWebMcpTools(session, () => import('./webmcp').then((m) => m.pdfTools(session, viewer, editor)))
  if (import.meta.env.DEV) Object.assign(window, { pdfApp: { editor, viewer, notes, exportBytes } })
}

function shortcutSections(): ShortcutSection[] {
  return [
    {
      title: t('Tools'),
      rows: [
        [t('Select'), 'V'],
        [t('Highlight'), 'H'],
        [t('Underline'), 'U'],
        [t('Strikeout'), 'K'],
        [t('Pen'), 'P'],
        [t('Eraser'), 'E'],
        [t('Text box'), 'T'],
        [t('Sticky note'), 'N'],
        [t('Rectangle'), 'R'],
        [t('Ellipse'), 'O'],
        [t('Line'), 'L'],
        [t('Arrow'), 'A'],
        [t('Stamp'), 'S'],
        [t('Signature'), 'G'],
        [t('Back to Select'), 'Esc'],
        [t('Spelling and grammar'), 'F7'],
        [t('Place the chosen annotation on the current page'), 'Enter'],
      ],
    },
    {
      title: t('Pages'),
      rows: [
        [t('Rotate right'), mod(']')],
        [t('Rotate left'), mod('[')],
        [t('Move the page (thumbnails)'), 'Alt+↑ / Alt+↓'],
        [t('Page menu (thumbnails)'), 'Shift+F10'],
      ],
    },
    {
      title: t('Annotations'),
      rows: [
        [t('Move to the next annotation'), 'Tab'],
        [t('Move the annotation'), '← ↑ → ↓ (Shift: ×10)'],
        [t('Edit the text'), 'Enter'],
        [t('Delete annotation'), 'Del'],
        [t('Straight lines, squares and circles'), 'Shift'],
        [t('Undo / redo'), `${mod('Z')} / ${mod('Y')}`],
      ],
    },
  ]
}

