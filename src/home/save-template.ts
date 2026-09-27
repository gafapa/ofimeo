// File ▸ Save as template…: saves the open document as an own template
// (core/library-templates.ts), listed on the home screen under "My templates".

import { t } from '../core/i18n'
import type { Session } from '../core/session'
import { el, showDialog, toast } from '../ui/widgets'
import './storage.css'

export async function saveAsTemplate(session: Session): Promise<void> {
  const title = String(session.doc.getMap('meta').get('title') ?? '')
  const name = el('input', { class: 'field', value: title, required: true })
  const description = el('textarea', { class: 'field', rows: 3 })
  const body = el(
    'div',
    { class: 'storage-dialog' },
    el('label', { class: 'field-label' }, t('Template name'), name),
    el('label', { class: 'field-label' }, t('Description (optional)'), description),
    el('p', { class: 'hint', textContent: t('The template keeps the current content only: no comments, version history or sharing links. It is saved in this browser; you can export it as a file to share it.') }),
  )
  const answer = await showDialog(t('Save as template'), body, [
    { label: t('Cancel'), value: 'cancel' },
    { label: t('Save'), value: 'ok', primary: true },
  ])
  if (answer !== 'ok') return
  try {
    const { saveTemplateFromSession } = await import('../core/library-templates')
    const tpl = await saveTemplateFromSession(session, name.value.trim() || title || t('Untitled'), description.value.trim())
    toast(t('Template “{name}” saved. Find it on the home screen under My templates.', { name: tpl.name }))
  } catch (err) {
    toast(t('Could not save the template: {message}', { message: (err as Error).message }))
  }
}
