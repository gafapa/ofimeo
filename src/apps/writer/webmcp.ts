// WebMCP tools of the writer (see src/core/webmcp). Loaded only while the
// switch is on. Text changes by the assistant are always tracked suggestions
// (insertions and deletions the user accepts or rejects), authored "AI
// assistant (<user>)"; formatting and headings, which suggestions do not
// track, are applied directly as one undo step. Comments go to the comments
// channel like the user's own.

import type { JSONContent } from '@tiptap/core'
import type { Mark, Node as PMNode } from '@tiptap/pm/model'
import { yUndoPluginKey, yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap'
import type * as Y from 'yjs'
import { t } from '../../core/i18n'
import { AI_CLIENT, AI_COLOR, AI_USER_ID, aiName } from '../../core/webmcp/ai'
import { groupYUndo } from '../../core/webmcp/undo'
import { bool, imageResult, num, optNum, optStr, str, type AccessibilityIssue, type AppTools, type OfimeoTool, type TextPart, type ToolArgs } from '../../core/webmcp/types'
import type { WriterContext } from './app'
import { commentsMapOf, userIdOf } from './collab'
import { collectSuggestions } from './editor/suggestions'
import type { CommentRecord } from './review'
import { encodeAnchor, PositionIndex } from './ypos'
import { newSourceId, SOURCE_TYPES, type Person, type Source, type SourceType } from './references/types'
import { CHART_TYPES } from '../sheet/charts/model'

const MAX_TEXT = 200_000

// ---------- Markdown ----------

const MARKS: [string, string, string][] = [
  ['code', '`', '`'],
  ['bold', '**', '**'],
  ['italic', '*', '*'],
  ['strike', '~~', '~~'],
  ['underline', '<u>', '</u>'],
  ['insertion', '{++', '++}'],
  ['deletion', '{--', '--}'],
]

function inlineMarkdown(block: PMNode): string {
  let out = ''
  block.forEach((child) => {
    if (child.isText) {
      let text = child.text ?? ''
      const names = new Set(child.marks.map((m) => m.type.name))
      for (const [name, open, close] of MARKS) if (names.has(name)) text = open + text + close
      const link = child.marks.find((m) => m.type.name === 'link')
      out += link ? `[${text}](${link.attrs.href})` : text
    } else if (child.type.name === 'hardBreak') out += '  \n'
    else if (child.type.name === 'equation') out += `$${child.attrs.latex ?? ''}$`
    else if (child.type.name === 'image') out += `![${child.attrs.alt ?? ''}](image)`
    else out += child.textContent
  })
  return out
}

function blockMarkdown(node: PMNode, indent = ''): string[] {
  const name = node.type.name
  if (name === 'heading') return [`${'#'.repeat(Number(node.attrs.level) || 1)} ${inlineMarkdown(node)}`]
  if (node.isTextblock && name !== 'codeBlock') return [indent + inlineMarkdown(node)]
  if (name === 'codeBlock') return ['```', ...node.textContent.split('\n'), '```']
  if (name === 'horizontalRule') return ['---']
  if (name === 'pageBreak') return ['<!-- page break -->']
  if (name === 'bulletList' || name === 'orderedList' || name === 'taskList') {
    const lines: string[] = []
    let n = Number(node.attrs.start) || 1
    node.forEach((item) => {
      const bullet = name === 'orderedList' ? `${n++}. ` : name === 'taskList' ? `- [${item.attrs.checked ? 'x' : ' '}] ` : '- '
      let first = true
      item.forEach((child) => {
        for (const line of blockMarkdown(child, indent + '  ')) {
          lines.push(first ? indent + bullet + line.slice(indent.length + 2) : line)
          first = false
        }
      })
    })
    return lines
  }
  if (name === 'blockquote') {
    const lines: string[] = []
    node.forEach((child) => lines.push(...blockMarkdown(child).map((l) => `> ${l}`)))
    return lines
  }
  if (name === 'table') {
    const rows: string[] = []
    node.forEach((row, _o, i) => {
      const cells: string[] = []
      row.forEach((cell) => cells.push(cell.textContent.replace(/\|/g, '\\|').replace(/\n/g, ' ')))
      rows.push(`| ${cells.join(' | ')} |`)
      if (i === 0) rows.push(`|${cells.map(() => ' --- ').join('|')}|`)
    })
    return rows
  }
  const lines: string[] = []
  node.forEach((child) => lines.push(...blockMarkdown(child, indent)))
  if (!lines.length && node.textContent) lines.push(node.textContent)
  return lines
}

export function toMarkdown(doc: PMNode): string {
  const blocks: string[] = []
  doc.forEach((node) => blocks.push(blockMarkdown(node).join('\n')))
  return blocks.join('\n\n')
}

// Markdown-ish text to blocks: # headings, "- " and "1. " list items, paragraphs.
function textToBlocks(text: string): JSONContent[] {
  const blocks: JSONContent[] = []
  const inline = (s: string): JSONContent[] => (s ? [{ type: 'text', text: s }] : [])
  let list: JSONContent | null = null
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd()
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line)
    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (bullet || ordered) {
      const type = bullet ? 'bulletList' : 'orderedList'
      if (!list || list.type !== type) blocks.push((list = { type, content: [] }))
      list.content!.push({ type: 'listItem', content: [{ type: 'paragraph', content: inline((bullet ?? ordered)![1]) }] })
      continue
    }
    list = null
    if (heading) blocks.push({ type: 'heading', attrs: { level: heading[1].length }, content: inline(heading[2]) })
    else if (line) blocks.push({ type: 'paragraph', content: inline(line) })
  }
  return blocks.length ? blocks : [{ type: 'paragraph' }]
}

// ---------- Text index (positions of the visible text) ----------

interface Block {
  text: string
  // Document position of each character of `text`.
  pos: number[]
  node: PMNode
  start: number
}

function textBlocks(doc: PMNode): Block[] {
  const blocks: Block[] = []
  doc.descendants((node, start) => {
    if (!node.isTextblock) return true
    let text = ''
    const pos: number[] = []
    node.forEach((child, offset) => {
      const at = start + 1 + offset
      // Text already suggested for deletion is not part of the visible text.
      if (child.marks.some((m) => m.type.name === 'deletion')) return
      if (child.isText) {
        for (let i = 0; i < child.text!.length; i++) {
          text += child.text![i]
          pos.push(at + i)
        }
      } else {
        text += '￼'
        pos.push(at)
      }
    })
    blocks.push({ text, pos, node, start })
    return false
  })
  return blocks
}

interface Match {
  from: number
  to: number
  block: number
  context: string
}

function findAll(doc: PMNode, query: string, matchCase = false): Match[] {
  if (!query) return []
  const q = matchCase ? query : query.toLowerCase()
  const out: Match[] = []
  textBlocks(doc).forEach((b, index) => {
    const hay = matchCase ? b.text : b.text.toLowerCase()
    for (let i = hay.indexOf(q); i >= 0; i = hay.indexOf(q, i + Math.max(1, q.length))) {
      const end = i + q.length - 1
      out.push({ from: b.pos[i], to: b.pos[end] + 1, block: index, context: b.text.slice(Math.max(0, i - 40), end + 41) })
    }
  })
  return out
}

// ---------- Checks ----------

const OBJECT_CHAR = String.fromCharCode(0xfffc)
// Blocks removed when withdrawing the last suggested text leaves them empty.
const CONTAINERS = new Set(['table', 'bulletList', 'orderedList', 'taskList', 'blockquote'])

// Text blocks with where they are (for spelling): "paragraph 3: “First words…”".
function textParts(doc: PMNode): TextPart[] {
  const parts: TextPart[] = []
  let n = 0
  doc.descendants((node, _pos, parent) => {
    if (!node.isTextblock) return true
    n++
    // The visible text (without suggested deletions); objects as U+FFFC.
    let text = ''
    node.forEach((child) => {
      if (!child.marks.some((m) => m.type.name === 'deletion')) text += child.isText ? child.text : OBJECT_CHAR
    })
    const start = text.trim().slice(0, 40)
    const context = node.type.name === 'heading' ? 'heading' : parent?.type.name === 'tableCell' || parent?.type.name === 'tableHeader' ? 'table' : parent?.type.name === 'listItem' || parent?.type.name === 'taskItem' ? 'list' : 'paragraph'
    parts.push({ where: `paragraph ${n}: “${start}${text.length > 40 ? '…' : ''}”`, text, context })
    return false
  })
  return parts
}

// Images in document order (their number is the "image" argument of set_alt_text).
function images(doc: PMNode): { node: PMNode; pos: number }[] {
  const list: { node: PMNode; pos: number }[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'image') list.push({ node, pos })
  })
  return list
}

function accessibilityIssues(doc: PMNode, words: number): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = []
  images(doc).forEach(({ node }, i) => {
    if (!String(node.attrs.alt ?? '').trim()) issues.push({ where: `image ${i + 1}`, problem: 'The picture has no description (alternative text).', fix: `set_alt_text {"image": ${i + 1}, "text": "…"}` })
  })
  let previous = 0
  let headings = 0
  let tables = 0
  doc.descendants((node) => {
    if (node.type.name === 'heading') {
      headings++
      const level = Number(node.attrs.level) || 1
      if (previous && level > previous + 1) issues.push({ where: `heading “${node.textContent.slice(0, 60)}”`, problem: `Heading level ${level} after level ${previous}: a level is skipped.`, fix: `apply_heading {"match": "${node.textContent.slice(0, 40)}", "level": ${previous + 1}}` })
      if (!node.textContent.trim()) issues.push({ where: 'an empty heading', problem: 'A heading has no text.' })
      previous = level
      return false
    }
    if (node.type.name === 'table') {
      tables++
      const firstRow = node.firstChild
      let header = false
      firstRow?.forEach((cell) => (header ||= cell.type.name === 'tableHeader'))
      if (!header) issues.push({ where: `table ${tables}`, problem: 'The table has no header row.' })
      return false
    }
    if (node.isText) {
      const link = node.marks.find((m) => m.type.name === 'link')
      if (link && /^(here|click here|aquí|pincha aquí|haz clic aquí|aquí|ici|cliquez ici|hier)$/i.test(node.text?.trim() ?? '')) {
        issues.push({ where: `link “${node.text}”`, problem: 'The link text does not say where it goes.' })
      }
    }
    return true
  })
  if (!headings && words > 300) issues.push({ where: 'document', problem: 'A long document without headings is hard to navigate with a screen reader.', fix: 'apply_heading on the section titles' })
  return issues
}

// ---------- Tools ----------

const target = {
  match: { type: 'string', description: 'Exact text to act on (as it appears in get_text, without markup).' },
  occurrence: { type: 'integer', minimum: 1, description: 'Which occurrence of "match" (1 = first). Default 1.' },
  from: { type: 'integer', description: 'Start position from find (alternative to "match"; positions change after every edit).' },
  to: { type: 'integer', description: 'End position from find.' },
}

export function writerTools(ctx: WriterContext): AppTools {
  const { editor, session, review } = ctx
  const doc = () => editor.state.doc

  const range = (args: ToolArgs): { from: number; to: number } => {
    const from = optNum(args, 'from')
    const to = optNum(args, 'to')
    if (from !== undefined && to !== undefined) {
      const size = doc().content.size
      if (from < 0 || to > size || from > to) throw new Error(`Positions out of range (0–${size})`)
      return { from, to }
    }
    const match = str(args, 'match')
    const occurrence = Math.max(1, Math.round(num(args, 'occurrence', 1)))
    const matches = findAll(doc(), match, true)
    const m = matches[occurrence - 1]
    if (!m) throw new Error(matches.length ? `Only ${matches.length} occurrence(s) of the text` : 'Text not found (the match is case-sensitive)')
    return m
  }

  const undoManager = () => (yUndoPluginKey.getState(editor.state) as { undoManager?: Y.UndoManager } | undefined)?.undoManager
  // In apply_batch, all edits are one undo step.
  let grouping = false
  // Runs an edit as the assistant: tracked as its suggestions, its authorship, one undo step.
  const asAssistant = <T>(fn: () => T): T => {
    const storage = editor.storage.suggestions
    const saved = { enabled: storage.enabled, user: storage.user, client: storage.client }
    storage.enabled = true
    storage.user = { id: `${AI_USER_ID}:${userIdOf(session)}`, name: aiName(session), color: AI_COLOR }
    storage.client = AI_CLIENT
    if (!grouping) undoManager()?.stopCapturing()
    try {
      return fn()
    } finally {
      Object.assign(storage, saved)
      if (!grouping) undoManager()?.stopCapturing()
    }
  }
  // Edits that suggestions do not track (attributes, atoms): applied directly as one undo step.
  const direct = <T>(fn: () => T): T => {
    if (!grouping) undoManager()?.stopCapturing()
    try {
      return fn()
    } finally {
      if (!grouping) undoManager()?.stopCapturing()
    }
  }
  // Position between top-level blocks: start, end, or before/after the block holding "match".
  const blockPosition = (args: ToolArgs): number => {
    const position = optStr(args, 'position') ?? 'end'
    if (position === 'start') return 0
    if (position === 'end') return doc().content.size
    const $pos = doc().resolve(range(args).from)
    return position === 'before' ? $pos.before(1) : $pos.after(1)
  }
  const quoted = (args: ToolArgs) => {
    const match = optStr(args, 'match')
    return match ? `“${match.length > 60 ? `${match.slice(0, 59)}…` : match}”` : t('the selected text')
  }
  const requireEditable = () => {
    if (!editor.isEditable) throw new Error('The document is read-only in this tab')
  }

  const tools: OfimeoTool[] = [
    {
      name: 'get_text',
      description:
        'Returns the document body as Markdown (default) or plain text. Pending suggestions are shown in CriticMarkup: {++inserted++} and {--deleted--}.',
      inputSchema: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['markdown', 'plain'], description: 'Output format. Default markdown.' },
          max_chars: { type: 'integer', minimum: 100, description: `Truncate the result (default ${MAX_TEXT}).` },
        },
      },
      access: 'view',
      execute: (args) => {
        const text = optStr(args, 'format') === 'plain' ? editor.getText({ blockSeparator: '\n\n' }) : toMarkdown(doc())
        const max = num(args, 'max_chars', MAX_TEXT)
        return text.length > max ? `${text.slice(0, max)}\n\n[truncated: ${text.length - max} more characters]` : text
      },
    },
    {
      name: 'get_outline',
      description: 'Lists the headings of the document in order: level (1–6), text and position.',
      inputSchema: { type: 'object', properties: {} },
      access: 'view',
      execute: () => {
        const headings: { level: number; text: string; position: number }[] = []
        doc().descendants((node, pos) => {
          if (node.type.name === 'heading') headings.push({ level: Number(node.attrs.level), text: node.textContent, position: pos })
          return !node.isTextblock
        })
        return headings
      },
    },
    {
      name: 'find',
      description:
        'Finds text in the document (within paragraphs). Returns up to 50 matches with their positions (usable as from/to by the other tools until the next edit) and some context.',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Text to find.' }, match_case: { type: 'boolean', description: 'Default false.' } },
        required: ['query'],
      },
      access: 'view',
      execute: (args) => {
        const matches = findAll(doc(), str(args, 'query'), bool(args, 'match_case'))
        return { count: matches.length, matches: matches.slice(0, 50) }
      },
    },
    {
      name: 'list_comments',
      description: 'Lists comment threads: id, author, text, the commented text, whether it is resolved, and replies.',
      inputSchema: { type: 'object', properties: { include_resolved: { type: 'boolean', description: 'Default false.' } } },
      access: 'view',
      execute: (args) =>
        review.collectThreads(bool(args, 'include_resolved')).map(({ comment, replies, range: r }) => ({
          id: comment.id,
          author: comment.author,
          text: comment.text,
          on_text: r && r.from < r.to ? doc().textBetween(r.from, r.to, ' ', '▫') : (comment.quote ?? ''),
          resolved: !!comment.resolved,
          replies: replies.map((c) => ({ author: c.author, text: c.text })),
        })),
    },
    {
      name: 'add_comment',
      description: 'Adds a comment on a piece of text (identified by "match" or from/to), or a reply to a comment ("reply_to").',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string', description: 'Comment text.' }, reply_to: { type: 'string', description: 'Id of the comment to answer.' }, ...target },
        required: ['text'],
      },
      access: 'comment',
      execute: (args) => {
        const text = str(args, 'text').trim()
        if (!text) throw new Error('Empty comment')
        const comments = commentsMapOf(session)
        const id = `ai${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
        const base = { id, authorId: userIdOf(session), author: aiName(session), color: AI_COLOR, time: Date.now(), text }
        const parent = optStr(args, 'reply_to')
        if (parent) {
          if (!comments.has(parent)) throw new Error('No comment with that id')
          comments.set(id, { ...base, parent } satisfies CommentRecord)
          return { id }
        }
        const { from, to } = range(args)
        if (from >= to) throw new Error('Select some text to comment on')
        const index = new PositionIndex(session.doc.getXmlFragment('body'), editor.schema)
        const quote = doc().textBetween(from, to, ' ', '▫').slice(0, 200)
        comments.set(id, { ...base, anchor: encodeAnchor(index, from, to), quote } satisfies CommentRecord)
        return { id }
      },
    },
    {
      name: 'insert_text',
      description:
        'Inserts text as a tracked suggestion (the user accepts or rejects it). position "start"/"end" add new paragraphs at the start or end of the document; lines starting with "# " become headings and "- " or "1. " list items. position "before"/"after" insert plain text next to "match".',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to insert.' },
          position: { type: 'string', enum: ['start', 'end', 'before', 'after'], description: 'Where to insert. Default end.' },
          ...target,
        },
        required: ['text'],
      },
      access: 'edit',
      changesDocument: true,
      suggestion: true,
      execute: (args) => {
        requireEditable()
        const text = str(args, 'text')
        if (!text) throw new Error('Empty text')
        const position = optStr(args, 'position') ?? 'end'
        const ok = asAssistant(() => {
          if (position === 'start' || position === 'end') {
            const at = position === 'start' ? 0 : doc().content.size
            return editor.chain().insertContentAt(at, textToBlocks(text), { updateSelection: false }).run()
          }
          const r = range(args)
          const at = position === 'before' ? r.from : r.to
          return editor.chain().insertContentAt(at, inlineNodes(text), { updateSelection: false }).run()
        })
        if (!ok) throw new Error('The text could not be inserted there')
        return { inserted: true, as: 'suggestion', pending_suggestions: collectSuggestions(doc()).length }
      },
    },
    {
      name: 'replace_range',
      description:
        'Replaces a piece of text (identified by "match" or from/to) with new text, as a tracked suggestion: the old text is marked for deletion and the new one as an insertion. An empty replacement suggests deleting the text.',
      inputSchema: {
        type: 'object',
        properties: { replacement: { type: 'string', description: 'New text (plain).' }, ...target },
        required: ['replacement'],
      },
      access: 'edit',
      changesDocument: true,
      suggestion: true,
      execute: (args) => {
        requireEditable()
        const { from, to } = range(args)
        const replacement = str(args, 'replacement', '')
        const ok = asAssistant(() =>
          replacement
            ? editor.chain().insertContentAt({ from, to }, inlineNodes(replacement), { updateSelection: false }).run()
            : editor.chain().deleteRange({ from, to }).run(),
        )
        if (!ok) throw new Error('The text could not be replaced')
        return { replaced: true, as: 'suggestion' }
      },
    },
    {
      name: 'delete_text',
      description: 'Suggests deleting a piece of text (identified by "match" or from/to): it is marked for deletion until the user accepts or rejects the suggestion.',
      inputSchema: { type: 'object', properties: { ...target } },
      access: 'edit',
      changesDocument: true,
      suggestion: true,
      execute: (args) => {
        requireEditable()
        const { from, to } = range(args)
        if (from >= to) throw new Error('Empty range')
        if (!asAssistant(() => editor.chain().deleteRange({ from, to }).run())) throw new Error('The text could not be deleted')
        return { deleted: true, as: 'suggestion' }
      },
    },
    {
      name: 'insert_markdown',
      description:
        'Inserts Markdown as tracked suggestions: headings, lists, checklists, tables, quotes, links, **bold**, *italic*, `code`, pictures from data: URLs. position "start" or "end" of the document (default end), or "before"/"after" the paragraph containing "match".',
      inputSchema: {
        type: 'object',
        properties: { markdown: { type: 'string' }, position: { type: 'string', enum: ['start', 'end', 'before', 'after'] }, ...target },
        required: ['markdown'],
      },
      access: 'edit',
      changesDocument: true,
      suggestion: true,
      execute: async (args) => {
        requireEditable()
        const markdown = str(args, 'markdown')
        if (markdown.length > MAX_TEXT) throw new Error(`Markdown too long (at most ${MAX_TEXT} characters)`)
        const { importMarkdown } = await import('./formats/markdown')
        const content = (await importMarkdown(markdown)).content ?? []
        if (!content.length) throw new Error('Nothing to insert')
        const at = blockPosition(args)
        if (!asAssistant(() => editor.chain().insertContentAt(at, content, { updateSelection: false }).run())) throw new Error('The text could not be inserted there')
        return { inserted: content.length, as: 'suggestion' }
      },
    },
    {
      name: 'insert_equation',
      description: 'Inserts a LaTeX equation (e.g. "\\frac{a}{b}"), in the text (inline, after "match" or at the end) or as its own line (display). Applied directly; one undo step.',
      inputSchema: {
        type: 'object',
        properties: { latex: { type: 'string' }, display: { type: 'boolean', description: 'Own centered line (default false).' }, position: { type: 'string', enum: ['end', 'before', 'after'] }, ...target },
        required: ['latex'],
      },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Insert the equation {latex}', { latex: String(args.latex ?? '').slice(0, 80) }),
      execute: (args) => {
        requireEditable()
        const latex = str(args, 'latex').trim()
        if (!latex) throw new Error('Empty equation')
        const node = { type: 'equation', attrs: { latex, display: bool(args, 'display') } }
        const position = optStr(args, 'position') ?? (args.match || args.from !== undefined ? 'after' : 'end')
        const content = position === 'end' ? [{ type: 'paragraph', content: [node] }] : [node]
        const at = position === 'end' ? doc().content.size : position === 'before' ? range(args).from : range(args).to
        if (!direct(() => editor.chain().insertContentAt(at, content, { updateSelection: false }).run())) throw new Error('The equation could not be inserted there')
        return { inserted: true }
      },
    },
    {
      name: 'add_function_graph',
      description:
        'Inserts a math graph (an editable picture with alternative text): "expressions" as typed in the graph editor, e.g. "f(x) = x^2 - 1", "y = 2x + 1", "x^2 + y^2 = 9", "y < x", "A = (1, 2)", "Segment(A, B)"; optional window xmin/xmax/ymin/ymax, special (roots and extrema), degrees. Placed as its own paragraph at the end or after the paragraph containing "match". Applied directly; one undo step. Returns the alternative text and any expression errors.',
      inputSchema: {
        type: 'object',
        properties: {
          expressions: { type: 'array', items: { type: 'string' } },
          xmin: { type: 'number' },
          xmax: { type: 'number' },
          ymin: { type: 'number' },
          ymax: { type: 'number' },
          special: { type: 'boolean' },
          degrees: { type: 'boolean' },
          position: { type: 'string', enum: ['end', 'after'] },
          ...target,
        },
        required: ['expressions'],
      },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Insert a graph of {list}', { list: (Array.isArray(args.expressions) ? args.expressions : []).join(', ').slice(0, 100) }),
      execute: async (args) => {
        requireEditable()
        const [{ graphFromSpec }, { TITLE_PREFIX }] = await Promise.all([import('../../ui/mathgraph/spec'), import('../../ui/mathgraph/model')])
        const graph = await graphFromSpec({ ...(args as object), expressions: Array.isArray(args.expressions) ? args.expressions.map(String) : [] })
        const image = { type: 'image', attrs: { src: graph.png, alt: graph.alt, title: TITLE_PREFIX + JSON.stringify(graph.doc), width: graph.width, height: graph.height } }
        const at = optStr(args, 'position') === 'after' || args.match ? blockPosition({ ...args, position: 'after' }) : doc().content.size
        if (!direct(() => editor.chain().insertContentAt(at, [{ type: 'paragraph', content: [image] }], { updateSelection: false }).run())) throw new Error('The graph could not be inserted there')
        return { inserted: true, alt: graph.alt, ...(graph.errors.length ? { errors: graph.errors } : {}) }
      },
    },
    {
      name: 'list_references',
      description: 'Lists the sources of the document’s bibliography (id, type, authors, title, date, container, publisher, url) and the citation style.',
      inputSchema: { type: 'object', properties: {} },
      access: 'view',
      execute: () => ({
        style: ctx.references.settings().style,
        sources: ctx.references.sources().map((s) => ({ id: s.id, type: s.type, authors: s.authors.map(personText), title: s.title, ...pick(s, ['date', 'container', 'publisher', 'place', 'pages', 'url', 'doi']) })),
      }),
    },
    {
      name: 'add_reference',
      description: `Adds a source to the bibliography (cite it with cite). type: ${SOURCE_TYPES.join(', ')}; authors as "Family, Given" (or an organization name); date "2020" or "2020-05-17"; container = journal, book of a chapter or website.`,
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: SOURCE_TYPES },
          authors: { type: 'array', items: { type: 'string' } },
          title: { type: 'string' },
          date: { type: 'string' },
          container: { type: 'string' },
          publisher: { type: 'string' },
          place: { type: 'string' },
          volume: { type: 'string' },
          issue: { type: 'string' },
          pages: { type: 'string' },
          edition: { type: 'string' },
          url: { type: 'string' },
          doi: { type: 'string' },
          accessed: { type: 'string' },
        },
        required: ['type', 'title'],
      },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Add the source “{title}” to the bibliography', { title: String(args.title ?? '') }),
      execute: (args) => {
        requireEditable()
        const type = str(args, 'type') as SourceType
        if (!SOURCE_TYPES.includes(type)) throw new Error(`Unknown source type "${type}"`)
        const authors: Person[] = (Array.isArray(args.authors) ? args.authors.map(String) : []).map((a) => {
          const [family, given] = a.split(',').map((x) => x.trim())
          // Without "Family, Given" the name is kept whole (an organization or a single name).
          return given ? { family, given } : { family: a.trim(), org: true }
        })
        const source: Source = { id: newSourceId(), type, authors, title: str(args, 'title'), ...pick(args as Record<string, unknown>, ['date', 'container', 'publisher', 'place', 'volume', 'issue', 'pages', 'edition', 'url', 'doi', 'accessed']) }
        ctx.references.save(source)
        return { id: source.id }
      },
    },
    {
      name: 'cite',
      description: 'Inserts a citation of one or more sources (ids from list_references) after "match" (or at from/to), formatted in the document’s citation style; "locator" adds a page ("p. 12"). Applied directly; one undo step.',
      inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } }, locator: { type: 'string' }, ...target }, required: ['ids'] },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Cite a source after {text}', { text: quoted(args) }),
      execute: (args) => {
        requireEditable()
        const ids = (Array.isArray(args.ids) ? args.ids : [args.ids]).map(String)
        for (const id of ids) if (!ctx.references.get(id)) throw new Error(`No source with id "${id}" (use list_references)`)
        const at = range(args).to
        if (!direct(() => editor.chain().insertContentAt(at, { type: 'citation', attrs: { ids, locator: optStr(args, 'locator') ?? '' } }, { updateSelection: false }).run())) throw new Error('The citation could not be inserted there')
        return { cited: ids }
      },
    },
    {
      name: 'insert_bibliography',
      description: 'Adds the bibliography (the list of cited sources, formatted and kept up to date) at the end of the document, with an optional heading.',
      inputSchema: { type: 'object', properties: { title: { type: 'string' } } },
      access: 'edit',
      changesDocument: true,
      summary: () => t('Insert the bibliography'),
      execute: (args) => {
        requireEditable()
        let exists = false
        doc().descendants((node) => ((exists ||= node.type.name === 'bibliography'), !exists))
        if (exists) throw new Error('The document already has a bibliography')
        const title = optStr(args, 'title')
        const at = doc().content.size
        const content = [...(title ? [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: title }] }] : []), { type: 'bibliography' }]
        if (!direct(() => editor.chain().insertContentAt(at, content, { updateSelection: false }).run())) throw new Error('The bibliography could not be inserted')
        return { inserted: true }
      },
    },
    {
      name: 'insert_table',
      description: 'Inserts a table as a tracked suggestion: "rows" is a 2-D array of cell texts (the first row is the header unless header is false), at the end of the document or before/after the paragraph containing "match".',
      inputSchema: {
        type: 'object',
        properties: {
          rows: { type: 'array', items: { type: 'array', items: { type: ['string', 'number', 'boolean', 'null'] } } },
          header: { type: 'boolean', description: 'Default true.' },
          position: { type: 'string', enum: ['start', 'end', 'before', 'after'] },
          ...target,
        },
        required: ['rows'],
      },
      access: 'edit',
      changesDocument: true,
      suggestion: true,
      execute: (args) => {
        requireEditable()
        const rows = Array.isArray(args.rows) ? (args.rows as unknown[][]).filter(Array.isArray) : []
        const cols = Math.max(0, ...rows.map((r) => r.length))
        if (!rows.length || !cols) throw new Error('Give rows of cells')
        if (rows.length * cols > 5000) throw new Error('Table too large (at most 5000 cells)')
        const header = args.header !== false
        const cell = (value: unknown, head: boolean) => ({
          type: head ? 'tableHeader' : 'tableCell',
          content: [{ type: 'paragraph', content: value === null || value === undefined || value === '' ? [] : [{ type: 'text', text: String(value) }] }],
        })
        const table = { type: 'table', content: rows.map((row, r) => ({ type: 'tableRow', content: Array.from({ length: cols }, (_x, c) => cell(row[c], header && r === 0)) })) }
        if (!asAssistant(() => editor.chain().insertContentAt(blockPosition(args), [table, { type: 'paragraph' }], { updateSelection: false }).run())) throw new Error('The table could not be inserted there')
        return { inserted: true, rows: rows.length, columns: cols, as: 'suggestion' }
      },
    },
    {
      name: 'insert_link',
      description: 'Turns a piece of text (match or from/to) into a link to a web address (http, https or mailto), or removes the link with url "". Applied directly; one undo step.',
      inputSchema: { type: 'object', properties: { url: { type: 'string' }, ...target }, required: ['url'] },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Link {text} to {url}', { text: quoted(args), url: String(args.url ?? '') }),
      execute: (args) => {
        requireEditable()
        const { from, to } = range(args)
        if (from >= to) throw new Error('Empty range')
        const url = str(args, 'url', '').trim()
        const link = editor.schema.marks.link
        if (!link) throw new Error('Links are not available')
        if (url && !/^(https?:\/\/|mailto:)/i.test(url)) throw new Error('Only http, https and mailto addresses')
        direct(() => editor.view.dispatch(url ? editor.state.tr.addMark(from, to, link.create({ href: url })) : editor.state.tr.removeMark(from, to, link)))
        return { linked: !!url }
      },
    },
    {
      name: 'insert_chart',
      description: `Inserts a chart with the data given (not linked to a spreadsheet): type (${CHART_TYPES.join(', ')}), title, labels (categories), series [{name, values}], optional axis titles and a caption; at the end of the document or after the paragraph containing "match". Applied directly; one undo step.`,
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: CHART_TYPES },
          title: { type: 'string' },
          labels: { type: 'array', items: { type: ['string', 'number'] } },
          series: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, values: { type: 'array', items: { type: ['number', 'null'] } } } } },
          x_title: { type: 'string' },
          y_title: { type: 'string' },
          caption: { type: 'string' },
          ...target,
        },
        required: ['labels', 'series'],
      },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Insert the chart “{title}”', { title: String(args.title ?? '') }),
      execute: async (args) => {
        requireEditable()
        const [{ chartFromData, chartJson }, { CHART_HEIGHT, CHART_WIDTH }] = await Promise.all([import('../charts/embedded'), import('./editor/chart')])
        const chart = chartFromData({
          type: optStr(args, 'type') ?? 'column',
          title: optStr(args, 'title'),
          labels: Array.isArray(args.labels) ? args.labels : [],
          series: Array.isArray(args.series) ? (args.series as { name?: unknown; values?: unknown[] }[]) : [],
          xTitle: optStr(args, 'x_title'),
          yTitle: optStr(args, 'y_title'),
        })
        const at = args.match || args.from !== undefined ? blockPosition({ ...args, position: 'after' }) : doc().content.size
        const node = { type: 'chart', attrs: { chart: chartJson(chart), width: CHART_WIDTH, height: CHART_HEIGHT, caption: optStr(args, 'caption') ?? '' } }
        if (!direct(() => editor.chain().insertContentAt(at, node, { updateSelection: false }).run())) throw new Error('The chart could not be inserted there')
        return { inserted: true }
      },
    },
    {
      name: 'resolve_comment',
      description: 'Marks a comment thread (id from list_comments) as resolved, or open again with resolved false.',
      inputSchema: { type: 'object', properties: { id: { type: 'string' }, resolved: { type: 'boolean' } }, required: ['id'] },
      access: 'comment',
      execute: (args) => {
        const comments = commentsMapOf(session)
        const comment = comments.get(str(args, 'id')) as CommentRecord | undefined
        if (!comment || comment.parent) throw new Error('No comment thread with that id')
        comments.set(comment.id, { ...comment, resolved: args.resolved !== false })
        return { id: comment.id, resolved: args.resolved !== false }
      },
    },
    {
      name: 'list_suggestions',
      description: 'Lists the pending suggestions (tracked changes): id, insertion or deletion, author, text, and whether it is yours (the AI assistant’s).',
      inputSchema: { type: 'object', properties: {} },
      access: 'view',
      execute: () =>
        collectSuggestions(doc()).map((x) => ({ id: x.id, kind: x.kind, author: x.author, text: x.text, mine: x.authorId.startsWith(`${AI_USER_ID}:`) })),
    },
    {
      name: 'withdraw_suggestion',
      description: 'Withdraws one of YOUR pending suggestions (id from list_suggestions; not other people’s): an insertion disappears, a deletion is kept as text. Accepting or rejecting other suggestions is up to the user.',
      inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      access: 'edit',
      changesDocument: true,
      suggestion: true,
      execute: (args) => {
        requireEditable()
        const found = collectSuggestions(doc()).find((x) => x.id === args.id)
        if (!found) throw new Error('No pending suggestion with that id')
        if (!found.authorId.startsWith(`${AI_USER_ID}:`)) throw new Error('Only your own suggestions can be withdrawn; the user decides on the others')
        // A table or list the assistant inserted goes away with its last suggested text.
        const $pos = doc().resolve(found.from)
        let container = -1
        for (let d = $pos.depth; d > 0; d--) if (CONTAINERS.has($pos.node(d).type.name)) container = $pos.before(d)
        const containerNode = container >= 0 ? doc().nodeAt(container) : null
        const containerId = containerNode ? containerNode.type.name : null
        let removed = false
        direct(() => {
          if (!editor.commands.rejectSuggestion(found.id)) throw new Error('The suggestion could not be withdrawn')
          if (container < 0) return
          const node = editor.state.doc.nodeAt(container)
          if (node && node.type.name === containerId && !node.textContent.trim() && !collectSuggestions(node).length) {
            editor.view.dispatch(editor.state.tr.delete(container, container + node.nodeSize))
            removed = true
          }
        })
        return { withdrawn: found.id, ...(removed ? { removed_empty: containerId } : {}) }
      },
    },
    {
      name: 'get_stats',
      description:
        'Counts and readability of the text: characters, words, sentences, paragraphs, average words per sentence and syllables per word, reading time and a readability score for the document’s language (Flesch for English, Fernández Huerta for Spanish and Galician, Kandel–Moles for French, Amstad for German; approximate syllable counting).',
      inputSchema: { type: 'object', properties: {} },
      access: 'view',
      execute: () => textStats(editor.getText({ blockSeparator: '\n\n' }), String(ctx.spell.docLang() ?? 'en')),
    },
    {
      name: 'set_alt_text',
      description: 'Sets the description (alternative text) of a picture, read by screen readers: "image" is its number in the document (1 = first, see check_accessibility). Applied directly; one undo step.',
      inputSchema: { type: 'object', properties: { image: { type: 'integer', minimum: 1 }, text: { type: 'string' } }, required: ['image', 'text'] },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Describe picture {n}: “{text}”', { n: String(args.image), text: String(args.text ?? '').slice(0, 80) }),
      execute: (args) => {
        requireEditable()
        const n = Math.round(num(args, 'image'))
        const found = images(doc())[n - 1]
        if (!found) throw new Error(`There is no picture ${n} (there are ${images(doc()).length})`)
        const alt = str(args, 'text').trim()
        // Attributes are not tracked by suggestions: applied directly, one undo step.
        if (!grouping) undoManager()?.stopCapturing()
        editor.view.dispatch(editor.state.tr.setNodeMarkup(found.pos, undefined, { ...found.node.attrs, alt }))
        if (!grouping) undoManager()?.stopCapturing()
        if (String(images(doc())[n - 1]?.node.attrs.alt ?? '') !== alt) throw new Error('The description could not be set')
        return { image: n, alt }
      },
    },
    {
      name: 'apply_heading',
      description:
        'Turns the paragraph(s) containing the text (match or from/to) into a heading of level 1–6, or back into normal text with level 0. Applied directly (headings are not tracked as suggestions); undoable in one step.',
      inputSchema: {
        type: 'object',
        properties: { level: { type: 'integer', minimum: 0, maximum: 6, description: 'Heading level; 0 = normal text.' }, ...target },
        required: ['level'],
      },
      access: 'edit',
      changesDocument: true,
      summary: (args) => (num(args, 'level', 0) >= 1 ? t('Make {text} a heading of level {level}', { text: quoted(args), level: Math.round(num(args, 'level', 1)) }) : t('Make {text} normal text', { text: quoted(args) })),
      execute: (args) => {
        requireEditable()
        const { from, to } = range(args)
        const level = Math.round(num(args, 'level'))
        const schema = editor.schema
        const ok = asAssistant(() =>
          editor
            .chain()
            .command(({ tr }) => {
              if (level < 1 || level > 6) tr.setBlockType(from, to, schema.nodes.paragraph)
              else tr.setBlockType(from, to, schema.nodes.heading, { level })
              return true
            })
            .run(),
        )
        if (!ok) throw new Error('Could not change the paragraph style')
        return { applied: true }
      },
    },
    {
      name: 'format',
      description:
        'Sets or removes character formatting on a piece of text (match or from/to): bold, italic, underline, strike, code, highlight (true or a CSS color). Applied directly (formatting is not tracked as suggestions); undoable in one step.',
      inputSchema: {
        type: 'object',
        properties: {
          bold: { type: 'boolean' },
          italic: { type: 'boolean' },
          underline: { type: 'boolean' },
          strike: { type: 'boolean' },
          code: { type: 'boolean' },
          highlight: { type: ['boolean', 'string'], description: 'true (yellow), a CSS color, or false to remove.' },
          ...target,
        },
      },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Change the formatting of {text}', { text: quoted(args) }),
      execute: (args) => {
        requireEditable()
        const { from, to } = range(args)
        if (from >= to) throw new Error('Empty range')
        const schema = editor.schema
        const changes: string[] = []
        const ok = asAssistant(() =>
          editor
            .chain()
            .command(({ tr }) => {
              for (const name of ['bold', 'italic', 'underline', 'strike', 'code', 'highlight']) {
                const value = args[name]
                const type = schema.marks[name]
                if (value === undefined || !type) continue
                if (value === false) tr.removeMark(from, to, type)
                else {
                  const mark: Mark = name === 'highlight' && typeof value === 'string' ? type.create({ color: value }) : type.create()
                  tr.addMark(from, to, mark)
                }
                changes.push(name)
              }
              return changes.length > 0
            })
            .run(),
        )
        if (!ok) throw new Error('Nothing to format: pass at least one of bold, italic, underline, strike, code, highlight')
        return { formatted: changes }
      },
    },
  ]

  return {
    tools,
    group: async (fn) => {
      grouping = true
      try {
        return await groupYUndo([undoManager()], fn)
      } finally {
        grouping = false
      }
    },
    selection: () => {
      const { from, to, empty } = editor.state.selection
      const $from = editor.state.selection.$from
      const paragraph = $from.parent.isTextblock ? $from.parent.textContent : ''
      if (empty) return { kind: 'cursor', position: from, paragraph }
      return { kind: 'text', from, to, text: doc().textBetween(from, to, '\n', '￼'), paragraph }
    },
    show: (args) => {
      const r = range(args)
      editor.chain().focus().setTextSelection(r).scrollIntoView().run()
      return { shown: true, from: r.from, to: r.to }
    },
    showSchema: target,
    render: async (args) => {
      const [{ exportPdf }, { openPdf }, { pdfPageToPng }] = await Promise.all([import('./pdf'), import('../pdf/pdfjs'), import('../../core/webmcp/render')])
      const pdf = await openPdf(new Uint8Array(await (await exportPdf(ctx)).arrayBuffer()))
      try {
        const n = Math.max(1, Math.min(pdf.numPages, Math.round(num(args, 'page', 1))))
        return imageResult(await pdfPageToPng(await pdf.getPage(n)), `Page ${n} of ${pdf.numPages}`)
      } finally {
        void pdf.loadingTask.destroy()
      }
    },
    renderSchema: { page: { type: 'integer', minimum: 1, description: 'Page number (1 = first; default 1).' } },
    serialize: (ydoc) => toMarkdown(yXmlFragmentToProseMirrorRootNode(ydoc.getXmlFragment('body'), editor.schema)),
    paragraphs: () => textParts(doc()),
    accessibility: () => accessibilityIssues(doc(), editor.storage.characterCount.words() as number),
    info: () => ({
      words: editor.storage.characterCount.words() as number,
      pages: ctx.pages(),
      pending_suggestions: collectSuggestions(doc()).length,
      open_comments: review.collectThreads(false).length,
      ai_changes: session.canEdit ? 'Text changes are added as suggestions authored by the AI assistant; the user accepts or rejects them.' : 'none (read-only)',
    }),
  }
}

// ---------- Readability ----------

const VOWELS = /[aeiouyáéíóúàèìòùâêîôûäëïöüœæ]+/giu

function syllables(word: string): number {
  const w = word.toLowerCase()
  const groups = w.match(VOWELS)?.length ?? 0
  // English silent final e.
  return Math.max(1, groups - (w.length > 2 && w.endsWith('e') && !/[aeiouy]e$/.test(w) ? 1 : 0))
}

export function textStats(text: string, lang: string) {
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []
  const sentences = Math.max(1, (text.match(/[^.!?…]+[.!?…]+(?=\s|$)/gu) ?? []).length || (words.length ? 1 : 0))
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim()).length
  const syl = words.reduce((n, w) => n + syllables(w), 0)
  const wps = words.length / sentences
  const spw = words.length ? syl / words.length : 0
  const code = lang.slice(0, 2).toLowerCase()
  const round = (n: number) => Math.round(n * 10) / 10
  let readability: { index: string; score: number } | null = null
  if (words.length >= 10) {
    if (code === 'es' || code === 'gl') readability = { index: 'Fernández Huerta', score: round(206.84 - 0.6 * spw * 100 - 1.02 * (sentences / words.length) * 100) }
    else if (code === 'fr') readability = { index: 'Kandel–Moles', score: round(207 - 1.015 * wps - 73.6 * spw) }
    else if (code === 'de') readability = { index: 'Amstad', score: round(180 - wps - 58.5 * spw) }
    else readability = { index: 'Flesch reading ease', score: round(206.835 - 1.015 * wps - 84.6 * spw) }
  }
  return {
    characters: text.replace(/\n/g, '').length,
    words: words.length,
    sentences: words.length ? sentences : 0,
    paragraphs,
    words_per_sentence: round(wps),
    syllables_per_word: round(spw),
    reading_minutes: round(words.length / 200),
    language: lang,
    // 0–100: higher is easier (60–70 plain language; under 30 very difficult).
    readability,
  }
}

const personText = (p: Person) => (p.given ? `${p.family}, ${p.given}` : p.family)

function pick(source: object, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of keys) {
    const v = (source as Record<string, unknown>)[key]
    if (typeof v === 'string' && v.trim()) out[key] = v.trim()
  }
  return out
}

// Plain text as inline content (line breaks become hard breaks).
function inlineNodes(text: string): JSONContent[] {
  const out: JSONContent[] = []
  text.split('\n').forEach((line, i) => {
    if (i) out.push({ type: 'hardBreak' })
    if (line) out.push({ type: 'text', text: line })
  })
  return out
}
