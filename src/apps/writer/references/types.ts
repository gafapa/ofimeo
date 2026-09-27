// Bibliographic sources and citation settings (shared by the editor, the
// dialogs and the file converters).

export type SourceType = 'book' | 'chapter' | 'article' | 'web' | 'report' | 'thesis' | 'other'

export const SOURCE_TYPES: SourceType[] = ['book', 'chapter', 'article', 'web', 'report', 'thesis', 'other']

// A person (family and given names) or an organization (family only, `org`).
export interface Person {
  family: string
  given?: string
  org?: boolean
}

export interface Source {
  id: string
  type: SourceType
  authors: Person[]
  editors?: Person[]
  title: string
  // Journal, book (for chapters), website or series.
  container?: string
  // Publication date: "2020", "2020-05" or "2020-05-17".
  date?: string
  publisher?: string
  place?: string
  edition?: string
  volume?: string
  issue?: string
  pages?: string
  // Report number or thesis kind ("Doctoral dissertation").
  number?: string
  genre?: string
  url?: string
  doi?: string
  // Access date for web pages ("2024-03-01").
  accessed?: string
  // Citation key from BibTeX / Word (tag).
  key?: string
}

export type CiteStyle = 'apa' | 'mla' | 'chicago'
export type CiteLang = 'en' | 'es' | 'gl' | 'fr' | 'de'

export const CITE_STYLES: CiteStyle[] = ['apa', 'mla', 'chicago']
export const CITE_LANGS: CiteLang[] = ['es', 'gl', 'en', 'fr', 'de']

export interface CiteSettings {
  style: CiteStyle
  lang: CiteLang
}

export const DEFAULT_CITE: CiteSettings = { style: 'apa', lang: 'en' }

// One citation: the sources it cites and an optional locator (page).
export interface CitationRef {
  ids: string[]
  locator?: string
}

// Formatted text: runs with optional italics (titles).
export interface Run {
  text: string
  italic?: boolean
}

export function newSourceId(): string {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}
