// WebMCP tools of the drawing app (see src/core/webmcp). Loaded only while the
// switch is on. New elements are added with Excalidraw's history capture, so
// each call is one undo step; the core records it as the AI assistant's in the
// version history. Drawings have no comments.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { CaptureUpdateAction, convertToExcalidrawElements, newElementWith, restoreElements } from '@excalidraw/excalidraw'
import { t } from '../../core/i18n'
import type { Session } from '../../core/session'
import type * as Y from 'yjs'
import { imageResult, num, optNum, optStr, str, type AppTools, type OfimeoTool, type ToolArgs } from '../../core/webmcp/types'

const TYPES = ['rectangle', 'ellipse', 'diamond', 'text', 'arrow', 'line'] as const

export function drawTools(session: Session, api: () => any): AppTools {
  const excalidraw = () => {
    const a = api()
    if (!a) throw new Error('The drawing is still loading')
    return a
  }
  // In apply_batch, the changes are collected and given to the scene once at
  // the end, so they are one step of Excalidraw's undo history.
  let pending: any[] | null = null
  const scene = (): any[] => pending ?? excalidraw().getSceneElementsIncludingDeleted()
  const commit = (elements: any[]) => {
    if (pending) pending = elements
    else excalidraw().updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY })
  }
  const live = () => scene().filter((e) => !e.isDeleted)
  const elementById = (id: string) => {
    const element = live().find((e) => e.id === id)
    if (!element) throw new Error(`No element with id "${id}" (use get_scene)`)
    return element
  }
  const ids = (args: ToolArgs): string[] => {
    const v = args.ids
    const list = Array.isArray(v) ? v.map(String) : typeof v === 'string' ? [v] : []
    if (!list.length) throw new Error('Give "ids": the ids of the elements')
    return list
  }
  // Replaces elements of the scene by id.
  const replaceElements = (changed: any[]) => {
    const byId = new Map(changed.map((e) => [e.id, e]))
    commit(scene().map((e) => byId.get(e.id) ?? e))
  }

  const tools: OfimeoTool[] = [
    {
      name: 'get_scene',
      description: 'Summarises the drawing: its elements (id, type, position, size, text or label, colors) and what arrows connect.',
      inputSchema: { type: 'object', properties: {} },
      access: 'view',
      execute: () => {
        const elements = (excalidraw().getSceneElements() as any[]).filter((e) => !e.isDeleted)
        const textOf = new Map(elements.filter((e) => e.type === 'text' && e.containerId).map((e) => [e.containerId, e.text]))
        return elements
          .filter((e) => !(e.type === 'text' && e.containerId))
          .map((e) => ({
            id: e.id,
            type: e.type,
            x: Math.round(e.x),
            y: Math.round(e.y),
            width: Math.round(e.width),
            height: Math.round(e.height),
            ...(e.type === 'text' ? { text: e.text } : textOf.has(e.id) ? { label: textOf.get(e.id) } : {}),
            ...(e.strokeColor ? { stroke: e.strokeColor } : {}),
            ...(e.backgroundColor && e.backgroundColor !== 'transparent' ? { fill: e.backgroundColor } : {}),
            ...(e.startBinding || e.endBinding ? { from: e.startBinding?.elementId ?? null, to: e.endBinding?.elementId ?? null } : {}),
          }))
      },
    },
    {
      name: 'add_element',
      description: `Adds an element to the drawing: ${TYPES.join(', ')}. Shapes may have a label; "text" needs text; arrows and lines go from (x, y) by (width, height). One undo step. Returns its id.`,
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: [...TYPES] },
          x: { type: 'number' },
          y: { type: 'number' },
          width: { type: 'number', description: 'Default 160 (arrows: 160).' },
          height: { type: 'number', description: 'Default 80 (arrows: 0).' },
          text: { type: 'string', description: 'Text of a text element, or label of a shape or arrow.' },
          stroke: { type: 'string', description: 'Line color, e.g. "#1e1e1e".' },
          fill: { type: 'string', description: 'Background color of shapes.' },
        },
        required: ['type'],
      },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Add an element to the drawing: {type}', { type: String(args.type ?? '') }),
      execute: (args) => {
        excalidraw()
        const type = optStr(args, 'type') as (typeof TYPES)[number]
        if (!TYPES.includes(type)) throw new Error(`Unknown element type "${type}"`)
        const linear = type === 'arrow' || type === 'line'
        const text = optStr(args, 'text')
        const base: any = {
          type,
          x: num(args, 'x', 0),
          y: num(args, 'y', 0),
          width: num(args, 'width', 160),
          height: num(args, 'height', linear ? 0 : 80),
          ...(optStr(args, 'stroke') ? { strokeColor: optStr(args, 'stroke') } : {}),
          ...(optStr(args, 'fill') ? { backgroundColor: optStr(args, 'fill'), fillStyle: 'solid' } : {}),
        }
        if (type === 'text') {
          if (!text) throw new Error('A text element needs "text"')
          base.text = text
        } else if (text) base.label = { text }
        if (linear) base.points = [[0, 0], [base.width, base.height]]
        const created = convertToExcalidrawElements([base])
        commit([...scene(), ...created])
        return { id: created[0]?.id }
      },
    },
    {
      name: 'update_element',
      description: 'Changes an element (id from get_scene): position x/y, size width/height, text (of a text element, or the label of a shape or arrow), stroke and fill colors. One undo step.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          x: { type: 'number' },
          y: { type: 'number' },
          width: { type: 'number' },
          height: { type: 'number' },
          text: { type: 'string' },
          stroke: { type: 'string' },
          fill: { type: 'string' },
        },
        required: ['id'],
      },
      access: 'edit',
      changesDocument: true,
      summary: () => t('Change an element of the drawing'),
      execute: (args) => {
        const element = elementById(str(args, 'id'))
        const patch: Record<string, unknown> = {}
        for (const key of ['x', 'y', 'width', 'height'] as const) {
          const v = optNum(args, key)
          if (v !== undefined) patch[key] = key === 'width' || key === 'height' ? Math.max(1, v) : v
        }
        const stroke = optStr(args, 'stroke')
        const fill = optStr(args, 'fill')
        if (stroke) patch.strokeColor = stroke
        if (fill) Object.assign(patch, { backgroundColor: fill, fillStyle: element.fillStyle === 'hachure' ? 'solid' : element.fillStyle })
        const changed = [newElementWith(element, patch as never)]
        const text = optStr(args, 'text')
        if (text !== undefined) {
          const label = element.type === 'text' ? changed[0] : live().find((e) => e.type === 'text' && e.containerId === element.id)
          if (!label) throw new Error('This element has no text; add a labelled shape with add_element instead')
          const updated = newElementWith(label, { text, originalText: text } as never)
          const [measured] = restoreElements([updated], null, { refreshDimensions: true })
          if (label.id === element.id) changed[0] = measured
          else changed.push(measured)
        }
        replaceElements(changed)
        return { id: element.id }
      },
    },
    {
      name: 'delete_elements',
      description: 'Deletes elements (ids from get_scene) with their labels. The user confirms it.',
      inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'] },
      access: 'edit',
      changesDocument: true,
      destructive: true,
      summary: (args) => t('Delete {n} elements of the drawing', { n: Array.isArray(args.ids) ? args.ids.length : 1 }),
      execute: (args) => {
        const wanted = new Set(ids(args).map((id) => elementById(id).id))
        const doomed = live().filter((e) => wanted.has(e.id) || (e.containerId && wanted.has(e.containerId)))
        replaceElements(doomed.map((e) => newElementWith(e, { isDeleted: true } as never)))
        return { deleted: wanted.size }
      },
    },
  ]
  const summary = (e: any, texts: Map<string, string>) => ({
    id: e.id,
    type: e.type,
    ...(e.type === 'text' ? { text: e.text } : texts.has(e.id) ? { label: texts.get(e.id) } : {}),
  })
  return {
    tools,
    render: async () => {
      const { exportDrawing } = await import('./app')
      return imageResult(await exportDrawing(excalidraw(), 'png'), 'The whole drawing')
    },
    renderSchema: {},
    serialize: (doc: Y.Doc) => {
      const elements = [...doc.getMap<any>('draw-elements').values()].filter((e) => !e.isDeleted)
      const labels = new Map(elements.filter((e) => e.type === 'text' && e.containerId).map((e) => [e.containerId, e.text]))
      return elements
        .filter((e) => !(e.type === 'text' && e.containerId))
        .sort((a, b) => (String(a.index ?? '') < String(b.index ?? '') ? -1 : 1))
        .map((e) => `${e.type}${e.type === 'text' ? ` “${e.text}”` : labels.has(e.id) ? ` “${labels.get(e.id)}”` : ''}`)
        .join('\n')
    },
    paragraphs: () => live().filter((e) => e.type === 'text' && e.text?.trim()).map((e) => ({ where: `element ${e.containerId ?? e.id}`, text: e.text })),
    group: async (fn) => {
      pending = [...excalidraw().getSceneElementsIncludingDeleted()]
      try {
        return await fn()
      } finally {
        const elements = pending
        pending = null
        excalidraw().updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY })
      }
    },
    selection: () => {
      const a = excalidraw()
      const ids = Object.keys(a.getAppState().selectedElementIds ?? {})
      const elements = (a.getSceneElements() as any[]).filter((e) => !e.isDeleted)
      const texts = new Map<string, string>(elements.filter((e) => e.type === 'text' && e.containerId).map((e) => [e.containerId, e.text]))
      const chosen = elements.filter((e) => ids.includes(e.id) && !(e.type === 'text' && e.containerId))
      return chosen.length ? { kind: 'elements', elements: chosen.map((e) => summary(e, texts)) } : { kind: 'none' }
    },
    show: (args) => {
      const a = excalidraw()
      const id = optStr(args, 'id')
      const element = (a.getSceneElements() as any[]).find((e) => e.id === id && !e.isDeleted)
      if (!element) throw new Error(`No element with id "${id}"`)
      a.updateScene({ appState: { selectedElementIds: { [element.id]: true } }, captureUpdate: CaptureUpdateAction.NEVER })
      a.scrollToContent(element, { animate: false })
      return { shown: true, id: element.id }
    },
    showSchema: { id: { type: 'string', description: 'Element to select (id from get_scene).' } },
    info: () => ({
      elements: ((api()?.getSceneElements() as any[]) ?? []).length,
      ai_changes: session.canEdit ? 'Each change is one undo step (Edit ▸ Undo) and is recorded as the AI assistant’s in the version history.' : 'none (read-only)',
    }),
  }
}
