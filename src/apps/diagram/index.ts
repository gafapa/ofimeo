// Entry point of the diagram editor, loaded on demand by the app registry.

import type { Session, SubmitFile } from '../../core/session'
import { createLocalDocument } from '../../core/session'
import { DIAGRAM_ACCEPT, mountDiagram } from './app'
import { renderSvg, svgToPng, svgToString } from './export'
import { buildCells, createGraph } from './graph'
import { DiagramSync } from './sync'
import { t } from '../../core/i18n'
import './diagram.css'

export const accept = DIAGRAM_ACCEPT

export function mount(session: Session): void {
  mountDiagram(session, document.getElementById('root')!)
}

// Imports a draw.io file into a new local document; returns its path.
export async function importFile(file: File): Promise<string> {
  let pages
  if (/\.vs[dts]x$/i.test(file.name)) {
    const { parseVsdx } = await import('./formats/vsdx')
    pages = await parseVsdx(await file.arrayBuffer())
  } else {
    const { parseDrawio } = await import('./formats/drawio')
    pages = await parseDrawio(await file.text())
  }
  const title = file.name.replace(/\.(drawio|xml|vsdx|vssx|vstx)$/i, '')
  return createLocalDocument('diagram', title, (doc) => DiagramSync.setPages(doc, pages))
}

// "Hand in": the .drawio file plus a PNG and an SVG of every page, rendered
// from the shared state in an off-screen graph.
export async function submitFiles(session: Session): Promise<SubmitFile[]> {
  const { serializeDrawio, orderCells } = await import('./formats/drawio')
  const pages = DiagramSync.readPages(session.doc)
  const title = String(session.doc.getMap('meta').get('title') || t('Untitled diagram'))
  const files: SubmitFile[] = [{ name: `${title}.drawio`, blob: new Blob([serializeDrawio(pages)], { type: 'application/vnd.jgraph.mxfile' }) }]
  for (const [i, svg] of (await renderPages(pages.map((p) => orderCells(p.cells)), pages.map((p) => (p.background && p.background !== 'none' ? p.background : '#ffffff')))).entries()) {
    const name = pages.length > 1 ? `${title} - ${i + 1} ${pages[i].name}` : title
    files.push({ name: `${name}.svg`, blob: new Blob([svgToString(svg)], { type: 'image/svg+xml' }) })
    files.push({ name: `${name}.png`, blob: await svgToPng(svg) })
  }
  return files
}

export async function renderPages(pages: Parameters<typeof buildCells>[0][], backgrounds: string[]): Promise<SVGSVGElement[]> {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-20000px;top:0;width:1200px;height:900px;overflow:hidden'
  document.body.append(host)
  const graph = createGraph(host)
  try {
    const model = graph.getDataModel()
    return pages.map((cells, i) => {
      const root = buildCells(cells)[0]
      model.beginUpdate()
      try {
        if (root) model.setRoot(root)
      } finally {
        model.endUpdate()
      }
      return renderSvg(graph, { background: backgrounds[i] })
    })
  } finally {
    graph.destroy()
    host.remove()
  }
}
