// Copies of documents: "Make a copy" (File menu), version copies and
// template links (…&copy=1) that give each person their own private copy.
// Copies are new local documents with new keys (full edit); they carry the
// content only (no version history, authors, comments or permission keys).

import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { Awareness } from 'y-protocols/awareness'
import { t } from './i18n'
import { mergeKeys, type LinkKeys } from './keys'
import { isRemoteOrigin, RoomProvider } from './network'
import { createLocalDocument, type Session } from './session'
import * as store from './store'
import { snapshotState, VERSIONS_KEY } from './versions'

// Shared data that belongs to one document only and is not copied: a form's
// receipts of received responses, its released grades and the key
// respondents encrypt to (the copy publishes its own when an editor opens it).
const NOT_COPIED: Partial<Record<store.DocType, { maps: string[]; keys: [map: string, key: string][] }>> = {
  forms: { maps: ['form-receipts', 'form-results'], keys: [['form-settings', 'responseKey']] },
}

// Removes what a copy of a `type` document must not carry (history, authors, NOT_COPIED).
export function cleanCopy(type: store.DocType, doc: Y.Doc): void {
  const versions = doc.getArray(VERSIONS_KEY)
  if (versions.length) versions.delete(0, versions.length)
  const authors = doc.getMap('authors')
  for (const key of [...authors.keys()]) authors.delete(key)
  const extra = NOT_COPIED[type]
  for (const name of extra?.maps ?? []) {
    const map = doc.getMap(name)
    for (const key of [...map.keys()]) map.delete(key)
  }
  for (const [name, key] of extra?.keys ?? []) doc.getMap(name).delete(key)
}

// Creates a local document from a state (Y.encodeStateAsUpdate) and returns its
// path. `privateState` is the app's editor-only state (session.hooks.privateState).
export async function createCopyFromState(type: store.DocType, title: string, state: Uint8Array, privateState?: Uint8Array | null): Promise<string> {
  const path = await createLocalDocument(type, title, (doc) => {
    Y.applyUpdate(doc, state)
    cleanCopy(type, doc)
  })
  const id = new URLSearchParams(path.split('#')[1]).get('doc')
  if (privateState && id) await writePrivateState(type, id, privateState)
  return path
}

async function writePrivateState(type: store.DocType, id: string, state: Uint8Array): Promise<void> {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, state)
  const persistence = new IndexeddbPersistence(store.privateDbName(type, id), doc)
  await persistence.whenSynced
  await persistence.destroy()
  // As in createLocalDocument: wait until the write is done before navigating.
  const check = new IndexeddbPersistence(store.privateDbName(type, id), new Y.Doc())
  await check.whenSynced
  await check.destroy()
  doc.destroy()
}

export const copyTitle = (title: string) => t('Copy of {title}', { title: title || t('Untitled') })

// "Make a copy": copies the open document and opens the copy.
export async function copyDocument(session: Session, navigate = true): Promise<string> {
  const title = String(session.doc.getMap('meta').get('title') ?? '')
  const path = await createCopyFromState(session.type, copyTitle(title), snapshotState(session.doc), session.canEdit ? session.hooks.privateState?.snapshot() : null)
  if (navigate) location.href = path
  return path
}

export interface CopyLinkRoute {
  type: store.DocType
  id: string
  key: string
  keys: LinkKeys
}

// How long to wait for more content after the first part arrives.
const QUIET_MS = 1500
// After this, explain why nothing arrives (and keep waiting).
const TIMEOUT_MS = 30000

// Opens a template link: waits for the content from a peer (or uses the local
// copy when this browser has the document), creates a private copy and
// returns its path. `onStatus` receives user-facing progress messages.
export async function copyFromLink(route: CopyLinkRoute, onStatus: (message: string, stalled: boolean) => void): Promise<string> {
  const known = store.getDoc(route.id)
  const { keys } = await mergeKeys(known ? (known.keys ?? {}) : null, route.keys)
  const doc = new Y.Doc()

  if (known) {
    const persistence = new IndexeddbPersistence(store.dbName(route.id), doc)
    await persistence.whenSynced
    await persistence.destroy()
  }
  if (!hasContent(doc)) {
    onStatus(t('Getting the document from the person who shared it…'), false)
    const relays = new URLSearchParams(location.search).get('relays')?.split(',').filter(Boolean)
    const room = new RoomProvider(doc, new Awareness(doc), {
      roomId: route.id,
      password: route.key,
      relays,
      security: keys.signed ? { verifier: keys.editVerifier!, context: `${route.id}:yjs` } : undefined,
    })
    try {
      await new Promise<void>((resolve) => {
        let quiet = 0
        const stalled = window.setTimeout(
          () =>
            onStatus(
              t('The document has not arrived yet. The browser of the person who shared it (or of someone who has it open) must be online with this document. Keep this page open: the copy is made as soon as it arrives.'),
              true,
            ),
          TIMEOUT_MS,
        )
        doc.on('update', (_u: Uint8Array, origin: unknown) => {
          if (!isRemoteOrigin(origin)) return
          clearTimeout(stalled)
          onStatus(t('Receiving the document…'), false)
          clearTimeout(quiet)
          quiet = window.setTimeout(resolve, QUIET_MS)
        })
      })
    } finally {
      void room.destroy()
    }
  }
  const title = String(doc.getMap('meta').get('title') ?? '')
  const path = await createCopyFromState(route.type, copyTitle(title), snapshotState(doc))
  doc.destroy()
  return path
}

function hasContent(doc: Y.Doc): boolean {
  return [...doc.share.values()].some((type) => type._map.size > 0 || type._start !== null)
}
