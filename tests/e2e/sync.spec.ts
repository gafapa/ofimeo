// Store-and-forward sync (docs/store-forward.md): two people who are never
// online at the same time converge through an encrypted mailbox, on Ofimeo
// Relay (the real Go program, built here when Go is installed) or in a
// Nextcloud folder (a small in-memory WebDAV server below).
import { expect, test, type Browser, type Page } from '@playwright/test'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const RELAY_PORT = Number(process.env.SYNC_RELAY_PORT || 7791)
const RELAY = `https://127.0.0.1:${RELAY_PORT}`
// Local Nostr relay for signaling (see playwright.config.ts): never public relays.
const NOSTR = process.env.SYNC_NOSTR || 'ws://127.0.0.1:7790'

function hasGo(): boolean {
  try {
    execFileSync('go', ['version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? filesUnder(path) : [path]
  })
}

async function newPage(browser: Browser, init?: (page: Page) => Promise<void>): Promise<Page> {
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await context.newPage()
  await page.addInitScript(() => localStorage.setItem('words-online:language', 'en'))
  if (init) await init(page)
  return page
}

async function typeAndSync(page: Page, text: string, state = 'synced'): Promise<void> {
  await page.locator('.ProseMirror').click()
  await page.keyboard.press('End')
  await page.keyboard.type(text)
  // Let the status show the pending change, then wait until it was uploaded.
  await page.waitForTimeout(600)
  await expect(page.locator(`.sf-state.${state}`)).toBeVisible({ timeout: 30_000 })
}

async function viewLink(page: Page): Promise<string> {
  await page.locator('#btn-share').click()
  await page.locator('.share-tab[data-value=view]').click()
  const link = await page.locator('dialog[open] input.field').inputValue()
  await page.keyboard.press('Escape')
  return link
}

test.describe('store-and-forward through Ofimeo Relay', () => {
  let relay: ChildProcess | undefined
  let dataDir = ''

  test.beforeAll(async () => {
    test.skip(!hasGo(), 'Go is not installed')
    const work = mkdtempSync(join(tmpdir(), 'ofimeo-sync-'))
    dataDir = join(work, 'data')
    const bin = join(work, 'ofimeo-relay')
    execFileSync('go', ['build', '-o', bin, '.'], { cwd: join(process.cwd(), 'relay'), stdio: 'inherit' })
    relay = spawn(bin, ['run', '--data', dataDir, '--https-port', String(RELAY_PORT), '--http-port', '-1', '--turn-port', String(RELAY_PORT + 10000), '--turn-tls-port', '-1', '--store-default-on'], { stdio: 'ignore' })
    for (let i = 0; i < 100; i++) {
      try {
        execFileSync('curl', ['-sk', '--max-time', '1', `${RELAY}/ofimeo/store`], { stdio: 'ignore' })
        return
      } catch {
        await new Promise((r) => setTimeout(r, 200))
      }
    }
    throw new Error('relay did not start')
  })

  test.afterAll(() => {
    relay?.kill()
    if (dataDir) rmSync(join(dataDir, '..'), { recursive: true, force: true })
  })

  test('people never online together converge; view links read but cannot write', async ({ browser }) => {
    // A student writes in class and closes the browser.
    const a = await newPage(browser)
    await a.goto(`/?relay=${RELAY}&relaymode=only#new=writer`)
    await a.locator('.ProseMirror').waitFor()
    await typeAndSync(a, 'Written in class.')
    await expect(a.locator('.sf-state.synced')).toHaveText('Synced to Ofimeo Relay')
    const editUrl = a.url()
    const view = await viewLink(a)
    await a.context().close()

    // At home (another device, nobody else online), the work is there.
    const b = await newPage(browser)
    await b.goto(editUrl)
    await expect(b.locator('.ProseMirror')).toContainText('Written in class.', { timeout: 30_000 })
    await typeAndSync(b, ' Finished at home.')
    await b.context().close()

    // The relay only has ciphertext.
    const stored = filesUnder(join(dataDir, 'store')).filter((f) => f.endsWith('.bin'))
    expect(stored.length).toBeGreaterThan(0)
    for (const file of stored) expect(readFileSync(file).includes('Written in class')).toBe(false)

    // The teacher, with a view link, reads everything later.
    const c = await newPage(browser)
    await c.goto(view)
    await expect(c.locator('#access-badge')).toHaveText('View only', { timeout: 30_000 })
    await expect(c.locator('.ProseMirror')).toContainText('Written in class. Finished at home.', { timeout: 30_000 })
    await expect(c.locator('.sf-state.readonly')).toHaveText('Up to date from Ofimeo Relay')

    // A view link knows the mailbox (its id comes from the public key) but
    // cannot write to it: the relay wants a signature by the edit key.
    const verify = new URLSearchParams(new URL(view).hash.slice(1)).get('verify')!
    const id = createHash('sha256').update('ofimeo-store-id:v1').update(Buffer.from(verify, 'base64url')).digest('hex')
    const result = await c.evaluate(
      async ({ relay, id, verify }) => {
        const count = async () => ((await (await fetch(`${relay}/ofimeo/store/${id}`)).json()) as { count: number }).count
        const before = await count()
        const unix = String(Math.floor(Date.now() / 1000))
        const post = (key: string, signature: string) =>
          fetch(`${relay}/ofimeo/store/${id}`, { method: 'POST', headers: { 'X-Ofimeo-Key': key, 'X-Ofimeo-Time': unix, 'X-Ofimeo-Signature': signature }, body: new Uint8Array([1, 2, 3]) }).then((r) => r.status)
        const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
        // The document's public key with a made-up signature.
        const forged = await post(verify, b64(crypto.getRandomValues(new Uint8Array(64))))
        // A key of its own, properly signed.
        const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
        const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
        const own = await post(b64(pub), b64(new Uint8Array(await crypto.subtle.sign('Ed25519', pair.privateKey, new Uint8Array([1, 2, 3])))))
        return { forged, own, before, after: await count() }
      },
      { relay: RELAY, id, verify },
    )
    expect(result.forged).toBe(403)
    expect(result.own).toBe(403)
    expect(result.after).toBe(result.before)

    // The settings live in the connection dialog.
    await c.locator('#peer-status').click()
    const dialog = c.locator('dialog.dlg')
    await expect(dialog.locator('.sf-settings')).toContainText('On the school relay (Ofimeo Relay)')
    await expect(dialog.locator('.sf-settings input[type=checkbox]').first()).toBeChecked()
    await expect(dialog.locator('.sf-settings')).toContainText('This link can only read')
    await c.context().close()
  })
})

// ---------- Nextcloud (mock WebDAV) ----------

// Just enough WebDAV for the Nextcloud client (src/core/nextcloud.ts).
function webdavServer(): { server: Server; files: Map<string, Buffer>; dirs: Set<string> } {
  const files = new Map<string, Buffer>()
  const dirs = new Set<string>(['/'])
  const root = '/remote.php/dav/files/student'
  const parent = (p: string) => p.replace(/\/[^/]+$/, '') || '/'
  const server = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, MKCOL, PROPFIND, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Depth, If-Match, If-None-Match')
    res.setHeader('Access-Control-Expose-Headers', 'ETag, OC-ETag, OC-FileId')
    if (req.method === 'OPTIONS') return void res.writeHead(204).end()
    if (req.headers.authorization !== `Basic ${Buffer.from('student:app-password').toString('base64')}`) return void res.writeHead(401).end()
    const url = new URL(req.url!, 'http://x')
    if (!url.pathname.startsWith(root)) return void res.writeHead(404).end()
    const path = decodeURIComponent(url.pathname.slice(root.length)).replace(/\/+$/, '') || '/'
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      const entry = (p: string) => {
        const dir = dirs.has(p)
        const href = root + p.split('/').map(encodeURIComponent).join('/') + (dir && p !== '/' ? '/' : '')
        const size = dir ? 0 : files.get(p)!.length
        return `<d:response><d:href>${href}</d:href><d:propstat><d:prop><d:resourcetype>${dir ? '<d:collection/>' : ''}</d:resourcetype><d:getcontentlength>${size}</d:getcontentlength><d:getetag>"${size}"</d:getetag><d:getlastmodified>${new Date().toUTCString()}</d:getlastmodified></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`
      }
      switch (req.method) {
        case 'PROPFIND': {
          if (!dirs.has(path) && !files.has(path)) return void res.writeHead(404).end()
          const children = req.headers.depth === '1' && dirs.has(path) ? [...dirs, ...files.keys()].filter((p) => p !== path && parent(p) === path) : []
          res.writeHead(207, { 'Content-Type': 'application/xml' })
          return void res.end(`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${[path, ...children].map(entry).join('')}</d:multistatus>`)
        }
        case 'GET':
          if (!files.has(path)) return void res.writeHead(404).end()
          return void res.writeHead(200, { 'Content-Type': 'application/octet-stream' }).end(files.get(path))
        case 'PUT':
          if (!dirs.has(parent(path))) return void res.writeHead(409).end()
          if (req.headers['if-none-match'] === '*' && files.has(path)) return void res.writeHead(412).end()
          files.set(path, body)
          return void res.writeHead(201, { ETag: `"${body.length}"` }).end()
        case 'MKCOL':
          if (dirs.has(path) || files.has(path)) return void res.writeHead(405).end()
          if (!dirs.has(parent(path))) return void res.writeHead(409).end()
          dirs.add(path)
          return void res.writeHead(201).end()
        case 'DELETE':
          if (!files.delete(path)) return void res.writeHead(404).end()
          return void res.writeHead(204).end()
        default:
          res.writeHead(405).end()
      }
    })
  })
  return { server, files, dirs }
}

test.describe('store-and-forward through Nextcloud', () => {
  const dav = webdavServer()
  let server = ''

  test.beforeAll(async () => {
    await new Promise<void>((resolve) => dav.server.listen(0, '127.0.0.1', resolve))
    const address = dav.server.address()
    server = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
  })

  test.afterAll(() => new Promise<void>((resolve) => dav.server.close(() => resolve())))

  const connect = (folder?: string) => async (page: Page) => {
    await page.addInitScript(
      ({ server, folder }) => {
        const account = { id: `student@${server.replace(/^https?:\/\//, '')}`, server, user: 'student', loginName: 'student', appPassword: 'app-password' }
        localStorage.setItem('words-online:nextcloud', JSON.stringify([account]))
        localStorage.setItem('words-online:store-forward', JSON.stringify({ nextcloud: true, ...(folder ? { folder } : {}) }))
      },
      { server, folder },
    )
  }

  test('a shared Nextcloud folder carries the changes, compacted', async ({ browser }) => {
    const folder = '/Class 3B/Ofimeo'
    const a = await newPage(browser, connect(folder))
    // ?sfcompact=3: compact after 3 blobs (development aid), to test snapshots.
    await a.goto(`/?relays=${NOSTR}&sfcompact=3#new=writer`)
    await a.locator('.ProseMirror').waitFor()
    for (const part of ['First part.', ' Second part.', ' Third part.', ' Fourth part.']) await typeAndSync(a, part)
    await expect(a.locator('.sf-state.synced')).toHaveText('Synced to Nextcloud')
    const url = a.url()
    await a.context().close()

    const blobs = [...dav.files.keys()].filter((p) => p.startsWith(`${folder}/`))
    expect(blobs.length).toBeGreaterThan(0)
    // Snapshots replaced older blobs (one mailbox for the document, one for comments).
    expect(blobs.length).toBeLessThan(5)
    for (const p of blobs) expect(dav.files.get(p)!.includes('part')).toBe(false)

    const b = await newPage(browser, connect(folder))
    await b.goto(url)
    await expect(b.locator('.ProseMirror')).toContainText('First part. Second part. Third part. Fourth part.', { timeout: 30_000 })
    await typeAndSync(b, ' Corrected.')
    await b.context().close()

    // Back in class: the correction arrives.
    const again = await newPage(browser, connect(folder))
    await again.goto(url)
    await expect(again.locator('.ProseMirror')).toContainText('Fourth part. Corrected.', { timeout: 30_000 })
    await again.context().close()
  })

  test('documents without permission keys, and changes made offline, sync too', async ({ browser }) => {
    const doc = `sf-legacy-${Date.now()}`
    const a = await newPage(browser, connect())
    await a.goto(`/?relays=${NOSTR}#app=writer&doc=${doc}&key=legacy-room-secret`)
    await a.locator('.ProseMirror').waitFor()
    await typeAndSync(a, 'Online first.')
    // Offline: the change waits in the browser, and is sent once back online.
    await a.context().setOffline(true)
    await typeAndSync(a, ' Then offline.', 'offline')
    await a.context().setOffline(false)
    await expect(a.locator('.sf-state.synced')).toBeVisible({ timeout: 30_000 })
    await a.context().close()
    expect([...dav.files.keys()].some((p) => p.startsWith('/Ofimeo/Sync/'))).toBe(true)

    const b = await newPage(browser, connect())
    await b.goto(`/?relays=${NOSTR}#app=writer&doc=${doc}&key=legacy-room-secret`)
    await expect(b.locator('.ProseMirror')).toContainText('Online first. Then offline.', { timeout: 30_000 })
    await b.context().close()
  })
})
