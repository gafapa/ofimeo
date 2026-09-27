// Small SVG charts for the results (no chart library: horizontal bars and a
// histogram). Colors come from the theme tokens, so they follow dark mode.

const NS = 'http://www.w3.org/2000/svg'

function svg(tag: string, attrs: Record<string, string | number>, text?: string): SVGElement {
  const node = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v))
  if (text !== undefined) node.textContent = text
  return node
}

// One bar per label with count and percentage; `highlight` marks correct options.
export function barChart(rows: { label: string; count: number; highlight?: boolean }[], total: number): HTMLElement {
  const box = document.createElement('div')
  box.className = 'fm-bars'
  const max = Math.max(1, ...rows.map((r) => r.count))
  for (const r of rows) {
    const pct = total ? Math.round((r.count / total) * 100) : 0
    const row = document.createElement('div')
    row.className = `fm-bar-row${r.highlight ? ' correct' : ''}`
    const label = document.createElement('span')
    label.className = 'fm-bar-label'
    label.textContent = r.label
    label.title = r.label
    const track = document.createElement('span')
    track.className = 'fm-bar-track'
    const bar = document.createElement('span')
    bar.className = 'fm-bar'
    bar.style.width = `${(r.count / max) * 100}%`
    track.append(bar)
    const value = document.createElement('span')
    value.className = 'fm-bar-value'
    value.textContent = `${r.count} (${pct} %)`
    row.append(label, track, value)
    box.append(row)
  }
  return box
}

// Vertical histogram (score distribution).
export function histogramChart(bins: { from: number; to: number; count: number }[], title: string): SVGElement {
  const w = 520
  const h = 200
  const pad = { l: 30, r: 8, t: 10, b: 34 }
  const max = Math.max(1, ...bins.map((b) => b.count))
  const bw = (w - pad.l - pad.r) / bins.length
  const root = svg('svg', { viewBox: `0 0 ${w} ${h}`, class: 'fm-hist', role: 'img' })
  root.setAttribute('aria-label', title)
  root.append(svg('line', { x1: pad.l, y1: h - pad.b, x2: w - pad.r, y2: h - pad.b, class: 'fm-axis' }))
  for (let i = 0; i <= max; i += Math.max(1, Math.ceil(max / 4))) {
    const y = h - pad.b - (i / max) * (h - pad.t - pad.b)
    root.append(svg('text', { x: pad.l - 6, y: y + 4, 'text-anchor': 'end', class: 'fm-tick' }, String(i)))
  }
  bins.forEach((b, i) => {
    const bh = (b.count / max) * (h - pad.t - pad.b)
    const x = pad.l + i * bw
    const rect = svg('rect', { x: x + 2, y: h - pad.b - bh, width: Math.max(1, bw - 4), height: bh, class: 'fm-hist-bar', rx: 2 })
    rect.append(svg('title', {}, `${b.from}–${b.to}: ${b.count}`))
    root.append(rect)
    root.append(svg('text', { x: x + bw / 2, y: h - pad.b + 14, 'text-anchor': 'middle', class: 'fm-tick' }, String(b.from)))
  })
  root.append(svg('text', { x: w - pad.r, y: h - 4, 'text-anchor': 'end', class: 'fm-tick' }, String(bins[bins.length - 1]?.to ?? '')))
  return root
}
