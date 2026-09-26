// Small SVG previews of the templates (160 × 100), drawn from primitives.

const W = 160
const H = 100
const svg = (body: string, bg = '#f8f9fa') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" aria-hidden="true"><rect width="${W}" height="${H}" fill="${bg}"/>${body}</svg>`
const rect = (x: number, y: number, w: number, h: number, fill: string, stroke = 'none', rx = 0) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="0.8"/>`
const line = (x1: number, y1: number, x2: number, y2: number, stroke = '#c4c7c5', width = 2) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"/>`
const circle = (cx: number, cy: number, r: number, fill: string, stroke = 'none', opacity = 1) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1" fill-opacity="${opacity}"/>`

// Page with text lines: the base of every document thumbnail.
const page = (body: string) => svg(rect(40, 6, 80, 94, '#fff', '#dadce0') + body)
const textLines = (y: number, n: number, x = 48, w = 64) =>
  Array.from({ length: n }, (_, i) => line(x, y + i * 6, x + (i === n - 1 ? w * 0.6 : w), y + i * 6, '#dadce0', 2)).join('')
const heading = (y: number, color = '#1a73e8', w = 40) => line(48, y, 48 + w, y, color, 3)
const grid = (x: number, y: number, cols: number, rows: number, cw: number, rh: number, head = '#dbe7f7', fill?: (r: number, c: number) => string | null) => {
  let out = ''
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) out += rect(x + c * cw, y + r * rh, cw, rh, r === 0 ? head : (fill?.(r, c) ?? '#fff'), '#c4c7c5')
  return out
}

// Sheet thumbnails: a full-bleed grid.
const sheet = (body: string) => svg(body, '#fff')

// Form thumbnails: a header card and question cards with options.
const form = (body: string) => svg(rect(34, 4, 92, 24, '#fff', '#dadce0', 3) + rect(34, 4, 92, 3, '#00897b') + line(40, 14, 90, 14, '#202124', 3) + line(40, 21, 104, 21) + body, '#e8eaed')
const card = (y: number, h: number, body: string) => rect(34, y, 92, h, '#fff', '#dadce0', 3) + line(40, y + 7, 84, y + 7, '#5f6368', 2) + body
const choices = (y: number, n: number, square = false) =>
  Array.from({ length: n }, (_, i) => (square ? rect(40, y + i * 7 - 2, 4, 4, '#fff', '#5f6368') : circle(42, y + i * 7, 2.2, '#fff', '#5f6368')) + line(48, y + i * 7, 76, y + i * 7, '#dadce0', 2)).join('')

export const THUMBS: Record<string, () => string> = {
  'form-self-assessment': () => form(card(32, 34, grid(40, 43, 5, 3, 16, 7, '#e0f2f1')) + card(70, 26, [0, 1, 2, 3, 4].map((i) => circle(48 + i * 16, 86, 2.5, '#fff', '#5f6368')).join(''))),
  'form-review-quiz': () => form(card(32, 32, choices(44, 3) + rect(96, 40, 22, 7, '#e6f4ea', '#188038', 3)) + card(68, 30, choices(80, 3, true))),
  'form-family-survey': () => form(card(32, 26, [0, 1, 2, 3, 4].map((i) => circle(48 + i * 16, 48, 2.5, i === 3 ? '#00897b' : '#fff', '#5f6368')).join('')) + card(62, 34, choices(74, 3, true))),
  'form-peer-rubric': () => form(card(32, 18, line(40, 44, 110, 44, '#dadce0', 1)) + card(54, 44, grid(40, 64, 5, 4, 16, 7, '#e0f2f1'))),
  'learning-situation': () => page(heading(14, '#174ea6', 56) + grid(48, 20, 2, 4, 32, 5, '#f1f3f4') + heading(46) + textLines(52, 2) + heading(66) + grid(48, 71, 3, 3, 21.3, 6)),
  rubric: () =>
    page(heading(14, '#174ea6', 44) + grid(48, 22, 5, 6, 12.8, 11, '#dbe7f7', (_r, c) => (c === 0 ? '#f1f3f4' : null)) + textLines(92, 1)),
  worksheet: () =>
    page(grid(48, 12, 4, 2, 16, 6, '#f1f3f4', () => '#fff') + heading(33, '#174ea6', 50) + textLines(41, 2) + heading(55, '#1a73e8', 28) + grid(48, 60, 3, 3, 21.3, 6) + textLines(84, 2)),
  report: () => page(heading(34, '#174ea6', 60) + line(60, 42, 100, 42, '#9aa0a6', 2) + textLines(62, 5, 58, 44)),
  minutes: () => page(heading(14, '#174ea6', 40) + grid(48, 20, 2, 4, 32, 5, '#f1f3f4') + heading(46, '#1a73e8', 24) + textLines(52, 3) + grid(48, 74, 3, 3, 21.3, 6)),
  'family-letter': () => page(textLines(14, 2, 48, 30) + line(90, 30, 112, 30, '#9aa0a6') + textLines(40, 5) + line(46, 76, 114, 76, '#9aa0a6', 1) + textLines(84, 2)),
  gradebook: () =>
    sheet(
      grid(4, 8, 9, 8, 17, 11, '#174ea6', (r, c) => {
        if (c === 0) return '#f1f3f4'
        if (c === 8) return '#e6f4ea'
        return (r * 3 + c) % 5 === 0 ? '#fce8e6' : (r + c) % 4 === 0 ? '#e6f4ea' : null
      }),
    ),
  timetable: () => sheet(grid(6, 8, 6, 8, 24.6, 11, '#dbe7f7', (r, c) => (r === 4 ? '#e8eaed' : c === 0 ? '#f1f3f4' : ['#e8f0fe', '#fef7e0', '#e6f4ea', null, '#f3e8fd'][(r * 2 + c) % 5]))),
  attendance: () =>
    sheet(
      grid(4, 8, 19, 8, 8.2, 11, '#dbe7f7', (r, c) => {
        if (c === 0) return '#f1f3f4'
        if (c % 7 === 5 || c % 7 === 6) return '#e8eaed'
        return (r * 5 + c * 3) % 17 === 0 ? '#f28b82' : (r + c * 7) % 23 === 0 ? '#fdd663' : null
      }),
    ),
  'scored-rubric': () =>
    sheet(grid(4, 8, 7, 8, 21.7, 11, '#dbe7f7', (r, c) => (c === 0 ? '#f1f3f4' : c === 6 ? '#e6f4ea' : ['#f28b82', '#fde293', '#81c995', '#c8e6c9'][(r + c) % 4]))),
  'concept-map': () =>
    svg(
      line(80, 22, 40, 50, '#9aa0a6', 1.5) +
        line(80, 22, 120, 50, '#9aa0a6', 1.5) +
        [18, 40, 62].map((x) => line(40, 50, x, 82, '#9aa0a6', 1.2)).join('') +
        [100, 120, 142].map((x) => line(120, 50, x, 82, '#9aa0a6', 1.2)).join('') +
        rect(58, 12, 44, 18, '#1a73e8', 'none', 5) +
        rect(20, 42, 40, 15, '#d2e3fc', '#1a73e8', 4) +
        rect(100, 42, 40, 15, '#fce8b2', '#f9ab00', 4) +
        [6, 30, 54].map((x) => rect(x, 78, 22, 11, '#e8f0fe', '#669df6', 3)).join('') +
        [90, 112, 134].map((x) => rect(x, 78, 20, 11, '#fef7e0', '#f9ab00', 3)).join(''),
    ),
  timeline: () =>
    svg(
      line(8, 50, 152, 50, '#5f6368', 3) +
        ['#1a73e8', '#188038', '#e8710a', '#9334e6', '#d93025'].map((c, i) => {
          const x = 20 + i * 29
          const up = i % 2 === 0
          return line(x, 50, x, up ? 32 : 68, c, 1) + rect(x - 12, up ? 14 : 68, 24, 18, '#fff', c, 3) + circle(x, 50, 4, c)
        }).join(''),
    ),
  flowchart: () =>
    svg(
      line(80, 14, 80, 88, '#9aa0a6', 1.5) +
        line(98, 56, 124, 56, '#9aa0a6', 1.5) +
        rect(62, 6, 36, 12, '#e6f4ea', '#188038', 6) +
        rect(62, 24, 36, 12, '#e8f0fe', '#1a73e8') +
        `<polygon points="80,42 98,56 80,70 62,56" fill="#fef7e0" stroke="#f9ab00"/>` +
        rect(116, 50, 34, 12, '#e8f0fe', '#1a73e8') +
        rect(62, 78, 36, 12, '#e6f4ea', '#188038', 6),
    ),
  organizers: () => svg(circle(62, 50, 32, '#8ab4f8', '#1a73e8', 0.5) + circle(98, 50, 32, '#fdd663', '#f9ab00', 0.5)),
  'slides-learning-situation': () =>
    svg(
      rect(14, 12, 132, 76, '#fff', '#dadce0') +
        rect(14, 12, 4, 76, '#1a73e8') +
        line(26, 24, 90, 24, '#1f2937', 4) +
        [0, 1, 2, 3, 4].map((i) => `<polygon points="${26 + i * 23},44 ${44 + i * 23},44 ${49 + i * 23},52 ${44 + i * 23},60 ${26 + i * 23},60 ${31 + i * 23},52" fill="#1a73e8" fill-opacity="${1 - i * 0.14}"/>`).join('') +
        textLines(70, 2, 26, 100),
    ),
  'oral-presentation': () =>
    svg(
      rect(14, 12, 132, 76, '#188038') + `<rect x="14" y="64" width="132" height="24" fill="#fff" fill-opacity="0.2"/>` +
        line(26, 38, 110, 38, '#fff', 5) +
        line(26, 50, 80, 50, '#e6f4ea', 3),
    ),
  brainstorm: () =>
    svg(
      [
        [22, 16],
        [80, 12],
        [138, 16],
        [22, 84],
        [80, 88],
        [138, 84],
      ]
        .map(([x, y]) => line(80, 50, x, y, '#adb5bd', 1.5))
        .join('') +
        `<ellipse cx="80" cy="50" rx="24" ry="14" fill="#a5d8ff" stroke="#1e1e1e"/>` +
        ['#ffec99', '#b2f2bb', '#ffc9c9', '#d0bfff', '#ffd8a8', '#99e9f2']
          .map((c, i) => rect([8, 66, 124][i % 3], i < 3 ? 6 : 80, 28, 14, c, '#1e1e1e', 2))
          .join(''),
      '#fff',
    ),
}
