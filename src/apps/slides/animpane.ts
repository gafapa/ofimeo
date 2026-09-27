// Animation pane: the current slide's transition and the list of its object
// animations (add, edit, reorder by drag or buttons, remove, preview), plus
// numbered badges on the animated objects of the canvas.

import type { Cell } from '@maxgraph/core'
import { InternalEvent } from '@maxgraph/core'
import { ArrowDown, ArrowUp, Play, Trash2, X } from 'lucide'
import type * as Y from 'yjs'
import { t } from '../../core/i18n'
import { el, icon, showContextMenu, type MenuEntry } from '../../ui/widgets'
import type { EditorGraph } from '../diagram/graph'
import {
  DIRECTION_NAMES,
  EFFECTS,
  KIND_NAMES,
  TRANSITION_NAMES,
  TRIGGER_NAMES,
  addAnimation,
  animationsMap,
  defaultDuration,
  effectName,
  hasDirection,
  moveAnimation,
  readAnimations,
  removeAnimation,
  timeline,
  updateAnimation,
  type AnimEffect,
  type AnimKind,
  type Animation,
  type Direction,
  type TransitionType,
  type Trigger,
} from './animations'
import { readSlideMeta, writeSlideMeta } from './model'

export interface AnimPaneHost {
  doc: Y.Doc
  graph: EditorGraph
  canvas: HTMLElement
  readOnly: boolean
  page(): string
  // Writes the blank first slide before the first edit (see DiagramSync.materialize).
  materialize(): void
  preview(): void
  onToggle(): void
}

export class AnimationPane {
  readonly element = el('aside', { class: 'slides-side slides-anim-pane', hidden: true })
  private readonly badges = el('div', { class: 'slides-anim-badges' })
  private observed: Y.Map<unknown> | null = null
  private frame = 0
  private readonly onChange = () => this.schedule()

  constructor(private readonly host: AnimPaneHost) {
    this.element.setAttribute('aria-label', t('Animations'))
    host.canvas.append(this.badges)
    const { graph } = host
    graph.getSelectionModel().addListener(InternalEvent.CHANGE, this.onChange)
    graph.getDataModel().addListener(InternalEvent.CHANGE, this.onChange)
    for (const event of [InternalEvent.SCALE, InternalEvent.TRANSLATE, InternalEvent.SCALE_AND_TRANSLATE]) graph.view.addListener(event, () => this.placeBadges())
    this.pageShown()
  }

  get visible(): boolean {
    return !this.element.hidden
  }

  toggle(show = this.element.hidden): void {
    this.element.hidden = !show
    this.host.onToggle()
    this.render()
  }

  // Follows the shown slide's animations.
  pageShown(): void {
    this.observed?.unobserveDeep(this.onChange)
    this.observed = animationsMap(this.host.doc, this.host.page()) as unknown as Y.Map<unknown>
    this.observed.observeDeep(this.onChange)
    this.schedule()
  }

  // Slide settings changed (transition).
  schedule(): void {
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => this.render())
  }

  private anims(): Animation[] {
    return readAnimations(this.host.doc, this.host.page())
  }

  private cellIds(): Set<string> {
    return new Set(this.topCells().map((c) => c.getId()!))
  }

  private topCells(): Cell[] {
    const graph = this.host.graph
    const root = graph.getDataModel().getRoot()
    const out: Cell[] = []
    if (!root) return out
    for (let i = 0; i < root.getChildCount(); i++) {
      const layer = root.getChildAt(i)
      for (let j = 0; j < layer.getChildCount(); j++) out.push(layer.getChildAt(j))
    }
    return out
  }

  // The selected objects, as top-level cells of the slide.
  private selectedTop(): Cell[] {
    const graph = this.host.graph
    const out = new Set<Cell>()
    for (let cell of graph.getSelectionCells()) {
      while (cell.getParent() && cell.getParent()!.getParent() && cell.getParent()!.getParent()!.getParent()) cell = cell.getParent()!
      out.add(cell)
    }
    return [...out]
  }

  private label(cellId: string): string {
    const cell = this.host.graph.getDataModel().getCell(cellId)
    if (!cell) return t('(deleted object)')
    const text = htmlText(String(cell.getValue() ?? '')).trim()
    if (text) return text.length > 40 ? `${text.slice(0, 40)}…` : text
    const style = (cell.getStyle() ?? {}) as Record<string, unknown>
    if (style.shape === 'image') return t('Picture')
    if (cell.isEdge()) return t('Line')
    if (String(style.slideTable ?? '') === '1') return t('Table')
    return t('Shape')
  }

  add(kind: AnimKind, effect: AnimEffect): void {
    if (this.host.readOnly) return
    const cells = this.selectedTop()
    if (!cells.length) return
    this.host.materialize()
    const page = this.host.page()
    cells.forEach((cell, i) =>
      addAnimation(this.host.doc, page, {
        cell: cell.getId()!,
        kind,
        effect,
        trigger: i === 0 ? 'click' : 'with',
        duration: defaultDuration(effect),
        delay: 0,
        direction: 'left',
      }),
    )
  }

  addMenu(x: number, y: number): void {
    const entries: MenuEntry[] = (['entrance', 'emphasis', 'exit'] as AnimKind[]).map((kind) => ({
      label: KIND_NAMES[kind],
      submenu: EFFECTS[kind].map((effect) => ({ label: effectName(kind, effect), run: () => this.add(kind, effect) })),
    }))
    showContextMenu(x, y, entries)
  }

  render(): void {
    this.placeBadges()
    if (this.element.hidden) return
    const { doc, readOnly } = this.host
    const page = this.host.page()
    const anims = this.anims()
    const cells = this.cellIds()
    const tl = timeline(anims, cells)
    const meta = readSlideMeta(doc, page)
    // Keep focus in a field that is being edited.
    const focused = document.activeElement as HTMLElement | null
    const focusKey = focused && this.element.contains(focused) ? focused.dataset.key : undefined

    const head = el('div', { class: 'slides-side-head' }, el('h3', { textContent: t('Animations') }))
    const close = el('button', { type: 'button', class: 'slides-side-close', title: t('Close') }, icon(X, 16))
    close.setAttribute('aria-label', t('Close'))
    close.addEventListener('click', () => this.toggle(false))
    head.append(close)

    // Transition of the slide.
    const transition = el('select', { class: 'fmt-select', disabled: readOnly })
    transition.dataset.key = 'transition'
    for (const [id, name] of Object.entries(TRANSITION_NAMES)) transition.append(el('option', { value: id, textContent: name }))
    transition.value = meta.transition && meta.transition in TRANSITION_NAMES ? meta.transition : 'none'
    transition.addEventListener('change', () => {
      this.host.materialize()
      writeSlideMeta(doc, page, { transition: transition.value === 'none' ? null : transition.value })
    })
    const tDuration = seconds(Number(meta.transitionDuration) || 500, readOnly, (ms) => {
      this.host.materialize()
      writeSlideMeta(doc, page, { transitionDuration: String(ms) })
    })
    tDuration.dataset.key = 'transition-duration'
    const transitionSection = el(
      'section',
      { class: 'fmt-section' },
      el('h3', { textContent: t('Slide transition') }),
      el('label', { class: 'fmt-row' }, el('span', { class: 'fmt-label', textContent: t('Effect') }), transition),
      el('label', { class: 'fmt-row' }, el('span', { class: 'fmt-label', textContent: t('Duration (s)') }), tDuration),
    )

    // Add animation.
    const addBtn = el('button', { type: 'button', class: 'fmt-btn primary', textContent: t('Add animation…'), disabled: readOnly || !this.selectedTop().length })
    addBtn.addEventListener('click', () => {
      const r = addBtn.getBoundingClientRect()
      this.addMenu(r.left, r.bottom)
    })
    const preview = el('button', { type: 'button', class: 'fmt-btn' }, icon(Play, 14), el('span', { textContent: t('Preview') }))
    preview.addEventListener('click', () => this.host.preview())
    const actions = el('div', { class: 'slides-anim-actions' }, addBtn, preview)

    // The list, numbered by click step.
    const list = el('ol', { class: 'slides-anim-list' })
    const stepOf = new Map<string, number>()
    tl.steps.forEach((step, i) => step.effects.forEach(({ anim }) => stepOf.set(anim.id, tl.auto ? i : i + 1)))
    const selected = new Set(this.host.graph.getSelectionCells().map((c) => c.getId()))
    for (const [index, a] of anims.entries()) {
      const row = el('li', { class: `slides-anim-item slides-anim-${a.kind}` })
      row.classList.toggle('selected', selected.has(a.cell))
      row.classList.toggle('missing', !cells.has(a.cell))
      row.draggable = !readOnly
      row.dataset.id = a.id
      const num = el('span', { class: 'slides-anim-num', textContent: stepOf.has(a.id) ? String(stepOf.get(a.id)) : '–' })
      num.title = TRIGGER_NAMES[a.trigger]
      const name = el('button', { type: 'button', class: 'slides-anim-name' }, el('b', { textContent: effectName(a.kind, a.effect) }), el('span', { textContent: this.label(a.cell) }))
      name.addEventListener('click', () => {
        const cell = this.host.graph.getDataModel().getCell(a.cell)
        if (cell && !readOnly) this.host.graph.setSelectionCell(cell)
      })
      const up = iconButton(ArrowUp, t('Move up'), readOnly || index === 0, () => moveAnimation(doc, page, a.id, anims[index - 1].id))
      const down = iconButton(ArrowDown, t('Move down'), readOnly || index === anims.length - 1, () => moveAnimation(doc, page, a.id, anims[index + 2]?.id ?? null))
      const del = iconButton(Trash2, t('Remove'), readOnly, () => removeAnimation(doc, page, a.id))
      const top = el('div', { class: 'slides-anim-top' }, num, name, up, down, del)

      const trigger = select(Object.entries(TRIGGER_NAMES) as [Trigger, string][], a.trigger, readOnly, (v) => updateAnimation(doc, page, a.id, { trigger: v as Trigger }))
      trigger.dataset.key = `${a.id}:trigger`
      trigger.setAttribute('aria-label', t('Start'))
      const effect = select(EFFECTS[a.kind].map((e) => [e, effectName(a.kind, e)]), a.effect, readOnly, (v) => updateAnimation(doc, page, a.id, { effect: v as AnimEffect }))
      effect.dataset.key = `${a.id}:effect`
      effect.setAttribute('aria-label', t('Effect'))
      const duration = seconds(a.duration, readOnly || a.effect === 'appear', (ms) => updateAnimation(doc, page, a.id, { duration: ms }))
      duration.dataset.key = `${a.id}:duration`
      duration.setAttribute('aria-label', t('Duration (s)'))
      const delay = seconds(a.delay, readOnly, (ms) => updateAnimation(doc, page, a.id, { delay: ms }))
      delay.dataset.key = `${a.id}:delay`
      delay.setAttribute('aria-label', t('Delay (s)'))
      const fields = el(
        'div',
        { class: 'slides-anim-fields' },
        field(t('Start'), trigger),
        field(t('Effect'), effect),
        field(t('Duration (s)'), duration),
        field(t('Delay (s)'), delay),
      )
      if (hasDirection(a.effect)) {
        const dir = select(Object.entries(DIRECTION_NAMES) as [Direction, string][], a.direction, readOnly, (v) => updateAnimation(doc, page, a.id, { direction: v as Direction }))
        dir.dataset.key = `${a.id}:direction`
        dir.setAttribute('aria-label', t('Direction'))
        fields.append(field(t('Direction'), dir))
      }
      row.append(top, fields)
      // Drag to reorder.
      row.addEventListener('dragstart', (e) => {
        e.dataTransfer?.setData('text/x-anim', a.id)
        row.classList.add('dragging')
      })
      row.addEventListener('dragend', () => row.classList.remove('dragging'))
      row.addEventListener('dragover', (e) => {
        if (!e.dataTransfer?.types.includes('text/x-anim')) return
        e.preventDefault()
        const after = e.offsetY > row.offsetHeight / 2
        row.classList.toggle('drop-before', !after)
        row.classList.toggle('drop-after', after)
      })
      row.addEventListener('dragleave', () => row.classList.remove('drop-before', 'drop-after'))
      row.addEventListener('drop', (e) => {
        e.preventDefault()
        const id = e.dataTransfer?.getData('text/x-anim')
        const after = row.classList.contains('drop-after')
        row.classList.remove('drop-before', 'drop-after')
        if (!id || id === a.id) return
        moveAnimation(doc, page, id, after ? (anims[index + 1]?.id ?? null) : a.id)
      })
      list.append(row)
    }
    const empty = el('p', { class: 'fmt-hint', textContent: readOnly ? t('This slide has no animations.') : t('Select an object on the slide, then add an animation.') })
    const animSection = el('section', { class: 'fmt-section' }, el('h3', { textContent: t('Object animations') }), actions, anims.length ? list : empty)
    this.element.replaceChildren(head, transitionSection, animSection)
    if (focusKey) this.element.querySelector<HTMLElement>(`[data-key="${CSS.escape(focusKey)}"]`)?.focus()
  }

  // Step numbers next to the animated objects on the canvas.
  private placeBadges(): void {
    this.badges.replaceChildren()
    if (this.element.hidden) return
    const { graph } = this.host
    const anims = this.anims()
    const tl = timeline(anims, this.cellIds())
    const byCell = new Map<string, string[]>()
    tl.steps.forEach((step, i) => step.effects.forEach(({ anim }) => byCell.set(anim.cell, [...(byCell.get(anim.cell) ?? []), String(tl.auto ? i : i + 1)])))
    for (const [cellId, nums] of byCell) {
      const cell = graph.getDataModel().getCell(cellId)
      const state = cell ? graph.view.getState(cell) : null
      if (!state) continue
      const b = el('span', { class: 'slides-anim-badge', textContent: [...new Set(nums)].join(',') })
      b.style.left = `${state.x - 4}px`
      b.style.top = `${state.y - 4}px`
      this.badges.append(b)
    }
  }
}

function htmlText(html: string): string {
  if (!/[<&]/.test(html)) return html
  const box = document.createElement('div')
  box.innerHTML = html
  return box.textContent ?? ''
}

function iconButton(node: Parameters<typeof icon>[0], title: string, disabled: boolean, run: () => void): HTMLButtonElement {
  const b = el('button', { type: 'button', class: 'slides-icon-btn', title, disabled }, icon(node, 14))
  b.setAttribute('aria-label', title)
  b.addEventListener('click', run)
  return b
}

function select(options: [string, string][], value: string, disabled: boolean, apply: (v: string) => void): HTMLSelectElement {
  const s = el('select', { class: 'fmt-select', disabled })
  for (const [v, label] of options) s.append(el('option', { value: v, textContent: label }))
  s.value = value
  s.addEventListener('change', () => apply(s.value))
  return s
}

function seconds(ms: number, disabled: boolean, apply: (ms: number) => void): HTMLInputElement {
  const input = el('input', { type: 'number', class: 'fmt-number', min: '0', max: '60', step: '0.1', value: String(Math.round(ms / 100) / 10), disabled })
  input.addEventListener('change', () => {
    const v = Number(input.value)
    if (Number.isFinite(v) && v >= 0) apply(Math.round(Math.min(60, v) * 1000))
  })
  input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur())
  return input
}

function field(label: string, control: HTMLElement): HTMLElement {
  return el('label', { class: 'fmt-cell' }, control, el('span', { textContent: label }))
}
