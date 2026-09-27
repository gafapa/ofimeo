// Runs draw.io's custom shape code (shapes/**.js, generated into diagram-libs by
// scripts/build-diagram-libs.mjs) on maxGraph. The code was written for mxGraph
// (ES5 constructors, mxUtils.extend, mxCellRenderer.registerShape…); this module
// provides those names on top of maxGraph's classes and registries.
// Based on the mxGraph/draw.io APIs, Copyright (c) 2006-2025 JGraph Holdings Ltd /
// draw.io AG, Apache-2.0.

import {
  AbstractCanvas2D,
  ActorShape,
  ArrowConnectorShape,
  ArrowShape,
  CloudShape,
  ConnectionConstraint,
  ConnectorShape,
  CylinderShape,
  DoubleEllipseShape,
  EdgeMarkerRegistry,
  EdgeStyleRegistry,
  EllipseShape,
  HexagonShape,
  ImageShape,
  LabelShape,
  LineShape,
  PerimeterRegistry,
  Point,
  PolylineShape,
  Rectangle,
  RectangleShape,
  RhombusShape,
  Shape,
  SvgCanvas2D,
  ShapeRegistry,
  StencilShapeRegistry,
  SwimlaneShape,
  TextShape,
  TriangleShape,
  cloneUtils,
  mathUtils,
  styleUtils,
  type MarkerFactoryFunction,
  type PerimeterFunction,
  type ShapeConstructor,
} from '@maxgraph/core'
import { DrawioStencil } from './stencils'
import { HANDLE_FACTORY, createHandle } from '../handles'

// An mxGraph-style constructor (callable with .call(this)).
type LegacyCtor = { (this: object, ...args: unknown[]): void; prototype: object }
type ClassCtor = new (...args: never[]) => object

const legacyOf = new WeakMap<ClassCtor, LegacyCtor>()

// mxGraph-style constructor for a maxGraph class: `mxActor.call(this)` copies
// the fields a new instance gets, and the prototype inherits the class's methods.
function legacy(Base: ClassCtor): LegacyCtor {
  let F = legacyOf.get(Base)
  if (F) return F
  F = function (this: object, ...args: unknown[]) {
    Object.assign(this, new (Base as new (...a: unknown[]) => object)(...args))
  } as LegacyCtor
  F.prototype = Object.create(Base.prototype, { constructor: { value: F, writable: true, configurable: true } })
  legacyOf.set(Base, F)
  return F
}

const isClass = (fn: unknown): fn is ClassCtor => typeof fn === 'function' && /^class\b/.test(Function.prototype.toString.call(fn))
const toLegacy = (fn: unknown) => (isClass(fn) ? legacy(fn) : (fn as LegacyCtor | null))

const mxShape = legacy(Shape)
// mxGraph spells it "strokewidth".
Object.defineProperty(mxShape.prototype, 'strokewidth', {
  get(this: Shape) {
    return this.strokeWidth
  },
  set(this: Shape, v: number) {
    this.strokeWidth = v
  },
})
const mxRectangleShape = legacy(RectangleShape)
const mxEllipse = legacy(EllipseShape)

const rectPoints = [[0, 0], [0.25, 0], [0.5, 0], [0.75, 0], [1, 0], [0, 0.25], [0, 0.5], [0, 0.75], [1, 0.25], [1, 0.5], [1, 0.75], [0, 1], [0.25, 1], [0.5, 1], [0.75, 1], [1, 1]]
Object.assign(mxRectangleShape.prototype, { constraints: rectPoints.map(([x, y]) => new ConnectionConstraint(new Point(x, y), true)) })
const ellipsePoints = [[0, 0.5], [1, 0.5], [0.5, 0], [0.5, 1], [0.145, 0.145], [0.855, 0.145], [0.145, 0.855], [0.855, 0.855]]
Object.assign(mxEllipse.prototype, { constraints: ellipsePoints.map(([x, y]) => new ConnectionConstraint(new Point(x, y), true)) })

// draw.io constructors registered by name (also those whose name maxGraph or
// our own ports already provide, which keep precedence).
const legacyShapes = new Map<string, LegacyCtor>()
const failed = new Set<string>()

function registerShape(name: string, ctor: LegacyCtor) {
  legacyShapes.set(name, ctor)
  if (ShapeRegistry.get(name)) return
  // ES class for maxGraph whose instances run the draw.io constructor and inherit its prototype.
  const Wrapped = class extends Shape {
    constructor() {
      super()
      ctor.call(this)
    }
    // A failing draw.io shape leaves an empty shape instead of breaking the whole view.
    paint(c: AbstractCanvas2D) {
      try {
        ;(ctor.prototype as Shape).paint.call(this, c)
      } catch (e) {
        if (!failed.has(name)) console.warn(`draw.io shape ${name}:`, e)
        failed.add(name)
      }
    }
  }
  Object.setPrototypeOf(Wrapped.prototype, ctor.prototype)
  ShapeRegistry.add(name, Wrapped as unknown as ShapeConstructor)
}

const getShape = (name: string) => legacyShapes.get(name) ?? toLegacy(ShapeRegistry.get(name))

function getValue(style: Record<string, unknown> | null | undefined, key: string, def?: unknown) {
  const v = style?.[key]
  if (v == null) return def
  // mxGraph keeps style values as strings.
  return typeof v === 'number' ? String(v) : v
}

const mxUtils = {
  extend(ctor: LegacyCtor, superCtor: LegacyCtor | ClassCtor) {
    const parent = toLegacy(superCtor) ?? mxShape
    ctor.prototype = Object.create(parent.prototype, { constructor: { value: ctor, writable: true, configurable: true } })
  },
  getValue,
  getNumber(style: Record<string, unknown> | null | undefined, key: string, def = 0) {
    const v = style?.[key]
    return v == null ? def : Number(v)
  },
  getColorValue(style: Record<string, unknown> | null | undefined, key: string, def?: unknown) {
    const v = getValue(style, key)
    return v == null || v === 'default' ? def : v
  },
  getSizeForString: styleUtils.getSizeForString,
  getDirectedBounds: mathUtils.getDirectedBounds,
  ptSegDistSq: mathUtils.ptSegDistSq,
  clone: cloneUtils.clone,
  safeDecodeURIComponent(value: string) {
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  },
  // "#fff,red" → colors (draw.io's gradient color lists).
  parseColorList(value: string | null) {
    return value ? value.split(',').map((s) => s.trim()).filter(Boolean) : []
  },
  bind: <T extends (...a: never[]) => unknown>(scope: unknown, fn: T) => fn.bind(scope),
  indexOf: <T>(array: T[] | null, obj: T) => (array ? array.indexOf(obj) : -1),
}

const mxMarker = {
  addMarker(name: string, fn: MarkerFactoryFunction) {
    if (!EdgeMarkerRegistry.get(name)) EdgeMarkerRegistry.add(name, fn)
  },
  createMarker: EdgeMarkerRegistry.createMarker.bind(EdgeMarkerRegistry),
}

const mxStyleRegistry = {
  putValue(name: string, value: unknown) {
    if (/Perimeter$/.test(name)) {
      if (!PerimeterRegistry.get(name)) PerimeterRegistry.add(name, value as PerimeterFunction)
    } else if (!EdgeStyleRegistry.get(name)) EdgeStyleRegistry.add(name, value as never)
  },
  getValue: (name: string) => PerimeterRegistry.get(name) ?? EdgeStyleRegistry.get(name),
}

// mxGraph's canvas accepted numeric strings (draw.io passes style values
// through); maxGraph's does arithmetic on them, so they are converted first.
const NUMERIC_ARGS: Record<string, number[]> = {
  moveTo: [0, 1], lineTo: [0, 1], quadTo: [0, 1, 2, 3], curveTo: [0, 1, 2, 3, 4, 5], arcTo: [0, 1, 2, 3, 4, 5, 6],
  rect: [0, 1, 2, 3], roundrect: [0, 1, 2, 3, 4, 5], ellipse: [0, 1, 2, 3], image: [0, 1, 2, 3], text: [0, 1, 2, 3, 11],
  translate: [0, 1], scale: [0], rotate: [0, 3, 4], setGradient: [2, 3, 4, 5, 7, 8],
  setFontSize: [0], setStrokeWidth: [0], setAlpha: [0], setFillAlpha: [0], setStrokeAlpha: [0], setMiterLimit: [0],
}
let canvasPatched = false
function acceptNumericStrings() {
  if (canvasPatched) return
  canvasPatched = true
  const toNumber = (v: unknown) => (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)) ? Number(v) : v)
  for (const proto of [AbstractCanvas2D.prototype, SvgCanvas2D.prototype] as unknown as Record<string, (...a: unknown[]) => unknown>[]) {
    for (const [name, indexes] of Object.entries(NUMERIC_ARGS)) {
      if (!Object.hasOwn(proto, name)) continue
      const fn = proto[name]
      proto[name] = function (this: unknown, ...args: unknown[]) {
        for (const i of indexes) args[i] = toNumber(args[i])
        return fn.apply(this, args)
      }
    }
  }
}

// The namespace draw.io's shape files run against; files also add their own
// top-level declarations to it (later files may use them).
function createNamespace(base: string, constants: Record<string, unknown>): Record<string, unknown> {
  acceptNumericStrings()
  return {
    // draw.io's paths, relative to the generated folder.
    GRAPH_IMAGE_PATH: base + 'img',
    STENCIL_PATH: base + 'stencils',
    SHAPES_PATH: base + 'shapes',
    IMAGE_PATH: base + 'images',
    mxShape,
    mxActor: legacy(ActorShape),
    mxCylinder: legacy(CylinderShape),
    mxRectangleShape,
    mxEllipse,
    mxDoubleEllipse: legacy(DoubleEllipseShape),
    mxRhombus: legacy(RhombusShape),
    mxTriangle: legacy(TriangleShape),
    mxHexagon: legacy(HexagonShape),
    mxCloud: legacy(CloudShape),
    mxLabel: legacy(LabelShape),
    mxImageShape: legacy(ImageShape),
    mxSwimlane: legacy(SwimlaneShape),
    mxText: legacy(TextShape),
    mxLine: legacy(LineShape),
    mxPolyline: legacy(PolylineShape),
    mxConnector: legacy(ConnectorShape),
    mxArrow: legacy(ArrowShape),
    mxArrowConnector: legacy(ArrowConnectorShape),
    mxPoint: Point,
    mxRectangle: Rectangle,
    mxConnectionConstraint: ConnectionConstraint,
    mxConstants: constants,
    mxUtils,
    mxMarker,
    mxStyleRegistry,
    mxPerimeter: {},
    mxClient: { IS_SVG: true, NO_FO: false, IS_IE: false, IS_IE11: false, IS_EDGE: false, IS_FF: /firefox/i.test(navigator.userAgent) },
    mxCellRenderer: {
      registerShape,
      prototype: { getShape },
      defaultShapes: new Proxy({}, { get: (_t, name) => (typeof name === 'string' ? (legacyShapes.get(name) ?? ShapeRegistry.get(name)) : undefined) }),
    },
    mxStencilRegistry: {
      getStencil: (name: string) => StencilShapeRegistry.get(name),
      addStencil: (name: string, stencil: DrawioStencil) => StencilShapeRegistry.add(name, stencil),
      libraries: {},
    },
    // Handles for adjustable shape parameters, shared with our own shapes (handles.ts).
    Graph: { handleFactory: HANDLE_FACTORY, createHandle },
  }
}

type ShapeFileFn = (mx: Record<string, unknown>) => void
const pending = new Map<string, (fn: ShapeFileFn) => void>()
let namespace: Promise<Record<string, unknown>> | null = null

// Loads and runs a generated shape file (a classic script calling __drawioShapes).
export async function loadShapeFile(base: string, file: string): Promise<void> {
  namespace ??= fetch(base + 'shapes/constants.json').then((r) => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
    return r.json() as Promise<Record<string, unknown>>
  }).then((constants) => createNamespace(base, constants))
  const mx = await namespace.catch((e) => {
    namespace = null
    throw e
  })
  const w = window as unknown as { __drawioShapes?: (file: string, fn: ShapeFileFn) => void }
  w.__drawioShapes ??= (name, fn) => pending.get(name)?.(fn)
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    let ran = false
    pending.set(file, (fn) => {
      ran = true
      try {
        fn(mx)
      } catch (e) {
        // Shapes registered before the error still work.
        console.warn(`draw.io shapes ${file}:`, e)
      }
    })
    const done = (err?: string) => {
      pending.delete(file)
      script.remove()
      if (err || !ran) reject(new Error(err ?? `${file} did not load`))
      else resolve()
    }
    script.src = base + file
    script.addEventListener('load', () => done())
    script.addEventListener('error', () => done(`Could not load ${file}`))
    document.head.append(script)
  })
}
