// Small math expression language for the graphing calculator: a tokenizer, a
// recursive-descent parser (implicit multiplication, unary minus, right
// associative powers, comparisons at the top level), a compiler to closures and
// a LaTeX printer for the KaTeX preview. No eval, no dependencies.

export type Node =
  | { k: 'num'; v: number }
  | { k: 'var'; name: string }
  | { k: 'neg'; a: Node }
  | { k: 'bin'; op: '+' | '-' | '*' | '/' | '^'; a: Node; b: Node }
  | { k: 'call'; name: string; args: Node[]; primes: number }
  | { k: 'fact'; a: Node }
  | { k: 'tuple'; items: Node[] }

export type Relation = '=' | '<' | '>' | '<=' | '>='

// A whole row: `lhs rel rhs` or a lone expression.
export interface Statement {
  lhs: Node
  rel?: Relation
  rhs?: Node
}

export class ParseError extends Error {}

// Built-in functions (numbers of arguments: 1 unless listed).
const FUNCS1: Record<string, (x: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  cot: (x) => 1 / Math.tan(x), sec: (x) => 1 / Math.cos(x), csc: (x) => 1 / Math.sin(x),
  asin: Math.asin, acos: Math.acos, atan: Math.atan, arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log: Math.log10, lg: Math.log10, log2: Math.log2,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign, sgn: Math.sign,
}
const FUNCS2: Record<string, (a: number, b: number) => number> = {
  root: (x, n) => (x < 0 && Math.abs(n % 2) === 1 ? -Math.pow(-x, 1 / n) : Math.pow(x, 1 / n)),
  mod: (a, b) => ((a % b) + b) % b,
  atan2: Math.atan2,
  logb: (b, x) => Math.log(x) / Math.log(b),
}
const TRIG = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc'])
const INVERSE_TRIG = new Set(['asin', 'acos', 'atan', 'arcsin', 'arccos', 'arctan'])
const VARIADIC = new Set(['min', 'max'])
export const BUILTIN_FUNCTIONS = new Set([...Object.keys(FUNCS1), ...Object.keys(FUNCS2), ...VARIADIC])

const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', theta: 'θ', lambda: 'λ', mu: 'μ', phi: 'φ', rho: 'ρ', sigma: 'σ', tau: 'τ', omega: 'ω', pi: 'π',
}
const GREEK_LATEX: Record<string, string> = Object.fromEntries(Object.entries(GREEK).map(([name, ch]) => [ch, `\\${name}`]))
export const CONSTANTS: Record<string, number> = { π: Math.PI, e: Math.E }

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string }

function tokenize(src: string): Tok[] {
  const s = src
    .replace(/[−–]/g, '-')
    .replace(/[·×⋅]/g, '*')
    .replace(/÷/g, '/')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/√/g, 'sqrt')
  const out: Tok[] = []
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i))
    if (num && /[\d.]/.test(c)) {
      out.push({ t: 'num', v: parseFloat(num[0]) })
      i += num[0].length
      continue
    }
    const id = /^[A-Za-zͰ-Ͽ][A-Za-z0-9_Ͱ-Ͽ]*/.exec(s.slice(i))
    if (id) {
      out.push({ t: 'id', v: id[0] })
      i += id[0].length
      continue
    }
    const two = s.slice(i, i + 2)
    if (two === '<=' || two === '>=' || two === '**') {
      out.push({ t: 'op', v: two === '**' ? '^' : two })
      i += 2
      continue
    }
    if ('+-*/^(),=<>!\'[]|;'.includes(c)) {
      out.push({ t: 'op', v: c === '[' ? '(' : c === ']' ? ')' : c === ';' ? ',' : c })
      i++
      continue
    }
    throw new ParseError(`Unexpected character "${c}"`)
  }
  return out
}

// Names defined by the user so that a multi-letter word is not split into
// single-letter variables (ax → a·x): `names` (objects, sliders) and `funcs`
// (user functions and commands, called with parentheses).
export interface Known {
  names: ReadonlySet<string>
  funcs: ReadonlySet<string>
}
const NONE: Known = { names: new Set(), funcs: new Set() }

export function parseStatement(src: string, known: Known = NONE): Statement {
  const p = new Parser(tokenize(src), known)
  const lhs = p.expr()
  let rel: Relation | undefined
  let rhs: Node | undefined
  const op = p.peekOp()
  if (op === '=' || op === '<' || op === '>' || op === '<=' || op === '>=') {
    p.pos++
    rel = op
    rhs = p.expr()
  }
  if (p.pos < p.toks.length) throw new ParseError(`Unexpected "${tokText(p.toks[p.pos])}"`)
  return { lhs, rel, rhs }
}

export function parseExpression(src: string, known: Known = NONE): Node {
  const s = parseStatement(src, known)
  if (s.rel) throw new ParseError('Unexpected comparison')
  return s.lhs
}

function tokText(t: Tok): string {
  return String(t.v)
}

class Parser {
  pos = 0
  constructor(
    readonly toks: Tok[],
    readonly known: Known,
  ) {
    this.toks = this.split(toks)
  }

  // Resolves identifiers: known names and built-ins stay whole, other words become letters.
  private split(toks: Tok[]): Tok[] {
    const out: Tok[] = []
    for (const tok of toks) {
      if (tok.t !== 'id') {
        out.push(tok)
        continue
      }
      const word = GREEK[tok.v] ?? tok.v
      if (word.length === 1 || this.isWord(word) || /\d|_/.test(word)) {
        out.push({ t: 'id', v: word })
        continue
      }
      // Longest known prefix first (xsin → x·sin), else one letter.
      let rest = word
      while (rest) {
        let taken = ''
        for (let n = rest.length; n > 1; n--) {
          const head = rest.slice(0, n)
          if (this.isWord(head) || GREEK[head]) {
            taken = head
            break
          }
        }
        taken ||= rest[0]
        out.push({ t: 'id', v: GREEK[taken] ?? taken })
        rest = rest.slice(taken.length)
      }
    }
    return out
  }

  private isWord(w: string): boolean {
    return this.known.names.has(w) || this.known.funcs.has(w) || BUILTIN_FUNCTIONS.has(w) || w in CONSTANTS
  }

  peekOp(): string | undefined {
    const t = this.toks[this.pos]
    return t?.t === 'op' ? t.v : undefined
  }

  private eat(op: string): boolean {
    if (this.peekOp() === op) {
      this.pos++
      return true
    }
    return false
  }

  private expect(op: string) {
    if (!this.eat(op)) {
      const t = this.toks[this.pos]
      throw new ParseError(t ? `Expected "${op}" before "${tokText(t)}"` : `Missing "${op}"`)
    }
  }

  expr(): Node {
    let a = this.term()
    for (;;) {
      const op = this.peekOp()
      if (op !== '+' && op !== '-') return a
      this.pos++
      a = { k: 'bin', op, a, b: this.term() }
    }
  }

  private term(): Node {
    let a = this.unary()
    for (;;) {
      const op = this.peekOp()
      if (op === '*' || op === '/') {
        this.pos++
        a = { k: 'bin', op, a, b: this.unary() }
      } else if (this.startsOperand()) {
        // Implicit multiplication: 2x, 3(x+1), (x+1)(x-1), x sin x.
        a = { k: 'bin', op: '*', a, b: this.power() }
      } else return a
    }
  }

  private startsOperand(): boolean {
    const t = this.toks[this.pos]
    if (!t) return false
    if (t.t === 'num' || t.t === 'id') return true
    return t.v === '(' || (t.v === '|' && !this.inAbs)
  }

  private unary(): Node {
    if (this.eat('-')) return { k: 'neg', a: this.unary() }
    if (this.eat('+')) return this.unary()
    return this.power()
  }

  private power(): Node {
    const base = this.postfix()
    if (this.eat('^')) return { k: 'bin', op: '^', a: base, b: this.unary() }
    return base
  }

  private postfix(): Node {
    let a = this.primary()
    while (this.eat('!')) a = { k: 'fact', a }
    return a
  }

  private inAbs = false

  private primary(): Node {
    const t = this.toks[this.pos]
    if (!t) throw new ParseError('Incomplete expression')
    if (t.t === 'num') {
      this.pos++
      return { k: 'num', v: t.v }
    }
    if (t.t === 'id') {
      this.pos++
      let primes = 0
      while (this.eat("'")) primes++
      const isFunc = BUILTIN_FUNCTIONS.has(t.v) || this.known.funcs.has(t.v)
      if (this.peekOp() === '(' && (isFunc || primes)) {
        this.pos++
        const args = this.peekOp() === ')' ? [] : this.list()
        this.expect(')')
        return { k: 'call', name: t.v, args, primes }
      }
      if (BUILTIN_FUNCTIONS.has(t.v)) {
        // sin x, sqrt 2: one operand without parentheses.
        return { k: 'call', name: t.v, args: [this.power()], primes }
      }
      if (primes) throw new ParseError(`Expected "(" after ${t.v}'`)
      return { k: 'var', name: t.v }
    }
    if (t.v === '(') {
      this.pos++
      const items = this.list()
      this.expect(')')
      return items.length === 1 ? items[0] : { k: 'tuple', items }
    }
    if (t.v === '|' && !this.inAbs) {
      this.pos++
      this.inAbs = true
      const a = this.expr()
      this.inAbs = false
      this.expect('|')
      return { k: 'call', name: 'abs', args: [a], primes: 0 }
    }
    throw new ParseError(`Unexpected "${tokText(t)}"`)
  }

  private list(): Node[] {
    const items = [this.expr()]
    while (this.eat(',')) items.push(this.expr())
    return items
  }
}

// ---------- Evaluation ----------

export type Scope = Record<string, number>
export interface Env {
  // User functions of one or more variables, looked up at call time.
  funcs: Record<string, (args: number[]) => number>
  degrees: boolean
}
export type Compiled = (s: Scope) => number

// Free variables of a node (not function names).
export function freeVars(node: Node, out = new Set<string>()): Set<string> {
  switch (node.k) {
    case 'var':
      if (!(node.name in CONSTANTS)) out.add(node.name)
      break
    case 'neg':
    case 'fact':
      freeVars(node.a, out)
      break
    case 'bin':
      freeVars(node.a, out)
      freeVars(node.b, out)
      break
    case 'call':
    case 'tuple':
      for (const a of node.k === 'call' ? node.args : node.items) freeVars(a, out)
      break
  }
  return out
}

export function calledFunctions(node: Node, out = new Set<string>()): Set<string> {
  if (node.k === 'call') {
    if (!BUILTIN_FUNCTIONS.has(node.name)) out.add(node.name)
    node.args.forEach((a) => calledFunctions(a, out))
  } else if (node.k === 'bin') {
    calledFunctions(node.a, out)
    calledFunctions(node.b, out)
  } else if (node.k === 'neg' || node.k === 'fact') calledFunctions(node.a, out)
  else if (node.k === 'tuple') node.items.forEach((a) => calledFunctions(a, out))
  return out
}

function gamma(x: number): number {
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x))
  const g = 7
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]
  x -= 1
  let a = c[0]
  const t = x + g + 0.5
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i)
  return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a
}

export function compile(node: Node, env: Env): Compiled {
  switch (node.k) {
    case 'num': {
      const v = node.v
      return () => v
    }
    case 'var': {
      const name = node.name
      if (name in CONSTANTS) {
        const v = CONSTANTS[name]
        return (s) => (name in s ? s[name] : v)
      }
      return (s) => {
        const v = s[name]
        return v === undefined ? NaN : v
      }
    }
    case 'neg': {
      const a = compile(node.a, env)
      return (s) => -a(s)
    }
    case 'fact': {
      const a = compile(node.a, env)
      return (s) => gamma(a(s) + 1)
    }
    case 'bin': {
      const a = compile(node.a, env)
      const b = compile(node.b, env)
      switch (node.op) {
        case '+':
          return (s) => a(s) + b(s)
        case '-':
          return (s) => a(s) - b(s)
        case '*':
          return (s) => a(s) * b(s)
        case '/':
          return (s) => a(s) / b(s)
        case '^':
          // Odd roots of negative numbers: x^(1/3) is real.
          return (s) => {
            const x = a(s)
            const y = b(s)
            if (x < 0 && !Number.isInteger(y)) {
              const inv = 1 / y
              if (Number.isInteger(Math.round(inv * 1e9) / 1e9) && Math.round(inv) % 2 !== 0) return -Math.pow(-x, y)
            }
            return Math.pow(x, y)
          }
      }
      break
    }
    case 'tuple':
      throw new ParseError('A point is not a number here')
    case 'call': {
      const args = node.args.map((a) => compile(a, env))
      const name = node.name
      const f1 = FUNCS1[name]
      let base: (v: number[]) => number
      if (f1) {
        if (args.length !== 1) throw new ParseError(`${name} takes one value`)
        const trig = TRIG.has(name)
        const inv = INVERSE_TRIG.has(name)
        base = (v) => (trig && env.degrees ? f1((v[0] * Math.PI) / 180) : inv && env.degrees ? (f1(v[0]) * 180) / Math.PI : f1(v[0]))
      } else if (FUNCS2[name]) {
        if (args.length !== 2) throw new ParseError(`${name} takes two values`)
        const f2 = FUNCS2[name]
        base = (v) => f2(v[0], v[1])
      } else if (VARIADIC.has(name)) {
        const f = name === 'min' ? Math.min : Math.max
        base = (v) => f(...v)
      } else base = (v) => (env.funcs[name] ? env.funcs[name](v) : NaN)
      const f = node.primes ? derivative(base, node.primes) : base
      if (args.length === 1) {
        const a0 = args[0]
        return (s) => f([a0(s)])
      }
      return (s) => f(args.map((a) => a(s)))
    }
  }
  throw new ParseError('Invalid expression')
}

// Numeric derivative (central differences) of the first argument.
function derivative(f: (v: number[]) => number, order: number): (v: number[]) => number {
  let g = f
  for (let i = 0; i < order; i++) {
    const inner = g
    g = (v) => {
      const x = v[0]
      const h = 1e-4 * Math.max(1, Math.abs(x))
      return (inner([x + h, ...v.slice(1)]) - inner([x - h, ...v.slice(1)])) / (2 * h)
    }
  }
  return g
}

// ---------- LaTeX ----------

const PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 }

function prec(n: Node): number {
  if (n.k === 'bin') return PREC[n.op]
  if (n.k === 'neg') return 3
  return 5
}

function name(v: string): string {
  if (GREEK_LATEX[v]) return GREEK_LATEX[v]
  const m = /^([A-Za-z]+)(\d+)$/.exec(v)
  if (m) return `${m[1]}_{${m[2]}}`
  return v.length > 1 ? `\\mathrm{${v}}` : v
}

export function toLatex(n: Node): string {
  const wrap = (c: Node, min: number) => (prec(c) < min ? `\\left(${toLatex(c)}\\right)` : toLatex(c))
  switch (n.k) {
    case 'num':
      return String(n.v)
    case 'var':
      return name(n.name)
    case 'neg':
      return `-${wrap(n.a, 3)}`
    case 'fact':
      return `${wrap(n.a, 5)}!`
    case 'tuple':
      return `\\left(${n.items.map(toLatex).join(', ')}\\right)`
    case 'bin':
      if (n.op === '/') return `\\frac{${toLatex(n.a)}}{${toLatex(n.b)}}`
      if (n.op === '^') return `{${wrap(n.a, 5)}}^{${toLatex(n.b)}}`
      if (n.op === '*') {
        const l = wrap(n.a, 2)
        const r = wrap(n.b, 3)
        // 2x, a x^2: juxtaposition when the right side starts with a letter or a function.
        const juxt = n.b.k === 'var' || n.b.k === 'call' || (n.b.k === 'bin' && n.b.op === '^' && n.b.a.k === 'var')
        return juxt && n.a.k !== 'bin' ? `${l}${/[a-z0-9]$/i.test(l) && /^[a-z\\]/i.test(r) ? ' ' : ''}${r}` : `${l} \\cdot ${r}`
      }
      return `${toLatex(n.a)} ${n.op} ${n.op === '-' ? wrap(n.b, 2) : wrap(n.b, 1)}`
    case 'call': {
      const primes = "'".repeat(n.primes)
      const args = n.args.map(toLatex).join(', ')
      if (n.name === 'sqrt') return `\\sqrt{${args}}`
      if (n.name === 'root' && n.args.length === 2) return `\\sqrt[${toLatex(n.args[1])}]{${toLatex(n.args[0])}}`
      if (n.name === 'abs') return `\\left|${args}\\right|`
      const known = ['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'sinh', 'cosh', 'tanh', 'exp', 'ln', 'log', 'arcsin', 'arccos', 'arctan', 'min', 'max', 'lg']
      const fn = known.includes(n.name) ? `\\${n.name}` : n.name.length === 1 ? n.name : `\\operatorname{${n.name}}`
      return `${fn}${primes}\\left(${args}\\right)`
    }
  }
}

export function statementLatex(s: Statement): string {
  const rel = { '=': '=', '<': '<', '>': '>', '<=': '\\le', '>=': '\\ge' }
  return s.rel && s.rhs ? `${toLatex(s.lhs)} ${rel[s.rel]} ${toLatex(s.rhs)}` : toLatex(s.lhs)
}
