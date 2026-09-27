// Print layout. Every block of the continuous editor is absolutely positioned
// on its page (node decorations with left/right/top), so pages can differ in
// size and orientation per section and blocks can flow into text columns.
// Page sheets, headers, footers, footnotes and column separators are drawn by
// the app in layers around the editor (see Layout.pages). Blocks are not split
// across pages; lists, quotes and splittable atoms (table of contents,
// bibliography: children marked [data-page-unit]) are laid out child by child.

import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { DEFAULT_COLUMNS, pageDimensionsMm, samePageSize, sectionFromAttrs, type Columns, type PageSettings, type Section } from './formats/types'

export const PAGE_GAP_PX = 24
const MM_TO_PX = 96 / 25.4
// Containers whose children may be placed on different pages or columns.
const SPLITTABLE = new Set(['bulletList', 'orderedList', 'taskList', 'blockquote'])
const NOTES_SEPARATOR = 16

export interface PageGeometry {
  width: number // px
  height: number
  // Exact size in PDF points (px values are rounded).
  widthPt: number
  heightPt: number
  margins: { top: number; right: number; bottom: number; left: number }
}

export interface ColumnLine {
  x: number // page-relative
  top: number
  bottom: number
}

export interface PageBox {
  index: number
  section: number
  // Position of the sheet within the paper.
  x: number
  y: number
  geo: PageGeometry
  notes: string[]
  firstNote: number
  lines: ColumnLine[]
}

export interface Layout {
  pages: PageBox[]
  width: number
  height: number
  // Paper position (page, y) of each heading, by document position.
  anchors: Map<number, { page: number; y: number }>
}

interface Placement {
  top: number // paper y of the border box
  left: number // paper x of the column
  width: number // column width
  mt: number // the block's own top margin (absolute boxes are placed by their margin box)
  insetL: number // padding of enclosing lists and quotes
  insetR: number
}

interface PluginValue {
  layout: Layout
  places: Map<number, Placement>
  decorations: DecorationSet
}

export const paginationKey = new PluginKey<PluginValue>('pagination')

export function mmToPx(mm: number): number {
  return mm * MM_TO_PX
}

export function pageGeometry(page: PageSettings): PageGeometry {
  const { width, height } = pageDimensionsMm(page)
  const m = page.margins
  return {
    width: Math.round(mmToPx(width)),
    height: Math.round(mmToPx(height)),
    widthPt: (width / 25.4) * 72,
    heightPt: (height / 25.4) * 72,
    margins: { top: Math.round(mmToPx(m.top)), right: Math.round(mmToPx(m.right)), bottom: Math.round(mmToPx(m.bottom)), left: Math.round(mmToPx(m.left)) },
  }
}

export interface PaginationOptions {
  // Settings of the first section (later sections come from `sectionBreak` nodes).
  firstSection: () => { page: PageSettings; columns: Columns }
  // Gap between sheets (0 while printing).
  gap: () => number
  onLayout: (layout: Layout) => void
}

const EMPTY_LAYOUT: Layout = { pages: [], width: 794, height: 1123, anchors: new Map() }

export const Pagination = Extension.create<PaginationOptions>({
  name: 'pagination',
  addOptions: () => ({
    firstSection: () => ({ page: { size: 'A4', orientation: 'portrait', margins: { top: 25, right: 25, bottom: 25, left: 25 } }, columns: DEFAULT_COLUMNS }),
    gap: () => PAGE_GAP_PX,
    onLayout: () => {},
  }),
  addProseMirrorPlugins() {
    const options = this.options
    return [
      new Plugin<PluginValue>({
        key: paginationKey,
        state: {
          init: () => ({ layout: EMPTY_LAYOUT, places: new Map(), decorations: DecorationSet.empty }),
          apply(tr, value, _old, state) {
            const next = tr.getMeta(paginationKey) as { layout: Layout; places: Map<number, Placement> } | undefined
            if (next) return { ...next, decorations: buildDecorations(state, next.layout, next.places) }
            if (!tr.docChanged) return value
            return { ...value, decorations: value.decorations.map(tr.mapping, tr.doc) }
          },
        },
        props: {
          decorations: (state) => paginationKey.getState(state)?.decorations,
          attributes: { class: 'paged' },
        },
        view: (view) => new PaginationView(view, options),
      }),
    ]
  },
})

const views = new WeakMap<EditorView, PaginationView>()

// Forces a new layout pass (e.g. after page setup or header changes).
export function relayout(view: EditorView): void {
  views.get(view)?.run(true)
}

// The current layout of a view (pages and their positions).
export function currentLayout(view: EditorView): Layout {
  return views.get(view)?.latest ?? EMPTY_LAYOUT
}

// Sections of the document: the first from the options, then one per top-level section break.
export function sectionsOf(doc: PMNode, first: { page: PageSettings; columns: Columns }): Section[] {
  const out: Section[] = [{ page: first.page, columns: first.columns, start: 'nextPage' }]
  doc.forEach((node) => {
    if (node.type.name === 'sectionBreak') out.push(sectionFromAttrs(node.attrs, out[out.length - 1].page))
  })
  return out
}

// Index of the section that contains a document position.
export function sectionAt(doc: PMNode, pos: number): number {
  let index = 0
  doc.forEach((node, offset) => {
    if (node.type.name === 'sectionBreak' && offset < pos) index++
  })
  return index
}

class PaginationView {
  private frame = 0
  private queued = false
  private observer: ResizeObserver
  private observed = new WeakSet<Element>()
  private noteHeights = new Map<string, number>()
  private measurer: HTMLElement
  private passes = 0
  private lastSignature = ''
  latest: Layout = EMPTY_LAYOUT

  constructor(
    private view: EditorView,
    private options: PaginationOptions,
  ) {
    this.measurer = document.createElement('div')
    this.measurer.className = 'page-notes measure'
    // Measure inside the paper so notes inherit the document fonts.
    ;(view.dom.parentElement ?? document.body).append(this.measurer)
    // Images load asynchronously and fonts may swap: re-measure on size changes.
    this.observer = new ResizeObserver(() => this.schedule())
    this.observer.observe(view.dom)
    view.dom.addEventListener('load', () => this.schedule(), true)
    document.fonts?.addEventListener?.('loadingdone', () => this.run(true))
    views.set(view, this)
    this.run()
  }

  update(view: EditorView, prev: EditorState) {
    this.view = view
    if (!prev.doc.eq(view.state.doc)) this.run()
  }

  // Measures before the next paint (microtask) so new blocks never show unplaced.
  run(reset = false) {
    if (reset) {
      this.noteHeights.clear()
      this.lastSignature = ''
    }
    if (this.queued) return
    this.queued = true
    queueMicrotask(() => {
      this.queued = false
      this.passes = 0
      this.measure()
    })
  }

  schedule() {
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => {
      this.passes = 0
      this.measure()
    })
  }

  destroy() {
    cancelAnimationFrame(this.frame)
    this.observer.disconnect()
    this.measurer.remove()
  }

  private measure() {
    const { view } = this
    if (!view.dom.isConnected) return
    const first = this.options.firstSection()
    const sections = sectionsOf(view.state.doc, first)
    const width = Math.max(...sections.map((s) => pageGeometry(s.page).width))
    const base = pageGeometry(first.page)
    // Default horizontal box for blocks that have not been placed yet.
    view.dom.style.setProperty('--content-left', `${(width - base.width) / 2 + base.margins.left}px`)
    view.dom.style.setProperty('--content-right', `${(width - base.width) / 2 + base.margins.right}px`)

    const units = collectUnits(view)
    for (const u of units) {
      if (!this.observed.has(u.dom)) {
        this.observed.add(u.dom)
        this.observer.observe(u.dom)
      }
    }
    const engine = new Engine(sections, width, this.options.gap(), (text, w) => this.noteHeight(text, w))
    const { layout, places, unplaced } = engine.run(units)
    applySubUnits(units, places)

    const signature = layoutSignature(layout, places)
    const changed = signature !== this.lastSignature
    this.lastSignature = signature
    if (changed || unplaced) view.dispatch(view.state.tr.setMeta(paginationKey, { layout, places }).setMeta('addToHistory', false))
    this.latest = layout
    this.options.onLayout(layout)
    // Blocks measured before they had their final width need a second pass.
    if ((changed || unplaced) && this.passes++ < 3) this.measure()
  }

  private noteHeight(text: string, width: number): number {
    const key = `${width}|${text}`
    let h = this.noteHeights.get(key)
    if (h === undefined) {
      this.measurer.style.width = `${width}px`
      this.measurer.innerHTML = `<div class="page-note"><sup>0</sup> ${escapeHtml(text)}</div>`
      h = this.measurer.offsetHeight
      this.noteHeights.set(key, h)
    }
    return h
  }
}

interface Unit {
  pos: number
  node: PMNode
  dom: HTMLElement
  section: number
  kind: 'block' | 'pageBreak' | 'sectionBreak'
  height: number
  mt: number
  mb: number
  insetL: number
  insetR: number
  notes: string[]
  // Children of a splittable atom: laid out one by one, positioned inside `owner`.
  owner?: Unit
  heading?: boolean
  // Had no placement yet when measured (its width may still change).
  fresh: boolean
}

// Blocks in document order, descending into lists, quotes and splittable atoms.
function collectUnits(view: EditorView): Unit[] {
  const units: Unit[] = []
  const root = view.dom
  let section = 0
  const insets = (dom: HTMLElement) => {
    let l = 0
    let r = 0
    for (let el = dom.parentElement; el && el !== root; el = el.parentElement) {
      const s = getComputedStyle(el)
      l += (parseFloat(s.paddingLeft) || 0) + (parseFloat(s.borderLeftWidth) || 0)
      r += (parseFloat(s.paddingRight) || 0) + (parseFloat(s.borderRightWidth) || 0)
      // Top-level containers carry the page margins as their own margins.
      if (el.parentElement !== root) {
        l += parseFloat(s.marginLeft) || 0
        r += parseFloat(s.marginRight) || 0
      }
    }
    return [l, r]
  }
  const box = (dom: HTMLElement) => {
    const s = getComputedStyle(dom)
    return { height: dom.offsetHeight, mt: parseFloat(s.marginTop) || 0, mb: parseFloat(s.marginBottom) || 0 }
  }
  const visit = (node: PMNode, pos: number, top: boolean, containerMt: number, containerMb: number) => {
    if (SPLITTABLE.has(node.type.name) && node.childCount > 0) {
      const dom = view.nodeDOM(pos)
      const own = dom instanceof HTMLElement ? box(dom) : { mt: 0, mb: 0 }
      const count = node.childCount
      node.forEach((child, offset, i) =>
        visit(child, pos + 1 + offset, false, i === 0 ? Math.max(containerMt, own.mt) : 0, i === count - 1 ? Math.max(containerMb, own.mb) : 0),
      )
      return
    }
    const dom = view.nodeDOM(pos)
    if (!(dom instanceof HTMLElement)) {
      if (top && node.type.name === 'sectionBreak') section++
      return
    }
    const [insetL, insetR] = insets(dom)
    const notes: string[] = []
    node.descendants((n) => {
      if (n.type.name === 'footnote') notes.push(String(n.attrs.content ?? ''))
    })
    const kind = node.type.name === 'pageBreak' ? 'pageBreak' : node.type.name === 'sectionBreak' && top ? 'sectionBreak' : 'block'
    const b = box(dom)
    const unit: Unit = {
      pos,
      node,
      dom,
      section,
      kind,
      height: b.height,
      mt: Math.max(b.mt, containerMt),
      mb: Math.max(b.mb, containerMb),
      insetL,
      insetR,
      notes,
      heading: node.type.name === 'heading',
      fresh: dom.style.position !== 'absolute',
    }
    const subs = [...dom.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.hasAttribute('data-page-unit'))
    if (subs.length) {
      units.push(
        ...subs.map((sub, i) => {
          const s = box(sub)
          return { ...unit, dom: sub, height: s.height, mt: i === 0 ? Math.max(s.mt, unit.mt) : s.mt, mb: i === subs.length - 1 ? Math.max(s.mb, unit.mb) : s.mb, owner: unit, notes: [] }
        }),
      )
    } else units.push(unit)
    if (kind === 'sectionBreak') section++
  }
  view.state.doc.forEach((node, offset) => visit(node, offset, true, 0, 0))
  return units
}

interface Placed {
  unit: Unit
  page: number
  col: number
  top: number // page-relative border-box top
}

// Places units on pages and columns.
class Engine {
  private pages: PageBox[] = []
  private placed: Placed[] = []
  private page!: PageBox
  private section!: Section
  private sectionIndex = 0
  // Current region (a section's part of a page).
  private regionTop = 0
  private regionLeft = 0
  private regionWidth = 0
  private regionStart = 0 // index in `placed`
  private col = 0
  private y = 0
  private prevMb = 0
  private atTop = true
  private notesHeight = 0
  private noteNumber = 1

  constructor(
    private sections: Section[],
    private width: number,
    private gap: number,
    private noteHeight: (text: string, width: number) => number,
  ) {}

  private get columns(): Columns {
    return this.section.columns
  }

  private colWidth(): number {
    const n = this.columns.count
    return n > 1 ? (this.regionWidth - (n - 1) * mmToPx(this.columns.gap)) / n : this.regionWidth
  }

  private colLeft(col: number): number {
    return this.regionLeft + col * (this.colWidth() + mmToPx(this.columns.gap))
  }

  private newPage() {
    const geo = pageGeometry(this.section.page)
    const prev = this.pages[this.pages.length - 1]
    this.page = {
      index: this.pages.length,
      section: this.sectionIndex,
      x: Math.round((this.width - geo.width) / 2),
      y: prev ? prev.y + prev.geo.height + this.gap : 0,
      geo,
      notes: [],
      firstNote: this.noteNumber,
      lines: [],
    }
    this.pages.push(this.page)
    this.notesHeight = 0
    this.startRegion(geo.margins.top)
  }

  private startRegion(top: number) {
    const geo = this.page.geo
    const m = this.section.page.margins
    // Left/right margins of the section (the page may belong to an earlier one for continuous breaks).
    const left = Math.round(mmToPx(m.left))
    const right = Math.round(mmToPx(m.right))
    this.regionLeft = this.page.x + left
    this.regionWidth = geo.width - left - right
    this.regionTop = top
    this.regionStart = this.placed.length
    this.col = 0
    this.y = top
    this.prevMb = 0
    this.atTop = true
  }

  private limit(extraNotes: number): number {
    const notes = this.notesHeight + extraNotes
    return this.page.geo.height - this.page.geo.margins.bottom - notes - (notes > 0 ? NOTES_SEPARATOR : 0)
  }

  run(units: Unit[]): { layout: Layout; places: Map<number, Placement>; unplaced: boolean } {
    this.section = this.sections[0]
    this.newPage()
    let current = 0
    let forceBreak = false
    for (const unit of units) {
      if (unit.section !== current) {
        // Earlier sections without units (consecutive breaks) are skipped.
        while (current < unit.section) current++
        this.enterSection(current)
      }
      if (forceBreak) {
        this.finishRegion(false)
        this.newPage()
        forceBreak = false
      }
      this.place(unit)
      if (unit.kind === 'pageBreak') forceBreak = true
    }
    // Trailing empty sections still start their page.
    while (current < this.sections.length - 1) this.enterSection(++current)
    this.finishRegion(false)

    const places = new Map<number, Placement>()
    const anchors = new Map<number, { page: number; y: number }>()
    const unitPlace = new Map<Unit, Placement>()
    let unplaced = false
    for (const p of this.placed) {
      const page = this.pages[p.page]
      const section = this.sections[p.unit.section]
      const regionLeft = page.x + Math.round(mmToPx(section.page.margins.left))
      const regionWidth = page.geo.width - Math.round(mmToPx(section.page.margins.left)) - Math.round(mmToPx(section.page.margins.right))
      const n = section.columns.count
      const gap = mmToPx(section.columns.gap)
      const colWidth = n > 1 ? (regionWidth - (n - 1) * gap) / n : regionWidth
      const u = p.unit
      const place = { top: page.y + p.top, left: regionLeft + p.col * (colWidth + gap), width: colWidth, mt: u.mt, insetL: u.insetL, insetR: u.insetR }
      if (u.owner) {
        subPlaces.set(u.dom, place)
        if (!unitPlace.has(u.owner)) {
          // The atom itself starts where its first child is placed.
          const own = { ...place, mt: 0 }
          unitPlace.set(u.owner, own)
          places.set(u.pos, own)
        }
      } else places.set(u.pos, place)
      if (p.unit.heading) anchors.set(p.unit.pos, { page: p.page, y: p.top })
      if (p.unit.fresh) unplaced = true
    }
    const last = this.pages[this.pages.length - 1]
    return { layout: { pages: this.pages, width: this.width, height: last.y + last.geo.height, anchors }, places, unplaced }
  }

  private enterSection(index: number) {
    const next = this.sections[index]
    const newPage = next.start === 'nextPage' || !samePageSize(next.page, this.section.page)
    this.finishRegion(!newPage)
    const top = this.y + this.prevMb
    this.section = next
    this.sectionIndex = index
    if (newPage) this.newPage()
    else this.startRegion(top)
  }

  private place(unit: Unit) {
    const unitNotes = unit.notes.reduce((sum, n) => sum + this.noteHeight(n, this.page.geo.width - this.page.geo.margins.left - this.page.geo.margins.right), 0)
    for (let attempt = 0; ; attempt++) {
      const gapBefore = this.atTop ? 0 : Math.max(this.prevMb, unit.mt)
      const top = this.y + gapBefore
      // A page break marker never overflows by itself: it ends the page it is on.
      const fits = top + unit.height <= this.limit(unitNotes) || this.atTop || unit.kind !== 'block' || attempt > 1
      if (fits) {
        this.placed.push({ unit, page: this.page.index, col: this.col, top })
        this.y = top + unit.height
        this.prevMb = unit.mb
        this.atTop = false
        if (unit.notes.length) {
          this.page.notes.push(...unit.notes)
          this.notesHeight += unitNotes
          this.noteNumber += unit.notes.length
        }
        return
      }
      // Headings stay with the block that follows them.
      const prev = this.placed[this.placed.length - 1]
      const carry = prev && prev.unit.heading && !prev.unit.owner && prev.page === this.page.index && prev.col === this.col && prev.top > this.regionTop + 1 && this.placed.length > this.regionStart + 1 ? prev : null
      if (carry) this.placed.pop()
      if (this.col + 1 < this.columns.count) {
        this.col++
        this.y = this.regionTop
        this.prevMb = 0
        this.atTop = true
      } else {
        this.finishRegion(false)
        this.newPage()
      }
      if (carry) {
        this.placed.push({ unit: carry.unit, page: this.page.index, col: this.col, top: this.y })
        this.y += carry.unit.height
        this.prevMb = carry.unit.mb
        this.atTop = false
      }
    }
  }

  // Ends the section's region on the current page: balances its columns before a
  // continuous break (as Word does) and records the column separators.
  private finishRegion(balance: boolean) {
    const n = this.columns.count
    const items = this.placed.slice(this.regionStart).filter((p) => p.page === this.page.index)
    if (n > 1 && items.length) {
      if (balance) this.balance(items)
      let bottom = this.regionTop
      for (const p of items) bottom = Math.max(bottom, p.top + p.unit.height)
      if (this.columns.separator) {
        const gap = mmToPx(this.columns.gap)
        for (let c = 1; c < n; c++) {
          const x = this.colLeft(c) - gap / 2 - this.page.x
          this.page.lines.push({ x, top: this.regionTop, bottom })
        }
      }
      this.y = bottom
      this.col = 0
    }
  }

  private balance(items: Placed[]) {
    const n = this.columns.count
    const heights = items.map((p) => p.unit.height)
    let lo = Math.max(...heights)
    let hi = Math.max(lo, this.limit(0) - this.regionTop)
    const fill = (cap: number, apply: boolean): boolean => {
      let col = 0
      let y = 0
      let prevMb = 0
      let first = true
      for (const p of items) {
        const gap = first ? 0 : Math.max(prevMb, p.unit.mt)
        if (!first && y + gap + p.unit.height > cap) {
          col++
          if (col >= n) return false
          y = 0
          first = true
        }
        const top = first ? 0 : y + Math.max(prevMb, p.unit.mt)
        if (apply) {
          p.col = col
          p.top = this.regionTop + top
        }
        y = top + p.unit.height
        prevMb = p.unit.mb
        first = false
      }
      return true
    }
    if (!fill(hi, false)) return
    for (let i = 0; i < 20 && hi - lo > 1; i++) {
      const mid = (lo + hi) / 2
      if (fill(mid, false)) hi = mid
      else lo = mid
    }
    fill(hi, true)
  }
}

// Placement of the children of splittable atoms, relative to their atom (set directly).
const subPlaces = new WeakMap<HTMLElement, Placement>()

function applySubUnits(units: Unit[], places: Map<number, Placement>) {
  for (const u of units) {
    if (!u.owner) continue
    const own = places.get(u.owner.pos)
    const p = subPlaces.get(u.dom)
    if (!own || !p) continue
    const style = `position:absolute;top:${Math.round(p.top - own.top - u.mt)}px;left:${Math.round(p.left - own.left)}px;width:${Math.round(p.width)}px`
    if (u.dom.getAttribute('style') !== style) u.dom.setAttribute('style', style)
  }
}

function layoutSignature(layout: Layout, places: Map<number, Placement>): string {
  const pages = layout.pages.map((p) => `${p.x},${p.y},${p.geo.width}x${p.geo.height},${p.notes.join('\u0001')},${p.firstNote},${p.lines.map((l) => `${l.x}:${l.top}:${l.bottom}`).join(';')}`)
  const parts: string[] = []
  // By order, not position: typing shifts positions but mapped decorations stay right.
  for (const p of places.values()) parts.push(`${Math.round(p.top - p.mt)}:${Math.round(p.left + p.insetL)}:${Math.round(p.width - p.insetL - p.insetR)}`)
  return `${layout.width}|${pages.join('|')}|${parts.join(',')}`
}

function buildDecorations(state: EditorState, layout: Layout, places: Map<number, Placement>): DecorationSet {
  const decorations: Decoration[] = []
  const size = state.doc.content.size
  const width = layout.width
  for (const [pos, p] of places) {
    const node = pos < size ? state.doc.nodeAt(pos) : null
    if (!node) continue
    const top = Math.round(p.top - p.mt)
    const left = Math.round(p.left + p.insetL)
    const right = Math.round(width - p.left - p.width + p.insetR)
    decorations.push(Decoration.node(pos, pos + node.nodeSize, { style: `position:absolute;top:${top}px;left:${left}px;right:${right}px` }))
  }
  return DecorationSet.create(state.doc, decorations)
}

export function notesHtml(notes: string[], first: number): string {
  if (!notes.length) return ''
  return (
    '<div class="page-notes"><hr />' +
    notes.map((n, i) => `<div class="page-note"><sup>${first + i}</sup> ${escapeHtml(n)}</div>`).join('') +
    '</div>'
  )
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}
