// App chrome shared by every document type: title, access badge, save state,
// presence avatars, connection status, share dialog (permission links), hand
// in and user name.

import QRCode from 'qrcode'
import { CloudCheck, CloudUpload } from 'lucide'
import { appInfo } from '../apps/registry'
import { buildHandIn, downloadBlob, printDocument } from '../core/handin'
import { t } from '../core/i18n'
import { updateAuthor, type Access, type Session } from '../core/session'
import * as store from '../core/store'
import { setupAutoVersions } from '../core/versions'
import { handInToShare, setupNextcloud } from './nextcloud'
import { el, icon, promptText, showDialog, toast } from './widgets'
import './edu.css'

export function accessLabel(access: Access | undefined): string {
  return access === 'view' ? t('View only') : access === 'comment' ? t('Can comment') : ''
}

export function setupChrome(session: Session, untitled: string): void {
  const { doc, awareness, room, user } = session
  const meta = doc.getMap<unknown>('meta')

  // Title (shared with collaborators; only editors can change it).
  const titleInput = document.getElementById('doc-title') as HTMLInputElement
  titleInput.placeholder = untitled
  titleInput.readOnly = !session.canEdit
  const syncTitle = () => {
    const title = String(meta.get('title') ?? '')
    if (document.activeElement !== titleInput) titleInput.value = title
    document.title = `${title || untitled} · ${appInfo(session.type).product}`
  }
  titleInput.addEventListener('input', () => session.canEdit && meta.set('title', titleInput.value))
  titleInput.addEventListener('keydown', (e) => e.key === 'Enter' && titleInput.blur())
  meta.observe(syncTitle)
  syncTitle()

  const badge = document.getElementById('access-badge')
  if (badge && !session.canEdit) {
    badge.hidden = false
    badge.textContent = accessLabel(session.access)
    badge.title =
      session.access === 'view'
        ? t('You can read this document and make your own copy (File → Make a copy)')
        : t('You can read and comment on this document')
  }
  if (session.warning) toast(session.warning)

  // Local name and color.
  const nameInput = document.getElementById('user-name') as HTMLInputElement
  nameInput.value = user.name
  nameInput.style.borderColor = user.color
  nameInput.addEventListener('change', () => {
    user.name = nameInput.value.trim() || user.name
    nameInput.value = user.name
    store.saveUser(user)
    awareness.setLocalStateField('user', { ...awareness.getLocalState()?.user, name: user.name, color: user.color })
    if (session.authors.has(String(doc.clientID))) updateAuthor(session, user)
  })

  // Presence avatars.
  const presence = document.getElementById('presence')!
  const renderPresence = () => {
    presence.replaceChildren(
      ...[...awareness.getStates().entries()]
        .filter(([, s]) => s.user)
        .map(([id, s]) => {
          const dot = el('span', { class: 'avatar', textContent: String(s.user.name || '?').charAt(0).toUpperCase() })
          dot.style.background = s.user.color
          const role = accessLabel(s.access)
          dot.title = `${s.user.name}${id === doc.clientID ? ` (${t('you')})` : ''}${role ? ` · ${role}` : ''}`
          return dot
        }),
    )
  }
  awareness.on('change', renderPresence)
  renderPresence()

  // Connection status.
  const status = document.getElementById('peer-status')!
  const renderStatus = () => {
    const peers = room.peerCount
    if (!navigator.onLine && peers === 0) {
      status.textContent = t('Offline')
      status.className = 'status offline'
      status.title = t('Changes are saved in this browser and synced when others are reachable')
    } else if (peers === 0) {
      status.textContent = t('Only you')
      status.className = 'status offline'
      status.title = session.canEdit ? t('Share the link to edit together') : t('Waiting for someone who has this document to be online')
    } else {
      status.textContent = t('{count} here', { count: peers + 1 })
      status.className = 'status online'
      status.title = t('Connected in real time')
    }
  }
  room.onPeersChange(renderStatus)
  window.addEventListener('online', renderStatus)
  window.addEventListener('offline', renderStatus)
  renderStatus()
  // Clicking the status opens the connection test (loaded on demand).
  status.setAttribute('role', 'button')
  status.tabIndex = 0
  status.style.cursor = 'pointer'
  const openTest = () => void import('./connection').then((m) => m.openConnectionTest(session))
  status.addEventListener('click', openTest)
  status.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openTest()))

  document.getElementById('btn-share')!.addEventListener('click', () => openShareDialog(session))
  document.getElementById('btn-handin')?.addEventListener('click', () => void handIn(session, untitled))

  setupSaveState(session)
  setupAutoVersions(session)
  setupNextcloud(session)
}

// Save state ("Saving…" / "Saved in this browser") for every app: an icon, always
// shown (phones show only the icon), and a label. The shared status bar
// (statusbar.ts) moves the indicator into the status bar.
export function setupSaveState(session: Session): void {
  const indicator = document.querySelector<HTMLElement>('.save-indicator')
  const label = document.getElementById('save-state')
  if (!indicator || !label) return
  let timer = 0
  const render = (saving: boolean) => {
    const text = saving ? t('Saving…') : t('Saved in this browser')
    label.textContent = text
    indicator.classList.toggle('saving', saving)
    indicator.title = text
    indicator.querySelector('svg')?.replaceWith(icon(saving ? CloudUpload : CloudCheck, 16))
  }
  session.doc.on('update', () => {
    if (!indicator.classList.contains('saving')) render(true)
    clearTimeout(timer)
    timer = window.setTimeout(() => render(false), 600)
  })
  render(false)
}

type LinkChoice = Access | 'copy'

// Share dialog: one link per permission level (up to this browser's access)
// plus a link that gives everyone their own copy.
export async function openShareDialog(session: Session): Promise<void> {
  const choices: { value: LinkChoice; label: string; desc: string }[] = []
  if (session.isProtected) {
    if (session.canEdit) choices.push({ value: 'edit', label: t('Can edit'), desc: t('Anyone with this link can edit the document with you in real time.') })
    if (session.canComment) choices.push({ value: 'comment', label: t('Can comment'), desc: t('Anyone with this link can read the document and add comments, but not change it.') })
    choices.push({ value: 'view', label: t('Can view'), desc: t('Anyone with this link can read the document (and follow changes live), but not change it.') })
  } else {
    choices.push({ value: 'edit', label: t('Can edit'), desc: t('Anyone who opens this link can edit the document with you in real time.') })
  }
  choices.push({
    value: 'copy',
    label: t('Makes a copy'),
    desc: t('Everyone who opens this link gets their own private copy (for example, a worksheet for each student). Your browser, or someone who has the document open, must be online when they open it.'),
  })

  const input = el('input', { readOnly: true, class: 'field mono' })
  const copyBtn = el('button', { type: 'button', textContent: t('Copy link') })
  copyBtn.addEventListener('click', () => copyText(input))
  const canvas = el('canvas', { class: 'qr' })
  const desc = el('p', { class: 'share-desc' })
  const tabs = el('div', { class: 'share-tabs', role: 'tablist' })
  const select = (choice: (typeof choices)[number]) => {
    input.value = choice.value === 'copy' ? session.copyUrl() : session.shareUrl(choice.value)
    desc.textContent = choice.desc
    for (const b of tabs.children) {
      const active = (b as HTMLElement).dataset.value === choice.value
      b.classList.toggle('active', active)
      b.setAttribute('aria-selected', String(active))
    }
    void QRCode.toCanvas(canvas, input.value, { width: 200, margin: 1 }).catch(() => {})
  }
  for (const choice of choices) {
    const b = el('button', { type: 'button', class: 'share-tab', textContent: choice.label, dataset: { value: choice.value } })
    b.setAttribute('role', 'tab')
    b.addEventListener('click', () => select(choice))
    tabs.append(b)
  }
  const notes = el('p', {
    class: 'hint',
    textContent: session.isProtected
      ? t('View and comment links cannot be turned into edit links: changes are only accepted when signed with the edit key, which only edit links contain. Edits travel directly between browsers; public relays are only used to find each other.')
      : t('This document was created before permission links existed, so every link can edit. To share it as view only, make a copy (File → Make a copy) and share the copy.'),
  })
  const body = el('div', {}, tabs, desc, el('div', { class: 'code-row' }, input, copyBtn), canvas, notes)
  const shown = showDialog(t('Share'), body, [{ label: t('Done'), value: 'ok', primary: true }], false, 'sharing')
  select(choices[0])
  await shown
}

// "Hand in": downloads a ZIP with the document in its original formats, then
// offers printing (Save as PDF).
export async function handIn(session: Session, untitled: string): Promise<void> {
  const { user } = session
  if (isGuestName(user.name)) {
    const name = await promptText(t('Hand in'), t('Your full name (it goes in the file name)'), '')
    if (name === null) return
    if (name.trim()) {
      user.name = name.trim()
      store.saveUser(user)
      const input = document.getElementById('user-name') as HTMLInputElement | null
      if (input) input.value = user.name
      session.awareness.setLocalStateField('user', { name: user.name, color: user.color })
    }
  }
  const title = String(session.doc.getMap('meta').get('title') || untitled)
  let fileName = ''
  let zip: Awaited<ReturnType<typeof buildHandIn>>
  try {
    toast(t('Preparing your files…'))
    zip = await buildHandIn(session, title, user.name)
    downloadBlob(zip.blob, zip.name)
    fileName = zip.name
  } catch (err) {
    toast(t('Could not prepare the files: {message}', { message: (err as Error).message }))
    return
  }
  const body = el(
    'div',
    {},
    el('p', { textContent: t('Your work was downloaded as “{name}”.', { name: fileName }) }),
    el('p', { class: 'hint', textContent: t('Upload or send this file to your teacher. If a PDF is also needed, use “Print / Save as PDF” and choose “Save as PDF” as the printer.') }),
    el('p', { class: 'hint', textContent: t('If your teacher gave you a Nextcloud upload link, you can also send the file there directly.') }),
  )
  const choice = await showDialog(t('Hand in'), body, [
    { label: t('Upload to a Nextcloud share link…'), value: 'nextcloud' },
    { label: t('Print / Save as PDF'), value: 'print' },
    { label: t('Done'), value: 'ok', primary: true },
  ], false, 'handin')
  if (choice === 'print') setTimeout(() => printDocument(session), 100)
  if (choice === 'nextcloud') await handInToShare(session, zip)
}

// Automatic names ("Guest 123", in any language) are replaced by a real one when handing in.
function isGuestName(name: string): boolean {
  const prefix = /^(.+) \d+$/.exec(name)?.[1]
  return prefix === 'Guest' || prefix === t('Guest {n}').replace('{n}', '').trim()
}

export async function copyText(input: HTMLInputElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(input.value)
  } catch {
    // The Clipboard API is unavailable on plain http origins.
    input.select()
    document.execCommand('copy')
  }
  toast(t('Copied'))
}
