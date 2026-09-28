// Home screen ▸ documents: the list of documents in this browser with local
// organization (nested folders, colored tags, trash), filters by app, folder
// and tag, sorting, list and grid views, multiple selection with drag and drop,
// and search in the documents' content (core/library-search.ts).

import { APPS, appInfo, type AppInfo } from '../apps/registry'
import { locale, t, tn } from '../core/i18n'
import * as lib from '../core/library'
import { refreshIndex, searchDocs, type SearchHit } from '../core/library-search'
import { docPath } from '../core/router'
import * as store from '../core/store'
import { confirmDialog, el, icon, promptText, showContextMenu, showDialog, toast, uiZoom, type MenuEntry } from '../ui/widgets'
import { Folder, FolderPlus, LayoutGrid, List, Plus, Tag, Trash2, Files } from 'lucide'
import { backupFlow } from './storage'

type View = { kind: 'all' } | { kind: 'folder'; id: string } | { kind: 'tag'; id: string } | { kind: 'trash' }
type Sort = 'date' | 'name' | 'type'
type Layout = 'list' | 'grid'

const PREFS_KEY = 'ofimeo:home-view'
const DRAG_TYPE = 'application/x-ofimeo-docs'

function loadPrefs(): { sort: Sort; layout: Layout } {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') as { sort?: Sort; layout?: Layout }
    return { sort: p.sort && ['date', 'name', 'type'].includes(p.sort) ? p.sort : 'date', layout: p.layout === 'grid' ? 'grid' : 'list' }
  } catch {
    return { sort: 'date', layout: 'list' }
  }
}

const titleOf = (d: store.DocEntry) => d.title || appInfo(d.type).untitled

export interface DocsSection {
  element: HTMLElement
  refresh: () => void
}

export function documentsSection(): DocsSection {
  const prefs = loadPrefs()
  let view: View = { kind: 'all' }
  let appFilter: store.DocType | 'all' = 'all'
  let query = ''
  let hits: Map<string, SearchHit> | null = null
  let searchRun = 0
  const selected = new Set<string>()
  let lastClicked: string | null = null
  let visibleIds: string[] = []

  const savePrefs = () => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ sort: prefs.sort, layout: prefs.layout }))
    } catch {
      // Not remembered.
    }
  }

  // ----- Header: title, search, sort, layout -----
  const heading = el('h2', { id: 'docs-heading' })
  const search = el('input', { class: 'home-search', type: 'search', placeholder: t('Search in titles and content') })
  search.setAttribute('aria-label', t('Search documents'))
  search.addEventListener('input', () => {
    query = search.value.trim()
    void runSearch()
  })
  const sortSelect = el('select', { class: 'home-sort', title: t('Sort by') })
  sortSelect.setAttribute('aria-label', t('Sort by'))
  for (const [value, label] of [
    ['date', t('Last modified')],
    ['name', t('Name')],
    ['type', t('Type')],
  ] as [Sort, string][])
    sortSelect.append(new Option(label, value, false, prefs.sort === value))
  sortSelect.addEventListener('change', () => {
    prefs.sort = sortSelect.value as Sort
    savePrefs()
    renderList()
  })
  const layoutButtons = el('span', { class: 'home-layout', role: 'radiogroup' })
  layoutButtons.setAttribute('aria-label', t('View'))
  const renderLayoutButtons = () =>
    layoutButtons.replaceChildren(
      ...([
        ['list', List, t('List')],
        ['grid', LayoutGrid, t('Grid')],
      ] as const).map(([value, glyph, label]) => {
        const b = el('button', { type: 'button', class: prefs.layout === value ? 'active' : '', title: label }, icon(glyph, 16))
        b.setAttribute('role', 'radio')
        b.setAttribute('aria-checked', String(prefs.layout === value))
        b.setAttribute('aria-label', label)
        b.addEventListener('click', () => {
          prefs.layout = value
          savePrefs()
          renderLayoutButtons()
          renderList()
        })
        return b
      }),
    )

  // ----- App filter chips -----
  const filters = el('div', { class: 'home-filters', role: 'tablist' })
  filters.setAttribute('aria-label', t('Filter by app'))
  const filterOptions: [store.DocType | 'all', string][] = [['all', t('All')], ...APPS.map((a) => [a.type, a.plural] as [store.DocType, string])]
  const renderFilters = () =>
    filters.replaceChildren(
      ...filterOptions.map(([value, label]) => {
        const b = el('button', { type: 'button', class: `chip${appFilter === value ? ' active' : ''}`, textContent: label })
        b.setAttribute('role', 'tab')
        b.setAttribute('aria-selected', String(appFilter === value))
        b.addEventListener('click', () => {
          appFilter = value
          renderFilters()
          renderList()
        })
        return b
      }),
    )

  // ----- Sidebar: all, folders, tags, trash -----
  const side = el('nav', { class: 'lib-side' })
  side.setAttribute('aria-label', t('Folders and tags'))

  const setView = (next: View) => {
    view = next
    selected.clear()
    renderAll()
  }

  const dropTarget = (node: HTMLElement, onDrop: (ids: string[]) => void) => {
    node.addEventListener('dragover', (e) => {
      if (!e.dataTransfer?.types.includes(DRAG_TYPE)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      node.classList.add('drop-over')
    })
    node.addEventListener('dragleave', () => node.classList.remove('drop-over'))
    node.addEventListener('drop', (e) => {
      node.classList.remove('drop-over')
      const raw = e.dataTransfer?.getData(DRAG_TYPE)
      if (!raw) return
      e.preventDefault()
      onDrop(JSON.parse(raw) as string[])
    })
  }

  const sideItem = (label: string, glyph: Parameters<typeof icon>[0] | null, active: boolean, onClick: () => void, extra?: { count?: number; color?: string; depth?: number; menu?: () => MenuEntry[] }) => {
    const button = el(
      'button',
      { type: 'button', class: `lib-item${active ? ' active' : ''}` },
      extra?.color ? tagDot(extra.color) : glyph ? icon(glyph, 16) : null,
      el('span', { class: 'lib-label', textContent: label }),
      extra?.count ? el('span', { class: 'lib-count', textContent: String(extra.count) }) : null,
    )
    if (extra?.depth) button.style.paddingLeft = `${10 + extra.depth * 14}px`
    if (active) button.setAttribute('aria-current', 'true')
    button.addEventListener('click', onClick)
    const row = el('div', { class: 'lib-row' }, button)
    if (extra?.menu) {
      const more = el('button', { type: 'button', class: 'lib-more', textContent: '⋮', title: t('More actions') })
      more.setAttribute('aria-label', t('More actions for {name}', { name: label }))
      more.addEventListener('click', (e) => {
        e.stopPropagation()
        const rect = more.getBoundingClientRect()
        showContextMenu(rect.left, rect.bottom, extra.menu!())
      })
      button.addEventListener('contextmenu', (e) => {
        e.preventDefault()
        showContextMenu(e.clientX, e.clientY, extra.menu!())
      })
      row.append(more)
    }
    return row
  }

  const folderMenu = (f: lib.Folder): MenuEntry[] => [
    { label: t('New subfolder…'), run: () => void newFolder(f.id) },
    { label: t('Rename…'), run: () => void renameFolder(f) },
    { label: t('Move to top level'), visible: () => !!f.parent, run: () => (lib.moveFolder(f.id) || toast(t('There is already a folder called “{name}” here. Choose another name.', { name: f.name })), renderAll()) },
    '-',
    { label: t('Delete folder…'), run: () => void deleteFolder(f) },
  ]

  const tagMenu = (tag: lib.Tag): MenuEntry[] => [
    { label: t('Rename…'), run: () => void renameTag(tag) },
    {
      label: t('Color'),
      submenu: lib.TAG_COLORS.map((color, i) => ({
        label: [t('Red'), t('Orange'), t('Yellow'), t('Green'), t('Cyan'), t('Blue'), t('Purple'), t('Pink'), t('Grey')][i],
        active: () => tag.color === color,
        run: () => (lib.updateTag(tag.id, { color }), renderAll()),
      })),
    },
    '-',
    { label: t('Delete tag…'), run: () => void deleteTag(tag) },
  ]

  const renderSide = () => {
    const docs = store.activeDocs()
    const folders = lib.listFolders()
    const all = sideItem(t('All documents'), Files, view.kind === 'all', () => setView({ kind: 'all' }), { count: docs.length })
    // Dropping on "All documents" takes documents out of their folder.
    dropTarget(all, (ids) => {
      lib.moveDocs(ids)
      toast(tn(ids.length, '{n} document moved to the top level', '{n} documents moved to the top level'))
      renderAll()
    })
    const tree: HTMLElement[] = []
    const walk = (parent: string | undefined, depth: number) => {
      for (const f of folders.filter((x) => x.parent === parent).sort((a, b) => a.name.localeCompare(b.name, locale))) {
        const count = docs.filter((d) => d.folder === f.id).length
        const item = sideItem(f.name, Folder, view.kind === 'folder' && view.id === f.id, () => setView({ kind: 'folder', id: f.id }), { count, depth, menu: () => folderMenu(f) })
        dropTarget(item, (ids) => moveTo(ids, f.id))
        tree.push(item)
        walk(f.id, depth + 1)
      }
    }
    walk(undefined, 0)
    const newFolderButton = el('button', { type: 'button', class: 'lib-add', title: t('New folder') }, icon(FolderPlus, 16))
    newFolderButton.setAttribute('aria-label', t('New folder'))
    newFolderButton.addEventListener('click', () => void newFolder(view.kind === 'folder' ? view.id : undefined))
    const newTagButton = el('button', { type: 'button', class: 'lib-add', title: t('New tag') }, icon(Plus, 16))
    newTagButton.setAttribute('aria-label', t('New tag'))
    newTagButton.addEventListener('click', () => void newTag())
    const tags = lib.listTags().map((tag) => {
      const count = docs.filter((d) => d.tags?.includes(tag.id)).length
      const item = sideItem(tag.name, Tag, view.kind === 'tag' && view.id === tag.id, () => setView({ kind: 'tag', id: tag.id }), { count, color: tag.color, menu: () => tagMenu(tag) })
      dropTarget(item, (ids) => {
        store.updateDocs(ids, (d) => (d.tags = [...new Set([...(d.tags ?? []), tag.id])]))
        toast(t('Tag “{tag}” added', { tag: tag.name }))
        renderAll()
      })
      return item
    })
    const trashCount = store.trashedDocs().length
    const trash = sideItem(t('Trash'), Trash2, view.kind === 'trash', () => setView({ kind: 'trash' }), { count: trashCount })
    dropTarget(trash, (ids) => trashIds(ids))
    side.replaceChildren(
      el('div', { class: 'lib-group' }, all),
      el('div', { class: 'lib-group' }, el('div', { class: 'lib-head' }, el('span', { textContent: t('Folders') }), newFolderButton), ...tree),
      el('div', { class: 'lib-group' }, el('div', { class: 'lib-head' }, el('span', { textContent: t('Tags') }), newTagButton), ...tags),
      el('div', { class: 'lib-group' }, trash),
    )
  }

  // ----- Folder and tag dialogs -----
  // Asks for a name until it is free (or the dialog is cancelled).
  const askName = async (title: string, label: string, value: string, taken: (name: string) => boolean, message: (name: string) => string): Promise<string | null> => {
    for (;;) {
      const name = (await promptText(title, label, value))?.trim()
      if (!name) return null
      if (!taken(name)) return name
      toast(message(name))
      value = name
    }
  }
  const askFolderName = (title: string, parent?: string, value = '', except?: string) =>
    askName(title, t('Folder name'), value, (name) => lib.folderNameTaken(name, parent, except), (name) => t('There is already a folder called “{name}” here. Choose another name.', { name }))
  const askTagName = (title: string, value = '', except?: string) =>
    askName(title, t('Tag name'), value, (name) => lib.tagNameTaken(name, except), (name) => t('There is already a tag called “{name}”. Choose another name.', { name }))
  const newFolder = async (parent?: string) => {
    const name = await askFolderName(t('New folder'), parent)
    if (!name) return
    lib.createFolder(name, parent)
    renderAll()
  }
  const renameFolder = async (f: lib.Folder) => {
    const name = await askFolderName(t('Rename folder'), f.parent, f.name, f.id)
    if (!name) return
    lib.renameFolder(f.id, name)
    renderAll()
  }
  const deleteFolder = async (f: lib.Folder) => {
    if (!(await confirmDialog(t('Delete folder'), t('Delete the folder “{name}” and its subfolders? The documents in them are not deleted: they move to the parent folder.', { name: f.name }), { confirmLabel: t('Delete'), danger: true }))) return
    lib.deleteFolder(f.id)
    if (view.kind === 'folder' && (view.id === f.id || !lib.getFolder(view.id))) view = f.parent ? { kind: 'folder', id: f.parent } : { kind: 'all' }
    renderAll()
  }
  const newTag = async (): Promise<lib.Tag | null> => {
    const name = await askTagName(t('New tag'))
    if (!name) return null
    const tag = lib.createTag(name)
    renderAll()
    return tag
  }
  const renameTag = async (tag: lib.Tag) => {
    const name = await askTagName(t('Rename tag'), tag.name, tag.id)
    if (!name) return
    lib.updateTag(tag.id, { name })
    renderAll()
  }
  const deleteTag = async (tag: lib.Tag) => {
    if (!(await confirmDialog(t('Delete tag'), t('Delete the tag “{name}”? The documents keep everything else.', { name: tag.name }), { confirmLabel: t('Delete'), danger: true }))) return
    lib.deleteTag(tag.id)
    if (view.kind === 'tag' && view.id === tag.id) view = { kind: 'all' }
    renderAll()
  }

  // ----- Actions on documents -----
  const moveTo = (ids: string[], folder?: string) => {
    lib.moveDocs(ids, folder)
    const name = lib.getFolder(folder)?.name
    toast(name ? tn(ids.length, '{n} document moved to “{folder}”', '{n} documents moved to “{folder}”', { folder: name }) : tn(ids.length, '{n} document moved to the top level', '{n} documents moved to the top level'))
    renderAll()
  }

  const chooseFolder = async (ids: string[]) => {
    const select = el('select', { class: 'field' })
    select.append(new Option(t('Top level (no folder)'), ''))
    const folders = lib.listFolders()
    const walk = (parent: string | undefined, depth: number) => {
      for (const f of folders.filter((x) => x.parent === parent).sort((a, b) => a.name.localeCompare(b.name, locale))) {
        select.append(new Option(`${' '.repeat(depth)}${f.name}`, f.id))
        walk(f.id, depth + 1)
      }
    }
    walk(undefined, 0)
    const current = store.getDoc(ids[0])?.folder
    select.value = current ?? ''
    const newButton = el('button', { type: 'button', class: 'storage-btn', textContent: t('New folder…') })
    newButton.addEventListener('click', async () => {
      const name = await askFolderName(t('New folder'), select.value || undefined)
      if (!name) return
      const f = lib.createFolder(name, select.value || undefined)
      select.append(new Option(f.name, f.id))
      select.value = f.id
    })
    const body = el('div', { class: 'storage-dialog' }, el('label', { class: 'field-label' }, t('Folder'), select), el('div', {}, newButton))
    const answer = await showDialog(tn(ids.length, 'Move {n} document', 'Move {n} documents'), body, [
      { label: t('Cancel'), value: 'cancel' },
      { label: t('Move'), value: 'ok', primary: true },
    ])
    if (answer === 'ok') moveTo(ids, select.value || undefined)
    else renderAll()
  }

  const tagItems = (ids: string[]): MenuEntry[] => [
    ...lib.listTags().map((tag) => ({
      label: tag.name,
      active: () => ids.every((id) => store.getDoc(id)?.tags?.includes(tag.id)),
      run: () => (lib.toggleTag(ids, tag.id), renderAll()),
    })),
    ...(lib.listTags().length ? ['-' as const] : []),
    {
      label: t('New tag…'),
      run: async () => {
        const tag = await newTag()
        if (tag) (lib.toggleTag(ids, tag.id), renderAll())
      },
    },
  ]

  const trashIds = (ids: string[]) => {
    store.trashDocs(ids)
    ids.forEach((id) => selected.delete(id))
    toast(tn(ids.length, '{n} document moved to the trash', '{n} documents moved to the trash'))
    renderAll()
  }

  const restoreIds = (ids: string[]) => {
    store.restoreDocs(ids)
    ids.forEach((id) => selected.delete(id))
    toast(tn(ids.length, '{n} document restored', '{n} documents restored'))
    renderAll()
  }

  const deleteForever = async (ids: string[]) => {
    const question = tn(ids.length, 'Delete {n} document from this browser for good? This cannot be undone. Collaborators keep their copies.', 'Delete {n} documents from this browser for good? This cannot be undone. Collaborators keep their copies.')
    if (!(await confirmDialog(t('Delete for good'), question, { confirmLabel: t('Delete'), danger: true }))) return
    for (const id of ids) await store.deleteDoc(id)
    ids.forEach((id) => selected.delete(id))
    renderAll()
  }

  const download = (ids: string[]) =>
    void import('./download').then((m) => m.downloadDocs(ids.map((id) => store.getDoc(id)).filter((d): d is store.DocEntry => !!d)))

  const docActions = (d: store.DocEntry): MenuEntry[] => {
    const ids = selected.has(d.id) && selected.size > 1 ? [...selected] : [d.id]
    const href = docPath(d.type, d.id, d.key)
    if (d.trashed)
      return [
        { label: t('Restore'), run: () => restoreIds(ids) },
        '-',
        { label: t('Delete for good…'), run: () => void deleteForever(ids) },
      ]
    return [
      ...(ids.length === 1
        ? [
            { label: t('Open'), run: () => (location.href = href) },
            { label: t('Open in new tab'), run: () => void window.open(href, '_blank') },
            '-' as const,
          ]
        : []),
      { label: t('Move to folder…'), run: () => void chooseFolder(ids) },
      { label: t('Tags'), submenu: tagItems(ids) },
      '-',
      { label: t('Download'), run: () => download(ids) },
      { label: t('Back up…'), run: () => void backupFlow(ids) },
      '-',
      { label: t('Move to the trash'), run: () => trashIds(ids) },
    ]
  }

  // ----- Selection bar -----
  const selectionBar = el('div', { class: 'selection-bar', role: 'toolbar' })
  selectionBar.setAttribute('aria-label', t('Selected documents'))
  const barButton = (label: string, run: (e: MouseEvent) => void, cls = '') => {
    const b = el('button', { type: 'button', class: `storage-btn ${cls}`.trim(), textContent: label })
    b.addEventListener('click', run)
    return b
  }
  const renderSelectionBar = () => {
    selectionBar.hidden = selected.size === 0
    if (!selected.size) return selectionBar.replaceChildren()
    const ids = [...selected]
    const count = el('span', { class: 'selection-count', textContent: tn(ids.length, '{n} selected', '{n} selected') })
    const clear = barButton(t('Clear selection'), () => {
      selected.clear()
      renderList()
    })
    if (view.kind === 'trash') {
      selectionBar.replaceChildren(count, barButton(t('Restore'), () => restoreIds(ids)), barButton(t('Delete for good…'), () => void deleteForever(ids), 'danger'), clear)
      return
    }
    const tagButton = barButton(t('Tags'), (e) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      showContextMenu(rect.left, rect.bottom, tagItems(ids))
    })
    tagButton.setAttribute('aria-haspopup', 'menu')
    selectionBar.replaceChildren(
      count,
      barButton(t('Move…'), () => void chooseFolder(ids)),
      tagButton,
      barButton(t('Download'), () => download(ids)),
      barButton(t('Back up…'), () => void backupFlow(ids)),
      barButton(t('Move to the trash'), () => trashIds(ids), 'danger'),
      clear,
    )
  }

  // ----- The list -----
  const list = el('div', { class: 'doc-table' })
  list.setAttribute('aria-labelledby', 'docs-heading')
  const listHead = el('div', { class: 'doc-head-wrap' })
  const trashBar = el('div', { class: 'trash-bar' })

  const docsInView = (): store.DocEntry[] => {
    if (view.kind === 'trash') return store.trashedDocs()
    const docs = store.activeDocs()
    if (view.kind === 'folder') {
      // While searching, the folder's subfolders are searched too.
      const ids = query ? new Set([view.id, ...lib.descendants(view.id)]) : new Set([view.id])
      return docs.filter((d) => d.folder && ids.has(d.folder))
    }
    if (view.kind === 'tag') {
      const id = view.id
      return docs.filter((d) => d.tags?.includes(id))
    }
    return docs
  }

  const sortDocs = (docs: store.DocEntry[]) => {
    const byName = (a: store.DocEntry, b: store.DocEntry) => titleOf(a).localeCompare(titleOf(b), locale, { numeric: true, sensitivity: 'base' })
    if (prefs.sort === 'name') return docs.sort(byName)
    if (prefs.sort === 'type') return docs.sort((a, b) => APPS.findIndex((x) => x.type === a.type) - APPS.findIndex((x) => x.type === b.type) || byName(a, b))
    return docs.sort((a, b) => (view.kind === 'trash' ? b.trashed! - a.trashed! : b.updated - a.updated))
  }

  const runSearch = async () => {
    const run = ++searchRun
    if (!query) {
      hits = null
      return renderList()
    }
    const result = await searchDocs(docsInView(), query, titleOf)
    if (run !== searchRun) return
    hits = result
    renderList()
  }

  const renderHeading = () => {
    const titles: Record<View['kind'], () => string> = {
      all: () => t('Your documents'),
      folder: () =>
        lib
          .folderPath((view as { id: string }).id)
          .map((f) => f.name)
          .join(' › ') || t('Folder'),
      tag: () => t('Tag: {name}', { name: lib.getTag((view as { id: string }).id)?.name ?? '' }),
      trash: () => t('Trash'),
    }
    heading.textContent = titles[view.kind]()
  }

  const toggleSelect = (id: string, e?: MouseEvent | KeyboardEvent) => {
    if (e?.shiftKey && lastClicked && visibleIds.includes(lastClicked)) {
      const [a, b] = [visibleIds.indexOf(lastClicked), visibleIds.indexOf(id)].sort((x, y) => x - y)
      for (const x of visibleIds.slice(a, b + 1)) selected.add(x)
    } else if (selected.has(id)) selected.delete(id)
    else selected.add(id)
    lastClicked = id
    renderList()
  }

  const renderList = () => {
    renderHeading()
    trashBar.hidden = view.kind !== 'trash'
    if (view.kind === 'trash') {
      const empty = barButton(t('Empty trash…'), async () => {
        const ids = store.trashedDocs().map((d) => d.id)
        if (!ids.length) return
        const question = tn(ids.length, 'Delete {n} document in the trash for good? This cannot be undone.', 'Delete {n} documents in the trash for good? This cannot be undone.')
        if (!(await confirmDialog(t('Empty trash'), question, { confirmLabel: t('Empty trash'), danger: true }))) return
        for (const id of ids) await store.deleteDoc(id)
        selected.clear()
        renderAll()
      }, 'danger')
      empty.disabled = !store.trashedDocs().length
      trashBar.replaceChildren(el('span', { class: 'hint', textContent: tn(store.TRASH_DAYS, 'Documents in the trash are deleted for good after {n} day.', 'Documents in the trash are deleted for good after {n} days.') }), empty)
    }
    let docs = docsInView().filter((d) => appFilter === 'all' || d.type === appFilter)
    if (hits) docs = docs.filter((d) => hits!.has(d.id))
    docs = sortDocs(docs)
    // Title matches first while searching.
    if (hits) docs.sort((a, b) => Number(hits!.get(b.id)!.inTitle) - Number(hits!.get(a.id)!.inTitle))
    visibleIds = docs.map((d) => d.id)
    for (const id of [...selected]) if (!store.getDoc(id)) selected.delete(id)

    list.className = `doc-table ${prefs.layout === 'grid' ? 'grid' : 'list'}${selected.size ? ' selecting' : ''}`
    list.setAttribute('role', 'list')
    const subfolders = view.kind === 'folder' && !query ? lib.listFolders().filter((f) => f.parent === (view as { id: string }).id).sort((a, b) => a.name.localeCompare(b.name, locale)) : []
    const rows: HTMLElement[] = [...subfolders.map(folderRow)]
    rows.push(...docs.map(docRow))
    if (!rows.length) {
      const text =
        view.kind === 'trash'
          ? t('The trash is empty.')
          : query || appFilter !== 'all'
            ? t('No matching documents.')
            : view.kind === 'folder'
              ? t('This folder is empty. Drag documents here or use “Move to folder…”.')
              : view.kind === 'tag'
                ? t('No documents have this tag.')
                : t('Nothing here yet. Create a document above, open a file or open a link someone shared with you.')
      listHead.replaceChildren()
      list.replaceChildren(el('p', { class: 'empty', textContent: text }))
    } else {
      const head =
        prefs.layout === 'list' && docs.length
          ? (() => {
              const all = el('input', { type: 'checkbox', class: 'row-check', title: t('Select all') })
              all.setAttribute('aria-label', t('Select all'))
              all.checked = docs.every((d) => selected.has(d.id))
              all.indeterminate = !all.checked && docs.some((d) => selected.has(d.id))
              all.addEventListener('change', () => {
                if (all.checked) docs.forEach((d) => selected.add(d.id))
                else docs.forEach((d) => selected.delete(d.id))
                renderList()
              })
              return el(
                'div',
                { class: 'doc-head' },
                all,
                el('span', {}),
                el('span', { textContent: t('Name') }),
                el('span', { class: 'doc-type', textContent: t('Type') }),
                el('span', { class: 'doc-date', textContent: view.kind === 'trash' ? t('Deleted') : t('Last modified') }),
                el('span', {}),
              )
            })()
          : null
      listHead.replaceChildren(...(head ? [head] : []))
      list.replaceChildren(...rows)
    }
    renderSelectionBar()
  }

  const folderRow = (f: lib.Folder): HTMLElement => {
    const open = () => setView({ kind: 'folder', id: f.id })
    const row = el(
      'a',
      { class: 'doc-row folder-row', href: '#', role: 'listitem' },
      el('span', {}),
      el('span', { class: 'folder-icon' }, icon(Folder, 20)),
      el('span', { class: 'doc-name', textContent: f.name }),
      el('span', { class: 'doc-type', textContent: t('Folder') }),
      el('span', { class: 'doc-date', textContent: tn(store.activeDocs().filter((d) => d.folder === f.id).length, '{n} document', '{n} documents') }),
      el('span', {}),
    )
    row.addEventListener('click', (e) => {
      e.preventDefault()
      open()
    })
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      showContextMenu(e.clientX, e.clientY, folderMenu(f))
    })
    dropTarget(row, (ids) => moveTo(ids, f.id))
    return row
  }

  const docRow = (d: store.DocEntry): HTMLElement => {
    const app = appInfo(d.type)
    const href = docPath(d.type, d.id, d.key)
    const inTrash = !!d.trashed
    const check = el('input', { type: 'checkbox', class: 'row-check', checked: selected.has(d.id) })
    check.setAttribute('aria-label', t('Select “{title}”', { title: titleOf(d) }))
    check.addEventListener('click', (e) => {
      e.stopPropagation()
      e.preventDefault()
      toggleSelect(d.id, e)
    })
    const more = el('button', { type: 'button', class: 'row-more', title: t('More actions'), textContent: '⋮' })
    more.setAttribute('aria-label', t('More actions'))
    const tags = (d.tags ?? []).map((id) => lib.getTag(id)).filter((x): x is lib.Tag => !!x)
    const hit = hits?.get(d.id)
    const folderLabel = view.kind !== 'folder' && d.folder ? lib.folderPath(d.folder).map((f) => f.name).join(' › ') : ''
    const name = el(
      'span',
      { class: 'doc-name' },
      el('span', { class: 'doc-row-title', textContent: titleOf(d) }),
      d.access === 'view' || d.access === 'comment' ? el('span', { class: 'access-tag', textContent: d.access === 'view' ? t('View only') : t('Can comment') }) : null,
      d.remote ? el('span', { class: 'cloud-tag', textContent: 'Nextcloud', title: d.remote.path }) : null,
      ...tags.map((tag) => el('span', { class: 'doc-tag', title: t('Tag: {name}', { name: tag.name }) }, tagDot(tag.color), tag.name)),
    )
    const details = el('span', { class: 'doc-main' }, name)
    if (folderLabel) details.append(el('span', { class: 'doc-folder' }, icon(Folder, 12), folderLabel))
    if (hit?.snippet.length) details.append(el('span', { class: 'doc-snippet' }, ...hit.snippet.map((s) => (s.hit ? el('mark', { textContent: s.text }) : s.text))))
    const time = inTrash ? d.trashed! : d.updated
    const row = el(
      'a',
      { class: `doc-row${selected.has(d.id) ? ' selected' : ''}${inTrash ? ' in-trash' : ''}`, href: inTrash ? '#' : href, role: 'listitem', draggable: !inTrash },
      check,
      appIcon(app, prefs.layout === 'grid' ? 'large' : 'small'),
      details,
      el('span', { class: 'doc-type', textContent: app.name }),
      el('span', { class: 'doc-date', textContent: formatDate(time), title: new Date(time).toLocaleString(locale) }),
      more,
    )
    row.dataset.id = d.id
    if (selected.has(d.id)) row.setAttribute('aria-selected', 'true')
    row.addEventListener('click', (e) => {
      // Ctrl/Cmd or Shift click selects; while selecting, a click toggles.
      if (e.ctrlKey || e.metaKey || e.shiftKey || selected.size || inTrash) {
        e.preventDefault()
        toggleSelect(d.id, e)
      }
    })
    more.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const rect = more.getBoundingClientRect()
      showContextMenu(rect.left - 180 * uiZoom(), rect.bottom, docActions(d))
    })
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      showContextMenu(e.clientX, e.clientY, docActions(d))
    })
    row.addEventListener('keydown', (e) => {
      if (e.key === ' ') {
        e.preventDefault()
        toggleSelect(d.id, e)
      } else if (e.key === 'Delete' && !inTrash) {
        e.preventDefault()
        trashIds(selected.has(d.id) ? [...selected] : [d.id])
      }
    })
    row.addEventListener('dragstart', (e) => {
      const ids = selected.has(d.id) ? [...selected] : [d.id]
      e.dataTransfer?.setData(DRAG_TYPE, JSON.stringify(ids))
      e.dataTransfer?.setData('text/uri-list', new URL(href, location.href).href)
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copyMove'
      document.body.classList.add('dragging-docs')
    })
    row.addEventListener('dragend', () => document.body.classList.remove('dragging-docs'))
    return row
  }

  // A new library (no documents, folders or tags) shows only the empty list:
  // search, sorting, folders and filters appear with the first document.
  const renderBare = () => element.classList.toggle('docs-bare', !store.listDocs().length && !lib.listFolders().length && !lib.listTags().length)
  const renderAll = () => {
    renderBare()
    renderSide()
    renderFilters()
    if (query) void runSearch()
    else {
      hits = null
      renderList()
    }
  }

  // Indexes documents that changed (in a worker), then searches again.
  let indexTimer = 0
  const reindex = () => {
    clearTimeout(indexTimer)
    indexTimer = window.setTimeout(() => {
      void refreshIndex(store.activeDocs()).then(() => {
        if (query) void runSearch()
      })
    }, 1000)
  }

  const element = el(
    'div',
    { class: 'home-inner' },
    el('div', { class: 'home-section-title docs-title' }, heading, el('span', { class: 'docs-tools' }, search, sortSelect, layoutButtons)),
    el('div', { class: 'lib-layout' }, side, el('div', { class: 'lib-main' }, filters, trashBar, selectionBar, listHead, list)),
  )
  renderLayoutButtons()
  renderAll()
  reindex()

  return {
    element,
    refresh: () => {
      renderAll()
      reindex()
    },
  }
}

function tagDot(color: string): HTMLElement {
  const dot = el('span', { class: 'tag-dot' })
  dot.style.background = color
  return dot
}

function appIcon(app: AppInfo, size: 'small' | 'large'): HTMLElement {
  const node = el('span', { class: `app-icon ${size}`, textContent: app.letter })
  node.style.background = app.color
  return node
}

function formatDate(time: number): string {
  const date = new Date(time)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}
