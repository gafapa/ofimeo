// Accessibility preferences for the whole suite, stored per browser: reading
// fonts, UI zoom, text spacing, themes, reduced motion, large cursor and focus
// rings, reading ruler, read aloud and dictation. Everything is display only:
// documents keep their own fonts and formatting. Read aloud and dictation are
// set up here and used from quick buttons in each app bar (speechButtons) or
// with Alt+Shift+R / Alt+Shift+D.

import '@fontsource/opendyslexic/400.css'
import '@fontsource/opendyslexic/700.css'
import '@fontsource/opendyslexic/400-italic.css'
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import '@fontsource/atkinson-hyperlegible/400-italic.css'
import './accessibility.css'
import { Accessibility, CircleStop, Mic, Volume2, X } from 'lucide'
import { languageSelect, t } from '../core/i18n'
import * as speech from './speech'
import { el, icon, toast } from './widgets'

type Theme = 'light' | 'dark' | 'system' | 'contrast-dark' | 'contrast-light'
type Font = 'default' | 'opendyslexic' | 'atkinson'

interface Prefs {
  font: Font
  docFont: boolean // reading font also in document content
  zoom: number // UI zoom, percent
  lineSpacing: number // 0 = the document's own
  letterSpacing: number // em; 0 = normal
  theme: Theme
  reduceMotion: boolean
  bigCursor: boolean
  bigFocus: boolean
  ruler: 'off' | 'ruler' | 'mask'
  voice: string // voiceURI; '' = automatic
  rate: number
  readLang: speech.ReadLang
  dictLang: string // 'auto' or a BCP 47 tag
  readButton: boolean // quick button in the app bars
  dictButton: boolean
}

const DEFAULTS: Prefs = {
  font: 'default',
  docFont: false,
  zoom: 100,
  lineSpacing: 0,
  letterSpacing: 0,
  theme: 'light',
  reduceMotion: false,
  bigCursor: false,
  bigFocus: false,
  ruler: 'off',
  voice: '',
  rate: 1,
  readLang: 'auto',
  dictLang: 'auto',
  readButton: false,
  dictButton: false,
}

const KEY = 'ofimeo:a11y'
let prefs = load()

function load(): Prefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return { ...DEFAULTS }
  }
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // Private mode: preferences last for this page only.
  }
}

function update(patch: Partial<Prefs>): void {
  prefs = { ...prefs, ...patch }
  save()
  apply()
}

// ---------- Applying preferences ----------

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')

function apply(): void {
  const root = document.documentElement
  const set = (name: string, value: string | null) => (value === null ? root.removeAttribute(name) : root.setAttribute(name, value))
  set('data-a11y-font', prefs.font === 'default' ? null : prefs.font)
  set('data-a11y-docfont', prefs.docFont && prefs.font !== 'default' ? '' : null)
  root.style.setProperty('--a11y-ui-zoom', String(prefs.zoom / 100))
  set('data-a11y-line', prefs.lineSpacing ? '' : null)
  root.style.setProperty('--a11y-line', String(prefs.lineSpacing || 'normal'))
  set('data-a11y-letter', prefs.letterSpacing ? '' : null)
  root.style.setProperty('--a11y-letter', `${prefs.letterSpacing}em`)
  root.style.setProperty('--a11y-word', `${prefs.letterSpacing * 1.33}em`)
  const theme = prefs.theme === 'system' ? (darkQuery.matches ? 'dark' : 'light') : prefs.theme
  set('data-a11y-theme', theme === 'light' ? null : theme)
  set('data-a11y-motion', prefs.reduceMotion ? 'reduce' : null)
  set('data-a11y-cursor', prefs.bigCursor ? 'large' : null)
  set('data-a11y-focus', prefs.bigFocus ? 'large' : null)
  updateRuler()
  syncPanel?.()
  syncQuick()
}

// ---------- Reading ruler / focus mask ----------

let ruler: { band: HTMLElement; above: HTMLElement; below: HTMLElement } | null = null
let rulerY = window.innerHeight / 3

function updateRuler(): void {
  if (prefs.ruler === 'off') {
    ruler?.band.remove()
    ruler?.above.remove()
    ruler?.below.remove()
    ruler = null
    return
  }
  if (!ruler) {
    ruler = {
      band: el('div', { class: 'a11y-ruler' }),
      above: el('div', { class: 'a11y-mask above' }),
      below: el('div', { class: 'a11y-mask below' }),
    }
    for (const node of Object.values(ruler)) node.setAttribute('aria-hidden', 'true')
    document.body.append(ruler.above, ruler.below, ruler.band)
  }
  const mask = prefs.ruler === 'mask'
  ruler.band.classList.toggle('mask', mask)
  ruler.above.hidden = ruler.below.hidden = !mask
  placeRuler(rulerY)
}

function placeRuler(y: number): void {
  rulerY = y
  if (!ruler) return
  const half = (24 * prefs.zoom) / 100
  const top = Math.max(0, y - half)
  ruler.band.style.top = `${top}px`
  ruler.band.style.height = `${half * 2}px`
  ruler.above.style.height = `${top}px`
  ruler.below.style.top = `${top + half * 2}px`
}

let rulerFrame = 0
const moveRuler = (y: number) => {
  cancelAnimationFrame(rulerFrame)
  rulerFrame = requestAnimationFrame(() => placeRuler(y))
}

// ---------- Focus and caret tracking (for dictation and read aloud) ----------

let lastEditable: HTMLElement | null = null
let lastRange: Range | null = null

const isTextInput = (node: Element): node is HTMLInputElement | HTMLTextAreaElement =>
  node instanceof HTMLTextAreaElement ||
  (node instanceof HTMLInputElement && /^(text|search|url|email|tel|)$/.test(node.type))

const editableOf = (node: Element | null): HTMLElement | null => {
  if (!node || node.closest('.a11y-panel, .a11y-dictation')) return null
  if (isTextInput(node) && !node.readOnly) return node
  return (node.closest('[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]') as HTMLElement | null)
}

function trackFocus(): void {
  document.addEventListener('focusin', (e) => {
    const editable = editableOf(e.target as Element)
    if (editable) lastEditable = editable
  })
  document.addEventListener('selectionchange', () => {
    const sel = document.getSelection()
    if (!sel || !sel.rangeCount) return
    const range = sel.getRangeAt(0)
    const container = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement
    if (!container || container.closest('.a11y-panel, .a11y-dictation')) return
    lastRange = range.cloneRange()
    // The ruler follows the keyboard caret in editors.
    if (ruler && editableOf(container)) {
      let rect = range.getClientRects()[0] ?? range.getBoundingClientRect()
      // An empty line has no caret box: use its block.
      if (!rect.height) rect = container.getBoundingClientRect()
      if (rect.height) moveRuler(rect.top + Math.min(rect.height, 40) / 2)
    }
  })
  document.addEventListener('pointermove', (e) => ruler && moveRuler(e.clientY), { passive: true })
}

// ---------- Read aloud ----------

function currentSource(scope: 'auto' | 'all'): speech.Source {
  const active = document.activeElement
  if (scope === 'auto' && active && isTextInput(active) && active.selectionStart !== active.selectionEnd) {
    return { text: active.value.slice(active.selectionStart ?? 0, active.selectionEnd ?? 0), segments: [] }
  }
  const sel = document.getSelection()
  const live = sel && sel.rangeCount ? sel.getRangeAt(0) : null
  const liveOk = live && !(live.startContainer.parentElement?.closest('.a11y-panel'))
  const range = liveOk && !live.collapsed ? live : lastRange && !lastRange.collapsed ? lastRange : liveOk ? live : lastRange
  if (scope === 'auto' && range) {
    if (!range.collapsed) return speech.sourceFromRange(range)
    const start = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement
    const editable = editableOf(start)
    const block = editable && start?.closest('p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, pre')
    if (block && editable.contains(block)) return sourceOf(block)
  }
  // Whole document: the focused editor, the writer, or the main area.
  const start = range && (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)
  const root =
    editableOf(start ?? null) ??
    document.querySelector<HTMLElement>('#app-main .ProseMirror') ??
    document.querySelector<HTMLElement>('#app-main, .home')
  return root ? sourceOf(root) : { text: '', segments: [] }
}

function sourceOf(node: Node): speech.Source {
  const range = document.createRange()
  range.selectNodeContents(node)
  return speech.sourceFromRange(range)
}

function readAloud(scope: 'auto' | 'all'): void {
  if (speech.isReading()) return speech.stopReading()
  speech.speak(currentSource(scope), { lang: prefs.readLang, voiceURI: prefs.voice, rate: prefs.rate })
}

// ---------- Dictation ----------

let bubble: HTMLElement | null = null

function dictationBubble(): HTMLElement {
  if (bubble) return bubble
  const stop = el('button', { type: 'button', class: 'a11y-bubble-stop' }, icon(CircleStop, 14), t('Stop'))
  stop.addEventListener('mousedown', (e) => e.preventDefault())
  stop.addEventListener('click', () => toggleDictation(false))
  bubble = el(
    'div',
    { class: 'a11y-dictation', role: 'status' },
    el('span', { class: 'a11y-rec-dot' }),
    el('span', { class: 'a11y-bubble-text', textContent: t('Listening… speak now.') }),
    stop,
  )
  bubble.hidden = true
  document.body.append(bubble)
  return bubble
}

function dictationLang(): string {
  if (prefs.dictLang !== 'auto') return prefs.dictLang
  const lang = (lastEditable?.closest('[lang]')?.getAttribute('lang') || navigator.language).slice(0, 2)
  return (speech.SPEECH_TAGS as Record<string, string>)[lang] ?? navigator.language
}

// Inserts text at the caret of the last focused text field, as if typed.
export function insertAtCaret(raw: string): boolean {
  const target = lastEditable
  if (!target || !target.isConnected) return false
  if (document.activeElement !== target && !target.contains(document.activeElement)) {
    target.focus({ preventScroll: true })
    if (!isTextInput(target) && lastRange && target.contains(lastRange.startContainer)) {
      const sel = document.getSelection()!
      sel.removeAllRanges()
      sel.addRange(lastRange)
    }
  }
  let before = ''
  if (isTextInput(target)) before = target.value.slice(0, target.selectionStart ?? 0).slice(-1)
  else {
    const sel = document.getSelection()
    const range = sel?.rangeCount ? sel.getRangeAt(0) : null
    if (range?.startContainer.nodeType === Node.TEXT_NODE) before = (range.startContainer as Text).data.slice(0, range.startOffset).slice(-1)
  }
  const text = (before && !/\s/.test(before) ? ' ' : '') + raw.trim()
  if (!text.trim()) return true
  if (!document.execCommand('insertText', false, text) && isTextInput(target)) {
    target.setRangeText(text, target.selectionStart ?? 0, target.selectionEnd ?? 0, 'end')
    target.dispatchEvent(new Event('input', { bubbles: true }))
  }
  return true
}

function toggleDictation(on = !speech.isDictating()): void {
  const node = dictationBubble()
  const text = node.querySelector('.a11y-bubble-text')!
  if (!on) {
    speech.stopDictation()
    node.hidden = true
    setStatus(t('Dictation stopped.'))
    syncPanel?.()
    syncQuick()
    return
  }
  if (speech.dictationStatus() !== 'ok') {
    setStatus(speech.dictationStatusText(), true)
    return
  }
  if (!lastEditable || !lastEditable.isConnected) {
    setStatus(t('Click in the text where the dictation should go, then start dictation.'), true)
    return
  }
  speech.startDictation(dictationLang(), {
    onText: (said) => {
      if (!insertAtCaret(said)) setStatus(t('Click in the text where the dictation should go, then start dictation.'), true)
      text.textContent = t('Listening… speak now.')
    },
    onInterim: (said) => (text.textContent = said || t('Listening… speak now.')),
    onState: (active, message) => {
      node.hidden = !active
      if (message) setStatus(message, !active)
      syncPanel?.()
      syncQuick()
    },
  })
}

// ---------- Panel ----------

let panel: HTMLElement | null = null
let statusLine: HTMLElement | null = null
let syncPanel: (() => void) | null = null
let returnFocus: HTMLElement | null = null
const openers = new Set<HTMLButtonElement>()

function setStatus(message: string, important = false): void {
  if (statusLine) statusLine.textContent = message
  if (message && important && (!panel || panel.hidden)) toast(message)
}

function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  return el('label', { class: 'a11y-field' }, el('span', { textContent: label }), control, hint ? el('small', { textContent: hint }) : null)
}

function select<T extends string | number>(options: [T, string][], value: () => T, onChange: (v: T) => void): HTMLSelectElement {
  const node = el('select', { class: 'field' })
  const fill = () => {
    node.replaceChildren(...options.map(([v, label]) => el('option', { value: String(v), textContent: label })))
    node.value = String(value())
  }
  fill()
  node.addEventListener('change', () => onChange(options.find(([v]) => String(v) === node.value)![0]))
  return node
}

function checkbox(label: string, value: () => boolean, onChange: (v: boolean) => void, hint?: string): HTMLElement {
  const input = el('input', { type: 'checkbox', checked: value() })
  input.addEventListener('change', () => onChange(input.checked))
  return el('label', { class: 'a11y-check' }, input, el('span', {}, label, hint ? el('small', { textContent: hint }) : null))
}

function buildPanel(): HTMLElement {
  const title = el('h2', { id: 'a11y-title', textContent: t('Accessibility') })
  const close = el('button', { type: 'button', class: 'a11y-close', title: t('Close') }, icon(X, 18))
  close.setAttribute('aria-label', t('Close'))
  close.addEventListener('click', () => togglePanel(false))

  const controls: (() => void)[] = []
  const bind = <E extends HTMLElement>(node: E, sync: (n: E) => void): E => {
    controls.push(() => sync(node))
    return node
  }

  // Reading
  const zoomValue = el('output', {})
  const zoom = el('input', { type: 'range', min: '100', max: '200', step: '10', class: 'a11y-range' })
  zoom.addEventListener('input', () => update({ zoom: Number(zoom.value) }))
  zoom.setAttribute('aria-describedby', 'a11y-zoom-value')
  zoomValue.id = 'a11y-zoom-value'
  const fontSelect = select<Font>(
    [['default', t('Default')], ['opendyslexic', 'OpenDyslexic'], ['atkinson', 'Atkinson Hyperlegible']],
    () => prefs.font,
    (font) => update({ font }),
  )
  const docFont = checkbox(t('Also in documents'), () => prefs.docFont, (docFont) => update({ docFont }), t('Display only: the saved fonts do not change, and page breaks may move while it is on.'))
  const reading = el(
    'fieldset',
    { class: 'a11y-group' },
    el('legend', { textContent: t('Reading') }),
    field(t('Reading font'), bind(fontSelect, (n) => (n.value = prefs.font))),
    bind(docFont, (n) => {
      const input = n.querySelector('input')!
      input.checked = prefs.docFont
      input.disabled = prefs.font === 'default'
    }),
    field(t('Text size'), el('span', { class: 'a11y-range-row' }, bind(zoom, (n) => (n.value = String(prefs.zoom))), bind(zoomValue, (n) => (n.textContent = `${prefs.zoom}%`)))),
    el(
      'div',
      { class: 'a11y-row' },
      field(
        t('Line spacing'),
        bind(select<number>([[0, t('Original')], [1.5, '1.5'], [1.8, '1.8'], [2, '2'], [2.5, '2.5']], () => prefs.lineSpacing, (lineSpacing) => update({ lineSpacing })), (n) => (n.value = String(prefs.lineSpacing))),
      ),
      field(
        t('Letter spacing'),
        bind(select<number>([[0, t('Normal')], [0.05, t('Wide')], [0.12, t('Wider')]], () => prefs.letterSpacing, (letterSpacing) => update({ letterSpacing })), (n) => (n.value = String(prefs.letterSpacing))),
      ),
    ),
    el('small', { class: 'a11y-note', textContent: t('Spacing applies to documents on screen only (display only).') }),
  )

  // Display
  const display = el(
    'fieldset',
    { class: 'a11y-group' },
    el('legend', { textContent: t('Display') }),
    field(t('Interface language'), languageSelect('field a11y-language')),
    field(
      t('Theme'),
      bind(
        select<Theme>(
          [['light', t('Light')], ['dark', t('Dark')], ['system', t('Same as the system')], ['contrast-dark', t('High contrast (dark)')], ['contrast-light', t('High contrast (light)')]],
          () => prefs.theme,
          (theme) => update({ theme }),
        ),
        (n) => (n.value = prefs.theme),
      ),
    ),
    field(
      t('Reading ruler'),
      bind(
        select<Prefs['ruler']>([['off', t('Off')], ['ruler', t('Ruler (highlight line)')], ['mask', t('Focus mask (dim the rest)')]], () => prefs.ruler, (r) => update({ ruler: r })),
        (n) => (n.value = prefs.ruler),
      ),
      t('Follows the pointer, and the text cursor in documents.'),
    ),
    bind(checkbox(t('Reduce motion'), () => prefs.reduceMotion, (reduceMotion) => update({ reduceMotion })), (n) => (n.querySelector('input')!.checked = prefs.reduceMotion)),
    bind(checkbox(t('Large mouse pointer'), () => prefs.bigCursor, (bigCursor) => update({ bigCursor })), (n) => (n.querySelector('input')!.checked = prefs.bigCursor)),
    bind(checkbox(t('Thick focus outline'), () => prefs.bigFocus, (bigFocus) => update({ bigFocus })), (n) => (n.querySelector('input')!.checked = prefs.bigFocus)),
  )

  // Read aloud
  const voiceSelect = el('select', { class: 'field' })
  const fillVoices = () => {
    const voices = speech.listVoices()
    voiceSelect.replaceChildren(
      el('option', { value: '', textContent: t('Automatic (by language)') }),
      ...voices
        .filter((v) => /^(es|gl|en|fr|de)/i.test(v.lang) || v.voiceURI === prefs.voice)
        .map((v) => el('option', { value: v.voiceURI, textContent: `${v.name} (${v.lang})` })),
    )
    voiceSelect.value = prefs.voice
  }
  voiceSelect.addEventListener('change', () => update({ voice: voiceSelect.value }))
  speech.onVoicesChanged(fillVoices)
  fillVoices()
  const rate = el('input', { type: 'range', min: '0.5', max: '2', step: '0.1', class: 'a11y-range' })
  const rateValue = el('output', {})
  rate.addEventListener('input', () => update({ rate: Number(rate.value) }))
  const readGroup = el(
    'fieldset',
    { class: 'a11y-group' },
    el('legend', { textContent: t('Read aloud') }),
    bind(checkbox(t('Show a read aloud button in the apps'), () => prefs.readButton, (readButton) => update({ readButton })), (n) => (n.querySelector('input')!.checked = prefs.readButton)),
    el('small', { class: 'a11y-note', textContent: t('Reads the selection or the paragraph with the cursor (Alt+Shift+R).') }),
    el(
      'div',
      { class: 'a11y-row' },
      field(
        t('Language'),
        bind(
          select<speech.ReadLang>([['auto', t('Automatic')], ['es', 'Español'], ['gl', 'Galego'], ['en', 'English'], ['fr', 'Français'], ['de', 'Deutsch']], () => prefs.readLang, (readLang) => update({ readLang })),
          (n) => (n.value = prefs.readLang),
        ),
      ),
      field(t('Speed'), el('span', { class: 'a11y-range-row' }, bind(rate, (n) => (n.value = String(prefs.rate))), bind(rateValue, (n) => (n.textContent = `${prefs.rate}×`)))),
    ),
    field(t('Voice'), voiceSelect),
  )
  if (!speech.canSpeak()) readGroup.append(el('p', { class: 'a11y-warn', textContent: t('Read aloud is not available in this browser.') }))

  // Dictation
  const dictWarn = el('p', { class: 'a11y-warn' })
  const dictGroup = el(
    'fieldset',
    { class: 'a11y-group' },
    el('legend', { textContent: t('Dictation') }),
    bind(checkbox(t('Show a dictation button in the apps'), () => prefs.dictButton, (dictButton) => update({ dictButton })), (n) => (n.querySelector('input')!.checked = prefs.dictButton)),
    field(
      t('Language'),
      bind(
        select<string>([['auto', t('Automatic')], ['es-ES', 'Español'], ['gl-ES', 'Galego'], ['en-US', 'English'], ['fr-FR', 'Français'], ['de-DE', 'Deutsch']], () => prefs.dictLang, (dictLang) => update({ dictLang })),
        (n) => (n.value = prefs.dictLang),
      ),
    ),
    el('small', { class: 'a11y-note', textContent: t('Writes what you say where the text cursor is (Alt+Shift+D).') }),
    bind(dictWarn, (n) => {
      n.textContent = speech.dictationStatusText()
      n.hidden = !n.textContent
    }),
  )

  const reset = el('button', { type: 'button', class: 'a11y-reset', textContent: t('Reset all') })
  reset.addEventListener('click', () => update({ ...DEFAULTS, voice: prefs.voice, rate: prefs.rate, readButton: prefs.readButton, dictButton: prefs.dictButton }))
  statusLine = el('p', { class: 'a11y-status', role: 'status' })
  statusLine.setAttribute('aria-live', 'polite')

  const node = el(
    'div',
    { class: 'a11y-panel', id: 'a11y-panel', role: 'dialog', tabIndex: -1 },
    el('div', { class: 'a11y-head' }, title, close),
    el(
      'div',
      { class: 'a11y-body' },
      reading,
      display,
      readGroup,
      dictGroup,
      statusLine,
      el('div', { class: 'a11y-foot' }, el('small', { textContent: t('Alt+Shift+A opens this panel. Settings are saved in this browser.') }), reset),
    ),
  )
  node.setAttribute('aria-labelledby', 'a11y-title')
  node.setAttribute('aria-modal', 'false')
  node.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      togglePanel(false)
    }
  })
  syncPanel = () => controls.forEach((sync) => sync())
  syncPanel()
  speech.onSpeechState(({ message }) => {
    syncPanel?.()
    syncQuick()
    if (message !== undefined) setStatus(message, /not|no |non |stopped:|detenid|detid/i.test(message))
  })
  window.addEventListener('online', () => syncPanel?.())
  window.addEventListener('offline', () => syncPanel?.())
  node.hidden = true
  document.body.append(node)
  return node
}

export function togglePanel(open = !panel || panel.hidden): void {
  if (!panel) panel = buildPanel()
  if (open === !panel.hidden) return
  panel.hidden = !open
  openers.forEach((b) => b.setAttribute('aria-expanded', String(open)))
  if (open) {
    returnFocus = document.activeElement as HTMLElement | null
    syncPanel?.()
    panel.querySelector<HTMLElement>('select, input, button:not(.a11y-close)')?.focus()
  } else if (returnFocus?.isConnected && panel.contains(document.activeElement)) {
    returnFocus.focus()
  }
}

// App bar / home bar button.
export function accessibilityButton(withLabel = false): HTMLButtonElement {
  const b = el('button', { type: 'button', class: `a11y-btn${withLabel ? ' labelled' : ''}`, title: t('Accessibility (Alt+Shift+A)') }, icon(Accessibility, 20))
  if (withLabel) b.append(el('span', { textContent: t('Accessibility') }))
  else b.setAttribute('aria-label', t('Accessibility'))
  b.setAttribute('aria-expanded', 'false')
  b.setAttribute('aria-controls', 'a11y-panel')
  b.addEventListener('click', () => togglePanel())
  openers.add(b)
  return b
}

// ---------- Quick buttons (app bars) ----------

const quickGroups = new Set<{ group: HTMLElement; read: HTMLButtonElement; dict: HTMLButtonElement }>()

// Read aloud and dictation buttons for an app bar, shown when enabled in the panel.
export function speechButtons(): HTMLElement {
  const quick = (node: Parameters<typeof icon>[0], run: () => void) => {
    const b = el('button', { type: 'button', class: 'a11y-btn a11y-quick-btn' }, icon(node, 20))
    // Keep the document's selection and caret: they say what to read and where to write.
    b.addEventListener('mousedown', (e) => e.preventDefault())
    b.addEventListener('click', run)
    return b
  }
  const read = quick(Volume2, () => readAloud('auto'))
  const dict = quick(Mic, () => toggleDictation())
  const group = el('span', { class: 'a11y-quick' }, read, dict)
  quickGroups.add({ group, read, dict })
  syncQuick()
  return group
}

function syncQuick(): void {
  const reading = speech.isReading()
  const dictating = speech.isDictating()
  for (const { group, read, dict } of quickGroups) {
    read.hidden = !prefs.readButton
    read.replaceChildren(icon(reading ? CircleStop : Volume2, 20))
    read.title = reading ? t('Stop reading') : t('Read aloud (Alt+Shift+R)')
    read.setAttribute('aria-label', read.title)
    read.setAttribute('aria-pressed', String(reading))
    read.disabled = !speech.canSpeak()
    dict.hidden = !prefs.dictButton
    const status = speech.dictationStatusText()
    dict.title = dictating ? t('Stop dictation') : status || t('Dictation (Alt+Shift+D)')
    dict.setAttribute('aria-label', dictating ? t('Stop dictation') : t('Dictation (Alt+Shift+D)'))
    dict.setAttribute('aria-pressed', String(dictating))
    dict.classList.toggle('on', dictating)
    dict.disabled = !dictating && speech.dictationStatus() !== 'ok'
    group.hidden = read.hidden && dict.hidden
  }
}

// ---------- Skip link and shortcuts ----------

function skipLink(): void {
  const link = el('button', { type: 'button', class: 'skip-link', textContent: t('Skip to content') })
  link.addEventListener('click', () => {
    const target =
      document.querySelector<HTMLElement>('#app-main [contenteditable="true"]') ??
      document.querySelector<HTMLElement>('#app-main :is(a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"]))') ??
      document.querySelector<HTMLElement>('.home-new a, .home-new button')
    target?.focus()
  })
  document.body.prepend(link)
}

function shortcuts(): void {
  // Capture phase: editors must not swallow these.
  window.addEventListener(
    'keydown',
    (e) => {
      if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return
      const action = { KeyA: () => togglePanel(), KeyR: () => readAloud('auto'), KeyD: () => toggleDictation() }[e.code]
      if (!action) return
      e.preventDefault()
      e.stopPropagation()
      action()
    },
    true,
  )
}

// ---------- Startup ----------

apply()
darkQuery.addEventListener('change', () => prefs.theme === 'system' && apply())
// Changes made in other tabs.
window.addEventListener('storage', (e) => {
  if (e.key !== KEY) return
  prefs = load()
  apply()
})
speech.onSpeechState(() => syncQuick())
window.addEventListener('online', () => syncQuick())
window.addEventListener('offline', () => syncQuick())
trackFocus()
shortcuts()
if (document.body) skipLink()
else document.addEventListener('DOMContentLoaded', skipLink)
