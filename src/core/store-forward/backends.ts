// Store-and-forward backends: where encrypted mailboxes live.
//
//   RelayBackend      Ofimeo Relay's blob store (relay/store.go, /ofimeo/store)
//   NextcloudBackend  files in a folder of the user's Nextcloud (WebDAV), one
//                     subfolder per mailbox, one file per blob
//
// Both only ever see encrypted blobs and opaque mailbox ids (crypto.ts).
// A cursor is backend-specific text: what has been read already.

import { fromBase64Url } from '../keys'
import * as nc from '../nextcloud'
import { signWrite, type Mailbox } from './crypto'

export interface Listing {
  // New blobs since the cursor, oldest first.
  blobs: Uint8Array[]
  cursor: string
  // Blobs and bytes in the whole mailbox (to decide when to compact).
  count: number
  bytes: number
}

export type StoreErrorKind = 'offline' | 'forbidden' | 'full' | 'unavailable' | 'server'

export class StoreError extends Error {
  constructor(
    readonly kind: StoreErrorKind,
    message?: string,
  ) {
    super(message ?? kind)
  }
}

export interface StoreBackend {
  // Stable id (keys the local sync state).
  readonly key: string
  // Shown to people: "Synced to <label>".
  readonly label: string
  list(box: Mailbox, cursor: string): Promise<Listing>
  // Appends a blob. `replaces` (a cursor from list) makes it a snapshot that
  // drops everything that cursor had read.
  put(box: Mailbox, blob: Uint8Array, replaces?: string): Promise<void>
}

// ---------- Ofimeo Relay ----------

export interface RelayStoreInfo {
  enabled: boolean
  default_on?: boolean
  max_blob_bytes?: number
  max_doc_bytes?: number
  max_blobs?: number
  ttl_days?: number
}

const base64ToBytes = (text: string) => fromBase64Url(text.replace(/=+$/, ''))

export class RelayBackend implements StoreBackend {
  readonly key: string

  constructor(
    readonly address: string,
    readonly label: string,
  ) {
    this.key = `relay:${address}`
  }

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    if (!navigator.onLine) throw new StoreError('offline')
    let res: Response
    try {
      res = await fetch(url, { ...init, cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(30_000) })
    } catch (err) {
      throw new StoreError('offline', (err as Error).message)
    }
    if (res.ok) return res
    const text = (await res.text().catch(() => '')).trim()
    if (res.status === 401 || res.status === 403) throw new StoreError('forbidden', text)
    if (res.status === 413 || res.status === 507) throw new StoreError('full', text)
    if (res.status === 404) throw new StoreError('unavailable', text)
    throw new StoreError('server', text || `HTTP ${res.status}`)
  }

  async list(box: Mailbox, cursor: string): Promise<Listing> {
    const after = Number(cursor) || 0
    const read = async (from: number) => {
      const res = await this.request(`${this.address}/ofimeo/store/${box.id}?after=${from}`)
      return (await res.json()) as { blobs: { seq: number; data: string }[]; last: number; count: number; bytes: number }
    }
    let data = await read(after)
    // The mailbox restarted (expired and written again): read it all.
    if (data.last < after) data = await read(0)
    return { blobs: data.blobs.map((b) => base64ToBytes(b.data)), cursor: String(data.last), count: data.count, bytes: data.bytes }
  }

  async put(box: Mailbox, blob: Uint8Array, replaces?: string): Promise<void> {
    const unix = Math.floor(Date.now() / 1000)
    const base = replaces === undefined ? '' : String(Number(replaces) || 0)
    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
      'X-Ofimeo-Key': box.pub,
      'X-Ofimeo-Time': String(unix),
      'X-Ofimeo-Signature': await signWrite(box, unix, base, blob),
    }
    if (base) headers['X-Ofimeo-Base'] = base
    await this.request(`${this.address}/ofimeo/store/${box.id}`, { method: 'POST', headers, body: blob as BodyInit })
  }
}

// Asks a relay whether it keeps mailboxes.
export async function relayStoreInfo(address: string): Promise<RelayStoreInfo | null> {
  try {
    const res = await fetch(`${address}/ofimeo/store`, { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    return (await res.json()) as RelayStoreInfo
  } catch {
    return null
  }
}

// ---------- Nextcloud ----------

export const DEFAULT_NEXTCLOUD_FOLDER = '/Ofimeo/Sync'

const ncError = (err: unknown): StoreError => {
  if (err instanceof StoreError) return err
  if (err instanceof nc.NcError) {
    const kind: StoreErrorKind =
      err.kind === 'offline' || err.kind === 'cors' || err.kind === 'unreachable'
        ? 'offline'
        : err.kind === 'auth' || err.kind === 'forbidden'
          ? 'forbidden'
          : err.kind === 'quota'
            ? 'full'
            : 'server'
    return new StoreError(kind, err.message)
  }
  return new StoreError('server', (err as Error).message)
}

// Blob files are named <time, base 36, fixed width>-<random>.bin, so names sort by age.
const BLOB_NAME = /^[0-9a-z]{10}-[0-9a-z]{8,}\.bin$/

export class NextcloudBackend implements StoreBackend {
  readonly key: string
  readonly label = 'Nextcloud'
  private readonly folder: string

  constructor(
    private readonly account: nc.NcAccount,
    folder = DEFAULT_NEXTCLOUD_FOLDER,
  ) {
    this.folder = `/${folder.replace(/^\/+|\/+$/g, '')}`
    this.key = `nextcloud:${account.id}:${this.folder}`
  }

  private dir(box: Mailbox): string {
    return nc.joinPath(this.folder, box.id)
  }

  async list(box: Mailbox, cursor: string): Promise<Listing> {
    let entries: nc.DavEntry[]
    try {
      entries = await nc.listFolder(this.account, this.dir(box))
    } catch (err) {
      if (err instanceof nc.NcError && err.kind === 'not-found') return { blobs: [], cursor: '[]', count: 0, bytes: 0 }
      throw ncError(err)
    }
    const files = entries.filter((e) => !e.isDir && BLOB_NAME.test(e.name)).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    let seen: Set<string>
    try {
      seen = new Set(JSON.parse(cursor || '[]') as string[])
    } catch {
      seen = new Set()
    }
    const blobs: Uint8Array[] = []
    const read: string[] = []
    for (const file of files) {
      if (!seen.has(file.name)) {
        try {
          const { blob } = await nc.download(this.account, file.path)
          blobs.push(new Uint8Array(await blob.arrayBuffer()))
        } catch (err) {
          // Deleted by a snapshot in the meantime: its content is in the snapshot.
          if (err instanceof nc.NcError && err.kind === 'not-found') continue
          throw ncError(err)
        }
      }
      read.push(file.name)
    }
    return { blobs, cursor: JSON.stringify(read), count: files.length, bytes: files.reduce((n, f) => n + f.size, 0) }
  }

  async put(box: Mailbox, blob: Uint8Array, replaces?: string): Promise<void> {
    const name = `${Date.now().toString(36).padStart(10, '0')}-${crypto.getRandomValues(new Uint32Array(2)).reduce((s, n) => s + n.toString(36).padStart(7, '0'), '')}.bin`
    const path = nc.joinPath(this.dir(box), name)
    const body = new Blob([blob as BlobPart], { type: 'application/octet-stream' })
    try {
      try {
        await nc.upload(this.account, path, body, { createOnly: true })
      } catch (err) {
        if (!(err instanceof nc.NcError && err.kind === 'not-found')) throw err
        await this.createFolders(this.dir(box))
        await nc.upload(this.account, path, body, { createOnly: true })
      }
      if (replaces !== undefined) {
        for (const old of JSON.parse(replaces || '[]') as string[]) {
          if (BLOB_NAME.test(old) && old !== name) await nc.removeFile(this.account, nc.joinPath(this.dir(box), old))
        }
      }
    } catch (err) {
      throw ncError(err)
    }
  }

  private async createFolders(path: string): Promise<void> {
    let current = ''
    for (const part of path.split('/').filter(Boolean)) {
      current += `/${part}`
      try {
        await nc.createFolder(this.account, current)
      } catch (err) {
        // 405: it exists already.
        if (!(err instanceof nc.NcError && err.kind === 'exists')) throw err
      }
    }
  }
}
