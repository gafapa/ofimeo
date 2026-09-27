// Mail merge fields: `mergeField` (a column of the data source, shown as a
// «Name» chip) and `mergeIf` (conditional text: "if field = value then text
// else other text"). While the merge panel previews a record, the chips show
// its values (editor.storage.mergeField.preview). Word writes them as
// MERGEFIELD and IF fields (formats/docx-export.ts).

import { Node, mergeAttributes } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { t } from '../../../core/i18n'

export type MergeRecord = Record<string, string>
export type MergeOp = '=' | '<>'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mergeField: {
      insertMergeField: (name: string) => ReturnType
      insertMergeIf: (attrs: { field: string; op: MergeOp; value: string; then: string; otherwise: string }) => ReturnType
    }
  }
  interface Storage {
    mergeField: MailMergeStorage
  }
}

export interface MailMergeStorage {
  // Record shown in place of the fields (preview), or null.
  preview: MergeRecord | null
  views: Set<() => void>
}

// Value of a field in a record (field names match without case).
export function fieldValue(record: MergeRecord, name: string): string {
  if (name in record) return record[name]
  const key = Object.keys(record).find((k) => k.toLowerCase() === name.toLowerCase())
  return key ? record[key] : ''
}

export function conditionHolds(record: MergeRecord, attrs: { field: string; op: string; value: string }): boolean {
  const a = fieldValue(record, attrs.field).trim().toLowerCase()
  const b = String(attrs.value ?? '').trim().toLowerCase()
  const equal = a === b || (a !== '' && b !== '' && Number(a) === Number(b))
  return attrs.op === '<>' ? !equal : equal
}

export const conditionResult = (record: MergeRecord, attrs: Record<string, unknown>) =>
  String(conditionHolds(record, attrs as { field: string; op: string; value: string }) ? (attrs.then ?? '') : (attrs.otherwise ?? ''))

// Text of a merge node for a record (null record: the placeholder).
export function mergeText(node: { type: string; attrs?: Record<string, unknown> }, record: MergeRecord | null): string {
  const a = node.attrs ?? {}
  if (node.type === 'mergeField') return record ? fieldValue(record, String(a.name ?? '')) : `«${a.name}»`
  if (record) return conditionResult(record, a)
  return `[${t('If')} ${a.field} ${a.op === '<>' ? '≠' : '='} “${a.value}”: ${a.then}${a.otherwise ? ` | ${a.otherwise}` : ''}]`
}

function chipView(node: PMNode, storage: MailMergeStorage) {
  let current = node
  const dom = document.createElement('span')
  dom.contentEditable = 'false'
  const draw = () => {
    const preview = storage.preview
    dom.className = `merge-chip ${current.type.name === 'mergeIf' ? 'merge-if' : 'merge-field'}${preview ? ' preview' : ''}`
    dom.textContent = mergeText({ type: current.type.name, attrs: current.attrs }, preview)
    dom.title = current.type.name === 'mergeField' ? t('Merge field: {name}', { name: current.attrs.name }) : mergeText({ type: 'mergeIf', attrs: current.attrs }, null)
  }
  draw()
  storage.views.add(draw)
  return {
    dom,
    update: (next: PMNode) => {
      if (next.type !== current.type) return false
      current = next
      draw()
      return true
    },
    destroy: () => storage.views.delete(draw),
    ignoreMutation: () => true,
  }
}

export const MergeField = Node.create<unknown, MailMergeStorage>({
  name: 'mergeField',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addStorage: () => ({ preview: null, views: new Set() }),
  addAttributes: () => ({
    name: {
      default: '',
      parseHTML: (el) => el.getAttribute('data-merge-field') ?? '',
      renderHTML: (attrs) => ({ 'data-merge-field': attrs.name }),
    },
  }),
  parseHTML: () => [{ tag: 'span[data-merge-field]' }],
  renderHTML: ({ node, HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { class: 'merge-chip merge-field' }), `«${node.attrs.name}»`],
  renderText: ({ node }) => `«${node.attrs.name}»`,
  addNodeView() {
    return ({ node }) => chipView(node, this.storage)
  },
  addCommands() {
    return {
      insertMergeField:
        (name) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { name } }),
      insertMergeIf:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: 'mergeIf', attrs }),
    }
  },
})

const IF_ATTRS = ['field', 'op', 'value', 'then', 'otherwise'] as const

export const MergeIf = Node.create<unknown, MailMergeStorage>({
  name: 'mergeIf',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () =>
    Object.fromEntries(
      IF_ATTRS.map((name) => [
        name,
        {
          default: name === 'op' ? '=' : '',
          parseHTML: (el: HTMLElement) => el.getAttribute(`data-${name}`) ?? (name === 'op' ? '=' : ''),
          renderHTML: (attrs: Record<string, unknown>) => ({ [`data-${name}`]: String(attrs[name] ?? '') }),
        },
      ]),
    ),
  parseHTML: () => [{ tag: 'span[data-merge-if]' }],
  renderHTML: ({ node, HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { 'data-merge-if': '', class: 'merge-chip merge-if' }), mergeText({ type: 'mergeIf', attrs: node.attrs }, null)],
  renderText: ({ node }) => mergeText({ type: 'mergeIf', attrs: node.attrs }, null),
  addNodeView() {
    return ({ node, editor }) => chipView(node, editor.storage.mergeField)
  },
})
