// Shared document actions for every app's File menu: Nextcloud (open, save,
// account), "Make a copy", "Save version…" and "Version history…".
//
//   createMenuBar(…, [{ label: 'File', items: [..., '-', ...documentMenuItems(session)] }])

import { copyDocument, copyTitle, createCopyFromState } from '../core/copy'
import { locale, t } from '../core/i18n'
import type { Session } from '../core/session'
import { listVersions, restoreVersion, saveVersion, versionsArray, type Version } from '../core/versions'
import { nextcloudMenuItems } from './nextcloud'
import { confirmDialog, el, promptText, showDialog, toast, type MenuEntry } from './widgets'
import './edu.css'

export function documentMenuItems(session: Session): MenuEntry[] {
  return [
    ...nextcloudMenuItems(session),
    '-',
    { label: t('Make a copy'), run: () => void makeCopy(session) },
    { label: t('Save as template…'), run: () => void import('../home/save-template').then((m) => m.saveAsTemplate(session)) },
    { label: t('Storage and backup…'), run: () => void import('../home/storage').then((m) => m.openStorageDialog()) },
    { label: t('Save version…'), enabled: () => session.canEdit, run: () => void saveNamedVersion(session) },
    { label: t('Version history…'), run: () => void openVersionHistory(session) },
  ]
}

export async function makeCopy(session: Session): Promise<void> {
  try {
    toast(t('Making a copy…'))
    await copyDocument(session)
  } catch (err) {
    toast(t('Could not make a copy: {message}', { message: (err as Error).message }))
  }
}

export async function saveNamedVersion(session: Session): Promise<void> {
  if (!session.canEdit) return
  const label = await promptText(t('Save version'), t('Version name'), new Date().toLocaleString(locale))
  if (label === null) return
  saveVersion(session, label.trim() || undefined)
  toast(t('Version saved'))
}

export async function openVersionHistory(session: Session): Promise<void> {
  const list = el('div', { class: 'version-list' })
  const body = el('div', {}, list)
  if (session.canEdit) {
    const save = el('button', { type: 'button', class: 'version-save', textContent: t('Save version…') })
    save.addEventListener('click', () => void saveNamedVersion(session))
    body.prepend(el('div', { class: 'version-head' }, el('p', { class: 'hint', textContent: t('Versions are saved automatically while you edit, at most every 10 minutes. Named versions are always kept.') }), save))
  } else {
    body.prepend(el('p', { class: 'hint', textContent: t('You can open any version as your own copy.') }))
  }

  const render = () => {
    const versions = listVersions(session.doc)
    if (!versions.length) {
      list.replaceChildren(el('p', { class: 'empty', textContent: t('No versions yet.') }))
      return
    }
    list.replaceChildren(...versions.map((v) => row(v)))
  }
  const row = (v: Version) => {
    const open = el('button', { type: 'button', textContent: t('Open as copy') })
    open.addEventListener('click', async () => {
      toast(t('Making a copy…'))
      const title = String(session.doc.getMap('meta').get('title') ?? '')
      const privateState = session.canEdit ? session.hooks.privateState?.version(v.id) : null
      location.href = await createCopyFromState(session.type, `${copyTitle(title)} (${new Date(v.time).toLocaleString(locale)})`, v.state, privateState)
    })
    const actions = el('div', { class: 'version-actions' }, open)
    if (session.canEdit) {
      const restore = el('button', { type: 'button', textContent: t('Restore') })
      restore.addEventListener('click', async () => {
        if (!(await confirmDialog(t('Restore'), t('Restore this version for everyone? The current state is saved as a version first.'), { confirmLabel: t('Restore') }))) return
        try {
          await restoreVersion(session, v)
          ;(body.closest('dialog') as HTMLDialogElement | null)?.close()
          toast(t('Version restored'))
        } catch (err) {
          toast(t('Could not restore: {message}', { message: (err as Error).message }))
        }
      })
      actions.append(restore)
    }
    return el(
      'div',
      { class: 'version-row' },
      el(
        'div',
        { class: 'version-info' },
        el('span', { class: 'version-label', textContent: v.label || (v.auto ? t('Automatic version') : t('Version')) }),
        el('span', { class: 'version-meta', textContent: `${new Date(v.time).toLocaleString(locale)} · ${v.authorName}` }),
      ),
      actions,
    )
  }
  render()
  const versions = versionsArray(session.doc)
  versions.observe(render)
  await showDialog(t('Version history'), body, [{ label: t('Close'), value: 'ok', primary: true }], true)
  versions.unobserve(render)
}
