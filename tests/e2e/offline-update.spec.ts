import { createServer, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, sep, extname } from 'node:path'
import { expect, test } from '@playwright/test'
import { RELAYS } from './helpers'

// Change only the service worker bytes to exercise an actual production update.
test('a PWA update waits for consent and preserves an editor in another tab', async ({ context }) => {
  test.setTimeout(180_000)
  const root = resolve('dist')
  let version = 1
  const server: Server = createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url!, 'http://localhost').pathname)
      const file = resolve(root, `.${path.endsWith('/') ? `${path}index.html` : path}`)
      if (!file.startsWith(`${root}${sep}`)) { response.writeHead(403).end(); return }
      let bytes = await readFile(file)
      if (path === '/sw.js') bytes = Buffer.concat([bytes, Buffer.from(`\n// Update regression version ${version}\n`)])
      const types: Record<string, string> = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' }
      response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' }).end(bytes)
    } catch { response.writeHead(404).end() }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const origin = `http://127.0.0.1:${port}`
  const editor = await context.newPage()
  const home = await context.newPage()
  try {
    await context.addInitScript(() => localStorage.setItem('ofimeo:language', 'en'))
    await editor.goto(`${origin}/${RELAYS}#app=writer&doc=update-regression`)
    await expect(editor.locator('.ProseMirror')).toBeVisible()
    await editor.locator('.ProseMirror').fill('Work stays open during an update.')
    await editor.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 90_000 })
    await home.goto(`${origin}/${RELAYS}`)
    await expect(home.locator('.new-cards')).toBeVisible()
    await home.waitForFunction(() => navigator.serviceWorker.controller)
    let editorNavigations = 0
    editor.on('framenavigated', (frame) => { if (frame === editor.mainFrame()) editorNavigations++ })
    version++
    await home.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update() })
    const prompt = home.getByRole('dialog', { name: 'Update available' })
    await expect(prompt).toBeVisible({ timeout: 60_000 })
    expect(editorNavigations).toBe(0)
    await expect(editor.locator('.ProseMirror')).toContainText('Work stays open during an update.')
    await expect(editor.getByRole('dialog', { name: 'Update available' })).toHaveCount(0)
    await Promise.all([home.waitForEvent('framenavigated'), prompt.getByRole('button', { name: 'Update now' }).click()])
    await expect(home.locator('.new-cards')).toBeVisible()
    expect(editorNavigations).toBe(0)
    await expect(editor.locator('.ProseMirror')).toContainText('Work stays open during an update.')
    await editor.locator('a.app-logo').click()
    await expect(editor.locator('.new-cards')).toBeVisible()
    await expect.poll(() => editorNavigations).toBeGreaterThan(0)
  } finally {
    await Promise.all([editor.close(), home.close()])
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
