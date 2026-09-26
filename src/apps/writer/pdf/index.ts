// Direct PDF export (no print dialog): the paged layout on screen is drawn
// into a PDF with selectable text, bookmarks, links and tags.

import type { WriterContext } from '../app'
import { renderPdf } from './render'
import { langTag } from '../formats/types'
import { t } from '../../../core/i18n'
import { toast } from '../../../ui/widgets'

export async function exportPdf(ctx: WriterContext): Promise<Blob> {
  const paper = document.getElementById('paper')!
  const { editor } = ctx
  paper.classList.add('pdf-export')
  // Fonts and the export styles (no carets, no spelling marks) must be applied first.
  await document.fonts.ready
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  try {
    const zoom = paper.getBoundingClientRect().width / paper.offsetWidth || 1
    const bytes = await renderPdf({
      paper,
      layout: ctx.layout(),
      zoom,
      title: String(ctx.meta.get('title') || t('Untitled document')),
      lang: langTag(ctx.spell.docLang()),
      editor,
    })
    return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' })
  } finally {
    paper.classList.remove('pdf-export')
  }
}

// Printing pages of different sizes: opens the PDF, whose viewer prints each page at its size.
export async function printPdf(ctx: WriterContext): Promise<void> {
  toast(t('Preparing the PDF for printing…'))
  const blob = await exportPdf(ctx)
  const url = URL.createObjectURL(blob)
  if (!window.open(url, '_blank')) location.assign(url)
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
