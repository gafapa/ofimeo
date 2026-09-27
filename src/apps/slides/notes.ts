// Speaker notes under the slide: a plain text area bound to the slide's Y.Text,
// so several people can write notes at the same time.

import type * as Y from 'yjs'
import { t } from '../../core/i18n'
import { el } from '../../ui/widgets'

export class NotesEditor {
  readonly element: HTMLElement
  readonly area: HTMLTextAreaElement
  private text: Y.Text | null = null
  private readonly onRemote = (_e: Y.YTextEvent, tr: Y.Transaction) => {
    if (tr.origin !== this) this.pull()
  }

  constructor(readOnly: boolean, private readonly beforeEdit: () => void) {
    this.area = el('textarea', { class: 'slides-notes-area', placeholder: readOnly ? t('No speaker notes') : t('Click to add speaker notes'), spellcheck: true, readOnly })
    this.area.setAttribute('aria-label', t('Speaker notes'))
    this.element = el('div', { class: 'slides-notes' }, this.area)
    this.area.addEventListener('input', () => this.push())
  }

  bind(text: Y.Text): void {
    this.text?.unobserve(this.onRemote)
    this.text = text
    text.observe(this.onRemote)
    this.area.value = text.toString()
  }

  // Selects text of the notes (spelling dialog) and brings it into view.
  select(from: number, to: number): void {
    this.element.hidden = false
    this.area.focus({ preventScroll: true })
    this.area.setSelectionRange(from, to)
  }

  // Local edit → the smallest replacement in the shared text.
  private push(): void {
    const text = this.text
    if (!text) return
    this.beforeEdit()
    const before = text.toString()
    const after = this.area.value
    let start = 0
    while (start < before.length && start < after.length && before[start] === after[start]) start++
    let endB = before.length
    let endA = after.length
    while (endB > start && endA > start && before[endB - 1] === after[endA - 1]) {
      endB--
      endA--
    }
    text.doc!.transact(() => {
      if (endB > start) text.delete(start, endB - start)
      if (endA > start) text.insert(start, after.slice(start, endA))
    }, this)
  }

  // Remote edit → the text area, keeping the caret where it was relative to the text around it.
  private pull(): void {
    const value = this.text!.toString()
    if (value === this.area.value) return
    const focused = document.activeElement === this.area
    const { selectionStart, selectionEnd } = this.area
    const old = this.area.value
    let prefix = 0
    while (prefix < old.length && prefix < value.length && old[prefix] === value[prefix]) prefix++
    const delta = value.length - old.length
    this.area.value = value
    if (focused) {
      const shift = (pos: number) => (pos > prefix ? Math.max(prefix, pos + delta) : pos)
      this.area.setSelectionRange(shift(selectionStart), shift(selectionEnd))
    }
  }
}
