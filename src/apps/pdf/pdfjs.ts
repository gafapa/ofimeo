// pdf.js, loaded on demand. The "legacy" build carries the polyfills that older
// browsers (and school tablets) need. Its worker is bundled as a module worker
// chunk (a .js file, so the offline cache includes it).

import type * as PdfJs from 'pdfjs-dist'
import { t } from '../../core/i18n'
import { el, showDialog } from '../../ui/widgets'

let loading: Promise<typeof PdfJs> | null = null

export function pdfjs(): Promise<typeof PdfJs> {
  loading ??= (async () => {
    const [lib, worker] = await Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker')])
    lib.GlobalWorkerOptions.workerPort = new worker.default()
    return lib
  })()
  return loading
}

// Password-protected PDFs: the stored document keeps the original encrypted
// file (never a decrypted copy), and the password is never saved in the
// document, the library or sent to collaborators. Each person enters it when
// they open the document; it is remembered for this browser tab only
// (sessionStorage, cleared when the tab closes), so opening from the home
// screen and exporting do not ask again.
const PASSWORD_KEY = 'words-online:pdf-password:'
const passwords = {
  get(key: string): string | undefined {
    try {
      return sessionStorage.getItem(PASSWORD_KEY + key) ?? undefined
    } catch {
      return undefined
    }
  },
  set(key: string, value: string) {
    try {
      sessionStorage.setItem(PASSWORD_KEY + key, value)
    } catch {
      // Not remembered: asked again next time.
    }
  },
  delete(key: string) {
    try {
      sessionStorage.removeItem(PASSWORD_KEY + key)
    } catch {
      // Nothing stored.
    }
  },
}

// Identifies a file without keeping it (length and a sample of its bytes).
function fileKey(bytes: Uint8Array): string {
  let h = bytes.length
  const step = Math.max(1, Math.floor(bytes.length / 4096))
  for (let i = 0; i < bytes.length; i += step) h = (Math.imul(h, 31) + bytes[i]) | 0
  return `${bytes.length}:${h}`
}

// Thrown when the person cancels the password prompt.
export class PasswordCancelled extends Error {
  constructor() {
    super(t('This PDF is protected with a password.'))
    this.name = 'PasswordCancelled'
  }
}

// Asks for the password of a protected PDF (again, after a wrong one).
export async function askPdfPassword(wrong: boolean): Promise<string | null> {
  const input = el('input', { type: 'password', class: 'field', autocomplete: 'off' })
  input.setAttribute('aria-describedby', 'pdf-password-hint')
  const hint = el('p', { id: 'pdf-password-hint', textContent: wrong ? t('The password is not correct. Try again.') : t('This PDF is protected. Enter its password to open it.') })
  if (wrong) hint.setAttribute('role', 'alert')
  const body = el('div', { class: 'form' }, hint, el('label', { class: 'field-label' }, t('Password'), input))
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      ;(input.closest('dialog') as HTMLDialogElement).close('ok')
    }
  })
  setTimeout(() => input.focus())
  const result = await showDialog(t('Password required'), body, [
    { label: t('Cancel'), value: 'cancel' },
    { label: t('Open'), value: 'ok', primary: true },
  ])
  return result === 'ok' ? input.value : null
}

export interface OpenOptions {
  // Asks for a password; null cancels. Without it, protected files fail with PasswordCancelled.
  askPassword?: (wrong: boolean) => Promise<string | null>
}

export async function openPdf(bytes: Uint8Array, options: OpenOptions = {}): Promise<PdfJs.PDFDocumentProxy> {
  const lib = await pdfjs()
  const key = fileKey(bytes)
  let password = passwords.get(key)
  let wrong = false
  for (;;) {
    try {
      // pdf.js takes ownership of the buffer it is given: pass a copy.
      const doc = await lib.getDocument({ data: bytes.slice(), ...(password !== undefined ? { password } : {}) }).promise
      if (password !== undefined) passwords.set(key, password)
      return doc
    } catch (err) {
      if ((err as Error)?.name !== 'PasswordException') throw readableError(err)
      if (password !== undefined) wrong = true
      passwords.delete(key)
      const next = options.askPassword ? await options.askPassword(wrong) : null
      if (next === null) throw new PasswordCancelled()
      password = next
    }
  }
}

// A translated message for pdf.js loading errors (the original goes to the console).
function readableError(err: unknown): Error {
  const name = (err as Error)?.name
  console.warn('pdf.js:', err)
  if (name === 'InvalidPDFException') return new Error(t('The file is damaged or is not a PDF.'))
  if (name === 'MissingPDFException' || name === 'UnexpectedResponseException') return new Error(t('The file could not be read.'))
  return new Error(t('The PDF could not be read.'))
}
