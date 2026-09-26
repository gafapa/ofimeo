// Font files for the PDF export: the document fonts shipped with the app, the
// KaTeX fonts (equations) and the accessibility fonts. A CSS font-family list
// is resolved to one of them; characters a font lacks fall back to others.

import { FONT_FILES, METRIC_COMPATIBLE } from '../fonts'
import { parseFont, type TrueType } from './sfnt'

const katexFiles = import.meta.glob('../../../../node_modules/katex/dist/fonts/*.ttf', { query: '?url', import: 'default' }) as Record<string, () => Promise<string>>
const a11yFiles = import.meta.glob(
  ['../../../../node_modules/@fontsource/opendyslexic/files/opendyslexic-latin-*.woff', '../../../../node_modules/@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-*.woff'],
  { query: '?url', import: 'default' },
) as Record<string, () => Promise<string>>

export interface FontFace {
  key: string
  load: () => Promise<string>
}

const loaded = new Map<string, Promise<TrueType | null>>()

export function loadFace(face: FontFace): Promise<TrueType | null> {
  let p = loaded.get(face.key)
  if (!p) {
    p = face
      .load()
      .then((url) => fetch(url))
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
      .then(parseFont)
      .then((f) => (f.embeddable ? f : null))
      .catch((err) => {
        console.warn('PDF font not available', face.key, err)
        return null
      })
    loaded.set(face.key, p)
  }
  return p
}

function shipped(family: string, bold: boolean, italic: boolean): FontFace[] {
  const weight = bold ? 700 : 400
  return FONT_FILES.filter((f) => f.family === family && f.weight === weight && f.italic === italic)
    .sort((a, b) => (a.subset === 'latin' ? -1 : b.subset === 'latin' ? 1 : 0))
    .map((f) => ({ key: f.url, load: async () => f.url }))
}

function katex(family: string, bold: boolean, italic: boolean): FontFace[] {
  const name = family.replace(/^katex_/i, '')
  const variants = [bold && italic ? 'BoldItalic' : bold ? 'Bold' : italic ? 'Italic' : 'Regular', 'Regular', 'Italic', 'Bold']
  for (const v of variants) {
    const path = Object.keys(katexFiles).find((p) => p.toLowerCase().endsWith(`/katex_${name.toLowerCase()}-${v.toLowerCase()}.ttf`))
    if (path) return [{ key: path, load: katexFiles[path] }]
  }
  return []
}

function a11y(family: 'opendyslexic' | 'atkinson-hyperlegible', bold: boolean, italic: boolean): FontFace[] {
  const want = `${family}-latin-${bold ? 700 : 400}-${italic ? 'italic' : 'normal'}.woff`
  const path = Object.keys(a11yFiles).find((p) => p.endsWith(want)) ?? Object.keys(a11yFiles).find((p) => p.includes(`/${family}-latin-400-normal`))
  return path ? [{ key: path, load: a11yFiles[path] }] : []
}

// Faces for a computed font-family list, best first.
export function facesFor(families: string, bold: boolean, italic: boolean): FontFace[] {
  const names = families.split(',').map((f) => f.trim().replace(/^["']|["']$/g, '').toLowerCase())
  for (const name of names) {
    if (name.startsWith('katex_')) return katex(name, bold, italic)
    if (name.includes('opendyslexic')) return a11y('opendyslexic', bold, italic)
    if (name.includes('atkinson')) return a11y('atkinson-hyperlegible', bold, italic)
    const mapped = METRIC_COMPATIBLE[name]
    if (mapped) return shipped(mapped, bold, italic)
    if (name === 'serif' || /times|georgia|garamond|serif|book|palatino/.test(name)) return shipped('Tinos', bold, italic)
    if (name === 'monospace' || /mono|courier|consolas|menlo/.test(name)) return shipped('Cousine', bold, italic)
    if (name === 'sans-serif' || name === 'system-ui') return shipped('Arimo', bold, italic)
  }
  return shipped('Carlito', bold, italic)
}

// Faces tried for characters the chosen font lacks.
export function fallbackFaces(bold: boolean, italic: boolean): FontFace[] {
  return [...shipped('Arimo', bold, italic), ...shipped('Tinos', bold, italic), ...katex('katex_main', false, false), ...katex('katex_ams', false, false), ...katex('katex_size1', false, false)]
}
