// Left panel list of slides: live thumbnails, the people on each slide,
// drag to reorder, context menu and keyboard navigation.

import { t } from '../../core/i18n'
import { el } from '../../ui/widgets'

export interface SlideListItem {
  id: string
  name: string
}

export interface SlideListActions {
  show(id: string): void
  move(id: string, before: string | null): void
  menu(id: string, x: number, y: number): void
  remove(id: string): void
  duplicate(id: string): void
}

export class SlideList {
  readonly element = el('div', { class: 'slide-list', tabIndex: 0, role: 'listbox' })
  private readonly thumbs = new Map<string, string>()
  // Open comments per slide.
  private comments = new Map<string, number>()
  private items: SlideListItem[] = []
  private current = ''
  private dragging: string | null = null

  constructor(
    private readonly actions: SlideListActions,
    private readonly readOnly: boolean,
  ) {
    this.element.setAttribute('aria-label', t('Slides'))
    this.element.addEventListener('keydown', (e) => {
      const index = this.items.findIndex((i) => i.id === this.current)
      const go = (i: number) => this.items[i] && this.actions.show(this.items[i].id)
      if (e.key === 'ArrowDown' || e.key === 'PageDown') go(index + 1)
      else if (e.key === 'ArrowUp' || e.key === 'PageUp') go(index - 1)
      else if (e.key === 'Home') go(0)
      else if (e.key === 'End') go(this.items.length - 1)
      else if ((e.key === 'Delete' || e.key === 'Backspace') && !readOnly) this.actions.remove(this.current)
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && !readOnly) this.actions.duplicate(this.current)
      else return
      e.preventDefault()
      e.stopPropagation()
    })
  }

  // Rebuilds the list (slides, order, current slide and people).
  update(items: SlideListItem[], current: string, peers: Map<string, { name: string; color: string }[]>): void {
    this.items = items
    this.current = current
    const focused = this.element.contains(document.activeElement)
    this.element.replaceChildren()
    items.forEach((item, index) => {
      const img = el('img', { class: 'slide-thumb-img', alt: '', draggable: false })
      const src = this.thumbs.get(item.id)
      if (src) img.src = src
      const people = el('div', { class: 'slide-thumb-people' })
      for (const user of peers.get(item.id) ?? []) {
        const dot = el('span', { class: 'page-peer', title: user.name })
        dot.style.background = user.color
        people.append(dot)
      }
      const frame = el('div', { class: 'slide-thumb-frame' }, img, people)
      const count = this.comments.get(item.id)
      if (count) {
        const badge = el('span', { class: 'slide-thumb-comments', textContent: String(count) })
        badge.title = t('{n} comments', { n: count })
        frame.append(badge)
      }
      const row = el(
        'div',
        { class: 'slide-thumb', role: 'option', dataset: { id: item.id } },
        el('span', { class: 'slide-thumb-num', textContent: String(index + 1) }),
        frame,
      )
      row.setAttribute('aria-selected', String(item.id === current))
      row.setAttribute('aria-label', t('Slide {n}', { n: index + 1 }))
      row.classList.toggle('active', item.id === current)
      row.addEventListener('click', () => {
        this.element.focus()
        if (item.id !== this.current) this.actions.show(item.id)
      })
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault()
        if (item.id !== this.current) this.actions.show(item.id)
        this.actions.menu(item.id, e.clientX, e.clientY)
      })
      if (!this.readOnly) this.makeDraggable(row, item.id)
      this.element.append(row)
    })
    if (focused) this.element.focus()
    this.element.querySelector('.slide-thumb.active')?.scrollIntoView({ block: 'nearest' })
  }

  setThumb(id: string, url: string): void {
    this.thumbs.set(id, url)
    const img = this.element.querySelector<HTMLImageElement>(`.slide-thumb[data-id="${CSS.escape(id)}"] img`)
    if (img) img.src = url
  }

  // Open comment counts per slide (shown on the thumbnails at the next update).
  setComments(counts: Map<string, number>): void {
    this.comments = counts
  }

  setAspect(width: number, height: number): void {
    this.element.style.setProperty('--slide-aspect', `${width} / ${height}`)
  }

  private makeDraggable(row: HTMLElement, id: string): void {
    row.draggable = true
    row.addEventListener('dragstart', (e) => {
      this.dragging = id
      e.dataTransfer?.setData('text/x-slide', id)
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
      row.classList.add('dragging')
    })
    row.addEventListener('dragend', () => {
      this.dragging = null
      row.classList.remove('dragging')
      this.clearMarks()
    })
    row.addEventListener('dragover', (e) => {
      if (!this.dragging) return
      e.preventDefault()
      const after = this.isAfter(row, e)
      this.clearMarks()
      row.classList.add(after ? 'drop-after' : 'drop-before')
    })
    row.addEventListener('drop', (e) => {
      if (!this.dragging) return
      e.preventDefault()
      const after = this.isAfter(row, e)
      const index = this.items.findIndex((i) => i.id === id)
      const before = after ? (this.items[index + 1]?.id ?? null) : id
      const moved = this.dragging
      this.dragging = null
      this.clearMarks()
      if (before !== moved) this.actions.move(moved, before)
    })
  }

  private isAfter(row: HTMLElement, e: DragEvent): boolean {
    const rect = row.getBoundingClientRect()
    return e.clientY > rect.top + rect.height / 2
  }

  private clearMarks(): void {
    this.element.querySelectorAll('.drop-before, .drop-after').forEach((n) => n.classList.remove('drop-before', 'drop-after'))
  }
}
