import { expect, test } from '@playwright/test'
import { openApp, RELAYS, trackErrors } from './helpers'
import { call, ENABLED, ENGLISH, toolNames } from './webmcp-helpers'

// Tools every app offers: selection, show, undo/redo, revert, questions,
// notices, confirmations and the activity log.

test('common tools: selection, show, questions, notices, undo with confirmation, revert and activity', async ({ page }) => {
  const errors = trackErrors(page)
  await page.addInitScript(ENGLISH)
  await page.addInitScript(ENABLED)
  await openApp(page, 'writer')
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('Alpha beta gamma.')
  await expect.poll(() => toolNames(page)).toContain('get_selection')

  // Selection and show.
  await page.keyboard.press('Shift+Home')
  expect((await call(page, 'get_selection')).data).toMatchObject({ kind: 'text', text: 'Alpha beta gamma.' })
  expect((await call(page, 'show', { match: 'beta' })).data).toMatchObject({ shown: true })
  expect((await call(page, 'get_selection')).data).toMatchObject({ kind: 'text', text: 'beta' })

  // A question with choices: the user picks one; without choices they type.
  const asked = call(page, 'ask_user', { question: 'Formal or informal tone?', choices: ['Formal', 'Informal'] })
  const dialog = page.locator('dialog[open]')
  await expect(dialog).toContainText('Formal or informal tone?')
  await dialog.getByRole('button', { name: 'Informal' }).click()
  expect((await asked).data).toEqual({ answer: 'Informal' })
  const typed = call(page, 'ask_user', { question: 'Who is the audience?' })
  await dialog.locator('textarea').fill('Year 9')
  await dialog.getByRole('button', { name: 'Answer' }).click()
  expect((await typed).data).toEqual({ answer: 'Year 9' })
  const cancelled = call(page, 'ask_user', { question: 'Anything else?' })
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  expect((await cancelled).data).toEqual({ cancelled: true })

  expect((await call(page, 'notify', { message: 'Done reviewing' })).error).toBe(false)
  await expect(page.locator('#toast')).toContainText('AI assistant: Done reviewing')

  // Undo takes back the assistant's own change without asking.
  expect((await call(page, 'insert_text', { text: 'From the assistant.' })).error).toBe(false)
  await expect(editor.locator('ins[data-suggestion]')).toHaveCount(1)
  expect((await call(page, 'undo')).data).toEqual({ undone: true })
  await expect(editor.locator('ins[data-suggestion]')).toHaveCount(0)
  expect((await call(page, 'redo')).data).toEqual({ redone: true })
  await expect(editor.locator('ins[data-suggestion]')).toHaveCount(1)

  // After the user typed, undo asks first; declining is reported to the assistant.
  await page.waitForTimeout(2200)
  await editor.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' Mine.')
  const undo = call(page, 'undo')
  await expect(dialog).toContainText('it was not made by the AI assistant')
  await dialog.getByRole('button', { name: 'Do not allow' }).click()
  const declined = await undo
  expect(declined.error).toBe(true)
  expect(String(declined.data)).toContain('did not allow')
  await expect(editor).toContainText('Mine.')

  // Reverting everything the assistant did is confirmed by the user.
  const revert = call(page, 'revert_ai_changes')
  await expect(dialog).toContainText('Undo every change the AI assistant made')
  await dialog.getByRole('button', { name: 'Allow', exact: true }).click()
  expect((await revert).data).toEqual({ reverted: true })
  await expect(editor.locator('ins[data-suggestion]')).toHaveCount(0)
  await expect(editor).toHaveText('Alpha beta gamma.')

  // The indicator lists the calls, declined ones included.
  await page.locator('.webmcp-indicator').click()
  const status = page.locator('dialog[open]')
  await expect(status.locator('.webmcp-activity')).toContainText('revert_ai_changes')
  await expect(status.locator('.webmcp-activity')).toContainText('not allowed')
  await expect(status.locator('.webmcp-activity')).toContainText('insert_text')
  await status.getByRole('button', { name: 'Close' }).click()
  expect(errors).toEqual([])
})

test('the indicator undoes all AI changes; the sheet reports and shows its selection', async ({ page }) => {
  const errors = trackErrors(page)
  await page.addInitScript(ENGLISH)
  await page.addInitScript(ENABLED)
  await openApp(page, 'sheet')
  await expect.poll(() => toolNames(page)).toContain('write_range')
  expect((await call(page, 'write_range', { range: 'A1', values: [['x', 1], ['y', 2]] })).error).toBe(false)
  expect((await call(page, 'show', { range: 'B1:B2' })).data).toMatchObject({ shown: true, range: 'B1:B2' })
  await expect
    .poll(async () => (await call(page, 'get_selection')).data)
    .toMatchObject({ kind: 'cells', range: 'B1:B2', values: [[1], [2]] })

  await page.locator('.webmcp-indicator').click()
  await page.locator('dialog[open]').getByRole('button', { name: 'Undo all AI changes…' }).click()
  await page.locator('dialog[open]').getByRole('button', { name: 'Undo all', exact: true }).click()
  await expect(page.locator('#toast')).toContainText('changes were undone')
  await expect
    .poll(async () => ((await call(page, 'read_range', { range: 'A1:B2' })).data as { display: string[][] }).display)
    .toEqual([['', ''], ['', '']])
  expect(errors).toEqual([])
})

test('presentations offer remote control tools only while presenting', async ({ page }) => {
  const errors = trackErrors(page)
  await page.addInitScript(ENGLISH)
  await page.addInitScript(ENABLED)
  await openApp(page, 'slides')
  await expect.poll(() => toolNames(page)).toContain('add_slide')
  expect(await toolNames(page)).not.toContain('next_slide')
  expect((await call(page, 'add_slide', { title: 'Second', notes: 'Say hello' })).error).toBe(false)
  expect((await call(page, 'show', { slide: 1 })).data).toMatchObject({ shown: true, slide: 1 })

  await page.keyboard.press('F5')
  await expect(page.locator('.slides-present')).toBeVisible()
  await expect.poll(() => toolNames(page)).toContain('next_slide')
  expect((await call(page, 'next_slide')).data).toMatchObject({ slide: 2, of: 2, notes: 'Say hello' })
  expect((await call(page, 'get_speaker_notes')).data).toMatchObject({ slide: 2 })
  expect((await call(page, 'go_to_slide', { slide: 1 })).data).toMatchObject({ slide: 1 })
  await page.keyboard.press('Escape')
  await expect(page.locator('.slides-present')).toHaveCount(0)
  await expect.poll(() => toolNames(page)).not.toContain('next_slide')
  expect(errors).toEqual([])
})

const setup = async (page: import('@playwright/test').Page, app: string, tool: string) => {
  await page.addInitScript(ENGLISH)
  await page.addInitScript(ENABLED)
  // Forms and notebooks are created with their keys (#new=…).
  const created: Record<string, string> = { forms: '.fm-tab.active', notebook: '.nb-content .ProseMirror' }
  if (created[app]) {
    await page.goto(`/${RELAYS}#new=${app}`)
    await page.locator(created[app]).waitFor({ timeout: 60_000 })
  } else await openApp(page, app)
  await expect.poll(() => toolNames(page)).toContain(tool)
}

test('diagram: selection and show', async ({ page }) => {
  const errors = trackErrors(page)
  await setup(page, 'diagram', 'add_shape')
  const shape = (await call(page, 'add_shape', { label: 'Start' })).data as { id: string }
  expect((await call(page, 'show', { id: shape.id })).data).toMatchObject({ shown: true, id: shape.id })
  expect((await call(page, 'get_selection')).data).toMatchObject({ kind: 'shapes', cells: [{ id: shape.id, label: 'Start' }] })
  expect(errors).toEqual([])
})

test('drawing: selection and show', async ({ page }) => {
  const errors = trackErrors(page)
  await setup(page, 'draw', 'add_element')
  const box = (await call(page, 'add_element', { type: 'rectangle', text: 'Box' })).data as { id: string }
  expect((await call(page, 'show', { id: box.id })).data).toMatchObject({ shown: true })
  expect((await call(page, 'get_selection')).data).toMatchObject({ kind: 'elements', elements: [{ id: box.id, label: 'Box' }] })
  expect(errors).toEqual([])
})

test('notebook: selection and show', async ({ page }) => {
  const errors = trackErrors(page)
  await setup(page, 'notebook', 'add_page')
  const added = (await call(page, 'add_page', { title: 'Plants', section: 'Biology' })).data as { id: string }
  expect((await call(page, 'show', { page: 'Plants' })).data).toMatchObject({ shown: true, page: added.id })
  expect((await call(page, 'get_selection')).data).toMatchObject({ kind: 'page', page: added.id, title: 'Plants' })
  expect(errors).toEqual([])
})

test('forms: selection and show', async ({ page }) => {
  const errors = trackErrors(page)
  await setup(page, 'forms', 'add_question')
  const question = (await call(page, 'add_question', { type: 'short', title: 'Your name' })).data as { id: string }
  expect((await call(page, 'show', { id: question.id })).data).toMatchObject({ shown: true })
  await expect.poll(async () => (await call(page, 'get_selection')).data).toMatchObject({ kind: 'item', item: { id: question.id, title: 'Your name' } })
  expect(errors).toEqual([])
})
