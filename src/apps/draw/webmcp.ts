// WebMCP tools of the drawing app (see src/core/webmcp). Loaded only while the
// switch is on. New elements are added with Excalidraw's history capture, so
// each call is one undo step; the core records it as the AI assistant's in the
// version history. Drawings have no comments.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { CaptureUpdateAction, convertToExcalidrawElements } from '@excalidraw/excalidraw'
import type { Session } from '../../core/session'
import { num, optStr, type AppTools, type OfimeoTool } from '../../core/webmcp/types'

const TYPES = ['rectangle', 'ellipse', 'diamond', 'text', 'arrow', 'line'] as const

export function drawTools(session: Session, api: () => any): AppTools {
  const excalidraw = () => {
    const a = api()
    if (!a) throw new Error('The drawing is still loading')
    return a
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
      execute: (args) => {
        const a = excalidraw()
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
        a.updateScene({ elements: [...a.getSceneElementsIncludingDeleted(), ...created], captureUpdate: CaptureUpdateAction.IMMEDIATELY })
        return { id: created[0]?.id }
      },
    },
  ]
  return {
    tools,
    info: () => ({
      elements: ((api()?.getSceneElements() as any[]) ?? []).length,
      ai_changes: session.canEdit ? 'Each change is one undo step (Edit ▸ Undo) and is recorded as the AI assistant’s in the version history.' : 'none (read-only)',
    }),
  }
}
