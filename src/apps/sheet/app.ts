// Spreadsheet app: Univer inside the shared Ofimeo frame (our menu bar, keys,
// status bar with selection statistics, language, save state and zoom; Univer
// keeps its one-row tool bar, sheet tabs and context menu), themed from our
// tokens and synced over Yjs, plus our charts, pivot tables and statistics.

import { ICommandService, type FUniver, type IDisposable, type IRange, type IWorkbookData } from '@univerjs/presets'
import { appInfo } from '../registry'
import type { Session } from '../../core/session'
import { language, locale, t } from '../../core/i18n'
import { setupChrome } from '../../ui/chrome'
import { mountFrame } from '../../ui/frame'
import { renderShell } from '../../ui/shell'
import { el, showContextMenu, toast } from '../../ui/widgets'
import type { ZoomTarget } from '../../ui/zoom'
import { createCommands, UNIVER_COMMANDS } from './commands'
import { exportSheetFile, SHEET_ACCEPT, type SheetExportFormat } from './formats'
import { sheetFrame } from './menus'
import { renderPrintHtml, type PrintOverlay } from './print'
import { SheetSync } from './sync'
import { followTheme } from './theme'
import { createSpreadsheet, WORKBOOK_ID } from './univer'
import { deleteChart, findChart, insertChart, listCharts, liveOption, registerCharts, updateChart } from './charts/view'
import { snapshotCharts } from './charts/model'
import { registerFunctionAliases } from './stats'

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

  const { univer, univerAPI } = await createSpreadsheet(container)
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
      ]),
  })
  followTheme(univerAPI, appElement, charts.redraw)

  // Declared first: the initial rebuild runs inside the SheetSync constructor.
  let presence: SelectionPresence | undefined
  // Viewers and commenters get a read-only workbook (again after every rebuild).
  const applyAccess = () => {
    if (!session.canEdit) univerAPI.getActiveWorkbook()?.setEditable(false)
  }
  const sync = new SheetSync({
    doc: session.doc,
    univer,
    univerAPI,
    onRebuild: () => {
      applyAccess()
      presence?.render()
    },
  })
  presence = new SelectionPresence(session, univerAPI, commands)
  applyAccess()
  if (!session.canEdit) {
    // Commands and local mutations are refused (operations such as selecting,
    // scrolling or copying still work); remote changes arrive as collab mutations.
    commands.beforeCommandExecuted((info, options) => {
      if (options?.fromCollab || options?.onlyLocal || /\.operation\.|copy|zoom/.test(info.id)) return
      if (!/\.(command|mutation)\./.test(info.id)) return
      // Univer's internal editors (cell editor documents) are not the shared workbook.
      const unitId = (info.params as { unitId?: string } | undefined)?.unitId
      if (unitId && unitId !== WORKBOOK_ID) return
      toast(t('This spreadsheet is view only'))
      throw new Error(t('This spreadsheet is view only'))
    })
  }

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

  const print = async () => {
    const sheet = activeSheet()
    if (!sheet) return
    const sheetId = sheet.getSheetId()
    const data = snapshot()
    const onSheet = snapshotCharts(data.resources).filter((c) => c.hostSheetId === sheetId)
    const overlays: PrintOverlay[] = []
    if (onSheet.length) {
      const [{ renderSvg }, { PAPER_COLORS }] = await Promise.all([import('./charts/echarts'), import('./charts/option')])
      for (const c of onSheet) {
        const { width, height } = c.transform
        overlays.push({ from: c.from, width, height, svg: renderSvg(liveOption(univerAPI, c.spec, PAPER_COLORS), width, height) })
      }
    }
    printArea.innerHTML = renderPrintHtml(data, sheetId, (r, c) => sheet.getRange(r, c).getDisplayValue(), overlays)
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

  const exportBlob = (format: SheetExportFormat) => () => exportSheetFile(format, snapshot(), activeSheet()!.getSheetId())
  session.hooks.print = () => void print()
  session.hooks.exportFormats = () => [
    { ext: 'xlsx', label: t('Microsoft Excel (.xlsx)'), build: exportBlob('xlsx') },
    { ext: 'ods', label: t('OpenDocument spreadsheet (.ods)'), build: exportBlob('ods') },
    { ext: 'csv', label: t('Comma-separated values (.csv, current sheet)'), build: exportBlob('csv') },
  ]

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
  let toolbarVisible = true
  const languageLabel = el('span', { class: 'sb-text', textContent: LANGUAGE_NAMES[language], title: t('Language of function help and number formats') })
  const frameSpec = sheetFrame({
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
    insertFunction: (name) => void import('./stats').then((m) => m.insertFunction(univerAPI, name)),
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
      download: [{ label: t('PDF (via Print, current sheet)'), run: () => void print() }],
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
