// Fast security and credential-storage regressions using the production modules.
import { build } from 'rolldown'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const directory = mkdtempSync(join(tmpdir(), 'ofimeo-core-tests-'))
try {
  const file = join(directory, 'tests.mjs')
  await build({
    input: join(root, 'tests/unit/core.ts'), platform: 'node', output: { file, format: 'esm' }, logLevel: 'silent',
    plugins: [{
      name: 'test-stubs',
      resolveId(source) {
        if (source === './i18n') return '\0test-i18n'
        // The network layer without relays or a page (connectivity reads the DOM when it loads).
        if (source === './connectivity') return '\0test-connectivity'
      },
      load(id) {
        if (id === '\0test-i18n') return 'export const t = (key) => key'
        if (id === '\0test-connectivity') return "export const APP_ID = 'test'; export const nostrRelays = () => undefined; export const rtcConfig = () => undefined"
      },
    }],
  })
  const { runTests } = await import(pathToFileURL(file).href)
  await runTests()
} finally {
  rmSync(directory, { recursive: true, force: true })
}
