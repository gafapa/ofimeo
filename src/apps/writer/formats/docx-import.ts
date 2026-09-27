// Word (.docx) import: parses WordprocessingML into the ProseMirror document model.

import type { JSONContent } from '@tiptap/core'
import JSZip from 'jszip'
import { DEFAULT_PAGE, PAGE_SIZES_MM, langCode, normalizeColumns, sectionAttrs, type Columns, type CommentData, type ImportedDocument, type PageSettings, type PageSize } from './types'
import { parseSourcesXml } from './bibliography-xml'
import { fromCsl } from '../references/parse'
import { CITE_LANGS, CITE_STYLES, type CiteSettings, type Source } from '../references/types'
import { attr, bytesToDataUrl, child, children, mimeFromPath, parseXml, toHex } from '../../../core/formats'
import { ommlToLatex } from './math'
import { authorColor } from './review'
import { t } from '../../../core/i18n'

const TWIPS_PER_INDENT = 720
const TWIPS_PER_MM = 1440 / 25.4
const EMU_PER_PX = 9525

// Word highlight names (w:highlight) to hex.
const HIGHLIGHT: Record<string, string> = {
  yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', blue: '#0000ff', red: '#ff0000',
  darkBlue: '#000080', darkCyan: '#008080', darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000',
  darkYellow: '#808000', darkGray: '#808080', lightGray: '#c0c0c0', black: '#000000', white: '#ffffff',
}
const MONOSPACE = /^(courier( new)?|consolas|liberation mono|dejavu sans mono|source code pro|menlo|monaco|lucida console|noto (sans )?mono|monospace|cascadia (code|mono)|fira (code|mono)|roboto mono)$/i
const LINK_COLORS = ['#0563c1', '#0000ff', '#000080', '#0000ee', '#467886']
const TASK_UNCHECKED = /[☐]/
const TASK_CHECKED = /[☑☒]/

interface StyleDef {
  name: string
  basedOn?: string
  pPr: Element | null
  rPr: Element | null
}

interface LevelDef {
  format: string
  text: string
  start: number
}

interface NumDef {
  abstractId: string
  starts: Map<number, number>
}

// A package part (document, header, footer, notes) with its relationships.
interface Part {
  path: string
  rels: Map<string, string>
}

interface Context {
  zip: JSZip
  styles: Map<string, StyleDef>
  docDefaults: Element | null
  themeFonts: { major?: string; minor?: string }
  abstracts: Map<string, Map<number, LevelDef>>
  nums: Map<string, NumDef>
  // Running list counters per abstract numbering, and numId:level pairs already used.
  counters: Map<string, number[]>
  usedNums: Set<string>
  notes: Map<string, string>
  images: Map<string, { src: string; width: number; height: number } | null>
  defaultFont?: string
  defaultSize?: number
  // Comments whose range is open at the current point of the document.
  openComments: Set<string>
  // Document language (w:lang of the default run properties).
  lang?: string
  // Section break markers with the sectPr that ends the section before them.
  sections: { node: JSONContent; sectPr: Element }[]
  // Bibliography sources and Word tag → source id.
  sources: Source[]
  tags: Map<string, string>
  // A field spanning paragraphs being skipped (table of contents / bibliography).
  fieldBlock: { kind: 'toc' | 'bib'; depth: number; paragraphs: Element[]; instr: string } | null
  // A chart that ended the previous paragraph: a caption paragraph right after it becomes its caption.
  lastChart?: JSONContent | null
}

// Tracked change around the runs being read (w:ins / w:del).
interface Revision {
  kind: 'insertion' | 'deletion'
  id: string
  author: string
  time: number
}

type Kind = 'heading' | 'title' | 'subtitle' | 'quote' | 'code' | 'hr' | 'listContinue' | 'tableHeading' | 'separator' | 'caption' | null

// A converted paragraph (or table) before lists, quotes and code blocks are assembled.
interface Item {
  node: JSONContent
  // group: abstract numbering; restart: numbering restarted by a num override.
  list?: { kind: 'bullet' | 'ordered' | 'task'; level: number; group: string; restart: boolean; value: number; checked: boolean }
  // List continuation paragraph at this list level.
  cont?: number
  quote?: boolean
  code?: boolean
}

interface RunProps {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  sub?: boolean
  sup?: boolean
  color?: string
  highlight?: string
  font?: string
  size?: number
  code?: boolean
}

export async function importDocx(file: ArrayBuffer): Promise<ImportedDocument> {
  const zip = await JSZip.loadAsync(file)
  const read = async (path: string) => (await zip.file(path)?.async('text')) ?? null
  const documentXml = await read('word/document.xml')
  if (!documentXml) throw new Error(t('Not a Word document'))

  const stylesRoot = xmlRoot(await read('word/styles.xml'))
  const ctx: Context = {
    zip,
    styles: parseStyles(stylesRoot),
    docDefaults: stylesRoot?.getElementsByTagNameNS('*', 'docDefaults')[0] ?? null,
    themeFonts: parseTheme(xmlRoot(await read('word/theme/theme1.xml'))),
    abstracts: new Map(),
    nums: new Map(),
    counters: new Map(),
    usedNums: new Set(),
    notes: new Map(),
    images: new Map(),
    openComments: new Set(),
    sections: [],
    sources: [],
    tags: new Map(),
    fieldBlock: null,
  }
  // Word's bibliography sources live in a customXml part.
  for (const path of Object.keys(zip.files).filter((f) => /^customXml\/item\d+\.xml$/.test(f))) {
    const root = xmlRoot(await read(path))
    if (root?.localName === 'Sources') {
      const parsed = parseSourcesXml(root)
      ctx.sources.push(...parsed.sources)
      parsed.tags.forEach((id, tag) => ctx.tags.set(tag.toLowerCase(), id))
    }
  }
  parseNumbering(xmlRoot(await read('word/numbering.xml')), ctx)
  parseNotes(xmlRoot(await read('word/footnotes.xml')), 'footnote', ctx)
  parseNotes(xmlRoot(await read('word/endnotes.xml')), 'endnote', ctx)
  const defaults = resolveRun([rPrOf(ctx.docDefaults), ...chain('Normal', ctx).map((s) => s.rPr).reverse()], ctx)
  ctx.defaultFont = defaults.font
  ctx.defaultSize = defaults.size
  ctx.lang = [rPrOf(ctx.docDefaults), ...chain('Normal', ctx).map((s) => s.rPr)].map(langOf).find(Boolean) ?? undefined

  const docPart: Part = { path: 'word/document.xml', rels: await readRels(zip, 'word/document.xml') }
  const body = child(parseXml(documentXml).documentElement, 'body')
  const content = body ? await blockContent(body, ctx, docPart) : []

  // Sections: the first sectPr gives the document page setup; each break takes the next one.
  const sectPr = child(body, 'sectPr') ?? [...(body?.getElementsByTagNameNS('*', 'sectPr') ?? [])].pop() ?? null
  const sectPrs = [...ctx.sections.map((s) => s.sectPr), ...(sectPr ? [sectPr] : [])]
  ctx.sections.forEach((marker, i) => {
    const next = sectPrs[i + 1] ?? null
    marker.node.attrs = sectionAttrs({
      start: attr(child(next, 'type'), 'val') === 'continuous' ? 'continuous' : 'nextPage',
      page: pageSettings(next),
      columns: columnsOf(next),
    })
  })
  const first = sectPrs[0] ?? null
  // Header and footer: the first section that defines them.
  const withHeader = sectPrs.find((s) => children(s, 'headerReference').length) ?? first
  const withFooter = sectPrs.find((s) => children(s, 'footerReference').length) ?? first
  return {
    body: { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] },
    header: await headerFooter(withHeader, 'headerReference', docPart, ctx),
    footer: await headerFooter(withFooter, 'footerReference', docPart, ctx),
    page: pageSettings(first),
    columns: columnsOf(first),
    lang: ctx.lang,
    comments: parseComments(xmlRoot(await read('word/comments.xml')), xmlRoot(await read('word/commentsExtended.xml'))),
    sources: ctx.sources,
    citeStyle: citeStyleOf(xmlRoot(await read('docProps/custom.xml')), xmlRoot(ctx.sources.length ? await firstSourcesXml(zip) : null)),
  }
}

async function firstSourcesXml(zip: JSZip): Promise<string | null> {
  for (const path of Object.keys(zip.files).filter((f) => /^customXml\/item\d+\.xml$/.test(f))) {
    const xml = await zip.file(path)!.async('text')
    if (/<(\w+:)?Sources\b/.test(xml)) return xml
  }
  return null
}

// Citation style: our custom property, else Word's selected bibliography style.
function citeStyleOf(custom: Element | null, sources: Element | null): CiteSettings | undefined {
  for (const prop of custom ? [...custom.getElementsByTagNameNS('*', 'property')] : []) {
    if (attr(prop, 'name') !== 'OfimeoCitationStyle') continue
    try {
      const v = JSON.parse(prop.textContent ?? '')
      if (CITE_STYLES.includes(v.style) && CITE_LANGS.includes(v.lang)) return v
    } catch {
      // Ignored.
    }
  }
  const name = (sources?.getAttribute('StyleName') ?? '').toLowerCase()
  const style = CITE_STYLES.find((s) => name.startsWith(s))
  return style ? { style, lang: 'en' } : undefined
}

function columnsOf(sectPr: Element | null): Columns {
  const cols = child(sectPr, 'cols')
  const count = Number(attr(cols, 'num')) || (cols ? children(cols, 'col').length : 0) || 1
  const space = Number(attr(cols, 'space'))
  return normalizeColumns({ count, gap: Number.isFinite(space) && attr(cols, 'space') !== null ? Math.round((space / TWIPS_PER_MM) * 10) / 10 : 12.5, separator: ['1', 'true', 'on'].includes(attr(cols, 'sep') ?? '') })
}

// Comments; replies and resolved state come from commentsExtended (Word 2013+).
function parseComments(root: Element | null, extended: Element | null): CommentData[] {
  if (!root) return []
  const byPara = new Map<string, { parent: string | null; done: boolean }>()
  for (const ex of extended ? [...extended.getElementsByTagNameNS('*', 'commentEx')] : []) {
    const para = attrAny(ex, 'paraId')
    if (para) byPara.set(para, { parent: attrAny(ex, 'paraIdParent'), done: attrAny(ex, 'done') === '1' })
  }
  const paraToComment = new Map<string, string>()
  const out: (CommentData & { para?: string })[] = []
  for (const c of children(root, 'comment')) {
    const id = attr(c, 'id')
    if (id === null) continue
    const paragraphs = children(c, 'p')
    const para = paragraphs.length ? attrAny(paragraphs[paragraphs.length - 1], 'paraId') : null
    if (para) paraToComment.set(para, id)
    const date = Date.parse(attr(c, 'date') ?? '')
    out.push({ id, author: attr(c, 'author') ?? '', date: Number.isFinite(date) ? date : 0, text: paragraphs.map((p) => plainText(p)).join('\n').trim(), para: para ?? undefined })
  }
  for (const c of out) {
    const ex = c.para ? byPara.get(c.para) : undefined
    if (ex?.done) c.resolved = true
    const parent = ex?.parent ? paraToComment.get(ex.parent) : undefined
    if (parent && parent !== c.id) c.parentId = parent
    delete c.para
  }
  return out
}

// Attribute by local name, whatever its namespace prefix (w14:paraId, w15:done…).
function attrAny(el: Element, name: string): string | null {
  for (const a of el.attributes) if (a.localName === name) return a.value
  return null
}

function xmlRoot(xml: string | null): Element | null {
  return xml ? parseXml(xml).documentElement : null
}

async function readRels(zip: JSZip, partPath: string): Promise<Map<string, string>> {
  const dir = partPath.slice(0, partPath.lastIndexOf('/') + 1)
  const name = partPath.slice(dir.length)
  const rels = new Map<string, string>()
  const root = xmlRoot((await zip.file(`${dir}_rels/${name}.rels`)?.async('text')) ?? null)
  if (!root) return rels
  for (const r of children(root, 'Relationship')) {
    const target = attr(r, 'Target') ?? ''
    const external = attr(r, 'TargetMode') === 'External'
    rels.set(attr(r, 'Id') ?? '', external || /^[a-z]+:/i.test(target) ? target : resolvePath(dir, target))
  }
  return rels
}

function resolvePath(dir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = (dir + target).split('/')
  const out: string[] = []
  for (const p of parts) {
    if (p === '..') out.pop()
    else if (p !== '.') out.push(p)
  }
  return out.join('/')
}

async function headerFooter(sectPr: Element | null, refName: string, docPart: Part, ctx: Context): Promise<JSONContent | null> {
  if (!sectPr) return null
  const ref = children(sectPr, refName).find((r) => (attr(r, 'type') ?? 'default') === 'default')
  const path = ref ? docPart.rels.get(attr(ref, 'id') ?? '') : undefined
  const xml = path ? await ctx.zip.file(path)?.async('text') : undefined
  if (!path || !xml) return null
  const part: Part = { path, rels: await readRels(ctx.zip, path) }
  const content = await blockContent(parseXml(xml).documentElement, ctx, part)
  const empty = content.every((n) => n.type === 'paragraph' && !n.content?.length)
  return empty ? null : { type: 'doc', content }
}

function pageSettings(sectPr: Element | null): PageSettings {
  const pgSz = child(sectPr, 'pgSz')
  const pgMar = child(sectPr, 'pgMar')
  if (!pgSz && !pgMar) return structuredClone(DEFAULT_PAGE)
  const w = Number(attr(pgSz, 'w')) / TWIPS_PER_MM
  const h = Number(attr(pgSz, 'h')) / TWIPS_PER_MM
  let size: PageSize = DEFAULT_PAGE.size
  let orientation: PageSettings['orientation'] = 'portrait'
  if (w > 0 && h > 0) {
    const [short, long] = [Math.min(w, h), Math.max(w, h)]
    let best = Infinity
    for (const [name, [pw, ph]] of Object.entries(PAGE_SIZES_MM) as [PageSize, [number, number]][]) {
      const diff = Math.max(Math.abs(pw - short), Math.abs(ph - long))
      if (diff <= 3 && diff < best) {
        best = diff
        size = name
      }
    }
    orientation = attr(pgSz, 'orient') === 'landscape' || w > h ? 'landscape' : 'portrait'
  }
  const mm = (name: string, fallback: number) => {
    const v = Number(attr(pgMar, name))
    return pgMar && Number.isFinite(v) && attr(pgMar, name) !== null ? Math.round((Math.abs(v) / TWIPS_PER_MM) * 10) / 10 : fallback
  }
  const d = DEFAULT_PAGE.margins
  return {
    size,
    orientation,
    margins: { top: mm('top', d.top), right: mm('right', d.right), bottom: mm('bottom', d.bottom), left: mm('left', d.left) },
  }
}

// ---- Styles, numbering, notes ----

function parseStyles(root: Element | null): Map<string, StyleDef> {
  const styles = new Map<string, StyleDef>()
  if (!root) return styles
  for (const s of children(root, 'style')) {
    const id = attr(s, 'styleId')
    if (!id) continue
    styles.set(id, {
      name: (attr(child(s, 'name'), 'val') ?? id).toLowerCase(),
      basedOn: attr(child(s, 'basedOn'), 'val') ?? undefined,
      pPr: child(s, 'pPr'),
      rPr: child(s, 'rPr'),
    })
  }
  return styles
}

function parseTheme(root: Element | null): Context['themeFonts'] {
  if (!root) return {}
  const latin = (name: string) => {
    const font = root.getElementsByTagNameNS('*', name)[0]
    return attr(child(font, 'latin'), 'typeface') || undefined
  }
  return { major: latin('majorFont'), minor: latin('minorFont') }
}

function parseNumbering(root: Element | null, ctx: Context) {
  if (!root) return
  for (const a of children(root, 'abstractNum')) {
    const levels = new Map<number, LevelDef>()
    for (const lvl of children(a, 'lvl')) {
      levels.set(Number(attr(lvl, 'ilvl')), {
        format: attr(child(lvl, 'numFmt'), 'val') ?? 'decimal',
        text: attr(child(lvl, 'lvlText'), 'val') ?? '',
        start: Number(attr(child(lvl, 'start'), 'val') ?? 1),
      })
    }
    ctx.abstracts.set(attr(a, 'abstractNumId') ?? '', levels)
  }
  for (const num of children(root, 'num')) {
    const starts = new Map<number, number>()
    for (const o of children(num, 'lvlOverride')) {
      const start = attr(child(o, 'startOverride'), 'val')
      if (start !== null) starts.set(Number(attr(o, 'ilvl') ?? 0), Number(start))
      // A full level redefinition inside the override also sets the start.
      const lvlStart = attr(child(child(o, 'lvl'), 'start'), 'val')
      if (start === null && lvlStart !== null) starts.set(Number(attr(o, 'ilvl') ?? 0), Number(lvlStart))
    }
    ctx.nums.set(attr(num, 'numId') ?? '', { abstractId: attr(child(num, 'abstractNumId'), 'val') ?? '', starts })
  }
}

function parseNotes(root: Element | null, kind: string, ctx: Context) {
  if (!root) return
  for (const note of children(root, kind)) {
    const type = attr(note, 'type')
    if (type && type !== 'normal') continue
    const text = children(note, 'p').map((p) => plainText(p).trim())
    ctx.notes.set(`${kind}:${attr(note, 'id')}`, text.join('\n').trim())
  }
}

function plainText(el: Element): string {
  let out = ''
  for (const c of children(el)) {
    switch (c.localName) {
      case 't':
        out += c.textContent ?? ''
        break
      case 'tab':
        out += '\t'
        break
      case 'br':
      case 'cr':
        out += '\n'
        break
      case 'del':
      case 'instrText':
      case 'footnoteRef':
      case 'endnoteRef':
        break
      default:
        out += plainText(c)
    }
  }
  return out
}

function chain(styleId: string | null, ctx: Context): StyleDef[] {
  const out: StyleDef[] = []
  let id: string | undefined = styleId ?? undefined
  while (id && out.length < 12) {
    const style = ctx.styles.get(id)
    if (!style || out.includes(style)) break
    out.push(style)
    id = style.basedOn
  }
  return out
}

function langOf(rPr: Element | null | undefined): string | null {
  return attr(child(rPr ?? null, 'lang'), 'val')
}

function rPrOf(docDefaults: Element | null): Element | null {
  return child(child(docDefaults, 'rPrDefault'), 'rPr')
}

// ---- Blocks ----

async function blockContent(parent: Element, ctx: Context, part: Part): Promise<JSONContent[]> {
  const items: Item[] = []
  await collectBlocks(parent, ctx, part, items)
  const content = assemble(items)
  // Word requires a paragraph after a trailing table; it is not content.
  const last = content[content.length - 1]
  if (content[content.length - 2]?.type === 'table' && last.type === 'paragraph' && !last.content && !last.attrs) content.pop()
  return content
}

async function collectBlocks(parent: Element, ctx: Context, part: Part, items: Item[]) {
  for (const el of children(parent)) {
    // Paragraphs of a table of contents or bibliography field become one node.
    if (el.localName === 'p' && (ctx.fieldBlock || fieldBlockStart(el))) {
      const block = (ctx.fieldBlock ??= { ...fieldBlockStart(el)!, depth: 0, paragraphs: [] })
      block.paragraphs.push(el)
      block.depth += fieldBalance(el)
      if (block.depth <= 0) {
        ctx.fieldBlock = null
        items.push(...(await fieldBlockItems(block.kind, block.paragraphs, block.instr, ctx, part)))
      }
      continue
    }
    switch (el.localName) {
      case 'p':
        items.push(...(await paragraph(el, ctx, part)))
        // A paragraph with section properties ends a section.
        if (child(child(el, 'pPr'), 'sectPr') && part.path === 'word/document.xml') {
          const node: JSONContent = { type: 'sectionBreak' }
          ctx.sections.push({ node, sectPr: child(child(el, 'pPr'), 'sectPr')! })
          // Word keeps the section mark in an otherwise empty paragraph: drop that paragraph.
          const last = items[items.length - 1]
          if (last && last.node.type === 'paragraph' && !last.node.content?.length && !last.list) items.pop()
          items.push({ node })
        }
        break
      case 'tbl': {
        const node = await table(el, ctx, part)
        // A page break before a table may be stored in its first cell (LibreOffice).
        const first = node.content?.[0]?.content?.[0]
        if (first?.content?.[0]?.type === 'pageBreak' && first.content.length > 1) {
          first.content.shift()
          items.push({ node: { type: 'pageBreak' } })
        }
        items.push({ node })
        break
      }
      case 'sdt': {
        const gallery = attr(child(child(child(el, 'sdtPr'), 'docPartObj'), 'docPartGallery'), 'val') ?? ''
        const content = child(el, 'sdtContent') ?? el
        const paragraphs = [...content.getElementsByTagNameNS('*', 'p')]
        if (/table of contents/i.test(gallery) && !ctx.fieldBlock) {
          const instr = paragraphs.map(instrOf).join(' ')
          items.push(...(await fieldBlockItems('toc', paragraphs, instr, ctx, part)))
        } else if (/bibliograph/i.test(gallery) && !ctx.fieldBlock) {
          items.push(...(await fieldBlockItems('bib', paragraphs, '', ctx, part)))
        } else await collectBlocks(content, ctx, part, items)
        break
      }
      case 'customXml':
      case 'ins':
        await collectBlocks(el, ctx, part, items)
        break
      case 'commentRangeStart':
        ctx.openComments.add(attr(el, 'id') ?? '')
        break
      case 'commentRangeEnd':
        ctx.openComments.delete(attr(el, 'id') ?? '')
        break
    }
  }
}

// ---- Fields spanning paragraphs: table of contents and bibliography ----

function instrOf(p: Element): string {
  return [...p.getElementsByTagNameNS('*', 'instrText')].map((i) => i.textContent ?? '').join('')
}

// Field begins minus field ends in a paragraph.
function fieldBalance(p: Element): number {
  let n = 0
  for (const f of p.getElementsByTagNameNS('*', 'fldChar')) {
    const type = attr(f, 'fldCharType')
    if (type === 'begin') n++
    else if (type === 'end') n--
  }
  return n
}

function fieldBlockStart(p: Element): { kind: 'toc' | 'bib'; instr: string } | null {
  const instr = instrOf(p)
  if (!instr || fieldBalance(p) <= 0) return null
  if (/^\s*TOC\b/.test(instr)) return { kind: 'toc', instr }
  if (/^\s*(BIBLIOGRAPHY\b|ADDIN\s+(ZOTERO_BIBL|Mendeley Bibliography|CSL_BIBLIOGRAPHY))/i.test(instr)) return { kind: 'bib', instr }
  return null
}

async function fieldBlockItems(kind: 'toc' | 'bib', paragraphs: Element[], instr: string, ctx: Context, part: Part): Promise<Item[]> {
  if (kind === 'bib') {
    // Headings inside the bibliography block (its title) are kept.
    const out: Item[] = []
    for (const p of paragraphs) {
      const style = chain(attr(child(child(p, 'pPr'), 'pStyle'), 'val'), ctx)
      if (styleKind(style, child(p, 'pPr')).kind === 'heading') out.push(...(await paragraph(p, ctx, part)))
    }
    out.push({ node: { type: 'bibliography' } })
    return out
  }
  const range = /\\o\s+"?(\d)-(\d)"?/.exec(instr)
  const maxLevel = range ? Math.min(6, Math.max(1, Number(range[2]))) : 3
  let title = ''
  const entries: { level: number; text: string; page?: number }[] = []
  for (const p of paragraphs) {
    const name = chain(attr(child(child(p, 'pPr'), 'pStyle'), 'val'), ctx)[0]?.name ?? ''
    const text = plainText(p).replace(/\n/g, ' ')
    const level = /^(?:toc|contents)\s*(\d)$/.exec(name)
    if (!level) {
      if (!entries.length && text.trim() && !title) title = text.trim()
      continue
    }
    const tab = text.lastIndexOf('\t')
    const label = (tab >= 0 ? text.slice(0, tab) : text).replace(/\t/g, ' ').trim()
    const page = tab >= 0 ? Number(text.slice(tab + 1).trim()) : NaN
    if (label) entries.push({ level: Number(level[1]), text: label, ...(Number.isFinite(page) && page > 0 ? { page } : {}) })
  }
  return [{ node: { type: 'tableOfContents', attrs: { maxLevel, title, entries } } }]
}

// Builds nested lists, blockquotes and code blocks from the flat paragraph sequence.
function assemble(items: Item[]): JSONContent[] {
  const out: JSONContent[] = []
  const stack: { node: JSONContent; kind: string; group: string }[] = []
  let prev: Item | null = null
  for (const item of items) {
    if (item.list) {
      const { kind, group, restart } = item.list
      const level = Math.min(item.list.level, stack.length)
      stack.length = Math.min(stack.length, level + 1)
      const top = stack[level]
      if (top && (top.kind !== kind || (kind === 'ordered' && (top.group !== group || restart)))) stack.length = level
      if (stack.length === level) {
        const type = kind === 'bullet' ? 'bulletList' : kind === 'ordered' ? 'orderedList' : 'taskList'
        const node: JSONContent = { type, content: [] }
        if (kind === 'ordered') node.attrs = { start: item.list.value }
        if (level === 0) out.push(node)
        else lastItem(stack[level - 1].node).content!.push(node)
        stack.push({ node, kind, group })
      }
      const para = item.node.type === 'heading' ? { ...item.node, type: 'paragraph', attrs: withoutLevel(item.node.attrs) } : item.node
      stack[level].node.content!.push(
        kind === 'task' ? { type: 'taskItem', attrs: { checked: item.list.checked }, content: [para] } : { type: 'listItem', content: [para] },
      )
    } else if (item.cont !== undefined && stack.length) {
      const level = Math.min(item.cont, stack.length - 1)
      stack.length = level + 1
      lastItem(stack[level].node).content!.push(item.node)
    } else {
      stack.length = 0
      const last = out[out.length - 1]
      if (item.quote) {
        if (prev?.quote && last?.type === 'blockquote') last.content!.push(item.node)
        else out.push({ type: 'blockquote', content: [item.node] })
      } else if (item.code && prev?.code && last?.type === 'codeBlock') {
        const text = item.node.content?.[0]?.text ?? ''
        const lastText = last.content?.[0]
        if (lastText) lastText.text += '\n' + text
        else last.content = [{ type: 'text', text: '\n' + text }]
      } else out.push(item.node)
    }
    prev = item
  }
  // Code blocks may have been merged from empty lines: drop empty text nodes.
  for (const node of out) if (node.type === 'codeBlock' && node.content?.[0]?.text === '') delete node.content
  return out
}

function lastItem(list: JSONContent): JSONContent {
  return list.content![list.content!.length - 1]
}

function withoutLevel(attrs: JSONContent['attrs']): JSONContent['attrs'] {
  if (!attrs) return undefined
  const { level: _level, ...rest } = attrs
  return Object.keys(rest).length ? rest : undefined
}

function styleKind(styles: StyleDef[], pPr: Element | null): { kind: Kind; level?: number } {
  for (const s of styles) {
    const heading = /^heading\s*(\d)$/.exec(s.name)
    if (heading) return { kind: 'heading', level: Math.min(6, Math.max(1, Number(heading[1]))) }
    if (s.name === 'title') return { kind: 'title' }
    if (s.name === 'subtitle') return { kind: 'subtitle' }
    if (/quot/.test(s.name)) return { kind: 'quote' }
    if (/^(code( block)?|source code|preformatted text|html preformatted)$/.test(s.name)) return { kind: 'code' }
    if (/^horizontal line$/.test(s.name)) return { kind: 'hr' }
    if (/^list continue/.test(s.name)) return { kind: 'listContinue' }
    if (/^table heading$/.test(s.name)) return { kind: 'tableHeading' }
    if (s.name === 'table separator') return { kind: 'separator' }
    if (s.name === 'caption') return { kind: 'caption' }
  }
  const outline = attr(child(pPr, 'outlineLvl'), 'val')
  if (outline !== null && Number(outline) < 6) return { kind: 'heading', level: Number(outline) + 1 }
  return { kind: null }
}

async function paragraph(p: Element, ctx: Context, part: Part): Promise<Item[]> {
  const pPr = child(p, 'pPr')
  const styleId = attr(child(pPr, 'pStyle'), 'val') ?? (ctx.styles.has('Normal') ? 'Normal' : null)
  const styles = chain(styleId, ctx)
  const pPrs = [pPr, ...styles.map((s) => s.pPr)]
  const { kind, level } = styleKind(styles, pPr)
  // Our exporter's spacer between adjacent tables.
  if (kind === 'separator') return []
  const lastChart = ctx.lastChart
  ctx.lastChart = null

  // Run formatting inherited from the paragraph style; headings and named styles bring their own look.
  const plainStyle = kind === null || kind === 'listContinue'
  const baseRPrs = plainStyle ? [rPrOf(ctx.docDefaults), ...styles.map((s) => s.rPr).reverse()] : []
  const segments = await runs(p, ctx, part, baseRPrs, kind === 'code')
  // A caption right under a chart.
  if (kind === 'caption' && lastChart && !lastChart.attrs?.caption && segments.length === 1) {
    const text = segments[0].map((n) => n.text ?? '').join('').trim()
    if (text && segments[0].every((n) => n.type === 'text')) {
      lastChart.attrs = { ...lastChart.attrs, caption: text }
      return []
    }
  }
  const items: Item[] = []
  if (attr(child(pPr, 'pageBreakBefore'), 'val') !== 'false' && child(pPr, 'pageBreakBefore')) items.push({ node: { type: 'pageBreak' } })

  // Paragraph attributes.
  const attrs: Record<string, unknown> = {}
  const jc = firstAttr(pPrs, 'jc', 'val')
  if (jc === 'center') attrs.textAlign = 'center'
  else if (jc === 'right' || jc === 'end') attrs.textAlign = 'right'
  else if (jc === 'both' || jc === 'distribute') attrs.textAlign = 'justify'
  const spacing = child(pPr, 'spacing')
  const line = Number(attr(spacing, 'line'))
  const rule = attr(spacing, 'lineRule') ?? 'auto'
  if (line > 0 && rule === 'auto') attrs.lineHeight = String(Math.round((line / 240) * 100) / 100)
  // Language of the paragraph (its mark, first run or style) when it differs from the document's.
  const firstRun = [...p.getElementsByTagNameNS('*', 'r')].find((r) => child(r, 't'))
  const lang = langCode([child(pPr, 'rPr'), child(firstRun ?? null, 'rPr'), ...styles.map((s) => s.rPr)].map(langOf).find(Boolean))
  if (lang && lang !== langCode(ctx.lang)) attrs.lang = lang

  // Lists: numbering from direct formatting or the paragraph style.
  const numId = firstAttr(pPrs, 'numPr', 'numId', 'numId')
  const numLevel = Math.min(8, Number(firstAttr(pPrs, 'numPr', 'ilvl', 'ilvl') ?? 0))
  const list = kind !== 'quote' && kind !== 'code' && numId && numId !== '0' ? listInfo(numId, numLevel, ctx) : undefined

  const left = Number(attr(child(pPr, 'ind'), 'left') ?? attr(child(pPr, 'ind'), 'start') ?? (plainStyle ? firstAttr(pPrs, 'ind', 'left') : null) ?? 0)
  let cont: number | undefined
  if (!list) {
    if (kind === 'listContinue') {
      cont = Math.max(0, Math.round(left / TWIPS_PER_INDENT) - 1)
    } else {
      const base = kind === 'quote' ? Number(firstAttr(styles.map((s) => s.pPr), 'ind', 'left') ?? 0) : 0
      const indent = Math.round((left - base) / TWIPS_PER_INDENT)
      if (indent > 0) attrs.indent = Math.min(indent, 8)
    }
  }

  const hasBreaks = segments.length > 1
  segments.forEach((content, i) => {
    if (i > 0) items.push({ node: { type: 'pageBreak' } })
    if (hasBreaks && !content.length) return
    const hr = segments.hr || (kind === 'hr' || (!kind && child(pPr, 'pBdr') && child(child(pPr, 'pBdr'), 'bottom') && !list)) && !content.length
    if (hr) {
      items.push({ node: { type: 'horizontalRule' } })
      return
    }
    if (kind === 'code') {
      const text = content.map((n) => (n.type === 'hardBreak' ? '\n' : (n.text ?? ''))).join('')
      items.push({ node: { type: 'codeBlock', attrs: { language: null }, content: text ? [{ type: 'text', text }] : undefined }, code: true })
      return
    }
    // Charts are blocks: the paragraph is split around them.
    if (content.some((n) => n.type === 'chart')) {
      let run: JSONContent[] = []
      const flush = () => {
        if (run.length) items.push({ node: { type: 'paragraph', ...(Object.keys(attrs).length ? { attrs: { ...attrs } } : {}), content: run } })
        run = []
      }
      for (const n of content) {
        if (n.type !== 'chart') run.push(n)
        else {
          flush()
          const { marks: _marks, ...chart } = n
          void _marks
          items.push({ node: chart })
          ctx.lastChart = chart
        }
      }
      if (run.some((n) => n.type !== 'text' || n.text?.trim())) {
        flush()
        ctx.lastChart = null
      }
      return
    }
    const node: JSONContent = { type: 'paragraph' }
    if (kind === 'heading') {
      node.type = 'heading'
      node.attrs = { level, ...attrs }
    } else {
      if (kind === 'title' || kind === 'subtitle') attrs.styleId = kind
      if (Object.keys(attrs).length) node.attrs = attrs
    }
    if (content.length) node.content = content
    const item: Item = { node }
    if (list && i === 0) {
      item.list = list
    } else if (cont !== undefined) item.cont = cont
    if (kind === 'quote') item.quote = true
    items.push(item)
  })
  if (list && !items.some((i) => i.list)) {
    // The numbered paragraph only held a page break: keep the list item.
    items.push({ node: { type: 'paragraph' }, list })
  }
  return items
}

function listInfo(numId: string, level: number, ctx: Context): Item['list'] {
  const num = ctx.nums.get(numId)
  const def = num ? ctx.abstracts.get(num.abstractId)?.get(level) : undefined
  if (!num || def?.format === 'none') return undefined
  const format = def?.format ?? 'bullet'
  let kind: 'bullet' | 'ordered' | 'task' = format === 'bullet' ? 'bullet' : 'ordered'
  const text = def?.text ?? ''
  if (kind === 'bullet' && (TASK_CHECKED.test(text) || TASK_UNCHECKED.test(text))) kind = 'task'

  // Word numbering: counters are per abstract definition; a num override restarts them.
  const counters = ctx.counters.get(num.abstractId) ?? []
  ctx.counters.set(num.abstractId, counters)
  const key = `${numId}:${level}`
  const restart = !ctx.usedNums.has(key) && num.starts.has(level)
  const value = restart ? num.starts.get(level)! : counters[level] !== undefined ? counters[level] + 1 : (def?.start ?? 1)
  ctx.usedNums.add(key)
  counters[level] = value
  counters.length = level + 1
  return { kind, level, group: num.abstractId, restart, value, checked: TASK_CHECKED.test(text) }
}

function firstAttr(elements: (Element | null)[], childName: string, attrName: string, nested?: string): string | null {
  for (const el of elements) {
    const c = child(el, childName)
    const value = nested ? attr(child(c, nested), 'val') : attr(c, attrName)
    if (value !== null) return value
  }
  return null
}

// ---- Runs ----

interface Field {
  instr: string
  result: boolean
  // PAGE / NUMPAGES fields become page number nodes and hide their cached result.
  page?: 'page' | 'total' | null
  link?: string
  // CITATION / Zotero / Mendeley fields become citation nodes (cached result hidden).
  cite?: JSONContent | null
}

type Segments = JSONContent[][] & { hr?: boolean }

// Collects inline content; page breaks split it into segments.
async function runs(p: Element, ctx: Context, part: Part, baseRPrs: (Element | null)[], plain: boolean): Promise<Segments> {
  const segments: Segments = [[]]
  const fields: Field[] = []
  let revision: Revision | null = null
  const push = (node: JSONContent) => {
    // Review marks: open comment ranges and the tracked change around this run.
    if (node.type !== 'hardBreak') {
      const extra: NonNullable<JSONContent['marks']> = [...ctx.openComments].map((id) => ({ type: 'commentRange', attrs: { id } }))
      if (revision) {
        const { kind, id, author, time } = revision
        extra.push({ type: kind, attrs: { id, author, authorId: `import:${author}`, color: authorColor(author), time } })
      }
      if (extra.length) node.marks = [...(node.marks ?? []), ...extra]
    }
    const seg = segments[segments.length - 1]
    const last = seg[seg.length - 1]
    if (node.type === 'text' && last?.type === 'text' && JSON.stringify(last.marks ?? []) === JSON.stringify(node.marks ?? [])) {
      last.text += node.text!
    } else seg.push(node)
  }
  const hidden = () => fields.some((f) => !f.result || f.page || f.cite)
  let styledField: JSONContent | null = null
  const fieldLink = () => [...fields].reverse().find((f) => f.link)?.link

  const walk = async (parent: Element, link: string | undefined) => {
    for (const el of children(parent)) {
      switch (el.localName) {
        case 'r':
          await run(el, link ?? fieldLink())
          break
        case 'hyperlink': {
          const id = attr(el, 'id')
          const anchor = attr(el, 'anchor')
          await walk(el, (id && part.rels.get(id)) || (anchor ? `#${anchor}` : link))
          break
        }
        case 'fldSimple': {
          const f = parseField(attr(el, 'instr') ?? '', ctx)
          if (f.cite) {
            if (!hidden()) push(f.cite.type?.startsWith('merge') ? withMarks(f.cite, runMarks(child(child(el, 'r'), 'rPr'))) : f.cite)
          } else if (f.page) {
            if (!hidden()) push(withMarks({ type: 'pageNumber', attrs: { kind: f.page } }, runMarks(child(child(el, 'r'), 'rPr'))))
          } else await walk(el, f.link ?? link)
          break
        }
        case 'ins':
        case 'del':
        case 'moveTo':
        case 'moveFrom': {
          const outer = revision
          const date = Date.parse(attr(el, 'date') ?? '')
          const kind = el.localName === 'ins' || el.localName === 'moveTo' ? 'insertion' : 'deletion'
          revision = { kind, id: `w${attr(el, 'id') ?? Math.random()}`, author: attr(el, 'author') ?? '', time: Number.isFinite(date) ? date : 0 }
          await walk(el, link)
          revision = outer
          break
        }
        case 'smartTag':
        case 'customXml':
          await walk(el, link)
          break
        case 'sdt':
          await walk(child(el, 'sdtContent') ?? el, link)
          break
        case 'commentRangeStart':
          ctx.openComments.add(attr(el, 'id') ?? '')
          break
        case 'commentRangeEnd':
          ctx.openComments.delete(attr(el, 'id') ?? '')
          break
        case 'oMath':
          push({ type: 'equation', attrs: { latex: ommlToLatex(el), display: false } })
          break
        case 'oMathPara':
          for (const math of children(el, 'oMath')) push({ type: 'equation', attrs: { latex: ommlToLatex(math), display: true } })
          break
      }
    }
  }

  const runMarks = (rPr: Element | null, link?: string) => marks(runProps(rPr, baseRPrs, ctx, !!link), link)

  const run = async (r: Element, link: string | undefined) => {
    const rPr = child(r, 'rPr')
    const m = plain ? undefined : runMarks(rPr, link)
    for (const el of children(r)) {
      switch (el.localName) {
        case 'fldChar': {
          const type = attr(el, 'fldCharType')
          if (type === 'begin') fields.push({ instr: '', result: false })
          else if (type === 'separate' || type === 'end') {
            const f = fields[fields.length - 1]
            if (f && !f.result) {
              Object.assign(f, parseField(f.instr, ctx), { result: true })
              // A merge field inside the code of an IF field becomes part of that code.
              const outer = fields[fields.length - 2]
              if (outer && !outer.result && f.cite?.type === 'mergeField') {
                outer.instr += ` {MERGEFIELD:${f.cite.attrs?.name}} `
                f.cite = null
              }
              const outerHidden = fields.slice(0, -1).some((o) => !o.result || o.page || o.cite)
              if (f.page && !outerHidden) push(withMarks({ type: 'pageNumber', attrs: { kind: f.page } }, m))
              if (f.cite && !outerHidden) push(f.cite)
              // Merge fields take the formatting of their (hidden) result.
              if (f.cite && !outerHidden && f.cite.type?.startsWith('merge')) styledField = f.cite
            }
            if (type === 'end') fields.pop()
            if (type === 'end') styledField = null
          }
          break
        }
        case 'instrText':
          if (fields.length) fields[fields.length - 1].instr += el.textContent ?? ''
          break
        default:
          if (!hidden()) await runChild(el, m)
          else if (styledField && el.localName === 't' && m?.length && !styledField.marks) styledField.marks = m
      }
    }
  }

  const runChild = async (el: Element, m: JSONContent['marks']) => {
    switch (el.localName) {
      case 't':
      case 'delText':
        if (el.textContent) push(withMarks({ type: 'text', text: el.textContent }, m))
        break
      case 'tab':
      case 'ptab':
        push(withMarks({ type: 'text', text: '\t' }, m))
        break
      case 'noBreakHyphen':
        push(withMarks({ type: 'text', text: '‑' }, m))
        break
      case 'sym': {
        const code = parseInt(attr(el, 'char') ?? '', 16)
        // Private-use symbol font codes cannot be mapped reliably.
        if (code && (code < 0xf000 || code > 0xf0ff)) push(withMarks({ type: 'text', text: String.fromCharCode(code) }, m))
        break
      }
      case 'br':
      case 'cr':
        if (attr(el, 'type') === 'page') segments.push([])
        else push({ type: 'hardBreak' })
        break
      case 'footnoteReference':
      case 'endnoteReference': {
        const kind = el.localName === 'footnoteReference' ? 'footnote' : 'endnote'
        const content = ctx.notes.get(`${kind}:${attr(el, 'id')}`)
        if (content !== undefined) push({ type: 'footnote', attrs: { content } })
        break
      }
      case 'drawing':
      case 'pict':
      case 'object': {
        if ([...el.getElementsByTagNameNS('*', 'rect'), ...el.getElementsByTagNameNS('*', 'line')].some((x) => attr(x, 'hr') === 't')) {
          segments.hr = true
          break
        }
        const chart = await chartFrame(el, ctx, part)
        if (chart) {
          push(chart)
          break
        }
        const img = await image(el, ctx, part)
        if (img) push(img)
        break
      }
      case 'AlternateContent': {
        const choice = child(el, 'Choice') ?? child(el, 'Fallback')
        if (choice) for (const c of children(choice)) await runChild(c, m)
        break
      }
    }
  }

  await walk(p, undefined)
  return segments
}

function parseField(instr: string, ctx: Context): { page: 'page' | 'total' | null; link?: string; cite?: JSONContent | null } {
  const words = instr.trim().split(/\s+/)
  const name = words[0]?.toUpperCase()
  if (name === 'CITATION') return { page: null, cite: wordCitation((instr.trim().match(/"[^"]*"|\S+/g) ?? []).slice(1).map((w) => w.replace(/^"|"$/g, '')), ctx) }
  if (name === 'ADDIN' && /CSL_CITATION/.test(instr)) return { page: null, cite: cslCitation(instr, ctx) }
  if (name === 'MERGEFIELD') {
    const field = fieldArgs(instr)[1]
    if (field) return { page: null, cite: { type: 'mergeField', attrs: { name: field } } }
  }
  if (name === 'IF') {
    // IF {MERGEFIELD:name} = "value" "then" "else" (the merge field was read as part of the code).
    const args = fieldArgs(instr).slice(1)
    const field = /^\{MERGEFIELD:(.*)\}$/.exec(args[0] ?? '')?.[1]
    if (field !== undefined && (args[1] === '=' || args[1] === '<>')) {
      return { page: null, cite: { type: 'mergeIf', attrs: { field, op: args[1], value: args[2] ?? '', then: args[3] ?? '', otherwise: args[4] && !args[4].startsWith('\\') ? args[4] : '' } } }
    }
  }
  if (name === 'PAGE') return { page: 'page' }
  if (name === 'NUMPAGES' || name === 'SECTIONPAGES') return { page: 'total' }
  if (name === 'HYPERLINK') {
    const m = /HYPERLINK\s+(?:\\l\s+)?"([^"]*)"/i.exec(instr)
    const isAnchor = /\\l/.test(instr)
    if (m) return { page: null, link: isAnchor ? `#${m[1]}` : m[1] }
  }
  return { page: null }
}

// Words of a field code; quoted arguments lose their quotes (\" inside them is a quote).
function fieldArgs(instr: string): string[] {
  const out: string[] = []
  for (const m of instr.matchAll(/"((?:[^"\\]|\\.)*)"|\{MERGEFIELD:[^}]*\}|(\S+)/g)) {
    out.push(m[1] !== undefined ? m[1].replace(/\\(.)/g, '$1') : m[0])
  }
  return out
}

// CITATION Tag1 \l 1033 \m Tag2 \p 23 (Word's own citations).
function wordCitation(args: string[], ctx: Context): JSONContent | null {
  const ids: string[] = []
  let locator = ''
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '\\l' || a === '\\f' || a === '\\s' || a === '\\v') i++
    else if (a === '\\m') ids.push(args[++i] ?? '')
    else if (a === '\\p') locator = (args[++i] ?? '').replace(/^"|"$/g, '')
    else if (!a.startsWith('\\') && !ids.length) ids.push(a)
  }
  const found = ids.map((tag) => ctx.tags.get(tag.toLowerCase())).filter((id): id is string => !!id)
  return found.length ? { type: 'citation', attrs: { ids: found, locator } } : null
}

// Zotero / Mendeley: ADDIN ZOTERO_ITEM CSL_CITATION {json with the sources}.
function cslCitation(instr: string, ctx: Context): JSONContent | null {
  const start = instr.indexOf('{')
  if (start < 0) return null
  try {
    const json = JSON.parse(instr.slice(start, instr.lastIndexOf('}') + 1))
    const ids: string[] = []
    let locator = ''
    for (const item of json.citationItems ?? []) {
      const key = String(item.uris?.[0] ?? item.uri?.[0] ?? item.id ?? '')
      let id = key ? ctx.tags.get(`csl:${key}`) : undefined
      if (!id) {
        const source = fromCsl(item.itemData ?? {})
        if (!source) continue
        source.id += ctx.sources.length
        ctx.sources.push(source)
        id = source.id
        if (key) ctx.tags.set(`csl:${key}`, id)
      }
      ids.push(id)
      if (item.locator) locator = String(item.locator)
    }
    return ids.length ? { type: 'citation', attrs: { ids, locator } } : null
  } catch {
    return null
  }
}

function withMarks(node: JSONContent, marks: JSONContent['marks']): JSONContent {
  if (marks?.length) node.marks = marks
  return node
}

// Resolves run formatting: document defaults, paragraph style, character style, then direct formatting.
function runProps(rPr: Element | null, baseRPrs: (Element | null)[], ctx: Context, inLink: boolean): RunProps {
  const charStyles = chain(attr(child(rPr, 'rStyle'), 'val'), ctx)
  const charProps = resolveRun(charStyles.map((s) => s.rPr).reverse(), ctx)
  if (inLink) {
    // Hyperlink character styles bring the usual blue underline: implied by the link.
    delete charProps.color
    delete charProps.underline
  }
  const props: RunProps = { ...resolveRun(baseRPrs, ctx), ...defined(charProps), ...defined(resolveRun([rPr], ctx)) }
  if (charStyles.some((s) => /source text|code|verbatim/.test(s.name)) || (props.font && MONOSPACE.test(props.font))) {
    props.code = true
    delete props.font
  }
  if (inLink) {
    delete props.underline
    if (props.color && LINK_COLORS.includes(props.color)) delete props.color
  }
  if (props.font && ctx.defaultFont && props.font.toLowerCase() === ctx.defaultFont.toLowerCase()) delete props.font
  if (props.size && props.size === ctx.defaultSize) delete props.size
  return props
}

function defined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>
}

// Later elements override earlier ones.
function resolveRun(rPrs: (Element | null)[], ctx: Context): RunProps {
  const out: RunProps = {}
  for (const rPr of rPrs) {
    if (!rPr) continue
    for (const el of children(rPr)) {
      const val = attr(el, 'val')
      const on = val === null || !['0', 'false', 'off', 'none'].includes(val)
      switch (el.localName) {
        case 'b':
          out.bold = on
          break
        case 'i':
          out.italic = on
          break
        case 'u':
          out.underline = on
          break
        case 'strike':
        case 'dstrike':
          out.strike = on
          break
        case 'color':
          out.color = val && val !== 'auto' ? toHex(`#${val}`) : undefined
          break
        case 'highlight':
          out.highlight = val ? HIGHLIGHT[val] : undefined
          break
        case 'shd': {
          const fill = attr(el, 'fill')
          if (fill && fill !== 'auto') out.highlight = toHex(`#${fill}`)
          break
        }
        case 'sz':
          if (Number(val) > 0) out.size = Number(val) / 2
          break
        case 'rFonts': {
          const theme = attr(el, 'asciiTheme') ?? attr(el, 'hAnsiTheme')
          const font = attr(el, 'ascii') ?? attr(el, 'hAnsi') ?? (theme ? ctx.themeFonts[theme.startsWith('major') ? 'major' : 'minor'] : null)
          if (font) out.font = font
          break
        }
        case 'vertAlign':
          out.sup = val === 'superscript'
          out.sub = val === 'subscript'
          break
      }
    }
  }
  return out
}

function marks(p: RunProps, link: string | undefined): JSONContent['marks'] {
  const out: NonNullable<JSONContent['marks']> = []
  if (p.bold) out.push({ type: 'bold' })
  if (p.code) out.push({ type: 'code' })
  if (p.italic) out.push({ type: 'italic' })
  if (link) out.push({ type: 'link', attrs: { href: link } })
  if (p.strike) out.push({ type: 'strike' })
  if (p.underline) out.push({ type: 'underline' })
  const style: Record<string, string> = {}
  if (p.color && p.color !== '#000000') style.color = p.color
  if (p.font) style.fontFamily = p.font
  if (p.size) style.fontSize = `${p.size}pt`
  if (Object.keys(style).length) out.push({ type: 'textStyle', attrs: style })
  if (p.highlight) out.push({ type: 'highlight', attrs: { color: p.highlight } })
  if (p.sub) out.push({ type: 'subscript' })
  if (p.sup) out.push({ type: 'superscript' })
  return out
}

async function image(el: Element, ctx: Context, part: Part): Promise<JSONContent | null> {
  const blip = el.getElementsByTagNameNS('*', 'blip')[0] ?? el.getElementsByTagNameNS('*', 'imagedata')[0]
  const id = attr(blip, 'embed') ?? attr(blip, 'link') ?? attr(blip, 'id')
  if (!id) return null
  const key = `${part.path}#${id}`
  if (!ctx.images.has(key)) ctx.images.set(key, await loadImagePart(part.rels.get(id), ctx))
  const img = ctx.images.get(key)
  if (!img) return null

  const docPr = el.getElementsByTagNameNS('*', 'docPr')[0]
  const extent = el.getElementsByTagNameNS('*', 'extent')[0]
  let width: number | null = null
  let height: number | null = null
  if (extent) {
    width = Math.round(Number(attr(extent, 'cx')) / EMU_PER_PX) || null
    height = Math.round(Number(attr(extent, 'cy')) / EMU_PER_PX) || null
  } else {
    // VML images: size from the shape style (pt).
    const style = attr(el.getElementsByTagNameNS('*', 'shape')[0], 'style') ?? ''
    const w = /width:\s*([\d.]+)pt/.exec(style)
    const h = /height:\s*([\d.]+)pt/.exec(style)
    if (w && h) {
      width = Math.round((Number(w[1]) * 4) / 3)
      height = Math.round((Number(h[1]) * 4) / 3)
    }
  }
  // The natural size needs no explicit dimensions.
  if (width && height && Math.abs(width - img.width) <= 1 && Math.abs(height - img.height) <= 1) width = height = null
  const attrs: Record<string, unknown> = { src: img.src }
  const alt = attr(docPr, 'descr')
  const title = attr(docPr, 'title')
  if (alt) attrs.alt = alt
  if (title) attrs.title = title
  if (width) attrs.width = width
  if (height) attrs.height = height
  return { type: 'image', attrs }
}

// A native chart (c:chart in the drawing) → chart node with the drawing's size.
async function chartFrame(el: Element, ctx: Context, part: Part): Promise<JSONContent | null> {
  const ref = [...el.getElementsByTagNameNS('*', 'chart')].find((c) => c.namespaceURI?.endsWith('/drawingml/2006/chart'))
  const id = attr(ref, 'id')
  const target = id ? part.rels.get(id) : undefined
  const xml = target ? await ctx.zip.file(target)?.async('string') : undefined
  if (!xml) return null
  const { readChartPart } = await import('./docx-charts')
  const chart = readChartPart(xml)
  if (!chart) return null
  const extent = el.getElementsByTagNameNS('*', 'extent')[0]
  const width = Math.round(Number(attr(extent, 'cx')) / EMU_PER_PX) || 480
  const height = Math.round(Number(attr(extent, 'cy')) / EMU_PER_PX) || 300
  return { type: 'chart', attrs: { chart: JSON.stringify(chart), width, height, caption: '' } }
}

async function loadImagePart(target: string | undefined, ctx: Context): Promise<{ src: string; width: number; height: number } | null> {
  if (!target) return null
  if (/^https?:/.test(target)) return { src: target, width: 0, height: 0 }
  const bytes = await ctx.zip.file(target)?.async('uint8array')
  if (!bytes) return null
  const mime = mimeFromPath(target)
  let width = 0
  let height = 0
  try {
    const bitmap = await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }))
    width = bitmap.width
    height = bitmap.height
    bitmap.close()
  } catch {
    // Formats the browser cannot decode (EMF/WMF) keep their explicit size.
  }
  return { src: bytesToDataUrl(bytes, mime), width, height }
}

// ---- Tables ----

async function table(tbl: Element, ctx: Context, part: Part): Promise<JSONContent> {
  const grid = children(child(tbl, 'tblGrid') ?? tbl, 'gridCol').map((g) => Number(attr(g, 'w')) || 0)
  const rows: JSONContent[] = []
  // Cell currently open for vertical merging, per grid column.
  const open: (JSONContent | undefined)[] = []
  for (const tr of rowsOf(tbl)) {
    const trPr = child(tr, 'trPr')
    const headerRow = !!child(trPr, 'tblHeader') && attr(child(trPr, 'tblHeader'), 'val') !== 'false' && attr(child(trPr, 'tblHeader'), 'val') !== '0'
    let col = Number(attr(child(trPr, 'gridBefore'), 'val') ?? 0)
    const cells: JSONContent[] = []
    for (const tc of cellsOf(tr)) {
      const tcPr = child(tc, 'tcPr')
      const span = Math.max(1, Number(attr(child(tcPr, 'gridSpan'), 'val') ?? 1))
      const vMerge = child(tcPr, 'vMerge')
      const merge = vMerge ? (attr(vMerge, 'val') ?? 'continue') : null
      if (merge === 'continue' && open[col]) {
        open[col]!.attrs!.rowspan++
        col += span
        continue
      }
      const content = await blockContent(tc, ctx, part)
      const paragraphs = children(tc, 'p')
      const headingCell =
        paragraphs.length > 0 &&
        paragraphs.every((p) => /^table heading$/.test(chain(attr(child(child(p, 'pPr'), 'pStyle'), 'val'), ctx)[0]?.name ?? ''))
      const tcW = child(tcPr, 'tcW')
      const wType = attr(tcW, 'type') ?? 'dxa'
      let colwidth: number[] | null = null
      if (wType === 'dxa' && grid.length >= col + span && grid.slice(col, col + span).every((w) => w > 0)) {
        colwidth = grid.slice(col, col + span).map((w) => Math.round(w / 15))
      } else if (wType === 'dxa' && Number(attr(tcW, 'w')) > 0) {
        colwidth = Array(span).fill(Math.round(Number(attr(tcW, 'w')) / 15 / span))
      }
      const fill = attr(child(tcPr, 'shd'), 'fill')
      const cell: JSONContent = {
        type: headerRow || headingCell ? 'tableHeader' : 'tableCell',
        attrs: {
          colspan: span,
          rowspan: 1,
          colwidth,
          backgroundColor: fill && fill !== 'auto' ? (toHex(`#${fill}`) ?? null) : null,
        },
        content: content.length ? content : [{ type: 'paragraph' }],
      }
      for (let i = 0; i < span; i++) open[col + i] = merge === 'restart' ? cell : undefined
      cells.push(cell)
      col += span
    }
    rows.push({ type: 'tableRow', content: cells })
  }
  return { type: 'table', content: rows }
}

function rowsOf(tbl: Element): Element[] {
  return children(tbl).flatMap((el) =>
    el.localName === 'tr' ? [el] : el.localName === 'sdt' || el.localName === 'customXml' ? rowsOf(child(el, 'sdtContent') ?? el) : [],
  )
}

function cellsOf(tr: Element): Element[] {
  return children(tr).flatMap((el) =>
    el.localName === 'tc' ? [el] : el.localName === 'sdt' || el.localName === 'customXml' ? cellsOf(child(el, 'sdtContent') ?? el) : [],
  )
}
