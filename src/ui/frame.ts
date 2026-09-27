// App frame: the one place that turns an app's description into the standard
// Ofimeo frame (menu bar in the standard order, common keyboard shortcuts,
// shortcuts dialog, toolbar with overflow and status bar with language, save
// state and zoom). The writer (src/apps/writer/app.ts, commands.ts) is the
// reference implementation.
//
//   const shell = renderShell(info, root)            // app bar, toolbar row, main, status bar
//   setupChrome(session, info.untitled)              // title, save state, presence, share, hand in…
//   const frame = mountFrame({
//     session, shell,
//     file: { openFile, print, download: [pdfItem], slots: { print: [pageSetupItem] }, details: () => rows },
//     edit: { undo, redo, canUndo, canRedo, cut, copy, paste, selectAll, find, replace, editable },
//     menus: { view, insert, format, app: [tableMenu], tools, review: [reviewMenu] },
//     help: { sections: () => appShortcutSections, extra: [] },
//     zoom: { get, set, fit, isFit },                 // shared zoom control in the status bar
//     status: { language: languageButton },
//   })
//   frame.toolbar.group(frame.toolbar.button(Bold, t('Bold'), run, { active, shortcut: mod('B') }))
//   frame.status?.left.append(pageInfo)
//
// Menu bar order: File · Edit · View · Insert · Format · ‹app menus› · Tools · ‹review menus› · Help.
// Tools always ends with "Allow AI assistants (WebMCP)…" (webmcp.ts), which also adds the app bar indicator.
// Keys (shortcuts.ts): Ctrl+O file.openFile, Ctrl+S save, Ctrl+P file.print, Ctrl+F edit.find,
// Ctrl+H edit.replace, Ctrl+/ and F1 shortcuts dialog; Ctrl++/-/0 only with zoom.keys.
//
// Building blocks, usable on their own:
//   menus.ts      fileMenu, editMenu, helpMenu, helpMenuItems, downloadFormat, openConnectionTest
//   shortcuts.ts  registerShortcuts, showShortcuts, commonShortcuts, mod, isMac
//   toolbar.ts    createToolbar (group, button, select, colorButton, refresh, "⋯" overflow, pinned groups)
//   statusbar.ts  createStatusBar (left info, right extras · language · save state · zoom)
//   zoom.ts       createZoomControl, zoomMenuItems, stepZoom
//   widgets.ts    confirmDialog (instead of confirm()), showDialog, promptText, toast, MenuItem.visible
//   about.ts      aboutDialog, documentDetails
//   chrome.ts     setupChrome (includes setupSaveState), openShareDialog, handIn

import { t } from '../core/i18n'
import type { Session } from '../core/session'
import { editMenu, fileMenu, helpMenu, type EditMenuOptions, type FileMenuOptions } from './menus'
import type { Shell } from './shell'
import { registerShortcuts, showShortcuts, type ShortcutActions, type ShortcutSection } from './shortcuts'
import { createStatusBar, type StatusBar, type StatusBarOptions } from './statusbar'
import { createToolbar, type Toolbar } from './toolbar'
import { createMenuBar, type Menu, type MenuEntry } from './widgets'
import { stepZoom, type ZoomTarget } from './zoom'
import { setupWebMcp, webMcpMenuItem } from './webmcp'

// Breakpoints of tokens.css (CSS variables cannot be used in media queries).
export const BREAKPOINTS = { phone: 600, narrow: 760, tablet: 900 } as const

export interface FrameMenus {
  view?: Menu
  insert?: Menu
  format?: Menu
  // App menus between Format and Tools (Table, Data, Arrange, Slide, Page…).
  app?: Menu[]
  tools?: Menu
  // After Tools (Review, Present…).
  review?: Menu[]
}

export interface FrameSpec {
  session: Session
  shell: Shell
  file: FileMenuOptions
  // Omit for apps without an Edit menu; pass a Menu to use a hand-made one.
  edit?: EditMenuOptions | Menu
  menus?: FrameMenus
  help?: {
    // The app's own sections of the shortcuts dialog (shown before the common ones).
    sections?: () => ShortcutSection[]
    extra?: MenuEntry[]
  }
  // Overrides or adds common key actions (defaults come from file, edit and zoom).
  keys?: ShortcutActions
  zoom?: ZoomTarget
  // Status bar options; false keeps the app's own status bar.
  status?: Omit<StatusBarOptions, 'zoom'> | false
  // Called after a toolbar action (e.g. to give the focus back to the editor).
  afterToolbarAction?: () => void
}

export interface Frame {
  menus: Menu[]
  toolbar: Toolbar
  status?: StatusBar
  // Opens the keyboard shortcuts dialog.
  shortcuts: () => void
}

export function mountFrame(spec: FrameSpec): Frame {
  const { session, shell } = spec
  const shortcuts = () => void showShortcuts(spec.help?.sections?.() ?? [])
  const m = spec.menus ?? {}
  const edit = spec.edit && ('items' in spec.edit ? spec.edit : editMenu(spec.edit))
  const menus = [
    fileMenu(session, spec.file),
    edit,
    m.view,
    m.insert,
    m.format,
    ...(m.app ?? []),
    // Tools always ends with the AI assistants (WebMCP) switch.
    { label: m.tools?.label ?? t('Tools'), items: [...(m.tools?.items ?? []), ...(m.tools?.items.length ? ['-' as const] : []), webMcpMenuItem(session)] },
    ...(m.review ?? []),
    helpMenu(session, { shortcuts, extra: spec.help?.extra }),
  ].filter((x): x is Menu => !!x)
  createMenuBar(shell.menubar, menus)

  const editOptions = spec.edit && !('items' in spec.edit) ? spec.edit : undefined
  const toolbar = createToolbar(shell.toolbar, { afterAction: spec.afterToolbarAction })
  const status = spec.status === false ? undefined : createStatusBar(shell, { ...spec.status, zoom: spec.zoom })

  // Zoom keys only when the app's zoom target asks for them (otherwise the browser zooms).
  const zoom = spec.zoom
  const zoomKeys: ShortcutActions = zoom?.keys
    ? {
        zoomIn: () => (stepZoom(zoom, 1), status?.zoom?.update()),
        zoomOut: () => (stepZoom(zoom, -1), status?.zoom?.update()),
        zoomReset: () => (zoom.set(1), status?.zoom?.update()),
      }
    : {}
  registerShortcuts({
    open: spec.file.openFile,
    print: spec.file.print,
    find: editOptions?.find,
    replace: editOptions?.replace,
    help: shortcuts,
    ...zoomKeys,
    ...spec.keys,
  })
  if (!session.hooks.print) session.hooks.print = spec.file.print
  setupWebMcp(session)
  return { menus, toolbar, status, shortcuts }
}
