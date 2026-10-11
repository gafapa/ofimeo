import { expect, test } from '@playwright/test'
import { RELAYS, trackErrors } from './helpers'

// Ofimeo Drawing: Excalidraw's fonts come from the suite's own folder, also
// when the suite is served from a subpath, and never from a CDN.

// Routed requests do not reach a page controlled by the service worker.
test.use({ serviceWorkers: 'block' })

for (const folder of ['', 'school/ofimeo/']) {
  test(`drawing fonts load from the suite's own folder${folder ? ' under a subpath' : ''}`, async ({ page, baseURL }) => {
    const errors = trackErrors(page)
    const fonts: string[] = []
    const elsewhere: string[] = []
    page.on('request', (r) => {
      const url = new URL(r.url())
      if (url.pathname.includes('/fonts/')) fonts.push(url.pathname)
      if (url.protocol.startsWith('http') && url.origin !== new URL(baseURL!).origin) elsewhere.push(r.url())
    })
    // The same build behind a subpath.
    if (folder) await page.route(`**/${folder}**`, async (route) => route.fulfill({ response: await route.fetch({ url: route.request().url().replace(`/${folder}`, '/') }) }))
    await page.addInitScript(() => localStorage.setItem('ofimeo:language', 'en'))
    await page.goto(`/${folder}${RELAYS}#new=draw`)
    await page.locator('.excalidraw').waitFor({ timeout: 60_000 })
    await page.locator('.persist-notice button').first().click({ timeout: 3000 }).catch(() => {})
    // A text in the hand-drawn font.
    await page.mouse.dblclick(600, 450)
    await page.keyboard.type('Hello')
    await page.keyboard.press('Escape')
    await expect.poll(() => fonts.length).toBeGreaterThan(0)
    expect(fonts.filter((path) => !path.startsWith(`/${folder}excalidraw/fonts/`))).toEqual([])
    expect(elsewhere).toEqual([])
    expect(errors).toEqual([])
  })
}
