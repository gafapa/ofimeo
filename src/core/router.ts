// Hash-based routing, so the suite works on any static host:
//   #app=<type>&doc=<id>&key=<secret>[&edit=…|&comment=…&verify=…|&verify=…&cverify=…][&copy=1]
//                                        open a document (see keys.ts for the permission keys)
//   #new=<type>                          a new document of that app (manifest shortcuts, main.ts)
//   (empty)                              home screen
// `copy=1` makes a private copy of the document instead of joining it.
// The fragment is never sent to any server, which keeps the keys private.

import { KEY_PARAMS, linkKeysFromParams, newLinkKeys, type LinkKeys } from './keys'
import { DOC_TYPES, getDoc, newDocId, newDocKey, type DocType } from './store'

export type Route =
  | { kind: 'home' }
  | { kind: 'doc'; type: DocType; id: string; key: string; keys: LinkKeys; copy: boolean }

export function parseRoute(hash = location.hash): Route {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const id = params.get('doc')
  if (!id) return { kind: 'home' }
  const known = getDoc(id)
  const app = params.get('app') as DocType | null
  const type = app && DOC_TYPES.includes(app) ? app : (known?.type ?? 'writer')
  // A link without a key (old or truncated) reuses the local key or starts a new room.
  const key = params.get('key') || known?.key || newDocKey()
  return { kind: 'doc', type, id, key, keys: linkKeysFromParams(params), copy: params.get('copy') === '1' }
}

// Path (with the current search string, e.g. ?relays=…) for a document.
// `keys` are the permission keys the link grants (see keys.keysForAccess).
export function docPath(type: DocType, id: string, key: string, keys: LinkKeys = {}, copy = false): string {
  let path = `${location.pathname}${location.search}#app=${type}&doc=${id}&key=${key}`
  for (const name of KEY_PARAMS) if (keys[name]) path += `&${name}=${keys[name]}`
  return copy ? `${path}&copy=1` : path
}

// A new protected document (full edit), or a legacy one where WebCrypto is unavailable.
export function newDocPath(type: DocType): string {
  const id = newDocId()
  rememberNew(id)
  return docPath(type, id, newDocKey(), newLinkKeys())
}

// Ids handed out by newDocPath, so an app can tell a document created here
// (which it may initialize, e.g. with localized names) from a shared one that
// has not arrived yet. Kept a day, in localStorage (File ▸ New opens a new tab).
const NEW_DOCS_KEY = 'ofimeo:new-docs'
const NEW_DOCS_MS = 24 * 3600 * 1000

function readNew(): Record<string, number> {
  try {
    const all = JSON.parse(localStorage.getItem(NEW_DOCS_KEY) || '{}') as Record<string, number>
    return Object.fromEntries(Object.entries(all).filter(([, time]) => Date.now() - time < NEW_DOCS_MS))
  } catch {
    return {}
  }
}

function rememberNew(id: string): void {
  try {
    localStorage.setItem(NEW_DOCS_KEY, JSON.stringify({ ...readNew(), [id]: Date.now() }))
  } catch {
    // Storage unavailable: new documents keep the default initial content.
  }
}

// True (once) when this browser created the document id with newDocPath.
export function takeNewDoc(id: string): boolean {
  const all = readNew()
  if (!all[id]) return false
  delete all[id]
  try {
    localStorage.setItem(NEW_DOCS_KEY, JSON.stringify(all))
  } catch {
    // Ignored: the entry expires anyway.
  }
  return true
}

export function homePath(): string {
  return `${location.pathname}${location.search}#`
}

export function absoluteUrl(path: string): string {
  return new URL(path, location.href).href
}
