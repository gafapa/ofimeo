// Menus and shortcut rows of the spreadsheet on the shared Ofimeo frame. Every
// Univer action goes through the command adapter (commands.ts); charts, pivot
// tables and statistics are our own features.

import { t } from '../../core/i18n'
import type { Session } from '../../core/session'
import type { FrameSpec } from '../../ui/frame'
import type { EditMenuOptions } from '../../ui/menus'
import { mod, type ShortcutSection } from '../../ui/shortcuts'
import { el, showDialog, toast, type Menu, type MenuEntry } from '../../ui/widgets'
import { zoomMenuItems, type ZoomTarget } from '../../ui/zoom'
import type { FUniver } from '@univerjs/presets'
import type { CommandName, SheetCommands } from './commands'

export interface SheetContext {
  session: Session
  univerAPI: FUniver
  cmds: SheetCommands
  openFile: () => void
  print: () => void
  zoom: ZoomTarget
  canEdit: () => boolean
  // Chart selected on the grid (Univer drawing focus), if any.
  selectedChart: () => string | null
  insertChart: () => void
  editChart: (id: string) => void
  deleteChart: (id: string) => void
  pivotTable: () => void
  refreshPivots: () => void
  descriptiveStatistics: () => void
  editWarnings: () => void
  insertFunction: (name: string) => void
  toolbarVisible: () => boolean
  setToolbarVisible: (on: boolean) => void
}

const ALIGN = { left: 1, center: 2, right: 3, top: 1, middle: 2, bottom: 3 } as const
const WRAP = 3

export function sheetFrame(ctx: SheetContext): Pick<FrameSpec, 'file' | 'edit' | 'menus' | 'help'> {
  const { cmds, univerAPI } = ctx
  type Params = object | (() => object)
  const run = (name: CommandName, params?: Params) => () => void cmds.run(name, typeof params === 'function' ? params() : params)
  // Changing items are disabled for view and comment links.
  const edit = (label: string, name: CommandName, params?: Params, shortcut?: string): MenuEntry => ({ label, shortcut, run: run(name, params), enabled: ctx.canEdit })
  // Insert as many rows / columns as are selected.
  const selection = () => univerAPI.getActiveWorkbook()?.getActiveSheet()?.getSelection()?.getActiveRange()?.getRange()
  const rowCount = () => {
    const r = selection()
    return { value: r ? r.endRow - r.startRow + 1 : 1 }
  }
  const colCount = () => {
    const r = selection()
    return { value: r ? r.endColumn - r.startColumn + 1 : 1 }
  }
  const action = (label: string, fn: () => void, shortcut?: string): MenuEntry => ({ label, shortcut, run: fn, enabled: ctx.canEdit })
  const sheet = () => univerAPI.getActiveWorkbook()?.getActiveSheet()
  const chart = () => ctx.selectedChart()

  const editOptions: EditMenuOptions = {
    undo: run('undo'),
    redo: run('redo'),
    cut: run('cut'),
    copy: run('copy'),
    paste: run('paste'),
    selectAll: run('selectAll'),
    find: run('find'),
    replace: run('replace'),
    editable: ctx.canEdit,
    slots: {
      clipboard: [
        {
          label: t('Paste special'),
          enabled: ctx.canEdit,
          submenu: [edit(t('Values only'), 'pasteValues', undefined, mod('Shift+V')), edit(t('Formatting only'), 'pasteFormat')],
        },
        {
          label: t('Delete'),
          enabled: ctx.canEdit,
          submenu: [
            edit(t('Contents'), 'clearContents', undefined, 'Del'),
            edit(t('Formatting'), 'clearFormat'),
            edit(t('Contents and formatting'), 'clearAll'),
            '-',
            edit(t('Selected rows'), 'removeRows'),
            edit(t('Selected columns'), 'removeCols'),
          ],
        },
      ],
      end: [
        '-',
        { label: t('Edit chart…'), visible: () => !!chart(), enabled: ctx.canEdit, run: () => chart() && ctx.editChart(chart()!) },
        { label: t('Delete chart'), visible: () => !!chart(), enabled: ctx.canEdit, run: () => chart() && ctx.deleteChart(chart()!) },
      ],
    },
  }

  const view: Menu = {
    label: t('View'),
    items: [
      {
        label: t('Freeze'),
        enabled: ctx.canEdit,
        submenu: [
          edit(t('First row'), 'freezeFirstRow'),
          edit(t('First column'), 'freezeFirstCol'),
          edit(t('Up to the current cell'), 'freezeSelection'),
          '-',
          edit(t('Unfreeze'), 'unfreeze'),
        ],
      },
      { label: t('Gridlines'), enabled: ctx.canEdit, active: () => !(sheet()?.hasHiddenGridLines() ?? false), run: run('gridlines') },
      { label: t('Toolbar'), enabled: ctx.canEdit, active: ctx.toolbarVisible, run: () => ctx.setToolbarVisible(!ctx.toolbarVisible()) },
      '-',
      { label: t('Zoom'), submenu: zoomMenuItems(ctx.zoom) },
    ],
  }

  const insert: Menu = {
    label: t('Insert'),
    items: [
      edit(t('Row above'), 'insertRowBefore', rowCount),
      edit(t('Row below'), 'insertRowAfter', rowCount),
      edit(t('Column left'), 'insertColBefore', colCount),
      edit(t('Column right'), 'insertColAfter', colCount),
      { label: t('Cells'), enabled: ctx.canEdit, submenu: [edit(t('Shift cells down'), 'insertCellsDown'), edit(t('Shift cells right'), 'insertCellsRight')] },
      edit(t('Sheet'), 'insertSheet'),
      '-',
      action(t('Chart…'), ctx.insertChart),
      edit(t('Image…'), 'insertImage'),
      edit(t('Image in cell…'), 'insertCellImage'),
      '-',
      {
        label: t('Function'),
        enabled: ctx.canEdit,
        submenu: [
          ['SUM', t('Sum')],
          ['AVERAGE', t('Average')],
          ['COUNT', t('Count')],
          ['MAX', t('Maximum')],
          ['MIN', t('Minimum')],
          ['MEDIAN', t('Median')],
          ['STDEV.S', t('Standard deviation')],
        ].map(([name, label]) => ({ label: `${label} (${name})`, run: () => ctx.insertFunction(name) })),
      },
      edit(t('Link…'), 'insertLink', undefined, mod('K')),
      edit(t('Note'), 'insertNote'),
      edit(t('Table…'), 'insertTable'),
    ],
  }

  const format: Menu = {
    label: t('Format'),
    items: [
      edit(t('Bold'), 'bold', undefined, mod('B')),
      edit(t('Italic'), 'italic', undefined, mod('I')),
      edit(t('Underline'), 'underline', undefined, mod('U')),
      edit(t('Strikethrough'), 'strike'),
      '-',
      {
        label: t('Number'),
        enabled: ctx.canEdit,
        submenu: [
          edit(t('Number format…'), 'numberFormat'),
          edit(t('Percent'), 'percent'),
          edit(t('Currency'), 'currency'),
          '-',
          edit(t('Increase decimals'), 'addDecimal'),
          edit(t('Decrease decimals'), 'subtractDecimal'),
        ],
      },
      {
        label: t('Align'),
        enabled: ctx.canEdit,
        submenu: [
          edit(t('Left'), 'alignH', { value: ALIGN.left }),
          edit(t('Center'), 'alignH', { value: ALIGN.center }),
          edit(t('Right'), 'alignH', { value: ALIGN.right }),
          '-',
          edit(t('Top'), 'alignV', { value: ALIGN.top }),
          edit(t('Middle'), 'alignV', { value: ALIGN.middle }),
          edit(t('Bottom'), 'alignV', { value: ALIGN.bottom }),
        ],
      },
      edit(t('Wrap text'), 'wrap', { value: WRAP }),
      {
        label: t('Merge cells'),
        enabled: ctx.canEdit,
        submenu: [edit(t('Merge all'), 'mergeAll'), edit(t('Merge horizontally'), 'mergeHorizontal'), edit(t('Merge vertically'), 'mergeVertical'), '-', edit(t('Unmerge'), 'unmerge')],
      },
      '-',
      {
        label: t('Conditional formatting'),
        enabled: ctx.canEdit,
        submenu: [
          edit(t('New rule…'), 'conditionalFormatting', { value: 1 }),
          edit(t('Manage rules…'), 'conditionalFormatting', { value: 2 }),
          '-',
          edit(t('Clear rules from selection'), 'conditionalFormatting', { value: 9 }),
        ],
      },
      edit(t('Fit column width'), 'autoWidth'),
      edit(t('Paint format'), 'formatPainter'),
      edit(t('Clear formatting'), 'clearFormat'),
    ],
  }

  const data: Menu = {
    label: t('Data'),
    items: [
      edit(t('Sort A → Z'), 'sortAsc'),
      edit(t('Sort Z → A'), 'sortDesc'),
      edit(t('Custom sort…'), 'sortCustom'),
      '-',
      edit(t('Filter'), 'filter'),
      edit(t('Clear filter'), 'clearFilter'),
      edit(t('Reapply filter'), 'reapplyFilter'),
      '-',
      {
        label: t('Data validation'),
        enabled: ctx.canEdit,
        submenu: [edit(t('New rule…'), 'addValidation'), edit(t('Manage rules…'), 'validation', {})],
      },
      action(t('Split text to columns…'), () => void splitText(cmds)),
      edit(t('Named ranges…'), 'namedRanges', { value: 'open' }),
      action(t('Warn before editing…'), ctx.editWarnings),
      '-',
      action(t('Pivot table…'), ctx.pivotTable),
      action(t('Refresh pivot tables'), ctx.refreshPivots),
      action(t('Descriptive statistics…'), ctx.descriptiveStatistics),
    ],
  }

  const tools: Menu = {
    label: t('Tools'),
    items: [{ label: t('Recalculate formulas'), run: () => void univerAPI.getFormula().executeCalculation() }],
  }

  return {
    edit: editOptions,
    menus: { view, insert, format, app: [data], tools },
    help: {
      sections: shortcutSections,
      extra: [
        { label: t('Statistics functions'), run: () => void statisticsHelp() },
        { label: t('Charts and pivot tables'), run: () => void chartsHelp() },
      ],
    },
    file: { openFile: ctx.openFile, print: ctx.print },
  }
}

function shortcutSections(): ShortcutSection[] {
  return [
    {
      title: t('Spreadsheet'),
      rows: [
        [t('Edit cell'), 'F2 / Enter'],
        [t('Confirm and move down / right'), 'Enter / Tab'],
        [t('Line break in cell'), 'Alt+Enter'],
        [t('Bold / Italic / Underline'), 'Ctrl+B / Ctrl+I / Ctrl+U'],
        [t('Paste values only'), 'Ctrl+Shift+V'],
        [t('Insert link'), 'Ctrl+K'],
        [t('Jump to edge of data'), 'Ctrl+Arrow'],
        [t('Extend selection'), 'Shift+Arrow'],
        [t('Edit chart'), t('Double click')],
      ],
    },
  ]
}

// Spanish function names are accepted too (stats.ts); files always store the English names.
const statHelp = (): [string, string, string][] => [
  ['AVERAGE', 'MEDIA · PROMEDIO', t('Mean')],
  ['MEDIAN', 'MEDIANA', t('Median')],
  ['MODE.SNGL', 'MODA.UNO', t('Mode (most frequent value)')],
  ['STDEV.S / STDEV.P', 'DESVEST.M / DESVEST.P', t('Standard deviation (sample / population)')],
  ['VAR.S / VAR.P', 'VAR.S / VAR.P', t('Variance (sample / population)')],
  ['QUARTILE.INC', 'CUARTIL.INC', t('Quartile')],
  ['PERCENTILE.INC', 'PERCENTIL.INC', t('Percentile')],
  ['CORREL · PEARSON', 'COEF.DE.CORREL · PEARSON', t('Correlation coefficient')],
  ['SLOPE · INTERCEPT', 'PENDIENTE · INTERSECCION.EJE', t('Regression line')],
  ['FORECAST.LINEAR', 'PRONOSTICO.LINEAL', t('Linear prediction')],
  ['NORM.DIST · NORM.INV', 'DISTR.NORM.N · INV.NORM', t('Normal distribution')],
  ['BINOM.DIST', 'DISTR.BINOM.N', t('Binomial distribution')],
  ['COUNTIFS', 'CONTAR.SI.CONJUNTO', t('Count with conditions')],
  ['FREQUENCY', 'FRECUENCIA', t('Frequency table')],
  ['RANK.EQ', 'JERARQUIA.EQV', t('Rank')],
  ['COMBIN · PERMUT', 'COMBINAT · PERMUTACIONES', t('Combinations, permutations')],
  ['RANDBETWEEN', 'ALEATORIO.ENTRE', t('Random integer')],
]

async function statisticsHelp(): Promise<void> {
  const table = el('table', { class: 'shortcuts' })
  table.append(el('tr', {}, el('th', { textContent: t('Function') }), el('th', { textContent: t('Spanish name') }), el('th', { textContent: t('Use') })))
  for (const [en, es, use] of statHelp()) table.append(el('tr', {}, el('td', {}, el('code', { textContent: en })), el('td', {}, el('code', { textContent: es })), el('td', { textContent: use })))
  const body = el(
    'div',
    { class: 'shortcut-scroll' },
    el('p', { textContent: t('Formulas accept the English names and, in Spanish and Galician, the Spanish names too. Files are saved with the English names, which Excel and LibreOffice translate.') }),
    table,
    el('p', { textContent: t('Data ▸ Descriptive statistics… writes a summary table (n, mean, median, mode, standard deviation, variance, minimum, quartiles, maximum) with live formulas. Scatter charts can show a linear trendline with its equation and R².') }),
  )
  await showDialog(t('Statistics functions'), body, [{ label: t('Close'), value: 'ok', primary: true }], true)
}

export const PIVOT_LIMITATIONS = () =>
  t('Pivot tables are built from ordinary formulas (SUMIFS, AVERAGEIFS, COUNTIFS, MINIFS, MAXIFS): values update live and export to Excel and LibreOffice, but new row or column keys only appear after Data ▸ Refresh pivot tables. Refreshing rewrites the table, so do not type inside it.')

async function chartsHelp(): Promise<void> {
  const body = el(
    'div',
    { class: 'confirm-body' },
    el('h3', { textContent: t('Charts') }),
    el('p', { textContent: t('Insert ▸ Chart… draws a column, bar, line, area, pie, doughnut or scatter chart from a range. Charts update when the cells change, follow the range when rows or columns are inserted or deleted, print, and are saved as native charts in .xlsx and .ods files. Double click a chart (or right click it) to edit it.') }),
    el('h3', { textContent: t('Pivot tables') }),
    el('p', { textContent: PIVOT_LIMITATIONS() }),
  )
  await showDialog(t('Charts and pivot tables'), body, [{ label: t('Close'), value: 'ok', primary: true }], true)
}

// Data ▸ Split text to columns… (Univer's command, with our delimiter dialog).
async function splitText(cmds: SheetCommands): Promise<void> {
  const range = cmds.api.getActiveWorkbook()?.getActiveSheet()?.getSelection()?.getActiveRange()?.getRange()
  if (!range) return
  if (range.startColumn !== range.endColumn) return toast(t('Select cells of a single column'))
  const DELIMITERS: [number, string][] = [[2, t('Comma')], [4, t('Semicolon')], [8, t('Space')], [1, t('Tab')], [16, t('Other')]]
  const kind = el('select', { class: 'field' }, ...DELIMITERS.map(([v, l]) => el('option', { value: String(v), textContent: l })))
  const other = el('input', { class: 'field', maxLength: 1, hidden: true })
  kind.addEventListener('change', () => (other.hidden = kind.value !== '16'))
  const body = el('div', { class: 'form' }, el('label', { class: 'field-label' }, t('Separator'), kind, other))
  if ((await showDialog(t('Split text to columns'), body, [{ label: t('Cancel'), value: 'cancel' }, { label: t('Split'), value: 'ok', primary: true }])) !== 'ok') return
  const delimiter = Number(kind.value)
  if (delimiter === 16 && !other.value) return
  await cmds.run('splitText', { range, delimiter, ...(delimiter === 16 ? { customDelimiter: other.value } : {}) })
}
