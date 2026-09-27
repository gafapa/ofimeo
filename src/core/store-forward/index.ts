// Store-and-forward sync: people who are never online at the same time (a
// student edits in class, then at home; the teacher corrects at night) still
// sync, through encrypted mailboxes on the school relay and/or in Nextcloud.
// Security model and formats: docs/store-forward.md; keys: crypto.ts;
// backends: backends.ts. Public Nostr relays are never used for storage.
//
// For each backend and channel (document, comments) this keeps, in IndexedDB,
// a cursor (what was read) and a "shadow" Y.Doc: what the mailbox is known to
// contain. Then:
//   pull  on open, when back online, when the tab becomes visible and every
//         minute: new blobs are decrypted and applied (signed envelopes are
//         verified by network.ts, as if a peer had sent them, and relayed to
//         the peers in the room)
//   push  (only browsers that can sign the channel: view links never push)
//         shortly after changes, what the shadow lacks, as one signed diff;
//         offline, changes simply wait in the document (a persistent queue)
//   compact  after many blobs (or when the store says the mailbox is full) a
//         writer pushes the full signed state that replaces what it has read
// Failures back off (5 s doubling to 5 min) per backend.

import * as Y from 'yjs'
import { t } from '../i18n'
import { kvGet, kvSet } from '../idb'
import * as nc from '../nextcloud'
import { schoolRelay } from '../connectivity'
import { schoolConfig } from '../school-config'
import { STORE_ORIGIN, type Channel } from '../network'
import { DEFAULT_NEXTCLOUD_FOLDER, NextcloudBackend, RelayBackend, relayStoreInfo, StoreError, type RelayStoreInfo, type StoreBackend } from './backends'
import { openBlob, openMailbox, sealBlob, type Mailbox, type MailboxKeys } from './crypto'

export { DEFAULT_NEXTCLOUD_FOLDER } from './backends'

const PUSH_DELAY_MS = 1500
const POLL_MS = 60_000
// Development aid: ?sfcompact=<n> compacts after n blobs.
const COMPACT_BLOBS = Number(new URLSearchParams(location.search).get('sfcompact')) || 40
const BACKOFF_MIN_MS = 5000
const BACKOFF_MAX_MS = 5 * 60_000

// ---------- Settings (this browser) ----------

const SETTINGS_KEY = 'words-online:store-forward'
export const SETTINGS_EVENT = 'ofimeo-store-settings'

export interface StoreSettings {
  // undefined: the school's default (school config, or the relay's default_on).
  relay?: boolean
  nextcloud?: boolean
  // Nextcloud folder for the mailboxes.
  folder?: string
}

export function storeSettings(): StoreSettings {
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') as StoreSettings
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

export function setStoreSettings(patch: StoreSettings): void {
  const next = { ...storeSettings(), ...patch }
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
  } catch {
    // Private mode: this page only.
  }
  window.dispatchEvent(new Event(SETTINGS_EVENT))
}

export interface RelayStoreChoice {
  // A school relay is configured and keeps mailboxes.
  available: boolean
  enabled: boolean
  // The school forbids it (school config).
  forbidden: boolean
  name?: string
  ttlDays?: number
}

const infoCache = new Map<string, Promise<RelayStoreInfo | null>>()

async function relayInfo(address: string): Promise<RelayStoreInfo | null> {
  const fromConfig = (schoolRelay()?.config as { store?: RelayStoreInfo } | undefined)?.store
  if (fromConfig) return fromConfig
  if (!infoCache.has(address)) infoCache.set(address, relayStoreInfo(address))
  return infoCache.get(address)!
}

export async function relayStoreChoice(): Promise<RelayStoreChoice> {
  const relay = schoolRelay()
  const school = schoolConfig().store?.relay
  const forbidden = school === false
  if (!relay) return { available: false, enabled: false, forbidden }
  const info = await relayInfo(relay.address)
  const available = !!info?.enabled
  const wanted = storeSettings().relay ?? (school === true || !!info?.default_on)
  return { available, enabled: available && !forbidden && wanted, forbidden, name: relay.config?.name || new URL(relay.address).host, ttlDays: info?.ttl_days }
}

export interface NextcloudStoreChoice {
  account?: nc.NcAccount
  enabled: boolean
  forbidden: boolean
  folder: string
}

export function nextcloudStoreChoice(): NextcloudStoreChoice {
  const school = schoolConfig().store?.nextcloud
  const settings = storeSettings()
  const account = nc.currentAccount()
  const forbidden = school?.enabled === false
  const folder = settings.folder || school?.folder || DEFAULT_NEXTCLOUD_FOLDER
  const wanted = settings.nextcloud ?? school?.enabled === true
  return { account, enabled: !!account && !forbidden && wanted, forbidden, folder }
}

// ---------- Engine ----------

export type SyncState = 'syncing' | 'synced' | 'pending' | 'offline' | 'error' | 'readonly'

export interface BackendStatus {
  key: string
  label: string
  state: SyncState
  // Some channel can be written from this browser.
  canWrite: boolean
  lastSync?: number
  error?: string
}

export interface StoreTarget {
  // Channel name (part of the mailbox keys): 'yjs' (document) or 'cmt' (comments).
  name: string
  channel: Channel
  keys: MailboxKeys
}

export interface StoreForwardOptions {
  docId: string
  docKey: string
  targets: StoreTarget[]
}

// One backend × one channel.
class Link {
  box!: Mailbox
  cursor = ''
  shadow = new Y.Doc()
  readonly ready: Promise<void>
  readonly stateKey: string

  constructor(
    readonly backend: StoreBackend,
    readonly target: StoreTarget,
    docId: string,
    docKey: string,
  ) {
    const stateKey = `sf:${backend.key}:${docId}:${target.name}`
    this.stateKey = stateKey
    this.ready = (async () => {
      this.box = await openMailbox(docId, docKey, target.name, target.keys)
      const saved = await kvGet<{ cursor: string; shadow: Uint8Array }>(stateKey)
      if (saved) {
        this.cursor = saved.cursor
        Y.applyUpdate(this.shadow, saved.shadow)
      }
      await target.channel.ready
    })()
  }

  get canWrite(): boolean {
    return this.target.channel.canWrite && !!this.box?.signer
  }

  get doc(): Y.Doc {
    return this.target.channel.doc
  }

  // The document has something the mailbox does not.
  get pending(): boolean {
    return this.canWrite && !Y.equalSnapshots(Y.snapshot(this.doc), Y.snapshot(this.shadow))
  }

  save(): void {
    void kvSet(this.stateKey, { cursor: this.cursor, shadow: Y.encodeStateAsUpdate(this.shadow) })
  }

  async pull(): Promise<{ count: number; cursor: string }> {
    const listing = await this.backend.list(this.box, this.cursor)
    for (const blob of listing.blobs) {
      let entries: Uint8Array[]
      try {
        entries = await openBlob(this.box, blob)
      } catch {
        console.warn('Ignoring a stored blob that cannot be decrypted')
        continue
      }
      for (const entry of entries) {
        const update = await this.accept(entry)
        if (update) Y.applyUpdate(this.shadow, update)
      }
    }
    if (listing.cursor !== this.cursor || listing.blobs.length) {
      this.cursor = listing.cursor
      this.save()
    }
    return { count: listing.count, cursor: listing.cursor }
  }

  private async accept(entry: Uint8Array): Promise<Uint8Array | null> {
    const { channel } = this.target
    if (channel.signed) return channel.receiveStored(entry)
    try {
      Y.applyUpdate(this.doc, entry, STORE_ORIGIN)
      return entry
    } catch {
      return null
    }
  }

  private async entry(update: Uint8Array, checkpoint: boolean): Promise<Uint8Array> {
    const { channel } = this.target
    return channel.signed ? channel.sealForStore(update, checkpoint) : update
  }

  async push(): Promise<void> {
    if (!this.pending) return
    const diff = Y.encodeStateAsUpdate(this.doc, Y.encodeStateVector(this.shadow))
    try {
      await this.backend.put(this.box, await sealBlob(this.box, [await this.entry(diff, false)]))
    } catch (err) {
      if (err instanceof StoreError && err.kind === 'full') return this.compact(this.cursor)
      throw err
    }
    Y.applyUpdate(this.shadow, diff)
    this.save()
  }

  // Replaces what `cursor` covers with the full state.
  async compact(cursor: string): Promise<void> {
    const full = Y.encodeStateAsUpdate(this.doc)
    await this.backend.put(this.box, await sealBlob(this.box, [await this.entry(full, true)]), cursor)
    this.shadow.destroy()
    this.shadow = new Y.Doc()
    Y.applyUpdate(this.shadow, full)
    this.save()
  }

  destroy(): void {
    this.shadow.destroy()
  }
}

interface BackendState {
  backend: StoreBackend
  links: Link[]
  syncing: boolean
  synced: boolean
  lastSync?: number
  error?: StoreError
  failures: number
  retryAt: number
}

export class StoreForward {
  private backends: BackendState[] = []
  private listeners: (() => void)[] = []
  private timer = 0
  private running = false
  private again = false
  private readonly poll: number
  private destroyed = false

  constructor(private readonly options: StoreForwardOptions) {
    for (const target of options.targets) target.channel.doc.on('update', this.onUpdate)
    window.addEventListener('online', this.onWake)
    document.addEventListener('visibilitychange', this.onVisibility)
    window.addEventListener(SETTINGS_EVENT, this.onSettings)
    this.poll = window.setInterval(() => document.visibilityState === 'visible' && this.kick(0), POLL_MS)
    void this.configure()
  }

  get statuses(): BackendStatus[] {
    return this.backends.map((b) => {
      const canWrite = b.links.some((l) => l.canWrite)
      const state: SyncState = b.error
        ? b.error.kind === 'offline'
          ? 'offline'
          : 'error'
        : b.syncing || !b.synced
          ? 'syncing'
          : b.links.some((l) => l.pending)
            ? 'pending'
            : canWrite
              ? 'synced'
              : 'readonly'
      return { key: b.backend.key, label: b.backend.label, state, canWrite, lastSync: b.lastSync, error: b.error?.message }
    })
  }

  onChange(listener: () => void): () => void {
    this.listeners.push(listener)
    return () => (this.listeners = this.listeners.filter((l) => l !== listener))
  }

  // Pull and push now (e.g. a "Sync now" button).
  syncNow(): void {
    for (const b of this.backends) b.retryAt = 0
    this.kick(0)
  }

  destroy(): void {
    this.destroyed = true
    for (const target of this.options.targets) target.channel.doc.off('update', this.onUpdate)
    window.removeEventListener('online', this.onWake)
    document.removeEventListener('visibilitychange', this.onVisibility)
    window.removeEventListener(SETTINGS_EVENT, this.onSettings)
    clearInterval(this.poll)
    clearTimeout(this.timer)
    this.backends.forEach((b) => b.links.forEach((l) => l.destroy()))
    this.backends = []
  }

  // (Re)builds the backends from the settings.
  private async configure(): Promise<void> {
    const wanted: StoreBackend[] = []
    const relay = schoolRelay()
    const choice = await relayStoreChoice()
    if (relay && choice.enabled) wanted.push(new RelayBackend(relay.address, choice.name ?? relay.address))
    const ncChoice = nextcloudStoreChoice()
    if (ncChoice.enabled && ncChoice.account) wanted.push(new NextcloudBackend(ncChoice.account, ncChoice.folder))
    if (this.destroyed) return
    const keep = this.backends.filter((b) => wanted.some((w) => w.key === b.backend.key))
    this.backends.filter((b) => !keep.includes(b)).forEach((b) => b.links.forEach((l) => l.destroy()))
    for (const backend of wanted) {
      if (keep.some((b) => b.backend.key === backend.key)) continue
      const { docId, docKey, targets } = this.options
      keep.push({ backend, links: targets.map((target) => new Link(backend, target, docId, docKey)), syncing: false, synced: false, failures: 0, retryAt: 0 })
    }
    this.backends = keep
    this.emit()
    this.kick(0)
  }

  private onUpdate = (_update: Uint8Array, origin: unknown): void => {
    if (origin === STORE_ORIGIN || !this.backends.some((b) => b.links.some((l) => l.canWrite))) return
    // Throttled: at most one push per delay while typing.
    if (!this.timer) this.kick(PUSH_DELAY_MS)
    this.emitSoon()
  }

  private onWake = (): void => {
    for (const b of this.backends) b.retryAt = 0
    // The relay may have been unreachable when the document opened.
    infoCache.clear()
    void this.configure()
  }

  private onVisibility = (): void => {
    // Visible: fetch what others did. Hidden: send what is pending (the tab may be closed next).
    if (document.visibilityState === 'visible' || this.backends.some((b) => b.links.some((l) => l.pending))) this.kick(0)
  }

  private onSettings = (): void => void this.configure()

  private kick(delay: number): void {
    clearTimeout(this.timer)
    this.timer = window.setTimeout(() => {
      this.timer = 0
      void this.run()
    }, delay)
  }

  private emitTimer = 0
  private emitSoon(): void {
    if (!this.emitTimer) this.emitTimer = window.setTimeout(() => ((this.emitTimer = 0), this.emit()), 300)
  }

  private emit(): void {
    this.listeners.forEach((l) => l())
  }

  private async run(): Promise<void> {
    if (this.running) return void (this.again = true)
    this.running = true
    try {
      do {
        this.again = false
        await Promise.all(this.backends.map((b) => this.syncBackend(b)))
      } while (this.again && !this.destroyed)
    } finally {
      this.running = false
    }
    // Retry the backends that failed once their backoff is over.
    const next = Math.min(...this.backends.filter((b) => b.error).map((b) => b.retryAt))
    if (Number.isFinite(next) && !this.timer) this.kick(Math.max(0, next - Date.now()))
  }

  private async syncBackend(b: BackendState): Promise<void> {
    if (Date.now() < b.retryAt) return
    b.syncing = true
    this.emit()
    try {
      for (const link of b.links) {
        await link.ready
        const { count, cursor } = await link.pull()
        if (!link.canWrite) continue
        if (count >= COMPACT_BLOBS) await link.compact(cursor)
        else await link.push()
      }
      b.error = undefined
      b.failures = 0
      b.synced = true
      b.lastSync = Date.now()
    } catch (err) {
      b.error = err instanceof StoreError ? err : new StoreError('server', (err as Error).message)
      b.failures++
      b.retryAt = Date.now() + Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** (b.failures - 1))
      console.warn(`Store-and-forward (${b.backend.label}):`, b.error.message)
    } finally {
      b.syncing = false
      this.emit()
    }
  }
}

export function startStoreForward(options: StoreForwardOptions): StoreForward | undefined {
  if (typeof crypto === 'undefined' || !crypto.subtle) return undefined
  return new StoreForward(options)
}

// Short status text for the app bar.
export function statusLabel(s: BackendStatus): string {
  switch (s.state) {
    case 'syncing':
      return t('Syncing with {name}…', { name: s.label })
    case 'synced':
      return t('Synced to {name}', { name: s.label })
    case 'pending':
      return t('Not yet synced to {name}', { name: s.label })
    case 'offline':
      return t('Waiting to sync to {name}', { name: s.label })
    case 'readonly':
      return t('Up to date from {name}', { name: s.label })
    default:
      return t('Could not sync to {name}', { name: s.label })
  }
}
