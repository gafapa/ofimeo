# Ofimeo

Ofimeo (formerly "Words Online") is a collaborative office suite for schools
that runs entirely in the browser, with no server of its own. One static build hosts every app; documents live in each browser
(IndexedDB) and edits travel directly between browsers over WebRTC. Public
Nostr relays (WebSockets) are only used as a meeting point for browsers to
find each other. A school can add its own Ofimeo Relay (Nostr, STUN/TURN,
encrypted store-and-forward mailboxes, optionally the app itself) for networks
where that is not enough.

| App | Name in the UI (en / es) | Status |
| --- | --- | --- |
| Word processor (`writer`) | Ofimeo Docs / Ofimeo Documentos | Available |
| Spreadsheet (`sheet`) | Ofimeo Sheets / Ofimeo Hojas de cálculo | Available |
| Drawing (`draw`) | Ofimeo Drawing / Ofimeo Dibujo | Available |
| Diagram (`diagram`) | Ofimeo Diagrams / Ofimeo Diagramas | Available |
| Presentation (`slides`) | Ofimeo Slides / Ofimeo Presentaciones | Available |
| Forms and quizzes (`forms`) | Ofimeo Forms / Ofimeo Formularios | Available |
| PDF correction (`pdf`) | Ofimeo PDF / Ofimeo PDF | Available |
| Notebook (`notebook`) | Ofimeo Notebook / Ofimeo Cuaderno | Available |

Storage keys and database names use the `ofimeo` prefix (`localStorage`
`ofimeo:*`, IndexedDB `ofimeo:*` and `ofimeo-*`). Data saved under the former
`words-online` names is moved to them the first time the app starts
(`src/core/legacy-storage.ts`), so documents made before the rename keep
working. Peer-to-peer room and signature identifiers keep the former name, so
existing links stay valid.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the suite is built (session,
  sync, permissions, app frame, apps)
- [docs/DECISIONS.md](docs/DECISIONS.md): design decisions and why they were made
- [docs/ROADMAP.md](docs/ROADMAP.md): what comes next
- [CONTRIBUTING.md](CONTRIBUTING.md): development setup, conventions, tests,
  translations
- [docs/deploy-school.md](docs/deploy-school.md): hosting Ofimeo in a school
  (Docker, relay, `ofimeo.config.json`)
- [docs/relay.md](docs/relay.md): Ofimeo Relay (Nostr, STUN/TURN, import proxy)
- [docs/store-forward.md](docs/store-forward.md): sync without being online
  together, threat model
- [docs/moodle.md](docs/moodle.md): Moodle tasks and hand in
- [docs/nextcloud.md](docs/nextcloud.md): Nextcloud accounts, CORS, security
- [docs/webmcp.md](docs/webmcp.md): AI assistants over WebMCP
- [docs/ui-frame-api.md](docs/ui-frame-api.md): the shared app frame API
- [docs/design/](docs/design/): design notes per area (editors, converters,
  UI audit)

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
  fields and page setup. Also opens `.doc` and `.rtf` (see below), `.html`,
  `.txt` and **Markdown** (`.md`: headings, lists and task lists, emphasis,
  links, code, block quotes, tables and images by URL, read with `marked`), and
  downloads Markdown (*File → Download as*). When an importer has to leave
  something out, the first editor who opens the document gets a one-time notice
  listing it.
- View ▸ Zoom (zoom in / out, presets, fit) and `Ctrl`+`+` / `-` / `0`.
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
- **Legacy files**: Word 97-2003 `.doc` (text, headings — outline numbering on
  heading styles stays a heading —, title, bold / italic / underline / strike /
  size / color / highlight / super- and subscript, alignment, lists, tables with
  horizontally and vertically merged cells, footnotes, hyperlinks, page breaks,
  inline JPEG/PNG pictures, table of contents fields, page size and margins, the
  default header and footer with page numbers, and comments with their author
  and range), **RTF** (`writer/formats/rtf-import.ts`: paragraphs, headings,
  character formatting, alignment, basic lists and tables with merged cells,
  links, footnotes, PNG/JPEG pictures, header, footer and comments), Excel 97-2003 `.xls` in the
  spreadsheet (values, shared strings, number formats and dates, common
  formulas including shared formulas and sheet references — others keep their
  value —, fonts, fills, alignment, merged cells, column widths, row heights)
  and PowerPoint 97-2003 `.ppt` in presentations (slides, text boxes and
  placeholders with size, bold, color, alignment and bullets, filled
  rectangles). They are read in the browser by our own small parsers
  (`src/core/cfb.ts` for the OLE container, `writer/formats/doc-import.ts`,
  `sheet/formats/xls-import.ts`, `slides/formats/ppt-import.ts`, together about
  60 kB before compression, loaded only when such a file is opened) instead of a
  LibreOffice WebAssembly build (tens of MB). Not read: text boxes, drawings,
  endnotes and tracked changes in `.doc` (the notice lists them); charts and pictures in `.xls`;
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

### Charts and mail merge

- **Insert ▸ Chart…** (also in presentations): data from an Ofimeo spreadsheet
  of the library (sheet + range) or typed into a small table; the sheet's
  chart model, options and ECharts renderer are reused
  (`src/apps/charts/`). The chart node stores the chart and a snapshot of its
  data, so collaborators see it without the source. A *linked* chart refreshes
  itself when the source spreadsheet is saved in this browser (read from
  IndexedDB: checkpoint/base plus logged cell edits; formula results come
  from the last checkpoint) and on *Update from source*. Resizable, with a
  caption. DOCX: native DrawingML chart (the sheet's `.xlsx` chart writer)
  with cached values, an embedded workbook and the picture as
  `mc:AlternateContent` fallback; read back losslessly (Word charts from their
  cache). ODT and ODP: picture. PPTX: native chart (pptxgenjs). PDF: picture.
- **Tools ▸ Mail merge…**: data from a library spreadsheet or a CSV / XLSX /
  ODS file (sheet, header row); field chips («Name») and conditional text
  (IF field = value); simple filter; record-by-record preview. Output: one
  combined Ofimeo document (page break per record), one PDF, or a ZIP of
  DOCX or PDF files named after a field. The PDF is laid out in a hidden
  same-origin frame from a temporary local document, which is deleted
  afterwards. DOCX keeps `MERGEFIELD` / `IF` fields and reads them back; ODT
  writes `text:database-display`. The chosen data is stored in the document.

### Math graphs and geometry

*Insert → Math graph…* (writer and slides) opens a lightweight graphing
calculator and geometry tool (`src/ui/mathgraph/`, loaded on first use, no
dependencies). One expression per row: functions (`y = a x^2`, `f(x) = sin(x)`,
`f'(x)`), implicit equations (`x^2 + y^2 = 9`), shaded inequalities
(`y > x - 1`), parametric and polar curves, points, and GeoGebra-style
commands (`Segment`, `Line`, `Ray`, `Circle`, `Polygon`, `Midpoint`,
`Perpendicular`, `Parallel`, `Intersect`, `Angle`, `Distance`, `Length`, `Area`,
`Slope`; Spanish, Galician, French and German names are accepted). Free letters
become sliders that can be animated. Zoom and pan, grid/axes options, trace,
roots, extrema and intersections, and a table of values; the geometry tools
build constructions that update while points are dragged. Readouts are plain
text (screen readers) and the graph is keyboard accessible.

The graph is stored as a picture (PNG, 2×) plus its construction as JSON: in the
writer an image node whose title is `ofimeo-graph:{…}` (shown as `data-graph`),
so DOCX (`docPr/@title`) and ODT (`svg:title`) keep it and re-opening restores
an editable graph; on slides an image shape (`slideGraph=1`) with the JSON in the
cell data, and in PPTX in the picture name. Everything syncs through Yjs like
other images. Double click (or Enter) edits it; viewers can open it read-only.
The expression parser is our own (`expr.ts`) instead of mathjs/JSXGraph, to keep
the bundle small; KaTeX (already bundled) renders the row previews.

### Spelling and grammar

Offline and private: checks run in a Web Worker in the browser and no text is
sent anywhere (unless a LanguageTool server is turned on, see below). Spanish,
Galician, English, French and German.

- **Spelling** (red wavy underline) with Hunspell dictionaries and our own
  checker (`src/core/spell/hunspell.ts`): stems and affix rules are kept as they are and
  affixes are stripped when a word is checked (two-level suffixes, prefixes,
  German compounds, `REP`/`MAP`/`KEY` suggestions). Loading takes 0.05–0.4 s;
  nspell, which expands every form up front, did not finish loading the
  Galician dictionary in 9 minutes (over 1 GB) and needs 7 s for French. Code
  blocks, inline code, URLs, emails, numbers, words with digits, acronyms in
  capitals and mixed-case names (`iPhone`) are skipped. The word being typed is
  underlined only once the cursor leaves it.
- **Grammar and style** (blue wavy / dotted underline): an offline rule set
  (`src/core/spell/rules/`, one file per language, each rule tagged with language and
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
- **Regional variants** (`src/core/spell/variants.ts`): Español (España, México,
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
  `src/core/spell/rules/tests.ts`: Spanish diacritic accents where only one reading is
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
- **Every app** (`src/ui/spell/`): `inline.ts` exports
  `attachSpellcheck(element, lang?)` and `spellcheckFields(root, selector)`,
  which check contenteditable elements (diagram and slide labels), `<textarea>`
  and text `<input>` fields with the same worker, without changing their
  content: underlines use the CSS Custom Highlight API, or an overlay placed
  with a hidden mirror of the field (fields have no ranges; transformed fields
  such as Excalidraw's text editor are mirrored with the same transform). Right
  click shows suggestions, *Ignore all* and *Add to dictionary*. `dialog.ts` is
  the Spelling and grammar dialog (F7) for apps whose text is in many pieces:
  an app gives a `SpellSource` (its items in order, where to start, how to
  show and replace text in one) and the dialog walks through them, showing
  where each issue is ("Sheet1 · B3", "Slide 2 · Speaker notes").
  `menu.ts` has the shared Tools entries (dialog, as-you-type toggles,
  document language, personal dictionary) and the F7 key; `service.ts` the
  shared worker, settings and the **document language**, stored in the
  document's `meta.lang` in every app. Settings and the personal dictionary
  are per browser and shared by all apps (and other tabs).
  - **Sheets**: Univer draws the cell editor on a canvas, so the underlines
    are an overlay placed with Univer's own layout (`calcDocRangePositions`);
    the dialog walks the text cells of every sheet (formulas, numbers and
    booleans skipped), selects each cell and keeps rich-text runs on change.
  - **Slides / Diagrams**: labels of every slide or page (HTML labels are
    changed without losing their markup) and speaker notes (checked as typed).
  - **Forms**: questions, descriptions and options as typed and in the
    dialog. Respondents' written answers are checked when *Settings ▸ Allow
    spell check for respondents* is on (default: on for surveys, off for
    quizzes, where it would give answers away; then the browser's checker is
    turned off too).
  - **PDF**: text boxes, one's own comments and replies.
  - **Draw**: Excalidraw's text editor as typed; the dialog changes text
    elements (dimensions are measured again).

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
- **Warn before editing** (Data ▸ Warn before editing…): ranges whose cells ask
  for a confirmation before they change (the formulas of a grading sheet, a
  header row), kept in the shared document (`sheet/warnings.ts`). It guards
  against accidents, not people: anyone with an edit link can confirm.
- **Screen readers and keyboard** (`sheet/a11y.ts`): Univer draws the grid on
  a canvas, so View ▸ Accessible table view (Alt+Shift+T, or the "Switch to
  accessible table view" skip link) mirrors the active sheet as an HTML
  `role=grid` table (aria-rowcount/colcount, windowed around the active cell
  for large sheets) with arrow keys, Ctrl+Home/End, Ctrl+Arrow, Ctrl+Page
  Up/Down between sheets, Enter/F2 editing in a text field that shows the
  formula, and a live region reading address, value and formula. Edits go
  through `FRange.setValue` (Univer's commands), so they sync, undo and are
  refused for view/comment links (read-only grid). In the canvas grid a live
  region reads the selected cell, the name box, formula bar and grid are
  labelled, and arrow keys move between sheet tabs. Charts carry a text
  summary (`charts/summary.ts`, via `aria-describedby`) and offer "Chart data
  as table". Covered by `tests/e2e/sheet-a11y.spec.ts` with axe-core.

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
- Download SVG and PNG (the selection or the whole page), a PDF of all pages
  (each sized to its page settings, `diagram/pdf.ts`, also used by drawings)
  and print.
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
  picture that keeps the data, SmartArt uses the drawing PowerPoint saves
  with it (else a box with its text), and slide transitions and the preset
  animations of the main sequence become the app's own. **Open .odp** files
  (from this app or LibreOffice Impress: text boxes, shapes, lines, pictures,
  groups, tables as one text box, backgrounds, notes, transitions and
  animations) and legacy `.ppt` (see *Legacy files*).
- **Charts** (Insert ▸ Chart…) and **math graphs**, as in the word processor.
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
- **Print** (File ▸ Print…): the form on paper, to answer by hand, never with
  the answer key (`paper.ts`).
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
- `grading.ts`: automatic and manual points, feedback
- `editor.ts`, `respond.ts`, `results.ts`, `charts.ts`, `export.ts`,
  `paper.ts`, `find.ts`, `spell.ts`, `webmcp.ts`, `app.ts`

The app uses one additive hook in core: `RoomProvider.makeAction()` in
`network.ts`.

Limitations:
- An editor must be online, or must import the response files, to collect
  responses.
- "One response per browser" is not a hard limit.
- *File → Make a copy* by an editor keeps the answer key, but a copy made
  through a template link (`…&copy=1`) does not: export and import an `.oform`
  file to pass it on.

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
  signature drawn once and kept in this browser.
- Pages: the **Page** menu and the thumbnails' context menu rotate pages
  (Ctrl+] / Ctrl+[), move them, insert blank pages and delete pages; thumbnails
  can be dragged (or moved with Alt+↑/↓). The `pdf-pages` array is the page
  map: original page index and rotation per entry, applied by the viewer and by
  both exports. Annotations belong to a page id, so they follow their page and
  turn with it; every change is undoable (deleted pages keep their annotations
  for Undo).
- Sticky notes with replies and resolving, like the writer's comments; they live
  in the comments channel, so comment links can add them.
- Collaborators' pointers are shown on the pages.
- Keyboard: V select, H highlight, U underline, K strikeout, P pen, E eraser,
  T text box, N note, R, O, L, A shapes, S stamp, G signature, Esc back to
  Select. With a creation tool chosen, Enter (or Space on the pages) places the
  annotation in the middle of the visible part of the current page; the
  Comments panel has **Add comment**. Annotations are focusable (Tab): arrows move them, Enter edits the
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
- Text in exported annotations uses Helvetica for Latin-1 text; other
  characters are drawn with embedded subsets (Type0 / Identity-H with
  ToUnicode, loaded only when needed) of Arimo (Latin Extended) and a DejaVu
  Sans symbols subset (`src/apps/pdf/fonts/`, Greek, Cyrillic, arrows, maths,
  dingbats such as ✓ ✗). CJK and emoji still become "?".
- Password-protected PDFs: the app asks for the password (Open, and whenever
  the document is opened in a new tab); cancelling adds nothing. The document
  keeps the original encrypted file — never a decrypted copy — and the password
  is never stored in the document or sent to collaborators (it is remembered in
  `sessionStorage` for the tab only), so every person enters it. Encrypted PDFs
  are exported as page images plus vector annotations, and their existing
  annotations are not imported.
- Undoing a page deletion after the pages were reordered may put the page back
  at a slightly different position (it is restored next to its old neighbours).
- PDF forms (fields) are shown but not filled in.
- Large PDFs make sharing slower: every collaborator downloads the whole file.

## Notebook (class notes)

Ofimeo Notebook (`src/apps/notebook/`) keeps class notes like OneNote:
**sections** (coloured tabs) hold **pages** with **subpages** (two levels).

- **Panel**: sections and pages side by side (a drawer on phones, opened from
  the "Sections and pages" button at the top of the page). Drag and drop
  reorders pages and sections and moves a page to another section (drop it on
  the tab); `Alt+↑`/`Alt+↓` on a focused item does the same. **Search
  notebook** (`Ctrl+F`) searches titles and text of all pages.
- **Pages**: a title, the creation date and flowing rich text with the
  writer's editor schema (headings, lists, checklists, tables, pictures, links,
  equations, code). Pasted or dropped pictures are stored in the document
  (scaled to 1600 px / JPEG when larger than 1 MB); other files become
  attachment chips (at most 5 MB each) that download on click.
- **Tags** on paragraphs and headings: To do (tickable), Important, Question,
  Remember (`Ctrl+Shift+1…4`). **Tag summary** lists them across pages and jumps
  to the paragraph.
- **Ink**: pen (width follows stylus pressure), highlighter and a stroke
  eraser over the page. The page has a fixed logical width (816 px, scaled to
  fit) so ink stays next to the text it was drawn on; "Draw with the stylus"
  lets a stylus draw while fingers and the mouse select text.
- **Collaboration**: one Yjs document; each page is an `XmlFragment`
  (`nb-page:<id>`), its strokes a `Y.Array` (`nb-ink:<id>`), sections and pages
  records in `nb-sections` / `nb-pages` with fractional `order` values. Only
  the open page is bound to an editor; collaborators' cursors and a dot per
  person in the page list show who is where. Comments per page (the writer's
  review rail on the comments map `comments:<page>`), permissions, version
  history and hand in work as in the other apps. Undo covers the page text and,
  in time order, page/section changes and ink (one step per stroke).
- **Files**: File ▸ Download as saves the whole notebook as Word, ODT, PDF
  (text PDF through the writer's print layout and PDF renderer), Markdown or a
  **ZIP of Markdown** (a folder per section, `assets/` with pictures, files and
  ink SVGs, and `notebook.json` with colours, levels and strokes); "Current
  page" and "Current section" export only those. Tags become symbols
  (☐ ☑ ★ ⁇ ☞) in exported text and are recognised again on import; ink becomes
  a picture after the page's text. Printing (`Ctrl+P`) prints the open page with
  its ink in place; File ▸ Print section… prints a section.
- **Import**: File ▸ Open… takes `.md` files or a ZIP of Markdown (folders
  become sections; an Ofimeo export comes back complete); "Import a folder of
  Markdown files…" takes a folder. OneNote `.one` files are not imported (export
  them from OneNote as Word or PDF first). The home screen does not route
  `.zip`/`.md` to the notebook (they belong to the PDF app and the writer).
- **Templates**: class notes, lab notebook, reading journal.
- **WebMCP**: `list_pages`, `get_page`, `add_page`, `append_text` (direct
  edits, one undo step each).
- **Limitations**: ink is not re-flowed when the text above it changes (as in
  OneNote); on phones the page is zoomed out to fit (zoom in from the status
  bar); undo history of a page's text starts again when you switch pages.

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
| Notebook | Class notes, lab notebook, reading journal |
| PDF | None: a PDF starts from a file (or blank pages) |

Templates are generated in code (no network) and go through each app's own
import path: HTML for documents, a workbook snapshot for spreadsheets,
`.drawio` XML for diagrams, `.excalidraw` for drawings, `.pptx` for
presentations, the form model for forms and the notebook model for notebooks. The gallery and each app's templates are separate chunks, loaded
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
  `localStorage` (`ofimeo:help:welcome`) and reopened from *Help ▸
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
- **Opt-out**: `?notour` (remembered) or `localStorage['ofimeo:help:off'] = '1'`
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
  annotations, Word for notebooks; several go into a zip, and a document that cannot be built is
  left out and named in a message). Spreadsheets are downloaded from the app.

Code: `src/core/backup.ts`, `src/core/library.ts` (folders, tags, local database),
`src/core/library-search.ts` + `library-extract.ts` + `library-search.worker.ts`,
`src/home/docs.ts`, `src/home/storage.ts`, `src/home/download.ts`.

## Import from Google Drive and Microsoft 365

**Home ▸ Import from link…** and **File ▸ Import from link…** in every app take
the share link of a Google Docs, Sheets or Slides file, a file in Google Drive,
or a OneDrive or SharePoint file (`src/core/import-link.ts` turns it into the
download URL: `…/document/d/ID/export?format=docx`, `…/spreadsheets/d/ID/export?format=xlsx`,
`…/presentation/d/ID/export/pptx`, `drive.google.com/uc?export=download&id=ID`,
SharePoint links with `download=1`, `_layouts/15/download.aspx?UniqueId=…`,
`onedrive.live.com/download?resid=…` and the OneDrive `shares` API for `1drv.ms`
links).

Browsers do not let a web page download those URLs itself (Google and
Microsoft send no CORS headers), so the import is a **guided download**:
the dialog shows the export URL as a button (other formats as links), the
person's own browser downloads the file (with their own Google or Microsoft
session if the file is not public; Ofimeo never sees it), and they drop it on
the dialog, which opens it in the right app. Drawings, forms, folders and
"Publish to the web" links of documents cannot be imported and the dialog says so.

**One-click import through a school relay (optional).** Ofimeo Relay has an
import proxy (`relay/proxy.go`), **off by default**. When a school turns it on
(`"import_proxy": {"enabled": true, "max_mb": 30}` in `ofimeo-relay.json`), the
relay advertises `"importProxy": "/ofimeo/fetch"` in `/ofimeo/config` and the
dialog adds *Import directly through the school relay*. The proxy only fetches
https URLs on Google Docs/Drive and OneDrive/SharePoint hosts (checked again
on every redirect, public Internet addresses only), sends no cookies or
credentials (so only "anyone with the link" files work), limits the size and
the number of downloads at a time, always answers with an attachment, and logs
only the host. See [docs/relay.md](docs/relay.md#import-proxy-optional).

## Offline and installable

Ofimeo is a Progressive Web App: install it from the browser (address bar
or menu → *Install*) and it works without a connection for individual work.

- A service worker precaches the suite and every app, so after the first visit
  everything works offline; the home screen shows when it is ready.
- Documents always live in the browser (IndexedDB), so creating, editing,
  opening and downloading files needs no network. Collaboration resumes by itself
  when peers are reachable again, and offline edits merge automatically.
- When installed, the app registers as a handler for `.docx`, `.odt`, `.doc`,
  `.rtf`, `.md`, `.xlsx`, `.ods`, `.xls`, `.csv`, `.tsv`, `.drawio`, `.vsdx`,
  `.excalidraw`, `.pptx`, `.odp`, `.ppt`, `.oform` and `.pdf` files ("Open
  with"). Its shortcuts (long-press or right-click the icon) start a new
  document in any of the eight apps.
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
   /var/www/ofimeo/; }`; Apache: `Alias /office /var/www/ofimeo`).
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
# 1) In the http { } block (e.g. /etc/nginx/conf.d/ofimeo-cors.conf)
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
  receive changes; offline edits merge the next time they meet. Store-and-forward
  (below) lifts this with encrypted mailboxes on a school relay or Nextcloud.

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

### Sync without being online together (store-and-forward)

Direct sync needs two people online at the same time. For the rest (a student
edits in class and continues at home, the teacher corrects at night), changes
can wait in **encrypted mailboxes**: on Ofimeo Relay (`/ofimeo/store`, files
on the relay with quotas and a 180-day expiry) and/or in a Nextcloud folder
(WebDAV). Public Nostr relays are never used for storage. Guide and threat
model: [docs/store-forward.md](docs/store-forward.md).

- Everything is encrypted in the browser (AES-256-GCM, key derived from the
  room secret in the link); a mailbox is named by the hash of the key that may
  write to it, and the relay checks an Ed25519 signature on every write, so
  view links pull but never push. Readers verify every signed change again.
- The browser pulls on open, when back online, when the tab becomes visible and
  every minute; it pushes shortly after changes (offline changes wait and go
  later) and compacts old blobs into a signed snapshot now and then.
- The status next to the save state shows *Synced to …* / *Not yet synced* /
  *Waiting to sync*; settings are in the connection test (per browser; the
  relay's `default_on` or the school config's `store` section can turn it on by
  default or forbid it). Code: `src/core/store-forward/`,
  `src/ui/store-forward.ts`, `relay/store.go`.

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

### Chat

Every app has a document chat: the speech-bubble button next to the
collaborators' avatars (or `Alt+Shift+C`) opens a side panel (a bottom sheet on
phones). A badge counts unread messages and turns red when someone mentions
you. Messages carry the author's name, colour and time; type `@` to mention
someone who is here, links open in a new tab, and the 🙂 button inserts emoji.
New messages from others are announced to screen readers (a polite live
region); `Escape` closes the panel and returns the focus to the button.

- Storage: array `chat` in `session.commentsDoc`, so it syncs in the same room,
  signed with the comment key: **edit and comment links write, view links
  only read** (documents without permission keys: everyone writes). It is kept
  in this browser with the comments and in backups, but never in versions,
  copies or exported files. At most the last 1,000 messages are kept.
- Teacher controls (edit access only, ⋯ in the panel): **Turn off chat for
  this document** (flag `disabled` in the document's `chat` map, signed with
  the edit key, so only editors can change it; while it is off the chat is
  hidden for everyone else and nothing can be sent; the setting is part of
  the document, so copies and templates keep it) and **Clear chat
  history…** (deletes every message for everyone).
- Limitation: as with comments, the comment key signs the whole comments
  channel, so a modified client with a comment link could delete messages.
  Code: `src/ui/chat.ts`.

### Hand in

The **Hand in** button (next to Share) downloads, in one click, a ZIP named
`<your name> - <title>.zip` with the document in its original formats and a
`README.txt` (title, author, date): `.odt` + `.docx` (documents), `.ods` +
`.xlsx` (spreadsheets), `.excalidraw` + `.png` (drawings), `.drawio` + PNG and
SVG of every page (diagrams), `.pptx` + a PNG of every slide (presentations),
`.oform` (forms), the PDF with editable annotations + a flattened one (PDF),
`.docx` + a ZIP of Markdown (notebooks). It then offers *Print / Save as PDF* and
*Upload to a Nextcloud share link…* (see [Nextcloud](#nextcloud)).

### Moodle

Students connect to their school's Moodle once (Moodle button on the home
screen, or **File → Moodle account…**) with their Moodle username and password.
Ofimeo gets a token from `login/token.php?service=moodle_mobile_app` (the
Moodle app's web service) and keeps only the token, the site name and the
person's name in this browser; the password is never stored. **Disconnect**
removes them.

- **Moodle tasks** (home screen, informational): the assignments of every
  course with description, files, due date / last day, status (new, draft,
  handed in), grade and feedback once released. Pending ones first by due
  date, then handed in and graded. Refresh button; the last list stays
  available offline with its time.
- **Hand in → Hand in to Moodle…** (every app, and **File → Hand in to
  Moodle…**): pick an open assignment that takes files, a format (the first one
  the assignment accepts, else the app's main format; PDF where the app exports
  it, or any file from the device), tick the submission statement if there is
  one. The file goes to `webservice/upload.php` (draft area), then
  `mod_assign_save_submission`, and `mod_assign_submit_for_grading` when the
  assignment has a submit button. Handing in again while open replaces it.
- The browser calls Moodle directly when Moodle allows it (CORS on the web
  service endpoints); otherwise the school's Ofimeo Relay can forward the calls
  (`--moodle-url`, only to that Moodle). Nothing Moodle-related goes to peers.
- Single sign-on sites (sign-in on a web page) are detected and explained;
  password sign-in only for now.
- School settings: `moodle: { url, viaRelay }` in `ofimeo.config.json`, lock
  with `locked: ["moodle"]`. Admin guide: [docs/moodle.md](docs/moodle.md).
  Code: `src/core/moodle.ts`, `src/ui/moodle.ts`, `relay/moodle.go`.

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
  `add_highlight`; drawings `get_scene`, `add_element`; notebooks
  `list_pages`, `get_page`, `add_page`, `append_text`.
- Uses the native `document.modelContext` when the browser has it, otherwise
  loads the MIT-licensed `@mcp-b/global` polyfill (only while the switch is on).

## Architecture

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

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
    library.ts       Folders and tags, local database for the search index and own templates
    library-search.ts, library-extract.ts, library-search.worker.ts
                     Content search: text extracted from the Yjs state in a worker
    library-templates.ts  Own templates (File ▸ Save as template…)
    copy.ts          Copies of documents, template links
    versions.ts      Version history, generic restore
    handin.ts        Hand in (ZIP), printing
    nextcloud.ts     Nextcloud client: accounts, diagnostics, Login Flow v2, WebDAV, share uploads
    moodle.ts        Moodle client: token sign-in, assignments, hand in; moodle-store.ts: what this browser keeps
    school-config.ts ofimeo.config.json: school settings applied before the first render, locked settings
    import-link.ts   Google / Microsoft 365 share links → download URLs
    cfb.ts           OLE compound file reader for .doc / .xls / .ppt
    idb.ts           Small IndexedDB key-value store (signed logs)
    formats.ts       Format helpers: XML, colors, units, images
    i18n.ts          UI language, t() translations; locales/ holds the es, gl, fr and de catalogs
    spell/           Spelling and grammar engine: worker.ts, checker.ts, hunspell.ts, tokenize.ts,
                     variants.ts, settings.ts, client.ts, rules/ (per language, with tests)
    store-forward/   Encrypted mailboxes on the relay or Nextcloud: index.ts (sync), crypto.ts, backends.ts
    webmcp/          AI assistants over WebMCP: switch, permission gate, registry (native or polyfill), attribution;
                     each app's tools are in apps/<app>/webmcp.ts (docs/webmcp.md)
  ui/                Shared UI so every app looks the same (the "app frame", docs/ui-frame-api.md)
    shell.ts         App frame markup: app bar, menu bar, toolbar row, status bar
    frame.ts         mountFrame(): standard menus, keys, toolbar and status bar for an app
    menus.ts         File / Edit / Help menus in one standard order
    shortcuts.ts     Common keys (Ctrl+O/S/P/F/H, Ctrl+/, F1) and the shortcuts dialog
    toolbar.ts       One-row toolbar with a "⋯" overflow menu
    statusbar.ts     Status bar: info · language · save state · zoom; zoom.ts: zoom control
    about.ts         About Ofimeo, Document details; brand.ts: the Ofimeo mark
    chrome.ts        Title, save state, presence, connection status, share dialog + QR, hand in
    chat.ts          Document chat panel
    connection.ts    Connection test dialog (verdict, checks, report, school relay setting)
    store-forward.ts Sync state next to the save state, store-and-forward settings
    versions.ts      Make a copy / Save version / Version history (File menu items)
    copylink.ts      Page shown while a template link makes a copy
    nextcloud.ts     Nextcloud dialogs: account, CORS help, file browser, save, status, hand in
    moodle.ts        Moodle account, Moodle tasks panel, Hand in to Moodle
    import-link.ts   Import from link… dialog
    school.ts        School name, logo, contacts and "Set by your school"; admin-config.ts: Help ▸ For administrators…
    accessibility.ts Accessibility panel (fonts, themes, spacing, ruler); speech.ts: read aloud and dictation
    webmcp.ts        Tools → Allow AI assistants (WebMCP) switch, explanation dialog, app bar indicator
    equation.ts      Equation editor (MathLive, lazy) and KaTeX rendering / MathML
    mathgraph/       Math graphs and geometry: expr.ts (parser), compute.ts, analysis.ts, render.ts,
                     editor.ts, describe.ts (text readouts)
    spell/           Spelling in every app: inline.ts (underlines in fields), dialog.ts (F7), menu.ts,
                     service.ts, fields.ts, describe.ts
    widgets.ts       Menus, context menus, popovers, color palette, dialogs, toasts
    tokens.css       Design tokens (colors, spacing, radii, type, layers) and the themes; base.css, edu.css…
  home/              Home screen: new document buttons, open file, documents (docs.ts: folders, tags,
                     trash, search), storage.ts (storage and backup), download.ts, my-templates.ts,
                     save-template.ts
  templates/         Template gallery (catalog, thumbnails) and template content per app (one file each)
  help/              Help center (center.ts), welcome tour and quick starts (tour.ts, prefs.ts),
                     articles/<lang>.ts
  legal/             Links to the generated legal pages and their styles
  apps/
    registry.ts      App list: name, icon, loader, supported files
    draw/            Drawing (Excalidraw + Yjs element sync, menus, spell, webmcp)
    charts/          Charts in documents and slides: dialog.ts, embedded.ts (chart + data snapshot),
                     linked.ts (refresh from the source), sheets.ts (spreadsheet data without the sheet app)
    forms/           Forms and quizzes (encrypted responses over the room, grading, results; see Forms)
    pdf/             PDF correction
      viewer.ts      pdf.js viewer (pdfjs.ts loads it): lazy pages, text layer, thumbnails, find
      editor.ts      Annotation tools, selection, keyboard, undo; render.ts: annotations as SVG
      draw.ts        Drawing primitives shared by the screen and the PDF writer
      model.ts       pdf-file / pdf-meta / pdf-pages / pdf-annots in Yjs; geometry.ts: view space
      notes.ts       Sticky notes; stamps.ts: stamps and signature
      import.ts      Existing annotations of an opened PDF; export.ts: editable or flattened PDF (pdf-lib);
                     unicode-fonts.ts + fonts/: embedded subsets for non-Latin-1 text
    notebook/        Notebook: model.ts (sections, pages, ink in Yjs), nav.ts (panel, search),
                     extensions.ts, tags.ts, ink.ts, export.ts (Word, ODT, Markdown, ZIP), pdf.ts, print.ts
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
      handles.ts     Yellow shape handles (draw.io's handle factories)
      page.ts        Page background and size, page view
      format.ts      Format panel
      export.ts      SVG / PNG rendering; pdf.ts: PDF of every page
      spell.ts       Spelling dialog over the labels of every page (and slide notes)
      shapes/        draw.io shapes, markers, perimeters, stencils and stylesheet;
                     compat.ts runs draw.io's shape code (mxGraph API) on maxGraph
      formats/       .drawio import and export, .vsdx import (loaded on demand)
    slides/          Presentations (on diagram/editor.ts)
      app.ts         Slides app: slide panel, frame, themes, layouts, text tools, menus
      model.ts       Slide sizes, themes, layouts and placeholders; per-slide settings and notes in Yjs
      render.ts      Theme styling of graphs; offscreen slide rendering to SVG
      slidelist.ts   Thumbnails panel; notes.ts: speaker notes bound to a Y.Text
      animations.ts  Animations and transitions model; animpane.ts: animation pane; player.ts: playback
      present.ts     Presenting, laser pointer, presenter view, following the presenter
      comments.ts    Comments on slides and objects
      charts.ts      Charts on slides; mathgraph.ts: math graphs on slides
      formats/       PPTX / ODP export (elements.ts turns slides into neutral elements, pptx-anim.ts
                     adds animations), PPTX / ODP / PPT import, chart.ts (PPTX charts) (loaded on demand)
    sheet/           Spreadsheet
      app.ts         Univer in the Ofimeo frame: file actions, status bar, presence, printing
      menus.ts       Menus and shortcut rows; commands.ts: Univer command id adapter
      theme.ts       Univer theme from our tokens
      univer.ts      Univer presets and locales
      charts/        Chart model, ECharts options and loader, live view, chart dialog, text summary
      pivot.ts       Pivot tables as formulas; stats.ts + functions.ts: statistics, Spanish function aliases
      warnings.ts    Data ▸ Warn before editing…
      a11y.ts        Accessible table view and screen reader support
      spell.ts       Spelling dialog over cells; spell-inline.ts: underlines in the cell editor
      sync.ts        Mutation log over Yjs, rebuilds and checkpoints
      transform.ts   Shifts concurrent edits through row/column changes
      print.ts       Print layout of the current sheet
      formats/       XLSX / ODS / CSV import and export, XLS import (loaded on demand)
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
      merge/         Mail merge: panel.ts, data.ts, run.ts, frame.ts (PDF output)
      charts.ts      Charts in documents (Insert ▸ Chart…, linked charts)
      find.ts        Find & replace
      review.ts      Comments and suggestions: highlights and the margin rail
      authorship.ts  Authorship colors and contributions per author
      ypos.ts        ProseMirror positions <-> Yjs (relative positions, item authors)
      collab.ts      Session helpers (comments channel, authors, user id)
      editor/        TipTap extensions and custom nodes (equation, chart, math graph,
                     merge fields, suggestions, comment ranges, toc.ts: table of contents)
      formats/       DOCX / ODT / Markdown import and export, DOC and RTF import (loaded on
                     demand); math.ts converts MathML / OMML / LaTeX, bibliography-xml.ts
                     Word's b:Sources, docx-charts.ts native charts
      spell/         Spelling and grammar of the word processor: plugin.ts
                     (decorations, incremental checks), ui.ts (Tools menu,
                     context menu, status), dialog.ts (F7), lang.ts (paragraph
                     language); the engine is core/spell/ and the parts shared
                     by every app are ui/spell/
relay/               Ofimeo Relay (Go, docs/relay.md); build.sh cross-compiles it
  main.go            Flags, startup, the services it runs
  config.go          ofimeo-relay.json and command-line overrides
  nostr.go           Minimal in-memory Nostr relay (signaling for Trystero)
  turnserver.go      STUN/TURN (pion/turn) with time-limited credentials
  certs.go           TLS: Let's Encrypt, the school's certificate or a local CA
  mux.go             One TLS port shared by HTTPS/WSS and TURN over TLS
  web.go             HTTPS endpoints (/ofimeo/config…); pages.go: status and help pages
  webapp.go          Serving the web app (--serve-app); embed_app.go / embed_none.go
  store.go           Store-and-forward mailboxes (/ofimeo/store)
  school.go          School configuration (--school-config) and container helpers
  moodle.go          Moodle forwarding (--moodle-url)
  proxy.go           Import proxy for share links (off by default)
  netutil.go         Local network ranges; service.go: system service (systemd, launchd, Windows)
  *_test.go          Go tests
scripts/             Build helpers: Excalidraw assets, draw.io libraries, dictionaries, legal pages,
                     third-party notices, grammar rule tests, i18n/ (catalog checks, translations)
tests/
  e2e/               Playwright specs (see Tests); helpers.ts, pdf-fixture.ts
  fixtures/          Sample files (.drawio, HTML, protected PDF)
  relay.mjs          Local Nostr relay for the tests
  moodle-mock.mjs    Mock Moodle web service for moodle.spec.ts
deploy/              nginx and Apache snippets, sample configuration
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
npm test          # grammar rule and catalog checks + end-to-end tests (build first)
```

### Tests

- `npm run test:unit`: grammar rule tests (`scripts/test-spell.mjs`) and the
  translation catalog check (`npm run i18n:check`, below).
- `npm run test:e2e`: about 80 Playwright tests in `tests/e2e/`, run against
  the production build (`vite preview`) and a local Nostr relay
  (`tests/relay.mjs`), never public relays. `E2E_RELAY_PORT` moves the test
  relay off 7790. The specs:
  - `smoke.spec.ts`: every app opens without errors, the home screen lists the
    apps and templates, the UI follows the browser language.
  - `collaboration.spec.ts`: two browsers edit the same document.
  - `files.spec.ts`: `.drawio` and HTML files open from the home screen.
  - `offline.spec.ts`: the installed app works offline.
  - `connection.spec.ts`: the connection test, a school relay from the link.
  - `library.spec.ts`: a password-protected backup restores content, versions
    and comments after clearing the browser data; the trash.
  - `home-content.spec.ts`: home Download without opening documents, content
    search in forms and PDFs.
  - `help.spec.ts`: help center search, welcome tour, quick starts.
  - `chat-import.spec.ts`: document chat between browsers (mentions, unread
    badge, view links, turning it off), the share-link parser, the Import
    from link dialog and the relay's import proxy.
  - `writer-toc-pdf.spec.ts`, `writer-merge-charts.spec.ts`,
    `writer-pdf-review.spec.ts`: table of contents and PDF export, mail merge,
    linked charts, DOCX round trips, Markdown, read-only links, PDF pages and
    passwords.
  - `math.spec.ts`: math graphs in documents and slides, geometry.
  - `sheet-charts.spec.ts`, `sheet-forms.spec.ts`, `sheet-a11y.spec.ts`:
    native charts in .xlsx/.ods, xlsx round trips, a quiz copy keeping its
    answer key, read-only sheets, the accessible table view (with axe-core).
  - `slides-diagram.spec.ts`: labels, animations and transitions through
    .pptx, .odp import, hand in, keyboard navigation of the canvas.
  - `forms.spec.ts`: one student's answers never reach another student's
    browser (see *Forms*).
  - `pdf.spec.ts`: annotations exported and reopened, two browsers annotating.
  - `notebook.spec.ts`: sections, pages, tags, ink, sync and exports.
  - `spell.spec.ts`: spelling in the sheet, slides, diagrams, forms, PDF and
    drawings.
  - `webmcp.spec.ts`: AI assistants get only the tools the link allows,
    writer changes as suggestions.
  - `deploy.spec.ts`: `ofimeo.config.json` (languages, hidden apps, templates,
    locked relay, Nextcloud and WebMCP settings), the administrators' form, the
    recommended security headers.
  - `moodle.spec.ts`: Moodle sign-in, tasks, hand in, relay forwarding, single
    sign-on (against `tests/moodle-mock.mjs`).
  - `sync.spec.ts`: store-and-forward; builds and starts the real relay when
    Go is installed (skipped otherwise) and runs a mock WebDAV server.
- `npm run i18n:check` (`scripts/i18n/check-keys.mjs`): every `t('…')` /
  `tn()` key in `src/` is present in the es, gl, fr and de catalogs with the
  same `{placeholders}` (`-v` lists the missing, unused and mismatched keys). New translations are
  added with `python3 scripts/i18n/apply-translations.py <es-gl file> <fr-de
  file>` (files of `English ||| translation ||| translation` lines, usually in
  `scripts/i18n/sources/`), which never touches existing keys.
- `cd relay && go test ./...`: Ofimeo Relay (Nostr messages and signatures,
  TURN allocations with time-limited credentials, certificates, the TLS port
  shared by HTTPS and TURN, `/ofimeo/config`, serving the app, the
  store-and-forward mailboxes, the school configuration, Moodle forwarding and
  the import proxy against local mock servers).
- GitHub Actions (`.github/workflows/ci.yml`) runs the type check, both test
  suites and the build on every pull request and on pushes to `main`, plus
  `go vet` and `go test` for the relay; the Playwright report is attached to
  failed runs. Pushing a tag `relay-v1.2.3` builds the relay for every platform
  and publishes a GitHub Release (`.github/workflows/relay-release.yml`).

## Deployment

`.github/workflows/pages.yml` builds and publishes `dist/` to GitHub Pages on
every push to `main` (enable *Settings → Pages → Source: GitHub Actions*).
The build uses relative paths, so any static host or subfolder works.

### Schools: Docker, relay and `ofimeo.config.json`

A school can host its own Ofimeo and configure it for everyone
([docs/deploy-school.md](docs/deploy-school.md), step by step for the IT department):

- **Docker**: the `Dockerfile` builds the web app and Ofimeo Relay into one small
  image (the relay serves the app over HTTPS, the Nostr relay, TURN and the
  school configuration); `docker-compose.yml` runs it with volumes for the relay
  data and the configuration, `OFIMEO_*` environment variables and a health check.
  CI builds the image (without publishing it) and checks the running container.
- **Relay program** on Windows, Linux or a Raspberry Pi with `--serve-app` and
  `--school-config`, or **any static web server** (nginx and Apache snippets with
  the right MIME types, caching and Content-Security-Policy in `deploy/`).
- **`ofimeo.config.json`** next to `index.html` (schema:
  [docs/ofimeo.config.schema.json](docs/ofimeo.config.schema.json)): school name
  and logo, default interface and document languages, school relay and other
  relays, public servers allowed or not, store-and-forward backends, Nextcloud
  servers, AI assistants (WebMCP) and AI features allowed or not, templates
  offered, hidden apps, the school's privacy contacts, and **locked** settings
  that show "Set by your school". It is applied before the first render
  (`src/core/school-config.ts`), cached for offline use, and can also come from
  the relay's `/ofimeo/config`.
- **Help ▸ For administrators…** is a form that writes the file (offline, in the browser).

## Limitations

App-specific limitations are listed with each app above (Forms, PDF correction,
Notebook, Chat); these are the general ones.

- Public Nostr relays are community-run with no guarantees; several are used at
  once.
- Without a school's Ofimeo Relay there is no TURN server, so networks that
  block direct WebRTC connections (strict firewalls, Wi-Fi client isolation)
  leave people unable to sync live; the relay's TURN (see *School networks*)
  or store-and-forward covers those cases.
- Pagination moves whole blocks (paragraphs, tables, pictures) to the next page
  or column: paragraphs are not split across pages and a block taller than a
  page overflows. Lists, quotes, tables of contents and bibliographies are
  split item by item.
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
  available render as rectangles but are kept in the file. Library images are
  not embedded in SVG/PNG downloads. draw.io math (`math=1`) and custom web
  fonts are not rendered. Visio import: see *Diagrams* (theme colors
  approximated, no EMF pictures or rotated groups).
- Presentations: PowerPoint and OpenDocument downloads turn library shapes,
  curved connectors, hand-drawn shapes and equations into pictures, and
  gradient backgrounds into a picture. PowerPoint import skips embedded media
  (audio, video) and uses the first stop of gradient fills in shapes; only the
  preset animations of the main sequence are read. The presenter view needs
  pop-ups allowed; opening it may leave full screen (use F or the ⛶ button).
- Spelling and grammar: only paragraph-level languages (not single words);
  suggestions are ranked by edit distance, without word frequencies; Harper
  covers English only and its messages are in English; the offline rules are
  deliberately few (precision over recall) and German noun capitalization is
  left to the dictionary.
- Nextcloud: one active account per browser; saving exports the whole file (no
  partial or collaborative editing of the file in Nextcloud); a file opened in
  a format the app cannot write (e.g. `.md`, `.tsv`) is saved with *Save to
  Nextcloud as…*; image formats (PNG/SVG) save the current page only. Without
  CORS configured on the server (or the same address), nothing can connect.
- Spreadsheet: the app bundle is large (~2 MB gzipped, loaded only when a sheet
  is opened). Only Univer's open-source presets are used; charts, pivot tables
  and printing are our own (ECharts charts, pivot tables as formulas, our print
  layout) and there is no Univer collaboration server (sync is the mutation
  log above). The mutation log is never pruned, so very long-lived sheets keep
  growing in storage (checkpoints keep loading fast).

## Credits

- The "More shapes" libraries are draw.io's (JGraph Ltd / draw.io AG): the
  code and palettes are Apache-2.0; the stencils and icons carry an extra
  restriction (they may not be used in, or distributed for, Atlassian products
  or its marketplace; diagrams made with them are not affected). The generated
  `diagram-libs/` folder keeps that `LICENSE` and a `NOTICE`.
- Dictionaries from [wooorm/dictionaries](https://github.com/wooorm/dictionaries),
  each under its own license and served as separate files with it
  (`dictionaries/<lang>-LICENSE.txt`): Spanish from RLA-ES / LibreOffice
  (GPL-3.0, LGPL-3.0 or MPL-1.1), Galician from hunspell-gl (GPL-3.0), English
  from SCOWL / wordlist.aspell.net (MIT and BSD), French from Grammalecte
  (MPL-2.0), German from igerman98 by Björn Jacke (GPL-2.0 or GPL-3.0).
  English grammar by Harper (Apache-2.0).
- Every production dependency and its license: `THIRD_PARTY_NOTICES.md`
  (see *Legal*).
