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
  return docPath(type, newDocId(), newDocKey(), newLinkKeys())
}

export function homePath(): string {
  return `${location.pathname}${location.search}#`
}

export function absoluteUrl(path: string): string {
  return new URL(path, location.href).href
}
