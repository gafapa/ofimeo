// Copies data saved under the project's former name ("words-online") to the
// current "ofimeo" names. Originals remain available for recovery:
//   localStorage 'words-online:*'  → 'ofimeo:*'           (on import, synchronously)
//   IndexedDB    'words-online:*'  → 'ofimeo:*'           (migrateLegacyDatabases)
//   IndexedDB    'words-online-*'  → 'ofimeo-*'
// Import this module before any other that reads localStorage.

const OLD = 'words-online'
const NEW = 'ofimeo'
const LOCAL_RECEIPT = `${NEW}:legacy-imported-keys`
const DATABASE_RECEIPT = `${NEW}:legacy-imported-databases`

const rename = (name: string) => NEW + name.slice(OLD.length)
const isLegacy = (name: string) => name.startsWith(`${OLD}:`) || name.startsWith(`${OLD}-`)

function importedNames(key: string): Set<string> {
  const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
  if (!Array.isArray(value) || value.some((name) => typeof name !== 'string')) throw new Error('Invalid legacy migration receipt')
  return new Set(value)
}

function migrateLocalStorage(): void {
  try {
    const imported = importedNames(LOCAL_RECEIPT)
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && isLegacy(key)) keys.push(key)
    }
    for (const key of keys) {
      if (imported.has(key)) continue
      // Record intent first. Retained legacy credentials must never reappear
      // after an explicit disconnect, even if storage fails during the copy.
      // An interrupted copy remains available in the original for recovery.
      imported.add(key)
      localStorage.setItem(LOCAL_RECEIPT, JSON.stringify([...imported]))
      const value = localStorage.getItem(key)
      if (value !== null && localStorage.getItem(rename(key)) === null) localStorage.setItem(rename(key), value)
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

interface StoreSnapshot {
  name: string
  keyPath: string | string[] | null
  autoIncrement: boolean
  indexes: { name: string; keyPath: string | string[]; unique: boolean; multiEntry: boolean }[]
  keys: IDBValidKey[]
  values: unknown[]
}

// Read every store in one transaction: update sequences and their metadata
// must describe the same snapshot, even while an old tab is still editing.
async function snapshotDatabase(source: IDBDatabase): Promise<StoreSnapshot[]> {
  const names = [...source.objectStoreNames]
  if (!names.length) return []
  const tx = source.transaction(names, 'readonly')
  const committed = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
  const stores = Promise.all(names.map(async (name) => {
    const store = tx.objectStore(name)
    const schema = {
      name, keyPath: store.keyPath, autoIncrement: store.autoIncrement,
      indexes: [...store.indexNames].map((name) => {
        const index = store.index(name)
        return { name, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry }
      }),
    }
    const [keys, values] = await Promise.all([request(store.getAllKeys()), request(store.getAll())])
    return { ...schema, keys, values }
  }))
  const [snapshot] = await Promise.all([stores, committed])
  return snapshot
}

// Create the schema AND records in the same versionchange transaction. A
// failure leaves no partially copied database that could shadow the original.
// Existing targets are never merged: Yjs sequence keys and signed-log keys
// are local to each database and collisions do not imply identical content.
function createCopy(name: string, version: number, stores: StoreSnapshot[]): Promise<boolean> {
  return new Promise((resolve, reject) => {
    let created = false
    let skipped = false
    const req = indexedDB.open(name, version)
    req.onblocked = () => {
      // Do not hold startup hostage to another tab. If this request later
      // resumes, its upgrade is cancelled and its connection is closed.
      skipped = true
      resolve(false)
    }
    req.onupgradeneeded = (event) => {
      if (skipped || event.oldVersion !== 0) {
        skipped = true
        req.transaction!.abort()
        return
      }
      created = true
      try {
        for (const store of stores) {
          const to = req.result.createObjectStore(store.name, { keyPath: store.keyPath, autoIncrement: store.autoIncrement })
          for (const index of store.indexes) to.createIndex(index.name, index.keyPath, { unique: index.unique, multiEntry: index.multiEntry })
          store.keys.forEach((key, i) => {
            if (to.keyPath === null) to.put(store.values[i], key)
            else to.put(store.values[i])
          })
        }
      } catch {
        req.transaction!.abort()
      }
    }
    req.onsuccess = () => { req.result.close(); resolve(created && !skipped) }
    req.onerror = () => {
      if (skipped || req.error?.name === 'VersionError') resolve(false)
      else reject(req.error)
    }
  })
}

async function copyDatabase(oldName: string): Promise<void> {
  const imported = importedNames(DATABASE_RECEIPT)
  if (imported.has(oldName)) return
  const source = await openExisting(oldName)
  if (!source) return
  try {
    // Check before reading a potentially large source. createCopy also checks
    // atomically, in case another tab creates the target after this check.
    const existing = await openExisting(rename(oldName))
    if (existing) existing.close()
    else if (!await createCopy(rename(oldName), source.version, await snapshotDatabase(source))) return
    // Do not resurrect a deliberately deleted current database on next startup.
    imported.add(oldName)
    localStorage.setItem(DATABASE_RECEIPT, JSON.stringify([...imported]))
  } finally {
    source.close()
  }
  // Never delete the source: an old tab can commit more data after our snapshot.
}

async function legacyDatabaseNames(): Promise<string[]> {
  if (indexedDB.databases) {
    const all = await indexedDB.databases()
    return all.map((d) => d.name ?? '').filter(isLegacy)
  }
  // Inspect both indexes: the current one may already exist and contain a
  // different document set. One corrupt index must not hide the other.
  const ids = new Set<string>()
  for (const prefix of [OLD, NEW]) {
    try {
      const docs: unknown = JSON.parse(localStorage.getItem(`${prefix}:docs`) ?? '[]')
      if (Array.isArray(docs)) for (const doc of docs) {
        if (doc && typeof doc.id === 'string' && /^[\w-]+$/.test(doc.id)) ids.add(doc.id)
      }
    } catch {}
  }
  const privates = ['writer', 'sheet', 'draw', 'diagram', 'slides', 'forms', 'pdf', 'notebook']
  return [
    `${OLD}-kv`,
    `${OLD}-library`,
    ...[...ids].flatMap((id) => [`${OLD}:${id}`, `${OLD}:${id}:comments`, ...privates.map((p) => `${OLD}:${id}:${p}-private`)]),
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
