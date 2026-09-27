// Sections of the document: reading and changing the settings of the section at
// the cursor. The first section's settings are the document's page setup and
// columns (meta); later sections keep theirs on the `sectionBreak` node that starts them.

import type { Editor } from '@tiptap/core'
import { sectionAttrs, sectionFromAttrs, type Section, type SectionStart } from './formats/types'
import { sectionAt, sectionsOf } from './pages'
import type { WriterContext } from './app'

export function allSections(ctx: WriterContext): Section[] {
  return sectionsOf(ctx.editor.state.doc, { page: ctx.getPage(), columns: ctx.getColumns() })
}

export function currentSectionIndex(editor: Editor): number {
  return sectionAt(editor.state.doc, editor.state.selection.from)
}

// Positions of the top-level section breaks (the break at index i starts section i + 1).
function breakPositions(editor: Editor): number[] {
  const out: number[] = []
  editor.state.doc.forEach((node, offset) => {
    if (node.type.name === 'sectionBreak') out.push(offset)
  })
  return out
}

// Applies settings to one section (index) or to all of them (null).
export function setSections(ctx: WriterContext, index: number | null, change: (s: Section) => Section): void {
  const { editor } = ctx
  const sections = allSections(ctx)
  const targets = index === null ? sections.map((_, i) => i) : [index]
  if (targets.includes(0)) {
    const next = change(sections[0])
    ctx.setPage(next.page)
    ctx.setColumns(next.columns)
  }
  const breaks = breakPositions(editor)
  const tr = editor.state.tr
  for (const i of targets) {
    if (i === 0) continue
    const pos = breaks[i - 1]
    const node = pos !== undefined ? editor.state.doc.nodeAt(pos) : null
    if (!node) continue
    tr.setNodeMarkup(pos, undefined, sectionAttrs(change(sectionFromAttrs(node.attrs, sections[i - 1].page))))
  }
  if (tr.docChanged) editor.view.dispatch(tr)
}

// Inserts a section break at the cursor; the new section starts with the current section's settings.
export function insertSectionBreak(ctx: WriterContext, start: SectionStart): void {
  const current = allSections(ctx)[currentSectionIndex(ctx.editor)]
  ctx.editor.chain().focus().insertSectionBreak(sectionAttrs({ ...current, start })).run()
}
