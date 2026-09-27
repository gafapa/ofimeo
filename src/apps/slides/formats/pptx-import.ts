// PowerPoint (.pptx) import: slides with text boxes and placeholders
// (formatted paragraphs, bullets), basic shapes, pictures, straight connectors,
// tables, charts, SmartArt, backgrounds and speaker notes. Placeholders take
// their position and default text size from the slide layout and master, and
// theme colors resolve through the presentation theme. Charts become pictures
// drawn from their data (kept with the object); SmartArt uses the drawing
// PowerPoint stores with it, or a box with its text. Transitions and the
// preset animations of the main sequence (pptx-anim.ts writes the same ones)
// become the app's transitions and animations.

import JSZip from 'jszip'
import { t } from '../../../core/i18n'
import { newCellId, type CellRecord } from '../../diagram/model'
import { SLIDE_SIZES, THEMES, type Ratio, type SlideData } from '../model'
import { animationsFromStarts, defaultDuration, type AnimEffect, type AnimKind, type Animation, type Direction, type Trigger } from '../animations'
import { parseChart, renderChartSvg, svgDataUri } from './chart'
import { graphFromPictureName } from '../mathgraph'

const EMU_PER_PX = 9525

interface Part {
  path: string
  doc: Document
  rels: Map<string, string>
}

interface Xfrm {
  x: number
  y: number
  w: number
  h: number
  rot: number
  flipH: boolean
  flipV: boolean
}

interface Ctx {
  zip: JSZip
  scale: number
  colors: Record<string, string>
  majorFont: string
  minorFont: string
  slide: Part
  layout: Part | null
  master: Part | null
  cells: CellRecord[]
  previous: string | undefined
}

// ---------- XML helpers ----------

const kids = (el: Element | null | undefined, name: string) => (el ? [...el.children].filter((c) => c.localName === name) : [])
const kid = (el: Element | null | undefined, name: string) => kids(el, name)[0] ?? null
const find = (el: Element | Document | null | undefined, name: string): Element | null => (el ? (el.getElementsByTagNameNS('*', name)[0] ?? null) : null)
const findAll = (el: Element | Document | null | undefined, name: string) => (el ? [...el.getElementsByTagNameNS('*', name)] : [])
const attr = (el: Element | null | undefined, name: string) => el?.getAttribute(name) ?? null
const num = (v: string | null, fallback = 0) => (v === null || v === '' || Number.isNaN(Number(v)) ? fallback : Number(v))

function resolvePath(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = base.split('/').slice(0, -1)
  for (const p of target.split('/')) {
    if (p === '..') parts.pop()
    else if (p !== '.') parts.push(p)
  }
  return parts.join('/')
}

async function readPart(zip: JSZip, path: string): Promise<Part | null> {
  const file = zip.file(path)
  if (!file) return null
  const doc = new DOMParser().parseFromString(await file.async('text'), 'application/xml')
  const relsPath = path.replace(/([^/]+)$/, '_rels/$1.rels')
  const rels = new Map<string, string>()
  const relsFile = zip.file(relsPath)
  if (relsFile) {
    const relsDoc = new DOMParser().parseFromString(await relsFile.async('text'), 'application/xml')
    for (const rel of findAll(relsDoc, 'Relationship')) {
      if (attr(rel, 'TargetMode') === 'External') continue
      rels.set(attr(rel, 'Id') ?? '', resolvePath(path, attr(rel, 'Target') ?? ''))
    }
  }
  return { path, doc, rels }
}

function relOfType(part: Part, type: string): string | null {
  // Relationship types are only in the rels file; match by target folder name instead.
  for (const target of part.rels.values()) if (target.includes(type)) return target
  return null
}

// ---------- Entry ----------

export async function parsePptx(buffer: ArrayBuffer): Promise<{ ratio: Ratio; themeId?: string; slides: SlideData[] }> {
  const zip = await JSZip.loadAsync(buffer)
  const pres = await readPart(zip, 'ppt/presentation.xml')
  if (!pres) throw new Error(t('Not a PowerPoint presentation'))
  const sz = find(pres.doc, 'sldSz')
  const cx = num(attr(sz, 'cx'), 9144000)
  const cy = num(attr(sz, 'cy'), 5143500)
  const ratio: Ratio = Math.abs(cx / cy - 4 / 3) < 0.05 ? '4:3' : '16:9'
  const target = SLIDE_SIZES[ratio]
  const scale = target.width / (cx / EMU_PER_PX)

  // Theme colors and fonts.
  const colors: Record<string, string> = {}
  let majorFont = 'Calibri'
  let minorFont = 'Calibri'
  const themePath = relOfType(pres, 'theme/')
  const theme = themePath ? await readPart(zip, themePath) : null
  const scheme = find(theme?.doc, 'clrScheme')
  if (scheme) {
    for (const c of [...scheme.children]) {
      const value = attr(kid(c, 'srgbClr'), 'val') ?? attr(kid(c, 'sysClr'), 'lastClr')
      if (value) colors[c.localName] = `#${value.toLowerCase()}`
    }
  }
  Object.assign(colors, { tx1: colors.dk1, bg1: colors.lt1, tx2: colors.dk2, bg2: colors.lt2 })
  majorFont = attr(kid(find(theme?.doc, 'majorFont'), 'latin'), 'typeface') ?? majorFont
  minorFont = attr(kid(find(theme?.doc, 'minorFont'), 'latin'), 'typeface') ?? minorFont

  const slides: SlideData[] = []
  for (const id of findAll(pres.doc, 'sldId')) {
    const rid = id.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? attr(id, 'r:id')
    const path = rid ? pres.rels.get(rid) : undefined
    if (!path) continue
    const slide = await readPart(zip, path)
    if (!slide) continue
    const layoutPath = relOfType(slide, 'slideLayouts/')
    const layout = layoutPath ? await readPart(zip, layoutPath) : null
    const masterPath = layout ? relOfType(layout, 'slideMasters/') : null
    const master = masterPath ? await readPart(zip, masterPath) : null
    const ctx: Ctx = { zip, scale, colors, majorFont, minorFont, slide, layout, master, cells: [{ id: '0' }, { id: '1', parent: '0' }], previous: undefined }
    const background = await backgroundOf(ctx, target.width, target.height)
    const tree = find(slide.doc, 'spTree')
    // Shape id → the cells made from it (animations target shape ids).
    const spids = new Map<number, string[]>()
    if (tree) await walkTree(ctx, tree, null, spids)
    const transition = readTransition(slide.doc)
    const notesPath = relOfType(slide, 'notesSlides/')
    const notes = notesPath ? await readPart(zip, notesPath) : null
    const pageId = crypto.randomUUID()
    slides.push({
      id: pageId,
      name: `Slide ${slides.length + 1}`,
      cells: ctx.cells,
      notes: notes ? notesText(notes) : '',
      background,
      animations: readAnimations(slide.doc, spids),
      ...transition,
    })
  }
  if (!slides.length) throw new Error(t('The presentation has no slides'))
  // Presentations exported by this app name their theme ("Ofimeo: ocean"); other
  // themes have no equivalent, so no theme of the picker is shown as active.
  const themeName = attr(theme?.doc.documentElement, 'name') ?? ''
  const own = /^Ofimeo: (\w+)$/.exec(themeName)?.[1]
  return { ratio, themeId: THEMES.some((th) => th.id === own) ? own : 'imported', slides }
}

// ---------- Transitions and animations ----------

// The slide transition: fade, push and wipe are kept, other effects become the
// closest one (covers and pulls push, splits and shapes wipe, the rest fade).
function readTransition(doc: Document): { transition?: string; transitionDuration?: number } {
  // PowerPoint 2010+ writes <mc:AlternateContent> with a p14 choice (its exact
  // duration) and a plain fallback: the first transition element is the richest.
  const node = find(doc, 'transition')
  if (!node) return {}
  const effect = [...node.children].find((c) => c.localName !== 'sndAc' && c.localName !== 'extLst')?.localName
  if (!effect) return {}
  const transition = effect === 'fade' || effect === 'dissolve' || effect === 'cut' ? 'fade' : ['push', 'cover', 'pull', 'pan'].includes(effect) ? 'push' : ['wipe', 'split', 'strips', 'blinds', 'checker', 'circle', 'diamond', 'plus', 'wedge', 'wheel', 'zoom', 'randomBar'].includes(effect) ? 'wipe' : 'fade'
  const spd = attr(node, 'spd')
  const dur = Number(node.getAttribute('p14:dur') ?? attr(node, 'dur'))
  return { transition, transitionDuration: dur > 0 ? dur : spd === 'slow' ? 1000 : spd === 'med' ? 750 : 500 }
}

const PRESET_EFFECTS: Record<string, AnimEffect> = { 1: 'appear', 10: 'fade', 2: 'fly', 53: 'zoom', 23: 'zoom', 21: 'wipe', 22: 'wipe', 3: 'wipe', 8: 'spin', 32: 'teeter', 6: 'pulse', 26: 'pulse', 34: 'pulse' }
const SUBTYPE_DIRECTION: Record<string, Direction> = { 8: 'left', 2: 'right', 1: 'top', 4: 'bottom' }

// The main sequence of <p:timing>: each child of mainSeq is a click step; inside
// it, time groups (delayed from the start of the step) hold the preset effects.
function readAnimations(doc: Document, spids: Map<number, string[]>): Animation[] {
  const main = findAll(doc, 'cTn').find((c) => attr(c, 'nodeType') === 'mainSeq')
  if (!main) return []
  const delayOf = (cTn: Element | null) => num(attr(kid(kid(cTn, 'stCondLst'), 'cond'), 'delay'))
  const found: (Omit<Animation, 'id' | 'pos' | 'delay'> & { start: number })[] = []
  for (const step of kids(kid(main, 'childTnLst'), 'par')) {
    // Only the first effect of a step waits for the click; the others go with it.
    let first = true
    for (const group of kids(kid(kid(step, 'cTn'), 'childTnLst'), 'par')) {
      const groupCTn = kid(group, 'cTn')
      for (const effect of kids(kid(groupCTn, 'childTnLst'), 'par')) {
        const cTn = kid(effect, 'cTn')
        const cls = attr(cTn, 'presetClass')
        const kind: AnimKind | null = cls === 'entr' ? 'entrance' : cls === 'exit' ? 'exit' : cls === 'emph' ? 'emphasis' : null
        const spid = Number(attr(find(cTn, 'spTgt'), 'spid'))
        const cells = spids.get(spid)
        if (!kind || !cTn || !cells?.length) continue
        const preset = attr(cTn, 'presetID') ?? ''
        let effectName = PRESET_EFFECTS[preset] ?? (kind === 'emphasis' ? 'pulse' : 'fade')
        if (kind === 'emphasis' ? !['pulse', 'spin', 'teeter'].includes(effectName) : ['pulse', 'spin', 'teeter'].includes(effectName)) effectName = kind === 'emphasis' ? 'pulse' : 'fade'
        // Length: the longest behavior (the one-millisecond visibility sets aside).
        let duration = 0
        let repeat = 1
        for (const behavior of findAll(cTn, 'cTn')) {
          const d = num(attr(behavior, 'dur'))
          if (d > 1 && d > duration) {
            duration = d
            repeat = (attr(behavior, 'autoRev') === '1' ? 2 : 1) * (effectName === 'teeter' ? 2 : 1)
          }
        }
        duration = effectName === 'appear' ? 0 : duration ? duration * repeat : defaultDuration(effectName)
        const node = attr(cTn, 'nodeType')
        const trigger: Trigger = node === 'afterEffect' ? 'after' : node === 'withEffect' || !first ? 'with' : 'click'
        first = false
        const start = delayOf(groupCTn) + delayOf(cTn)
        const direction = SUBTYPE_DIRECTION[attr(cTn, 'presetSubtype') ?? ''] ?? 'left'
        cells.forEach((cell, i) => found.push({ cell, kind, effect: effectName, trigger: i ? 'with' : trigger, duration, direction, start }))
      }
    }
  }
  return animationsFromStarts(found)
}

// ---------- Shapes ----------

type GroupTransform = ((x: Xfrm) => Xfrm) | null

async function walkTree(ctx: Ctx, tree: Element, transform: GroupTransform, spids?: Map<number, string[]>): Promise<void> {
  for (const node of [...tree.children]) {
    const before = ctx.cells.length
    await walkNode(ctx, node, transform)
    const id = Number(attr(find(node, 'cNvPr'), 'id'))
    if (spids && Number.isFinite(id)) spids.set(id, ctx.cells.slice(before).filter((c) => c.parent === '1').map((c) => c.id))
  }
}

async function walkNode(ctx: Ctx, node: Element, transform: GroupTransform): Promise<void> {
  const name = node.localName
  if (name === 'sp') await shape(ctx, node, transform)
  else if (name === 'pic') await picture(ctx, node, transform)
  else if (name === 'cxnSp') connector(ctx, node, transform)
  else if (name === 'graphicFrame') await graphicFrame(ctx, node, transform)
  else if (name === 'grpSp') {
    const xfrm = kid(kid(node, 'grpSpPr'), 'xfrm')
    const outer = readXfrm(xfrm)
    const chOff = kid(xfrm, 'chOff')
    const chExt = kid(xfrm, 'chExt')
    let inner: GroupTransform = transform
    if (outer && chOff && chExt) {
      const sx = num(attr(chExt, 'cx'), 1) ? outer.w / num(attr(chExt, 'cx'), 1) : 1
      const sy = num(attr(chExt, 'cy'), 1) ? outer.h / num(attr(chExt, 'cy'), 1) : 1
      const ox = num(attr(chOff, 'x'))
      const oy = num(attr(chOff, 'y'))
      const map = (x: Xfrm): Xfrm => ({ ...x, x: outer.x + (x.x - ox) * sx, y: outer.y + (x.y - oy) * sy, w: x.w * sx, h: x.h * sy })
      inner = transform ? (x) => transform(map(x)) : map
    }
    await walkTree(ctx, node, inner)
  } else if (name === 'AlternateContent') {
    const fallback = kid(node, 'Fallback') ?? kid(node, 'Choice')
    if (fallback) await walkTree(ctx, fallback, transform)
  }
}

function readXfrm(xfrm: Element | null): Xfrm | null {
  const off = kid(xfrm, 'off')
  const ext = kid(xfrm, 'ext')
  if (!off || !ext) return null
  return {
    x: num(attr(off, 'x')),
    y: num(attr(off, 'y')),
    w: num(attr(ext, 'cx')),
    h: num(attr(ext, 'cy')),
    rot: num(attr(xfrm, 'rot')) / 60000,
    flipH: attr(xfrm, 'flipH') === '1',
    flipV: attr(xfrm, 'flipV') === '1',
  }
}

// The placeholder of the layout (then the master) matching a slide placeholder.
function inherited(ctx: Ctx, ph: Element | null): Element[] {
  if (!ph) return []
  const type = attr(ph, 'type') ?? 'body'
  const idx = attr(ph, 'idx')
  const out: Element[] = []
  for (const part of [ctx.layout, ctx.master]) {
    if (!part) continue
    const candidates = findAll(part.doc, 'ph')
    const match =
      (idx !== null ? candidates.find((p) => attr(p, 'idx') === idx) : undefined) ??
      candidates.find((p) => (attr(p, 'type') ?? 'body') === type) ??
      (type === 'ctrTitle' ? candidates.find((p) => attr(p, 'type') === 'title') : undefined) ??
      (type === 'subTitle' || type === 'obj' ? candidates.find((p) => (attr(p, 'type') ?? 'body') === 'body') : undefined)
    const sp = match?.closest('sp')
    if (sp) out.push(sp)
  }
  return out
}

function placeholderOf(node: Element): Element | null {
  return find(kid(node, 'nvSpPr') ?? kid(node, 'nvPicPr') ?? node, 'ph')
}

function xfrmOf(ctx: Ctx, node: Element, parents: Element[], transform: GroupTransform): Xfrm | null {
  let x = readXfrm(kid(kid(node, 'spPr'), 'xfrm'))
  for (const p of parents) x ??= readXfrm(kid(kid(p, 'spPr'), 'xfrm'))
  if (!x) return null
  return transform ? transform(x) : x
}

function geometry(ctx: Ctx, x: Xfrm): string {
  const s = ctx.scale / EMU_PER_PX
  return JSON.stringify({ x: round(x.x * s), y: round(x.y * s), width: Math.max(1, round(x.w * s)), height: Math.max(1, round(x.h * s)) })
}

const round = (n: number) => Math.round(n * 100) / 100

function push(ctx: Ctx, rec: Omit<CellRecord, 'id' | 'parent'>): string {
  const id = newCellId()
  ctx.cells.push({ id, parent: '1', ...(ctx.previous ? { previous: ctx.previous } : {}), ...rec })
  ctx.previous = id
  return id
}

const PRESETS: Record<string, string> = {
  rect: '', roundRect: 'rounded=1;arcSize=12;', ellipse: 'ellipse;', triangle: 'triangle;direction=north;', diamond: 'rhombus;',
  hexagon: 'shape=hexagon;perimeter=hexagonPerimeter2;', parallelogram: 'shape=parallelogram;perimeter=parallelogramPerimeter;', cloud: 'ellipse;shape=cloud;',
  rightArrow: 'shape=singleArrow;', leftArrow: 'shape=singleArrow;direction=west;', upArrow: 'shape=singleArrow;direction=north;',
  downArrow: 'shape=singleArrow;direction=south;', flowChartProcess: '', flowChartDecision: 'rhombus;', flowChartTerminator: 'rounded=1;arcSize=50;',
}

async function shape(ctx: Ctx, node: Element, transform: GroupTransform): Promise<void> {
  const ph = placeholderOf(node)
  const parents = inherited(ctx, ph)
  const x = xfrmOf(ctx, node, parents, transform)
  if (!x) return
  const spPr = kid(node, 'spPr')
  const prst = attr(kid(spPr, 'prstGeom'), 'prst') ?? 'rect'
  if (prst === 'line' || prst === 'straightConnector1') return lineShape(ctx, node, x)
  const isTextBox = attr(find(kid(node, 'nvSpPr'), 'cNvSpPr'), 'txBox') === '1'
  const styleRef = kid(node, 'style')
  const fill = fillOf(ctx, spPr) ?? (ph || isTextBox ? null : refColor(ctx, kid(styleRef, 'fillRef')))
  const ln = kid(spPr, 'ln')
  const stroke = ln && kid(ln, 'noFill') ? null : (fillOf(ctx, ln) ?? (ph || isTextBox ? null : refColor(ctx, kid(styleRef, 'lnRef'))))
  const strokeWidth = ln && attr(ln, 'w') ? Math.max(0.5, round((num(attr(ln, 'w')) / EMU_PER_PX) * ctx.scale)) : 1
  const phType = ph ? (attr(ph, 'type') ?? 'body') : null
  const isTitle = phType === 'title' || phType === 'ctrTitle'
  const text = textOf(ctx, node, parents, phType)
  if (!text.html && !fill && !stroke) return
  const base = PRESETS[prst] ?? ''
  const style =
    (base || (fill || stroke ? '' : 'text;')) +
    `html=1;whiteSpace=wrap;overflow=hidden;spacing=0;spacingLeft=${text.insets[3]};spacingRight=${text.insets[1]};spacingTop=${text.insets[0] - 5};spacingBottom=${text.insets[2] - 1};` +
    `fillColor=${fill ?? 'none'};strokeColor=${stroke ?? 'none'};` +
    (stroke ? `strokeWidth=${strokeWidth};` : '') +
    `align=${text.align};verticalAlign=${text.valign};fontSize=${text.size};fontColor=${text.color};fontFamily=${cssFont(isTitle ? ctx.majorFont : ctx.minorFont)};` +
    (x.rot ? `rotation=${round(x.rot)};` : '') +
    (x.flipH ? 'flipH=1;' : '') +
    (x.flipV ? 'flipV=1;' : '')
  push(ctx, { vertex: 1, value: text.html, style, geometry: geometry(ctx, x) })
}

function lineShape(ctx: Ctx, node: Element, x: Xfrm): void {
  const s = ctx.scale / EMU_PER_PX
  let [x1, y1, x2, y2] = [x.x, x.y, x.x + x.w, x.y + x.h].map((v) => round(v * s))
  if (x.flipH) [x1, x2] = [x2, x1]
  if (x.flipV) [y1, y2] = [y2, y1]
  const ln = kid(kid(node, 'spPr'), 'ln')
  const color = fillOf(ctx, ln) ?? refColor(ctx, kid(kid(node, 'style'), 'lnRef')) ?? '#000000'
  const width = ln && attr(ln, 'w') ? Math.max(0.5, round((num(attr(ln, 'w')) / EMU_PER_PX) * ctx.scale)) : 1
  const arrow = (end: Element | null) => {
    const type = attr(end, 'type')
    if (!type || type === 'none') return 'none'
    return type === 'oval' ? 'oval' : type === 'diamond' ? 'diamond' : type === 'arrow' ? 'open' : 'block'
  }
  const style = `endArrow=${arrow(kid(ln, 'tailEnd'))};startArrow=${arrow(kid(ln, 'headEnd'))};html=1;strokeColor=${color};strokeWidth=${width};` + (kid(ln, 'prstDash') && attr(kid(ln, 'prstDash'), 'val') !== 'solid' ? 'dashed=1;' : '')
  push(ctx, { edge: 1, style, geometry: JSON.stringify({ x: 0, y: 0, width: 0, height: 0, relative: 1, sourcePoint: [x1, y1], targetPoint: [x2, y2] }) })
}

function connector(ctx: Ctx, node: Element, transform: GroupTransform): void {
  const x = xfrmOf(ctx, node, [], transform)
  if (x) lineShape(ctx, node, x)
}

async function picture(ctx: Ctx, node: Element, transform: GroupTransform): Promise<void> {
  const ph = placeholderOf(node)
  const x = xfrmOf(ctx, node, inherited(ctx, ph), transform)
  const blip = find(node, 'blip')
  const rid = blip?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed') ?? attr(blip, 'r:embed')
  const path = rid ? ctx.slide.rels.get(rid) : undefined
  if (!x || !path) return
  const image = await imageData(ctx, path)
  if (!image) return
  // Math graphs exported by Ofimeo keep their construction in the picture name.
  const mathGraph = graphFromPictureName(attr(find(node, 'cNvPr'), 'name'))
  const style = `shape=image;verticalLabelPosition=bottom;verticalAlign=top;imageAspect=0;image=${image};` + (x.rot ? `rotation=${round(x.rot)};` : '') + (x.flipH ? 'flipH=1;' : '') + (mathGraph ? 'slideGraph=1;aspect=fixed;' : '')
  push(ctx, { vertex: 1, style, geometry: geometry(ctx, x), ...(mathGraph ? { data: mathGraph } : {}) })
}

async function graphicFrame(ctx: Ctx, node: Element, transform: GroupTransform): Promise<void> {
  const xfrm = readXfrm(kid(node, 'xfrm'))
  if (!xfrm) return
  const x = transform ? transform(xfrm) : xfrm
  const uri = attr(find(node, 'graphicData'), 'uri') ?? ''
  if (uri.endsWith('/chart')) return chartFrame(ctx, node, x)
  if (uri.endsWith('/diagram')) return smartArt(ctx, node, x)
  const tbl = find(node, 'tbl')
  if (!tbl) return
  const s = ctx.scale / EMU_PER_PX
  const cols = kids(kid(tbl, 'tblGrid'), 'gridCol').map((c) => num(attr(c, 'w')) * s)
  const rows = kids(tbl, 'tr')
  const tableId = push(ctx, { vertex: 1, style: 'group;slideTable=1;container=1;collapsible=0;', connectable: 0, geometry: geometry(ctx, x) })
  let y = 0
  let previous: string | undefined
  for (const row of rows) {
    const h = num(attr(row, 'h')) * s
    let cx = 0
    kids(row, 'tc').forEach((tc, i) => {
      const w = cols[i] ?? 80
      const text = textOf(ctx, tc, [], 'table')
      const fill = fillOf(ctx, kid(tc, 'tcPr'))
      const id = newCellId()
      ctx.cells.push({
        id,
        parent: tableId,
        ...(previous ? { previous } : {}),
        vertex: 1,
        connectable: 0,
        value: text.html,
        style: `rounded=0;whiteSpace=wrap;html=1;overflow=hidden;slideCell=1;strokeColor=#9aa0a6;fillColor=${fill ?? 'none'};align=${text.align};verticalAlign=${text.valign};fontSize=${text.size};fontColor=${text.color};fontFamily=${cssFont(ctx.minorFont)};`,
        geometry: JSON.stringify({ x: round(cx), y: round(y), width: round(w), height: round(h) }),
      })
      previous = id
      cx += w
    })
    y += h
  }
}

// ---------- Charts and SmartArt ----------

const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

// A chart as a picture of it, drawn from the cached data in the chart part.
async function chartFrame(ctx: Ctx, node: Element, x: Xfrm): Promise<void> {
  const ref = find(node, 'chart')
  const rid = ref?.getAttributeNS(REL_NS, 'id') ?? attr(ref, 'r:id')
  const path = rid ? ctx.slide.rels.get(rid) : undefined
  const part = path ? await readPart(ctx.zip, path) : null
  const chart = part ? parseChart(part.doc, (fill) => (fill ? colorOf(ctx, fill) : null)) : null
  if (!chart) return
  const s = ctx.scale / EMU_PER_PX
  const svg = renderChartSvg(chart, x.w * s, x.h * s, cssFont(ctx.minorFont))
  push(ctx, {
    vertex: 1,
    style: `shape=image;imageAspect=0;slideChart=1;image=${svgDataUri(svg)};`,
    geometry: geometry(ctx, x),
    data: JSON.stringify({ chart }),
  })
}

// SmartArt: the shapes of its drawing part (positions relative to the frame), else a box with its text.
async function smartArt(ctx: Ctx, node: Element, x: Xfrm): Promise<void> {
  const ids = find(node, 'relIds')
  const dm = ids?.getAttributeNS(REL_NS, 'dm') ?? attr(ids, 'r:dm')
  const dataPath = dm ? ctx.slide.rels.get(dm) : undefined
  const data = dataPath ? await readPart(ctx.zip, dataPath) : null
  const drawingRel = attr(find(data?.doc, 'dataModelExt'), 'relId')
  const drawingPath = (drawingRel ? ctx.slide.rels.get(drawingRel) : undefined) ?? relOfType(ctx.slide, 'diagrams/drawing')
  const drawing = drawingPath ? await readPart(ctx.zip, drawingPath) : null
  const tree = find(drawing?.doc, 'spTree')
  const shapes = tree ? [...tree.children].filter((c) => c.localName === 'sp' || c.localName === 'grpSp') : []
  if (tree && shapes.length) {
    const offset = (inner: Xfrm): Xfrm => ({ ...inner, x: inner.x + x.x, y: inner.y + x.y })
    // The drawing's pictures and theme colors resolve against its own part.
    const slide = ctx.slide
    ctx.slide = { ...drawing!, rels: new Map([...slide.rels, ...drawing!.rels]) }
    try {
      await walkTree(ctx, tree, offset)
    } finally {
      ctx.slide = slide
    }
    return
  }
  // No drawing: the text of the diagram's points, as a list in a dashed box.
  const texts = findAll(data?.doc, 'pt')
    .filter((pt) => !['parTrans', 'sibTrans', 'pres', 'doc'].includes(attr(pt, 'type') ?? 'node'))
    .map((pt) => findAll(pt, 't').filter((e) => e.namespaceURI?.endsWith('/drawingml/2006/main')).map((e) => e.textContent ?? '').join(''))
    .filter((text) => text.trim())
  const html = texts.length ? `<ul>${texts.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>` : escapeHtml(t('SmartArt'))
  push(ctx, {
    vertex: 1,
    value: html,
    style: `rounded=1;arcSize=4;whiteSpace=wrap;html=1;dashed=1;fillColor=none;strokeColor=#9aa0a6;align=left;verticalAlign=top;spacing=12;fontSize=${round(18 / 0.75 * ctx.scale)};fontColor=${ctx.colors.tx1 ?? '#000000'};fontFamily=${cssFont(ctx.minorFont)};`,
    geometry: geometry(ctx, x),
  })
}

// ---------- Colors ----------

function colorOf(ctx: Ctx, el: Element | null): string | null {
  if (!el) return null
  const srgb = kid(el, 'srgbClr')
  if (srgb) return `#${(attr(srgb, 'val') ?? '000000').toLowerCase()}`
  const scheme = kid(el, 'schemeClr')
  if (scheme) {
    const base = ctx.colors[attr(scheme, 'val') ?? ''] ?? null
    const lumMod = kid(scheme, 'lumMod')
    const lumOff = kid(scheme, 'lumOff')
    return base && (lumMod || lumOff) ? adjustLum(base, num(attr(lumMod, 'val'), 100000) / 100000, num(attr(lumOff, 'val'), 0) / 100000) : base
  }
  const sys = kid(el, 'sysClr')
  if (sys) return `#${(attr(sys, 'lastClr') ?? '000000').toLowerCase()}`
  const preset = kid(el, 'prstClr')
  if (preset) return attr(preset, 'val')
  return null
}

function fillOf(ctx: Ctx, parent: Element | null): string | null {
  if (!parent) return null
  if (kid(parent, 'noFill')) return null
  const solid = kid(parent, 'solidFill')
  if (solid) return colorOf(ctx, solid)
  const grad = kid(parent, 'gradFill')
  if (grad) return colorOf(ctx, find(grad, 'gs'))
  return null
}

function refColor(ctx: Ctx, ref: Element | null): string | null {
  if (!ref || attr(ref, 'idx') === '0') return null
  return colorOf(ctx, ref)
}

function adjustLum(hex: string, mod: number, off: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255)
  const max = Math.max(...ch)
  const min = Math.min(...ch)
  let l = (max + min) / 2
  const d = max - min
  let h = 0
  let s = 0
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === ch[0] ? (ch[1] - ch[2]) / d + (ch[1] < ch[2] ? 6 : 0) : max === ch[1] ? (ch[2] - ch[0]) / d + 2 : (ch[0] - ch[1]) / d + 4
    h /= 6
  }
  l = Math.min(1, Math.max(0, l * mod + off))
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue = (t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const rgb = s ? [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)] : [l, l, l]
  return `#${rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`
}

// ---------- Text ----------

interface TextInfo {
  html: string
  align: string
  valign: string
  size: number
  color: string
  insets: [number, number, number, number]
}

function textOf(ctx: Ctx, node: Element, parents: Element[], phType: string | null): TextInfo {
  const body = kid(node, 'txBody')
  const bodyPr = kid(body, 'bodyPr')
  const parentBodyPr = parents.map((p) => kid(kid(p, 'txBody'), 'bodyPr'))
  const anchor = attr(bodyPr, 'anchor') ?? parentBodyPr.map((b) => attr(b, 'anchor')).find(Boolean) ?? (phType === 'title' || phType === 'ctrTitle' ? 'ctr' : 't')
  const inset = (name: string, fallback: number) => {
    const v = attr(bodyPr, name) ?? parentBodyPr.map((b) => attr(b, name)).find((a) => a !== null)
    return round(((v !== null && v !== undefined ? Number(v) : fallback) / EMU_PER_PX) * ctx.scale)
  }
  const insets: [number, number, number, number] = [inset('tIns', 45720), inset('rIns', 91440), inset('bIns', 45720), inset('lIns', 91440)]

  // Default size and color: placeholder list styles, then the master's text styles.
  const masterStyles = find(ctx.master?.doc, 'txStyles')
  const styleName = phType === 'title' || phType === 'ctrTitle' ? 'titleStyle' : phType && phType !== 'table' ? 'bodyStyle' : 'otherStyle'
  const levelDefaults = (lvl: number): Element[] => {
    const name = `lvl${lvl + 1}pPr`
    const out: Element[] = []
    const own = kid(kid(body, 'lstStyle'), name)
    if (own) out.push(own)
    for (const p of parents) {
      const e = kid(kid(kid(p, 'txBody'), 'lstStyle'), name)
      if (e) out.push(e)
    }
    if (phType) {
      const e = kid(kid(masterStyles, styleName), name)
      if (e) out.push(e)
    }
    return out
  }
  const defaultSize = (lvl: number) => {
    for (const d of levelDefaults(lvl)) {
      const sz = attr(kid(d, 'defRPr'), 'sz')
      if (sz) return num(sz) / 100
    }
    return phType === 'title' || phType === 'ctrTitle' ? 44 : phType === 'table' ? 14 : 18
  }
  const defaultColor = (lvl: number) => {
    for (const d of levelDefaults(lvl)) {
      const c = fillOf(ctx, kid(d, 'defRPr'))
      if (c) return c
    }
    return ctx.colors.tx1 ?? '#000000'
  }
  const px = (pt: number) => round((pt / 0.75) * ctx.scale)

  const paragraphs = kids(body, 'p')
  // The box takes the size and color of its first run; other runs set their own.
  const firstRun = paragraphs.flatMap((p) => kids(p, 'r'))[0]
  const firstLvl = num(attr(kid(firstRun?.parentElement, 'pPr'), 'lvl'))
  const firstRPr = kid(firstRun, 'rPr')
  const baseSize = attr(firstRPr, 'sz') ? px(num(attr(firstRPr, 'sz')) / 100) : px(defaultSize(firstLvl))
  const baseColor = fillOf(ctx, firstRPr) ?? defaultColor(firstLvl)
  let align = 'left'
  const htmlParts: string[] = []
  let list: 'ul' | 'ol' | null = null
  const bulletDefault = phType === 'body' || phType === 'obj' || (phType !== null && /^\d+$/.test(phType))
  paragraphs.forEach((p, i) => {
    const pPr = kid(p, 'pPr')
    const lvl = num(attr(pPr, 'lvl'))
    const algn = attr(pPr, 'algn') ?? levelDefaults(lvl).map((d) => attr(d, 'algn')).find(Boolean) ?? (phType === 'ctrTitle' || phType === 'subTitle' ? 'ctr' : 'l')
    const pAlign = algn === 'ctr' ? 'center' : algn === 'r' ? 'right' : algn === 'just' ? 'justify' : 'left'
    if (i === 0) align = pAlign === 'justify' ? 'left' : pAlign
    const inheritedBullet = levelDefaults(lvl).map((d) => (kid(d, 'buNone') ? 'none' : kid(d, 'buAutoNum') ? 'ol' : kid(d, 'buChar') ? 'ul' : null)).find(Boolean)
    const bullet = kid(pPr, 'buNone') ? null : kid(pPr, 'buAutoNum') ? 'ol' : kid(pPr, 'buChar') ? 'ul' : inheritedBullet === 'none' ? null : (inheritedBullet ?? (bulletDefault ? 'ul' : null))
    const size = px(defaultSize(lvl))
    const color = defaultColor(lvl)
    let content = ''
    for (const r of [...p.children]) {
      if (r.localName === 'br') content += '<br>'
      else if (r.localName === 'r' || r.localName === 'fld') {
        const rPr = kid(r, 'rPr')
        const text = escapeHtml(kid(r, 't')?.textContent ?? '')
        if (!text) continue
        const css: string[] = []
        const sz = attr(rPr, 'sz')
        const runSize = sz ? px(num(sz) / 100) : size
        if (runSize !== baseSize) css.push(`font-size:${runSize}px`)
        const runColor = fillOf(ctx, rPr) ?? color
        if (runColor !== baseColor) css.push(`color:${runColor}`)
        const face = attr(kid(rPr, 'latin'), 'typeface')
        if (face && !face.startsWith('+')) css.push(`font-family:${cssFont(face)}`)
        let html = css.length ? `<span style="${css.join(';')}">${text}</span>` : text
        if (attr(rPr, 'b') === '1') html = `<b>${html}</b>`
        if (attr(rPr, 'i') === '1') html = `<i>${html}</i>`
        if (attr(rPr, 'u') && attr(rPr, 'u') !== 'none') html = `<u>${html}</u>`
        if (attr(rPr, 'strike') && attr(rPr, 'strike') !== 'noStrike') html = `<s>${html}</s>`
        content += html
      }
    }
    const empty = !content
    if (bullet && !empty) {
      if (list !== bullet) {
        if (list) htmlParts.push(`</${list}>`)
        htmlParts.push(`<${bullet}>`)
        list = bullet
      }
      htmlParts.push(`<li${pAlign !== align ? ` style="text-align:${pAlign}"` : ''}>${content}</li>`)
    } else {
      if (list) htmlParts.push(`</${list}>`)
      list = null
      htmlParts.push(`<div${pAlign !== align ? ` style="text-align:${pAlign}"` : ''}>${empty ? '<br>' : content}</div>`)
    }
  })
  if (list) htmlParts.push(`</${list}>`)
  // Drop trailing empty lines.
  while (htmlParts.length && htmlParts.at(-1) === '<div><br></div>') htmlParts.pop()
  return {
    html: htmlParts.join(''),
    align,
    valign: anchor === 'ctr' ? 'middle' : anchor === 'b' ? 'bottom' : 'top',
    size: baseSize,
    color: baseColor,
    insets,
  }
}

function notesText(part: Part): string {
  for (const sp of findAll(part.doc, 'sp')) {
    const ph = find(sp, 'ph')
    if (attr(ph, 'type') !== 'body') continue
    return kids(kid(sp, 'txBody'), 'p')
      .map((p) => findAll(p, 't').map((t) => t.textContent ?? '').join(''))
      .join('\n')
      .trim()
  }
  return ''
}

// The first background found on the slide, its layout or its master: a color,
// a gradient ("#a,#b") or a picture (added as a full slide image at the back).
async function backgroundOf(ctx: Ctx, width: number, height: number): Promise<string | undefined> {
  for (const part of [ctx.slide, ctx.layout, ctx.master]) {
    const bg = find(part?.doc, 'bg')
    if (!bg || !part) continue
    const bgPr = kid(bg, 'bgPr')
    const grad = kid(bgPr, 'gradFill')
    if (grad) {
      const stops = findAll(grad, 'gs').map((gs) => colorOf(ctx, gs)).filter(Boolean) as string[]
      if (stops.length >= 2) return `${stops[0]},${stops[stops.length - 1]}`
    }
    const blip = find(kid(bgPr, 'blipFill'), 'blip')
    const rid = blip?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed') ?? attr(blip, 'r:embed')
    const image = rid ? await imageData(ctx, part.rels.get(rid)) : null
    if (image) {
      push(ctx, { vertex: 1, style: `shape=image;imageAspect=0;image=${image};`, geometry: JSON.stringify({ x: 0, y: 0, width, height }) })
      return undefined
    }
    const color = bgPr ? fillOf(ctx, bgPr) : colorOf(ctx, kid(bg, 'bgRef'))
    if (color) return color
  }
  return undefined
}

// A picture of the package as a data URI for a style (draw.io keeps them without ";base64").
async function imageData(ctx: Ctx, path: string | undefined): Promise<string | null> {
  const file = path ? ctx.zip.file(path) : null
  const ext = path?.split('.').pop()!.toLowerCase() ?? ''
  const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', bmp: 'image/bmp', webp: 'image/webp' }[ext]
  if (!file || !mime) return null
  return `data:${mime},${await file.async('base64')}`
}

// A font with a generic fallback, for systems without it.
function cssFont(face: string): string {
  return `${face}, ${/serif|times|georgia|garamond|cambria|book|roman/i.test(face) && !/sans/i.test(face) ? 'serif' : 'sans-serif'}`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}
