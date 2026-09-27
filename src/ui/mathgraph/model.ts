// The stored construction of a math graph (JSON): expression rows (functions,
// equations, inequalities, points and geometry commands, GeoGebra style),
// sliders, the visible window and display options. Documents keep it next to
// the rendered picture so that the graph stays editable.

export interface Row {
  id: string
  text: string
  color: string
  hidden?: boolean
}

export interface Slider {
  name: string
  value: number
  min: number
  max: number
  step: number
}

export interface View {
  xmin: number
  xmax: number
  ymin: number
  ymax: number
}

export interface Options {
  grid: boolean
  axes: boolean
  numbers: boolean
  // Roots, extrema and intersections of functions drawn as points.
  special: boolean
  // Lengths next to segments.
  lengths: boolean
  // Trigonometric functions in degrees.
  degrees: boolean
  // Dragged and new points snap to the grid.
  snap: boolean
}

export interface GraphDoc {
  v: 1
  rows: Row[]
  sliders: Slider[]
  view: View
  options: Options
  // Picture size in CSS pixels.
  width: number
  height: number
}

// Picture title prefix that marks an image as an editable graph (DOCX, ODT).
export const TITLE_PREFIX = 'ofimeo-graph:'

// Readable on the white paper in every theme.
export const COLORS = ['#1a73e8', '#d93025', '#188038', '#e37400', '#9334e6', '#00897b', '#c2185b', '#3c4043']

export function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function newGraph(geometry = false): GraphDoc {
  return {
    v: 1,
    rows: [],
    sliders: [],
    view: geometry ? { xmin: -2, xmax: 10, ymin: -2, ymax: 7 } : { xmin: -10, xmax: 10, ymin: -7.5, ymax: 7.5 },
    options: { grid: true, axes: true, numbers: true, special: false, lengths: false, degrees: false, snap: true },
    width: 480,
    height: 360,
  }
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)

// Validates untrusted JSON (from a file or a peer); null when it is not a graph.
export function parseGraph(json: string | null | undefined): GraphDoc | null {
  if (!json) return null
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(json.startsWith(TITLE_PREFIX) ? json.slice(TITLE_PREFIX.length) : json)
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object' || raw.v !== 1) return null
  const base = newGraph()
  const rows = Array.isArray(raw.rows) ? raw.rows : []
  const sliders = Array.isArray(raw.sliders) ? raw.sliders : []
  const view = (raw.view ?? {}) as Record<string, unknown>
  const options = (raw.options ?? {}) as Record<string, unknown>
  const doc: GraphDoc = {
    v: 1,
    rows: rows
      .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
      .slice(0, 200)
      .map((r, i) => ({
        id: typeof r.id === 'string' ? r.id.slice(0, 20) : newId(),
        text: typeof r.text === 'string' ? r.text.slice(0, 500) : '',
        color: typeof r.color === 'string' && /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : COLORS[i % COLORS.length],
        ...(r.hidden === true ? { hidden: true } : {}),
      })),
    sliders: sliders
      .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object' && typeof s.name === 'string' && /^[\p{L}][\p{L}\d_]{0,15}$/u.test(s.name))
      .slice(0, 50)
      .map((s) => {
        const min = num(s.min, -5)
        const max = Math.max(num(s.max, 5), min + 1e-9)
        return { name: String(s.name), min, max, step: Math.abs(num(s.step, 0.1)) || 0.1, value: Math.min(max, Math.max(min, num(s.value, 1))) }
      }),
    view: {
      xmin: num(view.xmin, base.view.xmin),
      xmax: num(view.xmax, base.view.xmax),
      ymin: num(view.ymin, base.view.ymin),
      ymax: num(view.ymax, base.view.ymax),
    },
    options: {
      grid: bool(options.grid, true),
      axes: bool(options.axes, true),
      numbers: bool(options.numbers, true),
      special: bool(options.special, false),
      lengths: bool(options.lengths, false),
      degrees: bool(options.degrees, false),
      snap: bool(options.snap, true),
    },
    width: Math.round(Math.min(1600, Math.max(120, num(raw.width, 480)))),
    height: Math.round(Math.min(1600, Math.max(90, num(raw.height, 360)))),
  }
  if (!(doc.view.xmax > doc.view.xmin)) doc.view = { ...doc.view, xmin: -10, xmax: 10 }
  if (!(doc.view.ymax > doc.view.ymin)) doc.view = { ...doc.view, ymin: -7.5, ymax: 7.5 }
  return doc
}

export function serializeGraph(doc: GraphDoc): string {
  return JSON.stringify(doc)
}

export function cloneGraph(doc: GraphDoc): GraphDoc {
  return JSON.parse(JSON.stringify(doc)) as GraphDoc
}
