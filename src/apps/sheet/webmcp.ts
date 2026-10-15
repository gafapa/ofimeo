// WebMCP tools of the spreadsheet (see src/core/webmcp). Loaded only while the
// switch is on. Every write is one Univer command, so it is one step of the
// spreadsheet's undo history, and it is recorded as the AI assistant's in the
// version history by the core. Notes (Univer cell notes) serve as comments;
// they are part of the workbook, so only editors can add them.

import { IUndoRedoService, type FUniver, type Univer } from '@univerjs/presets'
import { t } from '../../core/i18n'
import type { FWorksheet } from '@univerjs/sheets/facade'
import type { Session } from '../../core/session'
import { aiName } from '../../core/webmcp/ai'
import type * as Y from 'yjs'
import { bool, imageResult, num, optStr, str, type AppTools, type OfimeoTool, type ToolArgs } from '../../core/webmcp/types'
import { CHART_TYPES, colName, normalizeSpec, parseA1, toA1, type ChartType } from './charts/model'
import { insertChart, listCharts } from './charts/view'

const MAX_CELLS = 20_000
const FORMULA_ERROR = /^#(DIV\/0!|REF!|NAME\?|VALUE!|N\/A|NUM!|NULL!|SPILL!|CALC!|ERROR!?)/
// render: at most this many rows and columns.
const PICTURE_ROWS = 100
const PICTURE_COLUMNS = 26
// get_spelling_issues: text cells checked.
const SPELL_CELLS = 2000
// diff_versions: cells listed.
const DIFF_CELLS = 400

interface LogEntry {
  id: string
  m: string
  p: string
}
type CellValues = Record<string, Record<string, { v?: unknown; f?: string; si?: string } | null>>
// Selections up to this size are returned with their values.
const SELECTION_CELLS = 400

interface Note {
  row: number
  col: number
  note: string
}
type NoteSheet = FWorksheet & { getNotes?: () => Note[] }
type NoteRange = { createOrUpdateNote?: (note: { note: string; width: number; height: number; show?: boolean }) => unknown }

export function sheetTools(session: Session, univerAPI: FUniver, univer?: Univer): AppTools {
  const workbook = () => {
    const wb = univerAPI.getActiveWorkbook()
    if (!wb) throw new Error('The spreadsheet is still loading')
    return wb
  }
  const sheetOf = (args: ToolArgs): FWorksheet => {
    const name = optStr(args, 'sheet')
    const wb = workbook()
    if (!name) return wb.getActiveSheet()
    const sheet = wb.getSheetByName(name)
    if (!sheet) throw new Error(`No sheet named "${name}". Sheets: ${wb.getSheets().map((s) => s.getSheetName()).join(', ')}`)
    return sheet
  }
  const sheetArg = { sheet: { type: 'string', description: 'Sheet name (default: the active sheet).' } }
  const usedRange = (s: FWorksheet) => {
    const rows = s.getLastRow() + 1
    const cols = s.getLastColumn() + 1
    if (rows < 1 || cols < 1 || (rows === 1 && cols === 1 && [null, undefined, ''].includes(s.getRange(0, 0).getValue() as never))) return null
    return toA1({ startRow: 0, startColumn: 0, endRow: rows - 1, endColumn: cols - 1 })
  }

  // Rows are numbered from 1, columns by letter (A, B, …, AA).
  const columnIndex = (value: unknown): number => {
    const text = String(value ?? '').trim().toUpperCase()
    if (/^\d+$/.test(text)) return Number(text) - 1
    if (!/^[A-Z]{1,3}$/.test(text)) throw new Error(`Invalid column "${value}"`)
    return [...text].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1
  }
  const rowIndex = (args: ToolArgs, key: string) => {
    const n = Math.round(num(args, key))
    if (n < 1) throw new Error(`${key} must be 1 or more`)
    return n - 1
  }
  const count = (args: ToolArgs) => Math.max(1, Math.min(1000, Math.round(num(args, 'count', 1))))
  const where = (args: ToolArgs) => optStr(args, 'sheet') ?? workbook().getActiveSheet().getSheetName()

  const tools: OfimeoTool[] = [
    {
      name: 'list_sheets',
      description: 'Lists the sheets: name, whether it is active, used range (A1 notation) and number of charts.',
      inputSchema: { type: 'object', properties: {} },
      access: 'view',
      execute: () => {
        const wb = workbook()
        const active = wb.getActiveSheet().getSheetId()
        const charts = listCharts(univerAPI)
        return wb.getSheets().map((s) => ({
          name: s.getSheetName(),
          active: s.getSheetId() === active,
          used_range: usedRange(s),
          charts: charts.filter((c) => c.hostSheetId === s.getSheetId()).length,
        }))
      },
    },
    {
      name: 'read_range',
      description:
        'Reads cells in A1 notation (e.g. "A1:D20"; default: the used range). Returns the values row by row, the formatted values and, where present, the formulas.',
      inputSchema: { type: 'object', properties: { range: { type: 'string', description: 'A1 range, without the sheet name.' }, ...sheetArg } },
      access: 'view',
      execute: (args) => {
        const s = sheetOf(args)
        const a1 = optStr(args, 'range') || usedRange(s)
        if (!a1) return { sheet: s.getSheetName(), range: null, values: [] }
        const r = parseA1(a1)
        if (!r) throw new Error(`Invalid range "${a1}"`)
        if ((r.endRow - r.startRow + 1) * (r.endColumn - r.startColumn + 1) > MAX_CELLS) throw new Error(`Range too large (more than ${MAX_CELLS} cells); read it in parts`)
        const range = s.getRange(toA1(r))
        const formulas = range.getFormulas()
        const hasFormulas = formulas.some((row) => row.some(Boolean))
        return {
          sheet: s.getSheetName(),
          range: toA1(r),
          values: range.getValues(),
          display: range.getDisplayValues(),
          ...(hasFormulas ? { formulas } : {}),
        }
      },
    },
    {
      name: 'write_range',
      description:
        'Writes values into cells starting at the top-left cell of "range" (e.g. "B2"). values is a 2-D array, row by row; strings starting with "=" are formulas. One undoable step.',
      inputSchema: {
        type: 'object',
        properties: {
          range: { type: 'string', description: 'Top-left cell or A1 range to fill.' },
          values: { type: 'array', items: { type: 'array', items: { type: ['string', 'number', 'boolean', 'null'] } }, description: 'Rows of cell values.' },
          ...sheetArg,
        },
        required: ['range', 'values'],
      },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Write values from {cell} in {sheet}', { cell: String(args.range ?? ''), sheet: where(args) }),
      execute: (args) => {
        const s = sheetOf(args)
        const r = parseA1(str(args, 'range'))
        if (!r) throw new Error('Invalid range')
        const values = args.values
        if (!Array.isArray(values) || !values.length || !values.every(Array.isArray)) throw new Error('values must be a non-empty array of rows')
        const rows = values as unknown[][]
        const cols = Math.max(...rows.map((row) => row.length))
        if (!cols) throw new Error('values has no columns')
        if (rows.length * cols > MAX_CELLS) throw new Error(`Too many cells (more than ${MAX_CELLS})`)
        const cells = rows.map((row) =>
          Array.from({ length: cols }, (_x, i) => {
            const v = row[i]
            if (typeof v === 'string' && v.startsWith('=') && v.length > 1) return { f: v }
            if (typeof v === 'number' || typeof v === 'boolean') return { v }
            return { v: v === null || v === undefined ? '' : String(v) }
          }),
        )
        const target = { startRow: r.startRow, startColumn: r.startColumn, endRow: r.startRow + rows.length - 1, endColumn: r.startColumn + cols - 1 }
        s.getRange(toA1(target)).setValues(cells as never)
        return { sheet: s.getSheetName(), written: toA1(target) }
      },
    },
    {
      name: 'add_sheet',
      description: 'Adds a new sheet (optionally with a name) and makes it active.',
      inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Name of the new sheet.' } } },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Add the sheet {name}', { name: String(args.name ?? '') }),
      execute: (args) => {
        const name = optStr(args, 'name')?.trim()
        const wb = workbook()
        if (name && wb.getSheetByName(name)) throw new Error(`A sheet named "${name}" already exists`)
        const sheet = wb.insertSheet(name || undefined)
        wb.setActiveSheet(sheet)
        return { name: sheet.getSheetName() }
      },
    },
    {
      name: 'insert_chart',
      description: `Inserts a chart of a cell range (first row and first column are used as labels when they hold text). Types: ${CHART_TYPES.join(', ')}.`,
      inputSchema: {
        type: 'object',
        properties: {
          range: { type: 'string', description: 'Source cells in A1 notation, e.g. "A1:C10".' },
          type: { type: 'string', enum: CHART_TYPES, description: 'Chart type. Default column.' },
          title: { type: 'string' },
          series_in: { type: 'string', enum: ['columns', 'rows'], description: 'Series in columns (default) or rows.' },
          x_title: { type: 'string' },
          y_title: { type: 'string' },
          trendline: { type: 'boolean', description: 'Scatter charts: linear trendline.' },
          ...sheetArg,
        },
        required: ['range'],
      },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Insert a chart of {range}', { range: String(args.range ?? '') }),
      execute: (args) => {
        const s = sheetOf(args)
        const r = parseA1(str(args, 'range'))
        if (!r) throw new Error('Invalid range')
        const wb = workbook()
        if (wb.getActiveSheet().getSheetId() !== s.getSheetId()) wb.setActiveSheet(s)
        const type = (optStr(args, 'type') ?? 'column') as ChartType
        if (!CHART_TYPES.includes(type)) throw new Error(`Unknown chart type "${type}"`)
        const spec = normalizeSpec({
          type,
          sheetId: s.getSheetId(),
          range: toA1(r),
          seriesIn: optStr(args, 'series_in') === 'rows' ? 'rows' : 'columns',
          title: optStr(args, 'title') ?? '',
          xTitle: optStr(args, 'x_title') ?? '',
          yTitle: optStr(args, 'y_title') ?? '',
          trendline: bool(args, 'trendline'),
        })
        const id = insertChart(univerAPI, spec)
        if (!id) throw new Error('The chart could not be inserted')
        return { id, sheet: s.getSheetName(), range: spec.range, type }
      },
    },
    {
      name: 'insert_rows',
      description: 'Inserts empty rows before row "before" (1 = first row). Formulas below are adjusted.',
      inputSchema: { type: 'object', properties: { before: { type: 'integer', minimum: 1 }, count: { type: 'integer', minimum: 1, maximum: 1000 }, ...sheetArg }, required: ['before'] },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Insert {n} rows before row {row} in {sheet}', { n: count(args), row: String(args.before), sheet: where(args) }),
      execute: (args) => {
        const s = sheetOf(args)
        s.insertRowsBefore(rowIndex(args, 'before'), count(args))
        return { sheet: s.getSheetName(), inserted: count(args) }
      },
    },
    {
      name: 'insert_columns',
      description: 'Inserts empty columns before column "before" (a letter, e.g. "C", or a number).',
      inputSchema: { type: 'object', properties: { before: { type: 'string' }, count: { type: 'integer', minimum: 1, maximum: 1000 }, ...sheetArg }, required: ['before'] },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Insert {n} columns before column {column} in {sheet}', { n: count(args), column: String(args.before), sheet: where(args) }),
      execute: (args) => {
        const s = sheetOf(args)
        s.insertColumnsBefore(columnIndex(args.before), count(args))
        return { sheet: s.getSheetName(), inserted: count(args) }
      },
    },
    {
      name: 'delete_rows',
      description: 'Deletes rows starting at row "from" (1 = first row). The user confirms it.',
      inputSchema: { type: 'object', properties: { from: { type: 'integer', minimum: 1 }, count: { type: 'integer', minimum: 1, maximum: 1000 }, ...sheetArg }, required: ['from'] },
      access: 'edit',
      changesDocument: true,
      destructive: true,
      summary: (args) => t('Delete {n} rows from row {row} in {sheet}', { n: count(args), row: String(args.from), sheet: where(args) }),
      execute: (args) => {
        const s = sheetOf(args)
        s.deleteRows(rowIndex(args, 'from'), count(args))
        return { sheet: s.getSheetName(), deleted: count(args) }
      },
    },
    {
      name: 'delete_columns',
      description: 'Deletes columns starting at column "from" (a letter or a number). The user confirms it.',
      inputSchema: { type: 'object', properties: { from: { type: 'string' }, count: { type: 'integer', minimum: 1, maximum: 1000 }, ...sheetArg }, required: ['from'] },
      access: 'edit',
      changesDocument: true,
      destructive: true,
      summary: (args) => t('Delete {n} columns from column {column} in {sheet}', { n: count(args), column: String(args.from), sheet: where(args) }),
      execute: (args) => {
        const s = sheetOf(args)
        s.deleteColumns(columnIndex(args.from), count(args))
        return { sheet: s.getSheetName(), deleted: count(args) }
      },
    },
    {
      name: 'clear_range',
      description: 'Clears cells: their contents (default), their formats, or both ("all"). The user confirms it.',
      inputSchema: { type: 'object', properties: { range: { type: 'string' }, what: { type: 'string', enum: ['contents', 'formats', 'all'] }, ...sheetArg }, required: ['range'] },
      access: 'edit',
      changesDocument: true,
      destructive: true,
      summary: (args) => t('Clear {range} in {sheet}', { range: String(args.range ?? ''), sheet: where(args) }),
      execute: (args) => {
        const s = sheetOf(args)
        const r = parseA1(str(args, 'range'))
        if (!r) throw new Error('Invalid range')
        const range = s.getRange(toA1(r))
        const what = optStr(args, 'what') ?? 'contents'
        if (what === 'all') range.clear()
        else if (what === 'formats') range.clearFormat()
        else range.clearContent()
        return { sheet: s.getSheetName(), cleared: toA1(r), what }
      },
    },
    {
      name: 'rename_sheet',
      description: 'Renames a sheet.',
      inputSchema: { type: 'object', properties: { ...sheetArg, name: { type: 'string', description: 'New name.' } }, required: ['name'] },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Rename the sheet {sheet} to {name}', { sheet: where(args), name: String(args.name ?? '') }),
      execute: (args) => {
        const s = sheetOf(args)
        const name = str(args, 'name').trim()
        if (!name) throw new Error('Empty name')
        const other = workbook().getSheetByName(name)
        if (other && other.getSheetId() !== s.getSheetId()) throw new Error(`A sheet named "${name}" already exists`)
        s.setName(name)
        return { name: s.getSheetName() }
      },
    },
    {
      name: 'duplicate_sheet',
      description: 'Copies a sheet (with its data and formats) and makes the copy active.',
      inputSchema: { type: 'object', properties: { ...sheetArg } },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Duplicate the sheet {sheet}', { sheet: where(args) }),
      execute: (args) => {
        const wb = workbook()
        const copy = wb.duplicateSheet(sheetOf(args))
        wb.setActiveSheet(copy)
        return { name: copy.getSheetName() }
      },
    },
    {
      name: 'delete_sheet',
      description: 'Deletes a sheet (not the last one). The user confirms it.',
      inputSchema: { type: 'object', properties: { ...sheetArg }, required: ['sheet'] },
      access: 'edit',
      changesDocument: true,
      destructive: true,
      summary: (args) => t('Delete the sheet {sheet}', { sheet: where(args) }),
      execute: (args) => {
        const wb = workbook()
        if (wb.getSheets().length <= 1) throw new Error('The last sheet cannot be deleted')
        const s = sheetOf(args)
        const name = s.getSheetName()
        if (!wb.deleteSheet(s)) throw new Error('The sheet could not be deleted')
        return { deleted: name }
      },
    },
    {
      name: 'list_formula_errors',
      description: 'Lists the cells of every sheet whose formula gives an error (#DIV/0!, #REF!, #NAME?, #VALUE!, #N/A…): sheet, cell, error and formula.',
      inputSchema: { type: 'object', properties: {} },
      access: 'view',
      execute: () => {
        const errors: { sheet: string; cell: string; error: string; formula: string }[] = []
        for (const s of workbook().getSheets()) {
          const a1 = usedRange(s)
          const r = a1 && parseA1(a1)
          if (!r || (r.endRow - r.startRow + 1) * (r.endColumn - r.startColumn + 1) > MAX_CELLS) continue
          const range = s.getRange(a1)
          const display = range.getDisplayValues()
          const formulas = range.getFormulas()
          display.forEach((row, i) =>
            row.forEach((value, j) => {
              if (formulas[i]?.[j] && FORMULA_ERROR.test(String(value))) errors.push({ sheet: s.getSheetName(), cell: `${colName(r.startColumn + j)}${r.startRow + i + 1}`, error: String(value), formula: formulas[i][j] })
            }),
          )
        }
        return { count: errors.length, errors: errors.slice(0, 500) }
      },
    },
    {
      name: 'list_comments',
      description: 'Lists the cell notes (comments) of every sheet: sheet, cell and text.',
      inputSchema: { type: 'object', properties: {} },
      access: 'view',
      execute: () =>
        workbook()
          .getSheets()
          .flatMap((s) => ((s as NoteSheet).getNotes?.() ?? []).map((n) => ({ sheet: s.getSheetName(), cell: toA1({ startRow: n.row, startColumn: n.col, endRow: n.row, endColumn: n.col }), text: n.note }))),
    },
    {
      name: 'add_comment',
      description: 'Adds a note (comment) to a cell, signed as the AI assistant. Notes are part of the spreadsheet, so this needs edit access. Replaces an existing note of that cell.',
      inputSchema: {
        type: 'object',
        properties: { cell: { type: 'string', description: 'Cell in A1 notation, e.g. "C4".' }, text: { type: 'string' }, ...sheetArg },
        required: ['cell', 'text'],
      },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Add a note to {cell}', { cell: String(args.cell ?? '') }),
      execute: (args) => {
        const s = sheetOf(args)
        const r = parseA1(str(args, 'cell'))
        if (!r) throw new Error('Invalid cell')
        const text = str(args, 'text').trim()
        if (!text) throw new Error('Empty comment')
        const range = s.getRange(r.startRow, r.startColumn) as unknown as NoteRange
        if (!range.createOrUpdateNote) throw new Error('Notes are not available')
        range.createOrUpdateNote({ note: `${aiName(session)}: ${text}`, width: 220, height: 100 })
        return { cell: toA1({ ...r, endRow: r.startRow, endColumn: r.startColumn }) }
      },
    },
  ]

  return {
    tools,
    group: async (fn) => {
      const undo = univer?.__getInjector().get(IUndoRedoService)
      const batch = undo?.__tempBatchingUndoRedo(workbook().getId())
      try {
        return await fn()
      } finally {
        batch?.dispose()
      }
    },
    selection: () => {
      const s = workbook().getActiveSheet()
      const range = s.getSelection()?.getActiveRange()
      if (!range) return { kind: 'none', sheet: s.getSheetName() }
      const a1 = range.getA1Notation()
      const r = parseA1(a1)
      const cells = r ? (r.endRow - r.startRow + 1) * (r.endColumn - r.startColumn + 1) : 0
      return {
        kind: 'cells',
        sheet: s.getSheetName(),
        range: a1,
        ...(cells && cells <= SELECTION_CELLS ? { values: range.getValues(), formulas: range.getFormulas() } : { cells }),
      }
    },
    render: async (args) => {
      const s = sheetOf(args)
      const a1 = optStr(args, 'range') || usedRange(s) || 'A1:J20'
      const r = parseA1(a1)
      if (!r) throw new Error(`Invalid range "${a1}"`)
      const range = { ...r, endRow: Math.min(r.endRow, r.startRow + PICTURE_ROWS - 1), endColumn: Math.min(r.endColumn, r.startColumn + PICTURE_COLUMNS - 1) }
      const { cellsToPng } = await import('../../core/webmcp/render')
      const cells = s.getRange(toA1(range))
      const values = cells.getDisplayValues()
      const columns = Array.from({ length: range.endColumn - range.startColumn + 1 }, (_x, i) => colName(range.startColumn + i))
      const rows = Array.from({ length: range.endRow - range.startRow + 1 }, (_x, i) => range.startRow + i + 1)
      const backgrounds = (cells as unknown as { getBackgrounds?: () => string[][] }).getBackgrounds?.()
      const blob = await cellsToPng({ columns, rows, values, background: backgrounds?.map((row) => row.map((c) => (c && c !== '#fff' && c !== '#ffffff' ? c : null))) })
      return imageResult(blob, `${s.getSheetName()}!${toA1(range)}${toA1(range) !== toA1(r) ? ` (first ${PICTURE_ROWS} rows and ${PICTURE_COLUMNS} columns of ${a1})` : ''}`)
    },
    renderSchema: { range: { type: 'string', description: 'A1 range (default: the used range; at most 100 rows × 26 columns).' }, ...sheetArg },
    // The workbook is a base plus a log of changes: what changed is the log
    // entries that one state has and the other does not.
    diff: (before: Y.Doc, after: Y.Doc) => {
      const seen = new Set(before.getArray<LogEntry>('sheet-ops').toArray().map((e) => e.id))
      const added = after.getArray<LogEntry>('sheet-ops').toArray().filter((e) => !seen.has(e.id))
      const wb = univerAPI.getActiveWorkbook()
      const sheetName = (id: unknown) => (typeof id === 'string' && wb?.getSheetBySheetId(id)?.getSheetName()) || String(id ?? '')
      const cells: string[] = []
      const other = new Map<string, number>()
      for (const entry of added) {
        let params: Record<string, unknown> = {}
        try {
          params = JSON.parse(entry.p)
        } catch {
          // Unreadable entry: counted below.
        }
        if (entry.m === 'sheet.mutation.set-range-values' && params.cellValue) {
          for (const [row, cols] of Object.entries(params.cellValue as CellValues)) {
            for (const [col, value] of Object.entries(cols ?? {})) {
              if (cells.length >= DIFF_CELLS) break
              const a1 = `${sheetName(params.subUnitId)}!${colName(Number(col))}${Number(row) + 1}`
              cells.push(value && (value.f || value.v !== undefined) ? `${a1} = ${value.f ?? JSON.stringify(value.v)}` : `${a1} (format or cleared)`)
            }
          }
        } else {
          const name = entry.m.replace(/^sheet\.mutation\./, '')
          other.set(name, (other.get(name) ?? 0) + 1)
        }
      }
      if (after.getMap('sheet').get('base') !== before.getMap('sheet').get('base')) other.set('whole workbook replaced (restored version or import)', 1)
      return { changes: added.length, cells, ...(cells.length >= DIFF_CELLS ? { truncated: true } : {}), other: Object.fromEntries(other) }
    },
    paragraphs: () => {
      const parts: { where: string; text: string; context: 'table' }[] = []
      for (const s of workbook().getSheets()) {
        const a1 = usedRange(s)
        const r = a1 && parseA1(a1)
        if (!r) continue
        const values = s.getRange(a1).getValues()
        const formulas = s.getRange(a1).getFormulas()
        values.forEach((row, i) =>
          row.forEach((v, j) => {
            if (parts.length < SPELL_CELLS && typeof v === 'string' && /\p{L}{2}/u.test(v) && !formulas[i]?.[j]) parts.push({ where: `${s.getSheetName()}!${colName(r.startColumn + j)}${r.startRow + i + 1}`, text: v, context: 'table' })
          }),
        )
      }
      return parts
    },
    accessibility: () =>
      listCharts(univerAPI)
        .filter((c) => !c.spec.title.trim())
        .map((c) => ({
          where: `chart of ${c.spec.range} on ${workbook().getSheets().find((s) => s.getSheetId() === c.hostSheetId)?.getSheetName() ?? ''}`,
          problem: 'The chart has no title: screen readers and people reading a printout cannot tell what it shows.',
        })),
    show: (args) => {
      const s = sheetOf(args)
      const r = parseA1(str(args, 'range'))
      if (!r) throw new Error('Invalid range')
      const wb = workbook()
      if (wb.getActiveSheet().getSheetId() !== s.getSheetId()) wb.setActiveSheet(s)
      s.getRange(toA1(r)).activate()
      return { shown: true, sheet: s.getSheetName(), range: toA1(r) }
    },
    showSchema: { range: { type: 'string', description: 'A1 range to select, e.g. "B2:D9".' }, ...sheetArg },
    info: () => {
      const wb = univerAPI.getActiveWorkbook()
      return {
        sheets: wb?.getSheets().map((s) => s.getSheetName()) ?? [],
        active_sheet: wb?.getActiveSheet().getSheetName(),
        charts: listCharts(univerAPI).length,
        ai_changes: session.canEdit ? 'Each change is one undo step (Edit ▸ Undo) and is recorded as the AI assistant’s in the version history.' : 'none (read-only)',
      }
    },
  }
}
