# Sheet + Forms audit (production build, dist/)

Setup: `vite preview` on 127.0.0.1:4502, local relay `node tests/relay.mjs 7792`, Chromium from /opt/pw-browsers, URLs with `?relays=ws://127.0.0.1:7792&notour`. Protected documents were opened as `#app=<app>&doc=<id>&key=<18B b64url>&edit=<32B b64url>` (the form used in tests/e2e/forms.spec.ts). Scripts are in `scratchpad/pw/`, screenshots in `scratchpad/review/shots/`, exported files in `scratchpad/rt/`.

What was covered:
- Every leaf of every Sheet menu, in en (125 items) and es. Raw results are in `sheet-walk-en.json`.
- Every leaf of every Forms editor menu.
- Univer panels in es, gl and de.
- XLSX, ODS and CSV export, then re-import. LibreOffice-made .xls and .ods import.
- Pivot tables, descriptive statistics, version history.
- View and comment links on a Sheet, using two browser contexts.
- Forms teacher/student quiz flow in es. Responses exported as CSV and XLSX, sent to Sheets with Open in Sheets, and round-tripped as .oform.
- Make a copy of a form.
- Dark mode, both high-contrast modes and a 390 px viewport.
- Print output (page.pdf rendered as PNG).

Things that worked, so they are not listed below:
- Every menu item ran without a pageerror.
- A chart survives xlsx and ods round trips.
- Spanish function names are saved with their English names (=SUMA becomes SUM).
- .xls and LibreOffice .ods import.
- Version restore in Sheet.
- .oform export and import keeps the answer key.
- Respondents do not receive answer keys: checked in the DOM and against the tests.
- No static t() string in either app is missing from es, gl, fr or de (checked with `scratchpad/i18ncheck.mjs`).

---

## BUGS

### B1. Sheet: conditional formatting, notes, named ranges and filters are lost in XLSX and ODS (both import and export)
- **App:** Sheet
- **Steps:**
  1. Import `rt/features.xlsx` (made with ExcelJS). It contains a conditional format that fills B2:B4 red when the value is <5, a note on A2, an autoFilter on A1:B4, a defined name `scores` and `D1 =SUM(scores)`.
  2. After import there is no red fill, no note marker and no filter, and D1 shows `#NAME?` (`shots/features-imported.png`).
  3. Download as .xlsx. `features-out.xlsx` has no `<conditionalFormatting>`, `<autoFilter>`, comments or `<definedName>`, yet it still writes the formula `<f>SUM(scores)</f>`. Excel and LibreOffice will open that file with a broken formula.
  4. Same with a note made in the app: Insert ▸ Note, type "Absent twice", then download .xlsx and .ods. The note persists in the app (`shots/sheet-note-created.png`, `sheet-note-after-reload.png`). The xlsx has no comments part and the ods has 0 `office:annotation` elements.
- **Code:** `src/apps/sheet/formats/xlsx-export.ts`, `xlsx-import.ts`, `ods-export.ts` and `ods-import.ts`. `grep -ci` finds 0 hits for `conditional`, `definedName`, `autoFilter` and notes. ODS export also has no data validation or hyperlinks.
- **Why it matters:** Format ▸ Conditional formatting, Insert ▸ Note, Data ▸ Named ranges… and Data ▸ Filter are all in the menus. A teacher who uses them and hands in or downloads the file silently loses that work.
- **Fix:**
  - Map Univer's CF resource (`SHEET_CONDITIONAL_FORMATTING_PLUGIN`) to and from ExcelJS `ws.addConditionalFormatting` and ODS `calcext:conditional-formats`.
  - Map notes (`SHEET_NOTE_PLUGIN`) to and from `cell.note` and `office:annotation`.
  - Map defined names to and from `wb.definedNames` and `table:named-expressions`.
  - Map the filter range to and from `ws.autoFilter`.
  - At minimum, warn on export ("Conditional formatting and notes are not saved in .xlsx").

### B2. Sheet: exported XLSX styled cells have no font name or size, so LibreOffice renders them in a serif font
- **App:** Sheet
- **Steps:**
  1. Type any text, bold a header, then Download as .xlsx.
  2. In `xl/styles.xml` the cell fonts are `<font><b/><color rgb="FF1B1C1F"/></font>`, with no `<name>` or `<sz>`.
  3. LibreOffice falls back to the theme's major font (Cambria, replaced by DejaVu Serif). Every styled cell prints in serif while unstyled formula cells stay sans: `shots/lo-render-xlsx-export-1.png`, and pdffonts reports DejaVuSerif.
  4. Re-importing that LibreOffice file into Ofimeo shows "Cambria" in the toolbar (`shots/import-src_xls.png`, `import-src_ods.png`).
- **Also:** every typed cell stores an explicit font color taken from the UI theme: `FF1B1C1F` in light mode, `FF26272A` when typed in dark mode (`rt/dark.xlsx`).
- **Code:** `src/apps/sheet/formats/xlsx-export.ts:101-113` (`fontOf`).
- **Fix:** Always emit `name` and `size`, falling back to the workbook default (Arial 11, which is what Univer shows). Don't persist theme-derived default text colors as cell styles, or strip them on export.

### B3. Sheet: Data ▸ Protect range… offers "Only I can edit" but protects nothing
- **App:** Sheet
- **Steps:**
  1. The teacher types "locked" in A1, selects A1, runs Data ▸ Protect range… and clicks Confirm. The panel shows "Created · I can edit" with a blank avatar (`shots/sheet-protect-teacher-edit.png`).
  2. A second browser opens the same edit link, types "student" in A1, and the edit goes through (`shots/sheet-protect-other-editor.png`).
  3. After reload the teacher sees "student" in the "protected" cell (`shots/sheet-protect-teacher-reload.png`).
- **Why:** There is no user identity: every peer is the same Univer user, so "Only I can edit" means everyone.
- **Code:** `src/apps/sheet/menus.ts` (`protectRange` item), `src/apps/sheet/commands.ts:74`.
- **Fix:**
  - Either remove the item, or relabel it "Lock range (warning only)" and make it just show Univer's prompt.
  - Hide the "Only I can edit / Specified users" options.
  - Also remove the "Protect Rows And Columns" and "Protect sheet" entries from Univer's context menus (they show in the cell and tab menus).

### B4. Forms: Make a copy drops the whole answer key
- **App:** Forms
- **Steps:**
  1. Turn on Quiz, add a Multiple choice question with Porto and Lisbon, and mark Lisbon correct.
  2. Run File ▸ Make a copy.
  3. In "Copy of Quiz to copy" both options show "Mark correct" and no answer is correct (`shots/forms-copy-original.png` versus `shots/forms-copy-copy.png`). Script output: `original [ 'Mark correct | Porto', 'Correct | Lisbon' ]`, `copy [ 'Mark correct | Porto', 'Mark correct | Lisbon' ]`.
- **Also affected:** "Save as template…", Version history "Open as copy" and "Restore" go through the same public-doc snapshot, so answer keys and feedback are not versioned or copied either.
- **Code:** `src/core/copy.ts:30-35` copies `snapshotState(session.doc)` only. For forms the key lives in the private doc (`src/apps/forms/state.ts`, `answersMap(priv)`).
- **Fix:**
  - Add a `session.hooks.copyExtras` hook (or a forms-specific copy) that writes `formFile(doc, priv)` into the new form. `createForm(parseFormFile(...))` already rebuilds keys correctly: the .oform round trip was verified.
  - Drop `form-receipts`, `form-results` and `responseKey` from the copied public doc.

### B5. Forms: the first tab ("Questions") cannot be reached at phone width
- **App:** Forms (editor)
- **Steps:** Open a form at 390×844 in es. The tab strip shows "guntas … Vista pre" (`shots/forms-light-390.png`).
- **Measured:** With scrollLeft = 0 the first tab starts at x = -40 px (`scrollWidth` 430, `clientWidth` 390). Scrolling can reveal the right end but never the left.
- **Code:** `src/apps/forms/forms.css:7`, `.fm-tabs { justify-content: center; overflow-x: auto }`. This is the classic centered-overflow trap.
- **Fix:** Use `justify-content: safe center`, or put `margin-inline: auto` on the first and last tab instead of centering.

### B6. Sheet: pivot table defaults build a nonsense table, and sums print with a trailing "."
- **App:** Sheet
- **Steps:**
  1. With data Name, Score and Group (text), open Data ▸ Pivot table… and click Create without changing anything.
  2. The defaults are Rows = Name, Columns = **Score**, Values = **Group** (a text column) and Sum. The result is a matrix of zeros shown as `0.` (`shots/sheet-pivot-defaults-result.png`). The comment in the code says "a numeric last column as values", but nothing checks that the column is numeric.
  3. Even with correct fields (Rows = Group, Values = Score) an integer sum shows as `12.` (`shots/sheet-pivot-sum-format.png`).
- **Default range:** When the active cell is an empty cell just below the data, the range grows to include that empty row (`A1:C6` in the es run, `shots/sheet-es-Tabla-din-mica-.png`).
- **Code:**
  - Guesses: `src/apps/sheet/pivot.ts:77-79`.
  - Number format `'#,##0.##'`: `src/apps/sheet/pivot.ts:202`.
  - Region growth: `src/apps/sheet/charts/dialog.ts` (`defaultRange`).
- **Fix:**
  - Pick the last column whose data cells are mostly numbers for Values, and default Columns to "(none)".
  - Use the format `General` or `#,##0.###############`, or `#,##0` with `0.##` only when the data has decimals.
  - Grow from the nearest non-empty cell.

### B7. Sheet: Descriptive statistics adds text columns and fills the summary with errors
- **App:** Sheet
- **Steps:** With Name, Score and Group, select a Score cell (B2) and run Data ▸ Descriptive statistics…. The range defaults to the whole block `A1:C5` (`shots/sheet-stats-dialog.png`). After Create, the Name and Group columns show `#DIV/0!` and `#NUM!` in 8 rows, with 0.00 elsewhere (`shots/sheet-stats-result.png`).
- **Polish:** Column A clips "Standard deviation (population".
- **Code:** `src/apps/sheet/stats.ts:112` (uses `defaultRange`) and the table writer below it.
- **Fix:**
  - When one cell is selected, default to that column's data block.
  - Skip columns whose data has no numbers, or say "(no numeric data)".
  - Autofit column A.

### B8. Sheet (view and comment links): uncaught exceptions and a misleading sheet-tab rename
- **App:** Sheet
- **Steps:** Open the view or comment link and try any edit: type in a cell, Delete, the toolbar Bold, "+" add sheet, or double-click a tab to rename it.
- **Exceptions:** Each attempt raises an uncaught `Error: This spreadsheet is view only`. There were 11 pageerrors in one short session (`scratchpad/pw/sheetperm.mjs` output).
- **Rename:** The Univer tab rename box accepts the text. The tab keeps showing "Renamed" (or "X") until reload, while the toast says view only (`shots/sheet-view-rename.png`, then `sheet-view-rename-reload.png`).
- **Controls look active:** The Univer toolbar stays fully enabled (`shots/sheet-comment-after-attempts.png`). The cell context menu offers Cut, Paste, Insert Link, Add Note, Delete, Protect… (`shots/sheet-comment-contextmenu.png`).
- **Code:** `src/apps/sheet/app.ts:80-91`.
- **Fix:**
  - For viewers, hide the Univer toolbar (`setUIVisible(TOOLBAR,false)`, as View ▸ Toolbar already does) and the editing context-menu items.
  - Cancel through Univer's permission service (`WorkbookEditablePermission`) instead of throwing, or catch the error so it does not surface as a page error.

---

## GAPS

### G1. Sheet and Forms: Share offers a "Can comment" link, but neither app has comments
- **Apps:** Sheet, Forms
- **Steps:** File ▸ Share… has the tabs Can edit / **Can comment** / Can view / Makes a copy. The comment description reads "can read the document and add comments" (`shots/forms-es-share.png`).
- **Sheet:** The comment link opens read-only with a "Can comment" badge, but there is no way to comment. Insert ▸ Note and Add Note are refused with "This spreadsheet is view only" (`shots/sheet-comment-after-attempts.png`).
- **Forms:** The comment and view links open the respondent page (`shots/forms-es-comment-link.png`), which the generic descriptions don't say.
- **Code:**
  - Choices: `src/ui/chrome.ts:147-151`.
  - `session.commentsDoc` is only used by writer, slides and pdf (`grep -rl commentsDoc src/apps`).
- **Fix:**
  - Let apps declare `supportsComments`, and hide the comment level when it is false.
  - In Forms, relabel View as "Can answer (send link)" or point to the Send dialog.
  - Longer term, map sheet notes or thread comments onto `commentsDoc`.

### G2. Sheet: printing has no page setup and cuts off wide sheets
- **App:** Sheet
- **Steps:** Put data in 16 columns (A to P), press Ctrl+P and render with print media (A4). Only columns 1 to 12 print, and C13 to C16 are simply lost, not moved to another page (`shots/sheet-print-1.png`).
- **Missing options:** No landscape, fit to width, print selection, gridlines or repeat header row. Writer has File ▸ Page setup…; Sheet's `file.slots.print` is empty.
- **Code:** `src/apps/sheet/print.ts`, `src/apps/sheet/sheet.css:43-53`.
- **Fix:**
  - Add Page setup… (orientation and "fit to page width" through CSS `zoom` or `transform` on `.sheet-print-page`, plus a selection-only option).
  - At least use `@page { size: landscape }` when the used width is larger than the portrait width.

### G3. Sheet: the default sheet name is always English "Sheet1", but new sheets are localized
- **App:** Sheet
- **Steps:** In es, a new spreadsheet has the tab "Sheet1", and Insertar ▸ Hoja adds "Hoja1" (`shots/sheet-es-Hoja.png`). The same happens in gl and de (`shots/sheet-de-tabmenu.png`).
- **Downstream:** The exported xlsx and csv sheets are also named "Sheet1" (`rt/es-rt.xlsx`).
- **Code:** `src/apps/sheet/univer.ts:48` and `src/apps/sheet/formats/csv.ts:44`.
- **Fix:** Use `t('Sheet') + '1'`, matching Univer's own "Hoja/Blatt" naming, and keep the id `sheet-1`.

### G4. Forms: print output is the editor, not a paper version of the form
- **App:** Forms
- **Steps:**
  - File ▸ Print… on the Questions tab prints the editor controls: type dropdowns, "Add option", "×", "Description (optional)" placeholders, and cards cut across pages (`shots/forms-print-questions-1.png`).
  - On Preview it prints "Preview: … Nothing is sent." and a "Clear selection" link under every question (`shots/forms-print-preview-1.png`).
- **Code:** `src/apps/forms/app.ts` (`print: () => window.print()`) and `src/apps/forms/forms.css:146-149`.
- **Fix:**
  - Make Print always render the respondent view (as in Preview) into a print container.
  - Hide `.fm-preview-note` and the clear-selection links in print.
  - Add `break-inside: avoid` on `.fm-card`.

### G5. Forms: "Download as ▸ Responses (.csv/.xlsx)" uses a different file name from the Responses buttons
- **App:** Forms
- **Steps:** The Responses tab buttons save "Examen de prueba - Respuestas.csv". File ▸ Download as ▸ Respuestas (.csv) saves "Examen de prueba.csv", the same base name as the .oform, so it looks like the form itself.
- **Code:** `src/ui/menus.ts:59-62` (`downloadFormat` uses only the title) versus `src/apps/forms/export.ts` (`downloadResults`).
- **Fix:** Let `ExportOption` carry an optional file name (or suffix), and use it for the two response formats.

---

## POLISH

- **P1. Forms, Insert ▸ Question / Section logs a Yjs warning every time.** The warning is "Invalid access: Add Yjs type to a document before reading data." It happens because `map.get('id')` runs before the map is inserted (`src/apps/forms/editor.ts:372-373` and `383-384`). Take the id from the plain object passed to `itemMap` instead. Seen once per insert in the menu walk.
- **P2. The first-run "Your documents are saved in this browser" notice gets in the way in both apps.**
  - It covers the Sheet's tab bar and "+" add-sheet button (`shots/sheet-initial-es.png`).
  - It is printed on paper (`shots/sheet-print-1.png`).
  - Form respondents see it too; they created nothing, and at 390 px it hides the "Responde las preguntas obligatorias" validation toast (`shots/forms-student-390-validation.png`).
  - Code: `src/home/storage.ts:325`. Add `@media print { .persist-notice { display: none } }`, and don't show it on the respondent page.
- **P3. Sheet in high contrast (dark): gridlines are nearly invisible on the black grid** (`shots/sheet-contrast-dark-1366.png`). Code: `src/apps/sheet/theme.ts` (contrast-dark branch). Use the border token at full contrast for gridlines.
- **P4. Sheet CSV export writes raw values, not displayed values.** A column formatted as Percent exports `0.5` rather than `50%` (`rt/en-Untitled spreadsheet.csv`). CSV always uses a comma and dot decimals, even in es/gl/fr/de, where Excel expects `;` and `,`. Code: `src/apps/sheet/formats/csv.ts` (`exportCsv`). Offer "CSV (semicolon, as displayed)" for European locales.
- **P5. Sheet: the "Protect Rows and Columns" panel says "Created" with an empty avatar and no user name**, because there is no identity (`shots/sheet-protect-teacher-edit.png`). This goes away with the B3 fix.
- **P6. Sheet at 390 px: Univer's toolbar collapses to 4 icons plus ⋯, and the status bar is hidden behind the notice** (`shots/sheet-light-390.png`). This is usable; noted only as a check.

## Not an issue, or left out on purpose
- Connection test… reaches public relays even with `?relays=`. This is by design for a connection test.
- Clipboard "Write permission denied" console errors on Edit ▸ Cut/Copy happen only in headless Chromium without the clipboard permission.
- Download names with accents became "download" in this container's headless Chromium. A plain `<a download>` reproduces the same thing, so it is environment-specific.
- Galician shows Univer in Spanish and "Español" in the status bar. This is documented in `univer.ts` because Univer has no Galician.
