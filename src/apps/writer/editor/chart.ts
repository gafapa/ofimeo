// Chart node: a chart (sheet chart model + data snapshot, see
// src/apps/charts/embedded.ts) drawn as a picture with an optional caption.
// The node keeps everything needed to draw it, so collaborators and exports
// do not need the source spreadsheet. Editors resize it with the corner
// handle; double click (or Enter) asks the app to edit it and the "Update"
// button to refresh a linked chart ('chart-edit' / 'chart-refresh' events).

import { Node, mergeAttributes } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { t } from '../../../core/i18n'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    chart: { insertChart: (attrs: { chart: string; width?: number; height?: number; caption?: string }) => ReturnType }
  }
}

export interface ChartEventDetail {
  pos: number
}

export const CHART_WIDTH = 480
export const CHART_HEIGHT = 300

export const ChartNode = Node.create({
  name: 'chart',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes: () => ({
    chart: {
      default: '',
      parseHTML: (el) => el.getAttribute('data-chart') ?? '',
      renderHTML: (attrs) => ({ 'data-chart': attrs.chart }),
    },
    width: {
      default: CHART_WIDTH,
      parseHTML: (el) => Number(el.getAttribute('data-width')) || CHART_WIDTH,
      renderHTML: (attrs) => ({ 'data-width': String(attrs.width) }),
    },
    height: {
      default: CHART_HEIGHT,
      parseHTML: (el) => Number(el.getAttribute('data-height')) || CHART_HEIGHT,
      renderHTML: (attrs) => ({ 'data-height': String(attrs.height) }),
    },
    caption: {
      default: '',
      parseHTML: (el) => el.querySelector('figcaption')?.textContent ?? '',
      renderHTML: () => ({}),
    },
  }),
  parseHTML: () => [{ tag: 'figure[data-chart]' }],
  // Plain HTML (copy, .html download): the figure with its caption; the picture is drawn by the node view.
  renderHTML: ({ node, HTMLAttributes }) => [
    'figure',
    mergeAttributes(HTMLAttributes, { class: 'chart-figure' }),
    ['div', { class: 'chart-box', style: `width:${node.attrs.width}px;height:${node.attrs.height}px` }],
    ...(node.attrs.caption ? [['figcaption', {}, node.attrs.caption]] : []),
  ],
  renderText: ({ node }) => (node.attrs.caption ? `[${node.attrs.caption}]` : ''),
  addNodeView() {
    return ({ node, getPos, editor }) => {
      let current = node
      const dom = document.createElement('figure')
      dom.className = 'chart-figure'
      dom.setAttribute('data-chart', '')
      dom.contentEditable = 'false'
      const box = document.createElement('div')
      box.className = 'chart-box'
      const img = document.createElement('img')
      img.className = 'chart-img'
      img.draggable = false
      box.append(img)
      const caption = document.createElement('figcaption')
      const tools = document.createElement('div')
      tools.className = 'chart-tools'
      const button = (label: string, event: string) => {
        const b = document.createElement('button')
        b.type = 'button'
        b.textContent = label
        b.addEventListener('mousedown', (e) => e.preventDefault())
        b.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          dispatch(event)
        })
        return b
      }
      const edit = button(t('Edit chart…'), 'chart-edit')
      const refresh = button(t('Update from source'), 'chart-refresh')
      tools.append(edit, refresh)
      const handle = document.createElement('span')
      handle.className = 'chart-resize'
      handle.title = t('Resize')
      box.append(handle)
      dom.append(box, caption, tools)

      const pos = () => (typeof getPos === 'function' ? getPos() : undefined)
      const dispatch = (event: string) => {
        const p = pos()
        if (p === undefined) return
        editor.view.dom.dispatchEvent(new CustomEvent<ChartEventDetail>(event, { detail: { pos: p } }))
      }

      let drawn = ''
      let seq = 0
      const draw = async () => {
        const { chart, width, height } = current.attrs
        box.style.width = `${width}px`
        box.style.height = `${height}px`
        caption.textContent = current.attrs.caption
        caption.hidden = !current.attrs.caption
        const key = `${chart}|${width}|${height}`
        const { readEmbedded, chartSvg, svgDataUrl, sourceLabel } = await import('../../charts/embedded')
        const data = readEmbedded(chart)
        refresh.hidden = !data?.source || !editor.isEditable
        edit.hidden = !editor.isEditable
        dom.title = data ? sourceLabel(data) : ''
        if (key === drawn) return
        drawn = key
        const mine = ++seq
        dom.setAttribute('data-pending', '')
        try {
          if (!data) {
            img.removeAttribute('src')
            img.alt = t('Chart')
            return
          }
          const svg = await chartSvg(data, width, height, 2)
          if (mine !== seq) return
          img.alt = data.spec.title || current.attrs.caption || t('Chart')
          img.src = svgDataUrl(svg)
          await img.decode().catch(() => undefined)
        } finally {
          if (mine === seq) dom.removeAttribute('data-pending')
        }
      }
      void draw()

      dom.addEventListener('dblclick', (e) => {
        if (!editor.isEditable || (e.target as HTMLElement).closest('.chart-tools')) return
        e.preventDefault()
        dispatch('chart-edit')
      })

      // Corner handle: drag to resize (keeps within 60–1200 px).
      handle.addEventListener('pointerdown', (e) => {
        if (!editor.isEditable) return
        e.preventDefault()
        e.stopPropagation()
        const scale = dom.getBoundingClientRect().width / (dom.offsetWidth || 1) || 1
        const start = { x: e.clientX, y: e.clientY, w: Number(current.attrs.width), h: Number(current.attrs.height) }
        let size = { w: start.w, h: start.h }
        handle.setPointerCapture(e.pointerId)
        const move = (ev: PointerEvent) => {
          size = {
            w: Math.round(Math.min(1200, Math.max(120, start.w + (ev.clientX - start.x) / scale))),
            h: Math.round(Math.min(1200, Math.max(80, start.h + (ev.clientY - start.y) / scale))),
          }
          box.style.width = `${size.w}px`
          box.style.height = `${size.h}px`
        }
        const up = () => {
          handle.removeEventListener('pointermove', move)
          handle.removeEventListener('pointerup', up)
          const p = pos()
          if (p === undefined || (size.w === start.w && size.h === start.h)) return
          editor.chain().command(({ tr }) => {
            tr.setNodeMarkup(p, undefined, { ...current.attrs, width: size.w, height: size.h })
            return true
          }).run()
        }
        handle.addEventListener('pointermove', move)
        handle.addEventListener('pointerup', up)
      })

      return {
        dom,
        update: (next: PMNode) => {
          if (next.type !== current.type) return false
          current = next
          void draw()
          return true
        },
        selectNode: () => dom.classList.add('ProseMirror-selectednode'),
        deselectNode: () => dom.classList.remove('ProseMirror-selectednode'),
        stopEvent: (e: Event) => !!(e.target as HTMLElement).closest?.('.chart-tools, .chart-resize'),
        ignoreMutation: () => true,
      }
    }
  },
  addCommands() {
    return {
      insertChart:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    }
  },
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { selection } = this.editor.state
        const node = (selection as { node?: PMNode }).node
        if (node?.type.name !== this.name || !this.editor.isEditable) return false
        this.editor.view.dom.dispatchEvent(new CustomEvent<ChartEventDetail>('chart-edit', { detail: { pos: selection.from } }))
        return true
      },
    }
  },
})
