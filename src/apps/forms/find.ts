// Edit ▸ Find (Ctrl+F) in the form editor: searches the text of the open tab,
// including the question fields (titles, options, descriptions), and selects
// each match in turn.

import { ChevronDown, ChevronUp, X } from 'lucide'
import { t } from '../../core/i18n'
import { el, icon } from '../../ui/widgets'

type Match = { field: HTMLInputElement | HTMLTextAreaElement; start: number } | { node: Text; start: number }

export function createFindBar(scope: HTMLElement): { element: HTMLElement; open: () => void } {
  const input = el('input', { type: 'search', class: 'fm-find-input', placeholder: t('Find in the form') })
  input.setAttribute('aria-label', t('Find in the form'))
  const count = el('span', { class: 'fm-find-count' })
  count.setAttribute('aria-live', 'polite')
  const bar = el('div', { class: 'fm-find', hidden: true, role: 'search' })
  let matches: Match[] = []
  let index = -1

  const search = () => {
    const q = input.value.toLocaleLowerCase()
    matches = []
    if (q) {
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n instanceof HTMLInputElement || n instanceof HTMLTextAreaElement) {
          if (n instanceof HTMLInputElement && !['text', 'search', ''].includes(n.type)) continue
          const text = n.value.toLocaleLowerCase()
          for (let i = text.indexOf(q); i >= 0; i = text.indexOf(q, i + q.length)) matches.push({ field: n, start: i })
        } else if (n instanceof Text && n.parentElement?.closest('select, option, button, script, style') == null) {
          const text = (n.nodeValue ?? '').toLocaleLowerCase()
          for (let i = text.indexOf(q); i >= 0; i = text.indexOf(q, i + q.length)) matches.push({ node: n, start: i })
        }
      }
    }
    index = matches.length ? 0 : -1
    show(false)
  }

  const show = (focusMatch = true) => {
    count.textContent = matches.length ? t('{n} of {m}', { n: index + 1, m: matches.length }) : input.value ? t('No results') : ''
    const m = matches[index]
    if (!m) return
    const length = input.value.length
    if ('field' in m) {
      m.field.scrollIntoView({ block: 'center' })
      if (focusMatch) {
        m.field.focus()
        m.field.setSelectionRange(m.start, m.start + length)
      }
    } else {
      m.node.parentElement?.scrollIntoView({ block: 'center' })
      const range = document.createRange()
      range.setStart(m.node, m.start)
      range.setEnd(m.node, Math.min(m.start + length, m.node.length))
      const selection = getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
  }

  const step = (dir: number) => {
    if (!matches.length) return search()
    index = (index + dir + matches.length) % matches.length
    show()
  }
  const close = () => {
    bar.hidden = true
    matches = []
  }
  const button = (node: typeof X, label: string, run: () => void) => {
    const b = el('button', { type: 'button', class: 'fm-find-btn', title: label }, icon(node, 16))
    b.setAttribute('aria-label', label)
    b.addEventListener('click', run)
    return b
  }
  let timer = 0
  input.addEventListener('input', () => {
    clearTimeout(timer)
    timer = window.setTimeout(search, 150)
  })
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      step(e.shiftKey ? -1 : 1)
    }
    if (e.key === 'Escape') close()
  })
  bar.append(input, count, button(ChevronUp, t('Previous'), () => step(-1)), button(ChevronDown, t('Next'), () => step(1)), button(X, t('Close'), close))
  return {
    element: bar,
    open: () => {
      bar.hidden = false
      input.focus()
      input.select()
      if (input.value) search()
    },
  }
}
