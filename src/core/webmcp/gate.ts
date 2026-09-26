// Permission gate: which tools this browser may offer, from the access its
// link grants (session.access):
//   view     read tools only
//   comment  read tools + comments
//   edit     read tools + comments + changes to the document
// The check is repeated on every call (defence in depth: the switch may have
// been turned off, or a tool list may be stale).

import { accessRank } from '../keys'
import type { Session } from '../session'
import type { OfimeoTool } from './types'

export function allowed(session: Pick<Session, 'access'>, tool: Pick<OfimeoTool, 'access'>): boolean {
  return accessRank(session.access) >= accessRank(tool.access)
}

export function allowedTools(session: Pick<Session, 'access'>, tools: OfimeoTool[]): OfimeoTool[] {
  return tools.filter((tool) => allowed(session, tool))
}

export function assertAllowed(session: Pick<Session, 'access'>, tool: OfimeoTool, enabled: () => boolean): void {
  if (!enabled()) throw new Error('AI assistant access (WebMCP) is turned off in this browser.')
  if (!allowed(session, tool)) throw new Error(`This link only allows "${session.access}" access; ${tool.name} needs "${tool.access}".`)
}
