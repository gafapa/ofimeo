// Spelling and grammar over the labels of every page (diagrams) or slide
// (presentations, which add their speaker notes): Tools ▸ Spelling and
// grammar… (F7). Labels are checked as they are typed by graph.ts.

import type { Cell } from '@maxgraph/core'
import type * as Y from 'yjs'
import type { Session } from '../../core/session'
import { openSpellingDialog, type SpellItem, type SpellSource } from '../../ui/spell/dialog'
import { htmlText, replaceInHtml } from '../../ui/spell/inline'
import { registerSpellingKey, spellingMenuItems } from '../../ui/spell/menu'
import { docLanguage, type DocLanguage } from '../../ui/spell/service'
import { uiZoom, type MenuEntry } from '../../ui/widgets'
import type { DiagramEditor } from './editor'
import { cellsKey } from './sync'
import { getStyleValue, parseGeometry, type CellRecord } from './model'

interface LabelItem extends SpellItem {
  page: string
  cell?: string
  // Other items (speaker notes) handled by the app.
  extra?: unknown
}

export interface GraphSpellOptions {
  // "Page 2" / "Slide 3" for the dialog.
  pageLabel: (name: string, index: number) => string
  // Items after the labels of a page (speaker notes).
  extraItems?: (pageId: string, index: number) => (SpellItem & { extra: unknown })[]
  replaceExtra?: (item: SpellItem & { page: string; extra: unknown }, from: number, to: number, text: string) => boolean
  revealExtra?: (item: SpellItem & { page: string; extra: unknown }, from: number, to: number) => void
  rectsExtra?: (item: SpellItem & { page: string; extra: unknown }, from: number, to: number) => DOMRect[]
  // Shows a page (default: the editor's own page switch).
  showPage?: (id: string) => void
}

const isHtml = (style: string | undefined) => getStyleValue(style, 'html') === '1'
const skip = (r: CellRecord) => !r.parent || !r.value || getStyleValue(r.style, 'slideEq') === '1' || getStyleValue(r.style, 'shape') === 'image'

export function graphSpelling(session: Session, editor: DiagramEditor, o: GraphSpellOptions): { menu: () => MenuEntry[]; open: () => void; language: DocLanguage } {
  const { graph, model, sync } = editor
  const editable = () => session.canEdit && !editor.readOnly
  const language = docLanguage(session.doc, editable)
  const showPage = (id: string) => (o.showPage ? o.showPage(id) : id !== sync.page && sync.showPage(id))

  const items = (): SpellItem[] => {
    const out: SpellItem[] = []
    sync.pageList().forEach((page, index) => {
      const label = o.pageLabel(page.name, index)
      // Labels in reading order: top to bottom, then left to right.
      const records = sync.pageRecords(page.id).filter((r) => !skip(r))
      const pos = (r: CellRecord) => parseGeometry(r.geometry) ?? { x: 0, y: 0 }
      records.sort((a, b) => pos(a).y - pos(b).y || pos(a).x - pos(b).x)
      for (const r of records) {
        const text = isHtml(r.style) ? htmlText(r.value!) : r.value!
        if (!text.trim()) continue
        out.push({ key: `${page.id}/${r.id}`, label, text, page: page.id, cell: r.id } as LabelItem)
      }
      for (const extra of o.extraItems?.(page.id, index) ?? []) out.push({ ...extra, page: page.id } as LabelItem)
    })
    return out
  }

  const start = (list: SpellItem[]) => {
    const labels = list as LabelItem[]
    const selected = editor.selection()[0]?.getId()
    const at = selected ? labels.findIndex((i) => i.page === sync.page && i.cell === selected) : -1
    if (at >= 0) return at
    const first = labels.findIndex((i) => i.page === sync.page)
    return first >= 0 ? first : 0
  }

  const reveal = (item: SpellItem, from: number, to: number) => {
    const i = item as LabelItem
    if (graph.isEditing()) graph.stopEditing(false)
    showPage(i.page)
    if (i.extra !== undefined) return o.revealExtra?.(i as never, from, to)
    const cell = model.getCell(i.cell!)
    if (!cell) return
    graph.setSelectionCell(cell)
    centerCell(cell)
  }

  // Scrolls the cell into view when it is hidden.
  const centerCell = (cell: Cell) => {
    const state = graph.getView().getState(cell)
    const canvas = graph.container
    if (!state || !canvas) return
    const view = graph.getView()
    const rect = canvas.getBoundingClientRect()
    const z = uiZoom()
    const width = rect.width / z
    const height = rect.height / z
    if (state.x < 0 || state.y < 0 || state.x + state.width > width || state.y + state.height > height) {
      const s = view.scale
      view.setTranslate(view.translate.x + (width / 2 - state.getCenterX()) / s, view.translate.y + (height / 2 - state.getCenterY()) / s)
    }
  }

  const replace = (item: SpellItem, from: number, to: number, text: string): boolean => {
    const i = item as LabelItem
    if (!editable()) return false
    if (i.extra !== undefined) return o.replaceExtra?.(i as never, from, to, text) ?? false
    const record = sync.pageRecords(i.page).find((r) => r.id === i.cell)
    if (!record?.value) return false
    const html = isHtml(record.style)
    const plain = html ? htmlText(record.value) : record.value
    if (plain.slice(from, to) !== item.text.slice(from, to)) return false
    const value = html ? replaceInHtml(record.value, from, to, text) : plain.slice(0, from) + text + plain.slice(to)
    if (value === null) return false
    if (i.page === sync.page) {
      // The shown page: through the model, so it can be undone.
      const cell = model.getCell(i.cell!)
      if (!cell) return false
      if (graph.isEditing()) graph.stopEditing(false)
      sync.materialize()
      model.setValue(cell, value)
    } else {
      const fields = session.doc.getMap<Y.Map<string | number>>(cellsKey(i.page)).get(i.cell!)
      if (!fields) return false
      fields.set('value', value)
    }
    return true
  }

  // Labels are checked as they are typed in the document language (graph.ts).
  const setLang = () => graph.container?.setAttribute('lang', language.tag())
  setLang()
  language.onChange(setLang)

  const rects = (item: SpellItem, from: number, to: number): DOMRect[] => {
    const i = item as LabelItem
    return i.extra !== undefined ? (o.rectsExtra?.(i as never, from, to) ?? []) : []
  }

  const source: SpellSource = { items, start, reveal, rects, replace, editable, language, close: () => graph.container?.focus() }
  const open = () => openSpellingDialog(source)
  registerSpellingKey(open)
  return { open, language, menu: () => spellingMenuItems({ open, language, editable }) }
}
