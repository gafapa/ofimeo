// Template gallery on the home screen: filter by app, pick the content
// language (Spanish, Galician, French, German), click a card to create and open
// the document. Templates tied to Spanish regulations exist in Spanish and
// Galician only and are hidden for the other content languages.

import { appInfo } from '../apps/registry'
import { language, t } from '../core/i18n'
import type { DocType } from '../core/store'
import { el, toast } from '../ui/widgets'
import { mountMyTemplates } from '../home/my-templates'
import { TEMPLATES as CATALOG } from './catalog'
import { appHidden, templateAllowed } from '../core/school-config'
import { LANG_NAMES, type Lang, type Template } from './types'
import './gallery.css'

// The school configuration can choose the templates (features.templates) and hide apps.
const TEMPLATES = CATALOG.filter((tpl) => templateAllowed(tpl.id) && !appHidden(tpl.app))

const LANG_KEY = 'wo-template-lang'
const COLLAPSED_COUNT = 8

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved && saved in LANG_NAMES) return saved as Lang
  } catch {
    // Storage may be unavailable (private mode); fall back to the default.
  }
  // The interface language; with the English interface, the first content
  // language the browser prefers, else Spanish.
  if (language !== 'en') return language
  const code = (navigator.languages ?? [navigator.language]).map((l) => l.toLowerCase().slice(0, 2)).find((l) => l in LANG_NAMES)
  return (code as Lang | undefined) ?? 'es'
}

export function mountTemplates(container: HTMLElement): void {
  let lang = initialLang()
  let filter: DocType | 'all' = 'all'
  let expanded = false
  let busy = false

  const langSwitch = el('div', { class: 'tpl-lang', role: 'radiogroup' })
  langSwitch.setAttribute('aria-label', t('Template language'))
  const renderLang = () =>
    langSwitch.replaceChildren(
      ...(Object.entries(LANG_NAMES) as [Lang, string][]).map(([value, label]) => {
        const b = el('button', { type: 'button', class: lang === value ? 'active' : '', textContent: label })
        b.setAttribute('role', 'radio')
        b.setAttribute('aria-checked', String(lang === value))
        b.lang = value
        b.addEventListener('click', () => {
          lang = value
          try {
            localStorage.setItem(LANG_KEY, value)
          } catch {
            // Not remembered; still applies to this page.
          }
          renderLang()
          renderCards()
        })
        return b
      }),
    )

  const apps = [...new Set(TEMPLATES.map((tpl) => tpl.app))]
  const filters = el('div', { class: 'home-filters tpl-filters', role: 'tablist' })
  filters.setAttribute('aria-label', t('Filter templates by app'))
  const renderFilters = () =>
    filters.replaceChildren(
      ...(['all', ...apps] as (DocType | 'all')[]).map((value) => {
        const label = value === 'all' ? t('All') : appInfo(value).plural
        const b = el('button', { type: 'button', class: `chip${filter === value ? ' active' : ''}`, textContent: label })
        b.setAttribute('role', 'tab')
        b.setAttribute('aria-selected', String(filter === value))
        b.addEventListener('click', () => {
          filter = value
          renderFilters()
          renderCards()
        })
        return b
      }),
    )

  const grid = el('div', { class: 'tpl-grid', role: 'list' })
  const more = el('button', { type: 'button', class: 'tpl-more' })
  more.addEventListener('click', () => {
    expanded = !expanded
    renderCards()
  })

  const renderCards = () => {
    const list = TEMPLATES.filter((tpl) => tpl.langs.includes(lang) && (filter === 'all' || tpl.app === filter))
    const collapsible = filter === 'all' && list.length > COLLAPSED_COUNT
    const shown = collapsible && !expanded ? list.slice(0, COLLAPSED_COUNT) : list
    grid.replaceChildren(...shown.map((tpl) => card(tpl)))
    more.hidden = !collapsible
    more.textContent = expanded ? t('Show fewer') : t('Show all templates ({count})', { count: list.length })
  }

  const card = (tpl: Template): HTMLElement => {
    const app = appInfo(tpl.app)
    const thumb = el('span', { class: 'tpl-thumb' })
    thumb.innerHTML = tpl.thumb()
    const badge = el('span', { class: 'tpl-app' }, el('span', { class: 'app-icon small', textContent: app.letter }), el('span', { textContent: app.name }))
    ;(badge.firstChild as HTMLElement).style.background = app.color
    const button = el(
      'button',
      { type: 'button', class: 'tpl-card', title: tpl.description[lang] },
      thumb,
      el('span', { class: 'tpl-name', textContent: tpl.name[lang] }),
      el('span', { class: 'tpl-desc', textContent: tpl.description[lang] }),
      badge,
    )
    button.lang = lang
    button.setAttribute('role', 'listitem')
    button.addEventListener('click', async () => {
      if (busy) return
      busy = true
      button.classList.add('busy')
      button.setAttribute('aria-busy', 'true')
      toast(t('Creating “{name}”…', { name: tpl.name[lang] ?? '' }))
      try {
        location.href = await tpl.create(lang)
      } catch (err) {
        toast(t('Could not create the document: {error}', { error: (err as Error).message }))
        button.classList.remove('busy')
        button.removeAttribute('aria-busy')
        busy = false
      }
    })
    return button
  }

  const mine = el('div', { class: 'my-templates' })
  container.replaceChildren(
    el('div', { class: 'home-section-title' }, el('h2', { textContent: t('Templates') }), el('span', { class: 'tpl-lang-wrap' }, el('span', { class: 'tpl-lang-label', textContent: t('Content language') }), langSwitch)),
    ...(TEMPLATES.length ? [filters, grid, more] : []),
    mine,
  )
  // Own templates (File ▸ Save as template…).
  mountMyTemplates(mine)
  renderLang()
  renderFilters()
  renderCards()
}
