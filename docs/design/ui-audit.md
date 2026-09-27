# Ofimeo: UI consistency audit and plan for one app frame

Audited: commit `fbf873d` (HEAD, in a separate worktree, so the other agent's uncommitted edits are not included), Spanish UI (`es-ES`), Chromium, 1366×820 and 390×844, light, dark and high-contrast (dark) themes.
Screenshots: `shots/` (128 files). File names follow `<viewport|theme>-<app>-<what>.png`. Side-by-side strips are in `shots/compare/`.
Raw DOM inventory (menus, toolbar, status bar, key probes, computed styles): `inventory.json`. Scripts: `audit.cjs` (full run), `extra.cjs`, `feas.cjs` (theming feasibility), `strip.cjs`.

---

## 1. Summary

The shell (`renderShell` + `setupChrome`) already gives every app the same **app bar**: logo, title, save state, presence, connection pill, Hand in, Share, name and accessibility. The Share, Version history and Hand-in dialogs are the same shared code everywhere. Past the app bar, the five apps drift apart:

* **Three different menu systems.** Our menubar (writer, diagram, slides and a thin one in sheet), Univer's ribbon tabs (sheet), and Excalidraw's hamburger (draw, no menubar at all). Sheet shows two stacked menu rows: *Archivo · Editar · Ayuda* and, below it, *Inicio · Insertar · Fórmulas · Datos · Vista*.
* **The File menu has the same concepts but differs in order, naming and shape in all 5 apps.** Download is a submenu in 2 apps and flat "Descargar X" items in 3. "Open" has the shortcut shown in 2 and works in 2 (Ctrl+O is dead in draw, diagram and slides). Page setup exists only in the writer. Print is missing from draw.
* **Three toolbar looks, three icon sets and three status-bar layouts.** Lucide pill toolbar vs the Univer ribbon vs Excalidraw's floating island. Zoom sits in the status bar (writer), in the toolbar and status bar (diagram, slides), in Univer's footer (sheet), or in Excalidraw's bottom-left control (draw).
* **Keyboard shortcuts for common actions are inconsistent.** Ctrl+S gives two different toast texts, and in draw it does nothing. Ctrl+P does nothing in draw. Ctrl+F does nothing in diagram and slides. Ctrl+/ opens shortcuts only in the writer. F1 does nothing anywhere.
* **Themes do not reach the third-party editors.** In dark or high-contrast mode the sheet (Univer) and the drawing (Excalidraw) stay fully light, and Excalidraw has its own independent "Modo oscuro" toggle. Both libraries support theming. `feas.cjs` shows it working at runtime.
* **Tokens are only partly used.** 150+ hard-coded colours in our own CSS: the toolbar colours in `base.css`, the slides accent `#d24726` repeated 7×, `#041e49` in 3 files. Five different breakpoints (600/640/760/761/800). Three native `confirm()` calls bypass `showDialog`.

The fix is a small **app frame contract** in `src/ui/` plus per-app adoption, split into work packages with disjoint file ownership (§5).

---

## 2. Inventory

### 2.1 Shell parts per app (desktop; `inventory.json › <app>.shell`)

| Part | Home | Writer | Sheet | Draw | Diagram | Slides |
|---|---|---|---|---|---|---|
| App bar (logo, title) | own `home-bar` (white, "Ofimeo" + blue **W**, same letter and colour as the writer) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Save state "Guardado en este navegador" | – | ✓ | ✓ | **✗ never set** | ✓ | ✓ |
| Menubar (ours) | – | ✓ 9 menus | ✓ 3 menus (File, Edit, Help) | **hidden** (Excalidraw hamburger) | ✓ 6 menus | ✓ 9 menus |
| Toolbar (ours) | – | ✓ (**wraps to 2 rows at 1366 px**) | **hidden**; Univer ribbon (tabs + 1 row) | **hidden**; Excalidraw island | ✓ | ✓ (+ primary "Presentar" at right) |
| Status bar (ours) | – | ✓ | **hidden**; Univer footer (sheet tabs + zoom) | **hidden**; Excalidraw zoom/undo bottom-left | ✓ page tabs + selection + zoom % | ✓ "Diapositiva n de m" + zoom % |
| Presence, connection, Hand in, Share, name, a11y | name + a11y (labelled "Accesibilidad") | ✓ | ✓ | ✓ | ✓ | ✓ |
| Side panels | – | comments rail | Univer side panels | Excalidraw properties island (left) + Library | Shapes (left) + Format (right) | Slides/Shapes tabs (left) + Format (right) + notes |

Screens: `desktop-*-default.png`, `desktop-*-appbar.png`, `desktop-home.png`.

### 2.2 Top-level menus (Spanish labels as shown)

| # | Writer | Sheet | Draw (Excalidraw hamburger) | Diagram | Slides |
|---|---|---|---|---|---|
| 1 | Archivo | Archivo | *(one flat hamburger menu)* | Archivo | Archivo |
| 2 | Editar | Editar | | Editar | Editar |
| 3 | Ver | *(Univer tab "Vista")* | | Ver | Ver |
| 4 | Insertar | *(Univer tab "Insertar")* | | – | Insertar |
| 5 | Formato | *(Univer "Inicio")* | | – (format panel) | Formato |
| 6 | Tabla | *(Univer "Fórmulas", "Datos")* | | Organizar | Organizar |
| 7 | Herramientas | – | | Página | Diapositiva |
| 8 | Revisar | – | | – | Presentar |
| 9 | Ayuda | Ayuda | "Ayuda ?" (Excalidraw help) | Ayuda | Ayuda |

Screens: `desktop-<app>-menu-<n>-<label>.png`, `desktop-draw-mainmenu.png`.

### 2.3 File menu, item by item (order as shown; `|` = separator)

| Writer | Sheet | Draw (hamburger) | Diagram | Slides |
|---|---|---|---|---|
| Documento nuevo | Hoja de cálculo nueva | Dibujo nuevo | Diagrama nuevo | Presentación nueva |
| Todos los documentos | Abrir archivo… Ctrl+O | Abrir archivo (.excalidraw)… | Abrir archivo (.drawio)… | Abrir archivo (.pptx)… |
| Abrir archivo… Ctrl+O | Todos los documentos | Todos los documentos | Todos los documentos | Todos los documentos |
| Mis documentos… | | Compartir… | Compartir… | Compartir… |
| \| Compartir… | \| Compartir… | \| | \| | \| |
| Descargar ▸ (docx, odt, PDF via Imprimir, html, txt) | Descargar ▸ (xlsx, ods, csv, PDF via Imprimir) | Hacer una copia · Guardar versión… · Historial de versiones… | Descargar .drawio · Descargar SVG · Descargar PNG | Descargar PowerPoint (.pptx) · … (.odp) · Descargar PDF · diapositiva PNG · todas PNG (.zip) |
| \| Hacer una copia · Guardar versión… · Historial de versiones… | \| same 3 | \| Descargar PNG · SVG · .excalidraw | \| same 3 | \| same 3 |
| \| Configurar página… · Imprimir Ctrl+P | \| Imprimir Ctrl+P | \| Exportar imagen… · Limpiar lienzo… · Modo oscuro · Fondo del lienzo · Ayuda (Excalidraw defaults) | \| Imprimir Ctrl+P | \| Imprimir Ctrl+P |

Differences: the position of *Open* and *All documents*; *Mis documentos…* exists only in the writer; *Compartir…* is inside the File menu and also in the app bar; Download is a submenu in 2 apps and flat in 3; format names differ ("Documento de Word (.docx)" vs "Descargar PowerPoint (.pptx)"); PDF means Print in writer/sheet but "Descargar PDF" in slides; *Hand in* is missing from every File menu (app bar only); draw has no Print; there is no "Document details/properties" anywhere; no "New ▸ other type".

### 2.4 Edit / View / Help

| | Writer | Sheet | Draw | Diagram | Slides |
|---|---|---|---|---|---|
| Edit | Undo, Redo \| Cut, Copy, Paste \| Select all \| Find Ctrl+F, Find and replace Ctrl+H | Undo, Redo \| Find and replace Ctrl+F | – (Excalidraw context menu) | Undo, Redo \| Cut, Copy, Paste, Duplicate, Delete \| Select all, Select shapes, Select connectors, Select none \| Edit label F2, Edit style… | = diagram (shared `editor.editMenu()`) |
| View | Zoom ▸ (50…200 %, Fit to width) · Word count… \| Show authorship · Contributions… · Show resolved comments | (Univer "Vista" tab) | – | Shapes · Format · More shapes… · Grid \| Zoom in, Zoom out, Actual size, Fit | Slides panel · Speaker notes · Format · More shapes… · Grid \| zoom items |
| Tools | Spelling F7 · check spelling / grammar while typing · Language ▸ · Grammar ▸ · Personal dictionary | – | – | – | – |
| Help | Keyboard shortcuts **Ctrl+/** · About Ofimeo | Keyboard shortcuts | Excalidraw "Ayuda" (its own dialog, partly English) | Keyboard shortcuts | Keyboard shortcuts |

Other duplication: in the writer, *Show authorship / Contributions / Show resolved comments* appear in both **Ver** and **Revisar**. Word count sits under View, not Tools (Google puts it in Tools). There is no Accessibility entry in any Help menu (only the app-bar button). "About" exists only in the writer.

### 2.5 Toolbar groups and icons

| App | Groups (left → right) | Icons |
|---|---|---|
| Writer | Undo, Redo, Print, Find \| Zoom select \| Paragraph style \| Font \| − size + \| B I U S, text colour, highlight \| link, image, table \| align ×4 \| line spacing, bullets, numbers, checklist, outdent, indent \| clear formatting \| equation \| **comment, Mode select (wraps to row 2)** | lucide 18 px / 1.8 stroke |
| Sheet | Univer ribbon: tabs Inicio/Insertar/Fórmulas/Datos/Vista + one row (undo, redo, paint format, clear, font, size, B I U S, colours, borders, align, wrap, rotate, merge, number format …) | Univer icon set, 12.25 px text, primary = Univer blue `#274fee` (not the app's green) |
| Draw | Excalidraw island: lock, hand, select, rectangle, diamond, ellipse, arrow, line, pen, text, image, eraser, more \| laser; Library button top-right | Excalidraw icons, font "Assistant", violet primary (only `--color-primary` is overridden in `draw.css`, so the selected-tool tint stays violet) |
| Diagram | Shapes panel, Format panel \| Undo, Redo \| −, zoom select, +, Fit \| Delete, To front, To back \| Fill, Line colour, Grid | lucide |
| Slides | + New slide, Layout select \| Undo, Redo \| −, zoom, +, Fit \| B I U, text colour, A+ A− \| align ×3, bullets, numbers \| text box, image, shapes, table, equation \| background, format panel \| ⟶ primary **Presentar** | lucide |

Our own panels do not always use lucide either: the diagram/slides **format panel** uses text glyph buttons (`B I U S ◀ ≡ ▶ ▲ ◆ ▼`, `desktop-diagram-selected-format.png`), and the writer **find panel** uses `↑ ↓ ✕` characters (`desktop-writer-find.png`).

### 2.6 Where common actions live

| Action | Writer | Sheet | Draw | Diagram | Slides |
|---|---|---|---|---|---|
| Undo/Redo | toolbar 1st group + Edit | Univer ribbon 1st + Edit | Excalidraw bottom-left | toolbar 2nd group + Edit | toolbar 2nd group + Edit |
| Zoom | status bar slider + toolbar select + View ▸ Zoom (presets, "Ajustar al ancho") | Univer footer slider (bottom-right) | Excalidraw bottom-left − 100 % + | toolbar − select + fit; status-bar % label (click = 100 %) | same as diagram |
| Print | toolbar + File | File | **none** (hand-in only) | File | File (= PDF) |
| Find | own panel under the toolbar (Ctrl+F/H) | Univer popover (Ctrl+F) and dialog (Ctrl+H) | Excalidraw search sidebar (Ctrl+F) | **none** | **none** |
| Share / Hand in | app bar (+ File › Share) | same | same | same | same |
| Versions | File | File | hamburger | File | File |
| Help / shortcuts | Help + Ctrl+/ | Help | Excalidraw `?` | Help | Help |

### 2.7 Status bar content

| Writer | Sheet | Draw | Diagram | Slides |
|---|---|---|---|---|
| Página 1 de 1 · 11 palabras · 58 caracteres · Español ⟶ (Sugiriendo) (Comentarios n) · Zoom ▭slider▭ 100 % | *(hidden)* Univer footer: + · sheet list · **"Sheet1"** tab ⟶ fit · − slider + · 100 % ▾ | *(none)* | page tabs **"Page-1"** + ⟶ "1 objeto seleccionado" · 100 % | Diapositiva 1 de 1 ⟶ selection · 89 % |

Untranslated default names: `Sheet1` (`src/apps/sheet/univer.ts emptyWorkbook`) and `Page-1` (`src/apps/diagram/app.ts addPage` / sync default).

### 2.8 Keyboard shortcuts (measured by pressing keys; `inventory.json › <app>.keys`)

| Key | Writer | Sheet | Draw | Diagram | Slides |
|---|---|---|---|---|---|
| Ctrl+S | toast "**Todos los cambios** se guardan automáticamente…" | same | **nothing** | toast "**Los cambios** se guardan…" | same as diagram |
| Ctrl+P | print | print | **nothing** | print | print |
| Ctrl+F | find panel | Univer find popover | Excalidraw search | **nothing** | **nothing** |
| Ctrl+H | find & replace | Univer find & replace dialog | nothing | nothing | nothing |
| Ctrl+O | file chooser | file chooser | **nothing** | **nothing** | **nothing** |
| Ctrl+/ | shortcuts dialog | **nothing** | nothing | nothing | nothing |
| Shift+? | – | – | Excalidraw help | – | – |
| F1 | nothing | nothing | nothing | nothing | nothing |
| F10 / Alt+Shift+M | focuses menubar | focuses menubar | **nothing** (no menubar) | focuses menubar | focuses menubar |
| Zoom | browser zoom | Univer (Ctrl+wheel) | Excalidraw (Ctrl + / −) | Ctrl + / − / 0, Ctrl+Shift+H fit | same as diagram |
| Undo/Redo | Ctrl+Z / Ctrl+Y | Ctrl+Z / Ctrl+Y | Ctrl+Z / Ctrl+Shift+Z (Excalidraw) | Ctrl+Z / Ctrl+Y or Ctrl+Shift+Z | same as diagram |
| Select all / copy / paste / delete | ProseMirror | Univer | Excalidraw | own handlers | own handlers |

Each app draws its shortcuts dialog from its own hand-written list: `writer/dialogs.ts shortcuts()`, `sheet/app.ts shortcuts()`, `diagram/editor.ts showShortcuts()` (shared with slides, plus extra slides rows). Excalidraw has its own help dialog. Screens: `desktop-*-shortcuts.png`, `desktop-draw-help.png`.

### 2.9 Dialogs, menus and toasts

| Kind | Where | Style |
|---|---|---|
| `showDialog` / `promptText` (`widgets.ts`) | share, versions, hand in, shortcuts, page setup, writer dialogs, diagram/slides dialogs | ours: 12 px radius, 20 px title, right-aligned buttons |
| **native `confirm()`** | `ui/versions.ts:68` (restore), `home/home.ts:131` (remove doc), `writer/dialogs.ts:188` (delete doc) | browser dialog, not themed or translated |
| Univer dialogs | find/replace, conditional formatting, data validation, etc. | Univer (`desktop-sheet-key-Ctrl_H.png`) |
| Excalidraw dialogs | help, export image, library | Excalidraw (`desktop-draw-help.png`) |
| Context menus | writer, diagram, slides: `showContextMenu` (ours, no icons); sheet: Univer (icon grid + icons, `desktop-sheet-contextmenu.png`); draw: Excalidraw (`desktop-draw-contextmenu-element.png`) | 3 styles |
| Toasts | ours (`#323232` pill, bottom centre); Excalidraw `setToast` for its own messages | 2 styles |
| Empty state | writer: "Empieza a escribir…" placeholder; slides: "Haz clic para añadir…" placeholders; diagram: hint text in the format panel; draw: Excalidraw one-line hint (the WelcomeScreen is not rendered); sheet: none | no shared pattern |

### 2.10 Tokens actually used (`src/**/*.css`)

* Tokens defined in `base.css :root`: `--bg --canvas --surface --text --muted --border --hover --active --accent --ok --shadow --doc-font --focus`. The themes (in `accessibility.css`) also define `--toolbar --tb-fg --on-accent`, but these have **no light default** in `base.css`: `.toolbar` hard-codes `#edf2fa` and `.tb-btn` hard-codes `#444746`, so they only switch through theme-specific override rules.
* Hard-coded colours outside variable definitions: writer.css 36, slides.css 24, base.css 17, accessibility.css 17, spell.css 15, diagram.css 12, home.css 8, edu.css 4. Main offenders in the chrome:
  * `base.css`: `.toolbar #edf2fa`, `.tb-group #c7c7c7`, `.tb-btn #444746`, `.tb-btn.active #041e49`, `.tb-size #747775`, `.toast #323232`, `button.primary`/logo/avatar `#fff`.
  * `#041e49` repeated in `base.css`, `diagram.css` (`.page-tab.active`) and `edu.css` (`.share-tab.active`).
  * `slides.css`: `#d24726` (app colour) 7×, `#1a73e8` focus outline, `#e8eaed` canvas.
  * `edu.css`: access badge `#fef7e0/#7a4f01/#f4d58d`; `writer.css`: `.hf-toolbar #edf2fa` (a copy of the toolbar colour), `.status-mode.suggesting #e6f4ea/#137333`.
  * `diagram.css`: canvas `#fff`, drag preview `#29b6f2`.
* App colours live only in `registry.ts` (inline `style="background:…"` on the logo). There is no `--app-color` token, which is why slides hard-codes its orange-red and draw overrides Excalidraw with a literal.
* Border radius in use: 2, 3, 4, 5, 6, 8, 10, 12, 16, 17, 18, 22 and 24 px. The toolbar is a 22 px pill on desktop but 8 px on mobile; dialogs 12; menus 6; buttons 6; the share button 18; chips 16.
* Fonts: UI `system-ui` everywhere; `Arial` for app logos and icons; Univer `system-ui` at 12.25 px; Excalidraw `Assistant`.
* Breakpoints: 600, 640, 760, 761, 800 px (base, home, a11y, writer, diagram, slides).

### 2.11 Themes (dark / high contrast)

| | Home | Writer | Sheet | Draw | Diagram | Slides |
|---|---|---|---|---|---|---|
| Dark | ✓ | ✓ chrome, paper stays white (intended) | **✗ Univer fully light** under a dark app bar | **✗ Excalidraw fully light**; its own "Modo oscuro" toggle is independent of ours | chrome ✓, canvas white (hard-coded) | chrome ✓, canvas `#e8eaed` hard-coded |
| High contrast | ✓ | ✓ | ✗ | ✗ | partial | partial |

Screens: `shots/compare/cmp-dark.png`, `cmp-contrast.png`, `dark-sheet-default.png`, `dark-draw-default.png`.

### 2.12 Mobile (390×844)

`shots/compare/cmp-mobile-default.png`, `cmp-mobile-menu.png`.
* App bar collapses the same way everywhere (icon-only Hand in and Share, dot for the connection status, scrolling menubar row). No horizontal page overflow in any app. ✓
* **The save state is hidden below 760 px in every app**, so phones have no "saved" feedback.
* Sheet stacks our menubar, the Univer tabs, the Univer tool row and the formula bar: 4 rows of chrome before the grid.
* Draw: the Excalidraw toolbar is on top and its menu opens from a bottom-left button, a different place from our "Archivo" in every other app.
* Writer toolbar scrolls horizontally (8 px radius); the status bar shows "Ajustar". Diagram and slides hide their panels, and the toolbar scrolls.

### 2.13 Other observations

* Home looks like a different product: a white header bar (apps use grey `--bg`), a labelled "Accesibilidad" button (icon-only in apps), and a language selector that does not exist in apps. Its logo is the blue **W**, identical to the writer's.
* Home "Empieza algo nuevo": 5 cards in a 4-column grid, so "Presentación nueva" sits alone on a second row at 1366 px.
* The title placeholder ("Documento sin título") is low contrast in dark mode.
* The Excalidraw help dialog is partly untranslated (Excalidraw's own locale gaps).

---

## 3. Inconsistencies, prioritised

**High** (visible every day)

| # | Issue | Evidence |
|---|---|---|
| H1 | Draw has **no menubar**. File actions sit in Excalidraw's hamburger, mixed with Excalidraw defaults (Limpiar lienzo, Modo oscuro, Fondo). F10 does nothing. | `desktop-draw-default.png`, `desktop-draw-mainmenu.png` |
| H2 | Sheet has **two menu systems** (ours: File/Edit/Help; Univer tabs Inicio/Insertar/Fórmulas/Datos/Vista). There is no View, Insert or Format in our bar. | `desktop-sheet-default.png` |
| H3 | **File menu order and naming differ in all apps** (Open/All documents position, Download submenu vs flat, format labels, PDF semantics, Page setup and "Mis documentos" only in the writer). | §2.3, `desktop-*-menu-1-Archivo.png` |
| H4 | Common shortcuts missing: Ctrl+O (draw, diagram, slides), Ctrl+P and Ctrl+S (draw), Ctrl+F/H (diagram, slides), Ctrl+/ (all but the writer), F1 (all). | §2.8 |
| H5 | **Dark/high-contrast themes do not reach Univer and Excalidraw.** | `shots/compare/cmp-dark.png` |
| H6 | **Undo/Redo, zoom and find live in different places**: toolbar vs ribbon vs floating canvas controls vs status bar. | §2.6 |
| H7 | **Save state missing in draw** and hidden on phones everywhere. | `desktop-draw-appbar.png`, `mobile-*-default.png` |
| H8 | **Writer toolbar wraps to two rows at 1366 px**: the Comment and Mode controls drop to row 2. | `desktop-writer-default.png` |
| H9 | **Status bar**: 3 apps use ours with different content; sheet uses Univer's footer; draw has none. Zoom shows as a slider in writer/sheet, a % label in diagram/slides, and − % + in draw. | §2.7, `desktop-*-statusbar.png`, `desktop-sheet-footer.png` |

**Medium**

| # | Issue | Evidence |
|---|---|---|
| M1 | Primary colour differs: Univer blue-violet `#274fee` and Excalidraw violet vs our `--accent` and app colours. | `desktop-sheet-ribbon.png`, `desktop-draw-default.png` |
| M2 | Three context-menu styles (ours without icons, Univer with icons, Excalidraw). Our writer and diagram context menus have no Undo/Redo. | `desktop-*-contextmenu*.png` |
| M3 | Three shortcuts/help dialogs with different content structure; each app keeps its own hand-written list. The Excalidraw help is partly English. | `desktop-*-shortcuts.png`, `desktop-draw-help.png` |
| M4 | The Help menu lacks "Accessibility…" and "About" (About is writer-only). | §2.4 |
| M5 | Native `confirm()` in version restore, home remove and writer "Mis documentos" delete. | `versions.ts:68`, `home.ts:131`, `writer/dialogs.ts:188` |
| M6 | Hand in is only in the app bar, not in File. Share appears in both. | §2.3 |
| M7 | Duplicate items in the writer (View and Review both list authorship, contributions and resolved comments). Word count sits in View instead of Tools. | `desktop-writer-menu-3-Ver.png`, `…-8-Revisar.png` |
| M8 | Menubar breadth differs: the diagram has no Insert or Format menu (only panels); slides has 9 menus; menus are named Organizar / Página / Diapositiva / Presentar / Tabla / Revisar / Herramientas without a common order rule. | §2.2 |
| M9 | Sheet on mobile shows 4 chrome rows. | `mobile-sheet-default.png` |
| M10 | Untranslated default names: `Sheet1`, `Page-1`. | `desktop-sheet-default.png`, `desktop-diagram-default.png` |
| M11 | Find UI: the writer has its own panel, the sheet a Univer popover, the drawing an Excalidraw sidebar, and the diagram and slides have none. | `desktop-writer-find.png`, `desktop-sheet-find.png`, `desktop-draw-find.png` |

**Low** (cosmetic)

| # | Issue | Evidence |
|---|---|---|
| L1 | Glyph buttons instead of lucide in the diagram/slides format panel and the writer find panel. | `desktop-diagram-selected-format.png`, `desktop-writer-find.png` |
| L2 | Hard-coded colours bypassing tokens (§2.10). Toolbar tokens have no light default. | grep in §2.10 |
| L3 | 13 border-radius values; the toolbar radius differs between desktop and mobile. | §2.10 |
| L4 | 5 breakpoints (600/640/760/761/800). | §2.10 |
| L5 | Home header differs from the app bar (white vs grey, labelled a11y button, logo = writer "W"). The 5th new-card is orphaned on row 2. | `desktop-home.png` |
| L6 | Different Ctrl+S toast wording. | §2.8 |
| L7 | Excalidraw font "Assistant" vs system-ui; Univer UI text is 12.25 px vs our 14 px. | `inventory.json › draw.styles` |
| L8 | No shared empty-state pattern (draw shows a thin hint; sheet has nothing). | `desktop-draw-default.png` |
| L9 | Low-contrast title placeholder in dark mode. | `dark-*-default.png` |

---

## 4. Target: the "app frame" contract

### 4.1 Standard menu structure

Top-level order (apps omit menus they do not need and insert app menus at the marked slot):

**Archivo · Editar · Ver · Insertar · Formato · ‹app menus: Tabla / Datos / Organizar / Diapositiva / Página› · Herramientas · ‹Revisar / Presentar› · Ayuda**

This matches the Google Docs/Sheets/Slides and LibreOffice ordering.

**File (built by one shared function):**
```
New ▸                 Document · Spreadsheet · Drawing · Diagram · Presentation   (current type first)
Open…                 Ctrl+O
Open from Nextcloud…  (when the Nextcloud integration is available; hook, see risks)
All documents
—
Make a copy
Save to…              (Nextcloud / device; hook)
Download ▸            <app formats…> — PDF (via Print)
—
Share…
Hand in…
Version history ▸     Save version… · See version history…
—
‹app items: Page setup…, Slide size…›
Print                 Ctrl+P
Document details…     (title, type, created, size, word count / sheets / slides; lang)
```
Download is always a submenu; items use "Format name (.ext)" labels, the same pattern as the writer and sheet today.

**Edit:** Undo Ctrl+Z · Redo Ctrl+Y | Cut · Copy · Paste | ‹app: Duplicate Ctrl+D, Delete Supr› | Select all Ctrl+A | Find Ctrl+F · Find and replace Ctrl+H.
**View:** Zoom ▸ (Zoom in Ctrl++, Zoom out Ctrl+−, 50…200 %, Fit) | ‹panels and toggles› | ‹app show-items›.
**Tools:** ‹app tools (spelling, word count)› | Accessibility… .
**Help:** Keyboard shortcuts Ctrl+/ · Accessibility… · About Ofimeo.

### 4.2 Shared components (new or extended in `src/ui/`)

| Component | API sketch | Replaces |
|---|---|---|
| `frame.ts` | `mountFrame(app, session, spec: FrameSpec)`, where `FrameSpec = { download: DownloadFormat[]; print?; openFile?; zoom?: ZoomTarget; find?: () => void; undo/redo?; menus: { edit?, view?, insert?, format?, app?: Menu[], tools?, review? }; fileExtras?; helpShortcuts: ShortcutSection[]; statusLeft?: HTMLElement[] }`. It builds the menubar in the standard order, registers the shared keyboard map and the save indicator, and returns `Shell`. | the per-app `createMenuBar` + keydown blocks + save-state code (5 copies) |
| `menus.ts` | `fileMenu(ctx)`, `editMenu(ctx)`, `viewZoomSubmenu(zoom)`, `helpMenu(ctx)` | hand-written File/Help menus |
| `keys.ts` (UI) | `registerFrameKeys({ save, print, open, find, replace, help, zoomIn, zoomOut, zoomReset })`: capture-phase handler; each app passes only what it supports. Ctrl+S shows one toast text; F1 and Ctrl+/ open the shortcuts dialog. | 4 different keydown handlers |
| `statusbar.ts` | `createStatusBar(shell)` → `{ left: HTMLElement, right: HTMLElement, setZoom(z), setInfo(text) }`. Left: page/slide/selection info. Right: language · zoom control · (Suggesting) · (Comments). | per-app status HTML |
| `zoom.ts` | `createZoomControl({ get, set, fit, min, max, presets })`: a compact `− [100 % ▾] +` control with preset menu and Fit; the same widget in every status bar. | writer slider + select, diagram toolbar zoom, Univer and Excalidraw zoom UI |
| `toolbar.ts` | `tbButton(icon, label, run, {active, enabled, shortcut})`, `tbGroup`, `tbSelect`, `tbColor`, overflow "⋯" menu when the row is full (instead of wrapping) | three local `tbButton` copies (writer `commands.ts`, `diagram/editor.ts`, slides) |
| `shortcuts.ts` | `showShortcuts(sections: {title, rows: [label, keys][]}[])`: common section (file, edit, view, help) + app section | 3 hand-written dialogs |
| `widgets.ts` | add `confirmDialog(title, text, {danger})`, `toast(msg, {action})` | native `confirm()` ×3 |
| `saveState` (in `chrome.ts`) | `setupSaveState(session)`: called by `setupChrome`, so draw gets it too; shown as a cloud/check icon on phones | 4 copies of the same code |
| `tokens.css` (or the top of `base.css`) | full token set: `--toolbar-bg --toolbar-fg --divider --on-accent --app-color --app-color-soft --radius-s(4) --radius-m(8) --radius-l(12) --radius-pill --space-1..4 --font-ui --font-size-ui(14) --font-size-small(12) --bp-phone(600) --bp-tablet(900)` + dark / contrast values | literals in §2.10 |

`--app-color` is set by `renderShell` on `.app` from `AppInfo.color`, so slides, draw and Univer read it instead of literals.

### 4.3 Third-party editors: what each allows (checked in `node_modules` and at runtime with `feas.cjs`)

**Univer 1.0.2 (sheet)**
* `univerAPI.setTheme(theme)` works with `@univerjs/themes`, which includes `greenTheme`; it can also take a theme derived from our tokens (`primary[600] = --app-color`, etc.). `univerAPI.toggleDarkMode(bool)` works too. Verified: `shots/feas-sheet-green-dark.png` (a dark, green Univer under our app bar).
* `ribbonType: 'simple' | 'collapsed' | 'classic' | 'grid'` and `univerAPI.setRibbonType()`: `simple` removes the tab row (one tool row). Verified in `shots/feas-sheet-ribbon-simple.png` and `…-collapsed.png`.
* Preset config `header`, `toolbar`, `footer`, `contextMenu`, `headerMenu`, `menu` (per-item hide/order), plus `setUIVisible(BuiltInUIPart.TOOLBAR, false)`. Verified hiding: `shots/feas-sheet-no-toolbar.png`.
* **Recommendation:** keep Univer's tool row (it is the formatting toolbar and is hard to reimplement) as `ribbonType: 'simple'`, and move the tab contents (Insert, Formulas, Data, View) into **our** menubar as Insertar / Formato / Datos / Ver items that call `univerAPI.executeCommand(<id>)`. Keep Univer's footer (sheet tabs are essential) but restyle it with the theme. Keep Univer's context menu (rich and cell-aware), themed. Our zoom control goes in the status bar only if the footer's zoom can be hidden; otherwise keep Univer's zoom and accept the difference.
* Risks: command ids are internal and change between Univer versions (mitigation: pin the version and keep a table of ids with a smoke test); some tab items open Univer side panels (that is fine). `simple` hides tab-only tools, so check that everything is reachable through our menus before switching. The Univer theme object is large (colour scales); derive it programmatically from the 4–5 tokens.

**Excalidraw 0.18.1 (draw)**
* The `theme: 'light' | 'dark'` prop (or `updateScene({appState:{theme}})`) works. Verified: `shots/feas-draw-dark-nohamburger.png`. Excalidraw's dark mode inverts the canvas; this is acceptable because it is Excalidraw's standard dark rendering, and export keeps the original colours.
* The CSS variables `--color-primary(-darker/-darkest/-light/-hover)`, `--color-surface-primary-container`, `--ui-font`, `--border-radius-lg/md`, `--island-bg-color` and `--default-button-size` are all themable. Verified with the app colour: `shots/feas-draw-tokens.png`.
* The hamburger can be removed. Hiding `.main-menu-trigger` with CSS works (verified). A cleaner option is to keep `<MainMenu>` empty and hide the trigger. The `UIOptions.canvasActions` flags (`toggleTheme: false`, `clearCanvas`, `changeViewBackgroundColor`, `export`, `saveAsImage`) remove the default items.
* Available API for our menus: `getSceneElements`, `updateScene`, `scrollToContent` (Fit), `setActiveTool`, `toggleSidebar({name:'default', tab:'search'})` (Find, confirmed a function), `setToast`, `resetScene`, and `exportToBlob`/`exportToSvg`.
* **Not available:** undo/redo methods (0.18 exposes only `history.clear`) and a direct zoom setter other than `updateScene({appState:{zoom:{value}}})`. Mitigation: keep Excalidraw's bottom-left undo/zoom island, or dispatch synthetic Ctrl+Z / Ctrl+Shift+Z key events to the Excalidraw container (not verified in this audit; test first).
* **Recommendation:** show our menubar in draw (File/Edit/View/Insert/Help from the frame; Insert = tools via `setActiveTool`), hide the hamburger, set `theme` from our a11y theme, and map tokens in `draw.css`. Keep Excalidraw's tool island (it is the toolbar, the drawing equivalent of a ribbon) and its property panel. Add our status bar with a zoom control reading `appState.zoom` through `onChange`. The Excalidraw footer zoom can then be hidden with CSS.
* Risks: CSS selectors on Excalidraw internals (`.main-menu-trigger`, `.layer-ui__wrapper__footer-left`) can break on upgrade (pin the version and screenshot-test); the mobile layout is Excalidraw's own and the bottom bar hosts the menu trigger on phones (if hidden, the File menu must be reachable from our menubar, which is fine because ours is visible on phones); keyboard shortcuts overlap (in the probe, Excalidraw swallowed Ctrl+S/O/P without doing anything; register ours in the capture phase on `document` so they run first, and verify that Excalidraw's own Ctrl+O/Ctrl+S actions do not also fire).

**TipTap / maxGraph (writer, diagram, slides)**: fully ours, no limits.

---

## 5. Implementation plan (work packages with disjoint file ownership)

Order: **WP1 and WP2 first** (foundation, ~1 day each, can run in parallel since the files are disjoint), then **WP3–WP8 in parallel**, then **WP9** (i18n) last. Each WP lists files owned, work, effort (S ≤ ½ day, M ≈ 1 day, L ≈ 2–3 days), risks and acceptance.

### WP1: Tokens and base styles (owner: design tokens)
* **Files:** `src/ui/base.css`, `src/ui/accessibility.css`, `src/ui/edu.css`, `src/home/home.css`, new `src/ui/tokens.css` (imported by `base.css`).
* **Work:**
  * Add the token set from §4.2, including **light defaults** for `--toolbar-bg`, `--toolbar-fg`, `--divider`, `--on-accent`, `--active-fg`, `--badge-*`, `--toast-bg`, `--radius-*`, `--space-*` and `--font-*`.
  * Replace the literals in `base.css`, `edu.css` and `home.css`, and collapse the theme overrides in `accessibility.css` into token values (removing most `html[data-a11y-theme] .x {…}` rules).
  * Normalise radii (4 controls / 8 panels and menus / 12 dialogs / pill) and breakpoints (600 phone, 900 tablet; document the values in a comment, since CSS variables cannot be used in media queries).
  * Home header uses the app-bar look (grey `--bg`, same heights); new-cards become a 5-column (or auto-fit) grid.
* **Effort:** M. **Risk:** visual regressions across all apps, so take before/after screenshots with `audit.cjs`. **Acceptance:** `grep` shows no hex colours in `base.css`/`edu.css` except inside token definitions; all themes look unchanged or better.

### WP2: App frame core (owner: shell)
* **Files:** `src/ui/shell.ts`, `src/ui/chrome.ts`, `src/ui/widgets.ts`, `src/ui/versions.ts`, new `src/ui/frame.ts`, `src/ui/menus.ts`, `src/ui/frame-keys.ts`, `src/ui/statusbar.ts`, `src/ui/zoom.ts`, `src/ui/toolbar.ts`, `src/ui/shortcuts.ts`, `src/ui/about.ts` (move `about()` out of `writer/dialogs.ts`, leaving a re-export there).
* **Work:** the components in §4.2:
  * the shared File/Edit-skeleton/Help menu builders with the standard order;
  * `registerFrameKeys` (Ctrl+S/O/P/F/H, Ctrl+/, F1);
  * `setupSaveState` inside `setupChrome`, with an icon-only state under 600 px;
  * `confirmDialog`;
  * status bar and zoom control;
  * the toolbar helpers with an overflow "⋯" menu instead of wrapping;
  * the shortcuts dialog with a common section;
  * `--app-color` on `.app`;
  * hand in added to the File menu (`handIn` from `chrome.ts`);
  * a "Document details…" dialog (generic: title, type, created, last change, size of the Y state; the app adds counts through `spec.details()`);
  * hooks for "Open from Nextcloud…" / "Save to…" (`spec.cloud?`), a no-op until the Nextcloud work (`src/core/nextcloud.ts`, in progress in the main tree) lands.
  * Replace `confirm()` in `versions.ts`.
* **Effort:** L. **Risk:** API churn for the app agents, so land the types first (a `FrameSpec` stub) and keep the old `createMenuBar` working. **Acceptance:** a demo app (or the diagram, WP6) is fully on `mountFrame`; `npx tsc --noEmit` is clean.

### WP3: Writer adoption (owner: writer)
* **Files:** `src/apps/writer/app.ts`, `commands.ts`, `find.ts`, `dialogs.ts`, `writer.css`, `spell/ui.ts` (status-bar slot only).
* **Work:**
  * Move the File/Help menus to the frame builders (Download ▸ unchanged; Page setup in `fileExtras`; "Mis documentos…" becomes the frame's "All documents"; decide whether to keep it as a dialog).
  * Deduplicate View vs Review: keep the review toggles in Revisar only, and move Word count to Herramientas.
  * Toolbar via `toolbar.ts` with overflow, so it stays on one row at 1366 px; the Mode select moves to the right end or into the overflow.
  * Status bar via `statusbar.ts` with the shared zoom control (drop the slider and the toolbar zoom select, or keep the select only).
  * Find panel buttons use lucide `ChevronUp/Down/X`.
  * Replace `confirm()` in `dialogs.ts:188`.
  * Replace `writer.css` literals (`.hf-toolbar`, `.status-mode`) with tokens; document-content colours may stay.
* **Effort:** M. **Risk:** low.

### WP4: Sheet adoption and Univer theming (owner: sheet)
* **Files:** `src/apps/sheet/app.ts`, `src/apps/sheet/univer.ts`, `src/apps/sheet/sheet.css`, new `src/apps/sheet/menus.ts`, new `src/apps/sheet/theme.ts`.
* **Work:**
  * Frame File/Edit/Help. Edit gains Cut/Copy/Paste/Select all through Univer commands. Add Ver / Insertar / Formato / Datos menus mapped to Univer command ids (freeze, gridlines, zoom; insert rows/cols/sheet/image/link/note/table/chart…; number format, bold…, conditional formatting, data validation; sort, filter).
  * `ribbonType: 'simple'` (single tool row, no tabs).
  * `theme.ts` builds a Univer `Theme` from our tokens and `--app-color` (green), and calls `toggleDarkMode` following the a11y theme (listen for `data-a11y-theme` changes with a MutationObserver on `<html>`).
  * Localise the default sheet name (`Sheet1` → `t('Sheet{n}')`).
  * Use the shared shortcuts dialog (app section).
* **Effort:** L. **Risks:** Univer command ids are internal; `simple` may hide tools (verify each tab item is reachable); a high-contrast theme for Univer may be imperfect (fall back to dark). Keep Univer's footer (sheet tabs and zoom) and context menu. **Acceptance:** `mobile-sheet-default` shows 3 chrome rows at most; `dark-sheet-default` is dark; F10 reaches Datos.

### WP5: Draw adoption and Excalidraw theming (owner: draw)
* **Files:** `src/apps/draw/app.ts`, `src/apps/draw/draw.css`, new `src/apps/draw/menus.ts`.
* **Work:**
  * Show our menubar via the frame. File (Download ▸ PNG / SVG / .excalidraw; Print, using the existing `session.hooks.print` path). Edit: undo/redo by dispatching keys, cut/copy/paste/duplicate/delete/select all through synthetic key events, Find → `toggleSidebar({name:'default', tab:'search'})`. View: zoom, fit (`scrollToContent`), grid, zen mode, canvas background. Insert: tools via `setActiveTool`, image, library. Help: frame.
  * Remove the hamburger (CSS or empty `MainMenu`) and set `UIOptions.canvasActions` to `{ toggleTheme: false, clearCanvas: false, loadScene: false, saveToActiveFile: false }` (Clear canvas moves to Edit with our `confirmDialog`).
  * Set the `theme` prop from the a11y theme; map `--color-primary*`, `--color-surface-primary-container`, `--ui-font` and radii to our tokens in `draw.css`.
  * Save state comes from WP2. Add our status bar (selection count, zoom control bound to `appState.zoom`) and hide Excalidraw's footer zoom.
  * Render `WelcomeScreen` hints as the empty state.
  * Shortcuts: ours for file/help keys; Excalidraw keeps canvas keys.
* **Effort:** L. **Risks:** Excalidraw internal class names; synthetic key events for undo/clipboard (clipboard may need a user gesture, so fall back to hints as the writer does with `pasteHint`); mobile layout (verify at 390 px).

### WP6: Diagram adoption (owner: diagram, which also owns the editor shared with slides)
* **Files:** `src/apps/diagram/app.ts`, `editor.ts`, `format.ts`, `sidebar.ts`, `diagram.css`.
* **Work:**
  * Frame File (Download ▸ .drawio / SVG / PNG) and Edit (existing items + Find Ctrl+F: new simple label search over cells, selecting and scrolling to matches, exposed as `editor.find()` for slides).
  * Add Insertar (text, shape…, image, link, table?) and Formato (fill, line, text style, Edit style…; currently only in the panel) menus.
  * Zoom via the shared zoom control in the status bar (the toolbar keeps −/+/fit or drops them).
  * The format panel uses lucide icons (Bold, Italic, Underline, Strikethrough, AlignLeft/Center/Right, AlignVerticalStart/Center/End).
  * `diagram.css` literals → tokens; the canvas uses `--canvas`/`--surface` (keep white for the page, but give the canvas surround the dark treatment).
  * Localise `Page-1` → `t('Page {n}')`.
  * Ctrl+O (`openFile`) through the frame keys.
* **Effort:** M–L. **Risk:** slides depends on `editor.ts`, so keep `editMenu()`, `arrangeMenu()` and `zoomMenu()` signatures backwards compatible and tell the slides agent.

### WP7: Slides adoption (owner: slides)
* **Files:** `src/apps/slides/app.ts`, `slides.css`, `slidelist.ts`, `notes.ts` (style only).
* **Work:**
  * Frame File: Download ▸ PowerPoint (.pptx) / OpenDocument (.odp) / PDF (via Print) / Current slide as PNG / All slides as PNG (.zip); Slide size in `fileExtras` (Google puts Page setup there). Keep Format ▸ Theme.
  * Edit gets Find via `editor.find()`; View zoom from the frame.
  * Toolbar via `toolbar.ts`; the "Presentar" primary button keeps its place (it is Google's pattern).
  * `#d24726` → `var(--app-color)`; focus outline → `var(--focus)`; canvas → `var(--canvas)`.
  * Ctrl+O and Ctrl+/ through the frame.
* **Effort:** M. **Risk:** depends on WP6 for `find()`.

### WP8: Home alignment (owner: home)
* **Files:** `src/home/home.ts` (CSS handled in WP1).
* **Work:**
  * App-bar parity: the same accessibility button variant (icon plus label is fine at home, but use the same component class); a suite logo distinct from the writer "W" (e.g. a neutral grid icon or "WO" in `--accent`).
  * Replace the native `confirm()` (`home.ts:131`) with `confirmDialog`.
  * An empty state for "no documents yet" that matches the app empty-state pattern.
* **Effort:** S.

### WP9: Strings and translations (owner: i18n, runs last)
* **Files:** `src/core/locales/*.ts`.
* **Work:** translate all new `t()` keys (menu labels, Document details, confirm texts, "Sheet{n}", "Page {n}", the unified Ctrl+S toast). Check with a grep of `t('…')` across the diff.
* **Effort:** S–M.

### Cross-cutting acceptance (run after each WP; `audit.cjs` is reusable)
* The File menu dump (`inventory.json › *.menus[0]`) has the same item order in all 5 apps, differing only in Download formats and app extras.
* The key-probe table in §2.8 has no "nothing" cells for Ctrl+S/O/P/F/, Ctrl+/ and F1.
* `cmp-dark.png` shows no light editor in any app.
* The writer toolbar is one row at 1366 px; mobile shows the save state as an icon.
* No `confirm(` in `src/`.

### Effort total
WP1 M, WP2 L, WP3 M, WP4 L, WP5 L, WP6 M–L, WP7 M, WP8 S, WP9 S–M: about 12–15 agent-days, or about 5 calendar days with the parallelism above.
