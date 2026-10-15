// WebMCP tools of the PDF app (see src/core/webmcp). Loaded only while the
// switch is on. Notes live in the comments channel (comment links may add
// them); highlights are annotations of the document (edit links), each one a
// single step of the annotation undo history, authored "AI assistant (<user>)".

import { t } from '../../core/i18n'
import type { Session } from '../../core/session'
import { groupYUndo } from '../../core/webmcp/undo'
import { AI_COLOR, aiName } from '../../core/webmcp/ai'
import { bool, imageResult, num, optNum, optStr, str, type AppTools, type OfimeoTool, type ToolArgs } from '../../core/webmcp/types'
import { userIdOf } from '../writer/collab'
import type { Editor } from './editor'
import { apply, viewTransform } from './geometry'
import { annotsMap, newId, notesMap, pagesArray, type Note, type PageEntry } from './model'
import { describe, measure } from './render'
import { stampSize } from './draw'
import { findAll, type Viewer } from './viewer'
import { gradeText, stampPresets } from './stamps'

const MAX_TEXT = 200_000
const MARKUP_COLORS = { highlight: '#ffd400', underline: '#1565c0', strike: '#c62828' } as const
const STAMPS = ['check', 'cross', 'good', 'revise', 'grade', 'custom']

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
  const requireEdit = () => {
    if (!editor.canEdit) throw new Error('The PDF is read-only in this tab')
  }

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
    ...(['highlight', 'underline', 'strike'] as const).map(
      (type): OfimeoTool => ({
        name: `add_${type}`,
        description: `${type === 'highlight' ? 'Highlights' : type === 'underline' ? 'Underlines' : 'Strikes through'} text on a page (the first occurrence, or "occurrence"). Case-sensitive. One undo step.`,
        inputSchema: {
          type: 'object',
          properties: {
            ...pageArg,
            text: { type: 'string', description: 'Text to mark, as returned by get_text.' },
            occurrence: { type: 'integer', minimum: 1 },
            color: { type: 'string', description: `CSS color (default ${MARKUP_COLORS[type]}).` },
          },
          required: ['page', 'text'],
        },
        access: 'edit',
        changesDocument: true,
        summary: (args) =>
          (type === 'highlight' ? t('Highlight “{text}” on page {n}', { text: String(args.text ?? '').slice(0, 80), n: String(args.page ?? '') }) : type === 'underline' ? t('Underline “{text}” on page {n}', { text: String(args.text ?? '').slice(0, 80), n: String(args.page ?? '') }) : t('Strike through “{text}” on page {n}', { text: String(args.text ?? '').slice(0, 80), n: String(args.page ?? '') })),
        execute: async (args) => {
          requireEdit()
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
          const added = editor.add({ type, page: entry.id, color: optStr(args, 'color') ?? MARKUP_COLORS[type], rects, quote: query })
          editor.replace({ ...added, author: aiName(session) })
          return { id: added.id }
        },
      }),
    ),
    {
      name: 'add_text',
      description: 'Writes a text box on a page at x/y (points from the top left; default top left), e.g. to fill in a worksheet or add a correction. One undo step.',
      inputSchema: {
        type: 'object',
        properties: { ...pageArg, text: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, size: { type: 'number', description: 'Font size (default 12).' }, color: { type: 'string' }, width: { type: 'number' } },
        required: ['page', 'text'],
      },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Write “{text}” on page {n}', { text: String(args.text ?? '').slice(0, 80), n: String(args.page ?? '') }),
      execute: (args) => {
        requireEdit()
        const { entry } = pageAt(args)
        const text = str(args, 'text')
        if (!text.trim()) throw new Error('Empty text')
        const size = Math.max(6, Math.min(72, num(args, 'size', 12)))
        const lines = text.split('\n')
        const w = num(args, 'width', Math.min(entry.w - 20, Math.max(...lines.map((l) => measure(l, size, false))) + 12))
        const h = Math.round(lines.length * size * 1.2 + 6)
        const x = Math.min(entry.w - 10, Math.max(0, num(args, 'x', 24)))
        const y = Math.min(entry.h - 10, Math.max(0, num(args, 'y', 24)))
        const added = editor.add({ type: 'text', page: entry.id, color: optStr(args, 'color') ?? '#d32f2f', x, y, w, h, size, text })
        editor.replace({ ...added, author: aiName(session) })
        return { id: added.id }
      },
    },
    {
      name: 'add_stamp',
      description: `Puts a correction stamp on a page at x/y (points from the top left; its center): ${STAMPS.join(', ')}; "grade" shows "Grade: <text>", "custom" shows the text. One undo step.`,
      inputSchema: {
        type: 'object',
        properties: { ...pageArg, stamp: { type: 'string', enum: STAMPS }, text: { type: 'string', description: 'For grade and custom stamps.' }, x: { type: 'number' }, y: { type: 'number' } },
        required: ['page', 'stamp'],
      },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Put a stamp on page {n}', { n: String(args.page ?? '') }),
      execute: (args) => {
        requireEdit()
        const { entry } = pageAt(args)
        const spec = stampPresets().find((x) => x.id === args.stamp)
        if (!spec) throw new Error(`Unknown stamp "${String(args.stamp)}"`)
        const custom = optStr(args, 'text')?.trim()
        if (spec.ask && !custom) throw new Error('This stamp needs "text"')
        const label = spec.ask === 'grade' ? gradeText(custom!) : spec.ask === 'custom' ? custom : spec.text
        const size = spec.size ?? 16
        const base = { text: label, glyph: spec.glyph, size }
        const [w, h] = label ? stampSize(base, measure) : [size * 1.8, size * 1.8]
        const x = num(args, 'x', entry.w - w - 24) - (args.x === undefined ? 0 : w / 2)
        const y = num(args, 'y', 24) - (args.y === undefined ? 0 : h / 2)
        const added = editor.add({ type: 'stamp', page: entry.id, color: spec.color, ...base, x: Math.max(0, x), y: Math.max(0, y), w, h, alt: spec.alt || label })
        editor.replace({ ...added, author: aiName(session) })
        return { id: added.id }
      },
    },
    {
      name: 'search',
      description: 'Finds text in the PDF (case and accents ignored): up to 100 matches with their page and context.',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      access: 'view',
      execute: async (args) => {
        const query = str(args, 'query')
        if (!query.trim()) throw new Error('Empty query')
        const matches = await findAll(viewer, query)
        const out: { page: number; context: string }[] = []
        for (const m of matches.slice(0, 100)) {
          const text = await viewer.pageText(m.index)
          out.push({ page: m.index + 1, context: text.slice(Math.max(0, m.start - 40), m.end + 40) })
        }
        return { count: matches.length, matches: out }
      },
    },
    {
      name: 'resolve_note',
      description: 'Marks a note (id from list_comments) as resolved, or open again with resolved false.',
      inputSchema: { type: 'object', properties: { id: { type: 'string' }, resolved: { type: 'boolean' } }, required: ['id'] },
      access: 'comment',
      execute: (args) => {
        const map = notesMap(session)
        const note = map.get(str(args, 'id'))
        if (!note || note.parent) throw new Error('No note with that id')
        map.set(note.id, { ...note, resolved: args.resolved !== false })
        return { id: note.id, resolved: args.resolved !== false }
      },
    },
    {
      name: 'list_annotations',
      description: 'Lists the annotations of the PDF (highlights, ink, text boxes, stamps…): id, page, type and a description.',
      inputSchema: { type: 'object', properties: { ...pageArg } },
      access: 'view',
      execute: (args) => {
        const order = pages().map((p) => p.id)
        const only = optNum(args, 'page')
        return [...editor.annots.values()]
          .filter((a) => only === undefined || order.indexOf(a.page) + 1 === Math.round(only))
          .map((a) => ({ id: a.id, page: order.indexOf(a.page) + 1, type: a.type, description: describe(a), author: a.author }))
      },
    },
    {
      name: 'delete_annotation',
      description: 'Deletes an annotation (id from list_annotations). The user confirms it.',
      inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      access: 'edit',
      changesDocument: true,
      destructive: true,
      summary: (args) => {
        const a = [...editor.annots.values()].find((x) => x.id === args.id)
        return t('Delete the annotation: {what}', { what: a ? describe(a) : String(args.id ?? '') })
      },
      execute: (args) => {
        if (!editor.canEdit) throw new Error('The PDF is read-only in this tab')
        const id = str(args, 'id')
        if (![...editor.annots.values()].some((a) => a.id === id)) throw new Error(`No annotation with id "${id}"`)
        editor.remove(id)
        return { deleted: id }
      },
    },
  ]
  return {
    tools,
    group: (fn) => groupYUndo([editor.undo], fn),
    render: async (args) => {
      const { entry, index } = pageAt({ page: optNum(args, 'page') ?? viewer.currentIndex() + 1 })
      if (entry.src === -1) throw new Error('This page is an inserted blank page')
      const { pdfPageToPng } = await import('../../core/webmcp/render')
      return imageResult(await pdfPageToPng(await viewer.page(entry.src)), `Page ${index + 1} of ${pages().length} (without the annotations)`)
    },
    renderSchema: { page: { type: 'integer', minimum: 1, description: 'Page number (default: the page shown).' } },
    // Pages and annotations (the PDF itself does not change).
    serialize: (ydoc) => {
      const order = pagesArray(ydoc).toArray().map((p) => p.id)
      return [
        `pages: ${order.length}`,
        ...[...annotsMap(ydoc).values()]
          .sort((a, b) => order.indexOf(a.page) - order.indexOf(b.page) || a.time - b.time)
          .map((a) => `page ${order.indexOf(a.page) + 1}: ${describe(a)}`),
      ].join('\n')
    },
    selection: () => {
      const page = viewer.currentIndex() + 1
      const annot = editor.selectedAnnot()
      const text = window.getSelection()?.toString() ?? ''
      if (annot) return { kind: 'annotation', page, annotation: { id: annot.id, type: annot.type, description: describe(annot) } }
      return text ? { kind: 'text', page, text } : { kind: 'none', page }
    },
    show: (args) => {
      const { index } = pageAt(args)
      viewer.scrollToPage(index)
      return { shown: true, page: index + 1 }
    },
    showSchema: { ...pageArg },
    info: () => ({ pages: pages().length, notes: [...notesMap(session).values()].filter((n) => !n.parent).length }),
  }
}
