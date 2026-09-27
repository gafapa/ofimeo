// Per-browser spelling settings and personal dictionaries (localStorage).

import { language } from '../i18n'
import { LANGS, type Lang } from './types'
import { defaultVariant } from './variants'

const KEY = 'words-online:spelling'
const DICT_KEY = 'words-online:spelling-dictionary:'

export interface SpellSettings {
  spelling: boolean
  grammar: boolean
  // Optional style advice (e.g. Galician "mais" for "pero").
  optionalStyle: boolean
  // LanguageTool server; text is only sent when `useLanguageTool` is on.
  languageToolUrl: string
  useLanguageTool: boolean
}

const DEFAULTS: SpellSettings = { spelling: true, grammar: true, optionalStyle: false, languageToolUrl: '', useLanguageTool: false }

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage unavailable: the setting lasts for this page only.
  }
}

export function loadSettings(): SpellSettings {
  return read(KEY, DEFAULTS)
}

export function saveSettings(settings: SpellSettings): void {
  write(KEY, settings)
}

export function personalWords(lang: Lang): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(DICT_KEY + lang) ?? '[]')
    return Array.isArray(list) ? list.filter((w): w is string => typeof w === 'string') : []
  } catch {
    return []
  }
}

export function savePersonalWords(lang: Lang, words: string[]): void {
  write(DICT_KEY + lang, [...new Set(words)].sort((a, b) => a.localeCompare(b)))
}

// Language of new text when the document has none: the interface language.
export const UI_LANG: Lang = (LANGS as string[]).includes(language) ? (language as Lang) : 'en'
// …in the browser's region when it has one ("es-MX").
export const UI_VARIANT: string = defaultVariant(UI_LANG).tag

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as string[]).includes(value)
}

// BCP 47 tags for the lang attribute and the file formats.
export const LANG_TAG: Record<Lang, string> = { es: 'es-ES', gl: 'gl-ES', en: 'en-US', fr: 'fr-FR', de: 'de-DE' }

// Lang from a tag such as "es-ES", "gl", "en_GB", "de-AT".
export function langFromTag(tag: string | null | undefined): Lang | null {
  const code = (tag ?? '').toLowerCase().split(/[-_]/)[0]
  return isLang(code) ? code : null
}
