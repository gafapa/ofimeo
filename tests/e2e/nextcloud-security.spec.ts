import { expect, test } from '@playwright/test'
import { build } from 'rolldown'
import { resolve } from 'node:path'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

let fixture: string
test.beforeAll(async () => {
  const result = await build({
    input: 'nextcloud-fixture', platform: 'browser', write: false,
    output: { format: 'iife', codeSplitting: false }, logLevel: 'silent',
    plugins: [{
      name: 'nextcloud-fixture',
      resolveId(source) {
        if (source === 'nextcloud-fixture') return '\0fixture'
        if (source === './i18n') return '\0i18n'
      },
      load(id) {
        if (id === '\0i18n') return 'export const t = (key) => key'
        if (id === '\0fixture') return `import * as nc from ${JSON.stringify(resolve('src/core/nextcloud.ts'))}; window.nc = nc;`
      },
    }],
  })
  fixture = result.output.find((item) => item.type === 'chunk')!.code
})

for (const status of [307, 308]) {
  test(`Nextcloud refuses ${status} redirects without forwarding private uploads`, async ({ page }) => {
    let forwarded = 0
    let uploads = 0
    // WebKit cannot fulfill intercepted requests with redirect statuses.
    // Exercise the browser's real HTTP redirect handling in every engine.
    const server = createServer((request, response) => {
      if (request.url === '/nextcloud-fixture.js') {
        response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(fixture)
      } else if (request.method === 'PUT') {
        uploads++
        request.resume()
        response.writeHead(status, { Location: 'http://127.0.0.1:4173/redirect-target' }).end()
      } else {
        response.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><html><body></body></html>')
      }
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    try {
      await page.route('**/redirect-target', (route) => {
        if (route.request().method() !== 'OPTIONS') forwarded++
        return route.fulfill({ status: 204, headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'PUT, OPTIONS',
          'Access-Control-Allow-Headers': 'content-type',
        } })
      })
      await page.goto(`${origin}/nextcloud-fixture.html`)
      await page.addScriptTag({ url: '/nextcloud-fixture.js' })
      const result = await page.evaluate(async () => {
        try {
          await (window as any).nc.upload({ server: location.origin, user: 'test', loginName: 'test', appPassword: 'synthetic' }, '/private.txt', new Blob(['synthetic private content']))
          return 'unexpected success'
        } catch (error) { return (error as any).kind }
      })
      expect(result).toBe('cors')
      expect(uploads).toBe(1)
      expect(forwarded).toBe(0)
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  })
}
