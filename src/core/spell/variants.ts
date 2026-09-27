// Regional variants of the checked languages. Documents and paragraphs store a
// BCP 47 tag ("en-GB", "es-MX"); the rules work per language and the spelling
// dictionary is chosen per variant. Names are in the variant's own language,
// like the interface language list.

import { LANGS, type Lang } from './types'

export interface Variant {
  tag: string
  lang: Lang
  // Dictionary id (scripts/spell-dictionaries.mjs): the `dictionary-<id>` package.
  dict: string
  name: string
}

export const VARIANTS: Variant[] = [
  // The general Spanish dictionary (RLA-ES "es") covers Spain.
  { tag: 'es-ES', lang: 'es', dict: 'es', name: 'Español (España)' },
  { tag: 'es-MX', lang: 'es', dict: 'es-mx', name: 'Español (México)' },
  { tag: 'es-AR', lang: 'es', dict: 'es-ar', name: 'Español (Argentina)' },
  { tag: 'es-CO', lang: 'es', dict: 'es-co', name: 'Español (Colombia)' },
  { tag: 'es-CL', lang: 'es', dict: 'es-cl', name: 'Español (Chile)' },
  { tag: 'es-US', lang: 'es', dict: 'es-us', name: 'Español (Estados Unidos)' },
  { tag: 'gl-ES', lang: 'gl', dict: 'gl', name: 'Galego' },
  { tag: 'en-US', lang: 'en', dict: 'en', name: 'English (US)' },
  { tag: 'en-GB', lang: 'en', dict: 'en-gb', name: 'English (UK)' },
  { tag: 'en-AU', lang: 'en', dict: 'en-au', name: 'English (Australia)' },
  { tag: 'en-CA', lang: 'en', dict: 'en-ca', name: 'English (Canada)' },
  { tag: 'fr-FR', lang: 'fr', dict: 'fr', name: 'Français' },
  { tag: 'de-DE', lang: 'de', dict: 'de', name: 'Deutsch' },
]

export const DICTIONARIES = VARIANTS.map((v) => v.dict)

const BY_TAG = new Map(VARIANTS.map((v) => [v.tag.toLowerCase(), v]))

// Other regions of a language: the closest variant we have.
const REGION_FALLBACK: Record<string, string> = {
  'en-ie': 'en-GB', 'en-nz': 'en-AU', 'en-za': 'en-GB', 'en-in': 'en-GB',
  'es-419': 'es-MX', 'es-bo': 'es-AR', 'es-py': 'es-AR', 'es-uy': 'es-AR', 'es-pe': 'es-CO', 'es-ec': 'es-CO', 'es-ve': 'es-CO',
  'es-pa': 'es-CO', 'es-cr': 'es-MX', 'es-gt': 'es-MX', 'es-hn': 'es-MX', 'es-ni': 'es-MX', 'es-sv': 'es-MX', 'es-cu': 'es-MX',
  'es-do': 'es-MX', 'es-pr': 'es-US',
}

function baseOf(tag: string): Lang | null {
  const code = tag.toLowerCase().split(/[-_]/)[0]
  return (LANGS as string[]).includes(code) ? (code as Lang) : null
}

// The variant of a tag we know ("en-GB", "en_gb", "es-419"), or null.
function exact(tag: string): Variant | null {
  const key = tag.toLowerCase().replace(/_/g, '-')
  const v = BY_TAG.get(key) ?? BY_TAG.get(REGION_FALLBACK[key]?.toLowerCase() ?? '')
  if (v) return v
  const [lang, region] = key.split('-')
  return region ? (BY_TAG.get(REGION_FALLBACK[`${lang}-${region}`]?.toLowerCase() ?? '') ?? null) : null
}

// Browser locales, most preferred first.
function browserTags(): readonly string[] {
  try {
    return navigator.languages?.length ? navigator.languages : [navigator.language]
  } catch {
    return []
  }
}

// Default variant of a language: the browser's region when it has one of that
// language ("es-MX" for a Mexican browser), else the first one listed.
export function defaultVariant(lang: Lang, tags: readonly string[] = browserTags()): Variant {
  for (const tag of tags) {
    if (baseOf(tag ?? '') !== lang) continue
    const v = exact(tag)
    if (v) return v
  }
  return VARIANTS.find((v) => v.lang === lang)!
}

// Variant of a stored value: a tag, a bare language code ("es", older
// documents) or anything else (null).
export function variantOf(value: unknown): Variant | null {
  if (typeof value !== 'string' || !value) return null
  const lang = baseOf(value)
  if (!lang) return null
  return exact(value) ?? defaultVariant(lang)
}

// Canonical tag of a stored value, or null.
export function normalizeTag(value: unknown): string | null {
  return variantOf(value)?.tag ?? null
}

// Dictionary id of a paragraph (its variant's, else its language's first).
export function dictOf(p: { lang: Lang; variant?: string }): string {
  const v = variantOf(p.variant)
  return v && v.lang === p.lang ? v.dict : VARIANTS.find((x) => x.lang === p.lang)!.dict
}

export function variantName(value: unknown): string {
  return variantOf(value)?.name ?? String(value ?? '')
}
