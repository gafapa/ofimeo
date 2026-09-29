// Fixes from the Writer and PDF review: read-only toolbar overflow, comments
// and the caret, Unicode text in exported PDFs, password-protected PDFs, the
// PDF page map (rotate, delete, reorder) and Markdown import.

import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { APP_READY, RELAYS, trackErrors, uniqueDoc } from './helpers'
import { makeFixturePdf } from './pdf-fixture'

const ENGLISH = () => localStorage.setItem('ofimeo:language', 'en')
const b64 = (n: number) => randomBytes(n).toString('base64url')
const fixturePath = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url))

async function menu(page: Page, ...path: string[]) {
  await page.locator('#menubar').getByText(path[0], { exact: true }).click()
  for (let i = 1; i < path.length - 1; i++) await page.locator('.menu-row', { hasText: path[i] }).last().hover()
  await page.locator('.menu-row', { hasText: path[path.length - 1] }).last().click()
}

async function openFromHome(page: Page, path: string): Promise<void> {
  await page.goto(`/${RELAYS}`)
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.home-open').first().click()])
  await chooser.setFiles(path)
}

async function pdfFixture(name: string): Promise<string> {
  const path = join(tmpdir(), `${name}-${Date.now()}.pdf`)
  writeFileSync(path, await makeFixturePdf(false))
  return path
}

// Text of every page of a PDF (pdf.js in Node).
async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({
    data: bytes,
    useSystemFonts: false,
    standardFontDataUrl: fileURLToPath(new URL('../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url)).replaceAll('\\', '/'),
  }).promise
  let out = ''
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    out += content.items.map((it) => ('str' in it ? it.str : '')).join('') + '\n'
    // Text of annotations (editable export): their contents.
    for (const a of await page.getAnnotations()) if (a.contentsObj?.str) out += `${a.contentsObj.str}\n`
  }
  await doc.loadingTask.destroy()
  return out
}

async function download(page: Page, label: string): Promise<Uint8Array> {
  await page.locator('#menubar').getByText('File', { exact: true }).click()
  await page.locator('.menu-row', { hasText: 'Download as' }).last().hover()
  const [file] = await Promise.all([page.waitForEvent('download'), page.locator('.menu-row', { hasText: label }).last().click()])
  return new Uint8Array(readFileSync((await file.path())!))
}

test('a writer view link cannot edit through the toolbar overflow or Ctrl+H', async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage()
  await owner.addInitScript(ENGLISH)
  await owner.goto(`/${RELAYS}#app=writer&doc=${uniqueDoc('ro-overflow')}&key=${b64(18)}&edit=${b64(32)}`)
  await owner.locator(APP_READY.writer).waitFor({ timeout: 60_000 })
  await owner.locator('.ProseMirror').click()
  await owner.keyboard.type('Owner text paragraph one.')
  await owner.locator('#btn-share').click()
  await owner.locator('dialog[open] .share-tab[data-value=view]').click()
  const link = await owner.locator('dialog[open] input.field.mono').inputValue()
  await owner.keyboard.press('Escape')

  const viewer = await (await browser.newContext({ viewport: { width: 700, height: 800 } })).newPage()
  const errors = trackErrors(viewer)
  await viewer.addInitScript(ENGLISH)
  await viewer.goto(link)
  await expect(viewer.locator('.ProseMirror')).toHaveText('Owner text paragraph one.', { timeout: 60_000 })
  const before = await viewer.locator('.ProseMirror').innerHTML()
  await viewer.locator('.ProseMirror p').first().click({ clickCount: 3 })
  await viewer.locator('.tb-more').click()
  const panel = viewer.locator('.tb-overflow')
  await expect(panel).toBeVisible()
  for (const name of ['Insert table', 'Insert link', 'Insert image', 'Checklist', 'Increase indent', 'Line spacing']) {
    await expect(panel.getByRole('button', { name, exact: true })).toBeDisabled()
  }
  // Even a forced click does nothing.
  await panel.getByRole('button', { name: 'Checklist', exact: true }).click({ force: true })
  await panel.getByRole('button', { name: 'Insert link', exact: true }).click({ force: true })
  await expect(viewer.locator('dialog[open]')).toHaveCount(0)
  // Ctrl+H only finds.
  await viewer.keyboard.press('Escape')
  await viewer.locator('.ProseMirror').click()
  await viewer.keyboard.press('Control+h')
  await expect(viewer.locator('.find-panel, #find-panel').first()).toBeVisible()
  await expect(viewer.locator('[data-replace-all]')).toBeHidden()
  expect(await viewer.locator('.ProseMirror').innerHTML()).toBe(before)
  expect(errors).toEqual([])
})

test('after posting a comment the next click moves the caret and typing keeps the commented text', async ({ page }) => {
  await page.addInitScript(ENGLISH)
  await page.goto(`/${RELAYS}#app=writer&doc=${uniqueDoc('comment-click')}`)
  await page.locator('.ProseMirror').waitFor({ timeout: 60_000 })
  await page.locator('.ProseMirror').click()
  await page.keyboard.type('Primera frase del alumno.')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Segunda frase.')
  await page.keyboard.press('Control+Home')
  await page.keyboard.press('Shift+Control+ArrowRight')
  await page.keyboard.press('Control+Alt+m')
  await page.locator('.rv-draft textarea').fill('Buen comienzo')
  await page.locator('.rv-draft button.primary').click()
  await expect(page.locator('.rv-card')).toContainText('Buen comienzo')
  await page.locator('.ProseMirror p').nth(1).click({ position: { x: 5, y: 8 } })
  await page.keyboard.type('XX')
  const paragraphs = await page.locator('.ProseMirror p').allTextContents()
  expect(paragraphs[0]).toBe('Primera frase del alumno.')
  expect(paragraphs[1]).toContain('XX')
  expect(paragraphs).toHaveLength(2)
})

test('PDF export keeps symbols such as π √ ✓ in text boxes', async ({ page }) => {
  await page.addInitScript(ENGLISH)
  const errors = trackErrors(page)
  await openFromHome(page, await pdfFixture('unicode'))
  await page.locator('.pdf-page canvas').first().waitFor({ timeout: 60_000 })
  await page.keyboard.press('t')
  const box = (await page.locator('.pdf-page').first().boundingBox())!
  await page.mouse.click(box.x + 100, box.y + 400)
  await page.keyboard.type('Mal: π ≈ 3,14 √2 ✓ → Ł')
  await page.keyboard.press('Control+Enter')
  await expect(page.locator('.pdf-overlay .pdf-annot-text')).toContainText('π ≈ 3,14')
  for (const label of ['PDF with annotations merged (flattened)', 'PDF with annotations (editable)']) {
    const text = await pdfText(await download(page, label))
    for (const s of ['π', '≈', '√2', '✓', '→', 'Ł']) expect(text, label).toContain(s)
    expect(text).not.toContain('?')
  }
  expect(errors).toEqual([])
})

test('a password-protected PDF asks for its password and is not added when cancelled', async ({ page }) => {
  await page.addInitScript(ENGLISH)
  const errors = trackErrors(page)
  await openFromHome(page, fixturePath('protected.pdf'))
  const dialog = page.locator('dialog[open]')
  await expect(dialog).toContainText('Password required')
  await dialog.locator('input[type=password]').fill('wrong')
  await dialog.getByRole('button', { name: 'Open' }).click()
  await expect(page.locator('dialog[open]')).toContainText('The password is not correct')
  await page.locator('dialog[open]').getByRole('button', { name: 'Cancel' }).click()
  await page.waitForTimeout(500)
  // Still on the home screen, and nothing was added to the library.
  expect(page.url()).not.toContain('app=pdf')
  await expect(page.locator('.doc-row-title', { hasText: 'protected' })).toHaveCount(0)

  // With the right password the document opens.
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.home-open').first().click()])
  await chooser.setFiles(fixturePath('protected.pdf'))
  await page.locator('dialog[open] input[type=password]').fill('abc')
  await page.keyboard.press('Enter')
  await page.locator('.pdf-page canvas').first().waitFor({ timeout: 60_000 })
  await expect(page.locator('.textLayer')).toContainText('Protected exam')
  expect(errors).toEqual([])
})

test('PDF pages are rotated, reordered and deleted, and the export follows', async ({ page }) => {
  await page.addInitScript(ENGLISH)
  const errors = trackErrors(page)
  await openFromHome(page, await pdfFixture('pages'))
  await page.locator('.pdf-page canvas').first().waitFor({ timeout: 60_000 })
  await expect(page.locator('.pdf-thumb')).toHaveCount(2)
  // A pen stroke on page 1, then rotate page 1 to the right: the page turns landscape.
  await page.keyboard.press('p')
  const box = (await page.locator('.pdf-page').first().boundingBox())!
  await page.mouse.move(box.x + 100, box.y + 100)
  await page.mouse.down()
  await page.mouse.move(box.x + 200, box.y + 120, { steps: 5 })
  await page.mouse.up()
  await expect(page.locator('.pdf-overlay .pdf-annot-ink')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  await menu(page, 'Page', 'Rotate right')
  await expect.poll(async () => {
    const b = (await page.locator('.pdf-page').first().boundingBox())!
    return b.width > b.height
  }).toBe(true)
  // Undo brings the portrait page back; redo turns it again.
  await page.keyboard.press('Control+z')
  await expect.poll(async () => {
    const b = (await page.locator('.pdf-page').first().boundingBox())!
    return b.width < b.height
  }).toBe(true)
  await page.keyboard.press('Control+y')
  // Move page 2 up (thumbnail context menu), then delete the (now second) first page.
  await page.locator('.pdf-thumb').nth(1).click({ button: 'right' })
  await page.locator('.menu-row', { hasText: 'Move page up' }).last().click()
  await expect(page.locator('.pdf-thumb').first()).toHaveAttribute('aria-label', 'Page 1')
  await page.locator('.pdf-thumb').nth(1).click({ button: 'right' })
  await page.locator('.menu-row', { hasText: 'Delete page…' }).last().click()
  await page.locator('dialog[open]').getByRole('button', { name: 'Delete' }).click()
  await expect(page.locator('.pdf-thumb')).toHaveCount(1)
  let bytes = await download(page, 'PDF with annotations (editable)')
  let doc = await PDFDocument.load(bytes)
  expect(doc.getPageCount()).toBe(1)
  expect(await pdfText(bytes)).toContain('Second page')
  // Undo the deletion: two pages again, the rotated first page and its stroke come back.
  await page.keyboard.press('Control+z')
  await expect(page.locator('.pdf-thumb')).toHaveCount(2)
  await expect(page.locator('.pdf-overlay .pdf-annot-ink')).toHaveCount(1)
  bytes = await download(page, 'PDF with annotations (editable)')
  doc = await PDFDocument.load(bytes)
  expect(doc.getPageCount()).toBe(2)
  // Both pages are landscape: "Second page" has its own /Rotate 90, the first page was turned in the app
  // (and keeps its pen stroke).
  expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([90, 90])
  expect(doc.getPages().reduce((n, p) => n + (p.node.Annots()?.size() ?? 0), 0)).toBe(1)
  expect(errors).toEqual([])
})

test('a Markdown file opens with headings, lists, emphasis, links, code and tables', async ({ page }) => {
  await page.addInitScript(ENGLISH)
  const path = join(tmpdir(), `apuntes-${Date.now()}.md`)
  writeFileSync(
    path,
    [
      '# Apuntes de clase',
      '',
      'Texto con **negrita**, *cursiva* y `código`. Un [enlace](https://example.org).',
      '',
      '## Lista',
      '',
      '- primer punto',
      '- segundo punto',
      '',
      '1. uno',
      '2. dos',
      '',
      '| Nombre | Nota |',
      '| --- | --- |',
      '| Ana | 9 |',
      '',
      '```',
      'let x = 1',
      '```',
      '',
    ].join('\n'),
  )
  await openFromHome(page, path)
  await page.locator('.ProseMirror').waitFor({ timeout: 60_000 })
  const pm = page.locator('.ProseMirror')
  await expect(pm.locator('h1')).toHaveText('Apuntes de clase')
  await expect(pm.locator('h2')).toHaveText('Lista')
  await expect(pm.locator('ul li')).toHaveCount(2)
  await expect(pm.locator('ol li')).toHaveCount(2)
  await expect(pm.locator('strong')).toHaveText('negrita')
  await expect(pm.locator('em')).toHaveText('cursiva')
  await expect(pm.locator('a[href="https://example.org"]')).toHaveText('enlace')
  await expect(pm.locator('table td, table th')).toHaveCount(4)
  await expect(pm.locator('pre')).toContainText('let x = 1')
  await expect(pm).not.toContainText('# Apuntes')
  // And back to Markdown.
  const md = new TextDecoder().decode(await download(page, 'Markdown (.md)'))
  expect(md).toContain('# Apuntes de clase')
  expect(md).toContain('**negrita**')
  expect(md).toContain('- primer punto')
  expect(md).toContain('| Ana | 9 |')
})
