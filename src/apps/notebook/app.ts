// Ofimeo Notebook: class notes in sections (coloured tabs) and pages (with
// subpages). A page is flowing rich text (the writer's editor: headings,
// lists, checklists, tables, pictures, links, equations, code) with tags on
// paragraphs, attached files and an ink layer for the pen, the highlighter and
// a stylus. See model.ts for the data, nav.ts for sections and pages, ink.ts
// for drawing and export.ts for files.
//
// One editor at a time is bound to the open page (Collaboration on the page's
// XmlFragment); opening another page rebuilds it. Comments are per page (the
// writer's Review on the comments map of the page).

import * as Y from 'yjs'
import { Editor } from '@tiptap/core'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import { yUndoPluginKey } from '@tiptap/y-tiptap'
import { TextSelection } from '@tiptap/pm/state'
import {
  Bold,
  Eraser,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  MessageSquarePlus,
  PanelLeft,
  Paperclip,
  Pen,
  Printer,
  Redo2,
  Sigma,
  Strikethrough,
  Table,
  Tag,
  Tags,
  Type,
  Underline,
  Undo2,
} from 'lucide'
import { appInfo } from '../registry'
import { t, tn } from '../../core/i18n'
import { downloadBlob, safeFileName } from '../../core/handin'
import { takeNewDoc } from '../../core/router'
import type { ExportOption, Session } from '../../core/session'
import { provideWebMcpTools } from '../../core/webmcp'
import { setupChrome } from '../../ui/chrome'
import { mountFrame, BREAKPOINTS } from '../../ui/frame'
import { renderShell } from '../../ui/shell'
import { mod } from '../../ui/shortcuts'
import { closePopover, el, icon, openPopover, toast, type Menu, type MenuEntry } from '../../ui/widgets'
import { zoomMenuItems, type ZoomTarget } from '../../ui/zoom'
import { editEquation } from '../../ui/equation'
import type { WriterContext } from '../writer/app'
import type { EquationEditDetail } from '../writer/editor/equation'
import { Review } from '../writer/review'
import { userIdOf } from '../writer/collab'
import { formatSize, notebookExtensions } from './extensions'
import { InkLayer, type Tool } from './ink'
import { createNav, type Nav } from './nav'
import { exportNotebookZip, exportScope, filesFromList, filesFromZip, importMarkdownFiles, notebookTitle, type Scope } from './export'
import { TAG_KEYS, tagSummary } from './tags'
import {
  addPage,
  addSection,
  allPages,
  commentsField,
  inkArray,
  NB_ORIGIN,
  PAGE_WIDTH,
  pageDate,
  pageField,
  pagesMap,
  pageTitle,
  readPages,
  readSections,
  sectionsMap,
  tagLabel,
  TAG_IDS,
  updatePage,
  type TagId,
} from './model'

export const NOTEBOOK_ACCEPT = '.zip,.md,.markdown'

// Pictures larger than this are scaled down; other files larger than FILE_MAX are refused.
const IMAGE_MAX = 1024 * 1024
const IMAGE_MAX_SIDE = 1600
const FILE_MAX = 5 * 1024 * 1024
const ZOOMS = [0.5, 0.75, 0.9, 1, 1.25, 1.5, 2]
const LAST_PAGE_KEY = 'words-online:notebook-page:'
const PEN_COLORS = ['#1a237e', '#000000', '#c62828', '#2e7d32', '#1565c0', '#6a1b9a', '#ef6c00']
const HIGHLIGHT_COLORS = ['#ffeb3b', '#76ff03', '#18ffff', '#ff4081', '#ffab40']
const WIDTHS: [number, string][] = [
  [1.5, t('Fine')],
  [3, t('Medium')],
  [6, t('Thick')],
]

export interface OpenOptions {
  focus?: boolean
  focusTitle?: boolean
  // Select the first occurrence of this text.
  select?: string
  // Put the cursor in the n-th tagged paragraph (tag summary).
  tagIndex?: number
}

export interface NotebookContext {
  session: Session
  doc: Y.Doc
  current(): string | null
  currentSection(): string | null
  openPage(id: string | null, options?: OpenOptions): void
  selectSection(id: string): void
  editor(): Editor | null
  exportScope(scope: Scope, format: 'docx' | 'odt' | 'pdf' | 'md'): void
  printScope(scope: Scope): void
  undo(): void
  redo(): void
  ink: InkLayer
  nav: Nav
}

export function mountNotebook(session: Session, root: HTMLElement): NotebookContext {
  const { doc, awareness } = session
  const info = appInfo('notebook')
  const canEdit = session.canEdit
  const shell = renderShell(info, root)
  setupChrome(session, info.untitled)
  shell.main.classList.add('nb-main')

  // ---------- Layout ----------

  const titleInput = el('input', { class: 'nb-page-title', placeholder: t('Page title'), readOnly: !canEdit })
  titleInput.setAttribute('aria-label', t('Page title'))
  const dateLine = el('div', { class: 'nb-page-date' })
  const content = el('div', { class: 'nb-content' })
  const sheet = el('article', { class: 'nb-sheet' }, el('header', { class: 'nb-page-head' }, titleInput, dateLine), content)
  sheet.style.width = `${PAGE_WIDTH}px`
  const zoomWrap = el('div', { class: 'nb-zoom' }, sheet)
  const rail = el('aside', { class: 'review-rail', hidden: true })
  rail.setAttribute('aria-label', t('Comments'))
  const empty = el('div', { class: 'nb-empty-state', hidden: true })
  const navToggle = el('button', { type: 'button', class: 'nb-nav-toggle' }, icon(PanelLeft, 18), el('span', { class: 'nb-nav-label' }))
  navToggle.setAttribute('aria-controls', 'nb-nav')
  navToggle.setAttribute('aria-expanded', 'false')
  const canvas = el('div', { class: 'nb-canvas' }, navToggle, el('div', { class: 'nb-canvas-row' }, zoomWrap, rail), empty)
  const scrim = el('div', { class: 'nb-scrim', hidden: true })
  const fileInput = el('input', { type: 'file', accept: NOTEBOOK_ACCEPT, multiple: true, hidden: true })
  const folderInput = el('input', { type: 'file', hidden: true })
  folderInput.setAttribute('webkitdirectory', '')
  const attachInput = el('input', { type: 'file', multiple: true, hidden: true })
  const imageInput = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true })
  const layout = el('div', { class: 'nb-layout' })
  shell.main.append(layout, fileInput, folderInput, attachInput, imageInput)

  // ---------- State ----------

  let current: string | null = null
  let selectedSection: string | null = null
  let editor: Editor | null = null
  let review: Review | null = null
  const nbUndo = new Y.UndoManager([sectionsMap(doc), pagesMap(doc)], { trackedOrigins: new Set([NB_ORIGIN]), captureTimeout: 600 })
  const stamp = (e: { stackItem: { meta: Map<string, unknown> } }) => e.stackItem.meta.set('nb-time', performance.now())
  nbUndo.on('stack-item-added', stamp)
  const textUndo = () => (editor ? (yUndoPluginKey.getState(editor.state)?.undoManager as Y.UndoManager | undefined) : undefined)
  const lastTime = (stack: { meta: Map<string, unknown> }[] | undefined) => Number(stack?.at(-1)?.meta.get('nb-time') ?? -1)
  // Undo/redo whichever changed last: the page text or the notebook (pages, sections, ink).
  const undo = () => {
    if (!canEdit) return
    if (lastTime(nbUndo.undoStack) > lastTime(textUndo()?.undoStack)) nbUndo.undo()
    else editor?.chain().focus().undo().run()
  }
  const redo = () => {
    if (!canEdit) return
    if (lastTime(nbUndo.redoStack) > lastTime(textUndo()?.redoStack)) nbUndo.redo()
    else editor?.chain().focus().redo().run()
  }
  const canUndo = () => canEdit && (nbUndo.canUndo() || !!editor?.can().undo())
  const canRedo = () => canEdit && (nbUndo.canRedo() || !!editor?.can().redo())

  const currentSection = () => {
    const page = current ? pagesMap(doc).get(current) : undefined
    return page?.section ?? (selectedSection && sectionsMap(doc).has(selectedSection) ? selectedSection : readSections(doc)[0]?.id ?? null)
  }

  // ---------- Zoom (the page has a fixed width, scaled to fit narrow windows) ----------

  const zoomKey = 'words-online:notebook-zoom'
  let zoom = Number(readLocal(zoomKey)) || 0
  const railWidth = () => (rail.hidden || window.innerWidth <= BREAKPOINTS.narrow ? 0 : rail.offsetWidth + 16)
  // Fit: the page width (with the comments), never larger than 100 %.
  const effectiveZoom = () => (zoom > 0 ? zoom : Math.min(1, Math.max(0.3, (canvas.clientWidth - 24 - railWidth()) / PAGE_WIDTH)))
  let status: ReturnType<typeof mountFrame>['status']
  const updateZoom = () => {
    const z = effectiveZoom()
    sheet.style.transform = `scale(${z})`
    const minHeight = Math.max(1056, ink.bottom() + 240)
    sheet.style.minHeight = `${minHeight}px`
    zoomWrap.style.width = `${PAGE_WIDTH * z}px`
    zoomWrap.style.height = `${sheet.offsetHeight * z}px`
    status?.zoom?.update()
    review?.reposition()
  }
  const setZoom = (value: number) => {
    zoom = value
    try {
      localStorage.setItem(zoomKey, String(zoom))
    } catch {
      // Not remembered.
    }
    updateZoom()
  }
  const zoomTarget: ZoomTarget = { get: effectiveZoom, set: setZoom, fit: () => setZoom(0), isFit: () => zoom === 0, min: 0.3, max: 2, presets: ZOOMS, keys: true }

  // ---------- Ink ----------

  const ink = new InkLayer({
    doc,
    host: sheet,
    scale: effectiveZoom,
    canEdit: () => canEdit && !!current,
    onGesture: () => nbUndo.stopCapturing(),
    onChange: () => updateZoom(),
  })
  const setTool = (tool: Tool) => {
    if (!canEdit && tool !== 'type') return
    ink.setTool(tool)
    sheet.classList.toggle('inking', tool !== 'type')
    frame?.toolbar.refresh()
  }

  // ---------- Pages ----------

  const pageRecord = () => (current ? pagesMap(doc).get(current) : undefined)
  const showPageHead = (force = false) => {
    const page = pageRecord()
    if (force || document.activeElement !== titleInput) titleInput.value = page?.title ?? ''
    dateLine.textContent = page ? pageDate(page.created) : ''
    const section = readSections(doc).find((s) => s.id === page?.section)
    sheet.style.setProperty('--section-color', section?.color ?? 'var(--app-color)')
    navToggle.querySelector('.nb-nav-label')!.textContent = page ? pageTitle(page) : t('Sections and pages')
    document.title = `${page ? `${pageTitle(page)} · ` : ''}${notebookTitle(doc)} · ${info.product}`
  }
  titleInput.addEventListener('input', () => {
    if (canEdit && current) doc.transact(() => updatePage(doc, current!, { title: titleInput.value }), NB_ORIGIN)
  })
  titleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault()
      editor?.commands.focus('start')
    }
  })

  const destroyEditor = () => {
    review?.destroy()
    review = null
    editor?.destroy()
    editor = null
    rail.replaceChildren()
    rail.hidden = true
  }

  const createEditor = (id: string) => {
    destroyEditor()
    content.replaceChildren()
    const ed = new Editor({
      element: content,
      extensions: [
        ...notebookExtensions({ history: false, placeholder: canEdit ? t('Type your notes…') : '' }),
        Collaboration.configure({ document: doc, field: pageField(id) }),
        CollaborationCaret.configure({ provider: { awareness }, user: { name: session.user.name, color: session.user.color } }),
      ],
      editable: canEdit,
      editorProps: {
        handlePaste: (_view, event) => insertFiles(event.clipboardData?.files),
        handleDrop: (view, event) => {
          const files = (event as DragEvent).dataTransfer?.files
          if (!files?.length) return false
          const at = view.posAtCoords({ left: (event as DragEvent).clientX, top: (event as DragEvent).clientY })
          if (at) ed.commands.setTextSelection(at.pos)
          return insertFiles(files)
        },
      },
    })
    editor = ed
    const undoManager = yUndoPluginKey.getState(ed.state)?.undoManager as Y.UndoManager | undefined
    undoManager?.on('stack-item-added', stamp)
    review = new Review({ session, editor: ed, access: session.access, rail, paper: sheet, onVisibilityChange: () => updateZoom(), field: pageField(id), comments: session.commentsDoc.getMap(commentsField(id)) })
    ed.registerPlugin(review.plugin())
    const suggestions = ed.storage.suggestions as { user?: unknown; client?: number } | undefined
    if (suggestions) {
      suggestions.user = { id: userIdOf(session), name: session.user.name, color: session.user.color }
      suggestions.client = doc.clientID
    }
    ed.on('transaction', () => {
      frame?.toolbar.refresh()
      updateCommentsButton()
    })
    ed.on('update', () => {
      updateZoom()
      updateStatus()
    })
    ed.on('selectionUpdate', updateStatus)
    // Double click (or Enter) on an equation edits it.
    ed.view.dom.addEventListener('equation-edit', async (e) => {
      if (!canEdit) return
      const { pos, latex, display } = (e as CustomEvent<EquationEditDetail>).detail
      const value = await editEquation({ latex, display })
      const node = ed.state.doc.nodeAt(pos)
      if (!value || node?.type.name !== 'equation') return
      ed.chain().focus().command(({ tr }) => {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...value })
        return true
      }).run()
    })
    ed.view.dom.addEventListener('click', (e) => {
      const target = e.target as HTMLElement
      // Files download on click; a To do tag is ticked by clicking its box.
      const file = target.closest<HTMLAnchorElement>('a.nb-file')
      if (file) {
        e.preventDefault()
        const a = el('a', { href: file.getAttribute('href') ?? '', download: file.dataset.name ?? 'file' })
        a.click()
        return
      }
      const tagged = target.closest<HTMLElement>('[data-nb-tag]')
      if (tagged && canEdit && e.offsetX < 24 && target === tagged) {
        const tag = tagged.dataset.nbTag
        if (tag !== 'todo' && tag !== 'done') return
        const pos = ed.view.posAtDOM(tagged, 0) - 1
        const node = ed.state.doc.nodeAt(pos)
        if (node) ed.view.dispatch(ed.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, nbTag: tag === 'todo' ? 'done' : 'todo' }))
      }
    })
    return ed
  }

  const openPage = (id: string | null, options: OpenOptions = {}) => {
    if (id && !pagesMap(doc).has(id)) id = null
    const changed = id !== current || !editor
    if (changed) {
      current = id
      if (id) {
        nbUndo.addToScope(inkArray(doc, id))
        createEditor(id)
        selectedSection = pagesMap(doc).get(id)!.section
        try {
          localStorage.setItem(LAST_PAGE_KEY + session.docId, id)
        } catch {
          // Not remembered.
        }
      } else destroyEditor()
      ink.setPage(id)
      awareness.setLocalStateField('nbPage', id)
      canvas.scrollTop = 0
    }
    zoomWrap.hidden = !id
    showEmpty()
    showPageHead(changed)
    nav.render()
    updateZoom()
    updateStatus()
    frame?.toolbar.refresh()
    closeDrawer()
    const ed = editor
    if (!ed) return
    if (options.focusTitle && canEdit) titleInput.focus()
    else if (options.select) selectText(ed, options.select)
    else if (options.tagIndex !== undefined) selectTagged(ed, options.tagIndex)
    else if (options.focus) ed.commands.focus('start')
  }

  const selectSection = (id: string) => {
    selectedSection = id
    const pages = readPages(doc, id)
    if (pages.length) openPage(pages[0].id)
    else {
      openPage(null)
      nav.render()
    }
  }

  const showEmpty = () => {
    const sections = readSections(doc)
    empty.hidden = !!current
    if (current) return
    const section = currentSection()
    const text = !sections.length ? t('This notebook has no sections yet.') : section ? t('This section has no pages yet.') : ''
    const button = el('button', { type: 'button', class: 'primary', textContent: sections.length ? t('Add page') : t('Add section'), hidden: !canEdit })
    button.addEventListener('click', () => {
      let page = ''
      doc.transact(() => {
        const s = currentSection() ?? addSection(doc, t('Section {n}', { n: 1 }))
        page = addPage(doc, s)
      }, NB_ORIGIN)
      openPage(page, { focusTitle: true })
    })
    empty.replaceChildren(el('p', { textContent: text }), button)
  }

  // ---------- Files and pictures ----------

  async function imageSrc(file: File): Promise<string | null> {
    const dataUrl = await readDataUrl(file)
    if (file.size <= IMAGE_MAX && file.type !== 'image/bmp') {
      const img = await loadImage(dataUrl)
      if (!img || Math.max(img.naturalWidth, img.naturalHeight) <= IMAGE_MAX_SIDE) return dataUrl
    }
    const img = await loadImage(dataUrl)
    if (!img) return null
    const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
    const canvasEl = document.createElement('canvas')
    canvasEl.width = Math.round(img.naturalWidth * scale)
    canvasEl.height = Math.round(img.naturalHeight * scale)
    const g = canvasEl.getContext('2d')!
    g.fillStyle = '#fff'
    g.fillRect(0, 0, canvasEl.width, canvasEl.height)
    g.drawImage(img, 0, 0, canvasEl.width, canvasEl.height)
    return canvasEl.toDataURL('image/jpeg', 0.85)
  }

  function insertFiles(files: FileList | File[] | undefined | null, asAttachment = false): boolean {
    const list = [...(files ?? [])]
    if (!list.length || !editor || !canEdit) return false
    const ed = editor
    void (async () => {
      for (const file of list) {
        if (!asAttachment && file.type.startsWith('image/') && file.type !== 'image/svg+xml') {
          const src = await imageSrc(file)
          if (src && ed === editor) ed.chain().focus().setImage({ src, alt: file.name }).run()
          else if (!src) toast(t('Could not read the picture {name}', { name: file.name }))
          continue
        }
        if (file.size > FILE_MAX) {
          toast(t('“{name}” is too large to keep in the notebook ({size}; at most {max})', { name: file.name, size: formatSize(file.size), max: formatSize(FILE_MAX) }), 6000)
          continue
        }
        const src = await readDataUrl(file)
        if (ed === editor) ed.chain().focus().insertNbFile({ name: file.name, mime: file.type || 'application/octet-stream', size: file.size, src }).insertContent(' ').run()
      }
    })()
    return true
  }
  attachInput.addEventListener('change', () => {
    insertFiles([...(attachInput.files ?? [])], true)
    attachInput.value = ''
  })
  imageInput.addEventListener('change', () => {
    insertFiles([...(imageInput.files ?? [])])
    imageInput.value = ''
  })
  // Files dropped on the page outside the text go to the end of the page.
  sheet.addEventListener('dragover', (e) => canEdit && e.dataTransfer?.types.includes('Files') && e.preventDefault())
  sheet.addEventListener('drop', (e) => {
    if (!canEdit || !e.dataTransfer?.files.length || content.contains(e.target as Node)) return
    e.preventDefault()
    editor?.commands.focus('end')
    insertFiles(e.dataTransfer.files)
  })

  // ---------- Import and export ----------

  const importFiles = async (list: ReturnType<typeof filesFromList>) => {
    if (!canEdit) return
    try {
      nbUndo.stopCapturing()
      const fallback = () => currentSection() ?? addSection(doc, t('Imported'))
      const result = await importMarkdownFiles(doc, list, fallback, NB_ORIGIN)
      toast(tn(result.pages, '{n} page imported', '{n} pages imported'))
      nav.render()
      if (!current) selectSection(currentSection() ?? '')
    } catch (err) {
      toast(t('Could not import: {message}', { message: (err as Error).message }), 6000)
    }
  }
  fileInput.addEventListener('change', async () => {
    const files = [...(fileInput.files ?? [])]
    fileInput.value = ''
    if (!files.length) return
    const list = []
    for (const f of files) list.push(...(/\.zip$/i.test(f.name) ? await filesFromZip(f) : filesFromList([f])))
    await importFiles(list)
  })
  folderInput.addEventListener('change', async () => {
    const files = [...(folderInput.files ?? [])]
    folderInput.value = ''
    if (files.length) await importFiles(filesFromList(files))
  })

  const title = () => notebookTitle(doc)
  const buildScope = async (scope: Scope, format: 'docx' | 'odt' | 'pdf' | 'md'): Promise<Blob> =>
    format === 'pdf' ? (await import('./pdf')).scopePdf(doc, scope) : exportScope(doc, scope, format)
  const exportScopeFile = async (scope: Scope, format: 'docx' | 'odt' | 'pdf' | 'md') => {
    try {
      toast(t('Preparing the download…'))
      const name = scope.kind === 'notebook' ? title() : `${title()} - ${scopeName(scope)}`
      downloadBlob(await buildScope(scope, format), `${safeFileName(name)}.${format}`)
    } catch (err) {
      toast(t('Download failed: {message}', { message: (err as Error).message }))
    }
  }
  const scopeName = (scope: Scope) =>
    scope.kind === 'page' ? pageTitle(pagesMap(doc).get(scope.id) ?? { title: '' }) : scope.kind === 'section' ? sectionsMap(doc).get(scope.id)?.name ?? '' : title()
  const printScope = (scope: Scope) => void import('./print').then((m) => m.printScope(doc, scope))
  const print = () => {
    if (current) printScope({ kind: 'page', id: current })
    else toast(t('Open a page to print it'))
  }

  const formats = (): ExportOption[] => [
    { ext: 'zip', label: t('Notebook as Markdown (.zip)'), build: () => exportNotebookZip(doc) },
    { ext: 'docx', label: t('Word (.docx)'), build: () => buildScope({ kind: 'notebook' }, 'docx') },
    { ext: 'odt', label: t('OpenDocument text (.odt)'), build: () => buildScope({ kind: 'notebook' }, 'odt') },
    { ext: 'pdf', label: t('PDF document (.pdf)'), build: () => buildScope({ kind: 'notebook' }, 'pdf') },
    { ext: 'md', label: t('Markdown (.md)'), build: () => buildScope({ kind: 'notebook' }, 'md') },
  ]
  session.hooks.exportFormats = formats
  const scopeItems = (scope: () => Scope | null): MenuEntry[] =>
    (['docx', 'odt', 'pdf', 'md'] as const).map((f) => ({
      label: { docx: t('Word (.docx)'), odt: t('OpenDocument text (.odt)'), pdf: t('PDF document (.pdf)'), md: t('Markdown (.md)') }[f],
      enabled: () => !!scope(),
      run: () => {
        const s = scope()
        if (s) void exportScopeFile(s, f)
      },
    }))
  const pageScope = (): Scope | null => (current ? { kind: 'page', id: current } : null)
  const sectionScope = (): Scope | null => {
    const s = currentSection()
    return s ? { kind: 'section', id: s } : null
  }

  // ---------- Commands ----------

  const ed = () => editor
  const editable = () => canEdit && !!editor
  const run = (fn: (e: Editor) => unknown) => () => {
    if (editor && canEdit) fn(editor)
  }
  const is = (name: string, attrs?: Record<string, unknown>) => () => !!editor?.isActive(name, attrs)
  const setTag = (tag: TagId | null) => {
    if (!editor || !canEdit) return
    const current = editor.getAttributes('paragraph').nbTag ?? editor.getAttributes('heading').nbTag
    editor.chain().focus().setNbTag(tag && (current === tag || (tag === 'todo' && current === 'done')) ? null : tag).run()
  }
  const currentTag = (): string | null => editor?.getAttributes('paragraph').nbTag ?? editor?.getAttributes('heading').nbTag ?? null
  const insertEquation = async (display = false) => {
    if (!editable()) return
    const e = editor!
    const { from, to } = e.state.selection
    const value = await editEquation({ display })
    if (value && e === editor) e.chain().focus().insertContentAt({ from, to }, { type: 'equation', attrs: value }).run()
  }
  const writerCtx = () => ({ editor }) as unknown as WriterContext
  const dialogs = () => import('../writer/dialogs')
  const insertDate = () => run((e) => e.chain().focus().insertContent(new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })).run())()
  const comment = () => review?.startComment()
  const commentKey = 'Ctrl+Alt+M'

  const tagMenu = (): MenuEntry[] => [
    ...TAG_IDS.map((tag, i) => ({ label: tagLabel(tag), shortcut: mod(`Shift+${i + 1}`), run: () => setTag(tag), active: () => currentTag() === tag || (tag === 'todo' && currentTag() === 'done'), enabled: editable })),
    '-',
    { label: t('Remove tag'), run: () => setTag(null), enabled: () => editable() && !!currentTag() },
    '-',
    { label: t('Tag summary…'), run: () => void tagSummary(ctx) },
  ]
  const drawMenu: Menu = {
    label: t('Draw'),
    items: [
      { label: t('Typing'), run: () => setTool('type'), active: () => ink.tool === 'type' },
      { label: t('Pen'), run: () => setTool('pen'), active: () => ink.tool === 'pen', enabled: () => canEdit },
      { label: t('Highlighter'), run: () => setTool('highlighter'), active: () => ink.tool === 'highlighter', enabled: () => canEdit },
      { label: t('Eraser'), run: () => setTool('eraser'), active: () => ink.tool === 'eraser', enabled: () => canEdit },
      '-',
      { label: t('Pen color'), enabled: () => canEdit, submenu: PEN_COLORS.map((c, i) => ({ label: `${t('Color')} ${i + 1}`, run: () => ((ink.color = c), setTool('pen')), active: () => ink.color === c })) },
      { label: t('Highlighter color'), enabled: () => canEdit, submenu: HIGHLIGHT_COLORS.map((c, i) => ({ label: `${t('Color')} ${i + 1}`, run: () => ((ink.highlightColor = c), setTool('highlighter')), active: () => ink.highlightColor === c })) },
      { label: t('Thickness'), enabled: () => canEdit, submenu: WIDTHS.map(([w, label]) => ({ label, run: () => (ink.width = w), active: () => ink.width === w })) },
      { label: t('Draw with the stylus'), run: () => (ink.stylusDraws = !ink.stylusDraws), active: () => ink.stylusDraws, enabled: () => canEdit },
      '-',
      { label: t('Clear ink on this page'), run: () => ink.clear(), enabled: () => canEdit && !!current && ink.strokes().length > 0 },
    ],
  }
  const notebookMenu: Menu = {
    label: t('Notebook'),
    items: [
      { label: t('New page'), shortcut: mod('Alt+N'), run: () => newPage(), enabled: () => canEdit && !!currentSection() },
      { label: t('New subpage'), run: () => current && newPage({ after: current, level: Math.min(2, (pageRecord()?.level ?? 0) + 1) }), enabled: () => canEdit && !!current },
      { label: t('New section'), run: () => void newSection(), enabled: () => canEdit },
      '-',
      { label: t('Rename section…'), run: () => currentSection() && void nav.renameSection(currentSection()!), enabled: () => canEdit && !!currentSection() },
      { label: t('Delete page'), run: () => current && void nav.removePage(current), enabled: () => canEdit && !!current },
      { label: t('Delete section'), run: () => currentSection() && void nav.removeSection(currentSection()!), enabled: () => canEdit && !!currentSection() },
      '-',
      { label: t('Search notebook'), shortcut: mod('F'), run: () => openDrawerAndSearch() },
      { label: t('Tag summary…'), run: () => void tagSummary(ctx) },
      '-',
      { label: t('Import Markdown files or ZIP…'), run: () => fileInput.click(), enabled: () => canEdit },
      { label: t('Import a folder of Markdown files…'), run: () => folderInput.click(), enabled: () => canEdit },
    ],
  }
  const newPage = (options: { after?: string; level?: number } = {}) => {
    const section = currentSection()
    if (!canEdit || !section) return
    let id = ''
    doc.transact(() => (id = addPage(doc, section, '', options)), NB_ORIGIN)
    openPage(id, { focusTitle: true })
  }
  const newSection = async () => {
    const { promptText } = await import('../../ui/widgets')
    const name = await promptText(t('New section'), t('Section name'), t('Section {n}', { n: readSections(doc).length + 1 }))
    if (name === null || !canEdit) return
    let page = ''
    doc.transact(() => {
      const id = addSection(doc, name.trim() || t('Untitled section'))
      page = addPage(doc, id)
    }, NB_ORIGIN)
    openPage(page, { focusTitle: true })
  }

  // ---------- Frame ----------

  let nav: Nav
  const ctx: NotebookContext = {
    session,
    doc,
    current: () => current,
    currentSection,
    openPage: (id, o) => openPage(id, o),
    selectSection: (id) => selectSection(id),
    editor: ed,
    exportScope: (scope, format) => void exportScopeFile(scope, format),
    printScope: (scope) => printScope(scope),
    undo,
    redo,
    ink,
    get nav() {
      return nav
    },
  }
  nav = createNav(ctx)
  layout.append(nav.element, scrim, canvas)

  let frame: ReturnType<typeof mountFrame> | undefined
  frame = mountFrame({
    session,
    shell,
    file: {
      openFile: () => fileInput.click(),
      print,
      download: [
        { label: t('Current page'), submenu: scopeItems(pageScope) },
        { label: t('Current section'), submenu: scopeItems(sectionScope) },
      ],
      slots: {
        open: [{ label: t('Import a folder of Markdown files…'), run: () => folderInput.click(), enabled: () => canEdit }],
        print: [{ label: t('Print section…'), run: () => { const s = sectionScope(); if (s) printScope(s) }, enabled: () => !!currentSection() }],
      },
      details: () => [
        [t('Sections'), String(readSections(doc).length)],
        [t('Pages'), String(allPages(doc).length)],
      ],
    },
    edit: {
      editable: () => canEdit,
      undo,
      redo,
      canUndo,
      canRedo,
      cut: () => document.execCommand('cut'),
      copy: () => document.execCommand('copy'),
      paste: () => void dialogs().then((d) => d.pasteHint()),
      selectAll: run((e) => e.chain().focus().selectAll().run()),
      find: () => openDrawerAndSearch(),
    },
    menus: {
      view: {
        label: t('View'),
        items: [
          { label: t('Sections and pages'), run: () => toggleDrawer(), active: () => !layout.classList.contains('nav-hidden') && (window.innerWidth > BREAKPOINTS.narrow || layout.classList.contains('drawer-open')) },
          { label: t('Tag summary…'), run: () => void tagSummary(ctx) },
          { label: t('Show resolved comments'), run: () => { if (review) { review.showResolved = !review.showResolved; review.refresh() } }, active: () => !!review?.showResolved },
          '-',
          { label: t('Zoom'), submenu: zoomMenuItems(zoomTarget) },
        ],
      },
      insert: {
        label: t('Insert'),
        items: [
          { label: t('Comment'), shortcut: commentKey, run: comment, enabled: () => session.canComment && !!editor },
          '-',
          { label: t('Picture…'), run: () => imageInput.click(), enabled: editable },
          { label: t('File…'), run: () => attachInput.click(), enabled: editable },
          { label: t('Table…'), run: () => void dialogs().then((d) => d.insertTableDialog(writerCtx())), enabled: editable },
          { label: t('Link…'), shortcut: mod('K'), run: () => void dialogs().then((d) => d.editLink(writerCtx())), enabled: editable },
          { label: t('Equation…'), run: () => void insertEquation(false), enabled: editable },
          { label: t('Display equation…'), run: () => void insertEquation(true), enabled: editable },
          { label: t('Code block'), run: run((e) => e.chain().focus().toggleCodeBlock().run()), enabled: editable },
          { label: t('Checklist'), run: run((e) => e.chain().focus().toggleTaskList().run()), enabled: editable },
          { label: t('Horizontal line'), run: run((e) => e.chain().focus().setHorizontalRule().run()), enabled: editable },
          { label: t('Date and time'), run: insertDate, enabled: editable },
          { label: t('Special character…'), run: () => void dialogs().then((d) => d.specialCharacters(writerCtx())), enabled: editable },
        ],
      },
      format: {
        label: t('Format'),
        items: [
          { label: t('Bold'), shortcut: mod('B'), run: run((e) => e.chain().focus().toggleBold().run()), active: is('bold'), enabled: editable },
          { label: t('Italic'), shortcut: mod('I'), run: run((e) => e.chain().focus().toggleItalic().run()), active: is('italic'), enabled: editable },
          { label: t('Underline'), shortcut: mod('U'), run: run((e) => e.chain().focus().toggleUnderline().run()), active: is('underline'), enabled: editable },
          { label: t('Strikethrough'), shortcut: mod('Shift+S'), run: run((e) => e.chain().focus().toggleStrike().run()), active: is('strike'), enabled: editable },
          { label: t('Code'), shortcut: mod('E'), run: run((e) => e.chain().focus().toggleCode().run()), active: is('code'), enabled: editable },
          { label: t('Highlight'), run: run((e) => e.chain().focus().toggleHighlight({ color: '#fff59d' }).run()), active: is('highlight'), enabled: editable },
          '-',
          { label: t('Normal text'), run: run((e) => e.chain().focus().setParagraph().run()), active: is('paragraph'), enabled: editable },
          ...[1, 2, 3].map((level) => ({ label: t('Heading {n}', { n: level }), run: run((e) => e.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run()), active: is('heading', { level }), enabled: editable })),
          '-',
          { label: t('Bulleted list'), shortcut: mod('Shift+8'), run: run((e) => e.chain().focus().toggleBulletList().run()), active: is('bulletList'), enabled: editable },
          { label: t('Numbered list'), shortcut: mod('Shift+7'), run: run((e) => e.chain().focus().toggleOrderedList().run()), active: is('orderedList'), enabled: editable },
          { label: t('Checklist'), shortcut: mod('Shift+9'), run: run((e) => e.chain().focus().toggleTaskList().run()), active: is('taskList'), enabled: editable },
          { label: t('Quote'), run: run((e) => e.chain().focus().toggleBlockquote().run()), active: is('blockquote'), enabled: editable },
          '-',
          { label: t('Tag'), submenu: tagMenu() },
          '-',
          { label: t('Clear formatting'), run: run((e) => e.chain().focus().unsetAllMarks().clearNodes().run()), enabled: editable },
        ],
      },
      app: [notebookMenu, drawMenu],
      review: [
        {
          label: t('Review'),
          items: [
            { label: t('Comment'), shortcut: commentKey, run: comment, enabled: () => session.canComment && !!editor },
            { label: t('Next comment or suggestion'), run: () => review?.step(1) },
            { label: t('Previous comment or suggestion'), run: () => review?.step(-1) },
            { label: t('Show resolved comments'), run: () => { if (review) { review.showResolved = !review.showResolved; review.refresh() } }, active: () => !!review?.showResolved },
          ],
        },
      ],
    },
    help: {
      sections: () => [
        {
          title: t('Notebook'),
          rows: [
            [t('New page'), 'Ctrl+Alt+N'],
            [t('Tags: To do, Important, Question, Remember'), 'Ctrl+Shift+1 … 4'],
            [t('Search notebook'), 'Ctrl+F'],
            [t('Move a page or section'), 'Alt+↑ / Alt+↓'],
            [t('Make subpage / promote (page list)'), 'Alt+Tab / Alt+Shift+Tab'],
            [t('Comment'), commentKey],
            [t('Type / pen / highlighter / eraser'), 'Alt+1 … 4'],
          ],
        },
      ],
    },
    zoom: zoomTarget,
    keys: { find: () => openDrawerAndSearch() },
  })
  status = frame.status
  const statusInfo = el('span', { class: 'nb-status' })
  frame.status?.left.append(statusInfo)
  // Phones: the comments of the page open as a panel from the status bar.
  const statusComments = el('button', { type: 'button', class: 'status-comments', hidden: true })
  statusComments.addEventListener('click', () => {
    if (!review) return
    review.panelOpen = !review.panelOpen
    rail.classList.toggle('open', review.panelOpen)
    review.reposition()
  })
  frame.status?.addRight(statusComments)
  const updateCommentsButton = () => {
    const n = review?.count ?? 0
    statusComments.hidden = n === 0
    statusComments.textContent = t('Comments ({n})', { n })
  }
  const updateStatus = () => {
    const page = pageRecord()
    if (!page) {
      statusInfo.textContent = tn(allPages(doc).length, '{n} page', '{n} pages')
      return
    }
    const pages = readPages(doc, page.section)
    const words = (editor?.storage.characterCount?.words?.() as number | undefined) ?? 0
    statusInfo.textContent = `${t('Page {page} of {pages}', { page: pages.findIndex((p) => p.id === current) + 1, pages: pages.length })} · ${tn(words, '{n} word', '{n} words')}`
  }

  // ---------- Toolbar ----------

  const tb = frame.toolbar
  const guard = (fn: () => void) => () => {
    if (editable()) fn()
  }
  const btn = (node: Parameters<typeof tb.button>[0], label: string, action: () => void, active?: () => boolean, shortcut?: string) =>
    tb.button(node, label, guard(action), { active, enabled: editable, shortcut })
  tb.group(
    { keep: true },
    tb.button(Undo2, t('Undo'), undo, { enabled: canUndo, shortcut: mod('Z') }),
    tb.button(Redo2, t('Redo'), redo, { enabled: canRedo, shortcut: mod('Y') }),
    tb.button(Printer, t('Print page'), print, { shortcut: mod('P') }),
  )
  const styleValue = (): string => {
    for (const level of [1, 2, 3]) if (editor?.isActive('heading', { level })) return `h${level}`
    return 'p'
  }
  tb.group(
    tb.select(
      t('Paragraph style'),
      [
        ['p', t('Normal text')],
        ['h1', t('Heading 1')],
        ['h2', t('Heading 2')],
        ['h3', t('Heading 3')],
      ],
      styleValue,
      (v) => {
        if (!editable()) return
        if (v === 'p') editor!.chain().focus().setParagraph().run()
        else editor!.chain().focus().setHeading({ level: Number(v[1]) as 1 | 2 | 3 }).run()
      },
      'nb-style',
    ),
  )
  tb.group(
    btn(Bold, t('Bold'), run((e) => e.chain().focus().toggleBold().run()), is('bold'), mod('B')),
    btn(Italic, t('Italic'), run((e) => e.chain().focus().toggleItalic().run()), is('italic'), mod('I')),
    btn(Underline, t('Underline'), run((e) => e.chain().focus().toggleUnderline().run()), is('underline'), mod('U')),
    btn(Strikethrough, t('Strikethrough'), run((e) => e.chain().focus().toggleStrike().run()), is('strike')),
    tb.colorButton(Highlighter, t('Highlight color'), () => editor?.getAttributes('highlight').color, (c) => run((e) => (c ? e.chain().focus().setHighlight({ color: c }).run() : e.chain().focus().unsetHighlight().run()))(), t('None')),
  )
  tb.group(
    btn(List, t('Bulleted list'), run((e) => e.chain().focus().toggleBulletList().run()), is('bulletList')),
    btn(ListOrdered, t('Numbered list'), run((e) => e.chain().focus().toggleOrderedList().run()), is('orderedList')),
    btn(ListChecks, t('Checklist'), run((e) => e.chain().focus().toggleTaskList().run()), is('taskList')),
  )
  const tagButton = tb.button(Tag, t('Tag'), () => {
    if (!editable()) return
    const list = el('div', { class: 'menu-list nb-tag-menu', role: 'menu' })
    for (const [i, tag] of TAG_IDS.entries()) {
      const row = el('button', { type: 'button', class: 'menu-row', role: 'menuitem' }, el('span', { class: 'nb-tag-icon', dataset: { tag } }), tagLabel(tag), el('span', { class: 'menu-shortcut', textContent: mod(`Shift+${i + 1}`) }))
      row.addEventListener('click', () => {
        closePopover()
        setTag(tag)
      })
      list.append(row)
    }
    const remove = el('button', { type: 'button', class: 'menu-row', role: 'menuitem', textContent: t('Remove tag') })
    remove.addEventListener('click', () => {
      closePopover()
      setTag(null)
    })
    list.append(remove)
    openPopover(tagButton, list)
  }, { enabled: editable, active: () => !!currentTag(), class: 'nb-tag-btn' })
  tb.group(tagButton, tb.button(Tags, t('Tag summary'), () => void tagSummary(ctx), {}), { keep: true })
  tb.group(
    btn(ImageIcon, t('Picture'), () => imageInput.click()),
    btn(Paperclip, t('Attach file'), () => attachInput.click()),
    btn(Table, t('Table'), () => void dialogs().then((d) => d.insertTableDialog(writerCtx()))),
    btn(Link, t('Link'), () => void dialogs().then((d) => d.editLink(writerCtx())), undefined, mod('K')),
    btn(Sigma, t('Equation'), () => void insertEquation(false)),
  )
  const toolButton = (node: Parameters<typeof tb.button>[0], label: string, tool: Tool, shortcut: string) =>
    tb.button(node, label, () => setTool(ink.tool === tool && tool !== 'type' ? 'type' : tool), { active: () => ink.tool === tool, enabled: () => canEdit && !!current, shortcut, class: `nb-tool nb-tool-${tool}` })
  const penButton = toolButton(Pen, t('Pen'), 'pen', 'Alt+2')
  const colorSwatch = el('button', { type: 'button', class: 'tb-btn nb-swatch', title: t('Pen color') })
  colorSwatch.setAttribute('aria-label', t('Pen color'))
  colorSwatch.addEventListener('click', () => {
    if (!canEdit) return
    const box = el('div', { class: 'nb-swatches' })
    const colors = ink.tool === 'highlighter' ? HIGHLIGHT_COLORS : PEN_COLORS
    for (const c of colors) {
      const b = el('button', { type: 'button', class: 'nb-swatch-pick', title: c })
      b.style.background = c
      b.addEventListener('click', () => {
        if (ink.tool === 'highlighter') ink.highlightColor = c
        else {
          ink.color = c
          setTool('pen')
        }
        closePopover()
        tb.refresh()
      })
      box.append(b)
    }
    const widths = el('div', { class: 'nb-widths' })
    for (const [w, label] of WIDTHS) {
      const b = el('button', { type: 'button', class: `nb-width${ink.width === w ? ' active' : ''}`, title: label }, el('span', { class: 'nb-width-line' }))
      b.setAttribute('aria-label', label)
      ;(b.firstChild as HTMLElement).style.height = `${w}px`
      b.addEventListener('click', () => {
        ink.width = w
        closePopover()
      })
      widths.append(b)
    }
    openPopover(colorSwatch, el('div', { class: 'nb-ink-options' }, box, widths))
  })
  tb.onRefresh(() => {
    colorSwatch.style.setProperty('--swatch', ink.tool === 'highlighter' ? ink.highlightColor : ink.color)
    colorSwatch.disabled = !canEdit
  })
  tb.group(
    { class: 'nb-draw-group' },
    toolButton(Type, t('Typing'), 'type', 'Alt+1'),
    penButton,
    toolButton(Highlighter, t('Highlighter'), 'highlighter', 'Alt+3'),
    toolButton(Eraser, t('Eraser'), 'eraser', 'Alt+4'),
    colorSwatch,
  )
  tb.group({ keep: true }, tb.button(MessageSquarePlus, t('Comment'), comment, { enabled: () => session.canComment && !!editor, shortcut: commentKey }))
  if (!canEdit) tb.element.classList.add('readonly')

  // ---------- Drawer (phones) ----------

  const narrow = () => window.innerWidth <= BREAKPOINTS.narrow
  const closeDrawer = () => {
    layout.classList.remove('drawer-open')
    scrim.hidden = true
    navToggle.setAttribute('aria-expanded', 'false')
  }
  const toggleDrawer = () => {
    if (!narrow()) {
      layout.classList.toggle('nav-hidden')
      updateZoom()
      return
    }
    const open = !layout.classList.contains('drawer-open')
    layout.classList.toggle('drawer-open', open)
    scrim.hidden = !open
    navToggle.setAttribute('aria-expanded', String(open))
    if (open) nav.element.querySelector<HTMLElement>('.nb-page.current, .nb-section.current, .nb-add')?.focus()
  }
  const openDrawerAndSearch = () => {
    if (narrow() && !layout.classList.contains('drawer-open')) toggleDrawer()
    layout.classList.remove('nav-hidden')
    nav.focusSearch()
  }
  navToggle.addEventListener('click', toggleDrawer)
  scrim.addEventListener('click', closeDrawer)
  nav.element.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && layout.classList.contains('drawer-open')) {
      closeDrawer()
      navToggle.focus()
    }
  })

  // ---------- Keys ----------

  window.addEventListener(
    'keydown',
    (e) => {
      const modKey = e.ctrlKey || e.metaKey
      const target = e.target as HTMLElement
      const inField = target.matches?.('input, textarea, select') ?? false
      if (document.querySelector('dialog[open]')) return
      if (modKey && !e.altKey && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y') && !inField) {
        e.preventDefault()
        e.stopPropagation()
        if (e.key.toLowerCase() === 'y' || e.shiftKey) redo()
        else undo()
      } else if (modKey && e.shiftKey && TAG_KEYS[e.code]) {
        e.preventDefault()
        e.stopPropagation()
        setTag(TAG_KEYS[e.code])
      } else if (modKey && e.shiftKey && e.code === 'Digit0') {
        e.preventDefault()
        setTag(null)
      } else if (modKey && e.altKey && e.code === 'KeyM') {
        e.preventDefault()
        comment()
      } else if (modKey && e.altKey && e.code === 'KeyN') {
        e.preventDefault()
        newPage()
      } else if (modKey && !e.altKey && e.key.toLowerCase() === 'k' && editor?.isFocused) {
        e.preventDefault()
        if (editable()) void dialogs().then((d) => d.editLink(writerCtx()))
      } else if (e.altKey && !modKey && !e.shiftKey && /^Digit[1-4]$/.test(e.code) && !inField) {
        e.preventDefault()
        setTool((['type', 'pen', 'highlighter', 'eraser'] as Tool[])[Number(e.code.slice(5)) - 1])
      } else if (e.key === 'Escape' && ink.tool !== 'type' && !inField) setTool('type')
    },
    true,
  )

  // ---------- Wiring ----------

  const onStructure = () => {
    if (current && !pagesMap(doc).has(current)) {
      // The open page was deleted (here or by someone else).
      const section = selectedSection
      current = null
      destroyEditor()
      ink.setPage(null)
      const next = section ? readPages(doc, section)[0] : undefined
      if (next) openPage(next.id)
      else openPage(null)
      return
    }
    if (!current) {
      const pages = allPages(doc)
      if (pages.length && !empty.hidden) {
        const section = currentSection()
        const first = (section && readPages(doc, section)[0]) || pages[0]
        if (first) return openPage(first.id)
      }
      showEmpty()
    }
    showPageHead()
    updateStatus()
  }
  pagesMap(doc).observe(onStructure)
  sectionsMap(doc).observe(onStructure)
  doc.getMap('meta').observe(() => showPageHead())
  new ResizeObserver(() => updateZoom()).observe(canvas)
  new ResizeObserver(() => updateZoom()).observe(content)

  // A notebook created here starts with one section and one page.
  if (canEdit && !readSections(doc).length && takeNewDoc(session.docId)) {
    doc.transact(() => {
      const s = addSection(doc, t('Section {n}', { n: 1 }))
      addPage(doc, s)
    })
  }
  const last = readLocal(LAST_PAGE_KEY + session.docId)
  const first = (last && pagesMap(doc).has(last) ? last : null) ?? allPages(doc)[0]?.id ?? null
  openPage(first)
  if (!first) nav.render()

  // AI assistants (WebMCP, off by default): the tool module loads only when turned on.
  provideWebMcpTools(session, () => import('./webmcp').then((m) => m.notebookTools(ctx)))
  window.addEventListener('resize', () => {
    if (!narrow()) closeDrawer()
    updateZoom()
  })
  // Handle for automated browser tests in development builds only.
  if (import.meta.env.DEV) Object.assign(window, { notebook: ctx })
  return ctx
}

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function readDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

// Selects the first occurrence of a text in the page (search results).
function selectText(editor: Editor, query: string): void {
  const q = query.toLocaleLowerCase()
  let found: { from: number; to: number } | null = null
  editor.state.doc.descendants((node, pos) => {
    if (found) return false
    if (!node.isTextblock) return true
    const text = node.textBetween(0, node.content.size, '\n', '￼')
    const at = text.toLocaleLowerCase().indexOf(q)
    if (at >= 0) found = { from: pos + 1 + at, to: pos + 1 + at + query.length }
    return false
  })
  if (!found) return void editor.commands.focus('start')
  const { from, to } = found
  editor.chain().focus().command(({ tr }) => {
    tr.setSelection(TextSelection.create(tr.doc, from, to)).scrollIntoView()
    return true
  }).run()
}

// Puts the cursor at the end of the n-th tagged paragraph (tag summary).
function selectTagged(editor: Editor, index: number): void {
  let n = 0
  let target: number | null = null
  editor.state.doc.descendants((node, pos) => {
    if (target !== null) return false
    if (node.attrs.nbTag) {
      if (n++ === index) target = pos + node.nodeSize - 1
      return false
    }
    return true
  })
  if (target === null) return void editor.commands.focus('start')
  const pos = target
  editor.chain().focus().setTextSelection(pos).scrollIntoView().run()
}
