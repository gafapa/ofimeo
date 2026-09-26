// Local full-text search over the documents of this browser. The plain text
// of each document is extracted in a worker (library-search.worker.ts) and
// kept in IndexedDB ('texts' in library.ts) with the time it was indexed; a
// document is indexed again only when its index entry is newer (it changed).
// Matching ignores case and accents ("educacion" finds "Educación").

import { dbAll, dbDelete, dbPut, fold, foldWithMap } from './library'
import type { DocEntry, DocType } from './store'
import type { PdfTextCache } from './library-search.worker'

interface TextEntry {
  id: string
  text: string
  indexed: number
  // PDFs: the page text of the stored file (parsed again only when the file changes).
  pdf?: PdfTextCache
}

let cache: Map<string, TextEntry> | null = null
let running: Promise<void> | null = null

async function texts(): Promise<Map<string, TextEntry>> {
  cache ??= new Map((await dbAll<TextEntry>('texts')).map((e) => [e.id, e]))
  return cache
}

export async function forgetText(id: string): Promise<void> {
  cache?.delete(id)
  await dbDelete('texts', id)
}

// Indexes the documents that changed since they were last indexed.
export function refreshIndex(docs: DocEntry[]): Promise<void> {
  const next = (running ?? Promise.resolve()).then(() => indexChanged(docs))
  running = next.catch(() => undefined)
  return next
}

async function indexChanged(docs: DocEntry[]): Promise<void> {
  const known = await texts()
  const jobs = docs.filter((d) => (known.get(d.id)?.indexed ?? 0) < d.updated).map((d) => ({ id: d.id, type: d.type, updated: d.updated }))
  if (!jobs.length) return
  const results = await extract(jobs.map(({ id, type }) => ({ id, type, pdf: known.get(id)?.pdf })))
  for (const job of jobs) {
    const result = results.get(job.id)
    const text = result?.text
    if (text === undefined || text === null) continue
    const entry: TextEntry = { id: job.id, text, indexed: Math.max(job.updated, Date.now()), pdf: result?.pdf }
    known.set(job.id, entry)
    await dbPut('texts', entry).catch(() => undefined)
  }
}

interface Extracted {
  text: string | null
  pdf?: PdfTextCache
}

function extract(jobs: { id: string; type: DocType; pdf?: PdfTextCache }[]): Promise<Map<string, Extracted>> {
  return new Promise((resolve) => {
    const out = new Map<string, Extracted>()
    let worker: Worker
    try {
      worker = new Worker(new URL('./library-search.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      return resolve(out)
    }
    worker.onmessage = (e: MessageEvent<{ id?: string; text?: string | null; pdf?: PdfTextCache; done?: boolean }>) => {
      if (e.data.done) {
        worker.terminate()
        resolve(out)
      } else if (e.data.id) out.set(e.data.id, { text: e.data.text ?? null, pdf: e.data.pdf })
    }
    worker.onerror = () => {
      worker.terminate()
      resolve(out)
    }
    worker.postMessage({ jobs })
  })
}

export interface Segment {
  text: string
  hit: boolean
}

export interface SearchHit {
  // Every word is in the title.
  inTitle: boolean
  // Content around the first match, with the matches marked (empty: title only).
  snippet: Segment[]
}

const words = (query: string) => fold(query).split(/\s+/).filter(Boolean)

// Matches a document: every word of the query must appear in its title or content.
export async function searchDocs(docs: DocEntry[], query: string, titleOf: (d: DocEntry) => string): Promise<Map<string, SearchHit>> {
  const terms = words(query)
  const known = await texts()
  const out = new Map<string, SearchHit>()
  if (!terms.length) return out
  for (const d of docs) {
    const title = fold(titleOf(d))
    const text = known.get(d.id)?.text ?? ''
    const folded = fold(text)
    if (!terms.every((w) => title.includes(w) || folded.includes(w))) continue
    const inTitle = terms.every((w) => title.includes(w))
    out.set(d.id, { inTitle, snippet: snippet(text, terms) })
  }
  return out
}

const CONTEXT = 50

// Text around the first match with every match of any term marked.
export function snippet(text: string, terms: string[]): Segment[] {
  const { folded, map } = foldWithMap(text)
  const first = Math.min(...terms.map((w) => folded.indexOf(w)).filter((i) => i >= 0))
  if (!Number.isFinite(first)) return []
  let start = Math.max(0, map[first] - CONTEXT)
  let end = Math.min(text.length, map[first] + CONTEXT * 2)
  if (start > 0) start = text.indexOf(' ', start) + 1 || start
  if (end < text.length) end = text.lastIndexOf(' ', end) > map[first] ? text.lastIndexOf(' ', end) : end
  // Matches inside the window, in original positions.
  const ranges: [number, number][] = []
  for (const w of terms) {
    for (let i = folded.indexOf(w); i >= 0; i = folded.indexOf(w, i + w.length)) {
      const a = map[i]
      const b = map[i + w.length]
      if (a >= start && b <= end) ranges.push([a, b])
    }
  }
  ranges.sort((x, y) => x[0] - y[0])
  const segments: Segment[] = []
  let pos = start
  for (const [a, b] of ranges) {
    if (a < pos) continue
    if (a > pos) segments.push({ text: text.slice(pos, a), hit: false })
    segments.push({ text: text.slice(a, b), hit: true })
    pos = b
  }
  if (pos < end) segments.push({ text: text.slice(pos, end), hit: false })
  const flat = (s: Segment) => ({ ...s, text: s.text.replace(/\s+/g, ' ') })
  const result = segments.map(flat)
  if (start > 0) result.unshift({ text: '… ', hit: false })
  if (end < text.length) result.push({ text: ' …', hit: false })
  return result
}
