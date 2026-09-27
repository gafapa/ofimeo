// Comments on slides: threads anchored to a slide and optionally to one of its
// objects, with replies and resolving. They live in the session's comments
// channel (session.commentsDoc), so people with a comment link can write them
// without editing the presentation. The pane lists the threads of the current
// slide (or all slides); markers on the canvas show where they are.

import type { Cell } from '@maxgraph/core'
import { InternalEvent } from '@maxgraph/core'
import { Check, EllipsisVertical, MessageSquare, RotateCcw, X } from 'lucide'
import * as Y from 'yjs'
import type { Session } from '../../core/session'
import { locale, t } from '../../core/i18n'
import { el, icon, showContextMenu } from '../../ui/widgets'
import type { EditorGraph } from '../diagram/graph'
import { userIdOf } from '../writer/collab'

export interface SlideComment {
  id: string
  // Replies point to the comment they answer; only top-level comments have a slide.
  parent?: string
  slide?: string
  // Top-level cell the comment is about.
  cell?: string
  authorId: string
  author: string
  color: string
  time: number
  text: string
  edited?: number
  resolved?: boolean
}

export interface Thread {
  comment: SlideComment
  replies: SlideComment[]
}

export function slideCommentsMap(session: Session): Y.Map<SlideComment> {
  return session.commentsDoc.getMap<SlideComment>('slideComments')
}

// Threads, oldest first; of one slide or of all.
export function readThreads(map: Y.Map<SlideComment>, slide?: string): Thread[] {
  const all = [...map.values()]
  const replies = new Map<string, SlideComment[]>()
  for (const c of all) if (c.parent) replies.set(c.parent, [...(replies.get(c.parent) ?? []), c])
  return all
    .filter((c) => !c.parent && (!slide || c.slide === slide))
    .sort((a, b) => a.time - b.time)
    .map((comment) => ({ comment, replies: (replies.get(comment.id) ?? []).sort((a, b) => a.time - b.time) }))
}

export interface CommentsHost {
  session: Session
  graph: EditorGraph
  canvas: HTMLElement
  page(): string
  slides(): { id: string; name: string }[]
  showSlide(id: string): void
  onToggle(): void
  // Open comments per slide changed.
  onCounts(counts: Map<string, number>): void
}

export class CommentsPane {
  readonly element = el('aside', { class: 'slides-side slides-comments', hidden: true })
  private readonly markers = el('div', { class: 'slides-comment-markers' })
  readonly comments: Y.Map<SlideComment>
  private readonly userId: string
  private allSlides = false
  private showResolved = false
  private active: string | null = null
  // An object picked for the new comment (commenters cannot select on the canvas).
  private picked: string | null = null
  private detached = false
  private draft = ''
  private frame = 0

  constructor(private readonly host: CommentsHost) {
    this.element.setAttribute('aria-label', t('Comments'))
    this.comments = slideCommentsMap(host.session)
    this.userId = userIdOf(host.session)
    host.canvas.append(this.markers)
    this.comments.observe(() => this.schedule())
    const { graph } = host
    graph.getSelectionModel().addListener(InternalEvent.CHANGE, () => {
      this.detached = false
      this.schedule()
    })
    graph.getDataModel().addListener(InternalEvent.CHANGE, () => this.schedule())
    for (const event of [InternalEvent.SCALE, InternalEvent.TRANSLATE, InternalEvent.SCALE_AND_TRANSLATE]) graph.view.addListener(event, () => this.placeMarkers())
    // Commenters pick the object of a new comment by clicking it.
    host.canvas.addEventListener('click', (e) => {
      if (this.element.hidden || !this.canComment || this.canEdit) return
      const rect = host.canvas.getBoundingClientRect()
      const cell = graph.getCellAt(e.clientX - rect.left, e.clientY - rect.top)
      this.picked = cell ? this.topOf(cell).getId() : null
      this.detached = false
      this.schedule()
    })
    this.schedule()
  }

  get canComment(): boolean {
    return this.host.session.canComment
  }

  get canEdit(): boolean {
    return this.host.session.canEdit
  }

  get visible(): boolean {
    return !this.element.hidden
  }

  toggle(show = this.element.hidden): void {
    this.element.hidden = !show
    this.host.onToggle()
    this.render()
    if (show) setTimeout(() => this.element.querySelector<HTMLTextAreaElement>('.slides-comment-new textarea')?.focus())
  }

  // Opens the pane with a new comment on the selection.
  startComment(): void {
    if (!this.canComment) return
    this.detached = false
    this.toggle(true)
  }

  pageShown(): void {
    this.picked = null
    this.schedule()
  }

  schedule(): void {
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => this.render())
  }

  private topOf(cell: Cell): Cell {
    while (cell.getParent() && cell.getParent()!.getParent() && cell.getParent()!.getParent()!.getParent()) cell = cell.getParent()!
    return cell
  }

  // The object a new comment is about.
  private target(): string | null {
    if (this.detached) return null
    if (this.canEdit) {
      const cells = this.host.graph.getSelectionCells()
      return cells.length === 1 ? this.topOf(cells[0]).getId() : null
    }
    return this.picked
  }

  private label(cellId: string | undefined): string {
    if (!cellId) return t('Slide')
    const cell = this.host.graph.getDataModel().getCell(cellId)
    if (!cell) return t('(deleted object)')
    const html = String(cell.getValue() ?? '')
    const box = document.createElement('div')
    box.innerHTML = html
    const text = (box.textContent ?? '').trim()
    return text ? (text.length > 30 ? `${text.slice(0, 30)}…` : text) : t('Object')
  }

  private me() {
    const { user } = this.host.session
    return { authorId: this.userId, author: user.name, color: user.color, time: Date.now() }
  }

  private newId(): string {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
  }

  add(text: string, cell: string | null = this.target(), slide = this.host.page()): string | null {
    if (!text.trim() || !this.canComment) return null
    const id = this.newId()
    this.comments.set(id, { id, slide, ...(cell ? { cell } : {}), ...this.me(), text: text.trim() })
    this.active = id
    this.draft = ''
    return id
  }

  private reply(parent: string, text: string) {
    if (!text.trim()) return
    const id = this.newId()
    this.comments.set(id, { id, parent, ...this.me(), text: text.trim() })
  }

  private setResolved(id: string, resolved: boolean) {
    const c = this.comments.get(id)
    if (c) this.comments.set(id, { ...c, resolved })
  }

  private remove(id: string) {
    this.comments.doc!.transact(() => {
      for (const c of [...this.comments.values()]) if (c.parent === id) this.comments.delete(c.id)
      this.comments.delete(id)
    })
  }

  private editText(id: string, text: string) {
    const c = this.comments.get(id)
    if (c && text.trim()) this.comments.set(id, { ...c, text: text.trim(), edited: Date.now() })
  }

  private counts(): Map<string, number> {
    const counts = new Map<string, number>()
    for (const { comment } of readThreads(this.comments)) if (!comment.resolved && comment.slide) counts.set(comment.slide, (counts.get(comment.slide) ?? 0) + 1)
    return counts
  }

  render(): void {
    this.host.onCounts(this.counts())
    this.placeMarkers()
    if (this.element.hidden) return
    const page = this.host.page()
    // Keep what is being typed.
    const focused = document.activeElement as HTMLTextAreaElement | null
    const focusKey = focused && this.element.contains(focused) ? focused.dataset.key : undefined
    const focusState = focusKey ? { value: focused!.value, start: focused!.selectionStart, end: focused!.selectionEnd } : null

    const head = el('div', { class: 'slides-side-head' }, el('h3', { textContent: t('Comments') }))
    const close = el('button', { type: 'button', class: 'slides-side-close', title: t('Close') }, icon(X, 16))
    close.setAttribute('aria-label', t('Close'))
    close.addEventListener('click', () => this.toggle(false))
    head.append(close)

    const scope = el('select', { class: 'fmt-select' })
    scope.append(el('option', { value: 'slide', textContent: t('This slide') }), el('option', { value: 'all', textContent: t('All slides') }))
    scope.value = this.allSlides ? 'all' : 'slide'
    scope.setAttribute('aria-label', t('Show comments of'))
    scope.addEventListener('change', () => {
      this.allSlides = scope.value === 'all'
      this.render()
    })
    const resolved = el('input', { type: 'checkbox', checked: this.showResolved })
    resolved.addEventListener('change', () => {
      this.showResolved = resolved.checked
      this.render()
    })
    const filters = el('div', { class: 'slides-comment-filters' }, scope, el('label', { class: 'fmt-check' }, resolved, t('Resolved')))

    const parts: HTMLElement[] = [head, filters]
    if (this.canComment) {
      const target = this.target()
      const input = el('textarea', { class: 'rv-input', rows: 3, placeholder: t('Comment…'), value: this.draft })
      input.dataset.key = 'new'
      input.setAttribute('aria-label', t('New comment'))
      input.addEventListener('input', () => (this.draft = input.value))
      const send = el('button', { type: 'button', class: 'primary', textContent: t('Comment') })
      send.addEventListener('click', () => this.add(input.value))
      input.addEventListener('keydown', (e) => {
        e.stopPropagation()
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) this.add(input.value)
      })
      const on = el('div', { class: 'slides-comment-on' }, el('span', { textContent: target ? t('On: {object}', { object: this.label(target) }) : this.canEdit ? t('On this slide (select an object to comment on it)') : t('On this slide (click an object to comment on it)') }))
      if (target) {
        const detach = el('button', { type: 'button', class: 'slides-icon-btn', title: t('Comment on the slide instead') }, icon(X, 12))
        detach.setAttribute('aria-label', t('Comment on the slide instead'))
        detach.addEventListener('click', () => {
          this.detached = true
          this.picked = null
          this.render()
        })
        on.append(detach)
      }
      parts.push(el('div', { class: 'slides-comment-new' }, on, input, el('div', { class: 'rv-actions' }, send)))
    }

    const slides = this.host.slides()
    const slideIndex = new Map(slides.map((s, i) => [s.id, i]))
    const threads = readThreads(this.comments, this.allSlides ? undefined : page)
      .filter((th) => this.showResolved || !th.comment.resolved)
      .filter((th) => !th.comment.slide || slideIndex.has(th.comment.slide))
      .sort((a, b) => (slideIndex.get(a.comment.slide ?? '') ?? 0) - (slideIndex.get(b.comment.slide ?? '') ?? 0) || a.comment.time - b.comment.time)
    const list = el('div', { class: 'slides-comment-list' })
    for (const th of threads) list.append(this.card(th, slideIndex.get(th.comment.slide ?? '')))
    if (!threads.length) list.append(el('p', { class: 'fmt-hint', textContent: t('No comments yet.') }))
    parts.push(list)
    this.element.replaceChildren(...parts)
    if (focusKey && focusState) {
      const input = this.element.querySelector<HTMLTextAreaElement>(`textarea[data-key="${CSS.escape(focusKey)}"]`)
      if (input) {
        input.value = focusState.value
        input.focus()
        input.setSelectionRange(focusState.start, focusState.end)
      }
    }
    this.element.querySelector('.rv-card.active')?.scrollIntoView({ block: 'nearest' })
  }

  private header(author: string, color: string, time: number, edited?: number): HTMLElement {
    const avatar = el('span', { class: 'rv-avatar', textContent: (author.trim()[0] ?? '?').toUpperCase() })
    avatar.style.background = color
    return el('div', { class: 'rv-who' }, avatar, el('div', { class: 'rv-name' }, el('div', { class: 'rv-author', textContent: author }), el('div', { class: 'rv-time', textContent: formatTime(time) + (edited ? ` · ${t('edited')}` : '') })))
  }

  private iconButton(node: Parameters<typeof icon>[0], title: string, run: (e: MouseEvent) => void): HTMLButtonElement {
    const b = el('button', { type: 'button', class: 'rv-icon', title }, icon(node, 16))
    b.setAttribute('aria-label', title)
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      run(e)
    })
    return b
  }

  private card(th: Thread, index: number | undefined): HTMLElement {
    const { comment } = th
    const card = el('div', { class: `rv-card rv-comment${comment.resolved ? ' resolved' : ''}` })
    card.classList.toggle('active', this.active === comment.id)
    card.style.setProperty('--rv-color', comment.color)
    card.dataset.id = comment.id
    const head = el('div', { class: 'rv-head' }, this.header(comment.author, comment.color, comment.time, comment.edited))
    if (this.canComment) {
      head.append(
        comment.resolved
          ? this.iconButton(RotateCcw, t('Reopen'), () => this.setResolved(comment.id, false))
          : this.iconButton(Check, t('Resolve'), () => this.setResolved(comment.id, true)),
      )
    }
    if (comment.authorId === this.userId && this.canComment) head.append(this.iconButton(EllipsisVertical, t('More'), (e) => this.ownMenu(e, comment, card)))
    card.append(head)
    const where = el('button', { type: 'button', class: 'slides-comment-where' })
    where.textContent = `${index !== undefined ? `${t('Slide {n}', { n: index + 1 })} · ` : ''}${this.label(comment.cell)}`
    where.addEventListener('click', () => this.reveal(comment))
    card.append(where, el('div', { class: 'rv-text', textContent: comment.text }))
    for (const r of th.replies) {
      const reply = el('div', { class: 'rv-reply' }, el('div', { class: 'rv-head' }, this.header(r.author, r.color, r.time, r.edited)))
      if (r.authorId === this.userId && this.canComment) reply.firstElementChild!.append(this.iconButton(EllipsisVertical, t('More'), (e) => this.ownMenu(e, r, reply)))
      reply.append(el('div', { class: 'rv-text', textContent: r.text }))
      card.append(reply)
    }
    if (this.canComment && !comment.resolved) {
      const input = el('textarea', { class: 'rv-input rv-reply-input', rows: 1, placeholder: t('Reply…') })
      input.dataset.key = `reply:${comment.id}`
      input.setAttribute('aria-label', t('Reply'))
      const send = el('button', { type: 'button', class: 'primary', textContent: t('Reply') })
      send.addEventListener('click', () => this.reply(comment.id, input.value))
      input.addEventListener('keydown', (e) => {
        e.stopPropagation()
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) this.reply(comment.id, input.value)
      })
      card.append(input, el('div', { class: 'rv-actions' }, send))
    }
    card.addEventListener('mousedown', () => {
      if (this.active === comment.id) return
      this.active = comment.id
      this.element.querySelectorAll('.rv-card.active').forEach((c) => c.classList.remove('active'))
      card.classList.add('active')
      this.placeMarkers()
    })
    return card
  }

  // Shows the comment's slide and object.
  private reveal(c: SlideComment) {
    this.active = c.id
    if (c.slide && c.slide !== this.host.page()) this.host.showSlide(c.slide)
    const cell = c.cell ? this.host.graph.getDataModel().getCell(c.cell) : null
    if (cell && this.canEdit) this.host.graph.setSelectionCell(cell)
    this.schedule()
  }

  private ownMenu(e: MouseEvent, c: SlideComment, container: HTMLElement) {
    showContextMenu(e.clientX, e.clientY, [
      {
        label: t('Edit'),
        run: () => {
          const text = container.querySelector<HTMLElement>(':scope > .rv-text')
          if (!text) return
          const input = el('textarea', { class: 'rv-input', value: c.text, rows: 3 })
          const save = el('button', { type: 'button', class: 'primary', textContent: t('Save') })
          const cancel = el('button', { type: 'button', textContent: t('Cancel') })
          save.addEventListener('click', () => this.editText(c.id, input.value))
          cancel.addEventListener('click', () => this.render())
          input.addEventListener('keydown', (ev) => ev.stopPropagation())
          text.replaceWith(input, el('div', { class: 'rv-actions' }, cancel, save))
          input.focus()
        },
      },
      { label: t('Delete'), run: () => this.remove(c.id) },
    ])
  }

  // Speech bubbles on the canvas: at each commented object, and at the slide corner for slide comments.
  private placeMarkers(): void {
    this.markers.replaceChildren()
    const { graph } = this.host
    const page = this.host.page()
    const byTarget = new Map<string, Thread[]>()
    for (const th of readThreads(this.comments, page)) {
      if (th.comment.resolved) continue
      const key = th.comment.cell && graph.getDataModel().getCell(th.comment.cell) ? th.comment.cell : ''
      byTarget.set(key, [...(byTarget.get(key) ?? []), th])
    }
    const s = graph.view.scale
    const tr = graph.view.translate
    for (const [cellId, threads] of byTarget) {
      let x = tr.x * s
      let y = tr.y * s
      if (cellId) {
        const cell = graph.getDataModel().getCell(cellId)
      const state = cell ? graph.view.getState(cell) : null
        if (!state) continue
        x = state.x + state.width
        y = state.y
      }
      const b = el('button', { type: 'button', class: 'slides-comment-marker' }, icon(MessageSquare, 14), el('span', { textContent: String(threads.length) }))
      b.classList.toggle('active', threads.some((th) => th.comment.id === this.active))
      b.title = threads.map((th) => `${th.comment.author}: ${th.comment.text}`).join('\n')
      b.style.left = `${x - 10}px`
      b.style.top = `${y - 22}px`
      b.addEventListener('click', (e) => {
        e.stopPropagation()
        this.active = threads[0].comment.id
        this.toggle(true)
      })
      this.markers.append(b)
    }
    // The picked object of a commenter.
    if (this.picked && !this.element.hidden) {
      const cell = graph.getDataModel().getCell(this.picked)
      const state = cell ? graph.view.getState(cell) : null
      if (state) {
        const box = el('div', { class: 'slides-comment-pick' })
        box.style.cssText = `left:${state.x - 3}px;top:${state.y - 3}px;width:${state.width + 6}px;height:${state.height + 6}px`
        this.markers.append(box)
      }
    }
  }
}

function formatTime(time: number): string {
  if (!time) return ''
  const d = new Date(time)
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
