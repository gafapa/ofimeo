// WebMCP on/off switch, per browser (localStorage), off by default. Changes in
// another tab of the same browser apply here too (storage event).

const KEY = 'words-online:webmcp'
const listeners = new Set<(on: boolean) => void>()

export function isWebMcpEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setWebMcpEnabled(on: boolean): void {
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
