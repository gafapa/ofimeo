// Review mode of the AI assistant (WebMCP): the panel listing the changes it
// proposed (src/core/webmcp/proposals.ts), each with Accept / Reject, and the
// count on the app bar indicator. Opens by itself when a proposal arrives.

import { X } from 'lucide'
import { t } from '../core/i18n'
import type { Session } from '../core/session'
import { acceptAll, acceptProposal, listProposals, onProposals, pendingProposals, rejectAll, rejectProposal, type Proposal } from '../core/webmcp/proposals'
import { el, icon, toast } from './widgets'

const DECIDED_SHOWN = 8

const statusText = (p: Proposal) =>
  p.status === 'accepted' ? t('Accepted') : p.status === 'rejected' ? t('Rejected') : p.status === 'failed' ? t('Could not be applied: {error}', { error: p.error ?? '' }) : ''

export interface ProposalsPanel {
  toggle(): void
  open(): void
  pending(): number
}

export function setupProposals(session: Session, onCount: (n: number) => void): ProposalsPanel {
  const list = el('ol', { class: 'webmcp-proposal-list' })
  const count = el('span', { class: 'webmcp-proposal-count' })
  const close = el('button', { type: 'button', class: 'webmcp-close', title: t('Close') })
  close.setAttribute('aria-label', t('Close'))
  close.append(icon(X, 16))
  const acceptAllBtn = el('button', { type: 'button', class: 'primary', textContent: t('Accept all') })
  const rejectAllBtn = el('button', { type: 'button', textContent: t('Reject all') })
  const heading = el('h2', { id: 'webmcp-proposals-title', textContent: t('Changes proposed by the AI assistant') })
  const panel = el(
    'aside',
    { class: 'webmcp-proposals', hidden: true },
    el('div', { class: 'webmcp-proposals-head' }, heading, count, close),
    el('p', { class: 'hint', textContent: t('Review mode is on: nothing changes until you accept it. Each accepted change can be undone in one step.') }),
    el('div', { class: 'webmcp-proposals-actions' }, acceptAllBtn, rejectAllBtn),
    list,
  )
  panel.setAttribute('aria-labelledby', heading.id)
  document.body.append(panel)

  let busy = false
  const run = async (fn: () => Promise<void> | void) => {
    if (busy) return
    busy = true
    render()
    try {
      await fn()
    } finally {
      busy = false
      render()
    }
  }

  const item = (p: Proposal) => {
    const row = el(
      'li',
      { class: `webmcp-proposal ${p.status}` },
      el('p', { class: 'webmcp-proposal-summary', textContent: p.summary }),
      el('span', { class: 'webmcp-proposal-meta mono', textContent: `${new Date(p.time).toLocaleTimeString()} · ${p.tool}` }),
    )
    if (p.status === 'pending') {
      const accept = el('button', { type: 'button', class: 'primary', textContent: t('Accept'), disabled: busy })
      const reject = el('button', { type: 'button', textContent: t('Reject'), disabled: busy })
      accept.addEventListener('click', () =>
        void run(async () => {
          const done = await acceptProposal(session, p.id)
          if (done.status === 'failed') toast(statusText(done))
        }),
      )
      reject.addEventListener('click', () => void run(() => rejectProposal(session, p.id)))
      row.append(el('div', { class: 'webmcp-proposal-buttons' }, accept, reject))
    } else row.append(el('span', { class: 'webmcp-proposal-status', textContent: statusText(p) }))
    return row
  }

  function render(): void {
    const all = listProposals(session)
    const pending = all.filter((p) => p.status === 'pending')
    const decided = all.filter((p) => p.status !== 'pending').slice(-DECIDED_SHOWN).reverse()
    list.replaceChildren(...pending.map(item), ...decided.map(item))
    count.textContent = pending.length ? t('{n} pending', { n: pending.length }) : t('None pending')
    acceptAllBtn.disabled = rejectAllBtn.disabled = busy || !pending.length
    onCount(pending.length)
  }

  acceptAllBtn.addEventListener('click', () => void run(() => acceptAll(session)))
  rejectAllBtn.addEventListener('click', () => void run(() => rejectAll(session)))
  close.addEventListener('click', () => (panel.hidden = true))
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') panel.hidden = true
  })

  let known = 0
  onProposals(session, () => {
    const n = pendingProposals(session).length
    // A new proposal opens the panel (without taking the focus).
    if (n > known) panel.hidden = false
    known = n
    render()
  })
  render()

  return {
    toggle: () => {
      panel.hidden = !panel.hidden
      if (!panel.hidden) render()
    },
    open: () => {
      panel.hidden = false
      render()
    },
    pending: () => pendingProposals(session).length,
  }
}
