// "Import from link…" (home screen and File menu of every app): a Google
// Docs/Sheets/Slides/Drive or OneDrive/SharePoint share link → an Ofimeo document.
//
// Browsers block web apps from downloading those files directly (the export
// URLs send no CORS headers), so the dialog is a guided download:
//   1. it shows the exact export URL (core/import-link.ts) as a button; the
//      person's own browser downloads the file (their Google/Microsoft session
//      stays between them and Google/Microsoft; Ofimeo never sees it);
//   2. a drop zone opens the downloaded file.
// When the configured school relay advertises an import proxy in its
// /ofimeo/config ("importProxy", relay/proxy.go, off by default), a third
// option imports in one click through the relay (public links only).

import { ALL_ACCEPT, appForFile } from '../apps/registry'
import { refreshSchoolRelay, schoolRelay } from '../core/connectivity'
import { t } from '../core/i18n'
import { isParsed, parseShareLink, type LinkKind, type LinkProblem, type ParsedLink } from '../core/import-link'
import { el, showDialog, toast } from './widgets'
import './import-link.css'

const KIND_LABEL: Record<LinkKind, () => string> = {
  document: () => t('Document'),
  spreadsheet: () => t('Spreadsheet'),
  presentation: () => t('Presentation'),
  pdf: () => 'PDF',
  file: () => t('File'),
}

function problemText(problem: LinkProblem): string {
  switch (problem) {
    case 'empty':
      return ''
    case 'not-a-link':
      return t('This does not look like a link.')
    case 'published':
      return t('This is a “Publish to the web” link. Use the normal share link instead (Share ▸ Copy link).')
    case 'drawing':
      return t('Google Drawings cannot be imported. Download it as an image instead.')
    case 'form':
      return t('Google Forms cannot be imported. Create the form again in Ofimeo Forms.')
    case 'folder':
      return t('This is a link to a folder. Open the folder and copy the link of one file.')
    default:
      return t('Only links to Google Docs, Sheets, Slides and Drive files, and to OneDrive or SharePoint files are supported.')
  }
}

// Opens a downloaded or fetched file in the app that handles it.
export async function openImportedFile(file: File): Promise<void> {
  try {
    const target = await appForFile(file)
    if (!target) return toast(t('This file type is not supported yet'))
    toast(t('Opening…'))
    location.href = await target.module.importFile(file)
  } catch (err) {
    toast(t('Could not open the file: {message}', { message: (err as Error).message }))
  }
}

// Import proxy of the configured school relay, when it advertises one.
function proxyUrl(): string | null {
  const relay = schoolRelay()
  const path = (relay?.config as { importProxy?: unknown } | undefined)?.importProxy
  return relay && typeof path === 'string' && path.startsWith('/') ? relay.address + path : null
}

const MIME_EXT: Record<string, string> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
  'application/vnd.oasis.opendocument.presentation': 'odp',
  'application/pdf': 'pdf',
  'text/csv': 'csv',
  'application/msword': 'doc',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.ms-powerpoint': 'ppt',
}

const PROXY_ERRORS: Record<string, () => string> = {
  'not-public': () => t('The file is not shared publicly. Ask its owner to share it as “Anyone with the link”, or download it yourself (step 1).'),
  'not-found': () => t('The file was not found. Check the link.'),
  'too-large': () => t('The file is too large for the school relay. Download it yourself (step 1).'),
  busy: () => t('The school relay is busy. Try again in a moment.'),
  host: () => t('The school relay does not accept this link.'),
}

// Downloads through the school relay's import proxy.
export async function fetchThroughRelay(proxy: string, link: ParsedLink): Promise<File> {
  let lastError = ''
  for (const choice of link.exports) {
    const response = await fetch(`${proxy}?url=${encodeURIComponent(choice.url)}`, { cache: 'no-store', credentials: 'omit' })
    if (!response.ok) {
      const code = ((await response.json().catch(() => ({}))) as { error?: string }).error ?? ''
      lastError = PROXY_ERRORS[code]?.() ?? t('The school relay could not download the file ({status}).', { status: response.status })
      // Try the next URL only when this one was refused (e.g. an old-style OneDrive link).
      if (code === 'too-large' || code === 'busy') break
      continue
    }
    const header = response.headers.get('X-Ofimeo-Filename')
    let name = header ? decodeURIComponent(header) : ''
    const type = (response.headers.get('X-Ofimeo-Content-Type') ?? '').split(';')[0].trim().toLowerCase()
    const ext = choice.format || MIME_EXT[type] || ''
    if (!/\.[a-z0-9]{2,5}$/i.test(name)) name = `${name || t('Imported')}${ext ? `.${ext}` : ''}`
    else if (choice.format && !name.toLowerCase().endsWith(`.${choice.format}`)) name = name.replace(/\.[a-z0-9]+$/i, `.${choice.format}`)
    return new File([await response.blob()], name, { type: type || 'application/octet-stream' })
  }
  throw new Error(lastError || t('The school relay could not download the file.'))
}

export async function openImportFromLink(initial = ''): Promise<void> {
  const input = el('input', { type: 'url', class: 'field', value: initial, placeholder: 'https://docs.google.com/… · https://1drv.ms/… · https://….sharepoint.com/…', autocomplete: 'off' })
  input.setAttribute('aria-describedby', 'import-link-status')
  const label = el('label', { class: 'field-label' }, t('Share link'), input)
  const status = el('p', { class: 'import-status', id: 'import-link-status', role: 'status' })
  const steps = el('div', { class: 'import-steps', hidden: true })
  const fileInput = el('input', { type: 'file', accept: ALL_ACCEPT, hidden: true })
  const choose = el('button', { type: 'button', textContent: t('Choose the downloaded file…') })
  const drop = el(
    'div',
    { class: 'import-drop', tabIndex: 0 },
    el('span', { textContent: t('Drop the downloaded file here') }),
    choose,
    fileInput,
  )
  drop.setAttribute('role', 'group')
  drop.setAttribute('aria-label', t('Open the downloaded file'))
  const why = el('p', {
    class: 'hint',
    textContent: t('Browsers do not let web apps download files from Google or Microsoft directly, so the file goes through your Downloads folder. Ofimeo never sees your Google or Microsoft account.'),
  })

  let current: ParsedLink | null = null
  let proxy = proxyUrl()
  const render = () => {
    const parsed = parseShareLink(input.value)
    if (!isParsed(parsed)) {
      current = null
      status.textContent = problemText(parsed.problem)
      status.classList.toggle('error', parsed.problem !== 'empty')
      steps.hidden = true
      return
    }
    current = parsed
    status.classList.remove('error')
    const provider = parsed.provider === 'google' ? 'Google' : 'Microsoft'
    status.textContent = `${provider} · ${KIND_LABEL[parsed.kind]()}`
    const [first, ...others] = parsed.exports
    const download = el('a', {
      class: 'button primary import-download',
      href: first.url,
      target: '_blank',
      rel: 'noopener noreferrer',
      textContent: first.format ? t('Download as .{format} from {provider}', { format: first.format, provider }) : t('Download from {provider}', { provider }),
    })
    const alternatives = others.filter((o) => o.format && o.format !== first.format)
    const altLinks = alternatives.length
      ? el('p', { class: 'hint' }, `${t('Other formats')}: `, ...alternatives.flatMap((o, i) => [i ? ' · ' : '', el('a', { href: o.url, target: '_blank', rel: 'noopener noreferrer', textContent: `.${o.format}` })]))
      : null
    const moreUrls = others.filter((o) => !o.format || o.format === first.format)
    const altUrl = moreUrls.length
      ? el('p', { class: 'hint' }, el('a', { href: moreUrls[0].url, target: '_blank', rel: 'noopener noreferrer', textContent: t('Try another download address') }))
      : null
    const help =
      parsed.provider === 'google'
        ? t('If Google asks you to sign in or to request access, the file is not shared publicly: sign in with an account that can open it, or ask its owner to share it as “Anyone with the link”. You can also open the file and use File ▸ Download.')
        : t('If a page opens instead of a download, sign in if asked, then use File ▸ Save as ▸ Download a copy (Word, Excel, PowerPoint) or the Download button of OneDrive or SharePoint.')
    const url = el('code', { class: 'import-url', textContent: first.url })
    const direct = proxy ? el('button', { type: 'button', class: 'primary', textContent: t('Import directly through the school relay') }) : null
    direct?.addEventListener('click', async () => {
      if (!current || !proxy) return
      direct.disabled = true
      status.textContent = t('Downloading through the school relay…')
      try {
        const file = await fetchThroughRelay(proxy, current)
        ;(input.closest('dialog') as HTMLDialogElement | null)?.close('done')
        await openImportedFile(file)
      } catch (err) {
        status.textContent = (err as Error).message
        status.classList.add('error')
        direct.disabled = false
      }
    })
    steps.replaceChildren(
      ...(direct ? [el('div', { class: 'import-step' }, el('p', { textContent: t('Your school relay can download public files for you:') }), direct, el('p', { class: 'hint', textContent: t('Or do it yourself in two steps:') }))] : []),
      el('div', { class: 'import-step' }, el('h3', { textContent: t('1. Download the file') }), download, url, altLinks, altUrl, el('p', { class: 'hint', textContent: help }), el('p', { class: 'hint' }, el('a', { href: parsed.original, target: '_blank', rel: 'noopener noreferrer', textContent: t('Open the link') }))),
      el('div', { class: 'import-step' }, el('h3', { textContent: t('2. Open it in Ofimeo') }), drop),
    )
    steps.hidden = false
  }
  input.addEventListener('input', render)
  input.addEventListener('paste', () => setTimeout(render))
  render()
  if (!proxy && schoolRelay()) {
    // The relay may have turned the import proxy on since its configuration was saved.
    void refreshSchoolRelay()
      .then(() => {
        const next = proxyUrl()
        if (next && next !== proxy) {
          proxy = next
          render()
        }
      })
      .catch(() => {})
  }

  const openFile = async (file: File | undefined) => {
    if (!file) return
    ;(input.closest('dialog') as HTMLDialogElement | null)?.close('done')
    await openImportedFile(file)
  }
  choose.addEventListener('click', () => fileInput.click())
  drop.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && e.target === drop && (e.preventDefault(), fileInput.click()))
  fileInput.addEventListener('change', () => void openFile(fileInput.files?.[0]))
  drop.addEventListener('dragover', (e) => {
    e.preventDefault()
    drop.classList.add('over')
  })
  drop.addEventListener('dragleave', () => drop.classList.remove('over'))
  drop.addEventListener('drop', (e) => {
    e.preventDefault()
    drop.classList.remove('over')
    void openFile(e.dataTransfer?.files?.[0])
  })

  const body = el('div', { class: 'import-link' }, el('p', { textContent: t('Paste the share link of a file in Google Drive (Docs, Sheets, Slides) or in Microsoft OneDrive or SharePoint.') }), label, status, steps, why)
  await showDialog(t('Import from link'), body, [{ label: t('Close'), value: 'close' }], true, 'getting-started')
}
