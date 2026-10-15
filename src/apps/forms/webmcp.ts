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
import { answersMap, answerText, formFile, gradesMap, hasOptions, itemMap, itemsArray, newId, newQuestion, QUESTION_TYPES, readItems, readKey, readSettings, responsesMap, settingsMap, type Grade, type Item, type QuestionType } from './model'
import { sortedResponses } from './export'
import { histogram, round, scoreResponse, stats } from './grading'
import { keyFor, SPEC_TYPES, specToItem, type QuestionSpec } from './spec'
import { keyLookup } from './state'
import { realNamesAllowed } from '../../core/webmcp/state'
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
  const privOf = () => {
    if (!state.priv) throw new Error('Responses and answer keys are only available with the form’s editor link')
    return state.priv
  }
  // Respondents as pseudonyms (by order of submission) unless real names are allowed.
  const respondentName = (name: string, index: number) => (realNamesAllowed() ? name : t('Respondent {n}', { n: index + 1 }))
  const respondentLabel = (id: string) => {
    const index = state.priv ? sortedResponses(state.priv).findIndex((r) => r.id === id) : -1
    return index < 0 ? id : String(index + 1)
  }
  const variantTitle = () => t('{title} (variant)', { title: String(doc.getMap('meta').get('title') || '') })
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
      description:
        'Editors only: the responses received (id, respondent, group, time, the answer to each question as text and, in quizzes, the score and what is still to grade). Respondents are pseudonyms ("Respondent 3", by order of submission) unless the user allowed real names.',
      inputSchema: { type: 'object', properties: { max: { type: 'integer', minimum: 1, maximum: 1000 } } },
      access: 'edit',
      readOnly: true,
      execute: (args) => {
        const priv = privOf()
        const items = readItems(doc)
        const questions = items.filter((i) => i.kind === 'question')
        const quiz = readSettings(doc).quiz
        return sortedResponses(priv)
          .slice(0, Math.round(num(args, 'max', 200)))
          .map((r, i) => {
            const grade = gradesMap(priv).get(r.id)
            const sheet = quiz ? scoreResponse(items, keyLookup(priv), r, grade) : null
            return {
              id: r.id,
              respondent: respondentName(r.name, i),
              group: r.group,
              submitted: new Date(r.submittedAt).toISOString(),
              answers: Object.fromEntries(questions.map((q) => [q.id, { question: q.title, answer: answerText(q, r.answers[q.id]) }])),
              ...(sheet ? { score: sheet.score, max: sheet.max, to_grade: questions.filter((q) => sheet.questions[q.id]?.points === null).map((q) => q.id), released: !!grade?.released } : {}),
            }
          })
      },
    },
    {
      name: 'summarize_responses',
      description:
        'Editors only: statistics of the responses without names: per question, counts per option (choice, checkbox, dropdown, scale, grid), number statistics, and a sample of text answers; for quizzes, score statistics and a histogram.',
      inputSchema: { type: 'object', properties: { text_sample: { type: 'integer', minimum: 0, maximum: 100 } } },
      access: 'edit',
      readOnly: true,
      execute: (args) => {
        const priv = privOf()
        const items = readItems(doc)
        const responses = sortedResponses(priv)
        const sample = Math.round(num(args, 'text_sample', 20))
        const questions = items.filter((i) => i.kind === 'question').map((q) => {
          const answers = responses.map((r) => r.answers[q.id]).filter((a) => a !== undefined && a !== '' && !(Array.isArray(a) && !a.length))
          const base = { id: q.id, question: q.title, type: q.type, answered: answers.length }
          if (hasOptions(q.type)) {
            const counts = Object.fromEntries(q.options.map((o) => [o.label, 0]))
            const label = new Map(q.options.map((o) => [o.id, o.label]))
            for (const a of answers) for (const id of Array.isArray(a) ? a : [a]) if (label.has(String(id))) counts[label.get(String(id))!]++
            return { ...base, counts }
          }
          if (q.type === 'scale' || q.type === 'number') {
            const values = answers.map(Number).filter((v) => Number.isFinite(v))
            return { ...base, stats: stats(values), ...(q.type === 'scale' ? { counts: Object.fromEntries(Array.from({ length: q.max - q.min + 1 }, (_x, k) => [q.min + k, values.filter((v) => v === q.min + k).length])) } : {}) }
          }
          if (q.type === 'grid') {
            const col = new Map(q.options.map((o) => [o.id, o.label]))
            return {
              ...base,
              rows: Object.fromEntries(q.rows.map((row) => [row.label, Object.fromEntries(q.options.map((o) => [o.label, answers.filter((a) => typeof a === 'object' && !Array.isArray(a) && col.get((a as Record<string, string>)[row.id]) === o.label).length]))])),
            }
          }
          return { ...base, sample: answers.slice(0, sample).map((a) => answerText(q, a)) }
        })
        const out: Record<string, unknown> = { responses: responses.length, questions }
        if (readSettings(doc).quiz && responses.length) {
          const sheets = responses.map((r) => scoreResponse(items, keyLookup(priv), r, gradesMap(priv).get(r.id)))
          const max = sheets[0].max
          out.scores = { out_of: max, ...stats(sheets.map((s) => s.score)), histogram: histogram(sheets.map((s) => s.score), max, 5), still_to_grade: sheets.filter((s) => s.pending).length }
        }
        return out
      },
    },
    {
      name: 'propose_grade',
      description:
        'Editors only, quizzes: suggests the points and/or a comment for the respondent on one question of one response (id from get_responses). It is shown to the editor as the AI assistant’s suggestion until reviewed, and never released by you: the editor releases grades.',
      inputSchema: {
        type: 'object',
        properties: { response: { type: 'string' }, question: { type: 'string' }, points: { type: 'number', minimum: 0 }, comment: { type: 'string' } },
        required: ['response', 'question'],
      },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Suggest a grade for response {n}', { n: respondentLabel(String(args.response ?? '')) }),
      execute: (args) => {
        const priv = privOf()
        const response = responsesMap(priv).get(str(args, 'response'))
        if (!response) throw new Error('No response with that id (use get_responses)')
        const question = readItems(doc).find((i) => i.id === args.question && i.kind === 'question')
        if (!question) throw new Error('No question with that id (use get_form)')
        const points = typeof args.points === 'number' ? round(Math.min(question.points, Math.max(0, args.points))) : undefined
        const comment = optStr(args, 'comment')?.trim()
        if (points === undefined && !comment) throw new Error('Give points and/or a comment')
        const grade: Grade = gradesMap(priv).get(response.id) ?? { points: {}, comments: {} }
        const next: Grade = {
          ...grade,
          points: points === undefined ? grade.points : { ...grade.points, [question.id]: points },
          comments: comment ? { ...grade.comments, [question.id]: comment } : grade.comments,
          ai: [...new Set([...(grade.ai ?? []), question.id])],
        }
        priv.transact(() => gradesMap(priv).set(response.id, next), LOCAL)
        render()
        return { response: response.id, question: question.id, ...(points !== undefined ? { points, max: question.points } : {}), ...(comment ? { comment } : {}), released: false }
      },
    },
    {
      name: 'add_questions',
      description: `Adds several questions (and sections) at the end of the form, or after the item with id "after": each {type (${SPEC_TYPES.join(', ')}), title, description, required, options (labels), correct (labels of the right options, accepted texts, or a number), tolerance, points, feedback_correct, feedback_wrong}. Answer keys are stored privately for editors. One undo step.`,
      inputSchema: { type: 'object', properties: { questions: { type: 'array', items: { type: 'object' }, maxItems: 200 }, after: { type: 'string' } }, required: ['questions'] },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Add {n} questions', { n: Array.isArray(args.questions) ? args.questions.length : 0 }),
      execute: (args) => {
        editable()
        const specs = Array.isArray(args.questions) ? (args.questions as QuestionSpec[]).slice(0, 200) : []
        if (!specs.length) throw new Error('Give at least one question')
        const built = specs.map(specToItem)
        if (built.some((b) => b.key) && !state.priv) throw new Error('Answer keys need the form’s editor link')
        const items = itemsArray(doc)
        const after = optStr(args, 'after')
        const index = after ? items.toArray().findIndex((m) => m.get('id') === after) + 1 : items.length
        if (after && index === 0) throw new Error(`No item with id "${after}"`)
        change(() => {
          items.insert(index, built.map((b) => itemMap(b.item)))
          // Answer keys only count in quizzes.
          if (built.some((b) => b.key) && !readSettings(doc).quiz) settingsMap(doc).set('quiz', true)
        })
        if (state.priv) state.priv.transact(() => built.forEach((b) => b.key && answersMap(state.priv!).set(b.item.id!, b.key)), LOCAL)
        return { ids: built.map((b) => b.item.id), quiz: readSettings(doc).quiz }
      },
    },
    {
      name: 'set_answer_key',
      description:
        'Editors only: sets the right answer of a question (write only: keys are never read back): correct (labels of the right options, accepted texts, or a number with tolerance), points and feedback. Turns the form into a quiz if it is not one.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          correct: { type: ['array', 'string', 'number'], items: { type: 'string' } },
          tolerance: { type: 'number' },
          points: { type: 'number', minimum: 0 },
          feedback_correct: { type: 'string' },
          feedback_wrong: { type: 'string' },
        },
        required: ['id', 'correct'],
      },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Set the right answer of “{title}”', { title: titleOf(args) }),
      execute: (args) => {
        editable()
        const priv = privOf()
        const map = itemsArray(doc).get(indexOf(args))
        const item = readItems(doc).find((i) => i.id === map.get('id'))!
        if (item.kind !== 'question') throw new Error('Sections have no answers')
        const key = keyFor(item, args as never)
        if (!key) throw new Error('Give "correct"')
        priv.transact(() => answersMap(priv).set(item.id, { ...readKey(priv, item.id), ...key }), LOCAL)
        change(() => {
          if (typeof args.points === 'number') map.set('points', Math.max(0, args.points))
          if (!readSettings(doc).quiz) settingsMap(doc).set('quiz', true)
        })
        return { id: item.id, keyed: true }
      },
    },
    {
      name: 'set_settings',
      description: 'Changes the form settings: description, quiz, shuffle_questions, collect_group, accepting (responses), release ("immediate" or "manual" grades), show_correct (answers after release), confirmation (message after sending).',
      inputSchema: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          quiz: { type: 'boolean' },
          shuffle_questions: { type: 'boolean' },
          collect_group: { type: 'boolean' },
          accepting: { type: 'boolean' },
          release: { type: 'string', enum: ['immediate', 'manual'] },
          show_correct: { type: 'boolean' },
          confirmation: { type: 'string' },
        },
      },
      access: 'edit',
      changesDocument: true,
      summary: () => t('Change the form settings'),
      execute: (args) => {
        editable()
        const names: Record<string, string> = { description: 'description', quiz: 'quiz', shuffle_questions: 'shuffleQuestions', collect_group: 'collectGroup', accepting: 'accepting', release: 'release', show_correct: 'showCorrect', confirmation: 'confirmation' }
        const changed: string[] = []
        change(() => {
          for (const [arg, key] of Object.entries(names)) {
            const value = args[arg]
            if (value === undefined) continue
            if (arg === 'release' && value !== 'immediate' && value !== 'manual') throw new Error('release must be "immediate" or "manual"')
            if (typeof value !== (['description', 'release', 'confirmation'].includes(arg) ? 'string' : 'boolean')) throw new Error(`Invalid value for ${arg}`)
            settingsMap(doc).set(key, value)
            changed.push(arg)
          }
        })
        if (!changed.length) throw new Error('Nothing to change')
        return { changed }
      },
    },
    {
      name: 'create_variant',
      description: 'Editors only: makes a new form (a copy with its answer key) with the questions shuffled within each section and the options shuffled, for another group, and opens it in a new tab. The user confirms it.',
      inputSchema: { type: 'object', properties: { title: { type: 'string' }, shuffle_options: { type: 'boolean', description: 'Default true.' } } },
      access: 'edit',
      readOnly: false,
      confirm: (args) => t('Create a new form “{title}” with the questions shuffled and open it in a new tab', { title: optStr(args, 'title') || variantTitle() }),
      execute: async (args) => {
        const priv = privOf()
        const file = formFile(doc, priv)
        const shuffle = <T>(list: T[]) => {
          const out = [...list]
          for (let i = out.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[out[i], out[j]] = [out[j], out[i]]
          }
          return out
        }
        // Questions move only within their section.
        const blocks: Item[][] = [[]]
        for (const item of file.items as Item[]) {
          if (item.kind === 'section') blocks.push([item])
          else blocks[blocks.length - 1].push(item)
        }
        const shuffleOptions = args.shuffle_options !== false
        file.items = blocks.flatMap((block) => {
          const [head, ...rest] = block[0]?.kind === 'section' ? block : [null, ...block]
          const questions = shuffle(rest as Item[]).map((q) => (shuffleOptions && hasOptions(q.type) ? { ...q, options: shuffle(q.options) } : q))
          return head ? [head as Item, ...questions] : questions
        })
        file.title = optStr(args, 'title')?.trim() || variantTitle()
        const [{ createForm }, { absoluteUrl }] = await Promise.all([import('./model'), import('../../core/router')])
        const tab = window.open(absoluteUrl(await createForm(file)), '_blank')
        if (tab) tab.opener = null
        return { created: true, title: file.title, opened: !!tab }
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
