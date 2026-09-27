// PDF of a page, a section or the notebook with selectable text: the pages
// are laid out off screen in the writer's print layout (A4) and drawn with the
// writer's PDF renderer. The ink is a picture after each page's text.

import type * as Y from 'yjs'
import { Editor } from '@tiptap/core'
import { Pagination, type Layout } from '../writer/pages'
import { renderPdf } from '../writer/pdf/render'
import { DEFAULT_PAGE, normalizeColumns } from '../writer/formats/types'
import { notebookExtensions } from './extensions'
import { scopeData, type Scope } from './export'

const frames = (n: number) => new Promise<void>((resolve) => {
  const step = (left: number) => (left ? requestAnimationFrame(() => step(left - 1)) : resolve())
  step(n)
})

export async function scopePdf(doc: Y.Doc, scope: Scope): Promise<Blob> {
  const data = await scopeData(doc, scope, { files: 'text', ink: 'png' })
  const host = document.createElement('div')
  host.className = 'nb-pdf-host'
  host.innerHTML = '<div id="paper" class="paper pdf-export"><div id="page-sheets" class="page-layer"></div><div id="editor"></div><div id="page-chrome" class="page-layer page-chrome"></div></div>'
  document.body.append(host)
  const paper = host.querySelector<HTMLElement>('#paper')!
  const editorHost = host.querySelector<HTMLElement>('#editor')!
  let layout: Layout | null = null
  let editor: Editor | null = null
  try {
    editor = new Editor({
      element: editorHost,
      extensions: [
        ...notebookExtensions(),
        Pagination.configure({
          firstSection: () => ({ page: DEFAULT_PAGE, columns: normalizeColumns(null) }),
          gap: () => 24,
          onLayout: (l) => {
            layout = l
            paper.style.width = `${l.width}px`
            paper.style.height = `${l.height}px`
            editorHost.style.height = `${l.height}px`
          },
        }),
      ],
      content: data.body,
      editable: false,
    })
    await Promise.all([...editorHost.querySelectorAll('img')].map((img) => img.decode().catch(() => undefined)))
    await document.fonts.ready
    await frames(4)
    if (!layout) throw new Error('No layout')
    const bytes = await renderPdf({ paper, layout, zoom: 1, title: data.title, editor })
    return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' })
  } finally {
    editor?.destroy()
    host.remove()
  }
}
