// Helpers for writing grammar rules.

import type { Issue, IssueKind, Lang, Paragraph } from '../types'

export type Category = 'typography' | 'punctuation' | 'capitalization' | 'grammar' | 'confusion' | 'style' | 'lexicon'

export interface Rule {
  id: string
  langs: Lang[] | 'all'
  category: Category
  kind: IssueKind
  // Optional style advice, only shown when the user asks for it.
  optional?: boolean
  check: (text: string, p: Paragraph) => Omit<Issue, 'kind' | 'rule'>[]
}

const L = '\\p{L}\\p{M}'

// A regular expression with Unicode word boundaries: w`(foo|bar) baz`.
export function w(source: string, flags = 'giu'): RegExp {
  return new RegExp(`(?<![${L}'’-])(?:${source})(?![${L}'’-])`, flags)
}

// Gives the replacement the capitalization of the original.
export function matchCase(original: string, replacement: string): string {
  if (!original || !replacement) return replacement
  const first = original[0]
  if (original.length > 1 && original === original.toUpperCase()) return replacement.toUpperCase()
  if (first !== first.toLowerCase()) return replacement[0].toUpperCase() + replacement.slice(1)
  return replacement
}

export interface Pattern {
  re: RegExp
  // Replacement(s) for the whole match; `$1` style groups come from the match.
  fix: (m: RegExpExecArray) => string[]
  vars?: (m: RegExpExecArray) => Record<string, string>
  // Skip matches for which this returns true (context checks).
  unless?: (m: RegExpExecArray, text: string) => boolean
}

// Runs patterns over a text; each match is one issue covering the match.
export function patternRule(patterns: Pattern[]): Rule['check'] {
  return (text) => {
    const out: Omit<Issue, 'kind' | 'rule'>[] = []
    for (const p of patterns) {
      p.re.lastIndex = 0
      for (let m = p.re.exec(text); m; m = p.re.exec(text)) {
        if (p.unless?.(m, text)) continue
        out.push({
          from: m.index,
          to: m.index + m[0].length,
          replacements: p.fix(m).map((r) => matchCase(m![0], r)),
          vars: p.vars?.(m) ?? { word: m[0] },
        })
      }
    }
    return out
  }
}

// Word list lookups ignore case.
export function wordSet(words: string): Set<string> {
  return new Set(words.split(/\s+/).filter(Boolean).map((s) => s.toLowerCase()))
}

// A capitalized word in the middle of a sentence is taken for a name
// ("Pueblo Nuevo", "Julio"): rules about common words skip it.
export function capitalizedMidSentence(word: string, before: string): boolean {
  if (!/^\p{Lu}/u.test(word)) return false
  const prev = before.trimEnd()
  return prev !== '' && !/[.!?¿¡:"«“—–(-]$/u.test(prev)
}

// Text before a match, for `unless` checks.
export const before = (m: RegExpExecArray, text: string): string => text.slice(0, m.index)
export const after = (m: RegExpExecArray, text: string): string => text.slice(m.index + m[0].length)
