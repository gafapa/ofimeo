// Runtime state of an open form: the private document (editors), the keys,
// the transport, and the editor-side handling of incoming responses
// (decrypt, store, acknowledge, grade release).

import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import type { Session } from '../../core/session'
import { t } from '../../core/i18n'
import { editorKeys, fingerprint, openResponse, sealResult, type EditorKeys, type SealedResponse } from './crypto'
import { buildResult, scoreResponse } from './grading'
import {
  answersMap,
  gradesMap,
  privateDbName,
  readItems,
  readSettings,
  receiptsMap,
  responsesMap,
  resultsMap,
  settingsMap,
  type AnswerKey,
  type FormResponse,
} from './model'
import { FormsTransport } from './transport'

export interface FormState {
  session: Session
  // Editors only.
  priv: Y.Doc | null
  keys: EditorKeys | null
  transport: FormsTransport
  // Short code of the owner's signing key (shown to respondents and editors).
  fingerprint: string
}

export const LOCAL = Symbol('forms-local')

export async function openFormState(session: Session): Promise<FormState> {
  const code = session.keys.link.verify ? await fingerprint(session.keys.link.verify) : ''
  if (!session.canEdit || !session.keys.link.edit) {
    const state: FormState = { session, priv: null, keys: null, transport: new FormsTransport(session), fingerprint: code }
    if (import.meta.env.DEV) Object.assign(window, { formState: state })
    return state
  }
  const keys = await editorKeys(session.keys.link.edit)
  const priv = new Y.Doc()
  const persistence = new IndexeddbPersistence(privateDbName(session.docId), priv)
  await persistence.whenSynced
  // Publish (signed) the key respondents encrypt to.
  const settings = settingsMap(session.doc)
  if (settings.get('responseKey') !== keys.responsePublic) session.doc.transact(() => settings.set('responseKey', keys.responsePublic), LOCAL)
  const transport = new FormsTransport(session, { key: keys.vault, doc: priv })
  const state: FormState = { session, priv, keys, transport, fingerprint: code }
  transport.onSubmit = (sealed) => void receiveSealed(state, sealed, 'p2p')
  if (import.meta.env.DEV) Object.assign(window, { formState: state })
  return state
}

export const keyLookup = (priv: Y.Doc | null) => (id: string) => (priv ? (answersMap(priv).get(id) as AnswerKey | undefined) : undefined)

// Decrypts and stores a response (editors); returns it, or null when it is not for this form.
export async function receiveSealed(state: FormState, sealed: SealedResponse, via: 'p2p' | 'file'): Promise<FormResponse | null> {
  const { priv, keys, session } = state
  if (!priv || !keys) return null
  let response: FormResponse
  try {
    response = await openResponse<FormResponse>(session.docId, keys.responsePrivate, sealed)
  } catch {
    return null
  }
  if (!response?.id || typeof response.answers !== 'object') return null
  const responses = responsesMap(priv)
  const known = responses.get(response.id)
  if (!known) {
    response = { ...response, form: session.docId, receivedAt: Date.now(), via }
    priv.transact(() => responses.set(response.id, response), LOCAL)
  }
  const receipts = receiptsMap(session.doc)
  if (!receipts.has(response.id)) session.doc.transact(() => receipts.set(response.id, Date.now()), LOCAL)
  const settings = readSettings(session.doc)
  if (!known && settings.quiz && settings.release === 'immediate') {
    const sheet = scoreResponse(readItems(session.doc), keyLookup(priv), response, gradesMap(priv).get(response.id))
    if (!sheet.pending) await releaseGrades(state, [response.id])
  }
  return known ?? response
}

// Publishes the grades of the given responses, each encrypted to its respondent.
export async function releaseGrades(state: FormState, ids: string[]): Promise<number> {
  const { priv, keys, session } = state
  if (!priv || !keys) return 0
  const items = readItems(session.doc)
  const settings = readSettings(session.doc)
  const grades = gradesMap(priv)
  const out: [string, string][] = []
  for (const id of ids) {
    const response = responsesMap(priv).get(id)
    if (!response?.epk) continue
    const result = buildResult(items, keyLookup(priv), response, grades.get(id), settings.showCorrect)
    out.push([id, await sealResult(session.docId, keys.responsePrivate, response.epk, result)])
  }
  const now = Date.now()
  session.doc.transact(() => out.forEach(([id, sealed]) => resultsMap(session.doc).set(id, sealed)), LOCAL)
  priv.transact(() => {
    for (const [id] of out) {
      const g = grades.get(id) ?? { points: {}, comments: {} }
      grades.set(id, { ...g, released: now })
    }
  }, LOCAL)
  return out.length
}

// Imports response files (.oresp) downloaded by respondents or collected in a Nextcloud drop.
export async function importResponseFiles(state: FormState, files: File[]): Promise<{ added: number; failed: number }> {
  let added = 0
  let failed = 0
  for (const file of files) {
    try {
      const data = JSON.parse(await file.text()) as { format?: string; sealed?: SealedResponse }
      if (data.format !== 'ofimeo-form-response' || !data.sealed) throw new Error(t('Not a response file'))
      const before = state.priv ? responsesMap(state.priv).size : 0
      const response = await receiveSealed(state, data.sealed, 'file')
      if (!response) throw new Error(t('This response belongs to another form'))
      if (state.priv && responsesMap(state.priv).size > before) added++
    } catch {
      failed++
    }
  }
  return { added, failed }
}
