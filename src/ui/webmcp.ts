// WebMCP switch in the app frame: Tools ▸ "Allow AI assistants (WebMCP)…"
// (with an explanation dialog before turning it on) and an indicator in the
// app bar while it is on (click: what the assistant may do, turn off).
// The switch itself is src/core/webmcp (per browser, off by default).

import { Bot } from 'lucide'
import { SUITE } from '../apps/registry'
import { language, t } from '../core/i18n'
import type { Session } from '../core/session'
import { isWebMcpEnabled, onWebMcpChange, onWebMcpTools, setWebMcpEnabled, startWebMcp, webMcpToolNames, type EditActions } from '../core/webmcp'
import { webMcpForbidden } from '../core/school-config'
import { activityLog } from '../core/webmcp/activity'
import { ACTIVITY_EVENT, canRevertAi, revertAiChanges, type WebMcpActivity } from '../core/webmcp/ai'
import { isReviewMode, setReviewMode } from '../core/webmcp/state'
import { setupProposals, type ProposalsPanel } from './webmcp-proposals'
import { confirmDialog, el, icon, showDialog, toast, type MenuItem } from './widgets'
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
    session.canEdit ? reviewSwitch(session) : null,
    on && names.length ? el('p', { class: 'hint mono', textContent: t('Tools offered: {tools}', { tools: names.join(', ') }) }) : null,
    on ? activityList() : null,
    el('p', {}, more),
  )
}

// Review mode: the assistant's changes wait for the user to accept them.
function reviewSwitch(session: Session): HTMLElement {
  const box = el('input', { type: 'checkbox', checked: isReviewMode() })
  box.addEventListener('change', () => setReviewMode(box.checked))
  return el(
    'div',
    { class: 'webmcp-review' },
    el('label', { class: 'check' }, box, t('Review the assistant’s changes before they are applied')),
    el('p', {
      class: 'hint',
      textContent:
        session.type === 'writer'
          ? t('Changes to the text are always suggestions; with this option, formatting and other changes also wait for you to accept them.')
          : t('Each change it proposes waits in a panel where you accept or reject it.'),
    }),
  )
}

const ACTIVITY_SHOWN = 15

// The assistant's latest calls in this page.
function activityList(): HTMLElement {
  const entries = activityLog().slice(0, ACTIVITY_SHOWN)
  const section = el('section', { class: 'webmcp-activity' }, el('h3', { textContent: t('Activity in this page') }))
  if (!entries.length) {
    section.append(el('p', { class: 'hint', textContent: t('The assistant has not used this document yet.') }))
    return section
  }
  const list = el('ol', { class: 'webmcp-activity-list' })
  for (const entry of entries) {
    const status =
      entry.note === 'declined' ? t('not allowed') : entry.note === 'proposed' ? t('proposed') : entry.note === 'accepted' ? t('accepted') : entry.ok ? (entry.write ? t('changed') : t('read')) : t('failed')
    const item = el(
      'li',
      { class: entry.ok ? '' : 'failed' },
      el('time', { textContent: new Date(entry.time).toLocaleTimeString() }),
      el('span', { class: 'mono', textContent: entry.tool }),
      el('span', { class: 'webmcp-activity-status', textContent: status }),
    )
    item.title = entry.args
    list.append(item)
  }
  section.append(list)
  return section
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

let proposals: ProposalsPanel | null = null

async function statusDialog(session: Session): Promise<void> {
  const revert = session.canEdit && canRevertAi(session)
  const pending = proposals?.pending() ?? 0
  const choice = await showDialog(t('AI assistant access is on'), explanation(session, true), [
    { label: t('Close'), value: 'close' },
    ...(pending ? [{ label: t('Review proposals ({n})', { n: pending }), value: 'proposals' }] : []),
    ...(revert ? [{ label: t('Undo all AI changes…'), value: 'revert' }] : []),
    { label: t('Turn off'), value: 'off', primary: true, danger: true },
  ])
  if (choice === 'off') turnOff()
  if (choice === 'revert') await undoAll(session)
  if (choice === 'proposals') proposals?.open()
}

async function undoAll(session: Session): Promise<void> {
  const ok = await confirmDialog(
    t('Undo all AI changes?'),
    t('The document goes back to the version saved before the AI assistant’s first change in this page. The current state is kept in the version history.'),
    { confirmLabel: t('Undo all'), danger: true },
  )
  if (!ok) return
  try {
    await revertAiChanges(session)
    toast(t('The AI assistant’s changes were undone'))
  } catch (err) {
    toast((err as Error).message)
  }
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
export function setupWebMcp(session: Session, edit?: EditActions): void {
  startWebMcp(session, edit)
  const button = el('button', { type: 'button', class: 'webmcp-indicator', hidden: true })
  const label = el('span', { class: 'btn-label', textContent: t('AI access on') })
  const badge = el('span', { class: 'webmcp-badge', hidden: true })
  button.append(icon(Bot, 18), label, badge)
  let waiting = 0
  // The proposals panel is created once the switch is on.
  let creating = false
  const ensureProposals = () => {
    if (proposals || creating || !session.canEdit) return
    creating = true
    proposals = setupProposals(session, (n) => {
      waiting = n
      badge.hidden = !n
      badge.textContent = String(n)
      update()
    })
  }
  button.addEventListener('click', () => (waiting ? proposals?.toggle() : void statusDialog(session)))
  document.querySelector('.appbar-actions')?.prepend(button)
  let last = ''
  function update() {
    const on = isWebMcpEnabled()
    if (on) ensureProposals()
    button.hidden = !on
    button.title = [t('AI assistants can use this document (WebMCP). Click for details or to turn it off.'), last].filter(Boolean).join('\n')
    button.setAttribute('aria-label', waiting ? `${t('AI assistant access is on')} · ${t('{n} changes to review', { n: waiting })}` : t('AI assistant access is on'))
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
    if (write && ok && !waiting) toast(t('The AI assistant used {tool}', { tool }))
    update()
  })
  update()
}
