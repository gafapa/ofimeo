// Animations and transitions for exported PowerPoint files. pptxgenjs does not
// write them, so they are added to its slide XML afterwards: a <p:transition>
// and a <p:timing> tree with PowerPoint's preset effects (entrance, emphasis,
// exit) targeting the shapes each animated object became.

import JSZip from 'jszip'
import { timeline, type Animation, type Direction } from '../animations'

// Object indexes (in the order pptxgenjs added them) → shape ids, read from the slide XML.
export function shapeIds(xml: string): { ids: number[]; text: Set<number> } {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const tree = doc.getElementsByTagNameNS('*', 'spTree')[0]
  const ids: number[] = []
  const text = new Set<number>()
  for (const child of tree ? [...tree.children] : []) {
    if (!['sp', 'pic', 'graphicFrame', 'cxnSp', 'grpSp'].includes(child.localName)) continue
    const id = Number(child.getElementsByTagNameNS('*', 'cNvPr')[0]?.getAttribute('id'))
    ids.push(id)
    if (child.localName === 'sp' && child.getElementsByTagNameNS('*', 'txBody')[0]) text.add(id)
  }
  return { ids, text }
}

// Adds transitions and animations to the slides of a pptxgenjs file; `objects` maps
// each slide's cells to the indexes of the objects added for them.
// The theme is named after the app's theme ("Ofimeo: ocean"), so importing the file
// back selects it again.
export async function addPptxAnimations(blob: Blob, slides: { objects: Map<string, number[]>; animations: Animation[]; transition?: string; transitionDuration?: number }[], themeId?: string): Promise<Blob> {
  if (!themeId && !slides.some((s) => s.animations.length || (s.transition && s.transition !== 'none'))) return blob
  const zip = await JSZip.loadAsync(blob)
  if (themeId && /^\w+$/.test(themeId)) {
    for (const path of Object.keys(zip.files).filter((p) => /^ppt\/theme\/theme\d+\.xml$/.test(p))) {
      const xml = await zip.file(path)!.async('text')
      zip.file(path, xml.replace(/(<a:theme\b[^>]*?\bname=")[^"]*"/, `$1Ofimeo: ${themeId}"`))
    }
  }
  for (const [i, slide] of slides.entries()) {
    const path = `ppt/slides/slide${i + 1}.xml`
    const file = zip.file(path)
    if (!file) continue
    let xml = await file.async('text')
    const { ids, text } = shapeIds(xml)
    const shapes = new Map<string, number[]>()
    for (const [cell, indexes] of slide.objects) shapes.set(cell, indexes.map((n) => ids[n]).filter((id) => Number.isFinite(id)))
    const extra = transitionXml(slide.transition, slide.transitionDuration) + timingXml(slide.animations, shapes, text)
    if (!extra) continue
    xml = xml.replace(/<\/p:sld>\s*$/, `${extra}</p:sld>`)
    zip.file(path, xml)
  }
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
}

function transitionXml(type: string | undefined, duration = 500): string {
  if (!type || type === 'none') return ''
  const spd = duration <= 500 ? 'fast' : duration < 1000 ? 'med' : 'slow'
  const inner = type === 'fade' ? '<p:fade/>' : type === 'push' ? '<p:push dir="l"/>' : type === 'wipe' ? '<p:wipe dir="r"/>' : ''
  return inner ? `<p:transition spd="${spd}">${inner}</p:transition>` : ''
}

const FLY_SUBTYPE: Record<Direction, number> = { left: 8, right: 2, top: 1, bottom: 4 }
const WIPE_FILTER: Record<Direction, string> = { left: 'wipe(left)', right: 'wipe(right)', top: 'wipe(down)', bottom: 'wipe(up)' }

function timingXml(anims: Animation[], shapes: Map<string, number[]>, text: Set<number>): string {
  const tl = timeline(anims.filter((a) => shapes.get(a.cell)?.length), new Set(shapes.keys()))
  if (!tl.steps.length) return ''
  let id = 2
  const next = () => ++id
  const steps: string[] = []
  const built = new Set<number>()
  tl.steps.forEach((step, si) => {
    // Ids in document order.
    const stepId = next()
    const effects: string[] = []
    step.effects.forEach(({ anim, start }, ei) => {
      const nodeType = ei === 0 ? (anim.trigger === 'after' ? 'afterEffect' : anim.trigger === 'with' ? 'withEffect' : 'clickEffect') : anim.trigger === 'after' ? 'afterEffect' : 'withEffect'
      for (const spid of shapes.get(anim.cell) ?? []) {
        if (anim.kind !== 'emphasis' && text.has(spid)) built.add(spid)
        effects.push(`<p:par><p:cTn id="${next()}" fill="hold"><p:stCondLst><p:cond delay="${Math.round(start)}"/></p:stCondLst><p:childTnLst>${effectXml(anim, spid, nodeType, next, text.has(spid))}</p:childTnLst></p:cTn></p:par>`)
      }
    })
    const cond = si === 0 && tl.auto ? '<p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>' : '<p:cond delay="indefinite"/>'
    steps.push(`<p:par><p:cTn id="${stepId}" fill="hold"><p:stCondLst>${cond}</p:stCondLst><p:childTnLst>${effects.join('')}</p:childTnLst></p:cTn></p:par>`)
  })
  const bld = built.size ? `<p:bldLst>${[...built].map((spid) => `<p:bldP spid="${spid}" grpId="0"/>`).join('')}</p:bldLst>` : ''
  return (
    '<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>' +
    `<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${steps.join('')}</p:childTnLst></p:cTn>` +
    '<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>' +
    '<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>' +
    `</p:childTnLst></p:cTn></p:par></p:tnLst>${bld}</p:timing>`
  )
}

function effectXml(a: Animation, spid: number, nodeType: string, next: () => number, isText: boolean): string {
  const outer = next()
  const dur = Math.max(1, Math.round(a.duration))
  const tgt = `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl>`
  const set = (value: 'visible' | 'hidden', delay = 0) =>
    `<p:set><p:cBhvr><p:cTn id="${next()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="${delay}"/></p:stCondLst></p:cTn>${tgt}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="${value}"/></p:to></p:set>`
  const animEffect = (transition: 'in' | 'out', filter: string) => `<p:animEffect transition="${transition}" filter="${filter}"><p:cBhvr><p:cTn id="${next()}" dur="${dur}"/>${tgt}</p:cBhvr></p:animEffect>`
  const prop = (attr: string, from: string, to: string) =>
    `<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="${next()}" dur="${dur}" fill="hold"/>${tgt}<p:attrNameLst><p:attrName>${attr}</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="${from}"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="${to}"/></p:val></p:tav></p:tavLst></p:anim>`
  const off: Record<Direction, [string, string]> = {
    left: ['ppt_x', '0-#ppt_w/2'],
    right: ['ppt_x', '1+#ppt_w/2'],
    top: ['ppt_y', '0-#ppt_h/2'],
    bottom: ['ppt_y', '1+#ppt_h/2'],
  }
  let presetID = 1
  let subtype = 0
  let body = ''
  const cls = a.kind === 'entrance' ? 'entr' : a.kind === 'exit' ? 'exit' : 'emph'
  if (a.kind === 'emphasis') {
    if (a.effect === 'spin') {
      presetID = 8
      body = `<p:animRot by="21600000"><p:cBhvr><p:cTn id="${next()}" dur="${dur}" fill="hold"/>${tgt}<p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst></p:cBhvr></p:animRot>`
    } else if (a.effect === 'teeter') {
      presetID = 32
      body = `<p:animRot by="360000"><p:cBhvr><p:cTn id="${next()}" dur="${Math.max(1, Math.round(dur / 4))}" autoRev="1" repeatCount="2000" fill="hold"/>${tgt}<p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst></p:cBhvr></p:animRot>`
    } else {
      presetID = 6
      body = `<p:animScale><p:cBhvr><p:cTn id="${next()}" dur="${Math.max(1, Math.round(dur / 2))}" autoRev="1" fill="hold"/>${tgt}</p:cBhvr><p:by x="112000" y="112000"/></p:animScale>`
    }
  } else {
    const entering = a.kind === 'entrance'
    const [attr, outside] = off[a.direction] ?? off.left
    const home = attr === 'ppt_x' ? '#ppt_x' : '#ppt_y'
    switch (a.effect) {
      case 'appear':
        presetID = 1
        body = entering ? set('visible') : set('hidden')
        break
      case 'fade':
        presetID = 10
        body = entering ? set('visible') + animEffect('in', 'fade') : animEffect('out', 'fade') + set('hidden', dur - 1)
        break
      case 'fly':
        presetID = 2
        subtype = FLY_SUBTYPE[a.direction] ?? 8
        body = entering
          ? set('visible') + prop(attr, outside, home) + prop(attr === 'ppt_x' ? 'ppt_y' : 'ppt_x', attr === 'ppt_x' ? '#ppt_y' : '#ppt_x', attr === 'ppt_x' ? '#ppt_y' : '#ppt_x')
          : prop(attr, home, outside) + set('hidden', dur - 1)
        break
      case 'zoom':
        presetID = 53
        subtype = 16
        body = entering
          ? set('visible') + prop('ppt_w', '0', '#ppt_w') + prop('ppt_h', '0', '#ppt_h') + animEffect('in', 'fade')
          : prop('ppt_w', '#ppt_w', '0') + prop('ppt_h', '#ppt_h', '0') + animEffect('out', 'fade') + set('hidden', dur - 1)
        break
      case 'wipe':
        presetID = 22
        subtype = FLY_SUBTYPE[a.direction] ?? 8
        body = entering ? set('visible') + animEffect('in', WIPE_FILTER[a.direction] ?? 'wipe(left)') : animEffect('out', WIPE_FILTER[a.direction] ?? 'wipe(left)') + set('hidden', dur - 1)
        break
      default:
        body = set(entering ? 'visible' : 'hidden')
    }
  }
  const grp = isText && a.kind !== 'emphasis' ? ' grpId="0"' : ''
  return `<p:par><p:cTn id="${outer}" presetID="${presetID}" presetClass="${cls}" presetSubtype="${subtype}" fill="hold"${grp} nodeType="${nodeType}"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${body}</p:childTnLst></p:cTn></p:par>`
}
