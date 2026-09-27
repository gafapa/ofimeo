// "About Ofimeo" and "Document details…", shared by every app.

import { appInfo, SUITE } from '../apps/registry'
import { locale, t } from '../core/i18n'
import type { Session } from '../core/session'
import * as store from '../core/store'
import { listVersions } from '../core/versions'
import * as Y from 'yjs'
import { legalLinksNav } from '../legal/links'
import { accessLabel } from './chrome'
import { schoolLegalNote } from './school'
import { el, showDialog } from './widgets'

export async function aboutDialog(): Promise<void> {
  await showDialog(
    t('About {suite}', { suite: SUITE }),
    el(
      'div',
      { class: 'about' },
      el('p', { textContent: t('{suite} is a collaborative office suite that runs entirely in your browser: documents, spreadsheets, drawings, diagrams, presentations, forms and PDFs.', { suite: SUITE }) }),
      el('p', {
        class: 'hint',
        textContent: t('Documents are stored in this browser. Collaborators connect directly (WebRTC); public Nostr relays are only used to find each other.'),
      }),
      schoolLegalNote(),
      legalLinksNav({ newTab: true }),
    ),
    [{ label: t('Close'), value: 'ok', primary: true }],
  )
}

// Rows an app adds to "Document details…" (e.g. [t('Words'), '120']).
export type DetailRow = [label: string, value: string]

const formatBytes = (n: number) =>
  n < 1024 ? `${n.toLocaleString(locale)} B` : n < 1024 * 1024 ? `${(n / 1024).toLocaleString(locale, { maximumFractionDigits: 1 })} KB` : `${(n / 1024 / 1024).toLocaleString(locale, { maximumFractionDigits: 1 })} MB`

// Title, kind, last change, size, access, versions, collaborators and the Nextcloud file, then the app's rows.
export async function documentDetails(session: Session, appRows: DetailRow[] = []): Promise<void> {
  const info = appInfo(session.type)
  const entry = store.getDoc(session.docId)
  const title = String(session.doc.getMap('meta').get('title') || '') || info.untitled
  const rows: DetailRow[] = [
    [t('Title'), title],
    [t('Type'), `${info.name} (${info.product})`],
    [t('Last change'), entry ? new Date(entry.updated).toLocaleString(locale) : '—'],
    [t('Size in this browser'), formatBytes(Y.encodeStateAsUpdate(session.doc).byteLength)],
    [t('Your access'), accessLabel(session.access) || t('Can edit')],
    [t('Versions'), listVersions(session.doc).length.toLocaleString(locale)],
    [t('Authors'), session.authors.size.toLocaleString(locale)],
  ]
  if (entry?.remote) rows.push([t('Nextcloud file'), entry.remote.path])
  rows.push(...appRows)
  const table = el('table', { class: 'shortcuts details' })
  for (const [k, v] of rows) table.append(el('tr', {}, el('th', { scope: 'row', textContent: k }), el('td', { textContent: v })))
  await showDialog(t('Document details'), table, [{ label: t('Close'), value: 'ok', primary: true }])
}
