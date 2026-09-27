// Word (.docx) export from the ProseMirror document model, using the `docx` library.

import type { JSONContent } from '@tiptap/core'
import {
  AlignmentType,
  Bookmark,
  BorderStyle,
  CommentRangeEnd,
  CommentRangeStart,
  CommentReference,
  DeletedTextRun,
  Document,
  ExternalHyperlink,
  Footer,
  FootnoteReferenceRun,
  Header,
  HeadingLevel,
  ImageRun,
  ImportedXmlComponent,
  InsertedTextRun,
  LevelFormat,
  LineRuleType,
  Packer,
  PageBreak,
  PageNumber,
  PageOrientation,
  Paragraph,
  SectionType,
  ShadingType,
  Tab,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
  type ICommentOptions,
  type ILevelsOptions,
  type IRunOptions,
  type ParagraphChild,
} from 'docx'
import { DEFAULT_FONT, DEFAULT_FONT_SIZE_PT, HEADING_SIZES_PT, PAGE_SIZES_MM, SUBTITLE_SIZE_PT, TITLE_SIZE_PT, documentSections, langTag, type CommentData, type DocumentData, type Section } from './types'
import { escapeXml } from '../../../core/formats'
import { tocBookmarks, tocHeadingsJSON } from '../editor/toc'
import { citedIdsJSON, idsOf } from '../references/nodes'
import { citationText, formatBibliography, yearSuffixes } from '../references/format'
import { DEFAULT_CITE, type CiteSettings, type Run, type Source } from '../references/types'
import { sourcesXml, sourceTags, WORD_LCID } from './bibliography-xml'
import { loadImage, toHex, toPt, type LoadedImage } from '../../../core/formats'
import { latexToMathML } from '../../../ui/equation'
import { mathmlToOmml } from './math'
import { changeOf, commentMarkers } from './review'
import { chartPng, readEmbedded, type EmbeddedChart } from '../../charts/embedded'
import { addDocxCharts, CHART_MARK } from './docx-charts'

// Custom style ids (the importer recognises them by name) and layout constants.
const TWIPS_PER_INDENT = 720 // 1.27 cm per indent level
const QUOTE_INDENT_TWIPS = 567
const TWIPS_PER_PX = 15
const STYLE = {
  subtitle: 'Subtitle',
  quote: 'Quote',
  code: 'CodeBlock',
  hr: 'HorizontalLine',
  listContinue: 'ListContinue',
  tableHeading: 'TableHeading',
  inlineCode: 'SourceText',
  tableSeparator: 'TableSeparator',
}
const CODE_FONT = 'Courier New'
const TASK_GLYPHS = { checked: '☒', unchecked: '☐' }

const MM_TO_TWIPS = 1440 / 25.4
const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
]
const ALIGN: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
}
const BULLETS = ['•', '◦', '▪']

type Block = Paragraph | Table

interface Context {
  footnotes: Record<string, { children: Paragraph[] }>
  numbering: { reference: string; levels: ILevelsOptions[] }[]
  lists: number
  // Usable width between the margins, in twips.
  contentWidth: number
  // Comment markers: numeric ids of each comment and its replies, placed
  // before the first and after the last inline node the comment covers.
  commentStarts: Map<JSONContent, number[]>
  commentEnds: Map<JSONContent, number[]>
  // Tracked change ids (w:ins / w:del).
  revisions: number
  // Language of the paragraph being written (w:lang of its runs), when it has its own.
  lang?: string
  // Bookmarks on headings listed by a table of contents.
  bookmarks: Map<JSONContent, string>
  body: JSONContent
  // Citations: sources, style, Word tags and year letters.
  sources: Map<string, Source>
  cite: CiteSettings
  tags: Map<string, string>
  suffixes: Map<string, string>
  // Charts written as pictures, turned into native charts afterwards (docx-charts.ts).
  charts: EmbeddedChart[]
}

// Where a block sits: inside a quote, a table header cell, or as extra content of a list item.
interface Scope {
  quote?: boolean
  headerCell?: boolean
  listLevel?: number
  breakBefore?: boolean
}

export async function exportDocx(data: DocumentData): Promise<Blob> {
  const sections = documentSections(data.body, data.page, data.columns)
  const sources = new Map((data.sources ?? []).map((s) => [s.id, s]))
  const cite = data.citeStyle ?? DEFAULT_CITE
  const cited = citedIdsJSON(data.body).map((id) => sources.get(id)).filter((s): s is Source => !!s)
  const ctx: Context = {
    footnotes: {},
    numbering: [listDefinition('bullet', 'bullet', 1), listDefinition('task-checked', 'checked', 1), listDefinition('task-unchecked', 'unchecked', 1)],
    lists: 0,
    contentWidth: contentWidth(sections[0]),
    commentStarts: new Map(),
    commentEnds: new Map(),
    revisions: 0,
    bookmarks: tocBookmarks(data.body),
    body: data.body,
    sources,
    cite,
    tags: sourceTags(data.sources ?? []),
    suffixes: yearSuffixes(cited, cite),
    charts: [],
  }
  const comments = prepareComments(data, ctx)

  // One Word section per document section (section breaks split the body).
  const groups: JSONContent[][] = [[]]
  for (const node of data.body.content ?? []) {
    if (node.type === 'sectionBreak') groups.push([])
    else groups[groups.length - 1].push(node)
  }
  const bodies: Block[][] = []
  for (const [i, group] of groups.entries()) {
    ctx.contentWidth = contentWidth(sections[i])
    const out = await blocks(group, ctx, {})
    // Word expects each section to end with a paragraph, not a table.
    if (!(out[out.length - 1] instanceof Paragraph)) out.push(new Paragraph({}))
    bodies.push(out)
  }
  ctx.contentWidth = contentWidth(sections[0])
  const header = data.header && hasContent(data.header) ? new Header({ children: await cellBlocks(data.header.content ?? [], ctx, {}) }) : null
  const footer = data.footer && hasContent(data.footer) ? new Footer({ children: await cellBlocks(data.footer.content ?? [], ctx, {}) }) : null

  const heading = (size: number) => ({
    run: { bold: true, color: '000000', size: size * 2, font: DEFAULT_FONT },
    paragraph: { spacing: { before: 240, after: 120 }, keepNext: true },
  })
  const doc = new Document({
    title: data.title,
    creator: 'Ofimeo',
    styles: {
      default: {
        document: { run: { font: DEFAULT_FONT, size: DEFAULT_FONT_SIZE_PT * 2, language: data.lang ? { value: data.lang } : undefined }, paragraph: { spacing: { after: 120 } } },
        title: { run: { size: TITLE_SIZE_PT * 2, color: '000000', font: DEFAULT_FONT }, paragraph: { spacing: { after: 120 } } },
        heading1: heading(HEADING_SIZES_PT[0]),
        heading2: heading(HEADING_SIZES_PT[1]),
        heading3: heading(HEADING_SIZES_PT[2]),
        heading4: heading(HEADING_SIZES_PT[3]),
        heading5: heading(HEADING_SIZES_PT[4]),
        heading6: heading(HEADING_SIZES_PT[5]),
        hyperlink: { run: { color: '0563C1', underline: {} } },
      },
      paragraphStyles: [
        {
          id: STYLE.subtitle,
          name: 'Subtitle',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: SUBTITLE_SIZE_PT * 2, color: '595959' },
          paragraph: { spacing: { after: 160 } },
        },
        {
          id: STYLE.quote,
          name: 'Quote',
          basedOn: 'Normal',
          quickFormat: true,
          run: { color: '404040' },
          paragraph: {
            indent: { left: QUOTE_INDENT_TWIPS },
            border: { left: { style: BorderStyle.SINGLE, size: 18, color: 'CCCCCC', space: 8 } },
          },
        },
        {
          id: STYLE.code,
          name: 'Code Block',
          basedOn: 'Normal',
          run: { font: CODE_FONT, size: 20 },
          paragraph: { spacing: { after: 0 }, shading: { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' } },
        },
        {
          id: STYLE.hr,
          name: 'Horizontal Line',
          basedOn: 'Normal',
          next: 'Normal',
          run: { size: 12 },
          paragraph: { border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'A0A0A0', space: 1 } }, spacing: { after: 240 } },
        },
        { id: STYLE.listContinue, name: 'List Continue', basedOn: 'Normal', paragraph: { indent: { left: TWIPS_PER_INDENT } } },
        { id: STYLE.tableHeading, name: 'Table Heading', basedOn: 'Normal', run: { bold: true } },
        { id: 'TOCHeading', name: 'TOC Heading', basedOn: 'Normal', next: 'Normal', run: { bold: true, size: 32 }, paragraph: { spacing: { before: 240, after: 120 } } },
        ...[1, 2, 3, 4, 5, 6].map((level) => ({
          id: `TOC${level}`,
          name: `toc ${level}`,
          basedOn: 'Normal',
          next: 'Normal',
          run: level === 1 ? { bold: true } : undefined,
          paragraph: { indent: { left: (level - 1) * 284 }, spacing: { after: 60 } },
        })),
        { id: 'Bibliography', name: 'Bibliography', basedOn: 'Normal', paragraph: { indent: { left: 720, hanging: 720 }, spacing: { after: 120, line: 360, lineRule: LineRuleType.AUTO } } },
        { id: 'Caption', name: 'caption', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { italics: true, size: 18, color: '44546A' }, paragraph: { alignment: AlignmentType.CENTER, spacing: { after: 200 } } },
        { id: STYLE.tableSeparator, name: 'Table Separator', basedOn: 'Normal', run: { size: 2 }, paragraph: { spacing: { before: 0, after: 0, line: 20, lineRule: LineRuleType.EXACT } } },
      ],
      characterStyles: [{ id: STYLE.inlineCode, name: 'Source Text', basedOn: 'DefaultParagraphFont', run: { font: CODE_FONT } }],
    },
    customProperties: [{ name: 'OfimeoCitationStyle', value: JSON.stringify(cite) }],
    numbering: { config: ctx.numbering },
    footnotes: ctx.footnotes,
    comments: comments.length ? { children: comments } : undefined,
    sections: bodies.map((children, i) => ({
      properties: sectionProperties(sections[i]),
      headers: i === 0 && header ? { default: header } : undefined,
      footers: i === 0 && footer ? { default: footer } : undefined,
      children,
    })),
  })
  let blob = await Packer.toBlob(doc)
  if (ctx.charts.length) blob = await addDocxCharts(blob, ctx.charts)
  if (!data.sources?.length) return blob
  return addBibliographyPart(blob, sourcesXml(data.sources, cite))
}

function contentWidth(section: Section): number {
  const [pw, ph] = PAGE_SIZES_MM[section.page.size] ?? PAGE_SIZES_MM.A4
  const m = section.page.margins
  const width = section.page.orientation === 'landscape' ? ph : pw
  const total = (width - m.left - m.right) * MM_TO_TWIPS
  const n = section.columns.count
  return Math.round(n > 1 ? (total - (n - 1) * section.columns.gap * MM_TO_TWIPS) / n : total)
}

function sectionProperties(section: Section) {
  const [pw, ph] = PAGE_SIZES_MM[section.page.size] ?? PAGE_SIZES_MM.A4
  const landscape = section.page.orientation === 'landscape'
  const m = section.page.margins
  const { columns } = section
  return {
    type: section.start === 'continuous' ? SectionType.CONTINUOUS : SectionType.NEXT_PAGE,
    page: {
      size: { width: Math.round(pw * MM_TO_TWIPS), height: Math.round(ph * MM_TO_TWIPS), orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
      margin: {
        top: Math.round(m.top * MM_TO_TWIPS),
        right: Math.round(m.right * MM_TO_TWIPS),
        bottom: Math.round(m.bottom * MM_TO_TWIPS),
        left: Math.round(m.left * MM_TO_TWIPS),
        header: 709,
        footer: 709,
      },
    },
    column: columns.count > 1 ? { count: columns.count, space: Math.round(columns.gap * MM_TO_TWIPS), separate: columns.separator, equalWidth: true } : undefined,
  }
}

// Adds the Word bibliography part (customXml with b:Sources) to a finished package.
async function addBibliographyPart(blob: Blob, sources: string): Promise<Blob> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const guid = `{${crypto.randomUUID().toUpperCase()}}`
  zip.file('customXml/item1.xml', sources)
  zip.file(
    'customXml/itemProps1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="no"?><ds:datastoreItem ds:itemID="${guid}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"><ds:schemaRefs><ds:schemaRef ds:uri="http://schemas.openxmlformats.org/officeDocument/2006/bibliography"/></ds:schemaRefs></ds:datastoreItem>`,
  )
  zip.file(
    'customXml/_rels/item1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps" Target="itemProps1.xml"/></Relationships>`,
  )
  const relsPath = 'word/_rels/document.xml.rels'
  const rels = (await zip.file(relsPath)?.async('text')) ?? ''
  zip.file(relsPath, rels.replace('</Relationships>', `<Relationship Id="rIdBib1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../customXml/item1.xml"/></Relationships>`))
  let types = (await zip.file('[Content_Types].xml')?.async('text')) ?? ''
  if (!/Extension="xml"/.test(types)) types = types.replace('</Types>', '<Default Extension="xml" ContentType="application/xml"/></Types>')
  types = types.replace('</Types>', '<Override PartName="/customXml/itemProps1.xml" ContentType="application/vnd.openxmlformats-officedocument.customXmlProperties+xml"/></Types>')
  zip.file('[Content_Types].xml', types)
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
}

// ---------- Fields: table of contents, citations, bibliography (raw WordprocessingML) ----------

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

function rawXml(xml: string): ImportedXmlComponent {
  const root = new DOMParser().parseFromString(`<root xmlns:w="${W_NS}">${xml}</root>`, 'application/xml')
  return xmlComponent(root.documentElement.firstElementChild!)
}

const wText = (text: string, italic = false, bold = false) =>
  `<w:r>${italic || bold ? `<w:rPr>${bold ? '<w:b/>' : ''}${italic ? '<w:i/>' : ''}</w:rPr>` : ''}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`
const fldChar = (type: 'begin' | 'separate' | 'end') => `<w:r><w:fldChar w:fldCharType="${type}"/></w:r>`
const instr = (text: string) => `<w:r><w:instrText xml:space="preserve">${escapeXml(text)}</w:instrText></w:r>`
const runsXml = (runs: Run[]) => runs.map((r) => wText(r.text, !!r.italic)).join('')

function tocXml(node: JSONContent, ctx: Context): string {
  const maxLevel = Number(node.attrs?.maxLevel) || 3
  const entries = (node.attrs?.entries ?? []) as { level: number; text: string; page?: number }[]
  const headings = tocHeadingsJSON(ctx.body, maxLevel)
  const tabs = `<w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${ctx.contentWidth}"/></w:tabs>`
  const begin = fldChar('begin') + instr(` TOC \\o "1-${maxLevel}" \\h \\z \\u `) + fldChar('separate')
  const title = node.attrs?.title ? `<w:p><w:pPr><w:pStyle w:val="TOCHeading"/></w:pPr>${wText(String(node.attrs.title))}</w:p>` : ''
  let rows = entries
    .map((e, i) => {
      const anchor = headings[i] ? ctx.bookmarks.get(headings[i]) : undefined
      const page = e.page ? String(e.page) : ''
      const pageXml = anchor ? fldChar('begin') + instr(` PAGEREF ${anchor} \\h `) + fldChar('separate') + wText(page) + fldChar('end') : wText(page)
      let inner = wText(e.text) + '<w:r><w:tab/></w:r>' + pageXml
      if (anchor) inner = `<w:hyperlink w:anchor="${anchor}" w:history="1">${inner}</w:hyperlink>`
      const level = Math.min(9, Math.max(1, e.level))
      return `<w:p><w:pPr><w:pStyle w:val="TOC${level}"/>${tabs}</w:pPr>${i === 0 ? begin : ''}${inner}${i === entries.length - 1 ? fldChar('end') : ''}</w:p>`
    })
    .join('')
  if (!entries.length) rows = `<w:p>${begin}${wText('—')}${fldChar('end')}</w:p>`
  return `<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/><w:docPartUnique/></w:docPartObj></w:sdtPr><w:sdtContent>${title}${rows}</w:sdtContent></w:sdt>`
}

function citationXml(node: JSONContent, ctx: Context): string {
  const ids = idsOf(node.attrs?.ids).filter((id) => ctx.sources.has(id))
  const locator = String(node.attrs?.locator ?? '').trim()
  const text = citationText({ ids, locator }, ctx.sources, ctx.cite, ctx.suffixes)
  if (!ids.length) return wText(text)
  const tags = ids.map((id) => ctx.tags.get(id) ?? id)
  const code = ` CITATION ${tags[0]} \\l ${WORD_LCID[ctx.cite.lang]} ${tags
    .slice(1)
    .map((tag) => `\\m ${tag} `)
    .join('')}${locator ? `\\p ${locator.replace(/\s+/g, '')} ` : ''}`
  return `<w:sdt><w:sdtPr><w:citation/></w:sdtPr><w:sdtContent>${fldChar('begin')}${instr(code)}${fldChar('separate')}${wText(text)}${fldChar('end')}</w:sdtContent></w:sdt>`
}

function bibliographyXml(ctx: Context): string {
  const cited = citedIdsJSON(ctx.body).map((id) => ctx.sources.get(id)).filter((s): s is Source => !!s)
  const entries = formatBibliography(cited, ctx.cite)
  const begin = fldChar('begin') + instr(` BIBLIOGRAPHY \\l ${WORD_LCID[ctx.cite.lang]} `) + fldChar('separate')
  const rows = entries.length
    ? entries.map((e, i) => `<w:p><w:pPr><w:pStyle w:val="Bibliography"/></w:pPr>${i === 0 ? begin : ''}${runsXml(e.runs)}${i === entries.length - 1 ? fldChar('end') : ''}</w:p>`).join('')
    : `<w:p><w:pPr><w:pStyle w:val="Bibliography"/></w:pPr>${begin}${fldChar('end')}</w:p>`
  return `<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Bibliographies"/><w:docPartUnique/></w:docPartObj></w:sdtPr><w:sdtContent>${rows}</w:sdtContent></w:sdt>`
}


// Numbers the comments (replies share their parent's range, as Word does)
// and places their markers.
function prepareComments(data: DocumentData, ctx: Context): ICommentOptions[] {
  const markers = commentMarkers(data)
  const numbers = new Map(markers.placed.map((c, i) => [c.id, i]))
  const ids = (list: CommentData[]) => list.map((c) => numbers.get(c.id)!)
  for (const [node, list] of markers.starts) ctx.commentStarts.set(node, ids(list))
  for (const [node, list] of markers.ends) ctx.commentEnds.set(node, ids(list))
  return markers.placed.map((c) => ({
    id: numbers.get(c.id)!,
    author: c.author,
    initials: initials(c.author),
    date: c.date ? new Date(c.date) : undefined,
    parentId: c.parentId !== undefined ? numbers.get(c.parentId) : undefined,
    resolved: c.resolved || undefined,
    children: c.text.split('\n').map((line) => new Paragraph({ children: [new TextRun(line)] })),
  }))
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join('')
    .slice(0, 3)
}

function hasContent(doc: JSONContent): boolean {
  return (doc.content ?? []).some((n) => n.type !== 'paragraph' || (n.content?.length ?? 0) > 0)
}

// Numbering definition for one list (ordered lists get their own so each restarts).
function listDefinition(reference: string, kind: 'bullet' | 'ordered' | 'checked' | 'unchecked', start: number) {
  const levels: ILevelsOptions[] = Array.from({ length: 9 }, (_, level) => {
    const indent = { left: TWIPS_PER_INDENT * (level + 1), hanging: 360 }
    if (kind === 'ordered') {
      return {
        level,
        start,
        format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][level % 3],
        text: `%${level + 1}.`,
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent } },
      }
    }
    const glyph = kind === 'bullet' ? BULLETS[level % 3] : TASK_GLYPHS[kind]
    return {
      level,
      format: LevelFormat.BULLET,
      text: glyph,
      alignment: AlignmentType.LEFT,
      style: { paragraph: { indent }, run: kind === 'bullet' ? undefined : { font: 'Segoe UI Symbol' } },
    }
  })
  return { reference, levels }
}

async function blocks(nodes: JSONContent[], ctx: Context, scope: Scope): Promise<Block[]> {
  const out: Block[] = []
  let breakBefore = false
  for (const [i, node] of nodes.entries()) {
    // A page break before a paragraph becomes "page break before" on it (no extra empty paragraph).
    const next = nodes[i + 1]?.type
    if (node.type === 'pageBreak' && (next === 'paragraph' || next === 'heading')) {
      breakBefore = true
      continue
    }
    // Adjacent tables would merge into one in Word: keep them apart with a tiny paragraph.
    if (node.type === 'table' && out[out.length - 1] instanceof Table) out.push(new Paragraph({ style: STYLE.tableSeparator }))
    out.push(...(await block(node, ctx, breakBefore ? { ...scope, breakBefore } : scope)))
    breakBefore = false
  }
  return out
}

async function block(node: JSONContent, ctx: Context, scope: Scope): Promise<Block[]> {
  switch (node.type) {
    case 'paragraph':
    case 'heading':
      return [await paragraph(node, ctx, scope)]
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return list(node, ctx, { ...scope, breakBefore: undefined }, scope.listLevel !== undefined ? scope.listLevel + 1 : 0)
    case 'blockquote':
      return blocks(node.content ?? [], ctx, { ...scope, quote: true, breakBefore: undefined })
    case 'codeBlock': {
      const text = (node.content ?? []).map((n) => n.text ?? '').join('')
      const children = text.split('\n').map((line, i) => new TextRun({ children: withTabs(line), break: i > 0 ? 1 : undefined }))
      return [new Paragraph({ style: STYLE.code, children })]
    }
    case 'horizontalRule':
      return [new Paragraph({ style: STYLE.hr })]
    case 'pageBreak':
      return [new Paragraph({ children: [new PageBreak()] })]
    case 'table':
      return [await table(node, ctx)]
    case 'tableOfContents':
      return [rawXml(tocXml(node, ctx)) as unknown as Paragraph]
    case 'bibliography':
      return [rawXml(bibliographyXml(ctx)) as unknown as Paragraph]
    case 'sectionBreak':
      return []
    case 'chart':
      return chartBlocks(node, ctx)
    default:
      // Unknown blocks: keep their inline content if any.
      return node.content ? blocks(node.content, ctx, scope) : []
  }
}

async function list(node: JSONContent, ctx: Context, scope: Scope, level: number): Promise<Block[]> {
  let reference = 'bullet'
  if (node.type === 'orderedList') {
    reference = `ordered-${++ctx.lists}`
    ctx.numbering.push(listDefinition(reference, 'ordered', Math.max(0, Number(node.attrs?.start ?? 1) || 0)))
  }
  const lvl = Math.min(level, 8)
  const out: Block[] = []
  for (const item of node.content ?? []) {
    const ref = item.type === 'taskItem' ? (item.attrs?.checked ? 'task-checked' : 'task-unchecked') : reference
    const content = item.content ?? []
    const first = content[0]?.type === 'paragraph' || content[0]?.type === 'heading' ? content[0] : null
    out.push(await paragraph(first ?? { type: 'paragraph' }, ctx, scope, { reference: ref, level: lvl }))
    for (const child of first ? content.slice(1) : content) {
      if (child.type === 'paragraph') out.push(await paragraph(child, ctx, { ...scope, listLevel: lvl }))
      else out.push(...(await block(child, ctx, { ...scope, listLevel: lvl })))
    }
  }
  return out
}

async function paragraph(node: JSONContent, ctx: Context, scope: Scope, numbering?: { reference: string; level: number }): Promise<Paragraph> {
  const a = node.attrs ?? {}
  const indent = Math.max(0, Math.min(8, Number(a.indent) || 0))
  let style: string | undefined
  let heading: (typeof HeadingLevel)[keyof typeof HeadingLevel] | undefined
  let left: number | undefined
  if (node.type === 'heading') heading = HEADINGS[Math.min(6, Math.max(1, Number(a.level) || 1)) - 1]
  else if (a.styleId === 'title') heading = HeadingLevel.TITLE
  else if (a.styleId === 'subtitle') style = STYLE.subtitle
  else if (numbering) style = undefined
  else if (scope.listLevel !== undefined) {
    style = STYLE.listContinue
    left = TWIPS_PER_INDENT * (scope.listLevel + 1 + indent)
  } else if (scope.quote) style = STYLE.quote
  else if (scope.headerCell) style = STYLE.tableHeading
  if (!numbering && left === undefined && indent) left = (style === STYLE.quote ? QUOTE_INDENT_TWIPS : 0) + TWIPS_PER_INDENT * indent
  const lineHeight = parseFloat(a.lineHeight)
  const outerLang = ctx.lang
  ctx.lang = langTag(a.lang)
  let children = await inlines(node.content ?? [], ctx)
  ctx.lang = outerLang
  const bookmark = ctx.bookmarks.get(node)
  if (bookmark) children = [new Bookmark({ id: bookmark, children })]
  return new Paragraph({
    heading,
    style,
    numbering,
    pageBreakBefore: scope.breakBefore || undefined,
    alignment: a.textAlign ? ALIGN[a.textAlign] : undefined,
    indent: left !== undefined ? { left } : undefined,
    spacing: lineHeight > 0 ? { line: Math.round(lineHeight * 240), lineRule: LineRuleType.AUTO } : undefined,
    children,
  })
}

function withTabs(text: string): (string | Tab)[] {
  const parts: (string | Tab)[] = []
  text.split('\t').forEach((part, i) => {
    if (i > 0) parts.push(new Tab())
    if (part) parts.push(part)
  })
  return parts
}

async function inlines(nodes: JSONContent[], ctx: Context): Promise<ParagraphChild[]> {
  const out: ParagraphChild[] = []
  // Consecutive runs with the same link share one hyperlink element.
  let link: { href: string; runs: ParagraphChild[] } | null = null
  const flush = () => {
    if (link) out.push(new ExternalHyperlink({ link: link.href, children: link.runs }))
    link = null
  }
  for (const node of nodes) {
    const marks = node.marks ?? []
    const href = marks.find((mk) => mk.type === 'link')?.attrs?.href as string | undefined
    const run = await inline(node, ctx)
    const starts = ctx.commentStarts.get(node) ?? []
    const ends = ctx.commentEnds.get(node) ?? []
    const children: ParagraphChild[] = [
      ...starts.map((id) => new CommentRangeStart(id)),
      ...(Array.isArray(run) ? run : run ? [run] : []),
      ...ends.flatMap((id) => [new CommentRangeEnd(id), new TextRun({ children: [new CommentReference(id)] })]),
    ]
    if (!children.length) continue
    if (href) {
      if (link && link.href !== href) flush()
      link ??= { href, runs: [] }
      link.runs.push(...children)
    } else {
      flush()
      out.push(...children)
    }
  }
  flush()
  return out
}

async function inline(node: JSONContent, ctx: Context): Promise<ParagraphChild | ParagraphChild[] | null> {
  const opts = { ...runOptions(node.marks ?? []), ...(ctx.lang ? { language: { value: ctx.lang } } : {}) }
  switch (node.type) {
    case 'text': {
      const children = withTabs(node.text ?? '')
      const change = changeOf(node)
      if (!change) return new TextRun({ ...opts, children })
      const revision = { id: ++ctx.revisions, author: change.author, date: new Date(change.date).toISOString().replace(/\.\d+Z$/, 'Z') }
      return change.kind === 'deletion' ? new DeletedTextRun({ ...opts, children, ...revision }) : new InsertedTextRun({ ...opts, children, ...revision })
    }
    case 'equation':
      return equation(String(node.attrs?.latex ?? ''), !!node.attrs?.display)
    case 'hardBreak':
      return new TextRun({ break: 1 })
    case 'pageNumber':
      return new TextRun({ ...opts, children: [node.attrs?.kind === 'total' ? PageNumber.TOTAL_PAGES : PageNumber.CURRENT] })
    case 'footnote': {
      const id = Object.keys(ctx.footnotes).length + 1
      const text = String(node.attrs?.content ?? '')
      ctx.footnotes[id] = { children: text.split('\n').map((line) => new Paragraph({ children: [new TextRun(line)] })) }
      return new FootnoteReferenceRun(id)
    }
    case 'image':
      return image(node, ctx)
    case 'citation':
      return rawXml(citationXml(node, ctx)) as unknown as ParagraphChild
    case 'mergeField':
    case 'mergeIf':
      return mergeFieldRuns(node, opts)
    default:
      return null
  }
}

// ---------- Mail merge fields (MERGEFIELD, IF) ----------

const fieldArg = (s: unknown) => `"${String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
const raw = (xml: string) => rawXml(xml) as unknown as ParagraphChild

// The field code with its result run formatted like the text around it.
function mergeFieldRuns(node: JSONContent, opts: IRunOptions): ParagraphChild[] {
  const a = node.attrs ?? {}
  const result = (text: string) => new TextRun({ ...opts, text })
  if (node.type === 'mergeField') {
    const name = String(a.name ?? '')
    return [raw(fldChar('begin')), raw(instr(` MERGEFIELD ${fieldArg(name)} \\* MERGEFORMAT `)), raw(fldChar('separate')), result(`«${name}»`), raw(fldChar('end'))]
  }
  const field = String(a.field ?? '')
  return [
    raw(fldChar('begin')),
    raw(instr(' IF ')),
    raw(fldChar('begin')),
    raw(instr(` MERGEFIELD ${fieldArg(field)} `)),
    raw(fldChar('separate')),
    result(`«${field}»`),
    raw(fldChar('end')),
    raw(instr(` ${a.op === '<>' ? '<>' : '='} ${fieldArg(a.value)} ${fieldArg(a.then)} ${fieldArg(a.otherwise)} \\* MERGEFORMAT `)),
    raw(fldChar('separate')),
    result(String(a.then ?? '')),
    raw(fldChar('end')),
  ]
}

// ---------- Charts ----------

// A centered picture of the chart (replaced by a native chart in the package) and its caption.
async function chartBlocks(node: JSONContent, ctx: Context): Promise<Block[]> {
  const a = node.attrs ?? {}
  const chart = readEmbedded(a.chart)
  if (!chart) return []
  const maxWidth = ctx.contentWidth / TWIPS_PER_PX
  let width = Number(a.width) || 480
  let height = Number(a.height) || 300
  if (width > maxWidth) {
    height = (height * maxWidth) / width
    width = maxWidth
  }
  const img = await loadImage(await chartPng(chart, Number(a.width) || 480, Number(a.height) || 300))
  if (!img) return []
  ctx.charts.push(chart)
  const caption = String(a.caption ?? '')
  const out: Block[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      keepNext: !!caption,
      children: [
        new ImageRun({
          type: img.type,
          data: img.data,
          transformation: { width: Math.round(width), height: Math.round(height) },
          altText: { name: `${CHART_MARK}${ctx.charts.length}`, description: chart.spec.title || caption || 'Chart', title: caption || chart.spec.title || 'Chart' },
        }),
      ],
    }),
  ]
  if (caption) out.push(new Paragraph({ style: 'Caption', children: [new TextRun(caption)] }))
  return out
}

function runOptions(marks: JSONContent['marks'] & object): IRunOptions {
  const o: Record<string, unknown> = {}
  for (const mark of marks) {
    const a = mark.attrs ?? {}
    switch (mark.type) {
      case 'bold':
        o.bold = true
        break
      case 'italic':
        o.italics = true
        break
      case 'underline':
        o.underline = {}
        break
      case 'strike':
        o.strike = true
        break
      case 'code':
        o.style = STYLE.inlineCode
        break
      case 'subscript':
        o.subScript = true
        break
      case 'superscript':
        o.superScript = true
        break
      case 'link':
        o.style ??= 'Hyperlink'
        break
      case 'highlight': {
        const fill = toHex(a.color) ?? '#ffff00'
        o.shading = { type: ShadingType.CLEAR, fill: fill.slice(1).toUpperCase(), color: 'auto' }
        break
      }
      case 'textStyle': {
        const color = toHex(a.color)
        if (color) o.color = color.slice(1).toUpperCase()
        if (typeof a.fontFamily === 'string' && a.fontFamily) o.font = a.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '')
        const size = toPt(a.fontSize)
        if (size) o.size = Math.round(size * 2)
        break
      }
    }
  }
  if (o.style === STYLE.inlineCode) delete o.font
  return o as IRunOptions
}

async function image(node: JSONContent, ctx: Context): Promise<ImageRun | null> {
  const a = node.attrs ?? {}
  const img = await loadAnyImage(String(a.src ?? ''))
  if (!img) return null
  let width = Number(a.width) || 0
  let height = Number(a.height) || 0
  if (!width && !height) {
    width = img.width
    height = img.height
    // Shrink oversized images to the text width.
    const max = ctx.contentWidth / TWIPS_PER_PX
    if (width > max) {
      height = (height * max) / width
      width = max
    }
  } else if (!height) height = (width * img.height) / img.width
  else if (!width) width = (height * img.width) / img.height
  return new ImageRun({
    type: img.type,
    data: img.data,
    transformation: { width: Math.round(width), height: Math.round(height) },
    altText: { name: 'Image', description: a.alt ?? undefined, title: a.title ?? undefined },
  })
}

// Office Math (OMML) from the LaTeX source, through KaTeX's MathML.
function equation(latex: string, display: boolean): ParagraphChild | null {
  if (!latex.trim()) return null
  const math = new DOMParser().parseFromString(latexToMathML(latex, display), 'application/xml').documentElement
  let omml = mathmlToOmml(math)
  if (display) omml = `<m:oMathPara>${omml}</m:oMathPara>`
  const root = new DOMParser().parseFromString(`<root xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${omml}</root>`, 'application/xml')
  const el = root.documentElement.firstElementChild
  return el ? (xmlComponent(el) as unknown as ParagraphChild) : null
}

function xmlComponent(el: Element): ImportedXmlComponent {
  const attrs: Record<string, string> = {}
  for (const a of el.attributes) if (a.name !== 'xmlns:m') attrs[a.name] = a.value
  const out = new ImportedXmlComponent(el.tagName, Object.keys(attrs).length ? attrs : undefined)
  for (const child of el.childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE) out.push(xmlComponent(child as Element))
    else if (child.nodeType === Node.TEXT_NODE && child.textContent) out.push(child.textContent)
  }
  return out
}

// Loads PNG/JPEG/GIF/BMP directly; other browser-decodable formats (SVG, WebP) are converted to PNG.
async function loadAnyImage(src: string): Promise<LoadedImage | null> {
  if (!src) return null
  const img = await loadImage(src)
  if (img) return img
  try {
    const el = new Image()
    el.crossOrigin = 'anonymous'
    el.src = src
    await el.decode()
    const canvas = document.createElement('canvas')
    canvas.width = el.naturalWidth || 300
    canvas.height = el.naturalHeight || 150
    canvas.getContext('2d')!.drawImage(el, 0, 0, canvas.width, canvas.height)
    return loadImage(canvas.toDataURL('image/png'))
  } catch {
    return null
  }
}

// Table cells and header/footer bodies must contain at least one paragraph and end with one.
async function cellBlocks(nodes: JSONContent[], ctx: Context, scope: Scope): Promise<Block[]> {
  const out = await blocks(nodes, ctx, scope)
  if (!(out[out.length - 1] instanceof Paragraph)) out.push(new Paragraph({}))
  return out
}

async function table(node: JSONContent, ctx: Context): Promise<Table> {
  const rows = node.content ?? []
  // Place cells on the grid, accounting for cells spanning down from earlier rows.
  const taken: boolean[][] = rows.map(() => [])
  const widths: (number | undefined)[] = []
  let columns = 0
  const placed = rows.map((row, r) => {
    let col = 0
    return (row.content ?? []).map((cell) => {
      while (taken[r][col]) col++
      const colspan = Math.max(1, Number(cell.attrs?.colspan) || 1)
      const rowspan = Math.max(1, Math.min(rows.length - r, Number(cell.attrs?.rowspan) || 1))
      for (let dr = 0; dr < rowspan; dr++) for (let dc = 0; dc < colspan; dc++) taken[r + dr][col + dc] = true
      const cw = cell.attrs?.colwidth
      if (Array.isArray(cw)) cw.forEach((w, i) => w > 0 && (widths[col + i] ??= Math.round(w * TWIPS_PER_PX)))
      const at = { cell, col, colspan, rowspan }
      col += colspan
      columns = Math.max(columns, col)
      return at
    })
  })
  columns = Math.max(columns, ...taken.map((t) => t.length), 1)

  // Unknown widths share the remaining text width; tables without any widths autofit.
  const fixed = widths.some((w) => w)
  const known = widths.reduce<number>((s, w) => s + (w ?? 0), 0)
  const unknown = columns - widths.filter((w) => w).length
  const rest = unknown ? Math.max(600, Math.floor((ctx.contentWidth - known) / unknown)) : 0
  const grid = Array.from({ length: columns }, (_, i) => widths[i] || (fixed ? rest : Math.floor(ctx.contentWidth / columns)))

  const tableRows = await Promise.all(
    placed.map(async (cells) => {
      const built = await Promise.all(
        cells.map(async ({ cell, col, colspan, rowspan }) => {
          const header = cell.type === 'tableHeader'
          const bg = toHex(cell.attrs?.backgroundColor)
          const span = grid.slice(col, col + colspan).reduce((s, w) => s + w, 0)
          return new TableCell({
            children: await cellBlocks(cell.content ?? [], ctx, { headerCell: header }),
            columnSpan: colspan > 1 ? colspan : undefined,
            rowSpan: rowspan > 1 ? rowspan : undefined,
            shading: bg ? { type: ShadingType.CLEAR, fill: bg.slice(1).toUpperCase(), color: 'auto' } : undefined,
            width: fixed ? { size: span, type: WidthType.DXA } : { size: 0, type: WidthType.AUTO },
          })
        }),
      )
      const allHeader = cells.length > 0 && cells.every((c) => c.cell.type === 'tableHeader')
      return new TableRow({ children: built, tableHeader: allHeader || undefined })
    }),
  )
  const total = grid.reduce((s, w) => s + w, 0)
  return new Table({
    rows: tableRows,
    columnWidths: grid,
    width: fixed ? { size: total, type: WidthType.DXA } : { size: 0, type: WidthType.AUTO },
    layout: fixed ? TableLayoutType.FIXED : TableLayoutType.AUTOFIT,
  })
}
