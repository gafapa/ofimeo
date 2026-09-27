// State-based collaboration for the diagram editor over Yjs.
//
// Yjs holds pages → cells → fields (see model.ts), so concurrent edits merge
// per field (one person moves a shape while another recolors it) and every
// replica converges. Page names and order live in one map; the cells of each
// page in a top-level map of their own, so pages created concurrently with the
// same id (the blank first page) merge instead of replacing each other.
// The graph shows one page at a time:
// - local edits: each model change marks cells; their records are compared
//   with Yjs and only changed fields are written;
// - remote edits: changed cells of the shown page are applied to the model in
//   one update, kept out of the local undo history.

import * as Y from 'yjs'
import { Cell, InternalEvent, type EventObject, type UndoableEdit } from '@maxgraph/core'
import { cellToRecord, geometryFromJson, recordToCell, styleFromString, type DataCell, type EditorGraph } from './graph'
import { CELL_FIELDS, PAGE_ATTRS, emptyPage, type CellRecord, type PageAttrs, type PageRecord } from './model'

type FieldMap = Y.Map<string | number>
type CellsMap = Y.Map<FieldMap>
type PageMeta = Y.Map<string | number> // name, pos

const PAGES_KEY = 'diagram-pages'
export const cellsKey = (pageId: string) => `diagram-cells:${pageId}`

export interface PageInfo {
  id: string
  name: string
}

export class DiagramSync {
  readonly pages: Y.Map<PageMeta>
  page = ''
  // True while remote changes are applied to the model.
  applying = false
  // An empty document shows a local blank page, written to Yjs only on the first
  // edit: someone opening a shared link before it syncs must not add a page.
  private virtual = false
  private observed: CellsMap | null = null
  private readonly onCells = (events: Y.YEvent<Y.AbstractType<unknown>>[], tr: Y.Transaction) => {
    if (tr.origin !== this) this.applyRemote(events)
  }
  onPagesChange: () => void = () => {}
  onPageShown: () => void = () => {}

  constructor(
    private readonly doc: Y.Doc,
    private readonly graph: EditorGraph,
    // The page an empty document starts with (fixed ids, so replicas agree).
    private readonly blank: (id?: string, name?: string) => PageRecord = emptyPage,
  ) {
    this.pages = doc.getMap<PageMeta>(PAGES_KEY)
  }

  // ---------- Whole-document access (import / export) ----------

  static setPages(doc: Y.Doc, pages: PageRecord[]): void {
    doc.transact(() => pages.forEach((page, i) => writePage(doc, page, i)))
  }

  static readPages(doc: Y.Doc): PageRecord[] {
    const pages = doc.getMap<PageMeta>(PAGES_KEY)
    return orderedPages(pages).map(({ id, name }) => ({ id, name, ...readAttrs(pages.get(id)), cells: readCells(doc.getMap<FieldMap>(cellsKey(id))) }))
  }

  // ---------- Pages ----------

  pageList(): PageInfo[] {
    if (this.virtual) return [{ id: this.page, name: this.blank().name }]
    return orderedPages(this.pages)
  }

  // Writes the blank page shown for an empty document (fixed ids: replicas agree).
  materialize(): void {
    if (!this.virtual) return
    this.virtual = false
    this.doc.transact(() => writePage(this.doc, this.blank(this.page), 0), this)
  }

  addPage(name: string, cells?: CellRecord[], attrs?: PageAttrs): string {
    this.materialize()
    const page: PageRecord = { ...emptyPage(crypto.randomUUID(), name), ...attrs }
    if (cells) page.cells = cells
    const pos = Math.max(0, ...[...this.pages.values()].map((p) => Number(p.get('pos')) || 0)) + 1
    this.doc.transact(() => writePage(this.doc, page, pos), this)
    return page.id
  }

  renamePage(id: string, name: string): void {
    this.materialize()
    this.doc.transact(() => this.pages.get(id)?.set('name', name), this)
    this.onPagesChange()
  }

  deletePage(id: string): void {
    if (this.pages.size <= 1) return
    const next = this.pageList().find((p) => p.id !== id)!.id
    this.doc.transact(() => {
      this.pages.delete(id)
      const cells = this.doc.getMap<FieldMap>(cellsKey(id))
      for (const key of [...cells.keys()]) cells.delete(key)
    }, this)
    if (id === this.page) this.showPage(next)
    else this.onPagesChange()
  }

  // Moves a page before another one (or to the end with null).
  movePage(id: string, before: string | null): void {
    const list = this.pageList().filter((p) => p.id !== id)
    const index = before ? list.findIndex((p) => p.id === before) : list.length
    const pos = (i: number) => Number(this.pages.get(list[i]?.id)?.get('pos'))
    const prev = index > 0 ? pos(index - 1) : pos(0) - 2
    const next = index < list.length ? pos(index) : prev + 2
    this.doc.transact(() => this.pages.get(id)?.set('pos', (prev + next) / 2), this)
    this.onPagesChange()
  }

  // Page settings (background, page size) of a page.
  pageAttrs(id = this.page): PageAttrs {
    return readAttrs(this.pages.get(id))
  }

  setPageAttrs(values: Partial<Record<keyof PageAttrs, string | number | null>>, id = this.page): void {
    this.materialize()
    this.doc.transact(() => {
      const meta = this.pages.get(id)
      if (!meta) return
      for (const [k, v] of Object.entries(values)) {
        if (v === null || v === undefined || v === '') meta.delete(k)
        else meta.set(k, v)
      }
    }, this)
    this.onPagesChange()
  }

  pageRecords(id: string): CellRecord[] {
    if (this.virtual && id === this.page) return this.blank(id).cells
    return readCells(this.doc.getMap<FieldMap>(cellsKey(id)))
  }

  // ---------- Lifecycle ----------

  start(): void {
    const model = this.graph.getDataModel()
    model.addListener(InternalEvent.CHANGE, (_sender: unknown, evt: EventObject) => {
      if (this.applying) return
      const edit = evt.getProperty('edit') as UndoableEdit
      this.pushLocal(edit.changes)
    })
    this.pages.observeDeep((_events, tr) => {
      if (tr.origin === this) return
      if (this.virtual && this.pages.size) {
        // The shared diagram arrived before any local edit: show it instead of the blank page.
        this.virtual = false
        this.showPage(this.pageList()[0].id)
      } else if (!this.virtual && !this.pages.has(this.page) && this.pages.size) this.showPage(this.pageList()[0].id)
      else this.onPagesChange()
    })
    if (this.pages.size) this.showPage(this.pageList()[0].id)
    else {
      this.virtual = true
      this.showPage(this.blank().id)
    }
  }

  showPage(id: string): void {
    if (!this.pages.has(id) && !(this.virtual && id === this.blank().id)) return
    this.page = id
    this.graph.pageId = id
    this.observed?.unobserveDeep(this.onCells)
    this.observed = this.cellsMap()
    this.observed.observeDeep(this.onCells)
    this.rebuild()
    this.onPagesChange()
    this.onPageShown()
  }

  private cellsMap(): CellsMap {
    return this.doc.getMap<FieldMap>(cellsKey(this.page))
  }

  // Replaces the model content with the shown page.
  private rebuild(): void {
    const list = this.pageRecords(this.page)
    const records = new Map(list.map((r) => [r.id, r]))
    const rootRec = list.find((r) => !r.parent) ?? { id: '0' }
    const model = this.graph.getDataModel()
    this.graph.stopEditing(true)
    this.graph.clearSelection()
    this.applying = true
    try {
      model.beginUpdate()
      try {
        const root = new Cell()
        root.setId(rootRec.id)
        model.setRoot(root)
        this.applyCells(list.filter((r) => r !== rootRec).map((r) => r.id), records)
      } finally {
        model.endUpdate()
      }
    } finally {
      this.applying = false
    }
  }

  // ---------- Local → Yjs ----------

  private pushLocal(changes: unknown[]): void {
    this.materialize()
    const cells = this.cellsMap()
    const model = this.graph.getDataModel()
    const touched = new Set<string>()
    const removed = new Set<string>()
    const orderOf = new Set<Cell>()

    const markTree = (cell: Cell, into: Set<string>) => {
      const id = cell.getId()
      if (id) into.add(id)
      for (let i = 0; i < cell.getChildCount(); i++) markTree(cell.getChildAt(i), into)
    }

    for (const change of changes as Record<string, unknown>[]) {
      if ('child' in change) {
        // ChildChange: added, removed or moved to another parent/index.
        const child = change.child as Cell
        const parent = change.parent as Cell | null
        const previous = change.previous as Cell | null
        if (parent) {
          markTree(child, touched)
          orderOf.add(parent)
        } else markTree(child, removed)
        if (previous) orderOf.add(previous)
      } else if ('root' in change) {
        // RootChange only comes from rebuilds, which never reach this point.
        continue
      } else if ('cell' in change && change.cell) {
        const cell = change.cell as Cell
        if (cell.getId()) touched.add(cell.getId()!)
      }
    }
    // Sibling order is stored as `previous`: every child of a reordered parent may change.
    for (const parent of orderOf) {
      if (!parent.getId() || model.getCell(parent.getId()!) !== parent) continue
      for (let i = 0; i < parent.getChildCount(); i++) touched.add(parent.getChildAt(i).getId()!)
    }

    this.doc.transact(() => {
      for (const id of removed) if (!model.getCell(id)) cells.delete(id)
      for (const id of touched) {
        const cell = model.getCell(id) as DataCell | null
        if (!cell) {
          cells.delete(id)
          continue
        }
        writeRecord(cells, cellToRecord(cell))
      }
    }, this)
  }

  // ---------- Yjs → local ----------

  private applyRemote(events: Y.YEvent<Y.AbstractType<unknown>>[]): void {
    if (this.virtual) return // handled by the page list observer
    const dirty = new Set<string>()
    for (const event of events) {
      if (event.path.length === 0) for (const key of (event as Y.YMapEvent<unknown>).keysChanged) dirty.add(key)
      else dirty.add(String(event.path[0]))
    }
    if (!dirty.size) return
    const records = new Map(readCells(this.cellsMap()).map((r) => [r.id, r]))
    const model = this.graph.getDataModel()
    this.applying = true
    try {
      model.beginUpdate()
      try {
        this.applyCells([...dirty], records)
      } finally {
        model.endUpdate()
      }
    } finally {
      this.applying = false
    }
  }

  // Brings the given cells of the shown page in line with Yjs. Runs inside a model update.
  private applyCells(ids: string[], records: Map<string, CellRecord>): void {
    const model = this.graph.getDataModel()
    const root = model.getRoot()!

    const reorder = new Set<string>()
    const pending = new Map<string, DataCell>()

    // Removed cells.
    for (const id of ids) {
      if (records.has(id)) continue
      const cell = model.getCell(id)
      // Children moved elsewhere concurrently are changed too, so they are re-created below.
      if (cell && cell !== root) model.remove(cell)
    }

    // Cells to create or update, parents before children.
    const depth = (id: string, seen = new Set<string>()): number => {
      const parent = records.get(id)?.parent
      if (!parent || seen.has(id)) return 0
      seen.add(id)
      return 1 + depth(parent, seen)
    }
    const present = ids.filter((id) => records.has(id) && id !== root.getId()).sort((a, b) => depth(a) - depth(b))

    for (const id of present) {
      const rec = records.get(id)!
      let cell = model.getCell(id) as DataCell | null
      if (!cell) {
        cell = recordToCell({ ...rec, source: undefined, target: undefined })
        pending.set(id, cell)
      }
      const parent = rec.parent ? (model.getCell(rec.parent) ?? pending.get(rec.parent)) : null
      if (!parent) continue // orphan: its parent is gone
      if (cell.getParent() !== parent || pending.has(id)) {
        const oldParent = cell.getParent()?.getId()
        if (oldParent) reorder.add(oldParent)
        model.add(parent, cell, parent.getChildCount())
        pending.delete(id)
      }
      reorder.add(parent.getId()!)

      const value = rec.value ?? ''
      if ((cell.getValue() ?? '') !== value) model.setValue(cell, value)
      if (styleString(cell) !== (rec.style ?? '')) model.setStyle(cell, styleFromString(rec.style))
      const geometry = cellToRecord(cell).geometry
      if (geometry !== rec.geometry) model.setGeometry(cell, geometryFromJson(rec.geometry)!)
      if (cell.isVisible() !== (rec.visible !== 0)) model.setVisible(cell, rec.visible !== 0)
      if (cell.isCollapsed() !== (rec.collapsed === 1)) model.setCollapsed(cell, rec.collapsed === 1)
      cell.setConnectable(rec.connectable !== 0)
      cell.woData = rec.data
    }

    // Terminals, once every cell exists.
    for (const id of present) {
      const rec = records.get(id)!
      const cell = model.getCell(id)
      if (!cell?.isEdge()) continue
      const source = rec.source ? model.getCell(rec.source) : null
      const target = rec.target ? model.getCell(rec.target) : null
      if (cell.getTerminal(true) !== source) model.setTerminal(cell, source, true)
      if (cell.getTerminal(false) !== target) model.setTerminal(cell, target, false)
    }
    // Edges connected to cells that were just created elsewhere in this batch.
    for (const [id, rec] of records) {
      if (!rec.edge || present.includes(id)) continue
      const cell = model.getCell(id)
      if (!cell) continue
      if (rec.source && !cell.getTerminal(true) && model.getCell(rec.source)) model.setTerminal(cell, model.getCell(rec.source), true)
      if (rec.target && !cell.getTerminal(false) && model.getCell(rec.target)) model.setTerminal(cell, model.getCell(rec.target), false)
    }

    // Child order from the `previous` chains.
    for (const parentId of reorder) {
      const parent = model.getCell(parentId) ?? (parentId === root.getId() ? root : null)
      if (!parent) continue
      const childIds = [...records.values()].filter((r) => r.parent === parentId).map((r) => r.id)
      const ordered = orderByPrevious(childIds, (id) => records.get(id)?.previous)
      let index = 0
      for (const id of ordered) {
        const child = model.getCell(id)
        if (!child || child.getParent() !== parent) continue
        if (parent.getChildAt(index) !== child) model.add(parent, child, index)
        index++
      }
    }
  }
}

function styleString(cell: Cell): string {
  return cellToRecord(cell).style ?? ''
}

// ---------- Yjs helpers ----------

function writePage(doc: Y.Doc, page: PageRecord, pos: number): void {
  const attrs = PAGE_ATTRS.filter((k) => page[k] !== undefined && page[k] !== '').map((k): [string, string | number] => [k, page[k]!])
  doc.getMap<PageMeta>(PAGES_KEY).set(page.id, new Y.Map<string | number>([['name', page.name], ['pos', pos], ...attrs]))
  const cells = doc.getMap<FieldMap>(cellsKey(page.id))
  for (const rec of page.cells) writeRecord(cells, rec)
}

function readAttrs(meta: PageMeta | undefined): PageAttrs {
  const out: PageAttrs = {}
  if (!meta) return out
  const bg = meta.get('background')
  if (typeof bg === 'string' && bg) out.background = bg
  for (const k of ['pageWidth', 'pageHeight'] as const) {
    const v = Number(meta.get(k))
    if (v > 0) out[k] = v
  }
  return out
}

function readCells(cells: CellsMap): CellRecord[] {
  return [...cells.entries()].map(([id, fields]) => readRecord(id, fields))
}

function recordEntries(rec: CellRecord): [string, string | number][] {
  const out: [string, string | number][] = []
  for (const field of CELL_FIELDS) if (rec[field] !== undefined) out.push([field, rec[field] as string | number])
  return out
}

function readRecord(id: string, fields: FieldMap): CellRecord {
  const rec: Record<string, unknown> = { id }
  for (const field of CELL_FIELDS) {
    const v = fields.get(field)
    if (v !== undefined) rec[field] = v
  }
  return rec as unknown as CellRecord
}

function writeRecord(cells: CellsMap, rec: CellRecord): void {
  const fields = cells.get(rec.id)
  if (!fields) {
    cells.set(rec.id, new Y.Map<string | number>(recordEntries(rec)))
    return
  }
  for (const field of CELL_FIELDS) {
    const value = rec[field]
    if (value === undefined) {
      if (fields.has(field)) fields.delete(field)
    } else if (fields.get(field) !== value) fields.set(field, value as string | number)
  }
}

function orderedPages(pages: Y.Map<PageMeta>): PageInfo[] {
  return [...pages.entries()]
    .map(([id, page]) => ({ id, name: String(page.get('name') ?? ''), pos: Number(page.get('pos')) || 0 }))
    .sort((a, b) => a.pos - b.pos || (a.id < b.id ? -1 : 1))
    .map(({ id, name }) => ({ id, name }))
}

// Deterministic sibling order from `previous` links; tolerates forks and cycles.
export function orderByPrevious(ids: string[], previousOf: (id: string) => string | undefined): string[] {
  const set = new Set(ids)
  const after = new Map<string, string[]>()
  for (const id of ids) {
    const prev = previousOf(id)
    const key = prev && set.has(prev) && prev !== id ? prev : ''
    const list = after.get(key) ?? []
    list.push(id)
    after.set(key, list)
  }
  const out: string[] = []
  const seen = new Set<string>()
  const walk = (key: string) => {
    for (const id of (after.get(key) ?? []).sort()) {
      if (seen.has(id)) continue
      seen.add(id)
      out.push(id)
      walk(id)
    }
  }
  walk('')
  // Cycles (concurrent reorders) leave some ids unreached: append them in id order.
  for (const id of [...ids].sort()) {
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
    walk(id)
  }
  return out
}
