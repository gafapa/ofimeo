// File ▸ Print…: the form on paper, to answer by hand. Every question with
// blank space to write in or its choices to mark, without editor controls
// or the respondent page's buttons. Never shows the answer key.

import { t, tn } from '../../core/i18n'
import { el } from '../../ui/widgets'
import { questionCard, sectionCard } from './render'
import { readItems, readSettings, type Item } from './model'
import type * as Y from 'yjs'

const lines = (n: number, cls = 'fm-paper-line') => Array.from({ length: n }, () => el('div', { class: cls }))

function marks(labels: string[], box: boolean): HTMLElement {
  return el('ul', { class: 'fm-paper-options' }, ...labels.map((l) => el('li', {}, el('span', { class: box ? 'fm-paper-box' : 'fm-paper-circle' }), l)))
}

function answerSpace(item: Item): HTMLElement {
  switch (item.type) {
    case 'choice':
    case 'dropdown':
      return marks(item.options.map((o) => o.label), false)
    case 'checkbox':
      return el('div', {}, el('p', { class: 'fm-paper-hint', textContent: t('Mark all that apply') }), marks(item.options.map((o) => o.label), true))
    case 'paragraph':
      return el('div', { class: 'fm-paper-answer' }, ...lines(5))
    case 'scale': {
      const numbers: number[] = []
      for (let n = item.min; n <= item.max && numbers.length < 11; n++) numbers.push(n)
      const table = el('table', { class: 'fm-paper-scale' })
      table.append(
        el('tr', {}, el('td', {}), ...numbers.map((n) => el('td', { textContent: String(n) })), el('td', {})),
        el('tr', {}, el('td', { textContent: item.minLabel }), ...numbers.map(() => el('td', {}, el('span', { class: 'fm-paper-circle' }))), el('td', { textContent: item.maxLabel })),
      )
      return table
    }
    case 'grid': {
      const table = el('table', { class: 'fm-paper-grid' })
      table.append(el('tr', {}, el('th', {}), ...item.options.map((o) => el('th', { textContent: o.label }))))
      for (const row of item.rows) table.append(el('tr', {}, el('th', { textContent: row.label }), ...item.options.map(() => el('td', {}, el('span', { class: 'fm-paper-circle' })))))
      return table
    }
    default:
      // Short answer, number, date, time: one line.
      return el('div', { class: 'fm-paper-answer' }, ...lines(1))
  }
}

// The printable form (for a .fm-print container).
export function paperForm(doc: Y.Doc): HTMLElement {
  const settings = readSettings(doc)
  const items = readItems(doc)
  const title = String(doc.getMap('meta').get('title') || t('Untitled form'))
  const root = el('div', { class: 'fm-column fm-paper' })
  const header = el('section', { class: 'fm-card fm-header' }, el('h1', { textContent: title }))
  if (settings.description) header.append(el('p', { class: 'fm-desc', textContent: settings.description }))
  const who = el('div', { class: 'fm-paper-who' }, el('span', { textContent: t('Your name') }), el('span', { class: 'fm-paper-line' }))
  header.append(who)
  if (settings.collectGroup) header.append(el('div', { class: 'fm-paper-who' }, el('span', { textContent: t('Class or group') }), el('span', { class: 'fm-paper-line' })))
  root.append(header)
  let n = 0
  for (const item of items) {
    if (item.kind === 'section') {
      root.append(sectionCard(item))
      continue
    }
    n++
    const card = questionCard({ ...item, title: `${n}. ${item.title || t('Untitled question')}` }, answerSpace(item))
    if (settings.quiz && item.points) card.querySelector('.fm-q-title')?.append(el('span', { class: 'fm-paper-points', textContent: ` (${tn(item.points, '{n} point', '{n} points')})` }))
    root.append(card)
  }
  return root
}

// Printing (File ▸ Print… or the browser's own) shows the paper form instead of
// the editor.
export function setupPaperPrint(doc: Y.Doc): void {
  let box: HTMLElement | null = null
  window.addEventListener('beforeprint', () => {
    box?.remove()
    box = el('div', { class: 'fm-print' }, paperForm(doc))
    document.body.append(box)
    document.body.classList.add('fm-printing')
  })
  window.addEventListener('afterprint', () => {
    box?.remove()
    box = null
    document.body.classList.remove('fm-printing')
  })
}
