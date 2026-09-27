// Quiz grading: automatic points from the answer key, manual points from the
// editors (they override the automatic ones), and the feedback for respondents.

import { isKeyed, isOpen, questionsOf, type AnswerKey, type Answer, type FormResponse, type Grade, type Item } from './model'

export interface QuestionScore {
  // Points given (null: waiting for manual grading).
  points: number | null
  max: number
  // True/false when the key decides, null when there is no key.
  correct: boolean | null
  auto: number | null
}

export interface ScoreSheet {
  questions: Record<string, QuestionScore>
  score: number
  max: number
  // Questions still to be graded by hand.
  pending: number
}

const norm = (s: string) => s.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ')

// Automatic points for one answer (null when the question has no key or is open).
export function autoPoints(item: Item, key: AnswerKey | undefined, answer: Answer | undefined): { points: number; correct: boolean } | null {
  if (!key || !isKeyed(item, key)) return null
  const max = item.points
  switch (item.type) {
    case 'short': {
      const ok = typeof answer === 'string' && key.correct.some((c) => norm(c) === norm(answer))
      return { points: ok ? max : 0, correct: ok }
    }
    case 'choice':
    case 'dropdown': {
      const ok = typeof answer === 'string' && key.correct.includes(answer)
      return { points: ok ? max : 0, correct: ok }
    }
    case 'checkbox': {
      const chosen = new Set(Array.isArray(answer) ? answer : [])
      const ok = chosen.size === key.correct.length && key.correct.every((c) => chosen.has(c))
      return { points: ok ? max : 0, correct: ok }
    }
    case 'number': {
      const value = typeof answer === 'number' ? answer : Number(String(answer ?? '').replace(',', '.'))
      const ok = answer !== undefined && answer !== '' && !Number.isNaN(value) && Math.abs(value - key.value!) <= Math.abs(key.tolerance ?? 0) + 1e-9
      return { points: ok ? max : 0, correct: ok }
    }
    case 'grid': {
      const rows = Object.keys(key.rows)
      const given = answer && typeof answer === 'object' && !Array.isArray(answer) ? answer : {}
      const right = rows.filter((r) => given[r] === key.rows[r]).length
      return { points: round((max * right) / rows.length), correct: right === rows.length }
    }
    default: {
      const ok = answer !== undefined && key.correct.some((c) => norm(c) === norm(String(answer)))
      return { points: ok ? max : 0, correct: ok }
    }
  }
}

export const round = (n: number) => Math.round(n * 100) / 100

export function scoreResponse(items: Item[], keys: (id: string) => AnswerKey | undefined, response: FormResponse, grade?: Grade): ScoreSheet {
  const questions: Record<string, QuestionScore> = {}
  let score = 0
  let max = 0
  let pending = 0
  for (const item of questionsOf(items)) {
    const key = keys(item.id)
    const auto = autoPoints(item, key, response.answers[item.id])
    const manual = grade?.points[item.id]
    const graded = typeof manual === 'number'
    const points = graded ? manual : auto ? auto.points : null
    // Open questions and questions without a key wait for manual points (if they are worth any).
    const waits = points === null && item.points > 0 && (isOpen(item.type) || !auto)
    if (waits) pending++
    questions[item.id] = { points, max: item.points, correct: auto ? auto.correct : null, auto: auto ? auto.points : null }
    score += points ?? 0
    max += item.points
  }
  return { questions, score: round(score), max: round(max), pending }
}

// The result a respondent receives when grades are released.
export interface ReleasedResult {
  score: number
  max: number
  questions: Record<string, { points: number | null; max: number; correct: boolean | null; feedback: string; comment: string; answer?: string[] | Record<string, string> | number }>
  releasedAt: number
}

export function buildResult(items: Item[], keys: (id: string) => AnswerKey | undefined, response: FormResponse, grade: Grade | undefined, showCorrect: boolean): ReleasedResult {
  const sheet = scoreResponse(items, keys, response, grade)
  const questions: ReleasedResult['questions'] = {}
  for (const item of questionsOf(items)) {
    const key = keys(item.id)
    const q = sheet.questions[item.id]
    const given = response.answers[item.id]
    const chosen = Array.isArray(given) ? given : typeof given === 'string' ? [given] : []
    const feedback = [
      q.correct === true ? key?.feedbackCorrect : q.correct === false ? key?.feedbackWrong : '',
      ...chosen.map((c) => key?.optionFeedback?.[c] ?? ''),
    ]
      .filter(Boolean)
      .join(' ')
    let answer: ReleasedResult['questions'][string]['answer']
    if (showCorrect && key && isKeyed(item, key)) answer = item.type === 'number' ? key.value : item.type === 'grid' ? key.rows : key.correct
    questions[item.id] = { points: q.points, max: q.max, correct: q.correct, feedback, comment: grade?.comments[item.id] ?? '', answer }
  }
  return { score: sheet.score, max: sheet.max, questions, releasedAt: Date.now() }
}

// ---------- Statistics ----------

export function stats(values: number[]): { count: number; mean: number; median: number; min: number; max: number; sd: number } {
  const v = [...values].sort((a, b) => a - b)
  const count = v.length
  if (!count) return { count, mean: 0, median: 0, min: 0, max: 0, sd: 0 }
  const mean = v.reduce((a, b) => a + b, 0) / count
  const median = count % 2 ? v[(count - 1) / 2] : (v[count / 2 - 1] + v[count / 2]) / 2
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / count)
  return { count, mean: round(mean), median: round(median), min: v[0], max: v[count - 1], sd: round(sd) }
}

// Counts of values in `bins` equal ranges from 0 to `top`.
export function histogram(values: number[], top: number, bins = 10): { from: number; to: number; count: number }[] {
  const size = (top || 1) / bins
  const out = Array.from({ length: bins }, (_, i) => ({ from: round(i * size), to: round((i + 1) * size), count: 0 }))
  for (const v of values) out[Math.min(bins - 1, Math.max(0, Math.floor(v / size)))].count++
  return out
}
