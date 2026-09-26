// Sticky notes: markers on the pages and a side panel with the threads
// (replies, resolve, edit, delete), like the writer's comments. They live in
// the comments channel so people with a comment link can add them.

import * as Y from 'yjs'
import { Check, MessageSquare, RotateCcw, Trash2, X } from 'lucide'
import { locale, t } from '../../core/i18n'
import type { Session } from '../../core/session'
import { el, icon } from '../../ui/widgets'
import { userIdOf } from '../writer/collab'
import { newId, notesMap, pendingNotes, type Note } from './model'
import type { PageView, Viewer } from './viewer'

export interface Thread {
  note: Note
  replies: Note[]
}

export function readThreads(map: Y.Map<Note>, pageOrder: string[]): Thread[] {
  const all = [...map.values()]
  const replies = new Map<string, Note[]>()
  for (const n of all) if (n.parent) replies.set(n.parent, [...(replies.get(n.parent) ?? []), n])
  const order = (n: Note) => pageOrder.indexOf(n.page ?? '')
  return all
    .filter((n) => !n.parent && order(n) >= 0)
    .sort((a, b) => order(a) - order(b) || (a.y ?? 0) - (b.y ?? 0) || a.time - b.time)
    .map((note) => ({ note, replies: (replies.get(note.id) ?? []).sort((a, b) => a.time - b.time) }))
}

const formatTime = (time: number) => new Date(time).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })

export class Notes {
  readonly map: Y.Map<Note>
  readonly panel = el('aside', { class: 'pdf-side pdf-notes-panel', hidden: true })
  private list = el('div', { class: 'pdf-notes-list' })
  private active: string | null = null
  private userId: string
  showResolved = false
  onToggle: () => void = () => {}

  constructor(
    private session: Session,
    private viewer: Viewer,
  ) {
    this.map = notesMap(session)
    this.userId = userIdOf(session)
    this.panel.setAttribute('aria-label', t('Comments'))
    const close = el('button', { type: 'button', class: 'pdf-icon-btn', title: t('Close') }, icon(X, 16))
    close.setAttribute('aria-label', t('Close'))
    close.addEventListener('click', () => this.toggle(false))
    const resolved = el('input', { type: 'checkbox' })
    resolved.addEventListener('change', () => {
      this.showResolved = resolved.checked
      this.refresh()
    })
    this.panel.append(
      el('div', { class: 'pdf-side-head' }, el('h2', { textContent: t('Comments') }), close),
      el('label', { class: 'pdf-check' }, resolved, t('Show resolved')),
      this.list,
    )
    this.map.observe(() => this.refresh())
    this.adoptImported()
  }

  get canComment(): boolean {
    return this.session.canComment
  }

  // Notes of an imported file wait in the document until someone who may write opens it.
  private adoptImported(): void {
    const pending = pendingNotes(this.session.doc)
    if (!pending.size || !this.session.canEdit) return
    this.session.commentsDoc.transact(() => pending.forEach((n, id) => this.map.has(id) || this.map.set(id, n)))
    this.session.doc.transact(() => pending.clear())
  }

  toggle(open = this.panel.hidden): void {
    this.panel.hidden = !open
    this.onToggle()
  }

  threads(): Thread[] {
    return readThreads(this.map, this.viewer.views.map((v) => v.entry.id))
  }

  // New note at a point of a page: opens the panel with its editor.
  create(page: string, x: number, y: number, text = ''): string {
    const n: Note = {
      id: newId(),
      page,
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      authorId: this.userId,
      author: this.session.user.name,
      color: this.session.user.color,
      time: Date.now(),
      text,
    }
    this.map.set(n.id, n)
    this.active = n.id
    this.toggle(true)
    this.refresh()
    this.focusEditor(n.id)
    return n.id
  }

  private focusEditor(id: string): void {
    // Right away, so typing that follows the click lands in the note.
    const input = () => this.list.querySelector<HTMLTextAreaElement>(`[data-note="${id}"] textarea`)
    const box = input()
    if (box) box.focus()
    else requestAnimationFrame(() => input()?.focus())
  }

  select(id: string): void {
    this.active = id
    this.toggle(true)
    this.refresh()
    const card = this.list.querySelector<HTMLElement>(`[data-note="${id}"]`)
    card?.scrollIntoView({ block: 'nearest' })
    card?.focus()
  }

  // ---------- Markers ----------

  renderMarkers(view: PageView): void {
    const threads = this.threads().filter((th) => th.note.page === view.entry.id && (this.showResolved || !th.note.resolved))
    view.notes.replaceChildren(
      ...threads.map(({ note, replies }) => {
        const b = el('button', { type: 'button', class: `pdf-note-marker${note.id === this.active ? ' active' : ''}` }, icon(MessageSquare, 16))
        if (replies.length) b.append(el('span', { textContent: String(replies.length + 1) }))
        b.style.left = `${((note.x ?? 0) / view.entry.w) * 100}%`
        b.style.top = `${((note.y ?? 0) / view.entry.h) * 100}%`
        b.style.setProperty('--note-color', note.color)
        const label = t('Comment by {author}: {text}', { author: note.author, text: note.text })
        b.title = label
        b.setAttribute('aria-label', label)
        b.addEventListener('pointerdown', (e) => e.stopPropagation())
        b.addEventListener('click', () => this.select(note.id))
        return b
      }),
    )
  }

  // ---------- Panel ----------

  refresh(): void {
    for (const v of this.viewer.views) this.renderMarkers(v)
    if (this.panel.hidden) return
    const focused = document.activeElement
    if (focused instanceof HTMLTextAreaElement && this.list.contains(focused) && focused.value) return
    const threads = this.threads().filter((th) => this.showResolved || !th.note.resolved || th.note.id === this.active)
    this.list.replaceChildren()
    if (!threads.length) this.list.append(el('p', { class: 'pdf-hint', textContent: this.canComment ? t('No comments yet. Choose the sticky note tool (N) and click on a page.') : t('No comments yet.') }))
    for (const th of threads) this.list.append(this.card(th))
  }

  private header(n: Note): HTMLElement {
    const avatar = el('span', { class: 'pdf-avatar', textContent: (n.author.trim()[0] ?? '?').toUpperCase() })
    avatar.style.background = n.color
    return el(
      'div',
      { class: 'pdf-who' },
      avatar,
      el('div', { class: 'pdf-who-name' }, el('div', { class: 'pdf-author', textContent: n.author || t('Anonymous') }), el('div', { class: 'pdf-time', textContent: formatTime(n.edited ?? n.time) + (n.edited ? ` · ${t('edited')}` : '') })),
    )
  }

  private iconButton(node: typeof Check, title: string, run: () => void): HTMLButtonElement {
    const b = el('button', { type: 'button', class: 'pdf-icon-btn', title }, icon(node, 16))
    b.setAttribute('aria-label', title)
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      run()
    })
    return b
  }

  private card({ note, replies }: Thread): HTMLElement {
    const card = el('div', { class: `pdf-note-card${note.id === this.active ? ' active' : ''}${note.resolved ? ' resolved' : ''}`, tabIndex: 0 })
    card.dataset.note = note.id
    card.style.setProperty('--note-color', note.color)
    const page = this.viewer.views.findIndex((v) => v.entry.id === note.page)
    const head = el('div', { class: 'pdf-note-head' }, this.header(note))
    if (this.canComment) {
      head.append(
        note.resolved
          ? this.iconButton(RotateCcw, t('Reopen'), () => this.update(note.id, { resolved: false }))
          : this.iconButton(Check, t('Resolve'), () => this.update(note.id, { resolved: true })),
      )
      if (note.authorId === this.userId || this.session.canEdit) head.append(this.iconButton(Trash2, t('Delete'), () => this.remove(note.id)))
    }
    card.append(head, el('div', { class: 'pdf-note-where', textContent: t('Page {n}', { n: page + 1 }) }))
    const mine = note.authorId === this.userId && this.canComment
    if (mine && (!note.text || note.id === this.active)) card.append(this.editor(note))
    else card.append(el('div', { class: 'pdf-note-text', textContent: note.text }))
    for (const r of replies) {
      const reply = el('div', { class: 'pdf-note-reply' }, el('div', { class: 'pdf-note-head' }, this.header(r)))
      if (r.authorId === this.userId || this.session.canEdit) reply.firstElementChild!.append(this.iconButton(Trash2, t('Delete'), () => this.remove(r.id)))
      reply.append(el('div', { class: 'pdf-note-text', textContent: r.text }))
      card.append(reply)
    }
    if (this.canComment && note.text) {
      const input = el('textarea', { class: 'pdf-input', rows: 1, placeholder: t('Reply…') })
      input.setAttribute('aria-label', t('Reply'))
      const send = el('button', { type: 'button', class: 'primary', textContent: t('Reply') })
      const submit = () => {
        const text = input.value.trim()
        if (!text) return
        input.value = ''
        const id = newId()
        this.map.set(id, { id, parent: note.id, authorId: this.userId, author: this.session.user.name, color: this.session.user.color, time: Date.now(), text })
      }
      send.addEventListener('click', submit)
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit()
      })
      card.append(input, el('div', { class: 'pdf-actions' }, send))
    }
    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('textarea, button')) return
      this.active = note.id
      if (page >= 0) this.viewer.scrollToPage(page, Math.max(0, (note.y ?? 0) - 60))
      this.refresh()
    })
    return card
  }

  private editor(note: Note): HTMLElement {
    const input = el('textarea', { class: 'pdf-input', rows: 3, value: note.text, placeholder: t('Comment…') })
    input.setAttribute('aria-label', t('Comment'))
    const save = el('button', { type: 'button', class: 'primary', textContent: note.text ? t('Save') : t('Comment') })
    const cancel = el('button', { type: 'button', textContent: t('Cancel') })
    const commit = () => {
      const text = input.value.trim()
      if (!text) return
      this.active = null
      input.value = ''
      this.update(note.id, note.text ? { text, edited: Date.now() } : { text })
    }
    save.addEventListener('click', commit)
    cancel.addEventListener('click', () => {
      input.value = ''
      if (!note.text) this.remove(note.id)
      else {
        this.active = null
        this.refresh()
      }
    })
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commit()
      if (e.key === 'Escape') cancel.click()
    })
    return el('div', {}, input, el('div', { class: 'pdf-actions' }, cancel, save))
  }

  update(id: string, patch: Partial<Note>): void {
    const n = this.map.get(id)
    if (n) this.map.set(id, { ...n, ...patch })
  }

  remove(id: string): void {
    this.session.commentsDoc.transact(() => {
      for (const [key, n] of this.map) if (n.parent === id) this.map.delete(key)
      this.map.delete(id)
    })
    if (this.active === id) this.active = null
  }

  // Notes on a page (for deleting a blank page).
  removePage(page: string): void {
    for (const [id, n] of this.map) if (n.page === page) this.remove(id)
  }
}
