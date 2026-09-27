// What the writer needs from the session for review features: the comments
// channel, who wrote what (Yjs client id → author) and a stable id for the
// local user.

import * as Y from 'yjs'
import type { Access, AuthorInfo, Session } from '../../core/session'

export type { Access }
export type Author = AuthorInfo

// Comments live in the session's comments channel so commenters can write them.
export function commentsMapOf(session: Session): Y.Map<unknown> {
  return session.commentsDoc.getMap('comments')
}

// Comments of imported files wait in the document until an editor opens it
// (a new local document has no comments channel yet).
export const PENDING_COMMENTS = 'pendingComments'

const USER_ID_KEY = 'ofimeo:writer-user-id'

// A per-browser id to recognise one's own comments and suggestions.
export function userIdOf(session: Session): string {
  const id = (session.user as { id?: string }).id
  if (id) return id
  try {
    let local = localStorage.getItem(USER_ID_KEY)
    if (!local) {
      local = Math.random().toString(36).slice(2, 12)
      localStorage.setItem(USER_ID_KEY, local)
    }
    return local
  } catch {
    return `c${session.doc.clientID}`
  }
}

export interface AuthorDirectory {
  get(clientId: number): Author | null
  onChange(listener: () => void): void
}

export function authorDirectory(session: Session): AuthorDirectory {
  const read = (id: number): Author | null => {
    const known = session.authors.get(String(id))
    if (known?.name) return known
    const state = session.awareness.getStates().get(id)?.user as Author | undefined
    if (state?.name) return state
    if (id === session.doc.clientID) return { name: session.user.name, color: session.user.color }
    return null
  }
  return {
    get: read,
    onChange(listener) {
      session.authors.observe(listener)
      session.awareness.on('change', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
        // Cursor moves also change awareness; only new or renamed people matter.
        if (added.length || removed.length || updated.some((id) => !session.authors.has(String(id)))) listener()
      })
    },
  }
}
