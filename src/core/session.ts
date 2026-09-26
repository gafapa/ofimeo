// A document session: local persistence, presence, permissions and the
// peer-to-peer room.
//
// Contract for apps (see also README "Permissions"):
//   session.access        'edit' | 'comment' | 'view', from the keys the link holds
//   session.canEdit       access === 'edit': make the editor read-only otherwise
//                         (changes made anyway never leave this browser)
//   session.canComment    access is 'edit' or 'comment'
//   session.commentsDoc   separate Y.Doc for comments and annotations, synced in
//                         the same room; only edit/comment links can change it
//                         for others. Each app decides its structure inside
//                         (e.g. commentsDoc.getMap('threads')).
//   session.authors       Y.Map in the document: String(Yjs clientID) -> {name, color},
//                         written by editors when they first change the document
//                         in a session (authorship colors, version authors)
//   session.hooks         optional app hooks (hand in, restore, print, export formats); main.ts
//                         fills submitFiles / restoreVersion from the app's index.ts
//   session.shareUrl(a)   link granting access `a` (never more than this browser has)
//   session.copyUrl()     link that makes a private copy for whoever opens it

import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { Awareness, removeAwarenessStates } from 'y-protocols/awareness'
import { accessRank, keysForAccess, mergeKeys, newLinkKeys, type Access, type DocKeys, type LinkKeys } from './keys'
import { isRemoteOrigin, RoomProvider, type ChannelSecurity } from './network'
import { absoluteUrl, docPath } from './router'
import * as store from './store'
import { t } from './i18n'

export type { Access } from './keys'

export interface AuthorInfo {
  name: string
  color: string
}

export interface SubmitFile {
  name: string
  blob: Blob
}

// A file format the document can be saved in (e.g. to Nextcloud).
export interface ExportOption {
  ext: string // 'docx'
  label: string // 'Word (.docx)'
  suffix?: string // added to the file name before the extension: ' (flattened)'
  build: () => Promise<Blob>
}

export interface SessionHooks {
  // Formats for "Save to Nextcloud", the app's usual download formats (first: default).
  exportFormats?: () => ExportOption[]
  // Files in the app's original formats for "Hand in".
  submitFiles?: () => Promise<SubmitFile[]>
  // Replaces the document content with a version's state (default: generic restore).
  restoreVersion?: (state: Uint8Array) => void | Promise<void>
  // Printing for "Hand in" → "Print / Save as PDF" (default: the app's Ctrl+P, else window.print).
  print?: () => void
}

export interface Session {
  type: store.DocType
  doc: Y.Doc
  awareness: Awareness
  room: RoomProvider
  docId: string
  docKey: string
  user: store.User
  access: Access
  canEdit: boolean
  canComment: boolean
  // False for legacy documents (no permission keys: everyone edits).
  isProtected: boolean
  keys: DocKeys
  commentsDoc: Y.Doc
  authors: Y.Map<AuthorInfo>
  hooks: SessionHooks
  // Link for `access` (default: this browser's own access).
  shareUrl: (access?: Access) => string
  copyUrl: () => string
  // Present when the link carried keys that were ignored (they did not match this document).
  warning?: string
}

export async function openSession(type: store.DocType, docId: string, docKey: string, linkKeys: LinkKeys = {}): Promise<Session> {
  const known = store.getDoc(docId)
  const { keys, ignoredLink } = await mergeKeys(known ? (known.keys ?? {}) : null, linkKeys)
  const { access } = keys

  const doc = new Y.Doc()
  const persistence = new IndexeddbPersistence(store.dbName(docId), doc)
  const commentsDoc = new Y.Doc()
  const commentsPersistence = new IndexeddbPersistence(store.commentsDbName(docId), commentsDoc)
  const awareness = new Awareness(doc)
  const user = store.loadUser()
  awareness.setLocalStateField('user', { name: user.name, color: user.color })
  awareness.setLocalStateField('access', access)
  await Promise.all([persistence.whenSynced, commentsPersistence.whenSynced])

  const meta = doc.getMap<unknown>('meta')
  const saveEntry = () => store.saveDoc({ id: docId, key: docKey, type, title: String(meta.get('title') ?? ''), keys: keys.link, access })
  saveEntry()
  doc.on('update', saveEntry)

  // Optional custom relays for private deployments: ?relays=wss://a,wss://b
  const relays = new URLSearchParams(location.search).get('relays')?.split(',').filter(Boolean)
  const security = (verifier: CryptoKey | undefined, signer: CryptoKey | undefined, channel: string): ChannelSecurity | undefined =>
    keys.signed ? { verifier: verifier!, signer, context: `${docId}:${channel}`, logKey: store.signedLogKey(docId, channel) } : undefined
  const room = new RoomProvider(doc, awareness, { roomId: docId, password: docKey, relays, security: security(keys.editVerifier, keys.editSigner, 'yjs') })
  room.addChannel('cmt', commentsDoc, security(keys.commentVerifier, keys.commentSigner, 'cmt'))
  window.addEventListener('beforeunload', () => {
    removeAwarenessStates(awareness, [doc.clientID], 'unload')
    void room.destroy()
  })

  const authors = doc.getMap<AuthorInfo>('authors')
  const session: Session = {
    type,
    doc,
    awareness,
    room,
    docId,
    docKey,
    user,
    access,
    canEdit: access === 'edit',
    canComment: access !== 'view',
    isProtected: keys.signed,
    keys,
    commentsDoc,
    authors,
    hooks: {},
    shareUrl: (level = access) => absoluteUrl(docPath(type, docId, docKey, keysForAccess(keys.link, accessRank(level) > accessRank(access) ? access : level))),
    copyUrl: () => absoluteUrl(docPath(type, docId, docKey, keysForAccess(keys.link, 'view'), true)),
    warning: ignoredLink ? t('This link carries keys that do not match this document; it was opened with the access you already had.') : undefined,
  }
  if (session.canEdit) recordAuthor(session)
  return session
}

// Writes this client into `authors` once it changes the document.
function recordAuthor(session: Session): void {
  const { doc, authors, user } = session
  const onUpdate = (_update: Uint8Array, origin: unknown) => {
    if (isRemoteOrigin(origin) || origin instanceof IndexeddbPersistence || origin === AUTHOR_ORIGIN) return
    doc.off('update', onUpdate)
    queueMicrotask(() => updateAuthor(session, user))
  }
  doc.on('update', onUpdate)
  if (authors.has(String(doc.clientID))) doc.off('update', onUpdate)
}

const AUTHOR_ORIGIN = Symbol('author')

// Keeps this client's entry in `authors` up to date (called when the user renames).
export function updateAuthor(session: Session, user: store.User): void {
  if (!session.canEdit) return
  const id = String(session.doc.clientID)
  const current = session.authors.get(id)
  if (current?.name === user.name && current.color === user.color) return
  session.doc.transact(() => session.authors.set(id, { name: user.name, color: user.color }), AUTHOR_ORIGIN)
}

// Creates a new local document (new keys, full edit) from prepared Yjs content
// and returns its path.
export async function createLocalDocument(type: store.DocType, title: string, fill: (doc: Y.Doc) => void): Promise<string> {
  const id = store.newDocId()
  const key = store.newDocKey()
  const doc = new Y.Doc()
  fill(doc)
  doc.getMap<unknown>('meta').set('title', title)
  // y-indexeddb stores the full current state when it first syncs.
  const persistence = new IndexeddbPersistence(store.dbName(id), doc)
  await persistence.whenSynced
  await persistence.destroy()
  // That write may still be pending, and navigating right away can abort it; a
  // read on a new connection is ordered after it, so wait for one.
  const check = new IndexeddbPersistence(store.dbName(id), new Y.Doc())
  await check.whenSynced
  await check.destroy()
  const keys = newLinkKeys()
  store.saveDoc({ id, key, type, title, keys, access: 'edit' })
  return docPath(type, id, key, keys)
}
