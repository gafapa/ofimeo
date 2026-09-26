// Right panel: style, text and arrangement of the selected cells, or the
// diagram options when nothing is selected.

import type { Cell } from '@maxgraph/core'
import { AlignCenter, AlignLeft, AlignRight, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, Bold, Italic, Strikethrough, Underline, type IconNode } from 'lucide'
import { colorPalette, el, icon, openPopover } from '../../ui/widgets'
import { setStyleKey, type EditorGraph } from './graph'
import { SKETCH_DEFAULTS, SKETCH_FILL_STYLES, SKETCH_FONT_FAMILY, SKETCH_FONT_SOURCE } from './shapes/sketch'
import { t } from '../../core/i18n'

export interface FormatActions {
  toFront(): void
  toBack(): void
  group(): void
  ungroup(): void
  align(where: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): void
  distribute(horizontal: boolean): void
  editStyle(): void
  isGridVisible(): boolean
  setGridVisible(on: boolean): void
  pageName(): string
  renamePage(name: string): void
  // Replaces the diagram options shown when nothing is selected (e.g. slide options).
  emptySection?: () => HTMLElement
  // More rows for the diagram options (page background, page view…).
  diagramOptions?: () => HTMLElement[]
}

const FONTS = ['Helvetica', 'Arial', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Georgia', 'Times New Roman', 'Garamond', 'Courier New', 'Comic Sans MS', 'Lucida Console']

const EDGE_STYLES: [string, string, Record<string, string | null>][] = [
  ['straight', t('Straight'), { edgeStyle: 'none', curved: null, elbow: null }],
  ['orthogonal', t('Orthogonal'), { edgeStyle: 'orthogonalEdgeStyle', curved: null, elbow: null }],
  ['curved', t('Curved'), { edgeStyle: 'orthogonalEdgeStyle', curved: '1', elbow: null }],
  ['elbowH', t('Elbow (horizontal)'), { edgeStyle: 'elbowEdgeStyle', elbow: 'horizontal', curved: null }],
  ['elbowV', t('Elbow (vertical)'), { edgeStyle: 'elbowEdgeStyle', elbow: 'vertical', curved: null }],
  ['er', t('Entity relation'), { edgeStyle: 'entityRelationEdgeStyle', curved: null, elbow: null }],
]

// value = "marker|fill"
const MARKERS: [string, string][] = [
  ['none|1', t('None')],
  ['classic|1', t('Classic')],
  ['classicThin|1', t('Classic thin')],
  ['block|1', t('Block')],
  ['block|0', t('Block (open)')],
  ['open|1', t('Open arrow')],
  ['oval|1', t('Oval')],
  ['oval|0', t('Oval (open)')],
  ['diamond|1', t('Diamond')],
  ['diamond|0', t('Diamond (open)')],
  ['diamondThin|1', t('Diamond thin')],
  ['diamondThin|0', t('Diamond thin (open)')],
  ['dash|1', t('Dash')],
  ['cross|1', t('Cross')],
  ['ERone|1', t('ER one')],
  ['ERmandOne|1', t('ER mandatory one')],
  ['ERmany|1', t('ER many')],
  ['ERoneToMany|1', t('ER one to many')],
  ['ERzeroToOne|1', t('ER zero to one')],
  ['ERzeroToMany|1', t('ER zero to many')],
]

const PATTERNS: [string, string][] = [
  ['solid', t('Solid')],
  ['dashed', t('Dashed')],
  ['dotted', t('Dotted')],
]

type Style = Record<string, unknown>

export class FormatPanel {
  readonly element = el('aside', { class: 'diagram-format', ariaLabel: t('Format') })
  private frame = 0

  constructor(
    private readonly graph: EditorGraph,
    private readonly actions: FormatActions,
  ) {
    graph.getSelectionModel().addListener('change', () => this.schedule())
    graph.getDataModel().addListener('change', () => this.schedule())
    this.render()
  }

  schedule(): void {
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => {
      // Do not rebuild the field being typed in (checkboxes rebuild, e.g. Sketch adds Fill style).
      const active = document.activeElement
      const typing = active instanceof HTMLTextAreaElement || (active instanceof HTMLInputElement && active.type !== 'checkbox')
      if (typing && this.element.contains(active)) return
      this.render()
    })
  }

  private cells(): Cell[] {
    return this.graph.getSelectionCells()
  }

  private style(): Style {
    const cell = this.cells()[0]
    return cell ? (this.graph.getCellStyle(cell) as Style) : {}
  }

  private set(key: string, value: string | number | null, cells = this.cells()): void {
    if (cells.length) setStyleKey(this.graph, cells, key, value)
  }

  private setMany(values: Record<string, string | number | null>, cells = this.cells()): void {
    const model = this.graph.getDataModel()
    model.beginUpdate()
    try {
      for (const [k, v] of Object.entries(values)) this.set(k, v, cells)
    } finally {
      model.endUpdate()
    }
  }

  render(): void {
    const cells = this.cells()
    const root = this.element
    root.replaceChildren()
    if (!cells.length) {
      root.append(this.actions.emptySection?.() ?? this.diagramSection())
      return
    }
    const vertices = cells.filter((c) => c.isVertex())
    const edges = cells.filter((c) => c.isEdge())
    root.append(this.styleSection(vertices, edges))
    if (edges.length) root.append(this.edgeSection(edges))
    root.append(this.textSection())
    root.append(this.arrangeSection(vertices))
  }

  // ---------- Sections ----------

  private diagramSection(): HTMLElement {
    const name = el('input', { class: 'fmt-input', value: this.actions.pageName() })
    name.addEventListener('change', () => this.actions.renamePage(name.value.trim() || this.actions.pageName()))
    return section(t('Diagram'),
      row(t('Page name'), name),
      checkbox(t('Grid'), this.actions.isGridVisible(), (on) => this.actions.setGridVisible(on)),
      ...(this.actions.diagramOptions?.() ?? []),
      el('p', { class: 'fmt-hint', textContent: t('Drag shapes from the left panel, or click one to insert it. Hover a shape and drag from its blue points to connect it.') }),
    )
  }

  private styleSection(vertices: Cell[], edges: Cell[]): HTMLElement {
    const s = this.style()
    const items: HTMLElement[] = []
    if (vertices.length) {
      items.push(
        row(t('Fill'), this.colorButton(str(s.fillColor), (c) => this.set('fillColor', c ?? 'none', vertices), t('No fill'))),
        row(t('Gradient'), this.colorButton(str(s.gradientColor), (c) => this.set('gradientColor', c ?? 'none', vertices), t('No gradient'))),
      )
    }
    items.push(
      row(t('Line'), this.colorButton(str(s.strokeColor), (c) => this.set('strokeColor', c ?? 'none'), t('No line'))),
      row(t('Line width'), this.number(Number(s.strokeWidth ?? 1), 0, 50, 1, (v) => this.set('strokeWidth', v))),
      row(t('Pattern'),
        this.select(PATTERNS, patternOf(s), (v) =>
          this.setMany(v === 'solid' ? { dashed: null, dashPattern: null } : v === 'dashed' ? { dashed: 1, dashPattern: null } : { dashed: 1, dashPattern: '1 4' }),
        ),
      ),
      row(t('Opacity'), this.number(Number(s.opacity ?? 100), 0, 100, 5, (v) => this.set('opacity', v >= 100 ? null : v))),
      checkbox(t('Rounded'), flag(s.rounded), (on) => this.set('rounded', on ? 1 : 0)),
      checkbox(t('Shadow'), flag(s.shadow), (on) => this.set('shadow', on ? 1 : null)),
      // draw.io's per-cell hand-drawn style.
      checkbox(t('Sketch'), flag(s.sketch), (on) =>
        this.setMany(Object.fromEntries(Object.entries(SKETCH_DEFAULTS).map(([k, v]) => [k, on ? v : null]))),
      ),
    )
    const fill = str(s.fillColor)
    if (flag(s.sketch) && vertices.length && fill && fill !== 'none') {
      const fillStyle = str(s.fillStyle) || 'auto'
      const options = SKETCH_FILL_STYLES.some(([v]) => v === fillStyle) ? SKETCH_FILL_STYLES : [...SKETCH_FILL_STYLES, [fillStyle, fillStyle] as [string, string]]
      items.push(row(t('Fill style'), this.select(options, fillStyle, (v) => this.set('fillStyle', v === 'auto' ? null : v, vertices))))
    }
    if (vertices.length) {
      items.push(
        checkbox(t('Glass'), flag(s.glass), (on) => this.set('glass', on ? 1 : null, vertices)),
        checkbox(t('Container'), str(s.container) === '1', (on) => this.set('container', on ? 1 : null, vertices)),
      )
    }
    const edit = el('button', { type: 'button', class: 'fmt-btn', textContent: t('Edit style…') })
    edit.addEventListener('click', () => this.actions.editStyle())
    items.push(el('div', { class: 'fmt-row' }, edit))
    return section(t('Style'), ...items)
  }

  private edgeSection(edges: Cell[]): HTMLElement {
    const s = this.style()
    const current = EDGE_STYLES.find(([, , v]) => {
      const edgeStyle = str(s.edgeStyle) || 'none'
      if (v.edgeStyle !== edgeStyle) return false
      if (v.curved === '1') return str(s.curved) === '1'
      if (edgeStyle === 'elbowEdgeStyle') return (str(s.elbow) || 'horizontal') === v.elbow
      return str(s.curved) !== '1'
    })?.[0] ?? 'straight'
    const markerValue = (end: 'start' | 'end') => {
      const marker = str(s[`${end}Arrow`]) || (end === 'end' ? 'classic' : 'none')
      const fill = str(s[`${end}Fill`]) === '0' ? '0' : '1'
      const value = `${marker}|${fill}`
      return MARKERS.some(([v]) => v === value) ? value : `${marker}|1`
    }
    const setMarker = (end: 'start' | 'end', value: string) => {
      const [marker, fill] = value.split('|')
      this.setMany({ [`${end}Arrow`]: marker, [`${end}Fill`]: fill === '0' ? 0 : null }, edges)
    }
    return section(t('Connector'),
      row(t('Waypoints'), this.select(EDGE_STYLES.map(([v, label]) => [v, label]), current, (v) => {
        const values = EDGE_STYLES.find(([id]) => id === v)![2]
        this.setMany(values, edges)
      })),
      row(t('Line start'), this.select(MARKERS, markerValue('start'), (v) => setMarker('start', v))),
      row(t('Line end'), this.select(MARKERS, markerValue('end'), (v) => setMarker('end', v))),
    )
  }

  private textSection(): HTMLElement {
    const s = this.style()
    const fontStyle = Number(s.fontStyle ?? 0)
    const family = str(s.fontFamily) || 'Helvetica'
    const fonts = FONTS.includes(family) ? FONTS : [family, ...FONTS]
    const toggleBit = (bit: number) => this.set('fontStyle', (fontStyle ^ bit) || null)
    const styleButtons = el(
      'div',
      { class: 'fmt-toggles' },
      toggle(Bold, t('Bold'), (fontStyle & 1) !== 0, () => toggleBit(1)),
      toggle(Italic, t('Italic'), (fontStyle & 2) !== 0, () => toggleBit(2)),
      toggle(Underline, t('Underline'), (fontStyle & 4) !== 0, () => toggleBit(4)),
      toggle(Strikethrough, t('Strikethrough'), (fontStyle & 8) !== 0, () => toggleBit(8)),
    )
    const align = str(s.align) || 'center'
    const valign = str(s.verticalAlign) || 'middle'
    const alignButtons = el(
      'div',
      { class: 'fmt-toggles' },
      toggle(AlignLeft, t('Align left'), align === 'left', () => this.set('align', 'left')),
      toggle(AlignCenter, t('Center'), align === 'center', () => this.set('align', 'center')),
      toggle(AlignRight, t('Align right'), align === 'right', () => this.set('align', 'right')),
      toggle(AlignVerticalJustifyStart, t('Top'), valign === 'top', () => this.set('verticalAlign', 'top')),
      toggle(AlignVerticalJustifyCenter, t('Middle'), valign === 'middle', () => this.set('verticalAlign', 'middle')),
      toggle(AlignVerticalJustifyEnd, t('Bottom'), valign === 'bottom', () => this.set('verticalAlign', 'bottom')),
    )
    return section(t('Text'),
      // A font change drops draw.io's web font URL, which belongs to the previous family.
      row(t('Font'), this.select(fonts.map((f) => [f, f]), family, (v) => this.setMany({ fontFamily: v, fontSource: null }))),
      checkbox(t('Hand-drawn font'), family === SKETCH_FONT_FAMILY, (on) =>
        this.setMany({ fontFamily: on ? SKETCH_FONT_FAMILY : null, fontSource: on ? SKETCH_FONT_SOURCE : null }),
      ),
      row(t('Size'), this.number(Number(s.fontSize ?? 12), 1, 400, 1, (v) => this.set('fontSize', v))),
      el('div', { class: 'fmt-row' }, styleButtons),
      el('div', { class: 'fmt-row' }, alignButtons),
      row(t('Color'), this.colorButton(str(s.fontColor), (c) => this.set('fontColor', c ?? '#000000'), t('Default'))),
      row(t('Background'), this.colorButton(str(s.labelBackgroundColor), (c) => this.set('labelBackgroundColor', c ?? 'none'), t('None'))),
      checkbox(t('Word wrap'), str(s.whiteSpace) === 'wrap', (on) => this.setMany({ whiteSpace: on ? 'wrap' : null, html: 1 })),
    )
  }

  private arrangeSection(vertices: Cell[]): HTMLElement {
    const items: HTMLElement[] = []
    const model = this.graph.getDataModel()
    if (vertices.length === 1) {
      const geo = vertices[0].getGeometry()
      if (geo) {
        const setGeo = (key: 'x' | 'y' | 'width' | 'height', v: number) => {
          const g = vertices[0].getGeometry()!.clone()
          g[key] = key === 'width' || key === 'height' ? Math.max(1, v) : v
          model.setGeometry(vertices[0], g)
        }
        items.push(
          el(
            'div',
            { class: 'fmt-grid' },
            labeled('X', this.number(geo.x, -1e6, 1e6, 1, (v) => setGeo('x', v))),
            labeled('Y', this.number(geo.y, -1e6, 1e6, 1, (v) => setGeo('y', v))),
            labeled(t('Width'), this.number(geo.width, 1, 1e6, 1, (v) => setGeo('width', v))),
            labeled(t('Height'), this.number(geo.height, 1, 1e6, 1, (v) => setGeo('height', v))),
          ),
        )
      }
      const s = this.style()
      items.push(row(t('Rotation'), this.number(Number(s.rotation ?? 0), -360, 360, 15, (v) => this.set('rotation', v % 360 || null, vertices))))
      items.push(
        el(
          'div',
          { class: 'fmt-buttons' },
          button(t('Flip H'), () => this.set('flipH', flag(s.flipH) ? null : 1, vertices)),
          button(t('Flip V'), () => this.set('flipV', flag(s.flipV) ? null : 1, vertices)),
        ),
      )
    }
    items.push(
      el('div', { class: 'fmt-buttons' }, button(t('To front'), this.actions.toFront), button(t('To back'), this.actions.toBack)),
      el('div', { class: 'fmt-buttons' }, button(t('Group'), this.actions.group), button(t('Ungroup'), this.actions.ungroup)),
    )
    if (vertices.length > 1) {
      const a = this.actions
      items.push(
        el('div', { class: 'fmt-subtitle', textContent: t('Align') }),
        el('div', { class: 'fmt-buttons' }, button(t('Left'), () => a.align('left')), button(t('Center'), () => a.align('center')), button(t('Right'), () => a.align('right'))),
        el('div', { class: 'fmt-buttons' }, button(t('Top'), () => a.align('top')), button(t('Middle'), () => a.align('middle')), button(t('Bottom'), () => a.align('bottom'))),
      )
      if (vertices.length > 2) {
        items.push(el('div', { class: 'fmt-buttons' }, button(t('Distribute H'), () => a.distribute(true)), button(t('Distribute V'), () => a.distribute(false))))
      }
    }
    return section(t('Arrange'), ...items)
  }

  // ---------- Controls ----------

  private colorButton(current: string, apply: (color: string | null) => void, resetLabel: string): HTMLElement {
    const swatch = el('span', { class: 'fmt-swatch' })
    const none = !current || current === 'none'
    swatch.style.background = none ? 'transparent' : current
    swatch.classList.toggle('none', none)
    const b = el('button', { type: 'button', class: 'fmt-color' }, swatch, el('span', { textContent: none ? t('None') : current }))
    b.addEventListener('click', () => openPopover(b, colorPalette(apply, resetLabel)))
    return b
  }

  private number(value: number, min: number, max: number, step: number, apply: (v: number) => void): HTMLInputElement {
    const input = el('input', { type: 'number', class: 'fmt-number', value: String(Math.round(value * 100) / 100), min: String(min), max: String(max), step: String(step) })
    input.addEventListener('change', () => {
      const v = Number(input.value)
      if (Number.isFinite(v)) apply(Math.min(max, Math.max(min, v)))
    })
    input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur())
    return input
  }

  private select(options: [string, string][], value: string, apply: (v: string) => void): HTMLSelectElement {
    const s = el('select', { class: 'fmt-select' })
    for (const [v, label] of options) s.append(el('option', { value: v, textContent: label }))
    s.value = value
    s.addEventListener('change', () => {
      apply(s.value)
      s.blur()
    })
    return s
  }
}

// ---------- Helpers ----------

function str(v: unknown): string {
  return v === undefined || v === null ? '' : String(v)
}

function flag(v: unknown): boolean {
  return v === true || v === 1 || v === '1'
}

function patternOf(s: Style): string {
  if (!flag(s.dashed)) return 'solid'
  return str(s.dashPattern).startsWith('1 ') ? 'dotted' : 'dashed'
}

function section(title: string, ...children: HTMLElement[]): HTMLElement {
  return el('section', { class: 'fmt-section' }, el('h3', { textContent: title }), ...children)
}

function row(label: string, control: HTMLElement): HTMLElement {
  return el('label', { class: 'fmt-row' }, el('span', { class: 'fmt-label', textContent: label }), control)
}

function labeled(label: string, control: HTMLElement): HTMLElement {
  return el('label', { class: 'fmt-cell' }, control, el('span', { textContent: label }))
}

function checkbox(label: string, checked: boolean, apply: (on: boolean) => void): HTMLElement {
  const input = el('input', { type: 'checkbox', checked })
  input.addEventListener('change', () => apply(input.checked))
  return el('label', { class: 'fmt-check' }, input, label)
}

function toggle(node: IconNode, title: string, active: boolean, run: () => void): HTMLButtonElement {
  const b = el('button', { type: 'button', class: 'fmt-toggle', title }, icon(node, 16))
  b.setAttribute('aria-label', title)
  b.classList.toggle('active', active)
  b.setAttribute('aria-pressed', String(active))
  b.addEventListener('click', run)
  return b
}

function button(text: string, run: () => void): HTMLButtonElement {
  const b = el('button', { type: 'button', class: 'fmt-btn', textContent: text })
  b.addEventListener('click', () => run())
  return b
}
