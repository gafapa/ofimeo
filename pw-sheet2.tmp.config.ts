import { defineConfig, devices } from '@playwright/test'
// Scratch copy of playwright.config.ts on free ports (preview of the scratch build).
export default defineConfig({
  testDir: '/home/user/words-online/tests/e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:6502', viewport: { width: 1366, height: 820 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  outputDir: '/tmp/claude-0/-home-user-words-online/1fbaaa32-65ce-5b77-8f9e-dd311bef8c06/scratchpad/sheet2/pw-results',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 820 } } }],
  webServer: [{ command: 'node tests/relay.mjs 7790', cwd: '/home/user/words-online', port: 7790, reuseExistingServer: true, timeout: 30_000 }, { command: 'npx vite preview --host 127.0.0.1 --port 6502 --strictPort --outDir /tmp/claude-0/-home-user-words-online/1fbaaa32-65ce-5b77-8f9e-dd311bef8c06/scratchpad/sheet2/dist', cwd: '/home/user/words-online', url: 'http://127.0.0.1:6502', reuseExistingServer: false, timeout: 60_000 }],
})
