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
//   docs/<id>/private.yjs      editor-only state (version 2, never respondent/view backups)
//   templates.json             own templates, state and privateState in base64
// With a password, the zip above is encrypted (AES-GCM, key from PBKDF2-SHA-256)
// and stored as payload.bin next to an ofimeo-backup.json that describes the cipher.
// Restoring merges: documents already here receive the backup's Yjs updates
// (nothing is lost on either side), missing ones are added.

import JSZip from 'jszip'
import { t } from './i18n'
import { kvDelete, kvGet, kvSet } from './idb'
import { accessRank, resolveKeys } from './keys'
import { mergeState, readState, validateUpdate } from './y-storage'
import { dbAll, dbGet, dbPut, exportLibrary, mergeLibrary } from './library'
import * as store from './store'

export const BACKUP_EXT = '.ofimeo-backup'
const FORMAT = 'ofimeo-backup'
const VERSION = 2
const ITERATIONS = 310000
const SETTINGS_KEY = 'ofimeo:backup'
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
  privateState?: Uint8Array
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
    const keys = await resolveKeys(d.keys ?? {})
    if (keys.access === 'edit') dir.file('private.yjs', await readState(store.privateDbName(d.type, d.id)))
    for (const channel of ['yjs', 'cmt']) {
      const log = await kvGet<Uint8Array[]>(store.signedLogKey(d.id, channel))
      if (log?.length) dir.file(`signed-${channel}.json`, JSON.stringify(log.map(toBase64)))
    }
  }
  options.onProgress?.(done, docs.length)
  if (templates.length) zip.file('templates.json', JSON.stringify(templates.map((tpl) => ({ ...tpl, state: toBase64(tpl.state), ...(tpl.privateState ? { privateState: toBase64(tpl.privateState) } : {}) }))))
  const inner = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  if (!options.password) {
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
  documents?: number
  templates?: number
  encrypted?: { cipher: string; kdf: string; iterations: number; salt: string; iv: string }
}

export interface OpenedBackup {
  created?: number
  zip: JSZip
  index: BackupIndex
  version?: number
}

// True when the file needs a password.
export async function backupNeedsPassword(file: Blob): Promise<boolean> {
  return !!(await manifestOf(await loadZip(file))).encrypted
}

async function loadZip(file: Blob | Uint8Array): Promise<JSZip> {
  try {
    if ((file instanceof Uint8Array ? file.byteLength : file.size) > 128 * 1024 * 1024) throw new Error('Backup too large')
    const zip = await JSZip.loadAsync(file)
    checkArchiveSize(zip)
    return zip
  } catch {
    throw new BackupError('format', t('This file is not an Ofimeo backup.'))
  }
}

async function manifestOf(zip: JSZip): Promise<Manifest> {
  const raw = await zip.file('ofimeo-backup.json')?.async('string')
  let manifest: Manifest | null = null
  try { manifest = raw ? JSON.parse(raw) as Manifest : null } catch { /* Invalid manifest. */ }
  if (manifest?.format !== FORMAT) throw new BackupError('format', t('This file is not an Ofimeo backup.'))
  if ((manifest.version ?? 0) > VERSION) throw new BackupError('format', t('This backup was made with a newer version of Ofimeo.'))
  if (!Number.isInteger(manifest.version) || manifest.version! < 1) throw formatError()
  return manifest
}

export async function openBackup(file: Blob, password?: string): Promise<OpenedBackup> {
  let zip = await loadZip(file)
  let manifest = await manifestOf(zip)
  if (manifest.encrypted) {
    if (!password) throw new BackupError('password', t('This backup is protected with a password.'))
    const { iterations, salt, iv } = manifest.encrypted
    if (manifest.encrypted.cipher !== 'AES-GCM' || manifest.encrypted.kdf !== 'PBKDF2-SHA-256' || !Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000 || typeof salt !== 'string' || typeof iv !== 'string' || fromBase64(salt).length !== 16 || fromBase64(iv).length !== 12 || !zip.file('payload.bin')) throw formatError()
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
  let index: BackupIndex
  try { index = JSON.parse((await zip.file('index.json')?.async('string')) ?? '') as BackupIndex } catch { throw formatError() }
  if (!index || !Array.isArray(index.docs)) throw formatError()
  if (manifest.documents !== index.docs.length || !Number.isInteger(manifest.templates) || manifest.templates! < 0 || (manifest.templates! > 0 && !zip.file('templates.json'))) throw formatError()
  return { created: manifest.created, zip, index, version: manifest.version }
}

function checkArchiveSize(zip: JSZip): void {
  let total = 0
  // Check the central directory before inflating even the manifest or index.
  for (const file of Object.values(zip.files)) {
    const size = (file as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0
    if (size > 128 * 1024 * 1024 || (total += size) > 512 * 1024 * 1024) throw formatError()
  }
}

function formatError(): BackupError { return new BackupError('format', t('This file is not an Ofimeo backup.')) }

// Archive generation alone is not evidence of a delivered recovery artifact.
export function recordBackupSuccess(): void {
  saveSettings({ lastBackup: Date.now(), dismissedAt: undefined })
}

export interface RestoreReport {
  added: store.DocEntry[]
  updated: store.DocEntry[]
  unchanged: store.DocEntry[]
  failed: { entry: store.DocEntry; error: string }[]
  templates: number
  warnings: string[]
}

interface PreparedDocument {
  entry: store.DocEntry
  state: Uint8Array
  comments: Uint8Array
  privateState?: Uint8Array
  logs: Record<string, Uint8Array[]>
}

const validId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value)

function decodeTemplateState(value: unknown): Uint8Array {
  if (typeof value === 'string') return fromBase64(value)
  // Version 1 serialized private Uint8Arrays as objects with numeric keys.
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw formatError()
  const entries = Object.entries(value)
  if (!entries.length || entries.some(([key, byte], index) => key !== String(index) || !Number.isInteger(byte) || Number(byte) < 0 || Number(byte) > 255)) throw formatError()
  return new Uint8Array(entries.map(([, byte]) => Number(byte)))
}

async function checkIdentity(entry: store.DocEntry): Promise<void> {
  const existing = store.getDoc(entry.id)
  if (!existing) return
  const left = await resolveKeys(existing.keys ?? {})
  const right = await resolveKeys(entry.keys ?? {})
  if (existing.type !== entry.type || existing.key !== entry.key || left.signed !== right.signed || left.link.verify !== right.link.verify || left.link.cverify !== right.link.cverify) {
    throw new Error('The backup conflicts with the identity of an existing document')
  }
}

async function checkPendingRestore(prepared: PreparedDocument): Promise<void> {
  const pending = await kvGet<PreparedDocument>(`restore:${prepared.entry.id}`)
  if (!pending) return
  const entry = prepared.entry
  if (pending.entry.key !== entry.key || pending.entry.type !== entry.type || JSON.stringify(pending.entry.keys) !== JSON.stringify(entry.keys)) throw new Error('An unfinished restore has a different document identity')
  const encodedPrivate = (value?: Uint8Array) => value ? toBase64(value) : ''
  if (toBase64(pending.state) !== toBase64(prepared.state) || toBase64(pending.comments) !== toBase64(prepared.comments) || encodedPrivate(pending.privateState) !== encodedPrivate(prepared.privateState) || JSON.stringify(pending.logs) !== JSON.stringify(prepared.logs)) throw new Error('Retry the unfinished backup before restoring a different archive')
}

async function prepareRestore(backup: OpenedBackup): Promise<{ documents: PreparedDocument[]; templates: TemplateRecord[] }> {
  if (!backup.index || !Array.isArray(backup.index.docs)) throw formatError()
  checkArchiveSize(backup.zip)
  const ids = new Set<string>()
  const documents: PreparedDocument[] = []
  for (const original of backup.index.docs) {
    if (!original || !validId(original.id) || ids.has(original.id) || !store.DOC_TYPES.includes(original.type) || typeof original.key !== 'string' || !original.key || typeof original.title !== 'string' || !Number.isFinite(original.updated)) throw formatError()
    if (original.tags && (!Array.isArray(original.tags) || original.tags.some((id) => !validId(id)))) throw formatError()
    if (original.folder && !validId(original.folder)) throw formatError()
    if (original.keys && (typeof original.keys !== 'object' || Object.values(original.keys).some((key) => typeof key !== 'string'))) throw formatError()
    ids.add(original.id)
    const keys = await resolveKeys(original.keys ?? {})
    const entry = { ...original, keys: keys.link, access: keys.access }
    await checkIdentity(entry)
    const dir = `docs/${entry.id}/`
    const readUpdate = async (name: string, required: boolean) => {
      const file = backup.zip.file(dir + name)
      if (!file) { if (required) throw formatError(); return undefined }
      const update = await file.async('uint8array')
      validateUpdate(update)
      return update
    }
    const state = (await readUpdate('doc.yjs', true))!
    const comments = (await readUpdate('comments.yjs', true))!
    const privateState = await readUpdate('private.yjs', (backup.version ?? 1) >= 2 && keys.access === 'edit')
    if (privateState && keys.access !== 'edit') throw new Error('Private document data requires an editor key')
    const logs: Record<string, Uint8Array[]> = {}
    for (const channel of ['yjs', 'cmt']) {
      const raw = await backup.zip.file(`${dir}signed-${channel}.json`)?.async('string')
      if (!raw) continue
      const entries: unknown = JSON.parse(raw)
      if (!Array.isArray(entries) || entries.some((value) => typeof value !== 'string')) throw formatError()
      logs[channel] = entries.map(fromBase64)
    }
    const prepared = { entry, state, comments, privateState, logs }
    await checkPendingRestore(prepared)
    documents.push(prepared)
  }
  const library = backup.index.library
  if (library) {
    if (!Array.isArray(library.folders) || !Array.isArray(library.tags)) throw formatError()
    for (const items of [library.folders, library.tags]) {
      const seen = new Set<string>()
      for (const item of items) {
        if (!item || !validId(item.id) || seen.has(item.id) || typeof item.name !== 'string') throw formatError()
        seen.add(item.id)
      }
    }
    for (const folder of library.folders) {
      const seen = new Set([folder.id])
      let parent = folder.parent
      while (parent) {
        if (!validId(parent) || seen.has(parent)) throw formatError()
        seen.add(parent)
        parent = library.folders.find((item) => item.id === parent)?.parent
      }
    }
    if (library.tags.some((tag) => typeof tag.color !== 'string')) throw formatError()
  }
  const raw = await backup.zip.file('templates.json')?.async('string')
  const records: unknown = raw ? JSON.parse(raw) : []
  if (!Array.isArray(records)) throw formatError()
  const templates: TemplateRecord[] = []
  const templateIds = new Set<string>()
  for (const record of records) {
    if (!record || !validId(record.id) || templateIds.has(record.id) || !store.DOC_TYPES.includes(record.app) || typeof record.name !== 'string' || typeof record.description !== 'string' || typeof record.thumb !== 'string' || !Number.isFinite(record.created)) throw formatError()
    templateIds.add(record.id)
    const state = decodeTemplateState(record.state)
    const privateState = record.privateState === undefined ? undefined : decodeTemplateState(record.privateState)
    validateUpdate(state)
    if (privateState) validateUpdate(privateState)
    templates.push({ ...record, state, privateState })
  }
  return { documents, templates }
}

export async function restoreBackup(backup: OpenedBackup, onProgress?: (done: number, total: number) => void): Promise<RestoreReport> {
  const restore = () => restorePreparedBackup(backup, onProgress)
  return navigator.locks ? navigator.locks.request('ofimeo:backup-restore', restore) : restore()
}

async function restorePreparedBackup(backup: OpenedBackup, onProgress?: (done: number, total: number) => void): Promise<RestoreReport> {
  // Validate every payload and identity before any local mutation.
  const { documents, templates } = await prepareRestore(backup)
  const report: RestoreReport = { added: [], updated: [], unchanged: [], failed: [], templates: 0, warnings: [] }
  if ((backup.version ?? 1) === 1 && documents.some(({ entry }) => entry.type === 'forms')) report.warnings.push(t('This older backup does not include private form answers, responses or grades.'))
  mergeLibrary(backup.index.library ?? {})
  let done = 0
  for (const prepared of documents) {
    const { entry, state, comments, privateState, logs } = prepared
    onProgress?.(done++, documents.length)
    try {
      await checkIdentity(entry)
      // Keep a committed recovery record until all databases and the index succeed.
      // Yjs merges are idempotent: retrying the archive completes interrupted work.
      const journalKey = `restore:${entry.id}`
      await checkPendingRestore(prepared)
      await kvSet(journalKey, prepared)
      const existing = store.getDoc(entry.id)
      let changed = false
      changed = (await mergeState(store.dbName(entry.id), state)) || changed
      changed = (await mergeState(store.commentsDbName(entry.id), comments)) || changed
      if (privateState) changed = (await mergeState(store.privateDbName(entry.type, entry.id), privateState)) || changed
      for (const channel of ['yjs', 'cmt']) {
        if (!logs[channel]) continue
        const key = store.signedLogKey(entry.id, channel)
        const current = ((await kvGet<Uint8Array[]>(key)) ?? []).map(toBase64)
        const merged = [...new Set([...current, ...logs[channel].map(toBase64)])]
        if (merged.length !== current.length) await kvSet(key, merged.map(fromBase64))
      }
      if (!existing) {
        store.putDoc(entry)
        await kvDelete(journalKey)
        report.added.push(entry)
        continue
      }
      // Keep this browser's entry; take the backup's keys when they grant more.
      const next = { ...existing }
      if (accessRank(entry.access ?? 'edit') > accessRank((await resolveKeys(existing.keys ?? {})).access)) {
        next.keys = entry.keys
        next.access = entry.access
        changed = true
      }
      if (!next.folder && entry.folder) next.folder = entry.folder
      if (!next.tags?.length && entry.tags?.length) next.tags = entry.tags
      if (!next.remote && entry.remote) next.remote = entry.remote
      if (changed) next.updated = Math.max(existing.updated, entry.updated, Date.now())
      store.putDoc(next)
      await kvDelete(journalKey)
      ;(changed ? report.updated : report.unchanged).push(next)
    } catch (err) {
      report.failed.push({ entry, error: (err as Error).message })
    }
  }
  onProgress?.(done, documents.length)
  if (templates.length) {
    for (const tpl of templates) {
      if (await dbGet('templates', tpl.id)) continue
      await dbPut('templates', tpl)
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
    recordBackupSuccess()
    saveSettings({ auto: { ...auto, lastRun: Date.now(), lastError: undefined } })
    return target
  } catch (err) {
    saveSettings({ auto: { ...auto, lastError: (err as Error).message } })
    throw err
  }
}
