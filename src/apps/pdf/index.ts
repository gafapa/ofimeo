// Entry point of Ofimeo PDF, loaded on demand by the app registry.

import { createLocalDocument, type Session, type SubmitFile } from '../../core/session'
import { t } from '../../core/i18n'
import { loadUser } from '../../core/store'
import { confirmDialog, el, showDialog } from '../../ui/widgets'
import { mountPdf, PDF_ACCEPT, pdfApps } from './app'
import { fillDoc, WARN_SIZE } from './model'
import './pdf.css'

export const accept = PDF_ACCEPT

export async function mount(session: Session): Promise<void> {
  await mountPdf(session, document.getElementById('root')!)
}

const isZip = (file: File) => /\.zip$/i.test(file.name) || file.type === 'application/zip'

// The PDF to open from a file: the file itself, or one chosen from a hand-in ZIP.
// Large files need a confirmation (every collaborator and version keeps a copy).
export async function pickPdf(file: File): Promise<File | null> {
  let pdf: File | null = file
  if (isZip(file)) {
    const { default: JSZip } = await import('jszip')
    const zip = await JSZip.loadAsync(file)
    const entries = Object.values(zip.files).filter((f) => !f.dir && /\.pdf$/i.test(f.name) && !f.name.startsWith('__MACOSX/'))
    if (!entries.length) throw new Error(t('This ZIP file has no PDF inside'))
    let chosen = entries[0]
    if (entries.length > 1) {
      const select = el('select', { class: 'field' })
      entries.forEach((f, i) => select.append(el('option', { value: String(i), textContent: f.name })))
      const body = el('label', { class: 'field-label' }, t('PDF to open'), select)
      if ((await showDialog(t('Open a PDF from the ZIP'), body, [{ label: t('Cancel'), value: 'cancel' }, { label: t('Open'), value: 'ok', primary: true }])) !== 'ok') return null
      chosen = entries[Number(select.value)]
    }
    pdf = new File([await chosen.async('uint8array') as BlobPart], chosen.name.split('/').pop()!, { type: 'application/pdf' })
  }
  if (pdf.size > WARN_SIZE) {
    const mb = Math.round(pdf.size / 1048576)
    const ok = await confirmDialog(
      t('Large PDF'),
      t('This PDF is {size} MB. It is stored inside the document, so every collaborator downloads it and every version keeps it. Sharing may be slow.', { size: mb }),
      { confirmLabel: t('Open anyway') },
    )
    if (!ok) return null
  }
  return pdf
}

// Imports a PDF (or a PDF from a hand-in ZIP) into a new local document; returns its path.
export async function importFile(file: File): Promise<string> {
  const pdf = await pickPdf(file)
  if (!pdf) return location.href
  const { preparePdf } = await import('./import')
  const prepared = await preparePdf(new Uint8Array(await pdf.arrayBuffer()), pdf.name, { author: loadUser().name })
  return createLocalDocument('pdf', pdf.name.replace(/\.pdf$/i, ''), (doc) => fillDoc(doc, prepared))
}

// "Hand in": the PDF with editable annotations and a flattened copy.
export async function submitFiles(session: Session): Promise<SubmitFile[]> {
  const app = pdfApps.get(session)
  if (!app) throw new Error(t('The PDF is still loading'))
  const title = String(session.doc.getMap('meta').get('title') || t('Untitled PDF'))
  const pdf = (bytes: Uint8Array) => new Blob([bytes as BlobPart], { type: 'application/pdf' })
  return [
    { name: `${title}.pdf`, blob: pdf(await app.exportBytes('annotations')) },
    { name: `${title} (${t('flattened')}).pdf`, blob: pdf(await app.exportBytes('flatten')) },
  ]
}
