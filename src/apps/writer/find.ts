// Find & replace: highlights matches with decorations and drives a small panel.

import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { t } from '../../core/i18n'

interface Match {
  from: number
  to: number
}

interface FindState {
  query: string
  caseSensitive: boolean
  matches: Match[]
  current: number
}

const findKey = new PluginKey<FindState>('find')
const EMPTY: FindState = { query: '', caseSensitive: false, matches: [], current: -1 }

export const Find = Extension.create({
  name: 'find',
  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: findKey,
        state: {
          init: () => EMPTY,
          apply(tr, value) {
            const meta = tr.getMeta(findKey) as Partial<FindState> | undefined
            if (!meta && !tr.docChanged) return value
            const next = { ...value, ...meta }
            const matches = next.query ? search(tr.doc, next.query, next.caseSensitive) : []
            let current = next.current
            if (!meta || meta.query !== undefined) {
              // Keep the current match near the selection after edits or a new query.
              current = matches.findIndex((m) => m.from >= tr.selection.from)
              if (current < 0) current = matches.length ? 0 : -1
            }
            return { ...next, matches, current: Math.min(current, matches.length - 1) }
          },
        },
        props: {
          decorations(state) {
            const s = findKey.getState(state)
            if (!s?.matches.length) return null
            return DecorationSet.create(
              state.doc,
              s.matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === s.current ? 'find-match current' : 'find-match' })),
            )
          },
        },
      }),
    ]
  },
})

function search(doc: PMNode, query: string, caseSensitive: boolean): Match[] {
  const matches: Match[] = []
  const needle = caseSensitive ? query : query.toLowerCase()
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    // Map text offsets back to document positions (inline atoms count as one char).
    let text = ''
    const positions: number[] = []
    node.forEach((child, offset) => {
      const start = pos + 1 + offset
      if (child.isText) {
        for (let i = 0; i < child.text!.length; i++) positions.push(start + i)
        text += child.text
      } else {
        positions.push(start)
        text += '￼'
      }
    })
    const haystack = caseSensitive ? text : text.toLowerCase()
    let index = haystack.indexOf(needle)
    while (index >= 0 && needle) {
      matches.push({ from: positions[index], to: positions[index + needle.length - 1] + 1 })
      index = haystack.indexOf(needle, index + needle.length)
    }
    return false
  })
  return matches
}

export function setupFindPanel(editor: Editor, panel: HTMLElement): { open: (replace?: boolean) => void } {
  const findInput = panel.querySelector<HTMLInputElement>('[data-find]')!
  const replaceInput = panel.querySelector<HTMLInputElement>('[data-replace]')!
  const count = panel.querySelector<HTMLElement>('[data-count]')!
  const caseBox = panel.querySelector<HTMLInputElement>('[data-case]')!
  const replaceRow = panel.querySelector<HTMLElement>('[data-replace-row]')!

  const state = () => findKey.getState(editor.state) ?? EMPTY
  const setMeta = (meta: Partial<FindState>) => editor.view.dispatch(editor.state.tr.setMeta(findKey, meta).setMeta('addToHistory', false))

  const render = () => {
    const s = state()
    count.textContent = s.query ? (s.matches.length ? t('{current} of {total}', { current: s.current + 1, total: s.matches.length }) : t('No results')) : ''
  }

  const reveal = () => {
    const s = state()
    const match = s.matches[s.current]
    if (!match) return
    const { view } = editor
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, match.from, match.to)).scrollIntoView())
    view.domAtPos(match.from).node.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  const step = (dir: 1 | -1) => {
    const s = state()
    if (!s.matches.length) return
    setMeta({ current: (s.current + dir + s.matches.length) % s.matches.length })
    reveal()
    render()
  }

  const update = () => {
    setMeta({ query: findInput.value, caseSensitive: caseBox.checked })
    render()
  }

  findInput.addEventListener('input', update)
  caseBox.addEventListener('change', update)
  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      step(e.shiftKey ? -1 : 1)
    }
  })
  panel.querySelector('[data-next]')!.addEventListener('click', () => step(1))
  panel.querySelector('[data-prev]')!.addEventListener('click', () => step(-1))
  panel.querySelector('[data-replace-one]')!.addEventListener('click', () => {
    if (!editor.isEditable) return
    const s = state()
    const match = s.matches[s.current]
    if (!match) return
    editor.chain().insertContentAt({ from: match.from, to: match.to }, replaceInput.value).run()
    render()
    reveal()
  })
  panel.querySelector('[data-replace-all]')!.addEventListener('click', () => {
    if (!editor.isEditable) return
    const s = state()
    if (!s.matches.length) return
    const { tr } = editor.state
    // Replace from the end so earlier positions stay valid.
    for (const m of [...s.matches].reverse()) {
      if (replaceInput.value) tr.insertText(replaceInput.value, m.from, m.to)
      else tr.delete(m.from, m.to)
    }
    editor.view.dispatch(tr)
    render()
  })
  const close = () => {
    panel.hidden = true
    setMeta({ query: '' })
    editor.commands.focus()
  }
  panel.querySelector('[data-close]')!.addEventListener('click', close)
  panel.addEventListener('keydown', (e) => e.key === 'Escape' && close())
  editor.on('transaction', render)

  return {
    open(replace = false) {
      panel.hidden = false
      // Viewers and commenters only get Find (Ctrl+H and the toolbar included).
      replaceRow.hidden = !replace || !editor.isEditable
      const { from, to } = editor.state.selection
      const selected = editor.state.doc.textBetween(from, to, ' ')
      if (selected && selected.length < 100) findInput.value = selected
      findInput.focus()
      findInput.select()
      update()
    },
  }
}
