// Minimal IndexedDB key-value store for data that is not a Y.Doc (signed
// update logs of protected documents).

const DB_NAME = 'ofimeo-kv'
const STORE = 'kv'

let dbPromise: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = op(d.transaction(STORE, mode).objectStore(STORE))
        req.onsuccess = () => resolve(req.result as T)
        req.onerror = () => reject(req.error)
      }),
  )
}

export const kvGet = <T>(key: string) => run<T | undefined>('readonly', (s) => s.get(key)).catch(() => undefined)
export const kvSet = (key: string, value: unknown) => run<void>('readwrite', (s) => s.put(value, key)).catch(() => undefined)
export const kvDelete = (key: string) => run<void>('readwrite', (s) => s.delete(key)).catch(() => undefined)

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
