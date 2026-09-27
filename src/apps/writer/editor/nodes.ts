// Custom document nodes and paragraph attributes for a word-processor schema.

import { Extension, Node, mergeAttributes } from '@tiptap/core'
import { t } from '../../../core/i18n'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageBreak: { setPageBreak: () => ReturnType }
    sectionBreak: { insertSectionBreak: (attrs: Record<string, unknown>) => ReturnType }
    footnote: { insertFootnote: (content: string) => ReturnType }
    pageNumber: { insertPageNumber: (kind: 'page' | 'total') => ReturnType }
    paragraphFormat: {
      indent: () => ReturnType
      outdent: () => ReturnType
      setLineHeight: (value: string | null) => ReturnType
      setParagraphStyle: (style: ParagraphStyle) => ReturnType
    }
  }
}

export const INDENT_CM = 1.27
export const MAX_INDENT = 8

export type ParagraphStyle = 'normal' | 'title' | 'subtitle' | 'h1' | 'h2' | 'h3' | 'h4'

// Hard page break, like Ctrl+Enter in Word.
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML: () => [{ tag: 'div[data-page-break]' }, { tag: 'hr[data-page-break]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-page-break': '', class: 'page-break' })],
  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ chain }) =>
          chain().insertContent([{ type: this.name }, { type: 'paragraph' }]).run(),
    }
  },
})

// Section break: starts a new section (on a new page or continuous) whose page
// setup and columns are the node's attributes (see formats/types.ts sectionAttrs).
const SECTION_ATTRS: Record<string, unknown> = {
  start: 'nextPage',
  size: 'A4',
  orientation: 'portrait',
  marginTop: 25,
  marginRight: 25,
  marginBottom: 25,
  marginLeft: 25,
  columns: 1,
  columnGap: 12.5,
  columnSeparator: false,
}

export const SectionBreak = Node.create({
  name: 'sectionBreak',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes: () =>
    Object.fromEntries(
      Object.entries(SECTION_ATTRS).map(([name, def]) => [
        name,
        {
          default: def,
          parseHTML: (el: HTMLElement) => {
            const raw = el.getAttribute(`data-${name.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}`)
            if (raw === null) return def
            return typeof def === 'number' ? Number(raw) || def : typeof def === 'boolean' ? raw === 'true' : raw
          },
          renderHTML: (attrs: Record<string, unknown>) => ({ [`data-${name.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}`]: String(attrs[name]) }),
        },
      ]),
    ),
  parseHTML: () => [{ tag: 'div[data-section-break]' }],
  renderHTML: ({ node, HTMLAttributes }) => [
    'div',
    mergeAttributes(HTMLAttributes, {
      'data-section-break': '',
      class: 'section-break',
      'data-label': node.attrs.start === 'continuous' ? t('Section break (continuous)') : t('Section break (next page)'),
    }),
  ],
  addCommands() {
    return {
      insertSectionBreak:
        (attrs) =>
        ({ chain }) =>
          chain().insertContent([{ type: this.name, attrs }, { type: 'paragraph' }]).run(),
    }
  },
})

// Mod-Enter inserts a page break (as in Word); high priority beats HardBreak's binding.
export const PageBreakShortcut = Extension.create({
  name: 'pageBreakShortcut',
  priority: 1000,
  addKeyboardShortcuts() {
    return { 'Mod-Enter': () => this.editor.commands.setPageBreak() }
  },
})

// Footnote reference; the note text lives in the `content` attribute.
// Numbers are rendered with a CSS counter, so they renumber automatically.
export const Footnote = Node.create({
  name: 'footnote',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({
    content: {
      default: '',
      parseHTML: (el) => el.getAttribute('data-footnote') ?? '',
      renderHTML: (attrs) => ({ 'data-footnote': attrs.content, title: attrs.content }),
    },
  }),
  parseHTML: () => [{ tag: 'sup[data-footnote]' }],
  renderHTML: ({ HTMLAttributes }) => ['sup', mergeAttributes(HTMLAttributes, { class: 'footnote-ref' })],
  addCommands() {
    return {
      insertFootnote:
        (content) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { content } }),
    }
  },
})

// Page number / page count field, used in headers and footers.
export const PageNumber = Node.create({
  name: 'pageNumber',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes: () => ({
    kind: {
      default: 'page',
      parseHTML: (el) => el.getAttribute('data-kind') ?? 'page',
      renderHTML: (attrs) => ({ 'data-kind': attrs.kind }),
    },
  }),
  parseHTML: () => [{ tag: 'span[data-page-field]' }],
  renderHTML: ({ node, HTMLAttributes }) => [
    'span',
    mergeAttributes(HTMLAttributes, { 'data-page-field': '', class: 'page-field' }),
    node.attrs.kind === 'total' ? '#pages' : '#',
  ],
  addCommands() {
    return {
      insertPageNumber:
        (kind) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { kind } }),
    }
  },
})

const BLOCK_TYPES = ['paragraph', 'heading']

// Paragraph-level formatting: indentation, line spacing and named styles.
export const ParagraphFormat = Extension.create({
  name: 'paragraphFormat',
  addGlobalAttributes: () => [
    {
      types: BLOCK_TYPES,
      attributes: {
        indent: {
          default: 0,
          parseHTML: (el) => Number(el.getAttribute('data-indent')) || 0,
          renderHTML: (attrs) =>
            attrs.indent ? { 'data-indent': attrs.indent, style: `margin-left: ${(attrs.indent * INDENT_CM).toFixed(2)}cm` } : {},
        },
        lineHeight: {
          default: null,
          parseHTML: (el) => el.style.lineHeight || null,
          renderHTML: (attrs) => (attrs.lineHeight ? { style: `line-height: ${attrs.lineHeight}` } : {}),
        },
      },
    },
    {
      types: ['paragraph'],
      attributes: {
        styleId: {
          default: null,
          parseHTML: (el) => el.getAttribute('data-style'),
          renderHTML: (attrs) => (attrs.styleId ? { 'data-style': attrs.styleId, class: `style-${attrs.styleId}` } : {}),
        },
      },
    },
  ],
  addCommands() {
    const change =
      (delta: number) =>
      () =>
      ({ tr, state, dispatch }: { tr: import('@tiptap/pm/state').Transaction; state: import('@tiptap/pm/state').EditorState; dispatch?: unknown }) => {
        let changed = false
        state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
          if (!BLOCK_TYPES.includes(node.type.name)) return
          const indent = Math.max(0, Math.min(MAX_INDENT, (node.attrs.indent || 0) + delta))
          if (indent !== node.attrs.indent) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent })
            changed = true
          }
        })
        if (changed && dispatch) (dispatch as (tr: unknown) => void)(tr)
        return changed
      }
    return {
      indent: change(1),
      outdent: change(-1),
      setLineHeight:
        (value) =>
        ({ commands }) =>
          BLOCK_TYPES.map((type) => commands.updateAttributes(type, { lineHeight: value })).some(Boolean),
      setParagraphStyle:
        (style) =>
        ({ chain }) => {
          const c = chain().focus()
          if (style.startsWith('h')) return c.setHeading({ level: Number(style.slice(1)) as 1 | 2 | 3 | 4 }).run()
          return c
            .setParagraph()
            .updateAttributes('paragraph', { styleId: style === 'normal' ? null : style })
            .run()
        },
    }
  },
  addKeyboardShortcuts() {
    // Tab indents paragraphs; inside lists and tables the list/table keymaps win.
    return {
      Tab: () => (this.editor.isActive('listItem') || this.editor.isActive('taskItem') || this.editor.isActive('table') ? false : this.editor.commands.indent()),
      'Shift-Tab': () =>
        this.editor.isActive('listItem') || this.editor.isActive('taskItem') || this.editor.isActive('table') ? false : this.editor.commands.outdent(),
    }
  },
})

// Background color for table cells.
export const CellBackground = Extension.create({
  name: 'cellBackground',
  addGlobalAttributes: () => [
    {
      types: ['tableCell', 'tableHeader'],
      attributes: {
        backgroundColor: {
          default: null,
          parseHTML: (el) => el.getAttribute('data-bg') || el.style.backgroundColor || null,
          renderHTML: (attrs) =>
            attrs.backgroundColor ? { 'data-bg': attrs.backgroundColor, style: `background-color: ${attrs.backgroundColor}` } : {},
        },
      },
    },
  ],
})
