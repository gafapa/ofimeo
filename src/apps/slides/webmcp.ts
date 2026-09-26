// WebMCP tools of the presentations app (see src/core/webmcp). Loaded only
// while the switch is on. Text changes go through the maxGraph model in one
// batch (one undo step); new slides are added like "New slide" does. The core
// records changes as the AI assistant's in the version history. Comments go to
// the comments channel, like the user's own.
//
// Wired in src/apps/slides/app.ts (after mountFrame):
//   provideWebMcpTools(session, () => import('./webmcp').then((m) => m.slidesTools(session, editor)))

import type { Session } from '../../core/session'
import { AI_COLOR, aiName } from '../../core/webmcp/ai'
import { htmlToText, optNum, optStr, str, textToHtml, type AppTools, type OfimeoTool, type ToolArgs } from '../../core/webmcp/types'
import { cellById, goToPage, setLabel, summarize, type GraphEditor } from '../diagram/webmcp'
import { parseStyle, type CellRecord } from '../diagram/model'
import { userIdOf } from '../writer/collab'
import { slideCommentsMap, type SlideComment } from './comments'
import { LAYOUTS, notesText, presentationSize, readSlideMeta, slideCells, writeSlideMeta, type LayoutId, type Role } from './model'

const ROLES: Role[] = ['title', 'subtitle', 'body', 'body2']
const slideArg = { slide: { type: 'integer', minimum: 1, description: 'Slide number (1 = first).' } }

const roleOf = (r: CellRecord) => (parseStyle(r.style).values.get('slidePh') as Role | undefined) ?? null

export function slidesTools(session: Session, editor: GraphEditor): AppTools {
  const { sync, graph } = editor
  const doc = session.doc
  const slides = () => sync.pageList()
  const slideAt = (args: ToolArgs) => {
    const n = Math.round(optNum(args, 'slide') ?? slides().findIndex((p) => p.id === sync.page) + 1)
    const page = slides()[n - 1]
    if (!page) throw new Error(`There is no slide ${n} (there are ${slides().length})`)
    return { page, n }
  }
  const editable = () => {
    if (editor.readOnly) throw new Error('The presentation is read-only in this tab')
  }
  const texts = (id: string) =>
    sync
      .pageRecords(id)
      .filter((r) => r.vertex && r.parent === '1')
      .map((r) => ({ role: roleOf(r), text: htmlToText(r.value ?? '') }))

  const tools: OfimeoTool[] = [
    {
      name: 'list_slides',
      description: 'Lists the slides in order: number, name, layout, title text and whether it is the slide shown.',
      inputSchema: { type: 'object', properties: {} },
      access: 'view',
      execute: () =>
        slides().map((p, i) => {
          const t = texts(p.id)
          return {
            slide: i + 1,
            name: p.name,
            layout: readSlideMeta(doc, p.id).layout ?? null,
            title: t.find((x) => x.role === 'title')?.text ?? '',
            shown: p.id === sync.page,
          }
        }),
    },
    {
      name: 'get_slide',
      description: 'Returns one slide (default: the slide shown): its objects (id, placeholder role, text, position, size), connectors and speaker notes.',
      inputSchema: { type: 'object', properties: { ...slideArg } },
      access: 'view',
      execute: (args) => {
        const { page, n } = slideAt(args)
        const records = sync.pageRecords(page.id)
        const roles = new Map(records.map((r) => [r.id, roleOf(r)]))
        const { shapes, connectors } = summarize(records)
        return {
          slide: n,
          name: page.name,
          layout: readSlideMeta(doc, page.id).layout ?? null,
          objects: shapes.map((s) => ({ ...s, role: roles.get(String(s.id)) ?? null })),
          connectors,
          notes: notesText(doc, page.id).toString(),
        }
      },
    },
    {
      name: 'add_slide',
      description: `Adds a slide with a layout (${LAYOUTS.map((l) => l.id).join(', ')}; default titleContent) after a slide (default: the slide shown), fills its title and body, and shows it.`,
      inputSchema: {
        type: 'object',
        properties: {
          layout: { type: 'string', enum: LAYOUTS.map((l) => l.id) },
          title: { type: 'string' },
          body: { type: 'string', description: 'Body text; one line per paragraph.' },
          subtitle: { type: 'string', description: 'Title layout only.' },
          after: { type: 'integer', minimum: 0, description: 'Insert after this slide number (0 = at the start).' },
          notes: { type: 'string', description: 'Speaker notes.' },
        },
      },
      access: 'edit',
      changesDocument: true,
      execute: (args) => {
        editable()
        const layout = (optStr(args, 'layout') ?? 'titleContent') as LayoutId
        if (!LAYOUTS.some((l) => l.id === layout)) throw new Error(`Unknown layout "${layout}"`)
        const size = presentationSize(doc)
        const cells = slideCells(layout, size.width, size.height)
        const values: Partial<Record<Role, string | undefined>> = { title: optStr(args, 'title'), subtitle: optStr(args, 'subtitle'), body: optStr(args, 'body') }
        for (const cell of cells) {
          const role = roleOf(cell)
          const text = role ? values[role] : undefined
          if (text) cell.value = textToHtml(text)
        }
        const list = slides()
        const afterN = optNum(args, 'after')
        const after = afterN === undefined ? list.findIndex((p) => p.id === sync.page) + 1 : Math.max(0, Math.min(list.length, Math.round(afterN)))
        const id = sync.addPage(`Slide ${list.length + 1}`, cells)
        sync.movePage(id, list[after]?.id ?? null)
        writeSlideMeta(doc, id, { layout })
        const notes = optStr(args, 'notes')
        if (notes) notesText(doc, id).insert(0, notes)
        sync.showPage(id)
        return { slide: slides().findIndex((p) => p.id === id) + 1 }
      },
    },
    {
      name: 'set_text',
      description:
        'Replaces the text of an object on a slide: give its id (from get_slide) or its placeholder role (title, subtitle, body, body2). Shows that slide. One undo step.',
      inputSchema: {
        type: 'object',
        properties: { ...slideArg, id: { type: 'string' }, role: { type: 'string', enum: ROLES }, text: { type: 'string' } },
        required: ['text'],
      },
      access: 'edit',
      changesDocument: true,
      execute: (args) => {
        editable()
        goToPage(editor, args, 'slide')
        const id = optStr(args, 'id')
        const role = optStr(args, 'role')
        let cellId = id
        if (!cellId) {
          if (!role) throw new Error('Give the object id or its role')
          cellId = graph
            .getChildVertices(graph.getDefaultParent())
            .find((c) => String((c.getStyle() as Record<string, unknown> | null)?.slidePh ?? '') === role)
            ?.getId() ?? undefined
          if (!cellId) throw new Error(`This slide has no ${role} placeholder`)
        }
        setLabel(editor, cellById(editor, cellId), str(args, 'text', ''))
        return { ok: true, id: cellId }
      },
    },
    {
      name: 'list_comments',
      description: 'Lists comment threads: id, slide number, text, author, resolved and replies.',
      inputSchema: { type: 'object', properties: { include_resolved: { type: 'boolean' } } },
      access: 'view',
      execute: (args) => {
        const all = [...slideCommentsMap(session).values()]
        const order = slides().map((p) => p.id)
        return all
          .filter((c) => !c.parent && (args.include_resolved === true || !c.resolved))
          .sort((a, b) => a.time - b.time)
          .map((c) => ({
            id: c.id,
            slide: order.indexOf(c.slide ?? '') + 1 || null,
            object: c.cell ?? null,
            author: c.author,
            text: c.text,
            resolved: !!c.resolved,
            replies: all.filter((r) => r.parent === c.id).map((r) => ({ author: r.author, text: r.text })),
          }))
      },
    },
    {
      name: 'add_comment',
      description: 'Adds a comment on a slide (optionally about one object), or a reply to a comment ("reply_to").',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string' }, ...slideArg, object_id: { type: 'string' }, reply_to: { type: 'string' } },
        required: ['text'],
      },
      access: 'comment',
      execute: (args) => {
        const text = str(args, 'text').trim()
        if (!text) throw new Error('Empty comment')
        const map = slideCommentsMap(session)
        const id = `ai${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
        const base: SlideComment = { id, authorId: userIdOf(session), author: aiName(session), color: AI_COLOR, time: Date.now(), text }
        const parent = optStr(args, 'reply_to')
        if (parent) {
          if (!map.has(parent)) throw new Error('No comment with that id')
          map.set(id, { ...base, parent })
        } else {
          const { page } = slideAt(args)
          const cell = optStr(args, 'object_id')
          map.set(id, { ...base, slide: page.id, ...(cell ? { cell } : {}) })
        }
        return { id }
      },
    },
  ]

  return {
    tools,
    info: () => ({
      slides: slides().length,
      slide_shown: slides().findIndex((p) => p.id === sync.page) + 1,
      ai_changes: session.canEdit ? 'Each change is one undo step (Edit ▸ Undo) and is recorded as the AI assistant’s in the version history.' : 'none (read-only)',
    }),
  }
}
