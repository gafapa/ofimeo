import { expect, test, type BrowserContext } from '@playwright/test'
import { APP_READY, openApp, uniqueDoc } from './helpers'

// The Internet probes of the connection test never leave the machine.
async function offlineProbes(context: BrowserContext): Promise<void> {
  await context.route(/generate_204|cdn-cgi\/trace/, (route) => route.fulfill({ status: 204, body: '' }))
}

// A school relay (Ofimeo Relay) whose configuration points at the local test relay.
async function fakeSchoolRelay(context: BrowserContext): Promise<void> {
  await context.route('https://relay.test/ofimeo/config', (route) =>
    route.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      contentType: 'application/json',
      body: JSON.stringify({ name: 'Test relay', version: '1.0.0', relays: ['ws://127.0.0.1:7790'], iceServers: [], ttl: 3600, expires: Math.floor(Date.now() / 1000) + 3600 }),
    }),
  )
}

test('the connection status opens the connection test', async ({ page, context }) => {
  await offlineProbes(context)
  await openApp(page, 'writer')
  await page.locator('#peer-status').click()
  const dialog = page.locator('dialog.dlg')
  await expect(dialog.getByRole('heading', { name: 'Connection test' })).toBeVisible()
  await expect(dialog.locator('.conn-row', { hasText: '127.0.0.1:7790' })).toContainText('Works')
  await expect(dialog.locator('.conn-verdict')).not.toHaveClass(/testing/, { timeout: 30_000 })
  await expect(dialog.getByRole('button', { name: 'Copy report' })).toBeVisible()
})

test('a school relay from the link is used, and share links carry it', async ({ browser }) => {
  const open = async () => {
    const context = await browser.newContext()
    await fakeSchoolRelay(context)
    await offlineProbes(context)
    return context.newPage()
  }
  const a = await open()
  const b = await open()
  await a.goto(`/?relay=https://relay.test&relaymode=only#app=writer&doc=${uniqueDoc('school')}`)
  await a.locator(APP_READY.writer).waitFor()
  await a.locator('.ProseMirror').click()
  await a.keyboard.type('Through the school relay')
  expect(new URL(a.url()).searchParams.get('relay')).toBe('https://relay.test')
  // The second person opens the link: it brings the relay address.
  await b.goto(a.url())
  await expect(b.locator('.ProseMirror')).toContainText('Through the school relay', { timeout: 60_000 })

  await a.locator('#peer-status').click()
  const dialog = a.locator('dialog.dlg')
  await expect(dialog.locator('.conn-relay')).toContainText('https://relay.test')
  await expect(dialog.locator('.conn-row', { hasText: '127.0.0.1:7790 (school relay)' })).toContainText('Works')
  await expect(dialog.locator('.conn-verdict')).not.toHaveClass(/testing/, { timeout: 30_000 })
})
