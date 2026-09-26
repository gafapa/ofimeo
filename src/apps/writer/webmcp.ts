// WebMCP tools of the writer (see src/core/webmcp). Loaded only while the
// switch is on. Text changes by the assistant are always tracked suggestions
// (insertions and deletions the user accepts or rejects), authored "AI
// assistant (<user>)"; formatting and headings, which suggestions do not
// track, are applied directly as one undo step. Comments go to the comments
// channel like the user's own.

import type { JSONContent } from '@tiptap/core'
import type { Mark, Node as PMNode } from '@tiptap/pm/model'
import { yUndoPluginKey } from '@tiptap/y-tiptap'
import { AI_CLIENT, AI_COLOR, AI_USER_ID, aiName } from '../../core/webmcp/ai'
import { bool, num, optNum, optStr, str, type AppTools, type OfimeoTool, type ToolArgs } from '../../core/webmcp/types'
import type { WriterContext } from './app'
import { commentsMapOf, userIdOf } from './collab'
import { collectSuggestions } from './editor/suggestions'
import type { CommentRecord } from './review'
import { encodeAnchor, PositionIndex } from './ypos'

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

  const undoManager = () => (yUndoPluginKey.getState(editor.state) as { undoManager?: { stopCapturing(): void } } | undefined)?.undoManager
  // Runs an edit as the assistant: tracked as its suggestions, its authorship, one undo step.
  const asAssistant = <T>(fn: () => T): T => {
    const storage = editor.storage.suggestions
    const saved = { enabled: storage.enabled, user: storage.user, client: storage.client }
    storage.enabled = true
    storage.user = { id: `${AI_USER_ID}:${userIdOf(session)}`, name: aiName(session), color: AI_COLOR }
    storage.client = AI_CLIENT
    undoManager()?.stopCapturing()
    try {
      return fn()
    } finally {
      Object.assign(storage, saved)
      undoManager()?.stopCapturing()
    }
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
    info: () => ({
      words: editor.storage.characterCount.words() as number,
      pages: ctx.pages(),
      pending_suggestions: collectSuggestions(doc()).length,
      open_comments: review.collectThreads(false).length,
      ai_changes: session.canEdit ? 'Text changes are added as suggestions authored by the AI assistant; the user accepts or rejects them.' : 'none (read-only)',
    }),
  }
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
