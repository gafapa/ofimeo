// Citation (inline atom) and bibliography (block atom) nodes. Their text is
// formatted from the document's source list and citation style, which the app
// keeps in `references` (setReferences); views re-render when either changes
// or when the set of cited sources changes.

import { Node, mergeAttributes, type JSONContent } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { citationText, formatBibliography, yearSuffixes } from './format'
import { DEFAULT_CITE, type CitationRef, type CiteSettings, type Run, type Source } from './types'
import { t } from '../../../core/i18n'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    references: {
      insertCitation: (ref: CitationRef) => ReturnType
      insertBibliography: (title?: string) => ReturnType
    }
  }
}

// State shared by all views of the document being edited.
export interface ReferenceState {
  sources: Map<string, Source>
  settings: CiteSettings
  cited: string[]
  suffixes: Map<string, string>
}

export const references: ReferenceState = { sources: new Map(), settings: DEFAULT_CITE, cited: [], suffixes: new Map() }
const listeners = new Set<() => void>()

function recompute() {
  const cited = references.cited.map((id) => references.sources.get(id)).filter((s): s is Source => !!s)
  references.suffixes = yearSuffixes(cited, references.settings)
  listeners.forEach((fn) => fn())
}

export function setReferences(sources: Source[], settings: CiteSettings): void {
  references.sources = new Map(sources.map((s) => [s.id, s]))
  references.settings = settings
  recompute()
}

// Source ids in citation order (first citation first), without repeats.
export function citedIds(doc: PMNode): string[] {
  const out: string[] = []
  doc.descendants((node) => {
    if (node.type.name === 'citation') for (const id of idsOf(node.attrs.ids)) if (!out.includes(id)) out.push(id)
    return true
  })
  return out
}

export function citedIdsJSON(body: JSONContent): string[] {
  const out: string[] = []
  const walk = (n: JSONContent) => {
    if (n.type === 'citation') for (const id of idsOf(n.attrs?.ids)) if (!out.includes(id)) out.push(id)
    n.content?.forEach(walk)
  }
  walk(body)
  return out
}

export function idsOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string' && value) return value.split(/[\s,]+/).filter(Boolean)
  return []
}

export function currentCitationText(attrs: Record<string, unknown>): string {
  return citationText({ ids: idsOf(attrs.ids), locator: String(attrs.locator ?? '') }, references.sources, references.settings, references.suffixes)
}

export function runsHtml(runs: Run[]): DocumentFragment {
  const frag = document.createDocumentFragment()
  for (const r of runs) {
    if (r.italic) {
      const i = document.createElement('i')
      i.textContent = r.text
      frag.append(i)
    } else frag.append(r.text)
  }
  return frag
}

export const Citation = Node.create({
  name: 'citation',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({
    ids: {
      default: [],
      parseHTML: (el) => idsOf(el.getAttribute('data-ids')),
      renderHTML: (attrs) => ({ 'data-ids': idsOf(attrs.ids).join(' ') }),
    },
    locator: {
      default: '',
      parseHTML: (el) => el.getAttribute('data-locator') ?? '',
      renderHTML: (attrs) => (attrs.locator ? { 'data-locator': attrs.locator } : {}),
    },
  }),
  parseHTML: () => [{ tag: 'span[data-citation]' }],
  renderHTML: ({ node, HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { 'data-citation': '', class: 'citation' }), currentCitationText(node.attrs)],
  addCommands() {
    return {
      insertCitation:
        (ref) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { ids: ref.ids, locator: ref.locator ?? '' } }),
      insertBibliography:
        (title) =>
        ({ commands }) =>
          commands.insertContent([
            ...(title ? [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: title }] }] : []),
            { type: 'bibliography' },
            { type: 'paragraph' },
          ]),
    }
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span')
      dom.className = 'citation'
      dom.setAttribute('data-citation', '')
      let current = node
      const render = () => {
        dom.textContent = currentCitationText(current.attrs)
        dom.title = idsOf(current.attrs.ids)
          .map((id) => references.sources.get(id)?.title ?? t('Missing source'))
          .join('\n')
      }
      render()
      listeners.add(render)
      return {
        dom,
        update: (next) => {
          if (next.type !== current.type) return false
          current = next
          render()
          return true
        },
        ignoreMutation: () => true,
        destroy: () => listeners.delete(render),
      }
    }
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('citations'),
        view: (view) => {
          references.cited = citedIds(view.state.doc)
          recompute()
          return {
            update: (v, prev) => {
              if (prev.doc.eq(v.state.doc)) return
              const cited = citedIds(v.state.doc)
              if (cited.join('\u0001') === references.cited.join('\u0001')) return
              references.cited = cited
              recompute()
            },
          }
        },
      }),
    ]
  },
})

// Entries of the reference list for the current state (cited sources, sorted).
export function bibliographyEntries(): { id: string; runs: Run[] }[] {
  const cited = references.cited.map((id) => references.sources.get(id)).filter((s): s is Source => !!s)
  return formatBibliography(cited, references.settings)
}

export const Bibliography = Node.create({
  name: 'bibliography',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML: () => [{ tag: 'div[data-bibliography]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'div',
    mergeAttributes(HTMLAttributes, { 'data-bibliography': '', class: 'bibliography' }),
    ...bibliographyEntries().map((e) => ['p', { class: 'bib-entry' }, ...e.runs.map((r) => (r.italic ? ['i', {}, r.text] : r.text))]),
  ] as never,
  addNodeView() {
    return () => {
      const dom = document.createElement('div')
      dom.className = 'bibliography'
      dom.setAttribute('data-bibliography', '')
      dom.setAttribute('data-page-split', '')
      dom.contentEditable = 'false'
      const render = () => {
        dom.replaceChildren()
        const entries = bibliographyEntries()
        if (!entries.length) {
          const empty = document.createElement('p')
          empty.className = 'bib-empty'
          empty.setAttribute('data-page-unit', '')
          empty.textContent = t('No citations yet: insert citations and the bibliography lists their sources.')
          dom.append(empty)
        }
        for (const e of entries) {
          const p = document.createElement('p')
          p.className = 'bib-entry'
          p.setAttribute('data-page-unit', '')
          p.append(runsHtml(e.runs))
          dom.append(p)
        }
      }
      render()
      listeners.add(render)
      return {
        dom,
        update: (next) => next.type.name === 'bibliography',
        ignoreMutation: () => true,
        selectNode: () => dom.classList.add('ProseMirror-selectednode'),
        deselectNode: () => dom.classList.remove('ProseMirror-selectednode'),
        destroy: () => listeners.delete(render),
      }
    }
  },
})
