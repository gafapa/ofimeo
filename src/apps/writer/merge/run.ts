// Mail merge output: the document once per record with its fields replaced.
//   - one combined Ofimeo document (a page break between records);
//   - one PDF, or a ZIP of PDFs: the combined document is laid out and exported
//     in a hidden frame (frame.ts), then split per record;
//   - a ZIP of Word files, one per record, named after a field.

import type { JSONContent } from '@tiptap/core'
import { getSchema } from '@tiptap/core'
import { prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap'
import { t } from '../../../core/i18n'
import { createLocalDocument } from '../../../core/session'
import type { WriterContext } from '../app'
import { allExtensions } from '../editor/extensions'
import { mergeText, type MergeRecord } from '../editor/merge'
import type { DocumentData } from '../formats/types'

// The body (or any content) for one record.
export function mergeContent(node: JSONContent, record: MergeRecord): JSONContent | null {
  if (node.type === 'mergeField' || node.type === 'mergeIf') {
    const text = mergeText({ type: node.type, attrs: node.attrs }, record)
    return text ? { type: 'text', text, ...(node.marks?.length ? { marks: node.marks } : {}) } : null
  }
  if (!node.content) return node
  const content: JSONContent[] = []
  for (const child of node.content) {
    const merged = mergeContent(child, record)
    if (!merged) continue
    // Adjacent text with the same marks becomes one text node.
    const last = content[content.length - 1]
    if (merged.type === 'text' && last?.type === 'text' && JSON.stringify(last.marks ?? []) === JSON.stringify(merged.marks ?? [])) {
      content[content.length - 1] = { ...last, text: (last.text ?? '') + (merged.text ?? '') }
    } else content.push(merged)
  }
  return { ...node, content }
}

// All records in one body; `starts` holds the index of each record's first top-level node.
export function combinedBody(body: JSONContent, records: MergeRecord[]): { body: JSONContent; starts: number[] } {
  const content: JSONContent[] = []
  const starts: number[] = []
  records.forEach((record, i) => {
    if (i > 0) content.push({ type: 'pageBreak' })
    starts.push(content.length)
    const merged = mergeContent(body, record)?.content ?? []
    content.push(...(merged.length ? merged : [{ type: 'paragraph' }]))
  })
  return { body: { ...body, content: content.length ? content : [{ type: 'paragraph' }] }, starts }
}

// Removes review marks (comments, tracked changes keep their current text).
function cleanBody(body: JSONContent): JSONContent {
  const walk = (n: JSONContent): JSONContent | null => {
    if (n.marks?.some((m) => m.type === 'deletion')) return null
    const marks = n.marks?.filter((m) => !['commentRange', 'insertion', 'authorship'].includes(m.type))
    const out: JSONContent = { ...n, ...(n.marks ? { marks } : {}) }
    if (out.marks && !out.marks.length) delete out.marks
    if (n.content) out.content = n.content.map(walk).filter((c): c is JSONContent => !!c)
    return out
  }
  return walk(body) ?? body
}

export function templateData(ctx: WriterContext): DocumentData {
  const data = ctx.documentData()
  return { ...data, body: cleanBody(data.body), comments: [] }
}

// A new Ofimeo document with this content; returns its path.
export async function createDocument(data: DocumentData, title: string): Promise<string> {
  const schema = getSchema(allExtensions())
  return createLocalDocument('writer', title, (ydoc) => {
    prosemirrorJSONToYXmlFragment(schema, data.body, ydoc.getXmlFragment('body'))
    if (data.header) prosemirrorJSONToYXmlFragment(schema, data.header, ydoc.getXmlFragment('header'))
    if (data.footer) prosemirrorJSONToYXmlFragment(schema, data.footer, ydoc.getXmlFragment('footer'))
    const meta = ydoc.getMap<unknown>('meta')
    meta.set('page', JSON.stringify(data.page))
    if (data.columns && data.columns.count > 1) meta.set('columns', JSON.stringify(data.columns))
    if (data.citeStyle) meta.set('cite', JSON.stringify(data.citeStyle))
    const lang = data.lang ? data.lang.split('-')[0] : ''
    if (lang) meta.set('lang', lang)
    if (data.sources?.length) {
      const map = ydoc.getMap<unknown>('sources')
      for (const s of data.sources) map.set(s.id, s)
    }
  })
}

export const mergedTitle = (title: string) => t('{title} (merged)', { title })

export async function mergeToDocument(ctx: WriterContext, records: MergeRecord[]): Promise<string> {
  const data = templateData(ctx)
  const { body } = combinedBody(data.body, records)
  return createDocument({ ...data, body }, mergedTitle(data.title))
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80)

// File names from a field (or numbered), unique.
export function fileNames(records: MergeRecord[], field: string, ext: string, fallback: string): string[] {
  const used = new Set<string>()
  return records.map((r, i) => {
    const base = safeName((field && r[field]) || '') || `${safeName(fallback) || 'document'} ${i + 1}`
    let name = `${base}.${ext}`
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n}).${ext}`
    used.add(name.toLowerCase())
    return name
  })
}

export async function mergeToDocxZip(ctx: WriterContext, records: MergeRecord[], field: string): Promise<Blob> {
  const data = templateData(ctx)
  const { exportDocx } = await import('../formats/docx-export')
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const names = fileNames(records, field, 'docx', data.title)
  for (const [i, record] of records.entries()) {
    const body = mergeContent(data.body, record) ?? data.body
    zip.file(names[i], await exportDocx({ ...data, body, title: names[i].replace(/\.docx$/, '') }))
  }
  return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' })
}

// PDF of all records (one file) or a ZIP of one PDF per record.
export async function mergeToPdf(ctx: WriterContext, records: MergeRecord[], zip: false): Promise<Blob>
export async function mergeToPdf(ctx: WriterContext, records: MergeRecord[], zip: true, field: string): Promise<Blob>
export async function mergeToPdf(ctx: WriterContext, records: MergeRecord[], zip: boolean, field = ''): Promise<Blob> {
  const data = templateData(ctx)
  const { body, starts } = combinedBody(data.body, records)
  const { exportInFrame } = await import('./frame')
  return exportInFrame({ ...data, body, title: mergedTitle(data.title) }, zip ? { starts, names: fileNames(records, field, 'pdf', data.title) } : null)
}

export function download(blob: Blob, name: string): void {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name.replace(/[\\/:*?"<>|]+/g, '_')
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
