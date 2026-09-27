// Word tokens and the parts of a text that are never checked (URLs, emails,
// hashtags, file names).

import { OBJECT } from './types'

export interface Token {
  start: number
  end: number
  word: string
}

// Letters with internal apostrophes or hyphens: "don't", "l'homme", "peut-être".
const WORD = /[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*/gu

export function tokens(text: string): Token[] {
  const out: Token[] = []
  for (const m of text.matchAll(WORD)) out.push({ start: m.index, end: m.index + m[0].length, word: m[0] })
  return out
}

const SKIP = [
  // Emails first (their domain would be taken for a domain name).
  /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/gu,
  // URLs and domain names.
  /\b(?:https?:\/\/|ftp:\/\/|mailto:|www\.)[^\s<>"«»]+/giu,
  /\b[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.(?:com|org|net|edu|gov|es|gal|eus|cat|fr|de|at|ch|uk|us|eu|io|info|pt|it|be|mx|ar|html?|php|pdf|docx?|odt|xlsx?|ods|pptx?|png|jpe?g|gif|svg|txt|md|js|ts|py|zip)\b(?:\/[^\s<>"«»]*)?/gu,
  // @mentions and #hashtags.
  /(?<![\p{L}\p{N}])[@#][\p{L}\p{N}_]+/gu,
  // Paths and identifiers with underscores, slashes or backslashes between letters.
  /[\p{L}\p{N}]*[_\\][\p{L}\p{N}_\\]*/gu,
  /(?<![\p{L}\p{N}])\/?[\p{L}\p{N}.-]+(?:\/[\p{L}\p{N}.-]+){2,}/gu,
]

// Replaces never-checked parts with U+FFFC (same length).
export function maskSkipped(text: string): string {
  let out = text
  for (const re of SKIP) {
    out = out.replace(re, (m) => (m.length > 1 || /[_\\]/.test(m) ? OBJECT.repeat(m.length) : m))
  }
  return out
}

const ROMAN = /^[IVXLCDM]+$/

// Tokens worth spell checking: no single letters, acronyms, words touching
// digits, mixed-case identifiers ("iPhone", "camelCase") or masked text.
export function spellTokens(masked: string): Token[] {
  return tokens(masked).filter((t) => {
    const { word } = t
    if (word.length < 2) return false
    const before = masked[t.start - 1] ?? ''
    const after = masked[t.end] ?? ''
    if (/[\p{N}]/u.test(before) || /[\p{N}]/u.test(after)) return false
    if (before === OBJECT || after === OBJECT) return false
    if (word === word.toUpperCase() || ROMAN.test(word)) return false
    // Lowercase followed by uppercase inside the word.
    if (/\p{Ll}\p{Lu}/u.test(word.replace(/^\p{L}['’]/u, ''))) return false
    return true
  })
}
