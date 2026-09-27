# Writer and PDF audit: gaps ("huecos")

Build: `dist/` (commit f14ee8f), served with `vite preview` on :4501 and a local relay on :7791.
Chromium via Playwright. All screenshots are in `scratchpad/review/shots/` (prefix `wp-`).
Scripts are in `scratchpad/` (`walk.mjs`, `pair.mjs`, `perm-*.mjs`, `rt.mjs`, `wf-writer.mjs`, `enter*.mjs`, `pdf-*.mjs`, `dlg390.mjs`, `i18n-ui.mjs`).
I reproduced every finding below at least once. Severity: **bug** = wrong or harmful behaviour, **gap** = a missing feature or path, **polish** = UX or a11y papercut.

---

## BUGS

### 1. [bug] Writer: people on a view link (and a comment link) can edit their local copy through the toolbar "⋯" overflow, and the change survives a reload
- **Steps:** The owner shares a *Can view* link. The viewer opens it in a window narrow enough for the toolbar to overflow (≤ ~1100 px; 700 px here), clicks **⋯**, then uses **Insert table** (grid), **Insert link** → Apply, **Insert image**, **Checklist**, **Increase indent** or **Line spacing**.
- **Result:** The viewer's document changes: a table and an image are inserted, text becomes a checklist or a link. The owner does not receive these changes because they are unsigned. The viewer's copy stays diverged after a reload, and File ▸ Download or Hand in exports the altered text. The same thing happens on a *Can comment* link.
- **Evidence:** `wp-writer-view-overflow.png` (all buttons are active in the panel), `wp-writer-view-overflow-table.png`, `wp-writer-view-overflow-link.png` (the "Insert link" dialog opens for a viewer), `wp-writer-view-leak.png` (image and checklist added, "View only" badge visible). Output of `perm-writer3.mjs`: `link apply | owner changed false | viewer changed true` … `after reload | viewer changed true`.
- **Cause:** Read-only mode only greys out buttons with CSS: `src/ui/base.css:133` `.toolbar.readonly .tb-group:not(.tb-keep) … { pointer-events:none }`. When groups move into the overflow panel (`src/ui/toolbar.ts:84-86`, a `.menu-panel.tb-overflow` appended to `<body>`), they leave `.toolbar.readonly`, so the rule stops matching. The writer toolbar buttons also have no `enabled` guard (`src/apps/writer/commands.ts:498-633`), and `pickImage`, `tableGrid` and `editLink` do not check `editor.isEditable`. The buttons also stay keyboard-focusable in the main toolbar.
- **Fix:** Give every non-`keep` writer toolbar control `enabled: () => ctx.editor.isEditable` (the toolbar then sets `disabled`). Alternatively, carry the `readonly` class onto the overflow panel. Guard `pickImage`, the table grid and `dialogs.editLink` with `editor.isEditable`.

### 2. [bug] Writer: Ctrl+H and the toolbar "Find and replace" button let a viewer run Replace all
- **Steps:** Open a *Can view* link. Press **Ctrl+H**, or click the magnifier button (it belongs to a `keep` group, so it stays active). Find "Owner", replace with "HACKED", click **Replace all**.
- **Result:** The viewer's text changes. The change persists after a reload (owner unchanged). The Edit menu correctly disables "Find and replace…", but the shortcut and the button bypass that.
- **Evidence:** `wp-writer-view-replaceall.png`. Output of `perm-find.mjs`: `Ctrl+H replace row visible: true`, `viewer after reload: HACKED text paragraph one.`
- **Code:** `src/apps/writer/find.ts:137-160` (the replace handlers do not check `editor.isEditable`) and `:167-169` (`open(true)` always shows the replace row). `src/apps/writer/commands.ts:512` (the toolbar opens with `replace=true`). `src/ui/frame.ts` `registerShortcuts({ replace: editOptions?.replace })` ignores `editable`.
- **Fix:** In `open()`, use `replaceRow.hidden = !replace || !editor.isEditable`, and return early from the replace handlers when the editor is not editable. Make the toolbar button call `ctx.find.open(editor.isEditable)`.

### 3. [bug] Writer: after posting a comment, the next click in the text is ignored, and typing overwrites the commented words
- **Steps:** Type two paragraphs. Select "Primera" (keyboard or mouse). Press **Ctrl+Alt+M**, type a comment, then click **Comment** (or press Ctrl+Enter). Click inside the second paragraph and type "XX".
- **Result:** The caret does not move. The old selection ("Primera") is still active, so "XX" replaces the commented word, and the comment card now says *Text deleted: "Primera"*. If the comment was made by double-clicking the empty area right of a line (which selects the paragraph boundary), the same typing silently **merges the two paragraphs**. A second click works.
- **Evidence:** `wp-writer-comment-first-click.png`. Output of `enterD.mjs`: `click p2 on text … sel= Primera` → `["P:XX frase del alumno.","P:Segunda frase."]`. Paragraph merge: `wp-writer-merge-debug.png` / `enterB.mjs` → `["P:Primera frase del alumno. Añadido sugeridoSegunda frase."]`.
- **Likely cause:** `src/apps/writer/review.ts:86-93`. The editor `click` handler calls `activate(null)`, and `update()` at `:170` synchronously does `view.dispatch(editor.state.tr…)` from a state that has not yet read the new DOM selection, so it writes the old selection back. This only happens while a comment is active (`submitDraft` sets `this.active`, `:221`).
- **Fix:** In the click handler, defer the `activate(null)` (use `requestAnimationFrame` or `setTimeout`), or flush the DOM observer first. Alternatively, build the decoration transaction without touching the selection after PM has handled the mouseup.

### 4. [bug] Legacy .doc import: headings become bullet items, merged cells break, and header, footer and comments are dropped silently
- **Steps:** Home ▸ Open file… ▸ `rich.doc` (made by LibreOffice from `wp-rt/rich.fodt`). It contains H1 and H2, highlight, a merged cell, a header and footer, and a comment. A LibreOffice round trip confirms all of these are in the .doc.
- **Result:** "Unidad 3: La célula" and "Lista de viñetas" are imported as **bullet list items** instead of headings (h1=0, h2=0). The merged cell "Celda combinada" is moved into the second column and the first cell is left empty. The yellow highlight, the header ("Cabecera IES Rosalía"), the footer page numbers and the comment are gone, and the user gets no warning. The same file as .docx or .odt imports perfectly.
- **Evidence:** `wp-rt-import-rich-doc.png` compared with `wp-rt-import-rich-odt.png`; `wp-rt/stats.json`.
- **Code:** `src/apps/writer/formats/doc-import.ts:364-378`. When a paragraph has `ilfo` (outline numbering attached to heading styles), it is turned into a `listItem` and the heading type is replaced by `paragraph` (`:378`). Merged cells (sprmTMerge/fHorzMerge) are not handled. Header and footer are fixed to `null` (`:466-467`); comments are listed as not imported in `:5`.
- **Fix:** When the style is a heading (`style?.heading`), keep the heading and ignore outline-list numbering. Honour horizontal merge flags. At minimum, show a toast after import listing what was dropped (header/footer, comments).

### 5. [bug] PDF: text boxes and custom stamps lose every non-Latin-1 character in the downloaded, flattened and handed-in PDF ("π ≈ √2 → ✓" becomes "? ? ?2 ? ?")
- **Steps:** Open `exam.pdf`, press **T**, click the page, type `Mal: v → 2v, π ≈ 3,14 ≠ 3 ✓ √2 Ł`, press Ctrl+Enter. Then File ▸ Download as ▸ PDF with annotations merged (flattened). The editable export and Hand in have the same problem.
- **Result:** The screen shows the text correctly. The file contains `Mal: v ? 2v, ? ? 3,14 ? 3 ? ?2 ?` (pdftotext).
- **Evidence:** `wp-pdf-unicode-screen.png` compared with `wp-pdf-unicode-flattened-1.png`; `wp-rt/uni-flat.pdf`.
- **Code:** `src/apps/pdf/export.ts:36-43`. Only the Helvetica/WinAnsi standard fonts are used, and `clean()` maps anything else to "?". The Writer already embeds TTF fonts for its PDF export (`src/apps/writer/pdf/fonts.ts`, `sfnt.ts`).
- **Fix:** Embed a Unicode TTF subset (the same one the writer uses) with `@pdf-lib/fontkit` for FreeText and stamp appearances, and fall back to Helvetica only when all characters are WinAnsi. This matters for maths and science teachers.

### 6. [bug] PDF: a password-protected PDF opens as a broken document with an English pdf.js error and no password prompt
- **Steps:** UI in Spanish. Home ▸ Abrir archivo… ▸ an encrypted PDF (`wp-rt/enc/rich.pdf`, password "abc").
- **Result:** A new document "rich" is created in the library and shows only `No se puede mostrar este PDF: No password given`. The message mixes Spanish with pdf.js English, and there is no way to enter the password. The annotation toolbar stays enabled on the empty document.
- **Evidence:** `wp-pdf-encrypted-es.png`.
- **Code:** `src/apps/pdf/pdfjs.ts:21` (`getDocument` without `password` or `onPassword`), and `src/apps/pdf/index.ts` `importFile()` creates the local document before checking that the file can be opened. The message comes from `src/apps/pdf/app.ts:83`.
- **Fix:** Handle `PasswordException`: prompt with `promptText(t('Password'))`, retry, and store the decrypted bytes or refuse with a translated message. Validate in `importFile` before calling `createLocalDocument`.

### 7. [bug] PDF view link: the "G", "S" and Tools ▸ "Draw a new signature…" entry points open edit-only UI for viewers, and the stamp toast then says to click a page although nothing can be placed
- **Steps:** Open a *Can view* PDF link. Press **G** (the Signature drawing dialog opens), press **S** (the stamp menu opens), choose "Check mark" (toast "Click on a page to place the stamp. Esc to stop.") and click the page (nothing happens). Tools ▸ Draw a new signature… is enabled.
- **Evidence:** `wp-pdf-view-g-signature.png`, `wp-pdf-view-s-stamp.png`; output of `perm-pdf.mjs`.
- **Code:** `src/apps/pdf/app.ts:619-626` (the `s` and `g` keys have no `session.canEdit` check), `:459` (the menu item has no `enabled`), `src/apps/pdf/editor.ts:402-404` (the toast is shown even though `setTool('stamp')` refused).
- **Fix:** Guard with `session.canEdit` (the Insert ▸ Signature menu item already does), and only show the toast when `this.tool === 'stamp'` after `setTool`.

## GAPS

### 8. [gap] PDF: annotations cannot be created with the keyboard (text box, sticky note, shapes, stamp, signature)
- **Steps:** Focus the page (the `.pdf-scroller`), press T, N, R or S (then Enter), then press Enter or Space.
- **Result:** Nothing is created. Tab reaches only existing annotations, which can be moved and deleted with the keyboard. Creating one needs a pointer click. The empty Comments panel even says "choose the sticky note tool (N) and click on a page".
- **Evidence:** output of `pdf-kbd.mjs` (`text after Enter/Space annots 1 editor open 0`); `wp-pdf-kbd.png`.
- **Code:** `src/apps/pdf/editor.ts:616-640` (`bindKeys` only handles existing annotations).
- **Fix:** When a creation tool is active and the page scroller has focus, place the annotation at the centre of the visible page on Enter (like a "keyboard cursor"), then open its editor. Also add an "Add comment" button to the comments panel.

### 9. [gap] PDF: original pages cannot be rotated, deleted or reordered
- The Insert menu only offers blank pages ("Blank page after/before", "Delete this blank page…", `src/apps/pdf/app.ts:423-425`). No menu, thumbnail context menu or shortcut rotates a sideways scanned page or removes or reorders a page of the original PDF. For a teacher correcting scanned hand-ins, rotation is the most common need. `PageEntry` already has `rotate` (`src/apps/pdf/import.ts:46-48`, `geometry.ts`).
- **Fix:** Add Page ▸ Rotate left/right and Delete page (and drag reorder in the thumbnails) by editing the `pages` Y.Array entries. Export already honours `rotate`.

### 10. [gap] Writer: `.md` files are accepted by Open but imported as raw text; RTF is not accepted at all
- **Steps:** Home ▸ Open file… ▸ `wp-rt/apuntes.md` (`# Apuntes de clase`, `- primer punto`, `**negrita**`).
- **Result:** The paragraphs contain the literal `# Apuntes de clase` and `- primer punto`. There are no headings, lists or bold.
- **Evidence:** `wp-writer-md-import.png`.
- **Code:** `src/apps/writer/formats/index.ts:11` (`OPEN_ACCEPT` includes `.md`) and `:27-33` (`.md` falls into the plain-text branch). `.rtf` (still produced by many school tools and WordPad) is not in `OPEN_ACCEPT`.
- **Fix:** Parse Markdown (for example with `markdown-it`, then `generateJSON`), or drop `.md` from the accept list. Optionally add Markdown export and RTF import.

## POLISH

### 11. [polish] Writer: at phone width the Spelling and grammar dialog header overflows (language select clipped, ✕ off-screen)
- **Steps:** 390×844, UI in German (also happens in other languages with long titles). Tools ▸ Rechtschreibung und Grammatik…
- **Evidence:** `wp-writer-390-de-Rechtschreibung_und_Gramm.png`. The dialog has scrollWidth 416 against clientWidth 358.
- **Code:** `src/apps/writer/spell/spell.css:36-38` (the `h2` flex row does not wrap, and the select has no `min-width:0` / `max-width`).
- **Fix:** Add `flex-wrap: wrap` to the h2, `.spell-lang { max-width: 100%; min-width: 0 }`, and keep `.spell-close` first or absolutely positioned.

### 12. [polish] Writer: the Header and footer dialog does not close with Esc, and Tab cannot leave the header editor
- **Steps:** Insert ▸ Header and footer…, then press Esc. The dialog stays open. Tab is taken by the editor (indent); only Shift+Tab ×4 reaches the toolbar.
- **Evidence:** `wp-writer-hf-esc.png`; output of `hf.mjs` (`after Esc 1`).
- **Code:** `src/apps/writer/dialogs.ts:234-293`. The embedded TipTap editors keep ProseMirror's base keymap, where `Escape` is `selectParentNode`, which prevents the dialog's `cancel`.
- **Fix:** Add a small extension to the header/footer editors: `Escape: () => { dialog.close(); return true }`. Or listen for `keydown` Escape in capture phase on the dialog.

### 13. [polish] PDF: Edit ▸ Copy throws an unhandled promise rejection when clipboard write is denied, and copies an empty string when nothing is selected
- **Evidence:** walker log `walk-pdf-en.txt`: `[Edit > Copy] PAGEERROR Failed to execute 'writeText' on 'Clipboard': Write permission denied.`
- **Code:** `src/apps/pdf/app.ts:484` (also `editor.ts:600`, the bubble "Copy").
- **Fix:** Use `enabled: () => !!getSelection()?.toString()`, and add `.catch(() => toast(t('Use Ctrl+C to copy')))`.

### 14. [polish] Zoom is inconsistent between the Writer and the PDF app
- Writer View ▸ Zoom lacks "Zoom in" and "Zoom out" (`src/apps/writer/commands.ts:236-247` `.slice(3)`), and Ctrl + / Ctrl − fall through to browser zoom because the writer's zoom target has no `keys: true` (`src/apps/writer/app.ts:492-500`). PDF has both (`src/apps/pdf/app.ts:364`). Checked with `keys-writer.mjs` (`Control+= … zoom "100 %"`).
- **Fix:** Drop the `.slice(3)` and set `keys: true` for the writer (with `stepZoom` over `ZOOMS`).

---

## Checked and fine (no finding)
- **Every menu item of both apps** (163 in the Writer, 86 in PDF) was clicked with an error listener. Apart from #13 there were no page errors or console errors (the only console errors are Help ▸ Connection test failing to reach public relays, which is expected offline).
- **DOCX and ODT round trips** (import → export docx/odt → re-import) keep headings, bold, italic, underline, colour, highlight, footnote, link, nested lists, numbered lists, merged cells, image, page break, header, footer with page number, and comments with author (`wp-rt/stats.json`, `wp-rt-reimport-*.png`). Writer PDF export has the header, footer, footnote, image and 2 pages. Suggestions survive a DOCX or ODT round trip.
- **i18n:** every `t()` key used in `src/apps/writer`, `src/apps/pdf`, `src/ui` and `src/core` exists in es, gl, fr and de (static check `keys.mjs`). Collecting the runtime UI text in es (menus, submenus, dialogs) left only font names, shortcuts, "Zoom" and "Color" identical to English.
- **Dark and high-contrast themes** at 1280 px, and 390 px (es and gl) for both apps: no horizontal page scroll. The menu bar scrolls horizontally on phones by design. All other writer and PDF dialogs fit at 390 px in German.
- **Permission guards that work:** view and comment links disable the Writer's Insert, Format and Table menus, block keyboard shortcuts (Ctrl+B, Ctrl+Enter, Tab…), make paste a no-op, keep Spelling "Change" disabled, and keep Sources read-only. On a PDF view link, the Insert and Tools menu items are disabled and setTool refuses. A PDF comment link can add sticky notes that reach the owner, and its bubble offers Comment and Copy only.
- **Writer shortcuts** listed in the shortcuts dialog work (Ctrl+B, Ctrl+Shift+S, Ctrl+., Ctrl+Shift+E/8/9, Ctrl+Alt+0/1, Ctrl+E, Ctrl+K, Ctrl+Alt+F, F7, Ctrl+/, F1, Ctrl+F/H/P/S, Alt+Shift+A, Ctrl+Enter, Ctrl+Alt+M).
