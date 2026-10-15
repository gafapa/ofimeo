// Tools that let the assistant see the document beyond its text: a picture
// (render), the version history and what changed (list_versions,
// diff_versions, get_changes_since), and the suite's own checks (spelling and
// grammar with the local checker, accessibility). Nothing here changes the
// document.

import * as Y from 'yjs'
import type { Session } from '../session'
import { listVersions } from '../versions'
import { describeDiff } from './diff'
import { num, optStr, type AppTools, type OfimeoTool } from './types'

const MAX_TOKENS = 20
const MAX_ISSUES = 300
// Waiting for a spelling dictionary to download.
const DICTIONARY_WAIT_MS = 15_000

const docFrom = (state: Uint8Array) => {
  const doc = new Y.Doc({ gc: false })
  Y.applyUpdate(doc, state)
  return doc
}

const tokens = new WeakMap<Session, Map<string, Uint8Array>>()

function remember(session: Session): string {
  let map = tokens.get(session)
  if (!map) tokens.set(session, (map = new Map()))
  const token = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  map.set(token, Y.encodeStateAsUpdate(session.doc))
  while (map.size > MAX_TOKENS) map.delete(map.keys().next().value!)
  return token
}

// Names of the people whose changes are in `after` but not in `before`.
function authorsOf(session: Session, before: Y.Doc, after: Y.Doc): string[] {
  const old = Y.decodeStateVector(Y.encodeStateVector(before))
  const names = new Set<string>()
  for (const [client, clock] of Y.decodeStateVector(Y.encodeStateVector(after))) {
    if (clock <= (old.get(client) ?? 0)) continue
    const name = session.authors.get(String(client))?.name
    if (name) names.add(name)
  }
  return [...names]
}

export function seeTools(session: Session, apps: AppTools[]): OfimeoTool[] {
  const first = <K extends keyof AppTools>(key: K) => apps.find((a) => a[key])?.[key]
  const render = first('render')
  const renderSchema = apps.find((a) => a.render)?.renderSchema ?? {}
  const serialize = first('serialize')
  const diff = first('diff')
  const paragraphs = first('paragraphs')
  const accessibility = first('accessibility')

  const compare = async (before: Y.Doc, after: Y.Doc, max: number) => {
    if (diff) return diff(before, after)
    if (!serialize) throw new Error('Comparing versions is not available in this app')
    return describeDiff(await serialize(before), await serialize(after), max)
  }
  const versionById = (id: string) => {
    const version = listVersions(session.doc).find((v) => v.id === id)
    if (!version) throw new Error(`No version with id "${id}" (use list_versions)`)
    return version
  }

  const tools: OfimeoTool[] = [
    {
      name: 'list_versions',
      description: 'Lists the saved versions of the document, newest first: id, label, author, time and whether it was saved automatically.',
      inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 200 } } },
      access: 'view',
      execute: (args) =>
        listVersions(session.doc)
          .slice(0, Math.round(num(args, 'limit', 50)))
          .map((v) => ({ id: v.id, label: v.label ?? null, author: v.authorName, time: new Date(v.time).toISOString(), auto: !!v.auto })),
    },
  ]

  if (serialize || diff) {
    tools.push(
      {
        name: 'diff_versions',
        description:
          'What changed between a saved version ("from", id from list_versions) and another one ("to"; default: the document now): lines added (+) and removed (-) of a text form of the document, and who changed it.',
        inputSchema: {
          type: 'object',
          properties: { from: { type: 'string' }, to: { type: 'string', description: 'Version id, or "current" (default).' }, max_lines: { type: 'integer', minimum: 10, maximum: 2000 } },
          required: ['from'],
        },
        access: 'view',
        execute: async (args) => {
          const from = versionById(String(args.from ?? ''))
          const toId = optStr(args, 'to')
          const to = toId && toId !== 'current' ? versionById(toId) : null
          const before = docFrom(from.state)
          const after = to ? docFrom(to.state) : session.doc
          try {
            return {
              from: { id: from.id, label: from.label ?? null, time: new Date(from.time).toISOString() },
              to: to ? { id: to.id, label: to.label ?? null, time: new Date(to.time).toISOString() } : 'current',
              by: authorsOf(session, before, after),
              ...((await compare(before, after, Math.round(num(args, 'max_lines', 400)))) as object),
            }
          } finally {
            before.destroy()
            if (to) after.destroy()
          }
        },
      },
      {
        name: 'get_changes_since',
        description:
          'Follows the work of the people editing: call it without "token" to start (returns a token), later with that token to get what changed since then and who changed it (and a new token).',
        inputSchema: { type: 'object', properties: { token: { type: 'string' }, max_lines: { type: 'integer', minimum: 10, maximum: 2000 } } },
        access: 'view',
        execute: async (args) => {
          const token = optStr(args, 'token')
          if (!token) return { token: remember(session) }
          const state = tokens.get(session)?.get(token)
          if (!state) throw new Error('Unknown or expired token: call get_changes_since without a token to start again')
          const before = docFrom(state)
          try {
            return { by: authorsOf(session, before, session.doc), ...((await compare(before, session.doc, Math.round(num(args, 'max_lines', 400)))) as object), token: remember(session) }
          } finally {
            before.destroy()
          }
        },
      },
    )
  }

  if (render) {
    tools.push({
      name: 'render',
      description: 'Returns a PNG picture of part of the document as the user sees it (see the arguments of this app), to check the layout or read what has no text (scans, handwriting, drawings).',
      inputSchema: { type: 'object', properties: renderSchema },
      access: 'view',
      execute: (args) => render(args),
    })
  }

  if (paragraphs) {
    tools.push({
      name: 'get_spelling_issues',
      description:
        'Checks spelling and grammar with the suite’s own checker (in the document’s language, with the user’s settings and personal dictionary). Returns where each issue is, the text, a message and suggested replacements.',
      inputSchema: { type: 'object', properties: { max_issues: { type: 'integer', minimum: 1, maximum: MAX_ISSUES } } },
      access: 'view',
      execute: async (args) => {
        const [{ checkParagraphs, docLanguage }, { describe }] = await Promise.all([import('../../ui/spell/service'), import('../../ui/spell/describe')])
        const variant = docLanguage(session.doc, () => false).variant()
        const parts = (await paragraphs()).filter((p) => p.text.trim())
        const input = parts.map((p) => ({ text: p.text, lang: variant.lang, variant: variant.tag, context: p.context ?? 'paragraph' }))
        let results = await checkParagraphs(input)
        for (const end = Date.now() + DICTIONARY_WAIT_MS; results.some((r) => r.pending) && Date.now() < end; ) {
          await new Promise((r) => setTimeout(r, 500))
          results = await checkParagraphs(input)
        }
        const max = Math.round(num(args, 'max_issues', 100))
        const issues = parts.flatMap((p, i) =>
          results[i].issues.map((issue) => {
            const text = p.text.slice(issue.from, issue.to)
            return { where: p.where, text, kind: issue.kind, message: describe({ issue, text }), replacements: issue.replacements.slice(0, 5), context: p.text.slice(Math.max(0, issue.from - 30), issue.to + 30) }
          }),
        )
        return { language: variant.tag, count: issues.length, issues: issues.slice(0, max), ...(results.some((r) => r.pending) ? { incomplete: 'A dictionary is still loading; try again.' } : {}) }
      },
    })
  }

  if (accessibility) {
    tools.push({
      name: 'check_accessibility',
      description: 'Lists accessibility problems of the document (pictures without a description, skipped heading levels, tables without a header row, slides without a title…), with how to fix each one.',
      inputSchema: { type: 'object', properties: {} },
      access: 'view',
      execute: async () => {
        const issues = await accessibility()
        return { count: issues.length, issues }
      },
    })
  }
  return tools
}
