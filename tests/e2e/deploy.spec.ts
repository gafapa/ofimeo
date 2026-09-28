import { expect, test, type Page, type Route } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { openApp, RELAYS, trackErrors } from './helpers'

// School deployment: ofimeo.config.json (src/core/school-config.ts) applied
// before the first render, locked settings, the configuration generator
// (Help ▸ For administrators…) and the headers of deploy/nginx.
//
// The configuration is served with page.route, so the service worker is
// blocked (it would answer from its own cache).
test.use({ serviceWorkers: 'block' })

const SCHOOL = {
  version: 1,
  school: { name: 'IES Proba' },
  defaults: { language: 'gl', documentLanguage: 'gl-ES' },
  features: { webmcp: false, hiddenApps: ['draw'], templates: ['rubric', 'gradebook'] },
  legal: { organization: 'Consellería de Proba', dpoEmail: 'dpd@proba.example' },
  locked: ['language', 'webmcp'],
}

const serveConfig = (page: Page, config: unknown) =>
  page.route('**/ofimeo.config.json', (route: Route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(config) }))

test('school configuration: default language locked, app hidden, templates chosen, school name and contacts', async ({ page }) => {
  const errors = trackErrors(page)
  // The browser is in English and the person chose English before: the lock wins.
  await page.addInitScript(() => localStorage.setItem('ofimeo:language', 'en'))
  await serveConfig(page, SCHOOL)
  await page.goto(`/${RELAYS}`)
  await expect(page.locator('.new-cards')).toBeVisible()

  expect(await page.evaluate(() => document.documentElement.lang)).toBe('gl')
  const select = page.locator('select.home-language')
  await expect(select).toBeDisabled()
  await expect(select).toHaveValue('gl')
  await expect(page.locator('.school-badge')).toContainText('IES Proba')
  await expect(page.locator('.legal-footer .school-legal')).toContainText('dpd@proba.example')

  // Drawing is not offered for new documents; the other apps are.
  await expect(page.locator('.new-card[href*="app=draw"]')).toHaveCount(0)
  await expect(page.locator('.new-card[href*="app=writer"]')).toHaveCount(1)
  // Only the chosen templates.
  await expect(page.locator('.tpl-card')).toHaveCount(2)

  // Works again without the network: the copy from the last visit applies.
  await page.unroute('**/ofimeo.config.json')
  await page.route('**/ofimeo.config.json', (route) => route.abort('internetdisconnected'))
  await page.reload()
  await expect(page.locator('.new-cards')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('gl')
  await expect(page.locator('.new-card[href*="app=draw"]')).toHaveCount(0)

  // The school removed the file: everything is back to normal.
  await page.unroute('**/ofimeo.config.json')
  await page.route('**/ofimeo.config.json', (route) => route.fulfill({ status: 404, body: 'not found' }))
  await page.reload()
  await expect(page.locator('.new-cards')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('en')
  await expect(page.locator('.new-card[href*="app=draw"]')).toHaveCount(1)
  await expect(page.locator('select.home-language')).toBeEnabled()
  expect(errors).toEqual([])
})

test('school configuration: AI assistants (WebMCP) forbidden and shown as set by the school', async ({ page }) => {
  const errors = trackErrors(page)
  await page.addInitScript(() => {
    localStorage.setItem('ofimeo:language', 'en')
    // Turned on in this browser before: the school's lock wins.
    localStorage.setItem('ofimeo:webmcp', '1')
  })
  await serveConfig(page, { ...SCHOOL, defaults: {}, locked: ['webmcp'] })
  await openApp(page, 'writer')
  await expect(page.locator('.webmcp-indicator')).toBeHidden()
  expect(await page.evaluate(() => 'modelContextTesting' in navigator)).toBe(false)

  await page.locator('#menubar').getByText('Tools', { exact: true }).click()
  const item = page.locator('.menu-row', { hasText: 'Allow AI assistants (WebMCP)' })
  await expect(item).toContainText('Set by your school')
  await expect(item).toBeDisabled()
  expect(errors).toEqual([])
})

test('Help ▸ For administrators…: the generator downloads a valid ofimeo.config.json', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ofimeo:language', 'en'))
  await page.goto(`/${RELAYS}`)
  await page.getByRole('button', { name: 'Help', exact: true }).click()
  await page.getByText('For administrators…', { exact: true }).click()
  const dialog = page.locator('dialog[open]')
  await expect(dialog).toContainText('ofimeo.config.json')

  await dialog.getByLabel('Name', { exact: true }).fill('CEIP Exemplo')
  await dialog.locator('select').first().selectOption('es')
  await dialog.getByLabel('People cannot change the interface language').check()
  await dialog.getByLabel('Allow AI assistants (WebMCP)').uncheck()
  await dialog.locator('.admin-apps').getByLabel('Drawings').uncheck()
  await dialog.getByLabel('School relay (Ofimeo Relay)').fill('https://relay.exemplo.example:8443')
  await dialog.getByLabel('Allow public servers (Nostr relays and STUN)').uncheck()
  await expect(dialog.locator('.admin-preview')).toContainText('CEIP Exemplo')

  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download ofimeo.config.json' }).click()])
  expect(download.suggestedFilename()).toBe('ofimeo.config.json')
  const config = JSON.parse(readFileSync(await download.path(), 'utf8'))
  expect(config).toMatchObject({
    school: { name: 'CEIP Exemplo' },
    defaults: { language: 'es' },
    relay: { url: 'https://relay.exemplo.example:8443', only: true },
    features: { webmcp: false, publicRelays: false, hiddenApps: ['draw'] },
  })
  expect(config.locked.sort()).toEqual(['language', 'webmcp'])
})

// The Content-Security-Policy recommended for static hosting (deploy/nginx) must not break the apps.
test('the recommended security headers do not break the app', async ({ page, baseURL }) => {
  test.setTimeout(150_000)
  const inc = readFileSync('deploy/nginx/ofimeo-headers.inc', 'utf8')
  const csp = /Content-Security-Policy "([^"]+)"/.exec(inc)![1]
  expect(readFileSync('deploy/apache.conf', 'utf8')).toContain(csp)
  await page.route(
    (url) => url.origin === new URL(baseURL!).origin,
    async (route) => {
      if (route.request().resourceType() !== 'document') return route.fallback()
      const response = await route.fetch()
      await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } })
    },
  )
  await page.addInitScript(() => {
    localStorage.setItem('ofimeo:language', 'en')
    const w = window as unknown as { cspViolations: string[] }
    w.cspViolations = []
    document.addEventListener('securitypolicyviolation', (e) => w.cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`))
  })
  const errors = trackErrors(page)
  const violations = () => page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations)
  await page.goto(`/${RELAYS}`)
  await expect(page.locator('.new-cards')).toBeVisible()
  expect(await violations()).toEqual([])
  for (const app of ['writer', 'sheet', 'diagram'] as const) {
    await openApp(page, app)
    await page.waitForTimeout(1500)
    expect(await violations(), app).toEqual([])
  }
  expect(errors).toEqual([])
})

test('school configuration: locked school relay and Nextcloud servers', async ({ page }) => {
  const errors = trackErrors(page)
  await page.addInitScript(() => localStorage.setItem('ofimeo:language', 'en'))
  await serveConfig(page, {
    // Nothing listens there: the relay is shown as not reachable, but still locked.
    relay: { url: 'https://127.0.0.1:9', only: true },
    nextcloud: { servers: [{ name: 'Nube do centro', url: 'https://cloud.proba.example' }] },
    locked: ['relay', 'nextcloud'],
  })
  await page.goto(`/?relay=https://other-relay.example`)
  await expect(page.locator('.new-cards')).toBeVisible()
  // A relay given in a link does not replace the locked one.
  expect(new URL(page.url()).searchParams.get('relay')).toBe('https://other-relay.example')

  await page.getByRole('button', { name: 'Help', exact: true }).click()
  await page.getByText('Connection test…', { exact: true }).click()
  const relay = page.locator('dialog[open] .conn-relay:not(.sf-settings)')
  await expect(relay).toContainText('https://127.0.0.1:9')
  await expect(relay).toContainText('Set by your school')
  await expect(relay.locator('input[type=checkbox]')).toBeDisabled()
  await expect(relay.locator('input[type=checkbox]')).toBeChecked()
  await expect(relay.getByRole('button', { name: 'Stop using it' })).toHaveCount(0)
  await page.keyboard.press('Escape')

  await page.locator('.home-accounts').click()
  await page.getByRole('menuitem', { name: 'Nextcloud account…' }).click()
  const server = page.getByLabel('Nextcloud address')
  await expect(server).toHaveValue('https://cloud.proba.example')
  await expect(server).not.toBeEditable()
  await expect(page.locator('dialog[open]')).toContainText('Set by your school')
  expect(errors).toEqual([])
})
