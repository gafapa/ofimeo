// Types shared by the spelling/grammar worker, the rules and the editor plugin.

export type Lang = 'es' | 'gl' | 'en' | 'fr' | 'de'

export const LANGS: Lang[] = ['es', 'gl', 'en', 'fr', 'de']

// spelling: red wavy underline; grammar: blue wavy; style: blue dotted.
export type IssueKind = 'spelling' | 'grammar' | 'style'

export interface Issue {
  // Offsets in the paragraph text (UTF-16 code units).
  from: number
  to: number
  kind: IssueKind
  // Rule id ('spelling' for misspelled words, 'harper:<Rule>', 'lt:<RULE_ID>' for external checkers).
  rule: string
  replacements: string[]
  // Range the replacements apply to, when wider than the underlined text
  // (a missing "¿" is underlined at the "?" but inserted at the sentence start).
  span?: [number, number]
  // Values for the rule's message.
  vars?: Record<string, string>
  // Message from an external checker (Harper, LanguageTool), in its own language.
  message?: string
}

// A paragraph sent for checking. Masked characters (inline code, deleted
// suggestions, formulas) are replaced by U+FFFC so offsets stay the same.
export interface Paragraph {
  text: string
  lang: Lang
  // Regional variant (BCP 47 tag, "en-GB"): chooses the spelling dictionary
  // and Harper's dialect. The language's first variant when absent.
  variant?: string
  // Where the paragraph lives: capitalization is not checked in list items,
  // table cells and headings.
  context?: 'paragraph' | 'heading' | 'list' | 'table'
  // Last character of the previous paragraph: after "," (a letter's greeting) a
  // paragraph may start in lowercase.
  prev?: string
}

export interface CheckOptions {
  spelling: boolean
  grammar: boolean
  optionalStyle: boolean
  languageTool?: string
}

export const OBJECT = '￼'
