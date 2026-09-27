// Screen reader and keyboard access to the spreadsheet. Univer draws the grid
// on a canvas, so this module adds:
//
// - a live region that reads the selected cell (address, value, formula) as the
//   selection moves on the canvas, labels for the name box, formula bar and
//   grid, and arrow keys on the sheet tabs;
// - the accessible table view (View ▸ Accessible table view, Alt+Shift+T, or
//   the "Switch to accessible table view" skip link): a real HTML grid that
//   mirrors the active sheet, windowed around the active cell for large
//   sheets. It edits through Univer's command API (FRange.setValue), so edits
//   sync to collaborators and undo like any other; view and comment links get
//   a read-only grid;
// - text alternatives of charts (charts/summary.ts): a list with a summary per
//   chart and "Chart data as table".

import type { FUniver, ICommandService } from '@univerjs/presets'
import type { FWorksheet } from '@univerjs/sheets/facade'
import { t } from '../../core/i18n'
import type { Session } from '../../core/session'
import { el, toast } from '../../ui/widgets'
import { UNIVER_COMMANDS, type SheetCommands } from './commands'
import { colName, parseA1 } from './charts/model'

export interface SheetA11yOptions {
  session: Session
  univerAPI: FUniver
  commands: ICommandService
  cmds: SheetCommands
  appElement: HTMLElement
  main: HTMLElement
  host: HTMLElement
  canEdit: () => boolean
}

export interface SheetA11y {
  tableView: () => boolean
  setTableView: (on: boolean) => void
  // Chart data of a chart as an HTML table (dialog).
  chartTable: (id: string) => void
  // After Univer's workbook was rebuilt from the shared document.
  refresh: () => void
}

const KEY = 'words-online:sheet-table-view'
const address = (r: number, c: number) => `${colName(c)}${r + 1}`

export function setupSheetA11y(o: SheetA11yOptions): SheetA11y {
  const { univerAPI, commands, cmds } = o
  const sheet = () => univerAPI.getActiveWorkbook()?.getActiveSheet()
  let tableOn = false

  // ---------- Announcements ----------

  const live = el('div', { class: 'sr-only', role: 'status' })
  live.setAttribute('aria-live', 'polite')
  live.setAttribute('aria-atomic', 'true')
  o.appElement.append(live)
  let liveTimer = 0
  const announce = (text: string) => {
    // Cleared first, so the same text is read again.
    live.textContent = ''
    clearTimeout(liveTimer)
    liveTimer = window.setTimeout(() => (live.textContent = text), 60)
  }

  const cellText = (ws: FWorksheet, r: number, c: number) => {
    const range = ws.getRange(r, c)
    const value = range.getDisplayValue()
    const formula = range.getFormula()
    let text = `${address(r, c)}: ${value === '' ? t('empty') : value}`
    if (formula) text += `. ${t('Formula')}: ${formula}`
    return text
  }

  // Canvas mode: the selection is read when it moves.
  let selTimer = 0
  commands.onCommandExecuted((info, options) => {
    if (info.id !== UNIVER_COMMANDS.setSelections || tableOn || options?.fromCollab) return
    clearTimeout(selTimer)
    selTimer = window.setTimeout(() => {
      const ws = sheet()
      const r = ws?.getSelection()?.getActiveRange()?.getRange()
      if (!ws || !r) return
      // Only while the user works in the grid (not while typing elsewhere).
      const active = document.activeElement
      if (active && active !== document.body && !o.host.contains(active)) return
      const cur = ws.getSelection()?.getCurrentCell()
      const row = cur?.actualRow ?? r.startRow
      const col = cur?.actualColumn ?? r.startColumn
      const single = r.startRow === r.endRow && r.startColumn === r.endColumn
      announce(single ? cellText(ws, row, col) : `${address(r.startRow, r.startColumn)}:${address(r.endRow, r.endColumn)} ${t('selected')}. ${cellText(ws, row, col)}`)
    }, 150)
  })

  // ---------- Labels and sheet tabs in canvas mode ----------

  let queued = false
  const label = () => {
    queued = false
    const set = (node: Element | null, name: string, value: string) => node && node.getAttribute(name) !== value && node.setAttribute(name, value)
    set(o.host.querySelector('[data-u-comp="defined-name"] input'), 'aria-label', t('Name box (cell reference)'))
    const bar = o.host.querySelector('[data-u-comp="formula-bar"]')
    set(bar, 'role', 'group')
    set(bar, 'aria-label', t('Formula bar'))
    set(o.host.querySelector('[data-u-comp="formula-bar"] [data-u-comp="render-canvas"]'), 'aria-label', t('Formula bar'))
    for (const canvas of o.host.querySelectorAll('canvas[data-u-unit-id]')) {
      set(canvas, 'role', 'img')
      set(canvas, 'aria-label', t('Spreadsheet grid (Alt+Shift+T: accessible table view)'))
    }
  }
  new MutationObserver(() => {
    if (queued) return
    queued = true
    requestAnimationFrame(label)
  }).observe(o.host, { childList: true, subtree: true })
  label()

  // Arrow keys, Home and End move between the sheet tabs (Univer only takes clicks).
  o.host.addEventListener('keydown', (e) => {
    const tab = (e.target as Element).closest?.('[role="tab"][data-u-comp="slide-tab-item"]') as HTMLElement | null
    if (!tab) return
    const tabs = [...o.host.querySelectorAll<HTMLElement>('[role="tab"][data-u-comp="slide-tab-item"]')]
    const i = tabs.indexOf(tab)
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key]
    const activate = e.key === 'Enter' || e.key === ' '
    if (next === undefined && !activate) return
    e.preventDefault()
    e.stopPropagation()
    const target = activate ? tab : tabs[(next! + tabs.length) % tabs.length]
    const id = target?.dataset.id
    if (!id) return
    univerAPI.getActiveWorkbook()?.setActiveSheet(id)
    requestAnimationFrame(() => o.host.querySelector<HTMLElement>(`[role="tab"][data-id="${CSS.escape(id)}"]`)?.focus())
  })

  // ---------- Accessible table view ----------

  let row = 0
  let col = 0
  let top = 0
  let left = 0
  let rows = 25
  let cols = 8
  let editing: HTMLInputElement | null = null

  const view = el('section', { class: 'sheet-a11y-view', hidden: true })
  view.setAttribute('aria-label', t('Accessible table view'))
  const sheetSelect = el('select', { class: 'field' })
  const goto = el('input', { class: 'field', size: 8, placeholder: 'A1', spellcheck: false })
  const back = el('button', { type: 'button', textContent: t('Back to the grid view') })
  const current = el('div', { class: 'sheet-a11y-current' })
  const help = el('p', { class: 'sheet-a11y-help', id: 'sheet-a11y-help' })
  const table = el('table', { class: 'sheet-a11y-grid', role: 'grid' })
  table.setAttribute('aria-describedby', 'sheet-a11y-help')
  const scroller = el('div', { class: 'sheet-a11y-scroll' }, table)
  const position = el('p', { class: 'sheet-a11y-pos' })
  const chartList = el('ul', { class: 'sheet-a11y-charts' })
  const charts = el('section', { class: 'sheet-a11y-charts-box', hidden: true }, el('h2', { textContent: t('Charts') }), chartList)
  view.append(
    el(
      'div',
      { class: 'sheet-a11y-bar' },
      el('label', { class: 'check-label' }, t('Sheet'), sheetSelect),
      el('label', { class: 'check-label' }, t('Go to cell'), goto),
      back,
    ),
    current,
    help,
    scroller,
    position,
    charts,
  )
  o.main.append(view)

  const skip = el('button', { type: 'button', class: 'skip-link', textContent: t('Switch to accessible table view') })
  skip.addEventListener('click', () => setTableView(true))
  o.appElement.prepend(skip)

  const limits = () => {
    const ws = sheet()
    return { maxRow: (ws?.getMaxRows() ?? 1000) - 1, maxCol: (ws?.getMaxColumns() ?? 26) - 1 }
  }
  // Last row and column with data.
  const dataEnd = () => {
    const ws = sheet()
    return { lastRow: Math.max(0, ws?.getLastRow() ?? 0), lastCol: Math.max(0, ws?.getLastColumn() ?? 0) }
  }

  // Window size from the space available (at 200 % zoom too).
  const measure = () => {
    const box = scroller.getBoundingClientRect()
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    rows = Math.max(5, Math.min(60, Math.floor((box.height || 600) / (rem * 2)) - 1))
    cols = Math.max(2, Math.min(26, Math.floor(((box.width || 800) - rem * 3.5) / (rem * 7))))
  }

  const cellNode = (r: number, c: number) => table.querySelector<HTMLElement>(`td[data-r="${r}"][data-c="${c}"]`)

  function render() {
    if (!tableOn) return
    const ws = sheet()
    if (!ws) return
    const wb = univerAPI.getActiveWorkbook()!
    const { maxRow, maxCol } = limits()
    row = Math.min(row, maxRow)
    col = Math.min(col, maxCol)
    if (row < top) top = row
    if (row >= top + rows) top = row - rows + 1
    if (col < left) left = col
    if (col >= left + cols) left = col - cols + 1
    top = Math.max(0, Math.min(top, maxRow - rows + 1))
    left = Math.max(0, Math.min(left, maxCol - cols + 1))
    const nRows = Math.min(rows, maxRow - top + 1)
    const nCols = Math.min(cols, maxCol - left + 1)

    // Sheet list.
    const sheets = wb.getSheets().filter((s) => !s.isSheetHidden())
    const ids = sheets.map((s) => s.getSheetId()).join()
    if (sheetSelect.dataset.ids !== ids || [...sheetSelect.options].some((opt, i) => opt.textContent !== sheets[i]?.getSheetName())) {
      sheetSelect.replaceChildren(...sheets.map((s) => el('option', { value: s.getSheetId(), textContent: s.getSheetName() })))
      sheetSelect.dataset.ids = ids
    }
    sheetSelect.value = ws.getSheetId()

    table.setAttribute('aria-label', t('Sheet {name}', { name: ws.getSheetName() }))
    table.setAttribute('aria-rowcount', String(maxRow + 2))
    table.setAttribute('aria-colcount', String(maxCol + 2))
    table.setAttribute('aria-readonly', String(!o.canEdit()))

    const values = ws.getRange(top, left, nRows, nCols).getDisplayValues()
    const head = el('tr', { role: 'row' })
    head.setAttribute('aria-rowindex', '1')
    const corner = el('th', { role: 'columnheader', class: 'corner' }, el('span', { class: 'sr-only', textContent: t('Row') }))
    corner.setAttribute('aria-colindex', '1')
    head.append(corner)
    for (let c = 0; c < nCols; c++) {
      const th = el('th', { role: 'columnheader', textContent: colName(left + c) })
      th.setAttribute('aria-colindex', String(left + c + 2))
      head.append(th)
    }
    const body = el('tbody')
    for (let r = 0; r < nRows; r++) {
      const tr = el('tr', { role: 'row' })
      tr.setAttribute('aria-rowindex', String(top + r + 2))
      const th = el('th', { role: 'rowheader', textContent: String(top + r + 1) })
      th.setAttribute('aria-colindex', '1')
      tr.append(th)
      for (let c = 0; c < nCols; c++) {
        const td = el('td', { role: 'gridcell', textContent: values[r]?.[c] ?? '', tabIndex: -1, dataset: { r: String(top + r), c: String(left + c) } })
        td.setAttribute('aria-colindex', String(left + c + 2))
        if (top + r === row && left + c === col) {
          td.tabIndex = 0
          td.setAttribute('aria-selected', 'true')
        }
        tr.append(td)
      }
      body.append(tr)
    }
    const hadFocus = table.contains(document.activeElement)
    table.replaceChildren(el('thead', {}, head), body)
    if (hadFocus) cellNode(row, col)?.focus()

    const formula = ws.getRange(row, col).getFormula()
    current.textContent = `${address(row, col)}  ${formula || ws.getRange(row, col).getDisplayValue()}`
    position.textContent = t('Rows {from}–{to} of {total} · Columns {first}–{last}', {
      from: top + 1,
      to: top + nRows,
      total: maxRow + 1,
      first: colName(left),
      last: colName(left + nCols - 1),
    })
    help.textContent = o.canEdit()
      ? t('Arrow keys move between cells; Ctrl+Home and Ctrl+End go to the start and end of the data. Enter or F2 edits the cell (formulas start with =), Delete clears it, Ctrl+Z undoes. Ctrl+Page Up and Ctrl+Page Down change the sheet.')
      : t('Arrow keys move between cells; Ctrl+Home and Ctrl+End go to the start and end of the data. Ctrl+Page Up and Ctrl+Page Down change the sheet. This spreadsheet is view only.')
    void renderCharts(ws.getSheetId())
  }

  async function renderCharts(sheetId: string) {
    const { listCharts, liveSummary } = await import('./charts/view')
    const list = listCharts(univerAPI).filter((c) => c.hostSheetId === sheetId)
    charts.hidden = !list.length
    chartList.replaceChildren(
      ...list.map((c) => {
        const button = el('button', { type: 'button', textContent: t('Chart data as table') })
        button.addEventListener('click', () => chartTable(c.id))
        return el('li', {}, el('h3', { textContent: c.spec.title || t('Chart') }), el('p', { textContent: liveSummary(univerAPI, c.spec) }), button)
      }),
    )
  }

  let renderQueued = false
  const queueRender = () => {
    if (!tableOn || renderQueued) return
    renderQueued = true
    requestAnimationFrame(() => {
      renderQueued = false
      // A cell being edited stays as it is; the grid redraws when the edit ends.
      if (!editing) render()
    })
  }
  commands.onCommandExecuted((info) => {
    if (info.id.includes('.mutation.') || info.id === UNIVER_COMMANDS.setActiveSheet) queueRender()
  })

  const moveTo = (r: number, c: number, speak = true) => {
    const { maxRow, maxCol } = limits()
    row = Math.max(0, Math.min(maxRow, r))
    col = Math.max(0, Math.min(maxCol, c))
    render()
    cellNode(row, col)?.focus()
    // Univer's selection follows (the grid shows the same cell; collaborators see it).
    try {
      sheet()?.getRange(row, col).activate()
    } catch {
      // Selection is a convenience.
    }
    const ws = sheet()
    if (speak && ws) announce(cellText(ws, row, col))
  }

  const isEmpty = (ws: FWorksheet, r: number, c: number) => {
    const v = ws.getRange(r, c).getValue()
    return v === null || v === undefined || v === ''
  }
  // Ctrl+Arrow: to the edge of the data block, as in the grid.
  const jump = (dr: number, dc: number) => {
    const ws = sheet()
    if (!ws) return
    const { maxRow, maxCol } = limits()
    const { lastRow, lastCol } = dataEnd()
    const inside = (r: number, c: number) => r >= 0 && c >= 0 && r <= maxRow && c <= maxCol
    let r = row
    let c = col
    const startFilled = !isEmpty(ws, r, c) && inside(r + dr, c + dc) && !isEmpty(ws, r + dr, c + dc)
    for (;;) {
      const nr = r + dr
      const nc = c + dc
      if (!inside(nr, nc)) break
      // Past the data there is nothing more to find.
      if ((dr > 0 && nr > lastRow) || (dc > 0 && nc > lastCol)) {
        if (!startFilled) {
          r = dr ? maxRow : r
          c = dc ? maxCol : c
        }
        break
      }
      if (startFilled ? isEmpty(ws, nr, nc) : !isEmpty(ws, nr, nc)) {
        if (!startFilled) {
          r = nr
          c = nc
        }
        break
      }
      r = nr
      c = nc
    }
    moveTo(r, c)
  }

  const switchSheet = (step: number) => {
    const wb = univerAPI.getActiveWorkbook()
    const sheets = wb?.getSheets().filter((s) => !s.isSheetHidden()) ?? []
    const i = sheets.findIndex((s) => s.getSheetId() === sheet()?.getSheetId())
    const next = sheets[i + step]
    if (!wb || !next) return
    wb.setActiveSheet(next)
    row = col = top = left = 0
    render()
    cellNode(0, 0)?.focus()
    announce(t('Sheet {name}', { name: next.getSheetName() }))
  }

  const readOnly = () => {
    announce(t('This spreadsheet is view only'))
    toast(t('This spreadsheet is view only'))
  }

  function startEdit(initial?: string) {
    const ws = sheet()
    const td = cellNode(row, col)
    if (!ws || !td) return
    if (!o.canEdit()) return readOnly()
    const range = ws.getRange(row, col)
    const cellData = range.getCellData()
    const original = range.getFormula() || (cellData?.v === null || cellData?.v === undefined ? '' : String(cellData.v))
    const input = el('input', { class: 'sheet-a11y-input', value: initial ?? original, spellcheck: false })
    input.setAttribute('aria-label', t('Edit cell {cell}', { cell: address(row, col) }))
    editing = input
    const at = { r: row, c: col }
    td.replaceChildren(input)
    input.focus()
    input.setSelectionRange(input.value.length, input.value.length)
    let done = false
    // Through Univer's command API: synced, undoable and refused for viewers.
    const save = () => {
      if (input.value === original) return
      try {
        const target = sheet()?.getRange(at.r, at.c)
        if (input.value === '') target?.setValue({ v: null, f: null, p: null })
        else target?.setValue(input.value)
      } catch (err) {
        console.warn('Cell edit failed', err)
      }
    }
    const finish = (commit: boolean, dr = 0, dc = 0) => {
      if (done) return
      done = true
      editing = null
      if (commit) save()
      moveTo(at.r + dr, at.c + dc, false)
      const now = sheet()
      if (now) announce(commit && input.value !== original ? `${t('Saved')}. ${cellText(now, row, col)}` : cellText(now, row, col))
    }
    input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') {
        e.preventDefault()
        finish(true, e.shiftKey ? -1 : 1, 0)
      } else if (e.key === 'Tab') {
        e.preventDefault()
        finish(true, 0, e.shiftKey ? -1 : 1)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        finish(false)
      }
    })
    // Leaving the field (a click elsewhere) keeps what was typed.
    input.addEventListener('blur', () => {
      if (done) return
      done = true
      editing = null
      save()
      queueRender()
    })
  }

  const clearCell = () => {
    if (!o.canEdit()) return readOnly()
    const ws = sheet()
    if (!ws) return
    try {
      ws.getRange(row, col).setValue({ v: null, f: null, p: null })
    } catch (err) {
      console.warn('Clear failed', err)
    }
    announce(`${t('Cleared')}. ${cellText(ws, row, col)}`)
  }

  table.addEventListener('keydown', (e) => {
    if (editing) return
    const modKey = e.ctrlKey || e.metaKey
    const k = e.key
    let handled = true
    if (k === 'ArrowDown') modKey ? jump(1, 0) : moveTo(row + 1, col)
    else if (k === 'ArrowUp') modKey ? jump(-1, 0) : moveTo(row - 1, col)
    else if (k === 'ArrowRight') modKey ? jump(0, 1) : moveTo(row, col + 1)
    else if (k === 'ArrowLeft') modKey ? jump(0, -1) : moveTo(row, col - 1)
    else if (k === 'Home') modKey ? moveTo(0, 0) : moveTo(row, 0)
    else if (k === 'End') modKey ? moveTo(dataEnd().lastRow, dataEnd().lastCol) : moveTo(row, dataEnd().lastCol)
    else if (k === 'PageDown') modKey ? switchSheet(1) : moveTo(row + rows - 1, col)
    else if (k === 'PageUp') modKey ? switchSheet(-1) : moveTo(row - rows + 1, col)
    else if ((k === 'Enter' || k === 'F2') && !modKey) startEdit()
    else if ((k === 'Delete' || k === 'Backspace') && !modKey) clearCell()
    else if (modKey && !e.altKey && k.toLowerCase() === 'z') void cmds.run(e.shiftKey ? 'redo' : 'undo')
    else if (modKey && !e.altKey && k.toLowerCase() === 'y') void cmds.run('redo')
    else if (k.length === 1 && !modKey && !e.altKey) startEdit(k)
    else handled = false
    if (!handled) return
    e.preventDefault()
    // Univer listens for keys on the window too; it must not act on these.
    e.stopPropagation()
  })
  table.addEventListener('click', (e) => {
    const td = (e.target as Element).closest<HTMLElement>('td[data-r]')
    if (td && !editing) moveTo(Number(td.dataset.r), Number(td.dataset.c))
  })
  table.addEventListener('dblclick', (e) => {
    if ((e.target as Element).closest('td[data-r]') && !editing) startEdit()
  })
  table.addEventListener('wheel', (e) => {
    if (editing || !e.deltaY) return
    e.preventDefault()
    const step = Math.sign(e.deltaY) * 3
    const { maxRow } = limits()
    top = Math.max(0, Math.min(maxRow - rows + 1, top + step))
    row = Math.max(top, Math.min(top + rows - 1, row))
    render()
  }, { passive: false })
  // Keys typed in the view's controls stay out of Univer's shortcuts.
  view.addEventListener('keydown', (e) => {
    if (e.target !== table && !table.contains(e.target as Node)) e.stopPropagation()
  })

  sheetSelect.addEventListener('change', () => {
    univerAPI.getActiveWorkbook()?.setActiveSheet(sheetSelect.value)
    row = col = top = left = 0
    render()
  })
  goto.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const r = parseA1(goto.value)
    if (!r) return toast(t('Type a cell reference such as B12'))
    goto.value = ''
    moveTo(r.startRow, r.startColumn)
  })
  back.addEventListener('click', () => setTableView(false))
  new ResizeObserver(() => {
    if (!tableOn) return
    const [r0, c0] = [rows, cols]
    measure()
    if (r0 !== rows || c0 !== cols) queueRender()
  }).observe(scroller)

  function setTableView(on: boolean) {
    if (on === tableOn) return
    tableOn = on
    try {
      if (on) localStorage.setItem(KEY, '1')
      else localStorage.removeItem(KEY)
    } catch {
      // Remembering the view is a convenience.
    }
    view.hidden = !on
    o.host.inert = on
    if (on) o.host.setAttribute('aria-hidden', 'true')
    else o.host.removeAttribute('aria-hidden')
    skip.hidden = on
    if (on) {
      // Start at Univer's current cell.
      const cur = sheet()?.getSelection()?.getCurrentCell()
      row = cur?.actualRow ?? 0
      col = cur?.actualColumn ?? 0
      measure()
      render()
      cellNode(row, col)?.focus()
      const ws = sheet()
      if (ws) announce(`${t('Accessible table view')}. ${t('Sheet {name}', { name: ws.getSheetName() })}. ${cellText(ws, row, col)}`)
    } else {
      o.host.querySelector<HTMLElement>('canvas[data-u-unit-id]')?.focus()
      announce(t('Grid view'))
    }
  }

  function chartTable(id: string) {
    void Promise.all([import('./charts/view'), import('./charts/summary'), import('./charts/model')]).then(([v, s, m]) => {
      const chart = v.findChart(univerAPI, id)
      if (!chart) return
      const data = m.chartData(chart.spec, v.readValues(univerAPI, chart.spec), v.seriesLabel)
      void s.chartDataDialog(chart.spec, data, v.formatChartNumber)
    })
  }

  // Alt+Shift+T switches between the grid and the table view.
  window.addEventListener(
    'keydown',
    (e) => {
      if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey || e.code !== 'KeyT' || document.querySelector('dialog[open]')) return
      e.preventDefault()
      e.stopPropagation()
      setTableView(!tableOn)
    },
    true,
  )

  let remembered = false
  try {
    remembered = localStorage.getItem(KEY) === '1'
  } catch {
    // No saved choice.
  }
  if (remembered) requestAnimationFrame(() => setTableView(true))

  return { tableView: () => tableOn, setTableView, chartTable, refresh: queueRender }
}
