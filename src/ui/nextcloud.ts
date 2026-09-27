// Nextcloud in the interface: account dialog (Login Flow v2 or app password),
// connection diagnostics and the admin help for CORS, file browser, "Open from
// Nextcloud", "Save to Nextcloud" (ETag conflicts), the status in the app bar,
// autosave and "Hand in" to a share link. The protocol is in core/nextcloud.ts.

import * as Y from 'yjs'
import { Check, ChevronRight, Cloud, CloudCheck, CloudOff, CloudUpload, Copy, File as FileIcon, Folder, FolderPlus, House, LogIn, RefreshCw, TriangleAlert } from 'lucide'
import { APPS, appForFile, type AppInfo } from '../apps/registry'
import { locale, t } from '../core/i18n'
import * as nc from '../core/nextcloud'
import type { DavEntry, Diagnosis, NcAccount } from '../core/nextcloud'
import type { ExportOption, Session } from '../core/session'
import { safeFileName } from '../core/handin'
import * as store from '../core/store'
import type { DocType, RemoteLink } from '../core/store'
import { confirmDialog, el, icon, shortcutLabel, showContextMenu, showDialog, toast, type MenuEntry } from './widgets'
import { isLocked, schoolConfig } from '../core/school-config'
import { lockedNote } from './school'
import './nextcloud.css'

// Nextcloud servers of the school configuration (nextcloud.servers): the first
// one is filled in, several are offered in a list; with "nextcloud" locked, only
// those can be used.
function schoolNextcloud(server: HTMLInputElement): { chooser: HTMLElement | null; note: HTMLElement | null } {
  const presets = schoolConfig().nextcloud?.servers ?? []
  if (!presets.length) return { chooser: null, note: null }
  const same = (a: string, b: string) => a.trim().replace(/\/+$/, '').toLowerCase() === b.trim().replace(/\/+$/, '').toLowerCase()
  const locked = isLocked('nextcloud')
  if (!server.value || (locked && !presets.some((p) => same(p.url, server.value)))) server.value = presets[0].url
  server.readOnly = locked
  let chooser: HTMLElement | null = null
  if (presets.length > 1 || presets[0].name) {
    const select = el('select', { class: 'field nc-presets' })
    for (const p of presets) select.append(new Option(p.name ? `${p.name} (${p.url.replace(/^https?:\/\//, '')})` : p.url, p.url, false, same(p.url, server.value)))
    if (!locked) select.append(new Option(t('Another server…'), '', false, !presets.some((p) => same(p.url, server.value))))
    select.addEventListener('change', () => {
      server.value = select.value
      if (!select.value) server.focus()
    })
    chooser = el('label', { class: 'field-label' }, t('Your school’s Nextcloud'), select)
  }
  return { chooser, note: locked ? lockedNote() : null }
}

const SERVER_KEY = 'words-online:nextcloud-server'
const FOLDER_KEY = 'words-online:nextcloud-folder'
const FORMAT_KEY = 'words-online:nextcloud-format'
const SHARE_KEY = 'words-online:nextcloud-share'

const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
const online = () => navigator.onLine

// Formats each app saves in, first = default (the apps list the same ones in
// session.hooks.exportFormats); used before an app is loaded.
const SAVE_EXTS: Record<DocType, string[]> = {
  writer: ['docx', 'odt', 'html', 'txt', 'md'],
  sheet: ['xlsx', 'ods', 'csv'],
  draw: ['excalidraw', 'png', 'svg'],
  diagram: ['drawio', 'svg', 'png'],
  slides: ['pptx', 'odp'],
  forms: ['oform', 'csv'],
  pdf: ['pdf'],
}
const EXT_ALIASES: Record<string, string> = { htm: 'html', xml: 'drawio', markdown: 'md' }

const extOf = (name: string) => (/\.([^./]+)$/.exec(name)?.[1] ?? '').toLowerCase()
const stripExt = (name: string) => name.replace(/\.[^./]+$/, '')

function appForName(name: string): AppInfo | undefined {
  const ext = `.${extOf(name)}`
  return APPS.find((a) => a.load && a.accept?.split(',').includes(ext))
}

function readLocal(key: string): string {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}
function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore
  }
}

function offlineToast(): boolean {
  if (online()) return false
  toast(nc.errorMessage('offline'))
  return true
}

const formatTime = (time: number) => new Date(time).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toLocaleString(locale, { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[unit]}`
}

function formatDate(time: number): string {
  if (!time) return ''
  const date = new Date(time)
  if (date.toDateString() === new Date().toDateString()) return formatTime(time)
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
}

// Replaces a result area's content and scrolls it into view (dialogs can be tall).
function show(area: HTMLElement, ...nodes: Node[]): void {
  area.replaceChildren(...nodes)
  requestAnimationFrame(() => area.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
}

const closeDialogOf = (node: Element, value: string) => (node.closest('dialog') as HTMLDialogElement | null)?.close(value)

// Enter in a text field would submit the dialog with its first button.
function noSubmitOnEnter(input: HTMLElement, onEnter?: () => void): void {
  input.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') {
      e.preventDefault()
      onEnter?.()
    }
  })
}

function button(label: string, onClick: () => void, className = 'nc-btn', iconNode?: Parameters<typeof icon>[0]): HTMLButtonElement {
  const b = el('button', { type: 'button', class: className }, iconNode ? icon(iconNode, 16) : null, el('span', { textContent: label }))
  b.addEventListener('click', onClick)
  return b
}

// ---------- Admin help (CORS) ----------

export function nginxSnippet(origin: string): string {
  return `# 1) In the http { } block (e.g. /etc/nginx/conf.d/words-online-cors.conf)
map $http_origin $wo_origin {
    default "";
    "${origin}" $http_origin;   # where Ofimeo runs (one line per site)
}
map $request_uri $wo_cors_path {
    default 0;
    "~^[^?]*/remote\\.php/dav/" 1;
    "~^[^?]*/public\\.php/(dav|webdav)/" 1;
    "~^[^?]*/ocs/v2\\.php/core/apppassword" 1;
    "~^[^?]*/login/v2" 1;
}
map "$wo_cors_path:$wo_origin" $wo_cors_origin {
    default "";
    "~^1:(?<o>.+)$" $o;
}
map $wo_cors_origin $wo_cors_methods {
    "" "";
    default "GET, HEAD, POST, PUT, DELETE, MKCOL, MOVE, COPY, PROPFIND, OPTIONS";
}
map $wo_cors_origin $wo_cors_headers {
    "" "";
    default "Authorization, Content-Type, Depth, Destination, Overwrite, If-Match, If-None-Match, OCS-APIRequest, X-Requested-With";
}
map $wo_cors_origin $wo_cors_expose {
    "" "";
    default "ETag, OC-ETag, OC-FileId, Content-Length";
}
map $wo_cors_origin $wo_cors_max_age {
    "" "";
    default 3600;
}
map "$request_method:$wo_cors_origin" $wo_preflight {
    default 0;
    "~^OPTIONS:." 1;
}

# 2) In Nextcloud's server { } block, next to its other add_header lines
add_header Access-Control-Allow-Origin $wo_cors_origin always;
add_header Access-Control-Allow-Methods $wo_cors_methods always;
add_header Access-Control-Allow-Headers $wo_cors_headers always;
add_header Access-Control-Expose-Headers $wo_cors_expose always;
add_header Access-Control-Max-Age $wo_cors_max_age always;
add_header Vary Origin always;
if ($wo_preflight) {
    return 204;
}`
}

export function apacheSnippet(origin: string): string {
  return `# In Nextcloud's <VirtualHost> (needs mod_headers and mod_rewrite)
<IfModule mod_headers.c>
    SetEnvIfExpr "req('Origin') in { '${origin}' } && %{REQUEST_URI} =~ m#/(remote\\.php/dav/|public\\.php/(dav|webdav)/|ocs/v2\\.php/core/apppassword|login/v2)#" WO_CORS=1
    Header always set Access-Control-Allow-Origin "expr=%{req:Origin}" env=WO_CORS
    Header always set Access-Control-Allow-Methods "GET, HEAD, POST, PUT, DELETE, MKCOL, MOVE, COPY, PROPFIND, OPTIONS" env=WO_CORS
    Header always set Access-Control-Allow-Headers "Authorization, Content-Type, Depth, Destination, Overwrite, If-Match, If-None-Match, OCS-APIRequest, X-Requested-With" env=WO_CORS
    Header always set Access-Control-Expose-Headers "ETag, OC-ETag, OC-FileId, Content-Length" env=WO_CORS
    Header always set Access-Control-Max-Age "3600" env=WO_CORS
    Header always merge Vary "Origin" env=WO_CORS
    # Answer the browser's preflight (OPTIONS) here: it never carries a login.
    RewriteEngine On
    RewriteCond %{ENV:WO_CORS} =1
    RewriteCond %{REQUEST_METHOD} =OPTIONS
    RewriteRule ^ - [R=204,L]
</IfModule>`
}

function codeBlock(text: string): HTMLElement {
  const pre = el('pre', { class: 'nc-code', textContent: text })
  const copy = button(t('Copy'), async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast(t('Copied'))
    } catch {
      const range = document.createRange()
      range.selectNodeContents(pre)
      getSelection()?.removeAllRanges()
      getSelection()?.addRange(range)
    }
  }, 'nc-btn nc-copy', Copy)
  return el('div', { class: 'nc-code-wrap' }, copy, pre)
}

// What an administrator can do so this site may talk to Nextcloud.
export function corsHelp(open = false): HTMLElement {
  const origin = location.origin
  const details = el('details', { class: 'nc-help', open })
  details.append(
    el('summary', { textContent: t('How an administrator can allow this site') }),
    el('p', { textContent: t('Browsers only let a web page talk to another server when that server allows it (CORS). Nextcloud does not allow other sites by default. Your Nextcloud administrator can choose one of these options:') }),
    el('h4', { textContent: t('A. Serve Ofimeo from the Nextcloud address (recommended)') }),
    el('p', { textContent: t('Copy the files of Ofimeo (the dist folder of a build) into a folder of the web server that serves Nextcloud, for example {example}. The page and Nextcloud then share one address, so nothing else needs to be configured and “Log in with Nextcloud” works too.', { example: 'https://cloud.school.org/office/' }) }),
    el('h4', { textContent: t('B. Nextcloud app “WebAppPassword”') }),
    el('p', { textContent: t('Install the app “WebAppPassword” from the Nextcloud app store and add {origin} to its allowed origins for WebDAV (Administration settings → WebAppPassword). It only covers files (WebDAV), so sign in with an app password; the share link upload for “Hand in” also needs option A or C.', { origin }) }),
    el('h4', { textContent: t('C. CORS headers in the web server') }),
    el('p', { textContent: t('Allow {origin} for the Nextcloud addresses that Ofimeo uses (WebDAV, public share uploads, login flow and app password revocation), including the browser’s preflight (OPTIONS) request, the Authorization, Depth, Destination and If-Match headers, and the ETag header in responses. Adjust the origin and reload the web server.', { origin }) }),
    el('p', { class: 'nc-code-title', textContent: 'Nginx' }),
    codeBlock(nginxSnippet(origin)),
    el('p', { class: 'nc-code-title', textContent: 'Apache' }),
    codeBlock(apacheSnippet(origin)),
    el('p', { class: 'hint', textContent: t('The full guide is in docs/nextcloud.md, in the source code of Ofimeo.') }),
  )
  return details
}

// Message box for a connection test or a failed request.
function diagnosisView(d: Pick<Diagnosis, 'ok' | 'kind' | 'message' | 'status'>): HTMLElement {
  const box = el('div', { class: `nc-result ${d.ok ? 'ok' : 'error'}`, role: d.ok ? 'status' : 'alert' })
  box.append(el('div', { class: 'nc-result-line' }, icon(d.ok ? Check : TriangleAlert, 18), el('span', { textContent: d.message })))
  if (d.status?.version) box.append(el('div', { class: 'hint', textContent: t('{product} {version} found at this address.', { product: d.status.productname || 'Nextcloud', version: d.status.version }) }))
  if (d.kind === 'cors') box.append(corsHelp(true))
  if (d.kind === 'auth') box.append(el('p', { class: 'hint', textContent: t('Check the user name and create a new app password if needed. Your normal Nextcloud password is not accepted here.') }))
  return box
}

function errorView(err: unknown): HTMLElement {
  const e = err instanceof nc.NcError ? err : new nc.NcError('server', (err as Error).message)
  return diagnosisView({ ok: false, kind: e.kind, message: e.message })
}

// ---------- Account ----------

function appPasswordSteps(): HTMLElement {
  return el(
    'div',
    { class: 'nc-steps' },
    el('p', { textContent: t('To create an app password:') }),
    el(
      'ol',
      {},
      el('li', { textContent: t('Open Nextcloud in the browser and log in.') }),
      el('li', { textContent: t('Click your picture (top right) → Personal settings → Security.') }),
      el('li', { textContent: t('Under “Devices & sessions”, type a name such as “Ofimeo” and click “Create new app password”.') }),
      el('li', { textContent: t('Copy the user name and the app password shown there into this form.') }),
    ),
    el('p', { class: 'hint', textContent: t('Never type your main Nextcloud password here. An app password can be revoked at any time in the same place, and it does not give access to your account settings.') }),
  )
}

const privacyNote = () =>
  el('p', { class: 'hint nc-privacy', textContent: t('The app password is stored only in this browser and is sent only to your Nextcloud. “Sign out” removes it from this browser.') })

// Settings dialog: connect (Login Flow v2 or app password), test, autosave, sign out.
export async function openAccountDialog(): Promise<NcAccount | undefined> {
  const body = el('div', { class: 'nc-account' })
  let polling = null as AbortController | null

  const connectedView = (account: NcAccount): HTMLElement => {
    const result = el('div')
    const test = button(t('Test connection'), async () => {
      show(result, el('p', { class: 'hint', textContent: t('Testing…') }))
      const d = await nc.diagnose(account.server, account.loginName, account.appPassword)
      show(result, diagnosisView(d))
    }, 'nc-btn', RefreshCw)
    const signOut = button(t('Sign out'), async () => {
      if (!(await confirmDialog(t('Sign out'), t('Sign out of Nextcloud in this browser? Documents stay in this browser; they are no longer saved to Nextcloud until you sign in again.'), { confirmLabel: t('Sign out') }))) return
      let revoked = false
      if (account.viaLoginFlow && online()) revoked = await nc.revokeAppPassword(account)
      nc.removeAccount(account.id)
      toast(
        account.viaLoginFlow && !revoked
          ? t('Signed out. The app password could not be revoked from here; you can remove it in Nextcloud → Personal settings → Security.')
          : t('Signed out of Nextcloud'),
      )
      render()
    }, 'nc-btn danger')
    const autosave = el('select', { class: 'field nc-autosave' })
    for (const [value, label] of [
      [0, t('Off')],
      [2, t('Every 2 minutes')],
      [5, t('Every 5 minutes')],
      [10, t('Every 10 minutes')],
      [15, t('Every 15 minutes')],
    ] as [number, string][])
      autosave.append(el('option', { value: String(value), textContent: label, selected: (account.autosave ?? 0) === value }))
    autosave.addEventListener('change', () => nc.saveAccount({ ...account, autosave: Number(autosave.value) }))
    return el(
      'div',
      { class: 'nc-connected' },
      el(
        'div',
        { class: 'nc-who' },
        icon(CloudCheck, 28),
        el(
          'div',
          {},
          el('strong', { textContent: account.displayName ? `${account.displayName} (${account.user})` : account.user }),
          el('a', { href: `${account.server}/index.php/apps/files/`, target: '_blank', rel: 'noopener', textContent: account.server }),
        ),
      ),
      el('label', { class: 'field-label' }, t('Save linked documents to Nextcloud automatically'), autosave),
      el('p', { class: 'hint', textContent: t('Documents opened from Nextcloud or saved there stay linked to their file: File → Save to Nextcloud (Ctrl+S) updates it. Collaboration still happens directly between browsers; only you save to your Nextcloud.') }),
      el('div', { class: 'nc-row-buttons' }, test, signOut),
      result,
      privacyNote(),
    )
  }

  const signInView = (): HTMLElement => {
    const server = el('input', { class: 'field', type: 'url', placeholder: 'https://cloud.school.org', value: readLocal(SERVER_KEY) })
    server.setAttribute('aria-label', t('Nextcloud address'))
    const presets = schoolNextcloud(server)
    const user = el('input', { class: 'field', autocomplete: 'username' })
    const password = el('input', { class: 'field', type: 'password', autocomplete: 'off' })
    const result = el('div', { class: 'nc-result-area' })
    const busy = (on: boolean) => body.querySelectorAll<HTMLButtonElement>('.nc-btn').forEach((b) => (b.disabled = on))

    const finish = async (serverUrl: string, loginName: string, appPassword: string, viaLoginFlow: boolean, known?: { user: string; displayName?: string }) => {
      const who = known ?? (await nc.whoAmI(serverUrl, loginName, appPassword))
      const account: NcAccount = { id: nc.accountId(serverUrl, who.user), server: serverUrl, user: who.user, loginName, appPassword, displayName: who.displayName, viaLoginFlow, autosave: 0 }
      nc.saveAccount(account)
      writeLocal(SERVER_KEY, serverUrl)
      toast(t('Connected to Nextcloud'))
      render()
    }

    const loginFlow = async () => {
      let serverUrl: string
      try {
        serverUrl = nc.normalizeServer(server.value)
      } catch (err) {
        show(result, errorView(err))
        return
      }
      // Opened now, while the click still allows pop-ups; the address comes later.
      const win = window.open('', '_blank')
      busy(true)
      show(result, el('p', { class: 'hint', textContent: t('Connecting…') }))
      try {
        const flow = await nc.startLoginFlow(serverUrl)
        if (win) {
          win.opener = null
          win.location.href = flow.login
        }
        polling = new AbortController()
        const cancel = button(t('Cancel'), () => polling?.abort())
        const link = el('a', { href: flow.login, target: '_blank', rel: 'noopener', textContent: t('Open the Nextcloud login page') })
        show(
          result,
          el('div', { class: 'nc-result' }, el('p', { textContent: t('Log in to Nextcloud in the other tab and grant access. This window continues by itself.') }), el('p', {}, link), cancel),
        )
        cancel.disabled = false
        const { loginName, appPassword } = await nc.pollLoginFlow(serverUrl, flow, polling.signal)
        await finish(serverUrl, loginName, appPassword, true)
      } catch (err) {
        win?.close()
        if ((err as Error).name === 'AbortError') {
          show(result)
        } else if (err instanceof nc.NcError && err.kind === 'cors') {
          // Tell apart: no Nextcloud, WebDAV blocked, or only the login flow blocked.
          const d = await nc.diagnose(serverUrl)
          show(
          result,
            d.ok
              ? diagnosisView({ ok: false, kind: undefined, message: t('This Nextcloud allows file access from this site but not the login page. Use an app password below.') })
              : diagnosisView(d),
          )
        } else {
          show(result, errorView(err))
        }
      } finally {
        polling = null
        busy(false)
      }
    }

    const connect = async () => {
      busy(true)
      show(result, el('p', { class: 'hint', textContent: t('Testing…') }))
      try {
        const d = await nc.diagnose(server.value, user.value.trim(), password.value.trim())
        if (d.ok && d.server && d.user) await finish(d.server, user.value.trim(), password.value.trim(), false, { user: d.user, displayName: d.displayName })
        else show(result, diagnosisView(d))
      } catch (err) {
        show(result, errorView(err))
      } finally {
        busy(false)
      }
    }
    noSubmitOnEnter(server)
    noSubmitOnEnter(user, () => password.focus())
    noSubmitOnEnter(password, () => void connect())

    const offline = !online()
    return el(
      'div',
      { class: 'nc-signin' },
      offline ? diagnosisView({ ok: false, kind: 'offline', message: nc.errorMessage('offline') }) : null,
      el('p', { textContent: t('Open and save documents in your Nextcloud (for example your school’s). The browser talks directly to your Nextcloud.') }),
      presets.chooser,
      el('label', { class: 'field-label' }, t('Nextcloud address'), server, presets.note),
      el('div', { class: 'nc-flow' }, button(t('Log in with Nextcloud'), () => void loginFlow(), 'nc-btn primary', LogIn), el('span', { class: 'hint', textContent: t('Opens Nextcloud in a new tab, where you approve access.') })),
      el(
        'details',
        { class: 'nc-manual' },
        el('summary', { textContent: t('Or use an app password') }),
        appPasswordSteps(),
        el('div', { class: 'form grid2' }, el('label', { class: 'field-label' }, t('User name'), user), el('label', { class: 'field-label' }, t('App password'), password)),
        el('div', { class: 'nc-row-buttons' }, button(t('Connect'), () => void connect(), 'nc-btn primary')),
      ),
      result,
      privacyNote(),
    )
  }

  const render = () => {
    const account = nc.currentAccount()
    body.replaceChildren(account ? connectedView(account) : signInView())
  }
  render()
  await showDialog(t('Nextcloud'), body, [{ label: t('Close'), value: 'close', primary: true }], true, 'nextcloud')
  polling?.abort()
  return nc.currentAccount()
}

async function requireAccount(): Promise<NcAccount | undefined> {
  if (offlineToast()) return undefined
  return nc.currentAccount() ?? (await openAccountDialog())
}

// ---------- File browser ----------

interface BrowseSave {
  folder: string
  name: string
  format: ExportOption
  existing?: DavEntry
}

type SortKey = 'name' | 'size' | 'modified'

function entryIcon(entry: DavEntry): HTMLElement {
  if (entry.isDir) return el('span', { class: 'nc-icon folder' }, icon(Folder, 20))
  const app = appForName(entry.name)
  if (!app) return el('span', { class: 'nc-icon other' }, icon(FileIcon, 20))
  const badge = el('span', { class: 'nc-icon app', textContent: app.letter, title: app.name })
  badge.style.background = app.color
  return badge
}

function browseDialog(account: NcAccount, mode: 'open', options?: { folder?: string }): Promise<DavEntry | null>
function browseDialog(account: NcAccount, mode: 'save', options: { folder?: string; name: string; formats: ExportOption[]; format: string }): Promise<BrowseSave | null>
async function browseDialog(
  account: NcAccount,
  mode: 'open' | 'save',
  options: { folder?: string; name?: string; formats?: ExportOption[]; format?: string } = {},
): Promise<DavEntry | BrowseSave | null> {
  let folder = options.folder || readLocal(`${FOLDER_KEY}:${account.id}`) || '/'
  let entries: DavEntry[] = []
  let selected: DavEntry | null = null
  let sortKey: SortKey = 'name'
  let ascending = true
  let query = ''
  let loading = null as AbortController | null

  const crumbs = el('nav', { class: 'nc-crumbs' })
  crumbs.setAttribute('aria-label', t('Folder'))
  const search = el('input', { class: 'field nc-search', type: 'search', placeholder: t('Search in this folder') })
  search.setAttribute('aria-label', t('Search in this folder'))
  const list = el('div', { class: 'nc-list', role: 'listbox' })
  const message = el('div', { class: 'nc-message' })
  const head = el('div', { class: 'nc-head' })
  const nameInput = el('input', { class: 'field', value: options.name ?? '' })
  const formatSelect = el('select', { class: 'field' })
  for (const f of options.formats ?? []) formatSelect.append(el('option', { value: f.ext, textContent: f.label, selected: f.ext === options.format }))

  const sortButton = (key: SortKey, label: string) => {
    const b = el('button', { type: 'button', class: `nc-sort nc-col-${key}${sortKey === key ? ' active' : ''}`, textContent: label + (sortKey === key ? (ascending ? ' ▲' : ' ▼') : '') })
    b.addEventListener('click', () => {
      ascending = sortKey === key ? !ascending : key === 'name'
      sortKey = key
      renderList()
    })
    return b
  }

  const renderCrumbs = () => {
    const parts = folder.split('/').filter(Boolean)
    const home = el('button', { type: 'button', class: 'nc-crumb', title: t('All files') }, icon(House, 16))
    home.setAttribute('aria-label', t('All files'))
    home.addEventListener('click', () => void go('/'))
    crumbs.replaceChildren(
      home,
      ...parts.flatMap((part, i) => {
        const b = el('button', { type: 'button', class: 'nc-crumb', textContent: part })
        b.addEventListener('click', () => void go(`/${parts.slice(0, i + 1).join('/')}`))
        return [icon(ChevronRight, 14), b]
      }),
    )
  }

  const openable = (e: DavEntry) => e.isDir || !!appForName(e.name)

  const renderList = () => {
    head.replaceChildren(sortButton('name', t('Name')), sortButton('size', t('Size')), sortButton('modified', t('Modified')))
    const q = query.toLowerCase()
    const shown = entries
      .filter((e) => !q || e.name.toLowerCase().includes(q))
      .sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
        const order = sortKey === 'name' ? a.name.localeCompare(b.name, locale, { numeric: true, sensitivity: 'base' }) : sortKey === 'size' ? a.size - b.size : a.modified - b.modified
        return ascending ? order : -order
      })
    if (!shown.length) {
      list.replaceChildren(el('p', { class: 'empty', textContent: q ? t('No matching files.') : t('This folder is empty.') }))
      return
    }
    list.replaceChildren(
      ...shown.map((entry) => {
        const disabled = mode === 'open' && !openable(entry)
        const row = el(
          'button',
          { type: 'button', class: `nc-item${selected?.path === entry.path ? ' selected' : ''}${disabled ? ' unsupported' : ''}`, title: disabled ? t('This file type cannot be opened here') : entry.name },
          entryIcon(entry),
          el('span', { class: 'nc-name', textContent: entry.name }),
          el('span', { class: 'nc-col-size', textContent: entry.isDir ? '' : formatSize(entry.size) }),
          el('span', { class: 'nc-col-modified', textContent: formatDate(entry.modified), title: entry.modified ? new Date(entry.modified).toLocaleString(locale) : '' }),
        )
        row.setAttribute('role', 'option')
        row.setAttribute('aria-selected', String(selected?.path === entry.path))
        if (disabled) row.setAttribute('aria-disabled', 'true')
        row.addEventListener('click', () => {
          if (entry.isDir) return void go(entry.path)
          if (disabled) return
          selected = entry
          if (mode === 'save') {
            const ext = extOf(entry.name)
            if ((options.formats ?? []).some((f) => f.ext === ext)) formatSelect.value = ext
            nameInput.value = stripExt(entry.name)
          }
          renderList()
        })
        row.addEventListener('dblclick', () => {
          if (!entry.isDir && !disabled && mode === 'open') closeDialogOf(list, 'ok')
        })
        return row
      }),
    )
  }

  const go = async (path: string) => {
    loading?.abort()
    const controller = new AbortController()
    loading = controller
    folder = path
    selected = null
    query = ''
    search.value = ''
    renderCrumbs()
    message.replaceChildren()
    list.replaceChildren(el('p', { class: 'empty', textContent: t('Loading…') }))
    try {
      entries = await nc.listFolder(account, path, controller.signal)
      if (loading !== controller) return
      writeLocal(`${FOLDER_KEY}:${account.id}`, path)
      renderList()
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      if (err instanceof nc.NcError && err.kind === 'not-found' && path !== '/') return void go('/')
      entries = []
      list.replaceChildren()
      message.replaceChildren(errorView(err))
    }
  }

  search.addEventListener('input', () => {
    query = search.value.trim()
    renderList()
  })
  noSubmitOnEnter(search)
  noSubmitOnEnter(nameInput, () => closeDialogOf(list, 'ok'))

  const newFolder = button(t('New folder'), async () => {
    const name = prompt(t('Folder name'), '')?.trim()
    if (!name) return
    if (/[/\\]/.test(name)) return toast(t('A name cannot contain / or \\'))
    try {
      await nc.createFolder(account, nc.joinPath(folder, name))
      await go(nc.joinPath(folder, name))
    } catch (err) {
      toast((err as Error).message)
    }
  }, 'nc-btn', FolderPlus)
  const refresh = button(t('Refresh'), () => void go(folder), 'nc-btn icon-only', RefreshCw)

  const body = el(
    'div',
    { class: `nc-browser nc-${mode}` },
    el('div', { class: 'nc-toolbar' }, crumbs, el('span', { class: 'nc-spacer' }), mode === 'save' ? newFolder : null, refresh),
    search,
    head,
    list,
    message,
    mode === 'save'
      ? el('div', { class: 'nc-save-row' }, el('label', { class: 'field-label nc-file-name' }, t('File name'), nameInput), el('label', { class: 'field-label' }, t('Format'), formatSelect))
      : null,
    el('p', { class: 'hint nc-account-hint', textContent: t('Nextcloud: {user} on {server}', { user: account.displayName || account.user, server: account.server.replace(/^https?:\/\//, '') }) }),
  )

  const shown = showDialog(mode === 'open' ? t('Open from Nextcloud') : t('Save to Nextcloud'), body, [
    { label: t('Cancel'), value: 'cancel' },
    { label: mode === 'open' ? t('Open') : t('Save'), value: 'ok', primary: true },
  ], true, 'nextcloud')
  const dialog = body.closest('dialog')!
  dialog.classList.add('nc-dialog')
  // Validate before the dialog closes with "Open" / "Save".
  body.closest('form')!.addEventListener('submit', (e) => {
    const submitter = (e as SubmitEvent).submitter as HTMLButtonElement | null
    if (submitter && submitter.value !== 'ok') return
    if (mode === 'open' && !selected) {
      e.preventDefault()
      toast(t('Choose a file to open'))
    } else if (mode === 'save' && !nameInput.value.trim()) {
      e.preventDefault()
      nameInput.focus()
    } else if (mode === 'save' && /[/\\]/.test(nameInput.value)) {
      e.preventDefault()
      toast(t('A name cannot contain / or \\'))
    }
  })
  if (mode === 'save') setTimeout(() => nameInput.focus())
  void go(folder)
  const result = await shown
  loading?.abort()
  if (result !== 'ok') return null
  if (mode === 'open') return selected
  const format = (options.formats ?? []).find((f) => f.ext === formatSelect.value) ?? options.formats![0]
  let name = nameInput.value.trim()
  if (extOf(name) !== format.ext) name = `${name}.${format.ext}`
  const existing = entries.find((e) => !e.isDir && e.name.toLowerCase() === name.toLowerCase())
  return { folder, name: existing?.name ?? name, format, existing }
}

// ---------- Open ----------

export async function openFromNextcloud(): Promise<void> {
  const account = await requireAccount()
  if (!account) return
  const entry = await browseDialog(account, 'open')
  if (!entry) return
  try {
    toast(t('Opening…'))
    const { blob, etag } = await nc.download(account, entry.path)
    const file = new File([blob], entry.name, { type: blob.type || entry.contentType })
    const target = await appForFile(file)
    if (!target) return toast(t('This file type is not supported yet'))
    const path = await target.module.importFile(file)
    const id = new URLSearchParams(path.slice(path.indexOf('#') + 1)).get('doc')
    const ext = EXT_ALIASES[extOf(entry.name)] ?? extOf(entry.name)
    if (id) {
      store.setRemoteLink(id, {
        account: account.id,
        path: entry.path,
        // Formats the app cannot write (e.g. .rtf, .doc) are saved with "Save to Nextcloud as…".
        format: SAVE_EXTS[target.info.type].includes(ext) ? ext : '',
        etag: etag ?? entry.etag,
        fileId: entry.fileId,
      })
    }
    location.href = path
  } catch (err) {
    showError(t('Could not open the file'), err)
  }
}

function showError(title: string, err: unknown): void {
  void showDialog(title, errorView(err), [{ label: t('Close'), value: 'ok', primary: true }], true)
}

// ---------- Save ----------

const vectorOf = (doc: Y.Doc) => {
  const bytes = Y.encodeStateVector(doc)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

type SaveState = 'saved' | 'opened' | 'dirty' | 'saving' | 'conflict' | 'error' | 'offline'

interface Controller {
  session: Session
  link: () => RemoteLink | undefined
  saving: boolean
  state: SaveState
  error?: string
  lastAttempt: number
  render: () => void
}

const controllers = new WeakMap<Session, Controller>()

function controllerFor(session: Session): Controller {
  let c = controllers.get(session)
  if (!c) {
    c = { session, link: () => store.getDoc(session.docId)?.remote, saving: false, state: 'saved', lastAttempt: 0, render: () => {} }
    controllers.set(session, c)
  }
  return c
}

const isDirty = (session: Session, link: RemoteLink | undefined) => !!link && link.savedVector !== vectorOf(session.doc)

function exportOptions(session: Session): ExportOption[] {
  return session.hooks.exportFormats?.() ?? []
}

// Uploads, asking what to do when the file changed in Nextcloud meanwhile.
// Returns the upload result, or null when the user cancelled / chose a copy.
async function uploadChecked(session: Session, account: NcAccount, path: string, blob: Blob, etag: string | undefined, auto: boolean): Promise<{ etag?: string; fileId?: string } | 'copy' | null> {
  try {
    return await nc.upload(account, path, blob, etag ? { ifMatch: etag } : { createOnly: true })
  } catch (err) {
    if (!(err instanceof nc.NcError) || (err.kind !== 'conflict' && err.kind !== 'exists')) throw err
    if (auto) throw err
    if (err.kind === 'exists') {
      if (!(await confirmDialog(t('Replace'), t('“{name}” already exists in this folder. Replace it?', { name: nc.baseName(path) }), { confirmLabel: t('Replace'), danger: true }))) return null
      return nc.upload(account, path, blob)
    }
    const current = await nc.stat(account, path).catch(() => null)
    const choice = await conflictDialog(nc.baseName(path), !current)
    if (choice === 'overwrite') return nc.upload(account, path, blob)
    if (choice === 'copy') return 'copy'
    return null
  }
}

async function conflictDialog(name: string, deleted: boolean): Promise<string> {
  const body = el(
    'div',
    { class: 'nc-conflict' },
    el('p', {
      textContent: deleted
        ? t('“{name}” was deleted or moved in Nextcloud after you opened or last saved it.', { name })
        : t('“{name}” was changed in Nextcloud after you opened or last saved it (in another app, or by someone else).', { name }),
    }),
    el('p', {
      class: 'hint',
      textContent: deleted
        ? t('“Save again” creates the file again in the same place. “Save as a copy” lets you choose another name or folder.')
        : t('“Overwrite” replaces the version in Nextcloud with this document, and their changes are lost (Nextcloud keeps older versions in its version history). “Save as a copy” keeps both.'),
    }),
  )
  return showDialog(deleted ? t('The file is no longer in Nextcloud') : t('The file was changed in Nextcloud'), body, [
    { label: t('Cancel'), value: 'cancel' },
    { label: deleted ? t('Save again') : t('Overwrite'), value: 'overwrite' },
    { label: t('Save as a copy'), value: 'copy', primary: true },
  ])
}

// "Save to Nextcloud" (Ctrl+S): updates the linked file; without a link, asks where.
export async function saveToNextcloud(session: Session, auto = false): Promise<boolean> {
  const c = controllerFor(session)
  const link = c.link()
  if (!link || !link.format) {
    if (auto) return false
    return saveToNextcloudAs(session)
  }
  if (!online()) {
    c.state = 'offline'
    c.render()
    if (!auto) toast(t('You are offline. The document is saved in this browser; save to Nextcloud when you are connected again.'))
    return false
  }
  const account = nc.getAccount(link.account)
  if (!account) {
    if (auto) return false
    toast(t('Sign in to Nextcloud again to save this document there.'))
    await openAccountDialog()
    return false
  }
  const option = exportOptions(session).find((f) => f.ext === link.format)
  if (!option) return auto ? false : saveToNextcloudAs(session)
  if (c.saving) return false
  c.saving = true
  c.lastAttempt = Date.now()
  c.state = 'saving'
  c.render()
  try {
    const vector = vectorOf(session.doc)
    const blob = await option.build()
    const result = await uploadChecked(session, account, link.path, blob, link.etag, auto)
    if (result === 'copy') {
      c.saving = false
      return saveToNextcloudAs(session, true)
    }
    if (!result) {
      c.state = 'dirty'
      return false
    }
    store.setRemoteLink(session.docId, { ...link, etag: result.etag, fileId: result.fileId ?? link.fileId, savedAt: Date.now(), savedVector: vector })
    c.state = 'saved'
    if (!auto) toast(t('Saved to Nextcloud'))
    return true
  } catch (err) {
    const e = err instanceof nc.NcError ? err : new nc.NcError('server', (err as Error).message)
    c.state = e.kind === 'conflict' || e.kind === 'exists' ? 'conflict' : e.kind === 'offline' ? 'offline' : 'error'
    c.error = e.message
    if (!auto) showError(t('Could not save to Nextcloud'), e)
    return false
  } finally {
    c.saving = false
    c.render()
  }
}

// "Save to Nextcloud as…": folder, name and format; links the document to the new file.
export async function saveToNextcloudAs(session: Session, asCopy = false): Promise<boolean> {
  const account = await requireAccount()
  if (!account) return false
  const formats = exportOptions(session)
  if (!formats.length) {
    toast(t('This document cannot be saved to Nextcloud yet'))
    return false
  }
  const c = controllerFor(session)
  const link = c.link()
  const title = String(session.doc.getMap('meta').get('title') || '').trim() || t('Untitled')
  const sameAccount = link?.account === account.id
  const lastFormat = readLocal(`${FORMAT_KEY}:${session.type}`)
  const format = (link?.format && formats.some((f) => f.ext === link.format) ? link.format : '') || (formats.some((f) => f.ext === lastFormat) ? lastFormat : formats[0].ext)
  let name = sameAccount && link ? stripExt(nc.baseName(link.path)) : safeFileName(title)
  if (asCopy) name = t('{name} (copy)', { name })
  const choice = await browseDialog(account, 'save', { folder: sameAccount && link ? nc.parentPath(link.path) : undefined, name, formats, format })
  if (!choice) return false
  writeLocal(`${FORMAT_KEY}:${session.type}`, choice.format.ext)
  const path = nc.joinPath(choice.folder, choice.name)
  if (choice.existing && !(sameAccount && link?.path === path) && !(await confirmDialog(t('Replace'), t('“{name}” already exists in this folder. Replace it?', { name: choice.name }), { confirmLabel: t('Replace'), danger: true }))) return false
  c.saving = true
  c.state = 'saving'
  c.render()
  try {
    toast(t('Saving to Nextcloud…'))
    const vector = vectorOf(session.doc)
    const blob = await choice.format.build()
    const result = await uploadChecked(session, account, path, blob, choice.existing?.etag, false)
    if (result === 'copy') {
      c.saving = false
      return saveToNextcloudAs(session, true)
    }
    if (!result) {
      c.state = isDirty(session, link) ? 'dirty' : 'saved'
      return false
    }
    store.setRemoteLink(session.docId, { account: account.id, path, format: choice.format.ext, etag: result.etag, fileId: result.fileId, savedAt: Date.now(), savedVector: vector })
    c.state = 'saved'
    toast(t('Saved to Nextcloud: {path}', { path }))
    return true
  } catch (err) {
    c.state = link ? 'error' : 'saved'
    showError(t('Could not save to Nextcloud'), err)
    return false
  } finally {
    c.saving = false
    c.render()
  }
}

async function unlink(session: Session): Promise<void> {
  if (!(await confirmDialog(t('Stop saving to this file'), t('Stop saving this document to its Nextcloud file? The file in Nextcloud is not changed.')))) return
  store.setRemoteLink(session.docId, undefined)
  controllerFor(session).render()
}

// ---------- Menus ----------

export function nextcloudMenuItems(session: Session): MenuEntry[] {
  const linked = () => !!store.getDoc(session.docId)?.remote
  return [
    { label: t('Open from Nextcloud…'), enabled: online, run: () => void openFromNextcloud() },
    { label: t('Save to Nextcloud'), shortcut: isMac ? '⌘S' : shortcutLabel('Ctrl+S'), enabled: () => online() && linked(), run: () => void saveToNextcloud(session) },
    { label: t('Save to Nextcloud as…'), enabled: online, run: () => void saveToNextcloudAs(session) },
    { label: t('Nextcloud account…'), run: () => void openAccountDialog() },
  ]
}

// For menus that cannot disable items (the drawing app's menu).
export const nextcloudActions = (session: Session) => ({
  open: () => void openFromNextcloud(),
  save: () => (offlineToast() ? undefined : void saveToNextcloud(session)),
  saveAs: () => (offlineToast() ? undefined : void saveToNextcloudAs(session)),
  account: () => void openAccountDialog(),
})

// ---------- Status in the app bar, Ctrl+S, autosave ----------

export function setupNextcloud(session: Session): void {
  const c = controllerFor(session)
  const status = el('button', { type: 'button', class: 'nc-state', hidden: true })
  // In the title row, next to the save state (which the shared status bar may move).
  ;(document.querySelector('.save-indicator') ?? document.getElementById('save-state'))?.after(status)

  let dirty = isDirty(session, c.link())
  const link = c.link()
  // Just opened from Nextcloud: the document equals the file once the app has
  // finished setting it up (it may write defaults on first load).
  if (link && !link.savedVector) {
    dirty = false
    let timer = 0
    const started = Date.now()
    const settle = () => {
      clearTimeout(timer)
      timer = window.setTimeout(
        () => {
          session.doc.off('update', settle)
          const current = c.link()
          if (current && !current.savedVector) store.setRemoteLink(session.docId, { ...current, savedVector: vectorOf(session.doc) })
          dirty = false
          c.render()
        },
        Date.now() - started > 8000 ? 0 : 1500,
      )
    }
    session.doc.on('update', settle)
    settle()
  }
  session.doc.on('update', () => {
    const current = c.link()
    if (!current?.savedVector) return
    const was = dirty
    dirty = isDirty(session, current)
    if (dirty !== was || c.state === 'saved' || c.state === 'opened') c.render()
  })

  c.render = () => {
    const current = c.link()
    if (!current) {
      status.hidden = true
      return
    }
    if (!c.saving) {
      dirty = !!current.savedVector && isDirty(session, current)
      if (!online()) c.state = 'offline'
      else if (c.state !== 'conflict' && c.state !== 'error') c.state = dirty ? 'dirty' : current.savedAt ? 'saved' : 'opened'
      else if (!dirty) c.state = current.savedAt ? 'saved' : 'opened'
    }
    const account = nc.getAccount(current.account)
    const labels: Record<SaveState, [Parameters<typeof icon>[0], string]> = {
      saved: [CloudCheck, t('Saved to Nextcloud at {time}', { time: formatTime(current.savedAt ?? Date.now()) })],
      opened: [CloudCheck, t('Opened from Nextcloud')],
      dirty: [Cloud, t('Changes not saved to Nextcloud')],
      saving: [Cloud, t('Saving to Nextcloud…')],
      conflict: [TriangleAlert, t('Changed in Nextcloud by someone else')],
      error: [TriangleAlert, t('Could not save to Nextcloud')],
      offline: [CloudOff, t('Offline: Nextcloud unavailable')],
    }
    const [iconNode, label] = labels[c.state]
    status.hidden = false
    status.className = `nc-state ${c.state}`
    status.replaceChildren(icon(iconNode, 16), el('span', { class: 'nc-state-label', textContent: label }))
    status.title = [
      `${nc.baseName(current.path)} · ${account ? account.server.replace(/^https?:\/\//, '') : t('Not signed in')}`,
      c.state === 'error' && c.error ? c.error : '',
      current.format ? t('{key} saves to this file', { key: isMac ? '⌘S' : shortcutLabel('Ctrl+S') }) : '',
    ]
      .filter(Boolean)
      .join('\n')
    status.setAttribute('aria-label', `${label}. ${status.title}`)
  }

  status.addEventListener('click', () => {
    const current = c.link()
    const account = current && nc.getAccount(current.account)
    const rect = status.getBoundingClientRect()
    showContextMenu(rect.left, rect.bottom + 4, [
      { label: t('Save to Nextcloud'), shortcut: isMac ? '⌘S' : shortcutLabel('Ctrl+S'), enabled: () => online() && !!current?.format, run: () => void saveToNextcloud(session) },
      { label: t('Save to Nextcloud as…'), enabled: online, run: () => void saveToNextcloudAs(session) },
      { label: t('Show in Nextcloud'), enabled: () => !!account && online(), run: () => account && current && window.open(nc.webUrl(account, current.path, current.fileId), '_blank', 'noopener') },
      '-',
      { label: t('Stop saving to this file'), run: () => void unlink(session) },
    ])
  })

  // Ctrl+S saves to the linked file (before the apps' own handlers).
  window.addEventListener(
    'keydown',
    (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 's') return
      if (!c.link()) return
      e.preventDefault()
      e.stopImmediatePropagation()
      void saveToNextcloud(session)
    },
    true,
  )

  // Autosave (account setting), only while linked, changed and online.
  window.setInterval(() => {
    const current = c.link()
    const account = current && nc.getAccount(current.account)
    const minutes = account?.autosave ?? 0
    if (!current || !minutes || !current.format || !online() || c.saving || c.state === 'conflict') return
    if (!isDirty(session, current) || Date.now() - c.lastAttempt < minutes * 60_000) return
    void saveToNextcloud(session, true)
  }, 20_000)

  const onConnectivity = () => {
    if (online() && c.state === 'offline') c.state = 'dirty'
    c.render()
  }
  window.addEventListener('online', onConnectivity)
  window.addEventListener('offline', onConnectivity)
  window.addEventListener('storage', () => c.render())
  c.render()
}

// ---------- Hand in to a share link ----------

// Uploads the hand-in ZIP to a teacher's public share link (e.g. "File drop").
export async function handInToShare(session: Session, file: { name: string; blob: Blob }): Promise<void> {
  if (offlineToast()) return
  const shareKey = `${SHARE_KEY}:${session.docId}`
  const url = el('input', { class: 'field', type: 'url', placeholder: 'https://cloud.school.org/s/AbC123', value: readLocal(shareKey) || readLocal(SHARE_KEY) })
  const password = el('input', { class: 'field', type: 'password', autocomplete: 'off' })
  const result = el('div')
  const upload = button(t('Upload'), () => void run(), 'nc-btn primary', CloudUpload)
  let done = false
  const run = async () => {
    if (done) return closeDialogOf(result, 'ok')
    upload.disabled = true
    show(result, el('p', { class: 'hint', textContent: t('Uploading…') }))
    try {
      const name = await nc.uploadToShare(url.value, password.value, file.name, file.blob)
      writeLocal(shareKey, url.value.trim())
      writeLocal(SHARE_KEY, url.value.trim())
      done = true
      upload.replaceChildren(el('span', { textContent: t('Done') }))
      show(result, diagnosisView({ ok: true, message: t('“{name}” was uploaded to the shared folder.', { name }) }))
    } catch (err) {
      show(result, errorView(err))
      if (err instanceof nc.NcError && err.kind === 'share-password') password.focus()
    } finally {
      upload.disabled = false
    }
  }
  noSubmitOnEnter(url, () => password.focus())
  noSubmitOnEnter(password, () => void run())
  const body = el(
    'div',
    { class: 'nc-handin' },
    el('p', { textContent: t('Paste the upload link your teacher gave you (a Nextcloud share link). You do not need a Nextcloud account.') }),
    el('label', { class: 'field-label' }, t('Share link'), url),
    el('label', { class: 'field-label' }, t('Password (only if the link has one)'), password),
    el('p', { class: 'hint', textContent: t('File: {name}', { name: file.name }) }),
    el('div', { class: 'nc-row-buttons' }, upload),
    result,
  )
  await showDialog(t('Upload to a Nextcloud share link'), body, [{ label: t('Close'), value: 'ok' }], true, 'handin')
}
