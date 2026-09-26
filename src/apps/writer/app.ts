// Word processor: TipTap editor in a paged print layout with menus, toolbar,
// status bar, find & replace, headers/footers, footnotes and page setup.
// Reference implementation of the shared app frame (src/ui/frame.ts).

import * as Y from 'yjs'
import { Editor, generateHTML, getSchema, type JSONContent } from '@tiptap/core'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import { yXmlFragmentToProsemirrorJSON, prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap'
import { Node as PMNode, type Schema } from '@tiptap/pm/model'
import { Transform } from '@tiptap/pm/transform'
import { allExtensions, bodyExtensions, headerFooterExtensions } from './editor/extensions'
import { exportFile, importFile, OPEN_ACCEPT, type ExportFormat } from './formats'
import { DEFAULT_PAGE, langCode, langTag, normalizeColumns, pageDimensionsMm, type Columns, type DocumentData, type PageSettings } from './formats/types'
import { appInfo } from '../registry'
import { docPath, newDocPath } from '../../core/router'
import { createLocalDocument, type Session } from '../../core/session'
import { setupChrome } from '../../ui/chrome'
import { mountFrame } from '../../ui/frame'
import { renderShell } from '../../ui/shell'
import { icon, toast } from '../../ui/widgets'
import { ChevronDown, ChevronUp, X } from 'lucide'
import type { ZoomControl } from '../../ui/zoom'
import { Find, setupFindPanel } from './find'
import { currentLayout, notesHtml, PAGE_GAP_PX, Pagination, relayout, type Layout } from './pages'
import { buildToolbar, setupContextMenu, writerFrame, ZOOMS } from './commands'
import { t, tn } from '../../core/i18n'
import { authorDirectory, PENDING_COMMENTS, userIdOf, type Access } from './collab'
import { Review, type CommentRecord, type CommentThread } from './review'
import { AuthorshipView } from './authorship'
import { editEquation } from '../../ui/equation'
import type { EquationEditDetail } from './editor/equation'
import { PositionIndex, encodeAnchor } from './ypos'
import type { CommentData } from './formats/types'
import { authorColor } from './formats/review'
import { SpellController, spellExtension } from './spell/plugin'
import { languageButton, openSpellDialog } from './spell/ui'
import { ReferenceStore } from './references/store'
import { installDocumentFonts } from './fonts'

const UNTITLED = t('Untitled document')
const ZOOM_KEY = 'words-online:zoom'

const MAIN_HTML = `
  <div id="find-panel" class="find-panel" hidden>
    <div class="find-row">
      <input data-find placeholder="${t('Find in document')}" aria-label="${t('Find')}" />
      <span data-count class="find-count"></span>
      <button type="button" data-prev title="${t('Previous (Shift+Enter)')}" aria-label="${t('Previous (Shift+Enter)')}"></button>
      <button type="button" data-next title="${t('Next (Enter)')}" aria-label="${t('Next (Enter)')}"></button>
      <button type="button" data-close title="${t('Close (Esc)')}" aria-label="${t('Close (Esc)')}"></button>
    </div>
    <div class="find-row" data-replace-row>
      <input data-replace placeholder="${t('Replace with')}" aria-label="${t('Replace with')}" />
      <button type="button" data-replace-one>${t('Replace')}</button>
      <button type="button" data-replace-all>${t('Replace all')}</button>
    </div>
    <label class="find-option"><input type="checkbox" data-case /> ${t('Match case')}</label>
  </div>
  <div id="canvas" class="canvas">
    <div class="canvas-row">
      <div id="zoom-wrap" class="zoom-wrap">
        <div id="paper" class="paper">
          <div id="page-sheets" class="page-layer"></div>
          <div id="editor"></div>
          <div id="page-chrome" class="page-layer page-chrome"></div>
        </div>
      </div>
      <aside id="review-rail" class="review-rail" aria-label="${t('Comments and suggestions')}" hidden></aside>
    </div>
  </div>
  <input id="file-input" type="file" hidden />
  <input id="image-input" type="file" accept="image/*" hidden />`

// Moved into the shared status bar (left: page and counts; right: mode and comments).
const STATUS_HTML = `
  <span id="status-page"></span>
  <span id="status-words"></span>
  <span id="status-chars" class="hide-narrow"></span>
  <span id="status-mode" class="status-mode" hidden></span>
  <button id="status-comments" class="status-comments" hidden></button>`

export interface WriterContext {
  session: Session
  editor: Editor
  meta: Y.Map<unknown>
  getPage: () => PageSettings
  setPage: (page: PageSettings) => void
  getColumns: () => Columns
  setColumns: (columns: Columns) => void
  layout: () => Layout
  setZoom: (zoom: number) => void
  getZoom: () => number
  find: { open: (replace?: boolean) => void }
  newDocument: () => void
  openFile: () => void
  download: (format: ExportFormat) => void
  print: () => void
  openUrl: (id: string, key: string) => string
  pages: () => number
  access: Access
  review: Review
  authorship: AuthorshipView
  // Local editing mode for editors: direct edits or suggestions.
  isSuggesting: () => boolean
  setSuggesting: (on: boolean) => void
  insertEquation: (display?: boolean) => void
  references: ReferenceStore
  showContributions: () => void
  spell: SpellController
}

export function mountWriter(session: Session, root: HTMLElement): WriterContext {
  const { doc, awareness, user } = session
  const access = session.access
  const editable = session.canEdit
  const meta = doc.getMap<unknown>('meta')
  installDocumentFonts()
  const shell = renderShell(appInfo('writer'), root)
  shell.main.innerHTML = MAIN_HTML
  for (const [sel, node] of [['[data-prev]', ChevronUp], ['[data-next]', ChevronDown], ['[data-close]', X]] as const) shell.main.querySelector(sel)!.append(icon(node, 16))
  shell.statusbar.innerHTML = STATUS_HTML
  setupChrome(session, UNTITLED)

  // ---------- Page settings (shared) ----------

  const getPage = (): PageSettings => {
    const raw = meta.get('page')
    if (typeof raw === 'string') {
      try {
        return { ...DEFAULT_PAGE, ...JSON.parse(raw) }
      } catch {
        // Fall through to defaults.
      }
    }
    return DEFAULT_PAGE
  }
  const setPage = (page: PageSettings) => meta.set('page', JSON.stringify(page))

  // Columns of the first section (later sections: section break nodes).
  const getColumns = (): Columns => {
    const raw = meta.get('columns')
    if (typeof raw === 'string') {
      try {
        return normalizeColumns(JSON.parse(raw))
      } catch {
        // Fall through to one column.
      }
    }
    return normalizeColumns(null)
  }
  const setColumns = (columns: Columns) => meta.set('columns', JSON.stringify(normalizeColumns(columns)))

  // ---------- Header / footer rendering ----------

  const headerFragment = doc.getXmlFragment('header')
  const footerFragment = doc.getXmlFragment('footer')
  const hfExtensions = headerFooterExtensions()
  let headerHtml = ''
  let footerHtml = ''
  const renderFragment = (fragment: Y.XmlFragment) => {
    if (fragment.length === 0) return ''
    try {
      const json = yXmlFragmentToProsemirrorJSON(fragment) as JSONContent
      return isEmptyDoc(json) ? '' : generateHTML(json, hfExtensions)
    } catch {
      return ''
    }
  }
  const refreshChrome = () => {
    headerHtml = renderFragment(headerFragment)
    footerHtml = renderFragment(footerFragment)
  }
  refreshChrome()
  const fillFields = (html: string, page: number, total: number) =>
    html.replace(/<span([^>]*data-page-field[^>]*)>[^<]*<\/span>/g, (_m, attrs: string) =>
      `<span${attrs}>${/data-kind="total"/.test(attrs) ? total : page}</span>`,
    )
  const chrome = {
    header: (page: number, total: number) => fillFields(headerHtml, page, total),
    footer: (page: number, total: number) => fillFields(footerHtml, page, total),
  }

  // ---------- Editor ----------

  const paper = document.getElementById('paper')!
  const sheets = document.getElementById('page-sheets')!
  const pageChrome = document.getElementById('page-chrome')!
  const editorHost = document.getElementById('editor')!
  let layout: Layout = { pages: [], width: 794, height: 1123, anchors: new Map() }
  let printing = false
  let review: Review | null = null
  const spell = new SpellController(meta, () => editor.isEditable)
  const references = new ReferenceStore(doc, meta, () => spell.docLang())

  const editor = new Editor({
    element: document.getElementById('editor')!,
    extensions: [
      ...bodyExtensions({
        history: false,
        placeholder: t('Start typing…'),
        toc: { pageOf: (view, pos) => pageOfPosition(currentLayout(view), pos), defaultTitle: () => tocTitle(spell.docLang()) },
      }),
      Collaboration.configure({ document: doc, field: 'body' }),
      CollaborationCaret.configure({
        provider: { awareness },
        user: { name: user.name, color: user.color },
      }),
      Pagination.configure({
        firstSection: () => ({ page: getPage(), columns: getColumns() }),
        gap: () => (printing ? 0 : PAGE_GAP_PX),
        onLayout: (l) => applyLayout(l),
      }),
      Find,
      spellExtension(spell),
    ],
    editable,
    editorProps: {
      // spellcheck and lang come from the spelling extension.
      handlePaste: (_view, event) => insertImageFiles(event.clipboardData?.files),
      handleDrop: (_view, event) => insertImageFiles((event as DragEvent).dataTransfer?.files),
    },
    autofocus: editable ? 'start' : false,
  })

  // ---------- Review: comments, suggestions, authorship ----------

  const rail = document.getElementById('review-rail')!
  rail.setAttribute('aria-label', t('Comments and suggestions'))
  review = new Review({ session, editor, access, rail, paper, onVisibilityChange: () => updateZoomBox() })
  const authors = authorDirectory(session)
  const authorship = new AuthorshipView(editor, session, authors)
  editor.registerPlugin(review.plugin())
  editor.registerPlugin(authorship.plugin())
  const suggestionStorage = editor.storage.suggestions
  const syncSuggestionUser = () => {
    const me = session.user
    suggestionStorage.user = { id: userIdOf(session), name: me.name, color: me.color }
  }
  syncSuggestionUser()
  suggestionStorage.client = doc.clientID
  awareness.on('change', syncSuggestionUser)

  function insertImageFiles(files: FileList | undefined | null): boolean {
    const images = [...(files ?? [])].filter((f) => f.type.startsWith('image/'))
    if (!images.length) return false
    images.forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => editor.chain().focus().setImage({ src: String(reader.result) }).run()
      reader.readAsDataURL(file)
    })
    return true
  }

  // Sheets under the editor; headers, footers, footnotes and column lines over it.
  let drawn = ''
  function applyLayout(next: Layout) {
    layout = next
    const total = layout.pages.length
    const pages = layout.pages.map((p) => {
      const { width, height, margins: m } = p.geo
      const box = (top: number, h: number) => `left:${p.x}px;top:${p.y + top}px;width:${width}px;height:${h}px`
      return {
        sheet: `<div class="page-sheet" style="${box(0, height)}"></div>`,
        chrome:
          `<div class="page-header" data-page="${p.index}" style="${box(0, m.top)};padding:0 ${m.right}px 0 ${m.left}px">${chrome.header(p.index + 1, total)}</div>` +
          (p.notes.length ? `<div class="page-notes-box" style="left:${p.x + m.left}px;top:${p.y}px;width:${width - m.left - m.right}px;height:${height - m.bottom}px">${notesHtml(p.notes, p.firstNote)}</div>` : '') +
          p.lines.map((l) => `<div class="column-line" style="left:${p.x + l.x}px;top:${p.y + l.top}px;height:${l.bottom - l.top}px"></div>`).join('') +
          `<div class="page-footer" data-page="${p.index}" style="${box(height - m.bottom, m.bottom)};padding:0 ${m.right}px 0 ${m.left}px">${chrome.footer(p.index + 1, total)}</div>`,
      }
    })
    const html = pages.map((p) => p.sheet).join('') + '\u0000' + pages.map((p) => p.chrome).join('')
    if (html !== drawn) {
      drawn = html
      sheets.innerHTML = pages.map((p) => p.sheet).join('')
      pageChrome.innerHTML = pages.map((p) => p.chrome).join('')
    }
    paper.style.width = `${layout.width}px`
    paper.style.height = `${layout.height}px`
    editorHost.style.height = `${layout.height}px`
    paper.style.setProperty('--pages', String(total))
    updateStatus()
    updateZoomBox()
    review?.reposition()
  }

  // Page size for printing (mixed sizes are printed through the PDF export).
  const printStyle = document.createElement('style')
  document.head.append(printStyle)
  function applyGeometry() {
    const { width, height } = pageDimensionsMm(getPage())
    printStyle.textContent = `@page { size: ${width}mm ${height}mm; margin: 0 }`
    relayout(editor.view)
  }
  applyGeometry()

  meta.observe((event) => {
    if (event.keysChanged.has('page') || event.keysChanged.has('columns')) applyGeometry()
  })
  const onChromeChange = () => {
    refreshChrome()
    drawn = ''
    relayout(editor.view)
  }
  headerFragment.observeDeep(onChromeChange)
  footerFragment.observeDeep(onChromeChange)

  // ---------- Zoom ----------

  const canvas = document.getElementById('canvas')!
  const zoomWrap = document.getElementById('zoom-wrap')!
  let zoomControl: ZoomControl | undefined
  let zoom = Number(localStorage.getItem(ZOOM_KEY)) || (window.innerWidth < 900 ? 0 : 1)
  const railWidth = () => (rail.hidden || window.innerWidth <= 760 ? 0 : rail.offsetWidth + 16)
  const effectiveZoom = () => (zoom > 0 ? zoom : Math.min(2, (canvas.clientWidth - 32 - railWidth()) / layout.width))
  function updateZoomBox() {
    const z = effectiveZoom()
    paper.style.transform = `scale(${z})`
    zoomWrap.style.width = `${paper.offsetWidth * z}px`
    zoomWrap.style.height = `${paper.offsetHeight * z}px`
    zoomControl?.update()
    review?.reposition()
  }
  const setZoom = (value: number) => {
    zoom = value
    try {
      localStorage.setItem(ZOOM_KEY, String(zoom))
    } catch {
      // Storage unavailable: zoom is not remembered.
    }
    updateZoomBox()
  }
  new ResizeObserver(updateZoomBox).observe(paper)
  window.addEventListener('resize', updateZoomBox)

  // ---------- Status bar ----------

  const statusPage = document.getElementById('status-page')!
  const statusWords = document.getElementById('status-words')!
  const statusChars = document.getElementById('status-chars')!
  function currentPage(): number {
    try {
      const coords = editor.view.coordsAtPos(editor.state.selection.head)
      const rect = paper.getBoundingClientRect()
      const y = (coords.top - rect.top) / effectiveZoom()
      const page = [...layout.pages].reverse().find((p) => p.y <= y + 1)
      return page ? page.index + 1 : 1
    } catch {
      return 1
    }
  }
  function updateStatus() {
    const words = editor.storage.characterCount.words() as number
    const chars = editor.storage.characterCount.characters() as number
    statusPage.textContent = t('Page {page} of {pages}', { page: currentPage(), pages: Math.max(1, layout.pages.length) })
    statusWords.textContent = tn(words, '{n} word', '{n} words')
    statusChars.textContent = tn(chars, '{n} character', '{n} characters')
  }
  editor.on('update', updateStatus)
  editor.on('selectionUpdate', updateStatus)

  // ---------- Documents ----------

  const openUrl = (id: string, key: string) => docPath('writer', id, key)
  const newDocument = () => window.open(newDocPath('writer'), '_blank')

  const fileInput = document.getElementById('file-input') as HTMLInputElement
  fileInput.accept = OPEN_ACCEPT
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (!file) return
    try {
      toast(t('Opening…'))
      location.href = await importFileAsDocument(file)
    } catch (err) {
      toast(t('Could not open the file: {message}', { message: (err as Error).message }))
    }
  })

  const documentData = (): DocumentData => {
    const header = yXmlFragmentToProsemirrorJSON(headerFragment) as JSONContent
    const footer = yXmlFragmentToProsemirrorJSON(footerFragment) as JSONContent
    const { body, comments } = bodyWithComments(editor, review!.collectThreads())
    return {
      title: String(meta.get('title') || UNTITLED),
      body,
      comments,
      header: headerFragment.length && !isEmptyDoc(header) ? header : null,
      footer: footerFragment.length && !isEmptyDoc(footer) ? footer : null,
      page: getPage(),
      columns: getColumns(),
      lang: langTag(spell.docLang()),
      sources: references.sources(),
      citeStyle: references.settings(),
    }
  }

  async function download(format: ExportFormat) {
    try {
      const data = documentData()
      const blob = await exportFile(format, data, editor.getHTML(), editor.getText({ blockSeparator: '\n' }))
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${data.title.replace(/[\\/:*?"<>|]+/g, '_')}.${format}`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    } catch (err) {
      toast(t('Download failed: {message}', { message: (err as Error).message }))
    }
  }

  const exportBlob = (format: ExportFormat) => () => exportFile(format, documentData(), editor.getHTML(), editor.getText({ blockSeparator: '\n' }))
  session.hooks.exportFormats = () => [
    { ext: 'docx', label: t('Word (.docx)'), build: exportBlob('docx') },
    { ext: 'odt', label: t('OpenDocument text (.odt)'), build: exportBlob('odt') },
    { ext: 'html', label: t('Web page (.html)'), build: exportBlob('html') },
    { ext: 'txt', label: t('Plain text (.txt)'), build: exportBlob('txt') },
    { ext: 'pdf', label: t('PDF document (.pdf)'), build: () => import('./pdf').then((m) => m.exportPdf(ctx)) },
  ]

  const print = () => {
    // Pages of different sizes cannot share one @page size: print the PDF instead.
    const sizes = layout.pages.map((p) => `${p.geo.width}x${p.geo.height}`)
    if (new Set(sizes).size > 1) {
      void import('./pdf').then((m) => m.printPdf(ctx))
      return
    }
    window.print()
  }
  // Printing (also from the browser menu) lays the pages out without gaps at 100%.
  window.addEventListener('beforeprint', () => {
    printing = true
    paper.classList.add('printing')
    paper.style.transform = 'none'
    relayout(editor.view)
  })
  window.addEventListener('afterprint', () => {
    printing = false
    paper.classList.remove('printing')
    relayout(editor.view)
    updateZoomBox()
  })

  // ---------- Wiring ----------

  const find = setupFindPanel(editor, document.getElementById('find-panel')!)
  const ctx: WriterContext = {
    session,
    editor,
    meta,
    getPage,
    setPage,
    setZoom,
    getZoom: () => zoom,
    find,
    newDocument,
    openFile: () => fileInput.click(),
    download,
    print,
    openUrl,
    pages: () => Math.max(1, layout.pages.length),
    layout: () => currentLayout(editor.view),
    getColumns,
    setColumns,
    access,
    review,
    authorship,
    isSuggesting: () => suggestionStorage.enabled,
    setSuggesting: (on) => {
      if (!editable) return
      editor.commands.setSuggesting(on)
      updateMode()
    },
    insertEquation: async (display = false) => {
      if (!editable) return
      const { from, to } = editor.state.selection
      const value = await editEquation({ display })
      if (!value) return
      editor.chain().focus().insertContentAt({ from, to }, { type: 'equation', attrs: value }).run()
    },
    references,
    showContributions: () => void import('./authorship').then((a) => a.contributionsDialog(editor, session, authors)),
    spell,
  }
  const statusItems = [...shell.statusbar.children] as HTMLElement[]
  const frame = mountFrame({
    session,
    shell,
    ...writerFrame(ctx),
    zoom: {
      get: effectiveZoom,
      set: setZoom,
      fit: () => setZoom(0),
      isFit: () => zoom === 0,
      min: 0.5,
      max: 2,
      presets: ZOOMS,
    },
    status: { language: languageButton(spell) },
  })
  zoomControl = frame.status?.zoom
  frame.status?.left.append(...statusItems.filter((n) => !n.matches('.status-mode, .status-comments')))
  frame.status?.addRight(...statusItems.filter((n) => n.matches('.status-mode, .status-comments')))
  buildToolbar(ctx, frame.toolbar)
  setupContextMenu(ctx)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F7' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      openSpellDialog(spell)
    }
  })

  // Double-click on a header or footer area to edit them.
  paper.addEventListener('dblclick', (e) => {
    const target = e.target as HTMLElement
    if (editable && target.closest('.page-header, .page-footer')) import('./dialogs').then((d) => d.editHeaderFooter(ctx))
  })
  // Click on a footnote reference to edit it; double click on a citation.
  editor.view.dom.addEventListener('click', (e) => {
    if (!editable) return
    const ref = (e.target as HTMLElement).closest('sup.footnote-ref')
    if (ref) import('./dialogs').then((d) => d.editFootnoteAt(ctx, editor.view.posAtDOM(ref, 0)))
  })
  editor.view.dom.addEventListener('dblclick', (e) => {
    const cite = (e.target as HTMLElement).closest('span.citation')
    if (editable && cite) import('./references/ui').then((m) => m.citationDialog(ctx, editor.view.posAtDOM(cite, 0)))
  })
  // Double click (or Enter) on an equation edits it.
  editor.view.dom.addEventListener('equation-edit', async (e) => {
    if (!editable) return
    const { pos, latex, display } = (e as CustomEvent<EquationEditDetail>).detail
    const value = await editEquation({ latex, display })
    const node = editor.state.doc.nodeAt(pos)
    if (!value || node?.type.name !== 'equation') return
    editor.chain().focus().command(({ tr }) => {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...value })
      return true
    }).run()
  })

  // Status bar: editing mode and, on narrow screens, the comments panel.
  const statusMode = document.getElementById('status-mode')!
  const statusComments = document.getElementById('status-comments')!
  function updateMode() {
    // Read-only access is shown by the app bar badge.
    statusMode.hidden = !suggestionStorage.enabled
    statusMode.textContent = t('Suggesting')
    statusMode.className = 'status-mode suggesting'
    document.body.classList.toggle('writer-readonly', !editable)
  }
  updateMode()
  statusComments.addEventListener('click', () => {
    review!.panelOpen = !review!.panelOpen
    rail.classList.toggle('open', review!.panelOpen)
    review!.reposition()
  })
  const updateCommentsButton = () => {
    const n = review!.count
    statusComments.hidden = n === 0
    statusComments.textContent = t('Comments ({n})', { n })
  }
  editor.on('transaction', updateCommentsButton)

  // Common keys (Ctrl+O/S/P/F/H, Ctrl+/, F1) come from the frame; Ctrl+Alt+M comments.
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey
    if (!mod) return
    const key = e.key.toLowerCase()
    if ((key === 'm' || e.code === 'KeyM') && e.altKey) {
      e.preventDefault()
      review!.startComment()
    }
  })

  // Handle for automated browser tests in development builds only.
  if (import.meta.env.DEV) Object.assign(window, { editor, spell, writer: ctx })

  updateStatus()
  updateZoomBox()
  // Header/footer schema must be registered for rendering even before first use.
  void getSchema(hfExtensions)
  return ctx
}

// Page (1-based) of a heading, from the layout's heading anchors.
function pageOfPosition(layout: Layout, pos: number): number | null {
  const exact = layout.anchors.get(pos)
  if (exact) return exact.page + 1
  let best: { pos: number; page: number } | null = null
  for (const [p, a] of layout.anchors) if (p <= pos && (!best || p > best.pos)) best = { pos: p, page: a.page }
  return best ? best.page + 1 : null
}

// Title of a new table of contents in the document language.
function tocTitle(lang: unknown): string {
  const base = String(lang ?? '').slice(0, 2)
  return { es: 'Índice', gl: 'Índice', fr: 'Table des matières', de: 'Inhaltsverzeichnis' }[base] ?? 'Contents'
}

function isEmptyDoc(json: JSONContent): boolean {
  const content = json.content ?? []
  return content.length === 0 || (content.length === 1 && content[0].type === 'paragraph' && !content[0].content?.length)
}

// Imports a Word/ODT/HTML/text file into a new local document; returns its path.
export async function importFileAsDocument(file: File): Promise<string> {
  const imported = await importFile(file)
  const title = file.name.replace(/\.[^.]+$/, '')
  const schema = getSchema(allExtensions())
  const { body, ranges } = extractCommentRanges(schema, imported.body)
  return createLocalDocument('writer', title, (ydoc) => {
    prosemirrorJSONToYXmlFragment(schema, body, ydoc.getXmlFragment('body'))
    if (imported.header && !isEmptyDoc(imported.header)) prosemirrorJSONToYXmlFragment(schema, imported.header, ydoc.getXmlFragment('header'))
    if (imported.footer && !isEmptyDoc(imported.footer)) prosemirrorJSONToYXmlFragment(schema, imported.footer, ydoc.getXmlFragment('footer'))
    ydoc.getMap<unknown>('meta').set('page', JSON.stringify(imported.page))
    if (imported.columns && imported.columns.count > 1) ydoc.getMap<unknown>('meta').set('columns', JSON.stringify(imported.columns))
    if (imported.sources?.length) {
      const map = ydoc.getMap<unknown>('sources')
      for (const s of imported.sources) map.set(s.id, s)
    }
    if (imported.citeStyle) ydoc.getMap<unknown>('meta').set('cite', JSON.stringify(imported.citeStyle))
    const lang = langCode(imported.lang)
    if (lang) ydoc.getMap<unknown>('meta').set('lang', lang)
    // The new document has no comments channel yet: the first editor to open it moves them there.
    if (imported.comments?.length) writeImportedComments(ydoc, schema, ranges, imported.comments)
  })
}

// Body JSON for the converters, with comment ranges as `commentRange` marks
// (added in a transaction that is never applied), and the comments themselves.
function bodyWithComments(editor: Editor, threads: CommentThread[]): { body: JSONContent; comments: CommentData[] } {
  const type = editor.schema.marks.commentRange
  const tr = editor.state.tr
  const comments: CommentData[] = []
  for (const { comment, replies, range } of threads) {
    // Comments whose text was deleted have nothing to attach to.
    if (!range || range.from >= range.to) continue
    tr.addMark(range.from, range.to, type.create({ id: comment.id }))
    comments.push({ id: comment.id, author: comment.author, date: comment.time, text: comment.text, resolved: comment.resolved })
    for (const r of replies) comments.push({ id: r.id, parentId: comment.id, author: r.author, date: r.time, text: r.text })
  }
  return { body: tr.doc.toJSON() as JSONContent, comments }
}

interface CommentSpan {
  from: number
  to: number
  quote?: string
}

// Comment ranges of an imported body (commentRange marks), and the body without them.
function extractCommentRanges(schema: Schema, json: JSONContent): { body: JSONContent; ranges: Map<string, CommentSpan> } {
  const ranges = new Map<string, CommentSpan>()
  const type = schema.marks.commentRange
  let doc: PMNode
  try {
    doc = PMNode.fromJSON(schema, json)
  } catch {
    return { body: json, ranges }
  }
  let found = false
  doc.descendants((node, pos) => {
    for (const mark of node.marks) {
      if (mark.type !== type) continue
      found = true
      const id = String(mark.attrs.id)
      const r = ranges.get(id)
      ranges.set(id, { from: Math.min(r?.from ?? pos, pos), to: Math.max(r?.to ?? 0, pos + node.nodeSize) })
    }
    return true
  })
  if (!found) return { body: json, ranges }
  for (const r of ranges.values()) r.quote = doc.textBetween(r.from, r.to, ' ', '▫').slice(0, 200)
  const tr = new Transform(doc).removeMark(0, doc.content.size, type)
  return { body: tr.doc.toJSON() as JSONContent, ranges }
}

function writeImportedComments(ydoc: Y.Doc, schema: Schema, ranges: Map<string, CommentSpan>, comments: CommentData[]) {
  const map = ydoc.getMap<CommentRecord>(PENDING_COMMENTS)
  const index = new PositionIndex(ydoc.getXmlFragment('body'), schema)
  const ids = new Set(comments.map((c) => c.id))
  for (const c of comments) {
    const parent = c.parentId && ids.has(c.parentId) ? c.parentId : undefined
    const range = ranges.get(c.id)
    if (!parent && !range) continue
    const record: CommentRecord = {
      id: `i${c.id}`,
      authorId: `import:${c.author}`,
      author: c.author || t('Unknown author'),
      color: authorColor(c.author),
      time: c.date || Date.now(),
      text: c.text,
      ...(parent ? { parent: `i${parent}` } : { anchor: encodeAnchor(index, range!.from, range!.to), quote: range!.quote }),
      ...(c.resolved ? { resolved: true } : {}),
    }
    map.set(record.id, record)
  }
}

export { OPEN_ACCEPT }
