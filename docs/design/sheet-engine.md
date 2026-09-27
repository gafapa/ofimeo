# Spreadsheet converter spec (Words Online)

Project: /home/user/words-online (Vite + TypeScript, browser-only). The spreadsheet app uses **Univer** (open-source
presets, `@univerjs/presets` 1.0.x, Apache-2.0). Converters translate between files and Univer's workbook snapshot
`IWorkbookData` (import type from '@univerjs/presets'; read the real types in
node_modules/@univerjs/core/lib/types — `IWorkbookData`, `IWorksheetData`, `ICellData`, `IStyleData`, `CellValueType`,
`BooleanNumber`, `IRange`, `IFreeze`, `IRowData`, `IColumnData`, border/alignment enums in types/enum).

Entry point (already written, do not change its API): `src/apps/sheet/formats/index.ts`:
- `importXlsx(buf: ArrayBuffer): Promise<Partial<IWorkbookData>>` in `xlsx-import.ts`
- `exportXlsx(data: IWorkbookData): Promise<Blob>` in `xlsx-export.ts`
- `importOds(buf: ArrayBuffer): Promise<Partial<IWorkbookData>>` in `ods-import.ts`
- `exportOds(data: IWorkbookData): Promise<Blob>` in `ods-export.ts`
- `importCsv(text: string, delimiter?: string): Partial<IWorkbookData>` and `exportCsv(data: IWorkbookData, sheetId?: string): string` in `csv.ts`
  (auto-detect delimiter `,` `;` `\t` when not given; RFC 4180 quoting; export the given sheet or the first in sheetOrder;
  numbers stay numbers; formulas export their computed value `v`).

Snapshot conventions:
- Workbook `id` is set by the caller; you may use any id. Give sheets stable unique ids (e.g. `sheet-1`, `sheet-2`),
  fill `sheetOrder`, `name`, `rowCount`/`columnCount` (at least 1000×26 or larger than the used range + margin),
  `cellData` as `{ [row]: { [col]: ICellData } }` (0-based).
- Cell: `v` value, `t` CellValueType (1 string, 2 number, 3 boolean, 4 force text), `f` formula string starting with '='
  (Excel-style A1 syntax, English function names, `,` separators — Univer uses the same syntax), `s` style: put styles in
  the workbook `styles` map `{ [styleId]: IStyleData }` and reference the id from cells (dedupe identical styles).
- Styles to support both ways: font family `ff`, size `fs` (pt), bold `bl`, italic `it`, underline `ul`, strike `st`,
  font color `cl.rgb`, background `bg.rgb`, horizontal `ht` / vertical `vt` alignment, wrap `tb`, text rotation if easy,
  borders `bd` (t/b/l/r with style + color), number format `n.pattern` (e.g. '0.00', '#,##0', '0%', 'yyyy-mm-dd').
  Dates: Excel serial numbers with a date pattern (keep as numbers + pattern).
- Sheet-level: merges `mergeData: IRange[]`, column widths `columnData[i].w` (px), row heights `rowData[i].h` (px),
  hidden rows/cols (`hd: 1`), frozen panes `freeze: { xSplit, ySplit, startRow, startColumn }`, tab color `tabColor`,
  sheet hidden, `showGridlines`, `defaultColumnWidth`/`defaultRowHeight`.
- Optional stretch (only if time permits, after all of the above works): data validation lists and hyperlinks.

Fidelity: round trip file → import → export → import must be stable. Files produced by LibreOffice (and by Excel
conventions) must import correctly. Exported files must open correctly in LibreOffice (validate by converting to PDF /
CSV with `soffice --headless --convert-to ...` and inspecting).

Libraries: `exceljs` (MIT, installed) for xlsx; for ODS write your own reader/writer with JSZip + DOMParser (reuse
helpers in `src/core/formats.ts`: XML helpers attr/child/children/parseXml/escapeXml, toHex, etc.). Do not add other
dependencies without a strong reason. Code, names and comments in English; match the existing code style (no semicolons,
2 spaces, single quotes, concise comments).

App integration (already wired): opening a file from the home screen or File menu calls `importFile` in
`src/apps/sheet/index.ts`, which stores the snapshot as the shared base of a new document and navigates to it
(`#app=sheet&doc=…`). In dev builds the page exposes `window.univerAPI` (Univer facade) for tests, e.g.
`univerAPI.getActiveWorkbook().save()` returns the current IWorkbookData, and `getActiveSheet().getRange('A1:D10').getValues()`.

Testing (required):
- `npx tsc --noEmit` (only your files must be clean; other files may be mid-edit by someone else).
- Playwright (global: `require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright')`),
  Chromium preinstalled — never run `playwright install`. Start `npx vite --port <unique port> --strictPort` in the project.
  Either import your module in a page (`await import('/src/apps/sheet/formats/xlsx-import.ts')`) or drive the real app:
  open `http://localhost:<port>/?relays=ws://localhost:1` (home screen), click `.home-open` and set the file in the file
  chooser, then wait for `window.univerAPI?.getActiveWorkbook()` and check values/styles/merges through the facade.
- LibreOffice is installed: create realistic inputs (author a flat .fods or .csv/.html and convert to .xlsx/.ods with
  soffice) with multiple sheets, formulas, number formats, dates, styles, borders, merges, widths/heights, frozen panes.
- Scratch files only under (working notes) <your-name>/
- Do not commit or push. Final report: supported/unsupported features and test evidence.
