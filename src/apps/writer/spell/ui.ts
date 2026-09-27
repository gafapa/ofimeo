// Spelling and grammar in the word processor's interface: Tools menu, context
// menu, status bar and settings dialogs.

import { t } from '../../../core/i18n'
import { el, showContextMenu, showDialog, toast, type MenuEntry, type MenuItem } from '../../../ui/widgets'
import type { SpellController } from './plugin'
import { LANGS, type Lang } from '../../../core/spell/types'
import { personalWords } from '../../../core/spell/settings'
import { VARIANTS, variantName } from '../../../core/spell/variants'
import { describe, kindLabel, langName, showReplacement } from '../../../ui/spell/describe'

export { describe, kindLabel, langName, showReplacement }
import '../../../ui/spell/spell.css'


// Variants in menus, grouped by language.
function variantItems(run: (tag: string) => void, active: ((tag: string) => boolean) | null, enabled: () => boolean): MenuEntry[] {
  const out: MenuEntry[] = []
  VARIANTS.forEach((v, i) => {
    if (i && VARIANTS[i - 1].lang !== v.lang) out.push('-')
    out.push({ label: v.name, run: () => run(v.tag), active: active ? () => active(v.tag) : undefined, enabled })
  })
  return out
}

export function openSpellDialog(spell: SpellController): void {
  void import('./dialog').then((d) => d.spellingDialog(spell))
}

export function toolsMenu(spell: SpellController): { label: string; items: MenuEntry[] } {
  const editable = () => spell.editor.isEditable
  return {
    label: t('Tools'),
    items: [
      { label: t('Spelling and grammar…'), shortcut: 'F7', run: () => openSpellDialog(spell) },
      '-',
      { label: t('Check spelling as you type'), run: () => spell.update({ spelling: !spell.settings.spelling }), active: () => spell.settings.spelling },
      { label: t('Check grammar as you type'), run: () => spell.update({ grammar: !spell.settings.grammar }), active: () => spell.settings.grammar },
      '-',
      {
        label: t('Language'),
        submenu: [
          ...variantItems((tag) => spell.setDocLang(tag), (tag) => spell.docLang() === tag, editable),
          '-',
          {
            label: t('Selected paragraphs'),
            submenu: [
              ...variantItems((tag) => setParagraphLang(spell, tag), null, editable),
              '-',
              { label: t('Same as the document'), run: () => setParagraphLang(spell, null), enabled: editable },
            ],
          },
        ],
      },
      {
        label: t('Grammar'),
        submenu: [
          { label: t('Optional style suggestions'), run: () => spell.update({ optionalStyle: !spell.settings.optionalStyle }), active: () => spell.settings.optionalStyle },
          { label: t('Use a LanguageTool server…'), run: () => void languageToolDialog(spell), active: () => spell.settings.useLanguageTool },
        ],
      },
      { label: t('Personal dictionary…'), run: () => void personalDictionaryDialog(spell) },
    ],
  }
}

function setParagraphLang(spell: SpellController, lang: string | null) {
  spell.editor.chain().focus().setParagraphLanguage(lang).run()
}

// Context menu entries for an issue; empty when there is none at the position.
export async function contextMenuFor(spell: SpellController, pos: number, x: number, y: number, rest: MenuEntry[]): Promise<boolean> {
  if (!spell.enabled) return false
  const found = spell.issueAt(pos)
  if (!found) return false
  const editable = spell.editor.isEditable
  const suggestions = (await spell.suggestions(found)).slice(0, 5)
  const items: MenuEntry[] = []
  const classes: (string | null)[] = []
  const push = (item: MenuEntry, cls: string | null = null) => {
    items.push(item)
    if (item !== '-') classes.push(cls)
  }
  if (found.issue.rule !== 'spelling') push({ label: describe(found), enabled: () => false }, 'spell-note')
  for (const s of suggestions) push({ label: showReplacement(s), run: () => spell.replace(found, s), enabled: () => editable }, 'spell-suggestion')
  if (!suggestions.length) push({ label: t('(no suggestions)'), enabled: () => false })
  push('-')
  push({ label: t('Ignore'), run: () => spell.ignoreOnce(found) })
  if (found.issue.rule === 'spelling') {
    push({ label: t('Ignore all'), run: () => spell.ignoreAll(found) })
    push({ label: t('Add to dictionary'), run: () => spell.addToDictionary(found.text, found.lang) })
  } else push({ label: t('Ignore this kind of issue'), run: () => spell.ignoreAll(found) })
  push({ label: t('Spelling and grammar…'), shortcut: 'F7', run: () => openSpellDialog(spell) })
  showContextMenu(x, y, [...items, '-', ...rest])
  // Suggestions in bold, the explanation wrapped.
  const rows = document.querySelectorAll<HTMLElement>('.context-menu > .menu-row')
  classes.forEach((cls, i) => cls && rows[i]?.classList.add(cls))
  return true
}

// Status bar (language slot): document language and what the checker is doing.
export function languageButton(spell: SpellController): HTMLButtonElement {
  const button = el('button', { type: 'button', class: 'status-lang hide-narrow' })
  const render = () => {
    const lang = variantName(spell.docLang())
    const loading = spell.loading.size > 0
    button.textContent = !spell.enabled ? lang : loading ? t('{language} · loading dictionary…', { language: lang }) : lang
    button.title = t('Document language (Tools → Language)')
  }
  button.addEventListener('click', () => {
    const rect = button.getBoundingClientRect()
    showContextMenu(rect.left, rect.top, variantItems((tag) => spell.setDocLang(tag), (tag) => spell.docLang() === tag, () => spell.editor.isEditable))
  })
  spell.onChange(render)
  render()
  return button
}

export async function languageToolDialog(spell: SpellController): Promise<void> {
  const s = spell.settings
  const url = el('input', { class: 'field', type: 'url', value: s.languageToolUrl, placeholder: 'https://languagetool.example.edu' })
  const use = el('input', { type: 'checkbox', checked: s.useLanguageTool })
  const status = el('p', { class: 'spell-status' })
  if (s.useLanguageTool && spell.languageToolOk === false) status.textContent = t('The last check with this server failed; local checks were used.')
  const body = el(
    'div',
    {},
    el('p', {
      textContent: t('LanguageTool is an open-source grammar checker that can be installed on a server. When it is used, it adds its checks to the offline ones.'),
    }),
    el('label', { class: 'field-label' }, t('Server address'), url),
    el('label', { class: 'spell-check-row' }, use, t('Use a LanguageTool server')),
    el('p', {
      class: 'spell-privacy',
      textContent: t(
        'Privacy: while this is on, the text of the documents you check is sent to this server. Use a server you trust, ideally one run by your school. When it is off, nothing leaves this browser.',
      ),
    }),
    status,
  )
  const result = await showDialog(t('LanguageTool server'), body, [
    { label: t('Cancel'), value: 'cancel' },
    { label: t('Save'), value: 'ok', primary: true },
  ])
  if (result !== 'ok') return
  const address = url.value.trim()
  if (use.checked && !/^https?:\/\/\S+$/i.test(address)) {
    toast(t('Enter the address of the server (https://…)'))
    return
  }
  spell.update({ languageToolUrl: address, useLanguageTool: use.checked && !!address })
}

export async function personalDictionaryDialog(spell: SpellController): Promise<void> {
  const select = el('select', { class: 'field' })
  for (const lang of LANGS) select.append(new Option(langName(lang), lang, false, lang === spell.docBase()))
  const list = el('ul', { class: 'spell-words' })
  const render = () => {
    const lang = select.value as Lang
    const words = personalWords(lang)
    list.replaceChildren()
    if (!words.length) list.append(el('li', { textContent: t('No words yet. Use “Add to dictionary” on an underlined word.') }))
    for (const word of words) {
      const remove = el('button', { type: 'button', textContent: '✕', title: t('Remove') })
      remove.setAttribute('aria-label', t('Remove “{word}”', { word }))
      remove.addEventListener('click', () => {
        spell.removeFromDictionary(word, lang)
        render()
      })
      list.append(el('li', {}, el('span', { textContent: word }), remove))
    }
  }
  select.addEventListener('change', render)
  render()
  const body = el('div', {}, el('p', { textContent: t('Words you added are accepted in every document of this browser.') }), el('label', { class: 'field-label' }, t('Language'), select), list)
  await showDialog(t('Personal dictionary'), body, [{ label: t('Close'), value: 'ok', primary: true }])
}
