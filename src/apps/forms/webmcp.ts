// WebMCP tools of the forms app (see src/core/webmcp). Loaded only while the
// switch is on, and only in the editors' view: respondents (view links) get no
// tools, so an assistant cannot fill in a quiz for them. Responses are only
// readable by editors (their private vault) and answer keys are never exposed.
// New questions are one step of the form's undo history (origin LOCAL).

import * as Y from 'yjs'
import { t } from '../../core/i18n'
import type { Session } from '../../core/session'
import { groupYUndo } from '../../core/webmcp/undo'
import { bool, num, optStr, str, type AccessibilityIssue, type AppTools, type OfimeoTool, type TextPart, type ToolArgs } from '../../core/webmcp/types'
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
export function formsTools(session: Session, state: FormState, render: () => void = () => {}, undo?: Y.UndoManager): AppTools {
  const doc = session.doc
  const editable = () => {
    if (!session.canEdit) throw new Error('Only the form’s editors can change it')
  }
  const indexOf = (args: ToolArgs) => {
    const id = str(args, 'id')
    const index = itemsArray(doc).toArray().findIndex((m) => m.get('id') === id)
    if (index < 0) throw new Error(`No question or section with id "${id}" (use get_form)`)
    return index
  }
  const titleOf = (args: ToolArgs) => {
    try {
      return String(itemsArray(doc).get(indexOf(args)).get('title') || '…')
    } catch {
      return String(args.id ?? '')
    }
  }
  const change = (fn: () => void) => {
    doc.transact(fn, LOCAL)
    render()
  }
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
      summary: (args) => t('Add the question “{title}”', { title: String(args.title ?? '') }),
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
      name: 'update_question',
      description: 'Changes a question or section (id from get_form): title, description, required, and for choice, checkbox and dropdown questions the options (replacing them). One undo step.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          required: { type: 'boolean' },
          options: { type: 'array', items: { type: 'string' } },
        },
        required: ['id'],
      },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Change the question “{title}”', { title: titleOf(args) }),
      execute: (args) => {
        editable()
        const map = itemsArray(doc).get(indexOf(args))
        const item = readItems(doc).find((i) => i.id === map.get('id'))!
        const changed: string[] = []
        change(() => {
          for (const key of ['title', 'description'] as const) {
            const v = optStr(args, key)
            if (v !== undefined) (map.set(key, v), changed.push(key))
          }
          if (typeof args.required === 'boolean' && item.kind === 'question') (map.set('required', args.required), changed.push('required'))
          if (Array.isArray(args.options)) {
            if (!hasOptions(item.type)) throw new Error('This question has no options')
            const labels = args.options.map(String).filter(Boolean)
            if (!labels.length) throw new Error('At least one option')
            // Options keep their ids (and answer keys) by position.
            map.set('options', labels.map((label, i) => ({ id: item.options[i]?.id ?? newId(), label })))
            changed.push('options')
          }
        })
        if (!changed.length) throw new Error('Nothing to change: pass title, description, required or options')
        return { id: item.id, changed }
      },
    },
    {
      name: 'move_question',
      description: 'Moves a question or section (id from get_form) so that it becomes item number "to" (1 = first).',
      inputSchema: { type: 'object', properties: { id: { type: 'string' }, to: { type: 'integer', minimum: 1 } }, required: ['id', 'to'] },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Move the question “{title}” to position {n}', { title: titleOf(args), n: String(args.to) }),
      execute: (args) => {
        editable()
        const from = indexOf(args)
        const items = itemsArray(doc)
        const to = Math.max(0, Math.min(items.length - 1, Math.round(num(args, 'to')) - 1))
        if (to !== from) {
          change(() => {
            // Like the editor's move: a copy of the item's map at the new place.
            const copy = new Y.Map<unknown>()
            items.get(from).forEach((v, k) => copy.set(k, v))
            items.delete(from, 1)
            items.insert(to, [copy])
          })
        }
        return { id: str(args, 'id'), position: to + 1 }
      },
    },
    {
      name: 'delete_question',
      description: 'Deletes a question or section (id from get_form) with its answer key. The user confirms it.',
      inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      access: 'edit',
      changesDocument: true,
      destructive: true,
      summary: (args) => t('Delete the question “{title}”', { title: titleOf(args) }),
      execute: (args) => {
        editable()
        const index = indexOf(args)
        change(() => itemsArray(doc).delete(index, 1))
        return { deleted: str(args, 'id') }
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
    group: (fn) => groupYUndo([undo], fn),
    serialize: (ydoc) =>
      [
        `# ${String(ydoc.getMap('meta').get('title') ?? '')}`,
        readSettings(ydoc).description,
        ...readItems(ydoc).map((i) =>
          i.kind === 'section'
            ? `## ${i.title}`
            : `- ${i.title} [${i.type}${i.required ? ', required' : ''}]${i.options.length ? `: ${i.options.map((o) => o.label).join(' | ')}` : ''}`,
        ),
      ].join('\n'),
    paragraphs: () => {
      const parts: TextPart[] = []
      readItems(doc).forEach((i, n) => {
        const where = `${i.kind} ${n + 1} (${i.id})`
        if (i.title) parts.push({ where: `${where} · title`, text: i.title, context: 'heading' })
        if (i.description) parts.push({ where: `${where} · description`, text: i.description })
        i.options.forEach((o, k) => o.label && parts.push({ where: `${where} · option ${k + 1}`, text: o.label, context: 'list' }))
      })
      return parts
    },
    accessibility: () => {
      const issues: AccessibilityIssue[] = []
      readItems(doc).forEach((i, n) => {
        if (i.kind === 'question' && !i.title.trim()) issues.push({ where: `question ${n + 1} (${i.id})`, problem: 'The question has no text.', fix: `update_question {"id": "${i.id}", "title": "…"}` })
        if (i.image && !i.title.trim() && !i.description.trim()) issues.push({ where: `item ${n + 1} (${i.id})`, problem: 'A picture with no text around it: say in the description what it shows.', fix: `update_question {"id": "${i.id}", "description": "…"}` })
      })
      return issues
    },
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
