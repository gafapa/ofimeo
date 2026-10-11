// Minimal IndexedDB key-value store for data that is not a Y.Doc (signed
// update logs of protected documents).

import { committedRequest } from './idb-transaction'

const DB_NAME = 'ofimeo-kv'
const STORE = 'kv'

let dbPromise: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => {
      req.result.onversionchange = () => { req.result.close(); dbPromise = null }
      resolve(req.result)
    }
    req.onerror = () => { dbPromise = null; reject(req.error) }
  })
  return dbPromise
}

function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return db().then((database) => committedRequest<T>(database, STORE, mode, op))
}

export const kvGet = <T>(key: string) => run<T | undefined>('readonly', (s) => s.get(key))
export const kvSet = (key: string, value: unknown) => run<void>('readwrite', (s) => s.put(value, key))
export const kvDelete = (key: string) => run<void>('readwrite', (s) => s.delete(key))

// Delete selected keys in one committed transaction (e.g. document sync state).
export async function kvDeleteMatching(matches: (key: string) => boolean): Promise<void> {
  const database = await db()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite')
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
    const request = transaction.objectStore(STORE).openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      if (typeof cursor.key === 'string' && matches(cursor.key)) cursor.delete()
      cursor.continue()
    }
  })
}
