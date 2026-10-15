// What the assistant did in this page: a short log of its calls (shown in the
// indicator's dialog), the rate limit of its changes, and when it last changed
// the document compared with the user (for the undo tool).

export interface ActivityEntry {
  time: number
  tool: string
  // Short summary of the arguments (never more than SUMMARY characters).
  args: string
  ok: boolean
  write: boolean
  // Error message or 'proposed' / 'declined'.
  note?: string
}

const MAX_ENTRIES = 100
const SUMMARY = 200
// Changing calls allowed per minute.
export const MAX_CHANGES_PER_MINUTE = 120
// Arguments larger than this are refused.
export const MAX_INPUT_CHARS = 1_000_000

const entries: ActivityEntry[] = []
const changeTimes: number[] = []
const listeners = new Set<() => void>()

export function summarizeArgs(args: unknown): string {
  let text = ''
  try {
    text = JSON.stringify(args ?? {}) ?? ''
  } catch {
    text = String(args)
  }
  return text.length > SUMMARY ? `${text.slice(0, SUMMARY - 1)}…` : text
}

export function logActivity(entry: ActivityEntry): void {
  entries.unshift(entry)
  entries.length = Math.min(entries.length, MAX_ENTRIES)
  listeners.forEach((fn) => fn())
}

export const activityLog = (): readonly ActivityEntry[] => entries

export function onActivity(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Throws when the assistant made too many changes in the last minute.
export function checkRate(now = Date.now()): void {
  while (changeTimes.length && now - changeTimes[0] > 60_000) changeTimes.shift()
  if (changeTimes.length >= MAX_CHANGES_PER_MINUTE) throw new Error(`Too many changes: at most ${MAX_CHANGES_PER_MINUTE} per minute. Wait a moment or use apply_batch.`)
  changeTimes.push(now)
}

// ---------- Who changed the document last ----------

// While a tool runs, and shortly after (some apps write to the shared document
// asynchronously), local changes are counted as the assistant's.
const AI_GRACE_MS = 2000
let aiCalls = 0
let aiUntil = 0
let lastAiChange = 0
let lastUserChange = 0

export function aiCallStarted(): void {
  aiCalls++
}

export function aiCallEnded(changed: boolean): void {
  aiCalls = Math.max(0, aiCalls - 1)
  aiUntil = Date.now() + AI_GRACE_MS
  if (changed) lastAiChange = Date.now()
}

// Called for every local change of the shared document.
export function localChange(now = Date.now()): void {
  if (aiCalls > 0 || now <= aiUntil) lastAiChange = Math.max(lastAiChange, now)
  else lastUserChange = now
}

// True when the latest local change was not the assistant's.
export const userChangedLast = () => lastUserChange > lastAiChange

// For tests.
export function resetActivity(): void {
  entries.length = 0
  changeTimes.length = 0
  aiCalls = aiUntil = lastAiChange = lastUserChange = 0
}
