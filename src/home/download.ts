// Home screen ▸ Download: documents in a standard format, built from their
// stored state without opening them (Word for documents, PowerPoint for
// presentations, draw.io for diagrams, Excalidraw for drawings, the annotated
// PDF for PDFs). Several documents go into one zip; a document that fails is
// left out and reported. Spreadsheets need the open app to export.

import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { appInfo } from '../apps/registry'
import { downloadBlob, safeFileName } from '../core/handin'
import { t } from '../core/i18n'
import type { Session } from '../core/session'
import * as store from '../core/store'
import { toast } from '../ui/widgets'

const PREFERRED: Partial<Record<store.DocType, string>> = { writer: 'docx', slides: 'pptx', diagram: 'drawio' }

export const canDownload = (d: store.DocEntry) => d.type !== 'sheet'

async function loadDoc(name: string): Promise<Y.Doc> {
  const doc = new Y.Doc()
  const persistence = new IndexeddbPersistence(name, doc)
  await persistence.whenSynced
  await persistence.destroy()
  return doc
}

async function buildFile(entry: store.DocEntry): Promise<{ name: string; blob: Blob }> {
  const doc = await loadDoc(store.dbName(entry.id))
  // PDF notes live in the comments document.
  const commentsDoc = entry.type === 'pdf' ? await loadDoc(store.commentsDbName(entry.id)) : undefined
  const title = safeFileName(entry.title || appInfo(entry.type).untitled)
  try {
    if (entry.type === 'draw') {
      const elements = [...doc.getMap<{ isDeleted?: boolean }>('draw-elements').values()].filter((e) => e && !e.isDeleted)
      const json = { type: 'excalidraw', version: 2, source: location.origin, elements, appState: { viewBackgroundColor: '#ffffff' }, files: doc.getMap('draw-files').toJSON() }
      return { name: `${title}.excalidraw`, blob: new Blob([JSON.stringify(json)], { type: 'application/json' }) }
    }
    const module = await appInfo(entry.type).load!()
    // The exporters read only the shared state.
    const session = { type: entry.type, doc, commentsDoc, docId: entry.id, hooks: {} } as unknown as Session
    const files = (await module.submitFiles?.(session)) ?? []
    const file = files.find((f) => f.name.endsWith(`.${PREFERRED[entry.type]}`)) ?? files[0]
    if (!file) throw new Error(t('This document cannot be downloaded from here'))
    const ext = file.name.slice(file.name.lastIndexOf('.'))
    return { name: `${title}${ext}`, blob: file.blob }
  } finally {
    doc.destroy()
    commentsDoc?.destroy()
  }
}

export async function downloadDocs(entries: store.DocEntry[]): Promise<void> {
  const skipped = entries.filter((d) => !canDownload(d))
  const docs = entries.filter(canDownload)
  if (skipped.length) toast(t('Spreadsheets are downloaded from the app: open them and use File ▸ Download as.'))
  if (!docs.length) return
  toast(t('Preparing the download…'))
  try {
    if (docs.length === 1) {
      const file = await buildFile(docs[0])
      return downloadBlob(file.blob, file.name)
    }
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    const used = new Set<string>()
    const failed: string[] = []
    for (const d of docs) {
      const file = await buildFile(d).catch(() => null)
      if (!file) {
        failed.push(d.title || appInfo(d.type).untitled)
        continue
      }
      let name = file.name
      for (let n = 2; used.has(name); n++) name = file.name.replace(/(\.[^.]+)$/, ` (${n})$1`)
      used.add(name)
      zip.file(name, file.blob)
    }
    if (failed.length) toast(t('Could not include: {names}', { names: failed.join(', ') }))
    if (used.size) downloadBlob(await zip.generateAsync({ type: 'blob' }), `${t('Ofimeo documents')}.zip`)
  } catch (err) {
    toast(t('Download failed: {message}', { message: (err as Error).message }))
  }
}
