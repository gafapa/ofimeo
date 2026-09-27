// Intention preservation for concurrent structural edits.
//
// A mutation created without knowing about a concurrent row/column insertion
// or removal addresses cells in the old coordinates. Before replaying it, its
// coordinates are shifted through those structural changes (a light form of
// operational transformation). Mutation types not listed here pass through.

interface Structural {
  sheet: string
  axis: 'row' | 'col'
  kind: 'insert' | 'remove'
  start: number
  count: number
}

interface Range {
  startRow: number
  endRow: number
  startColumn: number
  endColumn: number
  [key: string]: unknown
}

type Params = Record<string, unknown> & { subUnitId?: string }

const STRUCTURAL: Record<string, Pick<Structural, 'axis' | 'kind'>> = {
  'sheet.mutation.insert-row': { axis: 'row', kind: 'insert' },
  'sheet.mutation.remove-rows': { axis: 'row', kind: 'remove' },
  'sheet.mutation.insert-col': { axis: 'col', kind: 'insert' },
  'sheet.mutation.remove-col': { axis: 'col', kind: 'remove' },
}

// Mutations whose `ranges` array addresses cells.
const RANGES_MUTATIONS = new Set([
  'sheet.mutation.add-worksheet-merge',
  'sheet.mutation.remove-worksheet-merge',
  'sheet.mutation.set-worksheet-col-width',
  'sheet.mutation.set-worksheet-row-height',
])

export function structuralOf(mutation: string, params: Params): Structural | null {
  const kind = STRUCTURAL[mutation]
  const range = params.range as Range | undefined
  if (!kind || !range || !params.subUnitId) return null
  const [start, end] = kind.axis === 'row' ? [range.startRow, range.endRow] : [range.startColumn, range.endColumn]
  return { sheet: params.subUnitId, ...kind, start, count: end - start + 1 }
}

// Maps an index through one structural change; null when it was removed.
function mapIndex(i: number, s: Structural): number | null {
  if (s.kind === 'insert') return i >= s.start ? i + s.count : i
  if (i < s.start) return i
  if (i < s.start + s.count) return null
  return i - s.count
}

// Maps an inclusive span; removed parts are dropped, null when nothing remains.
function mapSpan(start: number, end: number, s: Structural): [number, number] | null {
  if (s.kind === 'insert') {
    if (end < s.start) return [start, end]
    if (start >= s.start) return [start + s.count, end + s.count]
    return [start, end + s.count] // insertion inside the span grows it
  }
  const removedEnd = s.start + s.count - 1
  if (end < s.start) return [start, end]
  if (start > removedEnd) return [start - s.count, end - s.count]
  const keptStart = start < s.start ? start : s.start
  const keptEnd = end > removedEnd ? end - s.count : s.start - 1
  return keptEnd >= keptStart ? [keptStart, keptEnd] : null
}

function mapRange(range: Range, s: Structural): Range | null {
  if (s.axis === 'row') {
    const rows = mapSpan(range.startRow, range.endRow, s)
    return rows && { ...range, startRow: rows[0], endRow: rows[1] }
  }
  const cols = mapSpan(range.startColumn, range.endColumn, s)
  return cols && { ...range, startColumn: cols[0], endColumn: cols[1] }
}

// ---------- Charts (float DOM drawings with a source range) ----------

const DRAWING_APPLY = 'sheet.mutation.set-drawing-apply'
const colIndex = (s: string) => [...s.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1
const colName = (c: number): string => {
  let s = ''
  for (c++; c > 0; c = Math.floor((c - 1) / 26)) s = String.fromCharCode(65 + ((c - 1) % 26)) + s
  return s
}

// Shifts an A1 range ('A1:C5') through structural changes of one sheet.
function mapA1(ref: string, changes: Structural[]): string {
  const m = /^([A-Z]{1,3})(\d+)(?::([A-Z]{1,3})(\d+))?$/.exec(ref)
  if (!m) return ref
  let range: Range | null = {
    startColumn: colIndex(m[1]),
    startRow: Number(m[2]) - 1,
    endColumn: colIndex(m[3] ?? m[1]),
    endRow: Number(m[4] ?? m[2]) - 1,
  }
  for (const s of changes) range = range && mapRange(range, s)
  if (!range) return ref // the whole source was deleted: the chart shows no data
  const a = `${colName(range.startColumn)}${range.startRow + 1}`
  const b = `${colName(range.endColumn)}${range.endRow + 1}`
  return a === b ? a : `${a}:${b}`
}

// A chart edit made without knowing about a concurrent row/column change of its
// source sheet: shift the source range of the chart specs the edit writes
// (whole specs, and plain range replacements such as RefRangeService's).
function transformDrawing(params: Params, concurrent: Structural[]): Params {
  let changed = false
  const walk = (node: unknown, parentKey?: string): unknown => {
    if (Array.isArray(node)) return node.map((n, i) => walk(n, i > 0 && node[i - 1] === 'range' ? 'range' : undefined))
    if (!node || typeof node !== 'object') return node
    const obj = node as Record<string, unknown>
    if (obj.kind === 'ofimeo-chart' && typeof obj.range === 'string' && typeof obj.sheetId === 'string') {
      const changes = concurrent.filter((c) => c.sheet === obj.sheetId)
      const range = changes.length ? mapA1(obj.range, changes) : obj.range
      if (range !== obj.range) changed = true
      return { ...obj, range }
    }
    if (parentKey === 'range' && typeof obj.i === 'string') {
      const changes = concurrent.filter((c) => c.sheet === params.subUnitId)
      const i = mapA1(obj.i, changes)
      if (i !== obj.i) changed = true
      return { ...obj, i }
    }
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) out[k] = walk(v)
    return out
  }
  const op = walk(params.op)
  return changed ? { ...params, op } : params
}

// Returns transformed params, or null when the mutation no longer applies.
export function transform(mutation: string, params: Params, concurrent: Structural[]): Params | null {
  if (mutation === DRAWING_APPLY) return transformDrawing(params, concurrent)
  const changes = concurrent.filter((c) => c.sheet === params.subUnitId)
  if (!changes.length) return params

  if (mutation === 'sheet.mutation.set-range-values') {
    const cellValue = (params.cellValue ?? {}) as Record<string, Record<string, unknown>>
    const next: Record<number, Record<number, unknown>> = {}
    for (const [r, cols] of Object.entries(cellValue)) {
      for (const [c, cell] of Object.entries(cols ?? {})) {
        let row: number | null = Number(r)
        let col: number | null = Number(c)
        for (const s of changes) {
          if (row === null || col === null) break
          if (s.axis === 'row') row = mapIndex(row, s)
          else col = mapIndex(col, s)
        }
        if (row === null || col === null) continue
        ;(next[row] ??= {})[col] = cell
      }
    }
    return Object.keys(next).length ? { ...params, cellValue: next } : null
  }

  if (STRUCTURAL[mutation]) {
    let range: Range | null = params.range as Range
    for (const s of changes) {
      if (!range) break
      // Two insertions at the same place both happen; the later one lands before.
      range = mapRange(range, s)
    }
    return range ? { ...params, range } : null
  }

  if (RANGES_MUTATIONS.has(mutation)) {
    const ranges = ((params.ranges ?? []) as Range[])
      .map((r) => changes.reduce<Range | null>((acc, s) => (acc ? mapRange(acc, s) : null), r))
      .filter((r): r is Range => r !== null)
    return ranges.length ? { ...params, ranges } : null
  }

  return params
}
