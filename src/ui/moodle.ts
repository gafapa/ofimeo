// Moodle in the interface (docs/moodle.md, protocol in core/moodle.ts):
// "Connect to Moodle" (home and File menu), the home panel "Moodle tasks"
// (informational: assignments, due dates, status, grades and feedback) and
// "Hand in to Moodle…" from every app's Hand in.

import { BookOpenCheck, ExternalLink, GraduationCap, Paperclip, RefreshCw } from 'lucide'
import { appForFile } from '../apps/registry'
import { safeFileName } from '../core/handin'
import { locale, t, tn } from '../core/i18n'
import * as md from '../core/moodle'
import type { MoodleAccount, MoodleTask } from '../core/moodle'
import type { ExportOption, Session } from '../core/session'
import { confirmDialog, el, icon, showDialog, toast } from './widgets'
import { lockedNote } from './school'
import './moodle.css'

const attrs = <T extends HTMLElement>(node: T, values: Record<string, string>): T => {
  for (const [k, v] of Object.entries(values)) node.setAttribute(k, v)
  return node
}

// ---------- Messages ----------

function sizeText(bytes: number): string {
  if (bytes >= 1 << 20) return `${(bytes / (1 << 20)).toLocaleString(locale, { maximumFractionDigits: 1 })} MB`
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString(locale)} KB`
}

export function errorText(err: unknown, task?: MoodleTask): string {
  if (!(err instanceof md.MoodleError)) return t('Something went wrong: {message}', { message: (err as Error)?.message ?? String(err) })
  switch (err.code) {
    case 'address':
      return md.schoolMoodle().locked ? t('Only your school’s Moodle can be used.') : t('Enter the address of your Moodle, for example https://moodle.school.org')
    case 'offline':
      return t('You are offline. Connect to the Internet and try again.')
    case 'unreachable':
      return t('Could not reach Moodle from this browser. Check the address. If it is right, your Moodle does not allow access from web apps: ask your school to turn on Moodle forwarding in its Ofimeo Relay (Help → Moodle).')
    case 'relay-site':
      return t('Your school relay forwards to another Moodle, so it cannot be used for this one.')
    case 'relay-declined':
      return t('Not connected: the relay was not used.')
    case 'relay':
      return t('The school relay could not reach Moodle. Try again later.')
    case 'not-moodle':
      return t('This address does not answer like a Moodle site. Check it, or ask your school whether the Moodle app is allowed (mobile web services).')
    case 'invalidlogin':
      return t('Wrong username or password.')
    case 'sso':
      return ssoText()
    case 'webservices':
      return t('This Moodle does not allow the Moodle app (mobile web services are turned off). Ask your school’s Moodle administrator (Help → Moodle).')
    case 'token':
      return t('Your Moodle connection has expired. Connect again.')
    case 'too-large': {
      const max = task ? md.maxBytes(task) : undefined
      return max ? t('The file is too large for this assignment (maximum {size}).', { size: sizeText(max) }) : t('The file is too large for this assignment.')
    }
    case 'filetype': {
      const types = task ? md.acceptedExtensions(task) : null
      return types ? t('This assignment does not accept this type of file. Accepted: {types}.', { types: types.map((x) => `.${x}`).join(', ') }) : t('This assignment does not accept this type of file.')
    }
    case 'closed':
      return t('This assignment is not accepting submissions now.')
    default:
      return err.message === 'statement' ? t('Tick the submission statement first.') : t('Moodle says: {message}', { message: err.message })
  }
}

const ssoText = () =>
  t('Your Moodle signs in through a web page (single sign-on, for example with Google, Microsoft or your school account). Ofimeo cannot use that kind of sign-in yet: use Moodle in the browser, and hand in the file you download with Hand in.')

// Asked before a relay the school did not set gets Moodle traffic.
const confirmRelay: md.ConfirmRelay = (address) =>
  confirmDialog(
    t('Use this relay for Moodle?'),
    t('Your Moodle cannot be reached directly from this browser. The relay {address} can pass your Moodle sign-in and work on to it. It sees them in transit: use it only if it is your school’s own relay.', { address }),
    { confirmLabel: t('Use this relay') },
  )

// ---------- Dates ----------

const dateFormat = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const fmt = (seconds: number) => dateFormat.format(new Date(seconds * 1000))

function relative(ms: number): string {
  const minutes = Math.round((Date.now() - ms) / 60_000)
  if (minutes < 1) return t('just now')
  if (minutes < 60) return tn(minutes, '{n} minute ago', '{n} minutes ago')
  const hours = Math.round(minutes / 60)
  if (hours < 24) return tn(hours, '{n} hour ago', '{n} hours ago')
  return new Date(ms).toLocaleString(locale)
}

type Chip = { text: string; kind: 'ok' | 'warn' | 'danger' | 'info' }

// Status chips of a task: handed in / graded / draft / due / overdue / closed.
function chips(task: MoodleTask): Chip[] {
  const out: Chip[] = []
  const now = Date.now() / 1000
  const due = task.extensionDue || task.due
  if (task.graded) out.push({ text: task.grade ? t('Graded: {grade}', { grade: plain(task.grade) }) : t('Graded'), kind: 'ok' })
  if (task.status === 'submitted') out.push({ text: t('Handed in'), kind: 'ok' })
  if (task.status === 'draft') out.push({ text: t('Draft (not handed in)'), kind: 'warn' })
  if (task.status === 'reopened') out.push({ text: t('Reopened'), kind: 'warn' })
  if (!md.taskDone(task)) {
    const problem = md.handInProblem(task)
    if (problem === 'not-open') out.push({ text: t('Opens {date}', { date: fmt(task.allowFrom) }), kind: 'info' })
    else if (problem === 'closed') out.push({ text: t('Closed'), kind: 'danger' })
    else if (due && now > due) out.push({ text: t('Overdue since {date}', { date: fmt(due) }), kind: 'danger' })
    else if (due) out.push({ text: t('Due {date}', { date: fmt(due) }), kind: due - now < 2 * 86400 ? 'warn' : 'info' })
    else out.push({ text: t('No due date'), kind: 'info' })
  }
  return out
}

// ---------- HTML from Moodle ----------

const ALLOWED = new Set(['p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'sub', 'sup', 'ul', 'ol', 'li', 'a', 'span', 'div', 'blockquote', 'pre', 'code', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'dl', 'dt', 'dd'])
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'select', 'textarea', 'link', 'meta', 'svg', 'math', 'video', 'audio', 'template', 'noscript', 'title', 'head'])

// Rebuilds the HTML with a few harmless elements and no attributes but
// http(s) links and images (Moodle files get the token); headings become h4.
export function sanitizeHtml(html: string): DocumentFragment {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const out = document.createDocumentFragment()
  const walk = (from: Node, to: Node) => {
    for (const node of from.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        to.appendChild(document.createTextNode(node.textContent ?? ''))
        continue
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue
      const tag = (node as Element).tagName.toLowerCase()
      if (DROP.has(tag)) continue
      if (!ALLOWED.has(tag)) {
        walk(node, to)
        continue
      }
      const name = /^h[1-6]$/.test(tag) ? 'h4' : tag
      const copy = document.createElement(name)
      const src = node as Element
      if (tag === 'a') {
        const href = src.getAttribute('href') ?? ''
        if (/^https?:\/\//i.test(href)) {
          copy.setAttribute('href', /\/(webservice\/)?pluginfile\.php\//.test(href) ? md.fileLink(href.replace('/pluginfile.php/', '/webservice/pluginfile.php/').replace('/webservice/webservice/', '/webservice/')) : href)
          copy.setAttribute('target', '_blank')
          copy.setAttribute('rel', 'noopener noreferrer')
        }
      } else if (tag === 'img') {
        const url = src.getAttribute('src') ?? ''
        if (!/^https?:\/\//i.test(url)) continue
        copy.setAttribute('src', /\/webservice\/pluginfile\.php\//.test(url) ? md.fileLink(url) : url)
        copy.setAttribute('alt', src.getAttribute('alt') ?? '')
        copy.setAttribute('loading', 'lazy')
        copy.setAttribute('referrerpolicy', 'no-referrer')
      } else if ((tag === 'td' || tag === 'th') && src.getAttribute('colspan')) {
        const span = Number(src.getAttribute('colspan'))
        if (span > 1 && span < 50) copy.setAttribute('colspan', String(span))
      }
      to.appendChild(copy)
      walk(node, copy)
    }
  }
  walk(doc.body, out)
  return out
}

// Text only (grades come formatted as HTML, e.g. "8,00&nbsp;/&nbsp;10,00").
function plain(html: string): string {
  return (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

// ---------- Connect ----------

// "Connect to Moodle" / connected account. Resolves with the account when one is connected at the end.
export async function openMoodleDialog(): Promise<MoodleAccount | null> {
  const body = el('div', { class: 'md-account' })
  const render = () => body.replaceChildren(md.loadMoodleAccount() ? connectedView(md.loadMoodleAccount()!) : signInView())

  const connectedView = (account: MoodleAccount): HTMLElement => {
    const disconnect = el('button', { type: 'button', class: 'md-btn danger', textContent: t('Disconnect') })
    disconnect.addEventListener('click', async () => {
      if (!(await confirmDialog(t('Disconnect from Moodle'), t('Forget the Moodle connection in this browser? Your task list is removed from this browser too. Nothing changes in Moodle.'), { confirmLabel: t('Disconnect') }))) return
      md.disconnect()
      toast(t('Disconnected from Moodle'))
      render()
    })
    return el(
      'div',
      {},
      el(
        'div',
        { class: 'md-who' },
        icon(GraduationCap, 28),
        el('div', {}, el('strong', { textContent: account.fullName }), el('span', { textContent: account.siteName }), el('a', { href: account.site, target: '_blank', rel: 'noopener noreferrer', textContent: account.site })),
      ),
      el('p', { class: 'hint', textContent: account.transport === 'relay' ? t('Connected through your school relay.') : t('Connected directly to Moodle.') }),
      el('div', { class: 'md-row-buttons' }, disconnect),
      privacyNote(),
    )
  }

  const signInView = (): HTMLElement => {
    const school = md.schoolMoodle()
    const lastSite = md.readLocal('words-online:moodle-site') ?? ''
    const site = el('input', { class: 'field', type: 'url', placeholder: 'https://moodle.school.org', value: school.url ?? lastSite })
    site.readOnly = school.locked
    const user = el('input', { class: 'field', autocomplete: 'username', autocapitalize: 'none', spellcheck: false })
    const password = el('input', { class: 'field', type: 'password', autocomplete: 'current-password' })
    const status = attrs(el('div', { class: 'md-status' }), { role: 'status', 'aria-live': 'polite' })
    const ssoNote = el('p', { class: 'md-sso', hidden: true, textContent: ssoText() })
    const connect = el('button', { type: 'submit', class: 'md-btn primary', textContent: t('Connect') })
    const form = el(
      'form',
      { class: 'md-signin' },
      el('label', { class: 'field-label' }, t('Moodle address'), site, school.locked ? lockedNote() : null),
      ssoNote,
      el('label', { class: 'field-label' }, t('Username'), user),
      el('label', { class: 'field-label' }, t('Password'), password),
      el('p', { class: 'hint', textContent: t('Your password is sent only to Moodle, once, to get a key for this browser. It is not saved.') }),
      el('div', { class: 'md-row-buttons' }, connect),
      status,
    )
    let checked = ''
    const checkSso = async () => {
      const url = md.normalizeSite(site.value)
      if (!url || url === checked || !navigator.onLine) return null
      checked = url
      const config = await md.publicConfig(url)
      if (checked !== url) return null
      ssoNote.hidden = !md.usesSso(config)
      return config
    }
    site.addEventListener('change', () => void checkSso())
    if (site.value) void checkSso()
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (!user.value.trim() || !password.value) {
        status.textContent = t('Enter your Moodle username and password.')
        ;(user.value.trim() ? password : user).focus()
        return
      }
      connect.disabled = true
      status.textContent = t('Connecting…')
      try {
        const account = await md.connect(site.value, user.value, password.value, { confirmRelay })
        md.writeLocal('words-online:moodle-site', account.site)
        password.value = ''
        toast(t('Connected to Moodle as {name}', { name: account.fullName }))
        render()
        void md.refreshTasks({ confirmRelay }).catch(() => {})
      } catch (err) {
        let text = errorText(err)
        if (err instanceof md.MoodleError && err.code === 'invalidlogin') {
          const config = await checkSso().catch(() => null)
          if (md.usesSso(config) || !ssoNote.hidden) text += ` ${ssoText()}`
          else if (config?.identityproviders?.length) text += ` ${t('If you sign in to Moodle with {providers}, that sign-in cannot be used here yet.', { providers: config.identityproviders.map((p) => p.name).join(', ') })}`
        }
        status.replaceChildren(el('p', { class: 'md-error', textContent: text }))
      } finally {
        connect.disabled = false
        password.value = ''
      }
    })
    return form
  }

  render()
  await showDialog(t('Moodle'), body, [{ label: t('Close'), value: 'ok' }], false, 'moodle')
  return md.loadMoodleAccount()
}

function privacyNote(): HTMLElement {
  return el('p', {
    class: 'hint md-privacy',
    textContent: t('Only a Moodle key and your name are kept in this browser; “Disconnect” removes them. Your Moodle work goes only to your Moodle (or through your school relay), never to the people you share documents with.'),
  })
}

// ---------- Home: button and task panel ----------

export function moodleButton(): HTMLButtonElement {
  const button = el('button', { type: 'button', class: 'home-cloud md-home-button', title: t('Moodle') }, icon(GraduationCap, 18), el('span', { class: 'btn-label', textContent: 'Moodle' }))
  button.setAttribute('aria-label', t('Moodle'))
  button.addEventListener('click', () => void openMoodleDialog())
  return button
}

// Shown when this browser is connected, or the school configured a Moodle.
export function moodleTasksSection(): HTMLElement {
  const section = attrs(el('section', { class: 'home-moodle' }), { 'aria-labelledby': 'md-tasks-title' })
  const inner = el('div', { class: 'home-inner' })
  section.append(inner)
  let busy = false
  let error = ''

  const refresh = async (quiet = false) => {
    if (busy || !md.hasMoodleAccount()) return
    busy = true
    error = ''
    render()
    try {
      await md.refreshTasks({ confirmRelay })
    } catch (err) {
      error = errorText(err)
      if (!quiet) toast(error)
    } finally {
      busy = false
      render()
    }
  }

  const render = () => {
    const account = md.loadMoodleAccount()
    section.hidden = !account && !md.schoolMoodle().url
    if (section.hidden) return
    const title = el('h2', { id: 'md-tasks-title', textContent: t('Moodle tasks') })
    if (!account) {
      const connect = el('button', { type: 'button', class: 'md-btn primary' }, icon(GraduationCap, 16), el('span', { textContent: t('Connect to Moodle') }))
      connect.addEventListener('click', () => void openMoodleDialog())
      inner.replaceChildren(el('div', { class: 'home-section-title' }, title), el('div', { class: 'md-empty' }, el('p', { textContent: t('Connect to your school’s Moodle to see your assignments here and hand in your work from Ofimeo.') }), connect))
      return
    }
    const cache = md.loadTaskCache()
    const refreshButton = el('button', { type: 'button', class: 'md-btn', disabled: busy || !navigator.onLine }, icon(RefreshCw, 16), el('span', { textContent: busy ? t('Updating…') : t('Refresh') }))
    refreshButton.addEventListener('click', () => void refresh())
    const accountButton = el('button', { type: 'button', class: 'md-btn', textContent: account.fullName, title: t('Moodle account') })
    accountButton.addEventListener('click', () => void openMoodleDialog().then(render))
    const updated = el('span', { class: 'md-updated' }, cache ? t('Last updated {when}', { when: relative(cache.updated) }) : '', !navigator.onLine ? ` · ${t('Offline')}` : '')
    const head = el('div', { class: 'home-section-title' }, title, el('span', { class: 'md-head-tools' }, updated, refreshButton, accountButton))
    const children: HTMLElement[] = [head]
    if (error) children.push(el('p', { class: 'md-error', role: 'alert', textContent: error }))
    if (!cache) children.push(el('p', { class: 'hint', textContent: busy ? t('Loading your assignments…') : t('No task list yet. Press Refresh.') }))
    else if (!cache.tasks.length) children.push(el('p', { class: 'hint', textContent: t('You have no assignments in Moodle.') }))
    else children.push(taskList(cache.tasks))
    inner.replaceChildren(...children)
  }

  md.onMoodleChange(render)
  window.addEventListener('online', render)
  window.addEventListener('offline', render)
  render()
  // Fresh list on open when the saved one is older than 10 minutes.
  const cache = md.loadTaskCache()
  if (md.hasMoodleAccount() && navigator.onLine && (!cache || Date.now() - cache.updated > 10 * 60_000)) void refresh(true)
  return section
}

function taskList(tasks: MoodleTask[]): HTMLElement {
  const pending = tasks.filter((x) => !md.taskDone(x))
  const done = tasks.filter(md.taskDone)
  const group = (label: string, list: MoodleTask[]) =>
    list.length ? el('div', { class: 'md-group' }, el('h3', { class: 'md-group-title', textContent: `${label} (${list.length})` }), el('ul', { class: 'md-tasks' }, ...list.map(taskItem))) : null
  return el('div', {}, group(t('To do'), pending), group(t('Handed in and graded'), done))
}

function taskItem(task: MoodleTask): HTMLElement {
  const summary = el(
    'summary',
    { class: 'md-task-summary' },
    el('span', { class: 'md-task-main' }, el('span', { class: 'md-course', textContent: task.courseName }), el('span', { class: 'md-task-name', textContent: task.name })),
    el('span', { class: 'md-chips' }, ...chips(task).map((c) => el('span', { class: `md-chip ${c.kind}`, textContent: c.text }))),
  )
  const details = el('details', { class: 'md-task' }, summary)
  let filled = false
  details.addEventListener('toggle', () => {
    if (!details.open || filled) return
    filled = true
    details.append(taskDetails(task))
  })
  return el('li', {}, details)
}

function taskDetails(task: MoodleTask): HTMLElement {
  const box = el('div', { class: 'md-task-body' })
  const facts: [string, string][] = []
  if (task.allowFrom) facts.push([t('Opens'), fmt(task.allowFrom)])
  if (task.due) facts.push([t('Due'), fmt(task.due)])
  if (task.extensionDue) facts.push([t('Extension until'), fmt(task.extensionDue)])
  if (task.cutoff) facts.push([t('Last day to hand in'), fmt(task.cutoff)])
  const types = md.acceptedExtensions(task)
  if (task.fileSubmission) facts.push([t('Files'), types ? types.map((x) => `.${x}`).join(', ') : t('Any type')])
  if (task.submittedFiles.length) facts.push([t('Your files'), task.submittedFiles.map((f) => f.name).join(', ')])
  if (task.submittedAt && task.status !== 'new') facts.push([t('Last change'), fmt(task.submittedAt)])
  if (task.graded && task.grade) facts.push([t('Grade'), plain(task.grade)])
  const dl = el('dl', { class: 'md-facts' })
  for (const [k, v] of facts) dl.append(el('dt', { textContent: k }), el('dd', { textContent: v }))
  if (task.intro) box.append(el('div', { class: 'md-intro' }, sanitizeHtml(task.intro)))
  if (task.files.length) {
    box.append(
      attrs(el(
        'ul',
        { class: 'md-files' },
        ...task.files.map((f) => {
          const link = el('a', { href: md.fileLink(f.url), target: '_blank', rel: 'noopener noreferrer', download: f.name }, icon(Paperclip, 14), el('span', { textContent: f.name }))
          const open = el('button', { type: 'button', class: 'md-btn small', textContent: t('Open in Ofimeo') })
          open.addEventListener('click', () => void openInOfimeo(f, open))
          return el('li', {}, link, f.size ? el('span', { class: 'md-size', textContent: sizeText(f.size) }) : null, open)
        }),
      ), { 'aria-label': t('Files of the assignment') }),
    )
  }
  box.append(dl)
  if (task.feedback) box.append(el('div', { class: 'md-feedback' }, el('h4', { textContent: t('Feedback') }), sanitizeHtml(task.feedback)))
  if (!task.fileSubmission && !md.taskDone(task)) box.append(el('p', { class: 'hint', textContent: task.onlineText ? t('This assignment is answered as text in Moodle.') : t('This assignment is not handed in as a file.') }))
  box.append(el('p', {}, el('a', { href: task.link, target: '_blank', rel: 'noopener noreferrer', class: 'md-open-link' }, icon(ExternalLink, 14), el('span', { textContent: t('Open in Moodle') }))))
  return box
}

// Imports an attachment as a new Ofimeo document (a plain copy, not linked).
async function openInOfimeo(file: { name: string; url: string; mimetype?: string }, button: HTMLButtonElement): Promise<void> {
  button.disabled = true
  try {
    const blob = await md.downloadFile(file, { confirmRelay })
    const target = await appForFile(blob)
    if (!target) {
      toast(t('This file type is not supported yet'))
      return
    }
    toast(t('Opening…'))
    location.href = await target.module.importFile(blob)
  } catch (err) {
    toast(errorText(err))
  } finally {
    button.disabled = false
  }
}

// ---------- Hand in to Moodle ----------

interface FormatChoice {
  value: string
  label: string
  ext: string
  build?: () => Promise<Blob>
}

export async function handInToMoodle(session: Session, untitled: string): Promise<void> {
  if (!md.hasMoodleAccount() && !(await openMoodleDialog())) return
  let cache = md.loadTaskCache()
  if (navigator.onLine && (!cache || Date.now() - cache.updated > 60_000)) {
    toast(t('Loading your assignments…'))
    try {
      cache = await md.refreshTasks({ confirmRelay })
    } catch (err) {
      if (err instanceof md.MoodleError && err.code === 'token') {
        toast(errorText(err))
        if (!(await openMoodleDialog())) return
        return handInToMoodle(session, untitled)
      }
      if (!cache) return void toast(errorText(err))
    }
  }
  if (!navigator.onLine) return void toast(t('You are offline. Connect to the Internet and try again.'))
  const tasks = (cache?.tasks ?? []).filter((x) => !md.handInProblem(x))
  const title = String(session.doc.getMap('meta').get('title') || untitled)

  const formats: FormatChoice[] = (session.hooks.exportFormats?.() ?? []).map((f: ExportOption, i) => ({ value: String(i), label: f.label, ext: f.ext, build: f.build }))
  const status = attrs(el('div', { class: 'md-status' }), { role: 'status', 'aria-live': 'polite' })

  if (!tasks.length) {
    const body = el(
      'div',
      { class: 'md-handin' },
      el('p', { textContent: t('There is no open assignment that takes files in your Moodle right now.') }),
      el('p', { class: 'hint', textContent: t('Assignments answered as text, not open yet or past their last day are not listed. Press Refresh in Moodle tasks on the home screen if your teacher just added one.') }),
    )
    await showDialog(t('Hand in to Moodle'), body, [{ label: t('Close'), value: 'ok', primary: true }], false, 'moodle')
    return
  }

  const taskSelect = el('select', { class: 'field', id: 'md-task-select' })
  for (const task of tasks) taskSelect.append(new Option(`${task.name} — ${task.courseName}`, String(task.id)))
  const taskInfo = el('div', { class: 'md-task-info' })
  const formatSelect = el('select', { class: 'field', id: 'md-format-select' })
  const fileInput = el('input', { type: 'file', class: 'field' })
  const fileLabel = el('label', { class: 'field-label', hidden: true }, t('File'), fileInput)
  const formatNote = el('p', { class: 'hint' })
  const statementBox = el('div', { class: 'md-statement', hidden: true })
  const statementCheck = el('input', { type: 'checkbox', id: 'md-statement-check' })
  const current = () => tasks.find((x) => String(x.id) === taskSelect.value)!

  const renderFormats = () => {
    const task = current()
    const accepted = md.acceptedExtensions(task)
    const usable = accepted ? formats.filter((f) => accepted.includes(f.ext)) : formats
    const list: FormatChoice[] = [...usable, { value: 'file', label: t('A file from this device…'), ext: '' }]
    const previous = formatSelect.value
    formatSelect.replaceChildren(...list.map((f) => new Option(f.label, f.value)))
    // Default: the first accepted type the app exports, else the app's main format.
    const preferred = accepted ? accepted.map((ext) => usable.find((f) => f.ext === ext)).find(Boolean) : usable[0]
    formatSelect.value = list.some((f) => f.value === previous) && previous !== 'file' ? previous : (preferred?.value ?? 'file')
    if (accepted) fileInput.accept = accepted.map((x) => `.${x}`).join(',')
    else fileInput.removeAttribute('accept')
    const notes: string[] = []
    if (accepted && usable.length < formats.length && !usable.length) notes.push(t('This app cannot export any of the accepted types ({types}). Choose a file from this device.', { types: accepted.map((x) => `.${x}`).join(', ') }))
    if (!formats.some((f) => f.ext === 'pdf') && (!accepted || accepted.includes('pdf'))) notes.push(t('For a PDF, use File → Print and choose “Save as PDF”, then pick that file with “A file from this device…”.'))
    formatNote.textContent = notes.join(' ')
    formatNote.hidden = !notes.length
    renderFile()
  }
  const renderFile = () => (fileLabel.hidden = formatSelect.value !== 'file')

  const renderTask = () => {
    const task = current()
    const lines: HTMLElement[] = []
    const due = task.extensionDue || task.due
    if (due) lines.push(el('p', { textContent: t('Due {date}', { date: fmt(due) }) }))
    if (task.cutoff) lines.push(el('p', { textContent: t('Last day to hand in: {date}', { date: fmt(task.cutoff) }) }))
    const max = md.maxBytes(task)
    const types = md.acceptedExtensions(task)
    lines.push(el('p', { class: 'hint', textContent: [types ? t('Accepted: {types}', { types: types.map((x) => `.${x}`).join(', ') }) : t('Any type of file'), max ? t('up to {size}', { size: sizeText(max) }) : ''].filter(Boolean).join(' · ') }))
    if (task.submittedFiles.length || task.status === 'submitted' || task.status === 'draft')
      lines.push(el('p', { class: 'md-replace', textContent: task.submittedFiles.length ? t('You already handed in {files}. Handing in again replaces it.', { files: task.submittedFiles.map((f) => f.name).join(', ') }) : t('Handing in again replaces your earlier submission.') }))
    if (task.submitButton) lines.push(el('p', { class: 'hint', textContent: t('The file is submitted for grading: after that your teacher may need to allow changes.') }))
    taskInfo.replaceChildren(...lines)
    statementBox.hidden = !task.requireStatement
    statementCheck.checked = false
    statementCheck.required = task.requireStatement
    if (task.requireStatement) {
      const text = task.statement ? sanitizeHtml(task.statement) : document.createTextNode(t('This submission is my own work, except where I have acknowledged the use of the works of other people.'))
      statementBox.replaceChildren(el('label', { class: 'md-statement-label' }, statementCheck, el('span', {}, text)))
    }
    renderFormats()
  }
  taskSelect.addEventListener('change', renderTask)
  formatSelect.addEventListener('change', renderFile)

  const body = el(
    'div',
    { class: 'md-handin' },
    el('label', { class: 'field-label' }, t('Assignment'), taskSelect),
    taskInfo,
    el('label', { class: 'field-label' }, t('Hand in as'), formatSelect),
    formatNote,
    fileLabel,
    statementBox,
    status,
  )
  renderTask()
  const hidden = (cache?.tasks.length ?? 0) - tasks.length
  if (hidden > 0) body.append(el('p', { class: 'hint', textContent: tn(hidden, '{n} other assignment is closed, not open yet or not handed in as a file.', '{n} other assignments are closed, not open yet or not handed in as a file.') }))

  let result: md.HandInResult | null = null
  const shown = showDialog(t('Hand in to Moodle'), body, [{ label: t('Cancel'), value: 'cancel' }, { label: t('Hand in'), value: 'handin', primary: true }], false, 'moodle')
  const form = body.closest('form')!
  const dialog = body.closest('dialog')!
  form.addEventListener('submit', async (e) => {
    const submitter = (e as SubmitEvent).submitter as HTMLButtonElement | null
    if (submitter?.value !== 'handin') return
    e.preventDefault()
    const task = current()
    if (task.requireStatement && !statementCheck.checked) {
      status.replaceChildren(el('p', { class: 'md-error', textContent: t('Tick the submission statement first.') }))
      statementCheck.focus()
      return
    }
    const buttons = [...form.querySelectorAll<HTMLButtonElement>('.dlg-actions button')]
    buttons.forEach((b) => (b.disabled = true))
    const say = (text: string) => status.replaceChildren(el('p', { textContent: text }))
    try {
      let file: { name: string; blob: Blob }
      if (formatSelect.value === 'file') {
        const chosen = fileInput.files?.[0]
        if (!chosen) {
          status.replaceChildren(el('p', { class: 'md-error', textContent: t('Choose the file to hand in.') }))
          fileInput.focus()
          return
        }
        file = { name: chosen.name, blob: chosen }
      } else {
        const format = formats.find((f) => f.value === formatSelect.value)!
        say(t('Preparing your file…'))
        file = { name: `${safeFileName(title)}.${format.ext}`, blob: await format.build!() }
      }
      result = await md.handInFile(task, file, statementCheck.checked, {
        confirmRelay,
        onStep: (step) => say(step === 'upload' ? t('Uploading {name}…', { name: file.name }) : step === 'save' ? t('Saving your submission…') : t('Submitting for grading…')),
      })
      dialog.close('done')
    } catch (err) {
      status.replaceChildren(el('p', { class: 'md-error', role: 'alert', textContent: errorText(err, task) }))
    } finally {
      buttons.forEach((b) => (b.disabled = false))
    }
  })
  await shown
  if (!result) return
  const done = result as md.HandInResult
  const ok = el(
    'div',
    { class: 'md-done' },
    el('p', { class: 'md-ok' }, icon(BookOpenCheck, 20), el('span', { textContent: done.submitted ? t('Handed in to “{task}”.', { task: done.task.name }) : t('Saved in “{task}”.', { task: done.task.name }) })),
    el('p', { class: 'hint', textContent: done.submitted ? t('Your teacher can see it in Moodle now.') : t('Moodle keeps it as your submission; you can replace it while the assignment is open.') }),
    el('p', {}, el('a', { href: done.task.link, target: '_blank', rel: 'noopener noreferrer', textContent: t('Open in Moodle') })),
  )
  await showDialog(t('Hand in to Moodle'), ok, [{ label: t('Done'), value: 'ok', primary: true }], false, 'moodle')
}
