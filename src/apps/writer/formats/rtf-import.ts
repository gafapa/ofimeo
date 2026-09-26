// RTF import (WordPad, LibreOffice, Word and school tools): paragraphs,
// headings (outline levels and "heading N" styles), bold / italic / underline /
// strike / size / colour / highlight / super- and subscript, alignment, basic
// bulleted and numbered lists, tables (with merged cells), hyperlinks, page
// breaks, footnotes, PNG / JPEG pictures, the header and footer (with page
// numbers) and comments. Other destinations (fields other than links and page
// numbers, drawing objects, embedded objects) are skipped.

import type { JSONContent } from '@tiptap/core'
import { bytesToDataUrl } from '../../../core/formats'
import { t } from '../../../core/i18n'
import { DEFAULT_PAGE, type CommentData, type ImportedDocument, type PageSettings } from './types'

interface CharState {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  size?: number
  color?: string
  highlight?: string
  vert?: 'sup' | 'sub'
}

interface ParaState {
  align?: 'center' | 'right' | 'justify'
  style: number
  outline?: number
  list?: number
  level: number
  inTable: boolean
  pageBreakBefore?: boolean
}

// One group level: character formatting and where its text goes.
interface Group {
  chars: CharState
  // Destination capturing the text of this group (and its children).
  dest: string | null
  // Unicode skip count (\ucN).
  uc: number
}

type Cell = { blocks: JSONContent[]; merge: 0 | 1 | 2; vmerge: 0 | 1 | 2 }

class Story {
  blocks: JSONContent[] = []
  inline: JSONContent[] = []
  rows: { cells: Cell[]; bounds: number[] }[] = []
  row: Cell[] = []
  cell: JSONContent[] = []
  lists: { node: JSONContent; kind: string }[] = []
}

const DEST_SKIP = new Set([
  'fonttbl', 'colortbl', 'stylesheet', 'info', 'listtable', 'listoverridetable', 'pntext', 'pntxta', 'pntxtb', 'ftnsep', 'ftnsepc', 'aftnsep',
  'xmlnstbl', 'generator', 'themedata', 'colorschememapping', 'datastore', 'latentstyles', 'rsidtbl', 'mmathPr', 'pgdsctbl', 'atnid', 'atnref',
  'atndate', 'atnicn', 'bkmkstart', 'bkmkend', 'object', 'shp', 'shpinst', 'nonshppict', 'filetbl', 'revtbl', 'listpicture', 'pgptbl', 'wgrffmtfilter',
  'fldtype', 'datafield', 'formfield', 'userprops', 'docvar', 'template', 'protusertbl', 'headerl', 'headerf', 'footerl', 'footerf', 'picprop',
  'blipuid', 'mhtmltag', 'htmltag', 'xe', 'tc', 'txe', 'falt', 'panose', 'leveltext', 'levelnumbers', 'listname', 'pnseclvl', 'upr', 'ud',
  'atrfstart', 'atrfend', 'passwordhash', 'ftncn', 'aftnsepc', 'aftncn',
])

const PARA_WORDS = new Set(['pagebb', 'pard', 'qc', 'qr', 'qj', 'ql', 's', 'outlinelevel', 'ls', 'ilvl', 'intbl', 'trowd', 'clmgf', 'clmrg', 'clvmgf', 'clvmrg', 'cellx', 'cell', 'row', 'page'])

const decoder = (() => {
  try {
    return new TextDecoder('windows-1252')
  } catch {
    return new TextDecoder('latin1')
  }
})()

export function importRtf(text: string): ImportedDocument {
  if (!text.startsWith('{\\rtf')) throw new Error(t('This file is not an RTF document'))
  const colors: string[] = []
  const headingStyles = new Map<number, number>()
  const comments: CommentData[] = []
  const notImported = new Set<string>()
  let page: PageSettings = structuredClone(DEFAULT_PAGE)
  sizeW = 0
  sizeH = 0

  const body = new Story()
  let header: Story | null = null
  let footer: Story | null = null
  let story = body
  const para: ParaState = { style: 0, level: 0, inTable: false }
  let listText = ''
  // Row definition being read (\trowd … \cellx), applied to the next \row.
  let rowBounds: number[] = []
  let cellFlags: { merge: 0 | 1 | 2; vmerge: 0 | 1 | 2 } = { merge: 0, vmerge: 0 }
  let rowFlags: { merge: 0 | 1 | 2; vmerge: 0 | 1 | 2 }[] = []
  const activeComments = new Set<string>()
  let link: string | null = null
  let pageField = false
  let pendingAuthor = ''

  // Text captured by a destination group, and its handler when the group ends.
  const captures: { depth: number; kind: string; text: string; data?: Record<string, number | string> }[] = []
  const stack: Group[] = [{ chars: {}, dest: null, uc: 1 }]
  const top = () => stack[stack.length - 1]
  let skip = 0

  const marksOf = (c: CharState): NonNullable<JSONContent['marks']> => {
    const marks: NonNullable<JSONContent['marks']> = []
    if (c.bold) marks.push({ type: 'bold' })
    if (c.italic) marks.push({ type: 'italic' })
    if (link) marks.push({ type: 'link', attrs: { href: link } })
    if (c.strike) marks.push({ type: 'strike' })
    if (c.underline && !link) marks.push({ type: 'underline' })
    const style: Record<string, string> = {}
    if (c.color && c.color !== '#000000' && !link) style.color = c.color
    if (c.size && c.size !== 11 && c.size !== 12) style.fontSize = `${c.size}pt`
    if (Object.keys(style).length) marks.push({ type: 'textStyle', attrs: style })
    if (c.highlight) marks.push({ type: 'highlight', attrs: { color: c.highlight } })
    if (c.vert === 'sup') marks.push({ type: 'superscript' })
    if (c.vert === 'sub') marks.push({ type: 'subscript' })
    for (const id of activeComments) marks.push({ type: 'commentRange', attrs: { id } })
    return marks
  }

  const emit = (s: string) => {
    const capture = captures[captures.length - 1]
    if (capture) {
      capture.text += s
      return
    }
    const g = top()
    if (g.dest === 'listtext') {
      listText += s
      return
    }
    if (pageField) return
    const marks = marksOf(g.chars)
    const last = story.inline[story.inline.length - 1]
    if (last?.type === 'text' && JSON.stringify(last.marks ?? []) === JSON.stringify(marks)) last.text += s
    else story.inline.push(marks.length ? { type: 'text', text: s, marks } : { type: 'text', text: s })
  }

  const finishParagraph = () => {
    const content = story.inline.length ? story.inline : undefined
    story.inline = []
    const heading = para.outline !== undefined && para.outline < 6 ? para.outline + 1 : headingStyles.get(para.style)
    const node: JSONContent = heading
      ? { type: 'heading', attrs: { level: Math.min(6, heading), ...(para.align ? { textAlign: para.align } : {}) }, content }
      : { type: 'paragraph', ...(para.align ? { attrs: { textAlign: para.align } } : {}), content }
    const item = listText
    listText = ''
    if (para.pageBreakBefore && !para.inTable) {
      flushTable()
      story.lists.length = 0
      story.blocks.push({ type: 'pageBreak' })
    }
    if (para.inTable) {
      story.cell.push(heading ? { ...node, type: 'paragraph', attrs: {} } : node)
      return
    }
    flushTable()
    if (para.list !== undefined && !heading && item) {
      const kind = /^\s*[\w\d]+[.)]/.test(item.replace(/\t/g, '')) ? 'orderedList' : 'bulletList'
      const level = Math.min(para.level, story.lists.length)
      story.lists.length = Math.min(story.lists.length, level + 1)
      if (story.lists[level] && story.lists[level].kind !== kind) story.lists.length = level
      if (story.lists.length === level) {
        const l: JSONContent = { type: kind, content: [] }
        if (level === 0) story.blocks.push(l)
        else {
          const items = story.lists[level - 1].node.content!
          items[items.length - 1].content!.push(l)
        }
        story.lists.push({ node: l, kind })
      }
      story.lists[level].node.content!.push({ type: 'listItem', content: [node] })
      return
    }
    story.lists.length = 0
    story.blocks.push(node)
  }

  const flushTable = () => {
    if (!story.rows.length) return
    const rows = story.rows
    story.rows = []
    const grid: number[] = [0]
    for (const r of rows) for (const x of r.bounds) if (!grid.some((g) => Math.abs(g - x) < 30)) grid.push(x)
    grid.sort((a, b) => a - b)
    const col = (x: number) => grid.findIndex((g) => Math.abs(g - x) < 30)
    const laid = rows.map((r) => {
      const out: { cell: Cell; start: number; span: number }[] = []
      r.cells.forEach((cell, k) => {
        const a = r.bounds.length === r.cells.length ? (k ? col(r.bounds[k - 1]) : 0) : k
        const b = r.bounds.length === r.cells.length ? col(r.bounds[k]) : k + 1
        const span = Math.max(1, b - a)
        const prev = out[out.length - 1]
        if (cell.merge === 1 && prev) prev.span += span
        else out.push({ cell, start: a, span })
      })
      return out
    })
    const content: JSONContent[] = []
    laid.forEach((row, ri) => {
      const cells: JSONContent[] = []
      for (const { cell, start, span } of row) {
        if (cell.vmerge === 1 && ri > 0) continue
        let rowspan = 1
        if (cell.vmerge === 2) for (let rj = ri + 1; rj < laid.length && laid[rj].some((c) => c.start === start && c.cell.vmerge === 1); rj++) rowspan++
        const attrs: Record<string, unknown> = {}
        if (span > 1) attrs.colspan = span
        if (rowspan > 1) attrs.rowspan = rowspan
        cells.push({ type: 'tableCell', ...(Object.keys(attrs).length ? { attrs } : {}), content: cell.blocks.length ? cell.blocks : [{ type: 'paragraph' }] })
      }
      if (cells.length) content.push({ type: 'tableRow', content: cells })
    })
    if (content.length) story.blocks.push({ type: 'table', content })
  }

  const endStory = (s: Story) => {
    if (s.inline.length) finishParagraph()
    const saved = story
    story = s
    flushTable()
    story = saved
    while (s.blocks.length && s.blocks[s.blocks.length - 1].type === 'paragraph' && !s.blocks[s.blocks.length - 1].content?.length) s.blocks.pop()
  }

  // Destination group ended: use what it captured.
  const closeCapture = (c: { kind: string; text: string; data?: Record<string, number | string> }) => {
    switch (c.kind) {
      case 'fonttbl':
      case 'stylesheet':
        break
      case 'colortbl':
        break
      case 'fldinst': {
        const m = /HYPERLINK\s+(?:\\l\s+)?"([^"]+)"/i.exec(c.text)
        const field = stack.find((g) => g.dest === 'field')
        if (field) (field as Group & { inst?: string }).inst = c.text
        if (m) link = /\\l/.test(c.text) ? `#${m[1]}` : m[1]
        const pg = /^\s*(PAGE|NUMPAGES|SECTIONPAGES)\b/i.exec(c.text)?.[1].toUpperCase()
        if (pg) {
          story.inline.push({ type: 'pageNumber', attrs: { kind: pg === 'PAGE' ? 'page' : 'total' } })
          pageField = true
        }
        break
      }
      case 'footnote': {
        const note = c.text.replace(/^\s+/, '').trim()
        if (note) story.inline.push({ type: 'footnote', attrs: { content: note } })
        break
      }
      case 'atnauthor':
        pendingAuthor = c.text.trim()
        break
      case 'annotation': {
        const id = String(c.data?.ref ?? comments.length + 1)
        comments.push({ id, author: pendingAuthor, date: 0, text: c.text.trim() })
        pendingAuthor = ''
        break
      }
      case 'pict': {
        const hex = c.text.replace(/[^0-9a-f]/gi, '')
        const type = c.data?.type
        if (!hex || (type !== 'png' && type !== 'jpeg')) {
          notImported.add('pictures')
          break
        }
        const bytes = new Uint8Array(hex.length >> 1)
        for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
        const goalW = Number(c.data?.wgoal ?? 0) * (Number(c.data?.sx ?? 100) / 100)
        const goalH = Number(c.data?.hgoal ?? 0) * (Number(c.data?.sy ?? 100) / 100)
        const width = Math.round(goalW / 15)
        const height = Math.round(goalH / 15)
        story.inline.push({ type: 'image', attrs: { src: bytesToDataUrl(bytes, type === 'png' ? 'image/png' : 'image/jpeg'), ...(width > 0 && height > 0 ? { width, height } : {}) } })
        break
      }
    }
  }

  // Stylesheet and colour table are read with small dedicated scans.
  readTables(text, colors, headingStyles)

  let i = 0
  const n = text.length
  let starDest = false
  while (i < n) {
    const ch = text[i]
    if (ch === '{') {
      const g = top()
      stack.push({ chars: { ...g.chars }, dest: g.dest, uc: g.uc })
      i++
      continue
    }
    if (ch === '}') {
      const depth = stack.length
      const closing = stack.pop()!
      if (stack.length === 0) break
      const c = captures[captures.length - 1]
      if (c && c.depth === depth) {
        captures.pop()
        closeCapture(c)
      }
      if (closing.dest === 'header' && top().dest !== 'header') {
        endStory(story)
        story = body
      } else if (closing.dest === 'footer' && top().dest !== 'footer') {
        endStory(story)
        story = body
      } else if (closing.dest === 'field' && top().dest !== 'field') {
        link = null
        pageField = false
      }
      i++
      continue
    }
    if (ch === '\r' || ch === '\n') {
      i++
      continue
    }
    if (ch !== '\\') {
      if (skip > 0) skip--
      else if (top().dest !== 'skip') emit(ch)
      i++
      continue
    }
    // Control symbol or word.
    const next = text[i + 1]
    if (next === "'") {
      const byte = parseInt(text.substr(i + 2, 2), 16)
      i += 4
      if (skip > 0) {
        skip--
        continue
      }
      if (top().dest !== 'skip' && Number.isFinite(byte)) emit(decoder.decode(new Uint8Array([byte])))
      continue
    }
    if (next === '*') {
      starDest = true
      i += 2
      continue
    }
    if (next === '\\' || next === '{' || next === '}') {
      if (top().dest !== 'skip') emit(next)
      i += 2
      continue
    }
    if (next === '~') {
      if (top().dest !== 'skip') emit(' ')
      i += 2
      continue
    }
    if (next === '-' || next === '_') {
      if (next === '_' && top().dest !== 'skip') emit('‑')
      i += 2
      continue
    }
    if (next === '\n' || next === '\r') {
      if (top().dest !== 'skip' && !captures.length) finishParagraph()
      i += 2
      continue
    }
    const m = /^([a-zA-Z]+)(-?\d+)? ?/.exec(text.slice(i + 1, i + 40))
    if (!m) {
      i += 2
      continue
    }
    i += 1 + m[0].length
    const word = m[1]
    const param = m[2] !== undefined ? Number(m[2]) : undefined
    const wasStar = starDest
    starDest = false
    const g = top()
    const on = param === undefined || param !== 0

    // Destinations.
    if (DEST_SKIP.has(word) || (wasStar && !['footnote', 'annotation', 'fldinst', 'atnauthor', 'atrfstart', 'atrfend', 'shppict'].includes(word))) {
      if (word === 'atrfstart' || word === 'atrfend') {
        // Comment range: the id follows as text in the same group.
        const end = text.indexOf('}', i)
        const id = text.slice(i, end).trim()
        if (word === 'atrfstart') activeComments.add(id)
        else activeComments.delete(id)
        i = end
        continue
      }
      g.dest = 'skip'
      continue
    }
    if (g.dest === 'skip') continue
    // Footnotes, comments and list labels have their own paragraphs: keep the outer paragraph's settings.
    if ((captures.length || g.dest === 'listtext') && PARA_WORDS.has(word)) continue
    switch (word) {
      case 'atrfstart':
      case 'atrfend': {
        const end = text.indexOf('}', i)
        const id = text.slice(i, end).trim()
        if (word === 'atrfstart') activeComments.add(id)
        else activeComments.delete(id)
        i = end
        break
      }
      case 'header':
      case 'footer':
        g.dest = word
        story = new Story()
        if (word === 'header') header = story
        else footer = story
        break
      case 'footnote':
      case 'fldinst':
      case 'atnauthor':
        captures.push({ depth: stack.length, kind: word, text: '' })
        break
      case 'annotation': {
        const ref = /\\atnref\s*([^}]*)\}/.exec(text.slice(i, i + 200))?.[1]?.trim()
        captures.push({ depth: stack.length, kind: 'annotation', text: '', data: ref ? { ref } : {} })
        break
      }
      case 'pict':
        captures.push({ depth: stack.length, kind: 'pict', text: '', data: {} })
        break
      case 'pngblip':
      case 'jpegblip':
      case 'emfblip':
      case 'wmetafile':
      case 'dibitmap':
      case 'wbitmap': {
        const c = captures[captures.length - 1]
        if (c?.kind === 'pict') c.data!.type = word === 'pngblip' ? 'png' : word === 'jpegblip' ? 'jpeg' : 'other'
        break
      }
      case 'picwgoal':
      case 'pichgoal':
      case 'picscalex':
      case 'picscaley': {
        const c = captures[captures.length - 1]
        if (c?.kind === 'pict') c.data![{ picwgoal: 'wgoal', pichgoal: 'hgoal', picscalex: 'sx', picscaley: 'sy' }[word]!] = param ?? 0
        break
      }
      case 'field':
        g.dest = 'field'
        break
      case 'fldrslt':
        break
      case 'listtext':
        g.dest = 'listtext'
        break
      case 'u': {
        let code = param ?? 0
        if (code < 0) code += 65536
        emit(String.fromCharCode(code))
        skip = g.uc
        break
      }
      case 'uc':
        g.uc = param ?? 1
        break
      case 'par':
        if (!captures.length) finishParagraph()
        else captures[captures.length - 1].text += '\n'
        break
      case 'line':
        if (!captures.length) story.inline.push({ type: 'hardBreak' })
        else emit('\n')
        break
      case 'tab':
        emit('\t')
        break
      case 'page':
        if (!captures.length) {
          if (story.inline.length) finishParagraph()
          story.lists.length = 0
          story.blocks.push({ type: 'pageBreak' })
        }
        break
      case 'emdash':
        emit('—')
        break
      case 'endash':
        emit('–')
        break
      case 'bullet':
        emit('•')
        break
      case 'lquote':
        emit('‘')
        break
      case 'rquote':
        emit('’')
        break
      case 'ldblquote':
        emit('“')
        break
      case 'rdblquote':
        emit('”')
        break
      case 'chatn':
      case 'chftn':
        break
      // Paragraph formatting.
      case 'pard':
        Object.assign(para, { align: undefined, style: 0, outline: undefined, list: undefined, level: 0, inTable: false, pageBreakBefore: false })
        break
      case 'qc':
        para.align = 'center'
        break
      case 'qr':
        para.align = 'right'
        break
      case 'qj':
        para.align = 'justify'
        break
      case 'ql':
        para.align = undefined
        break
      case 's':
        para.style = param ?? 0
        break
      case 'outlinelevel':
        para.outline = param
        break
      case 'ls':
        para.list = param
        break
      case 'ilvl':
        para.level = param ?? 0
        break
      case 'intbl':
        para.inTable = true
        break
      case 'pagebb':
        para.pageBreakBefore = on
        break
      // Tables.
      case 'trowd':
        rowBounds = []
        rowFlags = []
        cellFlags = { merge: 0, vmerge: 0 }
        break
      case 'clmgf':
        cellFlags.merge = 2
        break
      case 'clmrg':
        cellFlags.merge = 1
        break
      case 'clvmgf':
        cellFlags.vmerge = 2
        break
      case 'clvmrg':
        cellFlags.vmerge = 1
        break
      case 'cellx':
        rowBounds.push(param ?? 0)
        rowFlags.push(cellFlags)
        cellFlags = { merge: 0, vmerge: 0 }
        break
      case 'cell':
        if (story.inline.length || !story.cell.length) {
          para.inTable = true
          finishParagraph()
        }
        story.row.push({ blocks: story.cell, ...(rowFlags[story.row.length] ?? { merge: 0, vmerge: 0 }) })
        story.cell = []
        break
      case 'row':
        story.rows.push({ cells: story.row, bounds: rowBounds.slice(0, story.row.length) })
        story.row = []
        break
      // Character formatting.
      case 'plain':
        g.chars = {}
        break
      case 'b':
        g.chars.bold = on
        break
      case 'i':
        g.chars.italic = on
        break
      case 'ul':
      case 'uld':
      case 'uldb':
      case 'ulw':
        g.chars.underline = on
        break
      case 'ulnone':
        g.chars.underline = false
        break
      case 'strike':
      case 'striked':
        g.chars.strike = on
        break
      case 'fs':
        g.chars.size = (param ?? 24) / 2
        break
      case 'cf':
        g.chars.color = colors[param ?? 0] || undefined
        break
      case 'highlight':
      case 'cb':
      case 'chcbpat':
        g.chars.highlight = param ? colors[param] || undefined : undefined
        break
      case 'super':
        g.chars.vert = 'sup'
        break
      case 'sub':
        g.chars.vert = 'sub'
        break
      case 'nosupersub':
        g.chars.vert = undefined
        break
      // Page setup.
      case 'paperw':
      case 'pgwsxn':
        page = withSize(page, param ?? 0, undefined)
        break
      case 'paperh':
      case 'pghsxn':
        page = withSize(page, undefined, param ?? 0)
        break
      case 'margl':
      case 'marglsxn':
        page.margins.left = twipsToMm(param ?? 0)
        break
      case 'margr':
      case 'margrsxn':
        page.margins.right = twipsToMm(param ?? 0)
        break
      case 'margt':
      case 'margtsxn':
        page.margins.top = twipsToMm(param ?? 0)
        break
      case 'margb':
      case 'margbsxn':
        page.margins.bottom = twipsToMm(param ?? 0)
        break
      case 'landscape':
      case 'lndscpsxn':
        page.orientation = 'landscape'
        break
      case 'shp':
      case 'do':
        notImported.add('shapes')
        break
    }
  }
  endStory(body)
  const doc = (s: Story | null): JSONContent | null => (s && s.blocks.length ? { type: 'doc', content: s.blocks } : null)
  return {
    body: { type: 'doc', content: body.blocks.length ? body.blocks : [{ type: 'paragraph' }] },
    header: doc(header),
    footer: doc(footer),
    page,
    ...(comments.length ? { comments } : {}),
    ...(notImported.size ? { notImported: [...notImported] } : {}),
  }
}

const twipsToMm = (tw: number) => Math.round((tw / 1440) * 254) / 10

let sizeW = 0
let sizeH = 0
function withSize(page: PageSettings, w: number | undefined, h: number | undefined): PageSettings {
  if (w !== undefined) sizeW = w
  if (h !== undefined) sizeH = h
  if (!sizeW || !sizeH) return page
  const short = Math.min(sizeW, sizeH) / 56.7
  const size = Math.abs(short - 215.9) < 3 ? (Math.max(sizeW, sizeH) / 56.7 > 300 ? 'Legal' : 'Letter') : Math.abs(short - 148) < 3 ? 'A5' : 'A4'
  return { ...page, size, orientation: sizeW > sizeH ? 'landscape' : 'portrait' }
}

// Colour table (\colortbl) and heading styles (\stylesheet: \outlinelevelN or "heading N").
function readTables(text: string, colors: string[], headings: Map<number, number>) {
  const table = /\{\\colortbl\s*;?([^}]*)\}/.exec(text)
  if (table) {
    colors.push('')
    for (const entry of table[1].split(';').slice(0, -1)) {
      const r = /\\red(\d+)/.exec(entry)
      const g = /\\green(\d+)/.exec(entry)
      const b = /\\blue(\d+)/.exec(entry)
      colors.push(r && g && b ? `#${[r[1], g[1], b[1]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}` : '')
    }
    // A leading ";" means entry 0 is "auto".
    if (!/^\s*;/.test(table[0].replace('{\\colortbl', ''))) colors.shift()
  }
  const start = text.indexOf('{\\stylesheet')
  if (start < 0) return
  let depth = 0
  let end = start
  for (; end < text.length; end++) {
    if (text[end] === '{' && text[end - 1] !== '\\') depth++
    else if (text[end] === '}' && text[end - 1] !== '\\' && --depth === 0) break
  }
  for (const m of text.slice(start + 1, end).matchAll(/\{(?:\\\*)?\\s(\d+)([^{}]*)/g)) {
    const id = Number(m[1])
    const outline = /\\outlinelevel(\d)/.exec(m[2])?.[1]
    const name = /\s([^\\;]+);?\s*$/.exec(m[2])?.[1]?.trim() ?? ''
    const level = outline !== undefined ? Number(outline) + 1 : Number(/^heading (\d)$/i.exec(name)?.[1] ?? 0)
    if (level) headings.set(id, level)
  }
}
