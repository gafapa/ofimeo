// Durable access to the y-indexeddb schema, without fire-and-forget update writes.
import * as Y from 'yjs'
import { committedRequest } from './idb-transaction'

function open(name: string, create: boolean): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name)
    let missing = false
    request.onupgradeneeded = () => {
      if (!create) { missing = true; request.transaction!.abort(); return }
      request.result.createObjectStore('updates', { autoIncrement: true })
      request.result.createObjectStore('custom')
    }
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => database.close()
      if (!database.objectStoreNames.contains('updates')) {
        database.close()
        reject(new Error('Invalid document database'))
      } else resolve(database)
    }
    request.onerror = () => missing ? resolve(null) : reject(request.error)
    request.onblocked = () => reject(new Error('Close other tabs before restoring this document'))
  })
}

export function validateUpdate(update: Uint8Array): void {
  const document = new Y.Doc()
  try { Y.applyUpdate(document, update) } finally { document.destroy() }
}

export async function readState(name: string): Promise<Uint8Array> {
  const database = await open(name, false)
  const document = new Y.Doc()
  try {
    if (database) {
      const updates = await committedRequest<Uint8Array[]>(database, 'updates', 'readonly', (store) => store.getAll())
      for (const update of updates) Y.applyUpdate(document, update)
    }
    return Y.encodeStateAsUpdate(document)
  } finally { database?.close(); document.destroy() }
}

export async function mergeState(name: string, update: Uint8Array): Promise<boolean> {
  const before = await readState(name)
  const document = new Y.Doc()
  let changed: boolean
  try {
    Y.applyUpdate(document, before)
    Y.applyUpdate(document, update)
    const after = Y.encodeStateAsUpdate(document)
    changed = before.length !== after.length || before.some((byte, index) => byte !== after[index])
  } finally { document.destroy() }
  if (!changed) return false
  const database = (await open(name, true))!
  try { await committedRequest(database, 'updates', 'readwrite', (store) => store.add(update)) }
  finally { database.close() }
  return true
}
