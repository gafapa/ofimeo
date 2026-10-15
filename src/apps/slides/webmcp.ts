// WebMCP tools of the presentations app (see src/core/webmcp). Loaded only
// while the switch is on. Text changes go through the maxGraph model in one
// batch (one undo step); new slides are added like "New slide" does. The core
// records changes as the AI assistant's in the version history. Comments go to
// the comments channel, like the user's own.
//
// Wired in src/apps/slides/app.ts (after mountFrame):
//   provideWebMcpTools(session, () => import('./webmcp').then((m) => m.slidesTools(session, editor)))

import { t } from '../../core/i18n'
import type { Session } from '../../core/session'
import { AI_COLOR, aiName } from '../../core/webmcp/ai'
import { htmlToText, imageResult, optNum, optStr, str, textToHtml, type AccessibilityIssue, type AppTools, type OfimeoTool, type ToolArgs } from '../../core/webmcp/types'
import { cellById, goToPage, groupGraph, labelParts, movePageTo, objectTools, pageLines, selectedCells, setLabel, showCell, showPageSafely, summarize, type GraphEditor } from '../diagram/webmcp'
import { DiagramSync } from '../diagram/sync'
import { parseStyle, type CellRecord } from '../diagram/model'
import { userIdOf } from '../writer/collab'
import { Cell, Geometry } from '@maxgraph/core'
import { styleFromString } from '../diagram/graph'
import { slideCommentsMap, type SlideComment } from './comments'
import type { Presentation } from './present'
import { LAYOUTS, notesText, presentationSize, readSlideMeta, slideCells, TEXT_BOX_STYLE, THEMES, writeSlideMeta, type LayoutId, type Role } from './model'
import { addAnimation, defaultDuration, EFFECTS, type AnimEffect, type AnimKind, type Direction, type TransitionType, type Trigger } from './animations'
import { CHART_TYPES } from '../sheet/charts/model'

const ROLES: Role[] = ['title', 'subtitle', 'body', 'body2']
const slideArg = { slide: { type: 'integer', minimum: 1, description: 'Slide number (1 = first).' } }
const TRANSITIONS: TransitionType[] = ['none', 'fade', 'push', 'wipe']

const roleOf = (r: CellRecord) => (parseStyle(r.style).values.get('slidePh') as Role | undefined) ?? null

// What the app does for some tools (as its own menu items do).
export interface SlideActions {
  duplicate(id: string): string | undefined
  // On the slide shown.
  applyLayout(layout: LayoutId): void
  setTheme(id: string): void
}

export function slidesTools(session: Session, editor: GraphEditor, presentation?: Presentation, actions?: SlideActions): AppTools {
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

  // A new slide filled from {layout, title, subtitle, body, notes}, placed after slide number `after` (0: first).
  const createSlide = (spec: ToolArgs, after: number): string => {
    const layout = (optStr(spec, 'layout') ?? 'titleContent') as LayoutId
    if (!LAYOUTS.some((l) => l.id === layout)) throw new Error(`Unknown layout "${layout}"`)
    const size = presentationSize(doc)
    const cells = slideCells(layout, size.width, size.height)
    const values: Partial<Record<Role, string | undefined>> = { title: optStr(spec, 'title'), subtitle: optStr(spec, 'subtitle'), body: optStr(spec, 'body') }
    for (const cell of cells) {
      const role = roleOf(cell)
      const text = role ? values[role] : undefined
      if (text) cell.value = textToHtml(text)
    }
    const list = slides()
    const id = sync.addPage(`Slide ${list.length + 1}`, cells)
    sync.movePage(id, list[after]?.id ?? null)
    writeSlideMeta(doc, id, { layout })
    const notes = optStr(spec, 'notes')
    if (notes) notesText(doc, id).insert(0, notes)
    return id
  }

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
      summary: (args) => t('Add the slide “{title}”', { title: String(args.title ?? '') }),
      execute: (args) => {
        editable()
        const list = slides()
        const afterN = optNum(args, 'after')
        const id = createSlide(args, afterN === undefined ? list.findIndex((p) => p.id === sync.page) + 1 : Math.max(0, Math.min(list.length, Math.round(afterN))))
        showPageSafely(editor, id)
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
      summary: (args) => t('Change a text of a slide to “{text}”', { text: String(args.text ?? '').slice(0, 80) }),
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
    ...objectTools(editor, editable, 'slide'),
    {
      name: 'add_slides_from_outline',
      description: `Adds several slides at once after a slide (default: the slide shown): each {title, body (one line per paragraph), subtitle, notes, layout (${LAYOUTS.map((l) => l.id).join(', ')})}. Shows the first new slide.`,
      inputSchema: {
        type: 'object',
        properties: { slides: { type: 'array', items: { type: 'object' }, maxItems: 100 }, after: { type: 'integer', minimum: 0 } },
        required: ['slides'],
      },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Add {n} slides', { n: Array.isArray(args.slides) ? args.slides.length : 0 }),
      execute: (args) => {
        editable()
        const specs = Array.isArray(args.slides) ? (args.slides as ToolArgs[]).slice(0, 100) : []
        if (!specs.length) throw new Error('Give at least one slide')
        const list = slides()
        const afterN = optNum(args, 'after')
        let after = afterN === undefined ? list.findIndex((p) => p.id === sync.page) + 1 : Math.max(0, Math.min(list.length, Math.round(afterN)))
        const ids = specs.map((spec) => {
          const id = createSlide(spec, after)
          after++
          return id
        })
        showPageSafely(editor, ids[0])
        return { slides: ids.map((id) => slides().findIndex((p) => p.id === id) + 1) }
      },
    },
    {
      name: 'set_layout',
      description: `Applies a layout to a slide (default: the slide shown): ${LAYOUTS.map((l) => l.id).join(', ')}. Placeholders move to the layout's boxes; missing ones are added and empty ones it lacks removed.`,
      inputSchema: { type: 'object', properties: { ...slideArg, layout: { type: 'string', enum: LAYOUTS.map((l) => l.id) } }, required: ['layout'] },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Change the layout of slide {n}', { n: String(args.slide ?? slideAt(args).n) }),
      execute: (args) => {
        editable()
        if (!actions) throw new Error('Not available')
        const layout = str(args, 'layout') as LayoutId
        if (!LAYOUTS.some((l) => l.id === layout)) throw new Error(`Unknown layout "${layout}"`)
        goToPage(editor, args, 'slide')
        actions.applyLayout(layout)
        return { slide: slideAt({}).n, layout }
      },
    },
    {
      name: 'set_notes',
      description: 'Replaces the speaker notes of a slide (default: the slide shown).',
      inputSchema: { type: 'object', properties: { ...slideArg, notes: { type: 'string' } }, required: ['notes'] },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Change the speaker notes of slide {n}', { n: String(args.slide ?? slideAt(args).n) }),
      execute: (args) => {
        editable()
        const { page, n } = slideAt(args)
        const notes = notesText(doc, page.id)
        doc.transact(() => {
          notes.delete(0, notes.length)
          notes.insert(0, str(args, 'notes', ''))
        })
        return { slide: n }
      },
    },
    {
      name: 'add_text_box',
      description: 'Adds a text box to a slide (default: the slide shown) at x/y with width/height (default: centered) and font_size. One undo step. Returns its id.',
      inputSchema: {
        type: 'object',
        properties: { ...slideArg, text: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' }, font_size: { type: 'number' } },
        required: ['text'],
      },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Add the text “{text}” to a slide', { text: String(args.text ?? '').slice(0, 60) }),
      execute: (args) => {
        editable()
        goToPage(editor, args, 'slide')
        const size = presentationSize(doc)
        const width = optNum(args, 'width') ?? 480
        const height = optNum(args, 'height') ?? 80
        const fontSize = optNum(args, 'font_size')
        const style = fontSize ? TEXT_BOX_STYLE.replace(/fontSize=\d+;/, `fontSize=${Math.round(Math.max(8, Math.min(120, fontSize)))};`) : TEXT_BOX_STYLE
        const cell = new Cell(textToHtml(str(args, 'text')), new Geometry(optNum(args, 'x') ?? (size.width - width) / 2, optNum(args, 'y') ?? (size.height - height) / 2, width, height), styleFromString(style))
        cell.setVertex(true)
        editor.inBatch(() => graph.addCell(cell, graph.getDefaultParent()))
        return { id: cell.getId() }
      },
    },
    {
      name: 'insert_chart',
      description: `Adds a chart with the data given to a slide (default: the slide shown): type (${CHART_TYPES.join(', ')}), title, labels, series [{name, values}], axis titles, and position x/y/width/height.`,
      inputSchema: {
        type: 'object',
        properties: {
          ...slideArg,
          type: { type: 'string', enum: CHART_TYPES },
          title: { type: 'string' },
          labels: { type: 'array', items: { type: ['string', 'number'] } },
          series: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, values: { type: 'array', items: { type: ['number', 'null'] } } } } },
          x_title: { type: 'string' },
          y_title: { type: 'string' },
          x: { type: 'number' },
          y: { type: 'number' },
          width: { type: 'number' },
          height: { type: 'number' },
        },
        required: ['labels', 'series'],
      },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Insert the chart “{title}”', { title: String(args.title ?? '') }),
      execute: async (args) => {
        editable()
        const [{ chartFromData }, { chartStyle }] = await Promise.all([import('../charts/embedded'), import('./charts')])
        const chart = chartFromData({
          type: optStr(args, 'type') ?? 'column',
          title: optStr(args, 'title'),
          labels: Array.isArray(args.labels) ? args.labels : [],
          series: Array.isArray(args.series) ? (args.series as { name?: unknown; values?: unknown[] }[]) : [],
          xTitle: optStr(args, 'x_title'),
          yTitle: optStr(args, 'y_title'),
        })
        goToPage(editor, args, 'slide')
        const size = presentationSize(doc)
        const width = optNum(args, 'width') ?? 560
        const height = optNum(args, 'height') ?? 340
        const cell = new Cell('', new Geometry(optNum(args, 'x') ?? (size.width - width) / 2, optNum(args, 'y') ?? (size.height - height) / 2, width, height), styleFromString(await chartStyle(chart, width, height)))
        cell.setVertex(true)
        ;(cell as Cell & { woData?: string }).woData = JSON.stringify({ ofimeoChart: chart })
        editor.inBatch(() => graph.addCell(cell, graph.getDefaultParent()))
        return { id: cell.getId() }
      },
    },
    {
      name: 'set_transition',
      description: 'Sets the transition into a slide (default: the slide shown): none, fade, push or wipe, with a duration in milliseconds.',
      inputSchema: { type: 'object', properties: { ...slideArg, type: { type: 'string', enum: TRANSITIONS }, duration: { type: 'number', minimum: 0, maximum: 5000 } }, required: ['type'] },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Set the transition of slide {n}', { n: String(args.slide ?? slideAt(args).n) }),
      execute: (args) => {
        editable()
        const { page, n } = slideAt(args)
        const type = str(args, 'type') as TransitionType
        if (!TRANSITIONS.includes(type)) throw new Error(`Unknown transition "${type}"`)
        writeSlideMeta(doc, page.id, { transition: type === 'none' ? null : type, transitionDuration: type === 'none' ? null : String(Math.round(optNum(args, 'duration') ?? 500)) })
        return { slide: n, transition: type }
      },
    },
    {
      name: 'add_animation',
      description: `Animates an object of a slide (id from get_slide): kind entrance (${EFFECTS.entrance.join(', ')}), emphasis (${EFFECTS.emphasis.join(', ')}) or exit (${EFFECTS.exit.join(', ')}); trigger click (default), with or after the previous one; duration in ms; direction left/right/top/bottom for fly and wipe.`,
      inputSchema: {
        type: 'object',
        properties: {
          ...slideArg,
          id: { type: 'string' },
          kind: { type: 'string', enum: ['entrance', 'emphasis', 'exit'] },
          effect: { type: 'string', enum: [...new Set([...EFFECTS.entrance, ...EFFECTS.emphasis])] },
          trigger: { type: 'string', enum: ['click', 'with', 'after'] },
          duration: { type: 'number', minimum: 0, maximum: 10000 },
          direction: { type: 'string', enum: ['left', 'right', 'top', 'bottom'] },
        },
        required: ['id', 'effect'],
      },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Animate an object of slide {n}', { n: String(args.slide ?? slideAt(args).n) }),
      execute: (args) => {
        editable()
        const { page } = slideAt(args)
        const id = str(args, 'id')
        if (!sync.pageRecords(page.id).some((r) => r.id === id && r.parent === '1')) throw new Error(`No object "${id}" on that slide (use get_slide)`)
        const kind = (optStr(args, 'kind') ?? 'entrance') as AnimKind
        const effect = str(args, 'effect') as AnimEffect
        if (!EFFECTS[kind]?.includes(effect)) throw new Error(`"${effect}" is not a ${kind} effect (${EFFECTS[kind]?.join(', ')})`)
        const added = addAnimation(doc, page.id, {
          cell: id,
          kind,
          effect,
          trigger: (optStr(args, 'trigger') ?? 'click') as Trigger,
          duration: Math.round(optNum(args, 'duration') ?? defaultDuration(effect)),
          delay: 0,
          direction: (optStr(args, 'direction') ?? 'left') as Direction,
        })
        return { animation: added }
      },
    },
    {
      name: 'apply_theme',
      description: `Applies a theme to the whole presentation: ${THEMES.map((th) => `${th.id} (${th.name})`).join(', ')}.`,
      inputSchema: { type: 'object', properties: { theme: { type: 'string', enum: THEMES.map((th) => th.id) } }, required: ['theme'] },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Apply the theme {name}', { name: THEMES.find((th) => th.id === args.theme)?.name ?? String(args.theme ?? '') }),
      execute: (args) => {
        editable()
        if (!actions) throw new Error('Not available')
        const theme = str(args, 'theme')
        if (!THEMES.some((th) => th.id === theme)) throw new Error(`Unknown theme "${theme}"`)
        actions.setTheme(theme)
        return { theme }
      },
    },
    {
      name: 'add_function_graph',
      description:
        'Adds a math graph to a slide (default: the slide shown) as an editable picture: "expressions" as typed in the graph editor ("f(x) = x^2", "y = 2x + 1", "A = (1, 2)"…), optional window xmin/xmax/ymin/ymax, special, degrees, and position x/y/width.',
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
          x: { type: 'number' },
          y: { type: 'number' },
          width: { type: 'number' },
          ...slideArg,
        },
        required: ['expressions'],
      },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Insert a graph of {list}', { list: (Array.isArray(args.expressions) ? args.expressions : []).join(', ').slice(0, 100) }),
      execute: async (args) => {
        editable()
        const { graphFromSpec } = await import('../../ui/mathgraph/spec')
        const result = await graphFromSpec({ ...(args as object), expressions: Array.isArray(args.expressions) ? args.expressions.map(String) : [] })
        goToPage(editor, args, 'slide')
        const size = presentationSize(doc)
        const width = optNum(args, 'width') ?? Math.min(result.width, size.width / 2)
        const height = Math.round((width * result.height) / result.width)
        const cell = new Cell(
          '',
          new Geometry(optNum(args, 'x') ?? (size.width - width) / 2, optNum(args, 'y') ?? (size.height - height) / 2, width, height),
          styleFromString(`shape=image;slideGraph=1;imageAspect=0;aspect=fixed;verticalLabelPosition=bottom;verticalAlign=top;image=${result.png.replace(';base64,', ',')};`),
        )
        cell.setVertex(true)
        ;(cell as Cell & { woData?: string }).woData = JSON.stringify({ graph: result.doc, alt: result.alt })
        editor.inBatch(() => graph.addCell(cell, graph.getDefaultParent()))
        return { id: cell.getId(), alt: result.alt, ...(result.errors.length ? { errors: result.errors } : {}) }
      },
    },
    {
      name: 'move_slide',
      description: 'Moves a slide (default: the slide shown) so that it becomes slide number "to".',
      inputSchema: { type: 'object', properties: { ...slideArg, to: { type: 'integer', minimum: 1 } }, required: ['to'] },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Move slide {from} to position {to}', { from: String(args.slide ?? ''), to: String(args.to) }),
      execute: (args) => {
        editable()
        const { page } = slideAt(args)
        return { slide: movePageTo(editor, page.id, Number(args.to)) }
      },
    },
    {
      name: 'duplicate_slide',
      description: 'Copies a slide (default: the slide shown) with its notes, animations and transition, right after it, and shows the copy.',
      inputSchema: { type: 'object', properties: { ...slideArg } },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Duplicate slide {n}', { n: String(args.slide ?? slideAt(args).n) }),
      execute: (args) => {
        editable()
        if (!actions) throw new Error('Not available')
        const { page } = slideAt(args)
        const model = graph.getDataModel()
        const level = model.updateLevel
        for (let i = 0; i < level; i++) model.endUpdate()
        const id = actions.duplicate(page.id)
        for (let i = 0; i < level; i++) model.beginUpdate()
        return { slide: slides().findIndex((p) => p.id === id) + 1 }
      },
    },
    {
      name: 'delete_slide',
      description: 'Deletes a slide (not the last one). The user confirms it.',
      inputSchema: { type: 'object', properties: { ...slideArg }, required: ['slide'] },
      access: 'edit',
      changesDocument: true,
      destructive: true,
      summary: (args) => t('Delete slide {n}', { n: String(args.slide) }),
      execute: (args) => {
        editable()
        if (slides().length <= 1) throw new Error('The last slide cannot be deleted')
        const { page } = slideAt(args)
        const model = graph.getDataModel()
        const level = model.updateLevel
        for (let i = 0; i < level; i++) model.endUpdate()
        sync.deletePage(page.id)
        for (let i = 0; i < level; i++) model.beginUpdate()
        return { slides: slides().length }
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

  // While this browser presents: remote control and the speaker notes.
  const presenting = () => !!presentation?.presenting
  const current = () => {
    const page = slides()[presentation!.slideIndex]
    return { slide: presentation!.slideIndex + 1, of: slides().length, notes: page ? notesText(doc, page.id).toString() : '' }
  }
  const control = (name: string, description: string, run: (args: ToolArgs) => void, inputSchema: OfimeoTool['inputSchema'] = { type: 'object', properties: {} }): OfimeoTool => ({
    name,
    description,
    inputSchema,
    access: 'view',
    readOnly: true,
    available: presenting,
    execute: (args) => {
      if (!presenting()) throw new Error('No presentation is running in this tab')
      run(args)
      return current()
    },
  })
  tools.push(
    control('next_slide', 'During the slide show: plays the next animation step or goes to the next slide. Returns the slide shown and its speaker notes.', () => presentation!.forward()),
    control('previous_slide', 'During the slide show: goes back one animation step or slide.', () => presentation!.back()),
    control('go_to_slide', 'During the slide show: shows a slide by number.', (args) => presentation!.goToSlide(Math.round(optNum(args, 'slide') ?? 1) - 1), { type: 'object', properties: { ...slideArg }, required: ['slide'] }),
    control('get_speaker_notes', 'During the slide show: the slide shown and its speaker notes.', () => {}),
  )

  return {
    tools,
    watch: (fn) => presentation?.onStateChange(fn),
    selection: () => {
      const cells = selectedCells(editor)
      const slide = slides().findIndex((p) => p.id === sync.page) + 1
      return cells.length ? { kind: 'objects', slide, objects: cells } : { kind: 'none', slide }
    },
    group: (fn) => groupGraph(editor, fn),
    render: async (args) => {
      const [{ readPresentation }, { SlideRenderer }, { parseBackground }, { svgToPng }, { svgScale }] = await Promise.all([
        import('./index'),
        import('./render'),
        import('./model'),
        import('../diagram/export'),
        import('../../core/webmcp/render'),
      ])
      const data = readPresentation(session)
      const n = Math.round(optNum(args, 'slide') ?? slides().findIndex((p) => p.id === sync.page) + 1)
      const slide = data.slides[n - 1]
      if (!slide) throw new Error(`There is no slide ${n} (there are ${data.slides.length})`)
      const renderer = new SlideRenderer(() => data.theme)
      try {
        await renderer.prepare(slide.cells)
        const svg = renderer.render({ cells: slide.cells, background: parseBackground(slide.background, data.theme) }, data.width, data.height)
        return imageResult(await svgToPng(svg, svgScale(data.width, data.height)), `Slide ${n} of ${data.slides.length}`)
      } finally {
        renderer.destroy()
      }
    },
    renderSchema: { ...slideArg },
    serialize: (ydoc) =>
      DiagramSync.readPages(ydoc)
        .map((p, i) => [`## Slide ${i + 1}`, ...pageLines(p.cells), ...(notesText(ydoc, p.id).toString().trim() ? [`notes: ${notesText(ydoc, p.id).toString().trim()}`] : [])].join('\n'))
        .join('\n'),
    paragraphs: () => [
      ...labelParts(doc, 'slide'),
      ...slides()
        .map((p, i) => ({ where: `slide ${i + 1} · speaker notes`, text: notesText(doc, p.id).toString() }))
        .filter((p) => p.text.trim()),
    ],
    accessibility: () => {
      const issues: AccessibilityIssue[] = []
      slides().forEach((p, i) => {
        const items = texts(p.id)
        if (!items.some((x) => x.role === 'title' && x.text.trim())) issues.push({ where: `slide ${i + 1}`, problem: 'The slide has no title: screen readers and the slide list identify slides by it.', fix: `set_text {"slide": ${i + 1}, "role": "title", "text": "…"}` })
        const pictures = sync.pageRecords(p.id).filter((r) => r.vertex && /(^|;)image=|shape=image/.test(r.style ?? '')).length
        if (pictures) issues.push({ where: `slide ${i + 1}`, problem: `${pictures} picture(s) without a description: describe them in the speaker notes or in a text on the slide.` })
        const words = items.map((x) => x.text).join(' ').split(/\s+/).filter(Boolean).length
        if (words > 120) issues.push({ where: `slide ${i + 1}`, problem: `Much text on one slide (${words} words): it is hard to read when presenting.` })
      })
      return issues
    },
    show: (args) => showCell(editor, args, 'slide'),
    showSchema: { ...slideArg, id: { type: 'string', description: 'Object to select (id from get_slide).' } },
    undo: editor.undo,
    redo: editor.redo,
    info: () => ({
      slides: slides().length,
      slide_shown: slides().findIndex((p) => p.id === sync.page) + 1,
      ai_changes: session.canEdit ? 'Each change is one undo step (Edit ▸ Undo) and is recorded as the AI assistant’s in the version history.' : 'none (read-only)',
    }),
  }
}
