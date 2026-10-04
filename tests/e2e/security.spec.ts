import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { trackErrors } from './helpers'

// A diagram whose HTML label carries an event handler, as a shared document
// or an imported file could.
const EVIL_DRAWIO =
  '<mxfile host="test"><diagram id="d1" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>' +
  '<mxCell id="2" value="&lt;img src=&quot;x:&quot; onerror=&quot;window.__xss = 1&quot;&gt;&lt;b&gt;Hello&lt;/b&gt;" style="rounded=1;html=1;" vertex="1" parent="1">' +
  '<mxGeometry x="40" y="40" width="160" height="60" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>'

test('diagram labels are drawn without scripts or event handlers', async ({ page }) => {
  const errors = trackErrors(page)
  const file = join(tmpdir(), `evil-${Date.now()}.drawio`)
  writeFileSync(file, EVIL_DRAWIO)
  await page.addInitScript(() => localStorage.setItem('ofimeo:language', 'en'))
  await page.goto('/?notour')
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.home-open').first().click()])
  await chooser.setFiles(file)
  const canvas = page.locator('.diagram-canvas')
  await expect(canvas.locator('b', { hasText: 'Hello' })).toBeVisible({ timeout: 60_000 })
  // The sanitizer removed the handler (not only the CSP blocking it).
  await expect(canvas.locator('[onerror]')).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss ?? 0)).toBe(0)
  expect(errors).toEqual([])
})

test('the built pages carry the script directives of the recommended CSP', async ({ page }) => {
  const header = /Content-Security-Policy "([^"]+)"/.exec(readFileSync('deploy/nginx/ofimeo-headers.inc', 'utf8'))![1]
  const expected = header.split(';').map((d) => d.trim()).filter((d) => /^(script-src|object-src|base-uri) /.test(d)).join('; ')
  expect(expected).toContain("script-src 'self'")
  expect(expected).not.toContain('unsafe-inline')
  for (const path of ['/', '/legal/es/privacy.html']) {
    const html = await (await page.request.get(path)).text()
    expect(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1], path).toBe(expected)
  }
})
