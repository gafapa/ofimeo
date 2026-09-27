// Math graphs in the writer: an image whose title keeps the construction as
// JSON ("ofimeo-graph:{…}"), so DOCX and ODT keep it (picture title) and
// re-importing restores an editable graph. The picture (PNG) and the JSON are
// node attributes, so they sync through Yjs like any image. In the page the
// JSON is rendered as data-graph instead of a title tooltip. Double click (or
// Enter when selected) opens the graph editor; read-only for viewers.

import type { Editor } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import { Plugin } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import { TITLE_PREFIX } from '../../../ui/mathgraph/model'

export const isGraphTitle = (title: unknown): title is string => typeof title === 'string' && title.startsWith(TITLE_PREFIX)

export const GraphImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      title: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const graph = el.getAttribute('data-graph')
          return graph ? TITLE_PREFIX + graph : el.getAttribute('title')
        },
        renderHTML: (attrs: Record<string, unknown>) =>
          isGraphTitle(attrs.title) ? { 'data-graph': attrs.title.slice(TITLE_PREFIX.length), class: 'math-graph' } : attrs.title ? { title: attrs.title } : {},
      },
    }
  },
  renderMarkdown: (node: { attrs?: Record<string, unknown> }) => {
    const src = String(node.attrs?.src ?? '')
    const alt = String(node.attrs?.alt ?? '')
    const title = node.attrs?.title
    return title && !isGraphTitle(title) ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`
  },
  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        props: {
          handleDoubleClickOn: (_view, _pos, node, nodePos) => {
            if (node.type.name !== this.name || !isGraphTitle(node.attrs.title)) return false
            void editGraphAt(editor, nodePos)
            return true
          },
        },
      }),
    ]
  },
  addKeyboardShortcuts() {
    return {
      ...(this.parent?.() ?? {}),
      Enter: () => {
        const node = (this.editor.state.selection as { node?: PMNode }).node
        if (node?.type.name !== this.name || !isGraphTitle(node.attrs.title)) return false
        void editGraphAt(this.editor, this.editor.state.selection.from)
        return true
      },
    }
  },
})

// Insert ▸ Math graph…
export async function insertMathGraph(editor: Editor, geometry = false): Promise<void> {
  if (!editor.isEditable) return
  const { from, to } = editor.state.selection
  const { editGraph } = await import('../../../ui/mathgraph/editor')
  const result = await editGraph({ geometry })
  if (!result) return
  editor
    .chain()
    .focus()
    .insertContentAt({ from, to }, {
      type: 'image',
      attrs: { src: result.png, alt: result.alt, title: TITLE_PREFIX + JSON.stringify(result.doc), width: result.width, height: result.height },
    })
    .run()
}

export async function editGraphAt(editor: Editor, pos: number): Promise<void> {
  const node = editor.state.doc.nodeAt(pos)
  if (!node || !isGraphTitle(node.attrs.title)) return
  const [{ editGraph }, { parseGraph }] = await Promise.all([import('../../../ui/mathgraph/editor'), import('../../../ui/mathgraph/model')])
  const graph = parseGraph(node.attrs.title)
  if (!graph) return
  const readOnly = !editor.isEditable
  const result = await editGraph({ graph, readOnly })
  if (!result || readOnly) return
  // The node may have moved while the dialog was open (collaborators typing).
  let at = editor.state.doc.nodeAt(pos) === node ? pos : -1
  if (at < 0) {
    editor.state.doc.descendants((n, p) => {
      if (at >= 0) return false
      if (n.type.name === 'image' && n.attrs.title === node.attrs.title) at = p
    })
  }
  if (at < 0) return
  const current = editor.state.doc.nodeAt(at)!
  // Keep a width the user set by resizing; the height follows the graph's proportions.
  const sizeChanged = graph.width !== result.width || graph.height !== result.height
  const width = !sizeChanged && current.attrs.width ? Number(current.attrs.width) : result.width
  const height = Math.round((width * result.height) / result.width)
  editor
    .chain()
    .focus()
    .command(({ tr }) => {
      tr.setNodeMarkup(at, undefined, { ...current.attrs, src: result.png, alt: result.alt, title: TITLE_PREFIX + JSON.stringify(result.doc), width, height })
      return true
    })
    .run()
}
