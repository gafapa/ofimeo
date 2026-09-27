// Writes THIRD_PARTY_NOTICES.md from the licenses of the production
// dependencies (package-lock.json without dev packages): a table of every
// package and its license, the license files themselves (identical texts are
// printed once), NOTICE files of Apache-2.0 components, and the components that
// are not npm packages (draw.io shape libraries, Excalidraw's fonts).
// scripts/build-legal.mjs turns it into the public page legal/licenses.html.
//
// Fails (exit 1) when a production dependency declares no license and ships no
// license file, so CI stops before such a package is published.
//
// Usage: node scripts/third-party-notices.mjs [--check]   (--check: verify only, write nothing)

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const check = process.argv.includes('--check')
const out = join(root, 'THIRD_PARTY_NOTICES.md')

// Packages without any license information that are known not to reach the
// browser build (and why). Anything else without a license fails.
const NOT_BUNDLED = {
  buffers: 'Node.js-only dependency of exceljs (unzipper → binary); the browser build of exceljs does not include it.',
}

// Components that are not npm packages but are part of the published site.
const EXTRA = [
  {
    name: 'draw.io shape libraries ("More shapes")',
    source: 'https://github.com/jgraph/drawio (release pinned in scripts/drawio.json), generated into diagram-libs/ by scripts/build-diagram-libs.mjs',
    license: 'Apache-2.0 (code, palettes) + additional restriction on stencils and icons',
    files: ['public/diagram-libs/NOTICE', 'public/diagram-libs/LICENSE'],
    fallback:
      'Copyright (c) 2006-2025 JGraph Holdings Ltd / draw.io AG. The code and palettes are licensed under the Apache License 2.0. ' +
      'The stencils and icons may not be used as software assets in, distributed for use with, or incorporated into Atlassian products ' +
      'or products distributed through the Atlassian marketplace or plugin ecosystem, without explicit written permission. ' +
      'This restriction does not apply to end-user diagram output. (diagram-libs/ has not been generated in this checkout.)',
  },
  {
    name: 'Excalidraw fonts (excalidraw/fonts/)',
    source: '@excalidraw/excalidraw (copied by scripts/copy-excalidraw-assets.mjs)',
    license: 'OFL-1.1 (Excalifont, Virgil, Xiaolai, Assistant, Cascadia Code, Liberation Sans, Lilita One, Nunito); MIT (Comic Shanns)',
    text:
      'The fonts are distributed with Excalidraw under the licenses of their authors, as listed in the Excalidraw repository ' +
      '(https://github.com/excalidraw/excalidraw, packages/excalidraw/fonts). The SIL Open Font License 1.1 text is reproduced ' +
      'below with the @fontsource packages; the fonts are bundled with the application and are not sold separately.',
  },
  {
    name: 'DejaVu Sans, symbols subset (src/apps/pdf/fonts/dejavu-sans-symbols.woff)',
    source: 'https://dejavu-fonts.github.io/ (DejaVuSans.ttf 2.37, subset with fontTools pyftsubset)',
    license: 'Bitstream Vera Fonts license + Arev Fonts license (DejaVu changes are in the public domain)',
    files: ['src/apps/pdf/fonts/LICENSE-DejaVu.txt'],
    fallback: 'See https://dejavu-fonts.github.io/License.html',
  },
  {
    name: 'Spelling dictionaries (dictionaries/)',
    source: 'dictionary-* packages from https://github.com/wooorm/dictionaries, converted by scripts/spell-dictionaries.mjs',
    license: 'Per language (see the dictionary-* packages below)',
    text:
      'Each dictionary is served as a separate data file next to its license (dictionaries/<lang>-LICENSE.txt). ' +
      'The files are modified: the morphological fields of the original .dic/.aff files are removed. ' +
      'The unmodified sources are the dictionary-* npm packages listed below, and the conversion script is scripts/spell-dictionaries.mjs. ' +
      'Spanish: GPL-3.0-or-later, LGPL-3.0-or-later or MPL-1.1-or-later (at your choice). Galician: GPL-3.0. ' +
      'German: GPL-2.0 or GPL-3.0. French: MPL-2.0. English: MIT and BSD. The full GPL-3.0 text is included below.',
  },
]

const LICENSE_FILE = /^(licen[cs]e|copying|notice|copyright|ofl)([-._].*)?$/i
const norm = (s) => s.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trim()
const hash = (s) => createHash('sha256').update(s.replace(/\s+/g, ' ')).digest('hex').slice(0, 12)

function licenseId(pj) {
  const l = pj.license ?? pj.licenses
  if (!l) return ''
  if (typeof l === 'string') return l
  if (Array.isArray(l)) return l.map((x) => (typeof x === 'string' ? x : x.type)).join(' OR ')
  return l.type ?? ''
}

// A best guess from the text, for packages that ship a license file but no field.
function guess(text) {
  if (/Permission is hereby granted, free of charge/.test(text)) return 'MIT'
  if (/Permission to use, copy, modify, and\/or distribute/.test(text)) return 'ISC'
  if (/Apache License[\s\S]{0,40}Version 2\.0/.test(text)) return 'Apache-2.0'
  if (/Redistribution and use in source and binary forms/.test(text)) return 'BSD'
  return 'SEE LICENSE FILE'
}

const person = (a) => (typeof a === 'string' ? a : a?.name ? `${a.name}${a.email ? ` <${a.email}>` : ''}` : '')
const repoUrl = (pj) => {
  const r = typeof pj.repository === 'string' ? pj.repository : pj.repository?.url
  const url = (r || pj.homepage || '').replace(/^git\+/, '').replace(/\.git$/, '').replace(/^git:\/\//, 'https://')
  if (/^[\w-]+\/[\w.-]+$/.test(url)) return `https://github.com/${url}`
  return url.replace(/^github:/, 'https://github.com/')
}

const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))
const packages = new Map() // name@version -> info
const problems = []
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path || entry.dev) continue
  const dir = join(root, path)
  if (!existsSync(join(dir, 'package.json'))) continue // optional, for another platform (e.g. fsevents)
  const pj = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const name = pj.name ?? path.split('node_modules/').pop()
  const key = `${name}@${pj.version}`
  if (packages.has(key)) continue
  const files = readdirSync(dir)
    .filter((f) => LICENSE_FILE.test(f) && statSync(join(dir, f)).isFile())
    .sort()
    .map((f) => ({ file: f, text: norm(readFileSync(join(dir, f), 'utf8')) }))
    .filter((f) => f.text)
  let license = licenseId(pj)
  let note = ''
  if (!license && files.length) license = guess(files.find((f) => /^licen|^copying/i.test(f.file))?.text ?? files[0].text)
  if (!license && !files.length) {
    if (NOT_BUNDLED[name]) {
      license = 'NONE DECLARED'
      note = NOT_BUNDLED[name]
    } else {
      problems.push(`${key} (${path}) declares no license and has no license file`)
      continue
    }
  }
  if (/^UNLICENSED$/i.test(license)) problems.push(`${key} is UNLICENSED (proprietary)`)
  packages.set(key, { name, version: pj.version, license, url: repoUrl(pj), author: person(pj.author), files, note })
}

if (problems.length) {
  console.error('third-party-notices: production dependencies without a usable license:\n  ' + problems.join('\n  '))
  console.error('Add the license to the package, replace the dependency, or (if it never reaches the browser) list it in NOT_BUNDLED with the reason.')
  process.exit(1)
}

const list = [...packages.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version, undefined, { numeric: true }))

// Summary by license expression.
const byLicense = new Map()
for (const p of list) byLicense.set(p.license, (byLicense.get(p.license) ?? 0) + 1)

// License texts: packages with identical texts share one copy. Packages that
// ship no file get a standard text (MIT/ISC with their author as the holder,
// otherwise a pointer to the full text elsewhere in this file).
const texts = new Map() // hash -> { text, owners: [] }
const addText = (text, owner) => {
  const h = hash(text)
  if (!texts.has(h)) texts.set(h, { text, owners: [] })
  texts.get(h).owners.push(owner)
}
const MIT = (holder) =>
  `MIT License\n\nCopyright (c) ${holder}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`
const ISC = (holder) =>
  `ISC License\n\nCopyright (c) ${holder}\n\nPermission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.\n\nTHE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.`

// The full Apache-2.0 text is printed once; packages whose LICENSE is exactly
// that text refer to it (their NOTICE files, if any, are printed in full).
const apache = list.flatMap((p) => p.files).find((f) => /^\s*Apache License\s+Version 2\.0, January 2004/.test(f.text) && /END OF TERMS AND CONDITIONS/.test(f.text))?.text
const apacheTerms = apache ? apache.slice(0, apache.indexOf('END OF TERMS AND CONDITIONS')) : null
const isPlainApache = (t) => apacheTerms && t.startsWith(apacheTerms.slice(0, 2000)) && t.length < apache.length + 200 && !/Copyright (\(c\)|©)? ?\d{4}(?! \[yyyy\])/.test(t.slice(apacheTerms.length))

// MIT and ISC files that are the standard text: the copyright lines are listed
// per package and the permission notice is printed once.
const flat = (s) => s.replace(/\s+/g, ' ').replace(/[“”]/g, '"').trim()
const bodyOf = (t, start) => (t.indexOf(start) >= 0 ? flat(t.slice(t.indexOf(start))) : null)
const STANDARD = { MIT: ['Permission is hereby granted', MIT('x')], ISC: ['Permission to use, copy, modify, and/or distribute', ISC('x')] }
const standard = { MIT: [], ISC: [] } // [owner, copyright lines]
function asStandard(text) {
  for (const [id, [start, tpl]] of Object.entries(STANDARD)) {
    const body = bodyOf(text, start)
    if (!body || body !== bodyOf(tpl, start)) continue
    const head = text.slice(0, text.indexOf(start)).split('\n').map((l) => l.trim()).filter((l) => l && !/^(the )?(mit|isc) licen[sc]e( \(mit\))?$/i.test(l))
    if (head.length && head.every((l) => /copyright|\(c\)|©|^[\w .,<>@()'&-]+$/i.test(l))) return [id, head]
  }
  return null
}

for (const p of list) {
  const owner = `${p.name} ${p.version}`
  const own = p.files.filter((f) => !(p.license.includes('Apache-2.0') && isPlainApache(f.text)))
  const std = own.length === 1 ? asStandard(own[0].text) : null
  if (std) standard[std[0]].push([owner, std[1]])
  else if (own.length) for (const f of own) addText(f.text, `${owner} (${f.file})`)
  else if (p.files.length) addText('Apache License 2.0: see the full text under "Apache License 2.0" at the top of this section.', owner)
  else if (p.license === 'MIT' || p.license === 'MIT/X11') standard.MIT.push([owner, [`Copyright (c) ${p.author || `the ${p.name} authors`} (no license file in the package)`]])
  else if (p.license === 'ISC') standard.ISC.push([owner, [`Copyright (c) ${p.author || `the ${p.name} authors`} (no license file in the package)`]])
  else if (p.license.includes('Apache-2.0')) addText('Apache License 2.0: see the full text under "Apache License 2.0" at the top of this section.', owner)
  else addText(`${p.license}${p.note ? `\n\n${p.note}` : ''}`, `${owner} (no license file in the package)`)
}

const fence = '````'
const lines = [
  '# Third-party notices',
  '',
  '<!-- Generated by scripts/third-party-notices.mjs from package-lock.json and node_modules. Do not edit by hand. -->',
  '',
  `Ofimeo includes the open source components listed below. This file lists ${list.length} production packages (a superset of what ends up in the browser build) and the other bundled components, with their licenses. License texts are reproduced in their original language.`,
  '',
  '## Summary',
  '',
  '| License | Packages |',
  '| --- | --- |',
  ...[...byLicense].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([l, n]) => `| ${l.replace(/\|/g, '\\|')} | ${n} |`),
  '',
  '## Components that are not npm packages',
  '',
]
for (const e of EXTRA) {
  lines.push(`### ${e.name}`, '', `- Source: ${e.source}`, `- License: ${e.license}`, '')
  const files = (e.files ?? []).filter((f) => existsSync(join(root, f)))
  if (files.length) for (const f of files) lines.push(`${f.split('/').pop()}:`, '', fence + 'text', norm(readFileSync(join(root, f), 'utf8')), fence, '')
  else lines.push(e.text ?? e.fallback, '')
}
lines.push('## Packages', '', '| Package | Version | License | Source |', '| --- | --- | --- | --- |')
for (const p of list) lines.push(`| ${p.name} | ${p.version} | ${p.license.replace(/\|/g, '\\|')}${p.note ? ' (not bundled)' : ''} | ${p.url || '—'} |`)
lines.push('', '## License texts', '')
if (apache) lines.push('### Apache License 2.0', '', fence + 'text', apache, fence, '')
for (const [id, owners] of Object.entries(standard)) {
  if (!owners.length) continue
  const tpl = id === 'MIT' ? MIT('x') : ISC('x')
  lines.push(`### ${id} License`, '', `The following ${owners.length} packages are licensed under the ${id} License with the standard text below; each one's copyright notice is listed with it.`, '')
  for (const [owner, head] of owners) lines.push(`- ${owner}: ${head.join(' ').replace(/[<>|*_`]/g, (c) => '\\' + c)}`)
  lines.push('', fence + 'text', `${id} License\n\nCopyright (c) <the copyright holders listed above>\n\n${tpl.slice(tpl.indexOf('Permission'))}`, fence, '')
}
for (const { text, owners } of [...texts.values()].sort((a, b) => a.owners[0].localeCompare(b.owners[0]))) {
  lines.push(`### ${owners[0].split(' (')[0]}${owners.length > 1 ? ` and ${owners.length - 1} more` : ''}`, '', `Applies to: ${owners.join(', ')}`, '', fence + 'text', text, fence, '')
}
const md = lines.join('\n')

if (check) {
  console.log(`third-party-notices: ${list.length} production packages, all with a license`)
} else {
  writeFileSync(out, md)
  console.log(`third-party-notices: ${list.length} packages, ${texts.size} license texts → THIRD_PARTY_NOTICES.md (${Math.round(md.length / 1024)} KB)`)
}
