// Our spelling and grammar checker in any contenteditable element (the label
// editors of diagrams and slides): underlines drawn with the CSS Custom
// Highlight API (or an overlay where it is missing), so the element's HTML is
// never changed, and suggestions on right click.
//
//   const detach = attachSpellcheck(element, () => 'es-ES')
//
// The language getter returns a tag ("en-GB", "es"); by default the nearest
// `lang` attribute is used. The checker is detached automatically once the
// element leaves the document.

import { t } from '../../core/i18n'
import { showContextMenu, type MenuEntry } from '../widgets'
import { SpellClient } from '../../core/spell/client'
import { loadSettings, personalWords, savePersonalWords, UI_VARIANT } from '../../core/spell/settings'
import type { Issue, Lang, Paragraph } from '../../core/spell/types'
import { describe, showReplacement } from './describe'
import { dictOf, variantOf } from '../../core/spell/variants'
import './inline.css'

// One worker for every attached element.
const listeners = new Set<() => void>()
let client: SpellClient | null = null
const personalSent = new Set<Lang>()
function spellClient(): SpellClient {
  client ??= new SpellClient((e) => {
    if (e.type === 'ready' || e.type === 'harper') listeners.forEach((fn) => fn())
  })
  return client
}

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

interface Segment {
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
  range: Range
}

// Text of the element, one "\n" per line break or block, with the text nodes it comes from.
function readText(root: HTMLElement): { text: string; segments: Segment[] } {
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

function rangeFor(segments: Segment[], from: number, to: number): Range | null {
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
  const range = document.createRange()
  range.setStart(a.node, a.offset)
  range.setEnd(b.node, b.offset)
  return range
}

export function attachSpellcheck(element: HTMLElement, lang?: () => string | null | undefined): () => void {
  const langOf = () => variantOf(lang?.() ?? element.closest('[lang]')?.getAttribute('lang')) ?? variantOf(UI_VARIANT)!
  const previousSpellcheck = element.getAttribute('spellcheck')
  let found: Found[] = []
  let timer = 0
  let lastInput = 0
  let version = 0
  let detached = false
  const ignored = new Set<string>()
  const overlay = supportsHighlights ? null : document.createElement('div')
  if (overlay) {
    overlay.className = 'wo-spell-overlay'
    document.body.append(overlay)
  }

  const clear = () => {
    for (const f of found) for (const k of KINDS) highlight(k)?.delete(f.range)
    overlay?.replaceChildren()
  }

  const paint = () => {
    if (!overlay) return
    overlay.replaceChildren()
    for (const f of found) {
      for (const r of f.range.getClientRects()) {
        const line = document.createElement('div')
        line.className = `wo-spell-line wo-${f.issue.kind}`
        Object.assign(line.style, { left: `${r.left}px`, top: `${r.bottom - 3}px`, width: `${r.width}px` })
        overlay.append(line)
      }
    }
  }

  const check = async () => {
    if (detached) return
    if (!element.isConnected) return detach()
    const settings = loadSettings()
    const v = langOf()
    if (!personalSent.has(v.lang)) {
      personalSent.add(v.lang)
      spellClient().setPersonal(v.lang, personalWords(v.lang))
    }
    const { text } = readText(element)
    const lines: Paragraph[] = []
    const starts: number[] = []
    let offset = 0
    for (const line of text.split('\n')) {
      starts.push(offset)
      lines.push({ text: line, lang: v.lang, variant: v.tag, context: 'list' })
      offset += line.length + 1
    }
    const id = ++version
    const results = await spellClient().check(lines, { spelling: settings.spelling, grammar: settings.grammar, optionalStyle: settings.optionalStyle })
    if (id !== version || detached) return
    // The text may have changed while checking: map again from the current DOM.
    const now = readText(element)
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
        if (ignored.has(issue.rule === 'spelling' ? `spelling:${word}` : issue.rule) || (issue.rule === 'spelling' && personalWords(v.lang).includes(word))) continue
        // The word being typed is underlined once the caret leaves it.
        if (typing && issue.rule === 'spelling' && caret !== null && caret >= from && caret <= to) continue
        const range = rangeFor(now.segments, from, to)
        if (!range) continue
        found.push({ issue, lang: v.lang, dict: dictOf({ lang: v.lang, variant: v.tag }), text: word, from, to, range })
        highlight(issue.kind)?.add(range)
      }
    })
    paint()
  }

  const caretOffset = (segments: Segment[]): number | null => {
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
    const hit = found.find((f) => [...f.range.getClientRects()].some((r) => e.clientX >= r.left - 1 && e.clientX <= r.right + 1 && e.clientY >= r.top - 1 && e.clientY <= r.bottom + 2))
    // Shift keeps the browser's menu.
    if (!hit || e.shiftKey) return
    e.preventDefault()
    e.stopPropagation()
    void showMenu(hit, e.clientX, e.clientY)
  }

  const replace = (f: Found, text: string) => {
    const now = readText(element)
    if (now.text.slice(f.from, f.to) !== f.text) return
    const span = f.issue.span
    const range = span ? rangeFor(now.segments, f.from - f.issue.from + span[0], f.from - f.issue.from + span[1]) : rangeFor(now.segments, f.from, f.to)
    if (!range) return
    element.focus()
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

  const showMenu = async (f: Found, x: number, y: number) => {
    const spelling = f.issue.rule === 'spelling'
    const suggestions = (spelling ? await spellClient().suggest(f.text, f.dict) : f.issue.replacements).slice(0, 5)
    const items: MenuEntry[] = []
    if (!spelling) items.push({ label: describe(f), enabled: () => false })
    for (const s of suggestions) items.push({ label: showReplacement(s), run: () => replace(f, s) })
    if (!suggestions.length) items.push({ label: t('(no suggestions)'), enabled: () => false })
    items.push('-')
    items.push({
      label: spelling ? t('Ignore all') : t('Ignore this kind of issue'),
      run: () => {
        ignored.add(spelling ? `spelling:${f.text}` : f.issue.rule)
        void check()
        element.focus()
      },
    })
    if (spelling) {
      items.push({
        label: t('Add to dictionary'),
        run: () => {
          const words = [...new Set([...personalWords(f.lang), f.text])]
          savePersonalWords(f.lang, words)
          spellClient().setPersonal(f.lang, words)
          void check()
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
  const onScroll = () => paint()

  function detach() {
    if (detached) return
    detached = true
    clearTimeout(timer)
    clear()
    overlay?.remove()
    listeners.delete(onReady)
    element.removeEventListener('input', onInput)
    element.removeEventListener('contextmenu', onContextMenu, true)
    element.removeEventListener('blur', onBlur)
    window.removeEventListener('scroll', onScroll, true)
    if (previousSpellcheck === null) element.removeAttribute('spellcheck')
    else element.setAttribute('spellcheck', previousSpellcheck)
  }

  const onReady = () => schedule(0)
  const settings = loadSettings()
  if (!settings.spelling && !settings.grammar) return () => {}
  // Ours replaces the browser's checker.
  if (settings.spelling) element.setAttribute('spellcheck', 'false')
  listeners.add(onReady)
  element.addEventListener('input', onInput)
  element.addEventListener('contextmenu', onContextMenu, true)
  element.addEventListener('blur', onBlur)
  if (overlay) window.addEventListener('scroll', onScroll, true)
  // The element's content may be set right after this call.
  schedule(50)
  return detach
}
