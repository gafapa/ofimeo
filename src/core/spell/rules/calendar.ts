// Names of months and days: lowercase in Spanish, Galician and French,
// capitalized in English.

import type { Issue, Lang } from '../types'
import type { Rule } from './util'

type Found = Omit<Issue, 'kind' | 'rule'>

const NAMES: Partial<Record<Lang, string>> = {
  es: 'enero febrero marzo abril mayo junio julio agosto septiembre setiembre octubre noviembre diciembre lunes martes miércoles jueves viernes sábado domingo',
  gl: 'xaneiro febreiro marzo abril maio xuño xullo agosto setembro outubro novembro decembro luns martes mércores xoves venres sábado domingo',
  fr: 'janvier février mars avril mai juin juillet août septembre octobre novembre décembre lundi mardi mercredi jeudi vendredi samedi dimanche',
}

// Also first names or surnames ("Julio", "Mayo", "Mars" the planet): only
// corrected in dates ("3 de Julio").
const ALSO_NAMES = new Set(['julio', 'mayo', 'abril', 'domingo', 'mars', 'avril', 'maio'])

// Holidays and names: "Viernes Santo", "Domingo de Ramos", "Mardi gras".
const HOLIDAY_AFTER = /^\s+(?:santo|santa|de ramos|de pascua|de resurrección|de gloria|de carnaval|de entroido|gras|saint|des cendres|de pentecôte)(?![\p{L}])/iu
// French national days keep the capital: "le 14 Juillet", "le 1er Mai".
const FR_DAYS = /(?:14 juillet|1er mai|8 mai|11 novembre|15 août)$/iu

const SENTENCE_START = /(?:^|[.!?¿¡:;"«“—–(\n]|\.\.\.|…)\s*$/u

export const lowercaseMonthDay: Rule = {
  id: 'lowercase-month-day',
  langs: ['es', 'gl', 'fr'],
  category: 'capitalization',
  kind: 'grammar',
  check(text, p) {
    const out: Found[] = []
    const names = new Set(NAMES[p.lang]!.split(' '))
    for (const m of text.matchAll(/(?<![\p{L}'’-])\p{Lu}\p{Ll}+(?![\p{L}'’-])/gu)) {
      const lower = m[0].toLowerCase()
      if (!names.has(lower)) continue
      const head = text.slice(0, m.index)
      if (SENTENCE_START.test(head) || HOLIDAY_AFTER.test(text.slice(m.index + m[0].length))) continue
      const date = /\d{1,2}(?:er)?\s+(?:de\s+)?$/u.test(head)
      if (ALSO_NAMES.has(lower) && !date) continue
      if (p.lang === 'fr' && FR_DAYS.test(head + m[0])) continue
      // Part of a name ("Hospital 12 de Octubre", "Plaza Dos de Mayo"): the
      // content word before (skipping "de", "del", numbers) is capitalized and not at a sentence start.
      const words = [...head.matchAll(/[\p{L}\p{N}]+/gu)]
      let k = words.length - 1
      while (k >= 0 && /^(?:\d+|de|del|do|da|du|des|of|d|er|y|e|et)$/iu.test(words[k][0])) k--
      if (k >= 0 && /^\p{Lu}/u.test(words[k][0]) && !names.has(words[k][0].toLowerCase()) && !SENTENCE_START.test(head.slice(0, words[k].index))) continue
      // Headings and labels in capitals.
      if (text === text.toUpperCase()) continue
      out.push({ from: m.index, to: m.index + m[0].length, replacements: [lower], vars: { word: m[0], fix: lower } })
    }
    return out
  },
}

// English: days and months are capitalized ("march", "may" and "august" are also common words).
const EN_NAMES = new Set('monday tuesday wednesday thursday friday saturday sunday january february april june july september october november december'.split(' '))

export const capitalMonthDay: Rule = {
  id: 'en-capital-month-day',
  langs: ['en'],
  category: 'capitalization',
  kind: 'grammar',
  check(text) {
    const out: Found[] = []
    for (const m of text.matchAll(/(?<![\p{L}'’\-@#/.])\p{Ll}+(?![\p{L}'’\-/])/gu)) {
      if (!EN_NAMES.has(m[0])) continue
      const fix = m[0][0].toUpperCase() + m[0].slice(1)
      out.push({ from: m.index, to: m.index + m[0].length, replacements: [fix], vars: { word: m[0], fix } })
    }
    return out
  },
}

export const calendarRules: Rule[] = [lowercaseMonthDay, capitalMonthDay]
