// The offline rule set: common rules plus per-language ones.

import type { Issue, Paragraph } from '../types'
import { commonRules } from './common'
import { esRules } from './es'
import { glRules } from './gl'
import { frRules } from './fr'
import { deRules } from './de'
import { enRules } from './en'
import { calendarRules } from './calendar'
import type { Rule } from './util'

export type { Rule } from './util'

export const RULES: Rule[] = [...commonRules, ...esRules, ...glRules, ...frRules, ...deRules, ...enRules, ...calendarRules]

export function runRules(p: Paragraph, options: { optionalStyle?: boolean; disabled?: Set<string> } = {}): Issue[] {
  const out: Issue[] = []
  for (const rule of RULES) {
    if (rule.langs !== 'all' && !rule.langs.includes(p.lang)) continue
    if (rule.optional && !options.optionalStyle) continue
    if (options.disabled?.has(rule.id)) continue
    for (const found of rule.check(p.text, p)) {
      // Words quoted as words: «hecho» (de hacer), "el", «por qué».
      if (MENTION.has(rule.category) && quoted(p.text, found.from, found.to)) continue
      out.push({ ...found, kind: rule.kind, rule: rule.id })
    }
  }
  return dedupe(out)
}

const MENTION = new Set(['lexicon', 'confusion', 'capitalization', 'grammar'])

// The issue lies inside a short quotation of up to three words.
function quoted(text: string, from: number, to: number): boolean {
  const open = /[«"“]([^«»"“”\n]*)$/u.exec(text.slice(0, from))
  const close = /^([^«»"“”\n]*)[»"”]/u.exec(text.slice(to))
  if (!open || !close) return false
  const inside = open[1] + text.slice(from, to) + close[1]
  return inside.length <= 25 && inside.trim().split(/\s+/).length <= 3
}

// Overlapping issues: the longer one wins (a phrase over one of its words).
export function dedupe(issues: Issue[]): Issue[] {
  const sorted = [...issues].sort((a, b) => b.to - b.from - (a.to - a.from) || a.from - b.from)
  const kept: Issue[] = []
  for (const issue of sorted) {
    if (kept.some((k) => issue.from < k.to && k.from < issue.to)) continue
    kept.push(issue)
  }
  return kept.sort((a, b) => a.from - b.from)
}
