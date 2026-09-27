import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { openApp, RELAYS, trackErrors } from './helpers'
import { makeFixturePdf } from './pdf-fixture'

// Spelling and grammar in every app: Tools ▸ Spelling and grammar… (F7) finds a
// misspelled word, shows where it is and corrects it; fields are underlined as
// they are typed. Documents are in English (the browser's language).

const b64 = (n: number) => randomBytes(n).toString('base64url')
const dialog = (page: Page) => page.locator('dialog.spell-dialog')

// Opens the dialog with F7, expects `word` flagged at `where`, and changes it to `fix`.
async function correct(page: Page, word: string, fix: string, where: RegExp | string): Promise<void> {
  await page.keyboard.press('F7')
  const d = dialog(page)
  await expect(d).toBeVisible()
  await expect(d.locator('.spell-context mark')).toHaveText(word)
  await expect(d.locator('.spell-where')).toContainText(where)
  // The fix among the suggestions (the first one is preselected).
  await expect(d.locator('select[size] option', { hasText: fix }).first()).toBeAttached()
  await d.locator('select[size]').selectOption(fix)
  await expect(d.locator('.spell-row input.field')).toHaveValue(fix)
  await d.getByRole('button', { name: 'Change', exact: true }).click()
  await expect(d.locator('.spell-status')).toHaveText(/The check is complete|No spelling or grammar issues found/)
  await d.getByRole('button', { name: 'Close' }).click()
  await expect(d).toHaveCount(0)
}

async function menu(page: Page, top: string, item: string): Promise<void> {
  await page.locator('.menubar-item', { hasText: new RegExp(`^${top}$`) }).dispatchEvent('mousedown')
  await page.locator('body > .menu-panel > .menu-row', { has: page.locator('.menu-label', { hasText: new RegExp(`^${item}$`) }) }).click()
}

test('sheet: the cell editor underlines as you type and the dialog corrects a cell', async ({ page }) => {
  const errors = trackErrors(page)
  await openApp(page, 'sheet')
  await page.locator('.persist-notice button').first().click({ timeout: 3000 }).catch(() => {})
  // A1 is active: type into its editor (Univer draws it on a canvas; ours is an overlay).
  const canvas = page.locator('.app-sheet canvas').first()
  const box = (await canvas.boundingBox())!
  await page.mouse.click(box.x + 90, box.y + 60)
  await page.keyboard.type('The wrold')
  await expect(page.locator('.wo-sheet-spell .wo-spell-line').first()).toBeAttached()
  await page.keyboard.press('Enter')
  await expect(page.locator('.wo-sheet-spell .wo-spell-line')).toHaveCount(0)
  // Numbers and formulas are skipped.
  await page.keyboard.type('12345')
  await page.keyboard.press('Enter')
  await page.keyboard.type('=SUM(1;2)')
  await page.keyboard.press('Enter')
  await correct(page, 'wrold', 'world', /Sheet1 · [A-Z]+\d+/)
  // Checked again: nothing left.
  await page.keyboard.press('F7')
  await expect(dialog(page).locator('.spell-status')).toHaveText('No spelling or grammar issues found.')
  expect(errors).toEqual([])
})

test('slides: speaker notes are underlined and corrected from the dialog', async ({ page }) => {
  const errors = trackErrors(page)
  await openApp(page, 'slides')
  const notes = page.locator('.slides-notes-area')
  await notes.click()
  await page.keyboard.type('Explain the wrold map ')
  await expect(notes).toHaveAttribute('data-spell-issues', '1')
  await expect(page.locator('.wo-spell-overlay .wo-spell-line').first()).toBeAttached()
  await correct(page, 'wrold', 'world', 'Slide 1 · Speaker notes')
  await expect(notes).toHaveValue('Explain the world map ')
  expect(errors).toEqual([])
})

test('diagram: the dialog walks through the labels of every page', async ({ page }) => {
  const errors = trackErrors(page)
  await openApp(page, 'diagram')
  await menu(page, 'Insert', 'Text')
  await page.keyboard.press('Escape')
  await page.keyboard.press('F2')
  await page.keyboard.type('Evaporatoin')
  await page.keyboard.press('Escape')
  await expect.poll(() => page.evaluate(() => document.querySelector('.diagram-canvas svg')?.textContent ?? '')).toContain('Evaporatoin')
  await page.locator('.diagram-canvas').click({ position: { x: 5, y: 5 } })
  await correct(page, 'Evaporatoin', 'Evaporation', /Page/)
  await expect.poll(() => page.evaluate(() => document.querySelector('.diagram-canvas svg')?.textContent ?? '')).toContain('Evaporation')
  expect(errors).toEqual([])
})

test('forms: questions are checked; respondents get spell check in surveys but not in quizzes', async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto(`/${RELAYS}#app=forms&doc=spell-${Date.now()}&key=${b64(18)}&edit=${b64(32)}`)
  await page.locator('.fm-editor').waitFor({ timeout: 60_000 })
  await page.locator('[data-f="meta:title"]').fill('Geography')
  await page.locator('.fm-add-question').click()
  await page.getByRole('menuitem', { name: 'Paragraph', exact: true }).click()
  const title = page.locator('.fm-question').last().locator('textarea.fm-q-input')
  await title.click()
  await page.keyboard.type('Describe the wrold ')
  await expect(title).toHaveAttribute('data-spell-issues', '1')
  await correct(page, 'wrold', 'world', /Question/)
  await expect(title).toHaveValue('Describe the world ')

  // Preview: a survey's long answers are checked…
  await page.locator('.fm-tab[data-tab="settings"]').click()
  await expect(page.locator('input[data-setting="respondentSpelling"]')).toBeChecked()
  await page.locator('.fm-tab[data-tab="preview"]').click()
  const answer = page.locator('.fm-preview textarea.field').first()
  await answer.click()
  await page.keyboard.type('It is a plannet ')
  await expect(answer).toHaveAttribute('data-spell-issues', '1')
  // …but not a quiz's, unless the teacher allows it.
  await page.getByRole('button', { name: 'Quiz mode' }).click()
  await page.locator('.fm-tab[data-tab="settings"]').click()
  await expect(page.locator('input[data-setting="respondentSpelling"]')).not.toBeChecked()
  await page.locator('.fm-tab[data-tab="preview"]').click()
  const quizAnswer = page.locator('.fm-preview textarea.field').first()
  await expect(quizAnswer).toHaveAttribute('spellcheck', 'false')
  await quizAnswer.click()
  await page.keyboard.type('It is a plannet ')
  await page.waitForTimeout(800)
  await expect(quizAnswer).not.toHaveAttribute('data-spell-issues')
  expect(errors).toEqual([])
})

test('pdf: a text box is corrected from the dialog', async ({ page }) => {
  const errors = trackErrors(page)
  const path = join(tmpdir(), `spell-${Date.now()}.pdf`)
  writeFileSync(path, await makeFixturePdf(false))
  await page.goto(`/${RELAYS}`)
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.home-open').first().click()])
  await chooser.setFiles(path)
  await page.locator('.pdf-page canvas').first().waitFor({ timeout: 60_000 })
  await page.keyboard.press('t')
  const box = (await page.locator('.pdf-page').first().boundingBox())!
  await page.mouse.click(box.x + 100, box.y + 520)
  await page.keyboard.type('Check this anwser')
  await expect(page.locator('textarea.pdf-text-editor')).toHaveAttribute('data-spell-issues', '1')
  await page.keyboard.press('Control+Enter')
  await expect(page.locator('.pdf-overlay .pdf-annot-text')).toContainText('Check this anwser')
  await correct(page, 'anwser', 'answer', 'Page 1 · Text box')
  await expect(page.locator('.pdf-overlay .pdf-annot-text')).toContainText('Check this answer')
  expect(errors).toEqual([])
})

test('draw: the dialog corrects a text element', async ({ page }) => {
  const errors = trackErrors(page)
  await openApp(page, 'draw')
  await page.locator('.persist-notice button').first().click({ timeout: 3000 }).catch(() => {})
  const box = (await page.locator('.excalidraw').first().boundingBox())!
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
  await page.keyboard.type('Helo wrold')
  await expect(page.locator('textarea.excalidraw-wysiwyg')).toHaveAttribute('data-spell-issues', /[12]/)
  await page.keyboard.press('Escape')
  await page.keyboard.press('F7')
  const d = dialog(page)
  await expect(d.locator('.spell-context mark')).toHaveText('Helo')
  await d.getByRole('button', { name: 'Ignore', exact: true }).click()
  await expect(d.locator('.spell-context mark')).toHaveText('wrold')
  await d.locator('select[size]').selectOption('world')
  await d.getByRole('button', { name: 'Change', exact: true }).click()
  await expect(d.locator('.spell-status')).toHaveText('The check is complete.')
  await expect(d.locator('.spell-context')).toBeEmpty()
  expect(errors).toEqual([])
})
