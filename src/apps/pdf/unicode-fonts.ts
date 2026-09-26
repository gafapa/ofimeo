// Unicode text for the PDF export: characters the standard Helvetica fonts
// (WinAnsi) lack (π ≈ √ → ✓ Ł, Greek, Cyrillic…) are drawn with embedded
// TrueType subsets: Arimo (metric-compatible with Helvetica, Latin Extended)
// and a DejaVu Sans symbols subset (Greek, Cyrillic, arrows, maths, dingbats).
// Loaded only when an exported text needs it. Fonts are written as Type0 /
// Identity-H with a ToUnicode map, so the text stays searchable and copyable.

import { PDFNumber, PDFString, type PDFDocument, type PDFRef } from 'pdf-lib'
import type { TrueType } from '../writer/pdf/sfnt'

const arimo = import.meta.glob('../writer/fonts/arimo-latin-*-normal.woff', { query: '?url', import: 'default' }) as Record<string, () => Promise<string>>
const symbols = import.meta.glob('./fonts/dejavu-sans-symbols.woff', { query: '?url', import: 'default' }) as Record<string, () => Promise<string>>

export interface UnicodeFace {
  name: string
  font: TrueType
  ref: PDFRef
  // Glyph id → text it shows (for ToUnicode).
  used: Map<number, string>
}

export interface UnicodeFonts {
  // First face that has the character (bold faces first when bold).
  faceFor(char: string, bold: boolean): UnicodeFace | null
  faces: UnicodeFace[]
  // Writes the subset font objects; call once, before saving.
  finish(): void
}

async function load(url: string, sfnt: typeof import('../writer/pdf/sfnt')): Promise<TrueType | null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const font = await sfnt.parseFont(await r.arrayBuffer())
    return font.embeddable ? font : null
  } catch (err) {
    console.warn('PDF export: font not available', url, err)
    return null
  }
}

export async function loadUnicodeFonts(doc: PDFDocument): Promise<UnicodeFonts> {
  const sfnt = await import('../writer/pdf/sfnt')
  const url = async (files: Record<string, () => Promise<string>>, part: string) => {
    const key = Object.keys(files).find((k) => k.includes(part))
    return key ? files[key]() : null
  }
  const specs: [string, string | null][] = await Promise.all(
    [
      ['R', 'arimo-latin-400'],
      ['R', 'arimo-latin-ext-400'],
      ['B', 'arimo-latin-700'],
      ['B', 'arimo-latin-ext-700'],
    ].map(async ([w, part]) => [w, await url(arimo, `/${part}-normal`)] as [string, string | null]),
  )
  specs.push(['*', await url(symbols, 'dejavu-sans-symbols')])
  const faces: (UnicodeFace & { weight: string })[] = []
  for (const [weight, u] of specs) {
    if (!u) continue
    const font = await load(u, sfnt)
    if (font) faces.push({ name: font.name, font, ref: doc.context.nextRef(), used: new Map(), weight })
  }
  const cache = new Map<string, UnicodeFace | null>()
  return {
    faces,
    faceFor(char, bold) {
      const key = `${bold ? 'B' : 'R'}${char}`
      if (cache.has(key)) return cache.get(key)!
      const cp = char.codePointAt(0)!
      const order = [...faces.filter((f) => f.weight === (bold ? 'B' : 'R')), ...faces.filter((f) => f.weight === (bold ? 'R' : 'B')), ...faces.filter((f) => f.weight === '*')]
      const face = order.find((f) => f.font.cmap.has(cp)) ?? null
      cache.set(key, face)
      return face
    },
    finish() {
      faces.forEach((face, i) => writeFont(doc, face, i, sfnt.subsetFont))
    },
  }
}

function writeFont(doc: PDFDocument, face: UnicodeFace, index: number, subsetFont: (f: TrueType, used: Set<number>) => Uint8Array) {
  const { font } = face
  const ctx = doc.context
  const scale = 1000 / font.unitsPerEm
  const tag = Array.from({ length: 6 }, (_, i) => String.fromCharCode(65 + ((index * 7 + i * 5 + 3) % 26))).join('')
  const base = `${tag}+${font.name.replace(/[^A-Za-z0-9-]/g, '')}`
  const data = subsetFont(font, new Set(face.used.keys()))
  const file = ctx.register(ctx.flateStream(data, { Length1: data.length }))
  const flags = (font.fixedPitch ? 1 : 0) | 32 | (font.italicAngle ? 64 : 0)
  const desc = ctx.register(
    ctx.obj({
      Type: 'FontDescriptor',
      FontName: base,
      Flags: flags,
      FontBBox: font.bbox.map((v) => Math.round(v * scale)),
      ItalicAngle: font.italicAngle,
      Ascent: Math.round(font.ascent * scale),
      Descent: Math.round(font.descent * scale),
      CapHeight: Math.round(font.capHeight * scale),
      StemV: 80,
      FontFile2: file,
    }),
  )
  const gids = [...face.used.keys()].sort((a, b) => a - b)
  const widths = ctx.obj([])
  for (const g of gids) {
    widths.push(PDFNumber.of(g))
    widths.push(ctx.obj([Math.round((font.advances[g] ?? 0) * scale)]))
  }
  const cid = ctx.register(
    ctx.obj({
      Type: 'Font',
      Subtype: 'CIDFontType2',
      BaseFont: base,
      CIDSystemInfo: { Registry: PDFString.of('Adobe'), Ordering: PDFString.of('Identity'), Supplement: 0 },
      FontDescriptor: desc,
      DW: Math.round((font.advances[0] ?? 500) * scale),
      W: widths,
      CIDToGIDMap: 'Identity',
    }),
  )
  const hex = (s: string) =>
    [...s]
      .map((c) => {
        const cp = c.codePointAt(0)!
        if (cp < 0x10000) return cp.toString(16).padStart(4, '0')
        const v = cp - 0x10000
        return (0xd800 + (v >> 10)).toString(16) + (0xdc00 + (v & 0x3ff)).toString(16)
      })
      .join('')
  const lines: string[] = []
  for (let i = 0; i < gids.length; i += 100) {
    const chunk = gids.slice(i, i + 100)
    lines.push(`${chunk.length} beginbfchar`, ...chunk.map((g) => `<${g.toString(16).padStart(4, '0')}> <${hex(face.used.get(g)!)}>`), 'endbfchar')
  }
  const cmap =
    '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n' +
    '/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n' +
    lines.join('\n') +
    '\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend'
  const toUnicode = ctx.register(ctx.flateStream(cmap))
  ctx.assign(face.ref, ctx.obj({ Type: 'Font', Subtype: 'Type0', BaseFont: base, Encoding: 'Identity-H', DescendantFonts: [cid], ToUnicode: toUnicode }))
}
