// Exercise the real Pages gate against successful, stale and untrusted CI runs.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const source = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8')
const script = /node --input-type=module -e '([\s\S]*?)'/.exec(source)?.[1]
assert.ok(script, 'Pages must retain an executable CI success gate')
const directory = mkdtempSync(join(tmpdir(), 'ofimeo-workflow-tests-'))
const success = { id: 1, run_attempt: 1, head_sha: 'target', head_repository: { full_name: 'school/ofimeo' }, event: 'push', conclusion: 'success' }
const cases = [
  ['successful commit', [success], true],
  ['manual successful CI', [{ ...success, event: 'workflow_dispatch' }], true],
  ['missing CI', [], false],
  ['failed CI', [{ ...success, conclusion: 'failure' }], false],
  ['stale success before failure', [success, { ...success, id: 2, conclusion: 'failure' }], false],
  ['stale success before pending run', [success, { ...success, id: 2, conclusion: null }], false],
  ['stale attempt before failure', [success, { ...success, run_attempt: 2, conclusion: 'failure' }], false],
  ['wrong commit', [{ ...success, head_sha: 'other' }], false],
  ['fork CI', [{ ...success, head_repository: { full_name: 'fork/ofimeo' } }], false],
  ['PR only', [{ ...success, event: 'pull_request' }], false],
]
try {
  for (const [name, runs, expected] of cases) {
    writeFileSync(join(directory, 'ci-runs.json'), JSON.stringify({ workflow_runs: runs }))
    let allowed = true
    try { execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: directory, env: { ...process.env, TARGET_SHA: 'target', GITHUB_REPOSITORY: 'school/ofimeo' }, stdio: 'pipe' }) }
    catch { allowed = false }
    assert.equal(allowed, expected, name)
  }
  for (const file of ['ci.yml', 'pages.yml', 'relay-release.yml']) {
    const workflow = readFileSync(new URL(`../.github/workflows/${file}`, import.meta.url), 'utf8')
    for (const action of workflow.matchAll(/uses:\s+([^\s#]+)/g)) assert.match(action[1], /^actions\/[\w-]+@[a-f0-9]{40}$/)
    for (const checkout of workflow.matchAll(/uses: actions\/checkout@[^\n]+\n\s+with:\n([^]*?)(?=\n\s+- |$)/g)) assert.match(checkout[1], /persist-credentials: false/)
  }
  console.log(`${cases.length}/${cases.length} Pages gate tests passed; workflow actions pinned`)
} finally { rmSync(directory, { recursive: true, force: true }) }
