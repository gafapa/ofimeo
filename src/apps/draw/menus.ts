// Menus, keys and shortcut rows of the drawing app on the shared Ofimeo frame.
// Excalidraw 0.18 exposes no undo/redo or clipboard methods, so those items send
// the same key events Excalidraw listens to on its container (checked in
// scratchpad/ui-draw/verify.cjs); the paste item reads the clipboard itself.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { t } from '../../core/i18n'
import type { Session } from '../../core/session'
import type { FrameSpec } from '../../ui/frame'
import type { EditMenuOptions, FileMenuOptions } from '../../ui/menus'
import { isMac, mod, type ShortcutSection } from '../../ui/shortcuts'
import { confirmDialog, el, showDialog, type Menu, type MenuEntry, type MenuItem } from '../../ui/widgets'
import { zoomMenuItems, type ZoomTarget } from '../../ui/zoom'

export interface DrawContext {
  session: Session
  // Excalidraw's imperative API once the editor is ready.
  api: () => any
  openFile: () => void
  print: () => void
  zoom: ZoomTarget
  background: () => string
  setBackground: (color: string) => void
  // Tools ▸ Spelling and grammar… and its settings (spell.ts).
  spelling?: () => MenuEntry[]
}

// Excalidraw's canvas background presets (DEFAULT_CANVAS_BACKGROUND_PICKS).
const backgrounds = (): [string, string][] => [
  ['#ffffff', t('White')],
  ['#f8f9fa', t('Light gray')],
  ['#f5faff', t('Light blue')],
  ['#fffce8', t('Light yellow')],
  ['#fdf8f6', t('Light rose')],
]

const container = () => document.querySelector<HTMLElement>('.draw-host .excalidraw')

// Sends a key to Excalidraw (its handler is React's onKeyDown on the container).
export function sendKey(key: string, { ctrl = false, shift = false, code }: { ctrl?: boolean; shift?: boolean; code?: string } = {}): void {
  const target = container()
  if (!target) return
  target.focus({ preventScroll: true })
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key, code, ctrlKey: ctrl && !isMac, metaKey: ctrl && isMac, shiftKey: shift, bubbles: true, cancelable: true }),
  )
}

export const undo = () => sendKey('z', { ctrl: true, code: 'KeyZ' })
export const redo = () => sendKey('z', { ctrl: true, shift: true, code: 'KeyZ' })

const buttonEnabled = (testId: string) => {
  const b = document.querySelector<HTMLButtonElement>(`.draw-host [data-testid="${testId}"]`)
  return b ? !b.disabled : true
}

// Cut and copy run Excalidraw's own clipboard handlers (a document "copy"/"cut" event).
function clipboard(command: 'cut' | 'copy'): void {
  container()?.focus({ preventScroll: true })
  if (!document.execCommand(command)) void pasteHint()
}

// Paste: reads the clipboard (the browser may ask) and hands it to Excalidraw as a paste event.
async function paste(): Promise<void> {
  try {
    const data = new DataTransfer()
    for (const item of await navigator.clipboard.read()) {
      for (const type of item.types) {
        const blob = await item.getType(type)
        if (type.startsWith('image/')) data.items.add(new File([blob], 'image', { type }))
        else data.setData(type, await blob.text())
      }
    }
    container()?.focus({ preventScroll: true })
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  } catch {
    await pasteHint()
  }
}

async function pasteHint(): Promise<void> {
  const key = isMac ? '⌘' : 'Ctrl+'
  await showDialog(
    t('Use keyboard shortcuts'),
    el('p', {
      textContent: t('For security, browsers only allow clipboard access through the keyboard: {cut} to cut, {copy} to copy and {paste} to paste.', {
        cut: `${key}X`,
        copy: `${key}C`,
        paste: `${key}V`,
      }),
    }),
    [{ label: t('OK'), value: 'ok', primary: true }],
  )
}

export function drawFrame(ctx: DrawContext): Pick<FrameSpec, 'file' | 'edit' | 'menus' | 'help'> {
  const { session } = ctx
  const api = ctx.api
  const editable = () => session.canEdit
  const ready = () => !!api()
  const state = () => api()?.getAppState() ?? {}
  const setState = (appState: Record<string, unknown>) => api()?.updateScene({ appState })
  const openDialog = (name: string, extra: Record<string, unknown> = {}) => setState({ openDialog: { name, ...extra } })
  const tool = (label: string, type: string, key?: string, extra: Record<string, unknown> = {}): MenuItem => ({
    label,
    shortcut: key,
    enabled: () => editable() && ready(),
    active: () => state().activeTool?.type === type,
    run: () => api()?.setActiveTool({ type, ...extra }),
  })
  const toggle = (label: string, key: string, shortcut?: string, enabled = ready): MenuItem => ({
    label,
    shortcut,
    enabled,
    active: () => !!state()[key],
    run: () => setState({ [key]: !state()[key] }),
  })

  const file: FileMenuOptions = {
    openFile: ctx.openFile,
    print: ctx.print,
    // Excalidraw's export dialog (scale, background, dark mode, embedded scene).
    slots: { save: [{ label: t('Export image…'), shortcut: isMac ? '⇧⌘E' : 'Ctrl+Shift+E', enabled: ready, run: () => openDialog('imageExport') }] },
    details: () => {
      const elements = api()?.getSceneElements() ?? []
      return [
        [t('Elements'), String(elements.length)],
        [t('Images'), String(Object.keys(api()?.getFiles() ?? {}).length)],
      ]
    },
  }

  const clearCanvas = async () => {
    const a = api()
    if (!a || !(await confirmDialog(t('Clear canvas'), t('This deletes every element of the drawing for everyone. You can undo it.'), { confirmLabel: t('Clear'), danger: true }))) return
    const { newElementWith, CaptureUpdateAction } = await import('@excalidraw/excalidraw')
    a.updateScene({
      elements: a.getSceneElementsIncludingDeleted().map((e: any) => (e.isDeleted ? e : newElementWith(e, { isDeleted: true }))),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    })
  }

  const edit: EditMenuOptions = {
    editable: () => editable() && ready(),
    undo,
    redo,
    canUndo: () => buttonEnabled('button-undo'),
    canRedo: () => buttonEnabled('button-redo'),
    cut: () => clipboard('cut'),
    copy: () => clipboard('copy'),
    paste: () => void paste(),
    selectAll: () => sendKey('a', { ctrl: true, code: 'KeyA' }),
    find: () => api()?.toggleSidebar({ name: 'default', tab: 'search', force: true }),
    slots: {
      clipboard: [
        { label: t('Duplicate'), shortcut: mod('D'), enabled: editable, run: () => sendKey('d', { ctrl: true, code: 'KeyD' }) },
        { label: t('Delete'), shortcut: 'Del', enabled: editable, run: () => sendKey('Delete', { code: 'Delete' }) },
      ],
      end: ['-', { label: t('Clear canvas…'), enabled: () => editable() && ready(), run: () => void clearCanvas() }],
    },
  }

  const backgroundItems = (): MenuEntry[] => [
    ...backgrounds().map(([color, label]) => ({
      label,
      active: () => ctx.background().toLowerCase() === color,
      enabled: editable,
      run: () => ctx.setBackground(color),
    })),
    '-',
    {
      label: t('Custom color…'),
      enabled: editable,
      run: () => {
        const input = el('input', { type: 'color', value: ctx.background() })
        input.addEventListener('change', () => ctx.setBackground(input.value))
        input.click()
      },
    },
  ]

  const view: Menu = {
    label: t('View'),
    items: [
      { label: t('Zoom'), submenu: zoomMenuItems(ctx.zoom) },
      { label: t('Zoom to fit'), shortcut: 'Shift+1', enabled: ready, run: () => ctx.zoom.fit?.() },
      {
        label: t('Zoom to selection'),
        shortcut: 'Shift+2',
        enabled: () => Object.keys(state().selectedElementIds ?? {}).length > 0,
        run: () => {
          const a = api()
          const ids = state().selectedElementIds ?? {}
          a?.scrollToContent(a.getSceneElements().filter((e: any) => ids[e.id]), { fitToContent: true, animate: true })
        },
      },
      '-',
      toggle(t('Grid'), 'gridModeEnabled', mod("'")),
      toggle(t('Snap to objects'), 'objectsSnapModeEnabled', isMac ? '⌥S' : 'Alt+S'),
      toggle(t('Zen mode'), 'zenModeEnabled', isMac ? '⌥Z' : 'Alt+Z'),
      { label: t('Statistics'), shortcut: isMac ? '⌥/' : 'Alt+/', enabled: ready, active: () => !!state().stats?.open, run: () => setState({ stats: { ...state().stats, open: !state().stats?.open } }) },
      '-',
      {
        label: t('Canvas background'),
        get submenu() {
          return backgroundItems()
        },
      },
    ],
  }

  const insert: Menu = {
    label: t('Insert'),
    items: [
      tool(t('Rectangle'), 'rectangle', 'R'),
      tool(t('Diamond'), 'diamond', 'D'),
      tool(t('Ellipse'), 'ellipse', 'O'),
      tool(t('Arrow'), 'arrow', 'A'),
      tool(t('Line'), 'line', 'L'),
      tool(t('Freehand drawing'), 'freedraw', 'P'),
      tool(t('Text'), 'text', 'T'),
      '-',
      { ...tool(t('Image…'), 'image', '9', { insertOnCanvasDirectly: true }), active: undefined },
      tool(t('Frame'), 'frame', 'F'),
      tool(t('Web embed'), 'embeddable'),
      { label: t('Diagram from Mermaid…'), enabled: () => editable() && ready(), run: () => openDialog('ttd', { tab: 'mermaid' }) },
      '-',
      { label: t('Library…'), enabled: ready, run: () => api()?.toggleSidebar({ name: 'default', tab: 'library' }) },
    ],
  }

  const tools: Menu = {
    label: t('Tools'),
    items: [
      tool(t('Select'), 'selection', 'V'),
      tool(t('Hand (move the canvas)'), 'hand', 'H'),
      tool(t('Eraser'), 'eraser', 'E'),
      { ...tool(t('Laser pointer'), 'laser', 'K'), enabled: ready },
      '-',
      {
        label: t('Keep the selected tool active'),
        shortcut: 'Q',
        enabled: () => editable() && ready(),
        active: () => !!state().activeTool?.locked,
        run: () => api()?.setActiveTool({ ...state().activeTool, locked: !state().activeTool?.locked }),
      },
      ...(ctx.spelling ? ['-' as const, ...ctx.spelling()] : []),
    ],
  }

  return {
    file,
    edit,
    menus: { view, insert, tools },
    help: {
      sections: drawShortcuts,
      extra: [{ label: t('All drawing shortcuts…'), shortcut: '?', enabled: ready, run: () => openDialog('help') }],
    },
  }
}

function drawShortcuts(): ShortcutSection[] {
  return [
    {
      title: t('Tools'),
      rows: [
        [t('Select'), 'V · 1'],
        [t('Hand (move the canvas)'), 'H'],
        [t('Rectangle'), 'R · 2'],
        [t('Diamond'), 'D · 3'],
        [t('Ellipse'), 'O · 4'],
        [t('Arrow'), 'A · 5'],
        [t('Line'), 'L · 6'],
        [t('Freehand drawing'), 'P · 7'],
        [t('Text'), 'T · 8'],
        [t('Image…'), '9'],
        [t('Eraser'), 'E · 0'],
        [t('Laser pointer'), 'K'],
        [t('Keep the selected tool active'), 'Q'],
      ],
    },
    {
      title: t('Drawing'),
      rows: [
        [t('Duplicate'), 'Ctrl+D'],
        [t('Delete'), 'Del'],
        [t('Group / ungroup'), 'Ctrl+G / Ctrl+Shift+G'],
        [t('Bring forward / send backward'), 'Ctrl+] / Ctrl+['],
        [t('Zoom to fit'), 'Shift+1'],
        [t('Zoom to selection'), 'Shift+2'],
        [t('Export image…'), 'Ctrl+Shift+E'],
        [t('All drawing shortcuts…'), '?'],
      ],
    },
  ]
}
