// Toolbar component: groups of icon buttons, selects and color buttons on ONE
// row. Groups that do not fit move into a "⋯" (More) menu instead of wrapping to
// a second row; pinned groups stay visible at the right end (e.g. the writer's
// editing mode, the slides' "Present").
//
//   const tb = createToolbar(shell.toolbar)
//   tb.group(tb.button(Undo2, t('Undo'), undo, { shortcut: mod('Z'), enabled: canUndo }), …)
//   tb.group(tb.select(t('Font'), fonts, current, apply, 'tb-font'))
//   tb.group(modeSelect, { pinned: true })
//   editor.on('transaction', tb.refresh)       // re-evaluates active/enabled/value
//
// Groups marked { keep: true } stay usable in read-only documents when the app
// adds the "readonly" class to the toolbar. Read-only is enforced with the real
// `disabled` state on every other control (not only CSS), so it still holds when
// a group moves into the "⋯" overflow panel, which lives outside the toolbar.

import { ChevronDown, Ellipsis, type IconNode } from 'lucide'
import { t } from '../core/i18n'
import { colorPalette, el, icon, openPopover, uiZoom } from './widgets'

export interface ButtonOptions {
  active?: () => boolean
  enabled?: () => boolean
  // Shown in the tooltip: "Bold (Ctrl+B)".
  shortcut?: string
  // Extra class names.
  class?: string
  // Text instead of (or next to) the icon.
  text?: string
}

export interface GroupOptions {
  // Always visible, after the "⋯" button (right end of the row).
  pinned?: boolean
  // Stays enabled in read-only mode.
  keep?: boolean
  class?: string
}

export interface Toolbar {
  element: HTMLElement
  group(...items: (HTMLElement | GroupOptions)[]): HTMLElement
  button(node: IconNode | null, label: string, run: () => void, options?: ButtonOptions): HTMLButtonElement
  select<T extends string>(label: string, options: [T, string][], value: () => T, onChange: (value: T) => void, className?: string): HTMLSelectElement
  colorButton(node: IconNode, label: string, current: () => string | undefined, apply: (color: string | null) => void, resetLabel: string): HTMLButtonElement
  // Re-evaluates active/enabled/value of every control (call after editor transactions).
  refresh(): void
  // Adds an updater run by refresh().
  onRefresh(fn: () => void): void
  // Recomputes which groups fit (after adding or showing groups).
  layout(): void
}

export function createToolbar(container: HTMLElement, { afterAction }: { afterAction?: () => void } = {}): Toolbar {
  container.classList.add('tb-managed')
  const updaters: (() => void)[] = []
  const flowing: HTMLElement[] = []
  const pinnedWrap = el('div', { class: 'tb-pinned' })
  const more = el('button', { type: 'button', class: 'tb-btn tb-more', title: t('More tools'), hidden: true }, icon(Ellipsis))
  more.setAttribute('aria-label', t('More tools'))
  more.setAttribute('aria-haspopup', 'true')
  more.setAttribute('aria-expanded', 'false')
  more.addEventListener('mousedown', (e) => e.preventDefault())
  container.append(more, pinnedWrap)

  let panel: HTMLElement | null = null
  const isReadOnly = () => container.classList.contains('readonly')
  // Disables every control of the non-"keep" groups while the toolbar is read-only.
  const applyReadOnly = () => {
    const ro = isReadOnly()
    panel?.classList.toggle('readonly', ro)
    for (const g of [...flowing, ...pinnedWrap.querySelectorAll<HTMLElement>('.tb-group')]) {
      if (g.classList.contains('tb-keep')) continue
      for (const c of g.querySelectorAll<HTMLButtonElement | HTMLSelectElement | HTMLInputElement>('button, select, input')) {
        if (ro) {
          c.disabled = true
          c.dataset.tbRo = '1'
        } else if (c.dataset.tbRo) {
          delete c.dataset.tbRo
          c.disabled = false
        }
      }
    }
  }
  new MutationObserver(() => {
    applyReadOnly()
    if (!isReadOnly()) for (const u of updaters) u()
  }).observe(container, { attributes: true, attributeFilter: ['class'] })
  const overflowed = () => flowing.filter((g) => g.classList.contains('tb-overflowed'))

  const closePanel = () => {
    if (!panel) return
    for (const g of flowing) container.insertBefore(g, more)
    panel.remove()
    panel = null
    more.setAttribute('aria-expanded', 'false')
    document.removeEventListener('mousedown', outside, true)
  }
  const outside = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (panel?.contains(target) || more.contains(target) || target.closest('.popover, .menu-panel, dialog')) return
    closePanel()
  }
  const openPanel = () => {
    const hidden = overflowed()
    if (!hidden.length) return
    const z = uiZoom()
    panel = el('div', { class: 'menu-panel tb-overflow', role: 'toolbar' })
    panel.classList.toggle('readonly', isReadOnly())
    panel.setAttribute('aria-label', t('More tools'))
    panel.append(...hidden)
    document.body.append(panel)
    const rect = more.getBoundingClientRect()
    const width = panel.getBoundingClientRect().width
    panel.style.left = `${Math.max(4, Math.min(rect.right - width, window.innerWidth - width - 4)) / z}px`
    panel.style.top = `${(rect.bottom + 4) / z}px`
    more.setAttribute('aria-expanded', 'true')
    document.addEventListener('mousedown', outside, true)
    panel.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      closePanel()
      more.focus()
    })
    panel.querySelector<HTMLElement>('button:not(:disabled), select, input')?.focus()
  }
  more.addEventListener('click', () => (panel ? closePanel() : openPanel()))

  // Hides flowing groups from the end until the row fits.
  const layout = () => {
    if (panel) closePanel()
    for (const g of flowing) g.classList.remove('tb-overflowed')
    more.hidden = true
    if (container.scrollWidth <= container.clientWidth + 1) return
    more.hidden = false
    for (let i = flowing.length - 1; i >= 0 && container.scrollWidth > container.clientWidth + 1; i--) flowing[i].classList.add('tb-overflowed')
  }
  let frame = 0
  new ResizeObserver(() => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(layout)
  }).observe(container)
  window.addEventListener('resize', closePanel)

  const tip = (label: string, shortcut?: string) => (shortcut ? `${label} (${shortcut})` : label)

  const toolbar: Toolbar = {
    element: container,
    group(...items) {
      const options = (items.find((i) => !(i instanceof HTMLElement)) ?? {}) as GroupOptions
      const nodes = items.filter((i): i is HTMLElement => i instanceof HTMLElement)
      const g = el('div', { class: ['tb-group', options.keep ? 'tb-keep' : '', options.class ?? ''].join(' ').trim() }, ...nodes)
      if (options.pinned) pinnedWrap.append(g)
      else {
        flowing.push(g)
        container.insertBefore(g, more)
      }
      return g
    },
    button(node, label, run, options = {}) {
      const b = el('button', { type: 'button', class: ['tb-btn', options.text && !node ? 'tb-text' : '', options.class ?? ''].join(' ').trim(), title: tip(label, options.shortcut) })
      if (node) b.append(icon(node))
      if (options.text) b.append(el('span', { textContent: options.text }))
      b.setAttribute('aria-label', label)
      if (options.shortcut) b.setAttribute('aria-keyshortcuts', options.shortcut.replace(/\s/g, ''))
      b.addEventListener('mousedown', (e) => e.preventDefault())
      b.addEventListener('click', () => {
        if (b.disabled) return
        run()
        afterAction?.()
      })
      if (options.active || options.enabled) {
        updaters.push(() => {
          if (options.active) {
            const on = options.active()
            b.classList.toggle('active', on)
            b.setAttribute('aria-pressed', String(on))
          }
          if (options.enabled) b.disabled = !options.enabled()
        })
      }
      return b
    },
    select(label, options, value, onChange, className = '') {
      const s = el('select', { class: `tb-select ${className}`.trim(), title: label })
      s.setAttribute('aria-label', label)
      for (const [v, text] of options) s.append(el('option', { value: v, textContent: text }))
      s.addEventListener('change', () => {
        if (s.disabled) return
        onChange(s.value as (typeof options)[number][0])
        afterAction?.()
      })
      updaters.push(() => {
        if (document.activeElement !== s) s.value = value()
      })
      return s
    },
    colorButton(node, label, current, apply, resetLabel) {
      const b = el('button', { type: 'button', class: 'tb-btn tb-color', title: label }, icon(node), el('span', { class: 'tb-color-bar' }), icon(ChevronDown, 12))
      b.setAttribute('aria-label', label)
      b.setAttribute('aria-haspopup', 'true')
      b.addEventListener('mousedown', (e) => e.preventDefault())
      b.addEventListener('click', () => !b.disabled && openPopover(b, colorPalette(apply, resetLabel)))
      const bar = b.querySelector<HTMLElement>('.tb-color-bar')!
      updaters.push(() => (bar.style.background = current() ?? 'transparent'))
      return b
    },
    refresh() {
      for (const u of updaters) u()
      if (isReadOnly()) applyReadOnly()
    },
    onRefresh(fn) {
      updaters.push(fn)
    },
    layout,
  }
  return toolbar
}
