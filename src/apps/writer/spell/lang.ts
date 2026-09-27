// Paragraph language: a `lang` attribute on paragraphs and headings (a
// regional variant, "en-GB"), rendered as the HTML lang attribute (used by the
// checker, screen readers and hyphenation) and written to DOCX (w:lang) and
// ODT (fo:language / fo:country).

import { Extension } from '@tiptap/core'
import { normalizeTag } from '../../../core/spell/variants'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphLanguage: { setParagraphLanguage: (lang: string | null) => ReturnType }
  }
}

const TYPES = ['paragraph', 'heading']

export const ParagraphLanguage = Extension.create({
  name: 'paragraphLanguage',
  addGlobalAttributes: () => [
    {
      types: TYPES,
      attributes: {
        lang: {
          default: null,
          parseHTML: (el) => normalizeTag(el.getAttribute('lang')),
          renderHTML: (attrs) => (attrs.lang ? { lang: normalizeTag(attrs.lang) ?? attrs.lang } : {}),
        },
      },
    },
  ],
  addCommands() {
    return {
      setParagraphLanguage:
        (lang) =>
        ({ tr, state, dispatch }) => {
          const { from, to } = state.selection
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (TYPES.includes(node.type.name) && node.attrs.lang !== lang) tr.setNodeMarkup(pos, undefined, { ...node.attrs, lang })
          })
          if (dispatch) dispatch(tr)
          return true
        },
    }
  },
})
