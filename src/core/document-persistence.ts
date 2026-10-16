// Commit-aware persistence compatible with the existing y-indexeddb schema.
import * as Y from 'yjs'
import { committedRequest } from './idb-transaction'
import { reportStorageError } from './storage-error'

export class DocumentPersistence {
  readonly whenSynced: Promise<void>
  private database?: IDBDatabase
  private pending: Uint8Array[] = []
  private running?: Promise<void>
  private ready = false
  private closed = false
  private records = 0

  constructor(readonly name: string, readonly doc: Y.Doc) {
    doc.on('update', this.onUpdate)
    doc.on('destroy', this.onDestroy)
    this.whenSynced = this.initialize()
    // Report background failures without turning them into unhandled rejections.
    void this.whenSynced.catch(reportStorageError)
  }

  private onUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === this || this.closed) return
    this.pending.push(update)
    if (this.ready) void this.drain().catch(() => { /* Reported by drain. */ })
  }

  private onDestroy = (): void => {
    void this.destroy().catch(() => { /* Retain the storage warning. */ })
  }

  private async initialize(): Promise<void> {
    this.database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.name)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('updates', { autoIncrement: true })
        request.result.createObjectStore('custom')
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('Close other tabs to open this document'))
    })
    this.database.onversionchange = () => this.database?.close()
    try {
      const updates = await committedRequest<Uint8Array[]>(this.database, 'updates', 'readonly', (store) => store.getAll())
      this.records = updates.length
      Y.transact(this.doc, () => updates.forEach((update) => Y.applyUpdate(this.doc, update)), this)
      // Include content prepared before persistence was attached, and edits during loading.
      this.pending = [Y.encodeStateAsUpdate(this.doc)]
      this.ready = true
      await this.drain()
    } catch (error) {
      this.database.close()
      throw error
    }
  }

  private drain(): Promise<void> {
    if (this.running) return this.running
    const operation = async () => {
      while (this.pending.length) {
        const count = this.pending.length
        const update = Y.mergeUpdates(this.pending.slice(0, count))
        if (this.records >= 500) {
          // Read and compact in one transaction, including writes from other tabs.
          await committedRequest(this.database!, 'updates', 'readwrite', (store) => {
            const request = store.getAll()
            request.addEventListener('success', () => {
              try {
                const merged = Y.mergeUpdates([...request.result, update])
                store.clear()
                store.add(merged)
              } catch { store.transaction.abort() }
            })
            return request
          })
          this.records = 1
        } else {
          await committedRequest(this.database!, 'updates', 'readwrite', (store) => store.add(update))
          this.records++
        }
        // Failed transactions leave every update queued for an explicit retry or next edit.
        this.pending.splice(0, count)
      }
    }
    this.running = operation().catch((error) => { throw reportStorageError(error) }).finally(() => { this.running = undefined })
    return this.running
  }

  async flush(): Promise<void> {
    await this.whenSynced
    if (this.closed) throw new Error('Document persistence is closed')
    await this.drain()
  }

  async destroy(): Promise<void> {
    if (this.closed) return
    // Leave the connection and pending updates available for retry after a failed flush.
    await this.flush()
    this.closed = true
    this.doc.off('update', this.onUpdate)
    this.doc.off('destroy', this.onDestroy)
    this.database?.close()
  }
}
