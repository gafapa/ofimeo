// "Storage and backup" dialog (home screen and File menu), backup and restore
// flows, the home-screen backup reminder and the persistent-storage notice.
// The logic lives in core/backup.ts.

import { appInfo } from '../apps/registry'
import * as backup from '../core/backup'
import { downloadBlob } from '../core/handin'
import { locale, t, tn } from '../core/i18n'
import * as store from '../core/store'
import { confirmDialog, el, showDialog, toast } from '../ui/widgets'
import './storage.css'

const DAY = 86400000

export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < units.length - 1) (n /= 1024, i++)
  return `${n.toLocaleString(locale, { maximumFractionDigits: n < 10 && i ? 1 : 0 })} ${units[i]}`
}

const formatTime = (time?: number) => (time ? new Date(time).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : t('Never'))

// Called after a restore or any change that affects the home screen.
let onChanged: () => void = () => {}
export function setChangeListener(fn: () => void): void {
  onChanged = fn
}

export function clearDataWarning(): HTMLElement {
  return el(
    'div',
    { class: 'storage-warning', role: 'note' },
    el('strong', { textContent: t('Your documents are stored only in this browser.') }),
    ' ',
    t('Clearing the browser data (history, cookies and site data) deletes them for good. Back up regularly, or save them to Nextcloud.'),
  )
}

export async function openStorageDialog(): Promise<void> {
  const body = el('div', { class: 'storage-dialog' })
  const render = async () => {
    const info = await backup.storageInfo()
    const settings = backup.loadSettings()
    const docs = store.activeDocs()
    const localOnly = backup.localOnlyDocs().length
    const trashed = store.trashedDocs().length

    const usage = el('div', { class: 'storage-usage' })
    if (info.supported && info.quota) {
      const meter = el('meter', { min: 0, max: info.quota, value: info.usage ?? 0, low: info.quota * 0.7, high: info.quota * 0.9, optimum: 0 })
      meter.setAttribute('aria-label', t('Storage used'))
      usage.append(el('p', { textContent: t('{used} used of {quota} available to this site', { used: formatBytes(info.usage), quota: formatBytes(info.quota) }) }), meter)
    } else usage.append(el('p', { class: 'hint', textContent: t('This browser does not report how much storage is used.') }))

    const persist = el('div', { class: `storage-persist ${info.persisted ? 'ok' : 'warn'}` })
    if (info.persisted) persist.append(el('span', { textContent: t('Protected: the browser will not delete these documents to free up space.') }))
    else {
      const ask = el('button', { type: 'button', class: 'storage-btn', textContent: t('Protect storage') })
      ask.addEventListener('click', async () => {
        const granted = await backup.requestPersistence()
        toast(granted ? t('Storage is now protected') : t('The browser did not allow it. Installing Ofimeo as an app or bookmarking it usually helps.'))
        void render()
      })
      persist.append(el('span', { textContent: t('Not protected: the browser may delete these documents when space runs low.') }), info.supported ? ask : '')
    }

    const counts = el('p', {
      textContent: [
        tn(docs.length, '{n} document', '{n} documents'),
        tn(localOnly, '{n} only in this browser', '{n} only in this browser'),
        tn(trashed, '{n} in the trash', '{n} in the trash'),
      ].join(' · '),
    })

    const backupAll = el('button', { type: 'button', class: 'storage-btn primary', textContent: t('Back up all documents…') })
    backupAll.addEventListener('click', () => void backupFlow().then(render))
    const restore = el('button', { type: 'button', class: 'storage-btn', textContent: t('Restore backup…') })
    restore.addEventListener('click', () => void restoreFlow().then(render))

    const remind = el('select', { class: 'field inline' })
    for (const days of [0, 3, 7, 14, 30]) remind.append(new Option(days ? tn(days, '{n} day', '{n} days') : t('Never'), String(days), false, settings.remindDays === days))
    remind.addEventListener('change', () => {
      backup.saveSettings({ remindDays: Number(remind.value) })
      onChanged()
    })

    body.replaceChildren(
      clearDataWarning(),
      el('h3', { textContent: t('Storage') }),
      usage,
      persist,
      counts,
      el('h3', { textContent: t('Backup') }),
      el('p', { textContent: t('Last backup: {date}', { date: formatTime(settings.lastBackup) }) }),
      el('div', { class: 'storage-actions' }, backupAll, restore),
      el('label', { class: 'storage-row' }, t('Remind me when there is no backup for'), remind),
      await autoSection(settings, render),
    )
  }
  await render()
  await showDialog(t('Storage and backup'), body, [{ label: t('Close'), value: 'close', primary: true }], true, 'backup')
}

async function autoSection(settings: backup.BackupSettings, render: () => Promise<void>): Promise<HTMLElement> {
  const { currentAccount } = await import('../core/nextcloud')
  const account = currentAccount()
  const auto = settings.auto
  const section = el('div', { class: 'storage-auto' }, el('h3', { textContent: t('Automatic backup to Nextcloud') }))
  if (!account) {
    const link = el('button', { type: 'button', class: 'storage-btn', textContent: t('Nextcloud account…') })
    link.addEventListener('click', () => void import('../ui/nextcloud').then((m) => m.openAccountDialog()).then(render))
    section.append(el('p', { class: 'hint', textContent: t('Link a Nextcloud account to back up your documents there automatically.') }), link)
    return section
  }
  const enabled = el('input', { type: 'checkbox', checked: auto.enabled })
  const days = el('select', { class: 'field inline' })
  for (const n of [1, 3, 7, 14, 30]) days.append(new Option(tn(n, '{n} day', '{n} days'), String(n), false, auto.days === n))
  const folder = el('input', { class: 'field', value: auto.folder })
  const password = el('input', { class: 'field', type: 'password', value: auto.password ?? '', autocomplete: 'new-password' })
  const save = () =>
    backup.saveSettings({ auto: { ...backup.loadSettings().auto, enabled: enabled.checked, days: Number(days.value), folder: folder.value.trim() || '/Ofimeo/Backups', password: password.value || undefined } })
  for (const input of [enabled, days, folder, password]) input.addEventListener('change', save)
  const now = el('button', { type: 'button', class: 'storage-btn', textContent: t('Back up to Nextcloud now') })
  now.addEventListener('click', async () => {
    save()
    now.disabled = true
    toast(t('Backing up…'))
    try {
      const path = await backup.runAutoBackup(true)
      toast(path ? t('Saved to Nextcloud: {path}', { path }) : t('Nothing to back up'))
    } catch (err) {
      toast(t('The backup could not be saved to Nextcloud: {message}', { message: (err as Error).message }))
    }
    void render()
  })
  section.append(
    el('label', { class: 'storage-row' }, enabled, t('Back up to {account} every', { account: account.displayName || account.user }), days),
    el('label', { class: 'field-label' }, t('Folder'), folder),
    el('label', { class: 'field-label' }, t('Password for the automatic backups (optional)'), password),
    el('p', { class: 'hint', textContent: t('Last automatic backup: {date}', { date: formatTime(auto.lastRun) }) }),
    auto.lastError ? el('p', { class: 'storage-error', textContent: auto.lastError }) : '',
    now,
  )
  return section
}

// Asks for an optional password, builds the backup and downloads it.
export async function backupFlow(ids?: string[]): Promise<boolean> {
  const count = ids ? ids.length : store.listDocs().length
  if (!count) {
    toast(t('There are no documents to back up'))
    return false
  }
  const password = el('input', { class: 'field', type: 'password', autocomplete: 'new-password' })
  const repeat = el('input', { class: 'field', type: 'password', autocomplete: 'new-password' })
  const error = el('p', { class: 'storage-error', hidden: true })
  const body = el(
    'div',
    { class: 'storage-dialog' },
    el('p', { textContent: tn(count, 'The backup file will contain {n} document with its version history and comments.', 'The backup file will contain {n} documents with their version history and comments.') }),
    el('p', { class: 'storage-warning', textContent: t('It also contains the keys to edit them: anyone who has the file can open them. Protect it with a password if you store it somewhere others can reach.') }),
    el('label', { class: 'field-label' }, t('Password (optional)'), password),
    el('label', { class: 'field-label' }, t('Repeat the password'), repeat),
    error,
  )
  for (;;) {
    const answer = await showDialog(ids ? t('Back up selected documents') : t('Back up all documents'), body, [
      { label: t('Cancel'), value: 'cancel' },
      { label: t('Back up'), value: 'ok', primary: true },
    ], false, 'backup')
    if (answer !== 'ok') return false
    if (password.value === repeat.value) break
    error.textContent = t('The passwords do not match.')
    error.hidden = false
  }
  toast(t('Backing up…'))
  try {
    const blob = await backup.buildBackup({ ids, password: password.value || undefined })
    downloadBlob(blob, backup.backupFileName())
    toast(t('Backup saved'))
    onChanged()
    return true
  } catch (err) {
    toast(t('The backup failed: {message}', { message: (err as Error).message }))
    return false
  }
}

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = el('input', { type: 'file', accept, hidden: true })
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null)
      input.remove()
    })
    input.addEventListener('cancel', () => {
      resolve(null)
      input.remove()
    })
    document.body.append(input)
    input.click()
  })
}

// Picks a backup file (or uses `file`), asks for the password when needed, merges it and reports.
export async function restoreFlow(file?: File | null): Promise<void> {
  file ??= await pickFile(`${backup.BACKUP_EXT},.zip`)
  if (!file) return
  let opened: backup.OpenedBackup
  try {
    let password: string | undefined
    if (await backup.backupNeedsPassword(file)) {
      for (;;) {
        password = (await askPassword(password !== undefined)) ?? undefined
        if (password === undefined) return
        try {
          opened = await backup.openBackup(file, password)
          break
        } catch (err) {
          if (!(err instanceof backup.BackupError && err.kind === 'password')) throw err
        }
      }
    } else opened = await backup.openBackup(file)
  } catch (err) {
    toast((err as Error).message)
    return
  }
  const count = opened.index.docs.length
  const when = opened.created ? new Date(opened.created).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : '—'
  const ok = await confirmDialog(
    t('Restore backup'),
    tn(count, 'The backup of {date} contains {n} document. Documents that are already in this browser are merged with their copy in the backup (nothing is lost); the others are added.', 'The backup of {date} contains {n} documents. Documents that are already in this browser are merged with their copy in the backup (nothing is lost); the others are added.', { date: when }),
    { confirmLabel: t('Restore') },
  )
  if (!ok) return
  toast(t('Restoring…'))
  const report = await backup.restoreBackup(opened)
  onChanged()
  await showReport(report)
}

async function askPassword(retry: boolean): Promise<string | null> {
  const input = el('input', { class: 'field', type: 'password', autocomplete: 'current-password' })
  const body = el(
    'div',
    {},
    retry ? el('p', { class: 'storage-error', textContent: t('Wrong password.') }) : '',
    el('label', { class: 'field-label' }, t('This backup is protected with a password.'), input),
  )
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      ;(input.closest('dialog') as HTMLDialogElement).close('ok')
    }
  })
  const answer = await showDialog(t('Password'), body, [
    { label: t('Cancel'), value: 'cancel' },
    { label: t('Open'), value: 'ok', primary: true },
  ])
  return answer === 'ok' ? input.value : null
}

async function showReport(report: backup.RestoreReport): Promise<void> {
  const title = (d: store.DocEntry) => d.title || appInfo(d.type).untitled
  const group = (label: string, docs: store.DocEntry[]) =>
    docs.length ? el('details', { open: docs.length <= 8 }, el('summary', { textContent: `${label} (${docs.length})` }), el('ul', {}, ...docs.map((d) => el('li', { textContent: title(d) })))) : ''
  const body = el(
    'div',
    { class: 'storage-dialog storage-report' },
    el('p', {
      textContent: [
        tn(report.added.length, '{n} added', '{n} added'),
        tn(report.updated.length, '{n} merged with changes', '{n} merged with changes'),
        tn(report.unchanged.length, '{n} already up to date', '{n} already up to date'),
      ].join(' · '),
    }),
    group(t('Added'), report.added),
    group(t('Merged with changes'), report.updated),
    group(t('Already up to date'), report.unchanged),
    report.templates ? el('p', { textContent: tn(report.templates, '{n} template added', '{n} templates added') }) : '',
    report.failed.length
      ? el('div', { class: 'storage-error' }, el('p', { textContent: t('Could not be restored:') }), el('ul', {}, ...report.failed.map((f) => el('li', { textContent: `${title(f.entry)}: ${f.error}` }))))
      : '',
    el('p', { class: 'hint', textContent: t('Documents that are open in another tab show the restored content after reloading that tab.') }),
  )
  await showDialog(t('Backup restored'), body, [{ label: t('OK'), value: 'ok', primary: true }])
}

// Home screen: warning when documents exist only here and there is no recent backup.
export function backupReminder(): HTMLElement | null {
  if (!backup.reminderDue()) return null
  const settings = backup.loadSettings()
  const count = backup.localOnlyDocs().length
  const since = settings.lastBackup
    ? tn(Math.floor((Date.now() - settings.lastBackup) / DAY), 'The last backup was {n} day ago.', 'The last backup was {n} days ago.')
    : t('You have never made a backup.')
  const banner = el('div', { class: 'backup-reminder', role: 'status' })
  const now = el('button', { type: 'button', class: 'storage-btn primary', textContent: t('Back up now') })
  now.addEventListener('click', () => void backupFlow().then((done) => done && banner.remove()))
  const more = el('button', { type: 'button', class: 'storage-btn', textContent: t('Storage and backup…') })
  more.addEventListener('click', () => void openStorageDialog())
  const dismiss = el('button', { type: 'button', class: 'storage-btn', textContent: t('Dismiss') })
  dismiss.addEventListener('click', () => {
    backup.saveSettings({ dismissedAt: Date.now() })
    banner.remove()
  })
  banner.append(
    el(
      'div',
      { class: 'backup-reminder-text' },
      el('strong', { textContent: tn(count, '{n} document exists only in this browser.', '{n} documents exist only in this browser.') }),
      ' ',
      since,
      ' ',
      t('Clearing the browser data deletes the documents stored here.'),
    ),
    el('div', { class: 'backup-reminder-actions' }, now, more, dismiss),
  )
  return banner
}

// Shown once, when the first document is created: why the browser may ask for storage.
export function showPersistenceNotice(granted: boolean): void {
  document.querySelector('.persist-notice')?.remove()
  const close = el('button', { type: 'button', class: 'persist-close', textContent: '×', title: t('Close') })
  close.setAttribute('aria-label', t('Close'))
  const more = el('button', { type: 'button', class: 'storage-btn', textContent: t('Storage and backup…') })
  const notice = el(
    'div',
    { class: 'persist-notice', role: 'status' },
    close,
    el('strong', { textContent: t('Your documents are saved in this browser') }),
    el('p', {
      textContent: granted
        ? t('The browser will keep them even when space runs low. Clearing the browser data still deletes them: make backups from time to time.')
        : t('Ofimeo asked the browser to keep them even when space runs low. Clearing the browser data deletes them: make backups from time to time.'),
    }),
    more,
  )
  const remove = () => notice.remove()
  close.addEventListener('click', remove)
  more.addEventListener('click', () => {
    remove()
    void openStorageDialog()
  })
  document.body.append(notice)
  window.setTimeout(remove, 20000)
}
