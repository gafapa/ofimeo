// WebMCP tools of the spreadsheet (see src/core/webmcp). Loaded only while the
// switch is on. Every write is one Univer command, so it is one step of the
// spreadsheet's undo history, and it is recorded as the AI assistant's in the
// version history by the core. Notes (Univer cell notes) serve as comments;
// they are part of the workbook, so only editors can add them.

import type { FUniver } from '@univerjs/presets'
import type { FWorksheet } from '@univerjs/sheets/facade'
import type { Session } from '../../core/session'
import { aiName } from '../../core/webmcp/ai'
import { bool, optStr, str, type AppTools, type OfimeoTool, type ToolArgs } from '../../core/webmcp/types'
import { CHART_TYPES, normalizeSpec, parseA1, toA1, type ChartType } from './charts/model'
import { insertChart, listCharts } from './charts/view'

const MAX_CELLS = 20_000

interface Note {
  row: number
  col: number
  note: string
}
type NoteSheet = FWorksheet & { getNotes?: () => Note[] }
type NoteRange = { createOrUpdateNote?: (note: { note: string; width: number; height: number; show?: boolean }) => unknown }

export function sheetTools(session: Session, univerAPI: FUniver): AppTools {
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
    return rows > 0 && cols > 0 ? toA1({ startRow: 0, startColumn: 0, endRow: rows - 1, endColumn: cols - 1 }) : null
  }

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
