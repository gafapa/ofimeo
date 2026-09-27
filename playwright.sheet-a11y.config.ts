// End-to-end tests against the production build (npm run build first).
import { defineConfig, devices } from '@playwright/test'

export const RELAY_PORT = 7817

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: '/tmp/claude-0/-home-user-words-online/1fbaaa32-65ce-5b77-8f9e-dd311bef8c06/scratchpad/wave5/sheet-a11y/test-results',
  timeout: 90_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4617',
    viewport: { width: 1366, height: 820 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 820 } } }],
  webServer: [
    { command: 'npx vite preview --outDir /tmp/claude-0/-home-user-words-online/1fbaaa32-65ce-5b77-8f9e-dd311bef8c06/scratchpad/wave5/dist-sheet-a11y --host 127.0.0.1 --port 4617 --strictPort', url: 'http://127.0.0.1:4617', reuseExistingServer: !process.env.CI, timeout: 60_000 },
    { command: `node tests/relay.mjs ${RELAY_PORT}`, port: RELAY_PORT, reuseExistingServer: !process.env.CI, timeout: 30_000 },
  ],
})
