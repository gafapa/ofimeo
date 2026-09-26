// Page viewer: lazy rendering with pdf.js (canvas + text layer for selection
// and search), zoom and fit width, thumbnails and find. Pages outside the
// viewport keep only their size; far pages drop their canvases.

import type { PDFDocumentProxy, PDFPageProxy, RenderTask, TextLayer } from 'pdfjs-dist'
import { t } from '../../core/i18n'
import { el } from '../../ui/widgets'
import type { PageEntry } from './model'
import { pdfjs } from './pdfjs'

// CSS pixels per PDF point at 100 % (pdf.js' PDF_TO_CSS_UNITS).
export const CSS_UNITS = 96 / 72
const KEEP_RENDERED = 10

export interface PageView {
  entry: PageEntry
  index: number
  el: HTMLElement
  canvas: HTMLCanvasElement | null
  text: HTMLElement
  overlay: SVGSVGElement
  notes: HTMLElement
  cursors: HTMLElement
  scale: number // scale of the current canvas (0: none)
  task: RenderTask | null
  textLayer: TextLayer | null
  visible: boolean
}

interface TextIndex {
  text: string
  // Start offset of each text item in `text`.
  starts: number[]
}

export class Viewer {
  pdf: PDFDocumentProxy | null = null
  views: PageView[] = []
  zoom = 1
  fitWidth = true
  readonly scroller: HTMLElement
  readonly column: HTMLElement
  private observer: IntersectionObserver
  private rendered: PageView[] = []
  private textCache = new Map<number, Promise<TextIndex>>()
  private pageCache = new Map<number, Promise<PDFPageProxy>>()
  onPageCreated: (view: PageView) => void = () => {}
  onTextLayer: (view: PageView) => void = () => {}
  onZoom: () => void = () => {}
  onCurrentPage: (index: number) => void = () => {}
  private current = 0

  constructor(host: HTMLElement) {
    this.scroller = el('div', { class: 'pdf-scroller', tabIndex: 0 })
    this.scroller.setAttribute('role', 'document')
    this.scroller.setAttribute('aria-label', t('Pages'))
    this.column = el('div', { class: 'pdf-column' })
    this.scroller.append(this.column)
    host.append(this.scroller)
    this.observer = new IntersectionObserver((entries) => this.onIntersect(entries), { root: this.scroller, rootMargin: '600px 0px' })
    new ResizeObserver(() => this.fitWidth && this.applyFit()).observe(this.scroller)
    this.scroller.addEventListener('scroll', () => this.trackCurrent(), { passive: true })
  }

  get scale(): number {
    return this.zoom * CSS_UNITS
  }

  setDocument(pdf: PDFDocumentProxy | null): void {
    this.pdf = pdf
    this.pageCache.clear()
    this.textCache.clear()
  }

  // Builds (or reuses) the page elements for the page list.
  setPages(entries: PageEntry[]): void {
    const old = new Map(this.views.map((v) => [v.entry.id, v]))
    this.views = entries.map((entry, index) => {
      const view = old.get(entry.id)
      if (view) {
        old.delete(entry.id)
        view.entry = entry
        view.index = index
        return view
      }
      return this.createView(entry, index)
    })
    for (const v of old.values()) this.dropView(v)
    this.column.replaceChildren(...this.views.map((v) => v.el))
    this.views.forEach((v) => v.el.setAttribute('aria-label', t('Page {n} of {m}', { n: v.index + 1, m: this.views.length })))
    if (this.fitWidth) this.applyFit()
    else this.layout()
  }

  private createView(entry: PageEntry, index: number): PageView {
    const page = el('div', { class: 'pdf-page' })
    page.dataset.pageId = entry.id
    page.setAttribute('role', 'region')
    const text = el('div', { class: 'textLayer' })
    const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    overlay.classList.add('pdf-overlay')
    overlay.setAttribute('viewBox', `0 0 ${entry.w} ${entry.h}`)
    overlay.setAttribute('preserveAspectRatio', 'none')
    const notes = el('div', { class: 'pdf-notes-layer' })
    const cursors = el('div', { class: 'pdf-cursors' })
    page.append(text, overlay, notes, cursors)
    if (entry.src === -1) page.classList.add('blank')
    const view: PageView = { entry, index, el: page, canvas: null, text, overlay, notes, cursors, scale: 0, task: null, textLayer: null, visible: false }
    this.observer.observe(page)
    this.onPageCreated(view)
    return view
  }

  private dropView(v: PageView): void {
    this.observer.unobserve(v.el)
    this.clearRender(v)
  }

  // Sets every page's size for the current zoom.
  layout(): void {
    const s = this.scale
    for (const v of this.views) {
      v.el.style.width = `${Math.floor(v.entry.w * s)}px`
      v.el.style.height = `${Math.floor(v.entry.h * s)}px`
      v.el.style.setProperty('--total-scale-factor', String(s))
      v.el.style.setProperty('--scale-factor', String(s))
      v.overlay.setAttribute('viewBox', `0 0 ${v.entry.w} ${v.entry.h}`)
      if (v.visible) void this.renderPage(v)
    }
    this.onZoom()
  }

  setZoom(value: number, keepCenter = true): void {
    const z = Math.min(5, Math.max(0.25, value))
    const sc = this.scroller
    const ratio = sc.scrollHeight ? (sc.scrollTop + sc.clientHeight / 2) / sc.scrollHeight : 0
    this.zoom = z
    this.layout()
    if (keepCenter) sc.scrollTop = ratio * sc.scrollHeight - sc.clientHeight / 2
  }

  applyFit(): void {
    const widest = Math.max(1, ...this.views.map((v) => v.entry.w))
    const width = this.scroller.clientWidth - 32
    if (width <= 0) return
    this.zoom = Math.min(5, Math.max(0.25, width / (widest * CSS_UNITS)))
    this.layout()
  }

  private onIntersect(entries: IntersectionObserverEntry[]): void {
    for (const e of entries) {
      const v = this.views.find((x) => x.el === e.target)
      if (!v) continue
      v.visible = e.isIntersecting
      if (v.visible) void this.renderPage(v)
    }
  }

  page(src: number): Promise<PDFPageProxy> {
    let p = this.pageCache.get(src)
    if (!p) {
      p = this.pdf!.getPage(src + 1)
      this.pageCache.set(src, p)
    }
    return p
  }

  private async renderPage(v: PageView): Promise<void> {
    const s = this.scale
    if (v.scale === s || v.entry.src === -1 || !this.pdf) return
    v.scale = s
    v.task?.cancel()
    const page = await this.page(v.entry.src)
    if (v.scale !== s) return
    const viewport = page.getViewport({ scale: s })
    const ratio = Math.min(window.devicePixelRatio || 1, 3)
    // Keep the canvas area reasonable on very large zooms.
    const limit = Math.sqrt(16_000_000 / (viewport.width * viewport.height * ratio * ratio))
    const out = Math.min(ratio, ratio * limit)
    const canvas = el('canvas', { class: 'pdf-canvas' })
    canvas.width = Math.floor(viewport.width * out)
    canvas.height = Math.floor(viewport.height * out)
    canvas.setAttribute('aria-hidden', 'true')
    const task = page.render({ canvas, viewport, transform: out !== 1 ? [out, 0, 0, out, 0, 0] : undefined })
    v.task = task
    try {
      await task.promise
    } catch {
      return
    }
    if (v.scale !== s) return
    v.task = null
    // The new canvas replaces the old one only when ready (no flashing while zooming).
    if (v.canvas) v.canvas.replaceWith(canvas)
    else v.el.prepend(canvas)
    v.canvas = canvas
    if (!this.rendered.includes(v)) this.rendered.push(v)
    this.trim()
    await this.renderText(v, page, s)
  }

  private async renderText(v: PageView, page: PDFPageProxy, s: number): Promise<void> {
    const { TextLayer } = await pdfjs()
    v.textLayer?.cancel()
    v.text.replaceChildren()
    const layer = new TextLayer({ textContentSource: page.streamTextContent(), container: v.text, viewport: page.getViewport({ scale: s }) })
    v.textLayer = layer
    try {
      await layer.render()
    } catch {
      return
    }
    if (v.scale === s) this.onTextLayer(v)
  }

  // Frees the canvases of the pages farthest from the view.
  private trim(): void {
    if (this.rendered.length <= KEEP_RENDERED) return
    const center = this.current
    this.rendered.sort((a, b) => Math.abs(b.index - center) - Math.abs(a.index - center))
    while (this.rendered.length > KEEP_RENDERED) {
      const v = this.rendered[0]
      if (v.visible) break
      this.rendered.shift()
      this.clearRender(v)
    }
  }

  private clearRender(v: PageView): void {
    v.task?.cancel()
    v.textLayer?.cancel()
    v.canvas?.remove()
    v.canvas = null
    v.text.replaceChildren()
    v.textLayer = null
    v.scale = 0
    this.rendered = this.rendered.filter((x) => x !== v)
  }

  private trackCurrent(): void {
    const mid = this.scroller.scrollTop + this.scroller.clientHeight / 3
    let index = 0
    for (const v of this.views) if (v.el.offsetTop <= mid) index = v.index
    if (index !== this.current) {
      this.current = index
      this.onCurrentPage(index)
    }
  }

  currentIndex(): number {
    return this.current
  }

  scrollToPage(index: number, y = 0): void {
    const v = this.views[index]
    if (!v) return
    this.scroller.scrollTop = v.el.offsetTop - 12 + y * this.scale
    this.current = index
    this.onCurrentPage(index)
  }

  // Page view and view-space point under a client position.
  hit(clientX: number, clientY: number): { view: PageView; x: number; y: number } | null {
    for (const v of this.views) {
      const r = v.el.getBoundingClientRect()
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) return { view: v, ...this.toPage(v, clientX, clientY) }
    }
    return null
  }

  toPage(v: PageView, clientX: number, clientY: number): { x: number; y: number } {
    const r = v.el.getBoundingClientRect()
    return { x: ((clientX - r.left) / r.width) * v.entry.w, y: ((clientY - r.top) / r.height) * v.entry.h }
  }

  // ---------- Find ----------

  textOf(src: number): Promise<TextIndex> {
    let p = this.textCache.get(src)
    if (!p) {
      p = this.page(src)
        .then((page) => page.getTextContent())
        .then((content) => {
          let text = ''
          const starts: number[] = []
          for (const item of content.items) {
            starts.push(text.length)
            if ('str' in item) text += item.str + (item.hasEOL ? '\n' : '')
          }
          return { text, starts }
        })
      this.textCache.set(src, p)
    }
    return p
  }

  async pageText(index: number): Promise<string> {
    const v = this.views[index]
    if (!v || v.entry.src === -1 || !this.pdf) return ''
    return (await this.textOf(v.entry.src)).text
  }

  destroy(): void {
    this.observer.disconnect()
  }
}

// Case- and accent-insensitive form used for searching (same length as the input).
export const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').padEnd(s.length)

export interface Match {
  index: number // page index
  start: number
  end: number
}

// Finds every match; item ranges map matches to text layer spans.
export async function findAll(viewer: Viewer, query: string): Promise<Match[]> {
  const q = fold(query.trim())
  if (!q.trim()) return []
  const out: Match[] = []
  for (const v of viewer.views) {
    if (v.entry.src === -1 || !viewer.pdf) continue
    const { text } = await viewer.textOf(v.entry.src)
    // Folding per character keeps offsets aligned with the original text.
    const folded = [...text].map((c) => fold(c)[0] ?? c).join('')
    for (let i = folded.indexOf(q); i >= 0; i = folded.indexOf(q, i + q.length)) out.push({ index: v.index, start: i, end: i + q.length })
  }
  return out
}

// Marks the text layer spans of the matches of one page.
export async function markMatches(viewer: Viewer, view: PageView, matches: Match[], current: Match | null): Promise<void> {
  const divs = view.textLayer?.textDivs ?? []
  for (const d of divs) d.classList.remove('highlight', 'selected')
  if (view.entry.src === -1) return
  const { starts } = await viewer.textOf(view.entry.src)
  for (const m of matches) {
    if (m.index !== view.index) continue
    for (let i = 0; i < starts.length; i++) {
      const end = i + 1 < starts.length ? starts[i + 1] : Infinity
      if (starts[i] < m.end && end > m.start && divs[i]) {
        divs[i].classList.add('highlight')
        if (m === current) divs[i].classList.add('selected')
      }
    }
  }
}
