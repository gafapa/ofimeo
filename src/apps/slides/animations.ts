// Object animations and slide transitions: the model (in Yjs, per slide), the
// click steps they make when presenting, and the visibility of each object at
// a step. Animations live in their own map per slide (id → fields), ordered by
// a fractional position, so people can add, edit and reorder them at the same
// time; transitions are slide settings (slides-meta).

import * as Y from 'yjs'
import { t } from '../../core/i18n'

export type AnimKind = 'entrance' | 'emphasis' | 'exit'
export type AnimEffect = 'appear' | 'fade' | 'fly' | 'zoom' | 'wipe' | 'pulse' | 'spin' | 'teeter'
export type Trigger = 'click' | 'with' | 'after'
export type Direction = 'left' | 'right' | 'top' | 'bottom'
export type TransitionType = 'none' | 'fade' | 'push' | 'wipe'

export interface Animation {
  id: string
  // Top-level cell of the slide it animates.
  cell: string
  kind: AnimKind
  effect: AnimEffect
  trigger: Trigger
  // Milliseconds.
  duration: number
  delay: number
  // Where fly and wipe effects come from (entrance) or go to (exit).
  direction: Direction
  pos: number
}

export const EFFECTS: Record<AnimKind, AnimEffect[]> = {
  entrance: ['appear', 'fade', 'fly', 'zoom', 'wipe'],
  emphasis: ['pulse', 'spin', 'teeter'],
  exit: ['appear', 'fade', 'fly', 'zoom', 'wipe'],
}

export const KIND_NAMES: Record<AnimKind, string> = { entrance: t('Entrance'), emphasis: t('Emphasis'), exit: t('Exit') }
export const TRIGGER_NAMES: Record<Trigger, string> = { click: t('On click'), with: t('With previous'), after: t('After previous') }
export const DIRECTION_NAMES: Record<Direction, string> = { left: t('From the left'), right: t('From the right'), top: t('From the top'), bottom: t('From the bottom') }
export const TRANSITION_NAMES: Record<TransitionType, string> = { none: t('None'), fade: t('Fade'), push: t('Push'), wipe: t('Wipe') }

export function effectName(kind: AnimKind, effect: AnimEffect): string {
  if (kind === 'exit') return { appear: t('Disappear'), fade: t('Fade out'), fly: t('Fly out'), zoom: t('Zoom out'), wipe: t('Wipe out') }[effect as 'appear'] ?? effect
  return { appear: t('Appear'), fade: t('Fade in'), fly: t('Fly in'), zoom: t('Zoom in'), wipe: t('Wipe'), pulse: t('Pulse'), spin: t('Spin'), teeter: t('Teeter') }[effect]
}

export const hasDirection = (effect: AnimEffect) => effect === 'fly' || effect === 'wipe'
export const defaultDuration = (effect: AnimEffect) => (effect === 'appear' ? 0 : effect === 'spin' ? 1000 : 500)

// ---------- Yjs ----------

const animKey = (pageId: string) => `slides-anim:${pageId}`
type AnimMap = Y.Map<Y.Map<string | number>>

export function animationsMap(doc: Y.Doc, pageId: string): AnimMap {
  return doc.getMap<Y.Map<string | number>>(animKey(pageId))
}

export function readAnimations(doc: Y.Doc, pageId: string): Animation[] {
  const out: Animation[] = []
  for (const [id, m] of animationsMap(doc, pageId)) {
    const effect = String(m.get('effect') ?? 'fade') as AnimEffect
    out.push({
      id,
      cell: String(m.get('cell') ?? ''),
      kind: (String(m.get('kind') ?? 'entrance') as AnimKind),
      effect,
      trigger: (String(m.get('trigger') ?? 'click') as Trigger),
      duration: Number(m.get('duration') ?? defaultDuration(effect)) || 0,
      delay: Number(m.get('delay') ?? 0) || 0,
      direction: (String(m.get('direction') ?? 'left') as Direction),
      pos: Number(m.get('pos') ?? 0) || 0,
    })
  }
  return out.sort((a, b) => a.pos - b.pos || (a.id < b.id ? -1 : 1))
}

export function addAnimation(doc: Y.Doc, pageId: string, a: Omit<Animation, 'id' | 'pos'>, origin?: unknown): string {
  const list = readAnimations(doc, pageId)
  const id = `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const pos = (list.at(-1)?.pos ?? 0) + 1
  doc.transact(() => {
    const m = new Y.Map<string | number>()
    animationsMap(doc, pageId).set(id, m)
    for (const [k, v] of Object.entries({ ...a, pos })) m.set(k, v as string | number)
  }, origin)
  return id
}

export function updateAnimation(doc: Y.Doc, pageId: string, id: string, fields: Partial<Omit<Animation, 'id'>>, origin?: unknown): void {
  const m = animationsMap(doc, pageId).get(id)
  if (!m) return
  doc.transact(() => {
    for (const [k, v] of Object.entries(fields)) if (v !== undefined && m.get(k) !== v) m.set(k, v as string | number)
  }, origin)
}

export function removeAnimation(doc: Y.Doc, pageId: string, id: string, origin?: unknown): void {
  doc.transact(() => animationsMap(doc, pageId).delete(id), origin)
}

// Moves an animation before another one (or to the end with null).
export function moveAnimation(doc: Y.Doc, pageId: string, id: string, before: string | null, origin?: unknown): void {
  const list = readAnimations(doc, pageId).filter((a) => a.id !== id)
  const index = before ? list.findIndex((a) => a.id === before) : list.length
  const prev = index > 0 ? list[index - 1].pos : (list[0]?.pos ?? 1) - 1
  const next = index < list.length ? list[index].pos : prev + 2
  updateAnimation(doc, pageId, id, { pos: (prev + next) / 2 }, origin)
}

// Copies a slide's animations to another slide (duplicated slides keep their cell ids).
export function copyAnimations(doc: Y.Doc, from: string, to: string): void {
  const list = readAnimations(doc, from)
  if (!list.length) return
  doc.transact(() => {
    const target = animationsMap(doc, to)
    for (const { id, ...a } of list) {
      const m = new Y.Map<string | number>()
      target.set(`${id}c${Math.random().toString(36).slice(2, 5)}`, m)
      for (const [k, v] of Object.entries(a)) m.set(k, v as string | number)
    }
  })
}

// ---------- Steps ----------

export interface TimedEffect {
  anim: Animation
  // Start within its step, in ms.
  start: number
}

export interface Step {
  effects: TimedEffect[]
  // Total length in ms.
  length: number
}

export interface Timeline {
  steps: Step[]
  // The first step plays by itself when the slide appears (its first animation is not "on click").
  auto: boolean
  // Cells hidden before their entrance.
  initiallyHidden: Set<string>
}

// Click steps of a slide's animations (those whose object still exists).
export function timeline(anims: Animation[], cells?: Set<string>): Timeline {
  const valid = cells ? anims.filter((a) => cells.has(a.cell)) : anims
  const steps: Step[] = []
  let step: Step | null = null
  let prevStart = 0
  let prevEnd = 0
  for (const anim of valid) {
    if (!step || anim.trigger === 'click') {
      step = { effects: [], length: 0 }
      steps.push(step)
      prevStart = 0
      prevEnd = 0
    }
    const base = anim.trigger === 'after' ? prevEnd : anim.trigger === 'with' ? prevStart : 0
    const start = base + Math.max(0, anim.delay)
    step.effects.push({ anim, start })
    prevStart = start
    prevEnd = start + Math.max(0, anim.duration)
    step.length = Math.max(step.length, prevEnd)
  }
  const initiallyHidden = new Set<string>()
  const seen = new Set<string>()
  for (const a of valid) {
    if (seen.has(a.cell)) continue
    seen.add(a.cell)
    if (a.kind === 'entrance') initiallyHidden.add(a.cell)
  }
  return { steps, auto: !!valid.length && valid[0].trigger !== 'click', initiallyHidden }
}

// Which animated cells are visible once `done` steps have played.
export function visibilityAt(tl: Timeline, done: number): Map<string, boolean> {
  const visible = new Map<string, boolean>()
  for (const cell of tl.initiallyHidden) visible.set(cell, false)
  for (const step of tl.steps.slice(0, done)) {
    for (const { anim } of step.effects) {
      if (anim.kind === 'entrance') visible.set(anim.cell, true)
      else if (anim.kind === 'exit') visible.set(anim.cell, false)
    }
  }
  return visible
}

// Imported effects with their start time within the click step → animations
// with the delay after (or with) the previous effect, as timeline() reads them.
export function animationsFromStarts(found: (Omit<Animation, 'id' | 'pos' | 'delay'> & { start: number })[]): Animation[] {
  let prevStart = 0
  let prevEnd = 0
  return found.map(({ start, ...a }, i) => {
    if (a.trigger === 'click') prevStart = prevEnd = 0
    const base = a.trigger === 'after' ? prevEnd : a.trigger === 'with' ? prevStart : 0
    const delay = Math.max(0, Math.round(start - base))
    prevStart = base + delay
    prevEnd = prevStart + a.duration
    return { ...a, id: `a${i}${Math.random().toString(36).slice(2, 8)}`, pos: i + 1, delay }
  })
}
