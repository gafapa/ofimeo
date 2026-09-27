// Entry point of the notebook app, loaded on demand by the app registry.

import type { Session, SubmitFile } from '../../core/session'
import { mountNotebook, NOTEBOOK_ACCEPT } from './app'
import { createNotebookFromFiles, exportNotebookZip, exportScope, filesFromList, filesFromZip, notebookTitle } from './export'
import '../writer/writer.css'
import './notebook.css'

export const accept = NOTEBOOK_ACCEPT

export function mount(session: Session): void {
  mountNotebook(session, document.getElementById('root')!)
}

// A ZIP of Markdown (a notebook exported from Ofimeo, or any Markdown folder) or a Markdown file.
export async function importFile(file: File): Promise<string> {
  const list = /\.zip$/i.test(file.name) ? await filesFromZip(file) : filesFromList([file])
  return createNotebookFromFiles(file.name.replace(/\.[^.]+$/, ''), list)
}

// "Hand in": the notebook as Word (every page) and as a ZIP of Markdown with its pictures and ink.
export async function submitFiles(session: Session): Promise<SubmitFile[]> {
  const title = notebookTitle(session.doc)
  const [docx, zip] = await Promise.all([exportScope(session.doc, { kind: 'notebook' }, 'docx'), exportNotebookZip(session.doc)])
  return [
    { name: `${title}.docx`, blob: docx },
    { name: `${title} (Markdown).zip`, blob: zip },
  ]
}
