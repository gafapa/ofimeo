// "Spelling and grammar" dialog (F7): walks through the issues one by one from
// the cursor, like Word or LibreOffice. It is not modal, so the text can still
// be edited while it is open.

import { TextSelection } from '@tiptap/pm/state'
import { t } from '../../../core/i18n'
import { el } from '../../../ui/widgets'
import type { FoundIssue, SpellController } from './plugin'
import { LANGS } from '../../../core/spell/types'
import { describe, kindLabel, langName, showReplacement } from './ui'
import { VARIANTS } from '../../../core/spell/variants'

let open: HTMLDialogElement | null = null

export function spellingDialog(spell: SpellController): void {
  if (open) {
    open.querySelector<HTMLElement>('select, button')?.focus()
    return
  }
  const editor = spell.editor
  const editable = () => editor.isEditable
  const dialog = el('dialog', { class: 'spell-dialog' })
  dialog.setAttribute('aria-labelledby', 'spell-dialog-title')
  open = dialog

  const lang = el('select', { class: 'spell-lang', title: t('Document language') })
  for (const l of LANGS) {
    const group = el('optgroup', { label: langName(l) })
    for (const v of VARIANTS) if (v.lang === l) group.append(new Option(v.name, v.tag, false, v.tag === spell.docLang()))
    lang.append(group)
  }
  lang.addEventListener('change', () => spell.setDocLang(lang.value))
  const close = el('button', { type: 'button', class: 'spell-close', textContent: '✕', title: t('Close') })
  close.setAttribute('aria-label', t('Close'))
  const kind = el('div', { class: 'spell-kind' })
  const message = el('div', { class: 'spell-message' })
  const context = el('div', { class: 'spell-context' })
  const change = el('input', { class: 'field' })
  const list = el('select', { size: 5 })
  list.setAttribute('aria-label', t('Suggestions'))
  const status = el('div', { class: 'spell-status', role: 'status' })
  const button = (label: string, action: () => void, primary = false) => {
    const b = el('button', { type: 'button', textContent: label, class: primary ? 'primary' : '' })
    b.addEventListener('click', action)
    return b
  }
  const bChange = button(t('Change'), () => apply(false), true)
  const bChangeAll = button(t('Change all'), () => apply(true))
  const bIgnore = button(t('Ignore'), () => act((f) => spell.ignoreOnce(f)))
  const bIgnoreAll = button(t('Ignore all'), () => act((f) => spell.ignoreAll(f)))
  const bAdd = button(t('Add to dictionary'), () => act((f) => spell.addToDictionary(f.text, f.lang)))
  const bNext = button(t('Next'), () => next(current ? current.to : cursor()))
  dialog.append(
    el('h2', { id: 'spell-dialog-title' }, t('Spelling and grammar'), lang, close),
    kind,
    message,
    context,
    el('div', { class: 'spell-row' }, el('div', {}, el('label', { class: 'field-label' }, t('Change to'), change), list), el('div', { class: 'spell-buttons' }, bChange, bChangeAll, bIgnore, bIgnoreAll, bAdd, bNext)),
    status,
  )
  document.body.append(dialog)
  dialog.show()

  let current: FoundIssue | null = null
  // Where the walk started; it wraps around the end of the document once.
  const start = editor.state.selection.from
  let wrapped = false
  const cursor = () => editor.state.selection.from

  // Highlight of the current issue in the document: the editor selection is not
  // shown while the focus is in the dialog.
  const marks = el('div', { class: 'spell-current-layer' })
  document.body.append(marks)
  const issueRange = (): Range | null => {
    if (!current) return null
    try {
      const view = editor.view
      const a = view.domAtPos(current.from)
      const b = view.domAtPos(current.to)
      const range = document.createRange()
      range.setStart(a.node, a.offset)
      range.setEnd(b.node, b.offset)
      return range
    } catch {
      return null
    }
  }
  const place = () => {
    marks.replaceChildren()
    const range = issueRange()
    if (!range) return
    const seen = new Set<string>()
    for (const r of range.getClientRects()) {
      // Nested inline elements report the same line box more than once.
      const key = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)}`
      if (!r.width || seen.has(key)) continue
      seen.add(key)
      const box = el('div', { class: `spell-current ${current!.issue.kind}` })
      Object.assign(box.style, { left: `${r.left - 2}px`, top: `${r.top - 2}px`, width: `${r.width + 4}px`, height: `${r.height + 4}px` })
      marks.append(box)
    }
  }
  // Brings the issue to the upper part of the view and keeps the dialog off it.
  const reveal = () => {
    const range = issueRange()
    if (!range) return
    let rect = range.getBoundingClientRect()
    let scroller: HTMLElement | null = editor.view.dom.parentElement
    while (scroller && !(scroller.scrollHeight > scroller.clientHeight && /auto|scroll/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement
    const area = scroller ? scroller.getBoundingClientRect() : new DOMRect(0, 0, innerWidth, innerHeight)
    const target = area.top + area.height * 0.35
    if (rect.top < area.top + 40 || rect.bottom > area.bottom - 40 || Math.abs(rect.top - target) > area.height * 0.3) {
      if (scroller) scroller.scrollTop += rect.top - target
      else window.scrollBy(0, rect.top - target)
      rect = range.getBoundingClientRect()
    }
    dialog.classList.remove('bottom')
    const d = dialog.getBoundingClientRect()
    const overlaps = rect.right > d.left && rect.left < d.right && rect.bottom > d.top && rect.top < d.bottom
    if (overlaps) dialog.classList.add('bottom')
    place()
  }
  const onScroll = () => place()
  window.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', onScroll)
  editor.on('transaction', onScroll)

  const finish = () => {
    open = null
    unsubscribe()
    window.removeEventListener('scroll', onScroll, true)
    window.removeEventListener('resize', onScroll)
    editor.off('transaction', onScroll)
    marks.remove()
    dialog.remove()
    editor.commands.focus()
  }
  close.addEventListener('click', finish)
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      finish()
    } else if (e.key === 'Enter' && e.target === change) {
      e.preventDefault()
      apply(false)
    }
  })
  list.addEventListener('change', () => (change.value = list.value))
  list.addEventListener('dblclick', () => apply(false))

  let visited = 0
  function show(found: FoundIssue | null) {
    current = found
    if (found) visited++
    const has = !!found
    for (const b of [bChange, bChangeAll, bIgnore, bIgnoreAll, bNext]) b.disabled = !has
    bAdd.disabled = !has || found!.issue.rule !== 'spelling'
    bIgnoreAll.textContent = found && found.issue.rule !== 'spelling' ? t('Ignore rule') : t('Ignore all')
    list.replaceChildren()
    change.value = ''
    if (!found) {
      marks.replaceChildren()
      kind.textContent = ''
      message.textContent = ''
      context.replaceChildren()
      return
    }
    if (!editable()) for (const b of [bChange, bChangeAll]) b.disabled = true
    kind.textContent = kindLabel(found)
    kind.className = `spell-kind ${found.issue.kind}`
    message.textContent = describe(found)
    // The sentence around the issue.
    const $pos = editor.state.doc.resolve(found.from)
    const blockStart = $pos.start()
    const text = $pos.parent.textBetween(0, $pos.parent.content.size, '\n', ' ')
    const a = found.from - blockStart
    const b = found.to - blockStart
    const before = text.slice(Math.max(0, a - 120), a)
    const after = text.slice(b, b + 120)
    const mark = el('mark', { class: found.issue.kind, textContent: text.slice(a, b) })
    context.replaceChildren((a > 120 ? '…' : '') + before, mark, after + (b + 120 < text.length ? '…' : ''))
    // Select it in the document so it can be seen.
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, found.from, found.to)))
    requestAnimationFrame(() => current === found && reveal())
    status.textContent = ''
    void spell.suggestions(found).then((suggestions) => {
      if (current !== found) return
      for (const s of suggestions.slice(0, 8)) list.append(new Option(showReplacement(s), s))
      if (!suggestions.length) list.append(Object.assign(new Option(t('(no suggestions)'), ''), { disabled: true }))
      else {
        list.selectedIndex = 0
        change.value = suggestions[0]
      }
      bChangeAll.disabled = !editable() || !suggestions.length && !change.value
    })
  }

  function next(from: number) {
    const issues = spell.issues()
    let found = issues.find((i) => i.from >= from && !(current && i.from === current.from && i.to === current.to))
    if (found && wrapped && found.from >= start) found = undefined
    if (!found && !wrapped) {
      wrapped = true
      found = issues.find((i) => i.from < start)
    }
    if (found) return show(found)
    show(null)
    if (spell.busy) {
      status.textContent = t('Checking…')
      setTimeout(() => open === dialog && !current && next(from), 400)
    } else status.textContent = visited ? t('The check is complete.') : t('No spelling or grammar issues found.')
  }

  function act(fn: (found: FoundIssue) => void) {
    const found = current
    if (!found) return
    fn(found)
    next(found.to)
  }

  function apply(all: boolean) {
    const found = current
    if (!found || !editable()) return
    const value = change.value
    if (all) spell.replaceAll(found, value)
    else spell.replace(found, value)
    const pos = editor.state.selection.to
    next(Math.max(pos, found.from))
  }

  const unsubscribe = spell.onChange(() => {
    // New results may bring issues after an empty walk.
    if (!current && open === dialog && status.textContent === t('Checking…')) next(cursor())
  })
  next(cursor())
}
