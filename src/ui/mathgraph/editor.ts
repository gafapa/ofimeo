// "Math graph" editor dialog: an algebra list of rows (functions, equations,
// inequalities, curves, points, geometry commands), sliders that can play,
// construction tools that update when points are dragged, a table of values,
// window and display settings, and text readouts for screen readers.
// Resolves with the new construction and its rendered picture.

import { Eye, EyeOff, Maximize, Minus, Pause, Play, Plus, Scaling, Trash2 } from 'lucide'
import { t } from '../../core/i18n'
import { icon } from '../widgets'
import { equationHtml } from '../equation'
import { compute, type Computed, type Pt, type RowResult } from './compute'
import { altText, describeGraph, describeRow, fmt, fmtPoint, functionSpecials } from './describe'
import { cloneGraph, COLORS, newGraph, newId, type GraphDoc, type Row } from './model'
import { formatNumber, gridStep, renderSvg, transform } from './render'
import type { Special } from './analysis'
import './mathgraph.css'

export interface GraphEditOptions {
  graph?: GraphDoc | null
  readOnly?: boolean
  // Open on the geometry tools.
  geometry?: boolean
}

export interface GraphImage {
  doc: GraphDoc
  svg: string
  // PNG data URL at twice the size (sharp when printed).
  png: string
  alt: string
  width: number
  height: number
}

type Tool = 'move' | 'point' | 'segment' | 'line' | 'ray' | 'circle' | 'polygon' | 'midpoint' | 'perpendicular' | 'parallel' | 'intersect' | 'angle'

const TOOLS: { id: Tool; label: () => string; hint: () => string }[] = [
  { id: 'move', label: () => t('Move'), hint: () => t('Drag points to move them, drag the background to pan, use the wheel to zoom.') },
  { id: 'point', label: () => t('Point'), hint: () => t('Click to place a point.') },
  { id: 'segment', label: () => t('Segment'), hint: () => t('Click two points.') },
  { id: 'line', label: () => t('Line'), hint: () => t('Click two points.') },
  { id: 'ray', label: () => t('Ray'), hint: () => t('Click the start point, then a point on the ray.') },
  { id: 'circle', label: () => t('Circle'), hint: () => t('Click the center, then a point on the circle.') },
  { id: 'polygon', label: () => t('Polygon'), hint: () => t('Click the vertices, then the first one again (or press Enter).') },
  { id: 'midpoint', label: () => t('Midpoint'), hint: () => t('Click two points.') },
  { id: 'perpendicular', label: () => t('Perpendicular'), hint: () => t('Click a line or segment, then a point.') },
  { id: 'parallel', label: () => t('Parallel'), hint: () => t('Click a line or segment, then a point.') },
  { id: 'intersect', label: () => t('Intersect'), hint: () => t('Click two lines, segments or circles.') },
  { id: 'angle', label: () => t('Angle'), hint: () => t('Click three points: one arm, the vertex, the other arm.') },
]

// Renders a construction to SVG, PNG and alternative text (for documents).
export async function renderGraphImage(doc: GraphDoc): Promise<GraphImage> {
  const computed = compute(doc)
  const specials = doc.options.special ? functionSpecials(doc, computed) : []
  const svg = renderSvg(doc, computed, { specials, numberFormat: (v) => fmt(v) })
  const hi = renderSvg(doc, computed, { specials, scale: 2, numberFormat: (v) => fmt(v) })
  return { doc, svg, png: await svgToPng(hi, doc.width * 2, doc.height * 2), alt: altText(doc, computed), width: doc.width, height: doc.height }
}

export async function svgToPng(svg: string, width: number, height: number): Promise<string> {
  const img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
  return canvas.toDataURL('image/png')
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: (Node | string | null | false | undefined)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue
    if (k === 'class') node.className = String(v)
    else if (k.startsWith('aria-') || k === 'role' || k.startsWith('data-') || k === 'for') node.setAttribute(k, String(v))
    else (node as unknown as Record<string, unknown>)[k] = v
  }
  for (const c of children) if (c) node.append(c)
  return node
}

function iconButton(glyph: Parameters<typeof icon>[0], label: string, run: () => void, cls = 'mg-icon'): HTMLButtonElement {
  const b = h('button', { type: 'button', class: cls, title: label, 'aria-label': label }, icon(glyph, 16))
  b.addEventListener('click', run)
  return b
}

let dialogCount = 0

export function editGraph(options: GraphEditOptions = {}): Promise<GraphImage | null> {
  const readOnly = !!options.readOnly
  const isNew = !options.graph
  const doc: GraphDoc = options.graph ? cloneGraph(options.graph) : newGraph(options.geometry)
  if (!doc.rows.length && !readOnly) doc.rows.push({ id: newId(), text: '', color: COLORS[0] })
  const initialView = { ...doc.view }
  const id = ++dialogCount

  let computed: Computed = compute(doc)
  let specials: Special[] = []
  let selected: string | null = doc.rows[0]?.id ?? null
  let tool: Tool = options.geometry ? 'point' : 'move'
  let picks: string[] = []
  let trace: { x: number } | null = null
  let playing: string | null = null
  let frame = 0

  // ---------- Layout ----------

  const dialog = h('dialog', { class: 'dlg mg-dialog', 'aria-labelledby': `mg-title-${id}` })
  const title = h('h2', { id: `mg-title-${id}`, textContent: readOnly ? t('Math graph') : isNew ? t('Insert math graph') : t('Edit math graph') })
  const helpButton = h('button', { type: 'button', class: 'dlg-help', textContent: '?', title: t('Help'), 'aria-label': t('Help about this') })
  helpButton.addEventListener('click', () => void import('../../help/center').then((m) => m.openHelp('math-graph' as never)))

  const tabs = h('div', { class: 'mg-tabs', role: 'tablist', 'aria-label': t('Graph panels') })
  const panels = h('div', { class: 'mg-panels' })
  const tabNames: [string, string][] = [['algebra', t('Algebra')], ['geometry', t('Geometry')], ['table', t('Table')], ['settings', t('Settings')]]
  const panelOf: Record<string, HTMLElement> = {}
  const tabOf: Record<string, HTMLButtonElement> = {}
  for (const [key, label] of tabNames) {
    const tab = h('button', { type: 'button', role: 'tab', id: `mg-tab-${key}-${id}`, 'aria-controls': `mg-panel-${key}-${id}`, textContent: label, class: 'mg-tab' })
    const panel = h('div', { role: 'tabpanel', id: `mg-panel-${key}-${id}`, 'aria-labelledby': tab.id, class: `mg-panel mg-panel-${key}` })
    tab.addEventListener('click', () => showTab(key))
    tab.addEventListener('keydown', (e) => {
      const keys = tabNames.map((n) => n[0])
      const i = keys.indexOf(key)
      const next = e.key === 'ArrowRight' ? keys[(i + 1) % keys.length] : e.key === 'ArrowLeft' ? keys[(i + keys.length - 1) % keys.length] : null
      if (next) {
        e.preventDefault()
        showTab(next)
        tabOf[next].focus()
      }
    })
    tabs.append(tab)
    panels.append(panel)
    panelOf[key] = panel
    tabOf[key] = tab
  }
  function showTab(key: string) {
    for (const [k] of tabNames) {
      tabOf[k].setAttribute('aria-selected', String(k === key))
      tabOf[k].tabIndex = k === key ? 0 : -1
      panelOf[k].hidden = k !== key
    }
    if (key === 'table') renderTable()
    if (key === 'geometry') renderPointList()
    if (key !== 'geometry' && tool !== 'move') setTool('move')
    if (key === 'geometry' && tool === 'move' && options.geometry) setTool('point')
  }

  // Algebra: rows and sliders.
  const rowList = h('ol', { class: 'mg-rows', 'aria-label': t('Expressions') })
  const addRowButton = h('button', { type: 'button', class: 'mg-add', textContent: `+ ${t('Add expression')}` })
  addRowButton.addEventListener('click', () => addRow())
  const examples = h('p', { class: 'hint mg-examples', textContent: t('Examples: y = a x^2 + b, f(x) = sin(x), x^2 + y^2 = 9, y > x − 1, (cos t, sin t), r = 2cos(3θ), A = (1, 2), M = Midpoint(A, B)') })
  const sliderList = h('div', { class: 'mg-sliders', role: 'group', 'aria-label': t('Sliders') })
  const addSliderButton = h('button', { type: 'button', class: 'mg-add', textContent: `+ ${t('Add slider')}` })
  addSliderButton.addEventListener('click', () => {
    const name = 'abcdkmnpqsuvw'.split('').find((n) => !doc.sliders.some((s) => s.name === n) && !computed.byName.has(n)) ?? `k${doc.sliders.length + 1}`
    doc.sliders.push({ name, value: 1, min: -5, max: 5, step: 0.1 })
    renderSliders()
    update()
    sliderList.querySelector<HTMLInputElement>(`[data-slider="${name}"] input[type=range]`)?.focus()
  })
  panelOf.algebra.append(rowList, ...(readOnly ? [] : [addRowButton, examples]), h('h3', { class: 'mg-sub', textContent: t('Sliders') }), sliderList, ...(readOnly ? [] : [addSliderButton]))

  // Geometry: tools and free points.
  const toolBox = h('div', { class: 'mg-tools', role: 'toolbar', 'aria-label': t('Construction tools') })
  const toolHint = h('p', { class: 'hint mg-tool-hint', 'aria-live': 'polite' })
  const toolButtons: Partial<Record<Tool, HTMLButtonElement>> = {}
  for (const tl of TOOLS) {
    const b = h('button', { type: 'button', class: 'mg-tool', textContent: tl.label(), 'aria-pressed': 'false' })
    b.addEventListener('click', () => setTool(tl.id))
    toolButtons[tl.id] = b
    toolBox.append(b)
  }
  const pointList = h('div', { class: 'mg-points', role: 'group', 'aria-label': t('Free points') })
  panelOf.geometry.append(
    ...(readOnly ? [] : [toolBox, toolHint]),
    h('p', { class: 'hint', textContent: t('Commands can also be typed in Algebra: Segment(A, B), Line, Ray, Circle(A, B), Polygon(A, B, C), Midpoint(A, B), Perpendicular(s1, C), Parallel(s1, C), Intersect(c1, c2), Angle(A, B, C), Distance(A, B), Area(poly1).') }),
    h('h3', { class: 'mg-sub', textContent: t('Free points') }),
    pointList,
  )

  // Table of values.
  const tableStart = h('input', { type: 'number', class: 'field', value: '-5', step: 'any' })
  const tableStep = h('input', { type: 'number', class: 'field', value: '1', step: 'any', min: '0' })
  const tableBox = h('div', { class: 'mg-table-wrap' })
  tableStart.addEventListener('input', () => renderTable())
  tableStep.addEventListener('input', () => renderTable())
  panelOf.table.append(
    h('div', { class: 'mg-grid2' }, h('label', { class: 'field-label' }, t('Start x'), tableStart), h('label', { class: 'field-label' }, t('Step'), tableStep)),
    tableBox,
  )

  // Settings.
  const numberField = (label: string, get: () => number, set: (v: number) => void, attrs: Record<string, string> = {}) => {
    const input = h('input', { type: 'number', class: 'field', step: 'any', ...attrs })
    input.value = String(get())
    input.addEventListener('change', () => {
      const v = parseFloat(input.value)
      if (Number.isFinite(v)) {
        set(v)
        update()
      }
      input.value = String(get())
    })
    return { label: h('label', { class: 'field-label' }, label, input), input, refresh: () => (input.value = String(round(get()))) }
  }
  const round = (v: number) => Math.round(v * 1e6) / 1e6
  const viewFields = [
    numberField(t('x min'), () => doc.view.xmin, (v) => v < doc.view.xmax && (doc.view.xmin = v)),
    numberField(t('x max'), () => doc.view.xmax, (v) => v > doc.view.xmin && (doc.view.xmax = v)),
    numberField(t('y min'), () => doc.view.ymin, (v) => v < doc.view.ymax && (doc.view.ymin = v)),
    numberField(t('y max'), () => doc.view.ymax, (v) => v > doc.view.ymin && (doc.view.ymax = v)),
  ]
  const sizeFields = [
    numberField(t('Width (px)'), () => doc.width, (v) => (doc.width = Math.round(Math.min(1600, Math.max(120, v)))), { min: '120', max: '1600', step: '10' }),
    numberField(t('Height (px)'), () => doc.height, (v) => (doc.height = Math.round(Math.min(1600, Math.max(90, v)))), { min: '90', max: '1600', step: '10' }),
  ]
  const check = (label: string, key: keyof GraphDoc['options']) => {
    const box = h('input', { type: 'checkbox', checked: doc.options[key] })
    box.addEventListener('change', () => {
      doc.options[key] = box.checked
      update()
    })
    return h('label', { class: 'check' }, box, label)
  }
  panelOf.settings.append(
    h('h3', { class: 'mg-sub', textContent: t('Window') }),
    h('div', { class: 'mg-grid2' }, ...viewFields.map((f) => f.label)),
    h('h3', { class: 'mg-sub', textContent: t('Display') }),
    check(t('Grid'), 'grid'),
    check(t('Axes'), 'axes'),
    check(t('Axis numbers'), 'numbers'),
    check(t('Show roots, extrema and intersections'), 'special'),
    check(t('Show segment lengths'), 'lengths'),
    check(t('Angles in degrees for sin, cos and tan'), 'degrees'),
    check(t('Snap points to the grid'), 'snap'),
    h('h3', { class: 'mg-sub', textContent: t('Picture size') }),
    h('div', { class: 'mg-grid2' }, ...sizeFields.map((f) => f.label)),
  )
  if (readOnly) panelOf.settings.querySelectorAll('input').forEach((i) => ((i as HTMLInputElement).disabled = (i as HTMLInputElement).type !== 'checkbox'))

  // Canvas with its own small toolbar.
  const canvas = h('div', { class: 'mg-canvas', tabIndex: 0, role: 'application', 'aria-roledescription': t('graph'), 'aria-label': t('Graph'), 'aria-describedby': `mg-keys-${id}` })
  const keysHint = h('p', { class: 'sr-only', id: `mg-keys-${id}`, textContent: t('Arrow keys move the selected point, trace the selected function or pan; + and − zoom; 0 resets the view.') })
  const live = h('div', { class: 'mg-live', 'aria-live': 'polite', role: 'status' })
  const readout = h('ul', { class: 'mg-readout', 'aria-label': t('Readouts') })
  const canvasBar = h(
    'div',
    { class: 'mg-canvas-bar', role: 'toolbar', 'aria-label': t('View') },
    iconButton(Plus, t('Zoom in'), () => zoom(1 / 1.25)),
    iconButton(Minus, t('Zoom out'), () => zoom(1.25)),
    iconButton(Maximize, t('Standard view'), () => resetView()),
    iconButton(Scaling, t('Equal scale on both axes'), () => equalScale()),
  )
  const main = h('div', { class: 'mg-main' }, canvasBar, canvas, keysHint, live, h('details', { class: 'mg-readout-box', open: true }, h('summary', { textContent: t('Readouts') }), readout))
  const side = h('div', { class: 'mg-side' }, tabs, panels)
  const body = h('div', { class: 'mg-body' }, side, main)

  const downloadSvg = h('button', { type: 'button', textContent: t('Download SVG') })
  const downloadPng = h('button', { type: 'button', textContent: t('Download PNG') })
  const cancel = h('button', { type: 'button', textContent: readOnly ? t('Close') : t('Cancel') })
  const ok = h('button', { type: 'button', class: 'primary', textContent: isNew ? t('Insert') : t('Update') })
  const actions = h('div', { class: 'dlg-actions' }, downloadSvg, downloadPng, h('span', { class: 'mg-spacer' }), cancel, ...(readOnly ? [] : [ok]))
  dialog.append(h('div', { class: 'mg-wrap' }, h('div', { class: 'dlg-head' }, title, helpButton), body, actions))

  // ---------- Rows ----------

  function addRow(after?: string, text = ''): Row {
    const color = COLORS[doc.rows.length % COLORS.length]
    const row: Row = { id: newId(), text, color }
    const i = after ? doc.rows.findIndex((r) => r.id === after) : -1
    if (i >= 0) doc.rows.splice(i + 1, 0, row)
    else doc.rows.push(row)
    renderRows()
    update()
    rowInput(row.id)?.focus()
    return row
  }
  const rowInput = (rowId: string) => rowList.querySelector<HTMLInputElement>(`[data-row="${rowId}"] input.mg-expr`)

  function removeRow(rowId: string) {
    const i = doc.rows.findIndex((r) => r.id === rowId)
    if (i < 0) return
    doc.rows.splice(i, 1)
    if (selected === rowId) selected = null
    renderRows()
    update()
    const next = doc.rows[Math.min(i, doc.rows.length - 1)]
    if (next) rowInput(next.id)?.focus()
    else addRowButton.focus()
  }

  function renderRows() {
    rowList.replaceChildren()
    doc.rows.forEach((row, n) => {
      const li = h('li', { class: 'mg-row', 'data-row': row.id })
      const color = h('input', { type: 'color', value: row.color, class: 'mg-color', 'aria-label': t('Color of expression {n}', { n: n + 1 }), disabled: readOnly })
      color.addEventListener('input', () => {
        row.color = color.value
        update()
      })
      const input = h('input', {
        type: 'text', class: 'mg-expr', value: row.text, spellcheck: false, autocomplete: 'off', readOnly,
        'aria-label': t('Expression {n}', { n: n + 1 }), 'aria-describedby': `mg-err-${row.id}`, placeholder: n === 0 ? 'y = a x^2' : '',
      })
      input.addEventListener('focus', () => {
        selected = row.id
        trace = null
        draw()
        renderTableIfVisible()
      })
      input.addEventListener('input', () => {
        row.text = input.value
        update()
      })
      input.addEventListener('change', () => addMissingSliders())
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          addMissingSliders()
          const next = doc.rows[doc.rows.indexOf(row) + 1]
          if (next) rowInput(next.id)?.focus()
          else if (!readOnly && row.text.trim()) addRow(row.id)
        } else if (e.key === 'Backspace' && !input.value && doc.rows.length > 1 && !readOnly) {
          e.preventDefault()
          removeRow(row.id)
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          const other = doc.rows[doc.rows.indexOf(row) + (e.key === 'ArrowDown' ? 1 : -1)]
          if (other) {
            e.preventDefault()
            rowInput(other.id)?.focus()
          }
        }
      })
      const eye = iconButton(row.hidden ? EyeOff : Eye, row.hidden ? t('Show') : t('Hide'), () => {
        row.hidden = !row.hidden
        renderRows()
        update()
        rowList.querySelector<HTMLButtonElement>(`[data-row="${row.id}"] .mg-eye`)?.focus()
      }, 'mg-icon mg-eye')
      eye.setAttribute('aria-pressed', String(!!row.hidden))
      eye.setAttribute('aria-label', t('Hide expression {n}', { n: n + 1 }))
      const del = iconButton(Trash2, t('Delete expression {n}', { n: n + 1 }), () => removeRow(row.id))
      const preview = h('div', { class: 'mg-preview', 'aria-hidden': 'true' })
      const error = h('div', { class: 'mg-error', id: `mg-err-${row.id}` })
      li.append(h('div', { class: 'mg-row-line' }, color, input, eye, ...(readOnly ? [] : [del])), preview, error)
      rowList.append(li)
    })
    refreshRowInfo()
  }

  // Previews (KaTeX) and errors of every row, without rebuilding the inputs.
  function refreshRowInfo() {
    for (const r of computed.results) {
      const li = rowList.querySelector(`[data-row="${r.row.id}"]`)
      if (!li) continue
      const preview = li.querySelector<HTMLElement>('.mg-preview')!
      const error = li.querySelector<HTMLElement>('.mg-error')!
      const latex = r.latex
      const key = `${latex}|${r.name}`
      if (preview.dataset.key !== key) {
        preview.dataset.key = key
        preview.innerHTML = latex ? equationHtml(latex) : ''
      }
      const unknown = r.kind !== 'error' ? computed.unknown.filter((n) => r.row.text.includes(n)) : []
      error.textContent = r.error ? translateError(r.error) : unknown.length ? t('Press Enter to add sliders for {names}', { names: unknown.join(', ') }) : r.command && !r.value ? t('{name} does not exist (the objects do not meet)', { name: r.name }) : ''
      error.classList.toggle('warn', !r.error)
      li.classList.toggle('selected', r.row.id === selected)
      const input = li.querySelector<HTMLInputElement>('input.mg-expr')!
      input.setAttribute('aria-invalid', String(!!r.error))
    }
  }

  function addMissingSliders() {
    if (readOnly) return
    const names = computed.unknown.filter((n) => /^[\p{L}][\p{L}\d_]{0,15}$/u.test(n) && !doc.sliders.some((s) => s.name === n))
    if (!names.length) return
    for (const name of names) doc.sliders.push({ name, value: 1, min: -5, max: 5, step: 0.1 })
    renderSliders()
    update()
    announce(t('Sliders added: {names}', { names: names.join(', ') }))
  }

  // ---------- Sliders ----------

  function renderSliders() {
    sliderList.replaceChildren()
    for (const s of doc.sliders) {
      const box = h('div', { class: 'mg-slider', 'data-slider': s.name })
      const range = h('input', { type: 'range', min: String(s.min), max: String(s.max), step: String(s.step), value: String(s.value), 'aria-label': t('Slider {name}', { name: s.name }) })
      const value = h('input', { type: 'number', class: 'field mg-slider-value', step: String(s.step), value: String(s.value), 'aria-label': t('Value of {name}', { name: s.name }) })
      const set = (v: number) => {
        s.value = Math.min(s.max, Math.max(s.min, v))
        range.value = String(s.value)
        value.value = String(round(s.value))
        range.setAttribute('aria-valuetext', `${s.name} = ${fmt(s.value)}`)
        update()
      }
      range.addEventListener('input', () => set(parseFloat(range.value)))
      value.addEventListener('change', () => {
        const v = parseFloat(value.value)
        if (Number.isFinite(v)) {
          if (v > s.max) s.max = v
          if (v < s.min) s.min = v
          range.min = String(s.min)
          range.max = String(s.max)
          set(v)
        }
      })
      const play = iconButton(playing === s.name ? Pause : Play, playing === s.name ? t('Pause {name}', { name: s.name }) : t('Play {name}', { name: s.name }), () => togglePlay(s.name))
      play.setAttribute('aria-pressed', String(playing === s.name))
      const limits = h('details', { class: 'mg-limits' }, h('summary', { textContent: t('Limits') }))
      const limit = (label: string, key: 'min' | 'max' | 'step') => {
        const input = h('input', { type: 'number', class: 'field', step: 'any', value: String(s[key]), disabled: readOnly })
        input.addEventListener('change', () => {
          const v = parseFloat(input.value)
          if (!Number.isFinite(v) || (key === 'step' && v <= 0) || (key === 'min' && v >= s.max) || (key === 'max' && v <= s.min)) {
            input.value = String(s[key])
            return
          }
          s[key] = v
          renderSliders()
          set(s.value)
        })
        return h('label', { class: 'field-label' }, label, input)
      }
      limits.append(h('div', { class: 'mg-grid3' }, limit(t('Min'), 'min'), limit(t('Max'), 'max'), limit(t('Step'), 'step')))
      const del = iconButton(Trash2, t('Delete slider {name}', { name: s.name }), () => {
        doc.sliders = doc.sliders.filter((x) => x !== s)
        if (playing === s.name) playing = null
        renderSliders()
        update()
      })
      box.append(h('div', { class: 'mg-slider-line' }, h('span', { class: 'mg-slider-name', textContent: `${s.name} =` }), value, play, ...(readOnly ? [] : [del])), range, limits)
      sliderList.append(box)
    }
    if (!doc.sliders.length) sliderList.append(h('p', { class: 'hint', textContent: t('Letters without a value (like a in y = a x^2) become sliders.') }))
  }

  function togglePlay(name: string) {
    playing = playing === name ? null : name
    cancelAnimationFrame(frame)
    renderSliders()
    if (!playing) {
      announce(describeSliders())
      return
    }
    let last = performance.now()
    let dir = 1
    const tick = (now: number) => {
      const s = doc.sliders.find((x) => x.name === playing)
      if (!s || !dialog.open) return
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      s.value += (dir * (s.max - s.min) * dt) / 4
      if (s.value >= s.max) (s.value = s.max), (dir = -1)
      if (s.value <= s.min) (s.value = s.min), (dir = 1)
      const box = sliderList.querySelector(`[data-slider="${s.name}"]`)
      const range = box?.querySelector<HTMLInputElement>('input[type=range]')
      const value = box?.querySelector<HTMLInputElement>('input[type=number]')
      if (range) range.value = String(s.value)
      if (value) value.value = String(Math.round(s.value / s.step) * s.step === s.value ? s.value : round(Math.round(s.value * 100) / 100))
      update(false)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
  }
  const describeSliders = () => doc.sliders.map((s) => `${s.name} = ${fmt(s.value)}`).join(', ')

  // ---------- Geometry ----------

  function setTool(next: Tool) {
    tool = next
    picks = []
    for (const tl of TOOLS) toolButtons[tl.id]?.setAttribute('aria-pressed', String(tl.id === tool))
    toolHint.textContent = TOOLS.find((x) => x.id === tool)!.hint()
    canvas.dataset.tool = tool
    draw()
  }

  function renderPointList() {
    pointList.replaceChildren()
    const free = computed.results.filter((r) => r.free && r.value?.t === 'point')
    if (!free.length) pointList.append(h('p', { class: 'hint', textContent: t('No free points yet.') }))
    for (const r of free) {
      const p = r.value as Pt
      const field = (axis: 'x' | 'y') => {
        const input = h('input', { type: 'number', class: 'field', step: 'any', value: String(round(p[axis])), 'aria-label': t('{axis} of {name}', { axis, name: r.name }), disabled: readOnly })
        input.addEventListener('change', () => {
          const v = parseFloat(input.value)
          const cur = computed.byName.get(r.name)?.value as Pt | undefined
          if (Number.isFinite(v) && cur) movePoint(r.name, axis === 'x' ? v : cur.x, axis === 'y' ? v : cur.y, false)
        })
        return h('label', { class: 'field-label' }, `${axis}`, input)
      }
      pointList.append(h('div', { class: 'mg-point', 'data-point': r.name }, h('strong', { textContent: r.name }), field('x'), field('y')))
    }
  }

  // Rewrites the row of a free point with new coordinates.
  function movePoint(name: string, x: number, y: number, snap = true) {
    const r = computed.byName.get(name)
    if (!r?.free || readOnly) return
    if (snap && doc.options.snap) {
      const step = snapStep()
      x = Math.round(x / step) * step
      y = Math.round(y / step) * step
    }
    const text = `${name} = (${num(x)}, ${num(y)})`
    r.row.text = text
    const input = rowInput(r.row.id)
    if (input) input.value = text
    update()
    announce(`${name} = ${fmtPoint(x, y)}`)
  }
  const snapStep = () => gridStep(doc).x / 2
  const num = (v: number) => formatNumber(v, 4).replace('−', '-')

  function nextName(kind: 'point' | 'segment' | 'line' | 'ray' | 'circle' | 'polygon' | 'angle'): string {
    const taken = new Set<string>([...computed.byName.keys(), ...doc.sliders.map((s) => s.name)])
    for (const r of doc.rows) {
      const m = /^\s*(\p{L}[\p{L}\d_]*)\s*(\(|=)/u.exec(r.text)
      if (m) taken.add(m[1])
    }
    if (kind === 'point') {
      for (let n = 0; ; n++) {
        for (let i = 0; i < 26; i++) {
          const name = String.fromCharCode(65 + i) + (n ? String(n) : '')
          if (!taken.has(name) && name !== 'E') return name
        }
      }
    }
    if (kind === 'angle') {
      const greek = ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'κ', 'φ', 'ψ']
      const g = greek.find((x) => !taken.has(x))
      if (g) return g
    }
    const prefix = { segment: 's', line: 'l', ray: 'r', circle: 'c', polygon: 'poly', angle: 'ang' }[kind]
    for (let i = 1; ; i++) if (!taken.has(`${prefix}${i}`)) return `${prefix}${i}`
  }

  function addConstruction(text: string) {
    const row: Row = { id: newId(), text, color: COLORS[doc.rows.length % COLORS.length] }
    // Replace a trailing empty row instead of leaving it in the middle.
    const last = doc.rows[doc.rows.length - 1]
    if (last && !last.text.trim()) doc.rows.splice(doc.rows.length - 1, 0, row)
    else doc.rows.push(row)
    renderRows()
    update()
    return row
  }

  function hitPoint(sx: number, sy: number): RowResult | null {
    const tr = transform(doc)
    let best: RowResult | null = null
    let bestD = 12
    for (const r of computed.results) {
      if (r.row.hidden || r.value?.t !== 'point') continue
      const d = Math.hypot(tr.px(r.value.x) - sx, tr.py(r.value.y) - sy)
      if (d < bestD || (d === bestD && r.free)) {
        best = r
        bestD = d
      }
    }
    return best
  }

  function hitObject(sx: number, sy: number, kinds: string[]): RowResult | null {
    const tr = transform(doc)
    const w = { x: tr.wx(sx), y: tr.wy(sy) }
    const pxPerUnit = Math.abs(tr.px(1) - tr.px(0))
    let best: RowResult | null = null
    let bestD = 9
    for (const r of computed.results) {
      const v = r.value
      if (r.row.hidden || !v || !kinds.includes(v.t)) continue
      let d = Infinity
      if (v.t === 'segment' || v.t === 'line' || v.t === 'ray') {
        const dx = v.b.x - v.a.x
        const dy = v.b.y - v.a.y
        let s = ((w.x - v.a.x) * dx + (w.y - v.a.y) * dy) / (dx * dx + dy * dy || 1)
        if (v.t === 'segment') s = Math.max(0, Math.min(1, s))
        if (v.t === 'ray') s = Math.max(0, s)
        d = Math.hypot(w.x - (v.a.x + s * dx), w.y - (v.a.y + s * dy)) * pxPerUnit
      } else if (v.t === 'circle') d = Math.abs(Math.hypot(w.x - v.c.x, w.y - v.c.y) - v.r) * pxPerUnit
      if (d < bestD) {
        best = r
        bestD = d
      }
    }
    return best
  }

  // A point for a tool: an existing one under the pointer, or a new free point.
  function pickPoint(sx: number, sy: number): string {
    const hit = hitPoint(sx, sy)
    if (hit) return hit.name
    const tr = transform(doc)
    let x = tr.wx(sx)
    let y = tr.wy(sy)
    if (doc.options.snap) {
      const step = snapStep()
      x = Math.round(x / step) * step
      y = Math.round(y / step) * step
    }
    const name = nextName('point')
    addConstruction(`${name} = (${num(x)}, ${num(y)})`)
    return name
  }

  function toolClick(sx: number, sy: number) {
    if (readOnly) return
    const kindOf = (name: string) => computed.byName.get(name)?.value?.t
    switch (tool) {
      case 'point': {
        const name = pickPoint(sx, sy)
        announce(t('Point {name} created', { name }))
        return
      }
      case 'segment':
      case 'line':
      case 'ray':
      case 'circle':
      case 'midpoint': {
        picks.push(pickPoint(sx, sy))
        if (picks.length < 2) break
        const [a, b] = picks
        picks = []
        if (a === b) break
        const cmd = { segment: 'Segment', line: 'Line', ray: 'Ray', circle: 'Circle', midpoint: 'Midpoint' }[tool]
        const name = nextName(tool === 'midpoint' ? 'point' : tool)
        addConstruction(`${name} = ${cmd}(${a}, ${b})`)
        announce(describeName(name))
        break
      }
      case 'angle': {
        picks.push(pickPoint(sx, sy))
        if (picks.length < 3) break
        const [a, v, c] = picks
        picks = []
        const name = nextName('angle')
        addConstruction(`${name} = Angle(${a}, ${v}, ${c})`)
        announce(describeName(name))
        break
      }
      case 'polygon': {
        const name = hitPoint(sx, sy)?.name
        if (name && picks.length >= 3 && name === picks[0]) {
          finishPolygon()
          break
        }
        picks.push(pickPoint(sx, sy))
        break
      }
      case 'perpendicular':
      case 'parallel': {
        const line = hitObject(sx, sy, ['segment', 'line', 'ray'])
        const hasLine = picks.some((p) => ['segment', 'line', 'ray'].includes(kindOf(p) ?? ''))
        if (line && !hasLine) picks.push(line.name)
        else if (!picks.some((p) => kindOf(p) === 'point')) picks.push(pickPoint(sx, sy))
        if (picks.length < 2) break
        const l = picks.find((p) => kindOf(p) !== 'point')!
        const p = picks.find((q) => kindOf(q) === 'point')!
        picks = []
        const name = nextName('line')
        addConstruction(`${name} = ${tool === 'perpendicular' ? 'Perpendicular' : 'Parallel'}(${l}, ${p})`)
        announce(describeName(name))
        break
      }
      case 'intersect': {
        const obj = hitObject(sx, sy, ['segment', 'line', 'ray', 'circle'])
        if (!obj || picks.includes(obj.name)) break
        picks.push(obj.name)
        if (picks.length < 2) break
        const [a, b] = picks
        picks = []
        const twoPoints = kindOf(a) === 'circle' || kindOf(b) === 'circle'
        const first = nextName('point')
        addConstruction(twoPoints ? `${first} = Intersect(${a}, ${b}, 1)` : `${first} = Intersect(${a}, ${b})`)
        if (twoPoints) addConstruction(`${nextName('point')} = Intersect(${a}, ${b}, 2)`)
        announce(describeName(first))
        break
      }
    }
    draw()
  }

  function finishPolygon() {
    if (picks.length >= 3) {
      const name = nextName('polygon')
      addConstruction(`${name} = Polygon(${picks.join(', ')})`)
      announce(describeName(name))
    }
    picks = []
    draw()
  }

  function describeName(name: string): string {
    const r = computed.byName.get(name)
    return r ? describeRow(r, computed, specials) : name
  }

  // ---------- Drawing ----------

  let readoutTimer = 0
  function update(full = true) {
    computed = compute(doc)
    specials = doc.options.special ? functionSpecials(doc, computed) : []
    draw()
    refreshRowInfo()
    viewFields.forEach((f) => f.refresh())
    clearTimeout(readoutTimer)
    readoutTimer = window.setTimeout(() => {
      renderReadouts()
      if (!panelOf.table.hidden) renderTable()
      if (!panelOf.geometry.hidden && !dragging) renderPointList()
    }, full ? 150 : 400)
  }

  function selectedResult(): RowResult | undefined {
    return computed.results.find((r) => r.row.id === selected)
  }

  function draw() {
    const sel = selectedResult()
    const highlight = new Set<string>(picks)
    if (sel?.name) highlight.add(sel.name)
    let traceMark
    if (trace && sel?.value?.t === 'function') {
      const y = sel.value.f(trace.x)
      if (Number.isFinite(y)) traceMark = { x: trace.x, y, color: sel.row.color, label: `${sel.name}(${fmt(trace.x, 2)}) = ${fmt(y)}` }
    }
    const picked = picks.map((p) => computed.byName.get(p)?.value).filter((v): v is Pt & { t: 'point' } => v?.t === 'point')
    canvas.innerHTML = renderSvg(doc, computed, { specials, highlight, trace: traceMark, picks: picked, numberFormat: (v) => fmt(v) })
    const svg = canvas.firstElementChild as SVGSVGElement | null
    svg?.setAttribute('aria-hidden', 'true')
    svg?.setAttribute('focusable', 'false')
  }

  function renderReadouts() {
    // Roots and extrema are always described, even when they are not drawn.
    const all = doc.options.special ? specials : functionSpecials(doc, computed)
    readout.replaceChildren(...describeGraph(doc, computed, all).map((line) => h('li', { textContent: line })))
    if (!readout.children.length) readout.append(h('li', { class: 'hint', textContent: t('Nothing drawn yet.') }))
  }

  function renderTableIfVisible() {
    if (!panelOf.table.hidden) renderTable()
  }

  function renderTable() {
    const fns = computed.results.filter((r) => r.value?.t === 'function' && !r.row.hidden)
    if (!fns.length) {
      tableBox.replaceChildren(h('p', { class: 'hint', textContent: t('Add a function to see its table of values.') }))
      return
    }
    const start = parseFloat(tableStart.value) || 0
    const step = Math.abs(parseFloat(tableStep.value)) || 1
    const table = h('table', { class: 'mg-table' }, h('caption', { class: 'sr-only', textContent: t('Table of values') }))
    const head = h('tr', {}, h('th', { scope: 'col', textContent: 'x' }), ...fns.map((r) => h('th', { scope: 'col', textContent: `${r.name}(x)` })))
    const tbody = h('tbody')
    for (let i = 0; i <= 10; i++) {
      const x = start + i * step
      tbody.append(h('tr', {}, h('th', { scope: 'row', textContent: fmt(x) }), ...fns.map((r) => h('td', { textContent: fmt((r.value as { f: (x: number) => number }).f(x)) }))))
    }
    table.append(h('thead', {}, head), tbody)
    tableBox.replaceChildren(table)
  }

  let announceTimer = 0
  function announce(text: string) {
    clearTimeout(announceTimer)
    announceTimer = window.setTimeout(() => (live.textContent = text), 100)
  }

  // ---------- View ----------

  function zoom(factor: number, cx?: number, cy?: number) {
    const v = doc.view
    const x = cx ?? (v.xmin + v.xmax) / 2
    const y = cy ?? (v.ymin + v.ymax) / 2
    doc.view = { xmin: x - (x - v.xmin) * factor, xmax: x + (v.xmax - x) * factor, ymin: y - (y - v.ymin) * factor, ymax: y + (v.ymax - y) * factor }
    update(false)
  }
  function pan(dx: number, dy: number) {
    const v = doc.view
    doc.view = { xmin: v.xmin + dx, xmax: v.xmax + dx, ymin: v.ymin + dy, ymax: v.ymax + dy }
    update(false)
  }
  function resetView() {
    doc.view = { ...initialView }
    if (isNew) equalScale()
    else update()
  }
  function equalScale() {
    const v = doc.view
    const cy = (v.ymin + v.ymax) / 2
    const half = ((v.xmax - v.xmin) * doc.height) / doc.width / 2
    doc.view = { ...v, ymin: cy - half, ymax: cy + half }
    update()
  }

  // ---------- Pointer and keys ----------

  const toSvg = (e: PointerEvent | WheelEvent | MouseEvent) => {
    const rect = canvas.getBoundingClientRect()
    return { sx: ((e.clientX - rect.left) / rect.width) * doc.width, sy: ((e.clientY - rect.top) / rect.height) * doc.height }
  }
  let dragging: { kind: 'point'; name: string } | { kind: 'pan'; sx: number; sy: number; view: GraphDoc['view'] } | null = null
  let downAt: { sx: number; sy: number } | null = null

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    const p = toSvg(e)
    downAt = p
    canvas.setPointerCapture(e.pointerId)
    if (tool === 'move' || readOnly) {
      const hit = !readOnly ? hitPoint(p.sx, p.sy) : null
      if (hit?.free) {
        dragging = { kind: 'point', name: hit.name }
        selected = hit.row.id
      } else dragging = { kind: 'pan', sx: p.sx, sy: p.sy, view: { ...doc.view } }
    }
  })
  canvas.addEventListener('pointermove', (e) => {
    const p = toSvg(e)
    const tr = transform(doc)
    if (dragging?.kind === 'point') {
      movePoint(dragging.name, tr.wx(p.sx), tr.wy(p.sy))
      return
    }
    if (dragging?.kind === 'pan') {
      const d = dragging
      const unitX = (d.view.xmax - d.view.xmin) / doc.width
      const unitY = (d.view.ymax - d.view.ymin) / doc.height
      doc.view = { xmin: d.view.xmin - (p.sx - d.sx) * unitX, xmax: d.view.xmax - (p.sx - d.sx) * unitX, ymin: d.view.ymin + (p.sy - d.sy) * unitY, ymax: d.view.ymax + (p.sy - d.sy) * unitY }
      update(false)
      return
    }
    // Trace the selected function under the pointer.
    if (selectedResult()?.value?.t === 'function') {
      trace = { x: tr.wx(p.sx) }
      draw()
    }
    canvas.style.cursor = tool === 'move' && hitPoint(p.sx, p.sy)?.free ? 'grab' : ''
  })
  const endDrag = (e: PointerEvent) => {
    const p = toSvg(e)
    const moved = downAt ? Math.hypot(p.sx - downAt.sx, p.sy - downAt.sy) : 99
    const was = dragging
    dragging = null
    downAt = null
    if (was?.kind === 'point') {
      renderRows()
      renderPointList()
    }
    if (tool !== 'move' && moved < 6 && e.type === 'pointerup') toolClick(p.sx, p.sy)
  }
  canvas.addEventListener('pointerup', endDrag)
  canvas.addEventListener('pointercancel', endDrag)
  canvas.addEventListener('pointerleave', () => {
    if (!dragging && trace) {
      trace = null
      draw()
    }
  })
  canvas.addEventListener('dblclick', () => tool === 'polygon' && finishPolygon())
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      const p = toSvg(e)
      const tr = transform(doc)
      zoom(e.deltaY > 0 ? 1.1 : 1 / 1.1, tr.wx(p.sx), tr.wy(p.sy))
    },
    { passive: false },
  )
  canvas.addEventListener('keydown', (e) => {
    const sel = selectedResult()
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }
    const dir = arrows[e.key]
    if (dir) {
      e.preventDefault()
      const v = doc.view
      if (sel?.free && sel.value?.t === 'point' && !readOnly && !e.shiftKey) {
        const step = doc.options.snap ? snapStep() : (v.xmax - v.xmin) / 100
        movePoint(sel.name, sel.value.x + dir[0] * step, sel.value.y + dir[1] * step, false)
        renderRows()
        canvas.focus()
      } else if (sel?.value?.t === 'function' && dir[1] === 0 && !e.shiftKey) {
        const step = (v.xmax - v.xmin) / 100
        trace = { x: Math.round(((trace?.x ?? (v.xmin + v.xmax) / 2) + dir[0] * step) / step) * step }
        draw()
        const y = sel.value.f(trace.x)
        announce(`${sel.name}(${fmt(trace.x, 2)}) = ${fmt(y)}`)
      } else {
        pan((dir[0] * (v.xmax - v.xmin)) / 10, (dir[1] * (v.ymax - v.ymin)) / 10)
      }
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault()
      zoom(1 / 1.25)
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault()
      zoom(1.25)
    } else if (e.key === '0') {
      e.preventDefault()
      resetView()
    } else if (e.key === 'Enter' && tool === 'polygon') {
      e.preventDefault()
      finishPolygon()
    } else if (e.key === 'Escape' && picks.length) {
      e.preventDefault()
      e.stopPropagation()
      picks = []
      draw()
    }
  })
  canvas.addEventListener('focus', () => announce(describeGraph(doc, computed, specials).slice(0, 3).join('. ')))

  // ---------- Downloads and closing ----------

  const download = (url: string, name: string) => {
    const a = h('a', { href: url, download: name })
    document.body.append(a)
    a.click()
    a.remove()
  }
  downloadSvg.addEventListener('click', () => {
    const svg = renderSvg(doc, computed, { specials, numberFormat: (v) => fmt(v) })
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    download(url, `${t('graph')}.svg`)
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  })
  downloadPng.addEventListener('click', async () => {
    const image = await renderGraphImage(doc)
    download(image.png, `${t('graph')}.png`)
  })

  return new Promise((resolve) => {
    let result: GraphImage | null = null
    const close = () => {
      playing = null
      cancelAnimationFrame(frame)
      dialog.close()
    }
    cancel.addEventListener('click', close)
    ok.addEventListener('click', async () => {
      // Drop empty rows.
      doc.rows = doc.rows.filter((r) => r.text.trim())
      if (!doc.rows.length && !doc.sliders.length) return close()
      ok.disabled = true
      result = await renderGraphImage(cloneGraph(doc))
      close()
    })
    dialog.addEventListener('close', () => {
      cancelAnimationFrame(frame)
      dialog.remove()
      resolve(result)
    })
    document.body.append(dialog)
    renderRows()
    renderSliders()
    showTab(options.geometry ? 'geometry' : 'algebra')
    setTool(tool)
    update()
    dialog.showModal()
    const first = doc.rows[0]
    if (first && !readOnly) rowInput(first.id)?.focus()
    else canvas.focus()
  })
}

// Messages from the parser and the evaluator, translated.
function translateError(message: string): string {
  const m = /^Unexpected "(.*)"$/.exec(message)
  if (m) return t('Unexpected “{token}”', { token: m[1] })
  const exp = /^Expected "(.*?)"/.exec(message)
  if (exp) return t('Missing “{token}”', { token: exp[1] })
  const miss = /^Missing "(.*)"$/.exec(message)
  if (miss) return t('Missing “{token}”', { token: miss[1] })
  const ch = /^Unexpected character "(.*)"$/.exec(message)
  if (ch) return t('Unexpected “{token}”', { token: ch[1] })
  const needs = /^(\w+) needs (\d) points$/.exec(message)
  if (needs) return t('{command} needs {n} points', { command: needs[1], n: needs[2] })
  const undef = /^(.+) is not defined$/.exec(message)
  if (undef) return t('{name} is not defined', { name: undef[1] })
  const one = /^(\w+) takes (one|two) values?$/.exec(message)
  if (one) return one[2] === 'one' ? t('{name} takes one value', { name: one[1] }) : t('{name} takes two values', { name: one[1] })
  const known: Record<string, string> = {
    'Incomplete expression': t('Incomplete expression'),
    'Add "=" or an inequality': t('Add “=” or an inequality'),
    'A point has two coordinates': t('A point has two coordinates'),
    'A point is not a number here': t('A point is not a number here'),
    'Circular definition': t('Circular definition'),
    'Circle needs a center and a point or a radius': t('Circle needs a center and a point or a radius'),
    'Polygon needs at least 3 points': t('Polygon needs at least 3 points'),
    'Intersect needs two lines or circles': t('Intersect needs two lines or circles'),
    'Intersect works with lines, segments and circles': t('Intersect works with lines, segments and circles'),
    'Distance needs two objects': t('Distance needs two objects'),
    'Distance needs two points, or a point and a line': t('Distance needs two points, or a point and a line'),
    'Area needs a polygon or a circle': t('Area needs a polygon or a circle'),
    'Slope needs a line': t('Slope needs a line'),
    'Invalid expression': t('Invalid expression'),
  }
  if (known[message]) return known[message]
  const lineAndPoint = /^(Perpendicular|Parallel) needs a line and a point$/.exec(message)
  if (lineAndPoint) return t('{command} needs a line and a point', { command: lineAndPoint[1] })
  const oneObj = /^(Length|Perimeter) needs one object$/.exec(message)
  if (oneObj) return t('{command} needs one object', { command: oneObj[1] })
  const works = /^(Length|Perimeter) works with segments, circles and polygons$/.exec(message)
  if (works) return t('{command} works with segments, circles and polygons', { command: works[1] })
  return message
}

