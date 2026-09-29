// Home screen, in three tabs: Home (create a document, open a file),
// Templates (the whole gallery) and My documents (the library of the
// documents stored in this browser).

import { ALL_ACCEPT, appForFile, appInfo, offeredApps, SUITE, type AppInfo } from '../apps/registry'
import { newDocPath } from '../core/router'
import { isOfflineCapable, whenOfflineReady } from '../core/offline'
import { languageSelect, t, tn } from '../core/i18n'
import * as store from '../core/store'
import { legalFooter } from '../legal/links'
import { accessibilityButton } from '../ui/accessibility'
import { brandMark } from '../ui/brand'
import { schoolBadge } from '../ui/school'
import { schoolConfig } from '../core/school-config'
import { nameButton } from '../ui/shell'
import { helpMenuItems } from '../ui/menus'
import { openAccountDialog, openFromNextcloud } from '../ui/nextcloud'
import { registerShortcuts, showShortcuts } from '../ui/shortcuts'
import { el, icon, showContextMenu, toast, uiZoom } from '../ui/widgets'
import { ChevronDown, CircleHelp, Cloud, HardDrive } from 'lucide'
import { hasMoodleAccount } from '../core/moodle-store'
import { onboardingOff, welcomeSeen } from '../help/prefs'
import { documentsSection } from './docs'
import { backupReminder, openStorageDialog, setChangeListener } from './storage'
import './home.css'

export function mountHome(root: HTMLElement): void {
  document.title = SUITE
  const user = store.loadUser()

  const nameInput = el('input', { class: 'user-name', value: user.name, title: t('Your name, as others see it') })
  nameInput.setAttribute('aria-label', t('Your name'))
  nameInput.style.borderColor = user.color
  nameInput.addEventListener('change', () => {
    user.name = nameInput.value.trim() || user.name
    nameInput.value = user.name
    store.saveUser(user)
  })

  const fileInput = el('input', { type: 'file', hidden: true })
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (!file) return
    try {
      const target = await appForFile(file)
      if (!target) return toast(t('This file type is not supported yet'))
      toast(t('Opening…'))
      location.href = await target.module.importFile(file)
    } catch (err) {
      toast(t('Could not open the file: {message}', { message: (err as Error).message }))
    }
  })
  const openButton = el('button', { type: 'button', class: 'home-open', textContent: t('Open file…') })
  fileInput.accept = ALL_ACCEPT
  openButton.addEventListener('click', () => fileInput.click())

  // Other ways to open: Google Drive / Microsoft 365 share links (src/ui/import-link.ts,
  // loaded on demand) and Nextcloud (needs a connection).
  const moreOpen = el('button', { type: 'button', class: 'home-open home-open-more', title: t('More ways to open') }, t('More'), icon(ChevronDown, 16))
  moreOpen.setAttribute('aria-haspopup', 'menu')
  moreOpen.addEventListener('click', () => {
    const rect = moreOpen.getBoundingClientRect()
    showContextMenu(rect.left, rect.bottom + 4, [
      { label: t('Import from link…'), run: () => void import('../ui/import-link').then((m) => m.openImportFromLink()) },
      { label: t('Open from Nextcloud…'), run: () => void openFromNextcloud(), enabled: () => navigator.onLine },
    ])
  })

  // Moodle: the "Moodle tasks" panel (src/ui/moodle.ts, loaded on demand).
  const moodleSlot = el('div', { class: 'moodle-slot' })
  const loadMoodlePanel = () => {
    if (moodleSlot.childElementCount) return
    void import('../ui/moodle').then((m) => moodleSlot.childElementCount || moodleSlot.append(m.moodleTasksSection()))
  }
  if (hasMoodleAccount() || schoolConfig().moodle?.url) loadMoodlePanel()

  // Nextcloud and Moodle accounts, grouped in one header menu.
  const accountsButton = el('button', { type: 'button', class: 'home-cloud home-accounts', title: t('Nextcloud and Moodle accounts') }, icon(Cloud, 18), el('span', { class: 'btn-label', textContent: t('Accounts') }))
  accountsButton.setAttribute('aria-haspopup', 'menu')
  accountsButton.addEventListener('click', () => {
    const rect = accountsButton.getBoundingClientRect()
    const z = uiZoom()
    showContextMenu(rect.right - 220 * z, rect.bottom + 4, [
      { label: t('Nextcloud account…'), run: () => void openAccountDialog() },
      {
        label: t('Moodle account…'),
        run: () => {
          loadMoodlePanel()
          void import('../ui/moodle').then((m) => m.openMoodleDialog())
        },
      },
    ])
  })

  const newCards = el(
    'div',
    { class: 'new-cards' },
    ...offeredApps().map((app) => {
      const card = el(
        'a',
        { class: `new-card${app.load ? '' : ' disabled'}`, href: app.load ? newDocPath(app.type) : '#', title: app.load ? app.newLabel : t('Coming soon') },
        appIcon(app, 'large'),
        el('span', { class: 'new-label', textContent: app.newLabel }),
        app.load ? null : el('span', { class: 'soon', textContent: t('Coming soon') }),
      )
      if (!app.load) card.addEventListener('click', (e) => e.preventDefault())
      return card
    }),
  )

  const docs = documentsSection()
  setChangeListener(() => {
    docs.refresh()
    renderReminder()
  })
  const reminderSlot = el('div', { class: 'home-inner reminder-slot' })
  const renderReminder = () => reminderSlot.replaceChildren(...[backupReminder()].filter((x): x is HTMLElement => !!x))
  renderReminder()

  // The template gallery is a separate chunk (src/templates).
  const gallery = templatesPart((m, node) => m.mountTemplates(node))
  const tabs = homeTabs((id) => id === 'templates' && gallery.refresh())

  root.replaceChildren(
    el(
      'div',
      { class: 'home' },
      el(
        'header',
        { class: 'home-bar' },
        el('span', { class: 'home-logo' }, brandMark(36)),
        el('h1', { textContent: SUITE }),
        schoolBadge(),
        el('span', { class: 'spacer' }),
        offlineControl(),
        accountsButton,
        storageButton(),
        languageSelect('home-language'),
        helpButton(),
        accessibilityButton(true),
        nameInput,
        nameButton(nameInput),
      ),
      tabs.bar,
      tabs.panel(
        'home',
        el(
          'section',
          { class: 'home-new' },
          el('div', { class: 'home-inner' }, el('div', { class: 'home-section-title' }, el('h2', { textContent: t('Start something new') }), el('span', { class: 'home-open-buttons' }, openButton, moreOpen), fileInput), newCards),
        ),
        moodleSlot,
        reminderSlot,
      ),
      tabs.panel('templates', el('section', { class: 'home-templates' }, gallery.element)),
      tabs.panel(
        'docs',
        el(
          'section',
          { class: 'home-recent' },
          docs.element,
          el(
            'div',
            { class: 'home-inner' },
            el('p', {
              class: 'hint',
              textContent:
                t('Documents are stored in this browser. Share a document to edit it with others in real time; edits travel directly between browsers.'),
            }),
          ),
        ),
      ),
      legalFooter(),
    ),
  )
  handleLaunchedFiles()
  void housekeeping(docs.refresh)
  // First visit in this browser: the welcome tour (src/help, loaded only then).
  if (!welcomeSeen() && !onboardingOff()) void import('../help/tour').then((m) => m.maybeShowWelcome())
  // The same keys as in the apps: Ctrl+O opens a file, Ctrl+/ and F1 the shortcuts.
  registerShortcuts({ open: () => fileInput.click(), save: null, help: () => void showShortcuts() })
  // Titles and new documents from other tabs.
  window.addEventListener('storage', (e) => {
    if (e.key !== null && !e.key.startsWith('ofimeo:')) return
    docs.refresh()
  })
}

// Opens the "Storage and backup" dialog.
function storageButton(): HTMLButtonElement {
  const button = el('button', { type: 'button', class: 'home-help home-storage', title: t('Storage and backup') }, icon(HardDrive, 19))
  button.setAttribute('aria-label', t('Storage and backup'))
  button.addEventListener('click', () => void openStorageDialog())
  return button
}

// On load: empty the trash of documents deleted more than 30 days ago and run
// the automatic Nextcloud backup when it is due.
async function housekeeping(refresh: () => void): Promise<void> {
  const purged = await store.purgeExpiredTrash().catch(() => 0)
  if (purged) {
    toast(tn(purged, '{n} document was deleted from the trash after 30 days', '{n} documents were deleted from the trash after 30 days'))
    refresh()
  }
  const { runAutoBackup } = await import('../core/backup')
  try {
    const path = await runAutoBackup()
    if (path) toast(t('Automatic backup saved to Nextcloud: {path}', { path }))
  } catch (err) {
    toast(t('The automatic backup to Nextcloud failed: {message}', { message: (err as Error).message }))
  }
}

// Help menu of the home screen: the apps' Help items (help center, welcome tour, shortcuts, accessibility, connection test, about).
function helpButton(): HTMLButtonElement {
  const button = el('button', { type: 'button', class: 'home-help', title: t('Help') }, icon(CircleHelp, 20))
  button.setAttribute('aria-label', t('Help'))
  button.setAttribute('aria-haspopup', 'menu')
  button.addEventListener('click', () => {
    const rect = button.getBoundingClientRect()
    const z = uiZoom()
    showContextMenu(rect.right - 240 * z, rect.bottom + 4, helpMenuItems(undefined, { shortcuts: () => void showShortcuts() }))
  })
  return button
}

type GalleryModule = typeof import('../templates/gallery')

// A part of the template gallery, mounted once its chunk has loaded.
function templatesPart(mount: (m: GalleryModule, node: HTMLElement) => { refresh: () => void }): { element: HTMLElement; refresh: () => void } {
  const inner = el('div', { class: 'home-inner' })
  let refresh = () => {}
  import('../templates/gallery')
    .then((m) => (refresh = mount(m, inner).refresh))
    .catch(() => inner.replaceChildren())
  return { element: inner, refresh: () => refresh() }
}

type TabId = 'home' | 'templates' | 'docs'

// Tabs of the home screen (ARIA tabs: arrow keys, Home and End move between them).
function homeTabs(onSelect: (id: TabId) => void): { bar: HTMLElement; panel: (id: TabId, ...children: HTMLElement[]) => HTMLElement; select: (id: TabId) => void } {
  const labels: Record<TabId, string> = { home: t('Home'), templates: t('Templates'), docs: t('My documents') }
  const ids = Object.keys(labels) as TabId[]
  const buttons = new Map<TabId, HTMLButtonElement>()
  const panels = new Map<TabId, HTMLElement>()
  const list = el('div', { class: 'home-tabs-list', role: 'tablist' })
  list.setAttribute('aria-label', t('Home screen sections'))
  const select = (id: TabId, focus = false) => {
    for (const other of ids) {
      const on = other === id
      buttons.get(other)!.setAttribute('aria-selected', String(on))
      buttons.get(other)!.tabIndex = on ? 0 : -1
      const panel = panels.get(other)
      if (panel) panel.hidden = !on
    }
    if (focus) buttons.get(id)!.focus()
    onSelect(id)
  }
  for (const id of ids) {
    const b = el('button', { type: 'button', class: 'home-tab', id: `home-tab-${id}`, textContent: labels[id] })
    b.setAttribute('role', 'tab')
    b.setAttribute('aria-controls', `home-panel-${id}`)
    b.setAttribute('aria-selected', String(id === 'home'))
    b.tabIndex = id === 'home' ? 0 : -1
    b.addEventListener('click', () => select(id))
    b.addEventListener('keydown', (e) => {
      const i = ids.indexOf(id)
      const keys: Record<string, TabId> = { ArrowRight: ids[(i + 1) % ids.length], ArrowLeft: ids[(i + ids.length - 1) % ids.length], Home: ids[0], End: ids[ids.length - 1] }
      const next = keys[e.key]
      if (!next) return
      e.preventDefault()
      select(next, true)
    })
    buttons.set(id, b)
    list.append(b)
  }
  const panel = (id: TabId, ...children: HTMLElement[]) => {
    const node = el('div', { class: 'home-panel', id: `home-panel-${id}`, role: 'tabpanel' }, ...children)
    node.setAttribute('aria-labelledby', `home-tab-${id}`)
    node.hidden = id !== 'home'
    panels.set(id, node)
    return node
  }
  return { bar: el('nav', { class: 'home-tabs' }, el('div', { class: 'home-inner' }, list)), panel, select }
}

function appIcon(app: AppInfo, size: 'small' | 'large'): HTMLElement {
  const icon = el('span', { class: `app-icon ${size}`, textContent: app.letter })
  icon.style.background = app.color
  return icon
}

// Offline status: the whole suite is precached by the service worker.
function offlineControl(): HTMLElement {
  const wrap = el('span', { class: 'offline-control' })
  if (!isOfflineCapable()) return wrap
  wrap.append(el('span', { class: 'offline-pending', textContent: t('Preparing offline use…') }))
  whenOfflineReady()
    .then(() => wrap.replaceChildren(el('span', { class: 'offline-ready', textContent: t('✓ Available offline'), title: t('All apps work without a connection') })))
    .catch(() => wrap.replaceChildren())
  return wrap
}

// Files opened with the installed app from the operating system ("Open with").
function handleLaunchedFiles(): void {
  const launchQueue = (window as unknown as { launchQueue?: { setConsumer(cb: (params: { files: FileSystemFileHandle[] }) => void): void } }).launchQueue
  launchQueue?.setConsumer(async ({ files }) => {
    const handle = files?.[0]
    if (!handle) return
    try {
      const file = await handle.getFile()
      const target = await appForFile(file)
      if (!target) return toast(t('This file type is not supported yet'))
      toast(t('Opening…'))
      location.href = await target.module.importFile(file)
    } catch (err) {
      toast(t('Could not open the file: {message}', { message: (err as Error).message }))
    }
  })
}
