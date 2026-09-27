// TEMPORARY (moodle agent) — deleted after the run.
import { defineConfig, devices } from '@playwright/test'

const OUT = '/tmp/claude-0/-home-user-words-online/1fbaaa32-65ce-5b77-8f9e-dd311bef8c06/scratchpad/wave5/dist-moodle'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  outputDir: '/tmp/claude-0/-home-user-words-online/1fbaaa32-65ce-5b77-8f9e-dd311bef8c06/scratchpad/wave5/moodle/pw-results',
  use: { baseURL: 'http://127.0.0.1:4620', viewport: { width: 1366, height: 820 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 820 } } }],
  webServer: [
    { command: `npx vite preview --host 127.0.0.1 --port 4620 --strictPort --outDir ${OUT}`, url: 'http://127.0.0.1:4620', reuseExistingServer: false, timeout: 120_000 },
    { command: 'node tests/relay.mjs 7820', port: 7820, reuseExistingServer: false, timeout: 30_000 },
  ],
})
