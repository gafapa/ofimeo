// Template gallery model. Template content is written in Spanish, Galician,
// French, German and English; the templates tied to Spanish school regulations
// (LOMLOE) only in Spanish and Galician. The gallery chrome uses t().

import type { DocType } from '../core/store'

export type Lang = 'es' | 'gl' | 'fr' | 'de' | 'en'
// Content languages of the Spain-only templates.
export type SpainLang = 'es' | 'gl'

export const LANG_NAMES: Record<Lang, string> = { es: 'Español', gl: 'Galego', en: 'English', fr: 'Français', de: 'Deutsch' }

export interface Template {
  id: string
  app: DocType
  // Languages the content exists in (all five, or Spanish and Galician only).
  langs: Lang[]
  name: Partial<Record<Lang, string>>
  description: Partial<Record<Lang, string>>
  // Small SVG preview (markup string).
  thumb: () => string
  // Creates the document as a new local document and returns its path.
  create: (lang: Lang) => Promise<string>
}

// Picks the variant of the language.
export const pick = (lang: Lang) => (es: string, gl: string, fr: string, de: string, en: string) => ({ es, gl, fr, de, en })[lang]
// Picks the Spanish or Galician variant (Spain-only templates).
export const pickEs = (lang: SpainLang) => (es: string, gl: string) => (lang === 'gl' ? gl : es)
