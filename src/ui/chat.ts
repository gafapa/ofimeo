// Document chat, in every app (set up by chrome.ts): a toggle button next to
// the collaborators' avatars (with an unread badge) and a side panel.
//
// Storage: session.commentsDoc, array 'chat' (ChatMessage). The comments
// channel is signed with the comment key, so edit and comment links can write
// and view links can only read (legacy unprotected documents: everyone writes).
// The chat is kept in this browser (IndexedDB, with the comments) and in
// backups, but never in versions, copies or exported files.
// Teacher controls (edit access only): "Turn off chat for this document" is the
// flag 'disabled' in the document's map 'chat' (signed with the edit key, so
// nobody else can change it); while it is set, messages are neither shown nor
// accepted by the UI. "Clear chat history…" empties the array for everyone.
// Keys: Alt+Shift+C opens or closes the panel; Escape closes it.

import * as Y from 'yjs'
import { MessageCircle, Smile, Send, X, Ellipsis } from 'lucide'
import { locale, t, tn } from '../core/i18n'
import type { Session } from '../core/session'
import { confirmDialog, el, icon, showContextMenu, toast, uiZoom } from './widgets'
import './chat.css'

export interface ChatMessage {
  id: string
  // Random id of the sending browser (tells own messages apart).
  sid: string
  name: string
  color: string
  text: string
  ts: number
  // Names of the people mentioned with @Name.
  mentions?: string[]
}

export const MAX_MESSAGE = 2000
const MAX_HISTORY = 1000
const SENDER_KEY = 'words-online:chat-sender'
const READ_PREFIX = 'words-online:chat-read:'
const EMOJI = ['👍', '👏', '🙂', '😀', '😂', '😮', '🤔', '🙏', '❤️', '🎉', '✅', '❌', '❓', '❗', '👀', '💡', '📌', '📎', '✏️', '📚', '⭐', '🔥', '👋', '🙌']

const chatArray = (session: Session) => session.commentsDoc.getArray<ChatMessage>('chat')
const settings = (session: Session) => session.doc.getMap<unknown>('chat')
export const chatDisabled = (session: Session) => settings(session).get('disabled') === true

function senderId(): string {
  try {
    let id = localStorage.getItem(SENDER_KEY)
    if (!id) localStorage.setItem(SENDER_KEY, (id = Math.random().toString(36).slice(2, 12)))
    return id
  } catch {
    return 'local'
  }
}

function readTime(docId: string): number {
  try {
    return Number(localStorage.getItem(READ_PREFIX + docId)) || 0
  } catch {
    return 0
  }
}

function saveReadTime(docId: string, ts: number): void {
  try {
    localStorage.setItem(READ_PREFIX + docId, String(ts))
  } catch {
    // Private mode: unread counts last only for this page.
  }
}

// Who can write: comment and edit links (everyone in legacy documents).
export const canChat = (session: Session) => session.canComment && !chatDisabled(session)

// Text split into plain parts, links and mentions (rendered without innerHTML).
export type ChatPart = { kind: 'text' | 'link' | 'mention'; text: string }

export function chatParts(text: string, mentions: string[] = []): ChatPart[] {
  const names = [...new Set(mentions)].filter(Boolean).sort((a, b) => b.length - a.length)
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`(https?://[^\\s<>"]+[^\\s<>".,;:!?)\\]'])|${escaped.length ? `(@(?:${escaped.join('|')}))` : '(?!)'}`, 'gu')
  const parts: ChatPart[] = []
  let last = 0
  for (const m of text.matchAll(pattern)) {
    if (m.index! > last) parts.push({ kind: 'text', text: text.slice(last, m.index) })
    parts.push({ kind: m[1] ? 'link' : 'mention', text: m[0] })
    last = m.index! + m[0].length
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) })
  return parts
}

// Names from `candidates` written as @Name in the text.
export function findMentions(text: string, candidates: string[]): string[] {
  return [...new Set(candidates)].filter((name) => name && new RegExp(`@${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'u').test(text))
}

export function setupChat(session: Session): void {
  const actions = document.querySelector('.appbar-actions')
  const presence = document.getElementById('presence')
  if (!actions || !presence || document.querySelector('.chat-toggle')) return
  const messages = chatArray(session)
  const sid = senderId()
  const me = () => session.user.name
  let open = false
  let lastRead = readTime(session.docId)

  // Toggle button and badge.
  const badge = el('span', { class: 'chat-badge', hidden: true })
  badge.setAttribute('aria-hidden', 'true')
  const toggle = el('button', { type: 'button', class: 'chat-toggle' }, icon(MessageCircle, 20), badge)
  toggle.setAttribute('aria-expanded', 'false')
  toggle.setAttribute('aria-controls', 'chat-panel')
  presence.before(toggle)

  // Panel.
  const title = el('h2', { id: 'chat-title', textContent: t('Chat') })
  const menuButton = el('button', { type: 'button', class: 'chat-icon-btn', title: t('Chat settings') }, icon(Ellipsis, 18))
  menuButton.setAttribute('aria-label', t('Chat settings'))
  menuButton.setAttribute('aria-haspopup', 'menu')
  const closeButton = el('button', { type: 'button', class: 'chat-icon-btn', title: t('Close chat') }, icon(X, 18))
  closeButton.setAttribute('aria-label', t('Close chat'))
  const list = el('ol', { class: 'chat-list' })
  list.setAttribute('role', 'log')
  list.setAttribute('aria-labelledby', 'chat-title')
  list.setAttribute('aria-live', 'off')
  list.tabIndex = 0
  const empty = el('p', { class: 'chat-empty' })
  // Announces new messages from others (screen readers), separate from the list.
  const live = el('div', { class: 'sr-only', role: 'status' })
  live.setAttribute('aria-live', 'polite')
  const input = el('textarea', { class: 'chat-input', rows: 1, maxLength: MAX_MESSAGE, placeholder: t('Write a message… (@ to mention)') })
  input.setAttribute('aria-label', t('Message'))
  const emojiButton = el('button', { type: 'button', class: 'chat-icon-btn', title: t('Insert emoji') }, icon(Smile, 18))
  emojiButton.setAttribute('aria-label', t('Insert emoji'))
  emojiButton.setAttribute('aria-haspopup', 'true')
  const sendButton = el('button', { type: 'submit', class: 'chat-send primary', title: t('Send') }, icon(Send, 16))
  sendButton.setAttribute('aria-label', t('Send'))
  const suggestions = el('ul', { class: 'chat-suggest', id: 'chat-suggest', hidden: true })
  suggestions.setAttribute('role', 'listbox')
  suggestions.setAttribute('aria-label', t('People to mention'))
  const form = el('form', { class: 'chat-form' }, suggestions, emojiButton, input, sendButton)
  const note = el('p', { class: 'chat-note', hidden: true })
  const panel = el(
    'aside',
    { class: 'chat-panel', id: 'chat-panel', hidden: true },
    el('header', { class: 'chat-head' }, title, menuButton, closeButton),
    list,
    empty,
    note,
    form,
    live,
  )
  panel.setAttribute('aria-labelledby', 'chat-title')
  document.body.append(panel)

  const timeFormat = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' })
  const dateFormat = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const fullFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short' })
  const when = (ts: number) => (new Date(ts).toDateString() === new Date().toDateString() ? timeFormat : dateFormat).format(ts)

  const mentionsMe = (m: ChatMessage) => m.sid !== sid && !!m.mentions?.includes(me())

  const renderMessage = (m: ChatMessage): HTMLElement => {
    const own = m.sid === sid
    const body = el('div', { class: 'chat-text' })
    for (const part of chatParts(m.text, m.mentions)) {
      if (part.kind === 'link') body.append(el('a', { href: part.text, textContent: part.text, target: '_blank', rel: 'noopener noreferrer nofollow' }))
      else if (part.kind === 'mention') body.append(el('span', { class: `chat-mention${part.text.slice(1) === me() ? ' me' : ''}`, textContent: part.text }))
      else body.append(part.text)
    }
    const time = el('time', { dateTime: new Date(m.ts).toISOString(), textContent: when(m.ts), title: fullFormat.format(m.ts) })
    const author = el('span', { class: 'chat-author', textContent: own ? t('You') : m.name || t('Someone') })
    const dot = el('span', { class: 'chat-dot' })
    dot.style.background = m.color
    const item = el('li', { class: `chat-msg${own ? ' own' : ''}${mentionsMe(m) ? ' mentioned' : ''}` }, el('div', { class: 'chat-meta' }, dot, author, time), body)
    item.style.setProperty('--chat-color', m.color)
    return item
  }

  let rendered = 0
  const renderList = () => {
    const disabled = chatDisabled(session)
    const all = disabled ? [] : messages.toArray()
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40
    // Messages are only appended, except when the history is cleared or trimmed.
    if (all.length < rendered || list.children.length !== rendered) {
      list.replaceChildren()
      rendered = 0
    }
    for (const m of all.slice(rendered)) list.append(renderMessage(m))
    rendered = all.length
    empty.hidden = all.length > 0 || disabled
    empty.textContent = t('No messages yet. Messages are seen by everyone who has this document open.')
    if (atBottom || open) list.scrollTop = list.scrollHeight
  }

  const renderState = () => {
    const disabled = chatDisabled(session)
    const writable = canChat(session)
    form.hidden = !writable
    note.hidden = writable
    note.textContent = disabled
      ? session.canEdit
        ? t('The chat is turned off for this document. Turn it on again in the chat settings (⋯).')
        : t('The chat is turned off for this document.')
      : t('You can read the chat. To write, you need a comment or edit link.')
    menuButton.hidden = !session.canEdit
    // People without edit access do not see the button while the chat is off.
    toggle.hidden = disabled && !session.canEdit
    if (toggle.hidden && open) setOpen(false)
  }

  const unread = () => (chatDisabled(session) ? [] : messages.toArray().filter((m) => m.sid !== sid && m.ts > lastRead))
  const renderBadge = () => {
    const pending = open ? [] : unread()
    const n = pending.length
    badge.hidden = n === 0
    badge.textContent = n > 9 ? '9+' : String(n)
    badge.classList.toggle('mention', pending.some(mentionsMe))
    const label = n ? `${t('Chat')} (${tn(n, '{n} unread message', '{n} unread messages')})` : t('Chat')
    toggle.title = `${label} · Alt+Shift+C`
    toggle.setAttribute('aria-label', label)
  }

  const markRead = () => {
    const newest = messages.toArray().reduce((max, m) => Math.max(max, m.ts), lastRead)
    if (newest > lastRead) saveReadTime(session.docId, (lastRead = newest))
  }

  function setOpen(value: boolean, focus = true): void {
    open = value
    panel.hidden = !value
    toggle.setAttribute('aria-expanded', String(value))
    toggle.classList.toggle('active', value)
    if (value) {
      renderList()
      list.scrollTop = list.scrollHeight
      markRead()
      if (focus) (form.hidden ? list : input).focus()
    } else {
      hideSuggestions()
      if (focus) toggle.focus()
    }
    renderBadge()
  }

  toggle.addEventListener('click', () => setOpen(!open))
  closeButton.addEventListener('click', () => setOpen(false))
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && suggestions.hidden) {
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
    }
  })
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.altKey && e.shiftKey && e.code === 'KeyC' && !e.ctrlKey && !e.metaKey && !toggle.hidden) {
        e.preventDefault()
        e.stopPropagation()
        setOpen(!open)
      }
    },
    true,
  )

  // Teacher controls.
  menuButton.addEventListener('click', () => {
    const rect = menuButton.getBoundingClientRect()
    const z = uiZoom()
    showContextMenu(rect.right - 260 * z, rect.bottom + 4, [
      chatDisabled(session)
        ? { label: t('Turn on chat for this document'), run: () => settings(session).set('disabled', false) }
        : { label: t('Turn off chat for this document'), run: () => settings(session).set('disabled', true) },
      { label: t('Clear chat history…'), enabled: () => messages.length > 0, run: () => void clearHistory() },
    ])
  })
  const clearHistory = async () => {
    if (!(await confirmDialog(t('Clear chat history'), t('All messages are deleted for everyone who has this document. This cannot be undone.'), { confirmLabel: t('Clear'), danger: true }))) return
    session.commentsDoc.transact(() => messages.delete(0, messages.length))
    toast(t('Chat history cleared'))
  }

  // Sending.
  const send = () => {
    const text = input.value.trim().slice(0, MAX_MESSAGE)
    if (!text || !canChat(session)) return
    const user = session.user
    const message: ChatMessage = { id: Math.random().toString(36).slice(2, 12), sid, name: user.name, color: user.color, text, ts: Date.now() }
    const mentions = findMentions(text, knownNames())
    if (mentions.length) message.mentions = mentions
    session.commentsDoc.transact(() => {
      messages.push([message])
      if (messages.length > MAX_HISTORY) messages.delete(0, messages.length - MAX_HISTORY)
    })
    input.value = ''
    autosize()
    markRead()
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    send()
    input.focus()
  })
  const autosize = () => {
    input.style.height = 'auto'
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`
  }

  // @mentions: people present now, then recent authors.
  const knownNames = (): string[] => {
    const names = new Set<string>()
    for (const [id, s] of session.awareness.getStates()) if (id !== session.doc.clientID && s.user?.name) names.add(String(s.user.name))
    return [...names]
  }
  let active = 0
  let matches: string[] = []
  const mentionQuery = (): { start: number; query: string } | null => {
    const before = input.value.slice(0, input.selectionStart ?? input.value.length)
    const m = /(^|\s)@([^@\n]{0,30})$/u.exec(before)
    return m ? { start: before.length - m[2].length - 1, query: m[2].toLowerCase() } : null
  }
  function hideSuggestions(): void {
    suggestions.hidden = true
    matches = []
    input.removeAttribute('aria-activedescendant')
    input.setAttribute('aria-expanded', 'false')
  }
  const showSuggestions = () => {
    const q = mentionQuery()
    matches = q ? knownNames().filter((n) => n.toLowerCase().startsWith(q.query)).slice(0, 6) : []
    if (!matches.length) return hideSuggestions()
    active = Math.min(active, matches.length - 1)
    suggestions.replaceChildren(
      ...matches.map((name, i) => {
        const option = el('li', { id: `chat-suggest-${i}`, class: i === active ? 'active' : '', textContent: name })
        option.setAttribute('role', 'option')
        option.setAttribute('aria-selected', String(i === active))
        option.addEventListener('mousedown', (e) => {
          e.preventDefault()
          pick(name)
        })
        return option
      }),
    )
    suggestions.hidden = false
    input.setAttribute('aria-expanded', 'true')
    input.setAttribute('aria-activedescendant', `chat-suggest-${active}`)
  }
  const pick = (name: string) => {
    const q = mentionQuery()
    if (!q) return
    const caret = input.selectionStart ?? input.value.length
    input.value = `${input.value.slice(0, q.start)}@${name} ${input.value.slice(caret)}`
    const pos = q.start + name.length + 2
    input.setSelectionRange(pos, pos)
    hideSuggestions()
    input.focus()
  }
  input.setAttribute('role', 'combobox')
  input.setAttribute('aria-autocomplete', 'list')
  input.setAttribute('aria-controls', 'chat-suggest')
  input.setAttribute('aria-expanded', 'false')
  input.addEventListener('input', () => {
    autosize()
    active = 0
    showSuggestions()
  })
  input.addEventListener('blur', () => setTimeout(hideSuggestions, 100))
  input.addEventListener('keydown', (e) => {
    if (!suggestions.hidden && matches.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        active = (active + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length
        return showSuggestions()
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        return pick(matches[active])
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        return hideSuggestions()
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault()
      send()
    }
  })

  // Emoji.
  emojiButton.addEventListener('click', () => {
    const rect = emojiButton.getBoundingClientRect()
    const z = uiZoom()
    showContextMenu(rect.left, rect.top - 8, [])
    document.querySelector('.menu-panel')?.remove()
    const grid = el('div', { class: 'chat-emoji popover', role: 'dialog' })
    grid.setAttribute('aria-label', t('Insert emoji'))
    const closeGrid = (focusInput: boolean) => {
      grid.remove()
      document.removeEventListener('mousedown', outside, true)
      if (focusInput) input.focus()
    }
    const outside = (e: MouseEvent) => !grid.contains(e.target as Node) && e.target !== emojiButton && closeGrid(false)
    for (const emoji of EMOJI) {
      const b = el('button', { type: 'button', textContent: emoji })
      b.addEventListener('click', () => {
        const start = input.selectionStart ?? input.value.length
        const end = input.selectionEnd ?? start
        input.setRangeText(emoji, start, end, 'end')
        closeGrid(true)
      })
      grid.append(b)
    }
    grid.addEventListener('keydown', (e) => {
      const buttons = [...grid.querySelectorAll('button')]
      const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
      const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 6, ArrowUp: -6 }[e.key]
      if (step) {
        e.preventDefault()
        buttons[(i + step + buttons.length) % buttons.length]?.focus()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        closeGrid(true)
      }
    })
    document.body.append(grid)
    grid.style.left = `${Math.max(8, rect.left) / z}px`
    grid.style.top = `${Math.max(8, rect.top - grid.offsetHeight * z - 6) / z}px`
    document.addEventListener('mousedown', outside, true)
    grid.querySelector('button')?.focus()
  })

  // Updates from anyone.
  messages.observe((event) => {
    renderList()
    const added = event.changes.delta.flatMap((d) => (d.insert as ChatMessage[] | undefined) ?? []).filter((m) => m.sid !== sid)
    if (!chatDisabled(session) && added.length) {
      if (open && document.visibilityState === 'visible') markRead()
      const last = added[added.length - 1]
      if (open) live.textContent = `${last.name}: ${last.text}`
      const mention = added.find(mentionsMe)
      if (mention && !open) {
        toast(t('{name} mentioned you in the chat', { name: mention.name }))
        live.textContent = t('{name} mentioned you in the chat', { name: mention.name })
      }
    }
    renderBadge()
  })
  settings(session).observe(() => {
    renderState()
    renderList()
    renderBadge()
  })
  document.addEventListener('visibilitychange', () => open && document.visibilityState === 'visible' && (markRead(), renderBadge()))

  renderState()
  renderList()
  renderBadge()
}

// Keeps a reference so tests and tools can reach the chat of a document.
export const chatOf = (doc: Y.Doc) => doc.getArray<ChatMessage>('chat')
