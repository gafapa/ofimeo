import { expect, test } from '@playwright/test'
import { build } from 'rolldown'
import { resolve } from 'node:path'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

let fixture: string
test.beforeAll(async () => {
  const result = await build({
    input: 'moodle-security-fixture', platform: 'browser', write: false,
    output: { format: 'iife', codeSplitting: false }, logLevel: 'silent',
    plugins: [{
      name: 'moodle-security-fixture',
      resolveId(source) {
        if (source === 'moodle-security-fixture') return '\0fixture'
        if (source === './connectivity') return '\0connectivity'
        if (source === './school-config') return '\0school-config'
      },
      load(id) {
        if (id === '\0fixture') return `import * as md from ${JSON.stringify(resolve('src/core/moodle.ts'))}; window.md = md;`
        if (id === '\0connectivity') return `
          export const refreshSchoolRelay = async () => {};
          export const schoolRelay = () => window.relayMode ? { address: location.origin, source: 'school', config: { moodle: { url: location.origin, path: '/ofimeo/moodle' } } } : null;
        `
        if (id === '\0school-config') return `
          export const isLocked = () => false;
          export const schoolConfig = () => window.relayMode ? { moodle: { url: location.origin, viaRelay: true } } : {};
        `
      },
    }],
  })
  fixture = result.output.find((item) => item.type === 'chunk')!.code
})

for (const status of [307, 308]) for (const relay of [false, true]) for (const endpoint of ['login', 'rest', 'file']) {
  test(`Moodle ${relay ? 'relay' : 'direct'} ${endpoint} refuses ${status} without forwarding credentials`, async ({ page }) => {
    let forwarded = 0
    let guarded = 0
    const receiver = createServer((req, res) => {
      if (req.method !== 'OPTIONS') forwarded++
      req.resume()
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type', 'Content-Type': 'application/json',
      }).end('{}')
    })
    await new Promise<void>((done) => receiver.listen(0, '127.0.0.1', done))
    const destination = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/forwarded`
    const server = createServer((req, res) => {
      if (req.url === '/fixture.js') res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(fixture)
      else if (req.url === '/fixture.html') res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><html lang="en"><body></body></html>')
      else {
        const path = req.url?.split('?')[0] ?? ''
        if (!/\/(login|rest|file)$|\/(token|server|pluginfile)\.php(?:\/|$)/.test(path)) {
          res.writeHead(204).end()
          return
        }
        const current = path.endsWith('/login') || path.endsWith('/token.php') ? 'login' :
          path.endsWith('/rest') || path.endsWith('/server.php') ? 'rest' : 'file'
        req.resume()
        if (current === endpoint) { guarded++; res.writeHead(status, { Location: destination }).end() }
        else res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ token: 'synthetic-token' }))
      }
    })
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    try {
      await page.goto(`${origin}/fixture.html`)
      await page.addScriptTag({ url: '/fixture.js' })
      const result = await page.evaluate(async ({ relay, endpoint }) => {
        const env = window as any
        env.relayMode = relay
        try {
          if (endpoint === 'file') {
            env.md.saveMoodleAccount({ site: location.origin, token: 'synthetic-token', siteName: 'Synthetic', fullName: 'Test', userId: 1, transport: relay ? 'relay' : 'direct', connectedAt: 1 })
            await env.md.downloadFile({ name: 'private.txt', url: `${location.origin}/webservice/pluginfile.php/private.txt` })
          } else await env.md.connect(location.origin, 'synthetic-user', 'synthetic-password')
          return 'unexpected success'
        } catch { return 'refused' }
      }, { relay, endpoint })
      expect(result).toBe('refused')
      expect(guarded).toBe(1)
      expect(forwarded).toBe(0)
      expect(await page.evaluate(() => (window as any).md.normalizeSite('https://:secret@example.org'))).toBeNull()
      expect(await page.evaluate(() => (window as any).md.sameSite('https://EXAMPLE.org/School', 'https://example.org/school'))).toBe(false)
      expect(await page.evaluate(() => (window as any).md.sameSite('not://valid', 'also://invalid'))).toBe(false)
    } finally {
      for (const instance of [server, receiver]) {
        instance.closeAllConnections()
        await new Promise<void>((done, reject) => instance.close((error) => error ? reject(error) : done()))
      }
    }
  })
}
