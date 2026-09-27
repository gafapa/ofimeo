// Help center: a searchable dialog with the bundled help articles (offline,
// in the interface language; articles/<lang>.ts are separate chunks).
//
//   openHelp()                  opens the list (first article: Getting started)
//   openHelp('sharing')         opens an article (ids in articles/types.ts)
//   openHelp('writer', { session, shortcuts })   from an app's Help menu
//
// Dialogs link here with showDialog(title, body, buttons, wide, 'sharing') (the "?" button).

import { language, t, tn, type Language } from '../core/i18n'
import type { Session } from '../core/session'
import { legalLinks } from '../legal/links'
import { el, showDialog } from '../ui/widgets'
import { APP_ARTICLES, BASIC_ARTICLES, type Article, type ArticleId, type Articles } from './articles/types'
import './help.css'

export interface HelpContext {
  session?: Session
  // The app's keyboard shortcuts dialog (Help ▸ Keyboard shortcuts).
  shortcuts?: () => void
}

const loaders: Record<Language, () => Promise<{ default: Articles }>> = {
  en: () => import('./articles/en'),
  es: () => import('./articles/es'),
  gl: () => import('./articles/gl'),
  fr: () => import('./articles/fr'),
  de: () => import('./articles/de'),
}

export const loadArticles = async (): Promise<Articles> => (await loaders[language]()).default

const ALL: ArticleId[] = [...BASIC_ARTICLES, ...APP_ARTICLES]
export const isArticle = (id: string | undefined): id is ArticleId => !!id && (ALL as string[]).includes(id)

// Open help center: a second call shows the article in it.
let current: { show: (id: ArticleId) => void } | null = null

export async function openHelp(id?: string, context: HelpContext = {}): Promise<void> {
  const start: ArticleId = isArticle(id) ? id : 'getting-started'
  if (current) return current.show(start)
  const articles = await loadArticles()
  const view = helpView(articles, context, () => dialog?.close())
  current = view
  const shown = showDialog(t('Help center'), view.element, [{ label: t('Close'), value: 'ok', primary: true }], true)
  const dialog = view.element.closest('dialog')
  dialog?.classList.add('help-dialog')
  view.show(start, false)
  view.search.focus()
  await shown
  current = null
}

// ---------- Search ----------

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Article text without the markup, for searching and snippets.
export function plainText(body: string): string {
  return body
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^## (.*)$/gm, '$1 ·')
    .replace(/\*\*|`|^- |^\d+\. /gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface SearchHit {
  id: ArticleId
  score: number
  snippet: string
}

// Every word of the query must appear (in any order, ignoring case and accents).
export function searchArticles(articles: Articles, query: string): SearchHit[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const hits: SearchHit[] = []
  for (const id of ALL) {
    const a = articles[id]
    const text = plainText(a.body)
    const title = fold(a.title)
    const body = fold(text)
    const keys = fold(a.keywords ?? '')
    let score = 0
    let ok = true
    for (const w of words) {
      const s = (title.includes(w) ? 10 : 0) + (keys.includes(w) ? 4 : 0) + (body.includes(w) ? 1 : 0)
      if (!s) {
        ok = false
        break
      }
      score += s
    }
    if (ok) hits.push({ id, score, snippet: snippet(text, body, words) })
  }
  return hits.sort((a, b) => b.score - a.score || ALL.indexOf(a.id) - ALL.indexOf(b.id))
}

// About 140 characters of text around the first match (folding keeps the length for Latin text).
function snippet(text: string, folded: string, words: string[]): string {
  const at = Math.min(...words.map((w) => folded.indexOf(w)).filter((i) => i >= 0), Infinity)
  if (at === Infinity) return text.slice(0, 140) + (text.length > 140 ? '…' : '')
  const from = Math.max(0, text.lastIndexOf(' ', Math.max(0, at - 50)))
  const out = text.slice(from, from + 150).trim()
  return (from > 0 ? '…' : '') + out + (from + 150 < text.length ? '…' : '')
}

// Wraps the query words in <mark>.
function highlight(text: string, words: string[]): Node[] {
  const folded = fold(text)
  const marks: [number, number][] = []
  for (const w of words) for (let i = folded.indexOf(w); i >= 0; i = folded.indexOf(w, i + w.length)) marks.push([i, i + w.length])
  marks.sort((a, b) => a[0] - b[0])
  const out: Node[] = []
  let pos = 0
  for (const [a, b] of marks) {
    if (a < pos) continue
    out.push(document.createTextNode(text.slice(pos, a)), el('mark', { textContent: text.slice(a, b) }))
    pos = b
  }
  out.push(document.createTextNode(text.slice(pos)))
  return out
}

// ---------- View ----------

function helpView(articles: Articles, context: HelpContext, close: () => void) {
  const search = el('input', { type: 'search', class: 'field help-search-input', placeholder: t('Search help'), autocomplete: 'off' })
  search.setAttribute('aria-label', t('Search help'))
  search.setAttribute('aria-controls', 'help-nav')
  const status = el('p', { class: 'sr-only', role: 'status' })
  const nav = el('nav', { class: 'help-nav', id: 'help-nav' })
  nav.setAttribute('aria-label', t('Help articles'))
  const article = el('article', { class: 'help-article', tabIndex: -1 })
  const back = el('button', { type: 'button', class: 'help-back', textContent: `← ${t('All articles')}` })
  const panes = el('div', { class: 'help-panes' }, nav, el('div', { class: 'help-main' }, back, article))
  const element = el('div', { class: 'help-center' }, el('div', { class: 'help-search' }, search), status, panes)
  let selected: ArticleId = 'getting-started'

  const navButton = (id: ArticleId, extra?: Node[]) => {
    const b = el('button', { type: 'button', class: 'help-link', dataset: { id } }, el('span', { class: 'help-link-title', textContent: articles[id].title }), ...(extra ?? []))
    if (id === selected) b.setAttribute('aria-current', 'true')
    b.addEventListener('click', () => show(id))
    return el('li', {}, b)
  }

  const renderNav = () => {
    const query = search.value.trim()
    if (!query) {
      nav.replaceChildren(
        el('h3', { textContent: t('Basics') }),
        el('ul', {}, ...BASIC_ARTICLES.map((id) => navButton(id))),
        el('h3', { textContent: t('Apps') }),
        el('ul', {}, ...APP_ARTICLES.map((id) => navButton(id))),
      )
      status.textContent = ''
      return
    }
    const words = fold(query).split(/\s+/).filter(Boolean)
    const hits = searchArticles(articles, query)
    status.textContent = hits.length ? tn(hits.length, '{n} article found', '{n} articles found') : t('No articles match your search')
    nav.replaceChildren(
      hits.length
        ? el('ul', { class: 'help-results' }, ...hits.map((h) => navButton(h.id, [el('span', { class: 'help-snippet' }, ...highlight(h.snippet, words))])))
        : el('p', { class: 'hint help-empty', textContent: t('No articles match your search') }),
    )
  }

  const show = (id: ArticleId, focus = true) => {
    selected = id
    renderArticle(article, articles[id], { ...context, go: (next) => show(next), close })
    for (const b of nav.querySelectorAll<HTMLElement>('.help-link')) {
      if (b.dataset.id === id) b.setAttribute('aria-current', 'true')
      else b.removeAttribute('aria-current')
    }
    panes.classList.add('reading')
    article.scrollTop = 0
    if (focus) article.focus()
  }

  search.addEventListener('input', () => {
    renderNav()
    panes.classList.remove('reading')
  })
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const first = nav.querySelector<HTMLElement>('.help-link')
      if (first) show(first.dataset.id as ArticleId)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      nav.querySelector<HTMLElement>('.help-link')?.focus()
    }
  })
  nav.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const links = [...nav.querySelectorAll<HTMLElement>('.help-link')]
    const i = links.indexOf(document.activeElement as HTMLElement)
    if (i < 0) return
    e.preventDefault()
    if (e.key === 'ArrowUp' && i === 0) search.focus()
    else links[Math.min(links.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))].focus()
  })
  back.addEventListener('click', () => {
    panes.classList.remove('reading')
    nav.querySelector<HTMLElement>(`[data-id="${selected}"]`)?.focus()
  })
  renderNav()
  return { element, search, show }
}

// ---------- Article markup ----------

interface RenderContext extends HelpContext {
  go: (id: ArticleId) => void
  close: () => void
}

function renderArticle(target: HTMLElement, a: Article, ctx: RenderContext): void {
  const heading = el('h3', { class: 'help-title', textContent: a.title, id: 'help-article-title' })
  target.setAttribute('aria-labelledby', heading.id)
  target.replaceChildren(heading, ...renderBody(a.body, ctx))
}

export function renderBody(body: string, ctx: RenderContext): HTMLElement[] {
  const out: HTMLElement[] = []
  for (const block of body.split(/\n\s*\n/)) {
    const lines = block.split('\n').filter((l) => l.trim())
    if (!lines.length) continue
    if (lines[0].startsWith('## ')) {
      out.push(el('h4', {}, ...inline(lines[0].slice(3), ctx)))
      lines.shift()
      if (!lines.length) continue
    }
    const bullets = lines.every((l) => l.startsWith('- '))
    const numbers = lines.every((l) => /^\d+\. /.test(l))
    if (bullets || numbers) {
      out.push(el(bullets ? 'ul' : 'ol', {}, ...lines.map((l) => el('li', {}, ...inline(l.replace(/^(- |\d+\. )/, ''), ctx)))))
    } else {
      // A paragraph, optionally followed by a list.
      const i = lines.findIndex((l) => l.startsWith('- '))
      const text = i < 0 ? lines : lines.slice(0, i)
      out.push(el('p', {}, ...inline(text.join(' '), ctx)))
      if (i >= 0) out.push(el('ul', {}, ...lines.slice(i).map((l) => el('li', {}, ...inline(l.replace(/^- /, ''), ctx)))))
    }
  }
  return out
}

function inline(text: string, ctx: RenderContext): Node[] {
  const out: Node[] = []
  const re = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([a-z]+):([\w-]+)\)/g
  let pos = 0
  for (const m of text.matchAll(re)) {
    out.push(document.createTextNode(text.slice(pos, m.index)))
    if (m[1] !== undefined) out.push(el('strong', {}, ...inline(m[1], ctx)))
    else if (m[2] !== undefined) out.push(el('kbd', { textContent: m[2] }))
    else out.push(link(m[3], m[4], m[5], ctx))
    pos = m.index! + m[0].length
  }
  out.push(document.createTextNode(text.slice(pos)))
  return out
}

function link(label: string, kind: string, target: string, ctx: RenderContext): Node {
  if (kind === 'help' && isArticle(target)) {
    const a = el('a', { href: '#', textContent: label, class: 'help-internal' })
    a.addEventListener('click', (e) => {
      e.preventDefault()
      ctx.go(target)
    })
    return a
  }
  if (kind === 'legal') {
    const page = legalLinks().find((l) => l.id === target)
    return page ? el('a', { href: page.href, textContent: label, target: '_blank', rel: 'noopener' }) : document.createTextNode(label)
  }
  if (kind === 'action') {
    const b = el('button', { type: 'button', class: 'help-action', textContent: label })
    b.addEventListener('click', () => {
      ctx.close()
      // After the help dialog has closed (keyboard shortcuts are ignored while a dialog is open).
      setTimeout(() => void runAction(target, ctx), 0)
    })
    return b
  }
  return document.createTextNode(label)
}

async function runAction(name: string, ctx: HelpContext): Promise<void> {
  switch (name) {
    case 'storage':
      return (await import('../home/storage')).openStorageDialog()
    case 'nextcloud':
      return void (await import('../ui/nextcloud')).openAccountDialog()
    case 'connection':
      return (await import('../ui/menus')).openConnectionTest(ctx.session)
    case 'shortcuts':
      return ctx.shortcuts ? ctx.shortcuts() : (await import('../ui/shortcuts')).showShortcuts()
    case 'accessibility':
      return (await import('../ui/accessibility')).togglePanel(true)
    case 'tour':
      return (await import('./tour')).showWelcomeTour()
    case 'moodle':
      return void (await import('../ui/moodle')).openMoodleDialog()
    case 'admin':
      return (await import('../ui/admin-config')).openConfigGenerator()
  }
}

// Help article of the app a session belongs to.
export const appArticle = (session?: Session): ArticleId => (session && isArticle(session.type) ? session.type : 'getting-started')
