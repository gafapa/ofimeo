// Minimal synchronous raw DEFLATE encoder (RFC 1951, fixed Huffman codes with
// LZ77 matching). Used to write draw.io's compressed diagrams without an async
// CompressionStream; inflating is done with DecompressionStream('deflate-raw').

const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577]
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]

const WINDOW = 32768
const MAX_MATCH = 258
const MAX_CHAIN = 64
const HASH_SIZE = 1 << 15

class BitWriter {
  private out: number[] = []
  private bits = 0
  private count = 0

  // Writes `n` bits of `value`, least significant bit first.
  write(value: number, n: number): void {
    this.bits |= value << this.count
    this.count += n
    while (this.count >= 8) {
      this.out.push(this.bits & 0xff)
      this.bits >>>= 8
      this.count -= 8
    }
  }

  // Writes a Huffman code (most significant bit first).
  code(code: number, n: number): void {
    let rev = 0
    for (let i = 0; i < n; i++) rev |= ((code >> i) & 1) << (n - 1 - i)
    this.write(rev, n)
  }

  finish(): Uint8Array {
    if (this.count > 0) this.out.push(this.bits & 0xff)
    return Uint8Array.from(this.out)
  }
}

function writeLiteral(w: BitWriter, symbol: number): void {
  if (symbol < 144) w.code(0x30 + symbol, 8)
  else if (symbol < 256) w.code(0x190 + symbol - 144, 9)
  else if (symbol < 280) w.code(symbol - 256, 7)
  else w.code(0xc0 + symbol - 280, 8)
}

function writeMatch(w: BitWriter, length: number, distance: number): void {
  let li = LENGTH_BASE.length - 1
  while (LENGTH_BASE[li] > length) li--
  writeLiteral(w, 257 + li)
  if (LENGTH_EXTRA[li]) w.write(length - LENGTH_BASE[li], LENGTH_EXTRA[li])
  let di = DIST_BASE.length - 1
  while (DIST_BASE[di] > distance) di--
  w.code(di, 5)
  if (DIST_EXTRA[di]) w.write(distance - DIST_BASE[di], DIST_EXTRA[di])
}

export function deflateRawSync(data: Uint8Array): Uint8Array {
  const w = new BitWriter()
  // One final block with fixed Huffman codes.
  w.write(1, 1)
  w.write(1, 2)
  const head = new Int32Array(HASH_SIZE).fill(-1)
  const prev = new Int32Array(WINDOW).fill(-1)
  const n = data.length
  const hash = (i: number) => ((data[i] << 10) ^ (data[i + 1] << 5) ^ data[i + 2]) & (HASH_SIZE - 1)
  const insert = (i: number) => {
    if (i + 2 >= n) return
    const h = hash(i)
    prev[i & (WINDOW - 1)] = head[h]
    head[h] = i
  }
  let i = 0
  while (i < n) {
    let bestLen = 0
    let bestDist = 0
    if (i + 2 < n) {
      let candidate = head[hash(i)]
      let chain = MAX_CHAIN
      const limit = Math.min(MAX_MATCH, n - i)
      while (candidate >= 0 && i - candidate <= WINDOW && chain-- > 0) {
        if (data[candidate + bestLen] === data[i + bestLen]) {
          let len = 0
          while (len < limit && data[candidate + len] === data[i + len]) len++
          if (len > bestLen) {
            bestLen = len
            bestDist = i - candidate
            if (len === limit) break
          }
        }
        const next = prev[candidate & (WINDOW - 1)]
        if (next >= candidate) break
        candidate = next
      }
    }
    if (bestLen >= 3) {
      writeMatch(w, bestLen, bestDist)
      for (let k = 0; k < bestLen; k++) insert(i + k)
      i += bestLen
    } else {
      writeLiteral(w, data[i])
      insert(i)
      i++
    }
  }
  writeLiteral(w, 256)
  return w.finish()
}

// Minimal synchronous raw INFLATE (RFC 1951: stored, fixed and dynamic blocks),
// for draw.io's compressed stencils (shape=stencil(…)) that render synchronously.
const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]

interface Huffman {
  counts: Uint16Array
  symbols: Uint16Array
}

function huffman(lengths: ArrayLike<number>): Huffman {
  const counts = new Uint16Array(16)
  for (let i = 0; i < lengths.length; i++) counts[lengths[i]]++
  counts[0] = 0
  const offs = new Uint16Array(16)
  for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + counts[i - 1]
  const symbols = new Uint16Array(lengths.length)
  for (let i = 0; i < lengths.length; i++) if (lengths[i]) symbols[offs[lengths[i]]++] = i
  return { counts, symbols }
}

export function inflateRawSync(data: Uint8Array): Uint8Array {
  let pos = 0
  let bitBuf = 0
  let bitCnt = 0
  let out = new Uint8Array(Math.max(1024, data.length * 4))
  let len = 0
  const need = (n: number) => {
    if (len + n <= out.length) return
    const next = new Uint8Array(Math.max(out.length * 2, len + n))
    next.set(out.subarray(0, len))
    out = next
  }
  const bits = (n: number) => {
    while (bitCnt < n) {
      if (pos >= data.length) throw new Error('Unexpected end of compressed data')
      bitBuf |= data[pos++] << bitCnt
      bitCnt += 8
    }
    const v = bitBuf & ((1 << n) - 1)
    bitBuf >>>= n
    bitCnt -= n
    return v
  }
  const decode = (h: Huffman) => {
    let code = 0
    let first = 0
    let index = 0
    for (let l = 1; l < 16; l++) {
      code |= bits(1)
      const count = h.counts[l]
      if (code - count < first) return h.symbols[index + (code - first)]
      index += count
      first = (first + count) << 1
      code <<= 1
    }
    throw new Error('Invalid Huffman code')
  }
  const fixedLit = huffman(Array.from({ length: 288 }, (_, i) => (i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8)))
  const fixedDist = huffman(new Array(30).fill(5))
  let final = 0
  while (!final) {
    final = bits(1)
    const type = bits(2)
    if (type === 0) {
      bitBuf = 0
      bitCnt = 0
      const n = data[pos] | (data[pos + 1] << 8)
      pos += 4
      need(n)
      out.set(data.subarray(pos, pos + n), len)
      len += n
      pos += n
      continue
    }
    let lit = fixedLit
    let dist = fixedDist
    if (type === 2) {
      const hlit = bits(5) + 257
      const hdist = bits(5) + 1
      const hclen = bits(4) + 4
      const cl = new Uint8Array(19)
      for (let i = 0; i < hclen; i++) cl[CL_ORDER[i]] = bits(3)
      const clh = huffman(cl)
      const lengths = new Uint8Array(hlit + hdist)
      for (let i = 0; i < hlit + hdist; ) {
        const sym = decode(clh)
        if (sym < 16) lengths[i++] = sym
        else {
          const [rep, prev] = sym === 16 ? [3 + bits(2), lengths[i - 1]] : sym === 17 ? [3 + bits(3), 0] : [11 + bits(7), 0]
          lengths.fill(prev, i, i + rep)
          i += rep
        }
      }
      lit = huffman(lengths.subarray(0, hlit))
      dist = huffman(lengths.subarray(hlit))
    } else if (type !== 1) throw new Error('Invalid block type')
    for (;;) {
      const sym = decode(lit)
      if (sym < 256) {
        need(1)
        out[len++] = sym
      } else if (sym === 256) break
      else {
        const li = sym - 257
        const length = LENGTH_BASE[li] + bits(LENGTH_EXTRA[li])
        const di = decode(dist)
        const d = DIST_BASE[di] + bits(DIST_EXTRA[di])
        need(length)
        for (let k = 0; k < length; k++, len++) out[len] = out[len - d]
      }
    }
  }
  return out.subarray(0, len)
}
