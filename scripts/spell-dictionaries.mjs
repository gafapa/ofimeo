// Vite plugin: serves the Hunspell dictionaries of the spell checker as
// separate static files (dictionaries/<id>-<hash>.aff.txt / .dic.txt, plus
// the license of each), and exposes their paths as `virtual:spell-dictionaries`.
// One per regional variant (src/core/spell/variants.ts); each is only
// downloaded when a text in that variant is checked.
// Morphological fields and comments are dropped (the Galician dictionary goes
// from 9.5 MB to 2.4 MB, 0.7 MB compressed); words and affix rules are unchanged. The `.txt`
// suffix lets static hosts compress them.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

// Ids of the `dictionary-<id>` packages (all MIT/BSD, GPL/LGPL/MPL or similar, see their license files).
export const DICTIONARIES = ['es', 'es-mx', 'es-ar', 'es-co', 'es-cl', 'es-us', 'gl', 'en', 'en-gb', 'en-au', 'en-ca', 'fr', 'de']
const VIRTUAL = 'virtual:spell-dictionaries'
const require = createRequire(import.meta.url)

function packageDir(id) {
  // The packages only export their index.js; the data files sit next to it.
  return dirname(require.resolve(`dictionary-${id}`))
}

// Keeps "word/flags" of each .dic line (morphology starts at a tab, at " xx:" or at " [").
export function compactDic(dic) {
  const lines = dic.split(/\r?\n/)
  const out = new Set()
  for (let i = /^\s*\d+\s*$/.test(lines[0]) ? 1 : 0; i < lines.length; i++) {
    const entry = lines[i].split(/\t| (?=[a-z]{2}:)| \[/)[0].trim()
    if (entry) out.add(entry)
  }
  return `${out.size}\n${[...out].join('\n')}\n`
}

// Drops comments and the morphology of affix rules.
export function compactAff(aff) {
  return aff
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.startsWith('#'))
    .map((line) => {
      const parts = line.trim().split(/\s+/)
      if ((parts[0] === 'SFX' || parts[0] === 'PFX') && parts.length > 5) return parts.slice(0, 5).join(' ')
      return line.replace(/\s+$/, '')
    })
    .join('\n')
}

export function spellDictionaries() {
  const entries = new Map()
  let files = null
  const list = () => {
    if (files) return files
    const found = {}
    for (const id of DICTIONARIES) {
      const dir = packageDir(id)
      const aff = readFileSync(join(dir, 'index.aff'))
      const dic = readFileSync(join(dir, 'index.dic'))
      const hash = createHash('sha256').update(aff).update(dic).digest('hex').slice(0, 10)
      const base = `dictionaries/${id}-${hash}`
      found[id] = base
      let aCache = null
      let dCache = null
      entries.set(`${base}.aff.txt`, () => (aCache ??= compactAff(aff.toString('utf8'))))
      entries.set(`${base}.dic.txt`, () => (dCache ??= compactDic(dic.toString('utf8'))))
      entries.set(`dictionaries/${id}-LICENSE.txt`, () => readFileSync(join(dir, 'license'), 'utf8'))
    }
    return (files = found)
  }
  return {
    name: 'spell-dictionaries',
    resolveId(id) {
      return id === VIRTUAL ? `\0${VIRTUAL}` : null
    },
    load(id) {
      if (id !== `\0${VIRTUAL}`) return null
      return `export default ${JSON.stringify(list())}`
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        list()
        const path = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '')
        const make = entries.get(path)
        if (!make) return next()
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache')
        res.end(make())
      })
    },
    generateBundle() {
      list()
      for (const [fileName, make] of entries) this.emitFile({ type: 'asset', fileName, source: make() })
    },
  }
}
