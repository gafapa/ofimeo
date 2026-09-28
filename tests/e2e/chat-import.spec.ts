import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { isParsed, parseShareLink } from '../../src/core/import-link'
import { APP_READY, RELAY_PORT, RELAYS } from './helpers'

// ---------- Share links → export URLs (unit tests, no browser) ----------

const exportsOf = (link: string) => {
  const parsed = parseShareLink(link)
  if (!isParsed(parsed)) throw new Error(`not parsed: ${parsed.problem}`)
  return parsed
}

test('Google share links give the export URLs', () => {
  const doc = exportsOf('https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit?usp=sharing')
  expect(doc).toMatchObject({ provider: 'google', kind: 'document' })
  expect(doc.exports.map((e) => e.url)).toEqual([
    'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/export?format=docx',
    'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/export?format=odt',
    'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/export?format=pdf',
  ])
  const sheet = exportsOf('docs.google.com/spreadsheets/u/0/d/1SheetId_abcdefghij-XYZ/edit#gid=12345')
  expect(sheet.kind).toBe('spreadsheet')
  expect(sheet.exports[0].url).toBe('https://docs.google.com/spreadsheets/d/1SheetId_abcdefghij-XYZ/export?format=xlsx')
  expect(sheet.exports.find((e) => e.format === 'csv')?.url).toBe('https://docs.google.com/spreadsheets/d/1SheetId_abcdefghij-XYZ/export?format=csv&gid=12345')
  const slides = exportsOf('https://docs.google.com/presentation/d/1SlidesIdabcdefghijk/edit#slide=id.p')
  expect(slides.kind).toBe('presentation')
  expect(slides.exports[0].url).toBe('https://docs.google.com/presentation/d/1SlidesIdabcdefghijk/export/pptx')
  expect(exportsOf('https://drive.google.com/file/d/1FileIdabcdefghijk/view?usp=drive_link').exports[0].url).toBe(
    'https://drive.google.com/uc?export=download&id=1FileIdabcdefghijk',
  )
  expect(exportsOf('https://drive.google.com/open?id=1FileIdabcdefghijk').exports[0].url).toBe('https://drive.google.com/uc?export=download&id=1FileIdabcdefghijk')
  expect(exportsOf('https://docs.google.com/spreadsheets/d/e/2PACX-1vPublishedId/pubhtml').exports[0].url).toBe(
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vPublishedId/pub?output=xlsx',
  )
})

test('Microsoft share links give the download URLs', () => {
  const word = exportsOf('https://contoso-my.sharepoint.com/:w:/g/personal/ana_contoso_edu/EaBcDeFgHiJ?e=AbC123')
  expect(word).toMatchObject({ provider: 'microsoft', kind: 'document' })
  expect(word.exports[0]).toEqual({ format: 'docx', url: 'https://contoso-my.sharepoint.com/:w:/g/personal/ana_contoso_edu/EaBcDeFgHiJ?e=AbC123&download=1' })
  expect(exportsOf('https://contoso.sharepoint.com/:x:/s/Class/EXyZ?e=q1').exports[0]).toEqual({ format: 'xlsx', url: 'https://contoso.sharepoint.com/:x:/s/Class/EXyZ?e=q1&download=1' })
  expect(exportsOf('https://contoso.sharepoint.com/:p:/r/sites/Class/Deck.pptx?d=w123&csf=1').kind).toBe('presentation')
  const layouts = exportsOf('https://contoso.sharepoint.com/sites/Class/_layouts/15/Doc.aspx?sourcedoc={1A2B3C4D-0000-1111-2222-333344445555}&file=Unit%201.docx&action=default')
  expect(layouts.exports[0]).toEqual({ format: 'docx', url: 'https://contoso.sharepoint.com/sites/Class/_layouts/15/download.aspx?UniqueId=1A2B3C4D-0000-1111-2222-333344445555' })
  expect(exportsOf('https://contoso.sharepoint.com/sites/Class/Shared%20Documents/Marks.xlsx?web=1').exports[0].url).toBe(
    'https://contoso.sharepoint.com/sites/Class/Shared%20Documents/Marks.xlsx?download=1',
  )
  const short = exportsOf('https://1drv.ms/w/s!AkXyZ123abc?e=Qwerty')
  expect(short.kind).toBe('document')
  // base64url("https://1drv.ms/w/s!AkXyZ123abc?e=Qwerty")
  expect(short.exports[0].url).toBe(`https://api.onedrive.com/v1.0/shares/u!${Buffer.from('https://1drv.ms/w/s!AkXyZ123abc?e=Qwerty').toString('base64url')}/root/content`)
  const live = exportsOf('https://onedrive.live.com/redir?resid=ABCDEF123456!105&authkey=!AbCdEf&ithint=file%2cxlsx')
  expect(live.exports[0].url).toBe('https://onedrive.live.com/download?resid=ABCDEF123456!105&authkey=!AbCdEf')
})

test('links that cannot be imported explain why', () => {
  const problem = (link: string) => {
    const parsed = parseShareLink(link)
    return isParsed(parsed) ? 'parsed' : parsed.problem
  }
  expect(problem('')).toBe('empty')
  expect(problem('hello world')).toBe('not-a-link')
  expect(problem('https://example.com/file.docx')).toBe('unsupported')
  expect(problem('https://docs.google.com/drawings/d/1DrawingIdabcdefghij/edit')).toBe('drawing')
  expect(problem('https://docs.google.com/forms/d/1FormIdabcdefghijklm/edit')).toBe('form')
  expect(problem('https://docs.google.com/document/d/e/2PACX-1vPublished/pub')).toBe('published')
  expect(problem('https://drive.google.com/drive/folders/1FolderIdabcdefghij')).toBe('folder')
  expect(problem('https://1drv.ms/f/s!FolderLink')).toBe('folder')
})

// ---------- Import dialog ----------

test('Import from link: guided download and drop zone', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'More', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Import from link…' }).click()
  const dialog = page.locator('dialog.dlg')
  await dialog.getByLabel('Share link').fill('https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit?usp=sharing')
  await expect(dialog.locator('.import-status')).toHaveText('Google · Document')
  const download = dialog.locator('a.import-download')
  await expect(download).toHaveText('Download as .docx from Google')
  await expect(download).toHaveAttribute('href', 'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/export?format=docx')
  await expect(download).toHaveAttribute('rel', /noopener/)
  // Step 2: the downloaded file opens in the right app.
  await dialog.locator('.import-drop input[type=file]').setInputFiles('tests/fixtures/notes.html')
  await expect(page.locator('.ProseMirror')).toContainText('Primer párrafo de prueba', { timeout: 60_000 })
  // The same dialog is in File ▸ Open… of the apps.
  await page.getByRole('menuitem', { name: 'File' }).click()
  await page.getByRole('menuitem', { name: 'Import from link…' }).click()
  await dialog.getByLabel('Share link').fill('https://drive.google.com/drive/folders/1FolderIdabcdefghij')
  await expect(dialog.locator('.import-status')).toContainText('link to a folder')
})

test('Import from link through the school relay import proxy', async ({ page, context }) => {
  const requested: string[] = []
  await context.route('https://relay.test/ofimeo/config', (route) =>
    route.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      contentType: 'application/json',
      body: JSON.stringify({ name: 'Test relay', version: '1.0.0', relays: [`ws://127.0.0.1:${RELAY_PORT}`], iceServers: [], ttl: 3600, expires: Math.floor(Date.now() / 1000) + 3600, importProxy: '/ofimeo/fetch' }),
    }),
  )
  await context.route(/^https:\/\/relay\.test\/ofimeo\/fetch/, (route) => {
    requested.push(new URL(route.request().url()).searchParams.get('url') ?? '')
    return route.fulfill({
      headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'X-Ofimeo-Filename, X-Ofimeo-Content-Type', 'x-ofimeo-filename': 'Apuntes%20tema%201.html', 'x-ofimeo-content-type': 'text/html' },
      contentType: 'application/octet-stream',
      body: readFileSync('tests/fixtures/notes.html'),
    })
  })
  await page.goto('/?relay=https://relay.test')
  await page.getByRole('button', { name: 'More', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Import from link…' }).click()
  const dialog = page.locator('dialog.dlg')
  await dialog.getByLabel('Share link').fill('https://drive.google.com/file/d/1FileIdabcdefghijk/view')
  await dialog.getByRole('button', { name: 'Import directly through the school relay' }).click()
  await expect(page.locator('.ProseMirror')).toContainText('Primer párrafo de prueba', { timeout: 60_000 })
  expect(requested).toEqual(['https://drive.google.com/uc?export=download&id=1FileIdabcdefghijk'])
})

// ---------- Chat ----------

async function setName(page: Page, name: string): Promise<void> {
  await page.evaluate((value) => {
    const input = document.getElementById('user-name') as HTMLInputElement
    input.value = value
    input.dispatchEvent(new Event('change'))
  }, name)
}

async function viewLink(page: Page): Promise<string> {
  await page.locator('#btn-share').click()
  const dialog = page.locator('dialog.dlg')
  await dialog.getByRole('tab', { name: 'Can view' }).click()
  const url = await dialog.locator('input.field').inputValue()
  await dialog.getByRole('button', { name: 'Done' }).click()
  return url
}

test('chat between two browsers: messages, mentions, unread badge and view links', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage()
  const b = await (await browser.newContext()).newPage()
  const c = await (await browser.newContext()).newPage()
  // A new document with permission keys (edit, comment and view links).
  await a.goto(`/${RELAYS}#new=writer`)
  await a.locator(APP_READY.writer).waitFor()
  await expect(a).toHaveURL(/doc=/)
  await setName(a, 'Ana')
  await b.goto(a.url())
  await b.locator(APP_READY.writer).waitFor()
  await setName(b, 'Bruno')
  await expect(b.locator('#presence .avatar')).toHaveCount(2, { timeout: 60_000 })

  // Bruno writes, mentioning Ana (picked from the suggestions) and a link.
  await b.getByRole('button', { name: 'Chat', exact: true }).click()
  const input = b.getByRole('combobox', { name: 'Message' })
  await expect(input).toBeFocused()
  await input.pressSequentially('Hola @An')
  await expect(b.getByRole('listbox', { name: 'People to mention' }).getByRole('option', { name: 'Ana', exact: true })).toBeVisible()
  await input.press('Enter')
  await input.pressSequentially('mira https://example.org/tema')
  await input.press('Enter')
  await expect(b.locator('.chat-msg.own')).toContainText('Hola @Ana mira https://example.org/tema')

  // Ana: unread badge (mention colour) and a notice.
  const toggle = a.locator('.chat-toggle')
  await expect(toggle.locator('.chat-badge')).toHaveText('1', { timeout: 60_000 })
  await expect(toggle.locator('.chat-badge')).toHaveClass(/mention/)
  await expect(toggle).toHaveAttribute('aria-label', 'Chat (1 unread message)')
  await toggle.click()
  const message = a.locator('.chat-msg').first()
  await expect(message).toHaveClass(/mentioned/)
  await expect(message.locator('.chat-author')).toHaveText('Bruno')
  await expect(message.locator('.chat-mention.me')).toHaveText('@Ana')
  await expect(message.locator('a')).toHaveAttribute('href', 'https://example.org/tema')
  await expect(message.locator('a')).toHaveAttribute('rel', /noopener/)
  await expect(toggle.locator('.chat-badge')).toBeHidden()
  await a.getByRole('combobox', { name: 'Message' }).fill('Vale 👍')
  await a.getByRole('combobox', { name: 'Message' }).press('Enter')
  await expect(b.locator('.chat-msg')).toHaveCount(2, { timeout: 60_000 })
  // Escape closes the panel and gives the focus back to the button.
  await a.keyboard.press('Escape')
  await expect(a.locator('#chat-panel')).toBeHidden()
  await expect(toggle).toBeFocused()

  // A view link reads the chat but cannot write.
  await c.goto(await viewLink(a))
  await c.locator(APP_READY.writer).waitFor()
  await expect(c.locator('.chat-toggle .chat-badge')).toHaveText('2', { timeout: 60_000 })
  await c.locator('.chat-toggle').click()
  await expect(c.locator('.chat-msg')).toHaveCount(2)
  await expect(c.locator('.chat-form')).toBeHidden()
  await expect(c.locator('.chat-note')).toHaveText('You can read the chat. To write, you need a comment or edit link.')
  await expect(c.locator('.chat-head [aria-label="Chat settings"]')).toBeHidden()

  // Ana (edit access) turns the chat off: the view link loses the button, Bruno cannot write.
  await toggle.click()
  await a.getByRole('button', { name: 'Chat settings' }).click()
  await a.getByRole('menuitem', { name: 'Turn off chat for this document' }).click()
  await expect(a.locator('.chat-note')).toContainText('turned off')
  await expect(c.locator('.chat-toggle')).toBeHidden({ timeout: 60_000 })
  await expect(b.locator('.chat-form')).toBeHidden({ timeout: 60_000 })
  await expect(b.locator('.chat-msg')).toHaveCount(0)
  // On again, then clear the history for everyone.
  await a.getByRole('button', { name: 'Chat settings' }).click()
  await a.getByRole('menuitem', { name: 'Turn on chat for this document' }).click()
  await expect(b.locator('.chat-msg')).toHaveCount(2, { timeout: 60_000 })
  await a.getByRole('button', { name: 'Chat settings' }).click()
  await a.getByRole('menuitem', { name: 'Clear chat history…' }).click()
  await a.locator('dialog.dlg').getByRole('button', { name: 'Clear' }).click()
  await expect(b.locator('.chat-msg')).toHaveCount(0, { timeout: 60_000 })
  await expect(b.locator('.chat-empty')).toBeVisible()
})
