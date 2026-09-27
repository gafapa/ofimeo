// Notebook data in the shared Y.Doc:
//
//   meta                     title (like every app)
//   nb-sections  Y.Map       id -> SectionRecord {name, color, order}
//   nb-pages     Y.Map       id -> PageRecord {section, title, order, level, created}
//   nb-page:<id> XmlFragment the page text (TipTap/ProseMirror, writer schema + notebook nodes)
//   nb-ink:<id>  Y.Array     the page's ink strokes (Stroke, immutable; erasing deletes them)
//
// Records are plain objects replaced as a whole. Order is a number per record
// (fractional ordering: moving writes one record, concurrent moves converge).
// Deleting a page removes its record only; its text and ink stay in the
// document so Undo and the version history can bring the page back.
// Comments of a page live in the comments document, map `comments:<id>`.

import * as Y from 'yjs'
import { t } from '../../core/i18n'

export interface SectionRecord {
  name: string
  color: string
  order: number
}

export interface PageRecord {
  section: string
  title: string
  order: number
  // 0 = page, 1 = subpage, 2 = sub-subpage (indent in the page list).
  level: number
  created: number
}

export interface Section extends SectionRecord {
  id: string
}

export interface Page extends PageRecord {
  id: string
}

export type InkTool = 'pen' | 'highlighter'

export interface Stroke {
  id: string
  tool: InkTool
  color: string
  // Base width in CSS pixels (the pen varies it with the pressure).
  width: number
  // Flat list of x, y, pressure (0–1) in page pixels.
  points: number[]
}

// Origin of local changes to the notebook structure and ink (its undo manager tracks it).
export const NB_ORIGIN = Symbol('notebook')

export const SECTION_COLORS = ['#1e88e5', '#e53935', '#43a047', '#fb8c00', '#8e24aa', '#00897b', '#f4511e', '#6d4c41', '#3949ab', '#c0ca33']

// Logical width of a page in CSS pixels: ink keeps its place next to the text
// because the text always wraps at this width (narrow screens zoom out).
export const PAGE_WIDTH = 816

export const sectionsMap = (doc: Y.Doc) => doc.getMap<SectionRecord>('nb-sections')
export const pagesMap = (doc: Y.Doc) => doc.getMap<PageRecord>('nb-pages')
export const pageField = (id: string) => `nb-page:${id}`
export const pageFragment = (doc: Y.Doc, id: string) => doc.getXmlFragment(pageField(id))
export const inkArray = (doc: Y.Doc, id: string) => doc.getArray<Stroke>(`nb-ink:${id}`)
export const commentsField = (id: string) => `comments:${id}`

export const newId = () => crypto.getRandomValues(new Uint32Array(2)).reduce((s, n) => s + n.toString(36), '').slice(0, 12)

export function readSections(doc: Y.Doc): Section[] {
  return [...sectionsMap(doc).entries()]
    .filter(([, s]) => s && typeof s === 'object')
    .map(([id, s]) => ({ ...s, id }))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}

export function readPages(doc: Y.Doc, section?: string): Page[] {
  return [...pagesMap(doc).entries()]
    .filter(([, p]) => p && typeof p === 'object' && (section === undefined || p.section === section))
    .map(([id, p]) => ({ ...p, id }))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}

// Every page in notebook order (sections in order, then pages).
export function allPages(doc: Y.Doc): Page[] {
  const order = new Map(readSections(doc).map((s, i) => [s.id, i]))
  return readPages(doc)
    .filter((p) => order.has(p.section))
    .sort((a, b) => order.get(a.section)! - order.get(b.section)! || a.order - b.order || a.id.localeCompare(b.id))
}

export const pageTitle = (p: Pick<PageRecord, 'title'>) => p.title.trim() || t('Untitled page')

// An order value between two neighbours (either may be missing).
export function between(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return 1
  if (before === undefined) return after! - 1
  if (after === undefined) return before + 1
  return (before + after) / 2
}

export function addSection(doc: Y.Doc, name: string, color?: string, after?: string): string {
  const sections = readSections(doc)
  const index = after ? sections.findIndex((s) => s.id === after) : sections.length - 1
  const id = newId()
  const used = new Set(sections.map((s) => s.color))
  const pick = color ?? SECTION_COLORS.find((c) => !used.has(c)) ?? SECTION_COLORS[sections.length % SECTION_COLORS.length]
  sectionsMap(doc).set(id, { name, color: pick, order: between(sections[index]?.order, sections[index + 1]?.order) })
  return id
}

// Adds a page to a section, after `after` (default: at the end), as a subpage when level > 0.
export function addPage(doc: Y.Doc, section: string, title = '', options: { after?: string; level?: number; content?: (fragment: Y.XmlFragment) => void } = {}): string {
  const pages = readPages(doc, section)
  const index = options.after ? pages.findIndex((p) => p.id === options.after) : pages.length - 1
  // A new page after one with subpages goes after the subpages.
  let end = index
  if (options.after && index >= 0 && !options.level) while (pages[end + 1] && pages[end + 1].level > pages[index].level) end++
  const id = newId()
  pagesMap(doc).set(id, { section, title, order: between(pages[end]?.order, pages[end + 1]?.order), level: Math.max(0, Math.min(2, options.level ?? 0)), created: Date.now() })
  options.content?.(pageFragment(doc, id))
  return id
}

export function updatePage(doc: Y.Doc, id: string, patch: Partial<PageRecord>): void {
  const current = pagesMap(doc).get(id)
  if (current) pagesMap(doc).set(id, { ...current, ...patch })
}

export function updateSection(doc: Y.Doc, id: string, patch: Partial<SectionRecord>): void {
  const current = sectionsMap(doc).get(id)
  if (current) sectionsMap(doc).set(id, { ...current, ...patch })
}

// Moves a page before or after another one (in that page's section), or to the end of a section.
export function movePage(doc: Y.Doc, id: string, target: { page: string; place: 'before' | 'after' } | { section: string }): void {
  const page = pagesMap(doc).get(id)
  if (!page) return
  if ('section' in target) {
    const pages = readPages(doc, target.section).filter((p) => p.id !== id)
    updatePage(doc, id, { section: target.section, order: between(pages.at(-1)?.order, undefined), level: pages.length ? page.level : 0 })
    return
  }
  const other = pagesMap(doc).get(target.page)
  if (!other || target.page === id) return
  const pages = readPages(doc, other.section).filter((p) => p.id !== id)
  const i = pages.findIndex((p) => p.id === target.page)
  const [a, b] = target.place === 'before' ? [pages[i - 1], pages[i]] : [pages[i], pages[i + 1]]
  updatePage(doc, id, { section: other.section, order: between(a?.order, b?.order), level: a ? Math.min(page.level, a.level + 1) : 0 })
}

export function moveSection(doc: Y.Doc, id: string, target: string, place: 'before' | 'after'): void {
  if (id === target) return
  const sections = readSections(doc).filter((s) => s.id !== id)
  const i = sections.findIndex((s) => s.id === target)
  if (i < 0) return
  const [a, b] = place === 'before' ? [sections[i - 1], sections[i]] : [sections[i], sections[i + 1]]
  updateSection(doc, id, { order: between(a?.order, b?.order) })
}

export function deletePage(doc: Y.Doc, id: string): void {
  pagesMap(doc).delete(id)
}

export function deleteSection(doc: Y.Doc, id: string): void {
  for (const p of readPages(doc, id)) pagesMap(doc).delete(p.id)
  sectionsMap(doc).delete(id)
}

// Subpage level: the first page of a section stays a page; a page is at most one level below the one before.
export function setLevel(doc: Y.Doc, id: string, level: number): void {
  const page = pagesMap(doc).get(id)
  if (!page) return
  const pages = readPages(doc, page.section)
  const i = pages.findIndex((p) => p.id === id)
  const max = i > 0 ? Math.min(2, pages[i - 1].level + 1) : 0
  updatePage(doc, id, { level: Math.max(0, Math.min(max, level)) })
}

// ---------- Tags ----------

export type TagId = 'todo' | 'done' | 'important' | 'question' | 'remember'

export const TAG_IDS: TagId[] = ['todo', 'important', 'question', 'remember']

export function tagLabel(tag: TagId): string {
  return { todo: t('To do'), done: t('Done'), important: t('Important'), question: t('Question'), remember: t('Remember') }[tag]
}

// Text marks of tags in exported files (and recognised again when importing Markdown).
export const TAG_PREFIX: Record<TagId, string> = { todo: '☐', done: '☑', important: '⭐', question: '❓', remember: '📌' }

export interface TaggedItem {
  page: string
  // Index of the tagged block among the page's tagged blocks of the same text (to find it again).
  tag: TagId
  text: string
  // Position of the block in the page (depth-first index of tagged blocks).
  index: number
}

// Tagged paragraphs and headings of every page, read from the shared types.
export function collectTags(doc: Y.Doc): TaggedItem[] {
  const out: TaggedItem[] = []
  for (const page of allPages(doc)) {
    let index = 0
    const walk = (node: Y.XmlFragment | Y.XmlElement) => {
      for (const child of node.toArray()) {
        if (!(child instanceof Y.XmlElement)) continue
        const tag = child.getAttribute('nbTag') as TagId | undefined
        if (tag && (TAG_IDS as string[]).concat('done').includes(tag)) out.push({ page: page.id, tag, text: xmlText(child).trim(), index: index++ })
        else walk(child)
      }
    }
    walk(pageFragment(doc, page.id))
  }
  return out
}

// ---------- Text ----------

const BLOCKS = new Set(['paragraph', 'heading', 'listItem', 'taskItem', 'tableCell', 'tableHeader', 'tableRow', 'blockquote', 'codeBlock', 'hardBreak', 'horizontalRule'])

export function xmlText(node: Y.XmlFragment | Y.XmlElement): string {
  let out = ''
  for (const child of node.toArray()) {
    if (child instanceof Y.XmlText) {
      for (const op of child.toDelta() as { insert?: unknown }[]) if (typeof op.insert === 'string') out += op.insert
    } else if (child instanceof Y.XmlElement) {
      const inner = xmlText(child)
      out += BLOCKS.has(child.nodeName) ? `${inner}\n` : inner
      const latex = child.getAttribute('latex')
      if (typeof latex === 'string') out += ` ${latex} `
      const name = child.getAttribute('name')
      if (child.nodeName === 'nbFile' && typeof name === 'string') out += ` ${name} `
    }
  }
  return out
}

export function pageText(doc: Y.Doc, id: string): string {
  return xmlText(pageFragment(doc, id))
}

// Plain text of the whole notebook (content search on the home screen).
export function notebookText(doc: Y.Doc): string {
  const parts: string[] = []
  for (const s of readSections(doc)) {
    parts.push(s.name)
    for (const p of readPages(doc, s.id)) parts.push(p.title, pageText(doc, p.id))
  }
  return parts.join('\n')
}
