// Spelling and grammar for every app: one worker for the page, the settings
// and personal dictionary of this browser (shared with the word processor),
// and the document language (the document's meta "lang", also shared by every
// app). The word processor keeps its own client (src/apps/writer/spell/plugin.ts).

import type * as Y from 'yjs'
import { SpellClient, type CheckResult } from '../../core/spell/client'
import { loadSettings, personalWords, saveSettings, savePersonalWords, UI_VARIANT, type SpellSettings } from '../../core/spell/settings'
import type { CheckOptions, Lang, Paragraph } from '../../core/spell/types'
import { normalizeTag, variantOf, type Variant } from '../../core/spell/variants'

const listeners = new Set<() => void>()
let client: SpellClient | null = null
const personalSent = new Set<Lang>()
const loading = new Set<string>()
let current: SpellSettings = loadSettings()

// Called when a dictionary or Harper becomes ready, and when settings or the
// personal dictionary change: checks should run again.
export function onSpellChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function notify() {
  listeners.forEach((fn) => fn())
}

export function spellClient(): SpellClient {
  client ??= new SpellClient((e) => {
    if (e.type === 'ready' || e.type === 'dictionary-error') loading.delete(e.dict)
    if (e.type === 'ready' || e.type === 'harper' || e.type === 'dictionary-error') notify()
  })
  return client
}

export function spellSettings(): SpellSettings {
  return current
}

export function updateSpellSettings(patch: Partial<SpellSettings>): void {
  current = { ...loadSettings(), ...patch }
  saveSettings(current)
  notify()
}

// Another tab (or the word processor) changed the settings or the dictionary.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (!e.key?.startsWith('words-online:spelling')) return
    current = loadSettings()
    personalSent.clear()
    notify()
  })
}

export function checkOptions(): CheckOptions {
  const s = current
  return {
    spelling: s.spelling,
    grammar: s.grammar,
    optionalStyle: s.optionalStyle,
    languageTool: s.grammar && s.useLanguageTool && s.languageToolUrl ? s.languageToolUrl : undefined,
  }
}

function ensurePersonal(lang: Lang) {
  if (personalSent.has(lang)) return
  personalSent.add(lang)
  spellClient().setPersonal(lang, personalWords(lang))
}

// Checks paragraphs; results may be `pending` while a dictionary downloads
// (onSpellChange fires once it is ready).
export async function checkParagraphs(paragraphs: Paragraph[], options: CheckOptions = checkOptions()): Promise<CheckResult[]> {
  for (const p of paragraphs) ensurePersonal(p.lang)
  const results = await spellClient().check(paragraphs, options)
  results.forEach((r, i) => r.pending && loading.add(paragraphs[i].variant ?? paragraphs[i].lang))
  return results
}

export function suggest(word: string, dict: string): Promise<string[]> {
  return spellClient().suggest(word, dict)
}

export function isPersonal(lang: Lang, word: string): boolean {
  const words = personalWords(lang)
  return words.includes(word) || words.includes(word.toLowerCase())
}

export function addToDictionary(lang: Lang, word: string): void {
  const words = [...new Set([...personalWords(lang), word])]
  savePersonalWords(lang, words)
  spellClient().setPersonal(lang, words)
  personalSent.add(lang)
  notify()
}

export function removeFromDictionary(lang: Lang, word: string): void {
  const words = personalWords(lang).filter((w) => w !== word)
  savePersonalWords(lang, words)
  spellClient().setPersonal(lang, words)
  personalSent.add(lang)
  notify()
}

export function disableRule(rule: string): void {
  spellClient().disableRule(rule)
}

// ---------- Document language ----------

// The language of a document: its meta "lang" (a variant tag, "es-MX"),
// else the interface language in the browser's region.
export interface DocLanguage {
  tag(): string
  variant(): Variant
  set(tag: string): void
  onChange(fn: () => void): () => void
}

export function docLanguage(doc: Y.Doc, editable: () => boolean): DocLanguage {
  const meta = doc.getMap<unknown>('meta')
  const tag = () => normalizeTag(meta.get('lang')) ?? UI_VARIANT
  return {
    tag,
    variant: () => variantOf(tag())!,
    set: (value) => {
      if (editable() && value !== tag()) meta.set('lang', value)
    },
    onChange: (fn) => {
      const observer = (e: Y.YMapEvent<unknown>) => e.keysChanged.has('lang') && fn()
      meta.observe(observer)
      return () => meta.unobserve(observer)
    },
  }
}
