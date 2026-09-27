import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4612', viewport: { width: 1366, height: 820 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  outputDir: '/tmp/claude-0/-home-user-words-online/1fbaaa32-65ce-5b77-8f9e-dd311bef8c06/scratchpad/wave5/sync/test-results',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 820 } } }],
  webServer: [
    { command: 'npx vite preview --host 127.0.0.1 --port 4612 --strictPort --outDir /tmp/claude-0/-home-user-words-online/1fbaaa32-65ce-5b77-8f9e-dd311bef8c06/scratchpad/wave5/dist-sync', url: 'http://127.0.0.1:4612', reuseExistingServer: false, timeout: 60_000 },
    { command: 'node tests/relay.mjs 7812', port: 7812, reuseExistingServer: false, timeout: 30_000 },
    { command: 'node tests/relay.mjs 7790', port: 7790, reuseExistingServer: true, timeout: 30_000 },
  ],
})
