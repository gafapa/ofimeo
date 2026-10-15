// WebMCP on/off switch, per browser (localStorage), off by default. Changes in
// another tab of the same browser apply here too (storage event). A school
// configuration can forbid it (school-config.ts): then it stays off.

import { webMcpForbidden } from '../school-config'

const KEY = 'ofimeo:webmcp'
const listeners = new Set<(on: boolean) => void>()

export function isWebMcpEnabled(): boolean {
  if (webMcpForbidden()) return false
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setWebMcpEnabled(on: boolean): void {
  if (on && webMcpForbidden()) return
  try {
    if (on) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    // Storage unavailable: the switch lasts for this page only.
  }
  listeners.forEach((fn) => fn(on))
}

export function onWebMcpChange(fn: (on: boolean) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) listeners.forEach((fn) => fn(e.newValue === '1'))
  })
}

// Review mode (per browser): the assistant's changes are proposed and wait
// for the user to accept them (proposals.ts) instead of being applied.
const REVIEW_KEY = 'ofimeo:webmcp:review'
let reviewInPage: boolean | null = null
const reviewListeners = new Set<(on: boolean) => void>()

export function isReviewMode(): boolean {
  if (reviewInPage !== null) return reviewInPage
  try {
    return localStorage.getItem(REVIEW_KEY) === '1'
  } catch {
    return false
  }
}

export function setReviewMode(on: boolean): void {
  try {
    if (on) localStorage.setItem(REVIEW_KEY, '1')
    else localStorage.removeItem(REVIEW_KEY)
    reviewInPage = null
  } catch {
    reviewInPage = on
  }
  reviewListeners.forEach((fn) => fn(on))
}

export function onReviewModeChange(fn: (on: boolean) => void): () => void {
  reviewListeners.add(fn)
  return () => reviewListeners.delete(fn)
}
