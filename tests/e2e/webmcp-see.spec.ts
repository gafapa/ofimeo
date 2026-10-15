import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { openApp, RELAYS, trackErrors } from './helpers'
import { makeFixturePdf } from './pdf-fixture'
import { call, ENABLED, ENGLISH, toolNames, type CallResult } from './webmcp-helpers'

// Seeing the document: pictures (render), versions and changes, the suite's
// own spelling and accessibility checks, and new documents made from content.

async function setup(page: Page, app: string, tool: string) {
  await page.addInitScript(ENGLISH)
  await page.addInitScript(ENABLED)
  const created: Record<string, string> = { forms: '.fm-tab.active', notebook: '.nb-content .ProseMirror' }
  if (created[app]) {
    await page.goto(`/${RELAYS}#new=${app}`)
    await page.locator(created[app]).waitFor({ timeout: 60_000 })
  } else await openApp(page, app)
  await expect.poll(() => toolNames(page)).toContain(tool)
}

// A PNG of reasonable size came back.
async function expectPicture(page: Page, result: CallResult) {
  expect(result.error, JSON.stringify(result.data)).toBe(false)
  const image = result.content.find((c) => c.type === 'image')
  expect(image?.mimeType).toBe('image/png')
  const size = await page.evaluate(async (data) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob())
    return [bitmap.width, bitmap.height]
  }, image!.data!)
  expect(size[0]).toBeGreaterThan(50)
  expect(size[1]).toBeGreaterThan(20)
  expect(Math.max(...size)).toBeLessThanOrEqual(2048)
}

test('writer: picture of a page, versions, changes since, spelling and accessibility', async ({ page }) => {
  const errors = trackErrors(page)
  await setup(page, 'writer', 'render')
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('The first line.')
  await expectPicture(page, await call(page, 'render', { page: 1 }))

  // The assistant's first change saves a version before it.
  const start = (await call(page, 'get_changes_since')).data as { token: string }
  expect((await call(page, 'insert_text', { text: '# Results\n\n### Details' })).error).toBe(false)
  const versions = (await call(page, 'list_versions')).data as { id: string; label: string }[]
  const before = versions.find((v) => v.label === 'Before changes by the AI assistant')!
  const diff = (await call(page, 'diff_versions', { from: before.id })).data as { added: number; changes: string[]; to: string }
  expect(diff.to).toBe('current')
  expect(diff.changes).toContain('+ # {++Results++}')
  await page.waitForTimeout(2200)
  await editor.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' Typed by me.')
  const since = (await call(page, 'get_changes_since', { token: start.token })).data as { changes: string[]; by: string[]; token: string }
  expect(since.changes.join('\n')).toContain('Typed by me.')
  expect(since.token).not.toBe(start.token)
  expect((await call(page, 'get_changes_since', { token: 'nope' })).error).toBe(true)

  // Spelling and grammar with the suite's checker.
  await page.keyboard.press('Enter')
  await page.keyboard.type('This sentense has a mistake.')
  await expect
    .poll(async () => ((await call(page, 'get_spelling_issues')).data as { issues: { text: string; replacements: string[] }[] }).issues.map((i) => i.text), { timeout: 60_000 })
    .toContain('sentense')

  // Accessibility: a skipped heading level (the headings are pending suggestions, still checked).
  const a11y = (await call(page, 'check_accessibility')).data as { issues: { problem: string }[] }
  expect(a11y.issues.map((i) => i.problem).join('\n')).toContain('a level is skipped')
  expect(errors).toEqual([])
})

test('sheet: picture of a range, cell changes between versions, formula errors, spelling and charts without a title', async ({ page }) => {
  const errors = trackErrors(page)
  await setup(page, 'sheet', 'render')
  expect((await call(page, 'write_range', { range: 'A1', values: [['Fruit', 'Kilos'], ['Apels', 3], ['Pears', '=1/0']] })).error).toBe(false)
  await expectPicture(page, await call(page, 'render', { range: 'A1:B3' }))
  const before = ((await call(page, 'list_versions')).data as { id: string; label: string }[]).find((v) => v.label === 'Before changes by the AI assistant')!
  const diff = (await call(page, 'diff_versions', { from: before.id })).data as { cells: string[] }
  expect(diff.cells).toEqual(expect.arrayContaining(['Sheet1!A2 = "Apels"', 'Sheet1!B3 = =1/0']))
  await expect.poll(async () => (await call(page, 'list_formula_errors')).data).toMatchObject({ count: 1, errors: [{ cell: 'B3', error: '#DIV/0!' }] })
  await expect
    .poll(async () => ((await call(page, 'get_spelling_issues')).data as { issues: { where: string; text: string }[] }).issues, { timeout: 60_000 })
    .toEqual(expect.arrayContaining([expect.objectContaining({ where: 'Sheet1!A2', text: 'Apels' })]))
  expect((await call(page, 'insert_chart', { range: 'A1:B2' })).error).toBe(false)
  expect((await call(page, 'check_accessibility')).data).toMatchObject({ count: 1 })
  expect(errors).toEqual([])
})

test('diagram, slides and drawing: pictures and changes', async ({ page }) => {
  const errors = trackErrors(page)
  await setup(page, 'diagram', 'render')
  const a = ((await call(page, 'add_shape', { label: 'Idea' })).data as { id: string }).id
  const b = ((await call(page, 'add_shape', { label: 'Plan' })).data as { id: string }).id
  await call(page, 'connect', { source_id: a, target_id: b })
  await expectPicture(page, await call(page, 'render'))
  const before = ((await call(page, 'list_versions')).data as { id: string; label: string }[]).find((v) => v.label === 'Before changes by the AI assistant')!
  expect(((await call(page, 'diff_versions', { from: before.id })).data as { changes: string[] }).changes).toEqual(
    expect.arrayContaining(['+ shape “Idea” (rectangle)', '+ connector Idea → Plan']),
  )
  expect(errors).toEqual([])
})

test('slides: picture of a slide and slides without a title', async ({ page }) => {
  const errors = trackErrors(page)
  await setup(page, 'slides', 'render')
  expect((await call(page, 'add_slide', { title: 'Hello', body: 'World' })).error).toBe(false)
  await expectPicture(page, await call(page, 'render', { slide: 2 }))
  const a11y = (await call(page, 'check_accessibility')).data as { issues: { where: string }[] }
  expect(a11y.issues.map((i) => i.where)).toContain('slide 1')
  expect(a11y.issues.map((i) => i.where)).not.toContain('slide 2')
  expect(errors).toEqual([])
})

test('drawing picture', async ({ page }) => {
  const errors = trackErrors(page)
  await setup(page, 'draw', 'render')
  await call(page, 'add_element', { type: 'rectangle', text: 'Box' })
  await expectPicture(page, await call(page, 'render'))
  expect(errors).toEqual([])
})

test('notebook and PDF pictures', async ({ page }) => {
  const errors = trackErrors(page)
  await setup(page, 'notebook', 'render')
  await call(page, 'add_page', { title: 'Cells', section: 'Biology', text: 'A cell is the unit of life.' })
  await expectPicture(page, await call(page, 'render', { page: 'Cells' }))

  const path = join(tmpdir(), `webmcp-see-${Date.now()}.pdf`)
  writeFileSync(path, await makeFixturePdf(false))
  await page.goto(`/${RELAYS}`)
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.home-open').first().click()])
  await chooser.setFiles(path)
  await page.locator('.pdf-page canvas').first().waitFor({ timeout: 60_000 })
  await expect.poll(() => toolNames(page)).toContain('render')
  await expectPicture(page, await call(page, 'render', { page: 1 }))
  expect(errors).toEqual([])
})

test('create_document: new documents of every kind open in a new tab with the given content', async ({ page, context }) => {
  const errors = trackErrors(page)
  await setup(page, 'writer', 'create_document')
  const create = async (args: Record<string, unknown>) => {
    const opened = context.waitForEvent('page')
    const pending = call(page, 'create_document', args)
    await page.locator('dialog[open]').getByRole('button', { name: 'Allow', exact: true }).click()
    const result = (await pending).data as { created: boolean; opened: boolean }
    expect(result).toMatchObject({ created: true, opened: true })
    expect(JSON.stringify(result)).not.toMatch(/key=|#app=|doc=/)
    const tab = await opened
    await expect.poll(() => toolNames(tab), { timeout: 60_000 }).toContain('get_document_info')
    return tab
  }

  const quiz = await create({
    app: 'forms',
    title: 'Capitals',
    questions: [
      { type: 'choice', title: 'Capital of France?', options: ['Paris', 'Rome'], correct: 'Paris', points: 2 },
      { type: 'short', title: 'Capital of Spain?', correct: ['Madrid'] },
    ],
  })
  const form = (await call(quiz, 'get_form')).data as { quiz: boolean; items: { title: string; options?: string[] }[] }
  expect(form.quiz).toBe(true)
  expect(form.items.map((i) => i.title)).toEqual(['Capital of France?', 'Capital of Spain?'])
  expect(JSON.stringify(form)).not.toContain('correct')
  await quiz.close()

  const deck = await create({ app: 'slides', title: 'Deck', slides: [{ title: 'Intro' }, { title: 'Second', body: 'Point A\nPoint B', notes: 'Say it' }] })
  expect(((await call(deck, 'list_slides')).data as { title: string }[]).map((s) => s.title)).toEqual(['Intro', 'Second'])
  await deck.close()

  const book = await create({ app: 'sheet', title: 'Book', sheets: [{ name: 'Data', rows: [['a', 1], ['b', 2], ['sum', '=SUM(B1:B2)']] }] })
  await expect.poll(async () => ((await call(book, 'read_range', { range: 'A1:B3' })).data as { display: string[][] }).display).toEqual([['a', '1'], ['b', '2'], ['sum', '3']])
  await book.close()

  const notes = await create({ app: 'notebook', title: 'Notes', sections: [{ name: 'Zoology', pages: [{ title: 'Cats', markdown: 'Cats purr.' }] }, { name: 'Botany', pages: [{ title: 'Ferns' }] }] })
  expect(((await call(notes, 'list_pages')).data as { section: string; pages: { title: string }[] }[]).map((s) => [s.section, s.pages.map((p) => p.title)])).toEqual([
    ['Zoology', ['Cats']],
    ['Botany', ['Ferns']],
  ])
  await notes.close()

  const doc = await create({ app: 'writer', title: 'Summary', markdown: '# Summary\n\n- one\n- two\n\n![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPj/HwADAgH/eL9GtQAAAABJRU5ErkJggg==)' })
  await expect.poll(async () => (await call(doc, 'get_text')).data).toContain('- one')
  const issues = (await call(doc, 'check_accessibility')).data as { issues: { where: string }[] }
  expect(issues.issues.map((i) => i.where)).toContain('image 1')
  expect((await call(doc, 'set_alt_text', { image: 1, text: 'A dot' })).error).toBe(false)
  expect(((await call(doc, 'check_accessibility')).data as { issues: { where: string }[] }).issues.map((i) => i.where)).not.toContain('image 1')
  await doc.close()

  const drawing = await create({ app: 'draw', title: 'Sketch', elements: [{ type: 'rectangle', text: 'A' }, { type: 'ellipse', x: 300, text: 'B' }] })
  expect(((await call(drawing, 'get_scene')).data as { label?: string }[]).map((e) => e.label)).toEqual(['A', 'B'])
  await drawing.close()

  const flow = await create({
    app: 'diagram',
    title: 'Flow',
    drawio: '<mxfile><diagram name="Main"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="Start" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>',
  })
  expect(((await call(flow, 'get_diagram')).data as { shapes: { label: string }[] }).shapes.map((s) => s.label)).toEqual(['Start'])
  await flow.close()
  expect(errors).toEqual([])
})
