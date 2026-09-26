// Extension sets shared by the body editor, header/footer editors and the
// file converters (which need the same schema).

import type { AnyExtension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle, Color, FontFamily, FontSize } from '@tiptap/extension-text-style'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import { TableKit } from '@tiptap/extension-table'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import { CharacterCount, Placeholder } from '@tiptap/extensions'
import { CellBackground, Footnote, PageBreak, PageBreakShortcut, PageNumber, ParagraphFormat, SectionBreak } from './nodes'
import { Equation } from './equation'
import { TableOfContents, type TocOptions } from './toc'
import { Bibliography, Citation } from '../references/nodes'
import { Suggesting } from './suggestions'
import { CommentRange } from './comment-range'
import { ParagraphLanguage } from '../spell/lang'

// Stores the plain font name but renders it with a generic fallback, so documents
// using fonts that are not installed still look close to the original.
const FontFamilyWithFallback = FontFamily.extend({
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontFamily: {
            default: null,
            parseHTML: (el: HTMLElement) => el.style.fontFamily?.split(',')[0].replace(/['"]/g, '').trim() || null,
            renderHTML: (attrs: Record<string, unknown>) =>
              attrs.fontFamily ? { style: `font-family: ${fontStack(String(attrs.fontFamily))}` } : {},
          },
        },
      },
    ]
  },
})

export function fontStack(name: string): string {
  const generic = /mono|courier|consolas|menlo/i.test(name)
    ? 'monospace'
    : /times|georgia|garamond|cambria|serif|book|palatino/i.test(name) && !/sans/i.test(name)
      ? 'serif'
      : 'sans-serif'
  const metricCompatible: Record<string, string> = {
    calibri: 'Carlito',
    cambria: 'Caladea',
    arial: 'Liberation Sans',
    'times new roman': 'Liberation Serif',
    'courier new': 'Liberation Mono',
  }
  const alt = metricCompatible[name.toLowerCase()]
  return [`"${name}"`, alt && `"${alt}"`, generic].filter(Boolean).join(', ')
}

interface Options {
  // Collaboration replaces the local undo history.
  history?: boolean
  placeholder?: string
  // Page numbers and default title for tables of contents (body editor only).
  toc?: Partial<TocOptions>
}

function common(options: Options): AnyExtension[] {
  return [
    StarterKit.configure({
      undoRedo: options.history === false ? false : undefined,
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      codeBlock: { HTMLAttributes: { spellcheck: 'false' } },
    }),
    TextStyle,
    Color,
    FontFamilyWithFallback,
    FontSize,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
    Subscript,
    Superscript,
    ParagraphFormat,
    ParagraphLanguage,
    ...(options.placeholder ? [Placeholder.configure({ placeholder: options.placeholder })] : []),
  ]
}

export function bodyExtensions(options: Options = {}): AnyExtension[] {
  return [
    ...common(options),
    Image.configure({ inline: true, allowBase64: true, resize: { enabled: true, alwaysPreserveAspectRatio: true, minWidth: 24, minHeight: 24 } }),
    TableKit.configure({ table: { resizable: true, cellMinWidth: 40 } }),
    CellBackground,
    TaskList,
    TaskItem.configure({ nested: true }),
    PageBreak,
    PageBreakShortcut,
    SectionBreak,
    options.toc ? TableOfContents.configure(options.toc) : TableOfContents,
    Citation,
    Bibliography,
    Footnote,
    Equation,
    Suggesting,
    CommentRange,
    CharacterCount,
  ]
}

export function headerFooterExtensions(options: Options = {}): AnyExtension[] {
  return [...common(options), Image.configure({ inline: true, allowBase64: true }), PageNumber]
}

// Schema-only set for converters: every node type that can appear anywhere.
export function allExtensions(): AnyExtension[] {
  return [...bodyExtensions(), PageNumber]
}
