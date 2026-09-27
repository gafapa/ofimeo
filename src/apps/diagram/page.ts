// Page settings of the diagram app: background color and page size of each
// page (stored with the page, round-tripped as draw.io's mxGraphModel
// background / pageWidth / pageHeight), and the page view, a per-browser view
// option that shows the printable pages like draw.io.

import { InternalEvent } from '@maxgraph/core'
import { t } from '../../core/i18n'
import { colorPalette, el, openPopover, type MenuEntry } from '../../ui/widgets'
import type { DiagramEditor } from './editor'

const PAGE_VIEW_KEY = 'diagram-page-view'
// draw.io's page formats (px at 100 dpi), portrait.
export const PAGE_FORMATS: [string, string, number, number][] = [
  ['letter', 'US Letter', 850, 1100],
  ['legal', 'US Legal', 850, 1400],
  ['tabloid', 'US Tabloid', 1100, 1700],
  ['a3', 'A3', 1169, 1654],
  ['a4', 'A4', 827, 1169],
  ['a5', 'A5', 583, 827],
  ['16:9', '16:9', 1600, 900],
  ['4:3', '4:3', 1600, 1200],
]
const DEFAULT_SIZE: [number, number] = [850, 1100]

export type PageSettings = ReturnType<typeof createPageSettings>

export function createPageSettings(editor: DiagramEditor, canvas: HTMLElement) {
  const { graph, sync, view } = editor
  const frame = el('div', { class: 'diagram-page', hidden: true })
  canvas.prepend(frame)
  let pageView = false
  try {
    pageView = localStorage.getItem(PAGE_VIEW_KEY) === '1'
  } catch {
    // No storage: page view off.
  }

  const attrs = () => sync.pageAttrs()
  // The page background, or null when transparent (shown and exported white).
  const background = (id?: string): string | null => {
    const bg = sync.pageAttrs(id).background
    return bg && bg !== 'none' ? bg : null
  }
  const size = (): [number, number] => [attrs().pageWidth ?? DEFAULT_SIZE[0], attrs().pageHeight ?? DEFAULT_SIZE[1]]

  const update = () => {
    const bg = background() ?? '#ffffff'
    canvas.classList.toggle('page-view', pageView)
    frame.hidden = !pageView
    if (!pageView) {
      canvas.style.backgroundColor = bg
      return
    }
    canvas.style.backgroundColor = ''
    frame.style.backgroundColor = bg
    const s = view.scale
    const tr = view.translate
    const [pw, ph] = size()
    // Enough pages to hold the content, starting at the page with the origin.
    const b = graph.getGraphBounds()
    const x = b.width ? b.x / s - tr.x : 0
    const y = b.width ? b.y / s - tr.y : 0
    const c0 = Math.min(0, Math.floor(x / pw))
    const r0 = Math.min(0, Math.floor(y / ph))
    const c1 = Math.max(1, Math.ceil((x + (b.width ? b.width / s : 0)) / pw))
    const r1 = Math.max(1, Math.ceil((y + (b.width ? b.height / s : 0)) / ph))
    frame.style.left = `${(c0 * pw + tr.x) * s}px`
    frame.style.top = `${(r0 * ph + tr.y) * s}px`
    frame.style.width = `${(c1 - c0) * pw * s}px`
    frame.style.height = `${(r1 - r0) * ph * s}px`
    frame.style.setProperty('--page-w', `${pw * s}px`)
    frame.style.setProperty('--page-h', `${ph * s}px`)
    // Keeps the grid aligned with the graph origin.
    frame.style.backgroundPosition = `${-c0 * pw * s}px ${-r0 * ph * s}px`
  }
  for (const event of [InternalEvent.SCALE, InternalEvent.TRANSLATE, InternalEvent.SCALE_AND_TRANSLATE]) view.addListener(event, update)
  graph.getDataModel().addListener(InternalEvent.CHANGE, () => pageView && update())

  const setBackground = (color: string | null) => !editor.readOnly && sync.setPageAttrs({ background: color })
  const setSize = (w: number, h: number) => !editor.readOnly && sync.setPageAttrs({ pageWidth: Math.round(w), pageHeight: Math.round(h) })
  const setPageView = (on: boolean) => {
    pageView = on
    try {
      localStorage.setItem(PAGE_VIEW_KEY, on ? '1' : '0')
    } catch {
      // Not remembered.
    }
    update()
    editor.format.render()
  }
  const chooseBackground = (anchor: HTMLElement) => openPopover(anchor, colorPalette(setBackground, t('No background')))
  const landscape = () => size()[0] > size()[1]
  const formatId = () => {
    const [w, h] = size()
    return PAGE_FORMATS.find(([, , fw, fh]) => (fw === w && fh === h) || (fw === h && fh === w))?.[0] ?? 'custom'
  }
  const setFormat = (id: string, wide = landscape()) => {
    const f = PAGE_FORMATS.find(([fid]) => fid === id)
    if (!f) return
    const [, , w, h] = f
    // 16:9 and 4:3 are landscape formats.
    const across = w > h ? !wide : wide
    setSize(across ? h : w, across ? w : h)
  }
  const setLandscape = (wide: boolean) => {
    const [w, h] = size()
    if (wide !== w > h) setSize(h, w)
  }

  // ---------- Menus ----------

  const menu = (anchor: () => HTMLElement): MenuEntry[] => [
    { label: t('Background color…'), run: () => chooseBackground(anchor()), enabled: editor.editable() },
    { label: t('Remove background'), run: () => setBackground(null), enabled: editor.editable(() => !!background()) },
    {
      label: t('Page size'),
      enabled: editor.editable(),
      submenu: [
        ...PAGE_FORMATS.map(([id, name]): MenuEntry => ({ label: name, run: () => setFormat(id), active: () => formatId() === id })),
        '-',
        { label: t('Portrait'), run: () => setLandscape(false), active: () => !landscape() },
        { label: t('Landscape'), run: () => setLandscape(true), active: () => landscape() },
      ],
    },
  ]
  const viewMenu = (): MenuEntry[] => [{ label: t('Page view'), run: () => setPageView(!pageView), active: () => pageView }]

  // ---------- Format panel (nothing selected) ----------

  const formatRows = (): HTMLElement[] => {
    const row = (label: string, control: HTMLElement) => el('label', { class: 'fmt-row' }, el('span', { class: 'fmt-label', textContent: label }), control)
    const bg = background()
    const swatch = el('span', { class: 'fmt-swatch' })
    swatch.style.background = bg ?? 'transparent'
    swatch.classList.toggle('none', !bg)
    const bgBtn = el('button', { type: 'button', class: 'fmt-color', disabled: editor.readOnly }, swatch, el('span', { textContent: bg ?? t('None') }))
    bgBtn.addEventListener('click', () => chooseBackground(bgBtn))
    const view = el('input', { type: 'checkbox', checked: pageView })
    view.addEventListener('change', () => setPageView(view.checked))
    const rows = [row(t('Background'), bgBtn), el('label', { class: 'fmt-check' }, view, t('Page view'))]
    if (pageView) {
      const formats = el('select', { class: 'fmt-select', disabled: editor.readOnly })
      for (const [id, name] of PAGE_FORMATS) formats.append(el('option', { value: id, textContent: name }))
      formats.append(el('option', { value: 'custom', textContent: t('Custom') }))
      formats.value = formatId()
      formats.addEventListener('change', () => setFormat(formats.value))
      const orient = el('select', { class: 'fmt-select', disabled: editor.readOnly })
      orient.append(el('option', { value: 'portrait', textContent: t('Portrait') }), el('option', { value: 'landscape', textContent: t('Landscape') }))
      orient.value = landscape() ? 'landscape' : 'portrait'
      orient.addEventListener('change', () => setLandscape(orient.value === 'landscape'))
      rows.push(row(t('Page size'), formats), row(t('Orientation'), orient))
    }
    return rows
  }

  return { update, background, menu, viewMenu, formatRows, isPageView: () => pageView, setPageView, setBackground, setSize }
}
