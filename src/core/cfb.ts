// Compound File Binary (OLE2) reader: the container of legacy Office files
// (.doc, .xls, .ppt). Returns the streams by name (read-only, no writing).

export interface CompoundFile {
  // Streams by name ("WordDocument", "1Table", "Workbook"…) and by full path ("ObjectPool/…").
  streams: Map<string, Uint8Array>
  get(name: string): Uint8Array | undefined
}

const SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
const FREE = 0xffffffff
const END = 0xfffffffe

export function isCompoundFile(buf: ArrayBuffer | Uint8Array): boolean {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return SIGNATURE.every((v, i) => b[i] === v)
}

export function readCompoundFile(input: ArrayBuffer): CompoundFile {
  const buf = new Uint8Array(input)
  if (!isCompoundFile(buf)) throw new Error('Not a compound file')
  const v = new DataView(input)
  const sectorSize = 1 << v.getUint16(0x1e, true)
  const miniSize = 1 << v.getUint16(0x20, true)
  const firstDir = v.getUint32(0x30, true)
  const cutoff = v.getUint32(0x38, true)
  const firstMiniFat = v.getUint32(0x3c, true)
  const numMiniFat = v.getUint32(0x40, true)
  let difatSector = v.getUint32(0x44, true)
  const numDifat = v.getUint32(0x48, true)
  const offset = (s: number) => (s + 1) * sectorSize
  const u32 = (o: number) => (o + 4 <= buf.length ? v.getUint32(o, true) : FREE)

  // FAT sectors: 109 in the header, then the DIFAT chain.
  const fatSectors: number[] = []
  for (let i = 0; i < 109; i++) {
    const s = v.getUint32(0x4c + i * 4, true)
    if (s !== FREE) fatSectors.push(s)
  }
  for (let n = 0; n < numDifat && difatSector !== END && difatSector !== FREE; n++) {
    const base = offset(difatSector)
    for (let i = 0; i < sectorSize / 4 - 1; i++) {
      const s = u32(base + i * 4)
      if (s !== FREE) fatSectors.push(s)
    }
    difatSector = u32(base + sectorSize - 4)
  }
  const fat: number[] = []
  for (const s of fatSectors) for (let i = 0; i < sectorSize / 4; i++) fat.push(u32(offset(s) + i * 4))

  const chain = (start: number, table: number[]): number[] => {
    const out: number[] = []
    const seen = new Set<number>()
    for (let s = start; s !== END && s !== FREE && s < table.length && !seen.has(s); s = table[s]) {
      seen.add(s)
      out.push(s)
    }
    return out
  }
  const readChain = (start: number, size?: number): Uint8Array => {
    const sectors = chain(start, fat)
    const out = new Uint8Array(sectors.length * sectorSize)
    sectors.forEach((s, i) => out.set(buf.subarray(offset(s), offset(s) + sectorSize), i * sectorSize))
    return size === undefined ? out : out.subarray(0, Math.min(size, out.length))
  }

  // Directory entries.
  const dir = readChain(firstDir)
  const dv = new DataView(dir.buffer, dir.byteOffset, dir.byteLength)
  interface Entry {
    name: string
    type: number
    left: number
    right: number
    child: number
    start: number
    size: number
  }
  const entries: Entry[] = []
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const len = dv.getUint16(o + 0x40, true)
    let name = ''
    for (let i = 0; i < Math.max(0, len / 2 - 1); i++) name += String.fromCharCode(dv.getUint16(o + i * 2, true))
    entries.push({
      name,
      type: dir[o + 0x42],
      left: dv.getUint32(o + 0x44, true),
      right: dv.getUint32(o + 0x48, true),
      child: dv.getUint32(o + 0x4c, true),
      start: dv.getUint32(o + 0x74, true),
      size: dv.getUint32(o + 0x78, true),
    })
  }
  const root = entries[0]
  const miniStream = root ? readChain(root.start, root.size) : new Uint8Array()
  const miniFat: number[] = []
  if (numMiniFat) {
    const mf = readChain(firstMiniFat)
    const mv = new DataView(mf.buffer, mf.byteOffset, mf.byteLength)
    for (let i = 0; i + 4 <= mf.length; i += 4) miniFat.push(mv.getUint32(i, true))
  }
  const readMini = (start: number, size: number): Uint8Array => {
    const sectors = chain(start, miniFat)
    const out = new Uint8Array(sectors.length * miniSize)
    sectors.forEach((s, i) => out.set(miniStream.subarray(s * miniSize, (s + 1) * miniSize), i * miniSize))
    return out.subarray(0, Math.min(size, out.length))
  }

  const streams = new Map<string, Uint8Array>()
  const visit = (index: number, path: string, depth: number) => {
    if (index === FREE || index >= entries.length || depth > 64) return
    const e = entries[index]
    visit(e.left, path, depth + 1)
    visit(e.right, path, depth + 1)
    const full = path ? `${path}/${e.name}` : e.name
    if (e.type === 2) {
      const data = e.size < cutoff ? readMini(e.start, e.size) : readChain(e.start, e.size)
      streams.set(full, data)
      if (!streams.has(e.name)) streams.set(e.name, data)
    } else if (e.type === 1) visit(e.child, full, depth + 1)
  }
  if (root) visit(root.child, '', 0)
  return { streams, get: (name) => streams.get(name) }
}
