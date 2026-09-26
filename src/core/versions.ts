// Version history, stored in the document itself so every collaborator sees it.
//
//   doc.getArray<Version>('versions')   {id, time, authorName, label?, auto?, state}
//
// `state` is Y.encodeStateAsUpdate of the document without the versions array.
// Editors save automatically (at most every 10 minutes while editing) and on
// demand (named versions). Named versions are kept; automatic ones are thinned
// out (the latest ones, then one per day). Only editors can write (for others
// the change would never leave their browser).
//
// Restoring uses the app hook session.hooks.restoreVersion(state) when present,
// else a generic restore: every top-level shared type is replaced by its
// content in the version, in one transaction, so all apps observing their
// types see an ordinary remote-like change.

import * as Y from 'yjs'
import { locale, t } from './i18n'
import { isRemoteOrigin } from './network'
import type { Session } from './session'

export interface Version {
  id: string
  time: number
  authorName: string
  label?: string
  // Saved automatically (subject to thinning).
  auto?: boolean
  state: Uint8Array
}

export const VERSIONS_KEY = 'versions'
const AUTO_EVERY_MS = 10 * 60 * 1000
const AUTO_DELAY_MS = 20 * 1000
const KEEP_RECENT_AUTO = 10
const KEEP_DAILY_AUTO = 30
// Top-level types a restore leaves alone.
const NOT_RESTORED = new Set([VERSIONS_KEY, 'authors'])

export const RESTORE_ORIGIN = Symbol('restore-version')

export const versionsArray = (doc: Y.Doc) => doc.getArray<Version>(VERSIONS_KEY)

// Newest first.
export function listVersions(doc: Y.Doc): Version[] {
  return versionsArray(doc)
    .toArray()
    .filter((v) => v && v.state instanceof Uint8Array)
    .sort((a, b) => b.time - a.time)
}

// The document state without its version history.
export function snapshotState(doc: Y.Doc): Uint8Array {
  const copy = new Y.Doc()
  Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc))
  const versions = copy.getArray(VERSIONS_KEY)
  if (versions.length) versions.delete(0, versions.length)
  const state = Y.encodeStateAsUpdate(copy)
  copy.destroy()
  return state
}

// `authorName` defaults to this browser's user (the AI assistant's changes use their own).
export function saveVersion(session: Session, label?: string, auto = false, authorName = session.user.name): Version | null {
  if (!session.canEdit) return null
  const version: Version = {
    id: crypto.getRandomValues(new Uint32Array(2)).join('-'),
    time: Date.now(),
    authorName,
    ...(label ? { label } : {}),
    ...(auto ? { auto: true } : {}),
    state: snapshotState(session.doc),
  }
  const array = versionsArray(session.doc)
  session.doc.transact(() => {
    array.push([version])
    thin(array)
  })
  return version
}

// Keeps every named version, the latest automatic ones and one automatic
// version per day before that.
function thin(array: Y.Array<Version>): void {
  const autos = array
    .toArray()
    .map((v, index) => ({ v, index }))
    .filter(({ v }) => v?.auto)
    .sort((a, b) => b.v.time - a.v.time)
  const drop: number[] = []
  const days = new Set<string>()
  autos.forEach(({ v, index }, i) => {
    if (i < KEEP_RECENT_AUTO) return
    const day = new Date(v.time).toDateString()
    if (!days.has(day) && days.size < KEEP_DAILY_AUTO) days.add(day)
    else drop.push(index)
  })
  drop.sort((a, b) => b - a).forEach((index) => array.delete(index, 1))
}

// Saves a version after editing when the latest one is older than 10 minutes.
export function setupAutoVersions(session: Session): void {
  if (!session.canEdit) return
  let timer = 0
  session.doc.on('update', (_update: Uint8Array, origin: unknown, _doc: Y.Doc, tr: Y.Transaction) => {
    if (timer || isRemoteOrigin(origin) || !tr.local || origin === RESTORE_ORIGIN) return
    if (tr.changed.has(versionsArray(session.doc)) && tr.changed.size === 1) return
    const latest = listVersions(session.doc)[0]
    if (latest && Date.now() - latest.time < AUTO_EVERY_MS) return
    timer = window.setTimeout(() => {
      timer = 0
      const newest = listVersions(session.doc)[0]
      if (!newest || Date.now() - newest.time >= AUTO_EVERY_MS) saveVersion(session, undefined, true)
    }, AUTO_DELAY_MS)
  })
}

// Restores a version (editors only). The current state is saved first.
export async function restoreVersion(session: Session, version: Version): Promise<void> {
  if (!session.canEdit) throw new Error(t('Only editors can restore versions'))
  saveVersion(session, t('Before restoring the version of {date}', { date: new Date(version.time).toLocaleString(locale) }), true)
  if (session.hooks.restoreVersion) await session.hooks.restoreVersion(version.state)
  else applyStateGeneric(session.doc, version.state)
}

type Kind = 'map' | 'array' | 'xml' | 'text'

// Replaces the content of every top-level type of `doc` with the one in
// `state` (except versions/authors and `skip`), in one transaction.
export function applyStateGeneric(doc: Y.Doc, state: Uint8Array, options: { skip?: string[]; origin?: unknown } = {}): void {
  const snapshot = new Y.Doc()
  Y.applyUpdate(snapshot, state)
  const skip = new Set([...NOT_RESTORED, ...(options.skip ?? [])])
  doc.transact(() => {
    const names = new Set([...doc.share.keys(), ...snapshot.share.keys()])
    for (const name of names) {
      if (skip.has(name)) continue
      const kind = kindOf(doc.share.get(name)) ?? kindOf(snapshot.share.get(name))
      if (!kind) continue
      if (kind === 'map') replaceMap(doc.getMap(name), snapshot.getMap(name))
      else if (kind === 'array') replaceArray(doc.getArray(name), snapshot.getArray(name))
      else if (kind === 'xml') replaceXml(doc.getXmlFragment(name), snapshot.getXmlFragment(name))
      else replaceText(doc.getText(name), snapshot.getText(name))
    }
  }, options.origin ?? RESTORE_ORIGIN)
  snapshot.destroy()
}

// The kind of a top-level type; never-accessed types are generic, so their
// content decides.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function kindOf(type: Y.AbstractType<any> | undefined): Kind | null {
  if (!type) return null
  if (type instanceof Y.Map) return 'map'
  if (type instanceof Y.Array) return 'array'
  if (type instanceof Y.XmlFragment) return 'xml'
  if (type instanceof Y.Text) return 'text'
  if (type._map.size) return 'map'
  for (let item = type._start; item; item = item.right) {
    if (item.deleted) continue
    const content = item.content
    if (content instanceof Y.ContentString || content instanceof Y.ContentFormat || content instanceof Y.ContentEmbed) return 'text'
    if (content instanceof Y.ContentType && (content.type instanceof Y.XmlElement || content.type instanceof Y.XmlText || content.type instanceof Y.XmlHook)) return 'xml'
    return 'array'
  }
  return null
}

function clone(value: unknown): unknown {
  return value instanceof Y.AbstractType ? (value as Y.AbstractType<unknown> & { clone(): unknown }).clone() : value
}

function same(a: unknown, b: unknown): boolean {
  if (a instanceof Y.AbstractType || b instanceof Y.AbstractType) {
    if (!(a instanceof Y.AbstractType && b instanceof Y.AbstractType) || a.constructor !== b.constructor) return false
    return JSON.stringify(a.toJSON()) === JSON.stringify(b.toJSON())
  }
  if (a instanceof Uint8Array || b instanceof Uint8Array) {
    return a instanceof Uint8Array && b instanceof Uint8Array && a.length === b.length && a.every((x, i) => x === b[i])
  }
  return JSON.stringify(a) === JSON.stringify(b)
}

function replaceMap(live: Y.Map<unknown>, old: Y.Map<unknown>): void {
  for (const key of [...live.keys()]) if (!old.has(key)) live.delete(key)
  old.forEach((value, key) => {
    if (!live.has(key) || !same(live.get(key), value)) live.set(key, clone(value))
  })
}

function replaceArray(live: Y.Array<unknown>, old: Y.Array<unknown>): void {
  const a = live.toArray()
  const b = old.toArray()
  let prefix = 0
  while (prefix < a.length && prefix < b.length && same(a[prefix], b[prefix])) prefix++
  if (prefix < a.length) live.delete(prefix, a.length - prefix)
  if (prefix < b.length) live.insert(prefix, b.slice(prefix).map(clone))
}

function replaceXml(live: Y.XmlFragment, old: Y.XmlFragment): void {
  if (live.toString() === old.toString()) return
  if (live.length) live.delete(0, live.length)
  live.insert(0, old.toArray().map((node) => node.clone()) as (Y.XmlElement | Y.XmlText)[])
}

function replaceText(live: Y.Text, old: Y.Text): void {
  if (JSON.stringify(live.toDelta()) === JSON.stringify(old.toDelta())) return
  if (live.length) live.delete(0, live.length)
  live.applyDelta(old.toDelta().map((op: { insert?: unknown }) => ({ ...op, insert: clone(op.insert) })))
}
