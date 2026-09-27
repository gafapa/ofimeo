// PDF downloads of diagrams (every page, sized to its page settings) and
// drawings: each page is a high-resolution picture of the page, which keeps
// HTML labels, stencils and hand-drawn fonts exactly as they look on screen.

import { PDFDocument, rgb } from 'pdf-lib'
import type { PageRecord } from './model'
import { svgToPng } from './export'

export interface PdfPicture {
  png: Blob | null
  // Size of the picture in CSS pixels (at 96 dpi) and of the PDF page in points.
  width: number
  height: number
  pageWidth: number
  pageHeight: number
  margin?: number
  background?: string | null
}

// One picture per page, shrunk to fit inside the margins.
export async function picturesToPdf(pictures: PdfPicture[], title: string): Promise<Blob> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(title)
  pdf.setCreator('Ofimeo')
  for (const p of pictures) {
    const page = pdf.addPage([p.pageWidth, p.pageHeight])
    const bg = /^#([0-9a-f]{6})$/i.exec(p.background ?? '')?.[1]
    if (bg && bg.toLowerCase() !== 'ffffff') {
      const n = parseInt(bg, 16)
      page.drawRectangle({ x: 0, y: 0, width: p.pageWidth, height: p.pageHeight, color: rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255) })
    }
    if (!p.png) continue
    const image = await pdf.embedPng(await p.png.arrayBuffer())
    const margin = p.margin ?? 0
    const natural = [p.width * 0.75, p.height * 0.75]
    const scale = Math.min(1, (p.pageWidth - 2 * margin) / natural[0], (p.pageHeight - 2 * margin) / natural[1])
    const [w, h] = [natural[0] * scale, natural[1] * scale]
    // At the top of the page, centered across it.
    page.drawImage(image, { x: (p.pageWidth - w) / 2, y: p.pageHeight - margin - h, width: w, height: h })
  }
  return new Blob([(await pdf.save()) as Uint8Array<ArrayBuffer>], { type: 'application/pdf' })
}

// Rendering scale for sharp pictures (about 300 dpi) without huge canvases.
export const pictureRatio = (width: number, height: number) => Math.max(1, Math.min(3, 8000 / Math.max(width, height, 1)))

// Every page of a diagram, one PDF page each, with the page size of its settings
// (draw.io's sizes are in pixels at 100 dpi).
export async function diagramPdf(pages: PageRecord[], title: string): Promise<Blob> {
  const { orderCells } = await import('./formats/drawio')
  const { renderPages } = await import('./index')
  const backgrounds = pages.map((p) => (p.background && p.background !== 'none' ? p.background : '#ffffff'))
  const svgs = await renderPages(pages.map((p) => orderCells(p.cells)), backgrounds)
  const pictures: PdfPicture[] = []
  for (const [i, svg] of svgs.entries()) {
    const width = Number(svg.getAttribute('width'))
    const height = Number(svg.getAttribute('height'))
    const empty = !pages[i].cells.some((c) => c.vertex || c.edge)
    pictures.push({
      png: empty ? null : await svgToPng(svg, pictureRatio(width, height)),
      width,
      height,
      pageWidth: (pages[i].pageWidth ?? 850) * 0.72,
      pageHeight: (pages[i].pageHeight ?? 1100) * 0.72,
      margin: 28,
      background: backgrounds[i],
    })
  }
  return picturesToPdf(pictures, title)
}
