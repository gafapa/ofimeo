// Walks the paged document as laid out on screen and draws it into a PDF:
// text as real text (embedded fonts, one positioned run per word, scaled to
// the width the browser gave it), backgrounds and borders, images, list
// markers, equations (KaTeX glyphs and SVG paths), links, the outline and a
// structure tree (tagged PDF). Headers and footers are marked as artifacts.

import type { Editor } from '@tiptap/core'
import type { Layout, PageBox } from '../pages'
import { tocHeadings } from '../editor/toc'
import { num, PdfDoc, pdfString, type PdfFont, type PdfImage, type PdfPage, type StructElem } from './document'
import { facesFor, fallbackFaces, loadFace, type FontFace } from './fonts'
import type { TrueType } from './sfnt'

const PT = 0.75 // CSS px → PDF points

interface Rgb {
  r: number
  g: number
  b: number
}

function color(value: string): Rgb | null {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/.exec(value)
  if (!m) return null
  let a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])
  if (a <= 0.02) return null
  a = Math.min(1, a)
  // Transparency is flattened against the white page.
  const mix = (c: string) => (Number(c) * a + 255 * (1 - a)) / 255
  return { r: mix(m[1]), g: mix(m[2]), b: mix(m[3]) }
}

const rgb = (c: Rgb, stroke = false) => `${num(c.r)} ${num(c.g)} ${num(c.b)} ${stroke ? 'RG' : 'rg'}`

const STRUCT: Record<string, string> = {
  H1: 'H1',
  H2: 'H2',
  H3: 'H3',
  H4: 'H4',
  H5: 'H5',
  H6: 'H6',
  P: 'P',
  PRE: 'P',
  UL: 'L',
  OL: 'L',
  LI: 'LI',
  TABLE: 'Table',
  TR: 'TR',
  TH: 'TH',
  TD: 'TD',
  BLOCKQUOTE: 'BlockQuote',
  IMG: 'Figure',
  A: 'Link',
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface RenderOptions {
  paper: HTMLElement
  layout: Layout
  zoom: number
  title: string
  lang?: string
  editor: Editor
}

export async function renderPdf(opts: RenderOptions): Promise<Uint8Array> {
  const r = new Renderer(opts)
  return r.run()
}

class Renderer {
  private doc: PdfDoc
  private origin = { x: 0, y: 0 }
  private styles = new Map<Element, CSSStyleDeclaration>()
  private structs = new Map<Element, StructElem>()
  private faces = new Map<string, PdfFont | null>()
  private fonts = new Map<TrueType, PdfFont>()
  private images = new Map<string, PdfImage | null>()
  private footnote = 0
  private range = document.createRange()
  private headingTargets: { page: number; y: number }[][] = []

  constructor(private o: RenderOptions) {
    this.doc = new PdfDoc(o.title, o.lang)
  }

  async run(): Promise<Uint8Array> {
    const { paper, layout } = this.o
    const rect = paper.getBoundingClientRect()
    this.origin = { x: rect.left, y: rect.top }
    for (const p of layout.pages) this.doc.addPage(p.geo.width * PT, p.geo.height * PT)
    this.collectHeadingTargets()
    const editor = paper.querySelector('#editor')
    const chrome = paper.querySelector('#page-chrome')
    if (editor) await this.walk(editor, null)
    if (chrome) await this.walk(chrome, 'artifact')
    return this.doc.finish()
  }

  // ---------- Geometry ----------

  private box(r: DOMRect): Box {
    const z = this.o.zoom
    return { x: (r.left - this.origin.x) / z, y: (r.top - this.origin.y) / z, w: r.width / z, h: r.height / z }
  }

  private pageAt(y: number): { page: PdfPage; box: PageBox } | null {
    const pages = this.o.layout.pages
    for (let i = pages.length - 1; i >= 0; i--) {
      if (y >= pages[i].y - 1) return y <= pages[i].y + pages[i].geo.height + 1 ? { page: this.doc.pages[i], box: pages[i] } : null
    }
    return null
  }

  // Page-relative PDF coordinates of a paper point.
  private pt(p: PageBox, x: number, y: number): [number, number] {
    return [(x - p.x) * PT, (p.geo.height - (y - p.y)) * PT]
  }

  private style(el: Element): CSSStyleDeclaration {
    let s = this.styles.get(el)
    if (!s) {
      s = getComputedStyle(el)
      this.styles.set(el, s)
    }
    return s
  }

  // ---------- Structure ----------

  private structFor(el: Element | null, artifact: boolean): StructElem | 'artifact' {
    if (artifact) return 'artifact'
    for (let e = el; e && e !== this.o.paper; e = e.parentElement) {
      if (this.structType(e)) return this.struct(e)
    }
    return this.doc.root
  }

  private structType(e: Element): string | null {
    if (e.classList.contains('toc')) return 'TOC'
    if (e.classList.contains('toc-entry')) return 'TOCI'
    if (e.classList.contains('page-note')) return 'Note'
    if (e.classList.contains('bibliography')) return 'Div'
    return STRUCT[e.tagName] ?? null
  }

  private struct(e: Element): StructElem {
    let s = this.structs.get(e)
    if (s) return s
    let parentEl: Element | null = e.parentElement
    let parent: StructElem = this.doc.root
    for (; parentEl && parentEl !== this.o.paper; parentEl = parentEl.parentElement) {
      if (this.structType(parentEl)) {
        parent = this.struct(parentEl)
        break
      }
    }
    const type = this.structType(e)!
    const extra: Partial<StructElem> = {}
    if (e.tagName === 'IMG') extra.alt = (e as HTMLImageElement).alt || (e as HTMLImageElement).title || ''
    const lang = e.getAttribute('lang')
    if (lang) extra.lang = lang
    s = this.doc.elem(type, parent, extra)
    // List items hold their content in a list body.
    if (type === 'LI') {
      const body = this.doc.elem('LBody', s)
      this.structs.set(e, body)
      return body
    }
    this.structs.set(e, s)
    return s
  }

  // ---------- Walk ----------

  private skip(el: Element, s: CSSStyleDeclaration): boolean {
    if (s.display === 'none') return true
    // Visually hidden content (screen reader text, KaTeX's MathML copy).
    if ((s.clip && s.clip !== 'auto') || /inset\(50%/.test(s.clipPath)) return true
    if (s.position === 'absolute' && el.getBoundingClientRect().width <= 1 && el.getBoundingClientRect().height <= 1) return true
    const cls = el.classList
    return (
      cls.contains('collaboration-carets__caret') ||
      cls.contains('collaboration-carets__label') ||
      cls.contains('ProseMirror-gapcursor') ||
      cls.contains('toc-update') ||
      cls.contains('measure') ||
      cls.contains('column-resize-handle') ||
      cls.contains('ProseMirror-separator') ||
      el.tagName === 'BUTTON' ||
      el.tagName === 'TEMPLATE' ||
      el.tagName === 'STYLE'
    )
  }

  private async walk(el: Element, mode: 'artifact' | null): Promise<void> {
    const s = this.style(el)
    if (this.skip(el, s)) return
    const artifact = mode === 'artifact' || el.classList.contains('page-header') || el.classList.contains('page-footer')
    const visible = s.visibility !== 'hidden' && parseFloat(s.opacity) > 0.01
    if (visible) this.paintBox(el, s)
    if (el.tagName === 'IMG') {
      if (visible) await this.image(el as HTMLImageElement, artifact)
      return
    }
    if (el.tagName === 'svg') {
      if (visible) this.svg(el as SVGSVGElement)
      return
    }
    if (el.tagName === 'INPUT') {
      if (visible) this.checkbox(el as HTMLInputElement)
      return
    }
    if (el.tagName === 'LI' && visible) await this.marker(el as HTMLLIElement, s, artifact)
    if (el.matches('sup.footnote-ref')) {
      this.footnote++
      await this.drawText(String(this.footnote), el, this.box(el.getBoundingClientRect()), s, artifact)
    }
    if (/^H[1-6]$/.test(el.tagName) && el.closest('.ProseMirror') && !el.closest('.toc')) this.outlineItem(el)
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (visible) await this.text(child as Text, el, s, artifact)
      } else if (child.nodeType === Node.ELEMENT_NODE) await this.walk(child as Element, artifact ? 'artifact' : null)
    }
    if (el.tagName === 'A') this.link(el as HTMLAnchorElement)
  }

  // ---------- Boxes ----------

  private paintBox(el: Element, s: CSSStyleDeclaration) {
    const bg = color(s.backgroundColor)
    const borders = (['Top', 'Right', 'Bottom', 'Left'] as const).filter((side) => {
      const w = parseFloat(s.getPropertyValue(`border-${side.toLowerCase()}-width`))
      const st = s.getPropertyValue(`border-${side.toLowerCase()}-style`)
      return w > 0.2 && st !== 'none' && st !== 'hidden' && color(s.getPropertyValue(`border-${side.toLowerCase()}-color`))
    })
    if (!bg && !borders.length) return
    const inline = s.display === 'inline'
    const rects = inline ? [...el.getClientRects()] : [el.getBoundingClientRect()]
    for (const rect of rects) {
      const b = this.box(rect)
      if (b.w <= 0 && b.h <= 0) continue
      const at = this.pageAt(b.y + Math.min(b.h, 2) / 2)
      if (!at) continue
      const { page, box } = at
      page.mark('artifact')
      const ops = page.ops
      if (bg && b.w > 0 && b.h > 0) {
        const [x, y] = this.pt(box, b.x, b.y + b.h)
        ops.push(`q ${rgb(bg)} ${num(x)} ${num(y)} ${num(b.w * PT)} ${num(b.h * PT)} re f Q`)
      }
      for (const side of borders) {
        const key = side.toLowerCase()
        const w = parseFloat(s.getPropertyValue(`border-${key}-width`))
        const c = color(s.getPropertyValue(`border-${key}-color`))!
        const style = s.getPropertyValue(`border-${key}-style`)
        let x1: number, y1: number, x2: number, y2: number
        if (side === 'Top') [x1, y1, x2, y2] = [b.x, b.y + w / 2, b.x + b.w, b.y + w / 2]
        else if (side === 'Bottom') [x1, y1, x2, y2] = [b.x, b.y + b.h - w / 2, b.x + b.w, b.y + b.h - w / 2]
        else if (side === 'Left') [x1, y1, x2, y2] = [b.x + w / 2, b.y, b.x + w / 2, b.y + b.h]
        else [x1, y1, x2, y2] = [b.x + b.w - w / 2, b.y, b.x + b.w - w / 2, b.y + b.h]
        const [px1, py1] = this.pt(box, x1, y1)
        const [px2, py2] = this.pt(box, x2, y2)
        const lw = w * PT
        const dash = style === 'dotted' ? `[0 ${num(lw * 2)}] 0 d 1 J` : style === 'dashed' ? `[${num(lw * 3)} ${num(lw * 2)}] 0 d` : ''
        ops.push(`q ${rgb(c, true)} ${num(lw)} w ${dash} ${num(px1)} ${num(py1)} m ${num(px2)} ${num(py2)} l S Q`)
      }
    }
  }

  // ---------- Text ----------

  private async face(faces: FontFace[]): Promise<PdfFont[]> {
    const out: PdfFont[] = []
    for (const f of faces) {
      let pf = this.faces.get(f.key)
      if (pf === undefined) {
        const tt = await loadFace(f)
        pf = tt ? (this.fonts.get(tt) ?? this.doc.addFont(tt)) : null
        if (tt && pf) this.fonts.set(tt, pf)
        this.faces.set(f.key, pf)
      }
      if (pf) out.push(pf)
    }
    return out
  }

  // Splits text into runs by the first font that has each character.
  private async runs(text: string, s: CSSStyleDeclaration): Promise<{ font: PdfFont; text: string }[]> {
    const bold = parseInt(s.fontWeight) >= 600 || s.fontWeight === 'bold'
    const italic = s.fontStyle === 'italic' || s.fontStyle.startsWith('oblique')
    const primary = await this.face(facesFor(s.fontFamily, bold, italic))
    const out: { font: PdfFont; text: string }[] = []
    let fallback: PdfFont[] | null = null
    for (const ch of text) {
      let font = primary.find((f) => f.has(ch))
      if (!font && !/\s/.test(ch)) {
        fallback ??= await this.face(fallbackFaces(bold, italic))
        font = fallback.find((f) => f.has(ch))
      }
      font ??= primary[0]
      if (!font) continue
      const last = out[out.length - 1]
      if (last && last.font === font) last.text += ch
      else out.push({ font, text: ch })
    }
    return out
  }

  private async text(node: Text, parent: Element, s: CSSStyleDeclaration, artifact: boolean) {
    const data = node.data
    if (!data.trim()) return
    const re = /\S+\s*/g
    let m: RegExpExecArray | null
    while ((m = re.exec(data))) {
      const word = m[0].trimEnd()
      const start = m.index
      this.range.setStart(node, start)
      this.range.setEnd(node, start + word.length)
      const rects = [...this.range.getClientRects()].filter((r) => r.width > 0 || r.height > 0)
      if (!rects.length) continue
      if (rects.length === 1) {
        const full = m[0].length > word.length ? m[0].slice(0, word.length + 1) : word
        // Underlines run on under the following space when it is on the same line.
        let deco = 0
        if (m[0].length > word.length) {
          this.range.setEnd(node, start + m[0].length)
          const all = [...this.range.getClientRects()].filter((r) => r.width > 0)
          if (all.length === 1) deco = this.box(all[0]).w
        }
        await this.drawText(full, parent, this.box(rects[0]), s, artifact, word, deco)
        continue
      }
      // A word broken across lines: draw it character by character.
      for (let i = 0; i < word.length; i++) {
        this.range.setStart(node, start + i)
        this.range.setEnd(node, start + i + 1)
        const r = this.range.getClientRects()[0]
        if (r) await this.drawText(word[i], parent, this.box(r), s, artifact)
      }
    }
  }

  // Draws text whose (measured) box is `b`; `measured` is the part the box covers.
  private async drawText(text: string, el: Element, b: Box, s: CSSStyleDeclaration, artifact: boolean, measured = text, decoWidth = 0) {
    const at = this.pageAt(b.y + b.h / 2)
    if (!at) return
    const runs = await this.runs(text, s)
    if (!runs.length) return
    const c = color(s.color) ?? { r: 0, g: 0, b: 0 }
    const size = parseFloat(s.fontSize)
    const sizePt = size * PT
    const font = runs[0].font.font
    const asc = font.ascent / font.unitsPerEm
    const desc = -font.descent / font.unitsPerEm
    const baseline = b.y + (b.h * asc) / (asc + desc || 1)
    // Width of the measured part in the PDF fonts, to scale it to the browser's width.
    let natural = 0
    let left = measured.length
    for (const r of runs) {
      const part = r.text.slice(0, Math.max(0, left))
      left -= r.text.length
      natural += (r.font.encode(part).width / 1000) * sizePt
    }
    const scale = natural > 0 ? Math.max(30, Math.min(300, ((b.w * PT) / natural) * 100)) : 100
    const { page, box } = at
    page.mark(this.structFor(el, artifact))
    let [x, y] = this.pt(box, b.x, baseline)
    const ops = [`BT ${rgb(c)} ${num(scale)} Tz`]
    for (const r of runs) {
      const e = r.font.encode(r.text)
      if (!e.hex) continue
      page.fonts.add(r.font)
      ops.push(`/${r.font.name} ${num(sizePt)} Tf 1 0 0 1 ${num(x)} ${num(y)} Tm <${e.hex}> Tj`)
      x += (e.width / 1000) * sizePt * (scale / 100)
    }
    ops.push('ET')
    page.ops.push(ops.join(' '))
    this.decorations(el, decoWidth ? { ...b, w: decoWidth } : b, baseline, size, box, page)
  }

  // Underline and strike-through from the element and its inline ancestors.
  private decorations(el: Element, b: Box, baseline: number, size: number, box: PageBox, page: PdfPage) {
    for (let e: Element | null = el; e && e !== this.o.paper; e = e.parentElement) {
      const s = this.style(e)
      const line = s.textDecorationLine
      if (line && line !== 'none') {
        const c = color(s.textDecorationColor) ?? color(s.color) ?? { r: 0, g: 0, b: 0 }
        const thick = Math.max(0.5, size * 0.06)
        for (const kind of ['underline', 'line-through'] as const) {
          if (!line.includes(kind)) continue
          const yy = kind === 'underline' ? baseline + size * 0.12 : baseline - size * 0.28
          const [x1, py] = this.pt(box, b.x, yy)
          page.ops.push(`q ${rgb(c, true)} ${num(thick * PT)} w ${num(x1)} ${num(py)} m ${num(x1 + b.w * PT)} ${num(py)} l S Q`)
        }
      }
      if (s.display !== 'inline') break
    }
  }

  // ---------- Lists, checkboxes ----------

  private async marker(li: HTMLLIElement, s: CSSStyleDeclaration, artifact: boolean) {
    const type = s.listStyleType
    if (!type || type === 'none' || s.display !== 'list-item') return
    const b = this.box(li.getBoundingClientRect())
    // Baseline of the first line: from the first text in the item.
    const walker = document.createTreeWalker(li, NodeFilter.SHOW_TEXT, { acceptNode: (n) => ((n as Text).data.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) })
    const first = walker.nextNode() as Text | null
    const size = parseFloat(s.fontSize)
    let top = b.y
    let height = size * 1.15
    if (first) {
      this.range.selectNodeContents(first)
      const r = this.range.getClientRects()[0]
      if (r) {
        const fb = this.box(r)
        top = fb.y
        height = fb.h
      }
    }
    const at = this.pageAt(top + height / 2)
    if (!at) return
    const { page, box } = at
    const baseline = top + height * 0.8
    if (type === 'disc' || type === 'circle' || type === 'square') {
      const c = color(s.color) ?? { r: 0, g: 0, b: 0 }
      const r = size * 0.17
      const cx = b.x - size * 0.62
      const cy = baseline - size * 0.3
      const [px, py] = this.pt(box, cx, cy)
      page.mark('artifact')
      const k = 0.5523 * r * PT
      const R = r * PT
      const path = `${num(px + R)} ${num(py)} m ${num(px + R)} ${num(py + k)} ${num(px + k)} ${num(py + R)} ${num(px)} ${num(py + R)} c ${num(px - k)} ${num(py + R)} ${num(px - R)} ${num(py + k)} ${num(px - R)} ${num(py)} c ${num(px - R)} ${num(py - k)} ${num(px - k)} ${num(py - R)} ${num(px)} ${num(py - R)} c ${num(px + k)} ${num(py - R)} ${num(px + R)} ${num(py - k)} ${num(px + R)} ${num(py)} c`
      if (type === 'square') page.ops.push(`q ${rgb(c)} ${num(px - R)} ${num(py - R)} ${num(2 * R)} ${num(2 * R)} re f Q`)
      else if (type === 'circle') page.ops.push(`q ${rgb(c, true)} ${num(size * 0.06 * PT)} w ${path} S Q`)
      else page.ops.push(`q ${rgb(c)} ${path} f Q`)
      return
    }
    const list = li.parentElement
    const items = list ? [...list.children].filter((c) => c.tagName === 'LI') : [li]
    const start = list instanceof HTMLOListElement ? list.start || 1 : 1
    const n = start + items.indexOf(li)
    const label = `${formatNumber(n, type)}.`
    const runs = await this.runs(label, s)
    const width = runs.reduce((w, r) => w + (r.font.encode(r.text).width / 1000) * size, 0)
    const gap = size * 0.3
    await this.drawText(label, li, { x: b.x - gap - width, y: top, w: width, h: height }, s, artifact)
  }

  private checkbox(input: HTMLInputElement) {
    if (input.type !== 'checkbox') return
    const b = this.box(input.getBoundingClientRect())
    const at = this.pageAt(b.y + b.h / 2)
    if (!at) return
    const { page, box } = at
    const [x, y] = this.pt(box, b.x, b.y + b.h)
    page.mark('artifact')
    page.ops.push(`q 0.3 0.3 0.3 RG 0.75 w ${num(x)} ${num(y)} ${num(b.w * PT)} ${num(b.h * PT)} re S Q`)
    if (input.checked) {
      const [x1, y1] = this.pt(box, b.x + b.w * 0.2, b.y + b.h * 0.55)
      const [x2, y2] = this.pt(box, b.x + b.w * 0.42, b.y + b.h * 0.78)
      const [x3, y3] = this.pt(box, b.x + b.w * 0.82, b.y + b.h * 0.22)
      page.ops.push(`q 0.1 0.1 0.1 RG 1.2 w 1 J 1 j ${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l ${num(x3)} ${num(y3)} l S Q`)
    }
  }

  // ---------- Images ----------

  private async image(img: HTMLImageElement, artifact: boolean) {
    const b = this.box(img.getBoundingClientRect())
    if (b.w < 1 || b.h < 1) return
    const at = this.pageAt(b.y + b.h / 2)
    if (!at) return
    const pdfImage = await this.loadImage(img)
    if (!pdfImage) return
    const { page, box } = at
    page.mark(this.structFor(img, artifact))
    page.images.add(pdfImage)
    const [x, y] = this.pt(box, b.x, b.y + b.h)
    page.ops.push(`q ${num(b.w * PT)} 0 0 ${num(b.h * PT)} ${num(x)} ${num(y)} cm /${pdfImage.name} Do Q`)
  }

  private async loadImage(img: HTMLImageElement): Promise<PdfImage | null> {
    const src = img.currentSrc || img.src
    if (this.images.has(src)) return this.images.get(src)!
    let out: PdfImage | null = null
    try {
      if (!img.complete) await img.decode()
      const w = img.naturalWidth
      const h = img.naturalHeight
      if (/^data:image\/jpe?g;base64,/i.test(src) && w && h) {
        const bytes = Uint8Array.from(atob(src.slice(src.indexOf(',') + 1)), (c) => c.charCodeAt(0))
        out = this.doc.addImage({ width: w, height: h, data: bytes, filter: 'DCTDecode', colors: 3 })
      } else {
        let source: CanvasImageSource = img
        let sw = w
        let sh = h
        if (!/^(data|blob):/.test(src) && new URL(src, location.href).origin !== location.origin) {
          // Remote images must be fetched (CORS) to be read.
          const bitmap = await createImageBitmap(await (await fetch(src)).blob())
          source = bitmap
          sw = bitmap.width
          sh = bitmap.height
        }
        const scale = Math.min(1, 2400 / Math.max(sw, sh, 1))
        const cw = Math.max(1, Math.round(sw * scale))
        const ch = Math.max(1, Math.round(sh * scale))
        const canvas = document.createElement('canvas')
        canvas.width = cw
        canvas.height = ch
        const g = canvas.getContext('2d')!
        g.drawImage(source, 0, 0, cw, ch)
        const data = g.getImageData(0, 0, cw, ch).data
        const rgbData = new Uint8Array(cw * ch * 3)
        const alpha = new Uint8Array(cw * ch)
        let transparent = false
        for (let i = 0, j = 0; i < data.length; i += 4, j++) {
          rgbData[j * 3] = data[i]
          rgbData[j * 3 + 1] = data[i + 1]
          rgbData[j * 3 + 2] = data[i + 2]
          alpha[j] = data[i + 3]
          if (data[i + 3] < 255) transparent = true
        }
        out = this.doc.addImage({ width: cw, height: ch, data: rgbData, filter: 'FlateDecode', colors: 3, alpha: transparent ? alpha : undefined })
      }
    } catch (err) {
      console.warn('PDF: image skipped', err)
    }
    this.images.set(src, out)
    return out
  }

  // ---------- SVG (KaTeX roots, arrows…) ----------

  private svg(svg: SVGSVGElement) {
    const b = this.box(svg.getBoundingClientRect())
    if (b.w <= 0 || b.h <= 0) return
    const at = this.pageAt(b.y + b.h / 2)
    if (!at) return
    const { page, box } = at
    const vb = svg.viewBox.baseVal
    const vx = vb && vb.width ? vb.x : 0
    const vy = vb && vb.height ? vb.y : 0
    const vw = vb && vb.width ? vb.width : b.w
    const vh = vb && vb.height ? vb.height : b.h
    const aspect = svg.getAttribute('preserveAspectRatio') ?? 'xMidYMid meet'
    let sx = b.w / vw
    let sy = b.h / vh
    if (!aspect.startsWith('none')) sx = sy = aspect.includes('slice') ? Math.max(sx, sy) : Math.min(sx, sy)
    // Clipped by the nearest ancestor that hides overflow (KaTeX stretchy parts).
    let clip: Box = b
    for (let e = svg.parentElement; e && e !== this.o.paper; e = e.parentElement) {
      if (this.style(e).overflow === 'hidden' || this.style(e).overflowX === 'hidden') {
        clip = this.box(e.getBoundingClientRect())
        break
      }
    }
    const map = (x: number, y: number) => this.pt(box, b.x + (x - vx) * sx, b.y + (y - vy) * sy)
    page.mark('artifact')
    const [cx, cy] = this.pt(box, clip.x, clip.y + clip.h)
    const ops = [`q ${num(cx)} ${num(cy)} ${num(clip.w * PT)} ${num(clip.h * PT)} re W n`]
    for (const shape of svg.querySelectorAll('path, line, rect')) {
      const s = this.style(shape)
      const fill = s.fill && s.fill !== 'none' ? color(s.fill === 'currentcolor' ? s.color : s.fill) : null
      const stroke = s.stroke && s.stroke !== 'none' ? color(s.stroke) : null
      let d = ''
      if (shape.tagName === 'path') d = pathOps(shape.getAttribute('d') ?? '', map)
      else if (shape.tagName === 'line') {
        const [x1, y1] = map(+shape.getAttribute('x1')!, +shape.getAttribute('y1')!)
        const [x2, y2] = map(+shape.getAttribute('x2')!, +shape.getAttribute('y2')!)
        d = `${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l`
      } else {
        const x = +(shape.getAttribute('x') ?? 0)
        const y = +(shape.getAttribute('y') ?? 0)
        const [x1, y1] = map(x, y + +(shape.getAttribute('height') ?? 0))
        const [x2, y2] = map(x + +(shape.getAttribute('width') ?? 0), y)
        d = `${num(x1)} ${num(y1)} ${num(x2 - x1)} ${num(y2 - y1)} re`
      }
      if (!d) continue
      const width = parseFloat(s.strokeWidth) || 1
      if (fill && stroke) ops.push(`${rgb(fill)} ${rgb(stroke, true)} ${num(width * sx * PT)} w ${d} B`)
      else if (fill) ops.push(`${rgb(fill)} ${d} f`)
      else if (stroke) ops.push(`${rgb(stroke, true)} ${num(width * sx * PT)} w ${d} S`)
      else if (shape.tagName === 'path') ops.push(`${rgb(color(s.color) ?? { r: 0, g: 0, b: 0 })} ${d} f`)
    }
    ops.push('Q')
    page.ops.push(ops.join('\n'))
  }

  // ---------- Links and outline ----------

  private collectHeadingTargets() {
    const { editor } = this.o
    for (const toc of this.o.paper.querySelectorAll('.toc')) {
      const pos = editor.view.posAtDOM(toc, 0)
      const node = editor.state.doc.nodeAt(pos) ?? editor.state.doc.nodeAt(pos - 1)
      const max = Number(node?.attrs.maxLevel) || 3
      this.headingTargets.push(
        tocHeadings(editor.state.doc, max).map(({ pos: p }) => {
          const dom = editor.view.nodeDOM(p)
          const b = dom instanceof HTMLElement ? this.box(dom.getBoundingClientRect()) : null
          const at = b ? this.pageAt(b.y) : null
          return at && b ? { page: at.box.index, y: (at.box.geo.height - (b.y - at.box.y)) * PT } : { page: 0, y: 0 }
        }),
      )
    }
  }

  private link(a: HTMLAnchorElement) {
    const target = a.getAttribute('data-toc-target')
    let action: string
    if (target !== null) {
      const tocs = [...this.o.paper.querySelectorAll('.toc')]
      const toc = a.closest('.toc')
      const t = this.headingTargets[tocs.indexOf(toc!)]?.[Number(target)]
      if (!t) return
      action = `/Dest [%DEST${t.page}% /XYZ 0 ${num(t.y + 4)} 0]`
    } else {
      const href = a.getAttribute('href') ?? ''
      if (!/^(https?|mailto|ftp):/i.test(href)) return
      action = `/A << /S /URI /URI ${pdfString(href)} >>`
    }
    for (const rect of a.getClientRects()) {
      const b = this.box(rect)
      const at = this.pageAt(b.y + b.h / 2)
      if (!at || b.w <= 0) continue
      const [x1, y1] = this.pt(at.box, b.x, b.y + b.h)
      const [x2, y2] = this.pt(at.box, b.x + b.w, b.y)
      at.page.annots.push(`<< /Type /Annot /Subtype /Link /Rect [${num(x1)} ${num(y1)} ${num(x2)} ${num(y2)}] /Border [0 0 0] /P %PAGE% ${action} >>`)
    }
  }

  private outlineItem(h: Element) {
    const title = (h.textContent ?? '').trim()
    if (!title) return
    const b = this.box(h.getBoundingClientRect())
    const at = this.pageAt(b.y + 1)
    if (!at) return
    this.doc.outline.push({ title, level: Number(h.tagName[1]), page: at.box.index, y: (at.box.geo.height - (b.y - at.box.y)) * PT + 4 })
  }
}

function formatNumber(n: number, type: string): string {
  if (type === 'lower-alpha' || type === 'lower-latin' || type === 'upper-alpha' || type === 'upper-latin') {
    let s = ''
    for (let v = n; v > 0; v = Math.floor((v - 1) / 26)) s = String.fromCharCode(97 + ((v - 1) % 26)) + s
    return type.startsWith('upper') ? s.toUpperCase() : s
  }
  if (type === 'lower-roman' || type === 'upper-roman') {
    const table: [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]
    let s = ''
    let v = n
    for (const [k, r] of table) while (v >= k) (s += r), (v -= k)
    return type.startsWith('upper') ? s.toUpperCase() : s
  }
  return String(n)
}

// SVG path data → PDF path operators (through a point mapping).
function pathOps(d: string, map: (x: number, y: number) => [number, number]): string {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? []
  const out: string[] = []
  let i = 0
  let cmd = ''
  let x = 0
  let y = 0
  let sx = 0
  let sy = 0
  let cx = 0 // last control point (for S / T)
  let cy = 0
  let prev = ''
  const n = () => parseFloat(tokens[i++])
  const P = (px: number, py: number) => map(px, py).map(num).join(' ')
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++]
    const rel = cmd === cmd.toLowerCase()
    const ox = rel ? x : 0
    const oy = rel ? y : 0
    switch (cmd.toUpperCase()) {
      case 'M':
        x = ox + n()
        y = oy + n()
        sx = x
        sy = y
        out.push(`${P(x, y)} m`)
        cmd = rel ? 'l' : 'L'
        break
      case 'L':
        x = ox + n()
        y = oy + n()
        out.push(`${P(x, y)} l`)
        break
      case 'H':
        x = ox + n()
        out.push(`${P(x, y)} l`)
        break
      case 'V':
        y = oy + n()
        out.push(`${P(x, y)} l`)
        break
      case 'C': {
        const x1 = ox + n(), y1 = oy + n(), x2 = ox + n(), y2 = oy + n()
        x = ox + n()
        y = oy + n()
        out.push(`${P(x1, y1)} ${P(x2, y2)} ${P(x, y)} c`)
        cx = x2
        cy = y2
        break
      }
      case 'S': {
        const x1 = /[CS]/i.test(prev) ? 2 * x - cx : x
        const y1 = /[CS]/i.test(prev) ? 2 * y - cy : y
        const x2 = ox + n(), y2 = oy + n()
        x = ox + n()
        y = oy + n()
        out.push(`${P(x1, y1)} ${P(x2, y2)} ${P(x, y)} c`)
        cx = x2
        cy = y2
        break
      }
      case 'Q':
      case 'T': {
        let qx: number, qy: number
        if (cmd.toUpperCase() === 'Q') {
          qx = ox + n()
          qy = oy + n()
        } else {
          qx = /[QT]/i.test(prev) ? 2 * x - cx : x
          qy = /[QT]/i.test(prev) ? 2 * y - cy : y
        }
        const ex = ox + n(), ey = oy + n()
        out.push(`${P(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y))} ${P(ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey))} ${P(ex, ey)} c`)
        cx = qx
        cy = qy
        x = ex
        y = ey
        break
      }
      case 'A': {
        // Arcs: approximated by a straight line to the end point.
        i += 5
        x = ox + n()
        y = oy + n()
        out.push(`${P(x, y)} l`)
        break
      }
      case 'Z':
        out.push('h')
        x = sx
        y = sy
        break
      default:
        i++
    }
    prev = cmd
  }
  return out.join(' ')
}
