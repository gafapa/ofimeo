// Data safety for documents that live only in this browser: persistent
// storage, storage usage, backups (.ofimeo-backup) and their restore, the
// "no backup for N days" reminder and the optional automatic backup to Nextcloud.
//
// A backup is a zip:
//   ofimeo-backup.json         {format: 'ofimeo-backup', version, created, documents, templates, encrypted?}
//   index.json                 {docs: DocEntry[] (keys and access included), library: {folders, tags}}
//   docs/<id>/doc.yjs          Y.encodeStateAsUpdate of the document (version history included)
//   docs/<id>/comments.yjs     the same for its comments document
//   docs/<id>/signed-<ch>.json signed update logs of protected documents (base64), when present
//   templates.json             own templates (library-templates.ts), state in base64
// With a password, the zip above is encrypted (AES-GCM, key from PBKDF2-SHA-256)
// and stored as payload.bin next to an ofimeo-backup.json that describes the cipher.
// Restoring merges: documents already here receive the backup's Yjs updates
// (nothing is lost on either side), missing ones are added.

import JSZip from 'jszip'
import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { t } from './i18n'
import { kvGet, kvSet } from './idb'
import { accessRank } from './keys'
import { dbAll, dbGet, dbPut, exportLibrary, mergeLibrary } from './library'
import * as store from './store'

export const BACKUP_EXT = '.ofimeo-backup'
const FORMAT = 'ofimeo-backup'
const VERSION = 1
const ITERATIONS = 310000
const SETTINGS_KEY = 'words-online:backup'
const DAY = 86400000

export interface BackupSettings {
  lastBackup?: number
  // When this browser got its first document (reference for the reminder before any backup).
  firstDocAt?: number
  // Remind after this many days without a backup (0: never).
  remindDays: number
  dismissedAt?: number
  persistAsked?: number
  // Automatic backup to Nextcloud; `password` (optional) encrypts it and is kept in this browser like the account.
  auto: { enabled: boolean; days: number; lastRun?: number; lastError?: string; folder: string; password?: string }
}

export function loadSettings(): BackupSettings {
  let saved: Partial<BackupSettings> = {}
  try {
    saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') as Partial<BackupSettings>
  } catch {
    // Defaults.
  }
  return {
    ...saved,
    remindDays: saved.remindDays ?? 7,
    auto: { enabled: false, days: 7, folder: '/Ofimeo/Backups', ...saved.auto },
  }
}

export function saveSettings(patch: Partial<BackupSettings>): BackupSettings {
  const next = { ...loadSettings(), ...patch }
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
  } catch {
    // Private mode.
  }
  return next
}

// ---------- Persistent storage ----------

export interface StorageInfo {
  usage?: number
  quota?: number
  persisted?: boolean
  supported: boolean
}

export async function storageInfo(): Promise<StorageInfo> {
  const s = navigator.storage
  if (!s?.estimate) return { supported: false }
  const [{ usage, quota }, persisted] = await Promise.all([s.estimate().catch(() => ({ usage: undefined, quota: undefined })), s.persisted?.().catch(() => false) ?? false])
  return { usage, quota, persisted, supported: true }
}

// Asks the browser not to evict this site's data (true when granted).
export async function requestPersistence(): Promise<boolean> {
  saveSettings({ persistAsked: Date.now() })
  try {
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}

// Called by store.saveDoc when the first document is created in this browser.
export async function onFirstDocument(): Promise<void> {
  const settings = loadSettings()
  if (!settings.firstDocAt) saveSettings({ firstDocAt: Date.now() })
  if (settings.persistAsked || !navigator.storage?.persist) return
  if (await navigator.storage.persisted?.().catch(() => false)) {
    saveSettings({ persistAsked: Date.now() })
    return
  }
  const granted = await requestPersistence()
  const { showPersistenceNotice } = await import('../home/storage')
  showPersistenceNotice(granted)
}

// Documents that exist only in this browser (not linked to a Nextcloud file).
export const localOnlyDocs = () => store.activeDocs().filter((d) => !d.remote)

// True when the home screen should warn that there is no recent backup.
export function reminderDue(now = Date.now()): boolean {
  const s = loadSettings()
  if (!s.remindDays || !localOnlyDocs().length) return false
  const since = s.lastBackup ?? s.firstDocAt ?? now
  if (now - since < s.remindDays * DAY) return false
  return !s.dismissedAt || now - s.dismissedAt >= s.remindDays * DAY
}

// ---------- Building a backup ----------

export interface TemplateRecord {
  id: string
  state: Uint8Array
  [field: string]: unknown
}

export interface BackupIndex {
  docs: store.DocEntry[]
  library: ReturnType<typeof exportLibrary>
}

const toBase64 = (bytes: Uint8Array) => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
export const base64 = { encode: toBase64, decode: fromBase64 }

// Full state of a y-indexeddb database.
async function readState(name: string): Promise<Uint8Array> {
  const doc = new Y.Doc()
  const persistence = new IndexeddbPersistence(name, doc)
  await persistence.whenSynced
  const state = Y.encodeStateAsUpdate(doc)
  await persistence.destroy()
  doc.destroy()
  return state
}

// Applies an update to a y-indexeddb database; true when it changed anything.
async function mergeState(name: string, update: Uint8Array): Promise<boolean> {
  const doc = new Y.Doc()
  const persistence = new IndexeddbPersistence(name, doc)
  await persistence.whenSynced
  const before = Y.encodeStateAsUpdate(doc)
  Y.applyUpdate(doc, update)
  const after = Y.encodeStateAsUpdate(doc)
  await persistence.destroy()
  doc.destroy()
  // A read on a new connection is ordered after the pending write.
  const check = new IndexeddbPersistence(name, new Y.Doc())
  await check.whenSynced
  await check.destroy()
  return before.length !== after.length || before.some((b, i) => b !== after[i])
}

export interface BackupOptions {
  // Only these documents (default: every document, the trash included).
  ids?: string[]
  password?: string
  onProgress?: (done: number, total: number) => void
}

export async function buildBackup(options: BackupOptions = {}): Promise<Blob> {
  const docs = store.listDocs().filter((d) => !options.ids || options.ids.includes(d.id))
  const zip = new JSZip()
  const templates = options.ids ? [] : await dbAll<TemplateRecord>('templates')
  zip.file('ofimeo-backup.json', JSON.stringify({ format: FORMAT, version: VERSION, created: Date.now(), documents: docs.length, templates: templates.length }, null, 1))
  const index: BackupIndex = { docs, library: exportLibrary() }
  zip.file('index.json', JSON.stringify(index, null, 1))
  let done = 0
  for (const d of docs) {
    options.onProgress?.(done++, docs.length)
    const dir = zip.folder(`docs/${d.id}`)!
    dir.file('doc.yjs', await readState(store.dbName(d.id)))
    dir.file('comments.yjs', await readState(store.commentsDbName(d.id)))
    for (const channel of ['yjs', 'cmt']) {
      const log = await kvGet<Uint8Array[]>(store.signedLogKey(d.id, channel))
      if (log?.length) dir.file(`signed-${channel}.json`, JSON.stringify(log.map(toBase64)))
    }
  }
  options.onProgress?.(done, docs.length)
  if (templates.length) zip.file('templates.json', JSON.stringify(templates.map((tpl) => ({ ...tpl, state: toBase64(tpl.state) }))))
  const inner = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  if (!options.password) {
    if (!options.ids) saveSettings({ lastBackup: Date.now(), dismissedAt: undefined })
    return new Blob([inner as BlobPart], { type: 'application/zip' })
  }
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(options.password, salt, ITERATIONS)
  const payload = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, inner as BufferSource))
  const outer = new JSZip()
  outer.file(
    'ofimeo-backup.json',
    JSON.stringify({ format: FORMAT, version: VERSION, created: Date.now(), encrypted: { cipher: 'AES-GCM', kdf: 'PBKDF2-SHA-256', iterations: ITERATIONS, salt: toBase64(salt), iv: toBase64(iv) } }, null, 1),
  )
  outer.file('payload.bin', payload)
  const blob = await outer.generateAsync({ type: 'blob', compression: 'STORE', mimeType: 'application/zip' })
  if (!options.ids) saveSettings({ lastBackup: Date.now(), dismissedAt: undefined })
  return blob
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  if (!crypto.subtle) throw new Error(t('Encryption needs a secure connection (https).'))
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export function backupFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `ofimeo-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}${BACKUP_EXT}`
}

// ---------- Reading and restoring ----------

export class BackupError extends Error {
  constructor(
    public kind: 'format' | 'password',
    message: string,
  ) {
    super(message)
  }
}

interface Manifest {
  format?: string
  version?: number
  created?: number
  encrypted?: { iterations: number; salt: string; iv: string }
}

export interface OpenedBackup {
  created?: number
  zip: JSZip
  index: BackupIndex
}

// True when the file needs a password.
export async function backupNeedsPassword(file: Blob): Promise<boolean> {
  return !!(await manifestOf(await loadZip(file))).encrypted
}

async function loadZip(file: Blob | Uint8Array): Promise<JSZip> {
  try {
    return await JSZip.loadAsync(file)
  } catch {
    throw new BackupError('format', t('This file is not an Ofimeo backup.'))
  }
}

async function manifestOf(zip: JSZip): Promise<Manifest> {
  const raw = await zip.file('ofimeo-backup.json')?.async('string')
  const manifest = raw ? (JSON.parse(raw) as Manifest) : null
  if (manifest?.format !== FORMAT) throw new BackupError('format', t('This file is not an Ofimeo backup.'))
  if ((manifest.version ?? 0) > VERSION) throw new BackupError('format', t('This backup was made with a newer version of Ofimeo.'))
  return manifest
}

export async function openBackup(file: Blob, password?: string): Promise<OpenedBackup> {
  let zip = await loadZip(file)
  let manifest = await manifestOf(zip)
  if (manifest.encrypted) {
    if (!password) throw new BackupError('password', t('This backup is protected with a password.'))
    const { iterations, salt, iv } = manifest.encrypted
    const key = await deriveKey(password, fromBase64(salt), iterations)
    const payload = await zip.file('payload.bin')!.async('uint8array')
    let inner: ArrayBuffer
    try {
      inner = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) as BufferSource }, key, payload as BufferSource)
    } catch {
      throw new BackupError('password', t('Wrong password.'))
    }
    zip = await loadZip(new Uint8Array(inner))
    manifest = await manifestOf(zip)
  }
  const index = JSON.parse((await zip.file('index.json')?.async('string')) ?? '{"docs":[]}') as BackupIndex
  return { created: manifest.created, zip, index }
}

export interface RestoreReport {
  added: store.DocEntry[]
  updated: store.DocEntry[]
  unchanged: store.DocEntry[]
  failed: { entry: store.DocEntry; error: string }[]
  templates: number
}

export async function restoreBackup(backup: OpenedBackup, onProgress?: (done: number, total: number) => void): Promise<RestoreReport> {
  const report: RestoreReport = { added: [], updated: [], unchanged: [], failed: [], templates: 0 }
  const docs = backup.index.docs.filter((d) => d && typeof d.id === 'string' && store.DOC_TYPES.includes(d.type))
  mergeLibrary(backup.index.library ?? {})
  let done = 0
  for (const entry of docs) {
    onProgress?.(done++, docs.length)
    try {
      const dir = `docs/${entry.id}/`
      const state = await backup.zip.file(`${dir}doc.yjs`)?.async('uint8array')
      const comments = await backup.zip.file(`${dir}comments.yjs`)?.async('uint8array')
      const existing = store.getDoc(entry.id)
      let changed = false
      if (state) changed = (await mergeState(store.dbName(entry.id), state)) || changed
      if (comments) changed = (await mergeState(store.commentsDbName(entry.id), comments)) || changed
      for (const channel of ['yjs', 'cmt']) {
        const raw = await backup.zip.file(`${dir}signed-${channel}.json`)?.async('string')
        if (!raw) continue
        const key = store.signedLogKey(entry.id, channel)
        const current = ((await kvGet<Uint8Array[]>(key)) ?? []).map(toBase64)
        const merged = [...new Set([...current, ...(JSON.parse(raw) as string[])])]
        if (merged.length !== current.length) await kvSet(key, merged.map(fromBase64))
      }
      if (!existing) {
        store.putDoc(entry)
        report.added.push(entry)
        continue
      }
      // Keep this browser's entry; take the backup's keys when they grant more.
      const next = { ...existing }
      if (accessRank(entry.access ?? 'edit') > accessRank(existing.access ?? 'edit')) {
        next.keys = entry.keys
        next.access = entry.access
        changed = true
      }
      if (!next.folder && entry.folder) next.folder = entry.folder
      if (!next.tags?.length && entry.tags?.length) next.tags = entry.tags
      if (!next.remote && entry.remote) next.remote = entry.remote
      if (changed) next.updated = Math.max(existing.updated, entry.updated, Date.now())
      store.putDoc(next)
      ;(changed ? report.updated : report.unchanged).push(next)
    } catch (err) {
      report.failed.push({ entry, error: (err as Error).message })
    }
  }
  onProgress?.(done, docs.length)
  const templates = await backup.zip.file('templates.json')?.async('string')
  if (templates) {
    for (const tpl of JSON.parse(templates) as { id: string; state: string }[]) {
      if (await dbGet('templates', tpl.id)) continue
      await dbPut('templates', { ...tpl, state: fromBase64(tpl.state) })
      report.templates++
    }
  }
  return report
}

// ---------- Automatic backup to Nextcloud ----------

// Runs the automatic backup when it is on, due and an account is linked.
// Returns the uploaded path, or null when nothing was done.
export async function runAutoBackup(force = false): Promise<string | null> {
  const settings = loadSettings()
  const auto = settings.auto
  if (!force && (!auto.enabled || (auto.lastRun && Date.now() - auto.lastRun < auto.days * DAY))) return null
  if (!navigator.onLine || !store.listDocs().length) return null
  const nc = await import('./nextcloud')
  const account = nc.currentAccount()
  if (!account) return null
  try {
    // Create the folder path one level at a time (existing folders are fine).
    let path = ''
    for (const part of auto.folder.split('/').filter(Boolean)) {
      path += `/${part}`
      if (!(await nc.stat(account, path))) await nc.createFolder(account, path)
    }
    const target = nc.joinPath(auto.folder, backupFileName())
    await nc.upload(account, target, await buildBackup({ password: auto.password || undefined }), { contentType: 'application/zip' })
    saveSettings({ auto: { ...auto, lastRun: Date.now(), lastError: undefined } })
    return target
  } catch (err) {
    saveSettings({ auto: { ...auto, lastError: (err as Error).message } })
    throw err
  }
}
