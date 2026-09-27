// Yellow handles that adjust shape parameters (size, dx/dy, arcSize, callout
// tail…) by dragging, like draw.io. Ported from draw.io's handle factories
// (grapheditor/Shapes.js: createHandle, createArcHandle, handleFactory),
// Copyright (c) 2006-2025 JGraph Holdings Ltd / draw.io AG, Apache-2.0.
// A handle changes the cell's style when released, so the change is one undo
// step and syncs like any other style edit. Library shape code registers its
// own handles through the same factory (see shapes/compat.ts).

import { EllipseShape, Point, Rectangle, VertexHandle, VertexHandler, type CellState, type InternalMouseEvent } from '@maxgraph/core'

type Style = Record<string, unknown>
type GetPosition = (this: StyleHandle, bounds: Rectangle) => Point | null
type SetPosition = (this: StyleHandle, bounds: Rectangle, pt: Point, me: InternalMouseEvent) => void
export type HandleFactory = (state: CellState) => VertexHandle[] | null

const FILL = '#ffcd28'
const STROKE = '#c08f00'
const SIZE = 9

// draw.io reads style values as strings or numbers with a default.
const value = (style: Style | null | undefined, key: string, def: unknown) => {
  const v = style?.[key]
  return v == null || v === '' ? def : v
}
const number = (style: Style | null | undefined, key: string, def: number) => {
  const n = parseFloat(String(value(style, key, def)))
  return Number.isFinite(n) ? n : def
}
const truthy = (style: Style | null | undefined, key: string) => {
  const v = style?.[key]
  return v === true || v === 1 || v === '1' || v === 'true'
}
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

export class StyleHandle extends VertexHandle {
  constructor(
    state: CellState,
    private readonly keys: string[],
    getPosition: GetPosition,
    setPosition: SetPosition,
    ignoreGrid = true,
    private readonly redrawEdges = false,
    private readonly executeFn?: (me: InternalMouseEvent) => void,
  ) {
    super(state, 'pointer')
    this.getPosition = getPosition as VertexHandle['getPosition']
    this.setPosition = setPosition as VertexHandle['setPosition']
    this.ignoreGrid = ignoreGrid
  }

  createShape(): EllipseShape {
    return new EllipseShape(new Rectangle(0, 0, SIZE, SIZE), FILL, STROKE)
  }

  // One undoable change with every key the handle adjusts.
  execute(me: InternalMouseEvent): void {
    const model = this.graph.getDataModel()
    model.beginUpdate()
    try {
      for (const key of this.keys) {
        const v = (this.state.style as Style)[key]
        this.graph.setCellStyles(key as never, (typeof v === 'number' ? Math.round(v * 10000) / 10000 : v) as never, [this.state.cell])
      }
      this.executeFn?.(me)
    } finally {
      model.endUpdate()
    }
  }

  positionChanged(): void {
    super.positionChanged()
    if (this.redrawEdges) {
      this.state.view.invalidate(this.state.cell)
      this.state.view.validate()
    }
  }
}

// draw.io's Graph.createHandle.
export function createHandle(
  state: CellState,
  keys: string[],
  getPosition: GetPosition,
  setPosition: SetPosition,
  ignoreGrid?: boolean,
  redrawEdges?: boolean,
  executeFn?: (me: InternalMouseEvent) => void,
): StyleHandle {
  return new StyleHandle(state, keys, getPosition, setPosition, ignoreGrid ?? true, !!redrawEdges, executeFn)
}

const st = (h: StyleHandle) => h.state.style as Style
const setSt = (h: StyleHandle, key: string, v: unknown) => ((h.state.style as Style)[key] = v)

function arcHandle(state: CellState, yOffset?: number): StyleHandle {
  return createHandle(
    state,
    ['arcSize'],
    function (bounds) {
      const tmp = yOffset ?? bounds.height / 8
      if (truthy(st(this), 'absoluteArcSize')) {
        const arc = number(st(this), 'arcSize', 20) / 2
        return new Point(bounds.x + bounds.width - Math.min(bounds.width / 2, arc), bounds.y + tmp)
      }
      const arc = Math.max(0, number(st(this), 'arcSize', 15)) / 100
      return new Point(bounds.x + bounds.width - Math.min(Math.max(bounds.width / 2, bounds.height / 2), Math.min(bounds.width, bounds.height) * arc), bounds.y + tmp)
    },
    function (bounds, pt) {
      if (truthy(st(this), 'absoluteArcSize')) setSt(this, 'arcSize', Math.round(Math.max(0, Math.min(bounds.width, (bounds.x + bounds.width - pt.x) * 2))))
      else setSt(this, 'arcSize', Math.round(Math.min(50, Math.max(0, ((bounds.width - pt.x + bounds.x) * 100) / Math.min(bounds.width, bounds.height)))))
    },
  )
}

const withArc = (state: CellState, handles: StyleHandle[], allow = true) => {
  if (allow && truthy(state.style as Style, 'rounded')) handles.push(arcHandle(state))
  return handles
}

const arcFactory: HandleFactory = (state) => withArc(state, [])

function trapezoidFactory(max: number, def: number, fixedDef: number): HandleFactory {
  return (state) =>
    withArc(state, [
      createHandle(
        state,
        ['size'],
        function (bounds) {
          const fixed = String(value(st(this), 'fixedSize', '0')) !== '0'
          const size = Math.max(0, number(st(this), 'size', fixed ? fixedDef : def))
          return new Point(bounds.x + Math.min(bounds.width * 0.75 * max, size * (fixed ? 0.75 : bounds.width * 0.75)), bounds.y + bounds.height / 4)
        },
        function (bounds, pt) {
          const fixed = String(value(st(this), 'fixedSize', '0')) !== '0'
          setSt(this, 'size', fixed ? pt.x - bounds.x : Math.max(0, Math.min(max, ((pt.x - bounds.x) / bounds.width) * 0.75)))
        },
        false,
        true,
      ),
    ])
}

function displayFactory(def: number, allowArc: boolean, max = 0.5, redrawEdges = false, fixedDef?: number): HandleFactory {
  return (state) =>
    withArc(
      state,
      [
        createHandle(
          state,
          ['size'],
          function (bounds) {
            const fixed = fixedDef != null && String(value(st(this), 'fixedSize', '0')) !== '0'
            const size = number(st(this), 'size', fixed ? fixedDef! : def)
            return new Point(bounds.x + Math.max(0, Math.min(bounds.width * 0.5, size * (fixed ? 1 : bounds.width))), bounds.getCenterY())
          },
          function (bounds, pt) {
            const fixed = fixedDef != null && String(value(st(this), 'fixedSize', '0')) !== '0'
            setSt(this, 'size', fixed ? pt.x - bounds.x : Math.max(0, Math.min(max, (pt.x - bounds.x) / bounds.width)))
          },
          false,
          redrawEdges,
        ),
      ],
      allowArc,
    )
}

function cubeFactory(factor: number, def: number, allowArc: boolean): HandleFactory {
  return (state) =>
    withArc(
      state,
      [
        createHandle(
          state,
          ['size'],
          function (bounds) {
            const size = Math.max(0, Math.min(bounds.width, Math.min(bounds.height, number(st(this), 'size', def)))) * factor
            return new Point(bounds.x + size, bounds.y + size)
          },
          function (bounds, pt) {
            setSt(this, 'size', Math.round(Math.max(0, Math.min(Math.min(bounds.width, pt.x - bounds.x), Math.min(bounds.height, pt.y - bounds.y))) / factor))
          },
          false,
        ),
      ],
      allowArc,
    )
}

function cylinderFactory(def: number): HandleFactory {
  return (state) => [
    createHandle(
      state,
      ['size'],
      function (bounds) {
        return new Point(bounds.x, bounds.y + Math.max(0, Math.min(bounds.height * 0.5, number(st(this), 'size', def))))
      },
      function (bounds, pt) {
        setSt(this, 'size', Math.max(0, pt.y - bounds.y))
      },
      true,
    ),
  ]
}

function arrowFactory(maxSize: number): HandleFactory {
  return (state) => [
    createHandle(
      state,
      ['arrowWidth', 'arrowSize'],
      function (bounds) {
        const aw = clamp(number(st(this), 'arrowWidth', 0.3), 0, 1)
        const as = clamp(number(st(this), 'arrowSize', 0.2), 0, maxSize)
        return new Point(bounds.x + (1 - as) * bounds.width, bounds.y + ((1 - aw) * bounds.height) / 2)
      },
      function (bounds, pt) {
        setSt(this, 'arrowWidth', clamp((Math.abs(bounds.y + bounds.height / 2 - pt.y) / bounds.height) * 2, 0, 1))
        setSt(this, 'arrowSize', clamp((bounds.x + bounds.width - pt.x) / bounds.width, 0, maxSize))
      },
    ),
  ]
}

// Two-parameter corner handles (dx/dy and similar).
function pairFactory(kx: string, ky: string, dx: number, dy: number, pos: (b: Rectangle, x: number, y: number) => Point, set: (b: Rectangle, p: Point) => [number, number], allowArc = false): HandleFactory {
  return (state) =>
    withArc(
      state,
      [
        createHandle(
          state,
          [kx, ky],
          function (bounds) {
            return pos(bounds, clamp(number(st(this), kx, dx), 0, bounds.width), clamp(number(st(this), ky, dy), 0, bounds.height))
          },
          function (bounds, pt) {
            const [x, y] = set(bounds, pt)
            setSt(this, kx, x)
            setSt(this, ky, y)
          },
          false,
        ),
      ],
      allowArc,
    )
}

const dxdy = (b: Rectangle, p: Point): [number, number] => [Math.round(clamp(p.x - b.x, 0, b.width)), Math.round(clamp(p.y - b.y, 0, b.height))]

// Handle factories by shape name (draw.io's Graph.handleFactory).
export const HANDLE_FACTORY: Record<string, HandleFactory> = {
  label: arcFactory,
  ext: arcFactory,
  rectangle: arcFactory,
  triangle: arcFactory,
  rhombus: arcFactory,
  swimlane: (state) => {
    const handles: StyleHandle[] = []
    const style = state.style as Style
    if (truthy(style, 'rounded')) handles.push(arcHandle(state, number(style, 'startSize', 40) / 2))
    handles.push(
      createHandle(
        state,
        ['startSize'],
        function (bounds) {
          const size = number(st(this), 'startSize', 40)
          return number(st(this), 'horizontal', 1) === 1
            ? new Point(bounds.getCenterX(), bounds.y + clamp(size, 0, bounds.height))
            : new Point(bounds.x + clamp(size, 0, bounds.width), bounds.getCenterY())
        },
        function (bounds, pt) {
          setSt(this, 'startSize', number(st(this), 'horizontal', 1) === 1 ? Math.round(clamp(pt.y - bounds.y, 0, bounds.height)) : Math.round(clamp(pt.x - bounds.x, 0, bounds.width)))
        },
        false,
      ),
    )
    return handles
  },
  umlLifeline: (state) => [
    createHandle(
      state,
      ['size'],
      function (bounds) {
        return new Point(bounds.getCenterX(), bounds.y + clamp(number(st(this), 'size', 40), 0, bounds.height))
      },
      function (bounds, pt) {
        setSt(this, 'size', Math.round(clamp(pt.y - bounds.y, 0, bounds.height)))
      },
      false,
    ),
  ],
  umlFrame: (state) => [
    createHandle(
      state,
      ['width', 'height'],
      function (bounds) {
        const w0 = Math.max(10, Math.min(bounds.width, number(st(this), 'width', 60)))
        const h0 = Math.max(15, Math.min(bounds.height, number(st(this), 'height', 30)))
        return new Point(bounds.x + w0, bounds.y + h0)
      },
      function (bounds, pt) {
        setSt(this, 'width', Math.round(Math.max(10, Math.min(bounds.width, pt.x - bounds.x))))
        setSt(this, 'height', Math.round(Math.max(15, Math.min(bounds.height, pt.y - bounds.y))))
      },
      false,
    ),
  ],
  process: (state) =>
    withArc(state, [
      createHandle(
        state,
        ['size'],
        function (bounds) {
          const fixed = String(value(st(this), 'fixedSize', '0')) !== '0'
          const size = number(st(this), 'size', 0.1)
          return fixed ? new Point(bounds.x + size, bounds.y + bounds.height / 4) : new Point(bounds.x + bounds.width * size, bounds.y + bounds.height / 4)
        },
        function (bounds, pt) {
          const fixed = String(value(st(this), 'fixedSize', '0')) !== '0'
          setSt(this, 'size', fixed ? clamp(pt.x - bounds.x, 0, bounds.width * 0.5) : clamp((pt.x - bounds.x) / bounds.width, 0, 0.5))
        },
        false,
      ),
    ]),
  cross: (state) => [
    createHandle(state, ['size'], function (bounds) {
      const m = Math.min(bounds.width, bounds.height)
      const size = (clamp(number(st(this), 'size', 0.2), 0, 1) * m) / 2
      return new Point(bounds.getCenterX() - size, bounds.getCenterY() - size)
    }, function (bounds, pt) {
      const m = Math.min(bounds.width, bounds.height)
      setSt(this, 'size', clamp(Math.min((Math.max(0, bounds.getCenterY() - pt.y) / m) * 2, (Math.max(0, bounds.getCenterX() - pt.x) / m) * 2), 0, 1))
    }),
  ],
  note: noteFactory(30),
  note2: noteFactory(15),
  manualInput: (state) =>
    withArc(state, [
      createHandle(
        state,
        ['size'],
        function (bounds) {
          const size = clamp(number(st(this), 'size', 30), 0, bounds.height)
          return new Point(bounds.x + bounds.width / 4, bounds.y + (size * 3) / 4)
        },
        function (bounds, pt) {
          setSt(this, 'size', Math.round(clamp(((pt.y - bounds.y) * 4) / 3, 0, bounds.height)))
        },
        false,
      ),
    ]),
  dataStorage: (state) => [
    createHandle(
      state,
      ['size'],
      function (bounds) {
        const fixed = String(value(st(this), 'fixedSize', '0')) !== '0'
        const size = number(st(this), 'size', fixed ? 20 : 0.1)
        return new Point(bounds.x + bounds.width - size * (fixed ? 1 : bounds.width), bounds.getCenterY())
      },
      function (bounds, pt) {
        const fixed = String(value(st(this), 'fixedSize', '0')) !== '0'
        setSt(this, 'size', fixed ? clamp(bounds.x + bounds.width - pt.x, 0, bounds.width) : clamp((bounds.x + bounds.width - pt.x) / bounds.width, 0, 1))
      },
      false,
    ),
  ],
  callout: (state) =>
    withArc(state, [
      createHandle(
        state,
        ['size', 'position'],
        function (bounds) {
          const size = clamp(number(st(this), 'size', 30), 0, bounds.height)
          const position = clamp(number(st(this), 'position', 0.5), 0, 1)
          return new Point(bounds.x + position * bounds.width, bounds.y + bounds.height - size)
        },
        function (bounds, pt) {
          setSt(this, 'size', Math.round(clamp(bounds.y + bounds.height - pt.y, 0, bounds.height)))
          setSt(this, 'position', Math.round(clamp((pt.x - bounds.x) / bounds.width, 0, 1) * 100) / 100)
        },
        false,
      ),
      createHandle(
        state,
        ['position2'],
        function (bounds) {
          return new Point(bounds.x + clamp(number(st(this), 'position2', 0.5), 0, 1) * bounds.width, bounds.y + bounds.height)
        },
        function (bounds, pt) {
          setSt(this, 'position2', Math.round(clamp((pt.x - bounds.x) / bounds.width, 0, 1) * 100) / 100)
        },
        false,
      ),
      createHandle(
        state,
        ['base'],
        function (bounds) {
          const size = clamp(number(st(this), 'size', 30), 0, bounds.height)
          const position = clamp(number(st(this), 'position', 0.5), 0, 1)
          const base = clamp(number(st(this), 'base', 20), 0, bounds.width)
          return new Point(bounds.x + Math.min(bounds.width, position * bounds.width + base), bounds.y + bounds.height - size)
        },
        function (bounds, pt) {
          const position = clamp(number(st(this), 'position', 0.5), 0, 1)
          setSt(this, 'base', Math.round(clamp(pt.x - bounds.x - position * bounds.width, 0, bounds.width)))
        },
        false,
      ),
    ]),
  wedgeCallout: (state) =>
    withArc(state, [
      createHandle(
        state,
        ['tipX', 'tipY'],
        function (bounds) {
          return new Point(bounds.getCenterX() + number(st(this), 'tipX', -0.25) * bounds.width, bounds.getCenterY() + number(st(this), 'tipY', 1) * bounds.height)
        },
        function (bounds, pt) {
          const max = 100
          setSt(this, 'tipX', Math.round(1000 * clamp((pt.x - bounds.getCenterX()) / Math.max(1, bounds.width), -max, max)) / 1000)
          setSt(this, 'tipY', Math.round(1000 * clamp((pt.y - bounds.getCenterY()) / Math.max(1, bounds.height), -max, max)) / 1000)
        },
        false,
      ),
    ]),
  internalStorage: pairFactory('dx', 'dy', 20, 20, (b, x, y) => new Point(b.x + x, b.y + y), dxdy, true),
  corner: pairFactory('dx', 'dy', 20, 20, (b, x, y) => new Point(b.x + x, b.y + y), dxdy),
  tee: pairFactory(
    'dx',
    'dy',
    20,
    20,
    (b, x, y) => new Point(b.x + (b.width + x) / 2, b.y + y),
    (b, p) => [Math.round(clamp(p.x - b.x - b.width / 2, 0, b.width / 2) * 2), Math.round(clamp(p.y - b.y, 0, b.height))],
  ),
  module: pairFactory(
    'jettyWidth',
    'jettyHeight',
    20,
    10,
    (b, x, y) => new Point(b.x + x / 2, b.y + y * 2),
    (b, p) => [Math.round(clamp(p.x - b.x, 0, b.width) * 2), Math.round(clamp(p.y - b.y, 0, b.height) / 2)],
  ),
  singleArrow: arrowFactory(1),
  doubleArrow: arrowFactory(0.5),
  folder: (state) => [
    createHandle(
      state,
      ['tabWidth', 'tabHeight'],
      function (bounds) {
        let tw = clamp(number(st(this), 'tabWidth', 60), 0, bounds.width)
        const th = clamp(number(st(this), 'tabHeight', 20), 0, bounds.height)
        if (value(st(this), 'tabPosition', 'right') === 'right') tw = bounds.width - tw
        return new Point(bounds.x + tw, bounds.y + th)
      },
      function (bounds, pt) {
        let tw = clamp(pt.x - bounds.x, 0, bounds.width)
        if (value(st(this), 'tabPosition', 'right') === 'right') tw = bounds.width - tw
        setSt(this, 'tabWidth', Math.round(tw))
        setSt(this, 'tabHeight', Math.round(clamp(pt.y - bounds.y, 0, bounds.height)))
      },
      false,
    ),
  ],
  document: (state) => [
    createHandle(
      state,
      ['size'],
      function (bounds) {
        return new Point(bounds.x + (3 * bounds.width) / 4, bounds.y + (1 - clamp(number(st(this), 'size', 0.3), 0, 1)) * bounds.height)
      },
      function (bounds, pt) {
        setSt(this, 'size', clamp((bounds.y + bounds.height - pt.y) / bounds.height, 0, 1))
      },
      false,
    ),
  ],
  tape: (state) => [
    createHandle(
      state,
      ['size'],
      function (bounds) {
        return new Point(bounds.getCenterX(), bounds.y + (clamp(number(st(this), 'size', 0.4), 0, 1) * bounds.height) / 2)
      },
      function (bounds, pt) {
        setSt(this, 'size', clamp(((pt.y - bounds.y) / bounds.height) * 2, 0, 1))
      },
      false,
    ),
  ],
  isoCube2: (state) => [
    createHandle(
      state,
      ['isoAngle'],
      function (bounds) {
        const angle = (clamp(number(st(this), 'isoAngle', 15), 0.01, 94) * Math.PI) / 200
        return new Point(bounds.x, bounds.y + Math.min(bounds.width * Math.tan(angle), bounds.height * 0.5))
      },
      function (bounds, pt) {
        setSt(this, 'isoAngle', Math.max(0, ((pt.y - bounds.y) * 50) / bounds.height))
      },
      true,
    ),
  ],
  cylinder2: cylinderFactory(15),
  cylinder3: cylinderFactory(15),
  offPageConnector: (state) => [
    createHandle(
      state,
      ['size'],
      function (bounds) {
        return new Point(bounds.getCenterX(), bounds.y + (1 - clamp(number(st(this), 'size', 3 / 8), 0, 1)) * bounds.height)
      },
      function (bounds, pt) {
        setSt(this, 'size', clamp((bounds.y + bounds.height - pt.y) / bounds.height, 0, 1))
      },
      false,
    ),
  ],
  step: displayFactory(0.2, true, 0.5, true, 20),
  hexagon: displayFactory(0.25, true, 0.5, true, 20),
  curlyBracket: displayFactory(0.5, false),
  display: displayFactory(0.25, false),
  cube: cubeFactory(1, 20, false),
  card: cubeFactory(0.5, 30, true),
  loopLimit: cubeFactory(0.5, 20, true),
  trapezoid: trapezoidFactory(0.5, 0.2, 20),
  parallelogram: trapezoidFactory(1, 0.2, 20),
}

function noteFactory(def: number): HandleFactory {
  return (state) => [
    createHandle(state, ['size'], function (bounds) {
      const size = Math.max(0, Math.min(bounds.width, Math.min(bounds.height, number(st(this), 'size', def))))
      return new Point(bounds.x + bounds.width - size, bounds.y + size)
    }, function (bounds, pt) {
      setSt(this, 'size', Math.round(Math.max(0, Math.min(Math.min(bounds.width, bounds.x + bounds.width - pt.x), Math.min(bounds.height, pt.y - bounds.y)))))
    }),
  ]
}

let installed = false

// Adds the factory's handles to the vertex handler of a single selected, editable cell.
export function installHandles(): void {
  if (installed) return
  installed = true
  const create = VertexHandler.prototype.createCustomHandles
  VertexHandler.prototype.createCustomHandles = function (this: VertexHandler) {
    const handles = create.call(this) ?? []
    const { state, graph } = this
    if (!graph.isEnabled() || !graph.isCellEditable(state.cell) || !state.shape) return handles
    const style = state.style as Style
    let name = String(style.shape ?? 'rectangle')
    if (graph.isSwimlane(state.cell)) name = 'swimlane'
    let fn = HANDLE_FACTORY[name]
    if (!fn && (state.shape as unknown as { isRoundable?: () => boolean }).isRoundable?.()) fn = HANDLE_FACTORY.rectangle
    if (!fn) return handles
    try {
      return [...handles, ...(fn(state) ?? [])]
    } catch (e) {
      console.warn(`Handles of ${name}:`, e)
      return handles
    }
  }
}
