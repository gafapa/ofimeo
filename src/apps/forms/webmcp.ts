// WebMCP tools of the forms app (see src/core/webmcp). Loaded only while the
// switch is on, and only in the editors' view: respondents (view links) get no
// tools, so an assistant cannot fill in a quiz for them. Responses are only
// readable by editors (their private vault) and answer keys are never exposed.
// New questions are one step of the form's undo history (origin LOCAL).

import type { Session } from '../../core/session'
import { bool, optStr, str, type AppTools, type OfimeoTool } from '../../core/webmcp/types'
import { answerText, hasOptions, itemMap, itemsArray, newId, newQuestion, QUESTION_TYPES, readItems, readSettings, responsesMap, type Item, type QuestionType } from './model'
import { LOCAL, type FormState } from './state'

const publicItem = (i: Item) => ({
  id: i.id,
  kind: i.kind,
  ...(i.kind === 'question' ? { type: i.type, required: i.required } : {}),
  title: i.title,
  ...(i.description ? { description: i.description } : {}),
  ...(hasOptions(i.type) || i.type === 'grid' ? { options: i.options.map((o) => o.label) } : {}),
  ...(i.type === 'grid' ? { rows: i.rows.map((r) => r.label) } : {}),
  ...(i.type === 'scale' ? { min: i.min, max: i.max } : {}),
})

// render: redraws the editor (changes with the LOCAL origin are not observed by it).
export function formsTools(session: Session, state: FormState, render: () => void = () => {}): AppTools {
  const doc = session.doc
  const tools: OfimeoTool[] = [
    {
      name: 'get_form',
      description: 'Returns the form: title, description, whether it is a quiz and its sections and questions (type, options). Answer keys are not included.',
      inputSchema: { type: 'object', properties: {} },
      access: 'view',
      execute: () => {
        const settings = readSettings(doc)
        return {
          title: String(doc.getMap('meta').get('title') || ''),
          description: settings.description,
          quiz: settings.quiz,
          accepting_responses: settings.accepting,
          items: readItems(doc).map(publicItem),
        }
      },
    },
    {
      name: 'add_question',
      description: `Adds a question at the end of the form. Types: ${QUESTION_TYPES.join(', ')}. Options are used by choice, checkbox and dropdown questions. One undo step.`,
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: QUESTION_TYPES },
          title: { type: 'string' },
          description: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          required: { type: 'boolean' },
        },
        required: ['type', 'title'],
      },
      access: 'edit',
      changesDocument: true,
      execute: (args) => {
        const type = str(args, 'type') as QuestionType
        if (!QUESTION_TYPES.includes(type)) throw new Error(`Unknown question type "${type}"`)
        const item = { ...newQuestion(type), title: str(args, 'title'), description: optStr(args, 'description') ?? '', required: bool(args, 'required') }
        const options = Array.isArray(args.options) ? args.options.map(String).filter(Boolean) : []
        if (options.length && hasOptions(type)) item.options = options.map((label) => ({ id: newId(), label }))
        const map = itemMap(item)
        doc.transact(() => itemsArray(doc).push([map]), LOCAL)
        render()
        return { id: String(map.get('id')), position: itemsArray(doc).length }
      },
    },
    {
      name: 'get_responses',
      description: 'Editors only: the responses received (name, group, time and the answer to each question as text).',
      inputSchema: { type: 'object', properties: {} },
      access: 'edit',
      readOnly: true,
      execute: () => {
        if (!state.priv) throw new Error('Responses are only available to the form’s editors')
        const questions = readItems(doc).filter((i) => i.kind === 'question')
        return [...responsesMap(state.priv).values()]
          .sort((a, b) => a.submittedAt - b.submittedAt)
          .map((r) => ({
            name: r.name,
            group: r.group,
            submitted: new Date(r.submittedAt).toISOString(),
            answers: Object.fromEntries(questions.map((q) => [q.title || q.id, answerText(q, r.answers[q.id])])),
          }))
      },
    },
  ]
  return {
    tools,
    selection: () => {
      const id = (document.activeElement?.closest('.fm-card[data-id]') as HTMLElement | null)?.dataset.id
      const item = id ? readItems(doc).find((i) => i.id === id) : undefined
      return item ? { kind: 'item', item: publicItem(item) } : { kind: 'none' }
    },
    show: async (args) => {
      const id = str(args, 'id')
      const find = () => document.querySelector<HTMLElement>(`.fm-card[data-id="${CSS.escape(id)}"]`)
      // A question added just before is rendered on the next frames.
      for (let i = 0; i < 30 && !find() && readItems(doc).some((item) => item.id === id); i++) await new Promise((r) => requestAnimationFrame(r))
      const card = find()
      if (!card) throw new Error(`No question or section with id "${id}" (use get_form)`)
      card.scrollIntoView({ block: 'center' })
      card.querySelector<HTMLElement>('input, textarea, [contenteditable="true"]')?.focus({ preventScroll: true })
      return { shown: true, id }
    },
    showSchema: { id: { type: 'string', description: 'Question or section id from get_form.' } },
    info: () => ({
      questions: readItems(doc).filter((i) => i.kind === 'question').length,
      responses: state.priv ? responsesMap(state.priv).size : undefined,
    }),
  }
}
