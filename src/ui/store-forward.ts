// Store-and-forward in the interface (core in core/store-forward/): the sync
// state next to the save state ("Synced to School relay"), and the settings
// section of the connection dialog (per browser; the school config may turn a
// backend on by default or forbid it).

import { CloudAlert, CloudCheck, CloudOff, CloudUpload, RefreshCw } from 'lucide'
import { t } from '../core/i18n'
import type { Session } from '../core/session'
import {
  nextcloudStoreChoice,
  relayStoreChoice,
  setStoreSettings,
  statusLabel,
  SETTINGS_EVENT,
  type BackendStatus,
  type SyncState,
} from '../core/store-forward'
import { el, icon } from './widgets'
import './store-forward.css'

const ICONS: Record<SyncState, Parameters<typeof icon>[0]> = {
  syncing: RefreshCw,
  synced: CloudCheck,
  readonly: CloudCheck,
  pending: CloudUpload,
  offline: CloudOff,
  error: CloudAlert,
}

function detail(s: BackendStatus): string {
  const time = s.lastSync ? new Date(s.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
  switch (s.state) {
    case 'synced':
      return t('Encrypted copy up to date (last checked {time}). People who open the document later get your changes even if you are offline.', { time })
    case 'readonly':
      return t('This link can only read: changes from {name} are downloaded, nothing is uploaded.', { name: s.label })
    case 'pending':
      return t('Your latest changes will be uploaded (encrypted) in a moment.')
    case 'offline':
      return t('{name} cannot be reached now. Your changes are kept in this browser and uploaded when it is reachable again.', { name: s.label })
    case 'error':
      return s.error ? t('Error: {message}', { message: s.error }) : t('Could not sync.')
    default:
      return t('Checking for changes…')
  }
}

// Sync state in the title row, next to the save state (the status bar may move it).
export function setupStoreForwardStatus(session: Session): void {
  const sf = session.storeForward
  if (!sf) return
  const box = el('span', { class: 'sf-states' })
  ;(document.querySelector('.save-indicator') ?? document.getElementById('save-state'))?.after(box)
  const render = () => {
    box.replaceChildren(
      ...sf.statuses.map((s) => {
        const label = statusLabel(s)
        const button = el(
          'button',
          { type: 'button', class: `sf-state ${s.state}`, title: `${label}\n${detail(s)}`, dataset: { backend: s.key } },
          icon(ICONS[s.state], 14),
          el('span', { class: 'sf-state-label', textContent: label }),
        )
        button.setAttribute('aria-label', label)
        button.addEventListener('click', () => void import('./connection').then((m) => m.openConnectionTest(session)))
        return button
      }),
    )
  }
  sf.onChange(render)
  render()
}

// Settings section for the connection dialog.
export function storeForwardSettings(session?: Session): HTMLElement {
  const section = el('section', { class: 'sf-settings' })
  let unsubscribe: (() => void) | undefined
  const render = async () => {
    const relay = await relayStoreChoice()
    const ncChoice = nextcloudStoreChoice()
    unsubscribe?.()
    section.replaceChildren(
      el('h3', { textContent: t('Sync without being online together') }),
      el('p', {
        class: 'hint',
        textContent: t(
          'Keeps an encrypted copy of the changes so that people who are never online at the same time still get them (for example, you edit in class and your teacher corrects at night). The server only sees encrypted data; the key travels in the document link.',
        ),
      }),
    )

    const relayBox = el('input', { type: 'checkbox', checked: relay.enabled, disabled: !relay.available || relay.forbidden })
    relayBox.addEventListener('change', () => setStoreSettings({ relay: relayBox.checked }))
    const relayNote = relay.forbidden
      ? t('Turned off by your school.')
      : !relay.available
        ? t('Needs a school relay that keeps encrypted copies (Ofimeo Relay).')
        : relay.ttlDays
          ? t('Copies are deleted after {days} days without changes.', { days: relay.ttlDays })
          : ''
    section.append(el('label', { class: 'conn-check' }, relayBox, relay.name ? t('On the school relay ({name})', { name: relay.name }) : t('On the school relay')))
    if (relayNote) section.append(el('p', { class: 'hint sf-note', textContent: relayNote }))

    const ncBox = el('input', { type: 'checkbox', checked: ncChoice.enabled, disabled: !ncChoice.account || ncChoice.forbidden })
    ncBox.addEventListener('change', () => setStoreSettings({ nextcloud: ncBox.checked }))
    section.append(el('label', { class: 'conn-check' }, ncBox, t('In a Nextcloud folder')))
    if (ncChoice.forbidden) section.append(el('p', { class: 'hint sf-note', textContent: t('Turned off by your school.') }))
    else if (!ncChoice.account) section.append(el('p', { class: 'hint sf-note', textContent: t('Connect a Nextcloud account first (File → Nextcloud account…).') }))
    else {
      const folder = el('input', { class: 'field mono', value: ncChoice.folder, spellcheck: false })
      folder.setAttribute('aria-label', t('Nextcloud folder for encrypted copies'))
      folder.addEventListener('change', () => setStoreSettings({ folder: folder.value.trim() || undefined }))
      section.append(
        el('label', { class: 'sf-folder' }, el('span', { textContent: t('Folder') }), folder),
        el('p', { class: 'hint sf-note', textContent: t('To sync with other people, use a folder shared with them in Nextcloud.') }),
      )
    }

    const sf = session?.storeForward
    if (sf) {
      if (!session.canEdit && !session.canComment) section.append(el('p', { class: 'hint', textContent: t('This link can only read: changes are downloaded, nothing is uploaded.') }))
      const list = el('ul', { class: 'conn-rows' })
      const now = el('button', { type: 'button', textContent: t('Sync now') })
      now.addEventListener('click', () => sf.syncNow())
      const renderList = () => {
        list.replaceChildren(
          ...sf.statuses.map((s) =>
            el(
              'li',
              { class: `conn-row ${s.state === 'synced' || s.state === 'readonly' ? 'ok' : s.state === 'error' ? 'fail' : s.state === 'syncing' ? 'pending' : 'warn'}` },
              el('span', { class: 'conn-dot' }),
              el('span', { class: 'conn-label', textContent: statusLabel(s) }),
              el('span', { class: 'conn-detail', textContent: detail(s) }),
            ),
          ),
        )
        now.hidden = sf.statuses.length === 0
      }
      unsubscribe = sf.onChange(renderList)
      renderList()
      section.append(list, el('div', { class: 'conn-actions' }, now))
    }
  }
  const onSettings = () => (section.isConnected ? void render() : window.removeEventListener(SETTINGS_EVENT, onSettings))
  window.addEventListener(SETTINGS_EVENT, onSettings)
  void render()
  return section
}
