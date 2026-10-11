// Measure the generated offline contract without changing which apps are cached.
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

const root = resolve('dist')
const source = readFileSync(resolve(root, 'sw.js'), 'utf8')
const manifest = /precacheAndRoute\((\[[\s\S]*?\]),/.exec(source)?.[1]
if (!manifest) throw new Error('Build the application before measuring offline installation')
const urls = [...manifest.matchAll(/\burl:"([^"]+)"/g)].map((match) => match[1])
if (!urls.length) throw new Error('The precache manifest could not be measured')
const files = urls.map((url) => {
  const file = resolve(root, decodeURIComponent(url))
  if (!file.startsWith(root + sep)) throw new Error('Unexpected precache path')
  return { url, bytes: statSync(file).size }
}).sort((left, right) => right.bytes - left.bytes)
const bytes = files.reduce((sum, file) => sum + file.bytes, 0)
const report = { entries: files.length, bytes, mebibytes: Number((bytes / 1024 / 1024).toFixed(2)), largestFiles: files.slice(0, 12), policy: 'All editors remain precached. Figures are uncompressed build bytes, not measured network transfer.' }
writeFileSync(resolve(root, 'installation-metrics.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
