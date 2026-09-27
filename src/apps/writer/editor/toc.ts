// Table of contents: an atom block whose entries (heading text, level and page)
// are cached in its attributes, like a Word TOC field. Entries follow the
// headings automatically after local edits (debounced) and on "Update table";
// remote edits are not re-applied, so collaborators with a different layout do
// not keep rewriting each other's page numbers.

import { Node, mergeAttributes, type Editor, type JSONContent } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection, type Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { ySyncPluginKey } from '@tiptap/y-tiptap'
import { t } from '../../../core/i18n'

export interface TocEntry {
  level: number
  text: string
  page?: number
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableOfContents: {
      insertTableOfContents: (maxLevel: number, title?: string) => ReturnType
      updateTablesOfContents: () => ReturnType
    }
  }
}

export interface TocOptions {
  // Page number (1-based) of a document position, from the pagination.
  pageOf: (view: EditorView, pos: number) => number | null
  // Title of a new table in the document language.
  defaultTitle: () => string
}

const tocKey = new PluginKey('tableOfContents')
const UPDATE_DELAY = 800

// Headings a table of contents lists (in document order), with their positions.
export function tocHeadings(doc: PMNode, maxLevel: number): { pos: number; node: PMNode }[] {
  const out: { pos: number; node: PMNode }[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      if (node.attrs.level <= maxLevel && node.textContent.trim()) out.push({ pos, node })
      return false
    }
    return !node.isAtom
  })
  return out
}

// The same from JSON (converters): heading nodes in document order.
export function tocHeadingsJSON(body: JSONContent, maxLevel: number): JSONContent[] {
  const out: JSONContent[] = []
  const walk = (node: JSONContent) => {
    if (node.type === 'heading') {
      if ((Number(node.attrs?.level) || 1) <= maxLevel && headingText(node).trim()) out.push(node)
      return
    }
    node.content?.forEach(walk)
  }
  walk(body)
  return out
}

// Bookmark names (_Toc000000001…) for the headings listed by the tables of contents of a body.
export function tocBookmarks(body: JSONContent): Map<JSONContent, string> {
  const out = new Map<JSONContent, string>()
  let max = 0
  const walk = (n: JSONContent) => {
    if (n.type === 'tableOfContents') max = Math.max(max, Number(n.attrs?.maxLevel) || 3)
    n.content?.forEach(walk)
  }
  walk(body)
  if (max) tocHeadingsJSON(body, max).forEach((h, i) => out.set(h, `_Toc${String(i + 1).padStart(9, '0')}`))
  return out
}

export function headingText(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? ''
  return (node.content ?? []).map(headingText).join('')
}

export function computeEntries(view: EditorView, maxLevel: number, pageOf: TocOptions['pageOf']): TocEntry[] {
  return tocHeadings(view.state.doc, maxLevel).map(({ pos, node }) => {
    const page = pageOf(view, pos)
    return { level: node.attrs.level, text: node.textContent.trim(), ...(page ? { page } : {}) }
  })
}

function sameEntries(a: unknown, b: TocEntry[]): boolean {
  return JSON.stringify(a ?? []) === JSON.stringify(b)
}

// Rewrites the entries of every table of contents into `tr`; returns whether anything changed.
function refreshInto(view: EditorView, options: TocOptions, tr: Transaction): boolean {
  let changed = false
  tr.doc.descendants((node, pos) => {
    if (node.type.name !== 'tableOfContents') return !node.isAtom
    const entries = computeEntries(view, Number(node.attrs.maxLevel) || 3, options.pageOf)
    if (!sameEntries(node.attrs.entries, entries)) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, entries })
      changed = true
    }
    return false
  })
  if (changed) tr.setMeta(tocKey, true).setMeta('addToHistory', false)
  return changed
}

function refresh(view: EditorView, options: TocOptions): boolean {
  const tr = view.state.tr
  if (!refreshInto(view, options, tr)) return false
  view.dispatch(tr)
  return true
}

export const TableOfContents = Node.create<TocOptions>({
  name: 'tableOfContents',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  addOptions: () => ({ pageOf: () => null, defaultTitle: () => 'Contents' }),
  addAttributes: () => ({
    maxLevel: {
      default: 3,
      parseHTML: (el) => Number(el.getAttribute('data-max-level')) || 3,
      renderHTML: (attrs) => ({ 'data-max-level': attrs.maxLevel }),
    },
    title: {
      default: '',
      parseHTML: (el) => el.getAttribute('data-title') ?? '',
      renderHTML: (attrs) => ({ 'data-title': attrs.title }),
    },
    entries: {
      default: [],
      parseHTML: (el) => {
        try {
          return JSON.parse(el.getAttribute('data-entries') ?? '[]')
        } catch {
          return []
        }
      },
      renderHTML: (attrs) => ({ 'data-entries': JSON.stringify(attrs.entries ?? []) }),
    },
  }),
  parseHTML: () => [{ tag: 'nav[data-toc]' }],
  renderHTML: ({ node, HTMLAttributes }) => {
    const entries = (node.attrs.entries ?? []) as TocEntry[]
    return [
      'nav',
      mergeAttributes(HTMLAttributes, { 'data-toc': '', class: 'toc' }),
      ['p', { class: 'toc-title' }, String(node.attrs.title || '')],
      ...entries.map((e) => ['p', { class: `toc-entry toc-l${e.level}` }, ['span', { class: 'toc-text' }, e.text], ['span', { class: 'toc-page' }, String(e.page ?? '')]]),
    ] as never
  },
  addCommands() {
    return {
      insertTableOfContents:
        (maxLevel, title) =>
        ({ chain, view }) => {
          const entries = view ? computeEntries(view, maxLevel, this.options.pageOf) : []
          return chain()
            .insertContent([{ type: this.name, attrs: { maxLevel, title: title ?? this.options.defaultTitle(), entries } }, { type: 'paragraph' }])
            .run()
        },
      updateTablesOfContents:
        () =>
        ({ view, tr, dispatch }) => {
          if (dispatch) refreshInto(view, this.options, tr)
          return true
        },
    }
  },
  addNodeView() {
    const options = this.options
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('nav')
      dom.className = 'toc'
      dom.setAttribute('data-toc', '')
      dom.setAttribute('data-page-split', '')
      dom.contentEditable = 'false'
      let current = node
      const render = () => {
        dom.replaceChildren()
        const title = document.createElement('div')
        title.className = 'toc-title'
        title.setAttribute('data-page-unit', '')
        title.textContent = String(current.attrs.title || '')
        const update = document.createElement('button')
        update.type = 'button'
        update.className = 'toc-update'
        update.textContent = t('Update table')
        update.addEventListener('mousedown', (e) => e.preventDefault())
        update.addEventListener('click', () => {
          if (editor.isEditable) refresh(editor.view, options)
        })
        title.append(update)
        dom.append(title)
        const entries = (current.attrs.entries ?? []) as TocEntry[]
        if (!entries.length) {
          const empty = document.createElement('div')
          empty.className = 'toc-empty'
          empty.setAttribute('data-page-unit', '')
          empty.textContent = t('No headings yet: use the Heading styles and update the table.')
          dom.append(empty)
        }
        entries.forEach((entry, index) => {
          const row = document.createElement('div')
          row.className = `toc-entry toc-l${entry.level}`
          row.setAttribute('data-page-unit', '')
          const link = document.createElement('a')
          link.className = 'toc-link'
          link.href = `#toc-${index}`
          link.setAttribute('data-toc-target', String(index))
          const text = document.createElement('span')
          text.className = 'toc-text'
          text.textContent = entry.text
          const leader = document.createElement('span')
          leader.className = 'toc-leader'
          const page = document.createElement('span')
          page.className = 'toc-page'
          page.textContent = entry.page ? String(entry.page) : ''
          link.append(text, leader, page)
          link.addEventListener('mousedown', (e) => e.preventDefault())
          link.addEventListener('click', (e) => {
            e.preventDefault()
            goToHeading(editor, Number(current.attrs.maxLevel) || 3, index)
          })
          row.append(link)
          dom.append(row)
        })
      }
      render()
      return {
        dom,
        update: (next) => {
          if (next.type !== current.type) return false
          if (next.attrs !== current.attrs && JSON.stringify(next.attrs) !== JSON.stringify(current.attrs)) {
            current = next
            render()
          } else current = next
          return true
        },
        ignoreMutation: () => true,
        stopEvent: (e) => (e.target as HTMLElement).closest?.('button, a') != null && e.type !== 'dragstart',
        selectNode: () => dom.classList.add('ProseMirror-selectednode'),
        deselectNode: () => dom.classList.remove('ProseMirror-selectednode'),
        destroy: () => void getPos,
      }
    }
  },
  addProseMirrorPlugins() {
    const options = this.options
    const editor = this.editor
    let timer = 0
    return [
      new Plugin({
        key: tocKey,
        state: {
          init: () => false,
          apply: (tr, dirty) => {
            if (tr.getMeta(tocKey)) return false
            if (!tr.docChanged) return dirty
            // Remote changes (Yjs) are left to the collaborator who made them.
            const sync = tr.getMeta(ySyncPluginKey) as { isChangeOrigin?: boolean; isUndoRedoOperation?: boolean } | undefined
            return sync?.isChangeOrigin && !sync.isUndoRedoOperation ? dirty : true
          },
        },
        view: () => ({
          update: (view) => {
            if (!tocKey.getState(view.state)) return
            clearTimeout(timer)
            timer = window.setTimeout(() => {
              if (!view.dom.isConnected || !editor.isEditable) return
              let any = false
              view.state.doc.descendants((node) => {
                if (node.type.name === 'tableOfContents') any = true
                return !any && !node.isAtom
              })
              // Clears the dirty flag even when nothing changed.
              if (!any || !refresh(view, options)) view.dispatch(view.state.tr.setMeta(tocKey, true).setMeta('addToHistory', false))
            }, UPDATE_DELAY)
          },
          destroy: () => clearTimeout(timer),
        }),
      }),
    ]
  },
})

// Moves the cursor to the index-th heading listed by a table of contents.
export function goToHeading(editor: Editor, maxLevel: number, index: number): void {
  const target = tocHeadings(editor.state.doc, maxLevel)[index]
  if (!target) return
  const { view } = editor
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, target.pos + 1)).scrollIntoView())
  const dom = view.nodeDOM(target.pos)
  if (dom instanceof HTMLElement) dom.scrollIntoView({ block: 'start', behavior: 'smooth' })
  view.focus()
}
