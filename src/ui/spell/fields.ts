// A Spelling and grammar dialog source over text fields in the page (<input>,
// <textarea>): form questions, PDF notes… Changes are typed into the field
// (execCommand keeps its undo history and fires "input", so the app saves
// them as if the user had typed).

import type { SpellItem, SpellSource } from './dialog'
import { textFieldRects } from './inline'
import type { DocLanguage } from './service'

export type TextField = HTMLInputElement | HTMLTextAreaElement

export interface FieldEntry {
  key: string
  label: string
  field: TextField
}

export interface FieldsSourceOptions {
  // The fields to check, in document order (looked up again after each change).
  fields: () => FieldEntry[]
  editable: () => boolean
  language: DocLanguage
  start?: (items: SpellItem[]) => number
  close?: () => void
}

// Replaces text in a field as typing would.
export function replaceInField(field: TextField, from: number, to: number, text: string): void {
  field.focus({ preventScroll: true })
  field.setSelectionRange(from, to)
  if (!document.execCommand(text ? 'insertText' : 'delete', false, text) || field.value.slice(from, from + text.length) !== text) {
    field.setRangeText(text, from, to, 'end')
    field.dispatchEvent(new Event('input', { bubbles: true }))
  }
  field.dispatchEvent(new Event('change', { bubbles: true }))
}

export function fieldsSource(o: FieldsSourceOptions): SpellSource {
  const find = (key: string) => o.fields().find((f) => f.key === key)?.field ?? null
  return {
    items: () => o.fields().map((f) => ({ key: f.key, label: f.label, text: f.field.value })),
    start: o.start,
    reveal: (item, from, to) => {
      const field = find(item.key)
      if (!field) return
      field.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior })
      try {
        field.setSelectionRange(from, to)
      } catch {
        // Not a text field.
      }
    },
    rects: (item, from, to) => {
      const field = find(item.key)
      return field ? textFieldRects(field, from, to) : []
    },
    replace: (item, from, to, text) => {
      const field = find(item.key)
      if (!field || field.readOnly || field.disabled || field.value.slice(from, to) !== item.text.slice(from, to)) return false
      replaceInField(field, from, to, text)
      return true
    },
    editable: o.editable,
    language: o.language,
    close: o.close,
  }
}
