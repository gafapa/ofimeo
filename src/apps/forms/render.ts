// Renders questions as answerable controls (respondent view and editor preview).

import { t } from '../../core/i18n'
import { renderEquation } from '../../ui/equation'
import { el } from '../../ui/widgets'
import { hasOptions, type Answer, type Item } from './model'

// Deterministic shuffle (same order for a respondent across reloads).
export function shuffled<T>(list: T[], seed: string): T[] {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// Image and equation of an item.
export function itemMedia(item: Item): HTMLElement | null {
  if (!item.image && !item.equation) return null
  const box = el('div', { class: 'fm-media' })
  if (item.image) box.append(el('img', { src: item.image, alt: item.title || t('Image'), class: 'fm-image' }))
  if (item.equation) {
    const eq = el('div', { class: 'fm-equation' })
    renderEquation(eq, item.equation, true)
    box.append(eq)
  }
  return box
}

export interface ControlOptions {
  seed: string
  disabled?: boolean
}

// The input for one question; calls onChange with the new answer (undefined when cleared).
export function answerControl(item: Item, value: Answer | undefined, onChange: (v: Answer | undefined) => void, options: ControlOptions): HTMLElement {
  const name = `q-${item.id}-${options.seed}`
  const disabled = !!options.disabled
  const opts = hasOptions(item.type) && item.shuffle ? shuffled(item.options, options.seed + item.id) : item.options
  const label = t('Answer to “{question}”', { question: item.title || t('Untitled question') })
  switch (item.type) {
    case 'short':
    case 'paragraph': {
      const input = item.type === 'short' ? el('input', { class: 'field', value: String(value ?? ''), disabled }) : el('textarea', { class: 'field', rows: 4, value: String(value ?? ''), disabled })
      input.setAttribute('aria-label', label)
      input.placeholder = item.type === 'short' ? t('Your answer') : t('Your answer (you can write several lines)')
      input.addEventListener('input', () => onChange(input.value.trim() ? input.value : undefined))
      return input
    }
    case 'number': {
      const input = el('input', { class: 'field fm-number', type: 'text', inputMode: 'decimal', value: value === undefined ? '' : String(value), disabled })
      input.setAttribute('aria-label', label)
      input.placeholder = t('Number')
      input.addEventListener('input', () => {
        const n = Number(input.value.replace(',', '.'))
        input.classList.toggle('invalid', !!input.value.trim() && Number.isNaN(n))
        onChange(input.value.trim() && !Number.isNaN(n) ? n : undefined)
      })
      return input
    }
    case 'date':
    case 'time': {
      const input = el('input', { class: 'field fm-date', type: item.type, value: String(value ?? ''), disabled })
      input.setAttribute('aria-label', label)
      input.addEventListener('input', () => onChange(input.value || undefined))
      return input
    }
    case 'dropdown': {
      const select = el('select', { class: 'field fm-select', disabled }, el('option', { value: '', textContent: t('Choose') }), ...opts.map((o) => el('option', { value: o.id, textContent: o.label })))
      select.setAttribute('aria-label', label)
      select.value = String(value ?? '')
      select.addEventListener('change', () => onChange(select.value || undefined))
      return select
    }
    case 'choice':
    case 'checkbox': {
      const multi = item.type === 'checkbox'
      const chosen = new Set(Array.isArray(value) ? value : value ? [String(value)] : [])
      const box = el('div', { class: 'fm-options', role: multi ? 'group' : 'radiogroup' })
      box.setAttribute('aria-label', label)
      for (const o of opts) {
        const input = el('input', { type: multi ? 'checkbox' : 'radio', name, value: o.id, checked: chosen.has(o.id), disabled })
        input.addEventListener('change', () => {
          if (multi) {
            if (input.checked) chosen.add(o.id)
            else chosen.delete(o.id)
            onChange(chosen.size ? opts.filter((x) => chosen.has(x.id)).map((x) => x.id) : undefined)
          } else onChange(o.id)
        })
        box.append(el('label', { class: 'fm-option' }, input, el('span', { textContent: o.label })))
      }
      if (!multi && !disabled) {
        const clear = el('button', { type: 'button', class: 'fm-link', textContent: t('Clear selection') })
        clear.addEventListener('click', () => {
          box.querySelectorAll('input').forEach((i) => (i.checked = false))
          onChange(undefined)
        })
        box.append(clear)
      }
      return box
    }
    case 'scale': {
      const box = el('div', { class: 'fm-scale', role: 'radiogroup' })
      box.setAttribute('aria-label', label)
      if (item.minLabel) box.append(el('span', { class: 'fm-scale-label', textContent: item.minLabel }))
      for (let v = item.min; v <= item.max; v++) {
        const input = el('input', { type: 'radio', name, value: String(v), checked: value === v, disabled })
        input.addEventListener('change', () => onChange(v))
        box.append(el('label', { class: 'fm-scale-point' }, el('span', { textContent: String(v) }), input))
      }
      if (item.maxLabel) box.append(el('span', { class: 'fm-scale-label', textContent: item.maxLabel }))
      return box
    }
    case 'grid': {
      const given: Record<string, string> = value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {}
      const table = el('table', { class: 'fm-grid' })
      table.append(el('tr', {}, el('th'), ...item.options.map((c) => el('th', { textContent: c.label }))))
      for (const r of item.rows) {
        const row = el('tr', {}, el('th', { scope: 'row', textContent: r.label }))
        for (const c of item.options) {
          const input = el('input', { type: 'radio', name: `${name}-${r.id}`, checked: given[r.id] === c.id, disabled })
          input.setAttribute('aria-label', `${r.label}: ${c.label}`)
          input.addEventListener('change', () => {
            given[r.id] = c.id
            onChange({ ...given })
          })
          row.append(el('td', {}, input))
        }
        table.append(row)
      }
      return el('div', { class: 'fm-grid-wrap' }, table)
    }
  }
}

// A question card: title (with required mark), description, media and control.
export function questionCard(item: Item, control: HTMLElement, extra?: HTMLElement | null): HTMLElement {
  const title = el('div', { class: 'fm-q-title' }, item.title || t('Untitled question'))
  if (item.required) {
    const star = el('span', { class: 'fm-required', textContent: ' *', title: t('Required') })
    star.setAttribute('aria-label', t('Required'))
    title.append(star)
  }
  return el(
    'section',
    { class: 'fm-card fm-question', dataset: { id: item.id } },
    title,
    item.description ? el('p', { class: 'fm-desc', textContent: item.description }) : null,
    itemMedia(item),
    control,
    extra ?? null,
  )
}

export function sectionCard(item: Item): HTMLElement {
  return el('section', { class: 'fm-card fm-section' }, el('h2', { textContent: item.title || t('Untitled section') }), item.description ? el('p', { class: 'fm-desc', textContent: item.description }) : null, itemMedia(item))
}

// Splits items into pages: every section starts a new page.
export function pages(items: Item[]): Item[][] {
  const out: Item[][] = [[]]
  for (const item of items) {
    if (item.kind === 'section' && out[out.length - 1].some((i) => i.kind === 'question')) out.push([])
    out[out.length - 1].push(item)
  }
  return out
}
