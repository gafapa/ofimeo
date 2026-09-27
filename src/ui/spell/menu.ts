// Spelling entries shared by the apps' Tools menus, the F7 key and the
// personal dictionary dialog.

import { t } from '../../core/i18n'
import { personalWords } from '../../core/spell/settings'
import { LANGS, type Lang } from '../../core/spell/types'
import { VARIANTS } from '../../core/spell/variants'
import { el, showDialog, type MenuEntry } from '../widgets'
import { langName } from './describe'
import { removeFromDictionary, spellSettings, updateSpellSettings, type DocLanguage } from './service'
import './spell.css'

// Variants in menus, grouped by language.
export function variantItems(run: (tag: string) => void, active: ((tag: string) => boolean) | null, enabled: () => boolean): MenuEntry[] {
  const out: MenuEntry[] = []
  VARIANTS.forEach((v, i) => {
    if (i && VARIANTS[i - 1].lang !== v.lang) out.push('-')
    out.push({ label: v.name, run: () => run(v.tag), active: active ? () => active(v.tag) : undefined, enabled })
  })
  return out
}

export interface SpellingMenuOptions {
  // Opens the Spelling and grammar dialog.
  open: () => void
  language: DocLanguage
  editable: () => boolean
  // Extra entry after the "as you type" toggles (forms: respondents' setting).
  extra?: MenuEntry[]
}

// Tools menu entries: the dialog, the "as you type" toggles, the document
// language and the personal dictionary.
export function spellingMenuItems(o: SpellingMenuOptions): MenuEntry[] {
  return [
    { label: t('Spelling and grammar…'), shortcut: 'F7', run: o.open },
    { label: t('Check spelling as you type'), run: () => updateSpellSettings({ spelling: !spellSettings().spelling }), active: () => spellSettings().spelling },
    { label: t('Check grammar as you type'), run: () => updateSpellSettings({ grammar: !spellSettings().grammar }), active: () => spellSettings().grammar },
    ...(o.extra ?? []),
    {
      label: t('Language'),
      submenu: [
        ...variantItems((tag) => o.language.set(tag), (tag) => o.language.tag() === tag, o.editable),
        '-',
        { label: t('Optional style suggestions'), run: () => updateSpellSettings({ optionalStyle: !spellSettings().optionalStyle }), active: () => spellSettings().optionalStyle },
      ],
    },
    { label: t('Personal dictionary…'), run: () => void personalDictionaryDialog(o.language.variant().lang) },
  ]
}

// F7 opens the dialog (capture phase: editors such as Univer and Excalidraw
// cannot swallow it).
export function registerSpellingKey(open: () => void): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'F7' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
    if (document.querySelector('dialog[open]:modal')) return
    e.preventDefault()
    e.stopPropagation()
    open()
  }
  window.addEventListener('keydown', onKey, true)
  return () => window.removeEventListener('keydown', onKey, true)
}

// Words added with "Add to dictionary", per language (this browser, every app).
export async function personalDictionaryDialog(initial: Lang, remove: (word: string, lang: Lang) => void = (w, l) => removeFromDictionary(l, w)): Promise<void> {
  const select = el('select', { class: 'field' })
  for (const lang of LANGS) select.append(new Option(langName(lang), lang, false, lang === initial))
  const list = el('ul', { class: 'spell-words' })
  const render = () => {
    const lang = select.value as Lang
    const words = personalWords(lang)
    list.replaceChildren()
    if (!words.length) list.append(el('li', { textContent: t('No words yet. Use “Add to dictionary” on an underlined word.') }))
    for (const word of words) {
      const button = el('button', { type: 'button', textContent: '✕', title: t('Remove') })
      button.setAttribute('aria-label', t('Remove “{word}”', { word }))
      button.addEventListener('click', () => {
        remove(word, lang)
        render()
      })
      list.append(el('li', {}, el('span', { textContent: word }), button))
    }
  }
  select.addEventListener('change', render)
  render()
  const body = el('div', {}, el('p', { textContent: t('Words you added are accepted in every document of this browser.') }), el('label', { class: 'field-label' }, t('Language'), select), list)
  await showDialog(t('Personal dictionary'), body, [{ label: t('Close'), value: 'ok', primary: true }])
}
