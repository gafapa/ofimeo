// Comments and suggestions: highlights in the text and cards in a margin rail
// next to the page, aligned with the text they refer to (like Word or Google
// Docs). Comments live in the session's comments channel as plain records
// anchored with Yjs relative positions, so they follow the text through
// concurrent edits and commenters can add them without editing the document.

import * as Y from 'yjs'
import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Check, EllipsisVertical, RotateCcw, X } from 'lucide'
import type { Session } from '../../core/session'
import { colon, locale, quote, t } from '../../core/i18n'
import { el, icon, showContextMenu, toast } from '../../ui/widgets'
import { commentsMapOf, PENDING_COMMENTS, userIdOf, type Access } from './collab'
import { collectSuggestions, type Suggestion } from './editor/suggestions'
import { decodeAnchor, encodeAnchor, PositionIndex, type AnchorJSON } from './ypos'

export interface CommentRecord {
  id: string
  // Replies point to the comment they answer; only top-level comments have an anchor.
  parent?: string
  authorId: string
  author: string
  color: string
  time: number
  text: string
  edited?: number
  resolved?: boolean
  anchor?: AnchorJSON
  // Text the comment was made on, shown when that text is gone.
  quote?: string
}

// A comment with resolved position and its replies, for the rail and the converters.
export interface CommentThread {
  comment: CommentRecord
  replies: CommentRecord[]
  range: { from: number; to: number } | null
}

const reviewKey = new PluginKey<DecorationSet>('review')
const RAIL_GAP = 8
const NARROW = 760

export interface ReviewOptions {
  session: Session
  editor: Editor
  access: Access
  rail: HTMLElement
  paper: HTMLElement
  onVisibilityChange: () => void
  // Shared type of the text (default 'body') and the comments map (default
  // commentsMapOf(session)); the notebook passes one of each per page.
  field?: string
  comments?: Y.Map<unknown>
}

export class Review {
  readonly comments: Y.Map<CommentRecord>
  readonly userId: string
  private index: PositionIndex | null = null
  private threads: CommentThread[] = []
  private suggestions: Suggestion[] = []
  private active: string | null = null
  private draft: { from: number; to: number; quote: string } | null = null
  private cards = new Map<string, { el: HTMLElement; sig: string; top: number }>()
  // Suggestion id → key of the card that shows it.
  private suggestionKeys = new Map<string, string>()
  private frame = 0
  showResolved = false
  // Narrow screens show the rail as a panel on demand.
  panelOpen = false

  private onComments = () => this.refresh()
  private onText = () => {
    this.index = null
    this.refresh()
  }
  private onResize = () => this.reposition()

  constructor(private o: ReviewOptions) {
    this.comments = (o.comments ?? commentsMapOf(o.session)) as Y.Map<CommentRecord>
    this.userId = userIdOf(o.session)
    if (o.access === 'edit' && !o.comments) this.adoptImported()
    this.comments.observe(this.onComments)
    this.fragment.observeDeep(this.onText)
    o.editor.on('update', () => this.refresh())
    o.rail.addEventListener('mousedown', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('.rv-card')
      if (card?.dataset.key && card.dataset.key !== this.active && card.dataset.key !== 'draft') this.activate(card.dataset.key, false)
    })
    // Clicking highlighted text opens its comment or suggestion.
    o.editor.view.dom.addEventListener('click', (e) => {
      const target = e.target as HTMLElement
      const hl = target.closest<HTMLElement>('[data-comment-ids]')
      const sg = target.closest<HTMLElement>('[data-suggestion]')
      if (hl) this.activate(`c:${hl.dataset.commentIds!.split(' ').pop()}`, false)
      else if (sg) this.activate(this.suggestionKeys.get(sg.dataset.suggestion!) ?? `s:${sg.dataset.suggestion}`, false)
      // Deferred: the editor applies the clicked caret position first.
      else if (this.active) {
        const was = this.active
        setTimeout(() => this.active === was && this.activate(null, false))
      }
    })
    window.addEventListener('resize', this.onResize)
    this.refresh()
  }

  private get fragment(): Y.XmlFragment {
    return this.o.session.doc.getXmlFragment(this.o.field ?? 'body')
  }

  // Stops observing (before the editor is destroyed).
  destroy(): void {
    this.comments.unobserve(this.onComments)
    this.fragment.unobserveDeep(this.onText)
    window.removeEventListener('resize', this.onResize)
    cancelAnimationFrame(this.frame)
  }

  // Moves comments of an imported file from the document into the comments channel.
  private adoptImported() {
    const pending = this.o.session.doc.getMap<CommentRecord>(PENDING_COMMENTS)
    if (!pending.size) return
    this.comments.doc!.transact(() => pending.forEach((c, id) => !this.comments.has(id) && this.comments.set(id, c)))
    this.o.session.doc.transact(() => [...pending.keys()].forEach((id) => pending.delete(id)))
  }

  get canComment(): boolean {
    return this.o.access !== 'view'
  }

  get canEdit(): boolean {
    return this.o.access === 'edit'
  }

  // Highlight decorations, recomputed when comments or the document change.
  plugin(): Plugin {
    return new Plugin<DecorationSet>({
      key: reviewKey,
      state: {
        init: () => DecorationSet.empty,
        apply: (tr, set) => (tr.getMeta(reviewKey) as DecorationSet | undefined) ?? set.map(tr.mapping, tr.doc),
      },
      props: { decorations: (state: EditorState) => reviewKey.getState(state) },
    })
  }

  private positions(): PositionIndex {
    this.index ??= new PositionIndex(this.fragment, this.o.editor.schema)
    return this.index
  }

  // All comment threads with their current ranges, in document order.
  collectThreads(includeResolved = true): CommentThread[] {
    const all = [...this.comments.values()]
    const replies = new Map<string, CommentRecord[]>()
    for (const c of all) if (c.parent) replies.set(c.parent, [...(replies.get(c.parent) ?? []), c])
    const size = this.o.editor.state.doc.content.size
    return all
      .filter((c) => !c.parent && (includeResolved || !c.resolved))
      .map((comment) => {
        let range = comment.anchor ? decodeAnchor(this.positions(), comment.anchor) : null
        if (range && (range.to > size || range.from < 0)) range = null
        return { comment, replies: (replies.get(comment.id) ?? []).sort((a, b) => a.time - b.time), range }
      })
      .sort((a, b) => (a.range?.from ?? Infinity) - (b.range?.from ?? Infinity) || a.comment.time - b.comment.time)
  }

  refresh(): void {
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => this.update())
  }

  private update() {
    const { editor } = this.o
    if (editor.isDestroyed) return
    this.threads = this.collectThreads(this.showResolved)
    this.suggestions = collectSuggestions(editor.state.doc)
    this.suggestionGroups()
    const size = editor.state.doc.content.size
    const decorations: Decoration[] = []
    for (const { comment, range } of this.threads) {
      if (!range || range.from >= range.to || comment.resolved) continue
      const cls = `comment-hl${this.active === `c:${comment.id}` ? ' active' : ''}`
      decorations.push(Decoration.inline(Math.max(0, range.from), Math.min(size, range.to), { class: cls, 'data-comment-ids': comment.id }))
    }
    if (this.draft) decorations.push(Decoration.inline(this.draft.from, Math.min(size, this.draft.to), { class: 'comment-hl active' }))
    if (this.active?.startsWith('s:')) {
      for (const s of this.suggestions) if (this.suggestionKeys.get(s.id) === this.active) decorations.push(Decoration.inline(s.from, s.to, { class: 'sg-active' }))
    }
    const set = DecorationSet.create(editor.state.doc, decorations)
    // Read a pending DOM selection (a click the editor has not processed yet)
    // first; otherwise this transaction would write the old selection back and
    // the next keystroke would replace the previously selected text.
    ;(editor.view as unknown as { domObserver?: { flush(): void } }).domObserver?.flush()
    editor.view.dispatch(editor.state.tr.setMeta(reviewKey, set).setMeta('addToHistory', false))
    this.render()
  }

  // ---------- Commands ----------

  // Starts a new comment on the selection.
  startComment(): void {
    if (!this.canComment) return
    const { editor } = this.o
    let { from, to } = editor.state.selection
    if (from === to) {
      // Commenters' views are not editable: fall back to the browser selection.
      const sel = window.getSelection()
      if (sel && sel.rangeCount && !sel.isCollapsed && editor.view.dom.contains(sel.anchorNode)) {
        try {
          const a = editor.view.posAtDOM(sel.anchorNode!, sel.anchorOffset)
          const b = editor.view.posAtDOM(sel.focusNode!, sel.focusOffset)
          from = Math.min(a, b)
          to = Math.max(a, b)
        } catch {
          // Keep the collapsed selection.
        }
      }
    }
    if (from === to) {
      toast(t('Select the text you want to comment on'))
      return
    }
    this.draft = { from, to, quote: editor.state.doc.textBetween(from, to, ' ', '▫').slice(0, 200) }
    this.active = 'draft'
    this.panelOpen = true
    this.update()
    setTimeout(() => this.o.rail.querySelector<HTMLTextAreaElement>('.rv-draft textarea')?.focus())
  }

  private me() {
    const { user } = this.o.session
    return { authorId: this.userId, author: user.name, color: user.color, time: Date.now() }
  }

  private newId(): string {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
  }

  private submitDraft(text: string) {
    if (!this.draft || !text.trim()) return
    const { from, to, quote } = this.draft
    const id = this.newId()
    this.comments.set(id, { id, ...this.me(), text: text.trim(), anchor: encodeAnchor(this.positions(), from, to), quote })
    this.draft = null
    this.active = `c:${id}`
    this.update()
  }

  // Adds a comment on a range (also used by the file importers' callers).
  addComment(from: number, to: number, text: string): string {
    const id = this.newId()
    const quote = this.o.editor.state.doc.textBetween(from, to, ' ', '▫').slice(0, 200)
    this.comments.set(id, { id, ...this.me(), text, anchor: encodeAnchor(this.positions(), from, to), quote })
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
    if (resolved && this.active === `c:${id}`) this.active = null
  }

  private remove(id: string) {
    const doc = this.comments.doc
    const run = () => {
      for (const c of [...this.comments.values()]) if (c.parent === id) this.comments.delete(c.id)
      this.comments.delete(id)
    }
    if (doc) doc.transact(run)
    else run()
  }

  private editText(id: string, text: string) {
    const c = this.comments.get(id)
    if (c && text.trim()) this.comments.set(id, { ...c, text: text.trim(), edited: Date.now() })
  }

  activate(key: string | null, scroll = true): void {
    if (key !== 'draft' && this.draft) this.draft = null
    this.active = key
    this.update()
    if (scroll && key) {
      const range = key.startsWith('c:') ? this.threads.find((th) => `c:${th.comment.id}` === key)?.range : this.suggestions.find((s) => `s:${s.id}` === key)
      if (range) {
        this.o.editor.commands.setTextSelection(range.from)
        this.o.editor.commands.scrollIntoView()
      }
    }
  }

  // Next / previous comment or suggestion from the current one.
  step(dir: 1 | -1): void {
    const keys = this.items().map((i) => i.key)
    if (!keys.length) return
    const at = this.active ? keys.indexOf(this.active) : -1
    this.panelOpen = true
    this.activate(keys[(at + dir + keys.length) % keys.length] ?? keys[0])
  }

  get count(): number {
    return this.threads.filter((th) => !th.comment.resolved).length + this.suggestions.length
  }

  // ---------- Rail ----------

  private items(): { key: string; pos: number; sig: string; build: () => HTMLElement }[] {
    const items: { key: string; pos: number; sig: string; build: () => HTMLElement }[] = []
    for (const th of this.threads) {
      const key = `c:${th.comment.id}`
      const sig = JSON.stringify([th.comment, th.replies, !!th.range && th.range.from < th.range.to])
      items.push({ key, pos: th.range?.from ?? Number.MAX_SAFE_INTEGER, sig, build: () => this.threadCard(th) })
    }
    for (const group of this.suggestionGroups()) {
      const key = `s:${group[0].id}`
      const sig = JSON.stringify(group.map((s) => [s.kind, s.text, s.author, s.time]))
      items.push({ key, pos: group[0].from, sig, build: () => this.suggestionCard(group) })
    }
    if (this.draft) items.push({ key: 'draft', pos: this.draft.from, sig: 'draft', build: () => this.draftCard() })
    return items.sort((a, b) => a.pos - b.pos)
  }

  private render() {
    const { rail } = this.o
    const items = this.items()
    // Keep what the user is typing in a card across rebuilds.
    const focused = document.activeElement as HTMLTextAreaElement | null
    const focusKey = focused && rail.contains(focused) ? focused.closest<HTMLElement>('.rv-card')?.dataset.key : undefined
    const focusState = focusKey ? { cls: focused!.className, value: focused!.value, start: focused!.selectionStart, end: focused!.selectionEnd } : null

    const keep = new Set(items.map((i) => i.key))
    for (const [key, card] of this.cards) {
      if (!keep.has(key)) {
        card.el.remove()
        this.cards.delete(key)
      }
    }
    for (const item of items) {
      const existing = this.cards.get(item.key)
      if (existing && existing.sig === item.sig) continue
      const node = item.build()
      node.dataset.key = item.key
      if (existing) existing.el.replaceWith(node)
      else rail.append(node)
      this.cards.set(item.key, { el: node, sig: item.sig, top: existing?.top ?? 0 })
      if (focusKey === item.key && focusState) {
        const input = node.querySelector<HTMLTextAreaElement>(`textarea.${focusState.cls.split(' ').join('.')}`)
        if (input) {
          input.value = focusState.value
          input.focus()
          input.setSelectionRange(focusState.start, focusState.end)
        }
      }
    }
    // Document order in the DOM (keyboard and narrow-screen list order).
    // (Only when it changed: moving a card between mousedown and click would cancel the click.)
    const ordered = items.map((item) => this.cards.get(item.key)!.el)
    ordered.forEach((card, i) => card.classList.toggle('active', items[i].key === this.active))
    if (ordered.some((card, i) => rail.children[i] !== card)) rail.append(...ordered)
    const visible = items.length > 0
    if (rail.hidden === visible) {
      rail.hidden = !visible
      this.o.onVisibilityChange()
    }
    rail.classList.toggle('open', this.panelOpen)
    this.reposition()
  }

  // Aligns cards with their text; overlapping cards are pushed down, and the
  // active card keeps its place, pushing earlier ones up.
  reposition(): void {
    const { rail, paper, editor } = this.o
    if (rail.hidden) return
    const narrow = window.innerWidth <= NARROW
    rail.classList.toggle('narrow', narrow)
    const cards = [...this.cards.entries()].map(([key, c]) => ({ key, ...c }))
    if (narrow) {
      cards.forEach((c) => (c.el.style.top = ''))
      return
    }
    const paperTop = paper.getBoundingClientRect().top
    const want = (key: string): number => {
      let pos: number | undefined
      if (key === 'draft') pos = this.draft?.from
      else if (key.startsWith('c:')) {
        const th = this.threads.find((x) => x.comment.id === key.slice(2))
        pos = th?.range?.from
      } else pos = this.suggestions.find((s) => s.id === key.slice(2))?.from
      if (pos === undefined) return Number.MAX_SAFE_INTEGER
      try {
        return editor.view.coordsAtPos(Math.min(pos, editor.state.doc.content.size)).top - paperTop
      } catch {
        return Number.MAX_SAFE_INTEGER
      }
    }
    const dom = [...rail.children]
    const order = new Map(cards.map((c) => [c.key, dom.indexOf(c.el)]))
    const placed = cards.map((c) => ({ ...c, want: want(c.key), height: c.el.offsetHeight }))
    placed.sort((a, b) => a.want - b.want || order.get(a.key)! - order.get(b.key)!)
    let lastBottom = 0
    // Cards whose text is gone go after the others.
    for (const p of placed) {
      if (p.want === Number.MAX_SAFE_INTEGER) p.want = lastBottom
      p.top = Math.max(p.want, lastBottom)
      lastBottom = p.top + p.height + RAIL_GAP
    }
    const activeIndex = placed.findIndex((p) => p.key === this.active)
    if (activeIndex >= 0) {
      const a = placed[activeIndex]
      a.top = Math.max(0, a.want)
      for (let i = activeIndex + 1; i < placed.length; i++) placed[i].top = Math.max(placed[i].top, placed[i - 1].top + placed[i - 1].height + RAIL_GAP)
      for (let i = activeIndex - 1; i >= 0; i--) placed[i].top = Math.min(placed[i].top, placed[i + 1].top - placed[i].height - RAIL_GAP)
    }
    let minTop = 0
    for (const p of placed) minTop = Math.min(minTop, p.top)
    for (const p of placed) {
      p.el.style.top = `${p.top - minTop}px`
      this.cards.get(p.key)!.top = p.top
    }
    rail.style.minHeight = `${lastBottom}px`
  }

  // ---------- Cards ----------

  private header(author: string, color: string, time: number, edited?: number): HTMLElement {
    return el(
      'div',
      { class: 'rv-who' },
      el('span', { class: 'rv-avatar', textContent: (author.trim()[0] ?? '?').toUpperCase(), style: `background:${color}` } as never),
      el('div', { class: 'rv-name' }, el('div', { class: 'rv-author', textContent: author }), el('div', { class: 'rv-time', textContent: formatTime(time) + (edited ? ` · ${t('edited')}` : '') })),
    )
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

  private threadCard(th: CommentThread): HTMLElement {
    const { comment } = th
    const card = el('div', { class: `rv-card rv-comment${comment.resolved ? ' resolved' : ''}` })
    card.style.setProperty('--rv-color', comment.color)
    const head = el('div', { class: 'rv-head' }, this.header(comment.author, comment.color, comment.time, comment.edited))
    if (this.canComment) {
      head.append(
        comment.resolved
          ? this.iconButton(RotateCcw, t('Reopen'), () => this.setResolved(comment.id, false))
          : this.iconButton(Check, t('Resolve'), () => this.setResolved(comment.id, true)),
      )
    }
    const own = comment.authorId === this.userId || (this.canEdit && comment.authorId.startsWith('import:'))
    if (own && this.canComment) head.append(this.iconButton(EllipsisVertical, t('More'), (e) => this.ownMenu(e, comment, card)))
    card.append(head)
    if (!th.range || th.range.from >= th.range.to) card.append(el('div', { class: 'rv-quote', textContent: `${t('Text deleted')}${colon}${quote(comment.quote ?? '')}` }))
    else if (window.innerWidth <= NARROW && comment.quote) card.append(el('div', { class: 'rv-quote', textContent: quote(comment.quote) }))
    card.append(el('div', { class: 'rv-text', textContent: comment.text }))
    for (const r of th.replies) {
      const reply = el('div', { class: 'rv-reply' }, el('div', { class: 'rv-head' }, this.header(r.author, r.color, r.time, r.edited)))
      if (r.authorId === this.userId && this.canComment) reply.firstElementChild!.append(this.iconButton(EllipsisVertical, t('More'), (e) => this.ownMenu(e, r, reply)))
      reply.append(el('div', { class: 'rv-text', textContent: r.text }))
      card.append(reply)
    }
    if (this.canComment && !comment.resolved) {
      const input = el('textarea', { class: 'rv-input rv-reply-input', rows: 1, placeholder: t('Reply…') })
      input.setAttribute('aria-label', t('Reply'))
      const actions = el('div', { class: 'rv-actions' })
      const send = el('button', { type: 'button', class: 'primary', textContent: t('Reply') })
      const cancel = el('button', { type: 'button', textContent: t('Cancel') })
      send.addEventListener('click', () => this.reply(comment.id, input.value))
      cancel.addEventListener('click', () => {
        input.value = ''
        this.activate(null, false)
      })
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) this.reply(comment.id, input.value)
        e.stopPropagation()
      })
      actions.append(cancel, send)
      card.append(input, actions)
      input.addEventListener('focus', () => this.active !== `c:${comment.id}` && this.activate(`c:${comment.id}`, false))
    }
    return card
  }

  private ownMenu(e: MouseEvent, c: CommentRecord, container: HTMLElement) {
    showContextMenu(e.clientX, e.clientY, [
      {
        label: t('Edit'),
        run: () => {
          const text = container.querySelector<HTMLElement>(':scope > .rv-text')
          if (!text) return
          const input = el('textarea', { class: 'rv-input rv-edit-input', value: c.text, rows: 3 })
          const actions = el('div', { class: 'rv-actions' })
          const save = el('button', { type: 'button', class: 'primary', textContent: t('Save') })
          const cancel = el('button', { type: 'button', textContent: t('Cancel') })
          save.addEventListener('click', () => this.editText(c.id, input.value))
          cancel.addEventListener('click', () => this.update())
          input.addEventListener('keydown', (ev) => ev.stopPropagation())
          actions.append(cancel, save)
          text.replaceWith(input, actions)
          input.focus()
        },
      },
      { label: t('Delete'), run: () => this.remove(c.id) },
    ])
  }

  // Suggestions in cards: a deletion next to an insertion by the same person is one replacement.
  private suggestionGroups(): Suggestion[][] {
    const groups: Suggestion[][] = []
    const used = new Set<Suggestion>()
    this.suggestionKeys.clear()
    for (const s of this.suggestions) {
      if (used.has(s)) continue
      used.add(s)
      const partner = this.suggestions.find(
        (o) => !used.has(o) && o.kind !== s.kind && o.authorId === s.authorId && (o.from === s.to || o.to === s.from),
      )
      if (partner) used.add(partner)
      const group = partner ? [s, partner].sort((a) => (a.kind === 'deletion' ? -1 : 1)) : [s]
      for (const g of group) this.suggestionKeys.set(g.id, `s:${group[0].id}`)
      groups.push(group)
    }
    return groups
  }

  private suggestionCard(group: Suggestion[]): HTMLElement {
    const first = group[0]
    const card = el('div', { class: 'rv-card rv-suggestion' })
    card.style.setProperty('--rv-color', first.color)
    const head = el('div', { class: 'rv-head' }, this.header(first.author, first.color, Math.max(...group.map((g) => g.time))))
    const { editor } = this.o
    if (this.canEdit) {
      head.append(
        this.iconButton(Check, t('Accept'), () => group.forEach((g) => editor.commands.acceptSuggestion(g.id))),
        this.iconButton(X, t('Reject'), () => group.forEach((g) => editor.commands.rejectSuggestion(g.id))),
      )
    }
    const clip = (text: string) => quote(text.length > 120 ? `${text.slice(0, 120)}…` : text)
    const body = el('div', { class: 'rv-text' })
    const del = group.find((g) => g.kind === 'deletion')
    const ins = group.find((g) => g.kind === 'insertion')
    if (del && ins) body.append(el('b', { textContent: t('Replace') }), colon, el('del', { textContent: clip(del.text) }), ` ${t('with')} `, el('ins', { textContent: clip(ins.text) }))
    else if (ins) body.append(el('b', { textContent: t('Add') }), colon, el('ins', { textContent: clip(ins.text) }))
    else if (del) body.append(el('b', { textContent: t('Delete') }), colon, el('del', { textContent: clip(del.text) }))
    card.append(head, body)
    return card
  }

  private draftCard(): HTMLElement {
    const me = this.me()
    const card = el('div', { class: 'rv-card rv-draft active' })
    const input = el('textarea', { class: 'rv-input rv-draft-input', rows: 3, placeholder: t('Comment…') })
    input.setAttribute('aria-label', t('Comment'))
    const actions = el('div', { class: 'rv-actions' })
    const ok = el('button', { type: 'button', class: 'primary', textContent: t('Comment') })
    const cancel = el('button', { type: 'button', textContent: t('Cancel') })
    ok.addEventListener('click', () => this.submitDraft(input.value))
    cancel.addEventListener('click', () => {
      this.draft = null
      this.active = null
      this.update()
    })
    input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) this.submitDraft(input.value)
      if (e.key === 'Escape') cancel.click()
    })
    actions.append(cancel, ok)
    card.append(el('div', { class: 'rv-head' }, this.header(me.author, me.color, me.time)), input, actions)
    return card
  }
}

function formatTime(time: number): string {
  if (!time) return ''
  const d = new Date(time)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  return sameDay
    ? d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
