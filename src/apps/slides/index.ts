// Entry point of the presentations app, loaded on demand by the app registry.

import type { Session, SubmitFile } from '../../core/session'
import { createLocalDocument } from '../../core/session'
import { svgToPng } from '../diagram/export'
import { DiagramSync } from '../diagram/sync'
import { SLIDES_ACCEPT, mountSlides } from './app'
import { blankSlide, notesText, parseBackground, presentationSize, presentationTheme, readSlideMeta, writePresentation, type PresentationData } from './model'
import { SlideRenderer } from './render'
import { readAnimations } from './animations'
import { t } from '../../core/i18n'
import '../diagram/diagram.css'
import './slides.css'

export const accept = SLIDES_ACCEPT

export function mount(session: Session): void {
  mountSlides(session, document.getElementById('root')!)
}

// Imports a PowerPoint or OpenDocument presentation into a new local presentation; returns its path.
export async function importFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  // PowerPoint 97-2003 files (.ppt) and OpenDocument files (.odp) have their own importers.
  const data: Parameters<typeof writePresentation>[1] = /\.ppt$/i.test(file.name)
    ? { themeId: 'imported', ...(await (await import('./formats/ppt-import')).parsePpt(buffer)) }
    : /\.odp$/i.test(file.name)
      ? await (await import('./formats/odp-import')).parseOdp(buffer)
      : await (await import('./formats/pptx-import')).parsePptx(buffer)
  const title = file.name.replace(/\.(pptx?|odp)$/i, '')
  return createLocalDocument('slides', title, (doc) => writePresentation(doc, data, DiagramSync.setPages))
}

// The whole presentation from the shared state (exports without the editor).
export function readPresentation(session: Session): PresentationData {
  const doc = session.doc
  const theme = presentationTheme(doc)
  return {
    ...presentationSize(doc),
    theme,
    // A new presentation shows a blank title slide that is only written to the
    // document on its first edit: it is still part of the presentation.
    slides: (DiagramSync.readPages(doc).length ? DiagramSync.readPages(doc) : [blankSlide()]).map((p) => {
      const meta = readSlideMeta(doc, p.id)
      return {
        id: p.id,
        name: p.name,
        cells: p.cells,
        notes: notesText(doc, p.id).toString(),
        background: meta.background,
        layout: meta.layout,
        animations: readAnimations(doc, p.id),
        transition: meta.transition,
        transitionDuration: Number(meta.transitionDuration) || undefined,
      }
    }),
  }
}

// "Hand in": the .pptx file plus a PNG of every slide.
export async function submitFiles(session: Session): Promise<SubmitFile[]> {
  const data = readPresentation(session)
  const title = String(session.doc.getMap('meta').get('title') || t('Untitled presentation'))
  const renderer = new SlideRenderer(() => data.theme)
  try {
    const { exportPptx } = await import('./formats/pptx')
    const files: SubmitFile[] = [{ name: `${title}.pptx`, blob: await exportPptx(data, renderer) }]
    for (const [i, slide] of data.slides.entries()) {
      await renderer.prepare(slide.cells)
      const svg = renderer.render({ cells: slide.cells, background: parseBackground(slide.background, data.theme) }, data.width, data.height)
      files.push({ name: `${title} - ${String(i + 1).padStart(2, '0')}.png`, blob: await svgToPng(svg, 2) })
    }
    return files
  } finally {
    renderer.destroy()
  }
}
