// Entry point of the forms app, loaded on demand by the app registry.

import type { Session, SubmitFile } from '../../core/session'
import { t } from '../../core/i18n'
import { FORMS_ACCEPT, mountForms } from './app'
import { createForm, formFile, parseFormFile } from './model'
import { applyStateGeneric } from '../../core/versions'
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

// Version restore: the form and its settings; receipts of received responses
// and released grades stay as they are (restoring them would ask respondents
// to send again or hide their grades). The answer key is restored by
// session.hooks.privateState (state.ts).
export function restoreVersion(session: Session, state: Uint8Array): void {
  applyStateGeneric(session.doc, state, { skip: ['form-receipts', 'form-results'] })
}
