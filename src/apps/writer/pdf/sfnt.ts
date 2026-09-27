// TrueType fonts for PDF embedding: WOFF 1.0 decoding, the tables a PDF needs
// (metrics, character map) and glyph subsetting (unused glyphs are emptied,
// glyph ids are kept so no re-encoding is needed).

export interface TrueType {
  name: string
  unitsPerEm: number
  ascent: number
  descent: number
  capHeight: number
  bbox: [number, number, number, number]
  italicAngle: number
  fixedPitch: boolean
  numGlyphs: number
  advances: Uint16Array
  cmap: Map<number, number>
  tables: Map<string, Uint8Array>
  // Whether the license allows embedding (OS/2 fsType).
  embeddable: boolean
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

// WOFF 1.0 → sfnt tables.
async function wofftables(buf: Uint8Array): Promise<Map<string, Uint8Array>> {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const num = v.getUint16(12)
  const tables = new Map<string, Uint8Array>()
  for (let i = 0; i < num; i++) {
    const e = 44 + i * 20
    const tag = String.fromCharCode(buf[e], buf[e + 1], buf[e + 2], buf[e + 3])
    const offset = v.getUint32(e + 4)
    const compLength = v.getUint32(e + 8)
    const origLength = v.getUint32(e + 12)
    const raw = buf.subarray(offset, offset + compLength)
    tables.set(tag, compLength < origLength ? await inflate(raw) : raw.slice())
  }
  return tables
}

function sfntTables(buf: Uint8Array): Map<string, Uint8Array> {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const num = v.getUint16(4)
  const tables = new Map<string, Uint8Array>()
  for (let i = 0; i < num; i++) {
    const e = 12 + i * 16
    const tag = String.fromCharCode(buf[e], buf[e + 1], buf[e + 2], buf[e + 3])
    tables.set(tag, buf.slice(v.getUint32(e + 8), v.getUint32(e + 8) + v.getUint32(e + 12)))
  }
  return tables
}

const view = (t: Uint8Array) => new DataView(t.buffer, t.byteOffset, t.byteLength)

export async function parseFont(bytes: ArrayBuffer): Promise<TrueType> {
  const buf = new Uint8Array(bytes)
  const sig = String.fromCharCode(buf[0], buf[1], buf[2], buf[3])
  const tables = sig === 'wOFF' ? await wofftables(buf) : sfntTables(buf)
  if (!tables.has('glyf')) throw new Error('Only TrueType outlines can be embedded')
  const head = view(tables.get('head')!)
  const hhea = view(tables.get('hhea')!)
  const maxp = view(tables.get('maxp')!)
  const unitsPerEm = head.getUint16(18)
  const numGlyphs = maxp.getUint16(4)
  const numH = hhea.getUint16(34)
  const hmtx = view(tables.get('hmtx')!)
  const advances = new Uint16Array(numGlyphs)
  for (let g = 0; g < numGlyphs; g++) advances[g] = hmtx.getUint16(Math.min(g, numH - 1) * 4)
  const os2 = tables.get('OS/2')
  const o = os2 ? view(os2) : null
  const post = tables.get('post') ? view(tables.get('post')!) : null
  return {
    name: postscriptName(tables.get('name')) ?? 'Font',
    unitsPerEm,
    ascent: hhea.getInt16(4),
    descent: hhea.getInt16(6),
    capHeight: o && o.getUint16(0) >= 2 && os2!.length > 90 ? o.getInt16(88) : hhea.getInt16(4),
    bbox: [head.getInt16(36), head.getInt16(38), head.getInt16(40), head.getInt16(42)],
    italicAngle: post ? post.getInt32(4) / 65536 : 0,
    fixedPitch: post ? post.getUint32(12) !== 0 : false,
    numGlyphs,
    advances,
    cmap: parseCmap(tables.get('cmap')),
    tables,
    // fsType bit 1: restricted license embedding.
    embeddable: !o || (o.getUint16(8) & 0x000f) !== 0x0002,
  }
}

function postscriptName(t: Uint8Array | undefined): string | null {
  if (!t) return null
  const v = view(t)
  const count = v.getUint16(2)
  const strings = v.getUint16(4)
  for (let i = 0; i < count; i++) {
    const r = 6 + i * 12
    const platform = v.getUint16(r)
    const nameId = v.getUint16(r + 6)
    if (nameId !== 6) continue
    const len = v.getUint16(r + 8)
    const off = strings + v.getUint16(r + 10)
    let s = ''
    if (platform === 3 || platform === 0) for (let k = 0; k < len; k += 2) s += String.fromCharCode(v.getUint16(off + k))
    else for (let k = 0; k < len; k++) s += String.fromCharCode(t[off + k])
    return s.replace(/[^\x21-\x7e]/g, '').replace(/[()<>[\]{}/%]/g, '') || null
  }
  return null
}

function parseCmap(t: Uint8Array | undefined): Map<number, number> {
  const map = new Map<number, number>()
  if (!t) return map
  const v = view(t)
  const n = v.getUint16(2)
  let best = -1
  let bestScore = -1
  for (let i = 0; i < n; i++) {
    const platform = v.getUint16(4 + i * 8)
    const encoding = v.getUint16(6 + i * 8)
    const offset = v.getUint32(8 + i * 8)
    const format = v.getUint16(offset)
    const score = platform === 3 && encoding === 10 && format === 12 ? 4 : platform === 0 && format === 12 ? 3 : platform === 3 && encoding === 1 && format === 4 ? 2 : platform === 0 && format === 4 ? 1 : platform === 3 && encoding === 0 && format === 4 ? 0.5 : -1
    if (score > bestScore) {
      best = offset
      bestScore = score
    }
  }
  if (best < 0) return map
  const format = v.getUint16(best)
  if (format === 4) {
    const segX2 = v.getUint16(best + 6)
    const ends = best + 14
    const starts = ends + segX2 + 2
    const deltas = starts + segX2
    const ranges = deltas + segX2
    for (let s = 0; s < segX2 / 2; s++) {
      const end = v.getUint16(ends + s * 2)
      const start = v.getUint16(starts + s * 2)
      const delta = v.getInt16(deltas + s * 2)
      const rangeOffset = v.getUint16(ranges + s * 2)
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let g: number
        if (rangeOffset === 0) g = (c + delta) & 0xffff
        else {
          const addr = ranges + s * 2 + rangeOffset + (c - start) * 2
          g = v.getUint16(addr)
          if (g) g = (g + delta) & 0xffff
        }
        if (g) map.set(c, g)
      }
    }
  } else if (format === 12) {
    const groups = v.getUint32(best + 12)
    for (let i = 0; i < groups; i++) {
      const r = best + 16 + i * 12
      const start = v.getUint32(r)
      const end = v.getUint32(r + 4)
      const glyph = v.getUint32(r + 8)
      for (let c = start; c <= end && c - start < 0x10000; c++) map.set(c, glyph + (c - start))
    }
  }
  return map
}

// Glyph offsets from the loca table.
function locations(font: TrueType): Uint32Array {
  const long = view(font.tables.get('head')!).getInt16(50) === 1
  const loca = view(font.tables.get('loca')!)
  const out = new Uint32Array(font.numGlyphs + 1)
  for (let i = 0; i <= font.numGlyphs; i++) out[i] = long ? loca.getUint32(i * 4) : loca.getUint16(i * 2) * 2
  return out
}

// A TrueType file keeping only the given glyphs (and the components of composite glyphs).
export function subsetFont(font: TrueType, used: Set<number>): Uint8Array {
  const loca = locations(font)
  const glyf = font.tables.get('glyf')!
  const gv = view(glyf)
  const keep = new Set<number>([0, ...used])
  const queue = [...keep]
  while (queue.length) {
    const g = queue.pop()!
    if (g >= font.numGlyphs || loca[g + 1] <= loca[g]) continue
    const at = loca[g]
    if (gv.getInt16(at) >= 0) continue
    // Composite glyph: walk its components.
    let p = at + 10
    for (;;) {
      const flags = gv.getUint16(p)
      const component = gv.getUint16(p + 2)
      if (!keep.has(component)) {
        keep.add(component)
        queue.push(component)
      }
      p += 4 + (flags & 0x0001 ? 4 : 2) + (flags & 0x0008 ? 2 : flags & 0x0040 ? 4 : flags & 0x0080 ? 8 : 0)
      if (!(flags & 0x0020)) break
    }
  }
  const parts: Uint8Array[] = []
  const newLoca = new DataView(new ArrayBuffer((font.numGlyphs + 1) * 4))
  let size = 0
  for (let g = 0; g < font.numGlyphs; g++) {
    newLoca.setUint32(g * 4, size)
    if (keep.has(g) && loca[g + 1] > loca[g]) {
      const data = glyf.subarray(loca[g], loca[g + 1])
      parts.push(data)
      size += data.length
      if (size % 4) {
        const pad = 4 - (size % 4)
        parts.push(new Uint8Array(pad))
        size += pad
      }
    }
  }
  newLoca.setUint32(font.numGlyphs * 4, size)
  const newGlyf = new Uint8Array(size)
  let o = 0
  for (const p of parts) {
    newGlyf.set(p, o)
    o += p.length
  }
  const head = font.tables.get('head')!.slice()
  view(head).setInt16(50, 1)
  view(head).setUint32(8, 0)
  const tables = new Map<string, Uint8Array>()
  for (const tag of ['cmap', 'cvt ', 'fpgm', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'prep']) {
    const t = font.tables.get(tag)
    if (t) tables.set(tag, t)
  }
  tables.set('head', head)
  tables.set('loca', new Uint8Array(newLoca.buffer))
  tables.set('glyf', newGlyf)
  return buildSfnt(tables)
}

function checksum(data: Uint8Array): number {
  let sum = 0
  const padded = data.length % 4 ? new Uint8Array(data.length + 4 - (data.length % 4)) : data
  if (padded !== data) padded.set(data)
  const v = view(padded)
  for (let i = 0; i < padded.length; i += 4) sum = (sum + v.getUint32(i)) >>> 0
  return sum
}

function buildSfnt(tables: Map<string, Uint8Array>): Uint8Array {
  const tags = [...tables.keys()].sort()
  const n = tags.length
  let size = 12 + n * 16
  for (const t of tags) size += (tables.get(t)!.length + 3) & ~3
  const out = new Uint8Array(size)
  const v = view(out)
  v.setUint32(0, 0x00010000)
  v.setUint16(4, n)
  const entry = 2 ** Math.floor(Math.log2(n))
  v.setUint16(6, entry * 16)
  v.setUint16(8, Math.log2(entry))
  v.setUint16(10, n * 16 - entry * 16)
  let offset = 12 + n * 16
  tags.forEach((tag, i) => {
    const data = tables.get(tag)!
    const e = 12 + i * 16
    for (let k = 0; k < 4; k++) out[e + k] = tag.charCodeAt(k)
    v.setUint32(e + 4, checksum(data))
    v.setUint32(e + 8, offset)
    v.setUint32(e + 12, data.length)
    out.set(data, offset)
    offset += (data.length + 3) & ~3
  })
  return out
}
