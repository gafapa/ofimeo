// Moodle: connect, task list, hand in, relay forwarding and single sign-on
// (src/core/moodle.ts, src/ui/moodle.ts, relay/moodle.go), against the mock
// Moodle in tests/moodle-mock.mjs, started here.
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { connect } from 'node:net'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { APP_READY, RELAYS, uniqueDoc } from './helpers'

const MOCK_PORT = Number(process.env.MOODLE_MOCK_PORT || 7821)
const MOCK = `http://127.0.0.1:${MOCK_PORT}`
const RELAY_HTTPS = Number(process.env.MOODLE_RELAY_PORT || 7822)

let mock: ChildProcess | undefined

async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const end = Date.now() + timeoutMs
  while (
    !(await new Promise<boolean>((resolve) => {
      const socket = connect(port, '127.0.0.1', () => (socket.end(), resolve(true)))
      socket.on('error', () => resolve(false))
    }))
  ) {
    if (Date.now() > end) throw new Error(`port ${port} did not open`)
    await new Promise((r) => setTimeout(r, 200))
  }
}

async function waitFor(url: string, timeoutMs = 20_000): Promise<void> {
  const end = Date.now() + timeoutMs
  for (;;) {
    try {
      await fetch(url)
      return
    } catch {
      if (Date.now() > end) throw new Error(`${url} did not start`)
      await new Promise((r) => setTimeout(r, 200))
    }
  }
}

test.beforeAll(async () => {
  mock = spawn(process.execPath, ['tests/moodle-mock.mjs', String(MOCK_PORT)], { stdio: 'ignore' })
  await waitFor(`${MOCK}/__state`)
})

test.afterAll(() => {
  mock?.kill()
})

test.beforeEach(async () => {
  await fetch(`${MOCK}/__reset`, { method: 'POST' })
})

const state = async () => (await (await fetch(`${MOCK}/__state`)).json()) as {
  calls: { site: string; fn: string; params?: Record<string, string>; service?: string }[]
  uploads: { site: string; filename: string; size: number; head: string; itemid: number; filearea: string }[]
  submissions: Record<string, { status: string }>
}

async function connectMoodle(page: Page, site: string): Promise<void> {
  await page.locator('.md-home-button').click()
  const dialog = page.locator('dialog.dlg')
  await dialog.getByLabel('Moodle address').fill(site)
  await dialog.getByLabel('Username').fill('student')
  await dialog.getByLabel('Password').fill('Secret-1')
  await dialog.getByRole('button', { name: 'Connect', exact: true }).click()
}

test('connect, see the tasks, hand in a document as PDF, disconnect', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`/${RELAYS}`)
  await connectMoodle(page, `${MOCK}/cors/login/index.php`)
  const dialog = page.locator('dialog.dlg')
  await expect(dialog.locator('.md-who')).toContainText('Ana García')
  // Only the token and site information are kept, never the password.
  const saved = await page.evaluate(() => JSON.stringify({ ...localStorage }))
  expect(saved).toContain('tok-cors')
  expect(saved).not.toContain('Secret-1')
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('ofimeo:moodle') ?? '{}')).site).toBe(`${MOCK}/cors`)
  await dialog.getByRole('button', { name: 'Close' }).click()

  // Task list: pending ones first (by due date), then handed in / graded.
  const panel = page.locator('.home-moodle')
  await expect(panel.getByRole('heading', { name: 'Moodle tasks' })).toBeVisible()
  const pending = panel.locator('.md-group').first()
  await expect(pending.locator('.md-task-name')).toHaveText(['Old report', 'Lab notes', 'Essay: My town'])
  const done = panel.locator('.md-group').nth(1)
  await expect(done.locator('.md-task-name')).toHaveText(['Poem'])
  await expect(done.locator('.md-chip').first()).toHaveText('Graded: 8,00 / 10,00')
  await expect(panel.locator('.md-updated')).toContainText('Last updated')

  // Details: sanitized description, attachment link with the token, feedback.
  const essay = pending.locator('.md-task', { hasText: 'Essay: My town' })
  await essay.locator('summary').click()
  await expect(essay.locator('.md-intro')).toContainText('300 words')
  expect(await essay.locator('.md-intro script, .md-intro [onerror], .md-intro a[href^="javascript"]').count()).toBe(0)
  await expect(essay.locator('.md-files a')).toHaveAttribute('href', /pluginfile\.php\/5\/mod_assign\/introattachment\/0\/rubric\.pdf\?token=tok-cors/)
  await expect(essay.locator('.md-open-link')).toHaveAttribute('href', `${MOCK}/cors/mod/assign/view.php?id=101`)
  const poem = done.locator('.md-task')
  await poem.locator('summary').click()
  await expect(poem.locator('.md-feedback')).toContainText('Very good rhythm!')
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined()

  // Hand in a writer document as PDF.
  await page.goto(`/${RELAYS}#app=writer&doc=${uniqueDoc('moodle')}`)
  await page.locator(APP_READY.writer).waitFor()
  await page.locator('#doc-title').fill('My town')
  await page.locator('.ProseMirror').click()
  await page.keyboard.type('Vigo is a city by the sea.')
  await page.locator('#btn-handin').click()
  await page.locator('dialog.dlg').getByRole('button', { name: 'Hand in to Moodle…' }).click()
  const handin = page.locator('dialog.dlg', { has: page.locator('.md-handin') })
  // Only open assignments that take files.
  await expect(handin.locator('#md-task-select option')).toHaveText(['Essay: My town — Lengua 1º ESO'])
  await expect(handin.locator('#md-format-select')).toHaveValue(/\d+/)
  await expect(handin.locator('#md-format-select option:checked')).toHaveText('PDF document (.pdf)')
  await expect(handin.locator('.md-statement')).toContainText('This essay is my own work.')
  // The statement must be ticked.
  await handin.getByRole('button', { name: 'Hand in', exact: true }).click()
  await expect(handin.locator('.md-error')).toHaveText('Tick the submission statement first.')
  await handin.locator('#md-statement-check').check()
  await handin.getByRole('button', { name: 'Hand in', exact: true }).click()
  const ok = page.locator('dialog.dlg', { has: page.locator('.md-done') })
  await expect(ok).toContainText('Handed in to “Essay: My town”.', { timeout: 60_000 })

  const s = await state()
  expect(s.uploads).toHaveLength(1)
  expect(s.uploads[0]).toMatchObject({ site: 'cors', filename: 'My town.pdf', head: '%PDF-', filearea: 'draft' })
  const save = s.calls.find((c) => c.fn === 'mod_assign_save_submission')!
  expect(save.params).toMatchObject({ assignmentid: '11', 'plugindata[files_filemanager]': String(s.uploads[0].itemid) })
  const submit = s.calls.find((c) => c.fn === 'mod_assign_submit_for_grading')!
  expect(submit.params).toMatchObject({ assignmentid: '11', acceptsubmissionstatement: '1' })
  expect(s.submissions['11'].status).toBe('submitted')
  await ok.getByRole('button', { name: 'Done' }).click()

  // Disconnect clears the token and the list.
  await page.goto(`/${RELAYS}`)
  await page.locator('.md-home-button').click()
  await page.locator('dialog.dlg').getByRole('button', { name: 'Disconnect' }).click()
  await page.locator('dialog.dlg').last().getByRole('button', { name: 'Disconnect' }).click()
  await expect(page.locator('dialog.dlg').getByLabel('Username')).toBeVisible()
  const after = await page.evaluate(() => JSON.stringify({ ...localStorage }))
  expect(after).not.toContain('tok-cors')
  expect(errors).toEqual([])
})

test('single sign-on sites get a clear message', async ({ page }) => {
  await page.goto(`/${RELAYS}`)
  await page.locator('.md-home-button').click()
  const dialog = page.locator('dialog.dlg')
  await dialog.getByLabel('Moodle address').fill(`${MOCK}/sso`)
  await dialog.getByLabel('Username').focus()
  await expect(dialog.locator('.md-sso')).toBeVisible()
  await expect(dialog.locator('.md-sso')).toContainText('single sign-on')
  await dialog.getByLabel('Username').fill('student')
  await dialog.getByLabel('Password').fill('Secret-1')
  await dialog.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(dialog.locator('.md-error')).toContainText('Wrong username or password.')
  await expect(dialog.locator('.md-error')).toContainText('single sign-on')
})

test('a Moodle without CORS and no relay: a clear message', async ({ page }) => {
  await page.goto(`/${RELAYS}`)
  await connectMoodle(page, `${MOCK}/nocors`)
  await expect(page.locator('dialog.dlg .md-error')).toContainText('Could not reach Moodle from this browser')
  expect((await state()).calls.filter((c) => c.fn === 'token')).toHaveLength(1)
})

test('390px: task panel and hand-in dialog fit', async ({ page }) => {
  await page.goto(`/${RELAYS}`)
  await connectMoodle(page, `${MOCK}/cors`)
  await page.locator('dialog.dlg').getByRole('button', { name: 'Close' }).click()
  // Phones: no room for the header button (File → Moodle account… and Hand in offer it).
  await page.setViewportSize({ width: 390, height: 800 })
  await expect(page.locator('.md-home-button')).toBeHidden()
  const panel = page.locator('.home-moodle')
  await expect(panel.locator('.md-task-name').first()).toBeVisible()
  await panel.locator('.md-task', { hasText: 'Essay' }).locator('summary').click()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  if (process.env.MOODLE_SHOTS) await page.screenshot({ path: `${process.env.MOODLE_SHOTS}/home-390.png`, fullPage: true })
  await page.goto(`/${RELAYS}#app=writer&doc=${uniqueDoc('moodle390')}`)
  await page.locator(APP_READY.writer).waitFor()
  await page.evaluate(() => (document.querySelector('#btn-handin') as HTMLElement).click())
  await page.locator('dialog.dlg').getByRole('button', { name: 'Hand in to Moodle…' }).click()
  const handin = page.locator('dialog.dlg', { has: page.locator('.md-handin') })
  await expect(handin.locator('#md-task-select')).toBeVisible()
  const box = await handin.boundingBox()
  expect(box!.width).toBeLessThanOrEqual(390)
  if (process.env.MOODLE_SHOTS) await page.screenshot({ path: `${process.env.MOODLE_SHOTS}/handin-390.png` })
})

// Ofimeo Relay forwarding (relay/moodle.go): built and started here when Go is available.
test.describe('through Ofimeo Relay', () => {
  test.use({ ignoreHTTPSErrors: true })
  let relay: ChildProcess | undefined
  let dir = ''
  const RELAY = `https://127.0.0.1:${RELAY_HTTPS}`

  test.beforeAll(async () => {
    test.setTimeout(240_000)
    try {
      execFileSync('go', ['version'], { stdio: 'ignore' })
    } catch {
      return
    }
    dir = mkdtempSync(join(tmpdir(), 'ofimeo-relay-e2e-'))
    const bin = join(dir, 'ofimeo-relay')
    execFileSync('go', ['build', '-o', bin, '.'], { cwd: 'relay', stdio: 'ignore', timeout: 200_000 })
    relay = spawn(bin, ['run', '--data', join(dir, 'data'), '--host', '127.0.0.1', '--https-port', String(RELAY_HTTPS), '--http-port', '-1', '--turn-port', String(RELAY_HTTPS + 1), '--turn-tls-port', '-1', '--relay-ports', '50200-50210', '--moodle-url', `${MOCK}/nocors`], { stdio: 'ignore' })
    await waitForPort(RELAY_HTTPS, 30_000)
  })

  test.afterAll(() => {
    relay?.kill()
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  test('connects through the relay after asking, and refuses other sites', async ({ page, request }) => {
    test.skip(!relay, 'Go is not available')
    // Requests for another Moodle are refused by the relay.
    const refused = await request.post(`${RELAY}/ofimeo/moodle/login?site=${encodeURIComponent('https://evil.example')}`, { form: { username: 'a', password: 'b' } })
    expect(refused.status()).toBe(403)
    expect(await refused.json()).toMatchObject({ error: 'site' })
    const config = await (await request.get(`${RELAY}/ofimeo/config`)).json()
    expect(config.moodle).toMatchObject({ url: `${MOCK}/nocors`, path: '/ofimeo/moodle' })

    await page.goto(`/${RELAYS}&relay=${encodeURIComponent(RELAY)}`)
    await connectMoodle(page, `${MOCK}/nocors`)
    // A relay from a link (not set by the school) is used only after asking.
    const ask = page.locator('dialog.dlg', { hasText: 'Use this relay for Moodle?' })
    await expect(ask).toContainText(RELAY)
    await ask.getByRole('button', { name: 'Use this relay' }).click()
    const dialog = page.locator('dialog.dlg')
    await expect(dialog.locator('.md-who')).toContainText('Ana García', { timeout: 30_000 })
    await expect(dialog).toContainText('Connected through your school relay.')
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(page.locator('.home-moodle .md-task-name').first()).toBeVisible({ timeout: 30_000 })
    const s = await state()
    expect(s.calls.some((c) => c.site === 'nocors' && c.fn === 'token' && c.service === 'moodle_mobile_app')).toBe(true)
    expect(s.calls.some((c) => c.site === 'nocors' && c.fn === 'mod_assign_get_assignments')).toBe(true)
  })
})
