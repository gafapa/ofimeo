// Menu bar and toolbar of the word processor.

import type { Editor } from '@tiptap/core'
import {
  Baseline,
  Bold,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Link,
  List,
  ListChevronsUpDown,
  ListChecks,
  ListIndentDecrease,
  ListIndentIncrease,
  ListOrdered,
  MessageSquarePlus,
  Minus,
  Plus,
  Printer,
  Redo2,
  RemoveFormatting,
  Search,
  Sigma,
  Strikethrough,
  Table,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignJustify,
  TextAlignStart,
  Underline,
  Undo2,
  type IconNode,
} from 'lucide'
import { DEFAULT_FONT, DEFAULT_FONT_SIZE_PT } from './formats/types'
import type { ParagraphStyle } from './editor/nodes'
import { closePopover, el, icon, openPopover, showContextMenu, tableGrid, type Menu, type MenuEntry } from '../../ui/widgets'
import type { WriterContext } from './app'
import { t } from '../../core/i18n'
import type { FrameSpec } from '../../ui/frame'
import type { EditMenuOptions, FileMenuOptions } from '../../ui/menus'
import { isMac, mod, type ShortcutSection } from '../../ui/shortcuts'
import type { Toolbar } from '../../ui/toolbar'
import { zoomMenuItems } from '../../ui/zoom'
import { contextMenuFor, toolsMenu } from './spell/ui'
import { bibliographyTitle } from './references/format'
import type { CiteLang, CiteStyle } from './references/types'

export const FONTS = [
  'Arial',
  'Calibri',
  'Cambria',
  'Comic Sans MS',
  'Courier New',
  'Garamond',
  'Georgia',
  'Helvetica',
  'Liberation Sans',
  'Liberation Serif',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
]
const FONT_SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72]
const LINE_HEIGHTS = ['1', '1.15', '1.5', '2', '2.5', '3']
const STYLES: [ParagraphStyle, string][] = [
  ['normal', t('Normal text')],
  ['title', t('Title')],
  ['subtitle', t('Subtitle')],
  ['h1', t('Heading 1')],
  ['h2', t('Heading 2')],
  ['h3', t('Heading 3')],
  ['h4', t('Heading 4')],
]
export const ZOOMS = [0.5, 0.75, 0.9, 1, 1.25, 1.5, 2]

const dialogs = () => import('./dialogs')
const sections = () => import('./sections')

function tocItems(editor: Editor): MenuEntry[] {
  return [
    { label: t('Headings 1–3'), run: () => editor.chain().focus().insertTableOfContents(3).run() },
    { label: t('Headings 1–6'), run: () => editor.chain().focus().insertTableOfContents(6).run() },
    '-',
    { label: t('Update table of contents'), run: () => editor.commands.updateTablesOfContents(), enabled: () => hasNode(editor, 'tableOfContents') },
  ]
}

export function hasNode(editor: Editor, name: string): boolean {
  let found = false
  editor.state.doc.descendants((node) => {
    if (node.type.name === name) found = true
    return !found && !node.isAtom
  })
  return found
}

function currentColumns(ctx: WriterContext): number {
  const { doc, selection } = ctx.editor.state
  let index = 0
  let columns = ctx.getColumns().count
  doc.forEach((node, offset) => {
    if (node.type.name === 'sectionBreak' && offset < selection.from) {
      index++
      columns = Number(node.attrs.columns) || 1
    }
  })
  return index ? columns : ctx.getColumns().count
}

// Marks that record review information rather than formatting.
const REVIEW_MARKS = new Set(['authorship', 'insertion', 'deletion', 'commentRange'])

export function clearFormatting(editor: Editor): void {
  editor
    .chain()
    .focus()
    .command(({ tr, state }) => {
      const { from, to, empty } = state.selection
      if (empty) tr.setStoredMarks([])
      else for (const type of Object.values(state.schema.marks)) if (!REVIEW_MARKS.has(type.name)) tr.removeMark(from, to, type)
      return true
    })
    .run()
}

// Disables document-changing items for people who cannot edit.
function guard(items: MenuEntry[], editable: () => boolean): MenuEntry[] {
  return items.map((item) => {
    if (item === '-') return item
    const enabled = item.enabled
    return {
      ...item,
      submenu: item.submenu ? guard(item.submenu, editable) : undefined,
      enabled: () => editable() && (enabled ? enabled() : true),
    }
  })
}

export function currentStyle(editor: Editor): ParagraphStyle {
  for (let level = 1; level <= 4; level++) if (editor.isActive('heading', { level })) return `h${level}` as ParagraphStyle
  const styleId = editor.getAttributes('paragraph').styleId
  return styleId === 'title' || styleId === 'subtitle' ? styleId : 'normal'
}

export function currentFontSize(editor: Editor): number {
  const size = parseFloat(editor.getAttributes('textStyle').fontSize ?? '')
  return Number.isFinite(size) ? size : DEFAULT_FONT_SIZE_PT
}

function setFontSize(editor: Editor, pt: number) {
  const size = Math.max(1, Math.min(400, Math.round(pt * 2) / 2))
  editor.chain().focus().setFontSize(`${size}pt`).run()
}

function stepFontSize(editor: Editor, dir: 1 | -1) {
  const size = currentFontSize(editor)
  const next = dir > 0 ? FONT_SIZES.find((s) => s > size) : [...FONT_SIZES].reverse().find((s) => s < size)
  setFontSize(editor, next ?? size + dir)
}

// ---------- Menus (shared frame: src/ui/frame.ts) ----------

// Shortcuts dialog: the writer's own rows (the frame adds the common ones).
export function shortcutSections(): ShortcutSection[] {
  return [
    {
      title: t('Text'),
      rows: [
        [t('Bold / Italic / Underline'), 'Ctrl+B / Ctrl+I / Ctrl+U'],
        [t('Strikethrough'), 'Ctrl+Shift+S'],
        [t('Superscript / Subscript'), 'Ctrl+. / Ctrl+,'],
        [t('Headings 1–6'), 'Ctrl+Alt+1 … 6'],
        [t('Normal text'), 'Ctrl+Alt+0'],
        [t('Align left / center / right / justify'), 'Ctrl+Shift+L / E / R / J'],
        [t('Bulleted / numbered / checklist'), 'Ctrl+Shift+8 / 7 / 9'],
        [t('Indent / outdent'), 'Tab / Shift+Tab'],
        [t('Clear formatting'), 'Ctrl+\\'],
      ],
    },
    {
      title: t('Insert'),
      rows: [
        [t('Line break in paragraph'), 'Shift+Enter'],
        [t('Page break'), 'Ctrl+Enter'],
        [t('Insert link'), 'Ctrl+K'],
        [t('Insert footnote'), 'Ctrl+Alt+F'],
        [t('Comment'), 'Ctrl+Alt+M'],
      ],
    },
    { title: t('Tools'), rows: [[t('Spelling and grammar'), 'F7']] },
  ]
}

// Everything the shared frame needs from the writer: File slots, Edit, the
// app menus in the standard order and the shortcuts dialog sections.
export function writerFrame(ctx: WriterContext): Pick<FrameSpec, 'file' | 'edit' | 'menus' | 'help'> {
  const { editor } = ctx
  const run = (fn: (e: Editor) => unknown) => () => fn(editor)
  const inTable = () => editor.isActive('table')
  const can = (fn: (c: ReturnType<Editor['can']>) => boolean) => () => fn(editor.can())
  const editable = () => editor.isEditable
  const canComment = () => ctx.access !== 'view'
  const comment = () => ctx.review.startComment()
  const commentKey = isMac ? '⌥⌘M' : 'Ctrl+Alt+M'

  const file: FileMenuOptions = {
    openFile: ctx.openFile,
    print: ctx.print,
    download: [{ label: t('PDF (via Print)'), run: ctx.print }],
    slots: { print: [{ label: t('Page setup…'), run: () => dialogs().then((d) => d.pageSetup(ctx)), enabled: editable }] },
    details: () => [
      [t('Pages'), String(ctx.pages())],
      [t('Words'), String(editor.storage.characterCount.words())],
      [t('Characters'), String(editor.storage.characterCount.characters())],
    ],
  }

  const edit: EditMenuOptions = {
    editable,
    undo: run((e) => e.chain().focus().undo().run()),
    redo: run((e) => e.chain().focus().redo().run()),
    canUndo: () => editor.can().undo(),
    canRedo: () => editor.can().redo(),
    cut: () => clipboardCommand(editor, 'cut'),
    copy: () => clipboardCommand(editor, 'copy'),
    paste: () => dialogs().then((d) => d.pasteHint()),
    selectAll: run((e) => e.chain().focus().selectAll().run()),
    find: () => ctx.find.open(false),
    replace: () => ctx.find.open(true),
  }

  const view: Menu = {
    label: t('View'),
    items: [
      {
        label: t('Zoom'),
        submenu: zoomMenuItems({
          get: ctx.getZoom,
          set: ctx.setZoom,
          fit: () => ctx.setZoom(0),
          isFit: () => ctx.getZoom() === 0,
          min: 0.5,
          max: 2,
          presets: ZOOMS,
        }).slice(3),
      },
    ],
  }

  const insert: Menu = {
    label: t('Insert'),
    items: [
      { label: t('Comment'), shortcut: commentKey, run: comment, enabled: canComment },
      '-',
      ...guard(
        [
          { label: t('Equation…'), run: () => ctx.insertEquation(false) },
          { label: t('Display equation…'), run: () => ctx.insertEquation(true) },
          '-',
          { label: t('Image from file…'), run: () => pickImage(editor) },
          { label: t('Image from URL…'), run: () => dialogs().then((d) => d.imageFromUrl(ctx)) },
          { label: t('Table…'), run: () => dialogs().then((d) => d.insertTableDialog(ctx)) },
          { label: t('Link…'), shortcut: mod('K'), run: () => dialogs().then((d) => d.editLink(ctx)) },
          '-',
          { label: t('Footnote…'), shortcut: isMac ? '⌥⌘F' : 'Ctrl+Alt+F', run: () => dialogs().then((d) => d.insertFootnote(ctx)) },
          { label: t('Table of contents'), submenu: tocItems(editor) },
          { label: t('Citation…'), run: () => import('./references/ui').then((m) => m.citationDialog(ctx)) },
          { label: t('Header and footer…'), run: () => dialogs().then((d) => d.editHeaderFooter(ctx)) },
          '-',
          { label: t('Page break'), shortcut: mod('Enter'), run: run((e) => e.chain().focus().setPageBreak().run()) },
          {
            label: t('Section break'),
            submenu: [
              { label: t('Next page'), run: () => sections().then((m) => m.insertSectionBreak(ctx, 'nextPage')) },
              { label: t('Continuous'), run: () => sections().then((m) => m.insertSectionBreak(ctx, 'continuous')) },
            ],
          },
          { label: t('Horizontal line'), run: run((e) => e.chain().focus().setHorizontalRule().run()) },
          { label: t('Special character…'), run: () => dialogs().then((d) => d.specialCharacters(ctx)) },
        ],
        editable,
      ),
    ],
  }

  const format: Menu = {
    label: t('Format'),
    items: guard([
      {
        label: t('Text'),
        submenu: [
          { label: t('Bold'), shortcut: mod('B'), run: run((e) => e.chain().focus().toggleBold().run()), active: () => editor.isActive('bold') },
          { label: t('Italic'), shortcut: mod('I'), run: run((e) => e.chain().focus().toggleItalic().run()), active: () => editor.isActive('italic') },
          { label: t('Underline'), shortcut: mod('U'), run: run((e) => e.chain().focus().toggleUnderline().run()), active: () => editor.isActive('underline') },
          { label: t('Strikethrough'), shortcut: mod('Shift+S'), run: run((e) => e.chain().focus().toggleStrike().run()), active: () => editor.isActive('strike') },
          { label: t('Superscript'), shortcut: mod('.'), run: run((e) => e.chain().focus().toggleSuperscript().run()), active: () => editor.isActive('superscript') },
          { label: t('Subscript'), shortcut: mod(','), run: run((e) => e.chain().focus().toggleSubscript().run()), active: () => editor.isActive('subscript') },
          { label: t('Code'), shortcut: mod('E'), run: run((e) => e.chain().focus().toggleCode().run()), active: () => editor.isActive('code') },
        ],
      },
      {
        label: t('Paragraph styles'),
        submenu: STYLES.map(([id, label]) => ({
          label,
          run: run((e) => e.commands.setParagraphStyle(id)),
          active: () => currentStyle(editor) === id,
        })),
      },
      {
        label: t('Align'),
        submenu: (['left', 'center', 'right', 'justify'] as const).map((a) => ({
          label: { left: t('Left'), center: t('Center'), right: t('Right'), justify: t('Justified') }[a],
          shortcut: mod(`Shift+${{ left: 'L', center: 'E', right: 'R', justify: 'J' }[a]}`),
          run: run((e) => e.chain().focus().setTextAlign(a).run()),
          active: () => editor.isActive({ textAlign: a }),
        })),
      },
      {
        label: t('Line spacing'),
        submenu: LINE_HEIGHTS.map((h) => ({
          label: h === '1' ? t('Single') : h === '2' ? t('Double') : h,
          run: run((e) => e.chain().focus().setLineHeight(h === '1.15' ? null : h).run()),
          active: () => (editor.getAttributes('paragraph').lineHeight ?? editor.getAttributes('heading').lineHeight ?? '1.15') === h,
        })),
      },
      {
        label: t('Lists'),
        submenu: [
          { label: t('Bulleted list'), shortcut: mod('Shift+8'), run: run((e) => e.chain().focus().toggleBulletList().run()), active: () => editor.isActive('bulletList') },
          { label: t('Numbered list'), shortcut: mod('Shift+7'), run: run((e) => e.chain().focus().toggleOrderedList().run()), active: () => editor.isActive('orderedList') },
          { label: t('Checklist'), shortcut: mod('Shift+9'), run: run((e) => e.chain().focus().toggleTaskList().run()), active: () => editor.isActive('taskList') },
        ],
      },
      {
        label: t('Columns'),
        submenu: [
          ...[1, 2, 3].map((n) => ({
            label: n === 1 ? t('One column') : n === 2 ? t('Two columns') : t('Three columns'),
            run: () => dialogs().then((d) => d.columnsDialog(ctx, n)),
            active: () => currentColumns(ctx) === n,
          })),
          '-',
          { label: t('More columns…'), run: () => dialogs().then((d) => d.columnsDialog(ctx)) },
        ],
      },
      { label: t('Increase indent'), shortcut: 'Tab', run: () => indent(editor, 1) },
      { label: t('Decrease indent'), shortcut: 'Shift+Tab', run: () => indent(editor, -1) },
      '-',
      { label: t('Quote'), run: run((e) => e.chain().focus().toggleBlockquote().run()), active: () => editor.isActive('blockquote') },
      { label: t('Code block'), run: run((e) => e.chain().focus().toggleCodeBlock().run()), active: () => editor.isActive('codeBlock') },
      '-',
      { label: t('Clear formatting'), shortcut: mod('\\'), run: () => { clearFormatting(editor); editor.chain().focus().clearNodes().run() } },
    ], editable),
  }

  const table: Menu = {
    label: t('Table'),
    items: guard([
      { label: t('Insert table…'), run: () => dialogs().then((d) => d.insertTableDialog(ctx)), enabled: () => !inTable() },
      '-',
      { label: t('Insert row above'), run: run((e) => e.chain().focus().addRowBefore().run()), enabled: inTable },
      { label: t('Insert row below'), run: run((e) => e.chain().focus().addRowAfter().run()), enabled: inTable },
      { label: t('Insert column left'), run: run((e) => e.chain().focus().addColumnBefore().run()), enabled: inTable },
      { label: t('Insert column right'), run: run((e) => e.chain().focus().addColumnAfter().run()), enabled: inTable },
      '-',
      { label: t('Delete row'), run: run((e) => e.chain().focus().deleteRow().run()), enabled: inTable },
      { label: t('Delete column'), run: run((e) => e.chain().focus().deleteColumn().run()), enabled: inTable },
      { label: t('Delete table'), run: run((e) => e.chain().focus().deleteTable().run()), enabled: inTable },
      '-',
      { label: t('Merge cells'), run: run((e) => e.chain().focus().mergeCells().run()), enabled: can((c) => c.mergeCells()) },
      { label: t('Split cell'), run: run((e) => e.chain().focus().splitCell().run()), enabled: can((c) => c.splitCell()) },
      { label: t('Header row'), run: run((e) => e.chain().focus().toggleHeaderRow().run()), enabled: inTable },
      { label: t('Cell background…'), run: () => dialogs().then((d) => d.cellBackground(ctx)), enabled: inTable },
    ], editable),
  }

  // References: table of contents, citations, bibliography, sources.
  const refs = () => import('./references/ui')
  const styleNames: [CiteStyle, string][] = [
    ['apa', t('APA (7th edition)')],
    ['mla', t('MLA (9th edition)')],
    ['chicago', t('Chicago (author-date)')],
  ]
  const langNames: [CiteLang | undefined, string][] = [
    [undefined, t('Document language')],
    ['es', 'Español'],
    ['gl', 'Galego'],
    ['en', 'English'],
    ['fr', 'Français'],
    ['de', 'Deutsch'],
  ]
  const referencesMenu: Menu = {
    label: t('References'),
    items: [
      ...guard(
        [
          { label: t('Table of contents'), submenu: tocItems(editor) },
          '-',
          { label: t('Insert citation…'), run: () => refs().then((m) => m.citationDialog(ctx)) },
          {
            label: t('Insert bibliography'),
            run: () => editor.chain().focus().insertBibliography(bibliographyTitle(ctx.references.settings())).run(),
          },
          { label: t('Import sources (BibTeX, RIS)…'), run: () => refs().then((m) => m.importSourcesFile(ctx)) },
          '-',
          {
            label: t('Citation style'),
            submenu: styleNames.map(([style, label]) => ({ label, run: () => ctx.references.setStyle(style), active: () => ctx.references.stored().style === style })),
          },
          {
            label: t('Citation language'),
            submenu: langNames.map(([lang, label]) => ({ label, run: () => ctx.references.setLang(lang), active: () => ctx.references.stored().lang === lang })),
          },
          '-',
          { label: t('Footnote…'), shortcut: isMac ? '⌥⌘F' : 'Ctrl+Alt+F', run: () => dialogs().then((d) => d.insertFootnote(ctx)) },
        ],
        editable,
      ),
      { label: t('Sources…'), run: () => refs().then((m) => m.manageSources(ctx)) },
    ],
  }

  // Tools: spelling and grammar, then word count.
  const tools = toolsMenu(ctx.spell)
  tools.items.push('-', { label: t('Word count…'), run: () => dialogs().then((d) => d.wordCount(ctx)) })

  const review: Menu = {
    label: t('Review'),
    items: [
      { label: t('Comment'), shortcut: commentKey, run: comment, enabled: canComment },
      { label: t('Suggest changes'), run: () => ctx.setSuggesting(!ctx.isSuggesting()), active: ctx.isSuggesting, enabled: editable },
      '-',
      { label: t('Next comment or suggestion'), run: () => ctx.review.step(1) },
      { label: t('Previous comment or suggestion'), run: () => ctx.review.step(-1) },
      { label: t('Accept all suggestions'), run: run((e) => e.commands.acceptAllSuggestions()), enabled: editable },
      { label: t('Reject all suggestions'), run: run((e) => e.commands.rejectAllSuggestions()), enabled: editable },
      '-',
      { label: t('Show resolved comments'), run: () => toggleResolved(ctx), active: () => ctx.review.showResolved },
      { label: t('Show authorship'), run: () => ctx.authorship.toggle(), active: () => ctx.authorship.enabled },
      { label: t('Contributions…'), run: ctx.showContributions },
    ],
  }

  // Writer-only keys (the frame registers the common ones).
  document.addEventListener('keydown', (e) => {
    const modKey = e.ctrlKey || e.metaKey
    if (modKey && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      if (editor.isEditable) dialogs().then((d) => d.editLink(ctx))
    } else if (modKey && e.altKey && e.key.toLowerCase() === 'f') {
      e.preventDefault()
      if (editor.isEditable) dialogs().then((d) => d.insertFootnote(ctx))
    } else if (modKey && e.key === '\\') {
      e.preventDefault()
      if (editor.isEditable) clearFormatting(editor)
    }
  })

  return { file, edit, menus: { view, insert, format, app: [table, referencesMenu], tools, review: [review] }, help: { sections: shortcutSections } }
}

function toggleResolved(ctx: WriterContext) {
  ctx.review.showResolved = !ctx.review.showResolved
  ctx.review.refresh()
}

function indent(editor: Editor, dir: 1 | -1) {
  const chain = editor.chain().focus()
  if (editor.isActive('listItem')) (dir > 0 ? chain.sinkListItem('listItem') : chain.liftListItem('listItem')).run()
  else if (editor.isActive('taskItem')) (dir > 0 ? chain.sinkListItem('taskItem') : chain.liftListItem('taskItem')).run()
  else (dir > 0 ? chain.indent() : chain.outdent()).run()
}

function clipboardCommand(editor: Editor, command: 'cut' | 'copy') {
  editor.commands.focus()
  if (!document.execCommand(command)) import('./dialogs').then((d) => d.pasteHint())
}

export function pickImage(editor: Editor): void {
  const input = document.getElementById('image-input') as HTMLInputElement
  input.onchange = () => {
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => editor.chain().focus().setImage({ src: String(reader.result) }).run()
    reader.readAsDataURL(file)
  }
  input.click()
}

// ---------- Toolbar (src/ui/toolbar.ts: one row, "⋯" overflow) ----------

export function buildToolbar(ctx: WriterContext, tb: Toolbar): void {
  const { editor } = ctx
  const button = (node: IconNode, title: string, action: () => void, active?: () => boolean, enabled?: () => boolean, shortcut?: string) =>
    tb.button(node, title, action, { active, enabled, shortcut })
  const select = <T extends string>(title: string, options: [T, string][], value: () => T, onChange: (v: T) => void, cls = '') =>
    tb.select(title, options, value, (v) => {
      onChange(v)
      editor.commands.focus()
    }, cls)

  // Stays usable in read-only documents.
  tb.group(
    { keep: true },
    button(Undo2, t('Undo'), () => editor.chain().focus().undo().run(), undefined, () => editor.isEditable && editor.can().undo(), mod('Z')),
    button(Redo2, t('Redo'), () => editor.chain().focus().redo().run(), undefined, () => editor.isEditable && editor.can().redo(), mod('Y')),
    button(Printer, t('Print'), ctx.print, undefined, undefined, mod('P')),
    button(Search, t('Find and replace'), () => ctx.find.open(true), undefined, undefined, mod('F')),
  )

  tb.group(select(t('Paragraph style'), STYLES, () => currentStyle(editor), (v) => editor.commands.setParagraphStyle(v), 'tb-style'))

  const fontOptions = FONTS.map((f) => [f, f] as [string, string])
  const fontSelect = select(
    t('Font'),
    fontOptions,
    () => editor.getAttributes('textStyle').fontFamily ?? DEFAULT_FONT,
    (v) => (v === DEFAULT_FONT ? editor.chain().focus().unsetFontFamily().run() : editor.chain().focus().setFontFamily(v).run()),
    'tb-font',
  )
  // Fonts coming from imported documents are added to the list on the fly.
  tb.onRefresh(() => {
    const family = editor.getAttributes('textStyle').fontFamily
    if (family && ![...fontSelect.options].some((o) => o.value === family)) fontSelect.append(el('option', { value: family, textContent: family }))
    if (document.activeElement !== fontSelect) fontSelect.value = family ?? DEFAULT_FONT
  })
  tb.group(fontSelect)

  const sizeInput = el('input', { class: 'tb-size', title: t('Font size'), inputMode: 'decimal' })
  sizeInput.setAttribute('aria-label', t('Font size'))
  const sizeList = el('datalist', { id: 'font-sizes' })
  FONT_SIZES.forEach((s) => sizeList.append(el('option', { value: String(s) })))
  sizeInput.setAttribute('list', 'font-sizes')
  sizeInput.addEventListener('change', () => {
    const v = parseFloat(sizeInput.value)
    if (Number.isFinite(v)) setFontSize(editor, v)
  })
  sizeInput.addEventListener('keydown', (e) => e.key === 'Enter' && sizeInput.dispatchEvent(new Event('change')))
  tb.onRefresh(() => {
    if (document.activeElement !== sizeInput) sizeInput.value = String(currentFontSize(editor))
  })
  tb.group(button(Minus, t('Decrease font size'), () => stepFontSize(editor, -1)), sizeInput, sizeList, button(Plus, t('Increase font size'), () => stepFontSize(editor, 1)))

  tb.group(
    button(Bold, t('Bold'), () => editor.chain().focus().toggleBold().run(), () => editor.isActive('bold'), undefined, mod('B')),
    button(Italic, t('Italic'), () => editor.chain().focus().toggleItalic().run(), () => editor.isActive('italic'), undefined, mod('I')),
    button(Underline, t('Underline'), () => editor.chain().focus().toggleUnderline().run(), () => editor.isActive('underline'), undefined, mod('U')),
    button(Strikethrough, t('Strikethrough'), () => editor.chain().focus().toggleStrike().run(), () => editor.isActive('strike')),
    tb.colorButton(
      Baseline,
      t('Text color'),
      () => editor.getAttributes('textStyle').color ?? '#000000',
      (c) => (c ? editor.chain().focus().setColor(c).run() : editor.chain().focus().unsetColor().run()),
      t('Automatic'),
    ),
    tb.colorButton(
      Highlighter,
      t('Highlight color'),
      () => editor.getAttributes('highlight').color,
      (c) => (c ? editor.chain().focus().setHighlight({ color: c }).run() : editor.chain().focus().unsetHighlight().run()),
      t('None'),
    ),
  )

  const tableButton = el('button', { type: 'button', class: 'tb-btn', title: t('Insert table') }, icon(Table))
  tableButton.setAttribute('aria-label', t('Insert table'))
  tableButton.addEventListener('mousedown', (e) => e.preventDefault())
  tableButton.addEventListener('click', () =>
    openPopover(tableButton, tableGrid((rows, cols) => editor.chain().focus().insertTable({ rows, cols, withHeaderRow: false }).run())),
  )
  tb.group(
    button(Link, t('Insert link'), () => dialogs().then((d) => d.editLink(ctx)), () => editor.isActive('link'), undefined, mod('K')),
    button(ImageIcon, t('Insert image'), () => pickImage(editor)),
    tableButton,
  )

  tb.group(
    button(TextAlignStart, t('Align left'), () => editor.chain().focus().setTextAlign('left').run(), () => editor.isActive({ textAlign: 'left' })),
    button(TextAlignCenter, t('Center'), () => editor.chain().focus().setTextAlign('center').run(), () => editor.isActive({ textAlign: 'center' })),
    button(TextAlignEnd, t('Align right'), () => editor.chain().focus().setTextAlign('right').run(), () => editor.isActive({ textAlign: 'right' })),
    button(TextAlignJustify, t('Justify'), () => editor.chain().focus().setTextAlign('justify').run(), () => editor.isActive({ textAlign: 'justify' })),
  )

  const spacingButton = tb.button(ListChevronsUpDown, t('Line spacing'), () => {
    const list = el('div', { class: 'menu-list' })
    for (const h of LINE_HEIGHTS) {
      const item = el('button', { type: 'button', class: 'menu-row', textContent: h === '1' ? t('Single') : h === '2' ? t('Double') : h })
      item.addEventListener('mousedown', (e) => e.preventDefault())
      item.addEventListener('click', () => {
        closePopover()
        editor.chain().focus().setLineHeight(h === '1.15' ? null : h).run()
      })
      list.append(item)
    }
    openPopover(spacingButton, list)
  })

  tb.group(
    spacingButton,
    button(List, t('Bulleted list'), () => editor.chain().focus().toggleBulletList().run(), () => editor.isActive('bulletList')),
    button(ListOrdered, t('Numbered list'), () => editor.chain().focus().toggleOrderedList().run(), () => editor.isActive('orderedList')),
    button(ListChecks, t('Checklist'), () => editor.chain().focus().toggleTaskList().run(), () => editor.isActive('taskList')),
    button(ListIndentDecrease, t('Decrease indent'), () => indent(editor, -1)),
    button(ListIndentIncrease, t('Increase indent'), () => indent(editor, 1)),
  )

  tb.group(
    button(RemoveFormatting, t('Clear formatting'), () => clearFormatting(editor), undefined, undefined, mod('\\')),
    button(Sigma, t('Insert equation'), () => ctx.insertEquation(false)),
  )

  // Review tools stay available to commenters, pinned at the right end.
  const commentButton = button(MessageSquarePlus, t('Comment'), () => ctx.review.startComment(), undefined, undefined, isMac ? '⌥⌘M' : mod('Alt+M'))
  commentButton.disabled = ctx.access === 'view'
  const reviewItems: HTMLElement[] = [commentButton]
  if (ctx.access === 'edit') {
    reviewItems.push(
      select(
        t('Mode'),
        [
          ['editing', t('Editing')],
          ['suggesting', t('Suggesting')],
        ],
        () => (ctx.isSuggesting() ? 'suggesting' : 'editing'),
        (v) => ctx.setSuggesting(v === 'suggesting'),
        'tb-mode',
      ),
    )
  }
  tb.group({ pinned: true, keep: true, class: 'tb-review' }, ...reviewItems)
  if (ctx.access !== 'edit') tb.element.classList.add('readonly')

  editor.on('transaction', tb.refresh)
  tb.refresh()
  tb.layout()
}

// ---------- Context menu ----------

export function setupContextMenu(ctx: WriterContext): void {
  const { editor } = ctx
  editor.view.dom.addEventListener('contextmenu', (e) => {
    // Keep the native menu (spelling suggestions) when Shift is held.
    if (e.shiftKey) return
    e.preventDefault()
    const pos = editor.view.posAtCoords({ left: e.clientX, top: e.clientY })
    const { from, to } = editor.state.selection
    if (editor.isEditable && pos && (pos.pos < from || pos.pos > to)) editor.commands.setTextSelection(pos.pos)
    if (!editor.isEditable) {
      const sel = window.getSelection()
      const hasText = !editor.state.selection.empty || (!!sel && !sel.isCollapsed)
      showContextMenu(e.clientX, e.clientY, [
        { label: t('Copy'), shortcut: mod('C'), run: () => clipboardCommand(editor, 'copy'), enabled: () => hasText },
        { label: t('Comment'), shortcut: isMac ? '⌥⌘M' : 'Ctrl+Alt+M', run: () => ctx.review.startComment(), enabled: () => hasText && ctx.access !== 'view' },
      ])
      return
    }
    const items: MenuEntry[] = [
      { label: t('Comment'), shortcut: isMac ? '⌥⌘M' : 'Ctrl+Alt+M', run: () => ctx.review.startComment(), enabled: () => !editor.state.selection.empty },
      '-',
      { label: t('Cut'), shortcut: mod('X'), run: () => clipboardCommand(editor, 'cut'), enabled: () => !editor.state.selection.empty },
      { label: t('Copy'), shortcut: mod('C'), run: () => clipboardCommand(editor, 'copy'), enabled: () => !editor.state.selection.empty },
      { label: t('Paste'), shortcut: mod('V'), run: () => dialogs().then((d) => d.pasteHint()) },
      '-',
      editor.isActive('link')
        ? { label: t('Edit link…'), run: () => dialogs().then((d) => d.editLink(ctx)) }
        : { label: t('Insert link…'), shortcut: mod('K'), run: () => dialogs().then((d) => d.editLink(ctx)) },
      ...(editor.isActive('link') ? [{ label: t('Remove link'), run: () => editor.chain().focus().extendMarkRange('link').unsetLink().run() }] : []),
      { label: t('Insert footnote…'), run: () => dialogs().then((d) => d.insertFootnote(ctx)) },
    ]
    if (editor.isActive('table')) {
      items.push(
        '-',
        { label: t('Insert row above'), run: () => editor.chain().focus().addRowBefore().run() },
        { label: t('Insert row below'), run: () => editor.chain().focus().addRowAfter().run() },
        { label: t('Insert column left'), run: () => editor.chain().focus().addColumnBefore().run() },
        { label: t('Insert column right'), run: () => editor.chain().focus().addColumnAfter().run() },
        { label: t('Delete row'), run: () => editor.chain().focus().deleteRow().run() },
        { label: t('Delete column'), run: () => editor.chain().focus().deleteColumn().run() },
        { label: t('Merge cells'), run: () => editor.chain().focus().mergeCells().run(), enabled: () => editor.can().mergeCells() },
        { label: t('Split cell'), run: () => editor.chain().focus().splitCell().run(), enabled: () => editor.can().splitCell() },
        { label: t('Cell background…'), run: () => dialogs().then((d) => d.cellBackground(ctx)) },
        { label: t('Delete table'), run: () => editor.chain().focus().deleteTable().run() },
      )
    }
    items.push('-', { label: t('Clear formatting'), shortcut: mod('\\'), run: () => clearFormatting(editor) })
    // On a spelling or grammar issue, its suggestions come first.
    const x = e.clientX
    const y = e.clientY
    if (pos) void contextMenuFor(ctx.spell, pos.pos, x, y, items).then((shown) => shown || showContextMenu(x, y, items))
    else showContextMenu(x, y, items)
  })
}
