# Audit: Slides, Diagram and Draw

Build: `dist/` served with `vite preview` on port 4503, local relay `tests/relay.mjs 7793`, Chromium through Playwright, 1366x820 unless noted. Scripts are in `scratchpad/review/*.cjs` and screenshots in `scratchpad/review/shots/`. I reproduced every finding below at least once.

## Checked and working (no finding)
- **Menus:** I clicked every enabled item and submenu item in all three apps (`walk.cjs`). No `pageerror` in any app. The Draw Cut/Copy console errors happen only because headless Chromium has no clipboard permission. With the permission granted, Copy and Paste work.
- **Draw is on the shared frame:** File/Edit/View/Insert/Tools/Help, Hand in, Print, Version history, Nextcloud, shortcuts, WebMCP toggle, zoom and Find are all there. Slides and Diagram have the same set.
- **Round trips that work:**
  - PPTX export, then import: text and notes survive.
  - PPT and PPTX made by LibreOffice import correctly.
  - Our PPTX and ODP both open in LibreOffice (converted to PDF, text intact).
  - `.drawio` fixture import, export and re-import work.
  - `.excalidraw` export and re-import work.
- **Presenting (Slides):**
  - Animation steps run before the next slide.
  - Black screen (`b`), laser (`l`) and Esc work.
  - The presenter view window (timer, next slide, notes) works.
  - "Follow the presenter" works across two browsers.
- **Version history:** Save version, then Restore, works in all three apps, including Draw's custom `restoreVersion`.
- **Hand in** produces a ZIP in all three apps (but see bug 5 for Slides).
- **View and comment links:** no permission leaks in Slides, Diagram or Draw. Keyboard Delete, typing, paste, drawing, menus and format panel changes made from a view or comment link never reached the editor.
- **Translations:** every `t()` key used under `src/apps/{slides,diagram,draw}` (652 keys) exists in es, gl, fr and de. Comparing the Spanish UI dump with the English one shows no English leftovers except those in finding 11.

---

## Bugs

### 1. [bug] Slides, Diagram: pressing Esc while editing text throws the typed text away
- **Steps:**
  1. Open a new presentation.
  2. Double-click "Click to add title" and type "Photosynthesis".
  3. Press Esc. The title goes back to the placeholder and the text is lost.
  - Clicking elsewhere instead keeps the text.
  - In Diagram: Insert ▸ Text, type, Esc. The label goes back to "Text".
- **Evidence:** `shots/slides-esc-discards.png`, `esc.cjs` output:
  - `text in canvas after Esc: "Click to add title…"`
  - `after click-away: "Typed then click…"`
- **Cause:** maxGraph's `CellEditorHandler.escapeCancelsEditing` defaults to `true`. It is never changed in `richTextEditing()` in `src/apps/diagram/graph.ts:322`. draw.io and PowerPoint both keep the text on Esc. Students lose titles this way, and so did my presenter-mode test.
- **Fix:** set `editor.escapeCancelsEditing = false` in `richTextEditing()`, so Esc calls `stopEditing(false)`.

### 2. [bug] Slides: the "Add animation…" submenu covers its own parent menu, so Emphasis and Exit can't be reached with the mouse
- **Steps:**
  1. Select a shape.
  2. Open View ▸ Animations and click "Add animation…".
  3. Hover "Entrance". The submenu opens on top of the parent menu. Parent is at x 1099–1339, submenu at x 1122–1362, top 303.
  4. Moving the pointer down to "Emphasis" or "Exit" lands on "Fade in" or "Fly in" instead. With Playwright, "subtree intercepts pointer events".
- **Evidence:** `shots/slides-anim-submenu-overlap.png`
- **Cause:** `openSubmenu` in `src/ui/widgets.ts` (around lines 222–236) places the submenu at `rect.right`. Then `keepInViewport` only slides it left, over the parent. This happens for any menu near the right edge: the animation pane and right-edge context menus.
- **Fix:** when `rect.right + width > innerWidth`, open the submenu to the left of the parent (`rect.left - width`) instead of clamping.

### 3. [bug] Slides: PPTX import drops animations and transitions, even from Ofimeo's own export
- **Steps:**
  1. Add a "Fly in" animation and a Fade transition to slide 1, and pick the Ocean theme.
  2. Use File ▸ Download as ▸ PowerPoint.
  3. Open that file (File ▸ Open…).
  4. The Animations pane shows 0 animations and Effect "None". The theme picker shows "Light", although the slides are blue. Layout shows "—".
- **Evidence:**
  - `shots/slides-rt-imported-PowerPointpptx.png`
  - `rt-slides.cjs` output: `anims: 0 transition: none`
  - The exported `ppt/slides/slide1.xml` does contain `<p:transition spd="fast"><p:fade/>` and `<p:timing>…mainSeq…`.
- **Cause:** `src/apps/slides/formats/pptx-import.ts` has no `p:timing` or `p:transition` parsing. `formats/pptx-anim.ts` only writes them.
- **Fix:** parse `p:transition` (fade/push/wipe plus `spd`/`dur`) and the `mainSeq` of `p:timing` into `Animation[]` (the inverse of `addPptxAnimations`). If the theme can't be mapped back, don't show "Light" as the active theme.

### 4. [gap] Slides: cannot open .odp, although it exports .odp
- **Steps:**
  1. Download a presentation as .odp.
  2. Open it with File ▸ Open… (the file picker only offers `.pptx,.ppt`).
  3. Setting the file directly gives the toast "Could not open the file: Not a PowerPoint presentation".
  - On the home screen, `appForFile` finds no app for `.odp`.
- **Evidence:** `rt-slides.cjs` output, `shots/slides-rt-imported-OpenDocumentpresentationodp.png` (the deck is unchanged).
- **Code:**
  - `SLIDES_ACCEPT = '.pptx,.ppt'` in `src/apps/slides/app.ts:81`
  - `accept: '.pptx,.ppt'` in `src/apps/registry.ts` (slides entry)
  - `importFile` in `src/apps/slides/index.ts:21` goes straight to `parsePptx`
- **Why it matters:** Writer (.odt) and Sheet (.ods) both open OpenDocument files, and teachers on LibreOffice or Abalar get .odp files.
- **Fix:** add an ODP importer (`content.xml` `draw:page` → frames/text/images, notes from `presentation:notes`) and add `.odp` to both accept lists.

### 5. [bug] Slides: Hand in on a new presentation whose first slide was never edited produces a PPTX with 0 slides and no PNGs
- **Steps:**
  1. Open a new presentation.
  2. Use Format ▸ Theme ▸ Ocean (or change nothing).
  3. Use File ▸ Hand in… and give a name.
  4. The ZIP contains only `Untitled presentation.pptx` and `README.txt`. The PPTX has no `ppt/slides/slide*.xml`.
  - After typing on the slide, the ZIP does contain the PPTX and `- 01.png`.
- **Evidence:** `handin2.cjs` output (`themeOnly` vs `typed`), `handin-slides.zip`.
- **Cause:** `readPresentation()` in `src/apps/slides/index.ts:32–52` uses `DiagramSync.readPages(doc)`. That list leaves out the virtual first slide, which only exists after `sync.materialize()`. The editor's own Download as uses `sync.pageList()`/`pageRecords()` and includes it.
- **Fix:** in `readPresentation`, fall back to the blank title slide when `readPages` is empty. Alternatively, materialize before handing in.

### 6. [bug] Draw: the status bar element count includes deleted elements
- **Steps:**
  1. Draw 2 shapes.
  2. Use Edit ▸ Select all, then Delete (or keyboard Del).
  3. The canvas is empty, but the status bar says "4 elements" (after a Duplicate). It still says so after a reload.
  - File ▸ Document details correctly says "Elements 0".
- **Evidence:** `shots/draw-status-count-after-delete.png`, `drawedit.cjs` output.
- **Cause:** `updateStatus` in `src/apps/draw/app.ts:151–155` uses `elements.length` from Excalidraw's `onChange`, which passes elements including deleted ones.
- **Fix:** `elements.filter((e) => !e.isDeleted).length`.

### 7. [bug] Diagram: exported SVG loses every label outside a browser
- **Steps:**
  1. Open `tests/fixtures/flow.drawio`.
  2. Use File ▸ Download as ▸ SVG image.
  3. Open the SVG in LibreOffice. It has shapes and arrows but no text ("Start" and "Decide" are gone).
  - The same thing happens in Word, Inkscape and PowerPoint, which don't render `foreignObject`.
- **Evidence:**
  - `shots/diagram-svg-in-libreoffice.png`
  - `rt-diagram.svg`: labels exist only inside `<foreignObject>` with no fallback, and `pdftotext` of LibreOffice's render is empty.
  - Hand in ZIPs also carry this SVG.
- **Cause:** `renderSvg` in `src/apps/diagram/export.ts:21`.
- **Fix:** wrap each label in `<switch><foreignObject requiredFeatures="http://www.w3.org/TR/SVG11/feature#Extensibility">…</foreignObject><text>plain label</text></switch>` (what draw.io does), or export with plain SVG text labels (`htmlLabels` off).

## Gaps

### 8. [gap] Diagram, Draw: Share offers "Can comment" although these apps have no comments
- **Steps:**
  1. In a new diagram or drawing, open File ▸ Share….
  2. The "Can comment" tab reads "Anyone with this link can read the document and add comments".
  3. Opening that link gives exactly the view-only experience: no comment item or pane anywhere.
- **Evidence:** `perm-dd.cjs` output shows the same menus for view and comment. The code confirms it (`src/apps/draw/webmcp.ts:4`: "Drawings have no comments"). The choice is added in `src/ui/chrome.ts:149` whenever `session.canComment`.
- **Fix:** let apps declare comment support (for example `session.hooks.comments = true`, set by writer, sheet, slides and pdf) and hide the choice otherwise. The other option is to add comments to Diagram and Draw.

### 9. [gap/a11y] Slides, Diagram: no keyboard way to select one object on the canvas
- **Steps:**
  1. Focus the canvas.
  2. Press Tab. Focus leaves to the notes (Slides) or the format panel (Diagram); the selection does not move.
  - Only Ctrl+A (select all) is available. Enter/F2 then edits the first selected cell, so a keyboard user can't reach the subtitle or any second shape to edit, move (arrows) or delete it.
- **Evidence:** `kbd.cjs` output (`canvas Tab -> focus slides-notes-area`).
- **Code:** key handler in `src/apps/diagram/editor.ts:712–740`, which has no Tab handling.
- **Fix:** Tab/Shift+Tab cycles through vertices while the canvas has focus and something is selected (draw.io's behaviour), with Esc then Tab to leave. Also announce the selected label.

### 10. [gap] Diagram, Draw: no PDF in Download as, and Diagram exports only the current page
- **Download as menus:**
  - Writer: "PDF document (.pdf)"
  - Sheet: "PDF (via Print…)"
  - Slides: "PDF (via Print)"
  - Diagram: `.drawio` / SVG (current page) / PNG (current page). No PDF, and no all-pages export, although Slides has "All slides as PNG (.zip)".
  - Draw: `.excalidraw` / PNG / SVG. No PDF.
- **Evidence:** menu listings from `walk.cjs`.
- **Fix:** add `download: [{ label: t('PDF (via Print)'), run: print }]` in `src/apps/diagram/app.ts` and `src/apps/draw/app.ts`, and "All pages as PNG/SVG (.zip)" in Diagram. The Hand in code already renders every page.

## Polish

### 11. [polish] Diagram: English text in es/gl/fr/de
- **What shows in English:**
  - The first page is always called "Page-1" (page tab and "Page name" field). Later pages are "Página 2" and so on. Source: `src/apps/diagram/model.ts:66`; the fixed name is intentional, per `app.ts:123`.
  - The List shapes insert "Item 1/2/3". Source: `src/apps/diagram/palette.ts:122,375`.
  - The Text/heading shape inserts "Heading" plus Lorem ipsum. Source: `palette.ts:87`.
- **Evidence:** `shots/diagram-es.png`, and the `ui-dump.cjs` es/en diff.
- **Fix:** show a translated display name when `name === 'Page-1'` (keep the stored id), and wrap the sample texts in `t()`.

### 12. [polish] Diagram at 390px: Shapes and Format panels open together and cover the whole canvas
- **Steps:** at 390px wide, use View ▸ Shapes and then View ▸ Format. The two panels overlap and no canvas is visible.
- **Evidence:** `shots/diagram-390-format.png`
- **Fix:** below the phone breakpoint, opening one side panel closes the other. Slides already hides panels on narrow screens.

### 13. [polish] Slides, Diagram: Arrange ▸ Align and Distribute are enabled submenus whose items are all disabled
- **When it happens:** with nothing selected, and always on view or comment links.
- **Evidence:** `walk.cjs` and `perm-*.cjs` listings.
- **Fix:** disable the parent row when every child is disabled.

## Not findings (checked)
- Draw Cut/Copy "Write permission denied" console errors: headless-only. They work with the clipboard permission granted.
- "Connection test…" probes public relays by design, even with `?relays=`.
- The menu bar at 390px scrolls horizontally with a hidden scrollbar. This is the shared frame and the same in every app.
