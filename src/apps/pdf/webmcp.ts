// WebMCP tools of the PDF app (see src/core/webmcp). Loaded only while the
// switch is on. Notes live in the comments channel (comment links may add
// them); highlights are annotations of the document (edit links), each one a
// single step of the annotation undo history, authored "AI assistant (<user>)".

import type { Session } from '../../core/session'
import { AI_COLOR, aiName } from '../../core/webmcp/ai'
import { bool, num, optNum, optStr, str, type AppTools, type OfimeoTool, type ToolArgs } from '../../core/webmcp/types'
import { userIdOf } from '../writer/collab'
import type { Editor } from './editor'
import { apply, viewTransform } from './geometry'
import { newId, notesMap, type Note, type PageEntry } from './model'
import type { Viewer } from './viewer'

const MAX_TEXT = 200_000

interface TextItem {
  str: string
  transform: number[]
  width: number
  height: number
  hasEOL?: boolean
}

// View-space rectangles [x, y, w, h] of the characters [start, end) of a page's text.
async function textRects(viewer: Viewer, entry: PageEntry, start: number, end: number): Promise<[number, number, number, number][]> {
  const page = await viewer.page(entry.src)
  const content = await page.getTextContent()
  const { toView } = viewTransform(entry)
  const rects: [number, number, number, number][] = []
  let offset = 0
  for (const raw of content.items) {
    if (!('str' in raw)) continue
    const item = raw as TextItem
    const len = item.str.length
    const a = Math.max(start, offset)
    const b = Math.min(end, offset + len)
    if (a < b && len) {
      const [, , c, d, e, f] = item.transform
      const size = item.height || Math.hypot(c, d) || 10
      const x0 = e + (item.width * (a - offset)) / len
      const x1 = e + (item.width * (b - offset)) / len
      const corners = [apply(toView, x0, f - size * 0.2), apply(toView, x1, f + size * 0.85)]
      const xs = corners.map((p) => p[0])
      const ys = corners.map((p) => p[1])
      const r = (n: number) => Math.round(n * 100) / 100
      rects.push([r(Math.min(...xs)), r(Math.min(...ys)), r(Math.abs(xs[1] - xs[0])), r(Math.abs(ys[1] - ys[0]))])
    }
    offset += len + (item.hasEOL ? 1 : 0)
  }
  return rects
}

export function pdfTools(session: Session, viewer: Viewer, editor: Editor): AppTools {
  const pages = () => viewer.views.map((v) => v.entry)
  const pageAt = (args: ToolArgs): { entry: PageEntry; index: number } => {
    const n = Math.round(num(args, 'page'))
    const entry = pages()[n - 1]
    if (!entry) throw new Error(`There is no page ${n} (there are ${pages().length})`)
    return { entry, index: n - 1 }
  }
  const pageArg = { page: { type: 'integer', minimum: 1, description: 'Page number (1 = first).' } }

  const tools: OfimeoTool[] = [
    {
      name: 'get_text',
      description: 'Returns the text of the PDF page by page (all pages, or one with "page"). Scanned pages without a text layer and inserted blank pages have no text.',
      inputSchema: { type: 'object', properties: { ...pageArg, max_chars: { type: 'integer', minimum: 100 } } },
      access: 'view',
      execute: async (args) => {
        if (!viewer.pdf && pages().every((p) => p.src !== -1)) throw new Error('The PDF is still loading')
        const only = optNum(args, 'page')
        const list = only === undefined ? pages().map((_e, i) => i) : [pageAt(args).index]
        const max = num(args, 'max_chars', MAX_TEXT)
        let total = 0
        const out: { page: number; text: string }[] = []
        for (const i of list) {
          if (total >= max) break
          let text = await viewer.pageText(i)
          if (total + text.length > max) text = `${text.slice(0, max - total)} [truncated]`
          total += text.length
          out.push({ page: i + 1, text })
        }
        return { pages: pages().length, text: out }
      },
    },
    {
      name: 'list_comments',
      description: 'Lists the notes (comments) on the PDF: id, page, author, text, resolved and replies.',
      inputSchema: { type: 'object', properties: { include_resolved: { type: 'boolean' } } },
      access: 'view',
      execute: (args) => {
        const all = [...notesMap(session).values()]
        const order = pages().map((p) => p.id)
        return all
          .filter((n) => !n.parent && (bool(args, 'include_resolved') || !n.resolved))
          .sort((a, b) => order.indexOf(a.page ?? '') - order.indexOf(b.page ?? '') || a.time - b.time)
          .map((n) => ({
            id: n.id,
            page: order.indexOf(n.page ?? '') + 1 || null,
            author: n.author,
            text: n.text,
            resolved: !!n.resolved,
            replies: all.filter((r) => r.parent === n.id).map((r) => ({ author: r.author, text: r.text })),
          }))
      },
    },
    {
      name: 'add_note',
      description: 'Adds a sticky note (comment) on a page, at x/y in points from the top left (default: top left corner), or a reply to a note ("reply_to").',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string' }, ...pageArg, x: { type: 'number' }, y: { type: 'number' }, reply_to: { type: 'string' } },
        required: ['text'],
      },
      access: 'comment',
      execute: (args) => {
        const text = str(args, 'text').trim()
        if (!text) throw new Error('Empty note')
        const map = notesMap(session)
        const base: Note = { id: newId(), authorId: userIdOf(session), author: aiName(session), color: AI_COLOR, time: Date.now(), text }
        const parent = optStr(args, 'reply_to')
        if (parent) {
          if (!map.has(parent)) throw new Error('No note with that id')
          map.set(base.id, { ...base, parent })
        } else {
          const { entry } = pageAt(args)
          map.set(base.id, { ...base, page: entry.id, x: Math.min(entry.w - 10, Math.max(0, num(args, 'x', 24))), y: Math.min(entry.h - 10, Math.max(0, num(args, 'y', 24))) })
        }
        return { id: base.id }
      },
    },
    {
      name: 'add_highlight',
      description: 'Highlights text on a page (the first occurrence, or "occurrence"). Case-sensitive. One undo step.',
      inputSchema: {
        type: 'object',
        properties: {
          ...pageArg,
          text: { type: 'string', description: 'Text to highlight, as returned by get_text.' },
          occurrence: { type: 'integer', minimum: 1 },
          color: { type: 'string', description: 'CSS color (default yellow).' },
        },
        required: ['page', 'text'],
      },
      access: 'edit',
      changesDocument: true,
      execute: async (args) => {
        if (!editor.canEdit) throw new Error('The PDF is read-only in this tab')
        const { entry, index } = pageAt(args)
        if (entry.src === -1) throw new Error('This page has no text')
        const query = str(args, 'text')
        const pageText = await viewer.pageText(index)
        const nth = Math.max(1, Math.round(num(args, 'occurrence', 1)))
        let at = -1
        for (let i = 0; i < nth; i++) {
          at = pageText.indexOf(query, at + 1)
          if (at < 0) throw new Error(i ? `Only ${i} occurrence(s) on this page` : 'Text not found on this page')
        }
        const rects = await textRects(viewer, entry, at, at + query.length)
        if (!rects.length) throw new Error('Could not locate the text on the page')
        const added = editor.add({ type: 'highlight', page: entry.id, color: optStr(args, 'color') ?? '#ffd400', rects, quote: query })
        editor.replace({ ...added, author: aiName(session) })
        return { id: added.id }
      },
    },
  ]
  return {
    tools,
    info: () => ({ pages: pages().length, notes: [...notesMap(session).values()].filter((n) => !n.parent).length }),
  }
}
