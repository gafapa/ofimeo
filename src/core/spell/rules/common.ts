// Rules for every language: repeated words, spacing around punctuation and
// capital letters at the start of sentences.

import type { Issue, Lang } from '../types'
import { tokens } from '../tokenize'
import { wordSet, type Rule } from './util'

type Found = Omit<Issue, 'kind' | 'rule'>

// Repetitions that are correct ("had had", "nous nous", "die die").
const REPEAT_OK: Record<Lang, Set<string>> = {
  en: wordSet('had that bye no so very really much many far'),
  es: wordSet('no ya bla ja je muy tan poco'),
  gl: wordSet('no xa bla ja je moi tan pouco se'),
  fr: wordSet('nous vous bla ha très si'),
  de: wordSet('die der das dem den des sie ja bla sehr so'),
}

export const repeatedWord: Rule = {
  id: 'repeated-word',
  langs: 'all',
  category: 'grammar',
  kind: 'grammar',
  check(text, p) {
    const out: Found[] = []
    const list = tokens(text)
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1]
      const b = list[i]
      if (a.word.toLowerCase() !== b.word.toLowerCase()) continue
      // "a A Coruña", "de De la Fuente": the second word starts a name.
      if (a.word !== b.word && /^\p{Lu}/u.test(b.word) && /^\p{Ll}/u.test(a.word)) continue
      const between = text.slice(a.end, b.start)
      if (!/^[ \t ]+$/.test(between)) continue
      if (REPEAT_OK[p.lang].has(a.word.toLowerCase()) || a.word.length < 2 && !/^[aeoy]$/i.test(a.word)) continue
      out.push({ from: a.start, to: b.end, replacements: [a.word], vars: { word: a.word } })
    }
    return out
  },
}

export const doubleSpace: Rule = {
  id: 'double-space',
  langs: 'all',
  category: 'typography',
  kind: 'grammar',
  check(text) {
    const out: Found[] = []
    for (const m of text.matchAll(/(?<=\S) {2,}(?=\S)/g)) out.push({ from: m.index, to: m.index + m[0].length, replacements: [' '] })
    return out
  },
}

// "word ," → "word,". French keeps its space before ; : ! ? (see fr.ts).
export const spaceBeforePunctuation: Rule = {
  id: 'space-before-punctuation',
  langs: 'all',
  category: 'punctuation',
  kind: 'grammar',
  check(text, p) {
    const out: Found[] = []
    const marks = p.lang === 'fr' ? '[,.]' : '[,.;:!?]'
    const re = new RegExp(`(?<=[\\p{L}\\p{N}"'»”)\\]])([ \\u00a0]+)(${marks})(?=[\\s"'»”]|$|[\\p{L}])`, 'gu')
    for (const m of text.matchAll(re)) {
      const at = m.index + m[1].length
      // Ellipsis.
      if (text[at + 1] === '.') continue
      // "word ,next" → "word, next".
      const next = /^[\p{L}\p{M}]+/u.exec(text.slice(at + 1))?.[0]
      if (next && (m[2] === '.' || m[2] === ':')) continue
      if (next) out.push({ from: m.index, to: at + 1 + next.length, replacements: [`${m[2]} ${next}`], vars: { mark: m[2] } })
      else out.push({ from: m.index, to: at + 1, replacements: [m[2]], vars: { mark: m[2] } })
    }
    return out
  },
}

// "word,word" → "word, word"; "end.Next" → "end. Next".
export const missingSpaceAfterPunctuation: Rule = {
  id: 'missing-space-after-punctuation',
  langs: 'all',
  category: 'punctuation',
  kind: 'grammar',
  check(text, p) {
    const out: Found[] = []
    const marks = p.lang === 'fr' ? '[,;.]' : '[,;:.!?]'
    const re = new RegExp(`(?<=[\\p{L}]{2})(${marks})([\\p{L}]+)`, 'gu')
    for (const m of text.matchAll(re)) {
      const mark = m[1]
      const next = m[2]
      const before = text.slice(0, m.index)
      // "e.g.", "p.ej.", "z.B." and file names are not sentences.
      if (mark === '.' && (!/^\p{Lu}/u.test(next) || /\.\p{L}+$/u.test(before) || next.length < 2)) continue
      // "EE.UU.", "S.A.": abbreviations in capitals.
      if (mark === '.' && (/(?:^|[^\p{L}])\p{Lu}{1,3}$/u.test(before) || text[m.index + 1 + next.length] === '.')) continue
      if ((mark === '!' || mark === '?') && /^\p{Ll}/u.test(next) && p.lang !== 'es' && p.lang !== 'gl') continue
      if (mark === ':' && /^(?:https?|ftp|mailto|file)$/i.test(before.match(/\p{L}+$/u)?.[0] ?? '')) continue
      out.push({ from: m.index, to: m.index + 1 + next.length, replacements: [`${mark} ${next}`], vars: { mark } })
    }
    return out
  },
}

const ABBREVIATIONS: Record<Lang, Set<string>> = {
  es: wordSet(`etc pág págs núm art arts cap caps aprox ej sr sra srta sres dr dra dres lic ing arq prof profa vol vols ed eds
    p pp ss vs cf cfr fig figs tel tfno tlf av avda c cía dpto depto admón ud uds vd vds d dña sto sta ilmo ilma máx mín
    núms párr pral prov pte sig trad coord col cols gral hno hnos izq izda dcha drcha ob op cit ant pl sing lat esp ext mons`),
  gl: wordSet(`etc páx páxs núm art arts cap caps aprox ex sr sra srta dr dra lic prof vol vols ed eds p pp ss vs cf cfr fig
    tel tfno av avda cía dpto admón d dna máx mín párr prov trad coord col gral dir ob op cit ant pl lat esp ext rúa`),
  en: wordSet(`etc eg ie vs approx mr mrs ms dr prof st no nos vol vols fig figs p pp ch cf al inc ltd co corp jr sr ca incl
    est dept univ gov ed eds rev gen col lt sgt capt mt ft jan feb mar apr jun jul aug sep sept oct nov dec min max misc`),
  fr: wordSet(`etc m mme mmes mlle mlles p pp cf env ex fig figs vol vols av apr chap éd coll hab tél dr pr st ste bd min max
    art cit op id ibid éds`),
  de: wordSet(`bzw ca evtl ggf usw vgl nr dr hr fr frl bspw inkl zzgl exkl insb sog allg geb gest abb tab kap bd hrsg aufl
    str jh jhd mio mrd tsd etc prof dipl ing min max st bzgl lt mind urspr ursprüngl`),
}

// Lowercase letter at the start of a paragraph or after a full stop.
export const sentenceCapital: Rule = {
  id: 'sentence-capital',
  langs: 'all',
  category: 'capitalization',
  kind: 'grammar',
  check(text, p) {
    const out: Found[] = []
    const lowerWord = (from: number) => {
      const m = /^[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*/u.exec(text.slice(from))
      if (!m) return null
      const word = m[0]
      // "iPhone", "eBay": mixed case is intentional.
      if (!/^\p{Ll}/u.test(word) || /\p{Lu}/u.test(word.slice(1))) return null
      // List markers: "a) …", "b. …".
      if (word.length === 1 && /^[).]/.test(text[from + 1] ?? '')) return null
      return word
    }
    const flag = (from: number, word: string) =>
      out.push({ from, to: from + word.length, replacements: [word[0].toUpperCase() + word.slice(1)], vars: { word } })
    // Paragraph start (not in lists, tables or headings, not after "…").
    if ((!p.context || p.context === 'paragraph') && !/[,;:]/.test(p.prev ?? '')) {
      const start = /^[\s"'«“(¿¡—–-]*/u.exec(text)![0].length
      const word = lowerWord(start)
      if (word && !/^(?:\.\.\.|…)/.test(text) && text.trim().split(/\s+/).length >= 3) flag(start, word)
    }
    for (const m of text.matchAll(/(?<=[\p{L}\p{M}"'»”)])\.(["'»”)]*)( +)(["'«“(¿¡]*)(?=\p{Ll})/gu)) {
      const dot = m.index
      if (text[dot - 1] === '.' || text[dot + 1] === '.') continue
      const prev = /[\p{L}\p{M}]+$/u.exec(text.slice(0, dot))?.[0] ?? ''
      // Initials, abbreviations ("etc.", "p. ej."), "EE.UU.", roman numerals.
      if (prev.length < 2 || ABBREVIATIONS[p.lang].has(prev.toLowerCase())) continue
      if (text[dot - prev.length - 1] === '.' || /^[IVXLCDM]+$/.test(prev)) continue
      if (/^\p{Lu}+$/u.test(prev) && prev.length <= 4) continue
      const start = dot + 1 + m[1].length + m[2].length + m[3].length
      const word = lowerWord(start)
      if (word) flag(start, word)
    }
    return out
  },
}

export const commonRules: Rule[] = [repeatedWord, doubleSpace, spaceBeforePunctuation, missingSpaceAfterPunctuation, sentenceCapital]
