// What the help onboarding remembers in this browser (localStorage, never
// required: private windows or blocked storage only mean the tour shows again).
//
// Opt-outs (automated tests, kiosks, managed deployments):
//   ?notour in the URL              turns the welcome tour and the quick starts off in this browser
//   localStorage words-online:help:off = '1'   the same
//   navigator.webdriver (Playwright, Selenium) skips them unless the URL has ?tour

const WELCOME = 'words-online:help:welcome'
const TIPS = 'words-online:help:tips'
const OFF = 'words-online:help:off'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage unavailable: it only lasts for this page.
  }
}

// True when onboarding must not open by itself.
export function onboardingOff(): boolean {
  const query = new URLSearchParams(location.search)
  if (query.has('tour')) return false
  if (query.has('notour')) {
    write(OFF, '1')
    return true
  }
  return read(OFF) === '1' || navigator.webdriver === true
}

export const welcomeSeen = (): boolean => read(WELCOME) === '1'
export const markWelcomeSeen = (): void => write(WELCOME, '1')

function seenTips(): string[] {
  try {
    const list = JSON.parse(read(TIPS) ?? '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export const tipsSeen = (key: string): boolean => seenTips().includes(key)
export function markTipsSeen(key: string): void {
  const list = seenTips()
  if (!list.includes(key)) write(TIPS, JSON.stringify([...list, key]))
}
