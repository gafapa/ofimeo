// Printing a page or a section: each page as on screen (title, date, text and
// its ink at the same place), one page after the other, then the browser's
// print dialog (which can also save a PDF).

import type * as Y from 'yjs'
import { Editor, type JSONContent } from '@tiptap/core'
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap'
import { notebookExtensions } from './extensions'
import { inkArray, pageDate, pageFragment, pageTitle, PAGE_WIDTH } from './model'
import { inkSvg } from './ink'
import { scopePages, type Scope } from './export'

export async function printScope(doc: Y.Doc, scope: Scope): Promise<void> {
  const pages = scopePages(doc, scope)
  if (!pages.length) return
  const box = document.createElement('div')
  box.className = 'nb-print'
  const editors: Editor[] = []
  for (const page of pages) {
    const sheet = document.createElement('article')
    sheet.className = 'nb-sheet nb-print-page'
    sheet.style.width = `${PAGE_WIDTH}px`
    const head = document.createElement('header')
    head.className = 'nb-page-head'
    const title = document.createElement('h1')
    title.className = 'nb-page-title'
    title.textContent = pageTitle(page)
    const date = document.createElement('div')
    date.className = 'nb-page-date'
    date.textContent = pageDate(page.created)
    head.append(title, date)
    const content = document.createElement('div')
    content.className = 'nb-content'
    sheet.append(head, content)
    const svg = inkSvg(inkArray(doc, page.id).toArray(), false)
    if (svg) {
      const ink = document.createElement('div')
      ink.className = 'nb-print-ink'
      ink.innerHTML = svg
      sheet.append(ink)
    }
    box.append(sheet)
    editors.push(new Editor({ element: content, extensions: notebookExtensions(), content: yXmlFragmentToProsemirrorJSON(pageFragment(doc, page.id)) as JSONContent, editable: false }))
  }
  document.body.append(box)
  document.body.classList.add('nb-printing')
  await Promise.all([...box.querySelectorAll('img')].map((img) => img.decode().catch(() => undefined)))
  await document.fonts.ready
  // Pages grow to show ink below the text.
  for (const sheet of box.querySelectorAll<HTMLElement>('.nb-print-page')) {
    const svg = sheet.querySelector('svg')
    if (svg) sheet.style.minHeight = `${Number(svg.getAttribute('height')) + 24}px`
  }
  window.print()
  document.body.classList.remove('nb-printing')
  editors.forEach((e) => e.destroy())
  box.remove()
}
