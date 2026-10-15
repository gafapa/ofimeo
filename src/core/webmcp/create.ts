// create_document: a new document of the user's (in this browser's library,
// with new keys and full edit access) made from content the assistant gives,
// opened in a new tab. The assistant never gets its link or keys, and it never
// reads other documents: what goes in comes from its own arguments.

import type { DocType } from '../store'
import { optStr, str, type ToolArgs } from './types'

export const CREATABLE: DocType[] = ['writer', 'sheet', 'slides', 'diagram', 'draw', 'forms', 'notebook']

const MAX_SLIDES = 200
const MAX_ROWS = 5000
const MAX_COLUMNS = 200

const list = <T = Record<string, unknown>>(value: unknown, what: string): T[] => {
  if (!Array.isArray(value)) throw new Error(`"${what}" must be an array`)
  return value as T[]
}

export const CONTENT_HELP = [
  'writer: "markdown" (headings, lists, tables, links, **bold**…).',
  'sheet: "sheets": [{name, rows: [[values…]…]}] (strings starting with "=" are formulas).',
  'slides: "slides": [{title, body (one line per paragraph), notes, layout}].',
  'diagram: "drawio": draw.io XML.',
  'draw: "elements": [{type: rectangle|ellipse|diamond|text|arrow|line, x, y, width, height, text, stroke, fill}].',
  'forms: "description", "quiz" (true/false) and "questions": [{type (short, paragraph, choice, checkbox, dropdown, scale, grid, date, time, number, or section), title, description, required, options, correct, points}].',
  'notebook: "sections": [{name, pages: [{title, markdown}]}].',
].join(' ')

// Creates the document; returns its path (never given to the assistant).
export async function createFromContent(app: DocType, title: string, args: ToolArgs): Promise<string> {
  switch (app) {
    case 'writer': {
      const [{ importMarkdown }, { createDocument }, { DEFAULT_PAGE }] = await Promise.all([
        import('../../apps/writer/formats/markdown'),
        import('../../apps/writer/merge/run'),
        import('../../apps/writer/formats/types'),
      ])
      const body = await importMarkdown(str(args, 'markdown', ''))
      return createDocument({ title, body, header: null, footer: null, page: DEFAULT_PAGE }, title)
    }
    case 'sheet': {
      const [{ createFromWorkbook }, { emptyWorkbook }] = await Promise.all([import('../../apps/sheet/index'), import('../../apps/sheet/univer')])
      const sheets = list<{ name?: string; rows?: unknown[][] }>(args.sheets ?? [{ name: 'Sheet1', rows: [] }], 'sheets')
      const data = emptyWorkbook()
      data.sheetOrder = []
      data.sheets = {}
      sheets.forEach((sheet, i) => {
        const id = `sheet-${i + 1}`
        const rows = list<unknown[]>(sheet.rows ?? [], 'rows').slice(0, MAX_ROWS)
        const cellData: Record<number, Record<number, { v?: unknown; f?: string }>> = {}
        rows.forEach((row, r) =>
          list<unknown>(row, 'row')
            .slice(0, MAX_COLUMNS)
            .forEach((value, c) => {
              if (value === null || value === undefined || value === '') return
              ;(cellData[r] ??= {})[c] = typeof value === 'string' && value.startsWith('=') && value.length > 1 ? { f: value } : { v: typeof value === 'number' || typeof value === 'boolean' ? value : String(value) }
            }),
        )
        data.sheetOrder!.push(id)
        data.sheets![id] = { id, name: String(sheet.name || `Sheet${i + 1}`), rowCount: Math.max(1000, rows.length + 100), columnCount: Math.max(26, ...rows.map((r) => r.length)), cellData } as never
      })
      return createFromWorkbook(title, data)
    }
    case 'slides': {
      const [Y, { createLocalDocument }, model, { DiagramSync }, { textToHtml }] = await Promise.all([
        import('yjs'),
        import('../session'),
        import('../../apps/slides/model'),
        import('../../apps/diagram/sync'),
        import('./types'),
      ])
      const sizeDoc = new Y.Doc()
      sizeDoc.getMap('meta').set(model.META_RATIO, '16:9')
      const size = model.presentationSize(sizeDoc)
      const specs = list<{ title?: string; subtitle?: string; body?: string; notes?: string; layout?: string }>(args.slides, 'slides').slice(0, MAX_SLIDES)
      if (!specs.length) throw new Error('Give at least one slide')
      const slides = specs.map((spec, i) => {
        const layout = (model.LAYOUTS.some((l) => l.id === spec.layout) ? spec.layout : i === 0 ? 'title' : 'titleContent') as Parameters<typeof model.slideCells>[0]
        const cells = model.slideCells(layout, size.width, size.height)
        const values: Record<string, string | undefined> = { title: spec.title, subtitle: spec.subtitle, body: spec.body }
        for (const cell of cells) {
          const role = /(?:^|;)slidePh=([a-z0-9]+)/.exec(cell.style ?? '')?.[1]
          const text = role ? values[role] : undefined
          if (text) cell.value = textToHtml(text)
        }
        return { id: crypto.randomUUID(), name: `Slide ${i + 1}`, cells, notes: spec.notes ?? '', layout }
      })
      return createLocalDocument('slides', title, (doc) => model.writePresentation(doc, { ratio: '16:9', slides }, DiagramSync.setPages))
    }
    case 'diagram': {
      const [{ createLocalDocument }, { parseDrawio }, { DiagramSync }] = await Promise.all([import('../session'), import('../../apps/diagram/formats/drawio'), import('../../apps/diagram/sync')])
      const pages = await parseDrawio(str(args, 'drawio'))
      return createLocalDocument('diagram', title, (doc) => DiagramSync.setPages(doc, pages))
    }
    case 'draw': {
      const [{ createLocalDocument }, { convertToExcalidrawElements }, { DrawSync }] = await Promise.all([import('../session'), import('@excalidraw/excalidraw'), import('../../apps/draw/sync')])
      const skeletons = list<Record<string, unknown>>(args.elements ?? [], 'elements').map((e) => {
        const type = String(e.type ?? 'rectangle')
        const linear = type === 'arrow' || type === 'line'
        const width = Number(e.width ?? 160)
        const height = Number(e.height ?? (linear ? 0 : 80))
        const out: Record<string, unknown> = { type, x: Number(e.x ?? 0), y: Number(e.y ?? 0), width, height }
        if (e.stroke) out.strokeColor = String(e.stroke)
        if (e.fill) Object.assign(out, { backgroundColor: String(e.fill), fillStyle: 'solid' })
        if (type === 'text') out.text = String(e.text ?? '')
        else if (e.text) out.label = { text: String(e.text) }
        if (linear) out.points = [[0, 0], [width, height]]
        return out
      })
      const elements = convertToExcalidrawElements(skeletons as never)
      return createLocalDocument('draw', title, (doc) => DrawSync.setScene(doc, elements as never, {}))
    }
    case 'forms': {
      const [{ createForm }, { specToItem }] = await Promise.all([import('../../apps/forms/model'), import('../../apps/forms/spec')])
      const items: ReturnType<typeof specToItem>['item'][] = []
      const answers: Record<string, NonNullable<ReturnType<typeof specToItem>['key']>> = {}
      for (const spec of list(args.questions ?? [], 'questions')) {
        const { item, key } = specToItem(spec as never)
        items.push(item)
        if (key) answers[item.id!] = key
      }
      const quiz = args.quiz === true || Object.keys(answers).length > 0
      return createForm({ format: 'ofimeo-form', version: 1, title, settings: { description: optStr(args, 'description') ?? '', quiz }, items, answers })
    }
    case 'notebook': {
      const [{ createLocalDocument }, model, { importMarkdown }, { getSchema }, { prosemirrorJSONToYXmlFragment }, { notebookExtensions }] = await Promise.all([
        import('../session'),
        import('../../apps/notebook/model'),
        import('../../apps/writer/formats/markdown'),
        import('@tiptap/core'),
        import('@tiptap/y-tiptap'),
        import('../../apps/notebook/extensions'),
      ])
      const schema = getSchema(notebookExtensions())
      const sections = await Promise.all(
        list<{ name?: string; pages?: { title?: string; markdown?: string }[] }>(args.sections ?? [], 'sections').map(async (section, i) => ({
          name: String(section.name || `Section ${i + 1}`),
          pages: await Promise.all(list<{ title?: string; markdown?: string }>(section.pages ?? [], 'pages').map(async (page) => ({ title: String(page.title ?? ''), body: await importMarkdown(String(page.markdown ?? '')) }))),
        })),
      )
      return createLocalDocument('notebook', title, (doc) => {
        for (const section of sections) {
          const id = model.addSection(doc, section.name)
          for (const page of section.pages) {
            model.addPage(doc, id, page.title, {
              content: (fragment) => {
                if (page.body.content?.length) prosemirrorJSONToYXmlFragment(schema, page.body, fragment)
              },
            })
          }
        }
      })
    }
    default:
      throw new Error(`Documents of type "${app}" cannot be created this way`)
  }
}
