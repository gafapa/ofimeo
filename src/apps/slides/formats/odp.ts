// OpenDocument presentation (.odp) export: text boxes and basic shapes as
// editable custom shapes, lines with arrows, images, tables as grids of boxes,
// speaker notes. Built directly as XML in a zip.

import JSZip from 'jszip'
import type { PresentationData } from '../model'
import type { SlideRenderer } from '../render'
import { gradientPng, slideContents, toPng, type Paragraph, type Run, type SlideElement, type TableElement, type TextElement } from './elements'
import { timeline, type Animation, type Direction } from '../animations'

const inch = (px: number) => `${(px / 96).toFixed(4)}in`
const pt = (px: number) => `${Math.round(px * 0.75 * 10) / 10}pt`

const GEOMETRY: Record<TextElement['geom'], string> = {
  rect: 'rectangle',
  roundRect: 'round-rectangle',
  ellipse: 'ellipse',
  triangle: 'isosceles-triangle',
  diamond: 'diamond',
  hexagon: 'hexagon',
  parallelogram: 'parallelogram',
  cloud: 'cloud',
}

class Styles {
  private readonly map = new Map<string, string>()
  readonly xml: string[] = []
  // Returns the name of an automatic style with these properties (deduplicated).
  get(family: 'graphic' | 'paragraph' | 'text' | 'drawing-page', props: string): string {
    const key = `${family}|${props}`
    let name = this.map.get(key)
    if (!name) {
      name = `${{ graphic: 'gr', paragraph: 'P', text: 'T', 'drawing-page': 'dp' }[family]}${this.map.size + 1}`
      this.map.set(key, name)
      this.xml.push(`<style:style style:name="${name}" style:family="${family}">${props}</style:style>`)
    }
    return name
  }
}

export async function exportOdp(pres: PresentationData, renderer: SlideRenderer): Promise<Blob> {
  const zip = new JSZip()
  zip.file('mimetype', 'application/vnd.oasis.opendocument.presentation', { compression: 'STORE' })
  const styles = new Styles()
  const pictures: string[] = []
  const addPicture = (dataUrl: string) => {
    const m = /^data:image\/(png|jpeg|jpg|gif)[^,]*;base64,(.*)$/.exec(dataUrl)
    const ext = m ? (m[1] === 'jpeg' ? 'jpg' : m[1]) : 'png'
    const name = `Pictures/image${pictures.length + 1}.${ext}`
    zip.file(name, m ? m[2] : dataUrl.split(',')[1] ?? '', { base64: true })
    pictures.push(name)
    return name
  }

  const pages: string[] = []
  let shapeId = 0
  const contents = await slideContents(pres, renderer)
  for (const [index, content] of contents.entries()) {
    const bg = content.background
    const parts: string[] = []
    const transition = transitionAttrs(content.slide.transition, content.slide.transitionDuration)
    const pageStyle = styles.get(
      'drawing-page',
      Array.isArray(bg)
        ? `<style:drawing-page-properties draw:fill="none" presentation:background-visible="true" presentation:background-objects-visible="true"${transition}/>`
        : `<style:drawing-page-properties draw:fill="solid" draw:fill-color="${bg}" presentation:background-visible="true" presentation:background-objects-visible="true"${transition}/>`,
    )
    if (Array.isArray(bg)) {
      const href = addPicture(gradientPng(bg, pres.width, pres.height))
      parts.push(imageFrame(styles, href, 0, 0, pres.width, pres.height, 0))
    }
    // Shapes of animated objects get ids for the animation targets.
    const animated = new Set((content.slide.animations ?? []).map((a) => a.cell))
    const targets = new Map<string, string[]>()
    for (const e of content.elements) {
      let xml = await element(styles, e, addPicture)
      if (e.cell && animated.has(e.cell)) {
        xml = xml.replace(/<(draw:custom-shape|draw:frame|draw:line)\b/g, (m) => {
          const id = `anim${++shapeId}`
          targets.set(e.cell!, [...(targets.get(e.cell!) ?? []), id])
          return `${m} draw:id="${id}" xml:id="${id}"`
        })
      }
      parts.push(xml)
    }
    parts.push(animationsXml(content.slide.animations ?? [], targets))
    const notes = content.slide.notes
      ? `<presentation:notes><draw:frame presentation:class="notes" svg:x="0.8in" svg:y="5in" svg:width="6.9in" svg:height="4in"><draw:text-box>${content.slide.notes
          .split('\n')
          .map((l) => `<text:p>${esc(l)}</text:p>`)
          .join('')}</draw:text-box></draw:frame></presentation:notes>`
      : ''
    pages.push(`<draw:page draw:name="${esc(content.slide.name || `Slide ${index + 1}`)}" draw:style-name="${pageStyle}" draw:master-page-name="Default">${parts.join('')}${notes}</draw:page>`)
  }

  const ns =
    'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" ' +
    'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" ' +
    'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" ' +
    'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0" ' +
    'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:anim="urn:oasis:names:tc:opendocument:xmlns:animation:1.0" ' +
    'xmlns:smil="urn:oasis:names:tc:opendocument:xmlns:smil-compatible:1.0" office:version="1.3"'
  const lists =
    '<text:list-style style:name="LB"><text:list-level-style-bullet text:level="1" text:bullet-char="•"><style:list-level-properties text:space-before="0in" text:min-label-width="0.3in"/></text:list-level-style-bullet></text:list-style>' +
    '<text:list-style style:name="LN"><text:list-level-style-number text:level="1" style:num-format="1" style:num-suffix="."><style:list-level-properties text:space-before="0in" text:min-label-width="0.35in"/></text:list-level-style-number></text:list-style>'
  zip.file(
    'content.xml',
    `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${ns}><office:automatic-styles>${styles.xml.join('')}${lists}</office:automatic-styles><office:body><office:presentation>${pages.join('')}</office:presentation></office:body></office:document-content>`,
  )
  zip.file(
    'styles.xml',
    `<?xml version="1.0" encoding="UTF-8"?><office:document-styles ${ns}><office:styles>` +
      '<draw:marker draw:name="Arrow" svg:viewBox="0 0 20 30" svg:d="M10 0l-10 30h20z"/>' +
      '<draw:marker draw:name="Circle" svg:viewBox="0 0 1131 1131" svg:d="M462 1118l-102-29-102-51-93-72-72-93-51-102-29-102-13-105 13-102 29-106 51-102 72-89 93-72 102-50 102-34 106-9 101 9 106 34 98 50 93 72 72 89 51 102 29 106 13 102-13 105-29 102-51 102-72 93-93 72-98 51-106 29-101 13z"/>' +
      '<draw:marker draw:name="Square_20_45" svg:viewBox="0 0 1131 1131" svg:d="M0 564l564 567 567-567-567-564z"/>' +
      `</office:styles><office:automatic-styles><style:page-layout style:name="PM1"><style:page-layout-properties fo:margin-top="0in" fo:margin-bottom="0in" fo:margin-left="0in" fo:margin-right="0in" fo:page-width="${inch(pres.width)}" fo:page-height="${inch(pres.height)}" style:print-orientation="landscape"/></style:page-layout></office:automatic-styles>` +
      '<office:master-styles><style:master-page style:name="Default" style:page-layout-name="PM1"/></office:master-styles></office:document-styles>',
  )
  zip.file(
    'meta.xml',
    `<?xml version="1.0" encoding="UTF-8"?><office:document-meta ${ns} xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"><office:meta><meta:generator>Ofimeo</meta:generator><meta:user-defined meta:name="OfimeoTheme">${esc(pres.theme.id)}</meta:user-defined></office:meta></office:document-meta>`,
  )
  zip.file(
    'META-INF/manifest.xml',
    '<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">' +
      '<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.presentation"/>' +
      '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>' +
      '<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>' +
      '<manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>' +
      pictures.map((p) => `<manifest:file-entry manifest:full-path="${p}" manifest:media-type="image/${p.endsWith('.jpg') ? 'jpeg' : p.split('.').pop()}"/>`).join('') +
      '</manifest:manifest>',
  )
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.oasis.opendocument.presentation' })
}

// Position attributes, with rotation about the center (draw.io rotates clockwise, in degrees).
function placement(x: number, y: number, w: number, h: number, rotation: number): string {
  const size = `svg:width="${inch(w)}" svg:height="${inch(h)}"`
  if (!rotation) return `svg:x="${inch(x)}" svg:y="${inch(y)}" ${size}`
  const a = (-rotation * Math.PI) / 180
  // The top-left corner after rotating the box about its top-left, then moved so the centers match.
  const cx = x + w / 2
  const cy = y + h / 2
  const rx = (w / 2) * Math.cos(a) + (h / 2) * Math.sin(a)
  const ry = -(w / 2) * Math.sin(a) + (h / 2) * Math.cos(a)
  return `${size} draw:transform="rotate (${a.toFixed(6)}) translate (${inch(cx - rx)} ${inch(cy - ry)})"`
}

function imageFrame(styles: Styles, href: string, x: number, y: number, w: number, h: number, rotation: number): string {
  const style = styles.get('graphic', '<style:graphic-properties draw:stroke="none" draw:fill="none"/>')
  return `<draw:frame draw:style-name="${style}" ${placement(x, y, w, h, rotation)}><draw:image xlink:href="${href}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>`
}

async function element(styles: Styles, e: SlideElement, addPicture: (data: string) => string): Promise<string> {
  if (e.kind === 'image') return imageFrame(styles, addPicture(await toPng(e.data, e.w, e.h)), e.x, e.y, e.w, e.h, e.rotation)
  if (e.kind === 'line') {
    const dash = e.dash === 'solid' ? 'solid' : 'dash'
    const out: string[] = []
    for (let i = 0; i < e.points.length - 1; i++) {
      const [x1, y1] = e.points[i]
      const [x2, y2] = e.points[i + 1]
      const marker = (arrow: string, end: 'start' | 'end') =>
        arrow === 'none' ? '' : ` draw:marker-${end}="${arrow === 'oval' ? 'Circle' : arrow === 'diamond' ? 'Square_20_45' : 'Arrow'}" draw:marker-${end}-width="${inch(Math.max(8, e.strokeWidth * 5))}"`
      const props =
        `<style:graphic-properties draw:stroke="${dash}" svg:stroke-color="${e.stroke}" svg:stroke-width="${pt(e.strokeWidth)}"` +
        (i === 0 ? marker(e.startArrow, 'start') : '') +
        (i === e.points.length - 2 ? marker(e.endArrow, 'end') : '') +
        '/>'
      out.push(`<draw:line draw:style-name="${styles.get('graphic', props)}" svg:x1="${inch(x1)}" svg:y1="${inch(y1)}" svg:x2="${inch(x2)}" svg:y2="${inch(y2)}"/>`)
    }
    return out.join('')
  }
  if (e.kind === 'table') return table(styles, e)
  return shape(styles, e)
}

function shape(styles: Styles, e: TextElement): string {
  const [pt_, pr, pb, pl] = e.padding
  const fill = e.fill ? `draw:fill="solid" draw:fill-color="${e.fill}"${e.fillOpacity < 1 ? ` draw:opacity="${Math.round(e.fillOpacity * 100)}%"` : ''}` : 'draw:fill="none"'
  const stroke = e.stroke ? `draw:stroke="${e.dash === 'solid' ? 'solid' : 'dash'}" svg:stroke-color="${e.stroke}" svg:stroke-width="${pt(e.strokeWidth)}"` : 'draw:stroke="none"'
  const props =
    `<style:graphic-properties ${fill} ${stroke} draw:textarea-vertical-align="${e.valign}" draw:textarea-horizontal-align="justify" ` +
    `fo:padding-top="${inch(pt_)}" fo:padding-right="${inch(pr)}" fo:padding-bottom="${inch(pb)}" fo:padding-left="${inch(pl)}" ` +
    `draw:auto-grow-height="false" draw:auto-grow-width="false" fo:wrap-option="wrap" draw:shadow="hidden"/>` +
    `<style:paragraph-properties fo:text-align="${alignOf(e.align)}"/>`
  const style = styles.get('graphic', props)
  return `<draw:custom-shape draw:style-name="${style}" ${placement(e.x, e.y, e.w, e.h, e.rotation)}>${paragraphs(styles, e.paragraphs, e.align)}<draw:enhanced-geometry svg:viewBox="0 0 21600 21600" draw:type="${GEOMETRY[e.geom]}"/></draw:custom-shape>`
}

function table(styles: Styles, e: TableElement): string {
  const out: string[] = []
  let y = e.y
  e.rows.forEach((row, r) => {
    let x = e.x
    row.forEach((cell, c) => {
      out.push(
        shape(styles, {
          kind: 'text', x, y, w: e.colWidths[c], h: e.rowHeights[r], rotation: 0, geom: 'rect', fill: cell.fill, fillOpacity: 1,
          stroke: e.border, strokeWidth: 1, dash: 'solid', paragraphs: cell.paragraphs, align: cell.align, valign: cell.valign, padding: [4, 4, 4, 4], base: cell.base,
        }),
      )
      x += e.colWidths[c]
    })
    y += e.rowHeights[r]
  })
  return out.join('')
}

function alignOf(align: string | undefined): string {
  return align === 'center' ? 'center' : align === 'right' ? 'end' : align === 'justify' ? 'justify' : 'start'
}

function paragraphs(styles: Styles, list: Paragraph[], align: string): string {
  const out: string[] = []
  let open: 'bullet' | 'number' | undefined
  for (const p of list) {
    if (p.bullet !== open) {
      if (open) out.push('</text:list>')
      if (p.bullet) out.push(`<text:list text:style-name="${p.bullet === 'number' ? 'LN' : 'LB'}">`)
      open = p.bullet
    }
    const pStyle = styles.get('paragraph', `<style:paragraph-properties fo:text-align="${alignOf(p.align ?? align)}"/>`)
    const body = `<text:p text:style-name="${pStyle}">${p.runs.map((r) => span(styles, r)).join('')}</text:p>`
    out.push(p.bullet ? `<text:list-item>${body}</text:list-item>` : body)
  }
  if (open) out.push('</text:list>')
  return out.join('')
}

function span(styles: Styles, r: Run): string {
  const props =
    '<style:text-properties' +
    (r.bold ? ' fo:font-weight="bold"' : '') +
    (r.italic ? ' fo:font-style="italic"' : '') +
    (r.underline ? ' style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"' : '') +
    (r.strike ? ' style:text-line-through-style="solid"' : '') +
    (r.color ? ` fo:color="${r.color}"` : '') +
    (r.size ? ` fo:font-size="${pt(r.size)}"` : '') +
    (r.font ? ` fo:font-family="'${esc(r.font)}'"` : '') +
    '/>'
  const text = esc(r.text).replace(/ {2,}/g, (m) => ` <text:s text:c="${m.length - 1}"/>`)
  return `<text:span text:style-name="${styles.get('text', props)}">${text}</text:span>`
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

// ---------- Animations and transitions ----------

function transitionAttrs(type: string | undefined, duration = 500): string {
  if (!type || type === 'none') return ''
  const [t, sub] = type === 'fade' ? ['fade', 'crossfade'] : type === 'push' ? ['pushWipe', 'fromRight'] : type === 'wipe' ? ['barWipe', 'leftToRight'] : ['', '']
  if (!t) return ''
  const speed = duration <= 500 ? 'fast' : duration < 1000 ? 'medium' : 'slow'
  return ` smil:type="${t}" smil:subtype="${sub}" smil:dur="${duration / 1000}s" presentation:transition-speed="${speed}"`
}

const secs = (ms: number) => `${Math.round(ms) / 1000}s`
const FLY: Record<Direction, [string, string, string]> = {
  left: ['from-left', 'x', '0-width/2'],
  right: ['from-right', 'x', '1+width/2'],
  top: ['from-top', 'y', '0-height/2'],
  bottom: ['from-bottom', 'y', '1+height/2'],
}
const WIPE: Record<Direction, [string, string, string]> = {
  left: ['from-left', 'barWipe', 'leftToRight'],
  right: ['from-right', 'barWipe', 'leftToRight'],
  top: ['from-top', 'barWipe', 'topToBottom'],
  bottom: ['from-bottom', 'barWipe', 'topToBottom'],
}

// The page's main sequence of effects (LibreOffice Impress presets).
function animationsXml(anims: Animation[], targets: Map<string, string[]>): string {
  const tl = timeline(anims, new Set(targets.keys()))
  if (!tl.steps.length) return ''
  const steps = tl.steps.map((step, si) => {
    const effects = step.effects.map(({ anim, start }, ei) => {
      const nodeType = ei === 0 && anim.trigger === 'click' ? 'on-click' : anim.trigger === 'after' ? 'after-previous' : 'with-previous'
      return (targets.get(anim.cell) ?? []).map((id) => effect(anim, id, start, nodeType)).join('')
    })
    const begin = si === 0 && tl.auto ? '0s' : 'next'
    return `<anim:par smil:begin="${begin}"><anim:par smil:begin="0s">${effects.join('')}</anim:par></anim:par>`
  })
  return `<anim:par presentation:node-type="timing-root"><anim:seq presentation:node-type="main-sequence">${steps.join('')}</anim:seq></anim:par>`
}

function effect(a: Animation, id: string, start: number, nodeType: string): string {
  const dur = secs(Math.max(1, a.duration))
  const set = (to: 'visible' | 'hidden', begin = '0s') => `<anim:set smil:begin="${begin}" smil:dur="0.001s" smil:fill="hold" smil:targetElement="${id}" smil:attributeName="visibility" smil:to="${to}"/>`
  const filter = (type: string, subtype: string, out = false) => `<anim:transitionFilter smil:dur="${dur}" smil:targetElement="${id}" smil:type="${type}" smil:subtype="${subtype}"${out ? ' smil:mode="out"' : ''}/>`
  const move = (attr: string, from: string, to: string) => `<anim:animate smil:fill="hold" smil:targetElement="${id}" smil:attributeName="${attr}" smil:values="${from};${to}" smil:keyTimes="0;1" presentation:additive="base" smil:dur="${dur}"/>`
  let preset = ''
  let sub = ''
  let body = ''
  const cls = a.kind
  if (a.kind === 'emphasis') {
    if (a.effect === 'spin') {
      preset = 'ooo-emphasis-spin'
      body = `<anim:animateTransform smil:dur="${dur}" smil:fill="hold" smil:targetElement="${id}" smil:by="360" svg:type="rotate"/>`
    } else if (a.effect === 'teeter') {
      preset = 'ooo-emphasis-teeter'
      body = `<anim:animateTransform smil:dur="${dur}" smil:fill="hold" smil:targetElement="${id}" smil:values="0;6;-6;6;-6;0" smil:keyTimes="0;0.2;0.4;0.6;0.8;1" svg:type="rotate"/>`
    } else {
      preset = 'ooo-emphasis-grow-and-shrink'
      body = `<anim:animateTransform smil:dur="${secs(Math.max(1, a.duration / 2))}" smil:autoReverse="true" smil:fill="hold" smil:targetElement="${id}" smil:to="1.12,1.12" svg:type="scale"/>`
    }
  } else {
    const entering = a.kind === 'entrance'
    const kind = entering ? 'entrance' : 'exit'
    const hideAt = secs(Math.max(0, a.duration - 1))
    switch (a.effect) {
      case 'appear':
        preset = entering ? 'ooo-entrance-appear' : 'ooo-exit-disappear'
        body = set(entering ? 'visible' : 'hidden')
        break
      case 'fade':
        preset = `ooo-${kind}-fade-${entering ? 'in' : 'out'}`
        body = entering ? set('visible') + filter('fade', 'crossfade') : filter('fade', 'crossfade', true) + set('hidden', hideAt)
        break
      case 'fly': {
        const [subtype, attr, outside] = FLY[a.direction] ?? FLY.left
        preset = `ooo-${kind}-fly-${entering ? 'in' : 'out'}`
        sub = subtype
        body = entering ? set('visible') + move(attr, outside, attr) : move(attr, attr, outside) + set('hidden', hideAt)
        break
      }
      case 'zoom':
        preset = entering ? 'ooo-entrance-zoom' : 'ooo-exit-zoom'
        sub = 'in'
        body = entering
          ? set('visible') + move('width', '0', 'width') + move('height', '0', 'height') + filter('fade', 'crossfade')
          : move('width', 'width', '0') + move('height', 'height', '0') + filter('fade', 'crossfade', true) + set('hidden', hideAt)
        break
      case 'wipe': {
        const [subtype, type, subType] = WIPE[a.direction] ?? WIPE.left
        preset = `ooo-${kind}-wipe`
        sub = subtype
        const reverse = a.direction === 'right' || a.direction === 'bottom' ? ' smil:direction="reverse"' : ''
        body = entering
          ? set('visible') + filter(type, subType).replace('/>', `${reverse}/>`)
          : filter(type, subType, true).replace('/>', `${reverse}/>`) + set('hidden', hideAt)
        break
      }
      default:
        body = set(entering ? 'visible' : 'hidden')
    }
  }
  return `<anim:par smil:begin="${secs(start)}" smil:fill="hold" presentation:node-type="${nodeType}" presentation:preset-class="${cls}" presentation:preset-id="${preset}"${sub ? ` presentation:preset-sub-type="${sub}"` : ''}>${body}</anim:par>`
}
