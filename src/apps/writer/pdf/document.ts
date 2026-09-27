// A small PDF writer: pages with content streams, embedded TrueType fonts
// (subset, Identity-H, ToUnicode for text extraction), images, links, the
// outline (bookmarks) and a structure tree for tagged PDF.

import { subsetFont, type TrueType } from './sfnt'

const enc = new TextEncoder()

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

// Text string: ASCII literal, otherwise UTF-16BE hex with a byte order mark.
export function pdfString(s: string): string {
  if (/^[\x20-\x7e]*$/.test(s)) return `(${s.replace(/[\\()]/g, (c) => '\\' + c)})`
  let hex = 'FEFF'
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, '0')
  return `<${hex.toUpperCase()}>`
}

export const num = (n: number): string => (Math.abs(n) < 1e-4 ? '0' : String(Math.round(n * 1000) / 1000))

export class PdfFont {
  readonly used = new Map<number, string>()
  constructor(
    readonly name: string,
    readonly font: TrueType,
  ) {}

  // Glyph ids (hex) for a text; unknown characters are skipped.
  encode(text: string): { hex: string; width: number; missing: boolean } {
    let hex = ''
    let width = 0
    let missing = false
    for (const ch of text) {
      const cp = ch.codePointAt(0)!
      const gid = this.font.cmap.get(cp)
      if (!gid) {
        missing = missing || !/\s/.test(ch)
        continue
      }
      if (!this.used.has(gid)) this.used.set(gid, ch)
      hex += gid.toString(16).padStart(4, '0')
      width += this.font.advances[gid] ?? 0
    }
    return { hex, width: (width / this.font.unitsPerEm) * 1000, missing }
  }

  has(ch: string): boolean {
    return this.font.cmap.has(ch.codePointAt(0)!)
  }
}

export interface PdfImage {
  name: string
  width: number
  height: number
  data: Uint8Array
  filter: 'DCTDecode' | 'FlateDecode'
  colors: 1 | 3
  alpha?: Uint8Array
}

export interface StructElem {
  type: string
  parent: StructElem | null
  kids: (StructElem | { page: number; mcid: number })[]
  alt?: string
  lang?: string
  ref?: number
}

export class PdfPage {
  ops: string[] = []
  annots: string[] = []
  fonts = new Set<PdfFont>()
  images = new Set<PdfImage>()
  mcids: StructElem[] = []
  private open: StructElem | 'artifact' | null = null
  ref = 0

  constructor(
    readonly index: number,
    readonly width: number,
    readonly height: number,
  ) {}

  // Marked content: consecutive content of one structure element shares a sequence.
  mark(elem: StructElem | 'artifact'): void {
    if (this.open === elem) return
    this.close()
    if (elem === 'artifact') this.ops.push('/Artifact BMC')
    else {
      const mcid = this.mcids.length
      this.mcids.push(elem)
      elem.kids.push({ page: this.index, mcid })
      this.ops.push(`/${elem.type} <</MCID ${mcid}>> BDC`)
    }
    this.open = elem
  }

  close(): void {
    if (this.open) this.ops.push('EMC')
    this.open = null
  }
}

export interface OutlineItem {
  title: string
  level: number
  page: number
  y: number // PDF units from the bottom
}

export class PdfDoc {
  private objects: (Uint8Array | null)[] = []
  pages: PdfPage[] = []
  private fonts: PdfFont[] = []
  private imageList: PdfImage[] = []
  readonly root: StructElem = { type: 'Document', parent: null, kids: [] }
  outline: OutlineItem[] = []

  constructor(
    private title: string,
    private lang: string | undefined,
  ) {}

  private alloc(): number {
    this.objects.push(null)
    return this.objects.length
  }

  private put(ref: number, body: string | Uint8Array): void {
    this.objects[ref - 1] = typeof body === 'string' ? enc.encode(body) : body
  }

  private async putStream(ref: number, dict: string, data: Uint8Array, compress = true): Promise<void> {
    const body = compress ? await deflate(data) : data
    const head = enc.encode(`<<${dict}${compress ? ' /Filter /FlateDecode' : ''} /Length ${body.length}>>\nstream\n`)
    const tail = enc.encode('\nendstream')
    const out = new Uint8Array(head.length + body.length + tail.length)
    out.set(head)
    out.set(body, head.length)
    out.set(tail, head.length + body.length)
    this.put(ref, out)
  }

  addPage(width: number, height: number): PdfPage {
    const page = new PdfPage(this.pages.length, width, height)
    page.ref = this.alloc()
    this.pages.push(page)
    return page
  }

  addFont(font: TrueType): PdfFont {
    const f = new PdfFont(`F${this.fonts.length + 1}`, font)
    this.fonts.push(f)
    return f
  }

  addImage(img: Omit<PdfImage, 'name'>): PdfImage {
    const out = { ...img, name: `Im${this.imageList.length + 1}` }
    this.imageList.push(out)
    return out
  }

  elem(type: string, parent: StructElem, extra: Partial<StructElem> = {}): StructElem {
    const e: StructElem = { type, parent, kids: [], ...extra }
    parent.kids.push(e)
    return e
  }

  async finish(): Promise<Uint8Array> {
    const catalog = this.alloc()
    const pagesRef = this.alloc()
    const info = this.alloc()

    // Fonts.
    const fontRefs = new Map<PdfFont, number>()
    for (const f of this.fonts) {
      if (!f.used.size) continue
      const ref = this.alloc()
      fontRefs.set(f, ref)
      await this.writeFont(f, ref)
    }
    // Images.
    const imageRefs = new Map<PdfImage, number>()
    for (const img of this.imageList) {
      const ref = this.alloc()
      imageRefs.set(img, ref)
      let smask = ''
      if (img.alpha) {
        const m = this.alloc()
        await this.putStream(m, ` /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceGray /BitsPerComponent 8`, img.alpha)
        smask = ` /SMask ${m} 0 R`
      }
      const cs = img.colors === 1 ? '/DeviceGray' : '/DeviceRGB'
      if (img.filter === 'DCTDecode') {
        const head = enc.encode(`<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode${smask} /Length ${img.data.length}>>\nstream\n`)
        const tail = enc.encode('\nendstream')
        const out = new Uint8Array(head.length + img.data.length + tail.length)
        out.set(head)
        out.set(img.data, head.length)
        out.set(tail, head.length + img.data.length)
        this.put(ref, out)
      } else await this.putStream(ref, ` /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace ${cs} /BitsPerComponent 8${smask}`, img.data)
    }

    // Structure tree: references first (pages point to it through /StructParents).
    const structRoot = this.alloc()
    const all: StructElem[] = []
    const assign = (e: StructElem) => {
      e.ref = this.alloc()
      all.push(e)
      for (const k of e.kids) if ('type' in k) assign(k)
    }
    assign(this.root)

    // Pages.
    for (const page of this.pages) {
      page.close()
      const content = this.alloc()
      await this.putStream(content, '', enc.encode(page.ops.join('\n')))
      const fonts = [...page.fonts].filter((f) => fontRefs.has(f)).map((f) => `/${f.name} ${fontRefs.get(f)} 0 R`)
      const xobjects = [...page.images].map((i) => `/${i.name} ${imageRefs.get(i)} 0 R`)
      const annots = page.annots.map((a) => {
        const ref = this.alloc()
        // %DESTn%: page n of an internal link.
        this.put(ref, a.replace('%PAGE%', `${page.ref} 0 R`).replace(/%DEST(\d+)%/g, (_m, p) => `${(this.pages[Number(p)] ?? this.pages[0]).ref} 0 R`))
        return `${ref} 0 R`
      })
      this.put(
        page.ref,
        `<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 ${num(page.width)} ${num(page.height)}] /Contents ${content} 0 R` +
          ` /Resources << /Font << ${fonts.join(' ')} >> /XObject << ${xobjects.join(' ')} >> >>` +
          (annots.length ? ` /Annots [${annots.join(' ')}]` : '') +
          ` /StructParents ${page.index} /Tabs /S >>`,
      )
    }
    this.put(pagesRef, `<< /Type /Pages /Kids [${this.pages.map((p) => `${p.ref} 0 R`).join(' ')}] /Count ${this.pages.length} >>`)

    for (const e of all) {
      const kids = e.kids.map((k) => ('type' in k ? `${k.ref} 0 R` : `<< /Type /MCR /Pg ${this.pages[k.page].ref} 0 R /MCID ${k.mcid} >>`))
      const parent = e.parent ? `${e.parent.ref} 0 R` : `${structRoot} 0 R`
      const alt = e.alt ? ` /Alt ${pdfString(e.alt)}` : ''
      const lang = e.lang ? ` /Lang ${pdfString(e.lang)}` : ''
      this.put(e.ref!, `<< /Type /StructElem /S /${e.type} /P ${parent}${alt}${lang} /K [${kids.join(' ')}] >>`)
    }
    const parentTree = this.alloc()
    this.put(parentTree, `<< /Nums [${this.pages.map((p) => `${p.index} [${p.mcids.map((e) => `${e.ref} 0 R`).join(' ')}]`).join(' ')}] >>`)
    this.put(structRoot, `<< /Type /StructTreeRoot /K [${this.root.ref} 0 R] /ParentTree ${parentTree} 0 R /ParentTreeNextKey ${this.pages.length} >>`)

    const outline = this.writeOutline()
    this.put(
      catalog,
      `<< /Type /Catalog /Pages ${pagesRef} 0 R /MarkInfo << /Marked true >> /StructTreeRoot ${structRoot} 0 R` +
        ` /ViewerPreferences << /DisplayDocTitle true >>` +
        (this.lang ? ` /Lang ${pdfString(this.lang)}` : '') +
        (outline ? ` /Outlines ${outline} 0 R /PageMode /UseOutlines` : '') +
        ' >>',
    )
    const date = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
    this.put(info, `<< /Title ${pdfString(this.title)} /Producer (Ofimeo) /Creator (Ofimeo) /CreationDate (D:${date}Z) >>`)
    return this.serialize(catalog, info)
  }

  private writeOutline(): number | null {
    if (!this.outline.length) return null
    interface Node {
      item: OutlineItem | null
      kids: Node[]
      ref: number
    }
    const root: Node = { item: null, kids: [], ref: this.alloc() }
    const stack: Node[] = [root]
    for (const item of this.outline) {
      while (stack.length > 1 && stack[stack.length - 1].item!.level >= item.level) stack.pop()
      const node: Node = { item, kids: [], ref: this.alloc() }
      stack[stack.length - 1].kids.push(node)
      stack.push(node)
    }
    const count = (n: Node): number => n.kids.reduce((s, k) => s + 1 + count(k), 0)
    const write = (n: Node, parent: Node | null) => {
      n.kids.forEach((k) => write(k, n))
      const kids = n.kids.length ? ` /First ${n.kids[0].ref} 0 R /Last ${n.kids[n.kids.length - 1].ref} 0 R /Count ${count(n)}` : ''
      if (!n.item) {
        this.put(n.ref, `<< /Type /Outlines${kids} >>`)
        return
      }
      const siblings = parent!.kids
      const i = siblings.indexOf(n)
      const prev = i > 0 ? ` /Prev ${siblings[i - 1].ref} 0 R` : ''
      const next = i < siblings.length - 1 ? ` /Next ${siblings[i + 1].ref} 0 R` : ''
      const page = this.pages[n.item.page] ?? this.pages[0]
      this.put(n.ref, `<< /Title ${pdfString(n.item.title)} /Parent ${parent!.ref} 0 R${prev}${next}${kids} /Dest [${page.ref} 0 R /XYZ 0 ${num(n.item.y)} 0] >>`)
    }
    write(root, null)
    return root.ref
  }

  private async writeFont(f: PdfFont, ref: number): Promise<void> {
    const font = f.font
    const scale = 1000 / font.unitsPerEm
    const tag = Array.from({ length: 6 }, (_, i) => String.fromCharCode(65 + ((ref * 7 + i * 3) % 26))).join('')
    const base = `${tag}+${font.name}`
    const file = this.alloc()
    const data = subsetFont(font, new Set(f.used.keys()))
    await this.putStream(file, ` /Length1 ${data.length}`, data)
    const flags = (font.fixedPitch ? 1 : 0) | 32 | (font.italicAngle ? 64 : 0)
    const desc = this.alloc()
    const b = font.bbox.map((v) => Math.round(v * scale))
    this.put(
      desc,
      `<< /Type /FontDescriptor /FontName /${base} /Flags ${flags} /FontBBox [${b.join(' ')}] /ItalicAngle ${num(font.italicAngle)}` +
        ` /Ascent ${Math.round(font.ascent * scale)} /Descent ${Math.round(font.descent * scale)} /CapHeight ${Math.round(font.capHeight * scale)} /StemV 80 /FontFile2 ${file} 0 R >>`,
    )
    const gids = [...f.used.keys()].sort((a, b) => a - b)
    const widths = gids.map((g) => `${g} [${Math.round((font.advances[g] ?? 0) * scale)}]`).join(' ')
    const cid = this.alloc()
    this.put(
      cid,
      `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${base} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >>` +
        ` /FontDescriptor ${desc} 0 R /DW ${Math.round((font.advances[0] ?? 500) * scale)} /W [${widths}] /CIDToGIDMap /Identity >>`,
    )
    const toUnicode = this.alloc()
    const hex = (s: string) => [...s].map((c) => {
      const cp = c.codePointAt(0)!
      if (cp < 0x10000) return cp.toString(16).padStart(4, '0')
      const v = cp - 0x10000
      return ((0xd800 + (v >> 10)).toString(16) + (0xdc00 + (v & 0x3ff)).toString(16))
    }).join('')
    const lines: string[] = []
    for (let i = 0; i < gids.length; i += 100) {
      const chunk = gids.slice(i, i + 100)
      lines.push(`${chunk.length} beginbfchar`, ...chunk.map((g) => `<${g.toString(16).padStart(4, '0')}> <${hex(f.used.get(g)!)}>`), 'endbfchar')
    }
    const cmap =
      '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n' +
      '/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n' +
      lines.join('\n') +
      '\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend'
    await this.putStream(toUnicode, '', enc.encode(cmap))
    this.put(ref, `<< /Type /Font /Subtype /Type0 /BaseFont /${base} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${toUnicode} 0 R >>`)
  }

  private serialize(catalog: number, info: number): Uint8Array {
    const header = new Uint8Array([...enc.encode('%PDF-1.7\n%'), 0xe2, 0xe3, 0xcf, 0xd3, 10])
    const chunks: Uint8Array[] = [header]
    const offsets: number[] = []
    let size = header.length
    this.objects.forEach((o, i) => {
      offsets.push(size)
      const head = enc.encode(`${i + 1} 0 obj\n`)
      const body = o ?? enc.encode('null')
      const tail = enc.encode('\nendobj\n')
      chunks.push(head, body, tail)
      size += head.length + body.length + tail.length
    })
    const xref =
      `xref\n0 ${this.objects.length + 1}\n0000000000 65535 f \n` +
      offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('') +
      `trailer\n<< /Size ${this.objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R /ID [<${randomId()}> <${randomId()}>] >>\nstartxref\n${size}\n%%EOF\n`
    chunks.push(enc.encode(xref))
    const out = new Uint8Array(size + chunks[chunks.length - 1].length)
    let o = 0
    for (const c of chunks) {
      out.set(c, o)
      o += c.length
    }
    return out
  }
}

function randomId(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('')
}
