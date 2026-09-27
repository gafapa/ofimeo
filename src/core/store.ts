// Local, per-browser bookkeeping: document index and user identity.

import { clearDocument } from 'y-indexeddb'
import { kvDelete } from './idb'
import type { Access, LinkKeys } from './keys'
import { t } from './i18n'

const DOCS_KEY = 'words-online:docs'
const USER_KEY = 'words-online:user'
const COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#469990', '#f032e6', '#9a6324', '#800000', '#000075']

export type DocType = 'writer' | 'sheet' | 'draw' | 'diagram' | 'slides' | 'forms' | 'pdf' | 'notebook'
export const DOC_TYPES: DocType[] = ['writer', 'sheet', 'draw', 'diagram', 'slides', 'forms', 'pdf', 'notebook']

export interface DocEntry {
  id: string
  type: DocType
  // Shared secret for the collaboration room; travels only inside share links.
  key: string
  title: string
  updated: number
  // Permission keys of protected documents (absent: legacy, full edit).
  keys?: LinkKeys
  // What this browser may do, from the keys it holds (absent means 'edit').
  access?: Access
  // File in Nextcloud this document saves to (only in this browser).
  remote?: RemoteLink
  // Local organization only (never shared): folder id and tag ids (see library.ts).
  folder?: string
  tags?: string[]
  // Time the document was moved to the trash; its data stays until the trash is emptied.
  trashed?: number
}

export interface RemoteLink {
  account: string // NcAccount.id
  path: string // relative to the user's files, e.g. /Documents/Essay.docx
  format: string // export format (extension), e.g. 'docx'
  etag?: string // version last opened or saved (If-Match)
  fileId?: string
  savedAt?: number
  // Yjs state vector (base64) when last opened or saved: differs → unsaved changes.
  savedVector?: string
}

export interface User {
  name: string
  color: string
}

export const dbName = (id: string) => `words-online:${id}`
export const commentsDbName = (id: string) => `words-online:${id}:comments`
// Editor-only state of an app kept outside the shared document (a form's answer key).
export const privateDbName = (type: DocType, id: string) => `words-online:${id}:${type}-private`
export const signedLogKey = (id: string, channel: string) => `signed:${id}:${channel}`

export const newDocId = () => randomToken(9)
export const newDocKey = () => randomToken(18)

// crypto.randomUUID is not available on insecure (http) origins.
function randomToken(bytes: number): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes))
  return btoa(String.fromCharCode(...data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Every entry, including those in the trash (newest first).
export function listDocs(): DocEntry[] {
  // Entries written before document types existed are word-processor documents.
  return read<DocEntry[]>(DOCS_KEY, [])
    .map((d) => (DOC_TYPES.includes(d.type) ? d : { ...d, type: 'writer' as const }))
    .sort((a, b) => b.updated - a.updated)
}

export const activeDocs = () => listDocs().filter((d) => !d.trashed)
export const trashedDocs = () => listDocs().filter((d) => d.trashed)

export function getDoc(id: string): DocEntry | undefined {
  return listDocs().find((d) => d.id === id)
}

// Adds or updates an entry; fields not given (e.g. `remote`) are kept.
export function saveDoc(entry: Omit<DocEntry, 'updated'>): void {
  const all = listDocs()
  const previous = all.find((d) => d.id === entry.id)
  const docs = all.filter((d) => d.id !== entry.id)
  docs.push({ ...previous, ...entry, updated: Date.now() })
  write(DOCS_KEY, docs)
  // The first document of this browser that one can edit (not a form to answer
  // or a view link): ask for persistent storage (backup.ts, asks only once).
  if (!previous && (entry.access ?? 'edit') === 'edit' && !all.some((d) => (d.access ?? 'edit') === 'edit')) void import('./backup').then((m) => m.onFirstDocument())
}

// Changes organization fields (folder, tags, trash) without touching `updated`.
export function updateDocs(ids: string[], patch: (entry: DocEntry) => void): void {
  const docs = listDocs()
  for (const entry of docs) if (ids.includes(entry.id)) patch(entry)
  write(DOCS_KEY, docs)
}

// Adds or replaces an entry as is (restoring a backup).
export function putDoc(entry: DocEntry): void {
  write(DOCS_KEY, [...listDocs().filter((d) => d.id !== entry.id), entry])
}

export const TRASH_DAYS = 30

export function trashDocs(ids: string[]): void {
  const now = Date.now()
  updateDocs(ids, (d) => (d.trashed = now))
}

export function restoreDocs(ids: string[]): void {
  updateDocs(ids, (d) => delete d.trashed)
}

// Deletes the documents in the trash for more than 30 days; returns how many.
export async function purgeExpiredTrash(now = Date.now()): Promise<number> {
  const expired = trashedDocs().filter((d) => now - d.trashed! > TRASH_DAYS * 86400000)
  for (const d of expired) await deleteDoc(d.id)
  return expired.length
}

// Links a document to a file in Nextcloud (undefined: unlinks it).
export function setRemoteLink(id: string, remote: RemoteLink | undefined): void {
  const docs = listDocs()
  const entry = docs.find((d) => d.id === id)
  if (!entry) return
  if (remote) entry.remote = remote
  else delete entry.remote
  write(DOCS_KEY, docs)
}

// Deletes a document from this browser for good (its IndexedDB data too).
export async function deleteDoc(id: string): Promise<void> {
  write(DOCS_KEY, listDocs().filter((d) => d.id !== id))
  await clearDocument(dbName(id))
  await clearDocument(commentsDbName(id))
  await kvDelete(signedLogKey(id, 'yjs'))
  await kvDelete(signedLogKey(id, 'cmt'))
  await import('./library-search').then((m) => m.forgetText(id)).catch(() => undefined)
}

export function loadUser(): User {
  const user = read<User | null>(USER_KEY, null)
  if (user) return user
  const created = {
    name: t('Guest {n}', { n: Math.floor(Math.random() * 900 + 100) }),
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }
  saveUser(created)
  return created
}

export function saveUser(user: User): void {
  write(USER_KEY, user)
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage may be unavailable (private mode); ignore.
  }
}
