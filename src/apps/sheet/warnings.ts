// Data ▸ Warn before editing…: ranges whose cells ask for a confirmation
// before they are changed, against accidental edits (formulas of a grading
// sheet, a header row…). It is not a security feature: every editor holds the
// same edit key, so anyone with an edit link can confirm and change the
// cells. The ranges are kept in the shared document ('sheet-warnings').

import { CustomCommandExecutionError, type FUniver, type ICommandService, type IDisposable, type IRange } from '@univerjs/presets'
import { t } from '../../core/i18n'
import type { Session } from '../../core/session'
import { confirmDialog, el, showDialog, toast } from '../../ui/widgets'
import { toA1 } from './charts/model'
import { WORKBOOK_ID } from './univer'

export interface WarnRange {
  sheetId: string
  range: IRange
  author: string
  time: number
}

// Commands that change the content or format of the cells they target.
const EDITS =
  /^(sheet\.command\.(set-range-values|clear-selection-(content|format|all)|set-style|set-range-[a-z-]+|set-(text-color|background-color|border[a-z-]*|horizontal-text-align|vertical-text-align|text-wrap|text-rotation|bold|italic|underline|stroke|font-family|font-size|font-color)|reset-[a-z-]+-color|numfmt\..+|delete-range-move-(left|up)(-confirm)?|insert-range-move-(right|down)(-confirm)?|move-range|auto-fill|add-worksheet-merge[a-z-]*|remove-worksheet-merge|paste-[a-z-]+|sort-range[a-z-]*|split-text-to-columns|set-once-format-painter|apply-format-painter|insert-(float-image|cell-image)|add-hyper-link|update-hyper-link|remove-hyper-link)|univer\.command\.(paste|cut))$/
// Opening the cell editor (typing or double click on a cell): only a notice,
// as cancelling it leaves Univer's editor unusable; the edit asks when it is saved.
const OPEN_EDITOR = 'sheet.operation.set-cell-edit-visible'
// A confirmation is valid this long for a range.
const CONFIRMED_MS = 10 * 60 * 1000

const intersects = (a: IRange, b: IRange) => a.startRow <= b.endRow && b.startRow <= a.endRow && a.startColumn <= b.endColumn && b.startColumn <= a.endColumn

export interface EditWarnings {
  dialog: () => Promise<void>
  render: () => void
}

export function setupEditWarnings(session: Session, univerAPI: FUniver, commands: ICommandService): EditWarnings {
  const map = session.doc.getMap<WarnRange>('sheet-warnings')
  const confirmed = new Map<string, number>()
  let bypass = false
  let asking = false
  let marks: IDisposable[] = []

  const sheet = () => univerAPI.getActiveWorkbook()?.getActiveSheet()
  const selection = (): IRange[] => {
    const ranges = sheet()?.getSelection()?.getActiveRangeList?.()?.map((r) => r.getRange())
    const active = sheet()?.getSelection()?.getActiveRange()?.getRange()
    return ranges?.length ? ranges : active ? [active] : []
  }
  const targets = (id: string, params: Record<string, unknown> | undefined): { sheetId: string; ranges: IRange[] } | null => {
    const sheetId = String(params?.subUnitId ?? sheet()?.getSheetId() ?? '')
    if (params?.unitId && params.unitId !== WORKBOOK_ID) return null
    if (id === OPEN_EDITOR) {
      if (!params?.visible) return null
      const cell = sheet()?.getSelection()?.getCurrentCell?.()
      const r = cell ? { startRow: cell.startRow, endRow: cell.endRow, startColumn: cell.startColumn, endColumn: cell.endColumn } : selection()[0]
      return r ? { sheetId, ranges: [r] } : null
    }
    const own = (params?.range ?? params?.ranges ?? params?.targetRange ?? params?.toRange) as IRange | IRange[] | undefined
    const ranges = own ? (Array.isArray(own) ? own : [own]) : selection()
    return { sheetId, ranges: ranges.filter((r) => r && typeof r.startRow === 'number') }
  }
  const hit = (sheetId: string, ranges: IRange[]): [string, WarnRange] | undefined =>
    [...map.entries()].find(([id, w]) => w.sheetId === sheetId && ranges.some((r) => intersects(r, w.range)) && Date.now() - (confirmed.get(id) ?? 0) > CONFIRMED_MS)

  commands.beforeCommandExecuted((info, options) => {
    if (bypass || asking || !session.canEdit || options?.fromCollab || options?.onlyLocal) return
    if (info.id !== OPEN_EDITOR && !EDITS.test(info.id)) return
    const target = targets(info.id, info.params as Record<string, unknown> | undefined)
    const found = target && hit(target.sheetId, target.ranges)
    if (!found) return
    if (info.id === OPEN_EDITOR) {
      toast(t('These cells are marked “Warn before editing”'))
      return
    }
    void ask(found, info.id, info.params as object | undefined)
    // Cancels the command quietly (Univer returns false for this error).
    throw new CustomCommandExecutionError('Edit waits for confirmation')
  })

  async function ask([id, w]: [string, WarnRange], commandId: string, params: object | undefined): Promise<void> {
    asking = true
    let ok = false
    try {
      ok = await confirmDialog(t('Edit these cells?'), t('The range {range} is marked “Warn before editing”, so that it is not changed by accident. Edit it anyway?', { range: toA1(w.range) }), { confirmLabel: t('Edit anyway') })
    } finally {
      asking = false
    }
    if (!ok) return
    confirmed.set(id, Date.now())
    bypass = true
    try {
      await commands.executeCommand(commandId, params)
    } finally {
      bypass = false
    }
  }

  const render = () => {
    marks.forEach((m) => m.dispose())
    marks = []
    const current = sheet()
    if (!current) return
    for (const w of map.values()) {
      if (w.sheetId !== current.getSheetId()) continue
      try {
        const r = w.range
        marks.push(current.getRange(r.startRow, r.startColumn, r.endRow - r.startRow + 1, r.endColumn - r.startColumn + 1).highlight({ stroke: '#e37400', strokeWidth: 1, fill: 'rgba(227, 116, 0, 0.07)' }))
      } catch {
        // Range outside the sheet: nothing to draw.
      }
    }
  }
  map.observe(render)
  commands.onCommandExecuted((info) => {
    if (info.id === 'sheet.operation.set-worksheet-active') render()
  })

  async function dialog(): Promise<void> {
    const list = el('div', { class: 'version-list' })
    const refresh = () => {
      const workbook = univerAPI.getActiveWorkbook()
      const rows = [...map.entries()].map(([id, w]) => {
        const name = workbook?.getSheetBySheetId(w.sheetId)?.getSheetName() ?? '?'
        const remove = el('button', { type: 'button', textContent: t('Remove'), disabled: !session.canEdit })
        remove.addEventListener('click', () => session.doc.transact(() => map.delete(id)))
        return el('div', { class: 'version-row' }, el('div', { class: 'version-info' }, el('span', { class: 'version-label', textContent: `${name}!${toA1(w.range)}` }), el('span', { class: 'version-meta', textContent: w.author })), el('div', { class: 'version-actions' }, remove))
      })
      list.replaceChildren(...(rows.length ? rows : [el('p', { class: 'empty', textContent: t('No ranges are marked yet.') })]))
    }
    refresh()
    map.observe(refresh)
    const add = el('button', { type: 'button', textContent: t('Add the selected cells'), disabled: !session.canEdit })
    add.addEventListener('click', () => {
      const current = sheet()
      const ranges = selection()
      if (!current || !ranges.length) return
      session.doc.transact(() => {
        for (const range of ranges) {
          const r = { startRow: range.startRow, endRow: range.endRow, startColumn: range.startColumn, endColumn: range.endColumn }
          map.set(crypto.getRandomValues(new Uint32Array(2)).join('-'), { sheetId: current.getSheetId(), range: r, author: session.user.name, time: Date.now() })
        }
      })
      toast(t('Editing these cells now asks for a confirmation'))
    })
    const body = el(
      'div',
      { class: 'form' },
      el('p', { textContent: t('Changing a marked range asks for a confirmation first, so that formulas or headers are not changed by accident. Marked cells have an orange outline.') }),
      el('p', { class: 'dialog-note', textContent: t('This is not a security feature: everyone with an edit link can confirm and change the cells. To stop others from changing the spreadsheet, share a view link instead.') }),
      add,
      list,
    )
    await showDialog(t('Warn before editing'), body, [{ label: t('Close'), value: 'ok', primary: true }], true)
    map.unobserve(refresh)
  }

  return { dialog, render }
}

