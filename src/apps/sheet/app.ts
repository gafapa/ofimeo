// Spreadsheet app: Univer inside the shared Ofimeo frame (our menu bar, keys,
// status bar with selection statistics, language, save state and zoom; Univer
// keeps its one-row tool bar, sheet tabs and context menu), themed from our
// tokens and synced over Yjs, plus our charts, pivot tables and statistics.

import { CustomCommandExecutionError, ICommandService, type FUniver, type IDisposable, type IRange, type IWorkbookData } from '@univerjs/presets'
import { appInfo } from '../registry'
import type { Session } from '../../core/session'
import { language, locale, t } from '../../core/i18n'
import { setupChrome } from '../../ui/chrome'
import { mountFrame } from '../../ui/frame'
import { renderShell } from '../../ui/shell'
import { el, showContextMenu, showDialog, toast } from '../../ui/widgets'
import type { ZoomTarget } from '../../ui/zoom'
import { createCommands, UNIVER_COMMANDS } from './commands'
import { exportSheetFile, SHEET_ACCEPT, type SheetExportFormat } from './formats'
import type { CsvOptions } from './formats/csv'
import { downloadFormat } from '../../ui/menus'
import { sheetFrame } from './menus'
import { pageCss, pageSetupDialog, printWidth, readPrintSettings, renderPrintHtml, type PrintOverlay, type PrintSettings } from './print'
import { SheetSync } from './sync'
import { followTheme, isInterfaceTextColor } from './theme'
import { createSpreadsheet, emptyWorkbook, WORKBOOK_ID } from './univer'
import { takeNewDoc } from '../../core/router'
import { deleteChart, findChart, insertChart, listCharts, liveOption, registerCharts, updateChart } from './charts/view'
import { snapshotCharts } from './charts/model'
import { registerFunctionAliases } from './stats'
import { setupEditWarnings, type EditWarnings } from './warnings'
import { provideWebMcpTools } from '../../core/webmcp'
import { setupSheetA11y, type SheetA11y } from './a11y'
import { sheetSpelling } from './spell'

// Live workbook access of each open session (for hand in).
export const sheetHandles = new WeakMap<Session, { snapshot: () => IWorkbookData; activeSheetId: () => string }>()

const LANGUAGE_NAMES = { en: 'English', es: 'Español', gl: 'Español', fr: 'Français', de: 'Deutsch' }

export async function mountSheet(session: Session, root: HTMLElement): Promise<void> {
  const info = appInfo('sheet')
  const shell = renderShell(info, root)
  setupChrome(session, info.untitled)
  const appElement = root.querySelector<HTMLElement>('.app')!

  const container = el('div', { class: 'sheet-host' })
  const printArea = el('div', { class: 'sheet-print' })
  const fileInput = el('input', { type: 'file', accept: SHEET_ACCEPT, hidden: true })
  shell.main.append(container)
  document.body.append(printArea, fileInput)

  const { univer, univerAPI } = await createSpreadsheet(container, { readOnly: !session.canEdit })
  labelUniver(container)
  if (!session.canEdit) {
    // No "+" sheet button, and no renaming a tab by double click.
    container.classList.add('sheet-readonly')
    // Univer starts renaming on a second press within 300 ms; the guard sits on
    // an ancestor, so it runs before Univer's handlers.
    let lastPress = 0
    shell.main.addEventListener(
      'pointerdown',
      (e) => {
        if (!(e.target as Element | null)?.closest?.('[data-u-comp="slide-tab-item"]')) return
        const now = Date.now()
        if (now - lastPress < 400) {
          e.stopPropagation()
          e.preventDefault()
          toast(t('This spreadsheet is view only'))
        }
        lastPress = now
      },
      true,
    )
  }
  const commands = univer.__getInjector().get(ICommandService)
  const cmds = createCommands(univer, univerAPI)
  const canEdit = () => session.canEdit
  void registerFunctionAliases(univer, univerAPI)

  // Charts: registered before the first workbook is created (it may contain charts).
  const charts = registerCharts(univer, {
    univerAPI,
    canEdit,
    onEdit: (id) => void editChart(id),
    onContextMenu: (id, x, y) =>
      showContextMenu(x, y, [
        { label: t('Edit chart…'), enabled: canEdit, run: () => void editChart(id) },
        { label: t('Delete chart'), enabled: canEdit, run: () => deleteChart(univerAPI, id) },
        { label: t('Chart data as table'), run: () => a11y?.chartTable(id) },
      ]),
  })
  followTheme(univerAPI, appElement, charts.redraw)

  // Declared first: the initial rebuild runs inside the SheetSync constructor.
  let presence: SelectionPresence | undefined
  let warnings: EditWarnings | undefined
  let a11y: SheetA11y | undefined
  // Viewers and commenters get a read-only workbook (again after every rebuild).
  const applyAccess = () => {
    if (!session.canEdit) univerAPI.getActiveWorkbook()?.setEditable(false)
  }
  // A new document created here: its first sheet gets a name in the user's language.
  if (session.canEdit && takeNewDoc(session.docId) && !session.doc.getMap('sheet').has('base') && session.doc.getArray('sheet-ops').length === 0) {
    SheetSync.setBase(session.doc, emptyWorkbook(t('Sheet{n}', { n: 1 })))
  }
  const sync = new SheetSync({
    doc: session.doc,
    univer,
    univerAPI,
    onRebuild: () => {
      applyAccess()
      presence?.render()
      warnings?.render()
      a11y?.refresh()
    },
  })
  presence = new SelectionPresence(session, univerAPI, commands)
  warnings = setupEditWarnings(session, univerAPI, commands)
  warnings.render()
  applyAccess()
  if (!session.canEdit) {
    // Commands and local mutations are refused (operations such as selecting,
    // scrolling or copying still work); remote changes arrive as collab
    // mutations. Univer treats this error as a cancelled command (no exception).
    let told = 0
    commands.beforeCommandExecuted((info, options) => {
      if (options?.fromCollab || options?.onlyLocal) return
      const editing = /\.(command|mutation)\./.test(info.id) || info.id === 'sheet.operation.rename-sheet' || (info.id === 'sheet.operation.set-cell-edit-visible' && (info.params as { visible?: boolean })?.visible)
      if (!editing || (/\.operation\.|copy|zoom/.test(info.id) && !/rename-sheet|set-cell-edit-visible/.test(info.id))) return
      // Univer's internal editors (cell editor documents) are not the shared workbook.
      const unitId = (info.params as { unitId?: string } | undefined)?.unitId
      if (unitId && unitId !== WORKBOOK_ID) return
      if (Date.now() - told > 3000) toast(t('This spreadsheet is view only'))
      told = Date.now()
      throw new CustomCommandExecutionError(t('This spreadsheet is view only'))
    })
  }

  // Univer's cell editor stores the interface's text color on every typed cell
  // (dark in light mode, near black in dark mode); typed text keeps the automatic color.
  commands.beforeCommandExecuted((info) => {
    if (info.id !== UNIVER_COMMANDS.setRangeValues) return
    const value = (info.params as { value?: unknown } | undefined)?.value
    const strip = (cell: unknown) => {
      const s = (cell as { s?: { cl?: { rgb?: string } } } | null)?.s
      if (s && typeof s === 'object' && isInterfaceTextColor(s.cl?.rgb)) delete s.cl
    }
    if (value && typeof value === 'object' && ('v' in value || 's' in value || 'p' in value)) strip(value)
    else if (value && typeof value === 'object') for (const row of Object.values(value)) for (const cell of Object.values(row ?? {})) strip(cell)
  })

  // Screen readers and keyboard: live region, labels, accessible table view (a11y.ts).
  a11y = setupSheetA11y({ session, univerAPI, commands, cmds, appElement, main: shell.main, host: container, canEdit })

  const snapshot = () => univerAPI.getActiveWorkbook()!.save() as IWorkbookData
  const activeSheet = () => univerAPI.getActiveWorkbook()?.getActiveSheet()
  sheetHandles.set(session, { snapshot, activeSheetId: () => activeSheet()!.getSheetId() })

  // ---------- Charts ----------

  async function editChart(id: string) {
    const chart = findChart(univerAPI, id)
    if (!chart || !canEdit()) return
    const { chartDialog } = await import('./charts/dialog')
    const spec = await chartDialog(univerAPI, chart.spec)
    if (spec) updateChart(univerAPI, id, spec)
  }
  async function newChart() {
    if (!canEdit()) return
    const { chartDialog } = await import('./charts/dialog')
    const spec = await chartDialog(univerAPI)
    if (spec) insertChart(univerAPI, spec)
  }
  // Charts selected on the grid (Univer's drawing focus).
  let focused: string[] = []
  commands.onCommandExecuted((info) => {
    if (info.id !== 'drawing.operation.set-drawing-selected') return
    const params = info.params as { drawingId?: string }[] | { drawingId?: string } | undefined
    focused = (Array.isArray(params) ? params : params ? [params] : []).map((p) => p.drawingId ?? '').filter(Boolean)
  })
  const selectedChart = () => focused.find((id) => findChart(univerAPI, id)) ?? null

  // ---------- File actions ----------

  // Page setup of viewers (editors keep it in the document).
  const printLocal: Partial<PrintSettings> = {}
  const printStyle = el('style', { id: 'sheet-print-page' })
  document.head.append(printStyle)
  const print = async (selectionOnly = false) => {
    const sheet = activeSheet()
    if (!sheet) return
    const sheetId = sheet.getSheetId()
    const selected = sheet.getSelection()?.getActiveRange()?.getRange()
    const range = selectionOnly && selected ? { startRow: selected.startRow, endRow: selected.endRow, startColumn: selected.startColumn, endColumn: selected.endColumn } : undefined
    const data = snapshot()
    const onSheet = snapshotCharts(data.resources).filter((c) => c.hostSheetId === sheetId)
    const overlays: PrintOverlay[] = []
    if (onSheet.length) {
      const [{ renderSvg }, { PAPER_COLORS }] = await Promise.all([import('./charts/echarts'), import('./charts/option')])
      for (const c of onSheet) {
        const { width, height } = c.transform
        overlays.push({ from: c.from, width, height, svg: renderSvg(liveOption(univerAPI, c.spec, PAPER_COLORS, width), width, height) })
      }
    }
    const settings = { ...readPrintSettings(session.doc), ...printLocal }
    printArea.innerHTML = renderPrintHtml(data, sheetId, (r, c) => sheet.getRange(r, c).getDisplayValue(), overlays, { range, repeatHeader: settings.repeatHeader })
    printStyle.textContent = pageCss(settings, printWidth(data, sheetId, overlays, range)).css
    window.print()
    printArea.innerHTML = ''
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (!file) return
    try {
      toast(t('Opening…'))
      const { importFile } = await import('./index')
      location.href = await importFile(file)
    } catch (err) {
      toast(t('Could not open the file: {message}', { message: (err as Error).message }))
    }
  })

  // CSV: separator and values as chosen last time (File ▸ Download as asks).
  const csvOptions = (choice = loadCsvChoice()): CsvOptions => {
    const sheet = activeSheet()
    const decimalComma = choice.delimiter === ';' && usesDecimalComma()
    const display = (r: number, c: number) => {
      const text = sheet?.getRange(r, c).getDisplayValue() ?? ''
      // Univer formats numbers the English way; a ';' file gets decimal commas.
      return decimalComma && /^[-+]?[\d,]*\.?\d+%?$/.test(text) ? text.replace(/[.,]/g, (m) => (m === '.' ? ',' : '.')) : text
    }
    return { delimiter: choice.delimiter, decimalComma, ...(choice.displayed ? { display } : {}) }
  }
  const exportBlob = (format: SheetExportFormat) => () => exportSheetFile(format, snapshot(), activeSheet()!.getSheetId(), format === 'csv' ? csvOptions() : undefined)
  session.hooks.print = () => void print()
  session.hooks.exportFormats = () => [
    { ext: 'xlsx', label: t('Microsoft Excel (.xlsx)'), build: exportBlob('xlsx') },
    { ext: 'ods', label: t('OpenDocument spreadsheet (.ods)'), build: exportBlob('ods') },
    { ext: 'csv', label: t('Comma-separated values (.csv, current sheet)'), build: exportBlob('csv') },
  ]
  const downloadCsv = async () => {
    const choice = await csvDialog()
    if (!choice) return
    await downloadFormat(session, { ext: 'csv', label: 'CSV', build: () => exportSheetFile('csv', snapshot(), activeSheet()!.getSheetId(), csvOptions(choice)) })
  }

  // ---------- Frame: menus, keys, status bar ----------

  const zoom: ZoomTarget = {
    get: () => activeSheet()?.getZoom() ?? 1,
    set: (z) => {
      activeSheet()?.zoom(Math.round(z * 100) / 100)
      frame.status?.zoom?.update()
    },
    min: 0.1,
    max: 4,
    presets: [0.5, 0.75, 0.9, 1, 1.25, 1.5, 2],
    keys: true,
  }
  let toolbarVisible = session.canEdit
  const languageLabel = el('span', { class: 'sb-text', textContent: LANGUAGE_NAMES[language], title: t('Language of function help and number formats') })
  const spelling = sheetSpelling(session, univerAPI)
  const frameSpec = sheetFrame({
    spelling: spelling.menu,
    session,
    univerAPI,
    cmds,
    openFile: () => fileInput.click(),
    print: () => void print(),
    zoom,
    canEdit,
    selectedChart,
    insertChart: () => void newChart(),
    editChart: (id) => void editChart(id),
    deleteChart: (id) => deleteChart(univerAPI, id),
    pivotTable: () => void import('./pivot').then((m) => m.pivotDialog(univerAPI)),
    refreshPivots: () => void import('./pivot').then((m) => m.refreshPivots(univerAPI)),
    descriptiveStatistics: () => void import('./stats').then((m) => m.descriptiveStatistics(univerAPI)),
    editWarnings: () => void warnings?.dialog(),
    insertFunction: (name) => void import('./stats').then((m) => m.insertFunction(univerAPI, name)),
    tableView: () => a11y?.tableView() ?? false,
    setTableView: (on) => a11y?.setTableView(on),
    chartTable: (id) => a11y?.chartTable(id),
    toolbarVisible: () => toolbarVisible,
    setToolbarVisible: (on) => {
      toolbarVisible = on
      univerAPI.setUIVisible(univerAPI.Enum.BuiltInUIPart.TOOLBAR, on)
    },
  })
  const frame = mountFrame({
    session,
    shell,
    ...frameSpec,
    file: {
      ...frameSpec.file,
      downloadItems: [
        ...(session.hooks.exportFormats?.() ?? []).map((f) =>
          f.ext === 'csv' ? { label: `${f.label}…`, run: () => void downloadCsv() } : { label: f.label, run: () => void downloadFormat(session, f) },
        ),
        '-',
        { label: t('PDF (via Print, current sheet)'), run: () => void print() },
      ],
      slots: {
        ...frameSpec.file.slots,
        print: [
          { label: t('Page setup…'), run: () => void pageSetupDialog(session.doc, session.canEdit, printLocal) },
          { label: t('Print selection…'), run: () => void print(true) },
        ],
      },
      details: () => [
        [t('Sheets'), String(univerAPI.getActiveWorkbook()?.getSheets().length ?? 0)],
        [t('Charts'), String(listCharts(univerAPI).length)],
      ],
    },
    zoom,
    status: { language: languageLabel },
  })
  // Univer's one-row tool bar is the spreadsheet's toolbar.
  shell.toolbar.hidden = true
  // AI assistants (WebMCP, off by default): the tool module loads only when turned on.
  provideWebMcpTools(session, () => import('./webmcp').then((m) => m.sheetTools(session, univerAPI)))

  const stats = el('span', { class: 'sheet-stats' })
  stats.setAttribute('aria-live', 'polite')
  frame.status?.left.append(stats)
  const updateStats = selectionStats(univerAPI, stats)
  let statsTimer = 0
  commands.onCommandExecuted((info) => {
    if (info.id === UNIVER_COMMANDS.setZoom || info.id === UNIVER_COMMANDS.setActiveSheet) frame.status?.zoom?.update()
    if (info.id === UNIVER_COMMANDS.setSelections || info.id === UNIVER_COMMANDS.setActiveSheet || info.id.includes('.mutation.')) {
      clearTimeout(statsTimer)
      statsTimer = window.setTimeout(updateStats, 120)
    }
  })

  // Handles for automated browser tests in development builds only.
  if (import.meta.env.DEV) {
    const chartsApi = await import('./charts/view')
    Object.assign(window, { univer, univerAPI, sheetSync: sync, awareness: session.awareness, sheetCharts: chartsApi, sheetCommands: cmds, sheetShareUrl: (a: 'view' | 'comment' | 'edit') => session.shareUrl(a) })
  }
}

// Screen reader labels Univer leaves untranslated (a locale key, the
// notification region's English name) get the suite's words.
function labelUniver(container: HTMLElement): void {
  let queued = false
  const fix = () => {
    queued = false
    for (const node of container.querySelectorAll('[aria-label="ribbon.start"]')) node.setAttribute('aria-label', t('Spreadsheet toolbar'))
    for (const node of document.querySelectorAll('section[aria-label^="Notifications"]')) {
      if (node.getAttribute('aria-label') !== t('Notifications')) node.setAttribute('aria-label', t('Notifications'))
    }
  }
  fix()
  new MutationObserver(() => {
    if (queued) return
    queued = true
    requestAnimationFrame(fix)
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label'] })
}

// ---------- CSV download options ----------

interface CsvChoice {
  delimiter: ',' | ';' | '\t'
  // Values as the sheet shows them (number formats) instead of plain values.
  displayed: boolean
}
const CSV_KEY = 'words-online:sheet-csv'
const usesDecimalComma = () => new Intl.NumberFormat(locale).format(1.5).includes(',')

function loadCsvChoice(): CsvChoice {
  try {
    const saved = JSON.parse(localStorage.getItem(CSV_KEY) || 'null') as CsvChoice | null
    if (saved && [',', ';', '\t'].includes(saved.delimiter)) return { delimiter: saved.delimiter, displayed: !!saved.displayed }
  } catch {
    // No saved choice.
  }
  return { delimiter: usesDecimalComma() ? ';' : ',', displayed: true }
}

async function csvDialog(): Promise<CsvChoice | null> {
  const current = loadCsvChoice()
  const delimiter = el(
    'select',
    { class: 'field' },
    el('option', { value: ',', textContent: t('Comma (,)') }),
    el('option', { value: ';', textContent: t('Semicolon (;), for Excel in languages with a decimal comma') }),
    el('option', { value: '\t', textContent: t('Tab') }),
  )
  delimiter.value = current.delimiter
  const values = el(
    'select',
    { class: 'field' },
    el('option', { value: 'displayed', textContent: t('As shown in the sheet (dates, percentages, decimals)') }),
    el('option', { value: 'plain', textContent: t('Plain values') }),
  )
  values.value = current.displayed ? 'displayed' : 'plain'
  const body = el(
    'div',
    { class: 'form' },
    el('label', { class: 'field-label' }, t('Separator'), delimiter),
    el('label', { class: 'field-label' }, t('Values'), values),
    el('p', { class: 'dialog-note', textContent: t('CSV files keep only the values of the current sheet: no formatting, formulas or other sheets.') }),
  )
  if ((await showDialog(t('Download as CSV'), body, [{ label: t('Cancel'), value: 'cancel' }, { label: t('Download'), value: 'ok', primary: true }])) !== 'ok') return null
  const choice: CsvChoice = { delimiter: delimiter.value as CsvChoice['delimiter'], displayed: values.value === 'displayed' }
  try {
    localStorage.setItem(CSV_KEY, JSON.stringify(choice))
  } catch {
    // Remembering the choice is a convenience.
  }
  return choice
}

// "Sum · Average · Count" of the numbers in the selection (status bar).
function selectionStats(univerAPI: FUniver, node: HTMLElement): () => void {
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 4 })
  return () => {
    const range = univerAPI.getActiveWorkbook()?.getActiveSheet()?.getSelection()?.getActiveRange()
    const r = range?.getRange()
    node.textContent = ''
    if (!range || !r || (r.startRow === r.endRow && r.startColumn === r.endColumn)) return
    if ((r.endRow - r.startRow + 1) * (r.endColumn - r.startColumn + 1) > 200_000) return
    let sum = 0
    let numbers = 0
    let filled = 0
    for (const row of range.getValues()) {
      for (const v of row) {
        if (v === null || v === undefined || v === '') continue
        filled++
        if (typeof v === 'number' && Number.isFinite(v)) {
          sum += v
          numbers++
        }
      }
    }
    if (!filled) return
    node.textContent = numbers
      ? t('Sum: {sum} · Average: {average} · Count: {count}', { sum: format.format(sum), average: format.format(sum / numbers), count: filled })
      : t('Count: {count}', { count: filled })
  }
}

// Shows where collaborators are: their selection is outlined in their color.
class SelectionPresence {
  private highlights: IDisposable[] = []

  constructor(
    private readonly session: Session,
    private readonly univerAPI: FUniver,
    commands: ICommandService,
  ) {
    // Selection operations are observed directly: facade events do not survive workbook rebuilds.
    commands.onCommandExecuted((info) => {
      if (info.id === UNIVER_COMMANDS.setSelections) {
        const params = info.params as { subUnitId?: string; selections?: { range: IRange }[] }
        const range = params.selections?.[params.selections.length - 1]?.range
        if (range && params.subUnitId) session.awareness.setLocalStateField('sheetSelection', { sheetId: params.subUnitId, range: pickRange(range) })
      } else if (info.id === UNIVER_COMMANDS.setActiveSheet) {
        this.render()
      }
    })
    session.awareness.on('change', () => this.render())
  }

  render(): void {
    this.highlights.forEach((h) => h.dispose())
    this.highlights = []
    const workbook = this.univerAPI.getActiveWorkbook()
    const sheet = workbook?.getActiveSheet()
    if (!sheet) return
    for (const [clientId, state] of this.session.awareness.getStates()) {
      if (clientId === this.session.doc.clientID || !state.sheetSelection || !state.user) continue
      const { sheetId, range } = state.sheetSelection as { sheetId: string; range: IRange }
      if (sheetId !== sheet.getSheetId()) continue
      try {
        const fRange = sheet.getRange(range.startRow, range.startColumn, range.endRow - range.startRow + 1, range.endColumn - range.startColumn + 1)
        this.highlights.push(fRange.highlight({ stroke: state.user.color, strokeWidth: 2, fill: hexToRgba(state.user.color, 0.08) }))
      } catch {
        // Range outside the current sheet bounds: ignore.
      }
    }
  }
}

function pickRange(r: IRange): IRange {
  return { startRow: r.startRow, endRow: r.endRow, startColumn: r.startColumn, endColumn: r.endColumn }
}

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}
