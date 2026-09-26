# Ofimeo

Ofimeo (formerly "Words Online") is a collaborative office suite for schools
that runs entirely in the browser, with no server of its own. One static build hosts every app; documents live in each browser
(IndexedDB) and edits travel directly between browsers over WebRTC. Public
Nostr relays (WebSockets) are only used as a meeting point for browsers to
find each other.

| App | Name in the UI (en / es) | Status |
| --- | --- | --- |
| Word processor (`writer`) | Ofimeo Docs / Ofimeo Documentos | Available |
| Spreadsheet (`sheet`) | Ofimeo Sheets / Ofimeo Hojas de cálculo | Available |
| Drawing (`draw`) | Ofimeo Drawing / Ofimeo Dibujo | Available |
| Diagram (`diagram`) | Ofimeo Diagrams / Ofimeo Diagramas | Available |
| Presentation (`slides`) | Ofimeo Slides / Ofimeo Presentaciones | Available |
| Forms and quizzes (`forms`) | Ofimeo Forms / Ofimeo Formularios | Available |
| PDF correction (`pdf`) | Ofimeo PDF / Ofimeo PDF | Available |

Storage keys and database names keep the historical `words-online` prefix
(`localStorage` `words-online:*`, IndexedDB and cache names), so documents made
before the rename keep working.

## Word processor

- Print layout with real pages: paper size (A4, A5, Letter, Legal), orientation
  and margins, page breaks, header and footer with page number / page count,
  footnotes at the foot of each page, zoom, and printing / PDF that matches the
  screen.
- Menu bar (File, Edit, View, Insert, Format, Table, References, Tools, Review, Help), classic toolbar,
  context menu, status bar (page X of Y, words, characters) and keyboard shortcuts.
- Paragraph styles (Normal, Title, Subtitle, Headings), fonts, sizes in points,
  bold/italic/underline/strike, sub/superscript, text and highlight colors,
  alignment, line spacing, indentation, bulleted/numbered/check lists, quotes,
  code blocks, links, images (paste, drop, resize), special characters.
- Tables with merged cells, header rows, cell backgrounds and resizable columns.
- Find & replace, word count.
- **Word (.docx) and OpenDocument (.odt)**: open and download with headings,
  styles, lists, tables (merged cells, widths), images, footnotes, header/footer
  fields and page setup. Also opens `.html`, `.txt` and `.md`.
- Real-time collaboration with live cursors, presence and offline editing.

### Schoolwork: contents, citations, columns, PDF

- **Table of contents** (*Insert* or *References → Table of contents*, headings
  1–3 or 1–6): entries with dot leaders and page numbers from the page layout;
  clicking an entry jumps to its heading. The table follows the headings by
  itself a moment after local edits (remote edits are left to whoever made them,
  so collaborators with other fonts do not rewrite each other's page numbers)
  and with *Update table*. Word files get a real TOC field (`w:sdt` +
  `TOC \o` with cached entries, hyperlinks and `PAGEREF`s to `_Toc` bookmarks on
  the headings), OpenDocument files a `text:table-of-content` index; both are
  read back, also from LibreOffice and Word.
- **Citations and bibliography** (*References* menu): a source list per
  document (Y.Map `sources`: book, chapter, journal article, web page, report,
  thesis, other), *Insert citation…* (several sources, page or other locator),
  *Insert bibliography* (a heading plus the sorted list of the cited sources,
  kept up to date). Styles: APA 7 (default), MLA 9 and Chicago author-date, with
  terms in Spanish, Galician, English, French and German (y / e / and / et / und,
  s.f. / s.d. / n.d. / o. J., p. / S., ed., «comillas»…), following the document
  language or chosen in *Citation language*; same-author same-year letters
  (2020a, 2020b). Sources can be typed or imported from BibTeX, RIS and
  CSL-JSON (Zotero, Mendeley, Google Scholar), and exported as BibTeX.
  Word: citations are `CITATION` fields inside `w:sdt`, the bibliography a
  `BIBLIOGRAPHY` field, and the sources Word's own `b:Sources` part, so Word
  lists them in its source manager; Zotero/Mendeley citation fields
  (`ADDIN … CSL_CITATION`) are imported with their sources. OpenDocument:
  `text:bibliography-mark` per source (LibreOffice shows them as
  "(Author, year)") and a `text:bibliography` index; the full source list and
  style travel in the file's metadata.
- **Columns and sections**: *Format → Columns* (1–3 columns, spacing, line
  between) for the section at the cursor or the whole document; *Insert →
  Section break* (next page or continuous). Each section has its own page setup
  (*Page setup… → Apply to*), so portrait and landscape pages can be mixed.
  Columns before a continuous break are balanced, as in Word. The pagination
  (`pages.ts`) places every block absolutely (node decorations) on its page and
  column; sheets, headers, footers, footnotes and column lines are drawn in
  layers around the editor. Word: one `w:sectPr` per section (`w:type`,
  `w:pgSz`/`w:pgMar`, `w:cols` with `w:sep`); OpenDocument: master pages for
  page changes and `text:section`s with `style:columns`. Printing uses the same
  layout without gaps; documents that mix page sizes are printed through the
  PDF.
- **PDF (.pdf)** in *File → Download as* (no print dialog): the paged layout is
  drawn into a PDF by our own writer (`pdf/`): real, selectable text with
  embedded subset TrueType fonts and a ToUnicode map (each word is placed and
  scaled to the width the browser gave it), headings as bookmarks, links (web
  and table of contents), images, list markers, tables and borders,
  equations (KaTeX fonts and SVG paths), pages of different sizes, and a
  structure tree (tagged PDF: headings, paragraphs, lists, tables, figures with
  their alternative text; headers and footers as artifacts). Fonts: the app
  ships open, metric-compatible fonts (`fonts/`, OFL: Carlito for Calibri,
  Caladea for Cambria, Arimo for Arial/Helvetica, Tinos for Times New Roman,
  Cousine for Courier New; Latin and Latin Extended). They are also used on
  screen (so pages break the same everywhere) and are embedded in the PDF; the
  accessibility fonts and KaTeX's fonts are embedded when used. Other fonts are
  replaced by the closest shipped family.
- **Legacy files**: Word 97-2003 `.doc` (text, headings, title, bold / italic /
  underline / strike / size / color / super- and subscript, alignment, lists,
  tables, footnotes, hyperlinks, page breaks, inline JPEG/PNG pictures, table
  of contents fields, page size and margins), Excel 97-2003 `.xls` in the
  spreadsheet (values, shared strings, number formats and dates, common
  formulas including shared formulas and sheet references — others keep their
  value —, fonts, fills, alignment, merged cells, column widths, row heights)
  and PowerPoint 97-2003 `.ppt` in presentations (slides, text boxes and
  placeholders with size, bold, color, alignment and bullets, filled
  rectangles). They are read in the browser by our own small parsers
  (`src/core/cfb.ts` for the OLE container, `writer/formats/doc-import.ts`,
  `sheet/formats/xls-import.ts`, `slides/formats/ppt-import.ts`, together about
  60 kB before compression, loaded only when such a file is opened) instead of a
  LibreOffice WebAssembly build (tens of MB). Not read: headers and footers,
  comments and tracked changes in `.doc`; charts and pictures in `.xls`;
  pictures, notes and animations in `.ppt`; encrypted files.

### Reviewing (teachers correcting student work)

- **Comments**: select text → *Comment* (toolbar, context menu, *Insert* or
  *Review* menu, Ctrl+Alt+M). Cards sit in a margin next to the page, aligned
  with their text (a bottom sheet on phones), with author, color, time, replies,
  resolve / reopen, edit and delete (own comments). Comments are anchored with
  Yjs relative positions and live in the session's comments channel, so they
  follow the text through concurrent edits and people with a *comment* link can
  add them without being able to edit the text. *View* links see them read-only.
- **Suggestions** (track changes): switch the toolbar mode from *Editing* to
  *Suggesting*. Typed text is underlined and deleted text struck through (not
  removed) in the author's color; deleting your own suggestion removes it.
  Each suggestion (or replacement) gets a card with accept / reject, and
  *Review* has accept all / reject all and next / previous. Local edits are
  rewritten before they are applied; remote changes and undo are never
  rewritten. Suggesting needs edit access (commenters comment instead).
  Paragraph splits/joins and formatting changes are applied directly.
- **Authorship**: *Review → Show authorship* tints text in the color of whoever
  typed it, and *Contributions…* lists words, characters and share per author
  (for group work). Text carries the Yjs client id of its author (an
  `authorship` mark, so it survives paragraph splits); older text falls back to
  the client id of its Yjs items. Client ids map to people through
  `session.authors`.
- **Equations**: *Insert → Equation… / Display equation…* opens an editor
  (`src/ui/equation.ts`, shared by other apps) built on MathLive, with templates,
  symbols, a LaTeX field and a virtual keyboard for tablets. MathLive is loaded
  only when the editor opens; equations are rendered with KaTeX, whose fonts are
  bundled (offline). Double click (or Enter) edits an equation.
- **Files**: comments (with replies and resolved state), tracked changes and
  equations are written to and read from Word (`w:comment`, `w:ins` / `w:del`,
  Office Math) and OpenDocument (`office:annotation`, `text:tracked-changes`,
  embedded MathML formula objects). Equations go through KaTeX's MathML (LaTeX
  kept as annotation in ODT) and a MathML → OMML converter; OMML and MathML are
  converted back to LaTeX on import. Comments of an opened file move into the
  comments channel the first time an editor opens it.
- Access: *view* and *comment* links open the text read-only; the File menu has
  *Make a copy*, *Save version…* and *Version history…*.

### Spelling and grammar

Offline and private: checks run in a Web Worker in the browser and no text is
sent anywhere (unless a LanguageTool server is turned on, see below). Spanish,
Galician, English, French and German.

- **Spelling** (red wavy underline) with Hunspell dictionaries and our own
  checker (`spell/hunspell.ts`): stems and affix rules are kept as they are and
  affixes are stripped when a word is checked (two-level suffixes, prefixes,
  German compounds, `REP`/`MAP`/`KEY` suggestions). Loading takes 0.05–0.4 s;
  nspell, which expands every form up front, did not finish loading the
  Galician dictionary in 9 minutes (over 1 GB) and needs 7 s for French. Code
  blocks, inline code, URLs, emails, numbers, words with digits, acronyms in
  capitals and mixed-case names (`iPhone`) are skipped. The word being typed is
  underlined only once the cursor leaves it.
- **Grammar and style** (blue wavy / dotted underline): an offline rule set
  (`spell/rules/`, one file per language, each rule tagged with language and
  category): repeated words, double spaces, spaces before or missing after
  punctuation, capital letters at the start of paragraphs and sentences
  (abbreviations and initials excepted), `¿…?` / `¡…!` pairs (Spanish; in
  Galician the opening mark is optional, so only unclosed ones), French no-break
  spaces before `; : ! ?` and inside `« »` (suggested, as a style issue, where
  an ordinary space was typed), and frequent confusions only in unambiguous
  contexts: *a ver / haber*, *echo / hecho*, *halla / haya*, *sino / si no*,
  *ahí / hay*, *porque / por qué*, dequeísmo… (es), Castilianisms with the RAG
  forms (*entonces → entón*, *hasta → ata*, *desde luego → desde logo*; *pero →
  mais* only as an optional style suggestion) (gl), *a / à*, *ça / sa*,
  *quelque fois*, *on a pas*, *si il* (fr), *das / dass* after verbs of saying
  and thinking, *seit / seid*, *als / wie* after comparatives (de). English
  grammar also uses [Harper](https://writewithharper.com) (WebAssembly, about
  8 MB compressed, loaded only for English text). More rules below. Rule
  tests: `node scripts/test-spell.mjs`.
- Right click an underlined word: up to five suggestions, *Ignore*, *Ignore
  all* (this session), *Add to dictionary* (a personal dictionary per language,
  kept in this browser; *Tools → Personal dictionary…* lists and removes
  words). Grammar issues show their explanation in the interface language
  (Harper's and LanguageTool's messages come in the text's language) and
  *Ignore this kind of issue*.
- **Tools → Spelling and grammar…** (F7): walks through the issues from the
  cursor, like Word or LibreOffice: *Change*, *Change all*, *Ignore*, *Ignore
  all* / *Ignore rule*, *Add to dictionary*, *Next*. The dialog is not modal.
- **Language**: each document has a language (*Tools → Language*, also the
  status bar), shared with collaborators; until one is chosen, the interface
  language is used. Paragraphs can have their own (*Tools → Language →
  Selected paragraphs*, a `lang` attribute written to Word as `w:lang` and to
  OpenDocument as `fo:language` / `fo:country`, and read back). Templates set
  the language of their content.
- *Tools → Check spelling as you type* / *Check grammar as you type* switch
  the underlines off (remembered in this browser); the browser's own spell
  checker is used only while ours is off.
- Underlines are ProseMirror decorations: the document and its Yjs state are
  never changed, collaborators do not see each other's underlines or ignored
  words, and they are not printed. Only paragraphs that changed are checked
  again (ProseMirror reuses unchanged nodes; results are cached by text), after
  a short pause in typing, nearest to the cursor first.
- **LanguageTool** (optional, off by default): *Tools → Grammar → Use a
  LanguageTool server…* takes the address of a
  [LanguageTool](https://languagetool.org) server (open source; a school can
  host its own) whose `/v2/check` results are merged with the offline ones
  (overlapping issues are shown once; its spelling results are not used). The
  dialog warns that the text of checked documents is sent to that server.
- Dictionaries are separate files (`dictionaries/<lang>-<hash>.aff.txt` /
  `.dic.txt`, generated by `scripts/spell-dictionaries.mjs` from the
  `dictionary-*` packages without their morphological fields, so the Galician
  one goes from 9.5 MB to 2.4 MB, 0.7 MB compressed), downloaded the first
  time a language is checked and then cached by the service worker, like
  Harper's WebAssembly: after one use, checking works offline.
- Measured (Chromium, 56-page document, 27,000 words): first full check
  0.6–0.8 s (dictionary download included; 3.2 s for English, which loads
  Harper); keystroke-to-paint while typing in the middle of the document
  34 ms median with checking vs 30 ms without (the rest is layout of the
  pages). The Galician dictionary takes about 55 MB of memory in the worker
  (Spanish 11 MB); Harper about 100 MB more.
- **Regional variants** (`spell/variants.ts`): Español (España, México,
  Argentina, Colombia, Chile, Estados Unidos), Galego, English (US, UK,
  Australia, Canada), Français, Deutsch. The document and paragraph language
  is stored as a BCP 47 tag (`en-GB`, `es-MX`; older documents with a bare
  `es` still work), written to Word as `w:lang` and to OpenDocument as
  `fo:language` + `fo:country`, and read back (other regions map to the
  closest variant: `es-PE` → `es-CO`, `en-IE` → `en-GB`). Until a document
  has a language, the interface language in the browser's region is used
  (an `es-MX` browser gets *Español (México)*). Each variant has its own
  dictionary file (the `dictionary-en-gb`, `-en-au`, `-en-ca`, `-es-mx`,
  `-es-ar`, `-es-co`, `-es-cl`, `-es-us` packages by wooorm, same licenses as
  the base ones: MIT/BSD for English, GPL/LGPL/MPL for Spanish; Spain uses the
  general RLA-ES Spanish dictionary), loaded only when used; Harper uses the
  matching English dialect. Personal dictionaries are per language.
- **More offline rules**, each tested with right and wrong sentences in
  `spell/rules/tests.ts`: Spanish diacritic accents where only one reading is
  possible (*él/el* before a verb, a pronoun or punctuation; *tú, mí, sé, té,
  más, sí, aún/aun, está*), accents of question and exclamation words after
  `¿` / `¡` and in indirect questions (*no sé dónde*), *de el / a el* →
  *del / al*, article–noun agreement for a curated list of nouns (*el
  problema, la mano, el aprendizaje*, -ción/-dad nouns, *el agua / esta
  agua*), queísmo and more dequeísmo verbs, laísmo with verbs of saying and
  giving, *le lo* → *se lo*, *en base a* (style) and *a nivel de* (optional
  style); lowercase months and days (es, gl, fr; names such as *Julio* or
  *Hospital 12 de Octubre* excepted); Galician Castilianisms (about 250 RAG
  forms, some only in context: *este año*, *a miña madre*), contractions
  (*de o* → *do*, *a o* → *ao*, *por as* → *polas*; not before an infinitive
  or with capitalized place names) and diacritic accents (*é, dá, vén, está,
  máis*); English *its/it's, your/you're, their/there* and capitalized days
  and months; French *quant/quand*, *tout/tous les jours* and pleonasms;
  German *einzigste*, *wider/wieder* and words written together by mistake.
  Words quoted as words («hecho», "el") are not corrected. On about 30,000
  words of clean text (the writer, slides and diagram templates in es/gl/fr/de,
  the interface translations and hand-written texts) the new rules give one
  false positive, a Spanish verb quoted in a Galician explanation.
- **Diagrams and slides**: `spell/inline.ts` exports
  `attachSpellcheck(element, lang?)`, which checks any contenteditable
  element (the label editors) with the same worker and underlines issues with
  the CSS Custom Highlight API, without changing the element's HTML (an
  overlay is drawn in browsers without it); right click shows suggestions,
  *Ignore all* and *Add to dictionary*.

## Spreadsheet

- Built on [Univer](https://github.com/dream-num/univer) (Apache-2.0, open-source presets only):
  multiple sheets, formulas (hundreds of functions), number formats, styles,
  borders, merged cells, freeze panes, filters, sorting, conditional formatting,
  data validation, tables, hyperlinks, notes, images and find & replace.
- Real-time collaboration without a server (see below), with collaborators'
  selections shown in their color.
- Open and download **Excel (.xlsx)**, **OpenDocument (.ods)** and **CSV**;
  print / PDF of the current sheet (with its charts).
- On the shared Ofimeo frame: our File · Edit · View · Insert · Format · Data ·
  Tools · Help menus call Univer commands through one adapter
  (`sheet/commands.ts`, the only place with Univer command ids; Univer is pinned
  to an exact version), Univer's tool bar is a single row without its ribbon
  tabs, and the status bar shows the selection's sum, average and count, the
  language, the save state and the zoom. Univer is themed from our tokens
  (`sheet/theme.ts`), including dark and high contrast, and its interface
  follows our language (es/gl → es-ES, fr-FR, de-DE, en-US).
- **Charts** (Insert ▸ Chart…): column, bar, line, area, pie, doughnut and
  scatter (with an optional linear trendline showing its equation and R²),
  from a range with detected headers, series in rows or columns, title,
  legend, axis titles and palettes (including a colorblind-safe one). A chart
  is a Univer float DOM drawing whose data is the chart definition; it is drawn
  with [Apache ECharts](https://echarts.apache.org) (Apache-2.0, ~200 KB
  gzipped, loaded only when a chart is shown). Charts update live from cell
  values and formulas, sync through the mutation log, follow their range when
  rows or columns are inserted or deleted (also for concurrent edits, see
  below), are read-only for view links, print as SVG, and are saved as
  **native charts** in .xlsx (DrawingML, with value caches) and .ods (chart
  objects), which Excel and LibreOffice open as live charts; both are read back
  on import. Floating images are also written to and read from .xlsx and .ods.
  Double click (or right click) a chart to edit or delete it.
- **Pivot tables** (Data ▸ Pivot table…): rows, optional columns, values with
  SUM / AVERAGE / COUNT / MIN / MAX and an optional filter cell, written as
  ordinary SUMIFS / AVERAGEIFS / COUNTIFS / MINIFS / MAXIFS formulas on a new
  sheet or at a chosen cell, so values stay live and export anywhere. New
  keys appear with Data ▸ Refresh pivot tables (the definition is stored as
  custom metadata of the table's first cell).
- **Statistics** for secondary school: the usual functions work (AVERAGE,
  MEDIAN, MODE.SNGL, STDEV.S/P, VAR.S/P, QUARTILE.INC, PERCENTILE.INC, CORREL,
  SLOPE, INTERCEPT, FORECAST.LINEAR, NORM.DIST, NORM.INV, BINOM.DIST,
  COUNTIFS, FREQUENCY, RANK.EQ, COMBIN, PERMUT, RANDBETWEEN…) and their Spanish
  names are accepted as aliases (MEDIA, MEDIANA, MODA.UNO, DESVEST.M,
  CUARTIL.INC, PENDIENTE, DISTR.NORM.N…, `sheet/functions.ts`); files are
  always written with the English names. Data ▸ Descriptive statistics… writes
  a live summary table (n, mean, median, mode, standard deviations, variances,
  min, quartiles, max, range). Univer localizes function help, not names.

### How spreadsheet sync works

Univer describes every change as a replayable *mutation*. The shared state is a
base snapshot plus an append-only log of mutations in a `Y.Array`; Yjs gives all
replicas the same log order, so replaying it always yields the same workbook.

- Local changes apply immediately and are appended to the log.
- If a concurrent change lands before local ones, edits of different cells are
  applied directly (order does not matter); anything else triggers a rebuild in
  the shared order, so replicas never diverge.
- Each entry records which changes its author had seen. An edit made without
  knowing about a concurrent row/column insertion or deletion is shifted before
  replaying, so it lands on the cell its author meant. The same applies to the
  source range of a chart edited concurrently.
- Checkpoints (snapshot + covered entries) every 300 changes keep loading fast.

## Drawing

- Built on [Excalidraw](https://github.com/excalidraw/excalidraw) (MIT): shapes,
  arrows that bind to shapes, freehand, text, images, frames, libraries, hand-drawn
  or clean style.
- On the shared Ofimeo frame: our menu bar (File, Edit, View, Insert, Tools,
  Help), common keys (Ctrl+O/S/P/F, F1), Print, status bar with selection,
  save state and zoom. Excalidraw keeps its tool island and property panel; its
  main menu and zoom buttons are hidden. Its theme follows ours (dark and high
  contrast) and its colors, font and radii come from our tokens (`draw.css`).
- Excalidraw 0.18 has no undo/redo or clipboard API: Edit ▸ Undo/Redo, Select
  all, Duplicate and Delete send its own keys to the canvas; Paste reads the
  clipboard and hands it over as a paste event. The canvas background is shared
  in the document (`draw-settings` map).
- Collaborators' pointers and selections, live.
- Open and download `.excalidraw`; download PNG and SVG; Excalidraw's export
  image dialog (File ▸ Export image…).
- Sync: each element is a value in a shared `Y.Map` (deleted elements stay as
  tombstones); local edits are detected with Excalidraw's per-element version and
  remote edits never enter the local undo history. Fonts are served locally.

## Diagrams

- Our own editor built on [maxGraph](https://github.com/maxGraph/maxGraph)
  (Apache-2.0, the TypeScript successor of mxGraph, the engine behind draw.io),
  about 170 KB gzipped and loaded only when a diagram is opened.
- **draw.io compatible**: opens and downloads `.drawio` files (compressed or
  not, multiple pages, user objects) with the same style strings, so diagrams
  move between both editors. Pasting draw.io XML also works.
- **Visio import**: opens `.vsdx` drawings (and `.vssx` stencils, shown as one
  page with every master) in the browser: pages and page size, masters and
  style sheets, geometry (lines, arcs, elliptical arcs, ellipses, curves),
  formatted text, groups, pictures and connectors with their arrows, following
  draw.io's importer. Rectangles, ellipses and common flowchart masters become
  draw.io shapes; other geometry becomes an inline stencil (`shape=stencil(…)`,
  which draw.io reads too). Theme colors are approximated; EMF pictures and
  rotated groups are not supported.
- **Shape handles**: yellow handles adjust shape parameters like draw.io
  (callout tail, step and hexagon size, arrows, cylinder, note and card
  corners, rounded corners, swimlane header…, plus the handles of the draw.io
  libraries that define them); the change is one undo step and syncs.
- **Page background and size** per page (draw.io's `background`, `pageWidth`,
  `pageHeight`, kept in `.drawio` files and used by the exports), and a
  *Page view* (View menu or format panel) that shows the printable pages.
- Shapes and markers ported from draw.io (general, flowchart, UML, entity
  relation, basic, arrows and connectors) in a searchable shape panel; click
  to insert or drag onto the canvas or into a container.
- **More shapes**: draw.io's other shape libraries (AWS, Azure, Google Cloud,
  IBM, Cisco, Kubernetes, network, BPMN, ArchiMate, C4, SysML, UML 2.5, floor
  plans, mockups, electrical, P&ID, racks, and more: 62 entries, about 14,000
  shapes) can be enabled from *View → More shapes…* or the button under the
  shape panel. They are generated at build time from the pinned draw.io release
  (`scripts/build-diagram-libs.mjs`) and downloaded only when used: a library
  when it is enabled, the stencils and shape code of a diagram when it is
  opened (so files using them render as in draw.io). Everything used once is
  cached and keeps working offline.
- **Hand-drawn style** (draw.io's `sketch=1`, drawn with rough.js with the same
  per-shape seed, fill styles such as hachure or zigzag) and a hand-drawn font,
  both available offline.
- Connection points, orthogonal/elbow/curved/entity-relation connectors, guides,
  rotation, grouping, containers, alignment and distribution, automatic layouts
  (tree, hierarchical, circle, organic), multiple pages, in-place label editing.
- Format panel (fill, gradient, line, pattern, opacity, shadow, text, arrows,
  position and size, raw style editing), context menu, keyboard shortcuts,
  copy/paste between diagrams (and images or text from other apps), zoom and pan,
  and *Edit → Find…* (Ctrl+F), which searches the labels of every page (also in
  presentations).
- Download SVG and PNG (the selection or the whole page) and print / PDF.
- Collaborators' selections are highlighted, their pointers shown, and the page
  tabs show who is on each page.
- Sync is state-based: Yjs holds pages → cells → fields, so concurrent edits merge
  per field (one person moves a shape while another recolors it). Remote edits
  never enter the local undo history.
- Labels are edited as rich text (bold, lists, colors) when they are HTML.
- Links with view or comment access open the diagram read-only: zoom, pan,
  pages, downloads and presence keep working.

## Presentations

Slides for the classroom, built on the diagram editor (same shapes, libraries,
hand-drawn style, sync and presence). Each slide is a diagram page with a fixed
16:9 (960×540) or 4:3 (960×720) frame; content outside the frame is kept but not
presented or exported.

- Slide panel with live thumbnails, drag to reorder, context menu (new,
  duplicate, delete, move, layout, background) and keyboard navigation; the
  shape panel is the second tab. Who is on each slide is shown on its thumbnail.
- Themes (Light, Dark, Ocean, Paper, Chalkboard, Fresh: background, fonts and
  colors) and layouts (Title, Title and content, Two columns, Section header,
  Title only, Blank) with "Click to add title" placeholders. Changing the theme
  restyles every placeholder and text box that has no color or font of its own.
- Rich text boxes (bold, italic, underline, bullets, numbering, sizes, colors,
  alignment), images (insert, paste, drop), shapes, arrows and icons from the
  shape libraries, tables and equations (MathLive editor, rendered as MathML).
- Speaker notes per slide under the canvas, edited together in real time.
- **Animations**: entrance, emphasis and exit effects per object (appear,
  fade, fly in/out from a side, zoom, wipe; pulse, spin, teeter), started on
  click, with or after the previous one, with duration and delay; the
  animation pane lists them in order (drag or arrows to reorder) and numbers
  the objects on the slide. **Slide transitions**: fade, push and wipe.
  Everything is shared in real time, played when presenting, in the presenter
  view and for followers, and exported to PowerPoint and OpenDocument (native
  PowerPoint / Impress effects).
- **Comments** on a slide or on one of its objects, with replies and
  resolving, in a comments pane; markers on the slide and a count on the
  thumbnails. People with a comment link can comment (they click the object
  they are commenting on); view links can read them.
- **Present**: full screen, arrows / Space / Page Up / Page Down / click / swipe,
  slide counter, laser pointer (L), black screen (B), Esc to end. **Presenter
  view** in a second window: current and next slide, notes, timer.
- **Follow the presenter**: when someone presents, everyone else in the
  presentation sees a *Follow* button; followers see the presenter's slide and
  laser pointer (through awareness) until the presentation ends. View-only
  links work too, so students can follow the teacher's slides.
- Download **PowerPoint (.pptx)** (text boxes, basic shapes, lines and arrows,
  tables and notes stay editable; other shapes become pictures), **OpenDocument
  (.odp)**, **PDF** (print, one slide per page at the slide size), PNG of a
  slide or of all slides (.zip). **Open .pptx** files: text boxes and
  placeholders (positions and sizes from the layout and master, bullets, theme
  colors), shapes, pictures, connectors, tables, backgrounds and notes; charts
  (column, bar, line, area, pie, doughnut) are drawn from their data as a
  picture that keeps the data, and SmartArt uses the drawing PowerPoint saves
  with it (else a box with its text).
- Hand in: the .pptx plus a PNG of every slide.

## Forms and quizzes

Ofimeo Forms is a form and quiz app for schools that works without a server.

- **Editor** (edit link, on the shared frame, edited together in real time):
  sections (one page each for respondents), questions of the types short
  answer, paragraph, multiple choice, checkboxes, dropdown, linear scale,
  multiple choice grid, date, time and number. Questions can have images and
  equations, and can be required or have their options shuffled. The form can
  shuffle the order of questions. There is also a description, a preview, and
  undo and redo. File upload questions are not supported.
- **Quiz mode**: you set correct answers (a number can have a tolerance, a
  short answer can accept several answers), points, feedback for right and
  wrong answers and for each option. Grading is automatic; paragraphs are
  graded by hand, with points and comments in *Responses → Grading*. Grades
  are released per response or all at once, or right after the response is
  received (only when no question needs manual grading). Only the respondent
  can read a released grade.
- **Send**: the Send button gives the form's *view* link, together with a QR
  code and the owner code. Respondents see only the form. They type their name
  (and optionally a class or group) and submit. If they submit offline, the
  response is queued and sent when the connection returns. They get a receipt
  once an editor has stored the response. *Download my response* (`.oresp`)
  is the fallback when no teacher comes online; the teacher imports the file.
  The teacher can also add a Nextcloud "File drop" link, and every response is
  then uploaded there as well, encrypted. The form can be limited to one
  response per browser.
- **Results**: a summary per question (bar charts in SVG, grid tables, lists
  of text answers, mean and median), individual responses, grading, and
  statistics (mean, median, lowest and highest score, standard deviation,
  histogram, share of correct answers per question). Export to CSV or XLSX,
  or *Open in Ofimeo Sheets*, which creates a new spreadsheet.
- **Templates**: self-assessment, review quiz (with answer key), family
  survey, and peer-assessment rubric.

**Who can see responses (security model).**
- The form definition lives in the document. It is signed with the edit key,
  like every protected document. Respondents open the view link, so they cannot
  change the form, and they see an *owner code*: a short fingerprint of the
  signing key that the teacher can confirm.
- Answer keys and responses are kept in a separate *private* Yjs document.
  Only editors have it: it is synced between editors over the room,
  AES-GCM-encrypted with a key derived from the edit seed.
- Each response is encrypted in the respondent's browser (X25519 ECDH with an
  ephemeral key, then HKDF and AES-GCM). It is encrypted to the form's public
  key, which is derived from the edit seed and published, signed, in the form.
- Other respondents, viewers and the relays receive only ciphertext, and they
  store nothing of other respondents' answers. Their stored form document
  holds only receipts (response id and time) and grades that each respondent
  alone can decrypt.
- Responses are stored in the private document of the editors who were
  online, and in the private document of any editor who syncs with them later.

The e2e test (`tests/e2e/forms.spec.ts`) records every WebRTC message and every
IndexedDB value in a second student's browser, and checks that the first
student's answers never appear there.

Files: `src/apps/forms/` has these modules:
- `model.ts`: data
- `crypto.ts`: keys, sealing
- `transport.ts`: the `form` room action (encrypted responses and the private
  document sync)
- `state.ts`: receiving, receipts, releasing grades
- `editor.ts`, `respond.ts`, `results.ts`, `charts.ts`, `export.ts`, `app.ts`

The app uses one additive hook in core: `RoomProvider.makeAction()` in
`network.ts`.

Limitations:
- An editor must be online, or must import the response files, to collect
  responses.
- "One response per browser" is not a hard limit.
- A copy of a form ("Make a copy", template links) does not include the answer
  key: export and import an `.oform` file to keep it.
- The private document is not removed when the form is deleted from the
  trash.

## PDF correction

Ofimeo PDF is for correcting students' PDFs. Open a PDF from the home screen
(Open, drag and drop, Nextcloud), from File ▸ Open… in the app, or from a
hand-in ZIP (the app lists the PDFs inside). The file is stored once in the
document (as binary chunks in Yjs) and travels to collaborators with it; above
20 MB the app asks first.

- Viewing: pdf.js (`pdfjs-dist`, legacy build, loaded on demand, worker bundled
  as a chunk) renders the visible pages only, with a text layer for selection
  and Find (Ctrl+F), thumbnails, zoom and fit width.
- Annotations (shared live, undo and redo): highlight, underline and strikeout
  on selected text (tool or the bubble that appears over a selection), pen with
  stylus pressure and eraser, text boxes, rectangles, ellipses, lines, arrows,
  stamps (check, cross, "Good", "Revise", grade "Grade: …", custom text) and a
  signature drawn once and kept in this browser. Blank pages can be inserted.
- Sticky notes with replies and resolving, like the writer's comments; they live
  in the comments channel, so comment links can add them.
- Collaborators' pointers are shown on the pages.
- Keyboard: V select, H highlight, U underline, K strikeout, P pen, E eraser,
  T text box, N note, R, O, L, A shapes, S stamp, G signature, Esc back to
  Select. Annotations are focusable (Tab): arrows move them, Enter edits the
  text, Delete removes them. Stamps and signatures have alternative text
  (Format ▸ Alternative text…).
- Export (pdf-lib): File ▸ Download as ▸ "PDF with annotations (editable)"
  writes real annotation objects (Highlight, Underline, StrikeOut, Ink, Square,
  Circle, Line, FreeText, Stamp, Text with Popup and replies) with appearance
  streams, so they show and stay editable in Acrobat and other readers;
  "flattened" draws them into the page content (vector; highlights use the
  Multiply blend mode) and keeps the notes; its file is named
  "<title> (flattened).pdf". Hand in includes both; Save to Nextcloud and the
  home screen's Download use the editable one (built from the stored document,
  without opening the viewer).
- Import: annotations of those types in an opened PDF become editable
  annotations (and are removed from the stored file so they are not drawn
  twice). Files exported by Ofimeo carry the exact records, so a round trip
  loses nothing.

Data (`src/apps/pdf/model.ts`): `pdf-file` (chunks), `pdf-meta`, `pdf-pages`
(page order, original page or blank), `pdf-annots` (records in view space:
points, top-left origin, page rotation applied) and `pdf-notes` in the comments
channel. `draw.ts` turns an annotation into drawing primitives used by both the
screen (SVG) and the PDF writer, so both look the same.

Limitations:
- Text in exported annotations uses the standard Helvetica font: characters
  outside Latin-1 (e.g. Greek, CJK, emoji) become "?".
- Encrypted PDFs are exported as page images plus vector annotations, and
  their existing annotations are not imported.
- Original pages cannot be deleted, reordered or rotated; only blank pages can
  be added and removed.
- PDF forms (fields) are shown but not filled in.
- Large PDFs make sharing slower: every collaborator downloads the whole file.

## Templates

The home screen has a **Templates** gallery for schools. Template content is
written in Spanish, Galician, French and German; the two tied to Spanish
regulations (LOMLOE learning situation, as a document and as a presentation)
exist in Spanish and Galician only and are hidden for French and German content.
The content language follows the interface language (with the English interface,
the browser's languages, else Spanish) and a switch changes it. French and German
versions keep the 0–10 grade scale with the pass mark at 5, labelled with the
usual mentions (Insuffisant … Très bien) or school grades (Mangelhaft … Sehr gut),
and use their own attendance codes (A/J/R, F/E/V). Filter by app, click a card and a new local document is
created and opened.

| App | Templates |
| --- | --- |
| Document | Situación de aprendizaje (identification, justification, specific competences, evaluation criteria, basic knowledge, activity sequence, UDL/DUA, evaluation), rubric, student worksheet, student report (cover, index, sections, APA bibliography), meeting minutes, letter to families with a consent slip |
| Spreadsheet | Gradebook (weighted averages per term from a weights sheet, final grade, IN/SU/BI/NT/SB level, pass/fail colors, group statistics, grade distribution chart), weekly timetable, monthly attendance register (weekdays from month/year, F/J/R codes, totals and attendance %), rubric with automatic score |
| Diagram | Concept map, timeline, process flowchart, graphic organizers (KWL, Venn, cause and effect) |
| Drawing | Brainstorm board, mind map, storyboard (six scenes with action and dialogue) |
| Presentation | Learning situation presentation, student oral presentation, class presentation (goals, key concept, example, activity steps, exit ticket), project report (team, objective, process, results table, next steps), lesson plan for the teacher (objectives, timed phases table, materials and differentiation, evaluation table) |
| Form | Self-assessment, review quiz (answer key, points, feedback), family survey, peer assessment rubric |
| PDF | None: a PDF starts from a file (or blank pages) |

Templates are generated in code (no network) and go through each app's own
import path: HTML for documents, a workbook snapshot for spreadsheets,
`.drawio` XML for diagrams, `.excalidraw` for drawings, `.pptx` for
presentations and the form model for forms. The gallery and each app's templates are separate chunks, loaded
only when the home screen shows them or a template is used.

### My templates

**File ▸ Save as template…** (every app) saves the open document as an own
template: a snapshot of its content (no comments, version history, authors or
sharing keys) with a name, a description and a preview (the app's PNG/SVG export
for drawings and diagrams, otherwise the first lines of text). Own templates are
kept in this browser (IndexedDB) and appear in the gallery under **My templates**:
click to create a document, or use ⋮ to rename, delete, **export as a file**
(`.ofimeo-template`, JSON with the Yjs state) or share it to the Nextcloud folder
`/Plantillas`. **Import template…** reads template files and **From Nextcloud…**
lists the `.ofimeo-template` files in `/Plantillas`, so a department can
distribute its templates as files or through a shared Nextcloud folder.
Code: `src/core/library-templates.ts`, `src/home/my-templates.ts`, `src/home/save-template.ts`.

## Accessibility

The **Accessibility** button (app bar and home screen, or `Alt+Shift+A`) opens a
panel with per-user preferences. They are saved in this browser and apply to the
whole suite; nothing changes in the documents themselves.

- **Reading fonts**: OpenDyslexic or Atkinson Hyperlegible for the interface
  and, optionally, for document text in the word processor. The document text
  option is *display only*: saved fonts, downloads and printing are unchanged
  (page breaks on screen may move while it is on). Fonts are self-hosted and work
  offline.
- **Text size** of the suite's interface (100–200 %), **line and letter spacing**
  for reading documents (display only).
- **Themes**: light, dark, follow the system, high contrast dark and high
  contrast light (all text at least 7:1, verified). Document pages, sheets,
  drawings and diagram canvases keep their own colors so their content stays
  readable.
- **Reduce motion**, **large mouse pointer**, **thick focus outline**.
- **Reading ruler** or **focus mask** that follows the pointer and, in text
  editors, the text cursor.
- **Read aloud** (`Alt+Shift+R`): reads the selection, or the paragraph with the
  cursor, or the whole document, with the browser's voices. The language
  (Spanish, Galician, English, French, German) is detected from the text; when no Galician voice
  is installed it reads with a Spanish one and says so. The word being read is
  highlighted without touching the document.
- **Dictation** (`Alt+Shift+D`): writes what you say at the text cursor of the
  word processor, a diagram label, a spreadsheet cell being edited or any text
  field. It uses the browser's speech recognition (Chrome, Edge), which needs an
  internet connection; the panel says when it is unavailable or offline.
- **Keyboard**: a *Skip to content* link, `F10` (or `Alt+Shift+M`) focuses the
  menu bar; arrow keys, `Enter` and `Escape` work in menus, submenus and toolbar
  pop-ups, and focus returns to the document. Dialogs, menus and toolbar buttons
  carry ARIA roles and names.

## Help and onboarding

Built-in help for teachers and students, bundled and available offline (`src/help/`):

- **Welcome tour** (home screen, first visit in a browser): five short steps on
  documents living in this browser, sharing links (edit / comment / view /
  copy), offline use, backups and Nextcloud, and handing in. It is remembered in
  `localStorage` (`words-online:help:welcome`) and reopened from *Help ▸
  Getting started* on the home screen.
- **Quick start** per app: the first time an app is opened, a small
  non-blocking panel with three or four tips (respondents of a form and view or
  comment links get their own). *Help ▸ Getting started* in every app on the
  shared frame shows it again.
- **Help center** (*Help ▸ Help center*): a searchable dialog (words in any
  order, ignoring case and accents, with highlighted snippets) with articles on
  getting started, sharing and permissions, offline use and where data is
  stored, backups, Nextcloud, hand-in, school networks and the relay, privacy,
  keyboard shortcuts, accessibility, and one per app. Articles live in
  `src/help/articles/<lang>.ts` (English source plus es, gl, fr, de; the type
  requires every article in every language) and use a tiny markup with links
  to other articles and actions (open *Storage and backup*, the connection test…).
- **Contextual help**: `showDialog(…, help)` adds a "?" button that opens an
  article; used by Share, Hand in, Connection test, Storage and backup,
  Nextcloud and the Nextcloud upload link.
- **Opt-out**: `?notour` (remembered) or `localStorage['words-online:help:off'] = '1'`
  turns the tour and quick starts off; they are also skipped under WebDriver
  (Playwright) unless the URL has `?tour`.

## Languages

The whole suite is available in **Spanish** (Spain), **Galician** (following
the RAG norms), **English**, **French** and **German** (terminology of
LibreOffice / Microsoft Office in each language; French typography with no-break
spaces before `: ; ! ?` and « », German „…“ quotes and formal *Sie*).

- The language is the one chosen in the language selector (home screen bar, or
  *Accessibility → Interface language*), saved in this browser; otherwise the
  browser's languages decide: Galician for `gl`, Spanish for any Spanish locale
  and for the other languages of Spain (Catalan, Basque…), French and German for
  any of their regional variants (`fr-CA`, `de-AT`, `de-CH`…), English otherwise.
  Changing it reloads the page. `<html lang>` follows it.
- UI strings are written in English in the code and wrapped with `t('…')`
  (`src/core/i18n.ts`; `{name}` placeholders, `tn()` for singular / plural).
  The catalogs (`src/core/locales/es.ts`, `gl.ts`, `fr.ts`, `de.ts`) are keyed by the English
  text and loaded on demand with a top-level `await`, so `t()` is ready before
  any module runs; missing entries fall back to English. Key names in shortcuts
  follow the keyboard (`Mayús`/`Maiús`, `Maj`/`Entrée`/`Suppr`,
  `Strg`/`Umschalt`/`Eingabe`/`Entf`).
- Third-party editors get the same language: Excalidraw (`es-ES`, `gl-ES`,
  `fr-FR`, `de-DE`), MathLive (Spanish, French, German built in, Galician strings
  added by us) and Univer (`es-ES`, `fr-FR`, `de-DE`, loaded on demand; Univer
  has no Galician, so Galician users get its Spanish interface). Dates and
  numbers are formatted with `Intl` in the chosen language.
- Shape names of the built-in diagram libraries are translated; the draw.io
  libraries of *More shapes* keep their original (mostly product) names, only
  their groups are translated. Template content has its own language switch,
  which follows the interface language by default.
- Existing document content is never translated. The first page, slide and
  sheet of a new document keep fixed names ("Page-1", "Slide 1", "Sheet1") so
  that collaborators who create it at the same time agree on them.

## Your documents: storage, backup and organization

Documents live only in the browser (one IndexedDB database per document), so
the suite takes care of keeping them safe:

- **Persistent storage.** When the first document is created, Ofimeo asks the
  browser for persistent storage (`navigator.storage.persist()`), so it does not
  evict the documents when space runs low, and explains it in a small notice.
- **Storage and backup** (home screen: drive icon; every app: File ▸ Storage and
  backup…) shows the storage used and available, whether it is protected, how many
  documents exist only in this browser, and warns that clearing the browser data
  deletes them.
- **Back up all documents** downloads one `.ofimeo-backup` file: a zip with the
  document index (titles, keys and access, folders and tags), each document's Yjs
  state (its version history is part of it), its comments document, the signed
  update logs of protected documents and the own templates. With a password, the
  zip is encrypted with AES-GCM (256-bit key from PBKDF2-SHA-256, 310 000
  iterations). The file contains the keys to edit the documents, hence the password.
- **Restore backup** merges: documents that are already here receive the backup's
  Yjs updates (nothing is lost on either side, stronger keys are adopted), missing
  ones are added; a report lists what was added, merged with changes and already
  up to date.
- **Reminder.** When documents exist only in this browser (not linked to
  Nextcloud) and there has been no backup for N days (7 by default, configurable,
  or never), the home screen shows a dismissable warning.
- **Automatic backup to Nextcloud** (off by default): with a linked account, a
  backup is uploaded every N days to a folder (`/Ofimeo/Backups`), optionally
  encrypted; it runs when the home screen opens and it is due.

The home screen organizes the documents of this browser. All of this is local
(never shared with collaborators):

- **Folders** (nested) and **tags** (with colors) in the side panel; move
  documents by drag and drop onto a folder or tag, with ⋮ ▸ Move to folder… /
  Tags, or several at once (checkboxes, Ctrl/Shift-click, Space) with the
  selection bar: move, tag, download, back up the selection, move to the trash.
- **Filters** by app, folder and tag; **sort** by last modified, name or type;
  **list** and **grid** views (remembered).
- **Trash.** Deleting moves a document to the trash (restore, delete for good,
  empty trash); documents are deleted for good after 30 days. The IndexedDB data
  is only removed when a document leaves the trash.
- **Content search.** The search box matches titles and content, ignoring case
  and accents (`educacion` finds «Educación»), and shows a snippet with the
  matches highlighted. The plain text of each document (document text, cell
  values, drawing texts, diagram and slide labels and speaker notes, form
  descriptions, questions and options, PDF page text, text boxes, stamps and
  sticky notes) is extracted from its Yjs state in a Web Worker and kept in a
  local index, refreshed incrementally for documents that changed since they
  were indexed. PDF page text comes from pdf.js, loaded in the worker only when a
  PDF is indexed; it is kept with the index and extracted again only when the
  file itself changes (not when annotations do). Form answer keys are never
  indexed.
- **Download** builds files from the stored state without opening the documents
  (Word, PowerPoint, draw.io, Excalidraw, `.oform`, the PDF with editable
  annotations; several go into a zip, and a document that cannot be built is
  left out and named in a message). Spreadsheets are downloaded from the app.

Code: `src/core/backup.ts`, `src/core/library.ts` (folders, tags, local database),
`src/core/library-search.ts` + `library-extract.ts` + `library-search.worker.ts`,
`src/home/docs.ts`, `src/home/storage.ts`, `src/home/download.ts`.

## Offline and installable

Ofimeo is a Progressive Web App: install it from the browser (address bar
or menu → *Install*) and it works without a connection for individual work.

- A service worker precaches the suite and every app, so after the first visit
  everything works offline; the home screen shows when it is ready.
- Documents always live in the browser (IndexedDB), so creating, editing,
  opening and downloading files needs no network. Collaboration resumes by itself
  when peers are reachable again, and offline edits merge automatically.
- When installed, the app registers as a handler for `.docx`, `.odt`, `.doc`,
  `.xlsx`, `.ods`, `.xls`, `.csv`, `.tsv`, `.drawio`, `.vsdx`, `.excalidraw`,
  `.pptx`, `.odp`, `.ppt`, `.oform` and `.pdf` files ("Open with"). Its
  shortcuts (long-press or right-click the icon) start a new document in any
  of the seven apps.
- Updates are picked up automatically on the next visit.

## Nextcloud

Open documents from a Nextcloud server (schools often have one) and save them
back, with no server of our own: the browser talks WebDAV directly to
Nextcloud. Full guide: [docs/nextcloud.md](docs/nextcloud.md).

- **Account**: home screen → **Nextcloud** (or *File → Nextcloud account…*).
  *Log in with Nextcloud* (Login Flow v2: approve in a Nextcloud tab) or an
  **app password** (Nextcloud → *Personal settings → Security → Devices &
  sessions → Create new app password*; never the main password). *Test
  connection* tells apart a wrong address, an unreachable server, https→http,
  maintenance, wrong credentials and a server that blocks this site (CORS),
  and then shows the admin options below. *Sign out* forgets the password (and
  revokes it when it came from the login flow).
- **Open from Nextcloud…** (home screen and File menu): file browser with
  breadcrumbs, search in the folder, sorting and icons per app; the file is
  imported with the app's importer into a new local document **linked** to it.
- **Save to Nextcloud** (Ctrl+S) updates the linked file in its format;
  **Save to Nextcloud as…** chooses folder (or a new one), name and format
  (the app's download formats). Saves send the file's ETag (`If-Match`): if
  it changed in Nextcloud meanwhile you choose *Overwrite*, *Save as a copy* or
  *Cancel*. The app bar shows "Saved to Nextcloud at hh:mm" or unsaved changes.
  Optional autosave every 2–15 minutes (off by default).
- The link is kept in this browser's document index only: collaboration stays
  peer to peer, and only the person who linked the document saves it.
- **Hand in → Upload to a Nextcloud share link…** sends the hand-in ZIP to a
  teacher's *File drop* link (`https://host/s/TOKEN`, optional password) via
  public WebDAV; students need no account.
- Offline, Nextcloud actions are disabled with a message; nothing else changes.

### Nextcloud for administrators: CORS

Unless Ofimeo is served from the Nextcloud address, the browser needs
Nextcloud to allow its origin (CORS). Options:

1. **Same address (recommended)**: copy `dist/` to e.g.
   `https://cloud.school.org/office/` (nginx: `location ^~ /office/ { alias
   /var/www/words-online/; }`; Apache: `Alias /office /var/www/words-online`).
   No CORS needed; everything works, including the login flow.
2. **The Nextcloud app "WebAppPassword"**: add the Ofimeo origin to its
   allowed WebDAV origins. Covers WebDAV (browse, open, save) with app
   passwords; not the login flow, revocation or share-link uploads.
3. **CORS headers in the web server**, limited to the Ofimeo origin and
   to `remote.php/dav`, `public.php/dav|webdav`, `ocs/v2.php/core/apppassword`
   and `login/v2`, answering the `OPTIONS` preflight, allowing the
   `Authorization`, `Depth`, `Destination`, `If-Match`, `If-None-Match`
   and `OCS-APIRequest` headers and exposing `ETag`. Replace
   `https://office.example.org`:

```nginx
# 1) In the http { } block (e.g. /etc/nginx/conf.d/words-online-cors.conf)
map $http_origin $wo_origin {
    default "";
    "https://office.example.org" $http_origin;   # where Ofimeo runs (one line per site)
}
map $request_uri $wo_cors_path {
    default 0;
    "~^[^?]*/remote\.php/dav/" 1;
    "~^[^?]*/public\.php/(dav|webdav)/" 1;
    "~^[^?]*/ocs/v2\.php/core/apppassword" 1;
    "~^[^?]*/login/v2" 1;
}
map "$wo_cors_path:$wo_origin" $wo_cors_origin {
    default "";
    "~^1:(?<o>.+)$" $o;
}
map $wo_cors_origin $wo_cors_methods {
    "" "";
    default "GET, HEAD, POST, PUT, DELETE, MKCOL, MOVE, COPY, PROPFIND, OPTIONS";
}
map $wo_cors_origin $wo_cors_headers {
    "" "";
    default "Authorization, Content-Type, Depth, Destination, Overwrite, If-Match, If-None-Match, OCS-APIRequest, X-Requested-With";
}
map $wo_cors_origin $wo_cors_expose {
    "" "";
    default "ETag, OC-ETag, OC-FileId, Content-Length";
}
map $wo_cors_origin $wo_cors_max_age {
    "" "";
    default 3600;
}
map "$request_method:$wo_cors_origin" $wo_preflight {
    default 0;
    "~^OPTIONS:." 1;
}

# 2) In Nextcloud's server { } block, next to its other add_header lines
add_header Access-Control-Allow-Origin $wo_cors_origin always;
add_header Access-Control-Allow-Methods $wo_cors_methods always;
add_header Access-Control-Allow-Headers $wo_cors_headers always;
add_header Access-Control-Expose-Headers $wo_cors_expose always;
add_header Access-Control-Max-Age $wo_cors_max_age always;
add_header Vary Origin always;
if ($wo_preflight) {
    return 204;
}
```

```apache
# In Nextcloud's <VirtualHost> (needs mod_headers and mod_rewrite)
<IfModule mod_headers.c>
    SetEnvIfExpr "req('Origin') in { 'https://office.example.org' } && %{REQUEST_URI} =~ m#/(remote\.php/dav/|public\.php/(dav|webdav)/|ocs/v2\.php/core/apppassword|login/v2)#" WO_CORS=1
    Header always set Access-Control-Allow-Origin "expr=%{req:Origin}" env=WO_CORS
    Header always set Access-Control-Allow-Methods "GET, HEAD, POST, PUT, DELETE, MKCOL, MOVE, COPY, PROPFIND, OPTIONS" env=WO_CORS
    Header always set Access-Control-Allow-Headers "Authorization, Content-Type, Depth, Destination, Overwrite, If-Match, If-None-Match, OCS-APIRequest, X-Requested-With" env=WO_CORS
    Header always set Access-Control-Expose-Headers "ETag, OC-ETag, OC-FileId, Content-Length" env=WO_CORS
    Header always set Access-Control-Max-Age "3600" env=WO_CORS
    Header always merge Vary "Origin" env=WO_CORS
    # Answer the browser's preflight (OPTIONS) here: it never carries a login.
    RewriteEngine On
    RewriteCond %{ENV:WO_CORS} =1
    RewriteCond %{REQUEST_METHOD} =OPTIONS
    RewriteRule ^ - [R=204,L]
</IfModule>
```

Credentials (server, user and app password) are stored in this browser's
`localStorage` and sent only to that Nextcloud; see *Security notes* in
[docs/nextcloud.md](docs/nextcloud.md).

## How collaboration works

1. Click **Share**, pick a link (*Can edit*, *Can comment*, *Can view* or
   *Makes a copy*) and send it (or show the QR code).
2. Whoever opens it joins the document; edits sync in real time.

```
 Browser A ◄──── WebRTC (direct, encrypted) ────► Browser B
     │                                                │
     └──── Nostr relays (public WebSockets) ──────────┘
           only to find each other and exchange connection offers
```

- Links look like `…/#app=writer&doc=<id>&key=<secret>&edit=<edit key>`. The
  fragment after `#` is never sent to any server, and routing works on any
  static host.
- Signaling goes through [Trystero](https://github.com/dmotz/trystero) over
  several public Nostr relays at once. Offers are encrypted with the document
  key, so only people with the link can connect.
- Document data travels over WebRTC data channels (DTLS-encrypted). Every peer
  relays updates to its other peers, so everyone converges even if one pair of
  browsers cannot connect directly.
- There is no central copy: at least one other participant must be online to
  receive changes; offline edits merge the next time they meet.

To use your own Nostr relays, add them to the URL (share links keep it):
`https://your-host/?relays=wss://relay1.example,wss://relay2.example`

### School networks: connection test and Ofimeo Relay

Content filters that block public relays, strict firewalls and Wi-Fi client
isolation (devices on the same Wi-Fi cannot reach each other) all end in
"Only you". Browsers cannot find each other on the LAN by themselves, so for
those networks there is **Ofimeo Relay** (`relay/`, guide:
[docs/relay.md](docs/relay.md)): one small program (Go, a single static binary
for Windows, macOS, Linux and Raspberry Pi) that a school runs on its network.
It is a Nostr relay (signaling) plus a STUN/TURN server (pion/turn) that relays
WebRTC when devices cannot connect directly, with a status page, time-limited
TURN credentials, TLS (Let's Encrypt, the school's certificate, or its own
local CA) and, optionally, the web app itself (`--serve-app`).

- **Connection test** (Help → Connection test…, or click the connection status
  next to Share): checks Internet access, every Nostr relay in use (time to
  EOSE), ICE candidates (local, STUN, TURN), a real data channel through the
  school relay's TURN, and how each person in the document is connected
  (direct on the LAN, direct over the Internet, or through TURN, with round-trip
  time). It ends with a plain-language verdict and **Copy report** for the IT
  department (`src/ui/connection.ts`, `src/core/connectivity.ts`).
- **Using a school relay**: paste its address in the connection test, open
  `…/?relay=https://relay-host:port` (saved in the browser), or open the app
  served by the relay (detected automatically). The app fetches
  `<relay>/ofimeo/config` (its Nostr relay and ICE servers with fresh TURN
  credentials, renewed before they expire) and uses it together with the public
  relays, or alone ("Use only the school relay", or `&relaymode=only`). Share
  links carry `?relay=…`, so students get it by opening the link. Nothing
  changes when no relay is configured.
- Development aid: `?ice=relay` forces relayed (TURN) connections.

### Permissions (edit, comment, view)

Permissions are enforced with signatures, not only in the interface
(`src/core/keys.ts`, `src/core/network.ts`):

- Every new document has an Ed25519 *edit key* (WebCrypto); the *comment key*
  is derived from it. The edit link carries the edit key; the comment link the
  comment key plus the public edit key; the view link only the two public
  keys. All links also carry the room key, needed to connect.
- Editors sign every change they send. Peers apply document changes only when
  they are signed with the edit key, and comments (a separate shared document,
  `session.commentsDoc`) only when signed with the comment key. State sent to a
  newcomer is signed too, so nothing unsigned is ever accepted.
- Viewers and commenters forward signed changes verbatim and keep them in a
  signed log (IndexedDB), so they can pass the document on even when no editor
  is online. Editors regularly send a signed checkpoint that keeps that log short.
- Access comes from the keys a link holds: editing a view link's URL cannot
  turn it into an edit link, and a change forced from the browser's developer
  tools stays in that browser. A link whose keys do not match the document is
  refused.
- The home screen marks documents you can only view or comment on.
- Documents created before permission links (links without keys) keep working
  as before: every link can edit. Make a copy to get permission links.
- Permission links need a secure origin (https or localhost). On plain http
  new documents are created without keys.

### Copies and template links

- **File → Make a copy** creates a private copy in this browser (new keys, full
  edit, no history or comments) titled "Copy of …".
- The *Makes a copy* share link (`…&copy=1`) gives everyone who opens it their
  own copy, e.g. a worksheet for each student. The page waits until the content
  arrives from someone who has the document open (the teacher's browser, or
  anyone who viewed it before), explains the wait if it takes long, then opens
  the copy.

### Hand in

The **Hand in** button (next to Share) downloads, in one click, a ZIP named
`<your name> - <title>.zip` with the document in its original formats and a
`README.txt` (title, author, date): `.odt` + `.docx` (documents), `.ods` +
`.xlsx` (spreadsheets), `.excalidraw` + `.png` (drawings), `.drawio` + PNG and
SVG of every page (diagrams). It then offers *Print / Save as PDF* and
*Upload to a Nextcloud share link…* (see [Nextcloud](#nextcloud)).

### Version history

- Versions are stored in the document (`versions` array), so every
  collaborator sees them. Editors save one automatically at most every 10
  minutes while editing, and named ones with **File → Save version…**.
- **File → Version history…** lists them (time, author, name). Anyone can open a
  version as a new copy; editors can restore one for everyone (the current
  state is saved first).
- Named versions are kept; automatic ones are thinned out (the latest ten, then
  one per day).
- An `authors` map in the document records who edited (name and color per
  Yjs client).

## AI assistants (WebMCP)

Ofimeo contains no AI, but it can let an AI assistant that **you** run in your
browser (an extension or the browser's own agent implementing the W3C
[WebMCP](https://webmachinelearning.github.io/webmcp/) draft) work with the
open document. Details: [docs/webmcp.md](docs/webmcp.md).

- **Off by default**, turned on per browser with **Tools → Allow AI assistants
  (WebMCP)…** after a dialog that explains what it allows. While on, an
  **AI access on** indicator in the app bar shows it (click it to turn it off).
- The tools follow the link's access: view links get read tools only, comment
  links can also add comments, edit links can also change the document. The
  assistant never gets share links, keys or other documents.
- In documents the assistant's text changes are **suggestions** you accept or
  reject; in the other apps each change is one undo step. Versions "Before
  changes by the AI assistant" / "Changes by the AI assistant" frame its work in
  the version history, and its comments are signed "AI assistant (*you*)".
- Tools: `get_document_info` everywhere; documents `get_text` (Markdown),
  `get_outline`, `find`, comments, `insert_text`, `replace_range`,
  `apply_heading`, `format`; spreadsheets `list_sheets`, `read_range`,
  `write_range`, `add_sheet`, `insert_chart`, notes; presentations
  `list_slides`, `get_slide`, `add_slide`, `set_text`, comments; diagrams
  `get_diagram`, `add_shape`, `connect`, `set_label`; forms (editors)
  `get_form`, `add_question`, `get_responses`; PDF `get_text`, notes,
  `add_highlight`; drawings `get_scene`, `add_element`.
- Uses the native `document.modelContext` when the browser has it, otherwise
  loads the MIT-licensed `@mcp-b/global` polyfill (only while the switch is on).

## Architecture

```
src/
  main.ts            Router: home screen or app, loaded with dynamic import()
  core/              Shared, UI-free building blocks
    offline.ts       Service worker registration
    router.ts        #app=…&doc=…&key=… parsing and links
    session.ts       Y.Doc + IndexedDB + awareness + P2P room for a document, access level
    keys.ts          Permission keys in links, Ed25519 signing
    network.ts       Yjs sync/awareness provider over Trystero (WebRTC + Nostr), signed sync
    connectivity.ts  School relay settings (?relay=, /ofimeo/config, TURN credentials) and network checks
    store.ts         Local document index (id, key, type, title, access, folder, tags, trash) and user identity
    backup.ts        Persistent storage, .ofimeo-backup files (optional AES-GCM), restore by merging, auto backup
    library*.ts      Folders and tags, content search index (worker), own templates
    copy.ts          Copies of documents, template links
    versions.ts      Version history, generic restore
    handin.ts        Hand in (ZIP), printing
    nextcloud.ts     Nextcloud client: accounts, diagnostics, Login Flow v2, WebDAV, share uploads
    idb.ts           Small IndexedDB key-value store (signed logs)
    formats.ts       Format helpers: XML, colors, units, images
    i18n.ts          UI language, t() translations; locales/ holds the es, gl, fr and de catalogs
    webmcp/          AI assistants over WebMCP: switch, permission gate, registry (native or polyfill), attribution;
                     each app's tools are in apps/<app>/webmcp.ts (docs/webmcp.md)
  ui/                Shared UI so every app looks the same (the "app frame")
    shell.ts         App frame markup: app bar, menu bar, toolbar row, status bar
    frame.ts         mountFrame(): standard menus, keys, toolbar and status bar for an app
    menus.ts         File / Edit / Help menus in one standard order
    shortcuts.ts     Common keys (Ctrl+O/S/P/F/H, Ctrl+/, F1) and the shortcuts dialog
    toolbar.ts       One-row toolbar with a "⋯" overflow menu
    statusbar.ts     Status bar: info · language · save state · zoom; zoom.ts: zoom control
    about.ts         About Ofimeo, Document details; brand.ts: the Ofimeo mark
    chrome.ts        Title, save state, presence, connection status, share dialog + QR, hand in
    connection.ts    Connection test dialog (verdict, checks, report, school relay setting)
    tokens.css       Design tokens (colors, spacing, radii, type, layers) and the themes
    versions.ts      Make a copy / Save version / Version history (File menu items)
    nextcloud.ts     Nextcloud dialogs: account, CORS help, file browser, save, status, hand in
    widgets.ts       Menus, context menus, popovers, color palette, dialogs, toasts
    webmcp.ts        Tools → Allow AI assistants (WebMCP) switch, explanation dialog, app bar indicator
    equation.ts      Equation editor (MathLive, lazy) and KaTeX rendering / MathML
    base.css
  home/              Home screen: new document buttons, open file, documents (folders, tags, trash, search), storage and backup
  templates/         Template gallery (catalog, thumbnails) and template content per app
  apps/
    registry.ts      App list: name, icon, loader, supported files
    draw/            Drawing (Excalidraw + Yjs element sync)
    forms/           Forms and quizzes (encrypted responses over the room, grading, results)
    diagram/         Diagrams (maxGraph)
      app.ts         Diagram app: menus, toolbar, page tabs, files
      editor.ts      The editor without its frame (graph, sync, undo, zoom, clipboard,
                     commands, panels, keyboard, presence), shared with slides/
      graph.ts       maxGraph set up like draw.io; cells <-> plain records
      model.ts       Plain diagram model shared by the editor, sync and converters
      sync.ts        Pages/cells/fields in Yjs <-> graph model
      presence.ts    Remote selections and pointers
      sidebar.ts     Shape panel; palette.ts holds the libraries
      libraries.ts   draw.io's libraries on demand: "More shapes", stencils, shape code
      format.ts      Format panel
      export.ts      SVG / PNG rendering
      shapes/        draw.io shapes, markers, perimeters, stencils and stylesheet;
                     compat.ts runs draw.io's shape code (mxGraph API) on maxGraph
      formats/       .drawio import and export (loaded on demand)
    slides/          Presentations (on diagram/editor.ts)
      app.ts         Slides app: slide panel, frame, themes, layouts, text tools, menus
      model.ts       Slide sizes, themes, layouts and placeholders; per-slide settings and notes in Yjs
      render.ts      Theme styling of graphs; offscreen slide rendering to SVG
      slidelist.ts   Thumbnails panel; notes.ts: speaker notes bound to a Y.Text
      present.ts     Presenting, laser pointer, presenter view, following the presenter
      formats/       PPTX / ODP export (elements.ts turns slides into neutral elements),
                     PPTX import (loaded on demand)
    sheet/           Spreadsheet
      app.ts         Univer in the Ofimeo frame: file actions, status bar, presence, printing
      menus.ts       Menus and shortcut rows; commands.ts: Univer command id adapter
      theme.ts       Univer theme from our tokens
      univer.ts      Univer presets and locales
      charts/        Chart model, ECharts options and loader, live view, chart dialog
      pivot.ts       Pivot tables as formulas; stats.ts: descriptive statistics, function aliases
      sync.ts        Mutation log over Yjs, rebuilds and checkpoints
      transform.ts   Shifts concurrent edits through row/column changes
      print.ts       Print layout of the current sheet
      formats/       XLSX / ODS / CSV import and export (loaded on demand)
    writer/          Word processor
      app.ts         Editor, print layout, zoom, status bar, file actions
      commands.ts    Menus, toolbar, context menu
      dialogs.ts     Page setup, header/footer, footnotes, links, tables…
      pages.ts       Pagination: pages per section (size, orientation, margins),
                     columns, footnotes; blocks placed with node decorations
      sections.ts    Section settings at the cursor (page setup, columns)
      fonts.ts       Shipped document fonts (fonts/: Carlito, Caladea, Arimo, Tinos, Cousine)
      pdf/           Direct PDF export: sfnt.ts (WOFF/TrueType, subsetting),
                     document.ts (PDF objects, fonts, outline, tags), render.ts
                     (draws the laid-out pages), loaded on demand
      references/    Sources and citations: format.ts (APA, MLA, Chicago in five
                     languages), parse.ts (BibTeX, RIS, CSL-JSON), nodes.ts
                     (citation and bibliography nodes), store.ts, ui.ts (dialogs)
      find.ts        Find & replace
      review.ts      Comments and suggestions: highlights and the margin rail
      authorship.ts  Authorship colors and contributions per author
      ypos.ts        ProseMirror positions <-> Yjs (relative positions, item authors)
      collab.ts      Session helpers (comments channel, authors, user id)
      editor/        TipTap extensions and custom nodes (equation, suggestions,
                     toc.ts: table of contents)
      formats/       DOCX / ODT import and export, DOC import (loaded on demand);
                     math.ts converts MathML / OMML / LaTeX, bibliography-xml.ts
                     Word's b:Sources
      spell/         Spelling and grammar: plugin.ts (decorations, incremental
                     checks), worker.ts + checker.ts (runs off the main thread),
                     hunspell.ts, tokenize.ts, rules/ (offline rules and tests),
                     ui.ts (Tools menu, context menu, status), dialog.ts (F7),
                     lang.ts (paragraph language)
relay/               Ofimeo Relay (Go): Nostr relay + STUN/TURN + status page for school
                     networks; build.sh cross-compiles it, docs/relay.md is the guide
```

Each app and each converter is a separate chunk, loaded only when used.

## Legal

Legal notice, privacy policy, cookies and local storage, terms of use,
accessibility statement, information for schools (data flows, record of
processing template, text for families) and a note on AI, in Spanish
(authoritative), Galician, English, French and German. Sources in
[docs/legal/](docs/legal/README.md); the owner's data live only in
`legal.config.json` and are injected by `scripts/build-legal.mjs` (part of
`npm run legal`, run by `dev` and `build`), which writes static pages to
`public/legal/` (precached, so they work offline) and
`public/.well-known/security.txt`. The home screen footer and *Help → About*
link to them in the interface language. `scripts/third-party-notices.mjs`
writes `THIRD_PARTY_NOTICES.md` (also served as `legal/licenses.html`) from the
production dependencies and fails the build when one has no license. The texts
are templates to be reviewed by a lawyer / DPO; the project's own license is
not decided yet (options in [docs/legal/README.md](docs/legal/README.md)).

## Development

`npm run dev` and `npm run build` first run `npm run prepare:assets`, which
copies Excalidraw's fonts into `public/excalidraw` and builds draw.io's shape
libraries into `public/diagram-libs` (both generated, not committed). The
libraries come from the draw.io release pinned in `scripts/drawio.json`
(downloaded once into `node_modules/.cache`, checked against its SHA-256);
`DRAWIO_WAR_DIR=<unpacked draw.war>` uses a local copy instead, and `FORCE=1`
rebuilds.

```bash
npm install
npm run dev       # dev server, reachable on the LAN
npm run build     # type-check and build into dist/
npm run preview   # serve the production build
npm test          # grammar rule tests + end-to-end tests (build first)
```

### Tests

- `npm run test:unit`: grammar rule tests (`scripts/test-spell.mjs`).
- `npm run test:e2e`: Playwright tests in `tests/e2e/` against the production
  build (`vite preview`) and a local Nostr relay (`tests/relay.mjs`), never
  public relays: every app opens without errors, the UI language follows the
  browser, two browsers edit the same document, `.drawio`/HTML files open from
  the home screen, the installed app works offline, the connection test
  and a school relay from the link work, a password-protected backup restores
  content, versions and comments after clearing the browser data, and deleted
  documents stay in the trash until it is emptied, the help center finds
  articles and the welcome tour shows once, and AI assistants (WebMCP) get
  only the tools the link allows, with writer changes as suggestions.
- `cd relay && go test ./...`: Ofimeo Relay (Nostr messages and signatures,
  TURN allocations with time-limited credentials, certificates, the TLS port
  shared by HTTPS and TURN, `/ofimeo/config`, serving the app).
- GitHub Actions (`.github/workflows/ci.yml`) runs the type check, both test
  suites and the build on every pull request and on pushes to `main`, plus
  `go vet` and `go test` for the relay; the Playwright report is attached to
  failed runs. Pushing a tag `relay-v1.2.3` builds the relay for every platform
  and publishes a GitHub Release (`.github/workflows/relay-release.yml`).

## Deployment

`.github/workflows/pages.yml` builds and publishes `dist/` to GitHub Pages on
every push to `main` (enable *Settings → Pages → Source: GitHub Actions*).
The build uses relative paths, so any static host or subfolder works.

## Limitations

- Public relays are community-run with no guarantees; several are used at once.
- Some restrictive networks can block direct WebRTC connections between
  different networks. No TURN server is configured.
- Pagination moves whole blocks to the next page or column (paragraphs are
  not split across pages); a block taller than a page overflows. Tables of
  contents and bibliographies are split entry by entry.
- Word/ODT: only the default header/footer (the same on every section),
  plain-text footnotes; text boxes and floating shapes are not imported. Tracked
  formatting changes are not imported; comments on header/footer text are
  dropped. Equations cover common constructs (fractions, roots, scripts,
  sums/integrals, matrices, accents, delimiters); exotic OMML/MathML may lose
  structure. Column breaks are not supported; a continuous section break that
  changes the page size starts a new page. LibreOffice keeps its own text for
  bibliography marks, so citations in `.odt` files show as "(Author, year)"
  there, without the page. `.doc` / `.xls` / `.ppt`: see *Legacy files* above.
- Documents created with the earlier Quill-based version are not migrated, nor
  diagrams made with the earlier embedded draw.io version.
- Diagrams: draw.io's shape libraries are included except the few that need
  its editor (layout containers of *Advanced*); shapes whose code is not
  available render as rectangles but are kept in the file. Shape-specific
  editing handles (e.g. dragging a BPMN or mockup parameter) are not available
  for library shapes. Library images are not embedded in SVG/PNG downloads.
  No Visio import; math and custom web fonts are not rendered.
- Presentations: no animations or transitions besides a fade; PowerPoint and
  OpenDocument downloads turn library shapes, curved connectors, hand-drawn
  shapes and equations into pictures, and gradient backgrounds into a picture.
  PowerPoint import skips charts, SmartArt, animations and embedded media, and
  uses the first stop of gradient fills in shapes. The presenter view needs
  pop-ups allowed; opening it may leave full screen (use F or the ⛶ button).
- Credits: the "More shapes" libraries are draw.io's (JGraph Ltd / draw.io AG):
  the code and palettes are Apache-2.0; the stencils and icons carry an extra
  restriction (they may not be used in, or distributed for, Atlassian products
  or its marketplace; diagrams made with them are not affected). The generated
  `diagram-libs/` folder keeps that `LICENSE` and a `NOTICE`.
- Spelling and grammar: only paragraph-level languages (not single words);
  suggestions are ranked by edit distance, without word frequencies; Harper
  covers English only and its messages are in English; the offline rules are
  deliberately few (precision over recall) and German noun capitalization is
  left to the dictionary. The sheet's cell editor draws text on a canvas, so the
  browser's spell checker cannot underline there; diagram and slide labels and
  speaker notes use the browser's spell checker in the interface language.
- Credits: dictionaries from [wooorm/dictionaries](https://github.com/wooorm/dictionaries),
  each under its own license and served as separate files with it
  (`dictionaries/<lang>-LICENSE.txt`): Spanish from RLA-ES / LibreOffice
  (GPL-3.0, LGPL-3.0 or MPL-1.1), Galician from hunspell-gl (GPL-3.0), English
  from SCOWL / wordlist.aspell.net (MIT and BSD), French from Grammalecte
  (MPL-2.0), German from igerman98 by Björn Jacke (GPL-2.0 or GPL-3.0).
  English grammar by Harper (Apache-2.0).
- Nextcloud: one account per browser; saving exports the whole file (no
  partial or collaborative editing of the file in Nextcloud); a file opened in
  a format the app cannot write (e.g. `.md`, `.tsv`) is saved with *Save to
  Nextcloud as…*; image formats (PNG/SVG) save the current page only. Without
  CORS configured on the server (or the same address), nothing can connect.
- Spreadsheet: the app bundle is large (~2 MB gzipped, loaded only when a sheet
  is opened). Univer's paid features (charts, pivot tables, native printing,
  official collaboration server) are not used. The mutation log is never
  pruned, so very long-lived sheets keep growing in storage (checkpoints keep
  loading fast).
