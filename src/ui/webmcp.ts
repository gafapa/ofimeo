// WebMCP switch in the app frame: Tools ▸ "Allow AI assistants (WebMCP)…"
// (with an explanation dialog before turning it on) and an indicator in the
// app bar while it is on (click: what the assistant may do, turn off).
// The switch itself is src/core/webmcp (per browser, off by default).

import { Bot } from 'lucide'
import { SUITE } from '../apps/registry'
import { language, t } from '../core/i18n'
import type { Session } from '../core/session'
import { isWebMcpEnabled, onWebMcpChange, onWebMcpTools, setWebMcpEnabled, startWebMcp, webMcpToolNames } from '../core/webmcp'
import { webMcpForbidden } from '../core/school-config'
import { ACTIVITY_EVENT, type WebMcpActivity } from '../core/webmcp/ai'
import { el, icon, showDialog, toast, type MenuItem } from './widgets'
import './webmcp.css'

const aiNotePage = () => `legal/${language}/ai.html`

// What the assistant may do with this browser's access.
function abilities(session: Session): string[] {
  const list = [t('Read the open document and its comments.')]
  if (session.canComment) list.push(t('Add comments.'))
  if (session.canEdit) {
    list.push(
      session.type === 'writer'
        ? t('Propose changes to the text. They are added as suggestions that you accept or reject.')
        : t('Make changes. Each change can be undone in one step and is recorded as the AI assistant’s in the version history.'),
    )
  }
  return list
}

function explanation(session: Session, on: boolean): HTMLElement {
  const more = el('a', { href: aiNotePage(), target: '_blank', rel: 'noopener', textContent: t('More about AI assistants and privacy') })
  const names = webMcpToolNames(session)
  return el(
    'div',
    { class: 'webmcp-dialog' },
    el('p', {
      textContent: t(
        'An AI assistant you use in this browser (for example, a browser extension or the browser’s own agent) will be able to work with the document open in this tab through WebMCP.',
      ),
    }),
    el('p', { textContent: t('With the access you have to this document, it can:') }),
    el('ul', {}, ...abilities(session).map((a) => el('li', { textContent: a }))),
    el('p', { textContent: t('It never gets your share links, access keys, other documents or anything outside this document.') }),
    el('p', {
      class: 'hint',
      textContent: t('The assistant’s provider processes what it reads under its own terms. {suite} does not include or choose any assistant.', { suite: SUITE }),
    }),
    el('p', {
      class: 'hint',
      textContent: t('This setting applies to every document you open in this browser. You can turn it off at any time from the Tools menu or the indicator in the top bar.'),
    }),
    on && names.length ? el('p', { class: 'hint mono', textContent: t('Tools offered: {tools}', { tools: names.join(', ') }) }) : null,
    el('p', {}, more),
  )
}

async function enableDialog(session: Session): Promise<void> {
  const choice = await showDialog(t('Allow AI assistants?'), explanation(session, false), [
    { label: t('Cancel'), value: 'cancel' },
    { label: t('Allow'), value: 'ok', primary: true },
  ])
  if (choice !== 'ok') return
  setWebMcpEnabled(true)
  toast(t('AI assistants can now use this document'))
}

async function statusDialog(session: Session): Promise<void> {
  const choice = await showDialog(t('AI assistant access is on'), explanation(session, true), [
    { label: t('Close'), value: 'close' },
    { label: t('Turn off'), value: 'off', primary: true, danger: true },
  ])
  if (choice === 'off') turnOff()
}

function turnOff(): void {
  setWebMcpEnabled(false)
  toast(t('AI assistants can no longer use this document'))
}

// Tools menu entry.
export function webMcpMenuItem(session: Session): MenuItem {
  // Forbidden by the school configuration: shown, but cannot be turned on.
  if (webMcpForbidden()) return { label: `${t('Allow AI assistants (WebMCP)…')} (${t('Set by your school')})`, active: () => false, enabled: () => false }
  return {
    label: t('Allow AI assistants (WebMCP)…'),
    active: isWebMcpEnabled,
    run: () => (isWebMcpEnabled() ? turnOff() : void enableDialog(session)),
  }
}

// Indicator in the app bar (visible while the switch is on) and the tools' registration.
export function setupWebMcp(session: Session): void {
  startWebMcp(session)
  const button = el('button', { type: 'button', class: 'webmcp-indicator', hidden: true })
  const label = el('span', { class: 'btn-label', textContent: t('AI access on') })
  button.append(icon(Bot, 18), label)
  button.addEventListener('click', () => void statusDialog(session))
  document.querySelector('.appbar-actions')?.prepend(button)
  let last = ''
  const update = () => {
    const on = isWebMcpEnabled()
    button.hidden = !on
    button.title = [t('AI assistants can use this document (WebMCP). Click for details or to turn it off.'), last].filter(Boolean).join('\n')
    button.setAttribute('aria-label', t('AI assistant access is on'))
  }
  onWebMcpChange(update)
  onWebMcpTools(session, update)
  let pulse = 0
  window.addEventListener(ACTIVITY_EVENT, (e) => {
    const { tool, write, ok } = (e as CustomEvent<WebMcpActivity>).detail
    last = t('Last used: {tool} at {time}', { tool, time: new Date().toLocaleTimeString() })
    button.classList.add('busy')
    clearTimeout(pulse)
    pulse = window.setTimeout(() => button.classList.remove('busy'), 1500)
    if (write && ok) toast(t('The AI assistant used {tool}', { tool }))
    update()
  })
  update()
}
