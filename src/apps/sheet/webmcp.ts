/* eslint-disable @typescript-eslint/no-explicit-any */
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
const CONDITIONS = ['greater_than', 'less_than', 'between', 'equal_to', 'text_contains', 'empty', 'not_empty', 'duplicate', 'unique']
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
  // Several facade calls as one undo step.
  const group = univer
    ? async <T>(fn: () => Promise<T>): Promise<T> => {
        const batch = univer.__getInjector().get(IUndoRedoService).__tempBatchingUndoRedo(workbook().getId())
        try {
          return await fn()
        } finally {
          batch.dispose()
        }
      }
    : null

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
      name: 'format_range',
      description: 'Formats cells: bold, italic, font_color, background, font_size, number_format (e.g. "0.00", "#,##0", "0%", "dd/mm/yyyy"), align (left, center, right), wrap. One undo step.',
      inputSchema: {
        type: 'object',
        properties: {
          range: { type: 'string' },
          bold: { type: 'boolean' },
          italic: { type: 'boolean' },
          font_color: { type: 'string' },
          background: { type: 'string' },
          font_size: { type: 'number' },
          number_format: { type: 'string' },
          align: { type: 'string', enum: ['left', 'center', 'right'] },
          wrap: { type: 'boolean' },
          ...sheetArg,
        },
        required: ['range'],
      },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Format {range} in {sheet}', { range: String(args.range ?? ''), sheet: where(args) }),
      execute: async (args) => {
        const s = sheetOf(args)
        const r = parseA1(str(args, 'range'))
        if (!r) throw new Error('Invalid range')
        const range = s.getRange(toA1(r))
        const done: string[] = []
        const apply = (key: string, fn: () => unknown) => {
          if (args[key] === undefined) return
          fn()
          done.push(key)
        }
        await (group ?? ((fn: () => Promise<unknown>) => fn()))(async () => {
          apply('bold', () => range.setFontWeight(args.bold ? 'bold' : 'normal'))
          apply('italic', () => range.setFontStyle(args.italic ? 'italic' : 'normal'))
          apply('font_color', () => range.setFontColor(String(args.font_color)))
          apply('background', () => range.setBackground(String(args.background)))
          apply('font_size', () => range.setFontSize(Math.max(6, Math.min(96, Number(args.font_size)))))
          apply('number_format', () => range.setNumberFormat(String(args.number_format)))
          apply('align', () => range.setHorizontalAlignment(String(args.align) as never))
          apply('wrap', () => range.setWrap(!!args.wrap))
        })
        if (!done.length) throw new Error('Nothing to format')
        return { range: toA1(r), formatted: done }
      },
    },
    {
      name: 'sort_range',
      description: 'Sorts the rows of a range by one column (a letter inside the range), ascending (default) or descending; with has_header the first row stays on top. One undo step.',
      inputSchema: {
        type: 'object',
        properties: { range: { type: 'string' }, column: { type: 'string' }, ascending: { type: 'boolean' }, has_header: { type: 'boolean' }, ...sheetArg },
        required: ['range', 'column'],
      },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Sort {range} by column {column}', { range: String(args.range ?? ''), column: String(args.column ?? '') }),
      execute: (args) => {
        const s = sheetOf(args)
        const r = parseA1(str(args, 'range'))
        if (!r) throw new Error('Invalid range')
        const column = columnIndex(args.column)
        if (column < r.startColumn || column > r.endColumn) throw new Error('The column must be inside the range')
        const body = { ...r, startRow: r.startRow + (bool(args, 'has_header') ? 1 : 0) }
        if (body.startRow > body.endRow) throw new Error('Nothing to sort')
        s.getRange(toA1(body)).sort({ column, ascending: args.ascending !== false })
        return { sorted: toA1(body), by: colName(column), ascending: args.ascending !== false }
      },
    },
    {
      name: 'freeze',
      description: 'Freezes the first rows and/or columns of a sheet (0 unfreezes).',
      inputSchema: { type: 'object', properties: { rows: { type: 'integer', minimum: 0 }, columns: { type: 'integer', minimum: 0 }, ...sheetArg } },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Freeze {rows} rows and {columns} columns', { rows: String(args.rows ?? 0), columns: String(args.columns ?? 0) }),
      execute: (args) => {
        const s = sheetOf(args)
        if (args.rows === undefined && args.columns === undefined) throw new Error('Give rows and/or columns')
        if (args.rows !== undefined) s.setFrozenRows(Math.max(0, Math.round(num(args, 'rows'))))
        if (args.columns !== undefined) s.setFrozenColumns(Math.max(0, Math.round(num(args, 'columns'))))
        return { sheet: s.getSheetName(), rows: args.rows ?? null, columns: args.columns ?? null }
      },
    },
    {
      name: 'add_conditional_format',
      description:
        'Highlights cells of a range that meet a condition: when = greater_than, less_than, between, equal_to, text_contains, empty, not_empty, duplicate, unique (value, value2 for between); with background, font_color and/or bold.',
      inputSchema: {
        type: 'object',
        properties: {
          range: { type: 'string' },
          when: { type: 'string', enum: CONDITIONS },
          value: { type: ['number', 'string'] },
          value2: { type: 'number' },
          background: { type: 'string' },
          font_color: { type: 'string' },
          bold: { type: 'boolean' },
          ...sheetArg,
        },
        required: ['range', 'when'],
      },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Highlight cells of {range}', { range: String(args.range ?? '') }),
      execute: (args) => {
        const s = sheetOf(args) as FWorksheet & { newConditionalFormattingRule?: () => any; addConditionalFormattingRule?: (rule: unknown) => unknown }
        if (!s.newConditionalFormattingRule || !s.addConditionalFormattingRule) throw new Error('Conditional formatting is not available')
        const r = parseA1(str(args, 'range'))
        if (!r) throw new Error('Invalid range')
        const value = Number(args.value)
        let rule: any = s.newConditionalFormattingRule()
        switch (str(args, 'when')) {
          case 'greater_than': rule = rule.whenNumberGreaterThan(value); break
          case 'less_than': rule = rule.whenNumberLessThan(value); break
          case 'between': rule = rule.whenNumberBetween(value, num(args, 'value2')); break
          case 'equal_to': rule = typeof args.value === 'number' ? rule.whenNumberEqualTo(value) : rule.whenTextEqualTo(String(args.value ?? '')); break
          case 'text_contains': rule = rule.whenTextContains(String(args.value ?? '')); break
          case 'empty': rule = rule.whenCellEmpty(); break
          case 'not_empty': rule = rule.whenCellNotEmpty(); break
          case 'duplicate': rule = rule.setDuplicateValues(); break
          case 'unique': rule = rule.setUniqueValues(); break
          default: throw new Error(`Unknown condition "${String(args.when)}"`)
        }
        rule = rule.setRanges([s.getRange(toA1(r)).getRange()])
        if (!args.background && !args.font_color && args.bold === undefined) rule = rule.setBackground('#fce8b2')
        if (args.background) rule = rule.setBackground(String(args.background))
        if (args.font_color) rule = rule.setFontColor(String(args.font_color))
        if (args.bold !== undefined) rule = rule.setBold(!!args.bold)
        s.addConditionalFormattingRule(rule.build())
        return { range: toA1(r), when: args.when }
      },
    },
    {
      name: 'create_pivot',
      description:
        'Makes a pivot table (kept up to date with Data ▸ Refresh pivot tables) from a source range with a header row: rows (a header), optional columns (a header), values (a header), agg (SUM, AVERAGE, COUNT, MIN, MAX), placed in a new sheet (default) or at a cell.',
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'A1 range with the header row.' },
          rows: { type: 'string' },
          columns: { type: 'string' },
          values: { type: 'string' },
          agg: { type: 'string', enum: ['SUM', 'AVERAGE', 'COUNT', 'MIN', 'MAX'] },
          at: { type: 'string', description: 'Top-left cell on the source sheet (default: a new sheet).' },
          ...sheetArg,
        },
        required: ['source', 'rows', 'values'],
      },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Make a pivot table of {range}', { range: String(args.source ?? '') }),
      execute: async (args) => {
        const s = sheetOf(args)
        const src = parseA1(str(args, 'source'))
        if (!src || src.endRow <= src.startRow) throw new Error('The source needs a header row and data')
        const header = s.getRange(src.startRow, src.startColumn, 1, src.endColumn - src.startColumn + 1).getValues()[0].map((v) => String(v ?? ''))
        for (const key of ['rows', 'columns', 'values'] as const) {
          const v = optStr(args, key)
          if (v && !header.includes(v)) throw new Error(`"${v}" is not a header of the source (${header.join(', ')})`)
        }
        const [{ writePivot }, { uniqueSheetName }] = await Promise.all([import('./pivot'), import('./stats')])
        const agg = (optStr(args, 'agg') ?? 'SUM').toUpperCase()
        if (!['SUM', 'AVERAGE', 'COUNT', 'MIN', 'MAX'].includes(agg)) throw new Error('agg must be SUM, AVERAGE, COUNT, MIN or MAX')
        const spec = { v: 1 as const, sourceSheetId: s.getSheetId(), source: toA1(src), rows: str(args, 'rows'), columns: optStr(args, 'columns') ?? '', values: str(args, 'values'), agg: agg as never, filter: '' }
        const wb = workbook()
        let target = s
        let at = { row: 0, col: 0 }
        const cell = optStr(args, 'at')
        if (cell) {
          const c = parseA1(cell)
          if (!c) throw new Error('Invalid cell')
          at = { row: c.startRow, col: c.startColumn }
        } else target = wb.insertSheet(uniqueSheetName(univerAPI, t('Pivot table')))
        if (!writePivot(univerAPI, target, at, spec)) throw new Error('The pivot table could not be made')
        target.activate()
        return { sheet: target.getSheetName(), at: `${colName(at.col)}${at.row + 1}` }
      },
    },
    {
      name: 'find',
      description: 'Finds cells whose value or formula contains a text (case-insensitive) in every sheet: up to 200 cells with their value.',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      access: 'view',
      execute: (args) => {
        const query = str(args, 'query').toLowerCase()
        if (!query) throw new Error('Empty query')
        const found: { sheet: string; cell: string; value: string; formula?: string }[] = []
        for (const s of workbook().getSheets()) {
          const a1 = usedRange(s)
          const r = a1 && parseA1(a1)
          if (!r || (r.endRow - r.startRow + 1) * (r.endColumn - r.startColumn + 1) > MAX_CELLS) continue
          const range = s.getRange(a1)
          const display = range.getDisplayValues()
          const formulas = range.getFormulas()
          display.forEach((row, i) =>
            row.forEach((value, j) => {
              const formula = formulas[i]?.[j]
              if (found.length < 200 && (String(value).toLowerCase().includes(query) || formula?.toLowerCase().includes(query))) found.push({ sheet: s.getSheetName(), cell: `${colName(r.startColumn + j)}${r.startRow + i + 1}`, value: String(value), ...(formula ? { formula } : {}) })
            }),
          )
        }
        return { count: found.length, cells: found }
      },
    },
    {
      name: 'describe_range',
      description: 'Descriptive statistics of each column of a range (A1, default: the used range; the first row is taken as headers when it holds text): count, mean, median, min, max, standard deviation, sum, and for text columns the most frequent values.',
      inputSchema: { type: 'object', properties: { range: { type: 'string' }, ...sheetArg } },
      access: 'view',
      execute: (args) => {
        const s = sheetOf(args)
        const a1 = optStr(args, 'range') || usedRange(s)
        const r = a1 && parseA1(a1)
        if (!r) throw new Error('The sheet is empty or the range is invalid')
        if ((r.endRow - r.startRow + 1) * (r.endColumn - r.startColumn + 1) > MAX_CELLS) throw new Error(`Range too large (more than ${MAX_CELLS} cells)`)
        const values = s.getRange(toA1(r)).getValues()
        const header = values[0]?.some((v) => typeof v === 'string' && v.trim() && Number.isNaN(Number(v))) ? values[0] : null
        const rows = header ? values.slice(1) : values
        const columns = (values[0] ?? []).map((_v, j) => {
          const column = rows.map((row) => row[j]).filter((v) => v !== null && v !== undefined && v !== '')
          const numbers = column.map((v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() && !Number.isNaN(Number(v)) ? Number(v) : NaN)).filter((v) => Number.isFinite(v)) as number[]
          const name = header ? String(header[j] ?? '') : colName(r.startColumn + j)
          if (numbers.length && numbers.length >= column.length / 2) {
            const sorted = [...numbers].sort((x, y) => x - y)
            const sum = numbers.reduce((x, y) => x + y, 0)
            const mean = sum / numbers.length
            const mid = sorted.length >> 1
            const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
            const sd = Math.sqrt(numbers.reduce((x, y) => x + (y - mean) ** 2, 0) / Math.max(1, numbers.length - 1))
            const round = (n: number) => Math.round(n * 1e4) / 1e4
            return { column: colName(r.startColumn + j), name, count: numbers.length, mean: round(mean), median: round(median), min: sorted[0], max: sorted[sorted.length - 1], sd: round(sd), sum: round(sum) }
          }
          const counts = new Map<string, number>()
          for (const v of column) counts.set(String(v), (counts.get(String(v)) ?? 0) + 1)
          return { column: colName(r.startColumn + j), name, count: column.length, distinct: counts.size, top: [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([value, n]) => ({ value, n })) }
        })
        return { sheet: s.getSheetName(), range: toA1(r), headers: !!header, columns }
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
    group: (fn) => (group ? group(fn) : fn()),
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
