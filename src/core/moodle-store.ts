// What this browser keeps for Moodle (src/core/moodle.ts): the account (token
// and site information, never the password) and the last task list, for
// offline use. Small on purpose: the app chrome imports it to know whether
// "Hand in to Moodle" applies; the rest is loaded on demand.

export interface MoodleAccount {
  site: string
  token: string
  siteName: string
  fullName: string
  userName?: string
  userId: number
  // How the last call reached Moodle.
  transport: 'direct' | 'relay'
  // The person's upload limit (bytes), from the site information.
  maxUpload?: number
  connectedAt: number
}

export interface MoodleTaskFile {
  name: string
  url: string
  size?: number
  mimetype?: string
}

export interface MoodleTask {
  id: number
  cmid: number
  courseId: number
  courseName: string
  name: string
  // Description as HTML from Moodle: sanitized before it is shown (ui/moodle.ts).
  intro: string
  files: MoodleTaskFile[]
  // Unix seconds, 0 when not set.
  due: number
  cutoff: number
  allowFrom: number
  extensionDue: number
  // new, draft, submitted, reopened…
  status: string
  submittedAt?: number
  submittedFiles: { name: string; size?: number }[]
  gradingStatus?: string
  graded: boolean
  // Shown once released: grade as Moodle formats it, feedback comments (HTML).
  grade?: string
  feedback?: string
  // File submissions (undefined: not enabled). maxBytes 0: the course/site limit.
  fileSubmission?: { maxFiles: number; maxBytes: number; types: string[] }
  onlineText: boolean
  noSubmissions: boolean
  // "Require students to click the submit button".
  submitButton: boolean
  requireStatement: boolean
  statement?: string
  canEdit?: boolean
  locked: boolean
  link: string
}

export interface TaskCache {
  site: string
  userId: number
  updated: number
  tasks: MoodleTask[]
}

const ACCOUNT_KEY = 'words-online:moodle'
const TASKS_KEY = 'words-online:moodle-tasks'

export function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeLocal(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Private mode or storage full: kept only for this page.
  }
}

let memoryAccount: MoodleAccount | null | undefined

export function loadMoodleAccount(): MoodleAccount | null {
  if (memoryAccount !== undefined) return memoryAccount
  try {
    const value = JSON.parse(readLocal(ACCOUNT_KEY) || 'null') as MoodleAccount | null
    return value?.site && value.token ? value : null
  } catch {
    return null
  }
}

export function saveMoodleAccount(account: MoodleAccount): void {
  writeLocal(ACCOUNT_KEY, JSON.stringify(account))
  memoryAccount = readLocal(ACCOUNT_KEY) ? undefined : account
  notify()
}

export function clearMoodleAccount(): void {
  writeLocal(ACCOUNT_KEY, null)
  memoryAccount = undefined
  notify()
}

export const hasMoodleAccount = (): boolean => !!loadMoodleAccount()

export function loadTaskCache(): TaskCache | null {
  try {
    const cache = JSON.parse(readLocal(TASKS_KEY) || 'null') as TaskCache | null
    const account = loadMoodleAccount()
    return cache && account && cache.site === account.site && cache.userId === account.userId && Array.isArray(cache.tasks) ? cache : null
  } catch {
    return null
  }
}

export function saveTaskCache(cache: TaskCache | null): void {
  writeLocal(TASKS_KEY, cache ? JSON.stringify(cache) : null)
  notify()
}

// Connection or task list changed (this tab).
const listeners = new Set<() => void>()
export function onMoodleChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function notify(): void {
  for (const fn of listeners) fn()
}
