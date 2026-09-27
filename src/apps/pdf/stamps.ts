// Correction stamps (check, cross, "Good", "Revise", grade, custom text) and
// the user's signature (drawn once, kept in this browser only).

import { t } from '../../core/i18n'
import { el, showDialog } from '../../ui/widgets'
import type { Annot } from './model'

export interface StampSpec {
  id: string
  label: string
  text?: string
  glyph?: 'check' | 'cross'
  color: string
  alt: string
  size?: number
  // Asks for the text (grade, custom) when chosen.
  ask?: 'grade' | 'custom'
}

export function stampPresets(): StampSpec[] {
  return [
    { id: 'check', label: t('Check mark'), glyph: 'check', color: '#2e7d32', alt: t('Check mark: correct'), size: 16 },
    { id: 'cross', label: t('Cross'), glyph: 'cross', color: '#c62828', alt: t('Cross: incorrect'), size: 16 },
    { id: 'good', label: t('Good'), text: t('Good'), glyph: 'check', color: '#2e7d32', alt: t('Good') },
    { id: 'revise', label: t('Revise'), text: t('Revise'), color: '#e65100', alt: t('Revise') },
    { id: 'grade', label: t('Grade…'), color: '#1565c0', alt: '', ask: 'grade' },
    { id: 'custom', label: t('Custom text…'), color: '#6a1b9a', alt: '', ask: 'custom' },
  ]
}

export const gradeText = (grade: string) => t('Grade: {grade}', { grade })

// ---------- Signature ----------

const SIGNATURE_KEY = 'ofimeo:pdf-signature'

export interface Signature {
  w: number
  h: number
  // Flat [x, y, width, …] strokes in a w × h box.
  strokes: number[][]
}

export function loadSignature(): Signature | null {
  try {
    const s = JSON.parse(localStorage.getItem(SIGNATURE_KEY) ?? 'null') as Signature | null
    return s?.strokes?.length ? s : null
  } catch {
    return null
  }
}

function saveSignature(s: Signature | null): void {
  try {
    if (s) localStorage.setItem(SIGNATURE_KEY, JSON.stringify(s))
    else localStorage.removeItem(SIGNATURE_KEY)
  } catch {
    // Storage unavailable: the signature lasts for this page only.
  }
}

// Draws a new signature; resolves with it (null when cancelled).
export async function drawSignature(): Promise<Signature | null> {
  const W = 400
  const H = 150
  const canvas = el('canvas', { class: 'pdf-sign-canvas', width: W * 2, height: H * 2 })
  canvas.setAttribute('aria-label', t('Signature area: draw your signature with the mouse, a pen or your finger'))
  canvas.setAttribute('role', 'img')
  const g = canvas.getContext('2d')!
  g.scale(2, 2)
  g.lineCap = 'round'
  g.lineJoin = 'round'
  const strokes: number[][] = []
  let current: number[] | null = null
  const point = (e: PointerEvent): [number, number, number] => {
    const r = canvas.getBoundingClientRect()
    const width = e.pointerType === 'pen' ? 1 + e.pressure * 3 : 2.2
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H, Math.round(width * 100) / 100]
  }
  const redraw = () => {
    g.clearRect(0, 0, W, H)
    g.strokeStyle = '#999'
    g.lineWidth = 1
    g.beginPath()
    g.moveTo(20, H - 30)
    g.lineTo(W - 20, H - 30)
    g.stroke()
    g.strokeStyle = '#1a237e'
    for (const s of strokes)
      for (let i = 3; i < s.length; i += 3) {
        g.lineWidth = s[i + 2]
        g.beginPath()
        g.moveTo(s[i - 3], s[i - 2])
        g.lineTo(s[i], s[i + 1])
        g.stroke()
      }
  }
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId)
    current = [...point(e)]
    strokes.push(current)
  })
  canvas.addEventListener('pointermove', (e) => {
    if (!current) return
    for (const ev of e.getCoalescedEvents?.() ?? [e]) current.push(...point(ev))
    redraw()
  })
  canvas.addEventListener('pointerup', () => (current = null))
  const clear = el('button', { type: 'button', textContent: t('Clear') })
  clear.addEventListener('click', () => {
    strokes.length = 0
    redraw()
  })
  redraw()
  const body = el('div', { class: 'pdf-sign' }, el('p', { textContent: t('Draw your signature. It is kept in this browser only and can be placed on any PDF.') }), canvas, el('div', {}, clear))
  const result = await showDialog(t('Signature'), body, [
    { label: t('Cancel'), value: 'cancel' },
    { label: t('Save signature'), value: 'ok', primary: true },
  ])
  if (result !== 'ok' || !strokes.length) return null
  // Crop to the drawing.
  const pts = strokes.flatMap((s) => s.filter((_, i) => i % 3 < 2))
  const xs = pts.filter((_, i) => i % 2 === 0)
  const ys = pts.filter((_, i) => i % 2 === 1)
  const x0 = Math.min(...xs) - 3
  const y0 = Math.min(...ys) - 3
  const sig: Signature = {
    w: Math.max(...xs) - x0 + 3,
    h: Math.max(...ys) - y0 + 3,
    strokes: strokes.map((s) => s.map((v, i) => Math.round((i % 3 === 0 ? v - x0 : i % 3 === 1 ? v - y0 : v) * 100) / 100)),
  }
  saveSignature(sig)
  return sig
}

export const forgetSignature = () => saveSignature(null)

// The signature as an ink annotation `width` points wide centred on (x, y).
export function signatureAnnot(sig: Signature, x: number, y: number, width: number): Pick<Annot, 'strokes' | 'signature'> {
  const k = width / sig.w
  const x0 = x - width / 2
  const y0 = y - (sig.h * k) / 2
  const r = (n: number) => Math.round(n * 100) / 100
  return { signature: true, strokes: sig.strokes.map((s) => s.map((v, i) => r(i % 3 === 0 ? x0 + v * k : i % 3 === 1 ? y0 + v * k : Math.max(0.5, v * k)))) }
}
