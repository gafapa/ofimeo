import { defineConfig, devices } from '@playwright/test'
const DIST = '/tmp/claude-0/-home-user-words-online/1fbaaa32-65ce-5b77-8f9e-dd311bef8c06/scratchpad/wave5/dist-chat-import'
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  outputDir: '/tmp/claude-0/-home-user-words-online/1fbaaa32-65ce-5b77-8f9e-dd311bef8c06/scratchpad/wave5/test-results-chat-import',
  use: { baseURL: 'http://127.0.0.1:4619', viewport: { width: 1366, height: 820 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 820 } } }],
  webServer: [
    { command: `npx vite preview --host 127.0.0.1 --port 4619 --strictPort --outDir ${DIST}`, url: 'http://127.0.0.1:4619', reuseExistingServer: false, timeout: 60_000 },
    { command: 'node tests/relay.mjs 7819', port: 7819, reuseExistingServer: false, timeout: 30_000 },
  ],
})
