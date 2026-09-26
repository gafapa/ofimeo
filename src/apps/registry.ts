// Apps of the Ofimeo suite. Each app is loaded with a dynamic import() only when opened.

import type { Session, SubmitFile } from '../core/session'
import type { DocType } from '../core/store'
import { t } from '../core/i18n'

export interface AppModule {
  mount(session: Session): void | Promise<void>
  // File types the app can open (extensions, for <input accept>).
  accept: string
  // Imports a file into a new local document and returns its path.
  importFile(file: File): Promise<string>
  // "Hand in": the document in its original formats (e.g. .odt + .docx).
  submitFiles?(session: Session): Promise<SubmitFile[]>
  // Restores a version (Y.encodeStateAsUpdate without history); default: generic restore.
  restoreVersion?(session: Session, state: Uint8Array): void | Promise<void>
}

export interface AppInfo {
  type: DocType
  name: string // e.g. "Document"
  // Name of the app within the suite, e.g. "Ofimeo Docs" ("Ofimeo Documentos" in Spanish).
  product: string
  plural: string // e.g. "Documents"
  newLabel: string
  untitled: string
  letter: string
  color: string
  // File extensions the app opens; declared here so the home screen can offer
  // them without loading the app.
  accept?: string
  // False for apps without comments: sharing offers no "Can comment" link.
  comments?: boolean
  load?: () => Promise<AppModule>
}

export const APPS: AppInfo[] = [
  {
    type: 'writer',
    name: t('Document'),
    product: t('Ofimeo Docs'),
    plural: t('Documents'),
    newLabel: t('New document'),
    untitled: t('Untitled document'),
    letter: 'W',
    color: '#1a73e8',
    accept: '.docx,.odt,.doc,.rtf,.html,.htm,.txt,.md,.markdown',
    load: () => import('./writer'),
  },
  {
    type: 'sheet',
    name: t('Spreadsheet'),
    product: t('Ofimeo Sheets'),
    plural: t('Spreadsheets'),
    newLabel: t('New spreadsheet'),
    untitled: t('Untitled spreadsheet'),
    letter: 'S',
    color: '#188038',
    accept: '.xlsx,.ods,.csv,.tsv,.xls',
    comments: false,
    load: () => import('./sheet'),
  },
  {
    type: 'draw',
    name: t('Drawing'),
    product: t('Ofimeo Drawing'),
    plural: t('Drawings'),
    newLabel: t('New drawing'),
    untitled: t('Untitled drawing'),
    letter: 'D',
    color: '#e8710a',
    accept: '.excalidraw',
    comments: false,
    load: () => import('./draw'),
  },
  {
    type: 'diagram',
    name: t('Diagram'),
    product: t('Ofimeo Diagrams'),
    plural: t('Diagrams'),
    newLabel: t('New diagram'),
    untitled: t('Untitled diagram'),
    letter: 'G',
    color: '#9334e6',
    accept: '.drawio,.xml,.vsdx,.vssx',
    comments: false,
    load: () => import('./diagram'),
  },
  {
    type: 'slides',
    name: t('Presentation'),
    product: t('Ofimeo Slides'),
    plural: t('Presentations'),
    newLabel: t('New presentation'),
    untitled: t('Untitled presentation'),
    letter: 'P',
    color: '#d24726',
    accept: '.pptx,.ppt,.odp',
    load: () => import('./slides'),
  },
  {
    type: 'forms',
    name: t('Form'),
    product: t('Ofimeo Forms'),
    plural: t('Forms'),
    newLabel: t('New form'),
    untitled: t('Untitled form'),
    letter: 'F',
    color: '#00897b',
    accept: '.oform',
    comments: false,
    load: () => import('./forms'),
  },
  {
    type: 'pdf',
    name: t('PDF'),
    product: t('Ofimeo PDF'),
    plural: t('PDFs'),
    newLabel: t('Correct a PDF'),
    untitled: t('Untitled PDF'),
    letter: 'A',
    color: '#b3261e',
    // Hand-in ZIPs open the PDF inside them.
    accept: '.pdf,.zip',
    load: () => import('./pdf'),
  },
]

// Name of the suite (a brand: never translated).
export const SUITE = 'Ofimeo'

export function appInfo(type: DocType): AppInfo {
  return APPS.find((a) => a.type === type) ?? APPS[0]
}

export const ALL_ACCEPT = APPS.filter((a) => a.load && a.accept).map((a) => a.accept).join(',')

// Finds the app that opens a file, by extension, and loads only that app.
export async function appForFile(file: File): Promise<{ info: AppInfo; module: AppModule } | null> {
  const ext = `.${file.name.split('.').pop()?.toLowerCase()}`
  const info = APPS.find((a) => a.load && a.accept?.split(',').includes(ext))
  return info ? { info, module: await info.load!() } : null
}
