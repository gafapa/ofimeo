// Temporary config of the spell agent (deleted after use).
import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4614', viewport: { width: 1366, height: 820 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  outputDir: '/tmp/claude-0/-home-user-words-online/1fbaaa32-65ce-5b77-8f9e-dd311bef8c06/scratchpad/wave5/pw-spell-results',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 820 } } }],
  webServer: [
    { command: 'npx vite preview --host 127.0.0.1 --port 4614 --strictPort --outDir /tmp/claude-0/-home-user-words-online/1fbaaa32-65ce-5b77-8f9e-dd311bef8c06/scratchpad/wave5/dist-spell', url: 'http://127.0.0.1:4614', reuseExistingServer: true, timeout: 60_000 },
    { command: 'node tests/relay.mjs 7814', port: 7814, reuseExistingServer: true, timeout: 30_000 },
  ],
})
