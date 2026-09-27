// Runs the spelling/grammar rule tests (src/core/spell/rules/tests.ts)
// in Node: bundles them with Rolldown (Vite's bundler) into a temporary file.

import { build } from 'rolldown'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = mkdtempSync(join(tmpdir(), 'spell-tests-'))
const file = join(dir, 'tests.mjs')
try {
  await build({ input: join(root, 'src/core/spell/rules/tests.ts'), platform: 'node', output: { file, format: 'esm' }, logLevel: 'silent' })
  const { runTests, CASES } = await import(pathToFileURL(file).href)
  const failures = runTests()
  for (const f of failures) console.log(`FAIL ${f}`)
  console.log(`${CASES.length - failures.length}/${CASES.length} rule tests passed`)
  process.exitCode = failures.length ? 1 : 0
} finally {
  rmSync(dir, { recursive: true, force: true })
}
