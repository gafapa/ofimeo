// Small UI building blocks: icons, menu bar, popovers and dialogs.

import { createElement, type IconNode } from 'lucide'
import { t } from '../core/i18n'

export function icon(node: IconNode, size = 18): SVGElement {
  return createElement(node, { width: size, height: size, 'stroke-width': 1.8 })
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string; dataset?: Record<string, string> } = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  const { class: className, dataset, ...rest } = props
  if (className) node.className = className
  if (dataset) Object.assign(node.dataset, dataset)
  Object.assign(node, rest)
  for (const c of children) if (c) node.append(c)
  return node
}

// ---------- Menu bar ----------

export interface MenuItem {
  label: string
  shortcut?: string
  run?: () => void
  active?: () => boolean
  enabled?: () => boolean
  // Evaluated when the menu opens; hidden items (and separators left dangling) are skipped.
  visible?: () => boolean
  submenu?: MenuEntry[]
}
export type MenuEntry = MenuItem | '-'

export interface Menu {
  label: string
  items: MenuEntry[]
}

// UI zoom from the accessibility preferences: fixed positions are given in unzoomed pixels.
export const uiZoom = (): number => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--a11y-ui-zoom')) || 1

const ownRows = (list: HTMLElement) =>
  [...list.children].filter((n): n is HTMLButtonElement => n instanceof HTMLButtonElement && !n.disabled)

function focusRow(list: HTMLElement, index: number): void {
  const rows = ownRows(list)
  rows[index < 0 ? rows.length - 1 : index]?.focus()
}

// Menu bar with mouse and keyboard support (F10 or Alt+Shift+M focuses it;
// arrows move, Enter opens, Escape goes back to where the user was).
export function createMenuBar(container: HTMLElement, menus: Menu[]): void {
  let openIndex = -1
  const buttons: HTMLButtonElement[] = []
  let panel: HTMLElement | null = null
  let returnFocus: HTMLElement | null = null

  container.setAttribute('role', 'menubar')

  const close = () => {
    panel?.remove()
    panel = null
    buttons.forEach((b) => {
      b.classList.remove('open')
      b.setAttribute('aria-expanded', 'false')
    })
    openIndex = -1
  }

  // Keyboard users go back to the editor before a command runs.
  const restore = () => {
    if (returnFocus?.isConnected) returnFocus.focus()
    returnFocus = null
  }

  const focusButton = (index: number) => {
    buttons.forEach((b, i) => (b.tabIndex = i === index ? 0 : -1))
    buttons[index].focus()
  }

  const open = (index: number, focus?: 'first' | 'last') => {
    close()
    openIndex = index
    const button = buttons[index]
    button.classList.add('open')
    button.setAttribute('aria-expanded', 'true')
    const list = renderItems(menus[index].items, close, restore)
    panel = list
    list.classList.add('menu-panel')
    const rect = button.getBoundingClientRect()
    const z = uiZoom()
    list.style.left = `${rect.left / z}px`
    list.style.top = `${(rect.bottom + 2) / z}px`
    list.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        const next = (index + (e.key === 'ArrowLeft' ? -1 : 1) + buttons.length) % buttons.length
        focusButton(next)
        open(next, 'first')
      } else if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        close()
        focusButton(index)
      }
    })
    document.body.append(list)
    keepInViewport(list, z)
    if (focus) focusRow(list, focus === 'first' ? 0 : -1)
  }

  menus.forEach((menu, i) => {
    const button = el('button', { type: 'button', class: 'menubar-item', textContent: menu.label, tabIndex: i ? -1 : 0 })
    button.setAttribute('role', 'menuitem')
    button.setAttribute('aria-haspopup', 'menu')
    button.setAttribute('aria-expanded', 'false')
    button.addEventListener('mousedown', (e) => {
      e.preventDefault() // keep the editor selection
      if (openIndex === i) close()
      else open(i)
    })
    // Clicks without a pointer (assistive technologies).
    button.addEventListener('click', (e) => e.detail === 0 && openIndex !== i && open(i, 'first'))
    button.addEventListener('mouseenter', () => openIndex >= 0 && openIndex !== i && open(i))
    button.addEventListener('keydown', (e) => {
      const n = buttons.length
      const go: Record<string, () => void> = {
        ArrowRight: () => focusButton((i + 1) % n),
        ArrowLeft: () => focusButton((i - 1 + n) % n),
        Home: () => focusButton(0),
        End: () => focusButton(n - 1),
        ArrowDown: () => open(i, 'first'),
        Enter: () => open(i, 'first'),
        ' ': () => open(i, 'first'),
        ArrowUp: () => open(i, 'last'),
        Escape: () => (close(), restore()),
      }
      if (!go[e.key]) return
      e.preventDefault()
      go[e.key]()
    })
    buttons.push(button)
    container.append(button)
  })

  container.addEventListener('focusin', (e) => {
    const from = e.relatedTarget as HTMLElement | null
    if (from && !container.contains(from) && !from.closest('.menu-panel')) returnFocus = from
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close()
    const f10 = e.key === 'F10' && !e.ctrlKey && !e.metaKey && !e.shiftKey
    if ((f10 || (e.altKey && e.shiftKey && e.code === 'KeyM')) && container.isConnected && buttons.length) {
      e.preventDefault()
      focusButton(0)
    }
  })
  document.addEventListener('mousedown', (e) => {
    const target = e.target as Node
    if (panel && !panel.contains(target) && !buttons.some((b) => b.contains(target))) close()
  })
  window.addEventListener('resize', close)
}

// Context menu at the pointer position.
export function showContextMenu(x: number, y: number, items: MenuEntry[]): void {
  document.querySelector('.context-menu')?.remove()
  const previous = document.activeElement as HTMLElement | null
  const close = () => {
    panel.remove()
    document.removeEventListener('mousedown', outside)
  }
  const outside = (e: MouseEvent) => !panel.contains(e.target as Node) && close()
  const panel = renderItems(items, close)
  panel.classList.add('menu-panel', 'context-menu')
  document.body.append(panel)
  const z = uiZoom()
  panel.style.left = `${Math.max(0, Math.min(x, window.innerWidth - panel.offsetWidth * z - 8)) / z}px`
  panel.style.top = `${Math.max(0, Math.min(y, window.innerHeight - panel.offsetHeight * z - 8)) / z}px`
  setTimeout(() => document.addEventListener('mousedown', outside))
  panel.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' && e.key !== 'Tab') return
    e.preventDefault()
    close()
    previous?.focus()
  })
  document.addEventListener('keydown', (e) => e.key === 'Escape' && close(), { once: true })
  // Opened from a button (keyboard or "more" buttons): move focus into the menu.
  if (previous instanceof HTMLButtonElement) focusRow(panel, 0)
}

// Moves a fixed menu panel left so it stays inside the viewport (long labels, phones).
function keepInViewport(panel: HTMLElement, z: number): void {
  const r = panel.getBoundingClientRect()
  if (r.right > window.innerWidth - 4) panel.style.left = `${Math.max(4, window.innerWidth - r.width - 4) / z}px`
}

// Key names as printed on the user's keyboard (Shift → Mayús, Enter → Intro, Ctrl → Strg…).
export function shortcutLabel(shortcut: string): string {
  const names: Record<string, string> = { Ctrl: t('Ctrl'), Shift: t('Shift'), Enter: t('Enter'), Del: t('Del'), Arrow: t('Arrow'), Wheel: t('Wheel') }
  return shortcut.replace(/\b(Ctrl|Shift|Enter|Del|Arrow|Wheel)\b/g, (k) => names[k])
}

function submenuEnabled(items: MenuEntry[]): boolean {
  const entries = visibleEntries(items).filter((e): e is Exclude<MenuEntry, '-'> => e !== '-')
  return !entries.length || entries.some((e) => (e.enabled ? e.enabled() : e.submenu ? submenuEnabled(e.submenu) : true))
}

// Drops hidden items, then leading, trailing and repeated separators.
function visibleEntries(items: MenuEntry[]): MenuEntry[] {
  const out: MenuEntry[] = []
  for (const item of items) {
    if (item === '-') {
      if (out.length && out[out.length - 1] !== '-') out.push(item)
    } else if (!item.visible || item.visible()) out.push(item)
  }
  if (out[out.length - 1] === '-') out.pop()
  return out
}

function renderItems(items: MenuEntry[], close: () => void, beforeRun = () => {}, parentRow?: HTMLElement): HTMLElement {
  const list = el('div', { class: 'menu-list', role: 'menu' })
  let submenu: HTMLElement | null = null
  const openSubmenu = (row: HTMLElement, entries: MenuEntry[], focus: boolean) => {
    submenu?.remove()
    submenu = renderItems(entries, close, beforeRun, row)
    submenu.classList.add('menu-panel')
    const rect = row.getBoundingClientRect()
    const z = uiZoom()
    submenu.style.left = `${(rect.right - 2) / z}px`
    submenu.style.top = `${(rect.top - 4) / z}px`
    row.setAttribute('aria-expanded', 'true')
    list.append(submenu)
    // No room on the right: open on the left side of the parent instead of
    // sliding over it (menus near the right edge of the window).
    const width = submenu.getBoundingClientRect().width
    if (rect.right + width > window.innerWidth - 4 && rect.left - width >= 4) submenu.style.left = `${(rect.left - width + 2) / z}px`
    keepInViewport(submenu, z)
    if (focus) focusRow(submenu, 0)
  }
  for (const item of visibleEntries(items)) {
    if (item === '-') {
      list.append(el('div', { class: 'menu-sep', role: 'separator' }))
      continue
    }
    // A submenu whose items are all disabled is disabled itself.
    const enabled = item.enabled ? item.enabled() : item.submenu ? submenuEnabled(item.submenu) : true
    const checked = item.active?.()
    const row = el(
      'button',
      { type: 'button', class: 'menu-row', disabled: !enabled, tabIndex: -1 },
      el('span', { class: 'menu-check', textContent: checked ? '✓' : '' }),
      el('span', { class: 'menu-label', textContent: item.label }),
      el('span', { class: 'menu-shortcut', textContent: item.submenu ? '▸' : shortcutLabel(item.shortcut ?? '') }),
    )
    row.setAttribute('role', item.active ? 'menuitemcheckbox' : 'menuitem')
    if (item.active) row.setAttribute('aria-checked', String(!!checked))
    if (item.shortcut) row.setAttribute('aria-keyshortcuts', item.shortcut.replace(/\s/g, ''))
    row.addEventListener('mousedown', (e) => e.preventDefault())
    if (item.submenu) {
      row.setAttribute('aria-haspopup', 'menu')
      row.setAttribute('aria-expanded', 'false')
      row.addEventListener('mouseenter', () => openSubmenu(row, item.submenu!, false))
      row.addEventListener('click', (e) => e.detail === 0 && openSubmenu(row, item.submenu!, true))
      row.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        e.stopPropagation()
        openSubmenu(row, item.submenu!, true)
      })
    } else {
      row.addEventListener('mouseenter', () => {
        submenu?.remove()
        submenu = null
      })
      row.addEventListener('click', () => {
        close()
        beforeRun()
        item.run?.()
      })
    }
    list.append(row)
  }
  list.addEventListener('keydown', (e) => {
    const rows = ownRows(list)
    const current = rows.indexOf(document.activeElement as HTMLButtonElement)
    if (current < 0) return // handled by a submenu
    const next = { ArrowDown: (current + 1) % rows.length, ArrowUp: (current - 1 + rows.length) % rows.length, Home: 0, End: rows.length - 1 }[e.key]
    if (next !== undefined) {
      e.preventDefault()
      e.stopPropagation()
      rows[next].focus()
    } else if (parentRow && (e.key === 'ArrowLeft' || e.key === 'Escape')) {
      e.preventDefault()
      e.stopPropagation()
      list.remove()
      parentRow.setAttribute('aria-expanded', 'false')
      parentRow.focus()
    }
  })
  return list
}

// ---------- Popovers ----------

let activePopover: { el: HTMLElement; anchor: HTMLElement } | null = null

export function closePopover(): void {
  activePopover?.el.remove()
  activePopover = null
}

export function openPopover(anchor: HTMLElement, content: HTMLElement): void {
  if (activePopover?.anchor === anchor) return closePopover()
  closePopover()
  const pop = el('div', { class: 'popover' }, content)
  document.body.append(pop)
  const rect = anchor.getBoundingClientRect()
  const z = uiZoom()
  const left = Math.min(rect.left, window.innerWidth - pop.offsetWidth * z - 8)
  pop.style.left = `${Math.max(8, left) / z}px`
  pop.style.top = `${(rect.bottom + 4) / z}px`
  activePopover = { el: pop, anchor }
  // Keyboard: focus moves into the popover; Tab past either end or Escape returns to the anchor.
  const focusable = () => [...pop.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
  pop.addEventListener('keydown', (e) => {
    const items = focusable()
    const edge = e.shiftKey ? items[0] : items[items.length - 1]
    if (e.key === 'Escape' || (e.key === 'Tab' && document.activeElement === edge)) {
      e.preventDefault()
      e.stopPropagation()
      closePopover()
      anchor.focus()
    }
  })
  if (document.activeElement === anchor || anchor.contains(document.activeElement)) focusable()[0]?.focus()
}

document.addEventListener('mousedown', (e) => {
  const target = e.target as Node
  if (activePopover && !activePopover.el.contains(target) && !activePopover.anchor.contains(target)) closePopover()
})
document.addEventListener('keydown', (e) => e.key === 'Escape' && closePopover())

const PALETTE = [
  ['#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff'],
  ['#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff'],
  ['#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc'],
  ['#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd'],
  ['#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#3d85c6', '#674ea7', '#a64d79'],
  ['#5b0f00', '#660000', '#783f04', '#7f6000', '#274e13', '#0c343d', '#1c4587', '#073763', '#20124d', '#4c1130'],
]

export function colorPalette(onPick: (color: string | null) => void, resetLabel: string): HTMLElement {
  const wrap = el('div', { class: 'palette' })
  const reset = el('button', { type: 'button', class: 'palette-reset', textContent: resetLabel })
  reset.addEventListener('mousedown', (e) => e.preventDefault())
  reset.addEventListener('click', () => {
    closePopover()
    onPick(null)
  })
  wrap.append(reset)
  const grid = el('div', { class: 'palette-grid' })
  for (const row of PALETTE) {
    for (const color of row) {
      const swatch = el('button', { type: 'button', class: 'swatch', title: color })
      swatch.style.background = color
      swatch.addEventListener('mousedown', (e) => e.preventDefault())
      swatch.addEventListener('click', () => {
        closePopover()
        onPick(color)
      })
      grid.append(swatch)
    }
  }
  const custom = el('input', { type: 'color', class: 'palette-custom', title: t('Custom color') })
  custom.addEventListener('change', () => {
    closePopover()
    onPick(custom.value)
  })
  wrap.append(grid, el('label', { class: 'palette-custom-row' }, t('Custom…'), ' ', custom))
  return wrap
}

export function tableGrid(onPick: (rows: number, cols: number) => void, size = 10): HTMLElement {
  const label = el('div', { class: 'table-size', textContent: t('Insert table') })
  const grid = el('div', { class: 'table-grid' })
  grid.style.gridTemplateColumns = `repeat(${size}, 16px)`
  const cells: HTMLElement[] = []
  for (let r = 1; r <= size; r++) {
    for (let c = 1; c <= size; c++) {
      const cell = el('button', { type: 'button', dataset: { r: String(r), c: String(c) } })
      cell.setAttribute('aria-label', `${r} × ${c}`)
      cells.push(cell)
      grid.append(cell)
    }
  }
  grid.addEventListener('mouseover', (e) => {
    const t = e.target as HTMLElement
    if (!t.dataset.r) return
    const r = Number(t.dataset.r)
    const c = Number(t.dataset.c)
    cells.forEach((x) => x.classList.toggle('on', Number(x.dataset.r) <= r && Number(x.dataset.c) <= c))
    label.textContent = `${r} × ${c}`
  })
  grid.addEventListener('mousedown', (e) => e.preventDefault())
  grid.addEventListener('click', (e) => {
    const t = e.target as HTMLElement
    if (!t.dataset.r) return
    closePopover()
    onPick(Number(t.dataset.r), Number(t.dataset.c))
  })
  return el('div', {}, label, grid)
}

// ---------- Dialogs ----------

export interface DialogButton {
  label: string
  primary?: boolean
  // Destructive action (red); combine with primary for the default button.
  danger?: boolean
  value: string
}

let dialogCount = 0

// Shows a modal dialog; resolves with the pressed button value ('' when dismissed).
// help: a help center article id (src/help/articles/types.ts) for a "?" button next to the title.
export function showDialog(title: string, body: HTMLElement, buttons: DialogButton[], wide = false, help?: string): Promise<string> {
  return new Promise((resolve) => {
    const dialog = el('dialog', { class: wide ? 'dlg wide' : 'dlg' })
    const form = el('form', { method: 'dialog' })
    const actions = el('div', { class: 'dlg-actions' })
    for (const b of buttons) actions.append(el('button', { value: b.value, textContent: b.label, class: [b.primary ? 'primary' : '', b.danger ? 'danger' : ''].join(' ').trim() }))
    const heading = el('h2', { textContent: title, id: `dlg-title-${++dialogCount}` })
    dialog.setAttribute('aria-labelledby', heading.id)
    form.append(help ? el('div', { class: 'dlg-head' }, heading, helpButton(help)) : heading, body, actions)
    dialog.append(form)
    document.body.append(dialog)
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue)
      dialog.remove()
    })
    dialog.showModal()
    body.querySelector<HTMLElement>('input, textarea, select')?.focus()
  })
}

// "?" button of a dialog: opens the help center at an article (loaded on demand).
function helpButton(article: string): HTMLButtonElement {
  const button = el('button', { type: 'button', class: 'dlg-help', textContent: '?', title: t('Help') })
  button.setAttribute('aria-label', t('Help about this'))
  button.addEventListener('click', () => void import('../help/center').then((m) => m.openHelp(article)))
  return button
}

export async function promptText(title: string, label: string, value = '', multiline = false): Promise<string | null> {
  const input = multiline
    ? el('textarea', { value, rows: 4, class: 'field' })
    : el('input', { value, class: 'field' })
  const body = el('label', { class: 'field-label' }, label, input)
  if (!multiline) {
    input.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') {
        e.preventDefault()
        ;(input.closest('dialog') as HTMLDialogElement).close('ok')
      }
    })
  }
  const result = await showDialog(title, body, [
    { label: t('Cancel'), value: 'cancel' },
    { label: t('OK'), value: 'ok', primary: true },
  ])
  return result === 'ok' ? input.value : null
}

// Themed replacement for window.confirm(): resolves true when confirmed.
//   if (!(await confirmDialog(title, question, { confirmLabel: deleteLabel, danger: true }))) return
export async function confirmDialog(
  title: string,
  text = '',
  { confirmLabel = t('OK'), cancelLabel = t('Cancel'), danger = false }: { confirmLabel?: string; cancelLabel?: string; danger?: boolean } = {},
): Promise<boolean> {
  const body = el('div', { class: 'confirm-body' }, text ? el('p', { textContent: text }) : null)
  const result = await showDialog(title, body, [
    { label: cancelLabel, value: 'cancel' },
    { label: confirmLabel, value: 'ok', primary: true, danger },
  ])
  return result === 'ok'
}

let toastTimer = 0
export function toast(message: string): void {
  let node = document.getElementById('toast')
  if (!node) {
    node = el('div', { id: 'toast', class: 'toast' })
    document.body.append(node)
  }
  node.textContent = message
  node.hidden = false
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (node!.hidden = true), 3000)
}
