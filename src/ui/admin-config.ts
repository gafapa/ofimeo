// Help ▸ For administrators…: a form that writes ofimeo.config.json, the
// school configuration (src/core/school-config.ts, docs/deploy-school.md).
// Everything happens in this browser (it also works offline); the file is
// downloaded and the IT department puts it next to index.html, or gives it to
// Ofimeo Relay with --school-config.

import { APPS, SUITE } from '../apps/registry'
import { language, languages, t } from '../core/i18n'
import { sanitizeSchoolConfig, schoolConfig, type SchoolConfig } from '../core/school-config'
import { TEMPLATES } from '../templates/catalog'
import { el, showDialog, toast } from './widgets'
import './admin-config.css'

const GUIDE_URL = 'https://github.com/gafapa/words-online/blob/main/docs/deploy-school.md'
const DOC_LANGUAGES = ['es-ES', 'gl-ES', 'en-GB', 'en-US', 'fr-FR', 'de-DE', 'es-MX', 'es-AR', 'es-CO', 'es-CL', 'es-US', 'en-AU', 'en-CA']

const lines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

function download(text: string, name: string): void {
  const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name })
  document.body.append(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(a.href)
    a.remove()
  }, 5000)
}

export async function openConfigGenerator(): Promise<void> {
  const start: SchoolConfig = schoolConfig()
  const text = (value = '', props: { type?: string; placeholder?: string } = {}) => el('input', { class: 'field', value, ...props })
  const check = (checked: boolean) => el('input', { type: 'checkbox', checked })
  const field = (label: string, control: HTMLElement, hint?: string) => el('label', { class: 'field-label' }, label, control, hint ? el('span', { class: 'hint', textContent: hint }) : null)
  const checkRow = (control: HTMLInputElement, label: string) => el('label', { class: 'check' }, control, label)
  const section = (title: string, ...children: (HTMLElement | null)[]) => el('fieldset', { class: 'admin-section' }, el('legend', { textContent: title }), ...children)

  // School
  const name = text(start.school?.name, { placeholder: 'IES Rosalía de Castro' })
  const logo = text(start.school?.logo, { placeholder: 'school/logo.svg' })
  const website = text(start.school?.url, { type: 'url', placeholder: 'https://www.school.example' })

  // Languages
  const uiLang = el('select', { class: 'field' }, new Option(t('The browser’s language'), ''), ...languages.map((l) => new Option(l.name, l.code)))
  uiLang.value = start.defaults?.language ?? ''
  const lockLang = check(!!start.locked?.includes('language'))
  const docLang = el('select', { class: 'field' }, new Option(t('The interface language'), ''), ...DOC_LANGUAGES.map((tag) => new Option(tag, tag)))
  docLang.value = start.defaults?.documentLanguage && DOC_LANGUAGES.includes(start.defaults.documentLanguage) ? start.defaults.documentLanguage : ''

  // Connections
  const relayUrl = text(start.relay?.url, { type: 'url', placeholder: 'https://relay.school.example' })
  const relayOnly = check(!!start.relay?.only)
  const lockRelay = check(!!start.locked?.includes('relay'))
  const publicRelays = check(start.features?.publicRelays !== false)
  const nostr = el('textarea', { class: 'field mono', rows: 2, value: (start.nostr?.relays ?? []).join('\n'), placeholder: 'wss://nostr.school.example' })
  const turn = start.iceServers?.find((s) => [s.urls].flat().some((u) => /^turns?:/.test(u)))
  const turnUrls = text(turn ? [turn.urls].flat().join(', ') : '', { placeholder: 'turn:turn.school.example:3478, turns:turn.school.example:443' })
  const turnUser = text(turn?.username ?? '')
  const turnPass = text(String(turn?.credential ?? ''))

  // Store and forward
  const storeRelay = check(start.store?.relay !== false)
  const storeNc = check(start.store?.nextcloud?.enabled !== false)
  const storeFolder = text(start.store?.nextcloud?.folder, { placeholder: '/Ofimeo' })

  // Nextcloud
  const ncServers = el('textarea', {
    class: 'field mono',
    rows: 2,
    value: (start.nextcloud?.servers ?? []).map((s) => (s.name ? `${s.name} | ${s.url}` : s.url)).join('\n'),
    placeholder: 'Nube do centro | https://cloud.school.example',
  })
  const lockNc = check(!!start.locked?.includes('nextcloud'))

  // Moodle (src/core/moodle.ts, docs/moodle.md)
  const moodleUrl = text(start.moodle?.url, { type: 'url', placeholder: 'https://moodle.school.example' })
  const moodleViaRelay = check(!!start.moodle?.viaRelay)
  const lockMoodle = check(!!start.locked?.includes('moodle'))

  // Features
  const webmcp = check(start.features?.webmcp !== false && start.features?.ai !== false && !start.locked?.includes('webmcp'))
  const ai = check(start.features?.ai !== false)
  ai.addEventListener('change', () => {
    webmcp.disabled = !ai.checked
    if (!ai.checked) webmcp.checked = false
  })
  webmcp.disabled = !ai.checked
  const apps = APPS.map((app) => ({ app, box: check(!start.features?.hiddenApps?.includes(app.type)) }))
  const tplMode = el('select', { class: 'field' }, new Option(t('All templates'), 'all'), new Option(t('No templates'), 'none'), new Option(t('Only the ones selected below'), 'list'))
  const startTpl = start.features?.templates
  tplMode.value = Array.isArray(startTpl) ? 'list' : (startTpl ?? 'all')
  const lang = (['es', 'gl', 'fr', 'de'] as const).find((l) => l === language) ?? 'es'
  const templates = TEMPLATES.map((tpl) => ({ tpl, box: check(Array.isArray(startTpl) ? startTpl.includes(tpl.id) : true) }))
  const tplList = el(
    'div',
    { class: 'admin-templates' },
    ...templates.map(({ tpl, box }) => checkRow(box, `${tpl.name[lang] ?? tpl.name.es ?? tpl.id} (${tpl.id})`)),
  )
  const renderTpl = () => (tplList.hidden = tplMode.value !== 'list')
  tplMode.addEventListener('change', renderTpl)
  renderTpl()

  // Legal
  const org = text(start.legal?.organization, { placeholder: 'Consellería de Educación' })
  const contact = text(start.legal?.contactEmail, { type: 'email' })
  const privacy = text(start.legal?.privacyEmail, { type: 'email' })
  const dpo = text(start.legal?.dpoEmail, { type: 'email' })
  const privacyUrl = text(start.legal?.privacyUrl, { type: 'url' })
  const noticeUrl = text(start.legal?.legalNoticeUrl, { type: 'url' })

  const build = (): SchoolConfig => {
    const locked = [lockLang.checked && uiLang.value && 'language', !webmcp.checked && 'webmcp', lockRelay.checked && relayUrl.value.trim() && 'relay', lockNc.checked && ncServers.value.trim() && 'nextcloud', lockMoodle.checked && moodleUrl.value.trim() && 'moodle'].filter(Boolean)
    const turnList = turnUrls.value
      .split(/[,\s]+/)
      .map((u) => u.trim())
      .filter(Boolean)
    const hidden = apps.filter((a) => !a.box.checked).map((a) => a.app.type)
    const raw = {
      version: 1,
      school: { name: name.value, logo: logo.value, url: website.value },
      defaults: { language: uiLang.value, documentLanguage: docLang.value },
      relay: { url: relayUrl.value, only: relayUrl.value.trim() ? relayOnly.checked || !publicRelays.checked : undefined },
      nostr: { relays: lines(nostr.value) },
      iceServers: turnList.length ? [{ urls: turnList, username: turnUser.value, credential: turnPass.value }] : undefined,
      store: { relay: storeRelay.checked ? undefined : false, nextcloud: { enabled: storeNc.checked ? undefined : false, folder: storeFolder.value } },
      nextcloud: {
        servers: lines(ncServers.value).map((l) => {
          const [a, b] = l.split('|').map((x) => x.trim())
          return b ? { name: a, url: b } : { url: a }
        }),
      },
      moodle: { url: moodleUrl.value, viaRelay: moodleUrl.value.trim() && moodleViaRelay.checked ? true : undefined },
      features: {
        webmcp: webmcp.checked ? undefined : false,
        ai: ai.checked ? undefined : false,
        publicRelays: publicRelays.checked ? undefined : false,
        templates: tplMode.value === 'list' ? templates.filter((x) => x.box.checked).map((x) => x.tpl.id) : tplMode.value === 'none' ? 'none' : undefined,
        hiddenApps: hidden.length ? hidden : undefined,
      },
      legal: { organization: org.value, contactEmail: contact.value, privacyEmail: privacy.value, dpoEmail: dpo.value, privacyUrl: privacyUrl.value, legalNoticeUrl: noticeUrl.value },
      locked: locked.length ? locked : undefined,
    }
    // The same checks the app applies when it reads the file: what is not valid is left out.
    return { $schema: 'https://raw.githubusercontent.com/gafapa/words-online/main/docs/ofimeo.config.schema.json', ...sanitizeSchoolConfig(raw) } as SchoolConfig
  }

  const preview = el('pre', { class: 'admin-preview mono' })
  preview.setAttribute('aria-label', t('Preview of ofimeo.config.json'))
  const json = () => `${JSON.stringify(build(), null, 2)}\n`
  const warnings = el('p', { class: 'conn-bad', role: 'status' })
  const update = () => {
    preview.textContent = json()
    const problems: string[] = []
    if (!publicRelays.checked && !relayUrl.value.trim() && !lines(nostr.value).length) problems.push(t('Without public servers, give a school relay or Nostr relays, or people will not find each other.'))
    for (const input of [relayUrl, website, privacyUrl, noticeUrl, moodleUrl]) if (input.value.trim() && !/^https?:\/\//i.test(input.value.trim())) problems.push(t('Addresses must start with https://: {value}', { value: input.value.trim() }))
    warnings.textContent = problems.join(' ')
    warnings.hidden = !problems.length
  }
  const copy = el('button', { type: 'button', textContent: t('Copy') })
  copy.addEventListener('click', () => {
    void navigator.clipboard.writeText(json()).then(
      () => toast(t('Copied')),
      () => toast(t('Could not copy')),
    )
  })

  const body = el(
    'div',
    { class: 'admin-config' },
    el(
      'p',
      {},
      t('This form writes ofimeo.config.json, the configuration of {suite} for your school. Put the file next to index.html on your server (or give it to Ofimeo Relay with --school-config). Every browser applies it the next time it opens {suite}.', { suite: SUITE }),
      ' ',
      el('a', { href: GUIDE_URL, target: '_blank', rel: 'noopener', textContent: t('Deployment guide for schools') }),
    ),
    section(t('School'), el('div', { class: 'form grid2' }, field(t('Name'), name), field(t('Website'), website)), field(t('Logo'), logo, t('An image next to index.html (for example school/logo.svg) or an https:// address.'))),
    section(
      t('Languages'),
      el('div', { class: 'form grid2' }, field(t('Interface language'), uiLang), field(t('Language of new documents (spelling)'), docLang)),
      checkRow(lockLang, t('People cannot change the interface language')),
    ),
    section(
      t('Connections'),
      field(t('School relay (Ofimeo Relay)'), relayUrl),
      checkRow(relayOnly, t('Use only the school relay (not public servers)')),
      checkRow(lockRelay, t('People cannot choose another relay')),
      checkRow(publicRelays, t('Allow public servers (Nostr relays and STUN)')),
      field(t('Other Nostr relays (one per line)'), nostr),
      el('div', { class: 'form grid2' }, field(t('TURN server addresses'), turnUrls), el('span')),
      el('div', { class: 'form grid2' }, field(t('TURN user name'), turnUser), field(t('TURN password'), turnPass)),
    ),
    section(
      t('Documents for people who are offline'),
      el('p', { class: 'hint', textContent: t('Where encrypted changes may wait until the other people connect.') }),
      checkRow(storeRelay, t('On the school relay')),
      checkRow(storeNc, t('In a Nextcloud folder')),
      field(t('Nextcloud folder'), storeFolder),
    ),
    section('Nextcloud', field(t('Nextcloud servers (one per line: name | address)'), ncServers), checkRow(lockNc, t('Only these servers can be used'))),
    section(
      'Moodle',
      field(t('Moodle address'), moodleUrl, t('Students see their Moodle assignments and hand in to them (docs/moodle.md).')),
      checkRow(moodleViaRelay, t('Always through the school relay (the relay must be started with --moodle-url)')),
      checkRow(lockMoodle, t('Only this Moodle can be used')),
    ),
    section(
      t('Features'),
      checkRow(ai, t('Allow AI features')),
      checkRow(webmcp, t('Allow AI assistants (WebMCP)')),
      el('p', { class: 'field-label', textContent: t('Apps offered for new documents') }),
      el('div', { class: 'admin-apps' }, ...apps.map(({ app, box }) => checkRow(box, app.plural))),
      field(t('Templates'), tplMode),
      tplList,
    ),
    section(
      t('Privacy and legal information'),
      el('p', { class: 'hint', textContent: t('Shown above the legal links. Your school is responsible for the data it processes; see Information for schools.') }),
      el('div', { class: 'form grid2' }, field(t('Organization'), org), field(t('Contact e-mail'), contact), field(t('Privacy e-mail'), privacy), field(t('Data protection officer e-mail'), dpo), field(t('Privacy policy address'), privacyUrl), field(t('Legal notice address'), noticeUrl)),
    ),
    el('div', { class: 'admin-preview-head' }, el('h3', { textContent: 'ofimeo.config.json' }), copy),
    warnings,
    preview,
  )
  // Enter in a field must not close the dialog (and lose the form).
  body.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement) e.preventDefault()
  })
  body.addEventListener('input', update)
  body.addEventListener('change', update)
  update()

  const choice = await showDialog(t('Configuration for your school'), body, [
    { label: t('Close'), value: 'cancel' },
    { label: t('Download ofimeo.config.json'), value: 'download', primary: true },
  ], true)
  if (choice === 'download') download(json(), 'ofimeo.config.json')
}
