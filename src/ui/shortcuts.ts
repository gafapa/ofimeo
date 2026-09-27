// Keyboard shortcuts shared by every app: one registry for the common keys and
// one "Keyboard shortcuts" dialog with a common part and an app part.
//
//   registerShortcuts({ open, print, find, replace, help })   // capture phase, runs before editors
//   showShortcuts(appSections)                                  // common rows + the app's own
//
// Common keys (the same in every app):
//   Ctrl+O open a file · Ctrl+S save (to the linked Nextcloud file; otherwise a toast:
//   changes are saved automatically) · Ctrl+P print · Ctrl+F find · Ctrl+H find and
//   replace · Ctrl+/ and F1 keyboard shortcuts · Ctrl++ / Ctrl+- / Ctrl+0 zoom (only
//   when the app passes zoom actions; otherwise the browser zooms).
// On macOS ⌘ replaces Ctrl.

import { t } from '../core/i18n'
import { el, shortcutLabel, showDialog, toast } from './widgets'

export const isMac = /Mac|iPhone|iPad/.test(navigator.platform)

// Shortcut text for menus and tooltips: mod('P') → "Ctrl+P" (⌘P on macOS, "Strg+P" in German).
export const mod = (key: string): string => (isMac ? `⌘${key}` : shortcutLabel(`Ctrl+${key}`))

export interface ShortcutActions {
  open?: () => void
  // Default: a toast saying changes are saved automatically. The Nextcloud
  // integration handles Ctrl+S first when the document is linked to a file.
  // null: Ctrl+S is left to the browser (screens without a document).
  save?: (() => void) | null
  print?: () => void
  find?: () => void
  replace?: () => void
  // Ctrl+/ and F1.
  help?: () => void
  zoomIn?: () => void
  zoomOut?: () => void
  zoomReset?: () => void
}

// A section of the shortcuts dialog: [label, keys] rows. Keys use "Ctrl+"; they
// are shown as ⌘ on macOS and with the keyboard's names (Strg, Mayús…).
export interface ShortcutSection {
  title: string
  rows: [string, string][]
}

let registered: ShortcutActions | null = null

// Registers the common keys (once per page; a later call replaces the actions).
export function registerShortcuts(actions: ShortcutActions): void {
  const first = !registered
  registered = actions
  if (!first) return
  window.addEventListener(
    'keydown',
    (e) => {
      const a = registered
      if (!a || e.defaultPrevented) return
      // A modal dialog owns the keyboard.
      if (document.querySelector('dialog[open]')) return
      const modKey = isMac ? e.metaKey : e.ctrlKey
      let action: (() => void) | undefined
      if (e.key === 'F1' && !modKey && !e.altKey && !e.shiftKey) action = a.help
      else if (modKey && !e.altKey) {
        const key = e.key.toLowerCase()
        if (key === '/' || e.code === 'Slash') action = a.help
        else if (e.shiftKey) action = undefined
        else if (key === 'o') action = a.open
        else if (key === 's') action = a.save === null ? undefined : (a.save ?? (() => toast(t('All changes are saved automatically in this browser'))))
        else if (key === 'p') action = a.print
        else if (key === 'f') action = a.find
        else if (key === 'h') action = a.replace
        else if (key === '+' || key === '=') action = a.zoomIn
        else if (key === '-') action = a.zoomOut
        else if (key === '0') action = a.zoomReset
      }
      if (!action) return
      e.preventDefault()
      e.stopPropagation()
      action()
    },
    true,
  )
}

// Rows every app shares; pass the actions the app supports to leave out the others.
export function commonShortcuts(actions: ShortcutActions = registered ?? {}): ShortcutSection[] {
  const file: [string, string][] = []
  if (actions.open) file.push([t('Open file'), 'Ctrl+O'])
  if (actions.save !== null) file.push([t('Save'), 'Ctrl+S'])
  if (actions.print) file.push([t('Print'), 'Ctrl+P'])
  const edit: [string, string][] = [
    [t('Undo / redo'), 'Ctrl+Z / Ctrl+Y'],
    [t('Cut / copy / paste'), 'Ctrl+X / Ctrl+C / Ctrl+V'],
    [t('Select all'), 'Ctrl+A'],
  ]
  if (actions.find) edit.push([t('Find'), 'Ctrl+F'])
  if (actions.replace) edit.push([t('Find and replace'), 'Ctrl+H'])
  const view: [string, string][] = []
  if (actions.zoomIn) view.push([t('Zoom in / out'), 'Ctrl++ / Ctrl+-'], [t('Actual size'), 'Ctrl+0'])
  const help: [string, string][] = [
    [t('Keyboard shortcuts'), 'Ctrl+/ · F1'],
    [t('Menu bar'), 'F10 · Alt+Shift+M'],
    [t('Accessibility'), 'Alt+Shift+A'],
    [t('Read aloud'), 'Alt+Shift+R'],
    [t('Dictation'), 'Alt+Shift+D'],
    // Document chat (chat.ts), in the apps only.
    ...(document.querySelector('.chat-toggle') ? [[t('Chat'), 'Alt+Shift+C'] as [string, string]] : []),
  ]
  return [
    { title: t('File'), rows: file },
    { title: t('Edit'), rows: edit },
    ...(view.length ? [{ title: t('View'), rows: view }] : []),
    { title: t('Help and accessibility'), rows: help },
  ]
}

const keysText = (keys: string) => (isMac ? keys.replace(/Ctrl\+/g, '⌘') : shortcutLabel(keys))

// The "Keyboard shortcuts" dialog: the app's sections first, then the common ones.
export async function showShortcuts(appSections: ShortcutSection[] = []): Promise<void> {
  const table = el('table', { class: 'shortcuts shortcut-sections' })
  for (const section of [...appSections, ...commonShortcuts()]) {
    if (!section.rows.length) continue
    table.append(el('tr', {}, el('th', { colSpan: 2, scope: 'colgroup', class: 'shortcut-title', textContent: section.title })))
    for (const [label, keys] of section.rows) table.append(el('tr', {}, el('td', { textContent: label }), el('td', {}, el('kbd', { textContent: keysText(keys) }))))
  }
  const body = el('div', { class: 'shortcut-scroll' }, table)
  await showDialog(t('Keyboard shortcuts'), body, [{ label: t('Close'), value: 'ok', primary: true }], true)
}
