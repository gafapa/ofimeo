// Spelling and grammar in forms: questions, descriptions and options are
// checked as they are typed and by Tools ▸ Spelling and grammar… (F7);
// respondents' answers are checked only when the form allows it (Settings:
// on for surveys, off for quizzes by default).

import { t } from '../../core/i18n'
import type { Session } from '../../core/session'
import { openSpellingDialog } from '../../ui/spell/dialog'
import { fieldsSource, type FieldEntry, type TextField } from '../../ui/spell/fields'
import { spellcheckFields } from '../../ui/spell/inline'
import { registerSpellingKey, spellingMenuItems } from '../../ui/spell/menu'
import { docLanguage, type DocLanguage } from '../../ui/spell/service'
import type { MenuEntry } from '../../ui/widgets'
import { readSettings, respondentSpelling } from './model'

// The editor's text fields (they carry data-f, see editor.ts).
const EDITOR_FIELDS = 'textarea[data-f], input[data-f]:not([type])'
// Respondents' written answers.
const ANSWER_FIELDS = '.fm-question input.field:not([type]), .fm-question textarea.field'

const short = (s: string) => (s.length > 40 ? `${s.slice(0, 38).trimEnd()}…` : s)

export function formLanguage(session: Session): DocLanguage {
  return docLanguage(session.doc, () => session.canEdit)
}

// Checks the editor's fields as they are typed.
export function spellcheckEditor(session: Session, root: HTMLElement): () => void {
  const language = formLanguage(session)
  root.lang = language.tag()
  language.onChange(() => (root.lang = language.tag()))
  return spellcheckFields(root, EDITOR_FIELDS, language.tag)
}

// Respondents' answers: our checker when the form allows it, no checker at
// all (not even the browser's) when it does not.
export function spellcheckAnswers(session: Session, root: HTMLElement): () => void {
  const language = formLanguage(session)
  root.lang = language.tag()
  let detach: (() => void) | null = null
  let blocker: MutationObserver | null = null
  const apply = () => {
    const on = respondentSpelling(readSettings(session.doc))
    if (on && !detach) {
      blocker?.disconnect()
      blocker = null
      root.querySelectorAll(ANSWER_FIELDS).forEach((f) => f.removeAttribute('spellcheck'))
      detach = spellcheckFields(root, ANSWER_FIELDS, language.tag)
    } else if (!on) {
      detach?.()
      detach = null
      const block = () => root.querySelectorAll(ANSWER_FIELDS).forEach((f) => f.setAttribute('spellcheck', 'false'))
      block()
      if (!blocker) {
        blocker = new MutationObserver(block)
        blocker.observe(root, { childList: true, subtree: true })
      }
    }
  }
  apply()
  const settings = session.doc.getMap('form-settings')
  settings.observe(apply)
  return () => {
    settings.unobserve(apply)
    detach?.()
    blocker?.disconnect()
  }
}

// Tools menu entries and F7: the dialog walks through the editor's fields.
export function formSpelling(session: Session, fieldsRoot: () => HTMLElement, showQuestions: () => void): { menu: () => MenuEntry[]; open: () => void } {
  const editable = () => session.canEdit
  const language = formLanguage(session)
  const fields = (): FieldEntry[] => {
    const out: FieldEntry[] = []
    for (const field of fieldsRoot().querySelectorAll<TextField>(EDITOR_FIELDS)) {
      if (!field.value.trim()) continue
      const card = field.closest('.fm-card')
      const title = card?.querySelector<TextField>('.fm-title-input, .fm-q-input')
      const what = field.getAttribute('aria-label') ?? ''
      const label = title && title !== field && title.value.trim() ? `${short(title.value.trim())} · ${what}` : what
      out.push({ key: field.dataset.f!, label, field })
    }
    return out
  }
  const open = () => {
    showQuestions()
    openSpellingDialog(fieldsSource({ fields, editable, language }))
  }
  registerSpellingKey(open)
  return { open, menu: () => spellingMenuItems({ open, language, editable }) }
}

// Settings row: "Allow spell check for respondents".
export function respondentSpellingSetting(session: Session, set: (value: 'on' | 'off') => void): HTMLElement {
  const s = readSettings(session.doc)
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.checked = respondentSpelling(s)
  input.dataset.setting = 'respondentSpelling'
  input.addEventListener('change', () => set(input.checked ? 'on' : 'off'))
  const label = document.createElement('label')
  label.className = 'check'
  label.append(input, t('Allow spell check for respondents'))
  const hint = document.createElement('p')
  hint.className = 'hint'
  hint.textContent = t('Underlines misspelled words in written answers. Off by default in quizzes, where it could give answers away.')
  const row = document.createElement('div')
  row.className = 'fm-setting'
  row.append(label, hint)
  return row
}
