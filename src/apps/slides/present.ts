// Presenting: full screen slides with keyboard, click and touch navigation, a
// laser pointer, a presenter view in a second window (current and next slide,
// notes, timer) and "follow the presenter" for the other people in the
// presentation, who see the presenter's slide and laser through awareness.

import type { Awareness } from 'y-protocols/awareness'
import { ChevronLeft, ChevronRight, Maximize, MonitorSpeaker, MousePointer2, X } from 'lucide'
import { t } from '../../core/i18n'
import { el, icon, toast } from '../../ui/widgets'
import { SlideStage, type PlayableSlide } from './player'

export interface PresentHost {
  slides(): { id: string }[]
  render(id: string): SVGSVGElement
  // The slide as layers with its animations and transition.
  playable(id: string): PlayableSlide
  notes(id: string): string
  size(): { width: number; height: number }
  awareness: Awareness
  clientId: number
  // Called when the presentation ends, with the slide shown last.
  onEnd(id: string): void
}

// What a presenter publishes in awareness.
export interface PresentState {
  slide: string
  index: number
  // Laser position in slide coordinates.
  laser?: [number, number] | null
  blank?: boolean
  // Animation steps played on the slide.
  step?: number
}

interface PeerState {
  user?: { name: string; color: string }
  present?: PresentState | null
}

// People presenting right now (other than this browser).
export function presenters(awareness: Awareness, self: number): { clientId: number; name: string; color: string; state: PresentState }[] {
  const out: { clientId: number; name: string; color: string; state: PresentState }[] = []
  for (const [clientId, state] of awareness.getStates() as Map<number, PeerState>) {
    if (clientId === self || !state.present || !state.user) continue
    out.push({ clientId, name: state.user.name, color: state.user.color, state: state.present })
  }
  return out
}

export class Presentation {
  private root: HTMLElement | null = null
  private stage!: HTMLElement
  private laserDot!: HTMLElement
  private counter!: HTMLElement
  private index = 0
  // Animation steps already played on the current slide.
  private step = 0
  private slideStage!: SlideStage
  private presenterStage: SlideStage | null = null
  private laserOn = false
  private blank = false
  private following: number | null = null
  private presenterWindow: Window | null = null
  private startedAt = 0
  private timer = 0
  private hudTimer = 0
  private lastLaser = 0
  private readonly onKey = (e: KeyboardEvent) => this.key(e)
  private readonly onAwareness = () => this.followUpdate()
  // Leaving full screen (Esc) ends the presentation, except with the presenter
  // view open: opening that window may leave full screen by itself.
  private readonly onFullscreen = () => {
    const presenterView = this.presenterWindow && !this.presenterWindow.closed
    if (!document.fullscreenElement && this.root && this.wasFullscreen && !presenterView) this.stop()
  }
  private wasFullscreen = false

  constructor(private readonly host: PresentHost) {}

  get active(): boolean {
    return !!this.root
  }

  get isFollowing(): boolean {
    return this.following !== null
  }

  // Presents from a slide; with presenterView, also opens the presenter window.
  start(fromIndex: number, presenterView = false): void {
    this.open()
    this.index = Math.max(0, Math.min(fromIndex, this.host.slides().length - 1))
    this.startedAt = Date.now()
    this.step = 0
    if (presenterView) this.openPresenterView()
    this.show()
    if (this.slideStage.current?.timeline.auto) this.playStep()
  }

  // Shows what another person is presenting, until they stop or Esc is pressed.
  follow(clientId: number): void {
    this.following = clientId
    this.open()
    this.root!.classList.add('following')
    this.host.awareness.on('change', this.onAwareness)
    this.followUpdate()
  }

  private open(): void {
    if (this.root) this.close()
    this.laserOn = false
    this.blank = false
    this.stage = el('div', { class: 'present-stage' })
    this.laserDot = el('div', { class: 'present-laser', hidden: true })
    this.counter = el('span', { class: 'present-counter' })
    const { width, height } = this.host.size()
    this.stage.style.setProperty('--slide-aspect', `${width} / ${height}`)
    this.stage.style.setProperty('--slide-ratio', String(width / height))
    const holder = el('div', { class: 'present-slide' })
    this.stage.append(holder, this.laserDot)
    this.slideStage = new SlideStage(holder)
    const hudButton = (node: Parameters<typeof icon>[0], label: string, run: () => void) => {
      const b = el('button', { type: 'button', class: 'present-btn', title: label }, icon(node, 20))
      b.setAttribute('aria-label', label)
      b.addEventListener('click', (e) => {
        e.stopPropagation()
        run()
      })
      return b
    }
    const hud = el(
      'div',
      { class: 'present-hud' },
      hudButton(ChevronLeft, t('Previous slide'), () => this.prev()),
      this.counter,
      hudButton(ChevronRight, t('Next slide'), () => this.next()),
      hudButton(MousePointer2, t('Laser pointer (L)'), () => this.toggleLaser()),
      hudButton(MonitorSpeaker, t('Presenter view'), () => this.openPresenterView()),
      hudButton(Maximize, t('Full screen'), () => this.toggleFullscreen()),
      hudButton(X, t('Exit (Esc)'), () => this.stop()),
    )
    const followNote = el('div', { class: 'present-follow-note' })
    this.root = el('div', { class: 'slides-present', tabIndex: -1 }, this.stage, hud, followNote)
    this.root.setAttribute('role', 'dialog')
    this.root.setAttribute('aria-label', t('Presentation'))
    document.body.append(this.root)
    this.root.focus()

    this.stage.addEventListener('click', (e) => {
      if (this.following !== null || this.laserOn) return
      if (e.shiftKey) this.prev()
      else this.next()
    })
    this.root.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      if (this.following === null) this.prev()
    })
    this.root.addEventListener('mousemove', (e) => {
      this.root!.classList.add('show-hud')
      clearTimeout(this.hudTimer)
      this.hudTimer = window.setTimeout(() => this.root?.classList.remove('show-hud'), 2000)
      if (this.laserOn) this.moveLaser(e)
    })
    // Swipe on touch screens.
    let touchX = 0
    this.stage.addEventListener('touchstart', (e) => (touchX = e.touches[0].clientX), { passive: true })
    this.stage.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - touchX
      if (Math.abs(dx) > 50 && this.following === null) {
        if (dx < 0) this.next()
        else this.prev()
      }
    })
    window.addEventListener('keydown', this.onKey, true)
    document.addEventListener('fullscreenchange', this.onFullscreen)
    this.wasFullscreen = false
    const request = document.documentElement.requestFullscreen?.()
    request?.then(() => (this.wasFullscreen = true)).catch(() => {})
  }

  private toggleFullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else
      document.documentElement
        .requestFullscreen?.()
        .then(() => (this.wasFullscreen = true))
        .catch(() => {})
  }

  stop(): void {
    if (!this.root) return
    const slide = this.host.slides()[this.index]?.id
    this.close()
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    if (slide) this.host.onEnd(slide)
  }

  private close(): void {
    window.removeEventListener('keydown', this.onKey, true)
    document.removeEventListener('fullscreenchange', this.onFullscreen)
    this.host.awareness.off('change', this.onAwareness)
    clearInterval(this.timer)
    this.slideStage?.clear()
    this.presenterStage = null
    this.root?.remove()
    this.root = null
    if (this.following === null) this.host.awareness.setLocalStateField('present', null)
    this.following = null
    this.presenterWindow?.close()
    this.presenterWindow = null
  }

  // Re-renders the current slide (after a change by someone else).
  refresh(): void {
    if (!this.root) return
    if (this.following !== null) this.followUpdate(true)
    else this.show(false)
  }

  // Next animation step, else the next slide.
  private next(): void {
    const steps = this.slideStage.current?.timeline.steps.length ?? 0
    if (this.step < steps) {
      this.playStep()
      return
    }
    this.go(this.index + 1)
  }

  // Back one animation step (shown without animating), else the previous slide at its end.
  private prev(): void {
    const tl = this.slideStage.current?.timeline
    const first = tl?.auto ? 1 : 0
    if (tl && this.step > first) {
      this.step--
      this.show(false)
      return
    }
    this.go(this.index - 1, true)
  }

  private playStep(): void {
    const i = this.step++
    void this.slideStage.play(i)
    void this.presenterStage?.play(i)
    this.publish()
  }

  private go(index: number, atEnd = false): void {
    const count = this.host.slides().length
    if (index < 0 || index >= count) return
    const back = atEnd && index !== this.index
    this.index = index
    this.blank = false
    // Going back shows the previous slide with all its steps played.
    this.step = back ? Number.MAX_SAFE_INTEGER : 0
    this.show(true)
    if (!back && this.slideStage.current?.timeline.auto) this.playStep()
  }

  private show(transition = true): void {
    const slides = this.host.slides()
    const id = slides[this.index]?.id
    if (!id || !this.root) return
    this.drawSlide(id, transition)
    this.counter.textContent = `${this.index + 1} / ${slides.length}`
    this.publish()
    this.updatePresenterView()
  }

  private drawSlide(id: string, transition: boolean): void {
    const holder = this.stage.querySelector<HTMLElement>('.present-slide')!
    const changed = holder.getAttribute('data-id') !== id
    const slide = this.host.playable(id)
    this.step = Math.min(this.step, slide.timeline.steps.length)
    this.slideStage.show(slide, this.step, transition && changed)
    holder.classList.toggle('blank', this.blank)
    holder.setAttribute('data-id', id)
  }

  private publish(laser?: [number, number] | null): void {
    if (this.following !== null) return
    const id = this.host.slides()[this.index]?.id
    if (!id) return
    const state: PresentState = { slide: id, index: this.index, laser: this.laserOn ? (laser ?? null) : null, blank: this.blank, step: this.step }
    this.host.awareness.setLocalStateField('present', state)
  }

  private toggleLaser(): void {
    if (this.following !== null) return
    this.laserOn = !this.laserOn
    this.root?.classList.toggle('laser', this.laserOn)
    this.laserDot.hidden = true
    this.publish(null)
  }

  private moveLaser(e: MouseEvent): void {
    const rect = this.stage.getBoundingClientRect()
    const { width, height } = this.host.size()
    const x = ((e.clientX - rect.left) / rect.width) * width
    const y = ((e.clientY - rect.top) / rect.height) * height
    const inside = x >= 0 && y >= 0 && x <= width && y <= height
    this.placeLaser(inside ? [x, y] : null)
    const now = Date.now()
    if (now - this.lastLaser > 40) {
      this.lastLaser = now
      this.publish(inside ? [Math.round(x), Math.round(y)] : null)
    }
  }

  private placeLaser(p: [number, number] | null | undefined): void {
    if (!p) {
      this.laserDot.hidden = true
      return
    }
    const { width, height } = this.host.size()
    this.laserDot.hidden = false
    this.laserDot.style.left = `${(p[0] / width) * 100}%`
    this.laserDot.style.top = `${(p[1] / height) * 100}%`
  }

  private followUpdate(redraw = false): void {
    if (this.following === null || !this.root) return
    const presenter = presenters(this.host.awareness, this.host.clientId).find((p) => p.clientId === this.following)
    if (!presenter) {
      toast(t('The presentation has ended'))
      this.stop()
      return
    }
    const { state } = presenter
    const slides = this.host.slides()
    const index = slides.findIndex((s) => s.id === state.slide)
    if (index < 0) return
    const holder = this.stage.querySelector('.present-slide')!
    this.blank = !!state.blank
    const step = state.step ?? 0
    if (index !== this.index || holder.getAttribute('data-id') !== state.slide) {
      this.index = index
      this.step = step
      this.drawSlide(state.slide, true)
      // The presenter entered the slide and its first step plays by itself.
      if (step === 1 && this.slideStage.current?.timeline.auto) {
        this.step = 0
        this.drawSlide(state.slide, false)
        this.step = 1
        void this.slideStage.play(0)
      }
    } else if (step === this.step + 1 && !redraw) {
      this.step = step
      void this.slideStage.play(step - 1)
    } else if (step !== this.step || redraw) {
      this.step = step
      this.drawSlide(state.slide, false)
    }
    holder.classList.toggle('blank', this.blank)
    this.counter.textContent = `${index + 1} / ${slides.length}`
    this.placeLaser(state.laser)
    this.root.querySelector('.present-follow-note')!.textContent = t('Following {name} · Esc to stop', { name: presenter.name })
  }

  private key(e: KeyboardEvent): void {
    if (!this.root) return
    const k = e.key
    const following = this.following !== null
    let handled = true
    if (k === 'Escape') this.stop()
    else if (following) handled = !['F5', 'Tab'].includes(k) // followers only leave with Esc
    else if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n', 'N'].includes(k)) this.next()
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p', 'P'].includes(k)) this.prev()
    else if (k === 'Home') this.go(0)
    else if (k === 'End') this.go(this.host.slides().length - 1)
    else if (k === 'l' || k === 'L') this.toggleLaser()
    else if (k === 'f' || k === 'F') this.toggleFullscreen()
    else if (k === 'b' || k === 'B' || k === '.') {
      this.blank = !this.blank
      this.show(false)
    } else handled = false
    if (handled) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  // ---------- Presenter view (second window) ----------

  openPresenterView(): void {
    if (this.following !== null) return
    if (this.presenterWindow && !this.presenterWindow.closed) {
      this.presenterWindow.focus()
      return
    }
    const w = window.open('', `presenter-${Date.now()}`, 'popup,width=1100,height=720')
    if (!w) {
      toast(t('Allow pop-ups to open the presenter view'))
      return
    }
    this.presenterWindow = w
    const d = w.document
    d.title = t('Presenter view')
    d.head.innerHTML = `<meta charset="utf-8"><style>${PRESENTER_CSS}</style>`
    d.body.innerHTML = ''
    const button = (label: string, run: () => void) => {
      const b = d.createElement('button')
      b.textContent = label
      b.addEventListener('click', run)
      return b
    }
    const bar = d.createElement('header')
    const time = d.createElement('span')
    time.className = 'timer'
    const count = d.createElement('span')
    count.className = 'count'
    bar.append(
      button(t('◀ Previous'), () => this.prev()),
      button(t('Next ▶'), () => this.next()),
      count,
      time,
      button(t('Reset timer'), () => (this.startedAt = Date.now())),
      button(t('End'), () => this.stop()),
    )
    const current = d.createElement('div')
    current.className = 'current'
    this.presenterStage = new SlideStage(current)
    const next = d.createElement('div')
    next.className = 'next'
    const notes = d.createElement('div')
    notes.className = 'notes'
    const side = d.createElement('div')
    side.className = 'side'
    const nextLabel = d.createElement('h2')
    nextLabel.textContent = t('Next')
    const notesLabel = d.createElement('h2')
    notesLabel.textContent = t('Notes')
    side.append(nextLabel, next, notesLabel, notes)
    const main = d.createElement('main')
    main.append(current, side)
    d.body.append(bar, main)
    const { width, height } = this.host.size()
    d.body.style.setProperty('--slide-aspect', `${width} / ${height}`)
    w.addEventListener('keydown', (e) => this.key(e))
    const tick = () => {
      const s = Math.floor((Date.now() - this.startedAt) / 1000)
      time.textContent = `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
    }
    clearInterval(this.timer)
    this.timer = window.setInterval(tick, 500)
    tick()
    this.updatePresenterView()
  }

  private updatePresenterView(): void {
    const w = this.presenterWindow
    if (!w || w.closed) return
    const d = w.document
    const slides = this.host.slides()
    const place = (selector: string, id: string | undefined) => {
      const box = d.querySelector(selector)
      if (!box) return
      if (!id) {
        box.innerHTML = `<p class="end">${t('End of the presentation')}</p>`
        return
      }
      const svg = this.host.render(id)
      svg.setAttribute('width', '100%')
      svg.setAttribute('height', '100%')
      box.replaceChildren(d.importNode(svg, true))
    }
    const id = slides[this.index]?.id
    const current = d.querySelector<HTMLElement>('.current')
    if (current && id && this.presenterStage) {
      // Same state as the audience sees; steps play here too.
      const shown = this.slideStage.current
      this.presenterStage.show(shown?.id === id ? shown : this.host.playable(id), this.step, false)
    }
    place('.next', slides[this.index + 1]?.id)
    const notes = d.querySelector('.notes')
    if (notes) notes.textContent = slides[this.index] ? this.host.notes(slides[this.index].id) || t('No notes') : ''
    const count = d.querySelector('.count')
    if (count) count.textContent = t('Slide {n} of {total}', { n: this.index + 1, total: slides.length })
  }
}

const PRESENTER_CSS = `
* { box-sizing: border-box; }
body { margin: 0; height: 100vh; display: flex; flex-direction: column; background: #202124; color: #e8eaed; font: 15px system-ui, sans-serif; }
header { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: #2d2e31; }
header button { background: #3c4043; color: #e8eaed; border: 0; border-radius: 6px; padding: 7px 12px; font: inherit; cursor: pointer; }
header button:hover { background: #4a4e53; }
.count { margin-left: 8px; }
.timer { margin-left: auto; font: 600 22px ui-monospace, monospace; }
main { flex: 1; min-height: 0; display: flex; gap: 16px; padding: 16px; }
.current { flex: 2; align-self: flex-start; aspect-ratio: var(--slide-aspect); background: #000; box-shadow: 0 2px 12px #0008; }
.side { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.side h2 { margin: 0; font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: #9aa0a6; }
.next { aspect-ratio: var(--slide-aspect); background: #000; }
.notes { flex: 1; overflow: auto; white-space: pre-wrap; font-size: 20px; line-height: 1.45; background: #2d2e31; border-radius: 8px; padding: 12px; }
.end { color: #9aa0a6; text-align: center; margin-top: 20%; }
svg { display: block; }
`
