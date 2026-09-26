// Entry points for opening and saving documents in external formats.
// Converters are loaded on demand to keep the initial bundle small.

import { generateJSON, type JSONContent } from '@tiptap/core'
import { allExtensions } from '../editor/extensions'
import { DEFAULT_PAGE, type DocumentData, type ImportedDocument } from './types'
import { t } from '../../../core/i18n'

export type ExportFormat = 'docx' | 'odt' | 'html' | 'txt'

export const OPEN_ACCEPT = '.docx,.odt,.doc,.html,.htm,.txt,.md'

export type Imported = ImportedDocument

export async function importFile(file: File): Promise<Imported> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'docx') return (await import('./docx-import')).importDocx(await file.arrayBuffer())
  if (ext === 'odt') return (await import('./odt-import')).importOdt(await file.arrayBuffer())
  if (ext === 'doc') {
    const buffer = await file.arrayBuffer()
    const head = new Uint8Array(buffer.slice(0, 8))
    // Some ".doc" files are really RTF, HTML or DOCX.
    if (head[0] === 0x50 && head[1] === 0x4b) return (await import('./docx-import')).importDocx(buffer)
    if (head[0] !== 0xd0) throw new Error(t('This .doc file is not a Word 97-2003 document; save it as .docx first'))
    return (await import('./doc-import')).importDoc(buffer)
  }
  const text = await file.text()
  const body: JSONContent =
    ext === 'html' || ext === 'htm'
      ? generateJSON(text, allExtensions())
      : {
          type: 'doc',
          content: text.split(/\r?\n/).map((line) => (line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' })),
        }
  // <html lang="…"> gives the document language.
  const lang = ext === 'html' || ext === 'htm' ? /<html\b[^>]*\blang=["']?([A-Za-z_-]+)/i.exec(text)?.[1] : undefined
  return { body, header: null, footer: null, page: DEFAULT_PAGE, lang }
}

export async function exportFile(format: ExportFormat, data: DocumentData, html: string, text: string): Promise<Blob> {
  switch (format) {
    case 'docx':
      return (await import('./docx-export')).exportDocx(data)
    case 'odt':
      return (await import('./odt-export')).exportOdt(data)
    case 'html': {
      const lang = data.lang ? ` lang="${escapeHtml(data.lang)}"` : ''
      const doc = `<!doctype html><html${lang}><head><meta charset="utf-8"><title>${escapeHtml(data.title)}</title></head><body>${html}</body></html>`
      return new Blob([doc], { type: 'text/html' })
    }
    case 'txt':
      return new Blob([text], { type: 'text/plain' })
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}
