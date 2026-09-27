// Moves data saved under the project's former name ("words-online") to the
// current "ofimeo" names, once per browser:
//   localStorage 'words-online:*'  → 'ofimeo:*'           (on import, synchronously)
//   IndexedDB    'words-online:*'  → 'ofimeo:*'           (migrateLegacyDatabases)
//   IndexedDB    'words-online-*'  → 'ofimeo-*'
// Import this module before any other that reads localStorage.

const OLD = 'words-online'
const NEW = 'ofimeo'

const rename = (name: string) => NEW + name.slice(OLD.length)
const isLegacy = (name: string) => name.startsWith(`${OLD}:`) || name.startsWith(`${OLD}-`)

function migrateLocalStorage(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && isLegacy(key)) keys.push(key)
    }
    for (const key of keys) {
      const value = localStorage.getItem(key)
      if (value !== null && localStorage.getItem(rename(key)) === null) localStorage.setItem(rename(key), value)
      localStorage.removeItem(key)
    }
  } catch {
    // Storage blocked or full: the app starts with the current names only.
  }
}

migrateLocalStorage()

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

// Opens an existing database; null when there is none with that name.
function openExisting(name: string): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    let created = false
    const req = indexedDB.open(name)
    req.onupgradeneeded = () => {
      created = true
      req.transaction!.abort()
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => (created ? resolve(null) : reject(req.error))
  })
}

// Creates `name` with the same version, stores and indexes as `source`.
function openCopy(source: IDBDatabase, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, source.version)
    req.onupgradeneeded = () => {
      const target = req.result
      const tx = source.transaction([...source.objectStoreNames], 'readonly')
      for (const storeName of source.objectStoreNames) {
        if (target.objectStoreNames.contains(storeName)) continue
        const from = tx.objectStore(storeName)
        const to = target.createObjectStore(storeName, { keyPath: from.keyPath, autoIncrement: from.autoIncrement })
        for (const indexName of from.indexNames) {
          const index = from.index(indexName)
          to.createIndex(indexName, index.keyPath, { unique: index.unique, multiEntry: index.multiEntry })
        }
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function copyDatabase(oldName: string): Promise<void> {
  const source = await openExisting(oldName)
  if (!source) return
  try {
    const stores = [...source.objectStoreNames]
    const target = await openCopy(source, rename(oldName))
    try {
      for (const storeName of stores) {
        const from = source.transaction(storeName, 'readonly').objectStore(storeName)
        const [keys, values] = await Promise.all([request(from.getAllKeys()), request(from.getAll())])
        const tx = target.transaction(storeName, 'readwrite')
        const to = tx.objectStore(storeName)
        // Records already in the new database (written by this version) win.
        const existing = new Set((await request(to.getAllKeys())).map((k) => JSON.stringify(k)))
        keys.forEach((key, i) => {
          if (existing.has(JSON.stringify(key))) return
          if (to.keyPath === null) to.put(values[i], key)
          else to.put(values[i])
        })
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
          tx.onabort = () => reject(tx.error)
        })
      }
    } finally {
      target.close()
    }
  } finally {
    source.close()
  }
  // Not awaited: an open tab of an older version blocks the deletion until it closes.
  indexedDB.deleteDatabase(oldName)
}

async function legacyDatabaseNames(): Promise<string[]> {
  if (indexedDB.databases) {
    const all = await indexedDB.databases()
    return all.map((d) => d.name ?? '').filter(isLegacy)
  }
  // No database listing: the names the app uses, from the (already migrated) document index.
  let ids: string[] = []
  try {
    ids = (JSON.parse(localStorage.getItem(`${NEW}:docs`) ?? '[]') as { id: string }[]).map((d) => d.id)
  } catch {}
  const privates = ['writer', 'sheet', 'draw', 'diagram', 'slides', 'forms', 'pdf', 'notebook']
  return [
    `${OLD}-kv`,
    `${OLD}-library`,
    ...ids.flatMap((id) => [`${OLD}:${id}`, `${OLD}:${id}:comments`, ...privates.map((p) => `${OLD}:${id}:${p}-private`)]),
  ]
}

async function migrate(): Promise<void> {
  for (const name of await legacyDatabaseNames()) {
    try {
      await copyDatabase(name)
    } catch (err) {
      console.warn(`Could not migrate ${name}`, err)
    }
  }
}

// Copies the databases of the former name; one tab at a time.
export async function migrateLegacyDatabases(): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  try {
    if (navigator.locks) await navigator.locks.request(`${NEW}:legacy-migration`, migrate)
    else await migrate()
  } catch (err) {
    console.warn('Legacy storage migration failed', err)
  }
}
