// Nextcloud client: the browser talks WebDAV / OCS directly to the server
// (no backend of ours). Account storage, connection diagnostics, Login Flow v2,
// file listing, download, upload with ETag checks, folders and public share
// uploads ("File drop"). UI-free; the dialogs live in ui/nextcloud.ts.
//
// Cross-origin requests need the server to allow this origin (CORS); see
// docs/nextcloud.md. Requests never send cookies (credentials: 'omit'), so the
// browser never shows its own login prompt and no Nextcloud session is reused.

import { t } from './i18n'

const ACCOUNTS_KEY = 'ofimeo:nextcloud'
const ACTIVE_KEY = 'ofimeo:nextcloud-active'

export interface NcAccount {
  id: string
  // Base URL without trailing slash, e.g. https://cloud.school.org or https://school.org/nextcloud
  server: string
  // WebDAV user id (files live under /remote.php/dav/files/<user>/)
  user: string
  // Name used to log in (may be an email address); the app password belongs to it.
  loginName: string
  appPassword: string
  displayName?: string
  // True when the app password came from Login Flow v2 (it is revoked on sign out).
  viaLoginFlow?: boolean
  // Minutes between automatic saves of linked documents; 0 = off.
  autosave?: number
  remember?: boolean
}

// ---------- Accounts (this browser only) ----------

let memoryAccounts: NcAccount[] | undefined

function readAccounts(persistent: boolean): NcAccount[] {
  try {
    const storage = persistent ? localStorage : sessionStorage
    const value: unknown = JSON.parse(storage.getItem(ACCOUNTS_KEY) || '[]')
    return Array.isArray(value) ? value.filter((a): a is NcAccount => !!a && typeof a.id === 'string' && typeof a.server === 'string' && typeof a.appPassword === 'string') : []
  } catch {
    return []
  }
}

export function listAccounts(): NcAccount[] {
  if (memoryAccounts) return memoryAccounts
  let active: string | null = null
  try {
    active = sessionStorage.getItem(ACTIVE_KEY)
  } catch {
    // Account selection is optional when storage is unavailable.
  }
  const accounts = new Map([...readAccounts(true), ...readAccounts(false)].map((a) => [a.id, a]))
  return [...accounts.values()].sort((a, b) => Number(b.id === active) - Number(a.id === active))
}

export const getAccount = (id?: string): NcAccount | undefined => listAccounts().find((a) => a.id === id)
export const currentAccount = (): NcAccount | undefined => listAccounts()[0]

export function saveAccount(account: NcAccount): void {
  const others = listAccounts().filter((a) => a.id !== account.id)
  memoryAccounts = [account, ...others]
  try {
    sessionStorage.setItem(ACTIVE_KEY, account.id)
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(memoryAccounts.filter((a) => a.remember !== false)))
    sessionStorage.setItem(ACCOUNTS_KEY, JSON.stringify(memoryAccounts.filter((a) => a.remember === false)))
    memoryAccounts = undefined
  } catch {
    // Storage unavailable (private mode): the account lasts for this page only.
  }
}

export function removeAccount(id: string): void {
  memoryAccounts = listAccounts().filter((a) => a.id !== id)
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(memoryAccounts.filter((a) => a.remember !== false)))
    sessionStorage.setItem(ACCOUNTS_KEY, JSON.stringify(memoryAccounts.filter((a) => a.remember === false)))
    memoryAccounts = undefined
  } catch {
    // ignore
  }
}

export const accountId = (server: string, user: string) => `${user}@${server.replace(/^https?:\/\//, '')}`

// ---------- Errors ----------

export type NcErrorKind =
  | 'offline'
  | 'bad-url'
  | 'mixed-content'
  | 'unreachable'
  | 'not-nextcloud'
  | 'maintenance'
  | 'cors'
  | 'auth'
  | 'not-found'
  | 'conflict'
  | 'exists'
  | 'forbidden'
  | 'quota'
  | 'locked'
  | 'share-password'
  | 'server'

export class NcError extends Error {
  constructor(
    public kind: NcErrorKind,
    message?: string,
    public status?: number,
  ) {
    super(message ?? errorMessage(kind, status))
  }
}

export function errorMessage(kind: NcErrorKind, status?: number): string {
  switch (kind) {
    case 'offline':
      return t('You are offline. Nextcloud can be used again when you are connected.')
    case 'bad-url':
      return t('This is not a valid server address.')
    case 'mixed-content':
      return t('This page is served over https, so it cannot talk to a server on plain http. Use the https address of your Nextcloud.')
    case 'unreachable':
      return t('The server cannot be reached. Check the address and your connection.')
    case 'not-nextcloud':
      return t('No Nextcloud was found at this address. Use the address you open Nextcloud with in the browser (for example https://cloud.school.org or https://school.org/nextcloud).')
    case 'maintenance':
      return t('Nextcloud is in maintenance mode. Try again later.')
    case 'cors':
      return t('Your Nextcloud does not allow this site to connect to it (CORS). An administrator must allow it; see the options below.')
    case 'auth':
      return t('Wrong user name or app password.')
    case 'not-found':
      return t('The file or folder was not found in Nextcloud (it may have been moved or deleted).')
    case 'conflict':
      return t('The file was changed in Nextcloud since you opened or last saved it.')
    case 'exists':
      return t('A file or folder with this name already exists.')
    case 'forbidden':
      return t('You do not have permission to do this in Nextcloud.')
    case 'quota':
      return t('There is not enough storage space left in Nextcloud.')
    case 'locked':
      return t('The file is locked in Nextcloud (someone may be editing it). Try again later.')
    case 'share-password':
      return t('This share link needs a password, or the password is wrong.')
    default:
      return t('Nextcloud answered with an error ({status}).', { status: status ?? '?' })
  }
}

// ---------- Addresses ----------

// Accepts what people paste: host only, the web address of the files app, a
// WebDAV address… and returns the base URL of the Nextcloud installation.
export function normalizeServer(input: string): string {
  let value = input.trim()
  if (!value) throw new NcError('bad-url')
  if (!/^https?:\/\//i.test(value)) value = `${/^(localhost|127\.|\[::1\])/.test(value) ? 'http' : 'https'}://${value}`
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new NcError('bad-url')
  }
  if (!url.hostname) throw new NcError('bad-url')
  const path = url.pathname
    .replace(/\/(index\.php|remote\.php|public\.php|ocs|apps|s|login|settings|status\.php)(\/.*)?$/, '')
    .replace(/\/+$/, '')
  return `${url.protocol}//${url.host}${path}`
}

export const encodePath = (path: string) =>
  path
    .split('/')
    .map((p) => encodeURIComponent(p))
    .join('/')

export const joinPath = (dir: string, name: string) => `${dir.replace(/\/+$/, '')}/${name}`.replace(/^(?!\/)/, '/')
export const parentPath = (path: string) => path.replace(/\/[^/]*\/?$/, '') || '/'
export const baseName = (path: string) => path.replace(/\/+$/, '').split('/').pop() || ''

const davFilesRoot = (a: Pick<NcAccount, 'server' | 'user'>) => `${a.server}/remote.php/dav/files/${encodeURIComponent(a.user)}`
export const davUrl = (a: Pick<NcAccount, 'server' | 'user'>, path: string) => davFilesRoot(a) + encodePath(path.startsWith('/') ? path : `/${path}`)

// Web page of a file or folder in Nextcloud's Files app.
export function webUrl(a: NcAccount, path: string, fileId?: string): string {
  if (fileId) return `${a.server}/index.php/f/${encodeURIComponent(fileId)}`
  return `${a.server}/index.php/apps/files/?dir=${encodeURIComponent(parentPath(path))}`
}

const basic = (user: string, password: string) => `Basic ${btoa(String.fromCharCode(...new TextEncoder().encode(`${user}:${password}`)))}`

// ---------- Requests ----------

interface RequestOptions {
  headers?: Record<string, string>
  body?: BodyInit
  signal?: AbortSignal
}

async function send(url: string, method: string, auth: string | null, options: RequestOptions = {}): Promise<Response> {
  if (!navigator.onLine) throw new NcError('offline')
  const headers: Record<string, string> = { ...options.headers }
  if (auth) headers.Authorization = auth
  try {
    return await fetch(url, { method, headers, body: options.body, credentials: 'omit', cache: 'no-store', redirect: 'follow', signal: options.signal })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    // A network failure: blocked by CORS, unreachable, certificate… The
    // browser does not say which; diagnose() tells them apart.
    throw new NcError(navigator.onLine ? 'cors' : 'offline')
  }
}

function statusError(res: Response): NcError {
  switch (res.status) {
    case 401:
      return new NcError('auth', undefined, 401)
    case 403:
      return new NcError('forbidden', undefined, 403)
    case 404:
      return new NcError('not-found', undefined, 404)
    case 405:
      return new NcError('exists', undefined, 405)
    case 409:
      return new NcError('not-found', undefined, 409)
    case 412:
      return new NcError('conflict', undefined, 412)
    case 423:
      return new NcError('locked', undefined, 423)
    case 503:
      return new NcError('maintenance', undefined, 503)
    case 507:
      return new NcError('quota', undefined, 507)
    default:
      return new NcError('server', undefined, res.status)
  }
}

function dav(a: NcAccount, method: string, path: string, options: RequestOptions = {}): Promise<Response> {
  return send(davUrl(a, path), method, basic(a.loginName, a.appPassword), options)
}

// ---------- WebDAV ----------

export interface DavEntry {
  path: string // decoded, relative to the user's files, starting with '/'
  name: string
  isDir: boolean
  size: number
  modified: number
  etag: string // as sent by the server (quoted)
  contentType: string
  fileId?: string
  permissions?: string // oc:permissions, e.g. RGDNVW (W: can write, CK: can create in folder)
}

const PROPFIND_BODY = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">
  <d:prop>
    <d:getlastmodified/><d:getetag/><d:getcontenttype/><d:getcontentlength/><d:resourcetype/>
    <oc:fileid/><oc:size/><oc:permissions/>
  </d:prop>
</d:propfind>`

function parseMultistatus(xml: string, rootHref: string): DavEntry[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const DAV = 'DAV:'
  const OC = 'http://owncloud.org/ns'
  const text = (node: Element, ns: string, name: string) => node.getElementsByTagNameNS(ns, name)[0]?.textContent ?? ''
  const rootPath = decodeURIComponent(new URL(rootHref).pathname).replace(/\/+$/, '')
  const entries: DavEntry[] = []
  for (const response of doc.getElementsByTagNameNS(DAV, 'response')) {
    const href = text(response, DAV, 'href')
    // Use the first propstat with a 200 status.
    const propstat = [...response.getElementsByTagNameNS(DAV, 'propstat')].find((p) => / 200 /.test(text(p, DAV, 'status'))) ?? response
    const isDir = propstat.getElementsByTagNameNS(DAV, 'collection').length > 0
    let decoded: string
    try {
      decoded = decodeURIComponent(new URL(href, rootHref).pathname)
    } catch {
      continue
    }
    const rel = decoded.startsWith(rootPath) ? decoded.slice(rootPath.length) : decoded
    const path = `/${rel.replace(/^\/+|\/+$/g, '')}`
    const size = Number(text(propstat, DAV, 'getcontentlength') || text(propstat, OC, 'size') || 0)
    entries.push({
      path,
      name: baseName(path),
      isDir,
      size,
      modified: Date.parse(text(propstat, DAV, 'getlastmodified')) || 0,
      etag: text(propstat, DAV, 'getetag'),
      contentType: text(propstat, DAV, 'getcontenttype'),
      fileId: text(propstat, OC, 'fileid') || undefined,
      permissions: text(propstat, OC, 'permissions') || undefined,
    })
  }
  return entries
}

async function propfind(a: NcAccount, path: string, depth: 0 | 1, signal?: AbortSignal): Promise<DavEntry[]> {
  const res = await dav(a, 'PROPFIND', path, { headers: { Depth: String(depth), 'Content-Type': 'application/xml; charset=utf-8' }, body: PROPFIND_BODY, signal })
  if (res.status !== 207) throw statusError(res)
  return parseMultistatus(await res.text(), davFilesRoot(a) + '/')
}

// The folder's children (without the folder itself).
export async function listFolder(a: NcAccount, path: string, signal?: AbortSignal): Promise<DavEntry[]> {
  const all = await propfind(a, path.endsWith('/') ? path : `${path}/`, 1, signal)
  const self = path.replace(/\/+$/, '') || '/'
  return all.filter((e) => e.path !== self)
}

export async function stat(a: NcAccount, path: string): Promise<DavEntry | null> {
  try {
    return (await propfind(a, path, 0))[0] ?? null
  } catch (err) {
    if (err instanceof NcError && err.kind === 'not-found') return null
    throw err
  }
}

export async function download(a: NcAccount, path: string): Promise<{ blob: Blob; etag?: string }> {
  const res = await dav(a, 'GET', path)
  if (!res.ok) throw statusError(res)
  // ETag is only readable cross-origin when the server exposes it.
  const etag = res.headers.get('OC-ETag') ?? res.headers.get('ETag') ?? undefined
  return { blob: await res.blob(), etag: etag ? quoteEtag(etag) : undefined }
}

// Nextcloud sends OC-ETag unquoted and getetag quoted; If-Match needs quotes.
const quoteEtag = (etag: string) => (etag.startsWith('"') || etag.startsWith('W/') ? etag : `"${etag}"`)

export interface UploadOptions {
  // Only overwrite this version (412 → NcError 'conflict').
  ifMatch?: string
  // Only create: fail if the file exists (412 → NcError 'exists').
  createOnly?: boolean
  contentType?: string
}

// Uploads a file; returns the new ETag (and file id when known).
export async function upload(a: NcAccount, path: string, blob: Blob, options: UploadOptions = {}): Promise<{ etag?: string; fileId?: string }> {
  const headers: Record<string, string> = { 'Content-Type': options.contentType || blob.type || 'application/octet-stream' }
  if (options.ifMatch) headers['If-Match'] = quoteEtag(options.ifMatch)
  if (options.createOnly) headers['If-None-Match'] = '*'
  const res = await dav(a, 'PUT', path, { headers, body: blob })
  if (res.status === 412) throw new NcError(options.createOnly ? 'exists' : 'conflict', undefined, 412)
  if (!res.ok) throw statusError(res)
  let etag = res.headers.get('OC-ETag') ?? res.headers.get('ETag') ?? undefined
  let fileId = res.headers.get('OC-FileId') ?? undefined
  // Headers not exposed to this origin: ask for them.
  if (!etag) {
    const entry = await stat(a, path).catch(() => null)
    etag = entry?.etag
    fileId = entry?.fileId ?? fileId
  }
  return { etag: etag ? quoteEtag(etag) : undefined, fileId }
}

// Deletes a file; a file that is already gone is not an error.
export async function removeFile(a: NcAccount, path: string): Promise<void> {
  const res = await dav(a, 'DELETE', path)
  if (res.ok || res.status === 404) return
  throw statusError(res)
}

export async function createFolder(a: NcAccount, path: string): Promise<void> {
  const res = await dav(a, 'MKCOL', path)
  if (res.status === 201) return
  throw statusError(res)
}

// ---------- Connection test and diagnostics ----------

export interface ServerStatus {
  installed: boolean
  maintenance: boolean
  version: string
  productname: string
}

export interface Diagnosis {
  ok: boolean
  kind?: NcErrorKind
  message: string
  server?: string
  status?: ServerStatus
  user?: string
  displayName?: string
}

// Nextcloud answers status.php to every origin, even when WebDAV is not
// allowed, which separates "not a Nextcloud / unreachable" from "CORS blocked".
export async function serverStatus(server: string): Promise<ServerStatus> {
  let res: Response
  try {
    res = await send(`${server}/status.php`, 'GET', null)
  } catch (err) {
    if (err instanceof NcError && err.kind === 'cors') {
      // Unreadable: is anything there at all?
      try {
        await fetch(`${server}/status.php`, { mode: 'no-cors', credentials: 'omit', cache: 'no-store' })
      } catch {
        throw new NcError('unreachable')
      }
      throw new NcError('not-nextcloud')
    }
    throw err
  }
  if (!res.ok) throw new NcError('not-nextcloud')
  try {
    const json = (await res.json()) as ServerStatus
    if (typeof json.installed !== 'boolean') throw new Error()
    return json
  } catch {
    throw new NcError('not-nextcloud')
  }
}

// Checks the address and, when given, the credentials. Never throws.
export async function diagnose(serverInput: string, loginName?: string, appPassword?: string): Promise<Diagnosis> {
  const fail = (err: unknown, extra: Partial<Diagnosis> = {}): Diagnosis => {
    const e = err instanceof NcError ? err : new NcError('server', (err as Error).message)
    return { ok: false, kind: e.kind, message: e.message, ...extra }
  }
  if (!navigator.onLine) return fail(new NcError('offline'))
  let server: string
  try {
    server = normalizeServer(serverInput)
  } catch (err) {
    return fail(err)
  }
  const local = /^(localhost|127\.|\[::1\])/.test(new URL(server).hostname)
  if (location.protocol === 'https:' && server.startsWith('http:') && !local) return fail(new NcError('mixed-content'), { server })
  let status: ServerStatus
  try {
    status = await serverStatus(server)
  } catch (err) {
    return fail(err, { server })
  }
  if (!status.installed) return fail(new NcError('not-nextcloud'), { server, status })
  if (status.maintenance) return fail(new NcError('maintenance'), { server, status })
  // WebDAV from this origin: an unauthenticated request is enough to see CORS.
  try {
    const who = await whoAmI(server, loginName ?? '', appPassword ?? '')
    return { ok: true, message: t('Connected.'), server, status, ...who }
  } catch (err) {
    if (err instanceof NcError && err.kind === 'auth' && !loginName) return { ok: true, message: t('This Nextcloud accepts connections from this site.'), server, status }
    return fail(err, { server, status })
  }
}

// WebDAV user id and display name for the credentials (401 → 'auth').
export async function whoAmI(server: string, loginName: string, appPassword: string): Promise<{ user: string; displayName?: string }> {
  const body = `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/><d:displayname/></d:prop></d:propfind>`
  const auth = loginName ? basic(loginName, appPassword) : null
  const res = await send(`${server}/remote.php/dav/`, 'PROPFIND', auth, { headers: { Depth: '0', 'Content-Type': 'application/xml; charset=utf-8' }, body })
  if (res.status === 404) throw new NcError('not-nextcloud')
  if (res.status !== 207) throw statusError(res)
  const doc = new DOMParser().parseFromString(await res.text(), 'application/xml')
  const principal = doc.getElementsByTagNameNS('DAV:', 'current-user-principal')[0]
  const href = principal?.getElementsByTagNameNS('DAV:', 'href')[0]?.textContent ?? ''
  const user = decodeURIComponent(/\/principals\/users\/([^/]+)/.exec(href)?.[1] ?? '') || loginName
  let displayName: string | undefined
  try {
    const res2 = await send(`${server}/remote.php/dav/principals/users/${encodeURIComponent(user)}/`, 'PROPFIND', auth, {
      headers: { Depth: '0', 'Content-Type': 'application/xml; charset=utf-8' },
      body: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/></d:prop></d:propfind>`,
    })
    if (res2.status === 207) displayName = new DOMParser().parseFromString(await res2.text(), 'application/xml').getElementsByTagNameNS('DAV:', 'displayname')[0]?.textContent || undefined
  } catch {
    // Optional.
  }
  return { user, displayName }
}

// ---------- Login Flow v2 ----------

export interface LoginFlow {
  login: string // page to open for the user
  token: string
}

export async function startLoginFlow(server: string): Promise<LoginFlow> {
  const res = await send(`${server}/index.php/login/v2`, 'POST', null)
  if (!res.ok) throw statusError(res)
  const json = (await res.json()) as { login?: unknown; poll?: { token?: unknown } }
  // The login page is opened from this app: only a web address the server gave.
  let login: URL
  try {
    login = new URL(String(json.login))
  } catch {
    throw new NcError('not-nextcloud')
  }
  if (!/^https?:$/.test(login.protocol) || typeof json.poll?.token !== 'string') throw new NcError('not-nextcloud')
  return { login: login.href, token: json.poll.token }
}

// Waits until the user grants access in the other tab; returns the app password.
export async function pollLoginFlow(server: string, flow: LoginFlow, signal: AbortSignal): Promise<{ loginName: string; appPassword: string }> {
  const deadline = Date.now() + 20 * 60_000
  while (Date.now() < deadline) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    // A form post is a "simple" request: no preflight needed.
    const res = await send(`${server}/index.php/login/v2/poll`, 'POST', null, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `token=${encodeURIComponent(flow.token)}`,
      signal,
    })
    if (res.ok) {
      const json = (await res.json()) as { loginName: string; appPassword: string }
      return { loginName: json.loginName, appPassword: json.appPassword }
    }
    if (res.status !== 404) throw statusError(res)
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new NcError('server', t('The login was not completed in time.'))
}

// Revokes the app password (used on sign out for passwords from the login flow).
export async function revokeAppPassword(a: NcAccount): Promise<boolean> {
  try {
    const res = await send(`${a.server}/ocs/v2.php/core/apppassword`, 'DELETE', basic(a.loginName, a.appPassword), { headers: { 'OCS-APIRequest': 'true' } })
    return res.ok
  } catch {
    return false
  }
}

// ---------- Public share links (File drop) ----------

export function parseShareUrl(input: string): { server: string; token: string } {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    throw new NcError('bad-url', t('Paste the whole share link, like https://cloud.school.org/s/AbC123.'))
  }
  const m = /^(.*?)\/(?:index\.php\/)?s\/([A-Za-z0-9]+)\/?$/.exec(url.pathname)
  if (!m) throw new NcError('bad-url', t('Paste the whole share link, like https://cloud.school.org/s/AbC123.'))
  return { server: `${url.protocol}//${url.host}${m[1]}`, token: m[2] }
}

// Uploads a file into a public share that allows uploads (e.g. "File drop").
// Uses the public WebDAV endpoint of Nextcloud 29+ and falls back to the older
// one. Never overwrites: File drop shares rename by themselves, other shares
// get " (2)", " (3)"… Returns the name sent.
export async function uploadToShare(shareUrl: string, password: string, name: string, blob: Blob): Promise<string> {
  const { server, token } = parseShareUrl(shareUrl)
  const endpoints = [
    { url: (n: string) => `${server}/public.php/dav/files/${token}/${encodeURIComponent(n)}`, auth: password ? basic('anonymous', password) : null },
    { url: (n: string) => `${server}/public.php/webdav/${encodeURIComponent(n)}`, auth: basic(token, password) },
  ]
  const dot = name.lastIndexOf('.')
  const nameFor = (i: number) => (i < 2 ? name : dot > 0 ? `${name.slice(0, dot)} (${i})${name.slice(dot)}` : `${name} (${i})`)
  for (const [index, endpoint] of endpoints.entries()) {
    for (let i = 1; i <= 20; i++) {
      const target = nameFor(i)
      const res = await send(endpoint.url(target), 'PUT', endpoint.auth, { headers: { 'Content-Type': blob.type || 'application/octet-stream', 'If-None-Match': '*' }, body: blob })
      if (res.ok) return target
      if (res.status === 412) continue // the name exists
      // Servers older than Nextcloud 29 lack the first endpoint.
      if (index === 0 && [404, 405, 501].includes(res.status)) break
      if (res.status === 401) throw new NcError('share-password', undefined, 401)
      // Nextcloud 31 answers an unknown token with 503 (a NotFound inside).
      if (res.status === 503 && /NotFound/.test(await res.text().catch(() => ''))) throw new NcError('not-found', t('This share link does not exist or has expired.'), 404)
      if (res.status === 404) throw new NcError('not-found', t('This share link does not exist or has expired.'), 404)
      if (res.status === 403) throw new NcError('forbidden', t('This share does not accept uploads.'), 403)
      throw statusError(res)
    }
  }
  throw new NcError('exists')
}
