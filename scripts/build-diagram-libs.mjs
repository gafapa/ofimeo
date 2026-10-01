// Builds draw.io's shape libraries for the diagram app into public/diagram-libs
// (generated, gitignored) from the pinned draw.io release (Apache-2.0; the
// stencils have their own license, copied next to them):
//   catalog.json          "More shapes" entries and the files each shape name needs
//   palettes/<entry>.json the items of an entry's libraries (loaded when enabled)
//   stencils/**.xml       stencil sets, whitespace-minified (loaded on demand)
//   shapes/**.js          draw.io's custom shape code wrapped for src/apps/diagram/shapes/compat.ts
//   img/lib/**            images used by image libraries
// The palettes are recorded by running draw.io's own sidebar code (Sidebar.js,
// Sidebar-*.js) in a Node vm sandbox with a small recording shim.
// DRAWIO_WAR_DIR=<unpacked war> uses a local copy instead of the cached download.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import zlib from 'node:zlib'
import JSZip from 'jszip'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { version: VERSION, sha256: SHA256 } = JSON.parse(readFileSync(join(root, 'scripts', 'drawio.json'), 'utf8'))
const WAR_URL = `https://github.com/jgraph/drawio/releases/download/v${VERSION}/draw.war`
const target = join(root, 'public', 'diagram-libs')
const stamp = join(target, '.version')
// Rebuilds when the pinned version or this script changes.
const BUILD_ID = VERSION + '-' + createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex').slice(0, 12)

if (!process.env.FORCE && existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === BUILD_ID) {
  console.log(`diagram libraries ${VERSION} already built`)
  process.exit(0)
}

// ---------- Source: unpacked war directory or the pinned, verified download ----------

async function openSource() {
  const dir = process.env.DRAWIO_WAR_DIR
  if (dir) {
    const files = []
    const walk = (d) => {
      for (const name of readdirSync(d)) {
        const p = join(d, name)
        if (statSync(p).isDirectory()) walk(p)
        else files.push(relative(dir, p).split('\\').join('/'))
      }
    }
    walk(dir)
    return { files, read: async (name) => readFileSync(join(dir, name)) }
  }
  const cache = join(root, 'node_modules', '.cache', `draw-${VERSION}.war`)
  let data
  if (existsSync(cache)) data = readFileSync(cache)
  else {
    console.log(`Downloading draw.io ${VERSION}…`)
    const res = await fetch(WAR_URL)
    if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`)
    data = Buffer.from(await res.arrayBuffer())
    mkdirSync(dirname(cache), { recursive: true })
    writeFileSync(cache, data)
  }
  const hash = createHash('sha256').update(data).digest('hex')
  if (hash !== SHA256) throw new Error(`Checksum mismatch for draw.war: ${hash}`)
  const zip = await JSZip.loadAsync(data)
  const files = Object.keys(zip.files).filter((n) => !zip.files[n].dir)
  return { files, read: (name) => zip.file(name).async('nodebuffer') }
}

const src = await openSource()
const text = async (name) => (await src.read(name)).toString('utf8')

rmSync(target, { recursive: true, force: true })
const write = (name, data) => {
  const out = join(target, name)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, data)
}

// ---------- Stencils ----------

// Removes comments and whitespace between tags, and rounds coordinates to 1/100 px.
const minifyXml = (xml) =>
  xml.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?xml[^>]*\?>/, '').replace(/>\s+</g, '><').replace(/="(-?\d*\.\d{2})\d+"/g, '="$1"').trim()

const attr = (tag, name) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)
  return m ? m[1].replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : null
}

// Stencil files by path, with their shapes as draw.io's parseStencilSet reports them.
const stencilFiles = new Map()
for (const name of src.files.filter((n) => n.startsWith('stencils/') && n.endsWith('.xml'))) {
  const xml = minifyXml(await text(name))
  const shapes = []
  // <shapes name="mxgraph.xyz"> then its <shape name=".." w=".." h=".."> children.
  const groups = xml.split(/(?=<shapes[\s>])/)
  for (const group of groups) {
    const head = /^<shapes[^>]*>/.exec(group)
    if (!head) continue
    const pkg = (attr(head[0], 'name') ?? '').toLowerCase()
    for (const m of group.matchAll(/<shape\s[^>]*>/g)) {
      const shapeName = attr(m[0], 'name')
      if (shapeName == null) continue
      const w = attr(m[0], 'w')
      const h = attr(m[0], 'h')
      shapes.push({ pkg: pkg ? pkg + '.' : '', name: shapeName.replace(/ /g, '_'), w: w == null ? 80 : parseInt(w, 10), h: h == null ? 80 : parseInt(h, 10) })
    }
  }
  stencilFiles.set(name, { xml, shapes })
}

// ---------- Palettes: draw.io's sidebar code in a sandbox ----------

// Minimal XML reader for the (well-formed) mxGraphModel snippets of data entries.
function parseXml(xml) {
  const rootNode = { name: '#root', attrs: {}, children: [] }
  const stack = [rootNode]
  for (const m of xml.matchAll(/<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g)) {
    if (m[1]) {
      stack.pop()
      continue
    }
    const attrs = {}
    for (const a of m[3].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decodeEntities(a[2] ?? a[3])
    const node = { name: m[2], attrs, children: [] }
    stack[stack.length - 1].children.push(node)
    if (!m[4]) stack.push(node)
  }
  return rootNode
}
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[e] ?? all
  })
}

const round = (n) => Math.round(Number(n) * 100) / 100

// Records (see src/apps/diagram/model.ts) of an mxGraphModel snippet; cells of
// the default layer become top-level cells.
function modelToRecords(xml) {
  const doc = parseXml(xml)
  const find = (node, name) => node.children.find((c) => c.name === name)
  const model = find(doc, 'mxGraphModel')
  const rootEl = model && find(model, 'root')
  if (!rootEl) return []
  const out = []
  for (const el of rootEl.children) {
    const wrapper = el.name === 'mxCell' ? null : el
    const cellEl = wrapper ? find(wrapper, 'mxCell') : el
    if (!cellEl) continue
    const a = cellEl.attrs
    const rec = { id: (wrapper ?? el).attrs.id }
    if (wrapper) {
      const data = {}
      for (const [k, v] of Object.entries(wrapper.attrs)) {
        if (k === 'id') continue
        if (k === 'label') rec.value = v
        else data[k] = v
      }
      if (Object.keys(data).length) rec.data = JSON.stringify(data)
    } else if (a.value) rec.value = a.value
    if (a.parent) rec.parent = a.parent
    if (a.style) rec.style = a.style
    if (a.vertex === '1') rec.vertex = 1
    if (a.edge === '1') rec.edge = 1
    if (a.source) rec.source = a.source
    if (a.target) rec.target = a.target
    if (a.connectable === '0') rec.connectable = 0
    if (a.collapsed === '1') rec.collapsed = 1
    if (a.visible === '0') rec.visible = 0
    const geo = find(cellEl, 'mxGeometry')
    if (geo) {
      const g = { x: round(geo.attrs.x ?? 0), y: round(geo.attrs.y ?? 0), width: round(geo.attrs.width ?? 0), height: round(geo.attrs.height ?? 0) }
      if (geo.attrs.relative === '1') g.relative = 1
      for (const c of geo.children) {
        const pt = (p) => [round(p.attrs.x ?? 0), round(p.attrs.y ?? 0)]
        if (c.name === 'Array' && c.attrs.as === 'points') g.points = c.children.map(pt)
        else if (c.name === 'mxPoint' && ['sourcePoint', 'targetPoint', 'offset'].includes(c.attrs.as)) g[c.attrs.as] = pt(c)
        else if (c.name === 'mxRectangle' && c.attrs.as === 'alternateBounds') g.alternateBounds = [c.attrs.x, c.attrs.y, c.attrs.width, c.attrs.height].map((v) => round(v ?? 0))
      }
      rec.geometry = JSON.stringify(g)
    }
    out.push(rec)
  }
  // Drops the root and the layer.
  const rootIds = new Set(out.filter((r) => !r.parent).map((r) => r.id))
  const layerIds = new Set(out.filter((r) => r.parent && rootIds.has(r.parent)).map((r) => r.id))
  return out.filter((r) => !rootIds.has(r.id) && !layerIds.has(r.id)).map((r) => {
    if (layerIds.has(r.parent)) delete r.parent
    return r
  })
}

function decompress(data) {
  if (!data || data.charAt(0) === '<') return data
  return decodeURIComponent(zlib.inflateRawSync(Buffer.from(data, 'base64')).toString('latin1'))
}

// Records of cells built by draw.io's code (sandbox mxCell objects).
function cellsToRecords(cells) {
  let next = 0
  const ids = new Map()
  const idOf = (cell) => {
    if (!ids.has(cell)) ids.set(cell, 'c' + ++next)
    return ids.get(cell)
  }
  const out = []
  const visit = (cell, parent) => {
    const rec = { id: idOf(cell) }
    if (parent) rec.parent = idOf(parent)
    const value = cell.value
    if (value != null && typeof value === 'object' && value.nodeName) {
      const data = {}
      for (const [k, v] of Object.entries(value.attrs)) {
        if (k === 'label') rec.value = String(v)
        else if (k !== 'id') data[k] = String(v)
      }
      if (Object.keys(data).length) rec.data = JSON.stringify(data)
    } else if (value != null && value !== '') rec.value = String(value)
    if (cell.style) rec.style = cell.style
    if (cell.vertex) rec.vertex = 1
    if (cell.edge) rec.edge = 1
    if (cell.connectable === false) rec.connectable = 0
    if (cell.collapsed) rec.collapsed = 1
    if (cell.visible === false) rec.visible = 0
    const geo = cell.geometry
    if (geo) {
      const g = { x: round(geo.x), y: round(geo.y), width: round(geo.width), height: round(geo.height) }
      if (geo.relative) g.relative = 1
      if (geo.points?.length) g.points = geo.points.map((p) => [round(p.x), round(p.y)])
      if (geo.sourcePoint) g.sourcePoint = [round(geo.sourcePoint.x), round(geo.sourcePoint.y)]
      if (geo.targetPoint) g.targetPoint = [round(geo.targetPoint.x), round(geo.targetPoint.y)]
      if (geo.offset && (geo.offset.x || geo.offset.y)) g.offset = [round(geo.offset.x), round(geo.offset.y)]
      if (geo.alternateBounds) g.alternateBounds = [geo.alternateBounds.x, geo.alternateBounds.y, geo.alternateBounds.width, geo.alternateBounds.height].map(round)
      rec.geometry = JSON.stringify(g)
    }
    out.push(rec)
    for (const child of cell.children ?? []) visit(child, cell)
  }
  for (const cell of cells) visit(cell, null)
  // Terminals once every cell has an id.
  const all = []
  const collect = (cell) => {
    all.push(cell)
    for (const child of cell.children ?? []) collect(child)
  }
  cells.forEach(collect)
  all.forEach((cell, i) => {
    if (cell.source && ids.has(cell.source)) out[i].source = ids.get(cell.source)
    if (cell.target && ids.has(cell.target)) out[i].target = ids.get(cell.target)
  })
  return out
}

// Moves edges into the nearest common ancestor of their terminals, as the graph
// model does when cells are added (maxGraph fails when it has to do it itself).
function normalizeEdgeParents(records) {
  const byId = new Map(records.map((r) => [r.id, r]))
  const ancestors = (id) => {
    const out = []
    for (let r = byId.get(id); r; r = r.parent ? byId.get(r.parent) : null) out.push(r.id)
    return out
  }
  const origin = (id) => {
    let x = 0
    let y = 0
    for (let r = id ? byId.get(id) : null; r; r = r.parent ? byId.get(r.parent) : null) {
      const g = r.geometry ? JSON.parse(r.geometry) : null
      if (g && !g.relative && !r.edge) {
        x += g.x
        y += g.y
      }
    }
    return [x, y]
  }
  for (const rec of records) {
    if (!rec.edge || !rec.source || !rec.target) continue
    // Like mxGraphModel.updateEdgeParent: ports (relative geometry) stand for
    // their parent, then the nearest common ancestor.
    const port = (id) => {
      let r = byId.get(id)
      while (r && r.vertex && r.parent && r.geometry && JSON.parse(r.geometry).relative) r = byId.get(r.parent)
      return r?.id
    }
    const [source, target] = [port(rec.source), port(rec.target)]
    let common
    if (source === target) common = byId.get(source)?.parent
    else {
      const [a, b] = [ancestors(source), ancestors(target)]
      const [shallow, deep] = a.length <= b.length ? [a, b] : [b, a]
      const strict = new Set(deep.slice(1))
      common = shallow.find((id) => strict.has(id))
    }
    if ((common ?? undefined) === rec.parent) continue
    const [ox, oy] = origin(rec.parent)
    const [nx, ny] = origin(common)
    if (rec.geometry) {
      const g = JSON.parse(rec.geometry)
      const move = (p) => [round(p[0] + ox - nx), round(p[1] + oy - ny)]
      if (g.points) g.points = g.points.map(move)
      if (g.sourcePoint) g.sourcePoint = move(g.sourcePoint)
      if (g.targetPoint) g.targetPoint = move(g.targetPoint)
      rec.geometry = JSON.stringify(g)
    }
    if (common) rec.parent = common
    else delete rec.parent
  }
  return records
}

// A palette item (see PaletteItem in src/apps/diagram/palette.ts) from template records.
function toItem(records, width, height, title, tags) {
  if (!records.length) return null
  normalizeEdgeParents(records)
  const label = title || ''
  const item = { label }
  const first = records[0]
  const geo = first.geometry ? JSON.parse(first.geometry) : null
  const single = records.length === 1 && !first.source && !first.target && !first.data
  if (single && first.edge && geo && !geo.points && geo.sourcePoint?.[0] === 0 && geo.sourcePoint?.[1] === geo.height && geo.targetPoint?.[0] === geo.width && geo.targetPoint?.[1] === 0) {
    Object.assign(item, { style: first.style ?? '', width: geo.width, height: geo.height, edge: true })
  } else if (single && first.vertex && geo && !geo.relative && first.connectable !== 0 && !first.collapsed) {
    Object.assign(item, { style: first.style ?? '', width: geo.width || width, height: geo.height || height })
  } else {
    Object.assign(item, { style: first.style ?? '', width: Math.round(width), height: Math.round(height), cells: records })
  }
  if (!item.cells && first.value) item.value = first.value
  if (tags) {
    // Only words that are not already in the label.
    const known = new Set(label.toLowerCase().split(/\s+/))
    const extra = [...new Set(String(tags).toLowerCase().split(/\s+/))].filter((t) => t && !known.has(t))
    if (extra.length) item.tags = extra.join(' ')
  }
  return item
}

async function extractPalettes() {
  const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {}, trace() {} }, atob, btoa, setTimeout: () => 0, clearTimeout() {} })
  const run = (code, filename) => vm.runInContext(code, ctx, { filename })
  const resources = {}
  for (const line of (await text('resources/dia.txt')).split('\n')) {
    const eq = line.indexOf('=')
    if (eq > 0 && !line.startsWith('#')) resources[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
  }
  ctx.__resources = resources
  ctx.__decompress = decompress
  ctx.__stencils = (file) => stencilFiles.get(file)?.shapes ?? null
  run(`
    var window = this, self = this
    var Element = function () {}
    var urlParams = {}
    var STENCIL_PATH = 'stencils', GRAPH_IMAGE_PATH = 'img', IMAGE_PATH = 'images', SHAPES_PATH = 'shapes', STYLE_PATH = 'styles', RESOURCES_PATH = 'resources'
    function FakeElement(name) { this.nodeName = name; this.style = {}; this.childNodes = []; this.attrs = {} }
    FakeElement.prototype = {
      appendChild: function (c) { this.childNodes.push(c); return c },
      insertBefore: function (c) { this.childNodes.push(c); return c },
      removeChild: function (c) { return c },
      setAttribute: function (k, v) { this.attrs[k] = v },
      getAttribute: function (k) { return this.attrs[k] != null ? this.attrs[k] : null },
      hasAttribute: function (k) { return this.attrs[k] != null },
      removeAttribute: function (k) { delete this.attrs[k] },
      addEventListener: function () {}, removeEventListener: function () {},
      cloneNode: function () { var c = new FakeElement(this.nodeName); for (var k in this.attrs) c.attrs[k] = this.attrs[k]; return c },
      getElementsByTagName: function () { return [] }, querySelector: function () { return null }, querySelectorAll: function () { return [] }
    }
    var document = {
      createElement: function (n) { return new FakeElement(n) }, createElementNS: function (ns, n) { return new FakeElement(n) },
      createTextNode: function (t) { return { nodeValue: t } }, body: new FakeElement('body'), documentElement: new FakeElement('html'),
      addEventListener: function () {}, implementation: { createDocument: function () { return document } }
    }
    var navigator = { userAgent: '', platform: '', language: 'en', languages: ['en'], maxTouchPoints: 0 }
    var location = { href: 'https://localhost/', hostname: 'localhost', protocol: 'https:', search: '', hash: '', pathname: '/' }
    var localStorage = { getItem: function () { return null }, setItem: function () {} }
    var mxClient = { IS_SVG: true, NO_FO: false, IS_POINTER: false, IS_TOUCH: false, IS_FF: false, IS_IE: false, IS_IE11: false, IS_EDGE: false,
      IS_MAC: false, IS_IOS: false, IS_GC: false, IS_SF: false, IS_CHROMEAPP: false, IS_ANDROID: false, IS_QUIRKS: false, IS_VML: false,
      IS_LOCAL: false, language: 'en', languages: ['en'], defaultLanguage: 'en', basePath: '.', imageBasePath: 'images', include: function () {} }
    var mxResources = { resources: __resources, get: function (key, params, def) {
      var v = this.resources[key]
      if (v == null) v = def != null ? def : ''
      if (params) v = v.replace(/\\{(\\d+)\\}/g, function (m, i) { return params[i - 1] })
      return v
    } }
    var mxEvent = { addListener: function () {}, removeListener: function () {}, addGestureListeners: function () {}, consume: function () {} }
    var mxSettings = { settings: null, getLibraries: function () { return '' } }
  `, 'prelude.js')
  for (const name of ['util/mxObjectIdentity.js', 'util/mxPoint.js', 'util/mxRectangle.js', 'util/mxConstants.js', 'util/mxUtils.js', 'model/mxGeometry.js', 'model/mxCell.js']) {
    run(await text('mxgraph/src/' + name), name)
  }
  run(`
    mxUtils.createXmlDocument = function () { return { createElement: function (n) {
      return { nodeName: n, attrs: {}, setAttribute: function (k, v) { this.attrs[k] = v }, getAttribute: function (k) { return this.attrs[k] != null ? this.attrs[k] : null },
        hasAttribute: function (k) { return this.attrs[k] != null }, cloneNode: function () { var c = mxUtils.createXmlDocument().createElement(n); for (var k in this.attrs) c.attrs[k] = this.attrs[k]; return c } }
    } } }
    var Graph = { decompress: function (d) { return __decompress(d) }, zapGremlins: function (s) { return s }, sanitizeHtml: function (s) { return s },
      createSvgImage: function () { return { src: '' } }, cellStyles: [],
      encodeChildLayout: function (list) { return encodeURIComponent(JSON.stringify(list)) } }
    var Editor = { defaultTextStyle: 'text;html=1;whiteSpace=wrap;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;rounded=0;',
      currentTheme: '', isDarkMode: function () { return false }, prototype: {} }
    var EditorUi = function () {}
    var Menus = { layoutContainerEdgeStyle: 'html=1;rounded=1;curved=0;sourcePerimeterSpacing=0;targetPerimeterSpacing=0;startSize=6;endSize=6;' }
    var HoverIcons = function () {}
    var mxDragSource = function () {}
    var mxStencilRegistry = { stencils: {}, libraries: {}, getStencil: function () { return null },
      loadStencilSet: function (file, fn) {
        var shapes = __stencils(file)
        if (shapes && fn) for (var i = 0; i < shapes.length; i++) fn(shapes[i].pkg, shapes[i].name, shapes[i].name, shapes[i].w, shapes[i].h)
      } }
  `, 'shim.js')
  // Read the pinned release's layout definitions used by advanced templates.
  const menus = await text('js/diagramly/Menus.js')
  const layoutStart = menus.indexOf('Menus.flowModelOrder =')
  const layoutEnd = menus.indexOf('Menus.prototype.createHelpLink', layoutStart)
  if (layoutStart < 0 || layoutEnd < 0) throw new Error('Missing draw.io layout container definitions')
  run(menus.slice(layoutStart, layoutEnd), 'Menus-layouts.js')
  run(await text('js/grapheditor/Sidebar.js'), 'Sidebar.js')
  run(await text('js/diagramly/sidebar/Sidebar.js'), 'diagramly/Sidebar.js')
  for (const name of src.files.filter((n) => /^js\/diagramly\/sidebar\/Sidebar-.*\.js$/.test(n)).sort()) run(await text(name), name)

  // The recording sidebar.
  const graph = {
    appendFontSize: (style) => style,
    vertexFontSize: null,
    edgeFontSize: null,
    model: {},
    view: {},
    setLinkForCell: () => {},
    setAttributeForCell: (cell, name, value) => {
      if (!cell.value || typeof cell.value !== 'object') {
        const obj = ctx.mxUtils.createXmlDocument().createElement('UserObject')
        obj.setAttribute('label', cell.value ?? '')
        cell.value = obj
      }
      cell.value.setAttribute(name, value)
    },
    getCellGeometry: (cell) => cell.geometry,
    cloneCells: (cells) => cells.map((c) => c.clone()),
    getStylesheet: () => ({}),
  }
  const Sidebar = ctx.Sidebar
  const sb = Object.create(Sidebar.prototype)
  Object.assign(sb, {
    editorUi: { editor: { graph }, convertDataUri: (d) => d },
    graph,
    palettes: {},
    taglist: {},
    initialDefaultVertexStyle: {},
    initialDefaultEdgeStyle: {},
    ignoredStyles: [],
    currentSearchEntryLibrary: null,
  })
  const palettes = []
  const make = (cells, width, height, title) => ({ __item: true, records: cellsToRecords(cells ?? []), width, height, title })
  sb.addEntry = (tags, fn) => {
    fn.tags = tags
    return fn
  }
  sb.createItem = (cells, title, showLabel, showTitle, width, height) => make(cells, width, height, title)
  sb.createVertexTemplateFromCells = (cells, width, height, title) => make(cells, width, height, title)
  sb.createEdgeTemplateFromCells = (cells, width, height, title) => make(cells, width, height, title)
  sb.createVertexTemplateFromData = (data, width, height, title) => ({ __item: true, records: modelToRecords(decompress(data)), width, height, title })
  sb.setDeferredPaletteSize = () => {}
  sb.addSearchPalette = () => {}
  sb.addCustomEntries = () => {}
  sb.showEntries = () => {}
  sb.addPalette = (id, title, expanded, onInit) => {
    const items = []
    const content = { appendChild: (x) => (x && x.__item ? items.push(x) : null), style: {} }
    const palette = { id, title, raw: items, errors: 0 }
    palettes.push(palette)
    try {
      onInit?.call(sb, content, { style: {} })
    } catch (e) {
      palette.errors++
      palette.error = String(e)
    }
    return { style: {} }
  }
  sb.addPaletteFunctions = (id, title, expanded, fns) => {
    const palette = { id, title, raw: [], errors: 0 }
    palettes.push(palette)
    for (const fn of fns) {
      try {
        const item = fn()
        if (item && item.__item) {
          item.tags = fn.tags
          palette.raw.push(item)
        }
      } catch (e) {
        palette.errors++
        palette.error = String(e)
      }
    }
  }
  sb.addStencilPalette = function (id, title, stencilFile, style, ignore, onInit, scale, tags, customFns) {
    scale = scale ?? 1
    style = style ?? ''
    const fns = [...(customFns ?? [])]
    const shapes = stencilFiles.get(stencilFile)?.shapes
    if (!shapes) console.warn(`Missing stencil file ${stencilFile} (${id})`)
    for (const s of shapes ?? []) {
      if (ignore && ignore.includes(s.name)) continue
      const tmp = sb.getTagsForStencil(s.pkg, s.name)
      if (tags?.[s.name]) tmp.push(tags[s.name])
      fns.push(sb.createVertexTemplateEntry('shape=' + s.pkg + s.name.toLowerCase() + style, Math.round(s.w * scale), Math.round(s.h * scale), '', s.name.replace(/_/g, ' '), null, null, tmp.join(' ')))
    }
    sb.addPaletteFunctions(id, title, false, fns)
  }
  // A failing palette only loses its own items.
  for (const key of Object.keys(Sidebar.prototype)) {
    const fn = Sidebar.prototype[key]
    if (!/^add\w*Palette$/.test(key) || typeof fn !== 'function' || Object.hasOwn(sb, key)) continue
    sb[key] = function (...args) {
      try {
        return fn.apply(this, args)
      } catch (e) {
        palettes.push({ id: key, title: key, raw: [], errors: 1, error: String(e) })
      }
    }
  }
  sb.initPalettes()
  sb.updateEntries()
  const constants = Object.fromEntries(Object.entries(ctx.mxConstants).filter(([, v]) => v === null || typeof v !== 'object'))
  return { palettes, entries: sb.entries, configuration: Sidebar.prototype.configuration, constants }
}

const extracted = await extractPalettes()
let failed = 0
for (const p of extracted.palettes) {
  p.items = p.raw.map((r) => toItem(r.records, r.width, r.height, r.title, r.tags)).filter(Boolean)
  if (p.errors) {
    failed += p.errors
    console.log(`  ${p.id}: ${p.errors} failed (${p.error})`)
  }
}
console.log(`${extracted.palettes.length} palettes, ${extracted.palettes.reduce((n, p) => n + p.items.length, 0)} items, ${failed} failed`)

// Libraries the app already ships (src/apps/diagram/palette.ts).
const BUILT_IN = new Set(['general', 'flowchart', 'uml', 'er', 'basic'])
const byId = new Map(extracted.palettes.filter((p) => p.items.length).map((p) => [p.id, p]))
const groups = []
for (const group of extracted.entries) {
  const entries = []
  for (const entry of group.entries) {
    const config = extracted.configuration.find((c) => c.id === entry.id)
    if (!config) continue
    const ids = config.libs ? config.libs.map((lib) => (config.prefix ?? '') + lib) : [config.id]
    const libs = ids.filter((id) => !BUILT_IN.has(id) && byId.has(id)).map((id) => byId.get(id))
    if (!libs.length) continue
    const data = libs.map((p) => ({ id: p.id, name: p.title, items: p.items }))
    const json = JSON.stringify(data)
    write(`palettes/${entry.id}.json`, json)
    entries.push({ id: entry.id, title: entry.title, libraries: libs.map((p) => ({ id: p.id, name: p.title, count: p.items.length })), bytes: json.length })
  }
  if (entries.length) groups.push({ title: group.title, entries })
}
console.log(`${groups.reduce((n, g) => n + g.entries.length, 0)} entries in ${groups.length} groups`)

// ---------- Custom shape code ----------

const shapeSources = new Map()
for (const name of src.files.filter((n) => /^shapes\/.*\.js$/.test(n)).sort()) shapeSources.set(name, await text(name))

// draw.io's map from stencil basenames (mxgraph.<basename>.<name>) to files (diagramly/Editor.js).
const libraries = {}
for (const m of (await text('js/diagramly/Editor.js')).matchAll(/mxStencilRegistry\.libraries\[['"]([^'"]+)['"]\]\s*=\s*\[([^\]]*)\]/g)) {
  libraries[m[1]] = [...m[2].matchAll(/(SHAPES_PATH|STENCIL_PATH)\s*\+\s*['"]([^'"]+)['"]/g)].map((f) => (f[1] === 'SHAPES_PATH' ? 'shapes' : 'stencils') + f[2])
}

// Names registered by a shape file, recorded by running it against permissive stand-ins.
function recordShapeFile(code, name, externals) {
  const registered = { shapes: [], markers: [], styles: [] }
  const anything = () => {
    const children = new Map()
    const proxy = new Proxy(function () {}, {
      get(target, key) {
        if (key === Symbol.toPrimitive) return () => ''
        if (key === 'prototype') return target.prototype
        if (!children.has(key)) children.set(key, anything())
        return children.get(key)
      },
      apply: () => anything(),
      construct: () => anything(),
    })
    return proxy
  }
  const ctx = vm.createContext({ console: { log() {}, warn() {} }, Math, JSON })
  for (const ext of externals) ctx[ext] = anything()
  ctx.mxUtils = new Proxy({}, {
    get: (t, key) => key === 'extend' ? (ctor, sup) => {
      ctor.prototype = Object.create(sup.prototype ?? {})
      ctor.prototype.constructor = ctor
    } : anything(),
  })
  ctx.mxCellRenderer = new Proxy({}, { get: (t, key) => key === 'registerShape' ? (n) => registered.shapes.push(String(n)) : anything() })
  ctx.mxMarker = new Proxy({}, { get: (t, key) => key === 'addMarker' ? (n) => registered.markers.push(String(n)) : anything() })
  ctx.mxStyleRegistry = new Proxy({}, { get: (t, key) => key === 'putValue' ? (n) => registered.styles.push(String(n)) : anything() })
  ctx.window = ctx
  vm.runInContext(code, ctx, { filename: name })
  return registered
}

// draw.io defines mxgraph.basic.rect (used by the BPMN shapes) in its editor's
// Shapes.js; that block becomes a shape file of its own, loaded before mxBasic.js.
const RECT2 = 'shapes/grapheditor/mxBasicRect2.js'
{
  const lines = (await text('js/grapheditor/Shapes.js')).split('\n')
  const start = lines.findIndex((l) => /^\tfunction mxShapeBasicRect2\(/.test(l))
  const end = lines.findIndex((l) => l.includes('mxCellRenderer.registerShape(mxShapeBasicRect2.prototype.cst.RECT2'))
  if (start < 0 || end < start) throw new Error('mxShapeBasicRect2 not found in Shapes.js')
  shapeSources.set(RECT2, lines.slice(start, end + 1).map((l) => l.replace(/^\t/, '')).join('\n'))
  for (const files of Object.values(libraries)) {
    const i = files.indexOf('shapes/mxBasic.js')
    if (i >= 0) files.splice(i, 0, RECT2)
  }
}

const shapeInfo = {}
const skippedShapes = []
for (const [name, code] of shapeSources) {
  // Top-level declarations (draw.io writes them in column 0) are shared with later files.
  const defs = [...new Set([...code.matchAll(/^(?:function\s+|var\s+)([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]))]
  const refs = [...new Set(code.match(/\b(?:mx[A-Z]\w*|Graph|Editor|GRAPH_IMAGE_PATH|STENCIL_PATH|SHAPES_PATH|IMAGE_PATH)\b/g) ?? [])].filter((r) => !defs.includes(r))
  let registered
  try {
    registered = recordShapeFile(code, name, refs)
  } catch (e) {
    skippedShapes.push(`${name}: ${e.message}`)
    continue
  }
  // A classic script that hands the file's code to the compat layer (src/apps/diagram/shapes/compat.ts).
  const wrapped = `__drawioShapes(${JSON.stringify(name)},function(mx){\n` +
    (refs.length ? `var {${refs.join(',')}}=mx;\n` : '') +
    code + `\n;Object.assign(mx,{${defs.join(',')}})})\n`
  write(name, wrapped)
  shapeInfo[name] = registered
}

// Shape names whose files draw.io's basename lookup would not find.
const basename = (shape) => {
  const parts = shape.split('.')
  return parts[0] === 'mxgraph' && parts.length > 2 ? parts.slice(1, -1).join('/') : null
}
const shapeFilesByName = {}
for (const [file, reg] of Object.entries(shapeInfo)) {
  for (const shape of [...reg.shapes, ...reg.markers, ...reg.styles]) {
    const base = basename(shape)
    if (base && libraries[base]?.includes(file)) continue
    const lib = Object.entries(libraries).find(([, files]) => files.includes(file))
    shapeFilesByName[shape] = lib ? lib[1] : [file]
  }
}
console.log(`${Object.keys(shapeInfo).length} shape files, ${Object.values(shapeInfo).reduce((n, r) => n + r.shapes.length, 0)} shapes, ${Object.keys(shapeFilesByName).length} names outside the basename scheme`)
if (skippedShapes.length) console.log('Skipped shape files:\n  ' + skippedShapes.join('\n  '))

// ---------- Stencils, images, licenses, catalog ----------

for (const [name, { xml }] of stencilFiles) write(name, xml)
// mxGraph's constants for the shape files (see src/apps/diagram/shapes/compat.ts).
write('shapes/constants.json', JSON.stringify(extracted.constants))
let images = 0
for (const name of src.files.filter((n) => /^img\/(lib|clipart)\//.test(n))) {
  write(name, await src.read(name))
  images++
}
const license = await text('stencils/LICENSE')
write('LICENSE', license)
write('NOTICE', `Generated from draw.io ${VERSION} (https://github.com/jgraph/drawio) by scripts/build-diagram-libs.mjs.
Copyright (c) 2006-2025 JGraph Holdings Ltd / draw.io AG.
The code (shapes/**.js, the palettes recorded from js/diagramly/sidebar) is licensed under the Apache License 2.0.
The stencils (stencils/**) and images (img/**) are subject to the terms in LICENSE, which apply in addition.
`)

const catalog = {
  version: VERSION,
  // Also names the offline cache of these files (vite.config.ts).
  build: BUILD_ID,
  // "More shapes" groups; an entry's libraries are in palettes/<entry id>.json.
  groups,
  // draw.io's files per stencil basename (mxgraph.<basename>.<name>), in load order.
  libraries,
  // Other stencil files: stencils/<basename>.xml.
  stencils: [...stencilFiles.keys()].map((n) => n.slice('stencils/'.length, -'.xml'.length)),
  // Shape, marker and perimeter names outside the basename scheme.
  names: shapeFilesByName,
}
write('catalog.json', JSON.stringify(catalog))
writeFileSync(stamp, BUILD_ID)
console.log(`Built draw.io ${VERSION} libraries into public/diagram-libs (${stencilFiles.size} stencil files, ${images} images)`)
