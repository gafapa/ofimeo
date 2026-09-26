// Entry point of the forms app, loaded on demand by the app registry.

import type { Session, SubmitFile } from '../../core/session'
import { t } from '../../core/i18n'
import { FORMS_ACCEPT, mountForms } from './app'
import { createForm, formFile, parseFormFile } from './model'
import './forms.css'

export const accept = FORMS_ACCEPT

export async function mount(session: Session): Promise<void> {
  await mountForms(session, document.getElementById('root')!)
}

// Imports an .oform file (form definition, with the answer key when an editor exported it).
export async function importFile(file: File): Promise<string> {
  const data = parseFormFile(await file.text())
  if (!data.title) data.title = file.name.replace(/\.[^.]+$/, '')
  return createForm(data)
}

// "Hand in": the form definition (without responses).
export async function submitFiles(session: Session): Promise<SubmitFile[]> {
  const title = String(session.doc.getMap('meta').get('title') || t('Untitled form'))
  return [{ name: `${title}.oform`, blob: new Blob([JSON.stringify(formFile(session.doc, null), null, 1)], { type: 'application/json' }) }]
}
