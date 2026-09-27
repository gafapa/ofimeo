// Checking without the UI: dictionaries per language, offline rules, Harper
// (English grammar, WebAssembly) and an optional LanguageTool server. Runs in
// the spelling worker; nothing here touches the DOM.

import { Hunspell } from './hunspell'
import { runRules } from './rules/index'
import { maskSkipped, spellTokens } from './tokenize'
import type { CheckOptions, Issue, Lang, Paragraph } from './types'
import { dictOf, VARIANTS, variantOf } from './variants'

export { dictOf }

export interface DictionaryData {
  aff: string
  dic: string
}

// The part of Harper's linter we use.
export interface HarperLike {
  lint(text: string, options?: { language?: 'plaintext' }): Promise<HarperLint[]>
  // Dialect: 0 American, 1 British, 2 Australian, 3 Canadian.
  setDialect?(dialect: number): Promise<void>
}
interface HarperLint {
  span(): { start: number; end: number }
  lint_kind(): string
  message(): string
  suggestions(): { kind(): number; get_replacement_text(): string }[]
  get_problem_text(): string
}

type State = 'loading' | 'ready' | 'error'

// School words missing from the dictionaries.
const EXTRA_WORDS: Partial<Record<Lang, string[]>> = {
  gl: ['Galicia', 'Galiza', 'autoavaliación', 'autoavaliacións', 'coavaliación', 'coavaliacións', 'heteroavaliación', 'heteroavaliacións', 'metacognición', 'portfolio', 'portfolios', 'temporalización', 'temporalizacións'],
  es: ['coevaluación', 'coevaluaciones', 'heteroevaluación', 'heteroevaluaciones', 'metacognición', 'plurilingüe', 'plurilingües', 'portfolio', 'portfolios', 'temporalización', 'temporalizaciones'],
  de: ['formativ', 'formative', 'formativen', 'formativer', 'formatives', 'formativem', 'summativ', 'summative', 'summativen', 'summativer', 'summatives'],
}

// LanguageTool language codes (English has regional rules).
const LT_LANG: Record<Lang, string> = { es: 'es', gl: 'gl-ES', en: 'en-US', fr: 'fr', de: 'de-DE' }
const LT_VARIANTS = new Set(['en-US', 'en-GB', 'en-AU', 'en-CA'])
const HARPER_DIALECT: Record<string, number> = { 'en-US': 0, 'en-GB': 1, 'en-AU': 2, 'en-CA': 3 }

function ltLang(p: Paragraph): string {
  const tag = variantOf(p.variant)?.tag ?? ''
  return LT_VARIANTS.has(tag) && p.lang === 'en' ? tag : LT_LANG[p.lang]
}

const langOfDict = (dict: string): Lang => VARIANTS.find((v) => v.dict === dict)!.lang

// Dictionaries are keyed by dictionary id ("es", "en-gb"); personal words
// and extra words by language (shared by its variants).
export class Checker {
  private dictionaries = new Map<string, Hunspell>()
  private states = new Map<string, State>()
  private loading = new Map<string, Promise<Hunspell | null>>()
  private personal = new Map<Lang, Set<string>>()
  private harper: HarperLike | null = null
  private harperLoading: Promise<HarperLike | null> | null = null
  harperState: State | 'none' = 'none'
  private harperDialect = 0
  // Rules the user chose to ignore in this session.
  disabledRules = new Set<string>()

  constructor(
    private source: (dict: string) => Promise<DictionaryData>,
    private loadHarper?: () => Promise<HarperLike>,
    private fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  state(dict: string): State | 'none' {
    return this.states.get(dict) ?? 'none'
  }

  // Loads a dictionary once; resolves null when it cannot be loaded (offline).
  ensure(dict: string): Promise<Hunspell | null> {
    let p = this.loading.get(dict)
    if (!p) {
      this.states.set(dict, 'loading')
      const lang = langOfDict(dict)
      p = this.source(dict).then(
        ({ aff, dic }) => {
          const h = new Hunspell(aff, dic)
          for (const w of EXTRA_WORDS[lang] ?? []) h.addWord(w)
          for (const w of this.personal.get(lang) ?? []) h.add(w)
          this.dictionaries.set(dict, h)
          this.states.set(dict, 'ready')
          return h
        },
        () => {
          this.states.set(dict, 'error')
          // Try again next time (for example once back online).
          this.loading.delete(dict)
          return null
        },
      )
      this.loading.set(dict, p)
    }
    return p
  }

  ensureHarper(): Promise<HarperLike | null> {
    if (!this.loadHarper) return Promise.resolve(null)
    if (!this.harperLoading) {
      this.harperState = 'loading'
      this.harperLoading = this.loadHarper().then(
        (h) => {
          this.harper = h
          this.harperState = 'ready'
          return h
        },
        () => {
          this.harperState = 'error'
          this.harperLoading = null
          return null
        },
      )
    }
    return this.harperLoading
  }

  setPersonal(lang: Lang, words: string[]): void {
    const set = new Set(words)
    const old = this.personal.get(lang) ?? new Set()
    this.personal.set(lang, set)
    for (const [dict, h] of this.dictionaries) {
      if (langOfDict(dict) !== lang) continue
      for (const w of old) if (!set.has(w)) h.remove(w)
      for (const w of set) if (!old.has(w)) h.add(w)
    }
  }

  // Misspelled words of a paragraph; null while its dictionary is not loaded.
  spelling(masked: string, dict: string): Issue[] | null {
    const h = this.dictionaries.get(dict)
    if (!h) return null
    const out: Issue[] = []
    for (const t of spellTokens(masked)) {
      const word = t.word.replace(/’/g, "'")
      if (h.correct(word)) continue
      // "APA-Format", "COVID-19": acronyms in hyphenated words are not checked.
      if (word.includes('-') && word.split('-').every((part) => part.length < 2 || part === part.toUpperCase() || h.correct(part))) continue
      // Abbreviations with their full stop ("etc.", "Sr.").
      if (masked[t.end] === '.' && h.correct(`${word}.`)) continue
      out.push({ from: t.start, to: t.end, kind: 'spelling', rule: 'spelling', replacements: [], vars: { word: t.word } })
    }
    return out
  }

  suggest(word: string, dict: string, max = 5): string[] {
    const h = this.dictionaries.get(dict)
    if (!h) return []
    const apostrophe = word.includes('’')
    const list = h.suggest(word.replace(/’/g, "'"), max)
    return apostrophe ? list.map((s) => s.replace(/'/g, '’')) : list
  }

  // Local checks of one paragraph (spelling when its dictionary is ready).
  checkLocal(p: Paragraph, options: CheckOptions): { issues: Issue[]; pending: boolean } {
    const masked = maskSkipped(p.text)
    let pending = false
    let spelling: Issue[] = []
    if (options.spelling) {
      const found = this.spelling(masked, dictOf(p))
      if (found) spelling = found
      else pending = true
    }
    const grammar = options.grammar ? runRules({ ...p, text: masked }, { optionalStyle: options.optionalStyle, disabled: this.disabledRules }) : []
    return { issues: merge(spelling, grammar), pending }
  }

  async harperIssues(text: string, variant?: string): Promise<Issue[]> {
    const harper = this.harper
    if (!harper) return []
    const masked = maskSkipped(text)
    let lints: HarperLint[]
    try {
      const dialect = HARPER_DIALECT[variantOf(variant)?.tag ?? ''] ?? 0
      if (dialect !== this.harperDialect && harper.setDialect) {
        await harper.setDialect(dialect)
        this.harperDialect = dialect
      }
      lints = await harper.lint(masked, { language: 'plaintext' })
    } catch {
      return []
    }
    // Harper counts Unicode code points; the editor counts UTF-16 units.
    const units: number[] = []
    let u = 0
    for (const ch of masked) {
      units.push(u)
      u += ch.length
    }
    units.push(u)
    const out: Issue[] = []
    for (const lint of lints) {
      const kind = lint.lint_kind()
      if (kind === 'Spelling') continue
      const span = lint.span()
      const from = units[span.start] ?? span.start
      const to = units[span.end] ?? span.end
      if (to <= from || masked.slice(from, to).includes('￼')) continue
      const problem = masked.slice(from, to)
      const replacements = lint.suggestions().map((s) => {
        const k = s.kind()
        return k === 1 ? '' : k === 2 ? problem + s.get_replacement_text() : s.get_replacement_text()
      })
      const rule = `harper:${kind}`
      if (this.disabledRules.has(rule)) continue
      out.push({ from, to, kind: /Style|Readability|Enhancement|Redundancy|WordChoice/.test(kind) ? 'style' : 'grammar', rule, replacements: [...new Set(replacements)], message: lint.message() })
    }
    return out
  }

  // One request for several paragraphs; issues per paragraph, or null on failure.
  async languageTool(url: string, paragraphs: Paragraph[], lang: string, spelling: boolean): Promise<Issue[][] | null> {
    const sep = '\n\n'
    const texts = paragraphs.map((p) => maskSkipped(p.text).replace(/￼/g, ' '))
    const starts: number[] = []
    let offset = 0
    for (const t of texts) {
      starts.push(offset)
      offset += t.length + sep.length
    }
    const body = new URLSearchParams({ text: texts.join(sep), language: lang })
    let data: { matches?: LtMatch[] }
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 10_000)
      const res = await this.fetchImpl(`${url.replace(/\/+$/, '').replace(/\/v2\/check$/, '')}/v2/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body,
        signal: ctrl.signal,
      })
      clearTimeout(timer)
      if (!res.ok) return null
      data = await res.json()
    } catch {
      return null
    }
    const out: Issue[][] = paragraphs.map(() => [])
    for (const m of data.matches ?? []) {
      let i = starts.length - 1
      while (i > 0 && starts[i] > m.offset) i--
      const from = m.offset - starts[i]
      const to = from + m.length
      if (to > texts[i].length || to <= from) continue
      const typo = m.rule?.issueType === 'misspelling' || m.rule?.category?.id === 'TYPOS'
      // Our dictionaries already check spelling.
      if (typo && spelling) continue
      const rule = `lt:${m.rule?.id ?? 'RULE'}`
      if (this.disabledRules.has(rule)) continue
      out[i].push({
        from,
        to,
        kind: typo ? 'spelling' : m.rule?.issueType === 'style' || m.rule?.category?.id === 'STYLE' ? 'style' : 'grammar',
        rule,
        replacements: (m.replacements ?? []).slice(0, 5).map((r) => r.value),
        message: m.message,
      })
    }
    return out
  }

  // Full check of a batch (all paragraphs in the same call share options).
  async check(paragraphs: Paragraph[], options: CheckOptions): Promise<{ issues: Issue[]; pending: boolean }[]> {
    const results = paragraphs.map((p) => this.checkLocal(p, options))
    if (options.grammar) {
      if (this.harper) {
        for (let i = 0; i < paragraphs.length; i++) {
          if (paragraphs[i].lang !== 'en') continue
          results[i].issues = merge(results[i].issues, await this.harperIssues(paragraphs[i].text, paragraphs[i].variant))
        }
      }
      if (options.languageTool) {
        const byLang = new Map<string, number[]>()
        paragraphs.forEach((p, i) => p.text.trim() && byLang.set(ltLang(p), [...(byLang.get(ltLang(p)) ?? []), i]))
        for (const [lang, indexes] of byLang) {
          // Requests of at most ~15,000 characters.
          for (let k = 0; k < indexes.length; ) {
            const chunk: number[] = []
            let size = 0
            while (k < indexes.length && (chunk.length === 0 || size + paragraphs[indexes[k]].text.length < 15_000)) {
              size += paragraphs[indexes[k]].text.length
              chunk.push(indexes[k++])
            }
            const lt = await this.languageTool(options.languageTool, chunk.map((i) => paragraphs[i]), lang, options.spelling)
            if (!lt) {
              this.languageToolFailed = true
              continue
            }
            this.languageToolFailed = false
            chunk.forEach((i, j) => (results[i].issues = merge(results[i].issues, lt[j])))
          }
        }
      }
    }
    return results
  }

  languageToolFailed = false
}

interface LtMatch {
  message: string
  offset: number
  length: number
  replacements?: { value: string }[]
  rule?: { id: string; issueType?: string; category?: { id: string } }
}

// Combines issues of several sources (local rules first, then Harper, then
// LanguageTool): an issue overlapping one already kept is dropped, and a
// misspelled word gives way to a rule on the same text (the rule has the
// better explanation, e.g. a Galician Castilianism).
export function merge(base: Issue[], extra: Issue[]): Issue[] {
  const overlaps = (a: Issue, b: Issue) => a.from < b.to && b.from < a.to
  const rules: Issue[] = []
  for (const issue of [...base, ...extra]) {
    if (issue.rule !== 'spelling' && !rules.some((k) => overlaps(k, issue))) rules.push(issue)
  }
  const spelling = [...base, ...extra].filter((i) => i.rule === 'spelling' && !rules.some((r) => r.kind !== 'style' && overlaps(r, i)))
  return [...spelling, ...rules].sort((a, b) => a.from - b.from || a.to - b.to)
}
