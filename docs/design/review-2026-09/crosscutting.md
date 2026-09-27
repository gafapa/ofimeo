# Ofimeo: suite-wide (cross-cutting) audit

What was tested: the production build in `dist/`, served with `vite preview` on port 4504 and the local relay `tests/relay.mjs 7794`. All URLs used `?relays=ws://127.0.0.1:7794`. Browser: headless Chromium from /opt/pw-browsers.
Scripts: `scratchpad/pw/*.mjs`. Screenshots: `scratchpad/review/shots/`. Raw data: `scratchpad/pw/*.json`.
Every finding below was reproduced in the browser, unless it is marked as a docs check.

## 1. Consistency matrix

Legend: Y = present and works; — = absent; (n) = note below the table.

| Feature | writer | sheet | draw | diagram | slides | forms | pdf |
|---|---|---|---|---|---|---|---|
| Shared frame (`mountFrame`) | Y | Y | Y | Y | Y | Y | Y |
| File menu in the standard order | Y (+Page setup) | Y | Y (+Export image) | Y | Y (+Slide size) | Y (+Import response files) | Y |
| Download as | docx, odt, html, txt, pdf | xlsx, ods, csv, PDF via Print | excalidraw, png, svg | drawio, svg, png (+selection) | pptx, odp, PDF via Print, png, png zip | oform, responses csv/xlsx | editable + flattened (1) |
| Save to Nextcloud… / Nextcloud account… | Y | Y | Y | Y | Y | Y | Y |
| Hand in (button and menu) | Y | Y | Y | Y | Y | Y | Y |
| Print | Y | Y | Y (empty drawing shows a toast) | Y | Y | prints the editor (F4) | Y |
| Version history / Save version | Y | Y | Y | Y | Y | Y | Y |
| Make a copy (also from a view link) | Y | Y | Y | Y | Y | Y | Y |
| Share with edit/comment/view/copy | Y | Y | Y | Y | Y | Y (2) | Y |
| Document details | Y | Y | Y | Y | Y | Y | Y |
| Find (Ctrl+F) | Y | Y | Y | Y | Y | — (F5) | Y |
| Find and replace (Ctrl+H) | Y | Y | — | — | — | — | — |
| Zoom control in the status bar | Y | Y | Y | Y | Y | — (F5) | Y |
| Shortcuts dialog (Ctrl+/) | Y | Y | Y | Y | Y | Y | Y |
| Help center + Getting started quick start | Y | Y | Y | Y | Y | Y | Y |
| WebMCP toggle + indicator | Y | Y | Y | Y | Y | Y | Y |
| WebMCP tools (count) | 10 | 8 | 3 | 5 | 7 | 4 | 5 |
| Accessibility panel (button and Help menu) | Y | Y | Y | Y | Y | Y | Y |
| Own spellcheck | Y | browser only | browser only | label editor (3) | label editor (3) | browser only | browser only |
| Catalog templates | 6 | 4 | 1 | 4 | 2 (1 in fr/de) | 4 | 0 |
| Save as template / use it | Y | Y | Y | Y | Y | Y (questions kept) | Y |
| Home content search | Y | Y | Y | Y | Y | title only (F2) | title only (F2) |
| Home Download (⋮) | docx | — by design (toast) | excalidraw | drawio | pptx | oform | fails (F1) |
| Open from the home screen after downloading | docx/odt/html/txt | xlsx/ods/csv | excalidraw | drawio | pptx; not odp (F3) | oform | pdf |
| Offline second load (`setOffline`) | Y | Y | Y | Y | Y | Y | Y |
| View link: no edits possible, no crash | Y | Y, but throws uncaught errors (F7) | Y | Y | Y | respondent page | Y (stamp items disabled) |
| Comment link | comment only | as view | as view | as view | as view | same as view (2) | sticky notes only |

Notes:
- (1) Both PDF formats download with the same file name (P3).
- (2) In Forms, the comment link opens the same respondent page as the view link (P2).
- (3) `attachSpellcheck` is wired in `src/apps/diagram/graph.ts:340`. I checked the code, not the running app.

Other checks that passed:
- Every menu bar follows File · Edit · View · Insert · Format · ‹app› · Tools · ‹review› · Help.
- Tools always ends with "Allow AI assistants (WebMCP)…".
- The Help menu is the same in every app, including Connection test and About.
- `webmcp.mjs`: the home screen has no WebMCP tools. It has no Tools menu, so this looks expected.

## 2. Findings

### F1 · bug · Home "Download" always fails for PDFs, and one PDF in a selection aborts the whole zip
- Steps (single document): home ▸ ⋮ on a PDF ▸ Download. The toast says "Download failed: The PDF is still loading" and no file is saved. `homedl.mjs`.
- Steps (selection): Ctrl-click a PDF, a drawing and a diagram ▸ Download. Nothing is downloaded, and the same toast appears. Evidence: `homedl2.mjs`, `shots/home-multi-download-pdf-fail.png`.
- Cause:
  - `src/home/download.ts:17` (`canDownload` only excludes sheets) builds a fake session with `hooks: {}`.
  - `src/apps/pdf/index.ts:60-62` `submitFiles` then throws, because no app is mounted (`pdfApps.get(session)` is undefined).
  - `download.ts:57-66` catches around the whole loop, so one failure aborts the whole zip.
- Fix:
  - Either build the annotated PDF from the stored state without the viewer, or exclude `pdf` in `canDownload` with a clear toast, as is done for sheets.
  - In the zip loop, skip documents that fail and report them, instead of aborting.

### F2 · gap · Content search does not index Forms or PDFs
- Steps: create a form from the "Cuestionario de repaso" template and import a PDF whose text contains "zebracorn". Search the home screen for "capital de Portugal", then for "zebracorn".
  - The form is not found. The only hits are spreadsheets imported from its response CSV/XLSX.
  - "zebracorn" returns 0 results.
  - Evidence: `search.mjs` output, `shots/home-search.png`.
- Cause: `src/core/library-extract.ts:16-19` sends every type that is not writer, sheet or draw to `diagramText`. For forms and PDFs, only the title is indexed. The search box says "Search in titles and content" for every app.
- Fix:
  - Add `formsText`: title, description, question titles and options (no answer key).
  - Add `pdfText`: the text layer if it is stored, plus note and comment texts and the file name.

### F3 · gap · Slides downloads .odp but cannot open it
- Steps: in Slides, File ▸ Download as ▸ OpenDocument presentation (.odp). Then try to open that file from the home screen.
  - The home file input does not accept `.odp`, and neither does File ▸ Open.
  - Evidence: `rt2.mjs`, line "slides-Untitled presentation.odp -> NOT ACCEPTED".
- Cause: `src/apps/registry.ts:92` has `accept: '.pptx,.ppt'`. `src/apps/slides/formats/odp.ts` only exports. Writer and Sheets both open ODF.
- Fix: add an ODP importer, or at least state "export only" in the menu label, the README and the help article. The help article says "Opens PowerPoint (.pptx). Downloads … (.odp)", which is accurate but asymmetric.

### F4 · gap · Forms "Print" prints the editor, including the answer key
- Steps: create a form from the "Cuestionario de repaso" template ▸ File ▸ Print.
  - The page prints the editor: type selects, "Mark correct" / "Correct" chips, "Add option", "Description (optional)" placeholders, and the Answer key boxes with the correct values.
  - This cannot be handed to students as a paper quiz.
  - Evidence: `shots/forms-print-media.png`, `shots/forms-print.pdf`.
- Cause: `src/apps/forms/app.ts` passes `print: () => window.print()` in the `mountFrame` call, with no print stylesheet for the editor.
- Fix: print the respondent rendering (blank form). Optionally offer "Print with answer key" for the teacher.

### F5 · gap · Forms has holes in the shared frame
- Missing in Forms:
  - Find (Ctrl+F falls through to the browser).
  - Zoom control.
  - Cut, Copy, Paste and Select all in the Edit menu. Edit contains only Undo and Redo.
- Evidence: `matrix.mjs` output, `shots/matrix-forms.png`.
- The help article "Keyboard shortcuts" says Ctrl+X/C/V/A, Ctrl+F and Ctrl+H "work in every app" (`src/help/articles/en.ts:156-161`). This is false for Forms, and for Ctrl+H also false in draw, diagram, slides and pdf.
- Fix: add at least `find` (search question text) and the clipboard items to Forms' `edit` options. Also reword the help article: "Ctrl+H where the app supports replace".

### F6 · gap · On phones and narrow windows (≤760 px) you cannot set your name
- Steps: set the viewport to 390×844. The "Your name" input is hidden on the home screen and in every app. No other place offers it; only Hand in asks for it. Evidence: `phone2.mjs` prints `name input visible on phone home: false` and `name input in app: false`.
- Cause: `src/ui/base.css:231` (`.user-name … display:none`) and `src/home/home.css:65`.
- Why it matters: help "Getting started" (`src/help/articles/en.ts:17`) tells users to "Type your name in the box at the top right". Phone users always appear as "Guest NNN" to collaborators and in comments.
- Fix: put the name field in the accessibility panel or behind the avatar, or add a "Your name…" item to the Help or File menu on narrow screens.

### F7 · bug (minor) · Sheets view and comment links throw uncaught exceptions on every keystroke
- Steps: open a sheet's view (or comment) link, click a cell and type.
  - Each key throws an uncaught `Error: This spreadsheet is view only`: 14 `pageerror` events for one short string.
  - The cell editor still opens and shows the typed text in the formula bar, although nothing is saved.
  - Evidence: `perms.mjs` output, `shots/perm-sheet-view-after.png`.
- Cause: `src/apps/sheet/app.ts:90` throws inside a Univer command interceptor.
- Fix: cancel the command without throwing (return false, or stop the edit), toast once, and keep the editor from entering edit mode for view access.
- No other app allowed an edit or raised a page error with view or comment links (writer, draw, diagram, slides, forms, pdf).

### P1 · polish · A Forms link without an edit key blames https
- Steps: open `#app=forms&doc=anything` on http://127.0.0.1, which is a secure context.
  - The page says "This form cannot be opened here. Forms need a secure (https) connection and a recent browser…".
  - The real cause is an unprotected legacy link (no key or edit key).
  - Evidence: `shots/forms-bare-link.png`.
- Cause: `src/apps/forms/app.ts:36-39` uses one message for `!session.isProtected` and for missing X25519.
- Fix: separate the two messages.

### P2 · polish · The Forms Share dialog offers "Can comment", which is the same as view
- Both the comment and the view link open the respondent page. Evidence: `perms.mjs` output for forms.
- Fix: hide the comment tab for forms, or label the view link "Respond".

### P3 · polish · Both PDF downloads use the same file name
- File ▸ Download as ▸ "PDF with annotations (editable)" and "… (flattened)" both save as `fixture.pdf` (`rt2.mjs`).
- Hand in already uses "(flattened)" for the second file (`src/apps/pdf/index.ts:67`). Download does not (`src/apps/pdf/app.ts:190-193`).
- Fix: give the flattened option its own `ext` or name suffix.

### P4 · polish · The About dialog and the PWA manifest list only five apps
- Both say "…documents, spreadsheets, drawings, diagrams and presentations." Forms and PDF are missing, even when About is opened from Ofimeo PDF.
- Evidence: `shots/act-pdf-about.png`, `dist/manifest.webmanifest`.
- Code: `src/ui/about.ts:19` and `vite.config.ts:32`.
- The welcome tour and the help center already name all seven apps.

### P5 · polish · "Copy of Untitled"
- Make a copy of an untitled spreadsheet gives the title "Copy of Untitled", not "Copy of Untitled spreadsheet". Evidence: `shots/copy-from-view-sheet.png`.
- Cause: `src/core/copy.ts:27`.
- Fix: fall back to `appInfo(type).untitled`.

### P6 · polish (a11y/i18n) · Univer ARIA labels are untranslated raw keys
- In every language, including English, the Sheets toolbar has `aria-label="ribbon.start"`. There are also two `<section aria-label="Notifications alt+T">` elements.
- Screen readers announce these. Evidence: `ribbon.mjs` output.
- Fix: override the labels after Univer mounts (as `sheet/theme.ts` already restyles it), or add a locale entry for `ribbon.start`.

### P7 · polish · Duplicate folder and tag names are accepted
- Creating "Clase 1A" and "Urgente" three times gives three identical folders and tags. The move dialog and the tags submenu then list indistinguishable entries.
- Evidence: `shots/lib-folder-tag.png`, `library.mjs` output ("Clase 1A Clase 1A Clase 1A").
- Fix: reject names that already exist (case- and accent-insensitive), or merge into the existing folder or tag.

### P8 · polish · The school relay field accepts anything
- Steps: Connection test ▸ School relay ▸ type "not a url" ▸ Use this relay.
  - The message says "Could not reach the relay (Failed to fetch). If it uses its own certificate, open its address…".
  - It also shows an "Open the relay" link to the invalid address.
  - Evidence: `shots/conn-relay-not_a_url.png`.
- Fix: validate that the value is an `http(s)` or `ws(s)` URL before fetching, and show "This is not a valid address".

### P9 · docs · README and help claims that do not match the app
Checked by reading the docs and comparing with the app.
- **Show authorship menu:**
  - `README.md:130` says "*View → Show authorship*". The item is in **Review** (writer's View menu contains only Zoom).
  - The help article is correct.
- **Templates table:** `README.md:598-604` has no Forms row, although Forms has four catalog templates. It also does not say that PDF has none.
- **File handlers:**
  - `README.md:785` lists the handlers without `.pdf`, but the manifest registers `.pdf`.
  - The manifest omits formats the app opens (`.doc`, `.xls`, `.ppt`, `.vsdx`, `.oform`, `.md`, `.tsv`, `.zip`).
- **Sheets help article:** `src/help/articles/en.ts:213` says "**Format** has number formats, borders…". The Format menu has no Borders item; borders are only on the Univer toolbar.
- **Shortcuts help article:** `src/help/articles/en.ts:156-161` claims every shortcut works in every app (see F5).
- **Getting started help article:** `src/help/articles/en.ts:17` says to type your name in the top-right box, which is not possible on phones (see F6).
- **Forms quick start:** it says "Add section" and "Make this a quiz". The toolbar labels are "Section" and "Quiz" (the aria-label is "Add question").

### P10 · polish · Template gallery details
- The filter chips of the template gallery are in a different order from the chips of the document list (Diagrams/Presentations/Drawings vs Drawings/Diagrams/Presentations). Evidence: `shots/home-en.png`.
- There are no PDF templates and no PDF chip. This is acceptable, but README and help could say so.
- Template content exists only in es/gl/fr/de. English users get Spanish content by default. This is documented in the README.

## 3. Areas checked with no findings
- **Onboarding.** `?tour`: five steps, correct at 1366 px and 390 px (`shots/tour-*`). Every app has a quick start, and view and comment links get their own (`shots/quickstart-view.png`, `quickstart-comment.png`).
  - The claims of the view quick start ("Make a copy gives your own copy") were verified from view links in writer, sheet and pdf.
  - Help center articles exist for all seven apps. Other than P9, the claims I checked match the menus (Arrange ▸ Layout, More shapes, Export image…, pdf keys H/P/T/N/S/G).
- **i18n.**
  - Static check: all 2122 `t()` and `tn()` keys have entries in es, gl, fr and de (`i18nstatic.mjs`, 0 missing).
  - Runtime sweep of the home screen, the Storage and Nextcloud dialogs, every app's menus (with submenus), toolbars and the Share dialog in es, gl, fr and de: no visible English UI strings besides terms that are the same in both languages. The only leak is P6, which is screen-reader only. Screenshots: `shots/i18n-<lang>-*.png`.
- **Backup and restore.**
  - Backup with a password of 25 documents, then restore into a fresh browser.
  - A wrong password shows "Wrong password"; the right one gives the report "25 added".
  - Folders and tags were restored, and the restored documents open (`backup.mjs`, `shots/restore-report.png`, `shots/restore-open-sheet.png`).
- **Folders, tags and trash.** Move to folder, tag, filter by tag, move to trash, restore (`library.mjs`).
- **Templates.** One catalog template per app opens with no errors (`shots/tpl-*.png`). Save as template and reuse work for writer, draw, forms and pdf (`mytpl*.mjs`).
- **Open and import.** Files downloaded from each app open again from the home screen: docx, odt, html, txt, xlsx, ods, csv, excalidraw, drawio, pptx, oform, pdf (`roundtrip.mjs`, `rt2.mjs`).
- **Offline.** The service worker registers and the home screen shows "✓ Available offline". After `setOffline(true)`, new documents open in all seven apps and a PDF import works (`offline.mjs`, `shots/offline-*.png`).
- **Connection test.** It gives a verdict, a relay list (the configured relay plus the public ones, as designed), WebRTC rows and Copy report (`shots/conn-home-verdict.png`).
- **Nextcloud UI with no server.**
  - The account dialog offers Login Flow or an app password.
  - Connect to an unreachable address says "The server cannot be reached…".
  - "Open from Nextcloud" without an account opens the account dialog.
- **Phone width and themes.** At 390 px in light, dark, contrast-dark and contrast-light: no horizontal page overflow on the home screen, the Storage and Nextcloud dialogs or the help center; dialogs are 356 px wide.
  - In apps the menu bar scrolls horizontally (`overflow-x: auto`), which is intended.
  - Screenshots: `shots/phone-*`.
- **Legal pages.** No broken relative links in `dist/legal/**` or `licenses.html`. `dist/.well-known/security.txt` is present, with Contact, Expires (2027-03-25) and Canonical.

## 4. Test caveat
In headless Chromium, blob downloads whose names are not plain ASCII (for example "Rúbrica.docx") come back named `download`. A plain `<a download>` on a static page does the same (`dlname.mjs`), so this is a harness quirk, not an app bug. The downloads were re-checked with ASCII titles.
