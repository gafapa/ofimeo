// Extracts every t('…') / tn(n, '…', '…') key from src and reports keys missing
// in (or unused by) the es, gl, fr and de catalogs.
// Usage: node scripts/i18n/check-keys.mjs [-v] [--json out.json]
// Exits with code 1 when a key is missing or its {placeholders} differ.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const SRC = fileURLToPath(new URL('../../src', import.meta.url))
const files = []
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (f !== 'locales') walk(p) } else if (/\.ts$/.test(f)) files.push(p) } }
walk(SRC)
const STR = String.raw`'((?:[^'\\\n]|\\.)*)'`
const unescape = (s) => s.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (m, c) => c[0] === 'u' ? String.fromCodePoint(parseInt(c.replace(/[u{}]/g, ''), 16)) : c[0] === 'x' ? String.fromCharCode(parseInt(c.slice(1), 16)) : ({ n: '\n', t: '\t' })[c] ?? c)
const keys = new Map()
const dynamic = []
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  const add = (k, i) => { const key = unescape(k); if (!keys.has(key)) keys.set(key, []); keys.get(key).push(`${f.slice(SRC.length + 1)}:${src.slice(0, i).split('\n').length}`) }
  for (const m of src.matchAll(new RegExp(String.raw`(?<![\w.$])t\(\s*` + STR, 'g'))) add(m[1], m.index)
  for (const m of src.matchAll(new RegExp(String.raw`(?<![\w.$])tn\(\s*[^,]+,\s*` + STR + String.raw`\s*,\s*` + STR, 'g'))) { add(m[1], m.index); add(m[2], m.index) }
  for (const m of src.matchAll(/(?<![\w.$])t\(\s*(?!['\s])([^)'\n]{0,40})/g)) if (!f.endsWith('i18n.ts') && !src.slice(src.lastIndexOf('\n', m.index), m.index).includes('//')) dynamic.push(`${f.slice(SRC.length + 1)}:${src.slice(0, m.index).split('\n').length}: t(${m[1]}`)
}
const load = (lang) => {
  const src = readFileSync(join(SRC, 'core/locales', lang + '.ts'), 'utf8')
  const body = src.slice(src.indexOf('{') , src.lastIndexOf('}') + 1)
  return Function(`return (${body})`)()
}
const args = process.argv.slice(2)
console.log(`keys in source: ${keys.size}`)
if (dynamic.length) console.log(`calls with a non-literal key (${dynamic.length}):\n  ` + dynamic.join('\n  '))
let failed = false
for (const lang of ['es', 'gl', 'fr', 'de']) {
  const cat = load(lang)
  const missing = [...keys.keys()].filter((k) => !(k in cat) || !cat[k])
  const unused = Object.keys(cat).filter((k) => !keys.has(k))
  const badVars = [...keys.keys()].filter((k) => k in cat && JSON.stringify((k.match(/\{\w+\}/g) ?? []).sort()) !== JSON.stringify((cat[k].match(/\{\w+\}/g) ?? []).sort()))
  console.log(`${lang}: ${Object.keys(cat).length} entries, missing ${missing.length}, unused ${unused.length}, placeholder mismatches ${badVars.length}`)
  if (missing.length || badVars.length) failed = true
  if (args.includes('-v')) { for (const k of missing) console.log('  missing:', JSON.stringify(k)); for (const k of unused) console.log('  unused:', JSON.stringify(k)); for (const k of badVars) console.log('  placeholders:', JSON.stringify(k)) }
}
const i = args.indexOf('--json')
if (i >= 0) writeFileSync(args[i + 1], JSON.stringify(Object.fromEntries([...keys].map(([k, v]) => [k, v[0]])), null, 1))
if (failed) process.exitCode = 1
