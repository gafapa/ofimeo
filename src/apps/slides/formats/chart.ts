// Charts of imported PowerPoint files: the chart part (c:chartSpace) read into
// plain data, and a small SVG renderer for column, bar, line, area, pie and
// doughnut charts, so the slide shows the chart as a picture while its data
// stays with the object.

export type ChartType = 'column' | 'bar' | 'line' | 'area' | 'pie' | 'doughnut'

export interface ChartSeries {
  name: string
  values: number[]
  color?: string
  // Per point colors (pie and doughnut).
  pointColors?: (string | undefined)[]
}

export interface ChartData {
  type: ChartType
  stacked: boolean
  percent: boolean
  title: string
  categories: string[]
  series: ChartSeries[]
  legend: boolean
}

const PALETTE = ['#4472c4', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5', '#70ad47', '#264478', '#9e480e']

const kids = (el: Element | null | undefined, name: string) => (el ? [...el.children].filter((c) => c.localName === name) : [])
const kid = (el: Element | null | undefined, name: string) => kids(el, name)[0] ?? null
const findAll = (el: Element | Document | null | undefined, name: string) => (el ? [...el.getElementsByTagNameNS('*', name)] : [])

// Reads a chart part; `color` resolves a:solidFill-like elements (theme colors).
export function parseChart(doc: Document, color: (fill: Element | null) => string | null): ChartData | null {
  const plot = findAll(doc, 'plotArea')[0]
  if (!plot) return null
  const kinds: [string, ChartType][] = [
    ['barChart', 'column'], ['bar3DChart', 'column'], ['lineChart', 'line'], ['line3DChart', 'line'], ['scatterChart', 'line'],
    ['areaChart', 'area'], ['area3DChart', 'area'], ['pieChart', 'pie'], ['pie3DChart', 'pie'], ['ofPieChart', 'pie'], ['doughnutChart', 'doughnut'],
  ]
  const groups = [...plot.children].filter((c) => kinds.some(([n]) => n === c.localName))
  if (!groups.length) return null
  const first = groups[0]
  let type = kinds.find(([n]) => n === first.localName)![1]
  if (type === 'column' && kid(first, 'barDir')?.getAttribute('val') === 'bar') type = 'bar'
  const grouping = kid(first, 'grouping')?.getAttribute('val') ?? ''
  const series: ChartSeries[] = []
  let categories: string[] = []
  for (const group of groups) {
    for (const ser of kids(group, 'ser')) {
      const name = findAll(kid(ser, 'tx'), 'v').map((v) => v.textContent ?? '').join(' ') || `Series ${series.length + 1}`
      const cat = kid(ser, 'cat') ?? kid(ser, 'xVal')
      const cats = points(cat)
      if (cats.length > categories.length) categories = cats
      const values = points(kid(ser, 'val') ?? kid(ser, 'yVal')).map((v) => Number(v) || 0)
      const spPr = kid(ser, 'spPr')
      const c = color(kid(spPr, 'solidFill')) ?? color(kid(kid(spPr, 'ln'), 'solidFill'))
      const pointColors: (string | undefined)[] = []
      for (const dPt of kids(ser, 'dPt')) {
        const idx = Number(kid(dPt, 'idx')?.getAttribute('val'))
        const pc = color(kid(kid(dPt, 'spPr'), 'solidFill'))
        if (Number.isFinite(idx) && pc) pointColors[idx] = pc
      }
      series.push({ name, values, ...(c ? { color: c } : {}), ...(pointColors.length ? { pointColors } : {}) })
    }
  }
  const titleEl = findAll(doc, 'title')[0]
  const deleted = findAll(doc, 'autoTitleDeleted')[0]?.getAttribute('val') === '1'
  let title = titleEl ? findAll(titleEl, 't').map((t) => t.textContent ?? '').join('') : ''
  if (!title && titleEl && !deleted && series.length === 1) title = series[0].name
  const n = Math.max(0, ...series.map((s) => s.values.length))
  while (categories.length < n) categories.push(String(categories.length + 1))
  return { type, stacked: grouping === 'stacked' || grouping === 'percentStacked', percent: grouping === 'percentStacked', title, categories, series, legend: !!findAll(doc, 'legend')[0] }
}

// Cached values of a data reference (strRef, numRef, multi level or literal), by point index.
function points(ref: Element | null): string[] {
  if (!ref) return []
  const out: string[] = []
  const cache = findAll(ref, 'strCache')[0] ?? findAll(ref, 'numCache')[0] ?? findAll(ref, 'lvl')[0] ?? findAll(ref, 'strLit')[0] ?? findAll(ref, 'numLit')[0] ?? ref
  for (const pt of kids(cache, 'pt')) {
    const idx = Number(pt.getAttribute('idx'))
    out[Number.isFinite(idx) ? idx : out.length] = kid(pt, 'v')?.textContent ?? ''
  }
  return Array.from(out, (v) => v ?? '')
}

// ---------- SVG ----------

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const r2 = (n: number) => Math.round(n * 100) / 100

// A readable axis maximum and step.
function niceScale(max: number, min = 0): { min: number; max: number; step: number } {
  const span = max - min || Math.abs(max) || 1
  const raw = span / 5
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step || step, step }
}

function formatNumber(v: number): string {
  if (Math.abs(v) >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 })
  return String(Math.round(v * 100) / 100)
}

export function renderChartSvg(chart: ChartData, width: number, height: number, font = 'Helvetica, Arial, sans-serif'): string {
  const w = Math.max(80, width)
  const h = Math.max(60, height)
  const fs = Math.max(9, Math.min(14, Math.round(Math.min(w, h) / 28)))
  const parts: string[] = [`<rect width="${w}" height="${h}" fill="#ffffff"/>`]
  let top = 8
  if (chart.title) {
    parts.push(`<text x="${w / 2}" y="${top + fs * 1.2}" font-size="${fs * 1.3}" font-weight="bold" text-anchor="middle" fill="#404040">${esc(chart.title)}</text>`)
    top += fs * 2
  }
  const pie = chart.type === 'pie' || chart.type === 'doughnut'
  const colorOf = (i: number, s?: ChartSeries) => s?.color ?? PALETTE[i % PALETTE.length]
  // Legend at the bottom.
  const legendItems = pie ? chart.categories.map((c, i) => [c, chart.series[0]?.pointColors?.[i] ?? PALETTE[i % PALETTE.length]]) : chart.series.map((s, i) => [s.name, colorOf(i, s)])
  let bottom = h - 6
  if (chart.legend && legendItems.length) {
    const itemW = legendItems.map(([name]) => name.length * fs * 0.6 + fs * 2)
    let x = (w - itemW.reduce((a, b) => a + b, 0)) / 2
    const y = h - fs
    legendItems.forEach(([name, color], i) => {
      parts.push(`<rect x="${r2(x)}" y="${r2(y - fs * 0.8)}" width="${fs * 0.8}" height="${fs * 0.8}" fill="${color}"/>`, `<text x="${r2(x + fs * 1.1)}" y="${r2(y)}" font-size="${fs}" fill="#595959">${esc(name)}</text>`)
      x += itemW[i]
    })
    bottom = h - fs * 2.2
  }

  if (pie) {
    const s = chart.series[0]
    const values = (s?.values ?? []).map((v) => Math.max(0, v))
    const total = values.reduce((a, b) => a + b, 0) || 1
    const cx = w / 2
    const cy = (top + bottom) / 2
    const r = Math.max(10, Math.min(w / 2 - 10, (bottom - top) / 2 - 4))
    const inner = chart.type === 'doughnut' ? r * 0.5 : 0
    let a0 = -Math.PI / 2
    values.forEach((v, i) => {
      const a1 = a0 + (v / total) * Math.PI * 2
      const large = a1 - a0 > Math.PI ? 1 : 0
      const p = (a: number, rad: number) => `${r2(cx + rad * Math.cos(a))} ${r2(cy + rad * Math.sin(a))}`
      const color = s.pointColors?.[i] ?? PALETTE[i % PALETTE.length]
      const d = values.length === 1
        ? `M ${p(0, r)} A ${r} ${r} 0 1 1 ${p(Math.PI, r)} A ${r} ${r} 0 1 1 ${p(0, r)} Z`
        : inner
          ? `M ${p(a0, r)} A ${r} ${r} 0 ${large} 1 ${p(a1, r)} L ${p(a1, inner)} A ${inner} ${inner} 0 ${large} 0 ${p(a0, inner)} Z`
          : `M ${cx} ${cy} L ${p(a0, r)} A ${r} ${r} 0 ${large} 1 ${p(a1, r)} Z`
      parts.push(`<path d="${d}" fill="${color}" stroke="#ffffff" stroke-width="1.5"/>`)
      if (v / total > 0.04) {
        const mid = (a0 + a1) / 2
        const lr = inner ? (r + inner) / 2 : r * 0.62
        parts.push(`<text x="${r2(cx + lr * Math.cos(mid))}" y="${r2(cy + lr * Math.sin(mid) + fs * 0.35)}" font-size="${fs}" text-anchor="middle" fill="#ffffff">${Math.round((v / total) * 100)}%</text>`)
      }
      a0 = a1
    })
    if (inner) parts.push(`<circle cx="${cx}" cy="${cy}" r="${r2(inner)}" fill="#ffffff"/>`)
    return wrap(parts, w, h, font)
  }

  // Axis charts.
  const cats = chart.categories
  const n = cats.length
  const sums = cats.map((_, i) => chart.series.reduce((acc, s) => acc + Math.max(0, s.values[i] ?? 0), 0))
  const negs = cats.map((_, i) => chart.series.reduce((acc, s) => acc + Math.min(0, s.values[i] ?? 0), 0))
  const all = chart.series.flatMap((s) => s.values)
  const rawMax = chart.percent ? 100 : chart.stacked ? Math.max(0, ...sums) : Math.max(0, ...all)
  const rawMin = chart.percent ? 0 : chart.stacked ? Math.min(0, ...negs) : Math.min(0, ...all)
  const scale = niceScale(rawMax, rawMin)
  const horizontal = chart.type === 'bar'
  const labelW = horizontal ? Math.min(w * 0.3, Math.max(...cats.map((c) => c.length), 1) * fs * 0.6 + 8) : String(formatNumber(scale.max)).length * fs * 0.6 + 10
  const left = 8 + labelW
  const right = w - 12
  const plotTop = top + 4
  const plotBottom = bottom - (horizontal ? fs * 1.6 : fs * 1.8)
  const pw = right - left
  const ph = plotBottom - plotTop
  const val = (v: number) => (v - scale.min) / (scale.max - scale.min)
  // Grid and value axis labels.
  for (let v = scale.min; v <= scale.max + 1e-9; v += scale.step) {
    const f = val(v)
    if (horizontal) {
      const x = left + f * pw
      parts.push(`<line x1="${r2(x)}" y1="${r2(plotTop)}" x2="${r2(x)}" y2="${r2(plotBottom)}" stroke="#d9d9d9"/>`, `<text x="${r2(x)}" y="${r2(plotBottom + fs * 1.2)}" font-size="${fs}" text-anchor="middle" fill="#595959">${formatNumber(v)}${chart.percent ? '%' : ''}</text>`)
    } else {
      const y = plotBottom - f * ph
      parts.push(`<line x1="${r2(left)}" y1="${r2(y)}" x2="${r2(right)}" y2="${r2(y)}" stroke="#d9d9d9"/>`, `<text x="${r2(left - 5)}" y="${r2(y + fs * 0.35)}" font-size="${fs}" text-anchor="end" fill="#595959">${formatNumber(v)}${chart.percent ? '%' : ''}</text>`)
    }
  }
  const band = (horizontal ? ph : pw) / Math.max(1, n)
  cats.forEach((c, i) => {
    const mid = (horizontal ? plotTop : left) + band * (i + 0.5)
    if (horizontal) parts.push(`<text x="${r2(left - 5)}" y="${r2(mid + fs * 0.35)}" font-size="${fs}" text-anchor="end" fill="#595959">${esc(c)}</text>`)
    else parts.push(`<text x="${r2(mid)}" y="${r2(plotBottom + fs * 1.3)}" font-size="${fs}" text-anchor="middle" fill="#595959">${esc(c)}</text>`)
  })
  const zero = val(0)
  if (chart.type === 'column' || chart.type === 'bar') {
    const groupW = band * 0.7
    const barW = chart.stacked ? groupW : groupW / Math.max(1, chart.series.length)
    const pos = cats.map(() => 0)
    const neg = cats.map(() => 0)
    chart.series.forEach((s, si) => {
      cats.forEach((_, i) => {
        let v = s.values[i] ?? 0
        if (chart.percent) v = sums[i] ? (Math.max(0, v) / sums[i]) * 100 : 0
        let from = 0
        if (chart.stacked) {
          from = v >= 0 ? pos[i] : neg[i]
          if (v >= 0) pos[i] += v
          else neg[i] += v
        }
        const a = val(from)
        const b = val(from + v)
        const start = band * i + (band - groupW) / 2 + (chart.stacked ? 0 : barW * si)
        const color = colorOf(si, s)
        if (horizontal) parts.push(`<rect x="${r2(left + Math.min(a, b) * pw)}" y="${r2(plotTop + start)}" width="${r2(Math.abs(b - a) * pw)}" height="${r2(barW)}" fill="${color}"/>`)
        else parts.push(`<rect x="${r2(left + start)}" y="${r2(plotBottom - Math.max(a, b) * ph)}" width="${r2(barW)}" height="${r2(Math.abs(b - a) * ph)}" fill="${color}"/>`)
      })
    })
  } else {
    const acc = cats.map(() => 0)
    const xAt = (i: number) => left + band * (i + 0.5)
    const layers: { top: [number, number][]; base: [number, number][] }[] = []
    chart.series.forEach((s) => {
      const base = cats.map((_, i) => [xAt(i), plotBottom - (chart.stacked ? val(acc[i]) : zero) * ph] as [number, number])
      const topPts = cats.map((_, i) => {
        let v = s.values[i] ?? 0
        if (chart.percent) v = sums[i] ? (v / sums[i]) * 100 : 0
        if (chart.stacked) acc[i] += v
        return [xAt(i), plotBottom - val(chart.stacked ? acc[i] : v) * ph] as [number, number]
      })
      layers.push({ top: topPts, base })
    })
    layers.forEach(({ top: pts, base }, si) => {
      const color = colorOf(si, chart.series[si])
      const line = pts.map(([x, y]) => `${r2(x)},${r2(y)}`).join(' ')
      if (chart.type === 'area') {
        const poly = [...pts, ...[...base].reverse()].map(([x, y]) => `${r2(x)},${r2(y)}`).join(' ')
        parts.push(`<polygon points="${poly}" fill="${color}" fill-opacity="0.85"/>`)
      } else {
        parts.push(`<polyline points="${line}" fill="none" stroke="${color}" stroke-width="2.25" stroke-linejoin="round"/>`)
        for (const [x, y] of pts) parts.push(`<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(Math.max(2, fs / 4))}" fill="${color}"/>`)
      }
    })
  }
  // Axis lines.
  if (horizontal) parts.push(`<line x1="${r2(left + zero * pw)}" y1="${r2(plotTop)}" x2="${r2(left + zero * pw)}" y2="${r2(plotBottom)}" stroke="#bfbfbf"/>`)
  else parts.push(`<line x1="${r2(left)}" y1="${r2(plotBottom - zero * ph)}" x2="${r2(right)}" y2="${r2(plotBottom - zero * ph)}" stroke="#bfbfbf"/>`)
  return wrap(parts, w, h, font)
}

function wrap(parts: string[], w: number, h: number, font: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${r2(w)}" height="${r2(h)}" viewBox="0 0 ${r2(w)} ${r2(h)}" font-family="${esc(font)}">${parts.join('')}</svg>`
}

// A data URI for a style (draw.io keeps them without ";base64").
export function svgDataUri(svg: string): string {
  const bytes = new TextEncoder().encode(svg)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:image/svg+xml,${btoa(binary)}`
}
