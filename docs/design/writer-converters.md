# Converter spec (Words Online, TipTap migration)

Project: /home/user/words-online (Vite + TypeScript, browser-only app). The editor moved from Quill to TipTap v3
(ProseMirror). Converters must translate between Word/ODT files and ProseMirror JSON (`JSONContent` from `@tiptap/core`).

Read first: `src/formats/types.ts` (DocumentData, PageSettings, sizes), `src/formats/util.ts` (XML/image helpers — reuse them),
`src/editor/nodes.ts` and `src/editor/extensions.ts` (the schema). Previous Quill-based converters are in git history for
reference (`git show HEAD:src/formats/docx.ts`, `docx-import.ts`, `odt.ts`, `odt-import.ts`, `model.ts`); they worked and were
validated with LibreOffice — reuse their techniques (JSZip, `docx` library, DOMParser, style chains, numbering, rels, images).

## API to implement
```ts
export type ImportedDocument = Omit<DocumentData, 'title'>   // page = DEFAULT_PAGE when not found
exportDocx(data: DocumentData): Promise<Blob>        // src/formats/docx-export.ts
importDocx(file: ArrayBuffer): Promise<ImportedDocument>  // src/formats/docx-import.ts
exportOdt(data: DocumentData): Promise<Blob>         // src/formats/odt-export.ts
importOdt(file: ArrayBuffer): Promise<ImportedDocument>   // src/formats/odt-import.ts
```
Put `ImportedDocument` in `src/formats/types.ts` only if missing (coordinate: add exactly
`export type ImportedDocument = Omit<DocumentData, 'title'>` at the end of the file).
Do NOT edit files outside your own converter files (+ that one line). Code, names and comments in English.
Match the existing code style (no semicolons, 2 spaces, single quotes, concise comments).

## ProseMirror JSON schema (node types and attrs)
Block nodes (doc.content):
- `paragraph` attrs: `textAlign` ('left'|'center'|'right'|'justify'|null), `indent` (int 0..8, 1 level = 1.27 cm),
  `lineHeight` (string multiplier like '1.15', '1.5', '2', or null), `styleId` (null | 'title' | 'subtitle')
- `heading` attrs: `level` 1..6, `textAlign`, `indent`, `lineHeight`
- `bulletList` → `listItem`*; `orderedList` attrs `start` (int, default 1), `type` (may exist; ignore) → `listItem`*
- `listItem` content: `paragraph` followed by optional blocks (nested `bulletList`/`orderedList`, more paragraphs)
- `taskList` → `taskItem` attrs `checked` (bool); taskItem content like listItem
- `blockquote` content: blocks
- `codeBlock` attrs `language` (null); content: text only (newlines inside text)
- `horizontalRule`
- `pageBreak` (atom)
- `table` → `tableRow`* → (`tableCell` | `tableHeader`)* with attrs `colspan` (1), `rowspan` (1),
  `colwidth` (number[] | null, pixels at 96dpi, one entry per spanned column), `backgroundColor` (css color | null);
  cell content: one or more blocks (paragraphs, lists…). Header cells = `tableHeader`.
Inline nodes:
- `text` with `marks`
- `hardBreak` (soft line break)
- `image` attrs `src` (data: URL or http), `alt`, `title`, `width` (px number|null), `height` (px number|null) — inline
- `footnote` attrs `content` (plain text of the note) — footnote reference; number is implicit by order
- `pageNumber` attrs `kind` ('page' | 'total') — only in header/footer docs
Marks:
- `bold`, `italic`, `underline`, `strike`, `code`, `subscript`, `superscript`
- `link` attrs `href` (+ target/rel may exist; ignore)
- `textStyle` attrs `color` (css color '#rrggbb'), `fontFamily` (font name string, e.g. 'Times New Roman'),
  `fontSize` (string with pt unit, e.g. '14pt')  — omit attrs that are null
- `highlight` attrs `color` ('#rrggbb')

Documents: `{ type: 'doc', content: [...] }`. Header/footer are separate docs (same schema, usually paragraphs with
`pageNumber`), or null when absent. `page`: size A4/A5/Letter/Legal (pick nearest by dimensions, ±3mm; default A4),
orientation, margins in mm.

Default body font: Calibri 11pt (`DEFAULT_FONT`, `DEFAULT_FONT_SIZE_PT`); heading sizes in `HEADING_SIZES_PT`; title/subtitle sizes.
On import, do not emit `fontFamily`/`fontSize` equal to the document default (avoid noise on every run); do not emit style-
inherited formatting for headings/title (they carry their own look).

## Fidelity requirements
Export and import (both directions): headings 1-6, Title/Subtitle styles, bold/italic/underline/strike/sub/superscript,
code (monospace), text color, highlight/shading, font family, font size (pt), alignment, indent, line spacing,
bullet/ordered (with start)/task lists incl. nesting, blockquote, code block, horizontal rule, page break, links, inline images
(with size), tables with header rows, colspan/rowspan (merged cells), column widths, cell background, multi-paragraph and
list content inside cells, footnotes (real Word footnotes / ODF text:note), header and footer with page number & page count
fields, page size/orientation/margins. hardBreak ↔ w:br / text:line-break.
Round trip must be stable: export → import gives the same JSON (modulo harmless defaults). Import of files produced by
LibreOffice (and by typical Word conventions) must work.

## Testing (required before you finish)
- Type-check: `npx tsc --noEmit` (only your files must be clean; other files may be mid-rewrite by someone else — ignore
  errors outside your files).
- Browser tests with Playwright (global install: `require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright')`),
  Chromium preinstalled — never run `playwright install`. Start `npx vite --port <unique port> --strictPort` in the project
  and in a page do `await page.evaluate(async () => { const m = await import('/src/formats/docx-export.ts'); ... })`.
  Transfer files as base64 between Node and the page.
- LibreOffice is installed (`soffice --headless --convert-to pdf|docx|odt ...`): validate that your exported files open and
  render correctly (convert to PDF and read it), and create realistic input files with LibreOffice (e.g. author a flat
  .fodt or .html and convert to .docx/.odt) including footnotes, header/footer with page numbers, merged cells, lists,
  images, landscape/Letter pages.
- Write test scripts/files only under your scratchpad dir: (working notes) <your-name>/
- Do not commit or push. Report: what is supported, what is not, test evidence (round-trip results, LibreOffice checks).
