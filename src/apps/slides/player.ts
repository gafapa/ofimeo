// Plays a slide while presenting: the slide is drawn as a stack of layers
// (runs of static objects, and one layer per animated object, in drawing
// order), shown in the state of a click step; steps and slide transitions are
// animated with the Web Animations API. Works in any window (presenter view).

import { visibilityAt, type Animation, type Direction, type Timeline, type TransitionType } from './animations'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface SlideLayer {
  svg: SVGSVGElement
  // The animated object of this layer, with its box in slide coordinates.
  cell?: string
  box?: Box
}

export interface PlayableSlide {
  id: string
  width: number
  height: number
  layers: SlideLayer[]
  timeline: Timeline
  transition: { type: TransitionType; duration: number }
}

type Keyframes = Keyframe[]

export class SlideStage {
  private wrap: HTMLElement | null = null
  private slide: PlayableSlide | null = null
  private cells = new Map<string, HTMLElement>()
  private running: globalThis.Animation[] = []

  constructor(private readonly holder: HTMLElement) {}

  get current(): PlayableSlide | null {
    return this.slide
  }

  // Shows a slide as it is after `done` steps, with its transition when asked.
  show(slide: PlayableSlide, done: number, transition = false): void {
    this.finish()
    const doc = this.holder.ownerDocument
    const wrap = doc.createElement('div')
    wrap.className = 'present-layers'
    wrap.style.cssText = 'position:absolute;inset:0;overflow:hidden'
    this.cells = new Map()
    for (const layer of slide.layers) {
      const div = doc.createElement('div')
      div.style.cssText = 'position:absolute;inset:0'
      const svg = doc.importNode(layer.svg, true) as SVGSVGElement
      svg.setAttribute('width', '100%')
      svg.setAttribute('height', '100%')
      svg.style.display = 'block'
      div.append(svg)
      if (layer.cell) this.cells.set(layer.cell, div)
      wrap.append(div)
    }
    this.slide = slide
    this.applyState(done)
    const old = this.wrap
    this.wrap = wrap
    this.holder.style.position = 'relative'
    this.holder.append(wrap)
    const { type, duration } = slide.transition
    if (!transition || !old || type === 'none' || duration <= 0 || reducedMotion(doc)) {
      old?.remove()
      return
    }
    const opts: KeyframeAnimationOptions = { duration, easing: 'ease-in-out', fill: 'both' }
    const anims: globalThis.Animation[] = []
    if (type === 'fade') anims.push(wrap.animate([{ opacity: 0 }, { opacity: 1 }], opts))
    else if (type === 'push') {
      anims.push(wrap.animate([{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }], opts))
      anims.push(old.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-100%)' }], opts))
    } else if (type === 'wipe') anims.push(wrap.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], opts))
    this.running.push(...anims)
    void Promise.all(anims.map((a) => a.finished.catch(() => undefined))).then(() => {
      old.remove()
      anims.forEach((a) => a.cancel())
      this.running = this.running.filter((r) => !anims.includes(r))
    })
  }

  private applyState(done: number): void {
    if (!this.slide) return
    const visible = visibilityAt(this.slide.timeline, done)
    for (const [cell, div] of this.cells) div.style.visibility = visible.get(cell) === false ? 'hidden' : ''
  }

  // Plays step `index` (0-based) of the current slide; resolves when it ends.
  play(index: number): Promise<void> {
    this.finish()
    const slide = this.slide
    const step = slide?.timeline.steps[index]
    if (!slide || !step) return Promise.resolve()
    const reduce = reducedMotion(this.holder.ownerDocument)
    const anims: globalThis.Animation[] = []
    for (const { anim, start } of step.effects) {
      const div = this.cells.get(anim.cell)
      const layer = slide.layers.find((l) => l.cell === anim.cell)
      if (!div || !layer?.box) continue
      const frames = keyframes(anim, layer.box, slide.width, slide.height)
      const duration = reduce ? 1 : Math.max(1, anim.duration)
      const a = div.animate(frames, { duration, delay: reduce ? 0 : start, easing: anim.effect === 'appear' ? 'step-end' : 'ease-out', fill: 'both' })
      if (anim.kind === 'entrance') div.style.visibility = ''
      anims.push(a)
      const kind = anim.kind
      void a.finished.then(
        () => {
          if (kind === 'exit') div.style.visibility = 'hidden'
          a.cancel()
        },
        () => undefined,
      )
    }
    this.running.push(...anims)
    return Promise.all(anims.map((a) => a.finished.catch(() => undefined))).then(() => {
      this.running = this.running.filter((r) => !anims.includes(r))
      this.applyState(index + 1)
    })
  }

  // Jumps running animations and transitions to their end.
  finish(): void {
    for (const a of this.running) {
      try {
        a.finish()
      } catch {
        a.cancel()
      }
    }
    this.running = []
  }

  clear(): void {
    this.finish()
    this.wrap?.remove()
    this.wrap = null
    this.slide = null
  }
}

function reducedMotion(doc: Document): boolean {
  return !!doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

// Keyframes of an effect for a layer that covers the whole slide.
export function keyframes(anim: Animation, box: Box, width: number, height: number): Keyframes {
  const pct = (v: number, of: number) => `${Math.round((v / of) * 10000) / 100}%`
  const origin = `${pct(box.x + box.w / 2, width)} ${pct(box.y + box.h / 2, height)}`
  const exit = anim.kind === 'exit'
  const inOut = (a: Keyframe, b: Keyframe): Keyframes => (exit ? [b, a] : [a, b])
  switch (anim.effect) {
    case 'appear':
      return inOut({ opacity: 0 }, { opacity: 1 })
    case 'fade':
      return inOut({ opacity: 0 }, { opacity: 1 })
    case 'zoom':
      return inOut({ opacity: 0, transform: 'scale(0.05)', transformOrigin: origin }, { opacity: 1, transform: 'scale(1)', transformOrigin: origin })
    case 'fly':
      return inOut({ transform: offSlide(anim.direction, box, width, height) }, { transform: 'translate(0, 0)' })
    case 'wipe':
      return inOut({ clipPath: wipeClip(anim.direction, box, width, height, true) }, { clipPath: wipeClip(anim.direction, box, width, height, false) })
    case 'pulse':
      return [{ transform: 'scale(1)', transformOrigin: origin }, { transform: 'scale(1.12)', transformOrigin: origin }, { transform: 'scale(1)', transformOrigin: origin }]
    case 'spin':
      return [{ transform: 'rotate(0deg)', transformOrigin: origin }, { transform: 'rotate(360deg)', transformOrigin: origin }]
    case 'teeter':
      return [0, 6, -6, 6, -6, 0].map((deg) => ({ transform: `rotate(${deg}deg)`, transformOrigin: origin }))
  }
}

// A translation that puts the object just outside the slide on one side.
function offSlide(direction: Direction, b: Box, width: number, height: number): string {
  const x = (v: number) => `${Math.round((v / width) * 10000) / 100}%`
  const y = (v: number) => `${Math.round((v / height) * 10000) / 100}%`
  if (direction === 'left') return `translate(${x(-(b.x + b.w))}, 0)`
  if (direction === 'right') return `translate(${x(width - b.x)}, 0)`
  if (direction === 'top') return `translate(0, ${y(-(b.y + b.h))})`
  return `translate(0, ${y(height - b.y)})`
}

// The clip that reveals the object from one side: none of it (start) or all of it.
function wipeClip(direction: Direction, b: Box, width: number, height: number, start: boolean): string {
  const px = (v: number) => `${Math.max(0, Math.round((v / width) * 10000) / 100)}%`
  const py = (v: number) => `${Math.max(0, Math.round((v / height) * 10000) / 100)}%`
  if (direction === 'left') return `inset(0 ${px(width - (start ? b.x : b.x + b.w))} 0 0)`
  if (direction === 'right') return `inset(0 0 0 ${px(start ? b.x + b.w : b.x)})`
  if (direction === 'top') return `inset(0 0 ${py(height - (start ? b.y : b.y + b.h))} 0)`
  return `inset(${py(start ? b.y + b.h : b.y)} 0 0 0)`
}
