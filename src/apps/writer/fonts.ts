// Document fonts shipped with the app: open fonts metric-compatible with the
// usual Office fonts (see fonts/OFL.txt). They render documents the same on
// every device (loaded only when a document uses them) and are embedded in
// exported PDF files.

const files = import.meta.glob('./fonts/*.woff', { query: '?url', import: 'default', eager: true }) as Record<string, string>

export interface FontFile {
  family: string
  weight: 400 | 700
  italic: boolean
  subset: 'latin' | 'latin-ext'
  url: string
}

export const FAMILIES: Record<string, string> = { carlito: 'Carlito', caladea: 'Caladea', arimo: 'Arimo', tinos: 'Tinos', cousine: 'Cousine' }

export const UNICODE_RANGES: Record<FontFile['subset'], string> = {
  latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext':
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
}

export const FONT_FILES: FontFile[] = Object.entries(files).flatMap(([path, url]) => {
  const m = /\/(\w+)-(latin(?:-ext)?)-(400|700)-(normal|italic)\.woff$/.exec(path)
  if (!m || !FAMILIES[m[1]]) return []
  return [{ family: FAMILIES[m[1]], subset: m[2] as FontFile['subset'], weight: Number(m[3]) as 400 | 700, italic: m[4] === 'italic', url }]
})

// Office font names → the shipped font with the same metrics.
export const METRIC_COMPATIBLE: Record<string, string> = {
  calibri: 'Carlito',
  carlito: 'Carlito',
  cambria: 'Caladea',
  caladea: 'Caladea',
  arial: 'Arimo',
  helvetica: 'Arimo',
  'liberation sans': 'Arimo',
  arimo: 'Arimo',
  'times new roman': 'Tinos',
  times: 'Tinos',
  'liberation serif': 'Tinos',
  tinos: 'Tinos',
  'courier new': 'Cousine',
  courier: 'Cousine',
  'liberation mono': 'Cousine',
  cousine: 'Cousine',
}

let installed = false

// Adds the @font-face rules once (the browser downloads a file only when used).
export function installDocumentFonts(): void {
  if (installed) return
  installed = true
  const css = FONT_FILES.map(
    (f) =>
      `@font-face{font-family:'${f.family}';font-style:${f.italic ? 'italic' : 'normal'};font-weight:${f.weight};font-display:swap;` +
      `src:url('${f.url}') format('woff');unicode-range:${UNICODE_RANGES[f.subset]}}`,
  ).join('\n')
  const style = document.createElement('style')
  style.dataset.documentFonts = ''
  style.textContent = css
  document.head.append(style)
}
