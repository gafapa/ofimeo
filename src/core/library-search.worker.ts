// Search index worker: reads each document's Yjs updates straight from its
// y-indexeddb database and extracts the plain text (library-extract.ts).
//   in:  { jobs: { id, type, pdf? }[] }
//   out: { id, text, pdf? } per document (text null when it could not be read), then { done: true }
// PDFs: the page text comes from pdf.js, loaded only when a PDF is indexed and
// run in this worker (its "fake worker" mode). The page text is returned with
// the key of the file (pdf) and passed back next time, so a PDF is parsed
// again only when its file changes, not when its annotations do.

import * as Y from 'yjs'
import { extractText, pdfFileKey } from './library-extract'
import type { DocType } from './store'

export interface PdfTextCache {
  key: string
  pages: string[]
}

interface Job {
  id: string
  type: DocType
  pdf?: PdfTextCache
}

async function loadDoc(name: string): Promise<Y.Doc> {
  const doc = new Y.Doc()
  const updates = await readUpdates(name)
  doc.transact(() => {
    for (const u of updates) Y.applyUpdate(doc, u)
  })
  return doc
}

let pdfjs: Promise<typeof import('pdfjs-dist')> | null = null

function loadPdfJs(): Promise<typeof import('pdfjs-dist')> {
  pdfjs ??= (async () => {
    const [lib, worker] = await Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      // @ts-expect-error pdf.js ships no types for its worker module
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs') as Promise<unknown>,
    ])
    // pdf.js runs its parser in this thread when it finds the worker module here.
    ;(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker
    return lib as typeof import('pdfjs-dist')
  })()
  return pdfjs
}

async function pdfPages(doc: Y.Doc): Promise<string[]> {
  const chunks = doc.getArray<Uint8Array>('pdf-file').toArray()
  if (!chunks.length) return []
  const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let offset = 0
  for (const c of chunks) {
    bytes.set(c, offset)
    offset += c.length
  }
  const lib = await loadPdfJs()
  const pdf = await lib.getDocument({ data: bytes, useSystemFonts: false }).promise
  try {
    const pages: string[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const content = await (await pdf.getPage(i)).getTextContent()
      let text = ''
      for (const item of content.items) if ('str' in item) text += item.str + (item.hasEOL ? '\n' : ' ')
      pages.push(text)
    }
    return pages
  } finally {
    void pdf.loadingTask.destroy()
  }
}

function readUpdates(name: string): Promise<Uint8Array[]> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name)
    // A database that does not exist yet is created empty: nothing to read.
    req.onupgradeneeded = () => req.transaction?.abort()
    req.onerror = () => reject(req.error)
    req.onsuccess = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('updates')) {
        db.close()
        return resolve([])
      }
      const get = db.transaction('updates', 'readonly').objectStore('updates').getAll()
      get.onsuccess = () => {
        db.close()
        resolve(get.result as Uint8Array[])
      }
      get.onerror = () => {
        db.close()
        reject(get.error)
      }
    }
  })
}

self.onmessage = async (event: MessageEvent<{ jobs: Job[] }>) => {
  for (const job of event.data.jobs) {
    let text: string | null = null
    let pdf: PdfTextCache | undefined
    try {
      const doc = await loadDoc(`ofimeo:${job.id}`)
      let comments: Y.Doc | undefined
      if (job.type === 'pdf') {
        comments = await loadDoc(`ofimeo:${job.id}:comments`).catch(() => undefined)
        const key = pdfFileKey(doc)
        pdf = job.pdf?.key === key ? job.pdf : { key, pages: await pdfPages(doc).catch(() => []) }
      }
      text = extractText(job.type, doc, { comments, pdfPages: pdf?.pages })
      doc.destroy()
      comments?.destroy()
    } catch {
      text = null
    }
    self.postMessage({ id: job.id, text, pdf })
  }
  self.postMessage({ done: true })
}
