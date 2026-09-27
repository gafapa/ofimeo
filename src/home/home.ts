// Home screen: create documents of every type, open files and list the
// documents stored in this browser.

import { ALL_ACCEPT, appForFile, appInfo, offeredApps, SUITE, type AppInfo } from '../apps/registry'
import { newDocPath } from '../core/router'
import { isOfflineCapable, whenOfflineReady } from '../core/offline'
import { languageSelect, t, tn } from '../core/i18n'
import * as store from '../core/store'
import { legalFooter } from '../legal/links'
import { accessibilityButton } from '../ui/accessibility'
import { brandMark } from '../ui/brand'
import { schoolBadge } from '../ui/school'
import { nameButton } from '../ui/shell'
import { helpMenuItems } from '../ui/menus'
import { openAccountDialog, openFromNextcloud } from '../ui/nextcloud'
import { registerShortcuts, showShortcuts } from '../ui/shortcuts'
import { el, icon, showContextMenu, toast, uiZoom } from '../ui/widgets'
import { CircleHelp, Cloud, HardDrive } from 'lucide'
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

  // Nextcloud: open files from it, account settings (needs a connection).
  const cloudOpen = el('button', { type: 'button', class: 'home-open', textContent: t('Open from Nextcloud…') })
  cloudOpen.addEventListener('click', () => void openFromNextcloud())
  const cloudButton = el('button', { type: 'button', class: 'home-cloud', title: t('Nextcloud account') }, icon(Cloud, 18), el('span', { class: 'btn-label', textContent: 'Nextcloud' }))
  cloudButton.setAttribute('aria-label', t('Nextcloud account'))
  cloudButton.addEventListener('click', () => void openAccountDialog())
  const renderOnline = () => {
    cloudOpen.disabled = !navigator.onLine
    cloudOpen.title = navigator.onLine ? t('Open a file from your Nextcloud') : t('You are offline. Nextcloud can be used again when you are connected.')
  }
  window.addEventListener('online', renderOnline)
  window.addEventListener('offline', renderOnline)
  renderOnline()

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
        cloudButton,
        storageButton(),
        languageSelect('home-language'),
        helpButton(),
        accessibilityButton(true),
        nameInput,
        nameButton(nameInput),
      ),
      el(
        'section',
        { class: 'home-new' },
        el('div', { class: 'home-inner' }, el('div', { class: 'home-section-title' }, el('h2', { textContent: t('Start something new') }), el('span', { class: 'home-open-buttons' }, openButton, cloudOpen), fileInput), newCards),
      ),
      reminderSlot,
      templatesSection(),
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
    if (e.key === null || e.key.startsWith('words-online:')) docs.refresh()
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

// Template gallery, loaded as a separate chunk (src/templates).
function templatesSection(): HTMLElement {
  const inner = el('div', { class: 'home-inner' })
  import('../templates/gallery')
    .then(({ mountTemplates }) => mountTemplates(inner))
    .catch(() => inner.replaceChildren())
  return el('section', { class: 'home-templates' }, inner)
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
