// Editor extensions of a notebook page: the writer's body set (same schema as
// the writer's converters) plus paragraph tags and attached files.

import { Extension, Node, mergeAttributes, type AnyExtension } from '@tiptap/core'
import { bodyExtensions } from '../writer/editor/extensions'
import type { TagId } from './model'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    nbTag: { setNbTag: (tag: TagId | null) => ReturnType }
    nbFile: { insertNbFile: (attrs: { name: string; mime: string; size: number; src: string }) => ReturnType }
  }
}

const TAGGABLE = ['paragraph', 'heading']

// Tag of a paragraph or heading (To do, Important, Question, Remember), shown
// as a symbol in the margin (notebook.css); a To do tag can be ticked (done).
export const NbTag = Extension.create({
  name: 'nbTag',
  addGlobalAttributes: () => [
    {
      types: TAGGABLE,
      attributes: {
        nbTag: {
          default: null,
          parseHTML: (el: HTMLElement) => el.getAttribute('data-nb-tag'),
          renderHTML: (attrs: Record<string, unknown>) => (attrs.nbTag ? { 'data-nb-tag': String(attrs.nbTag) } : {}),
        },
      },
    },
  ],
  addCommands: () => ({
    setNbTag:
      (tag) =>
      ({ tr, state, dispatch }) => {
        const { from, to } = state.selection
        let changed = false
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (!TAGGABLE.includes(node.type.name)) return true
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, nbTag: tag })
          changed = true
          return false
        })
        if (changed && dispatch) dispatch(tr)
        return changed
      },
  }),
})

// A file dropped or pasted into the page, kept in the document (size-limited)
// as a data URL; clicking it downloads it.
export const NbFile = Node.create({
  name: 'nbFile',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({
    name: { default: 'file', parseHTML: (el) => el.getAttribute('data-name') ?? el.textContent ?? 'file', renderHTML: (a) => ({ 'data-name': a.name }) },
    mime: { default: 'application/octet-stream', parseHTML: (el) => el.getAttribute('data-mime'), renderHTML: (a) => ({ 'data-mime': a.mime }) },
    size: { default: 0, parseHTML: (el) => Number(el.getAttribute('data-size')) || 0, renderHTML: (a) => ({ 'data-size': String(a.size) }) },
    src: { default: '', parseHTML: (el) => el.getAttribute('href') ?? '', renderHTML: (a) => ({ href: a.src }) },
  }),
  parseHTML: () => [{ tag: 'a[data-nb-file]' }],
  renderHTML: ({ node, HTMLAttributes }) => [
    'a',
    mergeAttributes(HTMLAttributes, { 'data-nb-file': '', class: 'nb-file', download: node.attrs.name, contenteditable: 'false' }),
    `${node.attrs.name} (${formatSize(Number(node.attrs.size) || 0)})`,
  ],
  renderText: ({ node }) => String(node.attrs.name),
  addCommands() {
    return {
      insertNbFile:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    }
  },
})

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function notebookExtensions(options: { history?: boolean; placeholder?: string } = {}): AnyExtension[] {
  return [...bodyExtensions(options), NbTag, NbFile]
}
