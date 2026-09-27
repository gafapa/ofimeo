// "Spelling and grammar" dialog (F7) for the apps whose text lives in many
// small pieces (cells, labels, notes, questions): walks through the issues one
// by one, piece after piece, starting at the current one, like the word
// processor's dialog (src/apps/writer/spell/dialog.ts). It is not modal, so the
// document stays usable while it is open.

import { t } from '../../core/i18n'
import type { CheckResult } from '../../core/spell/client'
import { LANGS, type Issue, type Lang, type Paragraph } from '../../core/spell/types'
import { dictOf, VARIANTS, variantOf } from '../../core/spell/variants'
import { el } from '../widgets'
import { describe, kindLabel, langName, showReplacement } from './describe'
import { addToDictionary, checkParagraphs, disableRule, isPersonal, onSpellChange, suggest, type DocLanguage } from './service'
import './spell.css'

// A piece of text to check: a cell, a label, a note, a question…
export interface SpellItem {
  // Unique among the items (used to remember "Ignore").
  key: string
  // Where it is, shown in the dialog: "Sheet1 · B3", "Slide 2 · Notes".
  label: string
  text: string
  // A regional variant tag when it differs from the document's.
  lang?: string
  context?: Paragraph['context']
}

export interface SpellSource {
  // Every item, in document order. Called again after each change.
  items(): SpellItem[]
  // Index of the item to start from (the selected cell, the current slide).
  start?(items: SpellItem[]): number
  // Shows the item (selects the cell, opens the slide); from/to are offsets in its text.
  reveal(item: SpellItem, from: number, to: number): void
  // Where the flagged text is on screen, to outline it while the dialog has the focus.
  rects?(item: SpellItem, from: number, to: number): DOMRect[]
  // Replaces text[from, to) of the item; false when it could not be changed.
  replace(item: SpellItem, from: number, to: number, text: string): boolean
  editable(): boolean
  language: DocLanguage
  // Called when the dialog closes (to give the focus back).
  close?(): void
}

interface Found {
  item: SpellItem
  index: number
  issue: Issue
  lang: Lang
  dict: string
  // The flagged text.
  text: string
  from: number
  to: number
}

let open: { dialog: HTMLDialogElement; source: SpellSource } | null = null

export function isSpellingDialogOpen(): boolean {
  return !!open
}

export function openSpellingDialog(source: SpellSource): void {
  if (open) {
    open.dialog.querySelector<HTMLElement>('select, button')?.focus()
    return
  }
  const dialog = el('dialog', { class: 'spell-dialog' })
  dialog.setAttribute('aria-labelledby', 'spell-dialog-title')
  open = { dialog, source }

  const lang = el('select', { class: 'spell-lang', title: t('Document language') })
  for (const l of LANGS) {
    const group = el('optgroup', { label: langName(l) })
    for (const v of VARIANTS) if (v.lang === l) group.append(new Option(v.name, v.tag, false, v.tag === source.language.tag()))
    lang.append(group)
  }
  lang.disabled = !source.editable()
  lang.addEventListener('change', () => {
    source.language.set(lang.value)
    cache.clear()
    restart()
  })
  const close = el('button', { type: 'button', class: 'spell-close', textContent: '✕', title: t('Close') })
  close.setAttribute('aria-label', t('Close'))
  const where = el('div', { class: 'spell-where' })
  const kind = el('div', { class: 'spell-kind' })
  const message = el('div', { class: 'spell-message' })
  const context = el('div', { class: 'spell-context' })
  const change = el('input', { class: 'field' })
  change.setAttribute('aria-label', t('Change to'))
  const list = el('select', { size: 5 })
  list.setAttribute('aria-label', t('Suggestions'))
  const status = el('div', { class: 'spell-status', role: 'status' })
  const button = (label: string, action: () => void, primary = false) => {
    const b = el('button', { type: 'button', textContent: label, class: primary ? 'primary' : '' })
    b.addEventListener('click', action)
    return b
  }
  const bChange = button(t('Change'), () => void apply(false), true)
  const bChangeAll = button(t('Change all'), () => void apply(true))
  const bIgnore = button(t('Ignore'), () => act((f) => ignoredOnce.add(onceKey(f))))
  const bIgnoreAll = button(t('Ignore all'), () =>
    act((f) => {
      if (f.issue.rule === 'spelling') ignoredWords.add(`${f.lang}:${f.text}`)
      else {
        ignoredRules.add(f.issue.rule)
        disableRule(f.issue.rule)
      }
    }),
  )
  const bAdd = button(t('Add to dictionary'), () => act((f) => addToDictionary(f.lang, f.text)))
  const bNext = button(t('Next'), () => act(() => {}))
  dialog.append(
    el('h2', { id: 'spell-dialog-title' }, t('Spelling and grammar'), lang, close),
    where,
    kind,
    message,
    context,
    el('div', { class: 'spell-row' }, el('div', {}, el('label', { class: 'field-label' }, t('Change to'), change), list), el('div', { class: 'spell-buttons' }, bChange, bChangeAll, bIgnore, bIgnoreAll, bAdd, bNext)),
    status,
  )
  document.body.append(dialog)
  dialog.show()

  // Outline of the current issue in the page (fields do not show their
  // selection while the focus is in the dialog).
  const marks = el('div', { class: 'spell-current-layer' })
  document.body.append(marks)
  const place = () => {
    marks.replaceChildren()
    const f = current
    if (!f || !source.rects) return
    for (const r of source.rects(f.item, f.from, f.to)) {
      const box = el('div', { class: `spell-current ${f.issue.kind}` })
      Object.assign(box.style, { left: `${r.left - 2}px`, top: `${r.top - 2}px`, width: `${r.width + 4}px`, height: `${r.height + 4}px` })
      marks.append(box)
    }
  }
  const onScroll = () => place()
  window.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', onScroll)

  const cache = new Map<string, CheckResult>()
  const ignoredOnce = new Set<string>()
  const ignoredWords = new Set<string>()
  const ignoredRules = new Set<string>()
  const onceKey = (f: Found) => `${f.item.key}|${f.from}|${f.text}|${f.issue.rule}`

  let items = source.items()
  let startIndex = Math.max(0, Math.min(items.length - 1, source.start?.(items) ?? 0))
  // Position of the walk: item index and offset in its text.
  let pos = { index: startIndex, offset: 0 }
  let wrapped = false
  let current: Found | null = null
  let visited = 0
  let walking = 0

  const variantFor = (item: SpellItem) => variantOf(item.lang) ?? source.language.variant()

  // Issues of one item (checked once per text), without the ignored ones.
  async function issuesOf(item: SpellItem, index: number): Promise<{ list: Found[]; pending: boolean }> {
    const v = variantFor(item)
    const lines = item.text.split('\n')
    const key = `${v.tag}|${item.context ?? ''}|${item.text}`
    let result = cache.get(key)
    let pending = false
    if (!result) {
      const paragraphs: Paragraph[] = lines.map((text) => ({ text, lang: v.lang, variant: v.tag, context: item.context ?? 'list' }))
      const results = await checkParagraphs(paragraphs)
      pending = results.some((r) => r.pending)
      // One result for the whole item, offsets in its text.
      let offset = 0
      const issues: Issue[] = []
      results.forEach((r, i) => {
        for (const issue of r.issues) issues.push({ ...issue, from: issue.from + offset, to: issue.to + offset, span: issue.span && [issue.span[0] + offset, issue.span[1] + offset] })
        offset += lines[i].length + 1
      })
      result = { issues, pending }
      if (!pending) cache.set(key, result)
    }
    const list: Found[] = []
    for (const issue of result.issues) {
      const text = item.text.slice(issue.from, issue.to)
      const f: Found = { item, index, issue, lang: v.lang, dict: dictOf({ lang: v.lang, variant: v.tag }), text, from: issue.from, to: issue.to }
      if (issue.rule === 'spelling' && (ignoredWords.has(`${v.lang}:${text}`) || isPersonal(v.lang, text))) continue
      if (issue.rule !== 'spelling' && ignoredRules.has(issue.rule)) continue
      if (ignoredOnce.has(onceKey(f))) continue
      list.push(f)
    }
    return { list, pending }
  }

  // The next issue at or after `pos`, wrapping around the end once.
  async function next() {
    const walk = ++walking
    status.textContent = t('Checking…')
    let pendingSeen = false
    for (;;) {
      if (walk !== walking || open?.dialog !== dialog) return
      if (!wrapped && pos.index >= items.length) {
        wrapped = true
        pos = { index: 0, offset: 0 }
      }
      // The first pass checked the start item whole: after wrapping, the items before it.
      if (wrapped && pos.index >= Math.min(startIndex, items.length)) break
      const index = pos.index
      const { list, pending } = await issuesOf(items[index], index)
      pendingSeen ||= pending
      if (walk !== walking) return
      const found = list.find((f) => f.from >= pos.offset)
      if (found) return show(found)
      pos = { index: index + 1, offset: 0 }
    }
    show(null)
    if (pendingSeen) {
      // A dictionary is still downloading: try again when it is ready (or soon).
      status.textContent = t('Checking…')
      waitingForDictionary = true
      setTimeout(() => {
        if (waitingForDictionary && !current && open?.dialog === dialog) resume()
      }, 1000)
    } else status.textContent = visited ? t('The check is complete.') : t('No spelling or grammar issues found.')
  }
  let waitingForDictionary = false

  function show(found: Found | null) {
    current = found
    const has = !!found
    for (const b of [bChange, bChangeAll, bIgnore, bIgnoreAll, bNext]) b.disabled = !has
    bAdd.disabled = !has || found!.issue.rule !== 'spelling'
    bIgnoreAll.textContent = found && found.issue.rule !== 'spelling' ? t('Ignore rule') : t('Ignore all')
    list.replaceChildren()
    change.value = ''
    if (!found) {
      marks.replaceChildren()
      where.textContent = ''
      kind.textContent = ''
      message.textContent = ''
      context.replaceChildren()
      return
    }
    visited++
    status.textContent = ''
    if (!source.editable()) for (const b of [bChange, bChangeAll]) b.disabled = true
    where.textContent = found.item.label
    kind.textContent = kindLabel(found)
    kind.className = `spell-kind ${found.issue.kind}`
    message.textContent = describe(found)
    const text = found.item.text
    const before = text.slice(Math.max(0, found.from - 120), found.from)
    const after = text.slice(found.to, found.to + 120)
    const mark = el('mark', { class: found.issue.kind, textContent: text.slice(found.from, found.to) })
    context.replaceChildren((found.from > 120 ? '…' : '') + before, mark, after + (found.to + 120 < text.length ? '…' : ''))
    source.reveal(found.item, found.from, found.to)
    requestAnimationFrame(() => current === found && place())
    const suggestions = found.issue.rule === 'spelling' ? suggest(found.text, found.dict) : Promise.resolve(found.issue.replacements)
    void suggestions.then((list2) => {
      if (current !== found) return
      for (const s of list2.slice(0, 8)) list.append(new Option(showReplacement(s), s))
      if (!list2.length) list.append(Object.assign(new Option(t('(no suggestions)'), ''), { disabled: true }))
      else {
        list.selectedIndex = 0
        change.value = list2[0]
      }
    })
  }

  // Ignore, add, next: move past the current issue.
  function act(fn: (found: Found) => void) {
    const found = current
    if (!found) return
    fn(found)
    pos = { index: found.index, offset: found.from + 1 }
    void next()
  }

  // Replaces the issue's text (or its wider span).
  function replaceFound(f: Found, value: string): number | null {
    const span = f.issue.span
    const from = span ? span[0] : f.from
    const to = span ? span[1] : f.to
    return source.replace(f.item, from, to, value) ? from + value.length : null
  }

  async function apply(all: boolean) {
    const found = current
    if (!found || !source.editable()) return
    const value = change.value
    const end = replaceFound(found, value)
    if (all) {
      // Every other occurrence, in every item (from the end of each item, so
      // offsets stay valid).
      items = source.items()
      for (let i = 0; i < items.length; i++) {
        const { list: issues } = await issuesOf(items[i], i)
        const same = issues.filter((f) => f.issue.rule === found.issue.rule && f.text === found.text && f.lang === found.lang)
        for (const f of same.reverse()) replaceFound(f, value)
      }
    }
    items = source.items()
    pos = { index: found.index, offset: end ?? found.from + 1 }
    // Replacing in a field moves the focus there: keep working in the dialog.
    if (!dialog.contains(document.activeElement)) bChange.focus({ preventScroll: true })
    void next()
  }

  // Walks again from the start after a dictionary arrived.
  function resume() {
    waitingForDictionary = false
    items = source.items()
    pos = { index: Math.min(startIndex, Math.max(0, items.length - 1)), offset: 0 }
    wrapped = false
    void next()
  }

  function restart() {
    items = source.items()
    startIndex = Math.max(0, Math.min(items.length - 1, source.start?.(items) ?? 0))
    pos = { index: startIndex, offset: 0 }
    wrapped = false
    visited = 0
    void next()
  }

  const finish = () => {
    if (open?.dialog !== dialog) return
    open = null
    walking++
    unsubscribe()
    unsubscribeLang()
    window.removeEventListener('scroll', onScroll, true)
    window.removeEventListener('resize', onScroll)
    marks.remove()
    dialog.remove()
    source.close?.()
  }
  close.addEventListener('click', finish)
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      finish()
    } else if (e.key === 'Enter' && e.target === change) {
      e.preventDefault()
      void apply(false)
    }
  })
  list.addEventListener('change', () => (change.value = list.value))
  list.addEventListener('dblclick', () => void apply(false))

  const unsubscribe = onSpellChange(() => {
    // A dictionary finished downloading.
    if (waitingForDictionary && !current) resume()
  })
  const unsubscribeLang = source.language.onChange(() => {
    lang.value = source.language.tag()
    cache.clear()
    if (!current) restart()
  })
  void next()
}
