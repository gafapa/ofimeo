// Shared menu builders: File, Edit (base) and Help in one standard order for
// every app, plus the View ▸ Zoom items (zoom.ts). Apps add their own items in
// the documented slots instead of writing these menus by hand.
//
// File (fileMenu):
//   New ▸ (one item per app) · Open… Ctrl+O · Open from Nextcloud… · Import from link… · All documents · Storage and backup…
//   [slots.open]
//   ─ Make a copy · Save as template… · Save to Nextcloud Ctrl+S (when linked) / Save to Nextcloud… · Save to Nextcloud as… (when linked)
//     · Nextcloud account… · Moodle account… · Download as ▸ (session.hooks.exportFormats, then `download` extras)
//   [slots.save]
//   ─ [slots.print: e.g. Page setup…] · Print… Ctrl+P
//   ─ Version history… · Save version…
//   ─ Hand in… · Hand in to Moodle… · Share…
//   ─ Document details…
//   [slots.end]
// Edit (editMenu): Undo · Redo ─ Cut · Copy · Paste [slots.clipboard] ─ Select all [slots.select]
//   ─ Find… · Find and replace… [slots.end]
// Help (helpMenu / helpMenuItems): Help center · Getting started (src/help)
//   ─ Keyboard shortcuts Ctrl+/ · Accessibility… Alt+Shift+A
//   · Connection test… (when src/ui/connection.ts exists) [extra] ─ About Ofimeo

import { APPS, appInfo, offeredApps, SUITE } from '../apps/registry'
import { downloadBlob, safeFileName } from '../core/handin'
import { t } from '../core/i18n'
import { homePath, newDocPath } from '../core/router'
import type { ExportOption, Session } from '../core/session'
import * as store from '../core/store'
import { togglePanel } from './accessibility'
import { handIn, openShareDialog } from './chrome'
import { openAccountDialog, openFromNextcloud, saveToNextcloud, saveToNextcloudAs } from './nextcloud'
import { mod } from './shortcuts'
import { makeCopy, openVersionHistory, saveNamedVersion } from './versions'
import { toast, type Menu, type MenuEntry } from './widgets'

const online = () => navigator.onLine
const aboutModule = () => import('./about')

export interface FileMenuOptions {
  // Open… (Ctrl+O): the app's file chooser.
  openFile: () => void
  // Print… (Ctrl+P).
  print: () => void
  // Extra "Download as" items after the formats from session.hooks.exportFormats
  // (e.g. { label: t('PDF (via Print)'), run: print }).
  download?: MenuEntry[]
  // Replaces the automatic Download items (formats from session.hooks.exportFormats).
  downloadItems?: MenuEntry[]
  // App rows for "Document details…" (e.g. word count, number of slides).
  details?: () => [string, string][] | Promise<[string, string][]>
  slots?: {
    open?: MenuEntry[] // after Open / All documents
    save?: MenuEntry[] // after Download as
    print?: MenuEntry[] // before Print (Page setup…, Slide size…)
    end?: MenuEntry[] // after Document details
  }
}

// Downloads one of the app's export formats with the document title as the name.
export async function downloadFormat(session: Session, option: ExportOption): Promise<void> {
  try {
    const title = String(session.doc.getMap('meta').get('title') || '') || appInfo(session.type).untitled
    downloadBlob(await option.build(), `${safeFileName(title + (option.suffix ?? ''))}.${option.ext}`)
  } catch (err) {
    toast(t('Download failed: {message}', { message: (err as Error).message }))
  }
}

export function fileMenu(session: Session, options: FileMenuOptions): Menu {
  const info = appInfo(session.type)
  const linked = () => !!store.getDoc(session.docId)?.remote?.format
  const slots = options.slots ?? {}
  // Evaluated when the submenu opens: apps may set their export formats after building the menus.
  const download = (): MenuEntry[] =>
    options.downloadItems ?? [
      ...(session.hooks.exportFormats?.() ?? []).map((f) => ({ label: f.label, run: () => void downloadFormat(session, f) })),
      ...(options.download?.length ? ['-' as const, ...options.download] : []),
    ]
  return {
    label: t('File'),
    items: [
      {
        label: t('New'),
        submenu: [info, ...APPS.filter((a) => a !== info)].filter((a) => a.load && offeredApps().includes(a)).map((a) => ({ label: a.name, run: () => window.open(newDocPath(a.type), '_blank') })),
      },
      { label: t('Open…'), shortcut: mod('O'), run: options.openFile },
      { label: t('Open from Nextcloud…'), enabled: online, run: () => void openFromNextcloud() },
      { label: t('Import from link…'), run: () => void import('./import-link').then((m) => m.openImportFromLink()) },
      { label: t('All documents'), run: () => (location.href = homePath()) },
      { label: t('Storage and backup…'), run: () => void import('../home/storage').then((m) => m.openStorageDialog()) },
      ...(slots.open ?? []),
      '-',
      { label: t('Make a copy'), run: () => void makeCopy(session) },
      { label: t('Save as template…'), run: () => void import('../home/save-template').then((m) => m.saveAsTemplate(session)) },
      { label: t('Save to Nextcloud'), shortcut: mod('S'), visible: linked, enabled: online, run: () => void saveToNextcloud(session) },
      { label: t('Save to Nextcloud…'), visible: () => !linked(), enabled: online, run: () => void saveToNextcloudAs(session) },
      { label: t('Save to Nextcloud as…'), visible: linked, enabled: online, run: () => void saveToNextcloudAs(session) },
      { label: t('Nextcloud account…'), run: () => void openAccountDialog() },
      { label: t('Moodle account…'), run: () => void import('./moodle').then((m) => m.openMoodleDialog()) },
      {
        label: t('Download as'),
        get submenu() {
          return download()
        },
        enabled: () => download().length > 0,
      },
      ...(slots.save ?? []),
      '-',
      ...(slots.print ?? []),
      { label: t('Print…'), shortcut: mod('P'), run: options.print },
      '-',
      { label: t('Version history…'), run: () => void openVersionHistory(session) },
      { label: t('Save version…'), enabled: () => session.canEdit, run: () => void saveNamedVersion(session) },
      '-',
      { label: t('Hand in…'), run: () => void handIn(session, info.untitled) },
      { label: t('Hand in to Moodle…'), enabled: online, run: () => void import('./moodle').then((m) => m.handInToMoodle(session, info.untitled)) },
      { label: t('Share…'), run: () => void openShareDialog(session) },
      '-',
      { label: t('Document details…'), run: async () => (await aboutModule()).documentDetails(session, (await options.details?.()) ?? []) },
      ...(slots.end ?? []),
    ],
  }
}

export interface EditMenuOptions {
  undo?: () => void
  redo?: () => void
  canUndo?: () => boolean
  canRedo?: () => boolean
  cut?: () => void
  copy?: () => void
  // Whether there is something to copy (default: always enabled).
  canCopy?: () => boolean
  paste?: () => void
  selectAll?: () => void
  find?: () => void
  replace?: () => void
  // False disables the changing items (Undo, Redo, Cut, Paste, Find and replace).
  editable?: () => boolean
  slots?: {
    clipboard?: MenuEntry[] // after Paste: Duplicate, Delete…
    select?: MenuEntry[] // after Select all: Select shapes…
    end?: MenuEntry[]
  }
}

export function editMenu(options: EditMenuOptions): Menu {
  const editable = options.editable ?? (() => true)
  const slots = options.slots ?? {}
  const items: MenuEntry[] = []
  if (options.undo) items.push({ label: t('Undo'), shortcut: mod('Z'), run: options.undo, enabled: () => editable() && (options.canUndo?.() ?? true) })
  if (options.redo) items.push({ label: t('Redo'), shortcut: mod('Y'), run: options.redo, enabled: () => editable() && (options.canRedo?.() ?? true) })
  items.push('-')
  if (options.cut) items.push({ label: t('Cut'), shortcut: mod('X'), run: options.cut, enabled: editable })
  if (options.copy) items.push({ label: t('Copy'), shortcut: mod('C'), run: options.copy, enabled: options.canCopy })
  if (options.paste) items.push({ label: t('Paste'), shortcut: mod('V'), run: options.paste, enabled: editable })
  items.push(...(slots.clipboard ?? []), '-')
  if (options.selectAll) items.push({ label: t('Select all'), shortcut: mod('A'), run: options.selectAll })
  items.push(...(slots.select ?? []), '-')
  if (options.find) items.push({ label: t('Find…'), shortcut: mod('F'), run: options.find })
  if (options.replace) items.push({ label: t('Find and replace…'), shortcut: mod('H'), run: options.replace, enabled: editable })
  items.push(...(slots.end ?? []))
  return { label: t('Edit'), items }
}

// "Connection test…" comes from src/ui/connection.ts when that module exists
// (it is loaded only when the item is used). The module exports
// openConnectionTest(session?) (or openConnectionDialog).
type ConnectionModule = { openConnectionTest?: (session?: Session) => unknown; openConnectionDialog?: (session?: Session) => unknown }
const connectionModule = Object.values(import.meta.glob<ConnectionModule>('./connection.ts'))[0] as (() => Promise<ConnectionModule>) | undefined

export async function openConnectionTest(session?: Session): Promise<void> {
  if (!connectionModule) return
  const m = await connectionModule()
  await (m.openConnectionTest ?? m.openConnectionDialog)?.(session)
}

export interface HelpMenuOptions {
  // Opens the app's keyboard shortcuts dialog (Ctrl+/, F1).
  shortcuts: () => void
  // App items, before "About".
  extra?: MenuEntry[]
}

const helpCenter = () => import('../help/center')
const onboarding = () => import('../help/tour')

export function helpMenuItems(session: Session | undefined, options: HelpMenuOptions): MenuEntry[] {
  return [
    { label: t('Help center'), run: () => void helpCenter().then((m) => m.openHelp(m.appArticle(session), { session, shortcuts: options.shortcuts })) },
    // In an app: its quick start tips; on the home screen: the welcome tour.
    { label: t('Getting started'), run: () => void onboarding().then((m) => (session ? m.showQuickStart(session) : m.showWelcomeTour())) },
    '-',
    { label: t('Keyboard shortcuts'), shortcut: mod('/'), run: options.shortcuts },
    { label: t('Accessibility…'), shortcut: 'Alt+Shift+A', run: () => togglePanel(true) },
    ...(connectionModule ? [{ label: t('Connection test…'), run: () => void openConnectionTest(session) }] : []),
    { label: t('For administrators…'), run: () => void import('./admin-config').then((m) => m.openConfigGenerator()) },
    ...(options.extra ?? []),
    '-',
    { label: t('About {suite}', { suite: SUITE }), run: () => void aboutModule().then((m) => m.aboutDialog()) },
  ]
}

export function helpMenu(session: Session | undefined, options: HelpMenuOptions): Menu {
  return { label: t('Help'), items: helpMenuItems(session, options) }
}
