// Spelling and grammar in the spreadsheet: Tools ▸ Spelling and grammar… (F7)
// walks through the text cells of every sheet (formulas, numbers and booleans
// are skipped), selecting each cell it stops at.

import type { FUniver } from '@univerjs/presets'
import type { ICellData, IDocumentData, Nullable } from '@univerjs/core'
import type { Session } from '../../core/session'
import { openSpellingDialog, type SpellItem } from '../../ui/spell/dialog'
import { spellingMenuItems, registerSpellingKey } from '../../ui/spell/menu'
import { docLanguage } from '../../ui/spell/service'
import type { MenuEntry } from '../../ui/widgets'
import { toA1 } from './charts/model'

const STRING = 1
const FORCE_STRING = 4

interface CellItem extends SpellItem {
  sheetId: string
  row: number
  col: number
}

// Text of a cell as the checker sees it, or null for formulas, numbers, booleans and empty cells.
export function cellText(cell: Nullable<ICellData>): string | null {
  if (!cell || cell.f || cell.si) return null
  const stream = cell.p?.body?.dataStream
  if (typeof stream === 'string') return stream.replace(/\r?\n$/, '').replace(/\r/g, '\n')
  if (typeof cell.v !== 'string' || !cell.v.trim()) return null
  if (cell.t !== undefined && cell.t !== null && cell.t !== STRING && cell.t !== FORCE_STRING) return null
  return cell.v
}

// Replaces text in a rich text cell, keeping its formatting runs.
function replaceInRichText(p: IDocumentData, from: number, to: number, text: string): IDocumentData {
  const doc = structuredClone(p)
  const body = doc.body!
  const delta = text.length - (to - from)
  const map = (i: number) => (i <= from ? i : i >= to ? i + delta : from + text.length)
  body.dataStream = body.dataStream.slice(0, from) + text + body.dataStream.slice(to)
  body.textRuns = body.textRuns?.map((r) => ({ ...r, st: map(r.st), ed: map(r.ed) })).filter((r) => r.ed > r.st)
  body.paragraphs = body.paragraphs?.map((x) => ({ ...x, startIndex: map(x.startIndex) }))
  body.customRanges = body.customRanges?.map((r) => ({ ...r, startIndex: map(r.startIndex), endIndex: map(r.endIndex) }))
  body.customDecorations = body.customDecorations?.map((r) => ({ ...r, startIndex: map(r.startIndex), endIndex: map(r.endIndex) }))
  return doc
}

export function sheetSpelling(session: Session, univerAPI: FUniver): { menu: () => MenuEntry[]; open: () => void } {
  const editable = () => session.canEdit
  const language = docLanguage(session.doc, editable)
  const workbook = () => univerAPI.getActiveWorkbook()

  const items = (): CellItem[] => {
    const wb = workbook()
    if (!wb) return []
    const out: CellItem[] = []
    for (const sheet of wb.getSheets()) {
      const cells: CellItem[] = []
      sheet.getSheet().getCellMatrix().forValue((row, col, cell) => {
        const text = cellText(cell)
        if (text === null) return
        const a1 = toA1({ startRow: row, startColumn: col, endRow: row, endColumn: col })
        cells.push({ key: `${sheet.getSheetId()}!${a1}`, label: `${sheet.getSheetName()} · ${a1}`, text, context: 'table', sheetId: sheet.getSheetId(), row, col })
      })
      cells.sort((a, b) => a.row - b.row || a.col - b.col)
      out.push(...cells)
    }
    return out
  }

  // The active cell of the active sheet, or the next text cell after it.
  const start = (list: SpellItem[]) => {
    const sheet = workbook()?.getActiveSheet()
    if (!sheet) return 0
    const cell = sheet.getSelection()?.getCurrentCell()
    const id = sheet.getSheetId()
    const row = cell?.actualRow ?? 0
    const col = cell?.actualColumn ?? 0
    const cells = list as CellItem[]
    const first = cells.findIndex((c) => c.sheetId === id)
    if (first < 0) return 0
    const at = cells.findIndex((c) => c.sheetId === id && (c.row > row || (c.row === row && c.col >= col)))
    return at >= 0 ? at : first
  }

  const reveal = (item: SpellItem) => {
    const c = item as CellItem
    const wb = workbook()
    if (!wb) return
    if (wb.getActiveSheet().getSheetId() !== c.sheetId) wb.setActiveSheet(c.sheetId)
    wb.getSheetBySheetId(c.sheetId)?.getRange(c.row, c.col).activate()
  }

  const replace = (item: SpellItem, from: number, to: number, text: string): boolean => {
    const c = item as CellItem
    const sheet = workbook()?.getSheetBySheetId(c.sheetId)
    if (!sheet || !editable()) return false
    const cell = sheet.getSheet().getCellRaw(c.row, c.col)
    const current = cellText(cell)
    if (current === null || current.slice(from, to) !== item.text.slice(from, to)) return false
    const range = sheet.getRange(c.row, c.col)
    if (cell?.p?.body) range.setRichTextValueForCell(replaceInRichText(cell.p, from, to, text))
    else range.setValue({ v: current.slice(0, from) + text + current.slice(to), t: cell?.t === FORCE_STRING ? FORCE_STRING : STRING })
    return true
  }

  const open = () =>
    openSpellingDialog({
      items,
      start,
      reveal,
      replace,
      editable,
      language,
      close: () => document.querySelector<HTMLElement>('.univer-render-canvas, canvas')?.focus(),
    })
  registerSpellingKey(open)
  return { open, menu: () => spellingMenuItems({ open, language, editable }) }
}
