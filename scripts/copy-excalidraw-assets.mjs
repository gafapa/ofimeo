// Copies Excalidraw's fonts into public/excalidraw so they are served from our
// own origin instead of a CDN (see window.EXCALIDRAW_ASSET_PATH).

import { cpSync, existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'node_modules', '@excalidraw', 'excalidraw', 'dist', 'prod', 'fonts')
const target = join(root, 'public', 'excalidraw', 'fonts')

if (!existsSync(source)) throw new Error('Excalidraw fonts not found; run npm install first')
rmSync(target, { recursive: true, force: true })
cpSync(source, target, { recursive: true })
console.log('Copied Excalidraw fonts into public/excalidraw')

// PDF.js standard fonts and CMaps stay on our origin and work offline.
for (const directory of ['standard_fonts', 'cmaps']) {
  cpSync(join(root, 'node_modules', 'pdfjs-dist', directory), join(root, 'public', 'pdfjs', directory), { recursive: true })
}
