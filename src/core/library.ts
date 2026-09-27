// Local organization of the documents in this browser: nested folders and
// colored tags (never shared: they live only in this browser, like the index
// in store.ts), plus a small IndexedDB database for the content search index
// (library-search.ts) and own templates (library-templates.ts).
//
//   localStorage 'ofimeo:library'   { folders: Folder[], tags: Tag[] }
//   IndexedDB    'ofimeo-library'   stores 'texts' {id, text, indexed} and 'templates' (OwnTemplate)

import * as store from './store'

const LIBRARY_KEY = 'ofimeo:library'

export interface Folder {
  id: string
  name: string
  // Parent folder id (absent: top level).
  parent?: string
}

export interface Tag {
  id: string
  name: string
  color: string
}

interface Library {
  folders: Folder[]
  tags: Tag[]
}

// Tag colors (user data, shown as small dots next to the name).
export const TAG_COLORS = ['#d93025', '#e8710a', '#f9ab00', '#188038', '#12b5cb', '#1a73e8', '#9334e6', '#e52592', '#5f6368']

const newId = () => crypto.getRandomValues(new Uint32Array(2)).join('').slice(0, 12)

function read(): Library {
  try {
    const data = JSON.parse(localStorage.getItem(LIBRARY_KEY) || '{}') as Partial<Library>
    return { folders: Array.isArray(data.folders) ? data.folders : [], tags: Array.isArray(data.tags) ? data.tags : [] }
  } catch {
    return { folders: [], tags: [] }
  }
}

function write(library: Library): void {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(library))
  } catch {
    // Storage unavailable (private mode): lasts for this page only.
  }
}

export const listFolders = (): Folder[] => read().folders
export const listTags = (): Tag[] => read().tags
export const getFolder = (id?: string) => (id ? listFolders().find((f) => f.id === id) : undefined)
export const getTag = (id: string) => listTags().find((t) => t.id === id)

// The whole library (for backups) and merging a restored one.
export const exportLibrary = (): Library => read()
export function mergeLibrary(other: Partial<Library>): void {
  const lib = read()
  for (const f of other.folders ?? []) if (!lib.folders.some((x) => x.id === f.id)) lib.folders.push(f)
  for (const t of other.tags ?? []) if (!lib.tags.some((x) => x.id === t.id)) lib.tags.push(t)
  write(lib)
}

// Names are unique among sibling folders and among tags, ignoring case and accents.
const sameName = (a: string, b: string) => fold(a.trim()) === fold(b.trim())
export const folderNameTaken = (name: string, parent?: string, except?: string) =>
  listFolders().some((f) => f.id !== except && (f.parent ?? undefined) === (parent ?? undefined) && sameName(f.name, name))
export const tagNameTaken = (name: string, except?: string) => listTags().some((t) => t.id !== except && sameName(t.name, name))

export function createFolder(name: string, parent?: string): Folder {
  const lib = read()
  const folder: Folder = { id: newId(), name, ...(parent ? { parent } : {}) }
  lib.folders.push(folder)
  write(lib)
  return folder
}

export function renameFolder(id: string, name: string): void {
  const lib = read()
  const folder = lib.folders.find((f) => f.id === id)
  if (folder) folder.name = name
  write(lib)
}

// Moves a folder under another one (undefined: top level); refuses cycles.
export function moveFolder(id: string, parent?: string): boolean {
  if (parent && (parent === id || descendants(id).includes(parent))) return false
  const lib = read()
  const folder = lib.folders.find((f) => f.id === id)
  if (!folder || folderNameTaken(folder.name, parent, id)) return false
  if (parent) folder.parent = parent
  else delete folder.parent
  write(lib)
  return true
}

// Deletes a folder and its subfolders; their documents move to the parent folder.
export function deleteFolder(id: string): void {
  const lib = read()
  const folder = lib.folders.find((f) => f.id === id)
  const gone = new Set([id, ...descendants(id)])
  write({ ...lib, folders: lib.folders.filter((f) => !gone.has(f.id)) })
  store.updateDocs(
    store.listDocs().filter((d) => d.folder && gone.has(d.folder)).map((d) => d.id),
    (d) => {
      if (folder?.parent) d.folder = folder.parent
      else delete d.folder
    },
  )
}

// Ids of every folder below `id`.
export function descendants(id: string): string[] {
  const folders = listFolders()
  const out: string[] = []
  const walk = (parent: string) => {
    for (const f of folders) if (f.parent === parent && !out.includes(f.id)) (out.push(f.id), walk(f.id))
  }
  walk(id)
  return out
}

// Folder path from the top level, e.g. [Maths, 2º ESO].
export function folderPath(id?: string): Folder[] {
  const folders = listFolders()
  const out: Folder[] = []
  for (let f = folders.find((x) => x.id === id); f && !out.includes(f); f = folders.find((x) => x.id === f!.parent)) out.unshift(f)
  return out
}

export function createTag(name: string, color = TAG_COLORS[listTags().length % TAG_COLORS.length]): Tag {
  const lib = read()
  const tag: Tag = { id: newId(), name, color }
  lib.tags.push(tag)
  write(lib)
  return tag
}

export function updateTag(id: string, patch: Partial<Omit<Tag, 'id'>>): void {
  const lib = read()
  const tag = lib.tags.find((t) => t.id === id)
  if (tag) Object.assign(tag, patch)
  write(lib)
}

export function deleteTag(id: string): void {
  const lib = read()
  write({ ...lib, tags: lib.tags.filter((t) => t.id !== id) })
  store.updateDocs(
    store.listDocs().filter((d) => d.tags?.includes(id)).map((d) => d.id),
    (d) => (d.tags = d.tags!.filter((t) => t !== id)),
  )
}

export function moveDocs(ids: string[], folder?: string): void {
  store.updateDocs(ids, (d) => {
    if (folder) d.folder = folder
    else delete d.folder
  })
}

// Adds the tag to every document, or removes it when all of them have it.
export function toggleTag(ids: string[], tag: string): void {
  const docs = store.listDocs().filter((d) => ids.includes(d.id))
  const all = docs.every((d) => d.tags?.includes(tag))
  store.updateDocs(ids, (d) => {
    const tags = new Set(d.tags ?? [])
    if (all) tags.delete(tag)
    else tags.add(tag)
    d.tags = [...tags]
  })
}

// ---------- Text matching (accent- and case-insensitive) ----------

// Folds a string for matching: lower case, no diacritics (á → a, ñ → n).
export const fold = (text: string) => text.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()

// Folded text plus, for each folded character, its index in the original.
export function foldWithMap(text: string): { folded: string; map: number[] } {
  let folded = ''
  const map: number[] = []
  let i = 0
  for (const ch of text) {
    const f = fold(ch)
    for (let k = 0; k < f.length; k++) map.push(i)
    folded += f
    i += ch.length
  }
  map.push(i)
  return { folded, map }
}

// ---------- IndexedDB ----------

const DB_NAME = 'ofimeo-library'
export type LibraryStore = 'texts' | 'templates'
let dbPromise: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore('texts', { keyPath: 'id' })
      req.result.createObjectStore('templates', { keyPath: 'id' })
    }
    req.onsuccess = () => {
      // Deleting the database (clearing site data) must not be blocked by this page.
      req.result.onversionchange = () => {
        req.result.close()
        dbPromise = null
      }
      resolve(req.result)
    }
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function run<T>(name: LibraryStore, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = op(d.transaction(name, mode).objectStore(name))
        req.onsuccess = () => resolve(req.result as T)
        req.onerror = () => reject(req.error)
      }),
  )
}

export const dbAll = <T>(name: LibraryStore) => run<T[]>(name, 'readonly', (s) => s.getAll()).catch(() => [] as T[])
export const dbGet = <T>(name: LibraryStore, id: string) => run<T | undefined>(name, 'readonly', (s) => s.get(id)).catch(() => undefined)
export const dbPut = (name: LibraryStore, value: unknown) => run<void>(name, 'readwrite', (s) => s.put(value))
export const dbDelete = (name: LibraryStore, id: string) => run<void>(name, 'readwrite', (s) => s.delete(id)).catch(() => undefined)
