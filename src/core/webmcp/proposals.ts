// Changes proposed by the assistant in review mode (state.ts): instead of
// being applied, a changing call is queued here; the user accepts (it runs
// then, as one step of the undo history) or rejects it in the proposals panel
// (src/ui/webmcp.ts). The assistant follows the outcome with list_proposals.
// Proposals live in this page only: reloading it drops the pending ones.

import type { Session } from '../session'

export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'failed'

export interface Proposal {
  id: string
  tool: string
  // What the change does, for the user (translated when the tool describes it).
  summary: string
  args: Record<string, unknown>
  time: number
  status: ProposalStatus
  error?: string
  result?: unknown
}

interface Queue {
  list: Proposal[]
  run: Map<string, () => Promise<unknown>>
  listeners: Set<() => void>
}

const MAX_KEPT = 200
const queues = new WeakMap<Session, Queue>()

function queue(session: Session): Queue {
  let q = queues.get(session)
  if (!q) queues.set(session, (q = { list: [], run: new Map(), listeners: new Set() }))
  return q
}

const changed = (q: Queue) => q.listeners.forEach((fn) => fn())

export function propose(session: Session, tool: string, summary: string, args: Record<string, unknown>, run: () => Promise<unknown>): Proposal {
  const q = queue(session)
  const proposal: Proposal = { id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, tool, summary, args, time: Date.now(), status: 'pending' }
  q.list.push(proposal)
  q.run.set(proposal.id, run)
  // Old decided proposals are forgotten.
  while (q.list.length > MAX_KEPT) {
    const index = q.list.findIndex((p) => p.status !== 'pending')
    if (index < 0) break
    q.list.splice(index, 1)
  }
  changed(q)
  return proposal
}

export const listProposals = (session: Session): readonly Proposal[] => queues.get(session)?.list ?? []

export const pendingProposals = (session: Session) => listProposals(session).filter((p) => p.status === 'pending')

export function onProposals(session: Session, fn: () => void): () => void {
  const q = queue(session)
  q.listeners.add(fn)
  return () => q.listeners.delete(fn)
}

export async function acceptProposal(session: Session, id: string): Promise<Proposal> {
  const q = queue(session)
  const proposal = q.list.find((p) => p.id === id)
  const run = q.run.get(id)
  if (!proposal || !run || proposal.status !== 'pending') throw new Error('No pending proposal with that id')
  q.run.delete(id)
  try {
    proposal.result = await run()
    proposal.status = 'accepted'
  } catch (err) {
    proposal.status = 'failed'
    proposal.error = (err as Error)?.message ?? String(err)
  }
  changed(q)
  return proposal
}

export function rejectProposal(session: Session, id: string): void {
  const q = queue(session)
  const proposal = q.list.find((p) => p.id === id)
  if (!proposal || proposal.status !== 'pending') return
  q.run.delete(id)
  proposal.status = 'rejected'
  changed(q)
}

// In the order they were proposed.
export async function acceptAll(session: Session): Promise<void> {
  for (const p of pendingProposals(session)) await acceptProposal(session, p.id)
}

export function rejectAll(session: Session): void {
  for (const p of pendingProposals(session)) rejectProposal(session, p.id)
}
