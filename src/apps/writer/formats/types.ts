// Document model shared by the editor and the file converters.
// The body, header and footer are ProseMirror JSON documents that follow the
// schema in src/editor/extensions.ts.

import type { JSONContent } from '@tiptap/core'
import { normalizeTag } from '../../../core/spell/variants'
import type { CiteSettings, Source } from '../references/types'

export type PageSize = 'A4' | 'A5' | 'Letter' | 'Legal'

export interface PageSettings {
  size: PageSize
  orientation: 'portrait' | 'landscape'
  // Margins in millimetres.
  margins: { top: number; right: number; bottom: number; left: number }
}

export interface DocumentData {
  title: string
  // Comment ranges are `commentRange` marks (attrs.id) on the body's inline content.
  body: JSONContent
  header: JSONContent | null
  footer: JSONContent | null
  page: PageSettings
  comments?: CommentData[]
  // Document language as a BCP 47 tag ("es-ES"); paragraphs may have their own (attrs.lang).
  lang?: string
  // Columns of the first section (later sections: `sectionBreak` nodes in the body).
  columns?: Columns
  // Bibliographic sources cited with `citation` nodes, and the citation style.
  sources?: Source[]
  citeStyle?: CiteSettings
}

// A comment or, with parentId, a reply (replies have no range of their own).
export interface CommentData {
  id: string
  parentId?: string
  author: string
  // Milliseconds since the epoch; 0 when unknown.
  date: number
  text: string
  resolved?: boolean
}

// Portrait width × height in millimetres.
export const PAGE_SIZES_MM: Record<PageSize, [number, number]> = {
  A4: [210, 297],
  A5: [148, 210],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
}

export const DEFAULT_PAGE: PageSettings = {
  size: 'A4',
  orientation: 'portrait',
  margins: { top: 25, right: 25, bottom: 25, left: 25 },
}

export function pageDimensionsMm(page: PageSettings): { width: number; height: number } {
  const [w, h] = PAGE_SIZES_MM[page.size] ?? PAGE_SIZES_MM.A4
  return page.orientation === 'landscape' ? { width: h, height: w } : { width: w, height: h }
}

// Paragraph languages (attrs.lang: a regional variant such as "en-GB", or a
// bare code in older documents) and their tags in files.
export const LANG_TAGS: Record<string, string> = { es: 'es-ES', gl: 'gl-ES', en: 'en-US', fr: 'fr-FR', de: 'de-DE' }

export function langTag(code: unknown): string | undefined {
  return normalizeTag(code) ?? undefined
}

// Our variant tag from a file's tag ("gl-ES", "en_GB", "es-PE" → "es-CO", "fr"), when it is a language we check.
export function langCode(tag: string | null | undefined): string | null {
  return normalizeTag(tag)
}

export const DEFAULT_FONT = 'Calibri'
export const DEFAULT_FONT_SIZE_PT = 11
// Heading font sizes in points (level 1..6), plus named paragraph styles.
export const HEADING_SIZES_PT = [20, 16, 14, 12, 11, 11]
export const TITLE_SIZE_PT = 26
export const SUBTITLE_SIZE_PT = 15
export type ImportedDocument = Omit<DocumentData, 'title'> & {
  // What an importer could not bring over ("endnotes", "shapes", "pictures", …), shown to the user once.
  notImported?: string[]
}

// ---------- Sections and columns ----------

// Text columns of a section; the gap is in millimetres.
export interface Columns {
  count: number
  gap: number
  separator: boolean
}

export const DEFAULT_COLUMNS: Columns = { count: 1, gap: 12.5, separator: false }
export const MAX_COLUMNS = 3

// How a section starts: on a new page or right after the previous one.
export type SectionStart = 'nextPage' | 'continuous'

export interface Section {
  page: PageSettings
  columns: Columns
  start: SectionStart
}

// A `sectionBreak` node starts a new section; its attributes hold that section's settings.
export function sectionFromAttrs(a: Record<string, unknown> | undefined, fallback: PageSettings = DEFAULT_PAGE): Section {
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v !== '' && Number.isFinite(+v) ? +v : d)
  const size = (a?.size as PageSize) in PAGE_SIZES_MM ? (a!.size as PageSize) : fallback.size
  return {
    start: a?.start === 'continuous' ? 'continuous' : 'nextPage',
    page: {
      size,
      orientation: a?.orientation === 'landscape' ? 'landscape' : a?.orientation === 'portrait' ? 'portrait' : fallback.orientation,
      margins: {
        top: num(a?.marginTop, fallback.margins.top),
        right: num(a?.marginRight, fallback.margins.right),
        bottom: num(a?.marginBottom, fallback.margins.bottom),
        left: num(a?.marginLeft, fallback.margins.left),
      },
    },
    columns: normalizeColumns({ count: num(a?.columns, 1), gap: num(a?.columnGap, DEFAULT_COLUMNS.gap), separator: a?.columnSeparator === true || a?.columnSeparator === 'true' }),
  }
}

export function sectionAttrs(s: Section): Record<string, unknown> {
  const m = s.page.margins
  return {
    start: s.start,
    size: s.page.size,
    orientation: s.page.orientation,
    marginTop: m.top,
    marginRight: m.right,
    marginBottom: m.bottom,
    marginLeft: m.left,
    columns: s.columns.count,
    columnGap: s.columns.gap,
    columnSeparator: s.columns.separator,
  }
}

export function normalizeColumns(c: Partial<Columns> | null | undefined): Columns {
  const count = Math.max(1, Math.min(MAX_COLUMNS, Math.round(Number(c?.count) || 1)))
  const gap = Math.max(0, Math.min(100, Number(c?.gap ?? DEFAULT_COLUMNS.gap)))
  return { count, gap: Number.isFinite(gap) ? gap : DEFAULT_COLUMNS.gap, separator: !!c?.separator }
}

// Sections of a document: the first from the document settings, then one per top-level section break.
export function documentSections(body: JSONContent, page: PageSettings, columns?: Columns): Section[] {
  const out: Section[] = [{ page, columns: normalizeColumns(columns), start: 'nextPage' }]
  for (const node of body.content ?? []) if (node.type === 'sectionBreak') out.push(sectionFromAttrs(node.attrs, out[out.length - 1].page))
  return out
}

export function samePageSize(a: PageSettings, b: PageSettings): boolean {
  const x = pageDimensionsMm(a)
  const y = pageDimensionsMm(b)
  return Math.abs(x.width - y.width) < 0.5 && Math.abs(x.height - y.height) < 0.5
}
