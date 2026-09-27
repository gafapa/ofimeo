// Spelling and grammar in the PDF editor: text boxes, comments and replies are
// checked as they are typed and by Tools ▸ Spelling and grammar… (F7). The
// PDF's own text is not checked (it cannot be changed here).

import { t } from '../../core/i18n'
import type { Session } from '../../core/session'
import { openSpellingDialog, type SpellItem } from '../../ui/spell/dialog'
import { spellcheckFields } from '../../ui/spell/inline'
import { registerSpellingKey, spellingMenuItems } from '../../ui/spell/menu'
import { docLanguage } from '../../ui/spell/service'
import type { MenuEntry } from '../../ui/widgets'
import { userIdOf } from '../writer/collab'
import type { Editor } from './editor'
import type { Notes } from './notes'
import type { Viewer } from './viewer'

interface PdfItem extends SpellItem {
  annot?: string
  note?: string
}

export function pdfSpelling(session: Session, viewer: Viewer, editor: Editor, notes: Notes, pagesRoot: HTMLElement): { menu: () => MenuEntry[]; open: () => void } {
  // Comment links can correct their own comments.
  const editable = () => session.canComment
  const language = docLanguage(session.doc, () => session.canEdit)
  const userId = userIdOf(session)

  // As they are typed: the text box being edited and the comment fields.
  for (const root of [pagesRoot, notes.panel]) {
    root.lang = language.tag()
    language.onChange(() => (root.lang = language.tag()))
  }
  spellcheckFields(pagesRoot, 'textarea.pdf-text-editor', language.tag)
  spellcheckFields(notes.panel, 'textarea.pdf-input', language.tag)

  const pageIndex = (id: string | undefined) => viewer.views.findIndex((v) => v.entry.id === id)

  const items = (): SpellItem[] => {
    const out: PdfItem[] = []
    viewer.views.forEach((v, index) => {
      const boxes = editor.pageAnnots(v.entry.id).filter((a) => a.type === 'text' && a.text?.trim())
      boxes.sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0))
      for (const a of boxes) out.push({ key: `annot/${a.id}`, label: `${t('Page {n}', { n: index + 1 })} · ${t('Text box')}`, text: a.text!, annot: a.id })
    })
    // Only one's own comments and replies can be changed.
    for (const { note, replies } of notes.threads()) {
      const page = t('Page {n}', { n: pageIndex(note.page) + 1 })
      if (note.authorId === userId && note.text.trim()) out.push({ key: `note/${note.id}`, label: `${page} · ${t('Comment')}`, text: note.text, note: note.id })
      for (const r of replies) if (r.authorId === userId && r.text.trim()) out.push({ key: `note/${r.id}`, label: `${page} · ${t('Reply')}`, text: r.text, note: r.id })
    }
    return out
  }

  const reveal = (item: SpellItem) => {
    const i = item as PdfItem
    if (i.annot) {
      const a = editor.annots.get(i.annot)
      if (!a) return
      editor.finishEditing()
      viewer.scrollToPage(Math.max(0, pageIndex(a.page)), Math.max(0, (a.y ?? 0) - 60))
      editor.select(a.id)
    } else if (i.note) {
      const n = notes.map.get(i.note)
      notes.select(n?.parent ?? i.note)
    }
  }

  const replace = (item: SpellItem, from: number, to: number, text: string): boolean => {
    const i = item as PdfItem
    if (i.annot) {
      const a = editor.annots.get(i.annot)
      if (!a?.text || !session.canEdit || a.text.slice(from, to) !== item.text.slice(from, to)) return false
      editor.finishEditing()
      editor.update(a.id, { text: a.text.slice(0, from) + text + a.text.slice(to) })
      return true
    }
    const n = i.note ? notes.map.get(i.note) : undefined
    if (!n || n.authorId !== userId || n.text.slice(from, to) !== item.text.slice(from, to)) return false
    notes.update(n.id, { text: n.text.slice(0, from) + text + n.text.slice(to), edited: Date.now() })
    return true
  }

  const open = () => openSpellingDialog({ items, reveal, replace, editable, language })
  registerSpellingKey(open)
  return { open, menu: () => spellingMenuItems({ open, language, editable: () => session.canEdit }) }
}
