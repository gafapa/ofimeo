// Annotation editing on the pages: tools, pointer input (pen pressure,
// coalesced events), text markup from the text selection, selection, moving,
// resizing, keyboard access, the text box editor, remote cursors and undo.

import * as Y from 'yjs'
import { t } from '../../core/i18n'
import type { Session } from '../../core/session'
import { el, toast } from '../../ui/widgets'
import { stampSize } from './draw'
import { annotsMap, bounds, LOCAL, moved, newId, pagesArray, resized, type Annot, type AnnotType } from './model'
import type { Notes } from './notes'
import { annotElement, measure, svg } from './render'
import { gradeText, loadSignature, signatureAnnot, type StampSpec } from './stamps'
import type { PageView, Viewer } from './viewer'

export type Tool = 'select' | 'highlight' | 'underline' | 'strike' | 'pen' | 'eraser' | 'text' | 'note' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'stamp' | 'sign'

export const MARKUP_TOOLS: Tool[] = ['highlight', 'underline', 'strike']
const DRAW_TOOLS: Tool[] = ['pen', 'eraser', 'text', 'note', 'rect', 'ellipse', 'line', 'arrow', 'stamp', 'sign']
const BOX_TYPES: AnnotType[] = ['rect', 'ellipse', 'text', 'stamp', 'ink']

const r2 = (n: number) => Math.round(n * 100) / 100

export class Editor {
  tool: Tool = 'select'
  selected: string | null = null
  markupColor = '#ffd400'
  lineColor = '#d32f2f'
  lineWidth = 2
  textSize = 14
  stamp: StampSpec | null = null
  showAnnotations = true
  readonly annots: Y.Map<Annot>
  readonly undo: Y.UndoManager
  onChange: () => void = () => {}
  onToolChange: () => void = () => {}
  onNeedSignature: () => void = () => {}
  // Pen input seen: touch then scrolls instead of drawing.
  private penSeen = false
  private editing: { id: string; box: HTMLTextAreaElement } | null = null
  private bubble: HTMLElement | null = null
  private cursorTimer = 0

  constructor(
    private session: Session,
    private viewer: Viewer,
    private notes: Notes,
    private root: HTMLElement,
  ) {
    this.annots = annotsMap(session.doc)
    this.undo = new Y.UndoManager([this.annots, pagesArray(session.doc)], { trackedOrigins: new Set([LOCAL]), captureTimeout: 400 })
    this.undo.on('stack-item-added', () => this.onChange())
    this.undo.on('stack-item-popped', () => this.onChange())
    this.annots.observe((e) => {
      const pages = new Set<string>()
      for (const key of e.keysChanged) {
        const a = this.annots.get(key) ?? (e.changes.keys.get(key)?.oldValue as Annot | undefined)
        if (a) pages.add(a.page)
      }
      if (this.selected && !this.annots.has(this.selected)) this.selected = null
      for (const v of viewer.views) if (pages.has(v.entry.id)) this.renderPage(v)
      this.onChange()
    })
    session.awareness.on('change', () => this.renderCursors())
    this.bindText()
    this.bindKeys()
    this.setTool('select')
  }

  get canEdit(): boolean {
    return this.session.canEdit
  }

  private transact(fn: () => void): void {
    this.session.doc.transact(fn, LOCAL)
  }

  setTool(tool: Tool): void {
    if (!this.canEdit && !(tool === 'select' || (tool === 'note' && this.session.canComment))) return
    if (tool === 'sign' && !loadSignature()) {
      this.onNeedSignature()
      return
    }
    this.tool = tool
    for (const name of [...MARKUP_TOOLS, ...DRAW_TOOLS, 'select']) this.root.classList.toggle(`pdf-tool-${name}`, name === tool)
    this.root.classList.toggle('pdf-drawing', DRAW_TOOLS.includes(tool))
    if (tool !== 'select') this.select(null)
    this.onToolChange()
  }

  // ---------- Rendering ----------

  pageAnnots(page: string): Annot[] {
    return [...this.annots.values()].filter((a) => a.page === page).sort((a, b) => a.time - b.time)
  }

  renderPage(v: PageView): void {
    const overlay = v.overlay
    overlay.replaceChildren()
    if (!this.showAnnotations) return
    for (const a of this.pageAnnots(v.entry.id)) {
      if (this.editing?.id === a.id) continue
      const g = annotElement(a, true)
      overlay.append(g)
      if (a.id === this.selected) this.drawSelection(v, a)
    }
  }

  renderAll(): void {
    for (const v of this.viewer.views) this.renderPage(v)
  }

  private viewOf(page: string): PageView | undefined {
    return this.viewer.views.find((v) => v.entry.id === page)
  }

  private drawSelection(v: PageView, a: Annot): void {
    const [x, y, w, h] = bounds(a)
    const pad = 3
    const frame = svg('rect', { x: x - pad, y: y - pad, width: w + 2 * pad, height: h + 2 * pad, class: 'pdf-sel' })
    v.overlay.append(frame)
    if (this.canEdit && BOX_TYPES.includes(a.type)) {
      const s = 8 / this.viewer.scale
      v.overlay.append(svg('rect', { x: x + w + pad - s / 2, y: y + h + pad - s / 2, width: s, height: s, class: 'pdf-handle', 'data-handle': a.id }))
    }
  }

  select(id: string | null, focus = false): void {
    const previous = this.selected ? this.annots.get(this.selected) : undefined
    this.selected = id
    const a = id ? this.annots.get(id) : undefined
    for (const page of new Set([previous?.page, a?.page])) {
      const v = page ? this.viewOf(page) : undefined
      if (v) this.renderPage(v)
    }
    if (focus && a) this.viewOf(a.page)?.overlay.querySelector<SVGGElement>(`[data-id="${a.id}"]`)?.focus()
    this.onChange()
  }

  selectedAnnot(): Annot | undefined {
    return this.selected ? this.annots.get(this.selected) : undefined
  }

  // ---------- Changes ----------

  add(a: Omit<Annot, 'id' | 'time' | 'author'>): Annot {
    const full: Annot = { ...a, id: newId(), time: Date.now(), author: this.session.user.name } as Annot
    // Every new annotation is its own undo step.
    this.undo.stopCapturing()
    this.transact(() => this.annots.set(full.id, full))
    return full
  }

  update(id: string, patch: Partial<Annot>): void {
    const a = this.annots.get(id)
    if (a) this.transact(() => this.annots.set(id, { ...a, ...patch }))
  }

  replace(a: Annot): void {
    this.transact(() => this.annots.set(a.id, a))
  }

  remove(id: string): void {
    this.transact(() => this.annots.delete(id))
  }

  deleteSelected(): void {
    if (this.selected && this.canEdit) this.remove(this.selected)
  }

  // Applies a color to the selected annotation, or to the next ones.
  setColor(color: string): void {
    const a = this.selectedAnnot()
    if (a && this.canEdit) return this.update(a.id, { color })
    if (MARKUP_TOOLS.includes(this.tool)) this.markupColor = color
    else this.lineColor = color
    this.onChange()
  }

  currentColor(): string {
    return this.selectedAnnot()?.color ?? (MARKUP_TOOLS.includes(this.tool) ? this.markupColor : this.lineColor)
  }

  setWidth(width: number): void {
    this.lineWidth = width
    const a = this.selectedAnnot()
    if (!a || !this.canEdit) return
    if (a.type === 'ink') this.replace({ ...a, strokes: a.strokes?.map((s) => s.map((v, i) => (i % 3 === 2 ? r2((v / (a.width ?? 2)) * width) : v))), width })
    else if (a.width !== undefined) this.update(a.id, { width })
  }

  setTextSize(size: number): void {
    this.textSize = size
    const a = this.selectedAnnot()
    if (!a || !this.canEdit) return
    if (a.type === 'text') this.update(a.id, { size, h: Math.max(a.h ?? 0, size * 1.2 + 6) })
    if (a.type === 'stamp') {
      const [w, h] = stampSize({ ...a, size }, measure)
      this.update(a.id, { size, w, h })
    }
  }

  // ---------- Pointer input ----------

  attachPage(v: PageView): void {
    v.overlay.addEventListener('pointerdown', (e) => this.onPointerDown(v, e))
    v.overlay.addEventListener('dblclick', (e) => {
      const id = (e.target as Element).closest<SVGGElement>('.pdf-annot')?.dataset.id
      const a = id ? this.annots.get(id) : undefined
      if (a && this.canEdit && (a.type === 'text' || (a.type === 'stamp' && a.text))) this.editText(a)
    })
    v.overlay.addEventListener('focusin', (e) => {
      const id = (e.target as Element).closest<SVGGElement>('.pdf-annot')?.dataset.id
      if (id && id !== this.selected && this.tool === 'select') this.select(id, true)
    })
    v.el.addEventListener('pointermove', (e) => this.shareCursor(v, e))
    v.el.addEventListener('pointerleave', () => this.shareCursor(null))
    this.renderPage(v)
  }

  private point(v: PageView, e: PointerEvent): [number, number] {
    const p = this.viewer.toPage(v, e.clientX, e.clientY)
    return [r2(p.x), r2(p.y)]
  }

  private onPointerDown(v: PageView, e: PointerEvent): void {
    if (e.button !== 0) return
    if (e.pointerType === 'pen') this.penSeen = true
    // With a stylus around, fingers scroll and pens draw.
    if (e.pointerType === 'touch' && this.penSeen && this.tool === 'pen') return
    const target = e.target as Element
    if (this.tool === 'select') {
      const handle = target.closest<SVGElement>('.pdf-handle')?.dataset.handle
      if (handle) return this.dragResize(v, handle, e)
      const id = target.closest<SVGGElement>('.pdf-annot')?.dataset.id
      if (id) {
        e.preventDefault()
        this.select(id)
        if (this.canEdit) this.dragMove(v, id, e)
      }
      return
    }
    if (!DRAW_TOOLS.includes(this.tool)) return
    e.preventDefault()
    const [x, y] = this.point(v, e)
    switch (this.tool) {
      case 'pen':
        return this.drawInk(v, e)
      case 'eraser':
        return this.erase(v, e)
      case 'rect':
      case 'ellipse':
      case 'line':
      case 'arrow':
        return this.drawShape(v, e)
      case 'note':
        this.notes.create(v.entry.id, x - 10, y - 10)
        return this.setTool('select')
      case 'text': {
        const size = this.textSize
        const a = this.add({ type: 'text', page: v.entry.id, color: this.lineColor, x, y: r2(y - size * 0.6), w: 200, h: r2(size * 1.2 + 6), size, text: '' })
        this.setTool('select')
        return this.editText(a)
      }
      case 'stamp':
        return this.placeStamp(v, x, y)
      case 'sign': {
        const sig = loadSignature()
        if (!sig) return
        this.add({ type: 'ink', page: v.entry.id, color: '#1a237e', width: 2, alt: t('Signature of {name}', { name: this.session.user.name }), ...signatureAnnot(sig, x, y, 150) })
        return this.setTool('select')
      }
    }
  }

  private capture(e: PointerEvent, move: (e: PointerEvent) => void, up: (e: PointerEvent) => void): void {
    const target = e.target as Element
    target.setPointerCapture?.(e.pointerId)
    const onMove = (ev: PointerEvent) => move(ev)
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      up(ev)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  private drawInk(v: PageView, e: PointerEvent): void {
    const base = this.lineWidth
    const width = (ev: PointerEvent) => r2(ev.pointerType === 'pen' && ev.pressure > 0 ? base * (0.35 + ev.pressure * 1.3) : base)
    const pts: number[] = [...this.point(v, e), width(e)]
    const path = svg('path', { class: 'pdf-preview', stroke: this.lineColor, 'stroke-width': base, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })
    v.overlay.append(path)
    const d = () => 'M ' + pts.filter((_, i) => i % 3 < 2).join(' ').replace(/(\S+ \S+) /g, '$1 L ')
    path.setAttribute('d', d())
    this.capture(
      e,
      (ev) => {
        for (const c of ev.getCoalescedEvents?.() ?? [ev]) {
          const [x, y] = this.point(v, c)
          const n = pts.length
          if (Math.hypot(x - pts[n - 3], y - pts[n - 2]) < 0.6) continue
          pts.push(x, y, width(c))
        }
        path.setAttribute('d', d())
      },
      () => {
        path.remove()
        this.add({ type: 'ink', page: v.entry.id, color: this.lineColor, width: base, strokes: [pts] })
      },
    )
  }

  private erase(v: PageView, e: PointerEvent): void {
    const radius = 6 / this.viewer.zoom
    const hit = (x: number, y: number) => {
      for (const a of this.pageAnnots(v.entry.id)) {
        if (a.type !== 'ink') continue
        const near = a.strokes?.some((s) => {
          for (let i = 0; i < s.length; i += 3) if (Math.hypot(s[i] - x, s[i + 1] - y) < radius + s[i + 2] / 2) return true
          for (let i = 3; i < s.length; i += 3) if (segmentDistance(x, y, s[i - 3], s[i - 2], s[i], s[i + 1]) < radius) return true
          return false
        })
        if (near) this.remove(a.id)
      }
    }
    hit(...this.point(v, e))
    this.capture(e, (ev) => hit(...this.point(v, ev)), () => {})
  }

  private drawShape(v: PageView, e: PointerEvent): void {
    const type = this.tool as 'rect' | 'ellipse' | 'line' | 'arrow'
    const [x0, y0] = this.point(v, e)
    let x1 = x0
    let y1 = y0
    const make = (): Omit<Annot, 'id' | 'time' | 'author'> => {
      const base = { page: v.entry.id, color: this.lineColor, width: this.lineWidth }
      if (type === 'line' || type === 'arrow') return { ...base, type, line: [x0, y0, x1, y1] }
      return { ...base, type, x: Math.min(x0, x1), y: Math.min(y0, y1), w: r2(Math.abs(x1 - x0)), h: r2(Math.abs(y1 - y0)) }
    }
    let preview: SVGGElement | null = null
    this.capture(
      e,
      (ev) => {
        ;[x1, y1] = this.point(v, ev)
        if (ev.shiftKey) {
          // Squares, circles and 45° lines.
          const dx = x1 - x0
          const dy = y1 - y0
          if (type === 'line' || type === 'arrow') {
            const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
            const len = Math.hypot(dx, dy)
            x1 = r2(x0 + len * Math.cos(angle))
            y1 = r2(y0 + len * Math.sin(angle))
          } else {
            const s = Math.max(Math.abs(dx), Math.abs(dy))
            x1 = x0 + Math.sign(dx || 1) * s
            y1 = y0 + Math.sign(dy || 1) * s
          }
        }
        preview?.remove()
        preview = annotElement({ ...make(), id: 'preview', time: 0 } as Annot, false)
        preview.classList.add('pdf-preview')
        v.overlay.append(preview)
      },
      () => {
        preview?.remove()
        // A click without dragging makes a default-sized shape.
        if (Math.hypot(x1 - x0, y1 - y0) < 3) {
          x1 = x0 + (type === 'line' || type === 'arrow' ? 60 : 80)
          y1 = y0 + (type === 'line' || type === 'arrow' ? 0 : 50)
        }
        const a = this.add(make())
        this.setTool('select')
        this.select(a.id)
      },
    )
  }

  private placeStamp(v: PageView, x: number, y: number): void {
    const spec = this.stamp
    if (!spec) return
    const size = spec.size ?? 16
    const base = { text: spec.text, glyph: spec.glyph, size }
    const [w, h] = stampSize(base, measure)
    const box = spec.text ? { w: r2(w), h: r2(h) } : { w: size * 1.8, h: size * 1.8 }
    this.add({ type: 'stamp', page: v.entry.id, color: spec.color, ...base, x: r2(x - box.w / 2), y: r2(y - box.h / 2), ...box, alt: spec.alt || spec.text })
  }

  // Chooses a stamp; grade and custom stamps ask for their text first.
  async chooseStamp(spec: StampSpec): Promise<void> {
    if (spec.ask) {
      const { promptText } = await import('../../ui/widgets')
      const value = await promptText(spec.ask === 'grade' ? t('Grade stamp') : t('Custom stamp'), spec.ask === 'grade' ? t('Grade') : t('Text'), '')
      if (!value?.trim()) return
      const text = spec.ask === 'grade' ? gradeText(value.trim()) : value.trim()
      spec = { ...spec, text, alt: text, color: spec.ask === 'custom' ? this.lineColor : spec.color }
    }
    this.stamp = spec
    this.setTool('stamp')
    toast(t('Click on a page to place the stamp. Esc to stop.'))
  }

  private dragMove(v: PageView, id: string, e: PointerEvent): void {
    const [sx, sy] = this.point(v, e)
    const g = v.overlay.querySelector<SVGGElement>(`[data-id="${id}"]`)
    let dx = 0
    let dy = 0
    this.capture(
      e,
      (ev) => {
        const [x, y] = this.point(v, ev)
        dx = x - sx
        dy = y - sy
        g?.setAttribute('transform', `translate(${dx} ${dy})`)
        v.overlay.querySelectorAll('.pdf-sel, .pdf-handle').forEach((n) => n.setAttribute('transform', `translate(${dx} ${dy})`))
      },
      () => {
        const a = this.annots.get(id)
        if (a && Math.hypot(dx, dy) > 0.5) this.replace(moved(a, dx, dy))
        else this.renderPage(v)
      },
    )
  }

  private dragResize(v: PageView, id: string, e: PointerEvent): void {
    e.preventDefault()
    const a = this.annots.get(id)
    if (!a) return
    const [x, y, w, h] = bounds(a)
    let next = a
    this.capture(
      e,
      (ev) => {
        const [px, py] = this.point(v, ev)
        const nw = Math.max(6, px - x)
        let nh = Math.max(6, py - y)
        // Stamps and signatures keep their proportions.
        if (a.type === 'stamp' || a.type === 'ink') nh = nw * (h / w)
        if (a.type === 'text') nh = Math.max(nh, 10)
        next = resized(a, nw, nh)
        v.overlay.querySelector(`[data-id="${id}"]`)?.replaceWith(annotElement(next, true))
      },
      () => {
        if (next !== a) this.replace(next)
      },
    )
  }

  // ---------- Text boxes ----------

  editText(a: Annot): void {
    const v = this.viewOf(a.page)
    if (!v || !this.canEdit) return
    this.finishEditing()
    const s = this.viewer.scale
    const box = el('textarea', { class: 'pdf-text-editor', value: a.text ?? '' })
    box.setAttribute('aria-label', t('Text box'))
    const size = a.size ?? 14
    Object.assign(box.style, {
      left: `${((a.x ?? 0) / v.entry.w) * 100}%`,
      top: `${((a.y ?? 0) / v.entry.h) * 100}%`,
      width: `${(a.w ?? 200) * s}px`,
      minHeight: `${(a.h ?? 20) * s}px`,
      fontSize: `${size * s}px`,
      lineHeight: '1.2',
      color: a.color,
      padding: `${3 * s}px`,
    })
    const grow = () => {
      box.style.height = 'auto'
      box.style.height = `${box.scrollHeight}px`
    }
    box.addEventListener('input', grow)
    box.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault()
        this.finishEditing(true)
      }
    })
    box.addEventListener('blur', () => this.finishEditing())
    this.editing = { id: a.id, box }
    v.el.append(box)
    this.renderPage(v)
    // Focus right away: typing that follows the click must land in the box.
    box.focus()
    box.select()
    requestAnimationFrame(grow)
  }

  finishEditing(refocus = false): void {
    const e = this.editing
    if (!e) return
    this.editing = null
    const a = this.annots.get(e.id)
    const text = e.box.value.replace(/\s+$/, '')
    const height = e.box.getBoundingClientRect().height / this.viewer.scale
    e.box.remove()
    if (!a) return
    if (!text && a.type === 'text') this.remove(a.id)
    else if (a.type === 'stamp') {
      const [w, h] = stampSize({ ...a, text }, measure)
      if (text !== a.text) this.update(a.id, { text, w: r2(w), h: r2(h), alt: text })
      else this.renderPage(this.viewOf(a.page)!)
    } else if (text !== a.text || Math.abs(height - (a.h ?? 0)) > 1) this.update(a.id, { text, h: r2(Math.max(height, (a.size ?? 14) * 1.2 + 6)) })
    else this.renderPage(this.viewOf(a.page)!)
    if (refocus) this.select(a.id, true)
  }

  // ---------- Text markup ----------

  // Rectangles of the current text selection, per page (merged per line).
  selectionRects(): { view: PageView; rects: [number, number, number, number][]; text: string }[] {
    const sel = document.getSelection()
    if (!sel || sel.isCollapsed || !sel.rangeCount) return []
    const range = sel.getRangeAt(0)
    if (!this.viewer.column.contains(range.commonAncestorContainer)) return []
    const byPage = new Map<PageView, [number, number, number, number][]>()
    for (const r of range.getClientRects()) {
      if (r.width < 1 || r.height < 1) continue
      const hit = this.viewer.hit(r.left + r.width / 2, r.top + r.height / 2)
      if (!hit) continue
      const v = hit.view
      const a = this.viewer.toPage(v, r.left, r.top)
      const b = this.viewer.toPage(v, r.right, r.bottom)
      const list = byPage.get(v) ?? []
      list.push([r2(a.x), r2(a.y), r2(b.x - a.x), r2(b.y - a.y)])
      byPage.set(v, list)
    }
    const text = sel.toString().replace(/\s+/g, ' ').trim()
    return [...byPage].map(([view, rects]) => ({ view, rects: mergeLines(rects), text }))
  }

  markSelection(type: 'highlight' | 'underline' | 'strike'): boolean {
    if (!this.canEdit) return false
    const parts = this.selectionRects()
    if (!parts.length) return false
    const color = type === 'highlight' ? this.markupColor : this.markupColor === '#ffd400' ? '#d32f2f' : this.markupColor
    for (const p of parts) this.add({ type, page: p.view.entry.id, color, rects: p.rects, quote: p.text })
    document.getSelection()?.removeAllRanges()
    this.hideBubble()
    return true
  }

  private bindText(): void {
    const column = this.viewer.column
    column.addEventListener('pointerup', () => {
      setTimeout(() => {
        if (MARKUP_TOOLS.includes(this.tool)) this.markSelection(this.tool as 'highlight')
        else if (this.tool === 'select') this.showBubble()
      })
    })
    document.addEventListener('selectionchange', () => {
      const sel = document.getSelection()
      if (!sel || sel.isCollapsed) this.hideBubble()
      for (const v of this.viewer.views) v.text.classList.toggle('selecting', !!sel && !sel.isCollapsed && v.text.contains(sel.anchorNode))
    })
    // Clicking outside an annotation clears the selection.
    column.addEventListener('pointerdown', (e) => {
      if (this.tool === 'select' && !(e.target as Element).closest('.pdf-annot, .pdf-handle, .pdf-text-editor')) this.select(null)
    })
    this.viewer.scroller.addEventListener('scroll', () => this.hideBubble(), { passive: true })
  }

  // Floating buttons for the selected text (highlight, underline, strikeout, comment).
  private showBubble(): void {
    this.hideBubble()
    const parts = this.selectionRects()
    if (!parts.length) return
    const range = document.getSelection()!.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    const bubble = el('div', { class: 'pdf-bubble', role: 'toolbar' })
    bubble.setAttribute('aria-label', t('Selected text'))
    const add = (label: string, run: () => void) => {
      const b = el('button', { type: 'button', textContent: label })
      b.addEventListener('pointerdown', (e) => e.preventDefault())
      b.addEventListener('click', run)
      bubble.append(b)
    }
    if (this.canEdit) {
      add(t('Highlight'), () => this.markSelection('highlight'))
      add(t('Underline'), () => this.markSelection('underline'))
      add(t('Strikeout'), () => this.markSelection('strike'))
    }
    if (this.session.canComment) {
      add(t('Comment'), () => {
        const p = parts[0]
        const last = p.rects[p.rects.length - 1]
        if (this.canEdit) this.add({ type: 'highlight', page: p.view.entry.id, color: this.markupColor, rects: p.rects, quote: p.text })
        document.getSelection()?.removeAllRanges()
        this.hideBubble()
        this.notes.create(p.view.entry.id, last[0] + last[2], last[1] - 10)
      })
    }
    add(t('Copy'), () => {
      void navigator.clipboard?.writeText(document.getSelection()?.toString() ?? '')
      this.hideBubble()
    })
    document.body.append(bubble)
    const bw = bubble.getBoundingClientRect().width
    bubble.style.left = `${Math.max(8, Math.min(window.innerWidth - bw - 8, rect.left + rect.width / 2 - bw / 2))}px`
    bubble.style.top = `${rect.top > 60 ? rect.top - 44 : rect.bottom + 8}px`
    this.bubble = bubble
  }

  hideBubble(): void {
    this.bubble?.remove()
    this.bubble = null
  }

  // ---------- Keyboard ----------

  private bindKeys(): void {
    this.viewer.column.addEventListener('keydown', (e) => {
      const id = (e.target as Element).closest?.<SVGGElement>('.pdf-annot')?.dataset.id
      const a = id ? this.annots.get(id) : undefined
      if (!a) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.canEdit) {
        e.preventDefault()
        this.remove(a.id)
        this.viewer.scroller.focus()
      } else if (e.key.startsWith('Arrow') && this.canEdit) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        this.replace(moved(a, dx, dy))
        requestAnimationFrame(() => this.select(a.id, true))
      } else if (e.key === 'Enter' && this.canEdit && (a.type === 'text' || (a.type === 'stamp' && a.text))) {
        e.preventDefault()
        this.editText(a)
      } else if (e.key === 'Escape') {
        this.select(null)
        this.viewer.scroller.focus()
      }
    })
  }

  // ---------- Presence ----------

  private shareCursor(v: PageView | null, e?: PointerEvent): void {
    if (this.cursorTimer) return
    this.cursorTimer = window.setTimeout(() => (this.cursorTimer = 0), 50)
    const state = v && e ? { page: v.entry.id, ...Object.fromEntries(this.point(v, e).map((n, i) => [i ? 'y' : 'x', n])) } : null
    this.session.awareness.setLocalStateField('pdf', state)
  }

  renderCursors(): void {
    const byPage = new Map<string, HTMLElement[]>()
    for (const [client, state] of this.session.awareness.getStates()) {
      if (client === this.session.doc.clientID || !state.pdf?.page || !state.user) continue
      const v = this.viewOf(state.pdf.page)
      if (!v) continue
      const c = el('div', { class: 'pdf-cursor' }, el('span', { textContent: state.user.name }))
      c.style.setProperty('--cursor-color', state.user.color)
      c.style.left = `${(state.pdf.x / v.entry.w) * 100}%`
      c.style.top = `${(state.pdf.y / v.entry.h) * 100}%`
      byPage.set(v.entry.id, [...(byPage.get(v.entry.id) ?? []), c])
    }
    for (const v of this.viewer.views) v.cursors.replaceChildren(...(byPage.get(v.entry.id) ?? []))
  }
}

function segmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = dx * dx + dy * dy
  const k = len ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len)) : 0
  return Math.hypot(px - (x1 + k * dx), py - (y1 + k * dy))
}

// Joins the client rectangles of one text line into one rectangle.
function mergeLines(rects: [number, number, number, number][]): [number, number, number, number][] {
  const out: [number, number, number, number][] = []
  for (const r of [...rects].sort((a, b) => a[1] - b[1] || a[0] - b[0])) {
    const last = out[out.length - 1]
    if (last && Math.abs(last[1] - r[1]) < Math.min(last[3], r[3]) * 0.5 && r[0] <= last[0] + last[2] + 4) {
      const x0 = Math.min(last[0], r[0])
      const y0 = Math.min(last[1], r[1])
      const x1 = Math.max(last[0] + last[2], r[0] + r[2])
      const y1 = Math.max(last[1] + last[3], r[1] + r[3])
      out[out.length - 1] = [r2(x0), r2(y0), r2(x1 - x0), r2(y1 - y0)]
    } else out.push(r)
  }
  return out
}
