// Tools every app offers: get_document_info.

import { appInfo } from '../../apps/registry'
import type { Session } from '../session'
import type { AppTools, OfimeoTool } from './types'

const CAN: Record<Session['access'], string[]> = {
  view: ['read'],
  comment: ['read', 'comment'],
  edit: ['read', 'comment', 'edit'],
}

export function commonTools(session: Session, apps: AppTools[]): OfimeoTool[] {
  return [
    {
      name: 'get_document_info',
      description:
        'Describes the document open in this tab: title, kind of document (app), what this browser may do with it (read, comment, edit) and a few app-specific facts. Call it first.',
      inputSchema: { type: 'object', properties: {} },
      access: 'view',
      execute: async () => {
        const info = appInfo(session.type)
        const extra: Record<string, unknown> = {}
        for (const app of apps) Object.assign(extra, await app.info?.())
        return {
          title: String(session.doc.getMap('meta').get('title') || '') || info.untitled,
          app: session.type,
          product: info.product,
          access: session.access,
          allowed: CAN[session.access],
          ...extra,
        }
      },
    },
  ]
}
