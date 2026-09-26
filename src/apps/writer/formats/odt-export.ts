// OpenDocument Text (.odt) export from ProseMirror JSON.

import JSZip from 'jszip'
import type { JSONContent } from '@tiptap/core'
import {
  DEFAULT_FONT,
  DEFAULT_FONT_SIZE_PT,
  HEADING_SIZES_PT,
  SUBTITLE_SIZE_PT,
  TITLE_SIZE_PT,
  pageDimensionsMm,
  langTag,
  documentSections,
  samePageSize,
  type DocumentData,
  type PageSettings,
  type Section,
} from './types'
import { tocBookmarks, tocHeadingsJSON } from '../editor/toc'
import { citedIdsJSON, idsOf } from '../references/nodes'
import { citationParts, citationText, formatBibliography, yearSuffixes } from '../references/format'
import { DEFAULT_CITE, type CiteSettings, type Run, type Source, type SourceType } from '../references/types'
import { escapeXml, loadImage, toHex, toPt } from '../../../core/formats'
import { latexToMathML } from '../../../ui/equation'
import { changeOf, commentMarkers, type CommentMarkers } from './review'
import type { CommentData } from './types'

const NS = [
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
  'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"',
  'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"',
  'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
  'xmlns:xlink="http://www.w3.org/1999/xlink"',
  'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"',
  'xmlns:dc="http://purl.org/dc/elements/1.1/"',
  'xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"',
  'xmlns:loext="urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0"',
].join(' ')

const INDENT_CM = 1.27
const QUOTE_MARGIN_CM = 0.5
const PX_PER_CM = 96 / 2.54
const MONO_FONT = 'Liberation Mono'
// Distance from the page edge to the header/footer, and gap between it and the body (mm).
const HEADER_DISTANCE_MM = 12.5
const HEADER_GAP_MM = 5

// State shared by the content.xml and styles.xml writers.
interface Shared {
  pictures: Map<string, { data: Uint8Array; mime: string }>
  fonts: Set<string>
  tables: number
  notes: number
  frames: number
  // Text area width, for tables without explicit column widths.
  contentWidthCm: number
  comments: CommentMarkers
  // Tracked changes (text:changed-region elements).
  changes: string[]
  // Formula objects: folder name → MathML.
  formulas: Map<string, string>
  body: JSONContent
  bookmarks: Map<JSONContent, string>
  indexes: number
  sources: Map<string, Source>
  cite: CiteSettings
  suffixes: Map<string, string>
  // Source id → bibliography mark identifier.
  markIds: Map<string, string>
}

interface Ctx {
  // Parent paragraph style for plain paragraphs in this context.
  parent: string
  inList?: boolean
  // Tables can't live inside ODF list items; they are moved right after the outermost list.
  hoisted?: string[]
  // Master page for the first paragraph of a section that starts a new page.
  master?: { name: string; used: boolean }
}

export async function exportOdt(data: DocumentData): Promise<Blob> {
  const { width } = pageDimensionsMm(data.page)
  const sources = new Map((data.sources ?? []).map((src) => [src.id, src]))
  const cite = data.citeStyle ?? DEFAULT_CITE
  const cited = citedIdsJSON(data.body).map((id) => sources.get(id)).filter((src): src is Source => !!src)
  const shared: Shared = {
    pictures: new Map(),
    fonts: new Set([DEFAULT_FONT, MONO_FONT]),
    tables: 0,
    notes: 0,
    frames: 0,
    contentWidthCm: (width - data.page.margins.left - data.page.margins.right) / 10,
    comments: commentMarkers(data),
    changes: [],
    formulas: new Map(),
    body: data.body,
    bookmarks: tocBookmarks(data.body),
    indexes: 0,
    sources,
    cite,
    suffixes: yearSuffixes(cited, cite),
    markIds: new Map(),
  }
  // Body styles go to content.xml; header/footer styles to styles.xml (prefixed to keep names apart).
  const bodyStyles = new AutoStyles('')
  // Sections: a new page layout starts with a master page on the section's first
  // paragraph; text columns wrap the section in a text:section.
  const sections = documentSections(data.body, data.page, data.columns)
  const groups: JSONContent[][] = [[]]
  for (const node of data.body.content ?? []) {
    if (node.type === 'sectionBreak') groups.push([])
    else groups[groups.length - 1].push(node)
  }
  const masters: { name: string; page: PageSettings }[] = [{ name: 'Standard', page: data.page }]
  const bodyWriter = new Writer(bodyStyles, shared)
  let body = ''
  let currentPage = data.page
  for (const [i, group] of groups.entries()) {
    const section = sections[i]
    let master: Ctx['master']
    if (i > 0 && (section.start === 'nextPage' || !samePageSize(section.page, currentPage))) {
      let m = masters.find((x) => JSON.stringify(x.page) === JSON.stringify(section.page))
      if (!m) masters.push((m = { name: `MP${masters.length + 1}`, page: section.page }))
      master = { name: m.name, used: false }
      currentPage = section.page
    }
    let xml = ''
    const first = group[0]
    if (master && (!first || (first.type !== 'paragraph' && first.type !== 'heading'))) {
      xml += `<text:p text:style-name="${bodyStyles.paragraph('Standard', [], '', master.name)}"/>`
      master.used = true
    }
    xml += await bodyWriter.blocks(group, { parent: 'Standard', master })
    body += section.columns.count > 1 ? `<text:section text:style-name="${bodyStyles.add('section', 'Sect', null, columnsXml(section))}" text:name="Section${i + 1}">${xml}</text:section>` : xml
  }
  const masterStyles = new AutoStyles('M')
  const master = new Writer(masterStyles, shared)
  const header = hasContent(data.header) ? await master.blocks(data.header!.content ?? [], { parent: 'Header' }) : null
  const footer = hasContent(data.footer) ? await master.blocks(data.footer!.content ?? [], { parent: 'Footer' }) : null

  const zip = new JSZip()
  // The mimetype entry must be first and uncompressed.
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' })
  zip.file(
    'content.xml',
    `<?xml version="1.0" encoding="UTF-8"?>` +
      `<office:document-content ${NS} office:version="1.3">${fontDecls(shared.fonts)}` +
      `<office:automatic-styles>${bodyStyles.xml()}</office:automatic-styles>` +
      `<office:body><office:text>${trackedChanges(shared.changes)}${body || '<text:p text:style-name="Standard"/>'}</office:text></office:body></office:document-content>`,
  )
  zip.file('styles.xml', stylesXml(masters, masterStyles, shared.fonts, header, footer, shared.contentWidthCm).replace(DEFAULT_LANGUAGE, languageProps(data.lang) || DEFAULT_LANGUAGE))
  zip.file('meta.xml', metaXml(data.title, data.sources?.length ? { OfimeoSources: JSON.stringify(data.sources), OfimeoCitationStyle: JSON.stringify(cite), OfimeoMarks: JSON.stringify(Object.fromEntries([...shared.markIds].map(([id, label]) => [label, id]))) } : {}))
  shared.pictures.forEach((pic, name) => zip.file(`Pictures/${name}`, pic.data))
  shared.formulas.forEach((mathml, name) => zip.file(`${name}/content.xml`, `<?xml version="1.0" encoding="UTF-8"?>${mathml}`))
  zip.file('META-INF/manifest.xml', manifestXml(shared.pictures, shared.formulas))
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.oasis.opendocument.text' })
}

function hasContent(doc: JSONContent | null): boolean {
  return !!doc?.content?.some((n) => n.type !== 'paragraph' || n.content?.length)
}

// Registry of automatic styles for one XML part; identical styles are shared.
class AutoStyles {
  private names = new Map<string, string>()
  private styles: string[] = []
  private counters = new Map<string, number>()
  private lists = new Set<ListKind>()

  constructor(private prefix: string) {}

  add(family: string, letter: string, parent: string | null, inner: string, attrs = ''): string {
    const key = `${family}|${parent}|${inner}|${attrs}`
    let name = this.names.get(key)
    if (!name) {
      const n = (this.counters.get(letter) ?? 0) + 1
      this.counters.set(letter, n)
      name = `${this.prefix}${letter}${n}`
      this.names.set(key, name)
      const parentAttr = parent ? ` style:parent-style-name="${parent}"` : ''
      this.styles.push(`<style:style style:name="${name}" style:family="${family}"${parentAttr}${attrs}>${inner}</style:style>`)
    }
    return name
  }

  paragraph(parent: string, props: string[], text = '', master?: string): string {
    if (!props.length && !text && !master) return parent
    const attrs = master ? ` style:master-page-name="${master}"` : ''
    return this.add('paragraph', 'P', parent, (props.length ? `<style:paragraph-properties ${props.join(' ')}/>` : '') + (text ? `<style:text-properties ${text}/>` : ''), attrs)
  }

  list(kind: ListKind): string {
    this.lists.add(kind)
    return `${this.prefix}${LIST_STYLE_NAMES[kind]}`
  }

  xml(): string {
    return this.styles.join('') + [...this.lists].map((kind) => listStyleXml(`${this.prefix}${LIST_STYLE_NAMES[kind]}`, kind)).join('')
  }
}

type ListKind = 'bullet' | 'ordered' | 'task'
const LIST_STYLE_NAMES: Record<ListKind, string> = { bullet: 'LB', ordered: 'LN', task: 'LT' }

class Writer {
  constructor(
    private styles: AutoStyles,
    private shared: Shared,
  ) {}

  async blocks(nodes: JSONContent[], ctx: Ctx): Promise<string> {
    let out = ''
    let breakBefore = false
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      if (node.type === 'pageBreak') {
        // Merged into the next non-empty paragraph, or written as an empty paragraph with the break.
        const next = nodes[i + 1]
        if (next && (next.type === 'paragraph' || next.type === 'heading') && next.content?.length) breakBefore = true
        else out += `<text:p text:style-name="${this.styles.paragraph('Standard', ['fo:break-before="page"'])}"/>`
        continue
      }
      out += await this.block(node, ctx, breakBefore)
      breakBefore = false
    }
    return out
  }

  private async block(node: JSONContent, ctx: Ctx, breakBefore: boolean, prefix = ''): Promise<string> {
    const a = node.attrs ?? {}
    switch (node.type) {
      case 'paragraph':
      case 'heading': {
        const heading = node.type === 'heading'
        const level = Math.min(Math.max(Number(a.level) || 1, 1), 6)
        const parent = heading
          ? `Heading_20_${level}`
          : a.styleId === 'title'
            ? 'Title'
            : a.styleId === 'subtitle'
              ? 'Subtitle'
              : ctx.parent
        const props: string[] = []
        const onlyDisplayEquation = node.content?.length === 1 && node.content[0].type === 'equation' && node.content[0].attrs?.display
        const align = { left: 'start', center: 'center', right: 'end', justify: 'justify' }[a.textAlign as string] ?? (onlyDisplayEquation ? 'center' : undefined)
        if (align) props.push(`fo:text-align="${align}"`)
        const indent = Math.min(Math.max(Number(a.indent) || 0, 0), 8)
        if (indent && !ctx.inList) {
          const base = parent === 'Quotations' ? QUOTE_MARGIN_CM : 0
          props.push(`fo:margin-left="${(base + indent * INDENT_CM).toFixed(3)}cm"`)
        }
        const lineHeight = parseFloat(a.lineHeight)
        if (lineHeight > 0) props.push(`fo:line-height="${Math.round(lineHeight * 100)}%"`)
        let master: string | undefined
        if (ctx.master && !ctx.master.used) {
          master = ctx.master.name
          ctx.master.used = true
        } else if (breakBefore) props.push('fo:break-before="page"')
        const style = this.styles.paragraph(parent, props, languageProps(langTag(a.lang)), master)
        const bookmark = this.shared.bookmarks.get(node)
        const content = (bookmark ? `<text:bookmark text:name="${bookmark}"/>` : '') + (prefix ? escapeText(prefix) : '') + (await this.inline(node.content ?? []))
        return heading
          ? `<text:h text:style-name="${style}" text:outline-level="${level}">${content}</text:h>`
          : `<text:p text:style-name="${style}">${content}</text:p>`
      }
      case 'bulletList':
      case 'orderedList':
      case 'taskList': {
        const kind: ListKind = node.type === 'orderedList' ? 'ordered' : node.type === 'taskList' ? 'task' : 'bullet'
        const start = Number(a.start ?? 1)
        const hoisted = ctx.hoisted ?? []
        let out = `<text:list text:style-name="${this.styles.list(kind)}">`
        for (const [i, item] of (node.content ?? []).entries()) {
          const startAttr = kind === 'ordered' && i === 0 && Number.isFinite(start) && start !== 1 ? ` text:start-value="${start}"` : ''
          const mark = kind === 'task' ? (item.attrs?.checked ? '☒ ' : '☐ ') : ''
          const [first, ...rest] = item.content ?? []
          const itemCtx = { ...ctx, inList: true, hoisted }
          let inner = ''
          if (first?.type === 'paragraph') inner += await this.block(first, itemCtx, false, mark)
          else inner += await this.block({ type: 'paragraph' }, itemCtx, false, mark) + (first ? await this.blocks([first], itemCtx) : '')
          inner += await this.blocks(rest, itemCtx)
          out += `<text:list-item${startAttr}>${inner}</text:list-item>`
        }
        return out + '</text:list>' + (ctx.hoisted ? '' : hoisted.join(''))
      }
      case 'blockquote':
        return this.blocks(node.content ?? [], { ...ctx, parent: 'Quotations' })
      case 'codeBlock': {
        const text = (node.content ?? []).map((n) => n.text ?? '').join('')
        const style = this.styles.paragraph('Preformatted_20_Text', breakBefore ? ['fo:break-before="page"'] : [])
        return `<text:p text:style-name="${style}">${escapeText(text)}</text:p>`
      }
      case 'horizontalRule':
        return '<text:p text:style-name="Horizontal_20_Line"/>'
      case 'tableOfContents':
        return this.toc(node)
      case 'bibliography':
        return this.bibliography()
      case 'sectionBreak':
        return ''
      case 'table': {
        const table = await this.table(node, ctx)
        if (!ctx.hoisted) return table
        ctx.hoisted.push(table)
        return ''
      }
      default:
        // Unknown blocks: keep whatever block content they have.
        return node.content ? this.blocks(node.content, ctx) : ''
    }
  }

  private async table(node: JSONContent, ctx: Ctx): Promise<string> {
    const rows = node.content ?? []
    // Lay out the cells on a grid: a cell at its origin slot, null in slots covered by spans.
    const grid: (JSONContent | null)[][] = rows.map(() => [])
    rows.forEach((row, r) => {
      let c = 0
      for (const cell of row.content ?? []) {
        while (grid[r][c] !== undefined) c++
        const colspan = Math.max(1, Number(cell.attrs?.colspan) || 1)
        const rowspan = Math.min(Math.max(1, Number(cell.attrs?.rowspan) || 1), rows.length - r)
        for (let dr = 0; dr < rowspan; dr++) for (let dc = 0; dc < colspan; dc++) grid[r + dr][c + dc] = dr || dc ? null : cell
        c += colspan
      }
    })
    const cols = Math.max(1, ...grid.map((r) => r.length))

    // Column widths come from the cells' colwidth (one entry per spanned column).
    const widths: (number | null)[] = Array(cols).fill(null)
    for (const row of grid)
      row.forEach((cell, c) => {
        const colwidth = cell?.attrs?.colwidth
        if (Array.isArray(colwidth)) colwidth.forEach((w, i) => (widths[c + i] ??= Number(w) > 0 ? Number(w) : null))
      })
    const name = `Table${++this.shared.tables}`
    let columns: string
    let tableProps: string
    if (widths.every((w) => w === null)) {
      // No explicit widths: equal relative columns across the text area.
      tableProps = `style:width="${this.shared.contentWidthCm.toFixed(3)}cm" style:rel-width="100%" table:align="margins"`
      const col = this.styles.add('table-column', 'Col', null, '<style:table-column-properties style:rel-column-width="1000*"/>')
      columns = `<table:table-column table:style-name="${col}" table:number-columns-repeated="${cols}"/>`
    } else {
      const known = widths.reduce<number>((s, w) => s + (w ?? 0) / PX_PER_CM, 0)
      const unknown = widths.filter((w) => w === null).length
      const fill = unknown ? Math.max((this.shared.contentWidthCm - known) / unknown, 1) : 0
      const cm = widths.map((w) => (w === null ? fill : w / PX_PER_CM))
      tableProps = `style:width="${cm.reduce((s, w) => s + w, 0).toFixed(4)}cm" table:align="left"`
      columns = cm
        .map((w) => {
          const inner = `<style:table-column-properties style:column-width="${w.toFixed(4)}cm"/>`
          return `<table:table-column table:style-name="${this.styles.add('table-column', 'Col', null, inner)}"/>`
        })
        .join('')
    }
    const tableStyle = this.styles.add('table', 'Tbl', null, `<style:table-properties ${tableProps}/>`)

    // Leading rows made only of header cells repeat on each page.
    let headerRows = 0
    while (headerRows < rows.length && rows[headerRows].content?.length && rows[headerRows].content!.every((c) => c.type === 'tableHeader')) headerRows++

    let out = `<table:table table:name="${name}" table:style-name="${tableStyle}">${columns}`
    for (let r = 0; r < rows.length; r++) {
      if (r === 0 && headerRows) out += '<table:table-header-rows>'
      out += '<table:table-row>'
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c]
        if (cell === null) {
          out += '<table:covered-table-cell/>'
          continue
        }
        const a = cell?.attrs ?? {}
        const bg = toHex(a.backgroundColor)
        const cellStyle = this.styles.add(
          'table-cell',
          'C',
          null,
          `<style:table-cell-properties fo:padding="0.1cm" fo:border="0.5pt solid #000000"${bg ? ` fo:background-color="${bg}"` : ''}/>`,
        )
        const colspan = Math.max(1, Number(a.colspan) || 1)
        const rowspan = Math.min(Math.max(1, Number(a.rowspan) || 1), rows.length - r)
        const spans =
          (colspan > 1 ? ` table:number-columns-spanned="${colspan}"` : '') + (rowspan > 1 ? ` table:number-rows-spanned="${rowspan}"` : '')
        const parent = cell?.type === 'tableHeader' ? 'Table_20_Heading' : 'Table_20_Contents'
        const content = cell?.content?.length ? await this.blocks(cell.content, { parent }) : ''
        out += `<table:table-cell table:style-name="${cellStyle}" office:value-type="string"${spans}>${content || `<text:p text:style-name="${parent}"/>`}</table:table-cell>`
      }
      out += '</table:table-row>'
      if (r === headerRows - 1) out += '</table:table-header-rows>'
    }
    return out + '</table:table>'
  }

  private async inline(nodes: JSONContent[]): Promise<string> {
    let out = ''
    // Consecutive nodes with the same link share one <text:a>.
    for (let i = 0; i < nodes.length; ) {
      const href = linkOf(nodes[i])
      let runs = ''
      while (i < nodes.length && linkOf(nodes[i]) === href) runs += await this.run(nodes[i++])
      out += href
        ? `<text:a xlink:type="simple" xlink:href="${escapeXml(href)}" text:style-name="Internet_20_link" text:visited-style-name="Visited_20_Internet_20_Link">${runs}</text:a>`
        : runs
    }
    return out
  }

  private async run(node: JSONContent): Promise<string> {
    const { starts, ends } = this.shared.comments
    const before = (starts.get(node) ?? []).map((c) => annotation(c)).join('')
    const after = (ends.get(node) ?? []).map((c) => `<office:annotation-end office:name="${annotationName(c)}"/>`).join('')
    return before + (await this.content(node)) + after
  }

  private async content(node: JSONContent): Promise<string> {
    const a = node.attrs ?? {}
    switch (node.type) {
      case 'text': {
        const text = escapeText(node.text ?? '')
        const style = this.textStyle(node.marks ?? [])
        const span = style ? `<text:span text:style-name="${style}">${text}</text:span>` : text
        const change = changeOf(node)
        if (!change) return span
        const id = `ct${this.shared.changes.length + 1}`
        const info = `<office:change-info><dc:creator>${escapeXml(change.author)}</dc:creator><dc:date>${isoDate(change.date)}</dc:date></office:change-info>`
        if (change.kind === 'insertion') {
          this.shared.changes.push(`<text:changed-region xml:id="${id}" text:id="${id}"><text:insertion>${info}</text:insertion></text:changed-region>`)
          return `<text:change-start text:change-id="${id}"/>${span}<text:change-end text:change-id="${id}"/>`
        }
        this.shared.changes.push(`<text:changed-region xml:id="${id}" text:id="${id}"><text:deletion>${info}<text:p>${span}</text:p></text:deletion></text:changed-region>`)
        return `<text:change text:change-id="${id}"/>`
      }
      case 'equation':
        return this.formula(String(a.latex ?? ''), !!a.display)
      case 'hardBreak':
        return '<text:line-break/>'
      case 'image':
        return this.image(a)
      case 'footnote': {
        const n = ++this.shared.notes
        const paragraphs = String(a.content ?? '')
          .split('\n')
          .map((line) => `<text:p text:style-name="Footnote">${escapeText(line)}</text:p>`)
          .join('')
        return (
          `<text:note text:id="ftn${n}" text:note-class="footnote"><text:note-citation>${n}</text:note-citation>` +
          `<text:note-body>${paragraphs}</text:note-body></text:note>`
        )
      }
      case 'citation':
        return this.citation(a)
      case 'pageNumber':
        return a.kind === 'total' ? '<text:page-count>1</text:page-count>' : '<text:page-number text:select-page="current">1</text:page-number>'
      default:
        return node.content ? this.inline(node.content) : ''
    }
  }

  // Table of contents index with its cached entries, linked to bookmarks on the headings.
  private toc(node: JSONContent): string {
    const maxLevel = Number(node.attrs?.maxLevel) || 3
    const title = String(node.attrs?.title ?? '')
    const entries = (node.attrs?.entries ?? []) as { level: number; text: string; page?: number }[]
    const headings = tocHeadingsJSON(this.shared.body, maxLevel)
    const name = `Table of Contents${++this.shared.indexes}`
    const templates = Array.from(
      { length: 10 },
      (_, i) =>
        `<text:table-of-content-entry-template text:outline-level="${i + 1}" text:style-name="Contents_20_${Math.min(i + 1, 6)}">` +
        `<text:index-entry-link-start text:style-name="Index_20_Link"/><text:index-entry-chapter/><text:index-entry-text/>` +
        `<text:index-entry-tab-stop style:type="right" style:leader-char="."/><text:index-entry-page-number/><text:index-entry-link-end/></text:table-of-content-entry-template>`,
    ).join('')
    const rows = entries
      .map((e, i) => {
        const anchor = headings[i] ? this.shared.bookmarks.get(headings[i]) : undefined
        const inner = `${escapeText(e.text)}<text:tab/>${e.page ?? ''}`
        const linked = anchor ? `<text:a xlink:type="simple" xlink:href="#${anchor}" text:style-name="Index_20_Link" text:visited-style-name="Index_20_Link">${inner}</text:a>` : inner
        return `<text:p text:style-name="Contents_20_${Math.min(6, Math.max(1, e.level))}">${linked}</text:p>`
      })
      .join('')
    return (
      `<text:table-of-content text:style-name="${this.styles.add('section', 'Sect', null, '<style:section-properties style:editable="false"/>')}" text:protected="true" text:name="${name}">` +
      `<text:table-of-content-source text:outline-level="${maxLevel}"><text:index-title-template text:style-name="Contents_20_Heading">${escapeXml(title)}</text:index-title-template>${templates}</text:table-of-content-source>` +
      `<text:index-body>${title ? `<text:index-title text:name="${name}_Head"><text:p text:style-name="Contents_20_Heading">${escapeText(title)}</text:p></text:index-title>` : ''}${rows || '<text:p text:style-name="Contents_20_1"/>'}</text:index-body></text:table-of-content>`
    )
  }

  // Bibliography index with the formatted reference list as its content.
  private bibliography(): string {
    const cited = citedIdsJSON(this.shared.body).map((id) => this.shared.sources.get(id)).filter((src): src is Source => !!src)
    const rows = formatBibliography(cited, this.shared.cite)
      .map((e) => `<text:p text:style-name="Bibliography_20_1">${this.runs(e.runs)}</text:p>`)
      .join('')
    const name = `Bibliography${++this.shared.indexes}`
    return (
      `<text:bibliography text:style-name="${this.styles.add('section', 'Sect', null, '<style:section-properties style:editable="false"/>')}" text:protected="true" text:name="${name}">` +
      `<text:bibliography-source><text:index-title-template text:style-name="Bibliography_20_Heading"/></text:bibliography-source>` +
      `<text:index-body>${rows || '<text:p text:style-name="Bibliography_20_1"/>'}</text:index-body></text:bibliography>`
    )
  }

  private runs(runs: Run[]): string {
    return runs
      .map((r) => (r.italic ? `<text:span text:style-name="${this.styles.add('text', 'T', null, '<style:text-properties fo:font-style="italic"/>')}">${escapeText(r.text)}</text:span>` : escapeText(r.text)))
      .join('')
  }

  // A citation: the formatted text in the first bibliography mark; each source has a mark with its data.
  private citation(a: Record<string, any>): string {
    const ids = idsOf(a.ids).filter((id) => this.shared.sources.has(id))
    const locator = String(a.locator ?? '').trim()
    const text = citationText({ ids, locator }, this.shared.sources, this.shared.cite, this.shared.suffixes)
    if (!ids.length) return escapeText(text)
    return ids
      .map((id, i) => {
        const attrs = bibliographyAttrs(this.shared.sources.get(id)!, this.markId(id)) + (i === 0 && locator ? ` text:custom5="${escapeXml(locator)}"` : '')
        return `<text:bibliography-mark${attrs}>${i === 0 ? escapeText(text) : ''}</text:bibliography-mark>`
      })
      .join('')
  }

  // LibreOffice shows a mark as "(identifier)": the identifier is the source's author-year label.
  private markId(id: string): string {
    let label = this.shared.markIds.get(id)
    if (label) return label
    const base = citationParts({ ids: [id] }, this.shared.sources, this.shared.cite, this.shared.suffixes).items[0]
    label = base
    const used = new Set(this.shared.markIds.values())
    for (let n = 2; used.has(label); n++) label = `${base} (${n})`
    this.shared.markIds.set(id, label)
    return label
  }

  // A LibreOffice Math object holding the equation as MathML (with its LaTeX as annotation).
  private formula(latex: string, display: boolean): string {
    if (!latex.trim()) return ''
    const name = `Formula${this.shared.formulas.size + 1}`
    this.shared.formulas.set(name, latexToMathML(latex, display))
    const style = this.styles.add(
      'graphic',
      'fr',
      null,
      '<style:graphic-properties style:vertical-pos="middle" style:vertical-rel="text" fo:margin-left="0cm" fo:margin-right="0cm" fo:margin-top="0cm" fo:margin-bottom="0cm" draw:fill="none" draw:ole-draw-aspect="1"/>',
    )
    return (
      // No size: LibreOffice sizes formula objects itself (a given size would scale them).
      `<draw:frame draw:style-name="${style}" draw:name="${name}" text:anchor-type="as-char" draw:z-index="0"><draw:object xlink:href="./${name}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>` +
      `<svg:desc>${escapeXml(latex)}</svg:desc></draw:frame>`
    )
  }

  private textStyle(marks: NonNullable<JSONContent['marks']>): string | null {
    const p: string[] = []
    let code = false
    for (const mark of marks) {
      const a = mark.attrs ?? {}
      switch (mark.type) {
        case 'bold':
          p.push('fo:font-weight="bold"')
          break
        case 'italic':
          p.push('fo:font-style="italic"')
          break
        case 'underline':
          p.push('style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"')
          break
        case 'strike':
          p.push('style:text-line-through-style="solid" style:text-line-through-type="single"')
          break
        case 'subscript':
          p.push('style:text-position="sub 58%"')
          break
        case 'superscript':
          p.push('style:text-position="super 58%"')
          break
        case 'code':
          code = true
          break
        case 'highlight':
          p.push(`fo:background-color="${toHex(a.color) ?? '#ffff00'}"`)
          break
        case 'textStyle': {
          const color = toHex(a.color)
          if (color) p.push(`fo:color="${color}"`)
          const font = fontName(a.fontFamily)
          if (font) {
            this.shared.fonts.add(font)
            p.push(`style:font-name="${escapeXml(font)}" fo:font-family="${escapeXml(quoteFont(font))}"`)
          }
          const size = toPt(a.fontSize)
          if (size) p.push(`fo:font-size="${size}pt"`)
          break
        }
      }
    }
    if (!p.length) return code ? 'Source_20_Text' : null
    return this.styles.add('text', 'T', code ? 'Source_20_Text' : null, `<style:text-properties ${p.join(' ')}/>`)
  }

  private async image(a: Record<string, any>): Promise<string> {
    const src = typeof a.src === 'string' ? a.src : ''
    if (!src) return ''
    const img = await loadImage(src)
    let width = Number(a.width) || 0
    let height = Number(a.height) || 0
    if (img) {
      if (width && !height) height = (width * img.height) / img.width
      else if (height && !width) width = (height * img.width) / img.height
      else if (!width && !height) [width, height] = [img.width, img.height]
    }
    width ||= height || 100
    height ||= width
    let href: string
    if (img) {
      const name = `image${this.shared.pictures.size + 1}.${img.type}`
      this.shared.pictures.set(name, { data: img.data, mime: img.mime })
      href = `Pictures/${name}`
    } else if (/^https?:/i.test(src)) href = src // unreachable remote image: keep it linked
    else return ''
    const frameStyle = this.styles.add(
      'graphic',
      'fr',
      null,
      '<style:graphic-properties style:wrap="none" style:vertical-pos="top" style:vertical-rel="baseline" style:horizontal-pos="center" style:horizontal-rel="paragraph"/>',
    )
    const title = a.title ? `<svg:title>${escapeXml(String(a.title))}</svg:title>` : ''
    const desc = a.alt ? `<svg:desc>${escapeXml(String(a.alt))}</svg:desc>` : ''
    return (
      `<draw:frame draw:style-name="${frameStyle}" draw:name="Image${++this.shared.frames}" text:anchor-type="as-char" ` +
      `svg:width="${(width / PX_PER_CM).toFixed(4)}cm" svg:height="${(height / PX_PER_CM).toFixed(4)}cm" draw:z-index="0">` +
      `<draw:image xlink:href="${escapeXml(href)}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>${title}${desc}</draw:frame>`
    )
  }
}

function columnsXml(section: Section): string {
  const { count, gap, separator } = section.columns
  const sep = separator ? '<style:column-sep style:width="0.02cm" style:color="#000000" style:height="100%" style:vertical-align="top"/>' : ''
  return `<style:section-properties text:dont-balance-text-columns="false" style:editable="false"><style:columns fo:column-count="${count}" fo:column-gap="${(gap / 10).toFixed(3)}cm">${sep}</style:columns></style:section-properties>`
}

const ODF_BIB_TYPES: Record<SourceType, string> = { book: 'book', chapter: 'incollection', article: 'article', web: 'www', report: 'techreport', thesis: 'phdthesis', other: 'misc' }

// Attributes of a text:bibliography-mark (LibreOffice's bibliography fields).
function bibliographyAttrs(src: Source, identifier: string): string {
  const names = (people: Source['authors'] | undefined) => (people ?? []).map((p) => (p.given && !p.org ? `${p.family}, ${p.given}` : p.family)).join('; ')
  const fields: [string, string | undefined][] = [
    ['identifier', identifier],
    ['bibliography-type', ODF_BIB_TYPES[src.type]],
    ['author', names(src.authors)],
    ['editor', names(src.editors)],
    ['title', src.title],
    [src.type === 'article' ? 'journal' : src.type === 'web' ? 'howpublished' : 'booktitle', src.container],
    ['year', src.date?.slice(0, 4)],
    ['month', src.date?.slice(5, 7) || undefined],
    [src.type === 'thesis' ? 'school' : src.type === 'report' ? 'institution' : 'publisher', src.publisher],
    ['address', src.place],
    ['edition', src.edition],
    ['volume', src.volume],
    ['number', src.issue ?? src.number],
    ['pages', src.pages],
    ['url', src.url],
    ['custom4', src.doi],
    ['custom3', src.accessed],
  ]
  return fields
    .filter(([, v]) => v)
    .map(([k, v]) => ` text:${k}="${escapeXml(v!)}"`)
    .join('')
}

function isoDate(ms: number): string {
  return new Date(ms || Date.now()).toISOString().slice(0, 19)
}

const annotationName = (c: CommentData) => `comment-${c.id}`

function annotation(c: CommentData): string {
  const parent = c.parentId ? ` loext:parent-name="comment-${escapeXml(c.parentId)}"` : ''
  const paragraphs = c.text
    .split('\n')
    .map((line) => `<text:p>${escapeText(line)}</text:p>`)
    .join('')
  return (
    `<office:annotation office:name="${escapeXml(annotationName(c))}"${parent} loext:resolved="${c.resolved ? 'true' : 'false'}">` +
    `<dc:creator>${escapeXml(c.author)}</dc:creator><dc:date>${isoDate(c.date)}</dc:date>${paragraphs}</office:annotation>`
  )
}

function trackedChanges(changes: string[]): string {
  return changes.length ? `<text:tracked-changes text:track-changes="false">${changes.join('')}</text:tracked-changes>` : ''
}

function linkOf(node: JSONContent): string | null {
  const href = node.marks?.find((m) => m.type === 'link')?.attrs?.href
  return typeof href === 'string' && href ? href : null
}

// First family of a CSS font stack, without quotes.
function fontName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.split(',')[0].trim().replace(/^['"]|['"]$/g, '')
  return name || null
}

function quoteFont(name: string): string {
  return /\s/.test(name) ? `'${name}'` : name
}

// Escapes text and encodes whitespace the way ODF requires.
function escapeText(text: string): string {
  let out = ''
  let spaces = 0
  const flush = (end: boolean) => {
    if (spaces === 0) return
    // A single space between words is literal; leading/trailing/repeated spaces use <text:s/>.
    if (out === '' || out.endsWith('>') || end) out += spaces === 1 ? '<text:s/>' : `<text:s text:c="${spaces}"/>`
    else out += spaces === 1 ? ' ' : ` <text:s text:c="${spaces - 1}"/>`
    spaces = 0
  }
  for (const ch of text) {
    if (ch === ' ') {
      spaces++
      continue
    }
    flush(false)
    if (ch === '\t') out += '<text:tab/>'
    else if (ch === '\n') out += '<text:line-break/>'
    else if (ch < ' ') continue // control characters are not allowed in XML
    else out += ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch
  }
  flush(true)
  return out
}

function listStyleXml(name: string, kind: ListKind): string {
  const bullets = ['•', '◦', '▪']
  const levels = Array.from({ length: 10 }, (_, i) => {
    const level = i + 1
    const pos = (level * INDENT_CM).toFixed(3)
    const props =
      `<style:list-level-properties text:list-level-position-and-space-mode="label-alignment">` +
      `<style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="${pos}cm" ` +
      `fo:text-indent="-0.635cm" fo:margin-left="${pos}cm"/></style:list-level-properties>`
    if (kind === 'bullet') {
      return `<text:list-level-style-bullet text:level="${level}" text:bullet-char="${bullets[i % 3]}">${props}</text:list-level-style-bullet>`
    }
    // Task lists carry their checkbox in the text, so their label is empty.
    const format = kind === 'task' ? '' : ['1', 'a', 'i'][i % 3]
    const suffix = kind === 'task' ? '' : ' style:num-suffix="."'
    return `<text:list-level-style-number text:level="${level}"${suffix} style:num-format="${format}">${props}</text:list-level-style-number>`
  })
  return `<text:list-style style:name="${name}">${levels.join('')}</text:list-style>`
}

function fontDecls(fonts: Set<string>): string {
  const decls = [...fonts].map((f) => {
    const pitch = f === MONO_FONT ? ' style:font-pitch="fixed"' : ''
    return `<style:font-face style:name="${escapeXml(f)}" svg:font-family="${escapeXml(quoteFont(f))}"${pitch}/>`
  })
  return `<office:font-face-decls>${decls.join('')}</office:font-face-decls>`
}

const DEFAULT_LANGUAGE = 'fo:language="en" fo:country="US"'

// fo:language / fo:country of a language tag ("es-ES").
function languageProps(tag: string | undefined): string {
  const [language, country] = (tag ?? '').split('-')
  if (!/^[a-z]{2,3}$/.test(language ?? '')) return ''
  return `fo:language="${language}"${country ? ` fo:country="${country.toUpperCase()}"` : ''}`
}

function textProps(size: number, extra = ''): string {
  return `<style:text-properties fo:font-size="${size}pt" style:font-size-asian="${size}pt" style:font-size-complex="${size}pt"${extra}/>`
}

const BOLD = ' fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"'
const MONO = ` style:font-name="${MONO_FONT}" fo:font-family="'${MONO_FONT}'" style:font-pitch="fixed"`

const COMMON_STYLES =
  `<style:default-style style:family="paragraph"><style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.21cm"/>` +
  textProps(DEFAULT_FONT_SIZE_PT, ` style:font-name="${DEFAULT_FONT}" fo:font-family="${DEFAULT_FONT}" fo:language="en" fo:country="US"`) +
  `</style:default-style>` +
  `<style:default-style style:family="table-cell"><style:table-cell-properties fo:padding="0.1cm"/></style:default-style>` +
  `<style:style style:name="Standard" style:family="paragraph" style:class="text"/>` +
  `<style:style style:name="Heading" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Standard" style:class="text">` +
  `<style:paragraph-properties fo:margin-top="0.42cm" fo:margin-bottom="0.21cm" fo:keep-with-next="always"/></style:style>` +
  HEADING_SIZES_PT.map(
    (size, i) =>
      `<style:style style:name="Heading_20_${i + 1}" style:display-name="Heading ${i + 1}" style:family="paragraph" style:parent-style-name="Heading" ` +
      `style:next-style-name="Standard" style:default-outline-level="${i + 1}" style:class="text">${textProps(size, BOLD)}</style:style>`,
  ).join('') +
  `<style:style style:name="Title" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Standard" style:class="chapter">` +
  `<style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.3cm"/>${textProps(TITLE_SIZE_PT)}</style:style>` +
  `<style:style style:name="Subtitle" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Standard" style:class="chapter">` +
  `<style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.3cm"/>${textProps(SUBTITLE_SIZE_PT, ' fo:color="#595959"')}</style:style>` +
  `<style:style style:name="Quotations" style:family="paragraph" style:parent-style-name="Standard" style:class="html">` +
  `<style:paragraph-properties fo:margin-left="${QUOTE_MARGIN_CM}cm" fo:padding-left="0.3cm" fo:border-left="0.06cm solid #cccccc" fo:border-right="none" fo:border-top="none" fo:border-bottom="none"/></style:style>` +
  `<style:style style:name="Preformatted_20_Text" style:display-name="Preformatted Text" style:family="paragraph" style:parent-style-name="Standard" style:class="html">` +
  `<style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.21cm" fo:background-color="#f0f0f0"/>${textProps(10, MONO)}</style:style>` +
  `<style:style style:name="Horizontal_20_Line" style:display-name="Horizontal Line" style:family="paragraph" style:parent-style-name="Standard" style:class="html">` +
  `<style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.3cm" fo:padding="0cm" fo:border-left="none" fo:border-right="none" fo:border-top="none" fo:border-bottom="0.06pt solid #808080"/>` +
  `${textProps(6)}</style:style>` +
  `<style:style style:name="Table_20_Contents" style:display-name="Table Contents" style:family="paragraph" style:parent-style-name="Standard" style:class="extra">` +
  `<style:paragraph-properties fo:margin-bottom="0cm"/></style:style>` +
  `<style:style style:name="Table_20_Heading" style:display-name="Table Heading" style:family="paragraph" style:parent-style-name="Table_20_Contents" style:class="extra">` +
  `<style:text-properties${BOLD}/></style:style>` +
  `<style:style style:name="Header" style:family="paragraph" style:parent-style-name="Standard" style:class="extra"><style:paragraph-properties fo:margin-bottom="0cm"/></style:style>` +
  `<style:style style:name="Footer" style:family="paragraph" style:parent-style-name="Standard" style:class="extra"><style:paragraph-properties fo:margin-bottom="0cm"/></style:style>` +
  `<style:style style:name="Footnote" style:family="paragraph" style:parent-style-name="Standard" style:class="extra">` +
  `<style:paragraph-properties fo:margin-left="0.6cm" fo:margin-bottom="0cm" fo:text-indent="-0.6cm"/>${textProps(10)}</style:style>` +
  `<style:style style:name="Source_20_Text" style:display-name="Source Text" style:family="text"><style:text-properties${MONO}/></style:style>` +
  `<style:style style:name="Internet_20_link" style:display-name="Internet link" style:family="text">` +
  `<style:text-properties fo:color="#1155cc" style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/></style:style>` +
  `<style:style style:name="Visited_20_Internet_20_Link" style:display-name="Visited Internet Link" style:family="text">` +
  `<style:text-properties fo:color="#800080" style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/></style:style>` +
  `<style:style style:name="Footnote_20_Symbol" style:display-name="Footnote Symbol" style:family="text"/>` +
  `<style:style style:name="Footnote_20_anchor" style:display-name="Footnote anchor" style:family="text"><style:text-properties style:text-position="super 58%"/></style:style>` +
  `<text:notes-configuration text:note-class="footnote" text:citation-style-name="Footnote_20_Symbol" text:citation-body-style-name="Footnote_20_anchor" ` +
  `style:num-format="1" text:start-value="0" text:footnotes-position="page" text:start-numbering-at="document"/>` +
  `<text:bibliography-configuration text:prefix="(" text:suffix=")" text:numbered-entries="false" text:sort-by-position="false" text:sort-algorithm="alphanumeric"/>`

function mm(value: number): string {
  return `${(value / 10).toFixed(3)}cm`
}

function pageLayoutXml(name: string, page: PageSettings, header: string | null, footer: string | null): string {
  const { width, height } = pageDimensionsMm(page)
  const m = page.margins
  // ODF page margins reach the header/footer; the body margin is that plus the header height and gap.
  const top = header !== null ? Math.min(HEADER_DISTANCE_MM, m.top / 2) : m.top
  const bottom = footer !== null ? Math.min(HEADER_DISTANCE_MM, m.bottom / 2) : m.bottom
  const headerGap = Math.min(HEADER_GAP_MM, (m.top - top) / 2)
  const footerGap = Math.min(HEADER_GAP_MM, (m.bottom - bottom) / 2)
  return (
    `<style:page-layout style:name="${name}"><style:page-layout-properties fo:page-width="${mm(width)}" fo:page-height="${mm(height)}" ` +
    `style:print-orientation="${page.orientation}" fo:margin-top="${mm(top)}" fo:margin-bottom="${mm(bottom)}" ` +
    `fo:margin-left="${mm(m.left)}" fo:margin-right="${mm(m.right)}" style:writing-mode="lr-tb"/>` +
    (header !== null
      ? `<style:header-style><style:header-footer-properties fo:min-height="${mm(m.top - top - headerGap)}" fo:margin-bottom="${mm(headerGap)}" ` +
        `fo:margin-left="0cm" fo:margin-right="0cm" style:dynamic-spacing="false"/></style:header-style>`
      : '<style:header-style/>') +
    (footer !== null
      ? `<style:footer-style><style:header-footer-properties fo:min-height="${mm(m.bottom - bottom - footerGap)}" fo:margin-top="${mm(footerGap)}" ` +
        `fo:margin-left="0cm" fo:margin-right="0cm" style:dynamic-spacing="false"/></style:footer-style>`
      : '<style:footer-style/>') +
    `</style:page-layout>`
  )
}

// Table of contents and bibliography paragraph styles (tab stop at the right margin).
function indexStyles(widthCm: number): string {
  const contents = [1, 2, 3, 4, 5, 6]
    .map((level) => {
      const indent = (level - 1) * 0.5
      return (
        `<style:style style:name="Contents_20_${level}" style:display-name="Contents ${level}" style:family="paragraph" style:parent-style-name="Standard" style:class="index">` +
        `<style:paragraph-properties fo:margin-left="${indent}cm" fo:margin-bottom="0.1cm"><style:tab-stops><style:tab-stop style:position="${(widthCm - indent).toFixed(3)}cm" style:type="right" style:leader-style="dotted" style:leader-text="."/></style:tab-stops></style:paragraph-properties>` +
        (level === 1 ? `<style:text-properties${BOLD}/>` : '') +
        `</style:style>`
      )
    })
    .join('')
  return (
    `<style:style style:name="Contents_20_Heading" style:display-name="Contents Heading" style:family="paragraph" style:parent-style-name="Standard" style:class="index">` +
    `<style:paragraph-properties fo:margin-top="0.2cm" fo:margin-bottom="0.2cm"/>${textProps(16, BOLD)}</style:style>` +
    contents +
    `<style:style style:name="Index_20_Link" style:display-name="Index Link" style:family="text"/>` +
    `<style:style style:name="Bibliography_20_Heading" style:display-name="Bibliography Heading" style:family="paragraph" style:parent-style-name="Standard" style:class="index">${textProps(16, BOLD)}</style:style>` +
    `<style:style style:name="Bibliography_20_1" style:display-name="Bibliography 1" style:family="paragraph" style:parent-style-name="Standard" style:class="index">` +
    `<style:paragraph-properties fo:margin-left="1.27cm" fo:text-indent="-1.27cm" fo:margin-bottom="0.2cm" fo:line-height="150%"/></style:style>`
  )
}

function stylesXml(masters: { name: string; page: PageSettings }[], auto: AutoStyles, fonts: Set<string>, header: string | null, footer: string | null, widthCm: number): string {
  const layouts = masters.map((m, i) => pageLayoutXml(`pm${i + 1}`, m.page, header, footer)).join('')
  const masterXml = masters
    .map(
      (m, i) =>
        `<style:master-page style:name="${m.name}" style:page-layout-name="pm${i + 1}">` +
        (header !== null ? `<style:header>${header}</style:header>` : '') +
        (footer !== null ? `<style:footer>${footer}</style:footer>` : '') +
        `</style:master-page>`,
    )
    .join('')
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<office:document-styles ${NS} office:version="1.3">${fontDecls(fonts)}` +
    `<office:styles>${COMMON_STYLES}${indexStyles(widthCm)}</office:styles>` +
    `<office:automatic-styles>${layouts}${auto.xml()}</office:automatic-styles>` +
    `<office:master-styles>${masterXml}</office:master-styles></office:document-styles>`
  )
}

function metaXml(title: string, user: Record<string, string>): string {
  const extra = Object.entries(user)
    .map(([name, value]) => `<meta:user-defined meta:name="${name}">${escapeXml(value)}</meta:user-defined>`)
    .join('')
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<office:document-meta ${NS} office:version="1.3"><office:meta>` +
    `<meta:generator>Ofimeo</meta:generator><dc:title>${escapeXml(title)}</dc:title>` +
    `<meta:creation-date>${new Date().toISOString().slice(0, 19)}</meta:creation-date>${extra}` +
    `</office:meta></office:document-meta>`
  )
}

function manifestXml(pictures: Shared['pictures'], formulas: Shared['formulas']): string {
  const entries = [...pictures].map(
    ([name, pic]) => `<manifest:file-entry manifest:full-path="Pictures/${name}" manifest:media-type="${pic.mime}"/>`,
  )
  for (const name of formulas.keys()) {
    entries.push(
      `<manifest:file-entry manifest:full-path="${name}/content.xml" manifest:media-type="text/xml"/>`,
      `<manifest:file-entry manifest:full-path="${name}/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.formula"/>`,
    )
  }
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">` +
    `<manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.text"/>` +
    `<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>` +
    `<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>` +
    `<manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>` +
    entries.join('') +
    `</manifest:manifest>`
  )
}
