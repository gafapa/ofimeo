// Evaluates a construction: classifies every row (function, equation,
// inequality, curve, point, geometry command, number), resolves the names in
// dependency order and computes the values that the renderer draws and the
// readouts describe.

import {
  calledFunctions, compile, CONSTANTS, freeVars, parseStatement, ParseError, statementLatex, toLatex,
  type Compiled, type Env, type Known, type Node, type Relation, type Scope,
} from './expr'
import type { GraphDoc, Row } from './model'

export type Pt = { x: number; y: number }

export type Value =
  | { t: 'function'; f: (x: number) => number }
  | { t: 'vline'; x: number }
  | { t: 'parametric'; x: (t: number) => number; y: (t: number) => number; tmin: number; tmax: number }
  | { t: 'polar'; r: (th: number) => number; tmin: number; tmax: number }
  | { t: 'ineq'; f: (x: number) => number; op: Relation }
  | { t: 'implicit'; F: (x: number, y: number) => number; op: Relation }
  | { t: 'point'; x: number; y: number }
  | { t: 'segment' | 'line' | 'ray'; a: Pt; b: Pt }
  | { t: 'circle'; c: Pt; r: number }
  | { t: 'polygon'; pts: Pt[] }
  | { t: 'angle'; v: Pt; a: Pt; c: Pt; deg: number }
  | { t: 'number'; value: number }

export type Kind =
  | 'function' | 'definition' | 'vline' | 'parametric' | 'polar' | 'ineq' | 'implicit' | 'point' | 'number' | 'empty' | 'error'
  | 'segment' | 'line' | 'ray' | 'circle' | 'polygon' | 'midpoint' | 'perpendicular' | 'parallel' | 'intersect' | 'angle' | 'measure'

export interface RowResult {
  row: Row
  index: number
  // Name used in references and readouts (automatic for unnamed rows).
  name: string
  // The user gave the name (A = …, f(x) = …).
  named: boolean
  kind: Kind
  latex: string
  // null: defined but does not exist now (e.g. circles that do not meet).
  value: Value | null
  error?: string
  // A point with literal coordinates, moved by dragging.
  free?: boolean
  command?: string
  // Argument names (or texts) of a command, for descriptions.
  args?: string[]
  // Expression of a function, for readouts.
  expr?: Node
}

export interface Computed {
  results: RowResult[]
  byName: Map<string, RowResult>
  scope: Scope
  env: Env
  // Names used but not defined anywhere (candidates for sliders).
  unknown: string[]
}

// Geometry commands; localized aliases map to the English names stored by the tools.
export const COMMANDS = ['Segment', 'Line', 'Ray', 'Circle', 'Polygon', 'Midpoint', 'Perpendicular', 'Parallel', 'Intersect', 'Angle', 'Distance', 'Length', 'Area', 'Slope', 'Perimeter'] as const
export type Command = (typeof COMMANDS)[number]
const ALIASES: Record<string, Command> = {
  segmento: 'Segment', strecke: 'Segment',
  recta: 'Line', droite: 'Line', gerade: 'Line',
  semirrecta: 'Ray', demidroite: 'Ray', strahl: 'Ray',
  circunferencia: 'Circle', círculo: 'Circle', circulo: 'Circle', cercle: 'Circle', kreis: 'Circle',
  polígono: 'Polygon', poligono: 'Polygon', polygone: 'Polygon', vieleck: 'Polygon',
  puntomedio: 'Midpoint', milieu: 'Midpoint', mittelpunkt: 'Midpoint',
  perpendiculaire: 'Perpendicular', senkrechte: 'Perpendicular', lot: 'Perpendicular',
  paralela: 'Parallel', parallèle: 'Parallel', parallele: 'Parallel',
  interseca: 'Intersect', intersección: 'Intersect', interseccion: 'Intersect', intersection: 'Intersect', schneide: 'Intersect',
  ángulo: 'Angle', angulo: 'Angle', winkel: 'Angle',
  distancia: 'Distance', abstand: 'Distance',
  longitud: 'Length', lonxitude: 'Length', longueur: 'Length', länge: 'Length', laenge: 'Length',
  área: 'Area', aire: 'Area', fläche: 'Area', flaeche: 'Area',
  pendiente: 'Slope', pendente: 'Slope', pente: 'Slope', steigung: 'Slope',
  perímetro: 'Perimeter', perimetro: 'Perimeter', périmètre: 'Perimeter', umfang: 'Perimeter',
}
export function commandOf(name: string): Command | null {
  const lower = name.toLowerCase()
  return COMMANDS.find((c) => c.toLowerCase() === lower) ?? ALIASES[lower] ?? null
}
const COMMAND_WORDS = new Set<string>([...COMMANDS, ...COMMANDS.map((c) => c.toLowerCase()), ...Object.keys(ALIASES), ...Object.keys(ALIASES).map((a) => a[0].toUpperCase() + a.slice(1))])

const GREEK_NAMES: Record<string, string> = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', theta: 'θ', lambda: 'λ', mu: 'μ', phi: 'φ', rho: 'ρ', sigma: 'σ', tau: 'τ', omega: 'ω' }
const normName = (n: string) => GREEK_NAMES[n] ?? n
const RESERVED = new Set(['x', 'y', 'r', 't', 'θ', 'e', 'π'])
const FUNCTION_NAMES = ['f', 'g', 'h', 'p', 'q', 'u', 'v', 'w']

const DEF_FN = /^\s*(\p{L}[\p{L}\d_]*)\s*\(\s*(\p{L}[\p{L}\d_]*(?:\s*,\s*\p{L}[\p{L}\d_]*)*)\s*\)\s*=/u
const DEF_NAME = /^\s*(\p{L}[\p{L}\d_]*)\s*=(?!=)/u

class CalcError extends Error {}

export function compute(doc: GraphDoc): Computed {
  // Pass 1: names defined by the rows, for the parser.
  const funcs = new Set<string>(COMMAND_WORDS)
  const names = new Set<string>(doc.sliders.map((s) => s.name))
  for (const row of doc.rows) {
    const fn = DEF_FN.exec(row.text)
    if (fn && !commandOf(fn[1]) && !RESERVED.has(fn[1])) funcs.add(normName(fn[1]))
    else {
      const def = DEF_NAME.exec(row.text)
      if (def && !RESERVED.has(normName(def[1]))) names.add(normName(def[1]))
    }
  }
  const known: Known = { names, funcs }
  const scope: Scope = Object.create(null)
  for (const s of doc.sliders) scope[s.name] = s.value
  const env: Env = { funcs: {}, degrees: doc.options.degrees }
  const results: RowResult[] = []
  const byName = new Map<string, RowResult>()
  const unknown = new Set<string>()
  const used = new Set<string>([...names, ...funcs])
  const autoName = (prefix: string | string[]) => {
    if (Array.isArray(prefix)) {
      for (const n of prefix) if (!used.has(n)) return (used.add(n), n)
    }
    const p = Array.isArray(prefix) ? prefix[0] : prefix
    for (let i = 1; ; i++) if (!used.has(`${p}${i}`)) return (used.add(`${p}${i}`), `${p}${i}`)
  }

  // Pass 2: parse and classify.
  interface Pending {
    res: RowResult
    deps: Set<string>
    run: () => void
  }
  const pending: Pending[] = []
  doc.rows.forEach((row, index) => {
    const res: RowResult = { row, index, name: '', named: false, kind: 'empty', latex: '', value: null }
    results.push(res)
    if (!row.text.trim()) return
    try {
      const st = parseStatement(row.text, known)
      res.latex = statementLatex(st)
      const job = classify(st, res)
      if (!job) return
      if (!res.name) res.name = autoName(job.auto)
      byName.set(res.name, res)
      const deps = new Set<string>()
      for (const v of job.vars) {
        if (job.locals.has(v)) continue
        if (names.has(v) || funcs.has(v)) deps.add(v)
        else if (!(v in CONSTANTS)) unknown.add(v)
      }
      for (const f of job.calls) if (!commandOf(f)) deps.add(f)
      deps.delete(res.name)
      pending.push({ res, deps, run: job.run })
    } catch (err) {
      res.kind = 'error'
      res.error = err instanceof ParseError || err instanceof CalcError ? err.message : String((err as Error).message ?? err)
    }
  })

  // Pass 3: evaluate in dependency order.
  const done = new Set<string>(doc.sliders.map((s) => s.name))
  let progress = true
  while (pending.length && progress) {
    progress = false
    for (let i = 0; i < pending.length; i++) {
      const p = pending[i]
      if (![...p.deps].every((d) => done.has(d) || !byName.has(d))) continue
      pending.splice(i--, 1)
      progress = true
      try {
        p.run()
      } catch (err) {
        p.res.kind = 'error'
        p.res.value = null
        p.res.error = err instanceof ParseError || err instanceof CalcError ? err.message : String((err as Error).message ?? err)
      }
      done.add(p.res.name)
    }
  }
  for (const p of pending) {
    p.res.kind = 'error'
    p.res.error = 'Circular definition'
  }
  for (const n of [...unknown]) if (byName.has(n) || RESERVED.has(n)) unknown.delete(n)
  return { results, byName, scope, env, unknown: [...unknown] }

  // ---------- Classification ----------

  function classify(st: ReturnType<typeof parseStatement>, res: RowResult): { vars: Set<string>; calls: Set<string>; locals: Set<string>; auto: string | string[]; run: () => void } | null {
    const { lhs, rel, rhs } = st
    const all = [lhs, ...(rhs ? [rhs] : [])]
    const vars = new Set<string>()
    const calls = new Set<string>()
    all.forEach((n) => (freeVars(n, vars), calledFunctions(n, calls)))
    const job = (kind: Kind, auto: string | string[], locals: string[], run: () => void, own?: Node) => {
      res.kind = kind
      const v = new Set<string>()
      const c = new Set<string>()
      const nodes = own ? [own] : all
      nodes.forEach((n) => (freeVars(n, v), calledFunctions(n, c)))
      return { vars: v, calls: c, locals: new Set(locals), auto, run }
    }
    const isVar = (n: Node | undefined, name: string) => n?.k === 'var' && n.name === name
    const uses = (n: Node, name: string) => freeVars(n).has(name)

    if (!rel) {
      if (lhs.k === 'tuple') return tupleRow(lhs, res, job)
      if (lhs.k === 'call' && commandOf(lhs.name)) return commandRow(lhs, res, job)
      if (vars.has('y')) throw new CalcError('Add "=" or an inequality')
      return functionRow(lhs, res, job, 'x')
    }
    if (rel === '=') {
      if (isVar(lhs, 'y') && !uses(rhs!, 'y')) return functionRow(rhs!, res, job, 'x')
      if (isVar(lhs, 'x') && !uses(rhs!, 'x') && !uses(rhs!, 'y')) {
        const c = compile(rhs!, env)
        return job('vline', 'l', [], () => (res.value = finite({ t: 'vline', x: c(scope) }, res)), rhs)
      }
      if (isVar(lhs, 'r') && !uses(rhs!, 'x') && !uses(rhs!, 'y')) {
        const c = compile(rhs!, env)
        const local = Object.create(scope) as Scope
        return job('polar', 'c', ['θ', 't'], () => (res.value = { t: 'polar', r: (th) => ((local.θ = local.t = th), c(local)), tmin: 0, tmax: 2 * Math.PI }), rhs)
      }
      // f(x) = …: a function definition (plotted when it has one variable).
      if (lhs.k === 'call' && funcs.has(lhs.name) && !commandOf(lhs.name) && lhs.args.every((a) => a.k === 'var') && !lhs.primes) {
        const params = lhs.args.map((a) => (a as { name: string }).name)
        res.name = lhs.name
        res.named = true
        const body = compile(rhs!, env)
        const local = Object.create(scope) as Scope
        let depth = 0
        env.funcs[lhs.name] = (args) => {
          if (depth > 64) return NaN
          depth++
          const s = Object.create(scope) as Scope
          params.forEach((p, i) => (s[p] = args[i]))
          try {
            return body(s)
          } finally {
            depth--
          }
        }
        res.expr = rhs
        if (params.length !== 1) return job('definition', lhs.name, params, () => (res.value = null), rhs)
        const p = params[0]
        return job('function', lhs.name, params, () => (res.value = { t: 'function', f: (x) => ((local[p] = x), body(local)) }), rhs)
      }
      // Name = value: points, objects and numbers.
      if (lhs.k === 'var' && names.has(lhs.name)) {
        res.name = lhs.name
        res.named = true
        if (rhs!.k === 'tuple') return tupleRow(rhs!, res, job)
        if (rhs!.k === 'call' && commandOf(rhs!.name)) return commandRow(rhs!, res, job)
        if (!uses(rhs!, 'y') && uses(rhs!, 'x')) return functionRow(rhs!, res, job, 'x')
        if (!uses(rhs!, 'y')) {
          const c = compile(rhs!, env)
          return job('number', lhs.name, [], () => {
            const v = c(scope)
            scope[lhs.name] = v
            res.value = { t: 'number', value: v }
          }, rhs)
        }
      }
      return implicitRow(lhs, '=', rhs!, job)
    }
    // Inequalities.
    if (isVar(lhs, 'y') && !uses(rhs!, 'y')) return ineqRow(rhs!, rel, job)
    if (isVar(rhs, 'y') && !uses(lhs, 'y')) return ineqRow(lhs, flip(rel), job)
    return implicitRow(lhs, rel, rhs!, job)

    function ineqRow(expr: Node, op: Relation, jobFn: typeof job) {
      const c = compile(expr, env)
      const local = Object.create(scope) as Scope
      return jobFn('ineq', 'R', ['x'], () => (res.value = { t: 'ineq', op, f: (x) => ((local.x = x), c(local)) }), expr)
    }
  }

  function functionRow(expr: Node, res: RowResult, job: JobFn, variable: string) {
    const c = compile(expr, env)
    const local = Object.create(scope) as Scope
    res.expr = expr
    const out = job('function', FUNCTION_NAMES, [variable], () => {
      res.value = { t: 'function', f: (x) => ((local[variable] = x), c(local)) }
    }, expr)
    // Unnamed functions can be called by their automatic name (f, g, …).
    const run = out.run
    out.run = () => {
      run()
      const f = (res.value as { f: (x: number) => number }).f
      if (!env.funcs[res.name]) env.funcs[res.name] = (args) => f(args[0])
    }
    return out
  }

  function implicitRow(lhs: Node, op: Relation, rhs: Node, job: JobFn) {
    const l = compile(lhs, env)
    const r = compile(rhs, env)
    const local = Object.create(scope) as Scope
    const res = results[results.length - 1]
    return job('implicit', 'c', ['x', 'y'], () => {
      res.value = { t: 'implicit', op, F: (x, y) => ((local.x = x), (local.y = y), l(local) - r(local)) }
    })
  }

  function tupleRow(node: Node & { k: 'tuple' }, res: RowResult, job: JobFn) {
    if (node.items.length !== 2) throw new CalcError('A point has two coordinates')
    const [xn, yn] = node.items
    const vars = new Set([...freeVars(xn), ...freeVars(yn)])
    if (vars.has('t')) {
      const cx = compile(xn, env)
      const cy = compile(yn, env)
      const local = Object.create(scope) as Scope
      return job('parametric', 'c', ['t'], () => {
        res.value = { t: 'parametric', x: (t) => ((local.t = t), cx(local)), y: (t) => ((local.t = t), cy(local)), tmin: 0, tmax: 2 * Math.PI }
      }, node)
    }
    const literal = (n: Node) => n.k === 'num' || (n.k === 'neg' && n.a.k === 'num')
    res.free = literal(xn) && literal(yn)
    const cx = compile(xn, env)
    const cy = compile(yn, env)
    return job('point', pointNames(), [], () => (res.value = finite({ t: 'point', x: cx(scope), y: cy(scope) }, res)), node)
  }

  function pointNames(): string[] {
    const out: string[] = []
    for (let i = 0; i < 26; i++) out.push(String.fromCharCode(65 + i))
    return out
  }

  function commandRow(node: Node & { k: 'call' }, res: RowResult, job: JobFn) {
    const cmd = commandOf(node.name)!
    res.command = cmd
    res.args = node.args.map((a) => (a.k === 'var' ? a.name : toLatex(a)))
    const argVals = () => node.args.map((a) => argValue(a))
    const kinds: Record<Command, { kind: Kind; auto: string | string[] }> = {
      Segment: { kind: 'segment', auto: 's' },
      Line: { kind: 'line', auto: 'l' },
      Ray: { kind: 'ray', auto: 'r' },
      Circle: { kind: 'circle', auto: 'c' },
      Polygon: { kind: 'polygon', auto: 'poly' },
      Midpoint: { kind: 'midpoint', auto: pointNames() },
      Perpendicular: { kind: 'perpendicular', auto: 'l' },
      Parallel: { kind: 'parallel', auto: 'l' },
      Intersect: { kind: 'intersect', auto: pointNames() },
      Angle: { kind: 'angle', auto: ['α', 'β', 'γ', 'δ', 'ε', 'φ'] },
      Distance: { kind: 'measure', auto: 'd' },
      Length: { kind: 'measure', auto: 'd' },
      Area: { kind: 'measure', auto: 'A' },
      Slope: { kind: 'measure', auto: 'm' },
      Perimeter: { kind: 'measure', auto: 'P' },
    }
    const { kind, auto } = kinds[cmd]
    return job(kind, auto, [], () => {
      res.value = runCommand(cmd, argVals())
      if (res.value?.t === 'number' && res.named) scope[res.name] = res.value.value
      if (res.value?.t === 'angle' && res.named) scope[res.name] = res.value.deg
    }, node)
  }

  // A command argument: a named object, a point written inline, or a number.
  function argValue(n: Node): Value | null {
    if (n.k === 'var' && byName.has(n.name)) {
      const r = byName.get(n.name)!
      if (r.kind === 'error') throw new CalcError(`${n.name} is not defined`)
      return r.value
    }
    if (n.k === 'tuple' && n.items.length === 2) return { t: 'point', x: compile(n.items[0], env)(scope), y: compile(n.items[1], env)(scope) }
    return { t: 'number', value: compile(n, env)(scope) }
  }
}

type JobFn = (kind: Kind, auto: string | string[], locals: string[], run: () => void, own?: Node) => { vars: Set<string>; calls: Set<string>; locals: Set<string>; auto: string | string[]; run: () => void }

function flip(op: Relation): Relation {
  return op === '<' ? '>' : op === '>' ? '<' : op === '<=' ? '>=' : op === '>=' ? '<=' : op
}

function finite<T extends Value>(v: T, res: RowResult): T | null {
  if (v.t === 'point' && (!Number.isFinite(v.x) || !Number.isFinite(v.y))) return null
  if (v.t === 'vline' && !Number.isFinite(v.x)) return null
  void res
  return v
}

// ---------- Geometry ----------

const isPt = (v: Value | null): v is Value & { t: 'point' } => v?.t === 'point'
const isLine = (v: Value | null): v is Value & { t: 'segment' | 'line' | 'ray' } => v?.t === 'segment' || v?.t === 'line' || v?.t === 'ray'
const numOf = (v: Value | null) => (v?.t === 'number' ? v.value : NaN)
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

function need(ok: boolean, message: string): asserts ok {
  if (!ok) throw new CalcError(message)
}

function runCommand(cmd: Command, args: (Value | null)[]): Value | null {
  // Objects that do not exist now (e.g. no intersection) make dependents undefined.
  if (args.some((a) => a === null)) return null
  const pts = (n: number) => {
    need(args.length === n && args.every(isPt), `${cmd} needs ${n} points`)
    return args as Pt[]
  }
  switch (cmd) {
    case 'Segment':
    case 'Line':
    case 'Ray': {
      const [a, b] = pts(2)
      return { t: cmd === 'Segment' ? 'segment' : cmd === 'Line' ? 'line' : 'ray', a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } }
    }
    case 'Circle': {
      need(args.length === 2 && isPt(args[0]), 'Circle needs a center and a point or a radius')
      const c = args[0] as Pt
      const r = isPt(args[1]) ? dist(c, args[1]) : numOf(args[1])
      need(Number.isFinite(r), 'Circle needs a center and a point or a radius')
      return { t: 'circle', c: { x: c.x, y: c.y }, r: Math.abs(r) }
    }
    case 'Polygon': {
      need(args.length >= 3 && args.every(isPt), 'Polygon needs at least 3 points')
      return { t: 'polygon', pts: (args as Pt[]).map((p) => ({ x: p.x, y: p.y })) }
    }
    case 'Midpoint': {
      if (args.length === 1 && args[0]?.t === 'segment') {
        const s = args[0]
        return { t: 'point', x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 }
      }
      const [a, b] = pts(2)
      return { t: 'point', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    }
    case 'Perpendicular':
    case 'Parallel': {
      need(args.length === 2, `${cmd} needs a line and a point`)
      const line = args.find(isLine)
      const p = args.find(isPt)
      need(!!line && !!p, `${cmd} needs a line and a point`)
      let dx = line.b.x - line.a.x
      let dy = line.b.y - line.a.y
      if (cmd === 'Perpendicular') [dx, dy] = [-dy, dx]
      return { t: 'line', a: { x: p.x, y: p.y }, b: { x: p.x + dx, y: p.y + dy } }
    }
    case 'Intersect': {
      need(args.length >= 2 && args.length <= 3, 'Intersect needs two lines or circles')
      const n = args.length === 3 ? Math.round(numOf(args[2])) : 1
      const hits = intersections(args[0]!, args[1]!)
      need(hits !== null, 'Intersect works with lines, segments and circles')
      const p = hits[n - 1]
      return p ? { t: 'point', x: p.x, y: p.y } : null
    }
    case 'Angle': {
      const [a, v, c] = pts(3)
      const a1 = Math.atan2(a.y - v.y, a.x - v.x)
      const a2 = Math.atan2(c.y - v.y, c.x - v.x)
      let deg = (((a2 - a1) * 180) / Math.PI) % 360
      if (deg < 0) deg += 360
      if (deg > 180) deg = 360 - deg
      return { t: 'angle', v: { ...v }, a: { ...a }, c: { ...c }, deg }
    }
    case 'Distance': {
      need(args.length === 2, 'Distance needs two objects')
      const [p, q] = args
      if (isPt(p) && isPt(q)) return { t: 'number', value: dist(p, q) }
      const pt = [p, q].find(isPt)
      const line = [p, q].find(isLine)
      need(!!pt && !!line, 'Distance needs two points, or a point and a line')
      const dx = line.b.x - line.a.x
      const dy = line.b.y - line.a.y
      return { t: 'number', value: Math.abs(dy * (pt.x - line.a.x) - dx * (pt.y - line.a.y)) / Math.hypot(dx, dy) }
    }
    case 'Length':
    case 'Perimeter': {
      need(args.length === 1 || (cmd === 'Length' && args.length === 2), `${cmd} needs one object`)
      const o = args[0]!
      if (args.length === 2 && isPt(o) && isPt(args[1])) return { t: 'number', value: dist(o, args[1]) }
      if (o.t === 'segment') return { t: 'number', value: dist(o.a, o.b) }
      if (o.t === 'circle') return { t: 'number', value: 2 * Math.PI * o.r }
      if (o.t === 'polygon') return { t: 'number', value: perimeter(o.pts) }
      throw new CalcError(`${cmd} works with segments, circles and polygons`)
    }
    case 'Area': {
      need(args.length === 1, 'Area needs a polygon or a circle')
      const o = args[0]!
      if (o.t === 'circle') return { t: 'number', value: Math.PI * o.r * o.r }
      if (o.t === 'polygon') return { t: 'number', value: area(o.pts) }
      throw new CalcError('Area needs a polygon or a circle')
    }
    case 'Slope': {
      need(args.length === 1 && isLine(args[0]), 'Slope needs a line')
      const l = args[0] as Value & { a: Pt; b: Pt }
      return { t: 'number', value: (l.b.y - l.a.y) / (l.b.x - l.a.x) }
    }
  }
}

export function perimeter(pts: Pt[]): number {
  return pts.reduce((sum, p, i) => sum + dist(p, pts[(i + 1) % pts.length]), 0)
}

export function area(pts: Pt[]): number {
  let s = 0
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length]
    s += p.x * q.y - q.x * p.y
  })
  return Math.abs(s) / 2
}

// Intersection points of two lines/segments/rays/circles (null: unsupported objects).
export function intersections(p: Value, q: Value): Pt[] | null {
  if (isLine(p) && isLine(q)) {
    const d1x = p.b.x - p.a.x, d1y = p.b.y - p.a.y
    const d2x = q.b.x - q.a.x, d2y = q.b.y - q.a.y
    const den = d1x * d2y - d1y * d2x
    if (Math.abs(den) < 1e-12) return []
    const s = ((q.a.x - p.a.x) * d2y - (q.a.y - p.a.y) * d2x) / den
    const u = ((q.a.x - p.a.x) * d1y - (q.a.y - p.a.y) * d1x) / den
    if (!within(p, s) || !within(q, u)) return []
    return [{ x: p.a.x + s * d1x, y: p.a.y + s * d1y }]
  }
  if (isLine(p) && q.t === 'circle') return lineCircle(p, q)
  if (p.t === 'circle' && isLine(q)) return lineCircle(q, p)
  if (p.t === 'circle' && q.t === 'circle') {
    const d = dist(p.c, q.c)
    if (d < 1e-12 || d > p.r + q.r + 1e-12 || d < Math.abs(p.r - q.r) - 1e-12) return []
    const a = (p.r * p.r - q.r * q.r + d * d) / (2 * d)
    const h = Math.sqrt(Math.max(0, p.r * p.r - a * a))
    const mx = p.c.x + (a * (q.c.x - p.c.x)) / d
    const my = p.c.y + (a * (q.c.y - p.c.y)) / d
    const ox = (h * (q.c.y - p.c.y)) / d
    const oy = (h * (q.c.x - p.c.x)) / d
    return h < 1e-12 ? [{ x: mx, y: my }] : [{ x: mx + ox, y: my - oy }, { x: mx - ox, y: my + oy }]
  }
  return null
}

function within(l: { t: string }, s: number): boolean {
  const eps = 1e-9
  if (l.t === 'segment') return s >= -eps && s <= 1 + eps
  if (l.t === 'ray') return s >= -eps
  return true
}

function lineCircle(l: Value & { t: 'segment' | 'line' | 'ray' }, c: { c: Pt; r: number }): Pt[] {
  const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y
  const fx = l.a.x - c.c.x, fy = l.a.y - c.c.y
  const a = dx * dx + dy * dy
  const b = 2 * (fx * dx + fy * dy)
  const k = fx * fx + fy * fy - c.r * c.r
  const disc = b * b - 4 * a * k
  if (disc < -1e-12 || a === 0) return []
  const sq = Math.sqrt(Math.max(0, disc))
  const ss = sq < 1e-12 ? [-b / (2 * a)] : [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]
  return ss.filter((s) => within(l, s)).map((s) => ({ x: l.a.x + s * dx, y: l.a.y + s * dy }))
}

export type { Compiled }
