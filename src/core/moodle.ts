// Moodle client (docs/moodle.md): sign in with the Moodle app's web service
// (login/token.php?service=moodle_mobile_app), list the person's assignments
// and hand in files. Only the token and a little site information are kept in
// this browser (localStorage); the password is never stored.
//
// Transport: Moodle answers the web service endpoints (login/token.php,
// webservice/rest/server.php, webservice/upload.php, webservice/pluginfile.php)
// with "Access-Control-Allow-Origin: *" for the Moodle app's web version, so
// the browser calls them directly with "simple" requests (form bodies, no
// custom headers, no preflight). When that fails (old Moodle, a filter strips
// the header, the school forces it with moodle.viaRelay), the school's Ofimeo
// Relay forwards the calls (relay/moodle.go) — only when it advertises
// forwarding to this same Moodle in /ofimeo/config, and, unless the relay is
// the one set by the school (or serves this app), after the person agreed.
// Nothing Moodle-related goes to peers or other servers.

import { refreshSchoolRelay, schoolRelay } from './connectivity'
import { isLocked, schoolConfig } from './school-config'
import {
  clearMoodleAccount,
  loadMoodleAccount,
  loadTaskCache,
  readLocal,
  saveMoodleAccount,
  saveTaskCache,
  writeLocal,
  type MoodleAccount,
  type MoodleTask,
  type TaskCache,
} from './moodle-store'

export * from './moodle-store'

export type MoodleErrorCode =
  | 'address' // not a web address
  | 'offline'
  | 'unreachable' // no answer (or the browser was not allowed to read it) and no relay
  | 'relay-site' // the relay forwards to another Moodle
  | 'relay-declined'
  | 'relay' // the relay could not reach Moodle
  | 'not-moodle'
  | 'invalidlogin'
  | 'sso'
  | 'webservices' // mobile web services are off
  | 'token' // the token expired or was revoked: connect again
  | 'too-large'
  | 'filetype'
  | 'closed'
  | 'moodle' // any other Moodle error (message from Moodle)

export class MoodleError extends Error {
  constructor(
    readonly code: MoodleErrorCode,
    message = '',
  ) {
    super(message || code)
    this.name = 'MoodleError'
  }
}

// ---------- Addresses ----------

// scheme://host[:port][/path], without a trailing slash or the page people copy
// from the address bar (/login/index.php, /my/…). Mirrors relay/moodle.go.
export function normalizeSite(input: string): string | null {
  let text = input.trim()
  if (!text) return null
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !url.hostname || url.username || /\s/.test(input.trim())) return null
  let path = url.pathname.replace(/\/+$/, '')
  path = path.replace(/\/(login\/index\.php|index\.php|my(\/.*)?|login|course\/view\.php|mod\/.*)$/i, '')
  return `${url.protocol}//${url.host}${path}`.replace(/\/+$/, '')
}

export const sameSite = (a: string | undefined, b: string | undefined): boolean => !!a && !!b && normalizeSite(a)?.toLowerCase() === normalizeSite(b)?.toLowerCase()

// The school's Moodle (ofimeo.config.json → moodle).
export function schoolMoodle(): { url: string | null; viaRelay: boolean; locked: boolean } {
  const m = schoolConfig().moodle
  const url = m?.url ? normalizeSite(m.url) : null
  return { url, viaRelay: !!m?.viaRelay, locked: !!url && isLocked('moodle') }
}

// ---------- Relay ----------

interface RelayMoodle {
  // Base address of the forwarding endpoints (https://relay/ofimeo/moodle).
  base: string
  address: string
  // Set by the school or serving this app: no confirmation needed.
  trusted: boolean
  maxUploadMB?: number
}

const CONSENT_KEY = 'ofimeo:moodle-relay-consent'

function relayMoodle(site: string): RelayMoodle | null | 'other-site' {
  const relay = schoolRelay()
  const info = (relay?.config as { moodle?: { url?: unknown; path?: unknown; maxUploadMB?: unknown } } | undefined)?.moodle
  if (!relay || !info || typeof info.url !== 'string' || typeof info.path !== 'string' || !info.path.startsWith('/')) return null
  if (!sameSite(info.url, site)) return 'other-site'
  return {
    base: relay.address + info.path,
    address: relay.address,
    trusted: relay.source === 'school' || relay.source === 'same-origin',
    maxUploadMB: typeof info.maxUploadMB === 'number' ? info.maxUploadMB : undefined,
  }
}

const consentId = (relay: RelayMoodle, site: string) => `${relay.address} ${site}`

function hasConsent(relay: RelayMoodle, site: string): boolean {
  if (relay.trusted) return true
  try {
    return (JSON.parse(readLocal(CONSENT_KEY) || '[]') as string[]).includes(consentId(relay, site))
  } catch {
    return false
  }
}

function giveConsent(relay: RelayMoodle, site: string): void {
  let list: string[] = []
  try {
    list = JSON.parse(readLocal(CONSENT_KEY) || '[]') as string[]
  } catch {
    // Start again.
  }
  writeLocal(CONSENT_KEY, JSON.stringify([...new Set([...list, consentId(relay, site)])].slice(-10)))
}

// Asked before the first call through a relay the school did not set.
export type ConfirmRelay = (relayAddress: string) => Promise<boolean>

// ---------- Transport ----------

type Endpoint = 'public' | 'login' | 'rest' | 'upload' | 'file'

interface Target {
  site: string
  transport?: 'direct' | 'relay'
}

interface CallOptions {
  remember?: boolean
  confirmRelay?: ConfirmRelay
  // File downloads: the pluginfile URL.
  fileUrl?: string
  timeoutMs?: number
  // Hand in: called before each step.
  onStep?: (step: 'upload' | 'save' | 'submit') => void
}

const RELAY_ERRORS: Record<string, MoodleErrorCode> = { site: 'relay-site', 'too-large': 'too-large', busy: 'relay', unreachable: 'relay', redirect: 'relay', upstream: 'relay' }

function directRequest(site: string, endpoint: Endpoint, body: URLSearchParams | FormData | null, fileUrl?: string): [string, RequestInit] {
  const init: RequestInit = { method: 'POST', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' }
  switch (endpoint) {
    case 'public':
      // text/plain keeps it a simple request (Moodle reads the raw body).
      return [`${site}/lib/ajax/service-nologin.php?info=tool_mobile_get_public_config`, { ...init, body: new Blob([JSON.stringify([{ index: 0, methodname: 'tool_mobile_get_public_config', args: {} }])], { type: 'text/plain' }) }]
    case 'login':
      return [`${site}/login/token.php`, { ...init, body }]
    case 'rest': {
      const fn = (body as URLSearchParams).get('wsfunction') ?? ''
      return [`${site}/webservice/rest/server.php?moodlewsrestformat=json&wsfunction=${encodeURIComponent(fn)}`, { ...init, body }]
    }
    case 'upload':
      return [`${site}/webservice/upload.php`, { ...init, body }]
    case 'file': {
      const url = new URL(fileUrl!)
      url.searchParams.set('token', (body as URLSearchParams).get('token') ?? '')
      return [url.href, { method: 'GET', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' }]
    }
  }
}

function relayRequest(relay: RelayMoodle, site: string, endpoint: Endpoint, body: URLSearchParams | FormData | null, fileUrl?: string): [string, RequestInit] {
  let payload: BodyInit | null = body
  if (endpoint === 'file') payload = new URLSearchParams({ url: fileUrl!, token: (body as URLSearchParams).get('token') ?? '' })
  if (endpoint === 'public') payload = null
  return [`${relay.base}/${endpoint}?site=${encodeURIComponent(site)}`, { method: 'POST', body: payload, credentials: 'omit', cache: 'no-store' }]
}

async function viaRelay(target: Target, endpoint: Endpoint, body: URLSearchParams | FormData | null, options: CallOptions): Promise<Response> {
  let relay = relayMoodle(target.site)
  if (!relay && schoolRelay()) {
    // The relay may have been set up for Moodle since its configuration was saved.
    await refreshSchoolRelay().catch(() => null)
    relay = relayMoodle(target.site)
  }
  if (relay === 'other-site') throw new MoodleError('relay-site')
  if (!relay) throw new MoodleError(navigator.onLine ? 'unreachable' : 'offline')
  if (!hasConsent(relay, target.site)) {
    if (!options.confirmRelay || !(await options.confirmRelay(relay.address))) throw new MoodleError('relay-declined')
    giveConsent(relay, target.site)
  }
  const [url, init] = relayRequest(relay, target.site, endpoint, body, options.fileUrl)
  let response: Response
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(options.timeoutMs ?? 90_000) })
  } catch {
    throw new MoodleError(navigator.onLine ? 'relay' : 'offline')
  }
  if (!response.ok) {
    const data = (await response
      .clone()
      .json()
      .catch(() => ({}))) as { error?: string; source?: string }
    if (data.source === 'relay') throw new MoodleError(RELAY_ERRORS[data.error ?? ''] ?? 'relay')
  }
  target.transport = 'relay'
  return response
}

// Sends one request directly or through the relay (see the top of this file).
async function send(target: Target, endpoint: Endpoint, body: URLSearchParams | FormData | null, options: CallOptions = {}): Promise<Response> {
  const forced = schoolMoodle().viaRelay && sameSite(schoolMoodle().url ?? '', target.site)
  if (forced || target.transport === 'relay') {
    try {
      return await viaRelay(target, endpoint, body, options)
    } catch (err) {
      // A relay chosen earlier is gone: try directly (unless the school forces the relay).
      if (forced || !(err instanceof MoodleError) || !['unreachable', 'relay-site'].includes(err.code)) throw err
    }
  }
  const [url, init] = directRequest(target.site, endpoint, body, options.fileUrl)
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(options.timeoutMs ?? 90_000) })
    target.transport = 'direct'
    return response
  } catch (err) {
    if ((err as Error).name === 'TimeoutError') throw new MoodleError('unreachable')
    if (!navigator.onLine) throw new MoodleError('offline')
    // Blocked by CORS or not reachable from here: the school relay may help.
    return viaRelay(target, endpoint, body, options)
  }
}

interface MoodleException {
  exception?: string
  errorcode?: string
  error?: string
  message?: string
}

function moodleError(data: MoodleException): MoodleError {
  const code = data.errorcode ?? ''
  const message = data.message || data.error || code
  if (code === 'invalidtoken' || code === 'accessexception') return new MoodleError('token', message)
  if (code === 'invalidlogin') return new MoodleError('invalidlogin', message)
  if (/^maxbytes|^maxareabytes|filetoobig|upload_error_(ini|form)_size/.test(code)) return new MoodleError('too-large', message)
  if (/filetype|invalidfile/i.test(code)) return new MoodleError('filetype', message)
  if (['enablewsdescription', 'servicenotavailable', 'noaccess', 'webservicesnotenabled'].includes(code) || /web service/i.test(code)) return new MoodleError('webservices', message)
  return new MoodleError('moodle', message)
}

async function json<T>(response: Response): Promise<T> {
  const text = await response.text()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new MoodleError(response.ok ? 'not-moodle' : 'moodle', response.ok ? '' : `HTTP ${response.status}`)
  }
  const d = data as MoodleException
  if (d && typeof d === 'object' && !Array.isArray(d) && (d.exception || d.errorcode || (typeof d.error === 'string' && !('token' in d)))) throw moodleError(d)
  if (!response.ok) throw new MoodleError('moodle', `HTTP ${response.status}`)
  return data as T
}

// PHP-style form fields: courseids[0]=3, plugindata[files_filemanager]=12.
function flatten(params: Record<string, unknown>, prefix = '', out = new URLSearchParams()): URLSearchParams {
  for (const [key, value] of Object.entries(params)) {
    const name = prefix ? `${prefix}[${key}]` : key
    if (value === undefined || value === null) continue
    if (typeof value === 'object') flatten(value as Record<string, unknown>, name, out)
    else out.append(name, typeof value === 'boolean' ? (value ? '1' : '0') : String(value))
  }
  return out
}

async function call<T>(account: MoodleAccount | Target & { token: string }, fn: string, params: Record<string, unknown> = {}, options: CallOptions = {}): Promise<T> {
  const body = flatten(params)
  body.set('wstoken', account.token)
  body.set('wsfunction', fn)
  body.set('moodlewsrestformat', 'json')
  const response = await send(account, 'rest', body, options)
  return json<T>(response)
}

// ---------- Sign in ----------

export interface PublicConfig {
  sitename?: string
  // 1: in the app (password), 2: in a browser, 3: embedded browser (both SSO).
  typeoflogin?: number
  launchurl?: string
  identityproviders?: { name: string; url?: string; iconurl?: string }[]
}

// The site's public configuration, or null when it cannot be read from here.
export async function publicConfig(site: string, options: CallOptions = {}): Promise<PublicConfig | null> {
  try {
    const response = await send({ site }, 'public', null, { ...options, timeoutMs: 15_000 })
    const data = (await response.json()) as { error?: boolean; data?: PublicConfig }[]
    return Array.isArray(data) && data[0] && !data[0].error ? (data[0].data ?? null) : null
  } catch {
    return null
  }
}

// Sign-in happens on a web page (SAML, CAS, OAuth…): a password cannot be used here.
export const usesSso = (config: PublicConfig | null): boolean => !!config && (config.typeoflogin === 2 || config.typeoflogin === 3)

export interface SiteInfo {
  sitename: string
  username: string
  fullname: string
  userid: number
  siteurl?: string
  release?: string
  usermaxuploadfilesize?: number
  functions?: { name: string }[]
}

export async function connect(siteInput: string, username: string, password: string, options: CallOptions = {}): Promise<MoodleAccount> {
  const site = normalizeSite(siteInput)
  if (!site) throw new MoodleError('address')
  const school = schoolMoodle()
  if (school.locked && !sameSite(school.url!, site)) throw new MoodleError('address')
  if (!navigator.onLine) throw new MoodleError('offline')
  const target: Target = { site }
  const response = await send(target, 'login', new URLSearchParams({ username: username.trim(), password, service: 'moodle_mobile_app' }), options)
  const data = await json<{ token?: string; privatetoken?: string | null }>(response)
  if (!data.token) throw new MoodleError('not-moodle')
  const info = await call<SiteInfo>({ ...target, token: data.token }, 'core_webservice_get_site_info', {}, options)
  const account: MoodleAccount = {
    site,
    token: data.token,
    siteName: info.sitename || site,
    fullName: info.fullname || info.username,
    userName: info.username,
    userId: info.userid,
    transport: target.transport ?? 'direct',
    maxUpload: info.usermaxuploadfilesize && info.usermaxuploadfilesize > 0 ? info.usermaxuploadfilesize : undefined,
    connectedAt: Date.now(),
    remember: options.remember,
  }
  saveMoodleAccount(account)
  return account
}

export function disconnect(): void {
  clearMoodleAccount()
  saveTaskCache(null)
}

// Keeps the transport that worked for the next time.
function remember(account: MoodleAccount): void {
  const saved = loadMoodleAccount()
  if (saved && saved.site === account.site && saved.token === account.token && saved.transport !== account.transport) saveMoodleAccount({ ...saved, transport: account.transport })
}

// ---------- Assignments ----------

interface WsFile {
  filename: string
  filepath?: string
  filesize?: number
  fileurl: string
  mimetype?: string
}

interface WsAssignment {
  id: number
  cmid: number
  course: number
  name: string
  intro?: string
  introformat?: number
  introfiles?: WsFile[]
  introattachments?: WsFile[]
  duedate: number
  cutoffdate: number
  allowsubmissionsfromdate: number
  submissiondrafts: number
  requiresubmissionstatement: number
  submissionstatement?: string
  teamsubmission?: number
  nosubmissions?: number
  configs: { plugin: string; subtype: string; name: string; value: string }[]
}

interface WsStatus {
  lastattempt?: {
    submission?: { status: string; timemodified?: number; plugins?: { type: string; fileareas?: { area: string; files?: WsFile[] }[] }[] }
    teamsubmission?: { status: string; timemodified?: number; plugins?: { type: string; fileareas?: { area: string; files?: WsFile[] }[] }[] }
    submissionsenabled?: boolean
    locked?: boolean
    graded?: boolean
    canedit?: boolean
    cansubmit?: boolean
    extensionduedate?: number
    gradingstatus?: string
  }
  feedback?: {
    gradefordisplay?: string
    gradeddate?: number
    plugins?: { type: string; editorfields?: { name: string; text: string; format?: number }[]; fileareas?: { area: string; files?: WsFile[] }[] }[]
  }
}

const config = (a: WsAssignment, plugin: string, name: string): string | undefined => a.configs.find((c) => c.plugin === plugin && c.subtype === 'assignsubmission' && c.name === name)?.value

function toTask(site: string, courseName: string, a: WsAssignment, s: WsStatus | null): MoodleTask {
  const attempt = s?.lastattempt
  const submission = attempt?.teamsubmission ?? attempt?.submission
  const files = (submission?.plugins ?? [])
    .filter((p) => p.type === 'file')
    .flatMap((p) => p.fileareas ?? [])
    .flatMap((f) => f.files ?? [])
    .map((f) => ({ name: f.filename, size: f.filesize }))
  const feedback = s?.feedback
  const comments = feedback?.plugins?.find((p) => p.type === 'comments')?.editorfields?.find((f) => f.name === 'comments')?.text
  const fileEnabled = config(a, 'file', 'enabled') === '1'
  const types = (config(a, 'file', 'filetypeslist') ?? '')
    .split(/[\s,;]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
  return {
    id: a.id,
    cmid: a.cmid,
    courseId: a.course,
    courseName,
    name: a.name,
    intro: a.intro ?? '',
    files: [...(a.introattachments ?? []), ...(a.introfiles ?? [])].filter((f, i, all) => all.findIndex((g) => g.fileurl === f.fileurl) === i).map((f) => ({ name: f.filename, url: f.fileurl, size: f.filesize, mimetype: f.mimetype })),
    due: a.duedate || 0,
    cutoff: a.cutoffdate || 0,
    allowFrom: a.allowsubmissionsfromdate || 0,
    extensionDue: attempt?.extensionduedate || 0,
    status: submission?.status ?? 'new',
    submittedAt: submission?.timemodified,
    submittedFiles: files,
    gradingStatus: attempt?.gradingstatus,
    graded: !!attempt?.graded || !!feedback?.gradefordisplay,
    grade: feedback?.gradefordisplay,
    feedback: comments,
    fileSubmission: fileEnabled ? { maxFiles: Number(config(a, 'file', 'maxfilesubmissions') || 1), maxBytes: Number(config(a, 'file', 'maxsubmissionsizebytes') || 0), types } : undefined,
    onlineText: config(a, 'onlinetext', 'enabled') === '1',
    noSubmissions: !!a.nosubmissions,
    submitButton: !!a.submissiondrafts,
    requireStatement: !!a.requiresubmissionstatement,
    statement: a.submissionstatement,
    canEdit: attempt?.canedit,
    locked: !!attempt?.locked,
    link: `${site}/mod/assign/view.php?id=${a.cmid}`,
  }
}

// Handed in or graded: shown after the pending ones.
export const taskDone = (task: MoodleTask): boolean => task.status === 'submitted' || task.graded

export function sortTasks(tasks: MoodleTask[]): MoodleTask[] {
  const due = (t: MoodleTask) => t.extensionDue || t.due || Number.MAX_SAFE_INTEGER
  return [...tasks].sort((a, b) => {
    const da = taskDone(a)
    const db = taskDone(b)
    if (da !== db) return da ? 1 : -1
    return da ? (b.due || 0) - (a.due || 0) : due(a) - due(b)
  })
}

async function limitAll<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    }),
  )
  return out
}

async function taskFor(account: MoodleAccount, courseName: string, a: WsAssignment, options: CallOptions): Promise<MoodleTask> {
  const status = await call<WsStatus>(account, 'mod_assign_get_submission_status', { assignid: a.id }, options).catch((err) => {
    if (err instanceof MoodleError && err.code === 'token') throw err
    return null
  })
  return toTask(account.site, courseName, a, status)
}

// Every assignment of every course of the person, sorted; saved for offline use.
export async function refreshTasks(options: CallOptions = {}): Promise<TaskCache> {
  const account = loadMoodleAccount()
  if (!account) throw new MoodleError('token')
  if (!navigator.onLine) throw new MoodleError('offline')
  try {
    const courses = await call<{ id: number; fullname: string; displayname?: string; shortname?: string; visible?: number }[]>(account, 'core_enrol_get_users_courses', { userid: account.userId }, options)
    const list = Array.isArray(courses) ? courses : []
    const result = list.length
      ? await call<{ courses: { id: number; fullname: string; assignments: WsAssignment[] }[] }>(account, 'mod_assign_get_assignments', { courseids: list.map((c) => c.id) }, options)
      : { courses: [] }
    const names = new Map(list.map((c) => [c.id, c.displayname || c.fullname || c.shortname || '']))
    const pairs = result.courses.flatMap((c) => c.assignments.map((a) => ({ course: names.get(c.id) || c.fullname, a })))
    const tasks = await limitAll(pairs, 4, ({ course, a }) => taskFor(account, course, a, options))
    const cache: TaskCache = { site: account.site, userId: account.userId, updated: Date.now(), tasks: sortTasks(tasks) }
    saveTaskCache(cache)
    return cache
  } finally {
    remember(account)
  }
}

export async function refreshTask(task: MoodleTask, options: CallOptions = {}): Promise<MoodleTask> {
  const account = loadMoodleAccount()
  if (!account) throw new MoodleError('token')
  const result = await call<{ courses: { id: number; fullname: string; assignments: WsAssignment[] }[] }>(account, 'mod_assign_get_assignments', { courseids: [task.courseId] }, options)
  const a = result.courses.flatMap((c) => c.assignments).find((x) => x.id === task.id)
  if (!a) return task
  const fresh = await taskFor(account, task.courseName, a, options)
  const cache = loadTaskCache()
  if (cache && cache.site === account.site) saveTaskCache({ ...cache, tasks: sortTasks(cache.tasks.map((x) => (x.id === fresh.id ? fresh : x))) })
  remember(account)
  return fresh
}

// ---------- Handing in ----------

const now = () => Date.now() / 1000

// Why a task cannot take a file now (null: it can).
export function handInProblem(task: MoodleTask): 'no-files' | 'not-open' | 'closed' | 'locked' | null {
  if (!task.fileSubmission || task.noSubmissions) return 'no-files'
  if (task.allowFrom && now() < task.allowFrom) return 'not-open'
  const cutoff = task.extensionDue ? Math.max(task.extensionDue, task.cutoff) : task.cutoff
  if (cutoff && now() > cutoff) return 'closed'
  if (task.locked || task.canEdit === false) return 'locked'
  return null
}

// Moodle file type groups (core_filetypes) most used in assignments.
const TYPE_GROUPS: Record<string, string[]> = {
  document: ['doc', 'docx', 'odt', 'ott', 'pdf', 'rtf', 'txt', 'epub', 'html', 'htm', 'xhtml', 'md', 'odm', 'xml', 'dotx', 'dotm', 'docm'],
  spreadsheet: ['xls', 'xlsx', 'ods', 'ots', 'csv', 'xlsm', 'xltx', 'xltm'],
  presentation: ['ppt', 'pptx', 'odp', 'otp', 'pps', 'ppsx', 'potx', 'pptm'],
  image: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'tif', 'tiff', 'ico'],
  web_image: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'],
  web_file: ['html', 'htm', 'xhtml', 'css', 'js', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'pdf'],
  archive: ['zip', '7z', 'gz', 'tar', 'rar', 'tgz'],
  html_track: ['vtt'],
  optimised_image: ['png', 'jpg', 'jpeg', 'gif'],
}

// Accepted extensions (without dot), or null when any file is accepted or the
// list uses groups this app does not know (Moodle then decides).
export function acceptedExtensions(task: MoodleTask): string[] | null {
  const list = task.fileSubmission?.types ?? []
  if (!list.length || list.includes('*')) return null
  const out: string[] = []
  for (const item of list) {
    if (item.startsWith('.')) out.push(item.slice(1))
    else if (TYPE_GROUPS[item]) out.push(...TYPE_GROUPS[item])
    else if (item.includes('/')) {
      if (item === 'application/pdf') out.push('pdf')
      else return null
    } else return null
  }
  return [...new Set(out)]
}

// Largest file Moodle takes for this task (bytes), when known.
export function maxBytes(task: MoodleTask): number | undefined {
  const account = loadMoodleAccount()
  const limits = [task.fileSubmission?.maxBytes, account?.maxUpload].filter((n): n is number => !!n && n > 0)
  return limits.length ? Math.min(...limits) : undefined
}

export interface HandInResult {
  // Submitted for grading (false: saved as a draft the teacher sees as such).
  submitted: boolean
  task: MoodleTask
}

// Uploads the file to a new draft area and saves it as the submission
// (replacing earlier files), then submits it when the task has a submit button.
export async function handInFile(task: MoodleTask, file: { name: string; blob: Blob }, acceptStatement: boolean, options: CallOptions = {}): Promise<HandInResult> {
  const account = loadMoodleAccount()
  if (!account) throw new MoodleError('token')
  if (!navigator.onLine) throw new MoodleError('offline')
  const problem = handInProblem(task)
  if (problem) throw new MoodleError('closed')
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const accepted = acceptedExtensions(task)
  if (accepted && !accepted.includes(ext)) throw new MoodleError('filetype')
  const limit = maxBytes(task)
  if (limit && file.blob.size > limit) throw new MoodleError('too-large')
  if (task.requireStatement && !acceptStatement) throw new MoodleError('moodle', 'statement')

  options.onStep?.('upload')
  const form = new FormData()
  form.append('token', account.token)
  form.append('filearea', 'draft')
  form.append('itemid', '0')
  form.append('file_1', file.blob, file.name)
  const uploaded = await json<{ itemid: number; filename: string }[] | MoodleException>(await send(account, 'upload', form, { ...options, timeoutMs: 180_000 }))
  const itemid = Array.isArray(uploaded) ? uploaded[0]?.itemid : undefined
  if (!itemid) throw new MoodleError('moodle', (uploaded as MoodleException).error ?? '')

  const warnings = (w: { warnings?: { message?: string; warningcode?: string }[] } | { message?: string; warningcode?: string }[] | null) =>
    (Array.isArray(w) ? w : (w?.warnings ?? [])).map((x) => x.message || x.warningcode || '').filter(Boolean)
  options.onStep?.('save')
  const saved = await call<{ message?: string }[] | { warnings?: { message?: string }[] } | null>(account, 'mod_assign_save_submission', { assignmentid: task.id, plugindata: { files_filemanager: itemid } }, options)
  const saveProblems = warnings(saved)
  if (saveProblems.length) throw new MoodleError('moodle', saveProblems.join(' '))
  let submitted = !task.submitButton
  if (task.submitButton) {
    options.onStep?.('submit')
    const result = await call<{ message?: string }[] | { warnings?: { message?: string }[] } | null>(account, 'mod_assign_submit_for_grading', { assignmentid: task.id, acceptsubmissionstatement: acceptStatement ? 1 : 0 }, options)
    const submitProblems = warnings(result)
    if (submitProblems.length) throw new MoodleError('moodle', submitProblems.join(' '))
    submitted = true
  }
  remember(account)
  const fresh = await refreshTask(task, options).catch(() => task)
  return { submitted, task: fresh }
}

// ---------- Files of a task ----------

// Link that downloads a Moodle file with the token (opened by the browser).
export function fileLink(url: string): string {
  const account = loadMoodleAccount()
  try {
    const u = new URL(url)
    if (account && sameOrigin(u, account.site)) u.searchParams.set('token', account.token)
    return u.href
  } catch {
    return url
  }
}

const sameOrigin = (u: URL, site: string) => {
  try {
    return u.origin === new URL(site).origin
  } catch {
    return false
  }
}

// Downloads a file of a task (directly or through the relay).
export async function downloadFile(file: { name: string; url: string; mimetype?: string }, options: CallOptions = {}): Promise<File> {
  const account = loadMoodleAccount()
  if (!account) throw new MoodleError('token')
  const u = new URL(file.url)
  if (!sameOrigin(u, account.site)) throw new MoodleError('address')
  const response = await send(account, 'file', new URLSearchParams({ token: account.token }), { ...options, fileUrl: file.url, timeoutMs: 180_000 })
  if (!response.ok) throw new MoodleError('moodle', `HTTP ${response.status}`)
  const type = response.headers.get('X-Ofimeo-Content-Type') ?? response.headers.get('Content-Type') ?? file.mimetype ?? ''
  if (/json/.test(type)) await json(response)
  remember(account)
  return new File([await response.blob()], file.name, { type: file.mimetype || type.split(';')[0] || 'application/octet-stream' })
}
