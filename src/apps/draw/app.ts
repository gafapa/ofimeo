// Drawing app: Excalidraw inside the shared Ofimeo frame (menu bar, keys, status
// bar with save state and zoom), synced over Yjs. Excalidraw keeps its tool
// island and property panel (the drawing's toolbar); its main menu, theme
// toggle and zoom buttons are replaced by ours (menus.ts, draw.css).
// Written with React.createElement to avoid a JSX build step.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createElement as h, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Excalidraw, MainMenu, exportToBlob, exportToSvg, serializeAsJSON } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { appInfo } from '../registry'
import { printImages } from '../../core/handin'
import { language, locale, t, tn } from '../../core/i18n'
import type { Session } from '../../core/session'
import { setupChrome } from '../../ui/chrome'
import { mountFrame } from '../../ui/frame'
import { renderShell } from '../../ui/shell'
import { isMac } from '../../ui/shortcuts'
import { el, toast } from '../../ui/widgets'
import type { ZoomTarget } from '../../ui/zoom'
import { drawFrame, redo } from './menus'
import { DrawSync } from './sync'
import { provideWebMcpTools } from '../../core/webmcp'

export const DRAW_ACCEPT = '.excalidraw'

// Fonts are served from our own origin (copied by scripts/copy-excalidraw-assets.mjs).
;(window as any).EXCALIDRAW_ASSET_PATH = `${import.meta.env.BASE_URL}excalidraw/`

// Excalidraw API of each open session (for hand in).
export const drawApis = new WeakMap<Session, any>()

export async function exportDrawing(api: any, format: 'png' | 'svg' | 'pdf' | 'excalidraw', title = ''): Promise<Blob> {
  const elements = api.getSceneElements()
  // Exports keep the drawing's own colours, whatever the UI theme.
  const appState = { ...api.getAppState(), exportBackground: true, exportWithDarkMode: false }
  const files = api.getFiles()
  if (format === 'png') return exportToBlob({ elements, appState, files, mimeType: 'image/png' })
  if (format === 'pdf') {
    // The scene as one PDF page of its own size, from a picture at about 300 dpi.
    const [{ picturesToPdf, pictureRatio }, png] = await Promise.all([import('../diagram/pdf'), exportToBlob({ elements, appState: { ...appState, exportScale: 1 }, files, mimeType: 'image/png' })])
    const { width, height } = await createImageBitmap(png)
    const ratio = pictureRatio(width, height)
    const sharp = await exportToBlob({ elements, appState: { ...appState, exportScale: ratio }, files, mimeType: 'image/png' })
    const live = elements.filter((e: any) => !e.isDeleted).length
    return picturesToPdf([{ png: live ? sharp : null, width, height, pageWidth: width * 0.75, pageHeight: height * 0.75 }], title)
  }
  if (format === 'svg') return new Blob([(await exportToSvg({ elements, appState, files })).outerHTML], { type: 'image/svg+xml' })
  return new Blob([serializeAsJSON(elements, appState, files, 'local')], { type: 'application/json' })
}

// Excalidraw has a light and a dark theme; high contrast follows its base.
const excalidrawTheme = (): 'light' | 'dark' => {
  const theme = document.documentElement.getAttribute('data-a11y-theme') ?? 'light'
  return theme === 'dark' || theme === 'contrast-dark' ? 'dark' : 'light'
}

const MIN_ZOOM = 0.1 // Excalidraw's limits
const MAX_ZOOM = 30
const DEFAULT_BACKGROUND = '#ffffff'

export function mountDraw(session: Session, root: HTMLElement): void {
  const info = appInfo('draw')
  const shell = renderShell(info, root)
  setupChrome(session, info.untitled)

  const container = el('div', { class: 'draw-host' })
  const fileInput = el('input', { type: 'file', accept: DRAW_ACCEPT, hidden: true })
  shell.main.append(container)
  document.body.append(fileInput)

  const sync = new DrawSync(session.doc, session.awareness)
  // Shared drawing settings (canvas background), synced and kept in versions.
  const settings = session.doc.getMap<string>('draw-settings')
  const background = () => settings.get('background') || DEFAULT_BACKGROUND
  const api = () => drawApis.get(session)

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (!file) return
    try {
      toast(t('Opening…'))
      const { importFile } = await import('./index')
      location.href = await importFile(file)
    } catch (err) {
      toast(t('Could not open the file: {message}', { message: (err as Error).message }))
    }
  })

  const print = async () => {
    const a = api()
    if (!a) return
    if (!a.getSceneElements().length) return toast(t('The drawing is empty'))
    await printImages([await exportDrawing(a, 'png')])
  }

  // Zoom around the centre of the canvas (Excalidraw only exposes appState.zoom).
  const setZoom = (value: number) => {
    const a = api()
    if (!a) return
    const s = a.getAppState()
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
    const cx = s.width / 2
    const cy = s.height / 2
    a.updateScene({
      appState: { zoom: { value: next }, scrollX: s.scrollX + cx / next - cx / s.zoom.value, scrollY: s.scrollY + cy / next - cy / s.zoom.value },
    })
  }
  const zoom: ZoomTarget = {
    get: () => api()?.getAppState().zoom.value ?? 1,
    set: setZoom,
    fit: () => api()?.scrollToContent(undefined, { fitToContent: true }),
    min: MIN_ZOOM,
    max: MAX_ZOOM,
    presets: [0.25, 0.5, 0.75, 1, 1.5, 2, 3],
    keys: true,
  }

  const frame = mountFrame({
    session,
    shell,
    ...drawFrame({
      session,
      api,
      openFile: () => fileInput.click(),
      print: () => void print(),
      zoom,
      background,
      setBackground: (color) => session.canEdit && settings.set('background', color),
    }),
    zoom,
  })
  // Excalidraw's tool island is the drawing's toolbar.
  shell.toolbar.hidden = true
  // AI assistants (WebMCP, off by default): the tool module loads only when turned on.
  provideWebMcpTools(session, () => import('./webmcp').then((m) => m.drawTools(session, api)))
  const selection = el('span', { class: 'draw-selection' })
  frame.status?.left.append(selection)

  // Excalidraw has no Ctrl+Y; redo like the other apps.
  window.addEventListener(
    'keydown',
    (e) => {
      if ((isMac ? e.metaKey : e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'y' && container.contains(e.target as Node)) {
        e.preventDefault()
        e.stopPropagation()
        redo()
      }
    },
    true,
  )

  let lastInfo = ''
  const updateStatus = (elements: readonly any[], appState: any) => {
    const selected = Object.keys(appState.selectedElementIds ?? {}).length
    const text = selected ? tn(selected, '{n} element selected', '{n} elements selected') : tn(elements.filter((e) => !e.isDeleted).length, '{n} element', '{n} elements')
    if (text !== lastInfo) selection.textContent = lastInfo = text
  }

  function Editor() {
    const [theme, setTheme] = useState(excalidrawTheme)
    const initialData = useMemo(() => ({ ...sync.initialScene(), appState: { viewBackgroundColor: background() } }) as any, [])

    useEffect(() => {
      const update = () => api()?.updateScene({ collaborators: sync.collaborators(session.doc.clientID) })
      session.awareness.on('change', update)
      // Our theme (Accessibility panel) drives Excalidraw's.
      const observer = new MutationObserver(() => setTheme(excalidrawTheme()))
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-a11y-theme'] })
      const applyBackground = () => api()?.updateScene({ appState: { viewBackgroundColor: background() } })
      settings.observe(applyBackground)
      return () => {
        session.awareness.off('change', update)
        observer.disconnect()
        settings.unobserve(applyBackground)
      }
    }, [])

    return h(
      Excalidraw,
      {
        initialData,
        excalidrawAPI: (a: any) => {
          drawApis.set(session, a)
          sync.attach(a)
          if (import.meta.env.DEV) Object.assign(window, { excalidrawAPI: a, drawSync: sync })
        },
        onChange: (elements: readonly any[], appState: any, files: any) => {
          const a = api()
          if (a) sync.onChange(a.getSceneElementsIncludingDeleted(), files)
          updateStatus(elements, appState)
        },
        onScrollChange: () => frame.status?.zoom?.update(),
        onPointerUpdate: (payload: any) => sync.onPointer(payload.pointer, payload.button, api()?.getAppState().selectedElementIds ?? {}),
        isCollaborating: true,
        theme,
        // Excalidraw's own interface in the suite's language.
        langCode: language === 'en' ? 'en' : locale,
        // Viewers and commenters cannot change the drawing.
        viewModeEnabled: !session.canEdit,
        // File, export, background and theme live in our menus; the export image dialog stays (File ▸ Export image…).
        UIOptions: {
          canvasActions: { loadScene: false, saveToActiveFile: false, export: false, clearCanvas: false, changeViewBackgroundColor: false, toggleTheme: null, saveAsImage: true },
        },
      },
      // An empty main menu (its trigger is hidden in draw.css) replaces Excalidraw's default one.
      h(MainMenu, null),
    )
  }

  const exportBlob = (format: 'png' | 'svg' | 'pdf' | 'excalidraw') => async () => {
    const a = api()
    if (!a) throw new Error(t('The drawing is still loading'))
    return exportDrawing(a, format, String(session.doc.getMap('meta').get('title') || t('Untitled drawing')))
  }
  session.hooks.exportFormats = () => [
    { ext: 'excalidraw', label: t('Excalidraw drawing (.excalidraw)'), build: exportBlob('excalidraw') },
    { ext: 'png', label: t('PNG image'), build: exportBlob('png') },
    { ext: 'svg', label: t('SVG image'), build: exportBlob('svg') },
    { ext: 'pdf', label: t('PDF document (.pdf)'), build: exportBlob('pdf') },
  ]

  createRoot(container).render(h(Editor))
}
