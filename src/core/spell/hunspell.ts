// A small Hunspell-compatible spell checker. Unlike checkers that expand every
// affix of every word when loading (nspell needs minutes and gigabytes for the
// Galician dictionary), it keeps the stems with their flags and strips affixes
// when a word is checked, as Hunspell does. Supported: FLAG (char, long, num,
// UTF-8), AF aliases, PFX/SFX with cross products and conditions, two-level
// suffixes (continuation classes), NEEDAFFIX, FORBIDDENWORD, ONLYINCOMPOUND,
// NOSUGGEST, CIRCUMFIX, compounding with COMPOUNDFLAG / COMPOUNDBEGIN /
// MIDDLE / END / PERMITFLAG, BREAK, ICONV, IGNORE, REP, MAP, KEY and TRY.
// COMPOUNDRULE is ignored (it only covers numbers, which are not checked).

interface Affix {
  flag: string
  cross: boolean
  strip: string
  add: string
  cont: string
  cond: RegExp | null
}

type Flags = string

interface Rep {
  from: string
  to: string
  start: boolean
  end: boolean
}

const enum Case {
  Lower,
  Init,
  All,
  Mixed,
}

export function caseOf(word: string): Case {
  const lower = word.toLowerCase()
  const upper = word.toUpperCase()
  if (word === lower) return Case.Lower
  if (word === upper) return Case.All
  if (word[0] === upper[0] && word.slice(1) === lower.slice(1)) return Case.Init
  return Case.Mixed
}

const capitalize = (w: string) => w.charAt(0).toUpperCase() + w.slice(1)

// Hunspell conditions are character-class patterns; escape the rest for RegExp.
function conditionRegExp(cond: string, suffix: boolean): RegExp | null {
  if (!cond || cond === '.') return null
  let source = ''
  let inClass = false
  for (const ch of cond) {
    if (ch === '[') inClass = true
    else if (ch === ']') inClass = false
    else if (!inClass && /[\\^$*+?(){}|/]/.test(ch)) {
      source += '\\' + ch
      continue
    }
    source += ch
  }
  try {
    return new RegExp(suffix ? `(?:${source})$` : `^(?:${source})`, 'u')
  } catch {
    return null
  }
}

export class Hunspell {
  private words = new Map<string, Flags | Flags[]>()
  private sfx = new Map<string, Affix[]>()
  private pfx = new Map<string, Affix[]>()
  private maxSfx = 0
  private maxPfx = 0
  // Flags that appear in a suffix continuation class (two-level suffixes).
  private sfxCont = new Set<string>()
  private flagIds = new Map<string, string>()
  private flagMode: 'char' | 'long' | 'num' | 'utf8' = 'char'
  private aliases: Flags[] = []
  private needAffix = ''
  private forbidden = ''
  private onlyInCompound = ''
  private noSuggest = ''
  private circumfix = ''
  private compoundFlag = ''
  private compoundBegin = ''
  private compoundMiddle = ''
  private compoundEnd = ''
  private compoundPermit = ''
  private compoundMin = 3
  private compoundMax = 4
  private breaks: string[] = ['-', '^-', '-$']
  private iconv: [string, string][] = []
  private ignoreChars = ''
  private reps: Rep[] = []
  private repWhole = new Map<string, string[]>()
  private repByChar = new Map<string, Rep[]>()
  private maps: string[][] = []
  private keyRows: string[] = []
  private tryChars = ''
  noSplitSuggestions = false
  private cache = new Map<string, boolean>()
  private suggestMode = false
  private personal = new Set<string>()

  constructor(aff: string, dic: string) {
    this.parseAff(aff)
    this.parseDic(dic)
  }

  // ---------- Loading ----------

  private flagId(flag: string): string {
    let id = this.flagIds.get(flag)
    if (!id) {
      id = String.fromCharCode(0xe000 + this.flagIds.size)
      this.flagIds.set(flag, id)
    }
    return id
  }

  private parseFlags(raw: string): Flags {
    if (!raw) return ''
    if (this.aliases.length && /^\d+$/.test(raw)) return this.aliases[Number(raw) - 1] ?? ''
    let list: string[]
    if (this.flagMode === 'long') list = raw.match(/[\s\S]{1,2}/g) ?? []
    else if (this.flagMode === 'num') list = raw.split(',').filter(Boolean)
    else list = [...raw]
    return list.map((f) => this.flagId(f)).join('')
  }

  private parseAff(aff: string) {
    const lines = aff.split(/\r?\n/)
    const flagOf = (v: string | undefined) => (v ? this.parseFlags(v) : '')
    const deferred: [string, string][] = []
    // FLAG must be known before any flag is read.
    for (const line of lines) {
      const m = /^FLAG\s+(\S+)/.exec(line)
      if (m) this.flagMode = m[1] === 'long' ? 'long' : m[1] === 'num' ? 'num' : m[1] === 'UTF-8' ? 'utf8' : 'char'
    }
    let breaksSet = false
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line || line.startsWith('#')) continue
      const parts = line.trim().split(/\s+/)
      const [key] = parts
      switch (key) {
        case 'AF':
          if (parts.length > 2) this.aliases.push(this.parseFlags(parts[1]))
          break
        case 'PFX':
        case 'SFX': {
          if (parts.length === 4 && /^\d+$/.test(parts[3]) && (parts[2] === 'Y' || parts[2] === 'N')) {
            const count = Number(parts[3])
            const flag = this.flagId(this.flagMode === 'num' || this.flagMode === 'long' ? parts[1] : parts[1])
            const cross = parts[2] === 'Y'
            for (let j = 1; j <= count && i + j < lines.length; j++) {
              const p = lines[i + j].trim().split(/\s+/)
              if (p[0] !== key || p.length < 4) continue
              const strip = p[2] === '0' ? '' : p[2]
              const [addRaw, contRaw] = p[3].split('/')
              const add = addRaw === '0' ? '' : addRaw
              const affix: Affix = { flag, cross, strip, add, cont: this.parseFlags(contRaw ?? ''), cond: conditionRegExp(p[4] ?? '.', key === 'SFX') }
              const map = key === 'SFX' ? this.sfx : this.pfx
              const list = map.get(add)
              if (list) list.push(affix)
              else map.set(add, [affix])
              if (key === 'SFX') {
                this.maxSfx = Math.max(this.maxSfx, add.length)
                for (const c of affix.cont) this.sfxCont.add(c)
              } else this.maxPfx = Math.max(this.maxPfx, add.length)
            }
            i += count
          }
          break
        }
        case 'NEEDAFFIX':
        case 'PSEUDOROOT':
        case 'FORBIDDENWORD':
        case 'ONLYINCOMPOUND':
        case 'NOSUGGEST':
        case 'CIRCUMFIX':
        case 'COMPOUNDFLAG':
        case 'COMPOUNDBEGIN':
        case 'COMPOUNDMIDDLE':
        case 'COMPOUNDEND':
        case 'COMPOUNDPERMITFLAG':
          deferred.push([key, parts[1]])
          break
        case 'COMPOUNDMIN':
          this.compoundMin = Math.max(1, Number(parts[1]) || 3)
          break
        case 'COMPOUNDWORDMAX':
          this.compoundMax = Number(parts[1]) || 4
          break
        case 'NOSPLITSUGS':
          this.noSplitSuggestions = true
          break
        case 'BREAK':
          if (/^\d+$/.test(parts[1] ?? '')) {
            if (!breaksSet) this.breaks = []
            breaksSet = true
          } else if (parts[1]) this.breaks.push(parts[1])
          break
        case 'ICONV':
          if (parts.length === 3) this.iconv.push([parts[1], parts[2]])
          break
        case 'IGNORE':
          this.ignoreChars = parts[1] ?? ''
          break
        case 'REP':
          if (parts.length === 3) {
            let from = parts[1]
            const start = from.startsWith('^')
            const end = from.endsWith('$') && from.length > 1
            from = from.slice(start ? 1 : 0, end ? -1 : undefined)
            if (from) this.reps.push({ from, to: parts[2].replace(/_/g, ' '), start, end })
          }
          break
        case 'MAP':
          if (parts.length === 2 && !/^\d+$/.test(parts[1])) this.maps.push(parts[1].match(/\([^)]*\)|./gu)?.map((s) => s.replace(/[()]/g, '')) ?? [])
          break
        case 'KEY':
          this.keyRows = (parts[1] ?? '').split('|')
          break
        case 'TRY':
          this.tryChars = parts[1] ?? ''
          break
      }
    }
    for (const [key, value] of deferred) {
      const id = flagOf(value)
      if (key === 'NEEDAFFIX' || key === 'PSEUDOROOT') this.needAffix = id
      else if (key === 'FORBIDDENWORD') this.forbidden = id
      else if (key === 'ONLYINCOMPOUND') this.onlyInCompound = id
      else if (key === 'NOSUGGEST') this.noSuggest = id
      else if (key === 'CIRCUMFIX') this.circumfix = id
      else if (key === 'COMPOUNDFLAG') this.compoundFlag = id
      else if (key === 'COMPOUNDBEGIN') this.compoundBegin = id
      else if (key === 'COMPOUNDMIDDLE') this.compoundMiddle = id
      else if (key === 'COMPOUNDEND') this.compoundEnd = id
      else if (key === 'COMPOUNDPERMITFLAG') this.compoundPermit = id
    }
    for (const rep of this.reps) {
      if (rep.start && rep.end) {
        const list = this.repWhole.get(rep.from)
        if (list) list.push(rep.to)
        else this.repWhole.set(rep.from, [rep.to])
      } else {
        const list = this.repByChar.get(rep.from[0])
        if (list) list.push(rep)
        else this.repByChar.set(rep.from[0], [rep])
      }
    }
  }

  private parseDic(dic: string) {
    let start = 0
    const first = dic.indexOf('\n')
    if (/^\s*\d+\s*$/.test(dic.slice(0, first))) start = first + 1
    const len = dic.length
    while (start < len) {
      let end = dic.indexOf('\n', start)
      if (end < 0) end = len
      const line = dic.charCodeAt(end - 1) === 13 ? dic.slice(start, end - 1) : dic.slice(start, end)
      start = end + 1
      if (!line || line.charCodeAt(0) === 9 || line.charCodeAt(0) === 32) continue
      // word[/flags][<whitespace> morphology]; "\/" is a literal slash.
      let word = ''
      let flags = ''
      let i = 0
      for (; i < line.length; i++) {
        const ch = line[i]
        if (ch === '\\' && line[i + 1] === '/') {
          word += '/'
          i++
        } else if (ch === '/' && i > 0) {
          const rest = line.slice(i + 1)
          const ws = rest.search(/[\t ]/)
          flags = ws < 0 ? rest : rest.slice(0, ws)
          break
        } else if (ch === '\t' || (ch === ' ' && /^[\t ]+[a-z][a-z]:/.test(line.slice(i)))) break
        else word += ch
      }
      word = word.trim()
      if (!word) continue
      this.addEntry(word, this.parseFlags(flags))
    }
  }

  private addEntry(word: string, flags: Flags) {
    const existing = this.words.get(word)
    if (existing === undefined) this.words.set(word, flags)
    else if (Array.isArray(existing)) existing.includes(flags) || existing.push(flags)
    else if (existing !== flags) this.words.set(word, [existing, flags])
  }

  // A word without affixes, as if it were in the dictionary (suggested too).
  addWord(word: string): void {
    this.addEntry(word, '')
    this.cache.clear()
  }

  // Personal dictionary entries (plain words, any case accepted as typed).
  add(word: string): void {
    this.personal.add(word)
    this.cache.clear()
  }

  remove(word: string): void {
    this.personal.delete(word)
    this.cache.clear()
  }

  get size(): number {
    return this.words.size
  }

  // ---------- Checking ----------

  private homonyms(word: string): Flags[] | null {
    const f = this.words.get(word)
    if (f === undefined) return null
    return Array.isArray(f) ? f : [f]
  }

  private rootOk(flags: Flags): boolean {
    if (this.forbidden && flags.includes(this.forbidden)) return false
    if (this.onlyInCompound && flags.includes(this.onlyInCompound)) return false
    if (this.suggestMode && this.noSuggest && flags.includes(this.noSuggest)) return false
    return true
  }

  // Suffix stripping; with a prefix, the root needs both flags (cross product).
  private suffixCheck(word: string, prefix: Affix | null): boolean {
    const len = word.length
    for (let i = Math.min(this.maxSfx, len); i >= 0; i--) {
      const list = this.sfx.get(word.slice(len - i))
      if (!list) continue
      const base = word.slice(0, len - i)
      for (const s of list) {
        if (prefix && !s.cross) continue
        // Stripping a whole word needs FULLSTRIP in Hunspell; some dictionaries rely on it anyway.
        if (!base && !s.strip) continue
        if (this.onlyInCompound && s.cont.includes(this.onlyInCompound)) continue
        const stem = base + s.strip
        if (s.cond && !s.cond.test(stem)) continue
        if (this.circumfix && s.cont.includes(this.circumfix) !== !!prefix?.cont.includes(this.circumfix)) {
          // Circumfixes come in pairs.
        } else {
          const needs = this.needAffix && s.cont.includes(this.needAffix) && !prefix
          const roots = needs ? null : this.homonyms(stem)
          if (roots) {
            for (const h of roots) {
              if (!h.includes(s.flag) || !this.rootOk(h)) continue
              if (prefix && !h.includes(prefix.flag) && !s.cont.includes(prefix.flag)) continue
              return true
            }
          }
        }
        // Two-level suffixes: an inner suffix whose continuation allows this one.
        if (this.sfxCont.has(s.flag) && this.innerSuffix(stem, s, prefix)) return true
      }
    }
    return false
  }

  private innerSuffix(word: string, outer: Affix, prefix: Affix | null): boolean {
    const len = word.length
    for (let i = Math.min(this.maxSfx, len); i >= 0; i--) {
      const list = this.sfx.get(word.slice(len - i))
      if (!list) continue
      const base = word.slice(0, len - i)
      for (const s of list) {
        if (!s.cont.includes(outer.flag)) continue
        if (this.onlyInCompound && s.cont.includes(this.onlyInCompound)) continue
        if (!base.length && !s.strip) continue
        const stem = base + s.strip
        if (s.cond && !s.cond.test(stem)) continue
        const roots = this.homonyms(stem)
        if (!roots) continue
        for (const h of roots) {
          if (!h.includes(s.flag) || !this.rootOk(h)) continue
          if (prefix && !h.includes(prefix.flag)) continue
          return true
        }
      }
    }
    return false
  }

  private prefixCheck(word: string): boolean {
    for (let i = Math.min(this.maxPfx, word.length); i >= 1; i--) {
      const list = this.pfx.get(word.slice(0, i))
      if (!list) continue
      const rest = word.slice(i)
      for (const p of list) {
        const stem = p.strip + rest
        if (!stem) continue
        if (p.cond && !p.cond.test(stem)) continue
        if (this.onlyInCompound && p.cont.includes(this.onlyInCompound)) continue
        const needs = (this.needAffix && p.cont.includes(this.needAffix)) || (this.circumfix && p.cont.includes(this.circumfix))
        if (!needs) {
          const roots = this.homonyms(stem)
          if (roots?.some((h) => h.includes(p.flag) && this.rootOk(h))) return true
        }
        if (p.cross && this.suffixCheck(stem, p)) return true
      }
    }
    return false
  }

  // A compound part in a role (begin / middle / end), from its root flags or an
  // affix continuation class.
  private partOk(part: string, role: 0 | 1 | 2, memo: Map<string, boolean>): boolean {
    const key = role + part
    const known = memo.get(key)
    if (known !== undefined) return known
    const roleFlag = [this.compoundBegin, this.compoundMiddle, this.compoundEnd][role]
    const has = (flags: string) => (!!roleFlag && flags.includes(roleFlag)) || (!!this.compoundFlag && flags.includes(this.compoundFlag))
    const bad = (h: Flags) => !!this.forbidden && h.includes(this.forbidden)
    let ok = false
    const roots = this.homonyms(part)
    if (roots?.some((h) => has(h) && !bad(h) && !(this.needAffix && h.includes(this.needAffix)))) ok = true
    // Suffixed parts; inside the compound the suffix must permit it.
    if (!ok) {
      const len = part.length
      outer: for (let i = Math.min(this.maxSfx, len); i >= 0; i--) {
        const list = this.sfx.get(part.slice(len - i))
        if (!list) continue
        const base = part.slice(0, len - i)
        for (const s of list) {
          if (role !== 2 && !(this.compoundPermit && s.cont.includes(this.compoundPermit)) && !has(s.cont)) continue
          if (!base.length && !s.strip) continue
          const stem = base + s.strip
          if (s.cond && !s.cond.test(stem)) continue
          const rs = this.homonyms(stem)
          if (rs?.some((h) => h.includes(s.flag) && !bad(h) && (has(h) || has(s.cont)))) {
            ok = true
            break outer
          }
        }
      }
    }
    if (!ok) {
      outer: for (let i = Math.min(this.maxPfx, part.length); i >= 0; i--) {
        const list = this.pfx.get(part.slice(0, i))
        if (!list) continue
        const rest = part.slice(i)
        for (const p of list) {
          if (role !== 0 && !(this.compoundPermit && p.cont.includes(this.compoundPermit)) && !has(p.cont)) continue
          const stem = p.strip + rest
          if (!stem || (p.cond && !p.cond.test(stem))) continue
          const rs = this.homonyms(stem)
          if (rs?.some((h) => h.includes(p.flag) && !bad(h) && (has(h) || has(p.cont)))) {
            ok = true
            break outer
          }
        }
      }
    }
    memo.set(key, ok)
    return ok
  }

  private compoundCheck(word: string, from: number, role: 0 | 1, count: number, memo: Map<string, boolean>): boolean {
    const min = this.compoundMin
    for (let i = from + min; i <= word.length - min; i++) {
      if (!this.partOk(word.slice(from, i), role, memo)) continue
      if (this.partOk(word.slice(i), 2, memo)) return true
      if (count + 2 < this.compoundMax && this.compoundCheck(word, i, 1, count + 1, memo)) return true
    }
    return false
  }

  private hasCompounds(): boolean {
    return !!(this.compoundFlag || this.compoundBegin)
  }

  // Exact form (no case folding).
  private checkExact(word: string): boolean {
    const roots = this.homonyms(word)
    if (roots) {
      if (this.forbidden && roots.every((h) => h.includes(this.forbidden))) return false
      if (roots.some((h) => this.rootOk(h) && !(this.needAffix && h.includes(this.needAffix)))) return true
    }
    if (this.suffixCheck(word, null) || this.prefixCheck(word)) return true
    if (this.hasCompounds() && word.length >= this.compoundMin * 2 && this.compoundCheck(word, 0, 0, 0, new Map())) return true
    return false
  }

  private normalize(word: string): string {
    for (const [from, to] of this.iconv) word = word.split(from).join(to)
    if (this.ignoreChars) word = [...word].filter((c) => !this.ignoreChars.includes(c)).join('')
    return word
  }

  private checkCased(word: string): boolean {
    if (this.checkExact(word)) return true
    const kind = caseOf(word)
    const lower = word.toLowerCase()
    if (kind === Case.Init || kind === Case.Mixed) return this.checkExact(lower)
    if (kind === Case.All) {
      if (this.checkExact(lower) || this.checkExact(capitalize(lower))) return true
      // German: "STRASSE" for "Straße".
      if (lower.includes('ss')) {
        const sharp = lower.replace(/ss/g, 'ß')
        return this.checkExact(sharp) || this.checkExact(capitalize(sharp))
      }
    }
    return false
  }

  correct(input: string): boolean {
    const cached = this.cache.get(input)
    if (cached !== undefined) return cached
    if (this.cache.size > 100_000) this.cache.clear()
    const result = this.correctUncached(input)
    this.cache.set(input, result)
    return result
  }

  private correctUncached(input: string): boolean {
    if (this.personal.has(input) || this.personal.has(input.toLowerCase())) return true
    const word = this.normalize(input)
    if (!word) return true
    if (this.checkCased(word)) return true
    // BREAK points (hyphens): every part must be correct.
    for (const b of this.breaks) {
      if (b.startsWith('^') && word.startsWith(b.slice(1)) && word.length > b.length - 1) {
        if (this.correct(word.slice(b.length - 1))) return true
      } else if (b.endsWith('$') && b.length > 1 && word.endsWith(b.slice(0, -1)) && word.length > b.length - 1) {
        if (this.correct(word.slice(0, word.length - b.length + 1))) return true
      } else if (!b.startsWith('^') && !b.endsWith('$')) {
        const i = word.indexOf(b)
        if (i > 0 && i < word.length - b.length) {
          const parts = word.split(b)
          if (parts.every((p) => p && this.correct(p))) return true
        }
      }
    }
    return false
  }

  // ---------- Suggestions ----------

  // Up to `max` corrections, best first, within a time budget (milliseconds).
  suggest(input: string, max = 5, budget = 250): string[] {
    const word = this.normalize(input)
    const started = Date.now()
    const kind = caseOf(word)
    const lower = kind === Case.Lower ? word : word.toLowerCase()
    const scored = new Map<string, number>()
    this.suggestMode = true
    const saved = this.cache
    this.cache = new Map()
    const ok = (w: string) => {
      if (this.personal.has(w)) return true
      if (!w || w === word) return false
      return this.checkExact(w)
    }
    const offer = (w: string, cost: number) => {
      if (!w || w === word) return
      const prev = scored.get(w)
      if (prev !== undefined && prev <= cost) return
      if (prev !== undefined || ok(w)) scored.set(w, Math.min(prev ?? Infinity, cost))
    }
    try {
      // Case: "paris" → "Paris", "EUROPA" → "Europa".
      offer(capitalize(lower), 0.1)
      offer(word.toUpperCase(), 0.2)
      offer(lower, 0.1)
      const bases = kind === Case.Lower ? [word] : [word, lower]
      for (const base of bases) {
        this.repSuggestions(base, offer)
        this.mapSuggestions(base, offer)
        this.edits(base, offer, started, budget)
      }
      // Two words ("alot" → "a lot").
      if (!this.noSplitSuggestions) {
        for (let i = 1; i < lower.length; i++) {
          const a = lower.slice(0, i)
          const b = lower.slice(i)
          if (a.length > 2 && b.length > 2 && ok(a) && ok(b)) scored.set(`${a} ${b}`, 1.6)
        }
      }
      if (scored.size < 3 && Date.now() - started < budget) this.edits2(lower, offer, started, budget)
    } finally {
      this.suggestMode = false
      this.cache = saved
    }
    const folded = fold(lower)
    const ranked = [...scored.entries()]
      .map(([w, cost]) => {
        let c = cost
        if (fold(w.toLowerCase()) === folded) c = Math.min(c, 0.2)
        if (w[0]?.toLowerCase() !== lower[0]) c += 0.3
        c += Math.abs(w.length - word.length) * 0.05
        return [w, c] as const
      })
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
      .map(([w]) => w)
    const out: string[] = []
    for (const w of ranked) {
      const cased = kind === Case.Init ? capitalize(w) : kind === Case.All ? w.toUpperCase() : w
      if (/^-|-$/.test(w) || out.includes(cased) || cased === input) continue
      out.push(cased)
      if (out.length >= max) break
    }
    return out
  }

  private repSuggestions(word: string, offer: (w: string, cost: number) => void) {
    for (const to of this.repWhole.get(word) ?? []) offer(to, 0.3)
    for (let i = 0; i < word.length; i++) {
      for (const rep of this.repByChar.get(word[i]) ?? []) {
        if (rep.start && i > 0) continue
        if (!word.startsWith(rep.from, i)) continue
        if (rep.end && i + rep.from.length !== word.length) continue
        const candidate = word.slice(0, i) + rep.to + word.slice(i + rep.from.length)
        if (candidate.includes(' ')) {
          if (candidate.split(' ').every((p) => p && this.checkExact(p))) offer(candidate, 0.5)
        } else offer(candidate, 0.5)
      }
    }
  }

  private mapSuggestions(word: string, offer: (w: string, cost: number) => void) {
    // Related characters (accents): try every combination on up to three positions.
    const chars = [...word]
    const options: [number, string[]][] = []
    chars.forEach((ch, i) => {
      const alts = new Set<string>()
      for (const group of this.maps) if (group.includes(ch)) group.forEach((g) => g !== ch && alts.add(g))
      if (alts.size) options.push([i, [...alts]])
    })
    const walk = (k: number, current: string[], changes: number) => {
      if (changes > 0) offer(current.join(''), 0.15 * changes)
      if (changes >= 2) return
      for (let j = k; j < options.length; j++) {
        const [i, alts] = options[j]
        const orig = current[i]
        for (const a of alts) {
          current[i] = a
          walk(j + 1, current, changes + 1)
        }
        current[i] = orig
      }
    }
    if (options.length <= 16) walk(0, chars, 0)
  }

  private keyNeighbors(ch: string): string {
    let out = ''
    for (const row of this.keyRows) {
      const i = row.indexOf(ch)
      if (i < 0) continue
      if (i > 0) out += row[i - 1]
      if (i < row.length - 1) out += row[i + 1]
    }
    return out
  }

  private alphabet(word: string): string[] {
    const set = new Set([...(this.tryChars || 'abcdefghijklmnopqrstuvwxyz')].filter((c) => c === c.toLowerCase() || word !== word.toLowerCase()))
    return [...set]
  }

  private edits(word: string, offer: (w: string, cost: number) => void, started: number, budget: number) {
    const letters = this.alphabet(word)
    const n = word.length
    for (let i = 0; i < n; i++) {
      // Deletion, transposition, doubled letters.
      offer(word.slice(0, i) + word.slice(i + 1), word[i] === word[i - 1] ? 0.4 : 1)
      if (i < n - 1) offer(word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2), 0.7)
      // Keyboard neighbours are cheaper than other substitutions.
      for (const c of this.keyNeighbors(word[i])) offer(word.slice(0, i) + c + word.slice(i + 1), 0.8)
    }
    if (Date.now() - started > budget) return
    for (let i = 0; i <= n; i++) {
      for (const c of letters) {
        if (i < n && c !== word[i]) offer(word.slice(0, i) + c + word.slice(i + 1), 1)
        offer(word.slice(0, i) + c + word.slice(i), c === word[i - 1] || c === word[i] ? 0.5 : 1)
      }
      if (Date.now() - started > budget) return
    }
    // A letter moved by two to four places.
    for (let i = 0; i < n; i++) {
      for (let d = 2; d <= 4 && i + d < n; d++) {
        const arr = [...word]
        const [c] = arr.splice(i, 1)
        arr.splice(i + d, 0, c)
        offer(arr.join(''), 1.2)
        const back = [...word]
        const [c2] = back.splice(i + d, 1)
        back.splice(i, 0, c2)
        offer(back.join(''), 1.2)
      }
    }
  }

  // Second-level edits restricted to cheap operations, within the budget.
  private edits2(word: string, offer: (w: string, cost: number) => void, started: number, budget: number) {
    const first = new Set<string>()
    const n = word.length
    for (let i = 0; i < n; i++) {
      first.add(word.slice(0, i) + word.slice(i + 1))
      if (i < n - 1) first.add(word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2))
    }
    const letters = this.alphabet(word)
    for (let i = 0; i <= n; i++) for (const c of letters) {
      if (i < n) first.add(word.slice(0, i) + c + word.slice(i + 1))
      first.add(word.slice(0, i) + c + word.slice(i))
    }
    for (const w of first) {
      if (Date.now() - started > budget) return
      const m = w.length
      for (let i = 0; i < m; i++) {
        offer(w.slice(0, i) + w.slice(i + 1), 2)
        if (i < m - 1) offer(w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2), 2)
        for (const c of this.keyNeighbors(w[i])) offer(w.slice(0, i) + c + w.slice(i + 1), 1.9)
      }
      this.mapOnce(w, offer)
    }
  }

  private mapOnce(word: string, offer: (w: string, cost: number) => void) {
    for (let i = 0; i < word.length; i++) {
      for (const group of this.maps) {
        if (!group.includes(word[i])) continue
        for (const g of group) if (g !== word[i]) offer(word.slice(0, i) + g + word.slice(i + 1), 1.3)
      }
    }
  }
}

// Lowercase without diacritics, for ranking.
export function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '')
}
