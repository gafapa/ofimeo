// Sections (coloured tabs) and pages (a list with subpages) of the notebook,
// plus the search across all pages. Drag and drop (or Alt+↑/↓) reorders
// pages and sections; a page dropped on a section tab moves to that section.
// On phones the whole panel is a drawer.

import { Ellipsis, FilePlus, FolderPlus, Search, X } from 'lucide'
import { t } from '../../core/i18n'
import { el, icon, promptText, confirmDialog, showContextMenu, type MenuEntry } from '../../ui/widgets'
import type { NotebookContext } from './app'
import {
  addPage,
  addSection,
  allPages,
  deletePage,
  deleteSection,
  movePage,
  moveSection,
  NB_ORIGIN,
  pageText,
  pageTitle,
  pagesMap,
  readPages,
  readSections,
  SECTION_COLORS,
  sectionsMap,
  setLevel,
  updateSection,
  type Page,
} from './model'

const PAGE_TYPE = 'application/x-ofimeo-nb-page'
const SECTION_TYPE = 'application/x-ofimeo-nb-section'

export interface Nav {
  element: HTMLElement
  render(): void
  focusSearch(): void
  search(query: string): void
  sectionMenu(id: string): MenuEntry[]
  pageMenu(id: string): MenuEntry[]
  renameSection(id: string): Promise<void>
  removePage(id: string): Promise<void>
  removeSection(id: string): Promise<void>
}

export function createNav(ctx: NotebookContext): Nav {
  const { doc, session } = ctx
  const canEdit = session.canEdit
  const act = (fn: () => void) => doc.transact(fn, NB_ORIGIN)

  const searchInput = el('input', { type: 'search', class: 'nb-search-input', placeholder: t('Search notebook') })
  searchInput.setAttribute('aria-label', t('Search notebook'))
  const clearSearch = el('button', { type: 'button', class: 'nb-icon-btn', title: t('Clear search'), hidden: true }, icon(X, 16))
  clearSearch.setAttribute('aria-label', t('Clear search'))
  const searchBox = el('div', { class: 'nb-search' }, icon(Search, 16), searchInput, clearSearch)
  const sectionList = el('div', { class: 'nb-section-list', role: 'list' })
  sectionList.setAttribute('aria-label', t('Sections'))
  const addSectionBtn = el('button', { type: 'button', class: 'nb-add', hidden: !canEdit }, icon(FolderPlus, 16), t('Add section'))
  const pageList = el('div', { class: 'nb-page-list', role: 'list' })
  pageList.setAttribute('aria-label', t('Pages'))
  const addPageBtn = el('button', { type: 'button', class: 'nb-add', hidden: !canEdit }, icon(FilePlus, 16), t('Add page'))
  const pagesHead = el('div', { class: 'nb-pages-head' })
  const results = el('div', { class: 'nb-results', hidden: true, role: 'list' })
  results.setAttribute('aria-label', t('Search results'))
  const columns = el(
    'div',
    { class: 'nb-columns' },
    el('div', { class: 'nb-sections' }, sectionList, addSectionBtn),
    el('div', { class: 'nb-pages' }, pagesHead, pageList, addPageBtn),
  )
  const element = el('aside', { class: 'nb-nav', id: 'nb-nav' }, searchBox, columns, results)
  element.setAttribute('aria-label', t('Sections and pages'))

  // ---------- Actions ----------

  const newSection = async () => {
    if (!canEdit) return
    const name = await promptText(t('New section'), t('Section name'), t('Section {n}', { n: readSections(doc).length + 1 }))
    if (name === null) return
    let page = ''
    act(() => {
      const id = addSection(doc, name.trim() || t('Untitled section'))
      page = addPage(doc, id)
    })
    ctx.openPage(page, { focusTitle: true })
  }
  const newPage = (options: { after?: string; level?: number } = {}) => {
    const section = ctx.currentSection()
    if (!canEdit || !section) return
    let id = ''
    act(() => (id = addPage(doc, section, '', options)))
    ctx.openPage(id, { focusTitle: true })
  }
  const renameSection = async (id: string) => {
    const s = sectionsMap(doc).get(id)
    if (!canEdit || !s) return
    const name = await promptText(t('Rename section'), t('Section name'), s.name)
    if (name !== null && name.trim()) act(() => updateSection(doc, id, { name: name.trim() }))
  }
  const removeSection = async (id: string) => {
    const s = sectionsMap(doc).get(id)
    if (!canEdit || !s) return
    const ok = await confirmDialog(t('Delete section'), t('Delete the section “{name}” and its {n} pages? You can undo it with Undo or restore an earlier version.', { name: s.name, n: readPages(doc, id).length }), { confirmLabel: t('Delete'), danger: true })
    if (!ok) return
    const sections = readSections(doc)
    const next = sections[sections.findIndex((x) => x.id === id) + 1] ?? sections[sections.findIndex((x) => x.id === id) - 1]
    act(() => deleteSection(doc, id))
    if (next) ctx.selectSection(next.id)
    else ctx.openPage(null)
  }
  const removePage = async (id: string) => {
    const p = pagesMap(doc).get(id)
    if (!canEdit || !p) return
    const ok = await confirmDialog(t('Delete page'), t('Delete the page “{name}”? You can undo it with Undo or restore an earlier version.', { name: pageTitle(p) }), { confirmLabel: t('Delete'), danger: true })
    if (!ok) return
    const pages = readPages(doc, p.section)
    const i = pages.findIndex((x) => x.id === id)
    const next = pages[i + 1] ?? pages[i - 1]
    act(() => deletePage(doc, id))
    if (ctx.current() === id) next ? ctx.openPage(next.id) : ctx.selectSection(p.section)
  }
  const stepPage = (id: string, dir: -1 | 1) => {
    const p = pagesMap(doc).get(id)
    if (!canEdit || !p) return
    const pages = readPages(doc, p.section)
    const i = pages.findIndex((x) => x.id === id)
    const other = pages[i + dir]
    if (other) act(() => movePage(doc, id, { page: other.id, place: dir < 0 ? 'before' : 'after' }))
  }
  const stepSection = (id: string, dir: -1 | 1) => {
    const sections = readSections(doc)
    const i = sections.findIndex((x) => x.id === id)
    const other = sections[i + dir]
    if (canEdit && other) act(() => moveSection(doc, id, other.id, dir < 0 ? 'before' : 'after'))
  }

  const exportItems = (scope: Parameters<NotebookContext['exportScope']>[0]): MenuEntry[] => [
    { label: t('Word (.docx)'), run: () => ctx.exportScope(scope, 'docx') },
    { label: t('OpenDocument text (.odt)'), run: () => ctx.exportScope(scope, 'odt') },
    { label: t('PDF document (.pdf)'), run: () => ctx.exportScope(scope, 'pdf') },
    { label: t('Markdown (.md)'), run: () => ctx.exportScope(scope, 'md') },
  ]

  const sectionMenu = (id: string): MenuEntry[] => {
    const editable = () => canEdit
    return [
      { label: t('Rename…'), run: () => void renameSection(id), enabled: editable },
      {
        label: t('Color'),
        enabled: editable,
        submenu: SECTION_COLORS.map((color, i) => ({ label: `${t('Color')} ${i + 1}`, run: () => act(() => updateSection(doc, id, { color })), active: () => sectionsMap(doc).get(id)?.color === color })),
      },
      { label: t('New section'), run: () => void newSection(), enabled: editable },
      '-',
      { label: t('Move up'), shortcut: 'Alt+↑', run: () => stepSection(id, -1), enabled: editable },
      { label: t('Move down'), shortcut: 'Alt+↓', run: () => stepSection(id, 1), enabled: editable },
      '-',
      { label: t('Export section'), submenu: exportItems({ kind: 'section', id }) },
      { label: t('Print section…'), run: () => ctx.printScope({ kind: 'section', id }) },
      '-',
      { label: t('Delete section'), run: () => void removeSection(id), enabled: editable },
    ]
  }

  const pageMenu = (id: string): MenuEntry[] => {
    const page = () => pagesMap(doc).get(id)
    const editable = () => canEdit && !!page()
    return [
      { label: t('New page below'), run: () => newPage({ after: id }), enabled: editable },
      { label: t('New subpage'), run: () => newPage({ after: id, level: Math.min(2, (page()?.level ?? 0) + 1) }), enabled: editable },
      '-',
      { label: t('Make subpage'), shortcut: 'Tab', run: () => act(() => setLevel(doc, id, (page()?.level ?? 0) + 1)), enabled: editable },
      { label: t('Promote subpage'), shortcut: 'Shift+Tab', run: () => act(() => setLevel(doc, id, (page()?.level ?? 0) - 1)), enabled: () => editable() && (page()?.level ?? 0) > 0 },
      { label: t('Move up'), shortcut: 'Alt+↑', run: () => stepPage(id, -1), enabled: editable },
      { label: t('Move down'), shortcut: 'Alt+↓', run: () => stepPage(id, 1), enabled: editable },
      {
        label: t('Move to section'),
        enabled: editable,
        submenu: readSections(doc).map((s) => ({ label: s.name || t('Untitled section'), enabled: () => page()?.section !== s.id, run: () => act(() => movePage(doc, id, { section: s.id })) })),
      },
      '-',
      { label: t('Export page'), submenu: exportItems({ kind: 'page', id }) },
      { label: t('Print page…'), run: () => ctx.printScope({ kind: 'page', id }) },
      '-',
      { label: t('Delete page'), run: () => void removePage(id), enabled: editable },
    ]
  }

  addSectionBtn.addEventListener('click', () => void newSection())
  addPageBtn.addEventListener('click', () => newPage())

  // ---------- Drag and drop ----------

  let dragging: { kind: 'page' | 'section'; id: string } | null = null
  const clearMarks = () => element.querySelectorAll('.drop-before, .drop-after, .drop-into').forEach((n) => n.classList.remove('drop-before', 'drop-after', 'drop-into'))
  const place = (e: DragEvent, item: HTMLElement): 'before' | 'after' => {
    const r = item.getBoundingClientRect()
    return e.clientY < r.top + r.height / 2 ? 'before' : 'after'
  }
  const draggable = (item: HTMLElement, kind: 'page' | 'section', id: string) => {
    if (!canEdit) return
    item.draggable = true
    item.addEventListener('dragstart', (e) => {
      dragging = { kind, id }
      e.dataTransfer?.setData(kind === 'page' ? PAGE_TYPE : SECTION_TYPE, id)
      e.dataTransfer?.setData('text/plain', item.textContent ?? '')
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
      item.classList.add('dragging')
    })
    item.addEventListener('dragend', () => {
      dragging = null
      item.classList.remove('dragging')
      clearMarks()
    })
    item.addEventListener('dragover', (e) => {
      if (!dragging || dragging.id === id) return
      // Pages go before/after pages, or into a section; sections before/after sections.
      if (dragging.kind === 'section' && kind === 'page') return
      e.preventDefault()
      clearMarks()
      item.classList.add(dragging.kind === 'page' && kind === 'section' ? 'drop-into' : `drop-${place(e, item)}`)
    })
    item.addEventListener('dragleave', () => item.classList.remove('drop-before', 'drop-after', 'drop-into'))
    item.addEventListener('drop', (e) => {
      if (!dragging) return
      e.preventDefault()
      const d = dragging
      clearMarks()
      if (d.kind === 'page' && kind === 'page') act(() => movePage(doc, d.id, { page: id, place: place(e, item) }))
      else if (d.kind === 'page' && kind === 'section') act(() => movePage(doc, d.id, { section: id }))
      else if (d.kind === 'section' && kind === 'section') act(() => moveSection(doc, d.id, id, place(e, item)))
    })
  }

  // ---------- Rendering ----------

  const moreButton = (label: string, menu: () => MenuEntry[]) => {
    const b = el('button', { type: 'button', class: 'nb-more', title: label, tabIndex: -1 }, icon(Ellipsis, 16))
    b.setAttribute('aria-label', label)
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      const r = b.getBoundingClientRect()
      showContextMenu(r.left, r.bottom, menu())
    })
    return b
  }

  const peopleOn = (): Map<string, string[]> => {
    const map = new Map<string, string[]>()
    session.awareness.getStates().forEach((state, client) => {
      if (client === session.doc.clientID) return
      const page = (state as { nbPage?: string }).nbPage
      const color = (state as { user?: { color?: string } }).user?.color
      if (page && color) map.set(page, [...(map.get(page) ?? []), color])
    })
    return map
  }

  const render = () => {
    const sections = readSections(doc)
    const currentSection = ctx.currentSection()
    const current = ctx.current()
    const people = peopleOn()
    sectionList.replaceChildren(
      ...sections.map((s) => {
        const count = readPages(doc, s.id).length
        const item = el(
          'div',
          { class: `nb-section${s.id === currentSection ? ' current' : ''}`, role: 'listitem', tabIndex: 0, dataset: { id: s.id } },
          el('span', { class: 'nb-section-name', textContent: s.name || t('Untitled section') }),
          el('span', { class: 'nb-count', textContent: String(count) }),
          moreButton(t('Section options'), () => sectionMenu(s.id)),
        )
        item.style.setProperty('--section-color', s.color)
        if (s.id === currentSection) item.setAttribute('aria-current', 'true')
        item.addEventListener('click', () => ctx.selectSection(s.id))
        item.addEventListener('dblclick', () => void renameSection(s.id))
        item.addEventListener('contextmenu', (e) => {
          e.preventDefault()
          showContextMenu(e.clientX, e.clientY, sectionMenu(s.id))
        })
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            ctx.selectSection(s.id)
          } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            e.preventDefault()
            stepSection(s.id, e.key === 'ArrowUp' ? -1 : 1)
            queueMicrotask(() => sectionList.querySelector<HTMLElement>(`[data-id="${s.id}"]`)?.focus())
          } else if (e.key === 'F2') void renameSection(s.id)
          else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            ;((e.key === 'ArrowDown' ? item.nextElementSibling : item.previousElementSibling) as HTMLElement | null)?.focus()
          }
        })
        draggable(item, 'section', s.id)
        return item
      }),
    )
    const section = sections.find((s) => s.id === currentSection)
    pagesHead.textContent = section?.name || ''
    pagesHead.style.setProperty('--section-color', section?.color ?? 'transparent')
    addPageBtn.hidden = !canEdit || !section
    const pages = section ? readPages(doc, section.id) : []
    pageList.replaceChildren(
      ...pages.map((p: Page) => {
        const dots = (people.get(p.id) ?? []).slice(0, 3).map((color) => {
          const dot = el('span', { class: 'nb-dot' })
          dot.style.background = color
          return dot
        })
        const item = el(
          'div',
          { class: `nb-page level-${p.level}${p.id === current ? ' current' : ''}`, role: 'listitem', tabIndex: 0, dataset: { id: p.id } },
          el('span', { class: 'nb-page-name', textContent: pageTitle(p) }),
          ...dots,
          moreButton(t('Page options'), () => pageMenu(p.id)),
        )
        if (p.id === current) item.setAttribute('aria-current', 'page')
        item.addEventListener('click', () => ctx.openPage(p.id))
        item.addEventListener('contextmenu', (e) => {
          e.preventDefault()
          showContextMenu(e.clientX, e.clientY, pageMenu(p.id))
        })
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            ctx.openPage(p.id, { focus: true })
          } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            e.preventDefault()
            stepPage(p.id, e.key === 'ArrowUp' ? -1 : 1)
            queueMicrotask(() => pageList.querySelector<HTMLElement>(`[data-id="${p.id}"]`)?.focus())
          } else if (e.key === 'Tab' && canEdit && e.altKey) {
            e.preventDefault()
            act(() => setLevel(doc, p.id, p.level + (e.shiftKey ? -1 : 1)))
          } else if (e.key === 'Delete') void removePage(p.id)
          else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            ;((e.key === 'ArrowDown' ? item.nextElementSibling : item.previousElementSibling) as HTMLElement | null)?.focus()
          }
        })
        draggable(item, 'page', p.id)
        return item
      }),
    )
    if (!searchInput.value.trim()) return
    search(searchInput.value)
  }

  // ---------- Search ----------

  let timer = 0
  const search = (query: string) => {
    const q = query.trim().toLocaleLowerCase()
    clearSearch.hidden = !q
    results.hidden = !q
    columns.hidden = !!q
    if (!q) return results.replaceChildren()
    const found: HTMLElement[] = []
    const sections = new Map(readSections(doc).map((s) => [s.id, s]))
    for (const page of allPages(doc)) {
      const title = pageTitle(page)
      const text = pageText(doc, page.id).replace(/\s+/g, ' ')
      const at = text.toLocaleLowerCase().indexOf(q)
      const inTitle = title.toLocaleLowerCase().includes(q)
      if (at < 0 && !inTitle) continue
      const snippet = at >= 0 ? `${at > 30 ? '…' : ''}${text.slice(Math.max(0, at - 30), at + q.length + 50)}…` : ''
      const section = sections.get(page.section)
      const item = el(
        'button',
        { type: 'button', class: 'nb-result', role: 'listitem' },
        el('span', { class: 'nb-result-title', textContent: title }),
        el('span', { class: 'nb-result-section', textContent: section?.name ?? '' }),
        snippet ? el('span', { class: 'nb-result-snippet', textContent: snippet }) : null,
      )
      item.style.setProperty('--section-color', section?.color ?? 'transparent')
      item.addEventListener('click', () => ctx.openPage(page.id, { select: at >= 0 ? query.trim() : undefined }))
      found.push(item)
    }
    results.replaceChildren(...(found.length ? found : [el('p', { class: 'hint nb-empty', textContent: t('No pages match “{query}”', { query: query.trim() }) })]))
  }
  searchInput.addEventListener('input', () => {
    clearTimeout(timer)
    timer = window.setTimeout(() => search(searchInput.value), 150)
  })
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && searchInput.value) {
      e.stopPropagation()
      searchInput.value = ''
      search('')
    } else if (e.key === 'Enter') results.querySelector<HTMLElement>('.nb-result')?.click()
  })
  clearSearch.addEventListener('click', () => {
    searchInput.value = ''
    search('')
    searchInput.focus()
  })

  sectionsMap(doc).observe(render)
  pagesMap(doc).observe(render)
  // Who is on which page (cursor moves change awareness too: only re-render when that changes).
  let people = ''
  session.awareness.on('change', () => {
    const next = JSON.stringify([...peopleOn()])
    if (next === people) return
    people = next
    render()
  })

  return {
    element,
    render,
    focusSearch: () => {
      searchInput.focus()
      searchInput.select()
    },
    search: (q) => {
      searchInput.value = q
      search(q)
    },
    sectionMenu,
    pageMenu,
    renameSection,
    removePage,
    removeSection,
  }
}
