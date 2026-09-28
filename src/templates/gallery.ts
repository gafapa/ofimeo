// Template gallery on the home screen: filter by app, pick the content
// language (Spanish, Galician, English, French, German), click a card to create and open
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
const COLLAPSED_COUNT = 4
// Shown first: a varied set (a report, a presentation, a spreadsheet, a diagram).
const FEATURED = ['report', 'oral-presentation', 'timetable', 'concept-map']
const featuredFirst = (list: Template[]) => [...list].sort((a, b) => rank(a) - rank(b))
const rank = (tpl: Template) => (FEATURED.includes(tpl.id) ? FEATURED.indexOf(tpl.id) : FEATURED.length)

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved && saved in LANG_NAMES) return saved as Lang
  } catch {
    // Storage may be unavailable (private mode); fall back to the default.
  }
  // The interface language (every interface language has template content).
  return language
}

export function mountTemplates(container: HTMLElement): void {
  let lang = initialLang()
  let filter: DocType | 'all' = 'all'
  let expanded = false
  let busy = false

  const langSwitch = el('select', { class: 'tpl-lang-select' })
  langSwitch.setAttribute('aria-label', t('Template language'))
  langSwitch.append(
    ...(Object.entries(LANG_NAMES) as [Lang, string][]).map(([value, label]) => {
      const option = el('option', { value, textContent: label })
      option.lang = value
      return option
    }),
  )
  langSwitch.addEventListener('change', () => {
    lang = langSwitch.value as Lang
    try {
      localStorage.setItem(LANG_KEY, lang)
    } catch {
      // Not remembered; still applies to this page.
    }
    renderCards()
  })
  const renderLang = () => (langSwitch.value = lang)

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
    if (!expanded) filter = 'all'
    renderFilters()
    renderCards()
  })

  // Collapsed: four varied templates; the app filters and "My templates" (when
  // empty) appear with the whole gallery.
  const renderCards = () => {
    const inLang = TEMPLATES.filter((tpl) => tpl.langs.includes(lang))
    const collapsible = inLang.length > COLLAPSED_COUNT
    const open = expanded || !collapsible
    const list = featuredFirst(inLang.filter((tpl) => !open || filter === 'all' || tpl.app === filter))
    grid.replaceChildren(...(open ? list : list.slice(0, COLLAPSED_COUNT)).map((tpl) => card(tpl)))
    filters.hidden = !open || apps.length < 2
    more.hidden = !collapsible
    more.textContent = expanded ? t('Show fewer') : t('Show all templates ({count})', { count: inLang.length })
    mine.hidden = !open && !ownCount
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
  let ownCount = 0
  container.replaceChildren(
    el('div', { class: 'home-section-title' }, el('h2', { textContent: t('Templates') }), el('label', { class: 'tpl-lang-wrap' }, el('span', { class: 'tpl-lang-label', textContent: t('Content language') }), langSwitch)),
    ...(TEMPLATES.length ? [filters, grid, more] : []),
    mine,
  )
  // Own templates (File ▸ Save as template…).
  mountMyTemplates(mine, (count) => {
    ownCount = count
    renderCards()
  })
  renderLang()
  renderFilters()
  renderCards()
}
