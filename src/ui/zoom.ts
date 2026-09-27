// Shared zoom control for the status bar: "− [100 % ▾] +". The value opens the
// presets (and "Fit" when the app supports it). The same target also builds the
// View ▸ Zoom submenu, so both always agree.
//
//   const zoom: ZoomTarget = { get: () => z, set: (v) => apply(v), fit: () => apply(0), isFit: () => z === 0 }
//   const control = createZoomControl(zoom)   // control.update() after the zoom changes elsewhere
//   { label: t('Zoom'), submenu: zoomMenuItems(zoom) }

import { Minus, Plus } from 'lucide'
import { locale, t } from '../core/i18n'
import { el, icon, showContextMenu, uiZoom, type MenuEntry } from './widgets'

export interface ZoomTarget {
  // Current zoom factor (1 = 100 %), as displayed.
  get(): number
  set(zoom: number): void
  // "Fit" (to width, page or content), when the app has it.
  fit?: () => void
  // True while the zoom follows the window (fit mode).
  isFit?: () => boolean
  min?: number // default 0.25
  max?: number // default 4
  presets?: number[] // default 50…200 %
  // The app handles Ctrl++ / Ctrl+- (shown in the menu).
  keys?: boolean
}

export interface ZoomControl {
  element: HTMLElement
  // Refreshes the displayed value (call after the zoom changed by other means).
  update(): void
}

const DEFAULT_PRESETS = [0.5, 0.75, 0.9, 1, 1.25, 1.5, 2]

export const formatZoom = (zoom: number): string => `${Math.round(zoom * 100).toLocaleString(locale)} %`

// Next preset up or down from the current value (clamped to min/max).
export function stepZoom(target: ZoomTarget, dir: 1 | -1): void {
  const presets = target.presets ?? DEFAULT_PRESETS
  const current = target.get()
  const next = dir > 0 ? presets.find((p) => p > current + 0.001) : [...presets].reverse().find((p) => p < current - 0.001)
  const value = next ?? current * (dir > 0 ? 1.25 : 0.8)
  target.set(Math.min(target.max ?? 4, Math.max(target.min ?? 0.25, value)))
}

export function zoomMenuItems(target: ZoomTarget): MenuEntry[] {
  const presets = target.presets ?? DEFAULT_PRESETS
  const fit = () => target.isFit?.() ?? false
  return [
    { label: t('Zoom in'), shortcut: target.keys ? 'Ctrl++' : undefined, run: () => stepZoom(target, 1) },
    { label: t('Zoom out'), shortcut: target.keys ? 'Ctrl+-' : undefined, run: () => stepZoom(target, -1) },
    '-',
    ...presets.map((z) => ({ label: formatZoom(z), run: () => target.set(z), active: () => !fit() && Math.abs(target.get() - z) < 0.005 })),
    ...(target.fit ? ['-' as const, { label: t('Fit'), run: target.fit, active: () => target.isFit?.() ?? false }] : []),
  ]
}

export function createZoomControl(target: ZoomTarget): ZoomControl {
  const minus = el('button', { type: 'button', class: 'zoom-step', title: t('Zoom out') }, icon(Minus, 14))
  const plus = el('button', { type: 'button', class: 'zoom-step', title: t('Zoom in') }, icon(Plus, 14))
  minus.setAttribute('aria-label', t('Zoom out'))
  plus.setAttribute('aria-label', t('Zoom in'))
  const value = el('button', { type: 'button', class: 'zoom-value', title: t('Zoom') })
  value.setAttribute('aria-haspopup', 'menu')
  for (const b of [minus, plus, value]) b.addEventListener('mousedown', (e) => e.preventDefault())
  minus.addEventListener('click', () => (stepZoom(target, -1), update()))
  plus.addEventListener('click', () => (stepZoom(target, 1), update()))
  value.addEventListener('click', () => {
    const rect = value.getBoundingClientRect()
    const items = zoomMenuItems(target).slice(3).map((item) => (item === '-' ? item : { ...item, run: () => (item.run?.(), update()) }))
    showContextMenu(rect.left, rect.top, items)
    // Opens upwards from the status bar.
    const menu = document.querySelector<HTMLElement>('.context-menu')
    if (menu) menu.style.top = `${Math.max(4, rect.top - menu.getBoundingClientRect().height - 4) / uiZoom()}px`
  })
  const element = el('div', { class: 'zoom-control', role: 'group' }, minus, value, plus)
  element.setAttribute('aria-label', t('Zoom'))
  const update = () => {
    const fit = target.isFit?.() ?? false
    value.textContent = fit ? t('Fit') : formatZoom(target.get())
    value.setAttribute('aria-label', `${t('Zoom')}: ${value.textContent}`)
    minus.disabled = target.get() <= (target.min ?? 0.25) + 0.001
    plus.disabled = target.get() >= (target.max ?? 4) - 0.001
  }
  update()
  return { element, update }
}
