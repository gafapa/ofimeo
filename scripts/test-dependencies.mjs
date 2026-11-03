// Exercise the public contracts used by pinned transitive security overrides.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
// Test the replacement through the real resolver dependency path, not a
// standalone import that could leave the vulnerable installation in use.
const workboxRequire = createRequire(require.resolve('workbox-build'))
const resolverRequire = createRequire(workboxRequire.resolve('@rollup/plugin-node-resolve'))
assert.equal(resolverRequire('deepmerge/package.json').name, '@ofimeo/deepmerge')
const merge = resolverRequire('deepmerge')
const payload = () => JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"prototype":{"polluted":true},"safe":1}')
for (const value of [payload(), Object.assign(Object.create(null), payload())]) {
  for (const merged of [merge({}, value), merge(value, {}), merge(Object.create(null), value), merge({}, { nested: value }).nested, merge([], [value])[0]]) {
    assert.equal(Object.getPrototypeOf(merged), Object.prototype)
    assert.equal(merged.polluted, undefined)
    assert.equal(merged.safe, 1)
    for (const key of ['__proto__', 'constructor', 'prototype']) assert.equal(Object.hasOwn(merged, key), false)
  }
}
assert.equal(Object.prototype.polluted, undefined)
const symbol = Symbol('merge contract')
const defaults = { extensions: ['.mjs', '.js'], nested: { [symbol]: { enabled: true } } }
const cloned = merge({}, defaults)
assert.deepEqual(cloned, defaults)
assert.notEqual(cloned.extensions, defaults.extensions)
assert.notEqual(cloned.nested[symbol], defaults.nested[symbol])
assert.deepEqual(merge({ list: [1] }, { list: [2] }), { list: [1, 2] })
assert.deepEqual(merge({ list: [1] }, { list: [2] }, { customMerge: (key) => key === 'list' ? (_, source) => source : undefined }), { list: [2] })
assert.deepEqual(merge.all([{ first: 1 }, { second: 2 }]), { first: 1, second: 2 })
assert.equal(workboxRequire('@rollup/plugin-node-resolve').nodeResolve().name, 'node-resolve')
const directory = await mkdtemp(join(tmpdir(), 'ofimeo-dependency-tests-'))
try {
  await mkdir(join(directory, 'nested'))
  await mkdir(join(directory, 'skip'))
  await Promise.all(['root.txt', 'nested/task.txt', 'nested/note.md', 'skip/secret.txt'].map((path) => writeFile(join(directory, path), 'synthetic')))
  const expected = ['nested/task.txt', 'root.txt']
  const normalize = (paths) => paths.map((path) => path.replaceAll('\\', '/')).sort()

  // Archiver utilities use the sync alias retained by modern Glob.
  const excelRequire = createRequire(require.resolve('exceljs'))
  const archiverRequire = createRequire(excelRequire.resolve('archiver'))
  const utilsRequire = createRequire(archiverRequire.resolve('archiver-utils'))
  const archiveGlob = utilsRequire('glob')
  assert.deepEqual(normalize(archiveGlob.sync('**/*.txt', { cwd: directory, ignore: 'skip/**', nodir: true })), expected)
  assert.deepEqual(normalize(archiverRequire('archiver-utils').file.expand({ cwd: directory, filter: 'isFile' }, ['**/*.txt', '!skip/**'])), expected)

  const readdir = archiverRequire('readdir-glob')
  const matches = await new Promise((resolve, reject) => {
    const paths = []
    readdir(directory, { pattern: '**/*.txt', ignore: 'skip/**' })
      .on('match', (match) => paths.push(match.relative))
      .on('end', () => resolve(paths))
      .on('error', reject)
  })
  assert.deepEqual(normalize(matches), expected)

  // Workbox uses the modern synchronous glob API to construct the offline cache.
  assert.deepEqual(normalize(workboxRequire('glob').globSync('**/*.txt', { cwd: directory, ignore: 'skip/**', nodir: true })), expected)

  const ExcelJS = require('exceljs')
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Tasks')
  sheet.addRow(['Task', 'Duration', 'Total'])
  sheet.addRow(['Synthetic task', 3, { formula: 'B2*2', result: 6 }])
  sheet.getCell('B2').numFmt = '0.00'
  const copy = new ExcelJS.Workbook()
  await copy.xlsx.load(await workbook.xlsx.writeBuffer())
  assert.equal(copy.getWorksheet('Tasks').getCell('A2').value, 'Synthetic task')
  assert.equal(copy.getWorksheet('Tasks').getCell('B2').numFmt, '0.00')
  assert.deepEqual(copy.getWorksheet('Tasks').getCell('C2').value, { formula: 'B2*2', result: 6 })
  // ExcelJS's Node streaming path uses Archiver and Unzipper; the normal
  // in-memory XLSX writer above uses JSZip and cannot catch their API drift.
  const streamed = new ExcelJS.stream.xlsx.WorkbookWriter({ useSharedStrings: true, useStyles: true })
  const streamedSheet = streamed.addWorksheet('Streaming tasks')
  streamedSheet.addRow(['Task', 'Duration']).commit()
  streamedSheet.addRow(['Streamed task', 4]).commit()
  await streamed.commit()
  const bytes = streamed.stream.read()
  const streamedCopy = new ExcelJS.Workbook()
  await streamedCopy.xlsx.load(bytes)
  assert.equal(streamedCopy.getWorksheet('Streaming tasks').getCell('A2').value, 'Streamed task')
  assert.equal(streamedCopy.getWorksheet('Streaming tasks').getCell('B2').value, 4)
  const archive = await excelRequire('unzipper').Open.buffer(bytes)
  const strings = archive.files.find((file) => file.path === 'xl/sharedStrings.xml')
  assert.ok(strings)
  assert.match((await strings.buffer()).toString('utf8'), /Streamed task/)
  console.log('6/6 dependency security and compatibility tests passed')
} finally {
  const target = resolve(directory)
  if (!target.startsWith(resolve(tmpdir(), 'ofimeo-dependency-tests-'))) throw new Error('Unexpected dependency test directory')
  await rm(target, { recursive: true, force: true })
}
