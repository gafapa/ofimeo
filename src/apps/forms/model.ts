// Form model. Two Yjs documents:
//
//   public  session.doc, signed with the edit key (every link can read it):
//     meta.title
//     form-settings   Y.Map: description, quiz, shuffle, release mode, the
//                     public response key (X25519), Nextcloud drop share…
//     form-items      Y.Array<Y.Map>: sections and questions (no answers)
//     form-receipts   Y.Map: response id -> time an editor stored it (acknowledgment)
//     form-results    Y.Map: response id -> released grade, sealed to that respondent
//
//   private  editors only (vault channel, transport.ts; IndexedDB in their browsers):
//     answers         Y.Map: question id -> AnswerKey (correct answers, feedback)
//     responses       Y.Map: response id -> FormResponse (decrypted)
//     grades          Y.Map: response id -> Grade (manual points, comments, release)
//
// Respondents never receive the private document: answer keys and responses
// stay with the editors.

import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { createLocalDocument } from '../../core/session'
import { t } from '../../core/i18n'

export type QuestionType = 'short' | 'paragraph' | 'choice' | 'checkbox' | 'dropdown' | 'scale' | 'grid' | 'date' | 'time' | 'number'

export const QUESTION_TYPES: QuestionType[] = ['short', 'paragraph', 'choice', 'checkbox', 'dropdown', 'scale', 'grid', 'date', 'time', 'number']

export const typeLabel = (type: QuestionType): string =>
  ({
    short: t('Short answer'),
    paragraph: t('Paragraph'),
    choice: t('Multiple choice'),
    checkbox: t('Checkboxes'),
    dropdown: t('Dropdown'),
    scale: t('Linear scale'),
    grid: t('Multiple choice grid'),
    date: t('Date'),
    time: t('Time'),
    number: t('Number'),
  })[type]

export const hasOptions = (type: QuestionType) => type === 'choice' || type === 'checkbox' || type === 'dropdown'
// Questions graded by hand (no automatic key).
export const isOpen = (type: QuestionType) => type === 'paragraph'

export interface Option {
  id: string
  label: string
}

export interface Item {
  id: string
  kind: 'section' | 'question'
  type: QuestionType
  title: string
  description: string
  required: boolean
  // Shuffle the options (choice types) for each respondent.
  shuffle: boolean
  options: Option[] // choice types; grid columns
  rows: Option[] // grid rows
  min: number
  max: number
  minLabel: string
  maxLabel: string
  image: string // data: URL
  equation: string // LaTeX
  points: number
}

export interface AnswerKey {
  // Option ids (choice types), accepted texts (short answer) or exact values (scale, date, time).
  correct: string[]
  // Grid: row id -> column id.
  rows: Record<string, string>
  // Number questions: correct value and tolerance (±).
  value?: number
  tolerance?: number
  feedbackCorrect: string
  feedbackWrong: string
  // Feedback shown when an option is chosen.
  optionFeedback: Record<string, string>
}

export interface Settings {
  description: string
  quiz: boolean
  shuffleQuestions: boolean
  collectGroup: boolean
  onePerBrowser: boolean
  accepting: boolean
  // 'immediate': auto-graded results go back when an editor receives the response.
  release: 'immediate' | 'manual'
  showCorrect: boolean
  confirmation: string
  // Optional Nextcloud "File drop" share that also receives the (encrypted) responses.
  dropUrl: string
  dropPassword: string
  // X25519 public key responses are encrypted to (base64url).
  responseKey: string
}

export type Answer = string | string[] | number | Record<string, string>

export interface FormResponse {
  id: string
  form: string
  name: string
  group: string
  submittedAt: number
  answers: Record<string, Answer>
  // Respondent's public key (for the released result).
  epk: string
  receivedAt?: number
  via?: 'p2p' | 'file'
}

export interface Grade {
  points: Record<string, number>
  comments: Record<string, string>
  // Time the grade was released to the respondent.
  released?: number
}

export const DEFAULT_SETTINGS: Settings = {
  description: '',
  quiz: false,
  shuffleQuestions: false,
  collectGroup: true,
  onePerBrowser: false,
  accepting: true,
  release: 'manual',
  showCorrect: true,
  confirmation: '',
  dropUrl: '',
  dropPassword: '',
  responseKey: '',
}

export const newId = () => Math.random().toString(36).slice(2, 10)

export const settingsMap = (doc: Y.Doc) => doc.getMap<unknown>('form-settings')
export const itemsArray = (doc: Y.Doc) => doc.getArray<Y.Map<unknown>>('form-items')
export const receiptsMap = (doc: Y.Doc) => doc.getMap<number>('form-receipts')
export const resultsMap = (doc: Y.Doc) => doc.getMap<string>('form-results')
export const answersMap = (priv: Y.Doc) => priv.getMap<AnswerKey>('answers')
export const responsesMap = (priv: Y.Doc) => priv.getMap<FormResponse>('responses')
export const gradesMap = (priv: Y.Doc) => priv.getMap<Grade>('grades')

export const privateDbName = (docId: string) => `words-online:${docId}:forms-private`

export function readSettings(doc: Y.Doc): Settings {
  const map = settingsMap(doc)
  const out = { ...DEFAULT_SETTINGS } as Record<string, unknown>
  for (const key of Object.keys(DEFAULT_SETTINGS)) if (map.has(key)) out[key] = map.get(key)
  return out as unknown as Settings
}

const ITEM_DEFAULTS: Omit<Item, 'id' | 'kind'> = {
  type: 'choice',
  title: '',
  description: '',
  required: false,
  shuffle: false,
  options: [],
  rows: [],
  min: 1,
  max: 5,
  minLabel: '',
  maxLabel: '',
  image: '',
  equation: '',
  points: 1,
}

export function readItem(map: Y.Map<unknown>): Item {
  const out = { ...ITEM_DEFAULTS, id: String(map.get('id') ?? ''), kind: map.get('kind') === 'section' ? 'section' : 'question' } as Record<string, unknown>
  for (const key of Object.keys(ITEM_DEFAULTS)) if (map.has(key)) out[key] = map.get(key)
  return out as unknown as Item
}

export const readItems = (doc: Y.Doc): Item[] => itemsArray(doc).toArray().map(readItem)
export const questionsOf = (items: Item[]) => items.filter((i) => i.kind === 'question')

export function itemMap(item: Partial<Item> & { kind: Item['kind'] }): Y.Map<unknown> {
  const map = new Y.Map<unknown>()
  for (const [key, value] of Object.entries({ id: newId(), ...item })) if (value !== undefined) map.set(key, value)
  return map
}

// A new question of a type with sensible starting content.
export function newQuestion(type: QuestionType): Partial<Item> & { kind: 'question' } {
  const base: Partial<Item> & { kind: 'question' } = { kind: 'question', type, title: '', required: false, points: 1 }
  if (hasOptions(type)) base.options = [{ id: newId(), label: t('Option {n}', { n: 1 }) }]
  if (type === 'grid') {
    base.rows = [1, 2].map((n) => ({ id: newId(), label: t('Row {n}', { n }) }))
    base.options = [1, 2, 3].map((n) => ({ id: newId(), label: t('Column {n}', { n }) }))
  }
  if (type === 'scale') Object.assign(base, { min: 1, max: 5 })
  return base
}

export const emptyKey = (): AnswerKey => ({ correct: [], rows: {}, feedbackCorrect: '', feedbackWrong: '', optionFeedback: {} })
export const readKey = (priv: Y.Doc, id: string): AnswerKey => ({ ...emptyKey(), ...(answersMap(priv).get(id) ?? {}) })

// Whether a question has an answer key (can be graded automatically).
export function isKeyed(item: Item, key: AnswerKey | undefined): boolean {
  if (!key || isOpen(item.type)) return false
  if (item.type === 'number') return typeof key.value === 'number' && !Number.isNaN(key.value)
  if (item.type === 'grid') return Object.keys(key.rows).length > 0
  return key.correct.length > 0
}

// ---------- Form files (.oform) ----------

export interface FormFile {
  format: 'ofimeo-form'
  version: 1
  title: string
  settings: Partial<Settings>
  items: (Partial<Item> & { kind: Item['kind'] })[]
  // Present only when an editor exports it.
  answers?: Record<string, AnswerKey>
}

export function formFile(doc: Y.Doc, priv: Y.Doc | null): FormFile {
  const settings: Partial<Settings> = readSettings(doc)
  delete settings.responseKey
  const answers = priv ? (Object.fromEntries(answersMap(priv).entries()) as Record<string, AnswerKey>) : undefined
  return { format: 'ofimeo-form', version: 1, title: String(doc.getMap('meta').get('title') ?? ''), settings, items: readItems(doc), answers }
}

export function parseFormFile(text: string): FormFile {
  const data = JSON.parse(text) as FormFile
  if (data?.format !== 'ofimeo-form' || !Array.isArray(data.items)) throw new Error(t('This file is not an Ofimeo form.'))
  return data
}

// Creates a new local form (public definition plus private answer key); returns its path.
export async function createForm(file: FormFile): Promise<string> {
  const path = await createLocalDocument('forms', file.title, (doc) => {
    const settings = settingsMap(doc)
    for (const [key, value] of Object.entries(file.settings ?? {})) if (key !== 'responseKey') settings.set(key, value)
    itemsArray(doc).push(file.items.map((i) => itemMap(i)))
  })
  if (file.answers && Object.keys(file.answers).length) {
    const id = new URLSearchParams(path.split('#')[1]).get('doc')!
    const priv = new Y.Doc()
    const answers = answersMap(priv)
    for (const [qid, key] of Object.entries(file.answers)) answers.set(qid, key)
    const persistence = new IndexeddbPersistence(privateDbName(id), priv)
    await persistence.whenSynced
    await persistence.destroy()
    const check = new IndexeddbPersistence(privateDbName(id), new Y.Doc())
    await check.whenSynced
    await check.destroy()
  }
  return path
}

// ---------- Presenting answers ----------

// An answer as text (summary, exports).
export function answerText(item: Item, answer: Answer | undefined): string {
  if (answer === undefined || answer === null || answer === '') return ''
  const label = (id: string) => item.options.find((o) => o.id === id)?.label ?? id
  if (hasOptions(item.type)) return (Array.isArray(answer) ? answer : [String(answer)]).map(label).join('; ')
  if (item.type === 'grid' && typeof answer === 'object' && !Array.isArray(answer))
    return item.rows
      .filter((r) => answer[r.id])
      .map((r) => `${r.label}: ${label(answer[r.id])}`)
      .join('; ')
  return String(answer)
}

export function isAnswered(answer: Answer | undefined): boolean {
  if (answer === undefined || answer === null || answer === '') return false
  if (Array.isArray(answer)) return answer.length > 0
  if (typeof answer === 'object') return Object.keys(answer).length > 0
  return true
}
