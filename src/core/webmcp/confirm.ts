// The assistant asking the user: confirmations before deleting or large
// changes, and questions (ask_user). Shared-frame dialogs only (never
// confirm()), one at a time: later requests wait for the open one.

import { t } from '../i18n'
import { el, showDialog } from '../../ui/widgets'

let queue: Promise<unknown> = Promise.resolve()

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn)
  queue = next.catch(() => undefined)
  return next
}

// Asks the user to allow an action of the assistant; resolves true when allowed.
export function requestConfirmation(action: string, details?: string): Promise<boolean> {
  return serialized(async () => {
    const body = el(
      'div',
      { class: 'webmcp-ask' },
      el('p', { textContent: t('The AI assistant wants to do this:') }),
      el('p', { class: 'webmcp-ask-action', textContent: action }),
      details ? el('p', { class: 'hint', textContent: details }) : null,
    )
    const choice = await showDialog(t('Allow this change?'), body, [
      { label: t('Do not allow'), value: 'no' },
      { label: t('Allow'), value: 'ok', primary: true },
    ])
    return choice === 'ok'
  })
}

export type Answer = { answer: string } | { cancelled: true }

// A question of the assistant with up to 4 choices, or a free answer.
export function askUser(question: string, choices: string[]): Promise<Answer> {
  return serialized(async () => {
    const input = choices.length ? null : el('textarea', { class: 'field', rows: 3, ariaLabel: t('Your answer') })
    const body = el('div', { class: 'webmcp-ask' }, el('p', { class: 'webmcp-ask-question', textContent: question }), input)
    const buttons = choices.length
      ? [{ label: t('Cancel'), value: '' }, ...choices.map((c, i) => ({ label: c, value: `c${i}`, primary: i === 0 }))]
      : [
          { label: t('Cancel'), value: '' },
          { label: t('Answer'), value: 'ok', primary: true },
        ]
    const choice = await showDialog(t('The AI assistant asks'), body, buttons)
    if (!choice) return { cancelled: true }
    if (input) return input.value.trim() ? { answer: input.value.trim() } : { cancelled: true }
    return { answer: choices[Number(choice.slice(1))] }
  })
}
