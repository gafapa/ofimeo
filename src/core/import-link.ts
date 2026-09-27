// Share links of Google Docs/Sheets/Slides/Drive and Microsoft 365
// (OneDrive, SharePoint) → the URLs that download the file in a format Ofimeo
// opens. Pure functions (no imports), unit-tested in tests/e2e/chat-import.spec.ts.
//
// Browsers cannot fetch these URLs from another site (no CORS headers), so the
// import dialog (ui/import-link.ts) opens them for the person to download, or
// uses a school relay's optional import proxy (relay/proxy.go).

export type LinkProvider = 'google' | 'microsoft'
export type LinkKind = 'document' | 'spreadsheet' | 'presentation' | 'pdf' | 'file'

export interface ExportChoice {
  // Extension of the downloaded file: 'docx', 'xlsx', 'pptx', 'odt', 'pdf'…
  format: string
  url: string
}

export interface ParsedLink {
  provider: LinkProvider
  kind: LinkKind
  // First choice (a format Ofimeo imports best), then alternatives.
  exports: ExportChoice[]
  // The link itself, to open it when the download needs signing in.
  original: string
}

export type LinkProblem = 'empty' | 'not-a-link' | 'unsupported' | 'published' | 'drawing' | 'form' | 'folder'

const GOOGLE_EXPORTS: Record<string, { kind: LinkKind; formats: string[]; url: (id: string, format: string) => string }> = {
  document: { kind: 'document', formats: ['docx', 'odt', 'pdf'], url: (id, f) => `https://docs.google.com/document/d/${id}/export?format=${f}` },
  spreadsheets: { kind: 'spreadsheet', formats: ['xlsx', 'ods', 'csv'], url: (id, f) => `https://docs.google.com/spreadsheets/d/${id}/export?format=${f}` },
  presentation: { kind: 'presentation', formats: ['pptx', 'odp', 'pdf'], url: (id, f) => `https://docs.google.com/presentation/d/${id}/export/${f}` },
}

const ID = /^[A-Za-z0-9_-]{10,}$/

function toUrl(input: string): URL | null {
  const text = input.trim()
  if (!text) return null
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }
}

// Base64url of a share link, as the OneDrive "shares" API expects (u!…).
function shareToken(link: string): string {
  const bytes = new TextEncoder().encode(link)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return 'u!' + btoa(binary).replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-')
}

const MS_KINDS: Record<string, LinkKind> = { w: 'document', x: 'spreadsheet', p: 'presentation', b: 'pdf' }
const EXT_KINDS: Record<string, LinkKind> = {
  docx: 'document', doc: 'document', odt: 'document', rtf: 'document',
  xlsx: 'spreadsheet', xls: 'spreadsheet', ods: 'spreadsheet', csv: 'spreadsheet',
  pptx: 'presentation', ppt: 'presentation', odp: 'presentation',
  pdf: 'pdf',
}
const KIND_FORMAT: Record<LinkKind, string> = { document: 'docx', spreadsheet: 'xlsx', presentation: 'pptx', pdf: 'pdf', file: '' }

function kindFromName(name: string | null | undefined): LinkKind | null {
  const ext = /\.([a-z0-9]+)$/i.exec(name ?? '')?.[1]?.toLowerCase()
  return (ext && EXT_KINDS[ext]) || null
}

// Parses a share link. Returns the export URLs, or the reason it cannot be used.
export function parseShareLink(input: string): ParsedLink | { problem: LinkProblem } {
  if (!input.trim()) return { problem: 'empty' }
  const url = toUrl(input)
  if (!url || !/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) return { problem: 'not-a-link' }
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  const path = url.pathname
  const original = url.href

  // Google Docs editors: /document/d/ID/…, /spreadsheets/d/ID/…, /presentation/d/ID/… (also /u/0/…).
  if (host === 'docs.google.com') {
    const m = /^\/(document|spreadsheets|presentation|drawings|forms)\/(?:u\/\d+\/)?d\/(e\/)?([A-Za-z0-9_-]+)/.exec(path)
    if (!m) return { problem: 'unsupported' }
    const [, app, published, id] = m
    if (app === 'drawings') return { problem: 'drawing' }
    if (app === 'forms') return { problem: 'form' }
    const spec = GOOGLE_EXPORTS[app]
    if (published) {
      // "Publish to the web" links: only spreadsheets can be exported from them.
      if (app !== 'spreadsheets') return { problem: 'published' }
      return {
        provider: 'google',
        kind: 'spreadsheet',
        exports: ['xlsx', 'ods', 'csv'].map((f) => ({ format: f, url: `https://docs.google.com/spreadsheets/d/e/${id}/pub?output=${f}` })),
        original,
      }
    }
    if (!ID.test(id)) return { problem: 'not-a-link' }
    const gid = url.searchParams.get('gid') ?? /(?:^|[#&])gid=(\d+)/.exec(url.hash)?.[1]
    return {
      provider: 'google',
      kind: spec.kind,
      exports: spec.formats.map((f) => ({ format: f, url: spec.url(id, f) + (f === 'csv' && gid ? `&gid=${gid}` : '') })),
      original,
    }
  }

  // Files in Google Drive (uploaded Word, Excel, PDF…): /file/d/ID/view, /open?id=ID, /uc?id=ID.
  if (host === 'drive.google.com' || host === 'drive.usercontent.google.com') {
    if (/^\/drive\/(?:u\/\d+\/)?folders\//.test(path) || /^\/embeddedfolderview/.test(path)) return { problem: 'folder' }
    const id = /^\/file\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]+)/.exec(path)?.[1] ?? url.searchParams.get('id')
    if (!id || !ID.test(id)) return { problem: 'unsupported' }
    return { provider: 'google', kind: 'file', exports: [{ format: '', url: `https://drive.google.com/uc?export=download&id=${id}` }], original }
  }

  // SharePoint and OneDrive for work or school.
  if (host.endsWith('.sharepoint.com')) {
    // Sharing links: /:w:/g/…, /:x:/r/…, /:p:/s/…, /:b:/…, /:u:/…
    const share = /^\/:([a-z]):\//i.exec(path)
    if (share) {
      const kind = MS_KINDS[share[1].toLowerCase()] ?? kindFromName(path) ?? 'file'
      const download = new URL(url.href)
      download.hash = ''
      download.searchParams.set('download', '1')
      return { provider: 'microsoft', kind, exports: [{ format: KIND_FORMAT[kind], url: download.href }], original }
    }
    // Office for the web: …/_layouts/15/Doc.aspx?sourcedoc={GUID}&file=Name.docx
    const layouts = /^(.*\/_layouts\/15\/)(?:Doc|WopiFrame|xlviewer|PowerPoint)\.aspx$/i.exec(path)
    const guid = url.searchParams.get('sourcedoc') ?? url.searchParams.get('UniqueId')
    if (layouts && guid) {
      const kind = kindFromName(url.searchParams.get('file')) ?? 'file'
      const id = guid.replace(/[{}]/g, '')
      return { provider: 'microsoft', kind, exports: [{ format: KIND_FORMAT[kind], url: `${url.origin}${layouts[1]}download.aspx?UniqueId=${encodeURIComponent(id)}` }], original }
    }
    // A direct path to the file: /sites/Class/Shared Documents/Unit 1.docx
    const kind = kindFromName(decodeURIComponent(path))
    if (kind) {
      const download = new URL(url.href)
      download.search = ''
      download.hash = ''
      download.searchParams.set('download', '1')
      return { provider: 'microsoft', kind, exports: [{ format: KIND_FORMAT[kind], url: download.href }], original }
    }
    return { problem: 'unsupported' }
  }

  // OneDrive (personal): 1drv.ms short links and onedrive.live.com links.
  if (host === '1drv.ms' || host === 'onedrive.live.com') {
    const short = host === '1drv.ms' ? /^\/([a-z])\//i.exec(path)?.[1]?.toLowerCase() : undefined
    if (host === '1drv.ms' && short === 'f') return { problem: 'folder' }
    const resid = url.searchParams.get('resid') ?? url.searchParams.get('id')
    const authkey = url.searchParams.get('authkey')
    const kind = (short && MS_KINDS[short]) || kindFromName(url.searchParams.get('file') ?? url.searchParams.get('filename')) || 'file'
    const exports: ExportChoice[] = []
    // Old style links with resid (and authkey): the download endpoint.
    if (host === 'onedrive.live.com' && resid && /![0-9]+/.test(resid) && !url.pathname.includes('/folders')) {
      exports.push({ format: KIND_FORMAT[kind], url: `https://onedrive.live.com/download?resid=${encodeURIComponent(resid)}${authkey ? `&authkey=${encodeURIComponent(authkey)}` : ''}` })
    }
    // Any share link: the OneDrive "shares" API downloads the shared item.
    exports.push({ format: KIND_FORMAT[kind], url: `https://api.onedrive.com/v1.0/shares/${shareToken(original)}/root/content` })
    return { provider: 'microsoft', kind, exports, original }
  }

  return { problem: 'unsupported' }
}

export const isParsed = (value: ParsedLink | { problem: LinkProblem }): value is ParsedLink => 'exports' in value
