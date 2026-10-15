// Questions described in a compact form (WebMCP: create_document, add_questions,
// set_answer_key): options as labels, correct answers as labels, accepted texts
// or a number. Turned into form items and their answer keys.

import { emptyKey, hasOptions, newId, newQuestion, QUESTION_TYPES, type AnswerKey, type Item, type QuestionType } from './model'

export interface QuestionSpec {
  // 'section' starts a new section (title and description only).
  type: QuestionType | 'section'
  title: string
  description?: string
  required?: boolean
  options?: string[]
  // Choice types: labels of the right options; short answers: accepted texts;
  // number: the value (with tolerance); others: exact values.
  correct?: string[] | string | number
  tolerance?: number
  points?: number
  // Shown after answering (quizzes).
  feedback_correct?: string
  feedback_wrong?: string
}

export const SPEC_TYPES = [...QUESTION_TYPES, 'section'] as const

// The answer key for a question from the spec's "correct" (null: none given).
export function keyFor(item: Pick<Item, 'type' | 'options'>, spec: Pick<QuestionSpec, 'correct' | 'tolerance' | 'feedback_correct' | 'feedback_wrong'>): AnswerKey | null {
  if (spec.correct === undefined || spec.correct === null) return null
  const key = emptyKey()
  key.feedbackCorrect = spec.feedback_correct ?? ''
  key.feedbackWrong = spec.feedback_wrong ?? ''
  const list = (Array.isArray(spec.correct) ? spec.correct : [spec.correct]).map(String)
  if (item.type === 'number') {
    const value = Number(String(Array.isArray(spec.correct) ? spec.correct[0] : spec.correct).replace(',', '.'))
    if (Number.isNaN(value)) throw new Error('The correct answer of a number question must be a number')
    key.value = value
    key.tolerance = Math.abs(spec.tolerance ?? 0)
    return key
  }
  if (hasOptions(item.type)) {
    key.correct = list.map((label) => {
      const option = item.options.find((o) => o.label.trim().toLowerCase() === label.trim().toLowerCase())
      if (!option) throw new Error(`"${label}" is not one of the options`)
      return option.id
    })
    if (item.type !== 'checkbox' && key.correct.length > 1) throw new Error('Only one correct option for this type of question')
    return key
  }
  key.correct = list.filter((x) => x.trim())
  return key
}

export function specToItem(spec: QuestionSpec): { item: Partial<Item> & { kind: Item['kind'] }; key: AnswerKey | null } {
  if (!SPEC_TYPES.includes(spec.type as never)) throw new Error(`Unknown question type "${spec.type}"`)
  if (spec.type === 'section') return { item: { id: newId(), kind: 'section', title: spec.title ?? '', description: spec.description ?? '' }, key: null }
  const item = { id: newId(), ...newQuestion(spec.type), title: spec.title ?? '', description: spec.description ?? '', required: !!spec.required } as Partial<Item> & { kind: 'question'; type: QuestionType }
  const labels = (spec.options ?? []).map(String).filter((x) => x.trim())
  if (labels.length && hasOptions(spec.type)) item.options = labels.map((label) => ({ id: newId(), label }))
  if (spec.points !== undefined) item.points = Math.max(0, Number(spec.points) || 0)
  const key = keyFor({ type: spec.type, options: item.options ?? [] }, spec)
  return { item, key }
}
