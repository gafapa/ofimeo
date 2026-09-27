import type { Page } from '@playwright/test'

// Local relay only (see playwright.config.ts).
// E2E_RELAY_PORT: another port when several test runs share the machine.
export const RELAY_PORT = Number(process.env.E2E_RELAY_PORT || 7790)
export const RELAYS = `?relays=ws://127.0.0.1:${RELAY_PORT}`

export const APP_READY: Record<string, string> = {
  writer: '.ProseMirror',
  sheet: '.app-sheet canvas',
  draw: '.excalidraw',
  diagram: '.diagram-canvas svg',
  slides: '.diagram-canvas svg',
}

export function uniqueDoc(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// Collects uncaught page errors so tests can assert there were none.
export function trackErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return errors
}

export async function openApp(page: Page, app: string, doc = uniqueDoc(app)): Promise<void> {
  await page.goto(`/${RELAYS}#app=${app}&doc=${doc}`)
  await page.locator(APP_READY[app]).first().waitFor({ timeout: 60_000 })
}
