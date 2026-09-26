// OpenDocument Text (.odt) import into ProseMirror JSON.

import JSZip from 'jszip'
import { getSchema, type JSONContent } from '@tiptap/core'
import type { Schema } from '@tiptap/pm/model'
import { allExtensions } from '../editor/extensions'
import { DEFAULT_FONT, DEFAULT_FONT_SIZE_PT, DEFAULT_PAGE, PAGE_SIZES_MM, langCode, normalizeColumns, sectionAttrs, type Columns, type CommentData, type ImportedDocument, type PageSettings, type PageSize } from './types'
import { clean } from '../references/parse'
import { CITE_LANGS, CITE_STYLES, newSourceId, type CiteSettings, type Person, type Source, type SourceType } from '../references/types'
import { attr, bytesToDataUrl, child, children, mimeFromPath, parseXml, toHex } from '../../../core/formats'
import { mathmlToLatex } from './math'
import { authorColor } from './review'
import { t } from '../../../core/i18n'

const INDENT_CM = 1.27
const PX_PER_CM = 96 / 2.54
// Upper bound for repeated rows/columns (spreadsheet-like tables can repeat thousands).
const MAX_REPEAT = 50

interface StyleDef {
  name: string
  displayName: string
  parent?: string
  // Automatic styles hold direct formatting; common styles are named styles.
  auto: boolean
  el: Element
}

// Style lookup scope for one XML part (content.xml or styles.xml) plus the common styles.
interface Ctx {
  styles: Map<string, StyleDef> // key: `${family}:${name}`
  defaults: Map<string, Element> // family -> default style
  lists: Map<string, Element> // list style name -> text:list-style
  fonts: Map<string, string> // font face name -> family
  images: Map<string | Element, string> // image key -> data URL
  defaultFont?: string
  defaultSize?: number
  // Document language tag (default paragraph style), e.g. "gl-ES".
  lang?: string
  // Last number of top-level ordered lists, for continued numbering.
  listEnds: Map<string, number>
  review: Review
  refs: Refs
}

// Sections and bibliography state shared by the body walk.
interface Refs {
  // Bibliography mark identifier → source id; sources found in marks or meta.
  marks: Map<string, string>
  sources: Source[]
  // Master pages: name → page settings and columns.
  masters: Map<string, { page: PageSettings; columns: Columns }>
  master: string | null
  started: boolean
}

interface Change {
  kind: 'insertion' | 'deletion' | 'other'
  author: string
  time: number
  // Deleted content (text:deletion), shown in place as a suggested deletion.
  deletion?: Element
}

// Comments, tracked changes and formulas, shared by all parts of the document.
interface Review {
  comments: CommentData[]
  // Comment ranges open at this point; point comments close after the next text.
  open: Set<string>
  points: Set<string>
  changes: Map<string, Change>
  // Insertion regions open at this point.
  inserting: string[]
  // The deletion being written out.
  deleting: string | null
  formulas: Map<string, string>
}

interface Walk {
  depth: number // list nesting depth
  listStyle: string | null
  top: boolean // top level of the body (page breaks are only kept there)
}

// A converted block plus grouping hints (quote paragraphs become blockquotes, code lines merge).
interface Item {
  node: JSONContent
  quote?: boolean
  code?: string
}

interface Fmt {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  code?: boolean
  subscript?: boolean
  superscript?: boolean
  color?: string
  highlight?: string
  fontFamily?: string
  fontSize?: number
  link?: string
}

export async function importOdt(file: ArrayBuffer): Promise<ImportedDocument> {
  const zip = await JSZip.loadAsync(file)
  const contentXml = await zip.file('content.xml')?.async('text')
  if (!contentXml) throw new Error(t('Not an OpenDocument text file'))
  const stylesXml = await zip.file('styles.xml')?.async('text')
  const content = parseXml(contentXml).documentElement
  const stylesRoot = stylesXml ? parseXml(stylesXml).documentElement : null

  const images: Ctx['images'] = new Map()
  for (const root of [content, stylesRoot]) if (root) await loadImages(root, zip, images)

  const review: Review = { comments: [], open: new Set(), points: new Set(), changes: readChanges(content), inserting: [], deleting: null, formulas: await loadFormulas(content, zip) }
  const meta = await readMeta(zip)
  const refs: Refs = { marks: new Map(), sources: meta.sources, masters: new Map(), master: null, started: false }
  for (const [label, id] of Object.entries(meta.marks)) if (meta.sources.some((src) => src.id === id)) refs.marks.set(label, id)
  const common: Ctx = { styles: new Map(), defaults: new Map(), lists: new Map(), fonts: new Map(), images, listEnds: new Map(), review, refs }
  for (const root of [stylesRoot, content]) readFonts(child(root, 'font-face-decls'), common)
  readStyles(child(stylesRoot, 'styles'), common, false)
  const scope = (auto: Element | null): Ctx => {
    const ctx: Ctx = { ...common, styles: new Map(common.styles), lists: new Map(common.lists), listEnds: new Map() }
    readStyles(auto, ctx, true)
    return ctx
  }
  const bodyCtx = scope(child(content, 'automatic-styles'))
  const masterCtx = scope(child(stylesRoot, 'automatic-styles'))
  // The document's own base font, so runs that merely repeat it stay unformatted.
  for (const ctx of [bodyCtx, masterCtx]) {
    const base = textFmt(styleChain(ctx, 'Standard', 'paragraph'), ctx, 'all')
    ctx.defaultFont = base.fontFamily
    ctx.defaultSize = base.fontSize
    ctx.lang = languageOf(styleChain(ctx, 'Standard', 'paragraph'), ctx) ?? undefined
  }

  // Master pages with their page layouts (a change of master page starts a new section).
  const masters = kids(child(stylesRoot, 'master-styles'), 'master-page')
  for (const m of masters) {
    const l = kids(child(stylesRoot, 'automatic-styles'), 'page-layout').find((x) => attr(x, 'name') === attr(m, 'page-layout-name'))
    if (l) refs.masters.set(attr(m, 'name') ?? '', { page: pageSettings(l, !!child(m, 'header'), !!child(m, 'footer')), columns: columnsOf(child(l, 'page-layout-properties')) })
  }
  const text = child(child(content, 'body'), 'text')
  const walked = text ? walkBlocks(text, bodyCtx, { depth: 0, listStyle: null, top: true }) : []
  // A section break right before another one leaves an empty section: keep the later one.
  const body = walked.filter((n, i) => !(n.type === 'sectionBreak' && walked[i + 1]?.type === 'sectionBreak'))

  // Header, footer and page layout come from the master page of the first paragraph.
  const first = text ? firstBlock(text) : null
  const masterName = first
    ? styleChain(bodyCtx, attr(first, 'style-name'), first.localName === 'table' ? 'table' : 'paragraph')
        .map((s) => attr(s.el, 'master-page-name'))
        .find(Boolean)
    : null
  const master =
    masters.find((m) => attr(m, 'name') === masterName) ?? masters.find((m) => attr(m, 'name') === 'Standard') ?? masters[0] ?? null
  const layout = kids(child(stylesRoot, 'automatic-styles'), 'page-layout').find((l) => attr(l, 'name') === attr(master, 'page-layout-name'))
  const headerEl = child(master, 'header')
  const footerEl = child(master, 'footer')
  const section = (el: Element | null) =>
    el && attr(el, 'display') !== 'false' && el.children.length ? walkBlocks(el, masterCtx, { depth: 0, listStyle: null, top: false }) : null
  const header = section(headerEl)
  const footer = section(footerEl)

  return {
    body: normalize(body),
    header: header ? normalize(header) : null,
    footer: footer ? normalize(footer) : null,
    page: layout ? pageSettings(layout, !!header, !!footer) : DEFAULT_PAGE,
    columns: layout ? columnsOf(child(layout, 'page-layout-properties')) : undefined,
    lang: bodyCtx.lang,
    comments: review.comments,
    sources: refs.sources,
    citeStyle: meta.cite,
  }
}

// Our sources, citation style and mark identifiers, kept in meta.xml user fields.
async function readMeta(zip: JSZip): Promise<{ sources: Source[]; cite?: CiteSettings; marks: Record<string, string> }> {
  const xml = await zip.file('meta.xml')?.async('text')
  const out: { sources: Source[]; cite?: CiteSettings; marks: Record<string, string> } = { sources: [], marks: {} }
  if (!xml) return out
  for (const f of parseXml(xml).getElementsByTagNameNS('*', 'user-defined')) {
    try {
      const value = JSON.parse(f.textContent ?? '')
      const name = attr(f, 'name')
      if (name === 'OfimeoSources' && Array.isArray(value)) out.sources = value
      else if (name === 'OfimeoCitationStyle' && CITE_STYLES.includes(value.style) && CITE_LANGS.includes(value.lang)) out.cite = value
      else if (name === 'OfimeoMarks' && value && typeof value === 'object') out.marks = value
    } catch {
      // Not ours.
    }
  }
  return out
}

function columnsOf(props: Element | null): Columns {
  const cols = child(props, 'columns')
  const count = Number(attr(cols, 'column-count')) || 1
  return normalizeColumns({ count, gap: attr(cols, 'column-gap') ? toCm(attr(cols, 'column-gap')) * 10 : 12.5, separator: !!child(cols, 'column-sep') && attr(child(cols, 'column-sep'), 'style') !== 'none' })
}

const FROM_ODF: Record<string, SourceType> = {
  book: 'book',
  booklet: 'book',
  manual: 'book',
  proceedings: 'book',
  inbook: 'chapter',
  incollection: 'chapter',
  inproceedings: 'chapter',
  conference: 'chapter',
  article: 'article',
  journal: 'article',
  techreport: 'report',
  phdthesis: 'thesis',
  mastersthesis: 'thesis',
  www: 'web',
}

function odfPeople(value: string | null): Person[] {
  if (!value) return []
  return value
    .split(/;|\s+and\s+/)
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => {
      const comma = v.indexOf(',')
      return comma > 0 ? { family: v.slice(0, comma).trim(), given: v.slice(comma + 1).trim() || undefined } : { family: v }
    })
}

// The source of a bibliography mark (by identifier, created from the mark's fields the first time).
function markSource(el: Element, ctx: Ctx): string {
  const identifier = attr(el, 'identifier') ?? ''
  const known = ctx.refs.marks.get(identifier)
  if (known) return known
  const a = (name: string) => attr(el, name) || undefined
  const type = FROM_ODF[a('bibliography-type') ?? ''] ?? (a('url') ? 'web' : 'other')
  const year = a('year')
  const month = a('month')
  const src = clean({
    id: newSourceId() + ctx.refs.sources.length,
    key: identifier || undefined,
    type,
    authors: odfPeople(attr(el, 'author')),
    editors: odfPeople(attr(el, 'editor')),
    title: a('title') ?? '',
    container: a('journal') ?? a('booktitle') ?? a('howpublished') ?? a('series'),
    date: year ? (month && /^\d{1,2}$/.test(month) ? `${year}-${month.padStart(2, '0')}` : year) : undefined,
    publisher: a('publisher') ?? a('school') ?? a('institution') ?? a('organizations'),
    place: a('address'),
    edition: a('edition'),
    volume: a('volume'),
    issue: type === 'report' ? undefined : a('number'),
    number: type === 'report' ? a('number') : undefined,
    pages: a('pages'),
    url: a('url'),
    doi: a('custom4'),
    accessed: a('custom3'),
  })
  ctx.refs.sources.push(src)
  ctx.refs.marks.set(identifier, src.id)
  return src.id
}

function tocNode(el: Element, ctx: Ctx): JSONContent {
  const source = child(el, 'table-of-content-source')
  const maxLevel = Math.min(6, Math.max(1, Number(attr(source, 'outline-level')) || 3))
  const bodyEl = child(el, 'index-body')
  const title = plainText(child(child(bodyEl, 'index-title'), 'p') ?? child(child(bodyEl, 'index-title'), 'h') ?? document.createElement('x')).trim() || (child(source, 'index-title-template')?.textContent ?? '').trim()
  const entries: { level: number; text: string; page?: number }[] = []
  for (const p of kids(bodyEl, 'p')) {
    const chain = styleChain(ctx, attr(p, 'style-name'), 'paragraph')
    const level = chain.map((st) => /^contents (\d+)$/.exec(st.displayName.toLowerCase())).find(Boolean)
    const text = plainText(p)
    const tab = text.lastIndexOf('\t')
    const label = (tab >= 0 ? text.slice(0, tab) : text).replace(/\t/g, ' ').trim()
    const page = tab >= 0 ? Number(text.slice(tab + 1).trim()) : NaN
    if (label) entries.push({ level: level ? Math.min(6, Number(level[1])) : 1, text: label, ...(Number.isFinite(page) && page > 0 ? { page } : {}) })
  }
  return { type: 'tableOfContents', attrs: { maxLevel, title, entries } }
}

// ---- Review: tracked changes, comments, formulas ----

function readChanges(content: Element): Map<string, Change> {
  const changes = new Map<string, Change>()
  for (const region of content.getElementsByTagNameNS('*', 'changed-region')) {
    const id = attr(region, 'id')
    const change = [...region.children].find((c) => ['insertion', 'deletion', 'format-change'].includes(c.localName))
    if (!id || !change) continue
    const info = child(change, 'change-info')
    const date = Date.parse(child(info, 'date')?.textContent ?? '')
    changes.set(id, {
      kind: change.localName === 'insertion' ? 'insertion' : change.localName === 'deletion' ? 'deletion' : 'other',
      author: child(info, 'creator')?.textContent ?? '',
      time: Number.isFinite(date) ? date : 0,
      deletion: change.localName === 'deletion' ? change : undefined,
    })
  }
  return changes
}

// Embedded formula objects (MathML) as LaTeX, by the href of their draw:object.
async function loadFormulas(content: Element, zip: JSZip): Promise<Map<string, string>> {
  const formulas = new Map<string, string>()
  for (const object of content.getElementsByTagNameNS('*', 'object')) {
    const href = attr(object, 'href')
    if (!href || formulas.has(href)) continue
    const inline = [...object.children].find((c) => c.localName === 'math')
    let math = inline ?? null
    if (!math) {
      const path = decodeURIComponent(href.replace(/^\.\//, '').replace(/\/$/, ''))
      const xml = await zip.file(`${path}/content.xml`)?.async('text')
      const root = xml ? parseXml(xml).documentElement : null
      math = root?.localName === 'math' ? root : (root?.getElementsByTagNameNS('*', 'math')[0] ?? null)
    }
    if (math) {
      const latex = mathmlToLatex(math)
      if (latex) formulas.set(href, latex)
    }
  }
  return formulas
}

// Marks for review information at the current point.
function reviewMarks(ctx: Ctx): NonNullable<JSONContent['marks']> {
  const r = ctx.review
  const marks: NonNullable<JSONContent['marks']> = [...r.open].map((id) => ({ type: 'commentRange', attrs: { id } }))
  const changeId = r.deleting ?? r.inserting[r.inserting.length - 1]
  const change = changeId ? r.changes.get(changeId) : undefined
  if (change && change.kind !== 'other') {
    marks.push({
      type: change.kind,
      attrs: { id: `o${changeId}`, author: change.author, authorId: `import:${change.author}`, color: authorColor(change.author), time: change.time },
    })
  }
  return marks
}

function annotation(el: Element, ctx: Ctx): void {
  const name = attr(el, 'name')
  const id = name ?? `point${ctx.review.comments.length + 1}`
  const date = Date.parse(child(el, 'date')?.textContent ?? '')
  const parent = attr(el, 'parent-name')
  ctx.review.comments.push({
    id,
    author: child(el, 'creator')?.textContent ?? '',
    date: Number.isFinite(date) ? date : 0,
    text: [...el.children]
      .filter((c) => c.localName === 'p' || c.localName === 'h')
      .map((p) => plainText(p))
      .join('\n')
      .trim(),
    resolved: attr(el, 'resolved') === 'true' || undefined,
    parentId: parent ?? undefined,
  })
  ctx.review.open.add(id)
  // Without a matching end it is a point comment: it covers the next piece of text.
  const hasEnd = name && [...(el.ownerDocument?.getElementsByTagNameNS('*', 'annotation-end') ?? [])].some((e) => attr(e, 'name') === name)
  if (!hasEnd) ctx.review.points.add(id)
}

let schema: Schema | undefined

// Runs the result through the editor schema: validates it and fills default attributes.
function normalize(content: JSONContent[]): JSONContent {
  const doc: JSONContent = { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }
  try {
    schema ??= getSchema(allExtensions())
    const node = schema.nodeFromJSON(doc)
    try {
      node.check()
    } catch (e) {
      console.warn('ODT import produced an invalid document', e)
    }
    return node.toJSON()
  } catch (e) {
    console.warn('ODT import could not be normalized', e)
    return doc
  }
}

// ---- Blocks ----

function walkBlocks(parent: Element, ctx: Ctx, walk: Walk): JSONContent[] {
  const items = walkItems(parent, ctx, walk)
  // Inside lists, quote paragraphs come from a quoted list: the list itself is the quote.
  return group(walk.depth ? items.map((i) => ({ ...i, quote: false })) : items)
}

function walkItems(parent: Element, ctx: Ctx, walk: Walk): Item[] {
  const items: Item[] = []
  for (const el of children(parent)) {
    switch (el.localName) {
      case 'p':
      case 'h':
        items.push(...paragraph(el, ctx, walk))
        break
      case 'list':
        // Headings wrapped in lists (outline numbering, e.g. from Word) stay plain headings.
        if (children(el).some((item) => item.firstElementChild?.localName === 'h')) {
          for (const item of children(el)) items.push(...walkItems(item, ctx, walk))
        } else {
          const item = list(el, ctx, walk)
          if (item) items.push(item)
        }
        break
      case 'table':
        items.push({ node: table(el, ctx) })
        break
      case 'frame': {
        // Page-anchored frames sit directly in the body.
        const content = inlineContent(el, ctx, {}, true)
        if (content.length) items.push({ node: { type: 'paragraph', content } })
        break
      }
      case 'table-of-content':
        items.push({ node: tocNode(el, ctx) })
        break
      case 'bibliography':
        items.push({ node: { type: 'bibliography' } })
        break
      case 'section': {
        // Sections with text columns become continuous section breaks around their content.
        const props = child(styleChain(ctx, attr(el, 'style-name'), 'section')[0]?.el ?? null, 'section-properties')
        const columns = columnsOf(props)
        const master = ctx.refs.masters.get(ctx.refs.master ?? 'Standard') ?? ctx.refs.masters.values().next().value
        const page = master?.page ?? DEFAULT_PAGE
        if (walk.top && columns.count > 1) {
          items.push({ node: { type: 'sectionBreak', attrs: sectionAttrs({ start: 'continuous', page, columns }) } })
          items.push(...walkItems(el, ctx, walk))
          items.push({ node: { type: 'sectionBreak', attrs: sectionAttrs({ start: 'continuous', page, columns: normalizeColumns(master?.columns) }) } })
        } else items.push(...walkItems(el, ctx, walk))
        break
      }
      case 'index-body':
      case 'alphabetical-index':
      case 'illustration-index':
      case 'table-index':
      case 'object-index':
      case 'user-index':
      case 'numbered-paragraph':
        items.push(...walkItems(el, ctx, walk))
        break
    }
  }
  return items
}

// Merges consecutive quote items into blockquotes and code lines into code blocks.
function group(items: Item[]): JSONContent[] {
  const out: JSONContent[] = []
  let quote: JSONContent | null = null
  let code: JSONContent | null = null
  for (const item of items) {
    if (item.code !== undefined) {
      quote = null
      const text = code ? (code.content?.[0]?.text ?? '') + '\n' + item.code : item.code
      if (!code) out.push((code = { type: 'codeBlock', attrs: { language: null } }))
      code.content = text ? [{ type: 'text', text }] : undefined
      continue
    }
    code = null
    if (item.quote) {
      if (!quote) out.push((quote = { type: 'blockquote', content: [] }))
      quote.content!.push(item.node)
      continue
    }
    quote = null
    out.push(item.node)
  }
  return out
}

function paragraph(p: Element, ctx: Ctx, walk: Walk): Item[] {
  const chain = styleChain(ctx, attr(p, 'style-name'), 'paragraph')
  const names = chain.map((s) => s.displayName.toLowerCase())
  const items: Item[] = []
  // A different master page starts a new section on a new page.
  if (walk.top) {
    const master = chain.map((st) => attr(st.el, 'master-page-name')).find((m) => m !== null && m !== undefined)
    if (master && ctx.refs.started && master !== ctx.refs.master && ctx.refs.masters.has(master)) {
      const m = ctx.refs.masters.get(master)!
      items.push({ node: { type: 'sectionBreak', attrs: sectionAttrs({ start: 'nextPage', page: m.page, columns: m.columns }) } })
    }
    if (master && ctx.refs.masters.has(master)) ctx.refs.master = master
    ctx.refs.started = true
  }
  const breakBefore = walk.top && prop(chain, 'paragraph-properties', 'break-before') === 'page' && !items.length
  const breakAfter = walk.top && prop(chain, 'paragraph-properties', 'break-after') === 'page'
  if (breakBefore) items.push({ node: { type: 'pageBreak' } })

  const quote = names.some((n) => n === 'quotations' || n === 'quote' || n === 'block quotation')
  if (names.includes('preformatted text')) {
    items.push({ node: { type: 'codeBlock' }, code: plainText(p) })
    if (breakAfter) items.push({ node: { type: 'pageBreak' } })
    return items
  }
  if (names.includes('horizontal line') && !plainText(p).trim() && !p.getElementsByTagNameNS('*', 'frame').length) {
    items.push({ node: { type: 'horizontalRule' } })
    if (breakAfter) items.push({ node: { type: 'pageBreak' } })
    return items
  }

  let node: JSONContent
  let look = false // styles that carry their own look (headings, title…) don't pass on text formatting
  const outline = Number(attr(p, 'outline-level')) || Number(prop(chain, null, 'default-outline-level')) || 0
  const headingName = names.map((n) => /^heading (\d)$/.exec(n)).find(Boolean)
  const attrs: Record<string, unknown> = {}
  if (names.includes('title') || names.includes('subtitle')) {
    node = { type: 'paragraph' }
    attrs.styleId = names.includes('title') ? 'title' : 'subtitle'
    look = true
  } else if ((p.localName === 'h' && outline) || headingName) {
    node = { type: 'heading' }
    attrs.level = Math.min(Math.max(p.localName === 'h' && outline ? outline : Number(headingName![1]), 1), 6)
    look = true
  } else {
    node = { type: 'paragraph' }
    look = names.includes('table heading')
  }

  const align = prop(chain, 'paragraph-properties', 'text-align')
  if (align === 'center') attrs.textAlign = 'center'
  else if (align === 'end' || align === 'right') attrs.textAlign = 'right'
  else if (align === 'justify') attrs.textAlign = 'justify'
  if (walk.depth === 0) {
    // Indent is the direct margin beyond what the named style already gives.
    const direct = prop(chain.filter((s) => s.auto), 'paragraph-properties', 'margin-left')
    if (direct !== null) {
      const named = prop(chain.filter((s) => !s.auto), 'paragraph-properties', 'margin-left') ?? attr(child(ctx.defaults.get('paragraph'), 'paragraph-properties'), 'margin-left')
      const indent = Math.round((toCm(direct) - toCm(named)) / INDENT_CM)
      if (indent > 0) attrs.indent = Math.min(indent, 8)
    }
  }
  const lineHeight = prop(chain, 'paragraph-properties', 'line-height')
  if (lineHeight?.endsWith('%') && parseFloat(lineHeight) > 0) attrs.lineHeight = String(Number((parseFloat(lineHeight) / 100).toFixed(2)))
  const lang = langCode(languageOf(chain, ctx))
  if (lang && lang !== langCode(ctx.lang)) attrs.lang = lang

  node.attrs = attrs
  const content = inlineContent(p, ctx, textFmt(chain, ctx, look ? 'auto' : 'custom'))
  if (content.length) node.content = content
  // An empty paragraph that only carries a page break is the break itself.
  if (!(breakBefore && !content.length && node.type === 'paragraph' && !attrs.styleId)) items.push({ node, quote })
  if (breakAfter) items.push({ node: { type: 'pageBreak' } })
  return items
}

function list(el: Element, ctx: Ctx, walk: Walk): Item | null {
  const depth = walk.depth + 1
  const styleName = attr(el, 'style-name') ?? walk.listStyle
  const level = listLevel(ctx, styleName, depth)
  const numbered = level?.localName === 'list-level-style-number' && !!attr(level, 'num-format')
  const items: JSONContent[] = []
  let start: number | null = null
  for (const item of children(el)) {
    if (item.localName !== 'list-item' && item.localName !== 'list-header') continue
    if (!items.length) start = int(attr(item, 'start-value'))
    const blocks = walkBlocks(item, ctx, { depth, listStyle: styleName, top: false })
    // List items must start with a paragraph.
    if (blocks[0]?.type === 'heading') {
      const { level: _level, ...rest } = blocks[0].attrs ?? {}
      blocks[0] = { ...blocks[0], type: 'paragraph', attrs: rest }
    } else if (blocks[0]?.type !== 'paragraph') blocks.unshift({ type: 'paragraph' })
    items.push({ type: 'listItem', content: blocks })
  }
  if (!items.length) return null
  const firstP = el.getElementsByTagNameNS('*', 'p')[0] ?? null
  const quote = !!firstP && styleChain(ctx, attr(firstP, 'style-name'), 'paragraph').some((s) => /^(quotations|quote)$/i.test(s.displayName))

  if (numbered) {
    start ??= int(attr(level, 'start-value'))
    if (depth === 1 && start === null) {
      // Lists split by other paragraphs may continue the numbering of an earlier list.
      const cont = attr(el, 'continue-list')
      if (cont && ctx.listEnds.has(`id:${cont}`)) start = ctx.listEnds.get(`id:${cont}`)! + 1
      else if (attr(el, 'continue-numbering') === 'true' && ctx.listEnds.has(`style:${styleName}`)) start = ctx.listEnds.get(`style:${styleName}`)! + 1
    }
    if (depth === 1) {
      const end = (start ?? 1) + items.length - 1
      const id = attr(el, 'id')
      if (id) ctx.listEnds.set(`id:${id}`, end)
      ctx.listEnds.set(`style:${styleName}`, end)
    }
    const attrs = start !== null && start !== 1 ? { start } : {}
    return { node: { type: 'orderedList', attrs, content: items }, quote }
  }

  // Bullet lists whose items all start with a checkbox character are task lists.
  const boxes = items.map((item) => {
    const first = item.content![0].content?.[0]
    return first?.type === 'text' ? /^([☐☑☒])\s?/.exec(first.text ?? '') : null
  })
  if (boxes.every(Boolean)) {
    const tasks = items.map((item, i) => {
      const [para, ...rest] = item.content!
      const [first, ...inline] = para.content!
      const text = first.text!.slice(boxes[i]![0].length)
      const content = text ? [{ ...first, text }, ...inline] : inline
      return {
        type: 'taskItem',
        attrs: { checked: boxes[i]![1] !== '☐' },
        content: [{ ...para, content: content.length ? content : undefined }, ...rest],
      }
    })
    return { node: { type: 'taskList', content: tasks }, quote }
  }
  return { node: { type: 'bulletList', content: items }, quote }
}

function listLevel(ctx: Ctx, styleName: string | null, depth: number): Element | null {
  const style = styleName ? ctx.lists.get(styleName) : null
  if (!style) return null
  const levels = children(style).filter((l) => l.localName.startsWith('list-level-style'))
  return levels.find((l) => Number(attr(l, 'level') ?? 1) === depth) ?? levels[levels.length - 1] ?? null
}

function table(el: Element, ctx: Ctx): JSONContent {
  // Column widths in pixels (null when relative only).
  const widths: (number | null)[] = []
  const addColumns = (parent: Element) => {
    for (const node of children(parent)) {
      if (node.localName === 'table-column') {
        const style = styleChain(ctx, attr(node, 'style-name'), 'table-column')
        const width = prop(style, 'table-column-properties', 'column-width')
        const px = width ? Math.round(toCm(width) * PX_PER_CM) : null
        const repeat = Math.min(Number(attr(node, 'number-columns-repeated') ?? 1) || 1, MAX_REPEAT)
        for (let i = 0; i < repeat; i++) widths.push(px || null)
      } else if (['table-columns', 'table-header-columns', 'table-column-group'].includes(node.localName)) addColumns(node)
    }
  }
  addColumns(el)

  interface Cell {
    el: Element
    col: number
    colspan: number
    rowspan: number
    header: boolean
  }
  const rows: Cell[][] = []
  const addRows = (parent: Element, header: boolean) => {
    for (const node of children(parent)) {
      if (node.localName === 'table-row') {
        const cells: Cell[] = []
        let col = 0
        for (const cell of children(node)) {
          if (cell.localName !== 'table-cell' && cell.localName !== 'covered-table-cell') continue
          const repeat = Math.min(Number(attr(cell, 'number-columns-repeated') ?? 1) || 1, MAX_REPEAT)
          for (let i = 0; i < repeat; i++) {
            if (cell.localName === 'covered-table-cell') {
              col++
              continue
            }
            const colspan = Math.max(1, Number(attr(cell, 'number-columns-spanned') ?? 1) || 1)
            const rowspan = Math.max(1, Number(attr(cell, 'number-rows-spanned') ?? 1) || 1)
            cells.push({ el: cell, col, colspan, rowspan, header })
            // Spanned slots are filled by covered cells, which advance the column themselves.
            col++
          }
        }
        const repeat = Math.min(Number(attr(node, 'number-rows-repeated') ?? 1) || 1, MAX_REPEAT)
        for (let i = 0; i < repeat; i++) rows.push(cells)
      } else if (node.localName === 'table-header-rows') addRows(node, true)
      else if (['table-rows', 'table-row-group'].includes(node.localName)) addRows(node, header)
    }
  }
  addRows(el, false)

  // Trailing empty columns (common in repeated spreadsheet cells) are dropped.
  const isEmpty = (c: Cell) => !c.el.textContent?.trim() && !c.el.getElementsByTagNameNS('*', 'frame').length
  const used = Math.max(1, ...rows.flatMap((r) => r.filter((c) => !isEmpty(c) || c.colspan > 1).map((c) => c.col + c.colspan)))

  const content = rows.map((cells, r) => ({
    type: 'tableRow',
    content: cells
      .filter((c) => c.col < used)
      .map((c) => {
        const colspan = Math.min(c.colspan, used - c.col)
        const rowspan = Math.min(c.rowspan, rows.length - r)
        const cols = widths.slice(c.col, c.col + colspan)
        const style = styleChain(ctx, attr(c.el, 'style-name'), 'table-cell')
        const bg = prop(style, 'table-cell-properties', 'background-color')
        const paras = children(c.el).filter((p) => p.localName === 'p' || p.localName === 'h')
        const headingParas =
          paras.length > 0 && paras.every((p) => styleChain(ctx, attr(p, 'style-name'), 'paragraph').some((s) => /^table heading$/i.test(s.displayName)))
        const blocks = walkBlocks(c.el, ctx, { depth: 0, listStyle: null, top: false })
        return {
          type: c.header || headingParas ? 'tableHeader' : 'tableCell',
          attrs: {
            colspan,
            rowspan,
            colwidth: cols.length === colspan && cols.every((w) => w) ? cols : null,
            backgroundColor: bg && bg !== 'transparent' ? (toHex(bg) ?? null) : null,
          },
          content: blocks.length ? blocks : [{ type: 'paragraph' }],
        }
      }),
  }))
  return { type: 'table', content: content.length ? content : [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph' }] }] }] }
}

// ---- Inline content ----

class InlineBuilder {
  nodes: JSONContent[] = []
  // The last node is a citation with nothing after it (next marks join it).
  adjacentCitation = false
  // Whether the last character was a collapsible space (true at paragraph start).
  private space = true

  text(text: string, fmt: Fmt, ctx: Ctx, literal: boolean): void {
    if (text) this.adjacentCitation = false
    if (literal) {
      // ODF collapses XML whitespace; explicit spaces use <text:s/>.
      text = text.replace(/[\t\n\r ]+/g, ' ')
      if (this.space) text = text.replace(/^ /, '')
      if (!text) return
      this.space = text.endsWith(' ')
    } else this.space = false
    const review = reviewMarks(ctx)
    const own = marksOf(fmt, ctx)
    const marks = review.length ? [...(own ?? []), ...review] : own
    const last = this.nodes[this.nodes.length - 1]
    if (last?.type === 'text' && JSON.stringify(last.marks) === JSON.stringify(marks)) last.text += text
    else this.nodes.push(marks ? { type: 'text', text, marks } : { type: 'text', text })
    this.closePoints(ctx)
  }

  node(node: JSONContent, ctx?: Ctx): void {
    this.adjacentCitation = false
    if (ctx && node.type !== 'hardBreak') {
      const review = reviewMarks(ctx)
      if (review.length) node.marks = [...(node.marks ?? []), ...review]
      this.closePoints(ctx)
    }
    this.nodes.push(node)
    this.space = false
  }

  private closePoints(ctx: Ctx) {
    for (const id of ctx.review.points) ctx.review.open.delete(id)
    ctx.review.points.clear()
  }
}

function inlineContent(parent: Element, ctx: Ctx, fmt: Fmt, self = false): JSONContent[] {
  const out = new InlineBuilder()
  if (self) inlineElement(parent, ctx, fmt, out)
  else inline(parent, ctx, fmt, out)
  return out.nodes
}

function inline(parent: Element, ctx: Ctx, fmt: Fmt, out: InlineBuilder): void {
  for (const node of parent.childNodes) {
    if (node.nodeType === 3) out.text(node.textContent ?? '', fmt, ctx, true)
    else if (node.nodeType === 1) inlineElement(node as Element, ctx, fmt, out)
  }
}

function inlineElement(el: Element, ctx: Ctx, fmt: Fmt, out: InlineBuilder): void {
  switch (el.localName) {
    case 's':
      out.text(' '.repeat(Math.min(Number(attr(el, 'c') ?? 1) || 1, 1000)), fmt, ctx, false)
      break
    case 'tab':
      out.text('\t', fmt, ctx, false)
      break
    case 'line-break':
      out.node({ type: 'hardBreak' })
      break
    case 'span':
      inline(el, ctx, { ...fmt, ...textFmt(styleChain(ctx, attr(el, 'style-name'), 'text'), ctx, 'span') }, out)
      break
    case 'a': {
      const href = attr(el, 'href')
      inline(el, ctx, href ? { ...fmt, link: href } : fmt, out)
      break
    }
    case 'frame': {
      const object = child(el, 'object')
      const latex = object ? ctx.review.formulas.get(attr(object, 'href') ?? '') : undefined
      if (latex) {
        // A formula alone in its paragraph is a display equation.
        const p = el.parentElement
        const alone = !!p && (p.localName === 'p' || p.localName === 'h') && p.children.length === 1 && [...p.childNodes].every((n) => n === el || !(n.textContent ?? '').trim())
        out.node({ type: 'equation', attrs: { latex, display: alone } }, ctx)
        break
      }
      const image = child(el, 'image')
      const src = image ? (ctx.images.get(imageKey(image)) ?? null) : null
      if (src) {
        const width = toCm(attr(el, 'width'))
        const height = toCm(attr(el, 'height'))
        out.node({
          type: 'image',
          attrs: {
            src,
            alt: child(el, 'desc')?.textContent || null,
            title: child(el, 'title')?.textContent || null,
            width: width ? Math.round(width * PX_PER_CM) : null,
            height: height ? Math.round(height * PX_PER_CM) : null,
          },
        }, ctx)
      } else {
        // Text frames (e.g. captioned images): inline their paragraphs' content.
        const box = child(el, 'text-box')
        if (box) for (const p of box.getElementsByTagNameNS('*', '*')) if (p.localName === 'p' || p.localName === 'h') inline(p, ctx, fmt, out)
      }
      break
    }
    case 'note': {
      const content = paragraphsText(child(el, 'note-body'))
      out.node({ type: 'footnote', attrs: { content } }, ctx)
      break
    }
    case 'page-number':
      out.node({ type: 'pageNumber', attrs: { kind: 'page' } })
      break
    case 'page-count':
      out.node({ type: 'pageNumber', attrs: { kind: 'total' } })
      break
    case 'annotation':
      annotation(el, ctx)
      break
    case 'annotation-end':
      ctx.review.open.delete(attr(el, 'name') ?? '')
      break
    case 'change-start':
      ctx.review.inserting.push(attr(el, 'change-id') ?? '')
      break
    case 'change-end': {
      const id = attr(el, 'change-id')
      ctx.review.inserting = ctx.review.inserting.filter((x) => x !== id)
      break
    }
    case 'change': {
      // Deleted text is shown where it was, as a suggested deletion.
      const id = attr(el, 'change-id') ?? ''
      const change = ctx.review.changes.get(id)
      if (change?.deletion && !ctx.review.deleting) {
        ctx.review.deleting = id
        const paragraphs = [...change.deletion.children].filter((c) => c.localName === 'p' || c.localName === 'h')
        paragraphs.forEach((p, i) => {
          if (i > 0) out.text(' ', fmt, ctx, false)
          inline(p, ctx, fmt, out)
        })
        ctx.review.deleting = null
      }
      break
    }
    case 'bibliography-mark': {
      // Word citations kept by LibreOffice ("CITATION tag \l 1033"): without their sources, keep the text.
      if (/^\s*CITATION\b/.test(attr(el, 'identifier') ?? '') && !ctx.refs.marks.has(attr(el, 'identifier') ?? '')) {
        inline(el, ctx, fmt, out)
        break
      }
      // Adjacent marks (one per source) form one citation.
      const id = markSource(el, ctx)
      const last = out.nodes[out.nodes.length - 1]
      const locator = attr(el, 'custom5') ?? ''
      if (last?.type === 'citation' && out.adjacentCitation) {
        last.attrs!.ids = [...(last.attrs!.ids as string[]), id]
        if (locator) last.attrs!.locator = locator
      } else out.node({ type: 'citation', attrs: { ids: [id], locator } }, ctx)
      out.adjacentCitation = true
      break
    }
    case 'bookmark':
    case 'bookmark-start':
    case 'bookmark-end':
    case 'reference-mark':
    case 'reference-mark-start':
    case 'reference-mark-end':
    case 'soft-page-break':
    case 'toc-mark':
    case 'toc-mark-start':
    case 'toc-mark-end':
    case 'alphabetical-index-mark':
    case 'alphabetical-index-mark-start':
    case 'alphabetical-index-mark-end':
    case 'user-index-mark':
    case 'user-index-mark-start':
    case 'user-index-mark-end':
    case 'sequence-decls':
    case 'note-citation':
      break
    default:
      // Other fields (date, title…) and unknown wrappers: keep their text.
      inline(el, ctx, fmt, out)
  }
}

// Plain text of an element, with <text:s>, tabs and line breaks expanded.
function plainText(el: Element): string {
  let text = ''
  for (const node of el.childNodes) {
    if (node.nodeType === 3) text += (node.textContent ?? '').replace(/[\t\n\r ]+/g, ' ')
    else if (node.nodeType === 1) {
      const e = node as Element
      if (e.localName === 's') text += ' '.repeat(Math.min(Number(attr(e, 'c') ?? 1) || 1, 1000))
      else if (e.localName === 'tab') text += '\t'
      else if (e.localName === 'line-break') text += '\n'
      else if (!['note', 'annotation', 'note-citation', 'frame'].includes(e.localName)) text += plainText(e)
    }
  }
  return text
}

// Text of all paragraphs inside an element, one line per paragraph.
function paragraphsText(el: Element | null): string {
  if (!el) return ''
  const lines: string[] = []
  const visit = (parent: Element) => {
    for (const e of children(parent)) {
      if (e.localName === 'p' || e.localName === 'h') lines.push(plainText(e).trim())
      else visit(e)
    }
  }
  visit(el)
  return lines.join('\n').trim()
}

// ---- Formatting ----

// Text formatting from a style chain. Which styles count:
// 'all' every style; 'auto' only direct formatting; 'custom' direct formatting plus
// user-defined paragraph styles; 'span' character styles (except code/link styles).
function textFmt(chain: StyleDef[], ctx: Ctx, mode: 'all' | 'auto' | 'custom' | 'span'): Fmt {
  const out: Fmt = {}
  const els: (Element | null)[] = []
  if (mode === 'all') els.push(child(ctx.defaults.get('paragraph'), 'text-properties'))
  for (const style of [...chain].reverse()) {
    const name = style.displayName.toLowerCase()
    if (!style.auto) {
      if (name === 'source text' || name === 'source code' || name === 'teletype') {
        out.code = true
        continue
      }
      if (mode === 'auto' || (mode === 'span' && /internet link|visited/.test(name))) continue
      if (mode === 'custom' && BASE_STYLES.test(name)) continue
    }
    els.push(child(style.el, 'text-properties'))
  }
  for (const el of els) {
    if (!el) continue
    const weight = attr(el, 'font-weight')
    if (weight) out.bold = weight === 'bold' || Number(weight) >= 600
    const style = attr(el, 'font-style')
    if (style) out.italic = style === 'italic' || style === 'oblique'
    const underline = attr(el, 'text-underline-style')
    if (underline) out.underline = underline !== 'none'
    const strike = attr(el, 'text-line-through-style')
    if (strike) out.strike = strike !== 'none'
    const color = attr(el, 'color')
    if (color) out.color = toHex(color)
    if (attr(el, 'use-window-font-color') === 'true') out.color = undefined
    const bg = attr(el, 'background-color')
    if (bg) out.highlight = bg === 'transparent' ? undefined : toHex(bg)
    const size = attr(el, 'font-size')
    if (size?.endsWith('pt')) out.fontSize = parseFloat(size)
    const font = attr(el, 'font-name')
    const family = font ? (ctx.fonts.get(font) ?? font) : attr(el, 'font-family')
    if (family) out.fontFamily = family.split(',')[0].trim().replace(/^['"]|['"]$/g, '')
    const position = attr(el, 'text-position')
    if (position) {
      const offset = position.split(' ')[0]
      const n = parseFloat(offset)
      out.superscript = offset === 'super' || n > 0
      out.subscript = offset === 'sub' || n < 0
    }
  }
  return out
}

// Paragraph styles that define the document's base look rather than a deliberate format.
const BASE_STYLES = /^(standard|default|default paragraph style|text body|body text|text|table contents|header|footer|footnote|endnote|list|list paragraph|list contents|caption|contents \d+|index)$/

function marksOf(f: Fmt, ctx: Ctx): JSONContent['marks'] | undefined {
  // Inline code excludes every other mark in the editor schema.
  if (f.code) return [{ type: 'code' }]
  const marks: NonNullable<JSONContent['marks']> = []
  if (f.bold) marks.push({ type: 'bold' })
  if (f.italic) marks.push({ type: 'italic' })
  if (f.underline) marks.push({ type: 'underline' })
  if (f.strike) marks.push({ type: 'strike' })
  if (f.subscript) marks.push({ type: 'subscript' })
  else if (f.superscript) marks.push({ type: 'superscript' })
  if (f.link) marks.push({ type: 'link', attrs: { href: f.link } })
  const style: Record<string, string> = {}
  if (f.color) style.color = f.color
  const font = f.fontFamily
  if (font && font.toLowerCase() !== DEFAULT_FONT.toLowerCase() && font.toLowerCase() !== ctx.defaultFont?.toLowerCase()) style.fontFamily = font
  if (f.fontSize && f.fontSize !== DEFAULT_FONT_SIZE_PT && f.fontSize !== ctx.defaultSize) style.fontSize = `${f.fontSize}pt`
  if (Object.keys(style).length) marks.push({ type: 'textStyle', attrs: style })
  if (f.highlight) marks.push({ type: 'highlight', attrs: { color: f.highlight } })
  return marks.length ? marks : undefined
}

// ---- Styles ----

function readStyles(container: Element | null, ctx: Ctx, auto: boolean): void {
  if (!container) return
  for (const el of children(container)) {
    if (el.localName === 'default-style') {
      const family = attr(el, 'family')
      if (family) ctx.defaults.set(family, el)
      continue
    }
    const name = attr(el, 'name')
    if (!name) continue
    if (el.localName === 'style') {
      ctx.styles.set(`${attr(el, 'family')}:${name}`, {
        name,
        displayName: (attr(el, 'display-name') ?? name.replace(/_20_/g, ' ')).trim(),
        parent: attr(el, 'parent-style-name') ?? undefined,
        auto,
        el,
      })
    } else if (el.localName === 'list-style') ctx.lists.set(name, el)
  }
}

function readFonts(container: Element | null, ctx: Ctx): void {
  if (!container) return
  for (const face of children(container, 'font-face')) {
    const name = attr(face, 'name')
    const family = attr(face, 'font-family')
    if (name) ctx.fonts.set(name, family ?? name)
  }
}

// The style and its ancestors, most specific first.
function styleChain(ctx: Ctx, name: string | null, family: string): StyleDef[] {
  const chain: StyleDef[] = []
  let current = name ?? undefined
  while (current && chain.length < 12) {
    const style = ctx.styles.get(`${family}:${current}`)
    if (!style || chain.includes(style)) break
    chain.push(style)
    current = style.parent
  }
  return chain
}

// First value of a property along a style chain; `props` is the properties element (null: the style element).
// fo:language / fo:country of a style chain (or the default paragraph style) as a tag.
function languageOf(chain: StyleDef[], ctx: Ctx): string | null {
  const defaults = ctx.defaults.get('paragraph')
  const own = (el: Element | null | undefined) => attr(child(el ?? null, 'text-properties'), 'language')
  const style = chain.find((s) => own(s.el))?.el ?? (own(defaults) ? defaults : null)
  const props = child(style ?? null, 'text-properties')
  const language = attr(props, 'language')
  if (!language || language === 'zxx') return null
  const country = attr(props, 'country')
  return country && country !== 'none' ? `${language}-${country}` : language
}

function prop(chain: StyleDef[], props: string | null, name: string): string | null {
  for (const style of chain) {
    const value = attr(props ? child(style.el, props) : style.el, name)
    if (value !== null) return value
  }
  return null
}

// ---- Images ----

// Linked images are keyed by href, embedded (base64) ones by their element.
function imageKey(image: Element): string | Element {
  return attr(image, 'href') ?? image
}

async function loadImages(root: Element, zip: JSZip, images: Ctx['images']): Promise<void> {
  for (const image of root.getElementsByTagNameNS('*', 'image')) {
    const href = attr(image, 'href')
    if (!href) {
      // Embedded base64 image data.
      const data = child(image, 'binary-data')?.textContent?.replace(/\s+/g, '')
      const mime = data?.startsWith('/9j/') ? 'image/jpeg' : data?.startsWith('R0lG') ? 'image/gif' : 'image/png'
      if (data) images.set(imageKey(image), `data:${mime};base64,${data}`)
      continue
    }
    if (images.has(href)) continue
    if (/^(https?|data):/i.test(href)) {
      images.set(href, href)
      continue
    }
    const path = decodeURIComponent(href.replace(/^\.\//, ''))
    const bytes = await zip.file(path)?.async('uint8array')
    if (bytes) images.set(href, bytesToDataUrl(bytes, mimeFromPath(path)))
  }
}

// ---- Page ----

function pageSettings(layout: Element, header: boolean, footer: boolean): PageSettings {
  const props = child(layout, 'page-layout-properties')
  const width = toCm(attr(props, 'page-width')) * 10
  const height = toCm(attr(props, 'page-height')) * 10
  let size: PageSize = 'A4'
  const [short, long] = [Math.min(width, height), Math.max(width, height)]
  for (const [name, [w, h]] of Object.entries(PAGE_SIZES_MM) as [PageSize, [number, number]][]) {
    if (Math.abs(w - short) <= 3 && Math.abs(h - long) <= 3) size = name
  }
  const orientation = width > height || (width === height && attr(props, 'print-orientation') === 'landscape') ? 'landscape' : 'portrait'
  // ODF margins reach the header/footer; the body starts after its height and spacing.
  const extra = (style: string, gap: string) => {
    const hf = child(child(layout, style), 'header-footer-properties')
    // With dynamic spacing (Word-like, from .docx) the height already includes the gap.
    const spacing = attr(hf, 'dynamic-spacing') === 'true' ? 0 : toCm(attr(hf, gap))
    return (toCm(attr(hf, 'min-height') ?? attr(hf, 'height')) + spacing) * 10
  }
  const mm = (name: string, add = 0) => {
    const value = attr(props, name)
    return value === null && !add ? DEFAULT_PAGE.margins.top : Math.round((toCm(value) * 10 + add) * 10) / 10
  }
  return {
    size,
    orientation,
    margins: {
      top: mm('margin-top', header ? extra('header-style', 'margin-bottom') : 0),
      right: mm('margin-right'),
      bottom: mm('margin-bottom', footer ? extra('footer-style', 'margin-top') : 0),
      left: mm('margin-left'),
    },
  }
}

// ---- Utilities ----

function int(value: string | null): number | null {
  const n = value === null ? NaN : parseInt(value, 10)
  return Number.isFinite(n) ? n : null
}

function kids(el: Element | null, name: string): Element[] {
  return el ? children(el, name) : []
}

// First paragraph or table of the body (it names the master page of the first page).
function firstBlock(el: Element): Element | null {
  for (const c of children(el)) {
    if (c.localName === 'p' || c.localName === 'h' || c.localName === 'table') return c
    if (['list', 'list-item', 'list-header', 'section'].includes(c.localName)) {
      const found = firstBlock(c)
      if (found) return found
    }
  }
  return null
}

function toCm(length: string | null | undefined): number {
  if (!length) return 0
  const value = parseFloat(length)
  if (!Number.isFinite(value)) return 0
  if (length.endsWith('mm')) return value / 10
  if (length.endsWith('cm')) return value
  if (length.endsWith('in')) return value * 2.54
  if (length.endsWith('pt')) return (value / 72) * 2.54
  if (length.endsWith('pc')) return (value / 6) * 2.54
  if (length.endsWith('px')) return value / PX_PER_CM
  return 0
}
