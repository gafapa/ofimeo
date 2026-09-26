// Page geometry shared by the viewer, the importer and the exporters.
//
// Annotations are stored in "view space": the page as shown at 100 % with its
// /Rotate applied, in PDF points, origin at the top left, y down (the same
// space as pdf.js' PageViewport at scale 1). PDF files use "user space"
// (origin at the bottom left of the MediaBox, y up, unrotated). The affine
// matrices below convert between the two, the same way pdf.js does.

export type Matrix = [number, number, number, number, number, number]

export interface PageGeom {
  // Visible box in user space (CropBox ∩ MediaBox): [x0, y0, x1, y1].
  view: [number, number, number, number]
  rotate: number
}

// View space → user space and back.
export function viewTransform({ view, rotate }: PageGeom): { toView: Matrix; toUser: Matrix; w: number; h: number } {
  const r = ((rotate % 360) + 360) % 360
  const [x0, y0, x1, y1] = view
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const [a, b, c, d] = r === 90 ? [0, 1, 1, 0] : r === 180 ? [-1, 0, 0, 1] : r === 270 ? [0, -1, -1, 0] : [1, 0, 0, -1]
  let ox: number
  let oy: number
  let w: number
  let h: number
  if (a === 0) {
    ox = Math.abs(cy - y0)
    oy = Math.abs(cx - x0)
    w = y1 - y0
    h = x1 - x0
  } else {
    ox = Math.abs(cx - x0)
    oy = Math.abs(cy - y0)
    w = x1 - x0
    h = y1 - y0
  }
  const toView: Matrix = [a, b, c, d, ox - a * cx - c * cy, oy - b * cx - d * cy]
  return { toView, toUser: invert(toView), w, h }
}

export function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
}

export function invert(m: Matrix): Matrix {
  const [a, b, c, d, e, f] = m
  const det = a * d - b * c
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det]
}

// Bounding box of view-space points in user space: [x0, y0, x1, y1].
export function userBox(m: Matrix, points: [number, number][]): [number, number, number, number] {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const [x, y] of points) {
    const [u, v] = apply(m, x, y)
    x0 = Math.min(x0, u)
    y0 = Math.min(y0, v)
    x1 = Math.max(x1, u)
    y1 = Math.max(y1, v)
  }
  return [x0, y0, x1, y1]
}

export function normalizeBox(box: number[]): [number, number, number, number] {
  const [a, b, c, d] = box
  return [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)]
}

export const round = (n: number) => Math.round(n * 100) / 100
