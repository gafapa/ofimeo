// Attribution of the AI assistant's work.
//   - Comments and suggestions carry the author "AI assistant (<user name>)".
//   - Writer text gets authorship marks of a reserved pseudo client (AI_CLIENT),
//     named "AI assistant" in session.authors (Show authorship, Document details).
//   - Changes to the document are framed in the version history: a version
//     "Before changes by the AI assistant" is saved before the first change of
//     this page session, and one authored by the assistant after each burst of
//     changes (15 s without further changes, or when the page is closed).
//   - Every call is announced to the page (event 'webmcp-activity') for the indicator.

import { t } from '../i18n'
import type { Session } from '../session'
import { saveVersion } from '../versions'

export const AI_COLOR = '#7c3aed'
// Pseudo Yjs client id of the assistant's writer authorship marks.
export const AI_CLIENT = 0x41490001
export const AI_USER_ID = 'ai-assistant'

export const aiLabel = () => t('AI assistant')
// Name shown on the assistant's comments and suggestions: who used it is visible too.
export const aiName = (session: Pick<Session, 'user'>) => `${aiLabel()} (${session.user.name})`

export interface WebMcpActivity {
  tool: string
  write: boolean
  ok: boolean
}

export const ACTIVITY_EVENT = 'webmcp-activity'

export function announce(activity: WebMcpActivity): void {
  window.dispatchEvent(new CustomEvent<WebMcpActivity>(ACTIVITY_EVENT, { detail: activity }))
}

// Names the pseudo client of the assistant in the document's authors (editors only).
export function ensureAiAuthor(session: Session): void {
  if (!session.canEdit) return
  const id = String(AI_CLIENT)
  const current = session.authors.get(id)
  if (current?.name === aiLabel() && current.color === AI_COLOR) return
  session.doc.transact(() => session.authors.set(id, { name: aiLabel(), color: AI_COLOR }))
}

interface Tracker {
  before: boolean
  timer: number
  pending: boolean
}
const trackers = new WeakMap<Session, Tracker>()

function tracker(session: Session): Tracker {
  let tr = trackers.get(session)
  if (!tr) {
    const created: Tracker = { before: false, timer: 0, pending: false }
    trackers.set(session, created)
    window.addEventListener('pagehide', () => flush(session, created))
    tr = created
  }
  return tr
}

function flush(session: Session, tr: Tracker): void {
  clearTimeout(tr.timer)
  tr.timer = 0
  if (!tr.pending) return
  tr.pending = false
  saveVersion(session, t('Changes by the AI assistant'), false, aiName(session))
}

// Called before a tool changes the document.
export function beforeAiChange(session: Session): void {
  const tr = tracker(session)
  ensureAiAuthor(session)
  if (tr.before) return
  tr.before = true
  saveVersion(session, t('Before changes by the AI assistant'))
}

// Called after a tool changed the document.
export function afterAiChange(session: Session): void {
  const tr = tracker(session)
  tr.pending = true
  clearTimeout(tr.timer)
  tr.timer = window.setTimeout(() => flush(session, tr), 15_000)
}
