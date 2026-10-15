// A math graph from a short description (WebMCP: add_function_graph): the
// rows as text (functions, equations, inequalities, points, geometry
// commands), the visible window and a few options. Rendered like the graph
// editor does, with its alternative text; unknown names become sliders.

import { compute } from './compute'
import { renderGraphImage, type GraphImage } from './editor'
import { COLORS, newGraph, newId, type GraphDoc } from './model'

export interface GraphSpec {
  expressions: string[]
  xmin?: number
  xmax?: number
  ymin?: number
  ymax?: number
  // Roots, extrema and intersections drawn as points.
  special?: boolean
  degrees?: boolean
  grid?: boolean
  // Geometry (default window and no numbers on the axes).
  geometry?: boolean
}

export const MAX_EXPRESSIONS = 30

export async function graphFromSpec(spec: GraphSpec): Promise<GraphImage & { errors: string[] }> {
  const list = spec.expressions.map(String).map((x) => x.trim()).filter(Boolean)
  if (!list.length) throw new Error('Give at least one expression, e.g. "f(x) = x^2"')
  if (list.length > MAX_EXPRESSIONS) throw new Error(`At most ${MAX_EXPRESSIONS} expressions`)
  const doc: GraphDoc = newGraph(!!spec.geometry)
  doc.rows = list.map((text, i) => ({ id: newId(), text, color: COLORS[i % COLORS.length] }))
  const view = doc.view
  for (const key of ['xmin', 'xmax', 'ymin', 'ymax'] as const) if (typeof spec[key] === 'number' && Number.isFinite(spec[key])) view[key] = spec[key]
  if (view.xmin >= view.xmax || view.ymin >= view.ymax) throw new Error('The window is empty: xmin < xmax and ymin < ymax')
  doc.options.special = !!spec.special
  doc.options.degrees = !!spec.degrees
  if (spec.grid === false) doc.options.grid = false
  // Names used but not defined get a slider (as the editor offers).
  for (const name of compute(doc).unknown.slice(0, 10)) doc.sliders.push({ name, value: 1, min: -5, max: 5, step: 0.1 })
  const errors = compute(doc)
    .results.filter((r) => r.error)
    .map((r) => `${r.row.text}: ${r.error}`)
  if (errors.length === list.length) throw new Error(`No expression could be drawn: ${errors.join('; ')}`)
  return { ...(await renderGraphImage(doc)), errors }
}
