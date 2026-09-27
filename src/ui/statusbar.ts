// Shared status bar: app information on the left; on the right, the app's extra
// items, then the language, the save state and the zoom control, always in
// that order.
//
//   const status = createStatusBar(shell, { zoom })
//   status.left.append(pageInfo, wordCount)        // or status.setInfo('Slide 1 of 3')
//   status.addRight(suggestingBadge)               // before language / save / zoom
//   status.setLanguage(languageButton)
//   status.zoom?.update()                          // after the zoom changed elsewhere

import type { Shell } from './shell'
import { el } from './widgets'
import { createZoomControl, type ZoomControl, type ZoomTarget } from './zoom'

export interface StatusBarOptions {
  zoom?: ZoomTarget
  // Language button or label (e.g. the writer's document language).
  language?: HTMLElement
  // Moves the app bar's save indicator into the status bar (default true).
  save?: boolean
}

export interface StatusBar {
  element: HTMLElement
  left: HTMLElement
  right: HTMLElement
  // Replaces the left side with a text (e.g. "Slide 1 of 3").
  setInfo(text: string): void
  // Adds items to the right side, before language, save state and zoom.
  addRight(...nodes: HTMLElement[]): void
  setLanguage(node: HTMLElement | null): void
  zoom?: ZoomControl
}

export function createStatusBar(shell: Shell, options: StatusBarOptions = {}): StatusBar {
  const bar = shell.statusbar
  bar.replaceChildren()
  bar.classList.add('sb')
  const left = el('div', { class: 'sb-left' })
  const extras = el('div', { class: 'sb-extras' })
  const language = el('div', { class: 'sb-language' })
  const save = el('div', { class: 'sb-save' })
  const right = el('div', { class: 'sb-right' }, extras, language, save)
  bar.append(left, el('span', { class: 'spacer' }), right)

  if (options.save !== false) {
    const indicator = document.querySelector('.appbar .save-indicator')
    if (indicator) save.append(indicator)
  }
  const zoom = options.zoom ? createZoomControl(options.zoom) : undefined
  if (zoom) right.append(zoom.element)

  const status: StatusBar = {
    element: bar,
    left,
    right,
    setInfo: (text) => left.replaceChildren(el('span', { textContent: text })),
    addRight: (...nodes) => extras.append(...nodes),
    setLanguage: (node) => language.replaceChildren(...(node ? [node] : [])),
    zoom,
  }
  if (options.language) status.setLanguage(options.language)
  return status
}
