// Our spelling and grammar checker in any text field: contenteditable elements
// (diagram and slide labels, PDF text boxes), <textarea> and text <input>
// (speaker notes, form questions and answers, PDF notes). Underlines are drawn
// with the CSS Custom Highlight API in contenteditable elements, and as an
// overlay elsewhere (text fields have no ranges: a hidden mirror with the same
// text and styles gives the positions), so the field's content is never
// changed. Suggestions on right click.
//
//   const detach = attachSpellcheck(element, () => 'es-ES')
//
// The language getter returns a tag ("en-GB", "es"); by default the nearest
// `lang` attribute is used. The checker is detached automatically once the
// element leaves the document, and follows the settings of Tools ▸ Check
// spelling / grammar as you type.

import { t } from '../../core/i18n'
import { showContextMenu, type MenuEntry } from '../widgets'
import { UI_VARIANT } from '../../core/spell/settings'
import type { Issue, Lang, Paragraph } from '../../core/spell/types'
import { dictOf, variantOf } from '../../core/spell/variants'
import { describe, showReplacement } from './describe'
import { addToDictionary, checkParagraphs, isPersonal, onSpellChange, spellSettings, suggest } from './service'
import './inline.css'

const KINDS = ['spelling', 'grammar', 'style'] as const
const supportsHighlights = typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined'
// Highlights shared by every attached element (one per kind).
const highlights = new Map<string, Highlight>()
function highlight(kind: (typeof KINDS)[number]): Highlight | null {
  if (!supportsHighlights) return null
  let h = highlights.get(kind)
  if (!h) {
    h = new Highlight()
    highlights.set(kind, h)
    CSS.highlights.set(`wo-${kind}`, h)
  }
  return h
}

// "Ignore all" lasts for the page, in every field.
const ignored = new Set<string>()

export interface Segment {
  node: Text
  // Offset of the node's first character in the element's text.
  start: number
}

interface Found {
  issue: Issue
  lang: Lang
  dict: string
  text: string
  // Offsets in the element's text.
  from: number
  to: number
  range: Range | null
}

type TextField = HTMLTextAreaElement | HTMLInputElement
const isTextField = (e: HTMLElement): e is TextField => e instanceof HTMLTextAreaElement || e instanceof HTMLInputElement

// Text of an element, one "\n" per line break or block, with the text nodes it comes from.
export function readText(root: Node): { text: string; segments: Segment[] } {
  let text = ''
  const segments: Segment[] = []
  const walk = (node: Node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        segments.push({ node: child as Text, start: text.length })
        text += (child as Text).data
      } else if (child.nodeName === 'BR') text += '\n'
      else if (child.nodeType === Node.ELEMENT_NODE) {
        const block = /^(?:DIV|P|LI|H[1-6]|TR|UL|OL|BLOCKQUOTE)$/.test(child.nodeName)
        if (block && text && !text.endsWith('\n')) text += '\n'
        walk(child)
        if (block && !text.endsWith('\n')) text += '\n'
      }
    }
  }
  walk(root)
  return { text, segments }
}

export function rangeFor(segments: Segment[], from: number, to: number, doc: Document = document): Range | null {
  const at = (offset: number, end: boolean) => {
    for (const s of segments) {
      const len = s.node.data.length
      if (offset > s.start + len || (offset === s.start + len && !end)) continue
      if (offset < s.start) return null
      return { node: s.node, offset: offset - s.start }
    }
    return null
  }
  const a = at(from, false)
  const b = at(to, true)
  if (!a || !b) return null
  const range = doc.createRange()
  range.setStart(a.node, a.offset)
  range.setEnd(b.node, b.offset)
  return range
}

// Replaces text in a label's HTML by offsets in its plain text (readText),
// keeping the markup around it. Returns null when the offsets do not match.
export function replaceInHtml(html: string, from: number, to: number, text: string): string | null {
  const doc = document.implementation.createHTMLDocument('')
  const root = doc.createElement('div')
  root.innerHTML = html
  const { segments } = readText(root)
  const range = rangeFor(segments, from, to, doc)
  if (!range) return null
  range.deleteContents()
  if (text) range.insertNode(doc.createTextNode(text))
  root.normalize()
  return root.innerHTML
}

// Plain text of a label's HTML, as the checker sees it.
export function htmlText(html: string): string {
  const root = document.implementation.createHTMLDocument('').createElement('div')
  root.innerHTML = html
  return readText(root).text
}

// A hidden copy of a text field with the same layout, for character positions.
class Mirror {
  readonly box = document.createElement('div')
  private node = document.createTextNode('')
  constructor(private field: TextField) {
    this.box.className = 'wo-spell-mirror'
    this.box.setAttribute('aria-hidden', 'true')
    this.box.append(this.node, document.createTextNode('​'))
    document.body.append(this.box)
  }
  sync(): DOMRect {
    const f = this.field
    const cs = getComputedStyle(f)
    const rect = f.getBoundingClientRect()
    const s = this.box.style
    for (const p of ['font', 'letterSpacing', 'wordSpacing', 'textTransform', 'textIndent', 'textAlign', 'lineHeight', 'tabSize', 'direction', 'boxSizing',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle'] as const) {
      s[p] = cs[p]
    }
    s.left = `${rect.left}px`
    s.top = `${rect.top}px`
    s.width = `${rect.width}px`
    s.height = `${rect.height}px`
    const multiline = f instanceof HTMLTextAreaElement
    s.whiteSpace = multiline ? 'pre-wrap' : 'pre'
    s.overflowWrap = multiline ? 'break-word' : 'normal'
    // The textarea's scroll bar narrows its text.
    if (multiline) s.paddingRight = `${parseFloat(cs.paddingRight) + (f.offsetWidth - f.clientWidth - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth))}px`
    if (this.node.data !== f.value) this.node.data = f.value
    this.box.scrollTop = f.scrollTop
    this.box.scrollLeft = f.scrollLeft
    return rect
  }
  rects(from: number, to: number): DOMRect[] {
    const clip = this.sync()
    const range = document.createRange()
    const len = this.node.data.length
    range.setStart(this.node, Math.min(from, len))
    range.setEnd(this.node, Math.min(to, len))
    return [...range.getClientRects()].filter((r) => r.width > 0 && r.bottom > clip.top && r.top < clip.bottom && r.right > clip.left && r.left < clip.right)
  }
  remove() {
    this.box.remove()
  }
}

// Screen rectangles of text in a <textarea> or <input> (visible part only).
export function textFieldRects(field: HTMLTextAreaElement | HTMLInputElement, from: number, to: number): DOMRect[] {
  const mirror = new Mirror(field)
  try {
    return mirror.rects(from, to)
  } finally {
    mirror.remove()
  }
}

export function attachSpellcheck(element: HTMLElement, lang?: () => string | null | undefined): () => void {
  const langOf = () => variantOf(lang?.() ?? element.closest('[lang]')?.getAttribute('lang')) ?? variantOf(UI_VARIANT)!
  const field = isTextField(element) ? element : null
  const previousSpellcheck = element.getAttribute('spellcheck')
  let found: Found[] = []
  let timer = 0
  let lastInput = 0
  let version = 0
  let detached = false
  const mirror = field ? new Mirror(field) : null
  const overlay = supportsHighlights && !field ? null : document.createElement('div')
  if (overlay) {
    overlay.className = 'wo-spell-overlay'
    document.body.append(overlay)
  }

  const read = () => (field ? { text: field.value, segments: [] as Segment[] } : readText(element))

  const clear = () => {
    for (const f of found) if (f.range) for (const k of KINDS) highlight(k)?.delete(f.range)
    overlay?.replaceChildren()
  }

  const rectsOf = (f: Found): DOMRect[] => (mirror ? mirror.rects(f.from, f.to) : f.range ? [...f.range.getClientRects()] : [])

  const paint = () => {
    if (!overlay) return
    overlay.replaceChildren()
    if (!element.isConnected) return
    const box = element.getBoundingClientRect()
    if (!box.width || !box.height) return
    for (const f of found) {
      for (const r of rectsOf(f)) {
        const line = document.createElement('div')
        line.className = `wo-spell-line wo-${f.issue.kind}`
        Object.assign(line.style, { left: `${r.left}px`, top: `${r.bottom - 3}px`, width: `${r.width}px` })
        overlay.append(line)
      }
    }
  }

  const active = () => {
    const s = spellSettings()
    return s.spelling || s.grammar
  }

  const check = async () => {
    if (detached) return
    if (!element.isConnected) return detach()
    if (!active()) {
      clear()
      found = []
      return
    }
    const settings = spellSettings()
    const v = langOf()
    const { text } = read()
    const lines: Paragraph[] = []
    const starts: number[] = []
    let offset = 0
    for (const line of text.split('\n')) {
      starts.push(offset)
      lines.push({ text: line, lang: v.lang, variant: v.tag, context: 'list' })
      offset += line.length + 1
    }
    const id = ++version
    const results = await checkParagraphs(lines, { spelling: settings.spelling, grammar: settings.grammar, optionalStyle: settings.optionalStyle })
    if (id !== version || detached) return
    // The text may have changed while checking: map again from the current DOM.
    const now = read()
    if (now.text !== text) return schedule(150)
    clear()
    const caret = caretOffset(now.segments)
    const typing = Date.now() - lastInput < 1500
    found = []
    results.forEach((r, i) => {
      for (const issue of r.issues) {
        const from = starts[i] + issue.from
        const to = starts[i] + issue.to
        const word = text.slice(from, to)
        if (ignored.has(issue.rule === 'spelling' ? `spelling:${v.lang}:${word}` : issue.rule) || (issue.rule === 'spelling' && isPersonal(v.lang, word))) continue
        // The word being typed is underlined once the caret leaves it.
        if (typing && issue.rule === 'spelling' && caret !== null && caret >= from && caret <= to) continue
        const range = field ? null : rangeFor(now.segments, from, to)
        if (!field && !range) continue
        found.push({ issue, lang: v.lang, dict: dictOf({ lang: v.lang, variant: v.tag }), text: word, from, to, range })
        if (range) highlight(issue.kind)?.add(range)
      }
    })
    element.dataset.spellIssues = String(found.length)
    paint()
  }

  const caretOffset = (segments: Segment[]): number | null => {
    if (field) return document.activeElement === field ? field.selectionStart : null
    const sel = document.getSelection()
    if (!sel?.rangeCount || !element.contains(sel.anchorNode)) return null
    const s = segments.find((x) => x.node === sel.anchorNode)
    return s ? s.start + sel.anchorOffset : null
  }

  const schedule = (delay = 350) => {
    clearTimeout(timer)
    timer = window.setTimeout(() => void check(), delay)
  }

  const onInput = () => {
    lastInput = Date.now()
    // Underlines on changed text are stale until the next check.
    clear()
    found = []
    schedule()
  }

  const onContextMenu = (e: MouseEvent) => {
    const hit = found.find((f) => rectsOf(f).some((r) => e.clientX >= r.left - 1 && e.clientX <= r.right + 1 && e.clientY >= r.top - 1 && e.clientY <= r.bottom + 2))
    // Shift keeps the browser's menu.
    if (!hit || e.shiftKey) return
    e.preventDefault()
    e.stopPropagation()
    void showMenu(hit, e.clientX, e.clientY)
  }

  const replace = (f: Found, text: string) => {
    const now = read()
    if (now.text.slice(f.from, f.to) !== f.text) return
    const span = f.issue.span
    const from = span ? f.from - f.issue.from + span[0] : f.from
    const to = span ? f.from - f.issue.from + span[1] : f.to
    element.focus()
    if (field) {
      field.setSelectionRange(from, to)
      if (!document.execCommand(text ? 'insertText' : 'delete', false, text)) {
        field.setRangeText(text, from, to, 'end')
        field.dispatchEvent(new Event('input', { bubbles: true }))
      }
      return
    }
    const range = rangeFor(now.segments, from, to)
    if (!range) return
    const sel = document.getSelection()!
    sel.removeAllRanges()
    sel.addRange(range)
    // execCommand keeps the editor's undo history and fires "input".
    if (!document.execCommand(text ? 'insertText' : 'delete', false, text)) {
      range.deleteContents()
      if (text) range.insertNode(document.createTextNode(text))
      element.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }

  const readOnly = () => (field ? field.readOnly || field.disabled : !element.isContentEditable)

  const showMenu = async (f: Found, x: number, y: number) => {
    const spelling = f.issue.rule === 'spelling'
    const suggestions = (spelling ? await suggest(f.text, f.dict) : f.issue.replacements).slice(0, 5)
    const items: MenuEntry[] = []
    if (!spelling) items.push({ label: describe(f), enabled: () => false })
    for (const s of suggestions) items.push({ label: showReplacement(s), run: () => replace(f, s), enabled: () => !readOnly() })
    if (!suggestions.length) items.push({ label: t('(no suggestions)'), enabled: () => false })
    items.push('-')
    items.push({
      label: spelling ? t('Ignore all') : t('Ignore this kind of issue'),
      run: () => {
        ignored.add(spelling ? `spelling:${f.lang}:${f.text}` : f.issue.rule)
        void check()
        element.focus()
      },
    })
    if (spelling) {
      items.push({
        label: t('Add to dictionary'),
        run: () => {
          addToDictionary(f.lang, f.text)
          element.focus()
        },
      })
    }
    showContextMenu(x, y, items)
    document.querySelectorAll<HTMLElement>('.context-menu > .menu-row').forEach((row, i) => {
      if (i === 0 && !spelling) row.classList.add('spell-note')
      else if (i < suggestions.length + (spelling ? 0 : 1)) row.classList.add('spell-suggestion')
    })
  }

  const onBlur = () => setTimeout(() => !element.isConnected && detach(), 500)
  const onScroll = () => {
    if (!element.isConnected) return detach()
    paint()
  }
  const onSettings = () => {
    applyBrowserSpellcheck()
    schedule(0)
  }
  const applyBrowserSpellcheck = () => {
    // Ours replaces the browser's checker while it is on.
    if (spellSettings().spelling) element.setAttribute('spellcheck', 'false')
    else if (previousSpellcheck === null) element.removeAttribute('spellcheck')
    else element.setAttribute('spellcheck', previousSpellcheck)
  }

  const unsubscribe = onSpellChange(onSettings)
  function detach() {
    if (detached) return
    detached = true
    clearTimeout(timer)
    clear()
    overlay?.remove()
    mirror?.remove()
    unsubscribe()
    element.removeEventListener('input', onInput)
    element.removeEventListener('contextmenu', onContextMenu, true)
    element.removeEventListener('blur', onBlur)
    element.removeEventListener('scroll', onScroll)
    window.removeEventListener('scroll', onScroll, true)
    window.removeEventListener('resize', onScroll)
    resize?.disconnect()
    clearInterval(moved)
    delete element.dataset.spellIssues
    if (previousSpellcheck === null) element.removeAttribute('spellcheck')
    else element.setAttribute('spellcheck', previousSpellcheck)
  }

  applyBrowserSpellcheck()
  element.addEventListener('input', onInput)
  element.addEventListener('contextmenu', onContextMenu, true)
  element.addEventListener('blur', onBlur)
  let resize: ResizeObserver | null = null
  let moved = 0
  if (overlay) {
    element.addEventListener('scroll', onScroll)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    resize = new ResizeObserver(() => paint())
    resize.observe(element)
    // The field may move without scrolling (content added above it).
    let last = ''
    moved = window.setInterval(() => {
      if (!found.length) return
      const r = element.getBoundingClientRect()
      const key = `${r.left},${r.top}`
      if (key !== last) {
        last = key
        onScroll()
      }
    }, 300)
  }
  // The element's content may be set right after this call.
  schedule(50)
  return detach
}

// Attaches the checker to every matching field inside `root`, now and when
// fields are added later (forms and panels that render their fields again).
export function spellcheckFields(root: HTMLElement, selector: string, lang?: () => string | null | undefined): () => void {
  const attached = new WeakMap<HTMLElement, () => void>()
  const scan = () => {
    for (const field of root.querySelectorAll<HTMLElement>(selector)) {
      if (!attached.has(field)) attached.set(field, attachSpellcheck(field, lang))
    }
  }
  scan()
  let pending = 0
  const observer = new MutationObserver(() => {
    cancelAnimationFrame(pending)
    pending = requestAnimationFrame(scan)
  })
  observer.observe(root, { childList: true, subtree: true })
  return () => {
    observer.disconnect()
    for (const field of root.querySelectorAll<HTMLElement>(selector)) attached.get(field)?.()
  }
}
