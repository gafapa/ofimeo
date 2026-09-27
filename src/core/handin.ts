// "Hand in": one ZIP with the document in its original formats (from the app's
// submitFiles hook) and a README.txt with title, author and date.

import { locale, t } from './i18n'
import type { Session, SubmitFile } from './session'

export const safeFileName = (name: string) => name.normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim() || 'document'

export async function buildHandIn(session: Session, title: string, author: string): Promise<SubmitFile> {
  if (!session.hooks.submitFiles) throw new Error(t('This app cannot hand in documents yet'))
  const files = await session.hooks.submitFiles()
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const now = new Date()
  const used = new Set<string>()
  const names: string[] = []
  for (const file of files) {
    let name = safeFileName(file.name)
    for (let i = 2; used.has(name.toLowerCase()); i++) name = safeFileName(file.name).replace(/(\.[^.]*)?$/, ` (${i})$1`)
    used.add(name.toLowerCase())
    names.push(name)
    zip.file(name, file.blob)
  }
  const readme = [
    `${t('Title')}: ${title}`,
    `${t('Author')}: ${author}`,
    `${t('Date')}: ${now.toLocaleString(locale)} (${now.toISOString()})`,
    '',
    `${t('Files')}:`,
    ...names.map((n) => `  ${n}`),
    '',
    t('Made with Ofimeo.'),
    '',
  ].join('\r\n')
  zip.file('README.txt', readme)
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/zip' })
  return { name: `${safeFileName(`${author} - ${title}`)}.zip`, blob }
}

export function downloadBlob(blob: Blob, name: string): void {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.append(a)
  a.click()
  setTimeout(() => {
    a.remove()
    URL.revokeObjectURL(a.href)
  }, 5000)
}

// The app's print action: its hook, else its Ctrl+P handler, else the browser's.
export function printDocument(session: Session): void {
  if (session.hooks.print) return session.hooks.print()
  const event = new KeyboardEvent('keydown', { key: 'p', code: 'KeyP', ctrlKey: true, metaKey: /Mac|iPhone|iPad/.test(navigator.platform), bubbles: true, cancelable: true })
  document.dispatchEvent(event)
  if (!event.defaultPrevented) window.print()
}

// Prints images (one per page), e.g. for apps that render to a canvas.
export async function printImages(blobs: Blob[]): Promise<void> {
  const box = document.createElement('div')
  box.className = 'print-images'
  const urls = blobs.map((b) => URL.createObjectURL(b))
  await Promise.all(
    urls.map((src) => {
      const img = new Image()
      img.src = src
      box.append(img)
      return img.decode().catch(() => undefined)
    }),
  )
  document.body.append(box)
  document.body.classList.add('printing-images')
  window.print()
  document.body.classList.remove('printing-images')
  box.remove()
  urls.forEach((u) => URL.revokeObjectURL(u))
}
