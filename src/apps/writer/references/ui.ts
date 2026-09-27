// Dialogs for sources and citations (loaded on demand): insert or edit a
// citation, manage the source list, edit one source, import BibTeX / RIS.

import { NodeSelection } from '@tiptap/pm/state'
import { confirmDialog, el, showDialog, toast } from '../../../ui/widgets'
import { t } from '../../../core/i18n'
import type { WriterContext } from '../app'
import { parsePeople, peopleText, sourceLabel } from './format'
import { parseSources, toBibtex } from './parse'
import { idsOf } from './nodes'
import { newSourceId, SOURCE_TYPES, type Source, type SourceType } from './types'

export const typeLabel = (type: SourceType): string =>
  ({
    book: t('Book'),
    chapter: t('Book chapter'),
    article: t('Journal article'),
    web: t('Web page'),
    report: t('Report'),
    thesis: t('Thesis'),
    other: t('Other'),
  })[type]

function button(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', { type: 'button', textContent: label, class: cls })
  b.addEventListener('click', onClick)
  return b
}

// Fields shown for each type (besides authors, title and date).
const FIELDS: Record<SourceType, (keyof Source)[]> = {
  book: ['editors', 'edition', 'publisher', 'place', 'url', 'doi'],
  chapter: ['container', 'editors', 'pages', 'edition', 'publisher', 'place', 'url', 'doi'],
  article: ['container', 'volume', 'issue', 'pages', 'url', 'doi'],
  web: ['container', 'url', 'accessed'],
  report: ['number', 'publisher', 'place', 'url', 'doi'],
  thesis: ['genre', 'publisher', 'url'],
  other: ['container', 'publisher', 'place', 'url', 'doi', 'accessed'],
}

function fieldLabel(key: keyof Source, type: SourceType): string {
  switch (key) {
    case 'container':
      return type === 'article' ? t('Journal') : type === 'chapter' ? t('Book title') : type === 'web' ? t('Website') : t('Published in')
    case 'editors':
      return t('Editors (one per line: Family, Given)')
    case 'edition':
      return t('Edition')
    case 'publisher':
      return type === 'thesis' ? t('University') : type === 'report' ? t('Institution') : t('Publisher')
    case 'place':
      return t('Place')
    case 'volume':
      return t('Volume')
    case 'issue':
      return t('Issue')
    case 'pages':
      return t('Pages')
    case 'number':
      return t('Report number')
    case 'genre':
      return t('Kind of thesis')
    case 'url':
      return 'URL'
    case 'doi':
      return 'DOI'
    case 'accessed':
      return t('Accessed on (YYYY-MM-DD)')
    default:
      return String(key)
  }
}

// Edits (or creates) one source; resolves with the saved source or null.
export async function editSource(ctx: WriterContext, source?: Source): Promise<Source | null> {
  const s: Source = source ? structuredClone(source) : { id: newSourceId(), type: 'book', authors: [], title: '' }
  const type = el('select', { class: 'field' })
  for (const k of SOURCE_TYPES) type.append(el('option', { value: k, textContent: typeLabel(k) }))
  type.value = s.type
  const authors = el('textarea', { class: 'field', rows: 3, value: peopleText(s.authors), placeholder: t('García Pérez, Ana') })
  const title = el('input', { class: 'field', value: s.title })
  const date = el('input', { class: 'field', value: s.date ?? '', placeholder: t('2024 or 2024-05-17') })
  const inputs = new Map<keyof Source, HTMLInputElement | HTMLTextAreaElement>()
  const extra = el('div', { class: 'form grid2 span2' })
  const renderExtra = () => {
    extra.replaceChildren()
    for (const key of FIELDS[type.value as SourceType]) {
      let input = inputs.get(key)
      if (!input) {
        const value = key === 'editors' ? peopleText(s.editors) : String(s[key] ?? '')
        input = key === 'editors' ? el('textarea', { class: 'field', rows: 2, value }) : el('input', { class: 'field', value })
        inputs.set(key, input)
      }
      extra.append(el('label', { class: `field-label${key === 'editors' || key === 'url' ? ' span2' : ''}` }, fieldLabel(key, type.value as SourceType), input))
    }
  }
  type.addEventListener('change', renderExtra)
  renderExtra()
  const body = el(
    'div',
    { class: 'form grid2 source-form' },
    el('label', { class: 'field-label' }, t('Type'), type),
    el('label', { class: 'field-label' }, t('Date'), date),
    el('label', { class: 'field-label span2' }, t('Authors (one per line: Family, Given; organizations in braces)'), authors),
    el('label', { class: 'field-label span2' }, t('Title'), title),
    extra,
  )
  const result = await showDialog(source ? t('Edit source') : t('New source'), body, [{ label: t('Cancel'), value: 'cancel' }, { label: t('Save'), value: 'ok', primary: true }], true)
  if (result !== 'ok') return null
  s.type = type.value as SourceType
  s.authors = parsePeople(authors.value)
  s.title = title.value.trim()
  s.date = date.value.trim() || undefined
  for (const key of Object.keys(FIELDS).flatMap((k) => FIELDS[k as SourceType])) if (!FIELDS[s.type].includes(key)) delete s[key]
  for (const [key, input] of inputs) {
    if (!FIELDS[s.type].includes(key)) continue
    const v = input.value.trim()
    if (key === 'editors') s.editors = v ? parsePeople(v) : undefined
    else (s as unknown as Record<string, unknown>)[key] = v || undefined
  }
  if (!s.title && !s.authors.length) {
    toast(t('A source needs at least a title or an author'))
    return null
  }
  const clean = JSON.parse(JSON.stringify(s)) as Source
  ctx.references.save(clean)
  return clean
}

// Picks a BibTeX / RIS / CSL-JSON file and adds its sources.
export function importSourcesFile(ctx: WriterContext): Promise<Source[]> {
  return new Promise((resolve) => {
    const input = el('input', { type: 'file', accept: '.bib,.bibtex,.ris,.json,.txt' })
    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      if (!file) return resolve([])
      try {
        const sources = parseSources(await file.text(), file.name)
        // Keeps existing sources with the same key.
        const keys = new Set(ctx.references.sources().map((s) => s.key).filter(Boolean))
        const fresh = sources.filter((s) => !s.key || !keys.has(s.key))
        ctx.references.addAll(fresh)
        toast(t('{n} sources imported', { n: fresh.length }))
        resolve(fresh)
      } catch (err) {
        toast(t('Could not read the file: {message}', { message: (err as Error).message }))
        resolve([])
      }
    })
    input.click()
  })
}

function download(name: string, text: string, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// Source manager: list, add, edit, delete, import and export.
export async function manageSources(ctx: WriterContext): Promise<void> {
  const list = el('div', { class: 'source-list' })
  const editable = ctx.editor.isEditable
  const render = () => {
    list.replaceChildren()
    const sources = [...ctx.references.sources()].sort((a, b) => sourceLabel(a).localeCompare(sourceLabel(b)))
    if (!sources.length) list.append(el('p', { class: 'hint', textContent: t('No sources yet. Add one or import a BibTeX or RIS file (Zotero, Mendeley, Google Scholar…).') }))
    for (const s of sources) {
      const row = el('div', { class: 'source-row' }, el('span', { class: 'source-type', textContent: typeLabel(s.type) }), el('span', { class: 'source-label', textContent: sourceLabel(s) }))
      if (editable) {
        row.append(
          button(t('Edit'), async () => {
            await editSource(ctx, s)
            render()
          }),
          button(t('Delete'), async () => {
            if (await confirmDialog(t('Delete source'), sourceLabel(s), { confirmLabel: t('Delete'), danger: true })) {
              ctx.references.remove(s.id)
              render()
            }
          }),
        )
      }
      list.append(row)
    }
  }
  render()
  const tools = el('div', { class: 'source-tools' })
  if (editable)
    tools.append(
      button(t('New source…'), async () => {
        await editSource(ctx)
        render()
      }),
      button(t('Import BibTeX / RIS…'), async () => {
        await importSourcesFile(ctx)
        render()
      }),
    )
  tools.append(button(t('Export BibTeX'), () => download('sources.bib', toBibtex(ctx.references.sources()), 'application/x-bibtex')))
  await showDialog(t('Sources'), el('div', { class: 'form' }, tools, list), [{ label: t('Close'), value: 'ok', primary: true }], true)
}

// Inserts a citation, or edits the one at `pos`.
export async function citationDialog(ctx: WriterContext, pos?: number): Promise<void> {
  const { editor } = ctx
  const existing = pos !== undefined ? editor.state.doc.nodeAt(pos) : null
  const chosen = new Set<string>(existing ? idsOf(existing.attrs.ids) : [])
  const search = el('input', { class: 'field', placeholder: t('Search sources') })
  search.setAttribute('aria-label', t('Search sources'))
  const locator = el('input', { class: 'field', value: String(existing?.attrs.locator ?? ''), placeholder: t('e.g. 23 or 23-25') })
  const list = el('div', { class: 'source-list pick' })
  const render = () => {
    list.replaceChildren()
    const q = search.value.trim().toLowerCase()
    const sources = [...ctx.references.sources()].sort((a, b) => sourceLabel(a).localeCompare(sourceLabel(b)))
    if (!sources.length) list.append(el('p', { class: 'hint', textContent: t('No sources yet. Add one or import a BibTeX or RIS file (Zotero, Mendeley, Google Scholar…).') }))
    for (const s of sources) {
      if (q && !sourceLabel(s).toLowerCase().includes(q)) continue
      const box = el('input', { type: 'checkbox', checked: chosen.has(s.id) })
      box.addEventListener('change', () => (box.checked ? chosen.add(s.id) : chosen.delete(s.id)))
      list.append(el('label', { class: 'source-row check' }, box, el('span', { class: 'source-type', textContent: typeLabel(s.type) }), el('span', { class: 'source-label', textContent: sourceLabel(s) })))
    }
  }
  search.addEventListener('input', render)
  render()
  const tools = el(
    'div',
    { class: 'source-tools' },
    button(t('New source…'), async () => {
      const s = await editSource(ctx)
      if (s) chosen.add(s.id)
      render()
    }),
    button(t('Import BibTeX / RIS…'), async () => {
      await importSourcesFile(ctx)
      render()
    }),
  )
  const body = el('div', { class: 'form' }, tools, search, list, el('label', { class: 'field-label' }, t('Page or other locator (optional)'), locator))
  const buttons = [
    { label: t('Cancel'), value: 'cancel' },
    ...(existing ? [{ label: t('Remove citation'), value: 'remove' }] : []),
    { label: existing ? t('Save') : t('Insert'), value: 'ok', primary: true },
  ]
  const result = await showDialog(existing ? t('Edit citation') : t('Insert citation'), body, buttons, true)
  if (result === 'remove' && pos !== undefined) {
    editor.chain().focus().deleteRange({ from: pos, to: pos + 1 }).run()
    return
  }
  if (result !== 'ok' || !chosen.size) return
  const ids = ctx.references.sources().map((s) => s.id).filter((id) => chosen.has(id))
  if (existing && pos !== undefined) {
    const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ids, locator: locator.value.trim() })
    editor.view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, pos)))
    editor.commands.focus()
  } else editor.chain().focus().insertCitation({ ids, locator: locator.value.trim() }).run()
}
