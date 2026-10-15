import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { openApp, RELAYS, trackErrors } from './helpers'
import { makeFixturePdf } from './pdf-fixture'
import { call, ENABLED, ENGLISH, toolNames } from './webmcp-helpers'

// Bulk creation and teaching: Markdown, equations, graphs, references,
// outlines, graphs from Mermaid, quizzes with answer keys, responses with
// pseudonyms, grades suggested to the teacher, PDF corrections, notebook tags.

async function setup(page: Page, app: string, tool: string) {
  await page.addInitScript(ENGLISH)
  await page.addInitScript(ENABLED)
  const created: Record<string, string> = { notebook: '.nb-content .ProseMirror' }
  if (created[app]) {
    await page.goto(`/${RELAYS}#new=${app}`)
    await page.locator(created[app]).waitFor({ timeout: 60_000 })
  } else await openApp(page, app)
  await expect.poll(() => toolNames(page)).toContain(tool)
}
const ok = (r: { error: boolean; data: unknown }) => expect(r.error, JSON.stringify(r.data)).toBe(false)

test('writer: Markdown, equations, graphs and references', async ({ page }) => {
  const errors = trackErrors(page)
  await setup(page, 'writer', 'insert_markdown')
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('Photosynthesis needs light.')
  ok(await call(page, 'insert_markdown', { markdown: '## Summary\n\n| Input | Output |\n| --- | --- |\n| light | sugar |\n\n- one\n- two' }))
  await expect(editor.locator('table ins[data-suggestion]').first()).toBeVisible()
  await expect(editor.locator('h2')).toContainText('Summary')
  ok(await call(page, 'insert_equation', { latex: 'E = mc^2', match: 'light.', position: 'after' }))
  await expect(editor.locator('.equation')).toHaveCount(1)
  const graph = await call(page, 'add_function_graph', { expressions: ['f(x) = x^2 - 1'], special: true })
  ok(graph)
  expect((graph.data as { alt: string }).alt).toBeTruthy()
  await expect(editor.locator('img.math-graph, img[data-graph]')).toHaveCount(1)

  const source = (await call(page, 'add_reference', { type: 'book', authors: ['Darwin, Charles'], title: 'On the Origin of Species', date: '1859', publisher: 'John Murray' })).data as { id: string }
  expect((await call(page, 'list_references')).data).toMatchObject({ sources: [{ id: source.id, authors: ['Darwin, Charles'] }] })
  ok(await call(page, 'cite', { ids: [source.id], match: 'Photosynthesis needs light.' }))
  await expect(editor.locator('.citation')).toContainText('Darwin')
  ok(await call(page, 'insert_bibliography', { title: 'References' }))
  await expect(editor.locator('.bibliography, [data-bibliography]').first()).toContainText('Origin of Species')
  expect((await call(page, 'insert_bibliography')).error).toBe(true)
  expect(errors).toEqual([])
})

test('slides from an outline and graphs on slides', async ({ page }) => {
  const errors = trackErrors(page)
  await setup(page, 'slides', 'add_slides_from_outline')
  expect((await call(page, 'add_slides_from_outline', { slides: [{ title: 'A' }, { title: 'B', body: 'x\ny' }, { title: 'C', notes: 'n' }] })).data).toEqual({ slides: [2, 3, 4] })
  expect(((await call(page, 'list_slides')).data as { title: string }[]).map((s) => s.title)).toEqual(['', 'A', 'B', 'C'])
  ok(await call(page, 'add_function_graph', { slide: 3, expressions: ['y = 2x + 1'] }))
  expect(((await call(page, 'get_slide', { slide: 3 })).data as { objects: unknown[] }).objects.length).toBeGreaterThan(2)
  expect(errors).toEqual([])
})

test('diagram: graphs from data, Mermaid and draw.io', async ({ page }) => {
  const errors = trackErrors(page)
  await setup(page, 'diagram', 'add_graph')
  const built = (await call(page, 'add_graph', {
    nodes: [{ id: 'a', label: 'Idea' }, { id: 'b', label: 'Draft', shape: 'rectangle' }, { id: 'c', label: 'Done?', shape: 'rhombus' }],
    edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c', label: 'review' }],
    direction: 'right',
  })).data as { ids: Record<string, string> }
  expect(Object.keys(built.ids)).toEqual(['a', 'b', 'c'])
  let diagram = (await call(page, 'get_diagram')).data as { shapes: { id: string; label: string; x: number }[]; connectors: { label?: string }[] }
  expect(diagram.shapes.map((s) => s.label)).toEqual(['Idea', 'Draft', 'Done?'])
  expect(diagram.connectors).toHaveLength(2)
  // Laid out left to right.
  expect(diagram.shapes[0].x).toBeLessThan(diagram.shapes[1].x)
  ok(await call(page, 'import_mermaid', { definition: 'flowchart TD\n  S[Start] --> Q{Ready?}\n  Q -->|yes| E[End]' }))
  diagram = (await call(page, 'get_diagram')).data as typeof diagram
  expect(diagram.shapes.map((s) => s.label)).toEqual(expect.arrayContaining(['Start', 'Ready?', 'End']))
  expect(diagram.connectors.length).toBe(4)
  const imported = await call(page, 'import_drawio', { xml: '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="From XML" vertex="1" parent="1"><mxGeometry x="10" y="10" width="100" height="40" as="geometry"/></mxCell></root></mxGraphModel>' })
  expect(imported.data).toEqual({ pages: [2] })
  expect(((await call(page, 'get_diagram', { page: 2 })).data as { shapes: { label: string }[] }).shapes.map((s) => s.label)).toEqual(['From XML'])
  expect(errors).toEqual([])
})

test('drawing: elements in bulk and from Mermaid', async ({ page }) => {
  const errors = trackErrors(page)
  await setup(page, 'draw', 'add_elements')
  expect(((await call(page, 'add_elements', { elements: [{ type: 'rectangle', text: 'One' }, { type: 'ellipse', x: 250, text: 'Two' }] })).data as { ids: string[] }).ids).toHaveLength(2)
  ok(await call(page, 'mermaid_to_drawing', { definition: 'flowchart LR\n  A[Plan] --> B[Do]' }))
  const labels = ((await call(page, 'get_scene')).data as { label?: string }[]).map((e) => e.label).filter(Boolean)
  expect(labels).toEqual(expect.arrayContaining(['One', 'Two', 'Plan', 'Do']))
  expect(errors).toEqual([])
})

test('forms: a quiz with answer keys, responses as pseudonyms, statistics and grades suggested to the teacher', async ({ browser }) => {
  test.setTimeout(180_000)
  const teacher = await (await browser.newContext()).newPage()
  const errors = trackErrors(teacher)
  await teacher.addInitScript(ENGLISH)
  await teacher.addInitScript(ENABLED)
  const b64 = (n: number) => randomBytes(n).toString('base64url')
  await teacher.goto(`/${RELAYS}#app=forms&doc=ai-quiz-${Date.now()}&key=${b64(18)}&edit=${b64(32)}`)
  await teacher.locator('.fm-editor').waitFor({ timeout: 60_000 })
  await expect.poll(() => toolNames(teacher)).toContain('add_questions')

  const added = (await call(teacher, 'add_questions', {
    questions: [
      { type: 'choice', title: 'Capital of Italy', options: ['Milan', 'Rome'], correct: 'Rome', points: 2 },
      { type: 'paragraph', title: 'Explain photosynthesis', points: 3 },
      { type: 'number', title: '2 + 2', correct: 4 },
    ],
  })).data as { ids: string[]; quiz: boolean }
  expect(added.quiz).toBe(true)
  ok(await call(teacher, 'set_answer_key', { id: added.ids[2], correct: 4, tolerance: 0 }))
  ok(await call(teacher, 'set_settings', { description: 'Short quiz', collect_group: true }))
  const form = (await call(teacher, 'get_form')).data as { description: string; items: unknown[] }
  expect(form.description).toBe('Short quiz')
  expect(JSON.stringify(form)).not.toMatch(/Rome"\s*:|correct/)

  await teacher.locator('.fm-send').click()
  const link = await teacher.locator('#fm-send-link').inputValue()
  await teacher.keyboard.press('Escape')
  const student = await (await browser.newContext()).newPage()
  await student.goto(link)
  await student.locator('.fm-respondent .fm-question').first().waitFor({ timeout: 60_000 })
  await student.locator('#fm-name').fill('Lucía Pérez')
  await student.locator('.fm-question').nth(0).getByText('Rome').click()
  await student.locator('.fm-question').nth(1).locator('textarea').fill('Plants turn light into sugar.')
  await student.locator('.fm-question').nth(2).locator('input').fill('4')
  await student.getByRole('button', { name: 'Submit', exact: true }).click()
  await expect(student.locator('.fm-state.ok')).toContainText('Received by the teacher', { timeout: 60_000 })

  // Pseudonyms by default; the real name only when the teacher allows it.
  await expect.poll(async () => ((await call(teacher, 'get_responses')).data as unknown[]).length, { timeout: 60_000 }).toBe(1)
  const [response] = (await call(teacher, 'get_responses')).data as { id: string; respondent: string; score: number; to_grade: string[] }[]
  expect(response.respondent).toBe('Respondent 1')
  expect(JSON.stringify((await call(teacher, 'get_responses')).data)).not.toContain('Lucía')
  expect(response.to_grade).toEqual([added.ids[1]])
  const summary = (await call(teacher, 'summarize_responses')).data as { responses: number; questions: { counts?: Record<string, number> }[]; scores: { out_of: number } }
  expect(summary.responses).toBe(1)
  expect(summary.questions[0].counts).toEqual({ Milan: 0, Rome: 1 })
  expect(summary.scores.out_of).toBe(6)

  // The grade suggested by the assistant is marked for the teacher and never released by it.
  ok(await call(teacher, 'propose_grade', { response: response.id, question: added.ids[1], points: 2, comment: 'Mention chlorophyll.' }))
  await teacher.locator('.fm-tab[data-tab="responses"]').click()
  await teacher.locator('.fm-subtab', { hasText: 'Grading' }).click()
  await expect(teacher.locator('.fm-ai-draft')).toContainText('Suggested by the AI assistant')
  await teacher.getByRole('button', { name: 'Release grade to this respondent' }).click()
  await expect(teacher.locator('dialog[open]')).toContainText('suggested by the AI assistant that nobody has reviewed')
  await teacher.locator('dialog[open]').getByRole('button', { name: 'Cancel' }).click()
  await teacher.getByRole('button', { name: 'Keep as reviewed' }).click()
  await expect(teacher.locator('.fm-ai-draft')).toHaveCount(0)
  expect(((await call(teacher, 'get_responses')).data as { score: number }[])[0].score).toBe(5)

  // Real names when the teacher allows it.
  await teacher.evaluate(() => localStorage.setItem('ofimeo:webmcp:names', '1'))
  expect(((await call(teacher, 'get_responses')).data as { respondent: string }[])[0].respondent).toBe('Lucía Pérez')

  // A shuffled variant for another group.
  const opened = teacher.context().waitForEvent('page')
  const variant = call(teacher, 'create_variant', {})
  await teacher.locator('dialog[open]').getByRole('button', { name: 'Allow', exact: true }).click()
  expect((await variant).data).toMatchObject({ created: true, opened: true })
  const copy = await opened
  await expect.poll(() => toolNames(copy), { timeout: 60_000 }).toContain('get_form')
  expect(((await call(copy, 'get_form')).data as { items: unknown[] }).items).toHaveLength(3)
  expect(errors).toEqual([])
})

test('pdf corrections and notebook tags', async ({ page }) => {
  const errors = trackErrors(page)
  await page.addInitScript(ENGLISH)
  await page.addInitScript(ENABLED)
  const path = join(tmpdir(), `webmcp-teach-${Date.now()}.pdf`)
  writeFileSync(path, await makeFixturePdf(false))
  await page.goto(`/${RELAYS}`)
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.home-open').first().click()])
  await chooser.setFiles(path)
  await page.locator('.pdf-page canvas').first().waitFor({ timeout: 60_000 })
  await expect.poll(() => toolNames(page)).toContain('add_stamp')
  expect(((await call(page, 'search', { query: 'BOILS' })).data as { count: number; matches: { page: number }[] }).matches[0].page).toBe(1)
  ok(await call(page, 'add_strike', { page: 1, text: '90 degrees' }))
  ok(await call(page, 'add_underline', { page: 1, text: 'speed of light' }))
  ok(await call(page, 'add_text', { page: 1, text: '100 degrees', x: 400, y: 170 }))
  ok(await call(page, 'add_stamp', { page: 1, stamp: 'grade', text: '8/10' }))
  ok(await call(page, 'add_stamp', { page: 1, stamp: 'check', x: 60, y: 140 }))
  const types = ((await call(page, 'list_annotations')).data as { type: string }[]).map((a) => a.type).sort()
  expect(types).toEqual(['stamp', 'stamp', 'strike', 'text', 'underline'])
  const note = (await call(page, 'add_note', { page: 1, text: 'Check question 2' })).data as { id: string }
  ok(await call(page, 'resolve_note', { id: note.id }))
  expect((await call(page, 'list_comments')).data).toEqual([])
  expect(errors).toEqual([])

  await setup(page, 'notebook', 'list_tagged')
  await call(page, 'add_page', { title: 'Chemistry', section: 'Science', text: 'Learn the periodic table.\n\nAsk about isotopes.\n\n- [ ] Buy goggles' })
  ok(await call(page, 'set_tag', { page: 'Chemistry', match: 'periodic table', tag: 'todo' }))
  ok(await call(page, 'set_tag', { page: 'Chemistry', match: 'isotopes', tag: 'question' }))
  expect(((await call(page, 'list_tagged')).data as { tag: string; text: string }[]).map((x) => [x.tag, x.text])).toEqual([
    ['todo', 'Learn the periodic table.'],
    ['question', 'Ask about isotopes.'],
  ])
  expect((await call(page, 'toggle_checkbox', { page: 'Chemistry', match: 'periodic' })).data).toEqual({ checked: true })
  expect((await call(page, 'toggle_checkbox', { page: 'Chemistry', match: 'goggles' })).data).toEqual({ checked: true })
  expect(((await call(page, 'list_tagged', { tag: 'done' })).data as unknown[]).length).toBe(1)
  expect(((await call(page, 'search', { query: 'ISOTOPES' })).data as { count: number }).count).toBe(1)
  expect(errors).toEqual([])
})

test('sheet statistics, templates and Moodle assignments', async ({ page }) => {
  const errors = trackErrors(page)
  await setup(page, 'sheet', 'describe_range')
  ok(await call(page, 'write_range', { range: 'A1', values: [['Name', 'Mark'], ['a', 5], ['b', 7], ['c', 9]] }))
  await expect.poll(async () => (await call(page, 'describe_range')).data).toMatchObject({ headers: true, columns: [{ name: 'Name', distinct: 3 }, { name: 'Mark', count: 3, mean: 7, median: 7, min: 5, max: 9, sum: 21 }] })
  expect((await call(page, 'list_templates')).data).toEqual([])
  // Without Moodle in this browser the assistant is told so (after the user allows it).
  const pending = call(page, 'get_assignments')
  await expect(page.locator('dialog[open]')).toContainText('Moodle assignments')
  await page.locator('dialog[open]').getByRole('button', { name: 'Allow', exact: true }).click()
  const result = await pending
  expect(result.error).toBe(true)
  expect(String(result.data)).toContain('Moodle is not connected')
  expect(errors).toEqual([])
})
