# Ofimeo app frame: API for the app agents

The UI foundation (WP1 tokens and WP2 frame core) is in `src/ui/`. The writer (`src/apps/writer/app.ts` and `commands.ts`) is the reference implementation. The home screen (`src/home/home.ts`) uses the same Help items, keys and confirm dialog.

**Contract:** an app calls `renderShell` → `setupChrome` → `mountFrame`, then fills `frame.toolbar` and `frame.status`. Everything else (menu order, common keys, save state, zoom control, shortcuts dialog, About, Document details, Hand in and Share in the File menu) comes from the frame.

```ts
import { renderShell } from '../../ui/shell'
import { setupChrome } from '../../ui/chrome'
import { mountFrame } from '../../ui/frame'
import { mod } from '../../ui/shortcuts'

const shell = renderShell(info, root)          // sets --app-color on .app
setupChrome(session, info.untitled)            // title, save state (all apps), presence, share, hand in, Nextcloud status
session.hooks.exportFormats = () => [...]      // File ▸ Download as and Nextcloud save use these
const frame = mountFrame({
  session, shell,
  file: {
    openFile: () => fileInput.click(),         // File ▸ Open…  Ctrl+O
    print,                                     // File ▸ Print…  Ctrl+P (also session.hooks.print if unset)
    download: [{ label: t('PDF (via Print)'), run: print }],      // after the exportFormats items
    slots: { print: [{ label: t('Page setup…'), run: pageSetup }] },
    details: () => [[t('Pages'), '3']],        // rows appended to File ▸ Document details…
  },
  edit: { undo, redo, canUndo, canRedo, cut, copy, paste, selectAll, find, replace, editable, slots: { clipboard: [duplicate, del] } },
  menus: { view, insert, format, app: [tableMenu], tools, review: [reviewMenu] },
  help: { sections: () => [{ title: t('Text'), rows: [[t('Bold'), 'Ctrl+B']] }], extra: [] },
  zoom: { get, set, fit, isFit, min, max, presets, keys },         // status-bar zoom control
  status: { language: languageButton },        // or false to keep an app-owned status bar
})
frame.toolbar.group(frame.toolbar.button(Bold, t('Bold'), toggleBold, { active: isBold, shortcut: mod('B') }))
frame.status?.left.append(pageInfo)            // or frame.status?.setInfo(t('Slide {n} of {m}', …))
editor.on('transaction', frame.toolbar.refresh)
```

## Modules

| Module | Exports | Notes |
|---|---|---|
| `frame.ts` | `mountFrame(spec): Frame`, `FrameSpec`, `FrameMenus`, `BREAKPOINTS` | Menu bar order: **File · Edit · View · Insert · Format · ‹app› · Tools · ‹review› · Help**. Registers the common keys and creates the toolbar and the status bar. `edit` may be a ready `Menu` (for example the diagram's `editor.editMenu()`). `status: false` keeps an app-owned status bar. `keys` overrides key actions. |
| `menus.ts` | `fileMenu(session, FileMenuOptions)`, `editMenu(EditMenuOptions)`, `helpMenu(session, {shortcuts, extra})`, `helpMenuItems(session, {shortcuts, extra})`, `downloadFormat(session, option)`, `openConnectionTest(session?)` | These can be used without `mountFrame` for gradual adoption, e.g. `createMenuBar(el, [fileMenu(...), ..., helpMenu(...)])`. |
| `shortcuts.ts` | `registerShortcuts(actions)`, `showShortcuts(appSections)`, `commonShortcuts()`, `mod('P')`, `isMac` | Capture phase on `window`, so editors (Excalidraw, Univer) cannot swallow the keys. The handler is skipped while a modal `<dialog>` is open. `save: null` leaves Ctrl+S to the browser. |
| `toolbar.ts` | `createToolbar(container, {afterAction})` → `group(...items, {pinned, keep, class})`, `button(icon, label, run, {active, enabled, shortcut, text, class})`, `select(...)`, `colorButton(...)`, `refresh()`, `onRefresh(fn)`, `layout()` | The toolbar is **one row**. Groups that do not fit move into a "⋯" (More tools) panel, starting from the end. Pinned groups stay at the right end. `keep` groups stay enabled when the toolbar has the `readonly` class. |
| `statusbar.ts` | `createStatusBar(shell, {zoom, language, save})` → `left`, `right`, `setInfo(text)`, `addRight(...)`, `setLanguage(node)`, `zoom` | Right side, in order: app extras · language · save state · zoom. It moves the app bar's `.save-indicator` into the status bar. |
| `zoom.ts` | `createZoomControl(target)` → `{element, update}`, `zoomMenuItems(target)`, `stepZoom(target, ±1)`, `formatZoom(z)` | The control is `− [100 % ▾] +`. The value opens the presets and Fit. `ZoomTarget = {get, set, fit?, isFit?, min?, max?, presets?, keys?}`. Use `zoomMenuItems(target)` for View ▸ Zoom so the menu matches the control. |
| `widgets.ts` | `confirmDialog(title, text, {confirmLabel, cancelLabel, danger})`, `DialogButton.danger`, `MenuItem.visible`, `uiZoom()` | Replaces native `confirm()` (none remain in src/). `visible` hides items at open time; dangling separators are dropped. |
| `about.ts` | `aboutDialog()`, `documentDetails(session, appRows)` | "About Ofimeo" and "Document details…": title, type, last change, size, access, versions, authors, Nextcloud file, then the app's rows. |
| `chrome.ts` | `setupChrome` (now includes `setupSaveState`), `openShareDialog`, `handIn` | Save state for every app: a cloud icon plus a label. Phones show only the icon. Apps should **delete their own "Saving…/Saved" code**. |
| `brand.ts` | `brandMark(size)` | The Ofimeo "O" mark (same as `public/icons/icon.svg`). |
| `registry.ts` | `AppInfo.product` (e.g. "Ofimeo Docs" / "Ofimeo Documentos"), `SUITE = 'Ofimeo'` | `AppInfo.type` values are unchanged. |

### File menu (standard order)
New ▸ (one per app, current first) · Open… Ctrl+O · Open from Nextcloud… · All documents · [slots.open]
─ Make a copy · Save to Nextcloud Ctrl+S (when linked) / Save to Nextcloud… (not linked) · Save to Nextcloud as… (when linked) · Nextcloud account… · Download as ▸ (exportFormats + `download`) · [slots.save]
─ [slots.print] · Print… Ctrl+P
─ Version history… · Save version…
─ Hand in… · Share…
─ Document details… · [slots.end]

### Edit (base)
Undo · Redo ─ Cut · Copy · Paste · [slots.clipboard] ─ Select all · [slots.select] ─ Find… · Find and replace… · [slots.end]. Omitted actions are left out.

### Help
Keyboard shortcuts Ctrl+/ · Accessibility… Alt+Shift+A · **Connection test…** · [extra] ─ About Ofimeo.
"Connection test…" appears automatically when `src/ui/connection.ts` exists. It is found with `import.meta.glob`, so there is no build error when the module is missing, and it is loaded lazily. The module should export `openConnectionTest(session?)` (`openConnectionDialog` also works). **Apps on the frame must not add their own "Connection test…" item.** Apps not yet migrated can add it by hand, or can use `helpMenuItems(session, { shortcuts, extra })` in their hand-written Help menu.

### Keys (every app on the frame)
| Key | Action |
|---|---|
| Ctrl+O | `file.openFile` |
| Ctrl+S | Save to the linked Nextcloud file (`ui/nextcloud.ts` handles it first). Otherwise one toast: "All changes are saved automatically in this browser". |
| Ctrl+P | `file.print` |
| Ctrl+F / Ctrl+H | `edit.find` / `edit.replace` |
| Ctrl+/ and F1 | Shortcuts dialog (app sections, then File, Edit, View, Help and accessibility) |
| Ctrl++ / Ctrl+- / Ctrl+0 | Only when `keys: { zoomIn, zoomOut, zoomReset }` is passed. Otherwise the browser zooms. |

## Tokens (`src/ui/tokens.css`, imported by base.css)
- **Colors:** `--brand --app-color --on-app --paper --paper-fg --bg --canvas --surface --surface-alt --text --muted --border --divider --hover --hover-strong --active --active-fg --accent --on-accent --focus --overlay`.
- **Semantic colors:** `--ok --on-ok --success-bg/-fg --warn --warn-strong --warn-bg/-fg/-border --danger --danger-strong --danger-text --on-danger --info-bg/-fg/-border --folder`.
- **Toolbar and floating elements:** `--toolbar-bg --toolbar-fg --toolbar-hover --field-border-strong --toast-bg --toast-fg --bubble-bg --bubble-fg`.
- **Type:** `--font-ui --font-mono --font-logo --doc-font --fs-xs(11) --fs-s(12) --fs-m(13) --fs-base(14) --fs-l(16) --fs-xl(18) --fs-xxl(20)`.
- **Spacing:** `--space-1..5` (4, 8, 12, 16, 24).
- **Radii:** `--radius-xs(2) -s(4) -m(6) -l(8) -xl(12) -pill`.
- **Shadows:** `--shadow --shadow-s`.
- **Layers:** `--z-ruler(990) --z-menu(1000) --z-panel(1001) --z-bubble(1500) --z-toast(2000) --z-skip(3000)`.
- **Breakpoints:** 600 (phone), 760 (narrow), 900 (tablet). These are numbers only, because CSS variables do not work in media queries. They are also exported as `BREAKPOINTS`.
- The dark, contrast-dark and contrast-light themes redefine **only tokens**. Components need no theme rules. Use `var(--app-color)` instead of app color literals (slides and draw already do).

## Remaining work per app (next wave)
- **Sheet (WP4):**
  - Build on `mountFrame`. Pass `edit` with Univer commands and add View, Insert, Format and Data menus.
  - `file.download` = PDF (via Print). Use `status: false` while the Univer footer stays.
  - Delete the save-state code in `sheet/app.ts` (lines around `saveState`) and the hand-written `shortcuts()`, and pass `help.sections` instead.
  - Theme Univer from the tokens.
- **Draw (WP5):**
  - Use `mountFrame` with the menubar visible. File = Download ▸ from `hooks.exportFormats` (PNG, SVG, .excalidraw), plus Print.
  - Edit: undo and redo through synthetic keys; Find → `toggleSidebar`.
  - Hide the Excalidraw hamburger. Set the `theme` prop from `data-a11y-theme`.
  - Status bar zoom from `appState.zoom`. Save state already works through `setupChrome`.
- **Diagram (WP6):**
  - Use `mountFrame` with `edit: editor.editMenu()` (a ready `Menu`) or `EditMenuOptions` plus `slots.clipboard` / `slots.select`.
  - `zoom` from the editor, with `keys: true` and `keys: { zoomIn, zoomOut, zoomReset }`.
  - Remove the save-state code and `showShortcuts()` in `editor.ts` (move its rows to `help.sections`).
  - Rebuild the toolbar with `createToolbar`.
- **Slides (WP7):**
  - Same approach as the diagram. Download ▸ PPTX and ODP from `exportFormats`, plus `download: [PDF, PNG slide, PNG all]`.
  - Pass Slide size in `slots.print`.
  - Put the "Present" button in a `{ pinned: true }` toolbar group.
  - Remove the save-state code.

The apps that are not migrated still work unchanged. `documentMenuItems`, `createMenuBar` and `#save-state` are kept. `#save-state` is now the label inside `.save-indicator`, so writing its `textContent` still works.
