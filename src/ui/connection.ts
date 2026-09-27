// Connection test: checks what collaboration needs on this network and
// explains it in plain language (Internet, Nostr relays, WebRTC candidates,
// a real data channel through the school relay's TURN, and how the people in
// the open document are connected). Also where a school relay (Ofimeo Relay)
// is configured, and a text report for the IT department.

import {
  checkInternet,
  checkNostrRelay,
  effectiveRelays,
  forgetSchoolRelay,
  gatherCandidates,
  iceServers,
  peerPath,
  publicRelays,
  relayAddressProblem,
  relayGuideUrl,
  relayLocked,
  relayOnlyLocked,
  schoolRelay,
  setRelayOnly,
  setSchoolRelay,
  turnLoopback,
  urlRelays,
  type CheckState,
  type IceResult,
  type InternetResult,
  type LoopbackResult,
  type PeerResult,
  type RelayResult,
} from '../core/connectivity'
import { t } from '../core/i18n'
import { openRooms } from '../core/network'
import type { Session } from '../core/session'
import { el, showDialog, toast } from './widgets'
import { lockedNote } from './school'
import { publicRelaysAllowed } from '../core/school-config'
import { storeForwardSettings } from './store-forward'
import './connection.css'

type Verdict = 'direct' | 'school' | 'blocked' | 'partial' | 'testing'

interface Results {
  internet?: InternetResult
  relays: RelayResult[]
  ice?: IceResult
  loopback?: LoopbackResult
  peers?: { name: string; result: PeerResult }[]
  done: boolean
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

async function runChecks(update: (r: Results) => void): Promise<Results> {
  const results: Results = { relays: [], done: false }
  const relay = schoolRelay()
  const schoolUrls = new Set(relay?.config?.relays ?? (relay ? [`${relay.address.replace(/^http/, 'ws')}/nostr`] : []))
  const relays = effectiveRelays()
  // Public relays are always tested, even when only the school relay is used,
  // unless the school configuration forbids public servers.
  const all = publicRelaysAllowed() ? [...relays, ...publicRelays().filter((u) => !relays.includes(u))] : relays
  results.relays = all.map((url) => ({ url, state: 'skip', school: schoolUrls.has(url) }))
  update(results)

  const internet = checkInternet().then((r) => {
    results.internet = r
    update(results)
  })
  const nostr = Promise.all(
    all.map((url, i) =>
      checkNostrRelay(url).then((r) => {
        results.relays[i] = { ...r, school: schoolUrls.has(url) }
        update(results)
      }),
    ),
  )
  const servers = iceServers()
  const ice = gatherCandidates(servers).then((r) => {
    results.ice = r
    update(results)
  })
  const loopback = turnLoopback(relay?.config?.iceServers ?? []).then((r) => {
    results.loopback = r
    update(results)
  })
  const peers = (async () => {
    const list: { name: string; result: PeerResult }[] = []
    for (const room of openRooms) {
      const connections = room.connections()
      for (const [id, pc] of Object.entries(connections)) {
        const clientIds = [...(room.peers.get(id)?.clientIds ?? [])]
        const state = clientIds.map((c) => room.awareness.getStates().get(c)).find((s) => s?.user)
        list.push({ name: String(state?.user?.name ?? t('Person {n}', { n: list.length + 1 })), result: await peerPath(id, pc) })
      }
    }
    results.peers = list
    update(results)
  })()
  await Promise.all([internet, nostr, ice, loopback, peers])
  results.done = true
  update(results)
  return results
}

function verdictOf(r: Results): { verdict: Verdict; text: string } {
  if (!r.done) return { verdict: 'testing', text: t('Testing the connection…') }
  const relay = schoolRelay()
  const schoolNostr = r.relays.filter((x) => x.school)
  const schoolSignals = schoolNostr.some((x) => x.state === 'ok')
  const publicOk = r.relays.some((x) => !x.school && x.state === 'ok')
  const turnOk = r.loopback?.state === 'ok'
  const peers = r.peers ?? []
  if (peers.some((p) => p.result.path === 'lan' || p.result.path === 'internet'))
    return { verdict: 'direct', text: t('The people in this document are connected directly, without going through any server.') }
  if (peers.some((p) => p.result.path === 'relay'))
    return { verdict: 'school', text: t('The people in this document are connected through the relay (TURN): devices on this network cannot reach each other directly.') }
  if (relay && schoolSignals && turnOk)
    return publicOk && !relay.only
      ? { verdict: 'direct', text: t('Public servers work, and the school relay is ready if devices cannot reach each other directly.') }
      : { verdict: 'school', text: t('Public servers are blocked or not used, but the school relay lets browsers find each other and passes the data between them.') }
  if (relay && schoolSignals && !turnOk)
    return { verdict: 'partial', text: t('The school relay answers, but its TURN service cannot be reached: ask your IT department to open UDP and TCP port 3478 (see the guide).') }
  if (relay && !schoolSignals && !publicOk)
    return { verdict: 'blocked', text: t('The school relay at {address} cannot be reached. If it uses its own certificate, open that address once and install the certificate as its page explains.', { address: relay.address }) }
  if (publicOk) {
    if (r.ice && r.ice.srflx === 0 && r.ice.relay === 0)
      return { verdict: 'partial', text: t('Browsers can find each other, but this network blocks STUN, so direct connections may fail. If people see “Only you”, a school relay is needed.') }
    return { verdict: 'direct', text: t('Browsers can find each other through public servers and connect directly. If people on the same Wi-Fi still see “Only you”, the Wi-Fi may isolate devices from each other: then a school relay is needed.') }
  }
  return { verdict: 'blocked', text: t('This network blocks the public servers Ofimeo uses to find other browsers, so documents cannot be edited together here. A small program on the school network (Ofimeo Relay) solves it.') }
}

function verdictTitle(v: Verdict): string {
  switch (v) {
    case 'direct':
      return t('Collaboration works directly on this network')
    case 'school':
      return t('Collaboration works only through the school relay')
    case 'partial':
      return t('Collaboration may not work on this network')
    case 'blocked':
      return t('Blocked: ask your IT department to install Ofimeo Relay')
    default:
      return t('Testing…')
  }
}

const STATE_LABEL: Record<CheckState, () => string> = {
  ok: () => t('Passed'),
  warn: () => t('Warning'),
  fail: () => t('Problem'),
  skip: () => t('Not tested'),
}

interface Row {
  state: CheckState | 'pending'
  label: string
  detail: string
}

function rowsFor(r: Results): { title: string; rows: Row[]; note?: string }[] {
  const pending = (label: string): Row => ({ state: 'pending', label, detail: t('Testing…') })
  const sections: { title: string; rows: Row[]; note?: string }[] = []

  sections.push({
    title: t('Internet'),
    rows: [
      r.internet
        ? { state: r.internet.state, label: t('Internet access'), detail: r.internet.state === 'ok' ? t('Works') : t('Not available or filtered') }
        : pending(t('Internet access')),
    ],
  })

  const working = r.relays.filter((x) => x.state === 'ok').length
  const tested = r.relays.filter((x) => x.state !== 'skip').length
  sections.push({
    title: t('Servers to find each other (Nostr relays)'),
    note: tested === r.relays.length ? t('{ok} of {total} work.', { ok: working, total: r.relays.length }) : undefined,
    rows: r.relays.map((x) => ({
      state: x.state === 'skip' ? 'pending' : x.state,
      label: hostOf(x.url) + (x.school ? ` (${t('school relay')})` : ''),
      detail: x.state === 'skip' ? t('Testing…') : x.state === 'ok' ? t('Works ({ms} ms)', { ms: x.ms ?? 0 }) : t('Blocked or not reachable'),
    })),
  })

  const relay = schoolRelay()
  const rows: Row[] = []
  if (!r.ice) rows.push(pending(t('Direct connections (WebRTC)')))
  else if (r.ice.error) rows.push({ state: 'fail', label: t('Direct connections (WebRTC)'), detail: t('WebRTC is not available in this browser: {message}', { message: r.ice.error }) })
  else {
    rows.push({
      state: r.ice.host > 0 ? 'ok' : 'warn',
      label: t('Local network address'),
      detail: r.ice.host > 0 ? t('Found') : t('None: the browser or the network hides it'),
    })
    rows.push({
      state: r.ice.srflx > 0 ? 'ok' : 'warn',
      label: t('Public address (STUN)'),
      detail: r.ice.srflx > 0 ? t('Found: direct connections over the Internet are possible') : t('Not found: STUN is blocked'),
    })
    rows.push(
      relay
        ? { state: r.ice.relay > 0 ? 'ok' : 'fail', label: t('Relay server (TURN)'), detail: r.ice.relay > 0 ? t('Available') : t('Not available') }
        : { state: 'skip', label: t('Relay server (TURN)'), detail: t('None configured (it comes with a school relay)') },
    )
  }
  if (relay) {
    const l = r.loopback
    rows.push(
      !l
        ? pending(t('Data through the relay (TURN)'))
        : l.state === 'ok'
          ? { state: 'ok', label: t('Data through the relay (TURN)'), detail: t('Works ({ms} ms)', { ms: l.ms ?? 0 }) }
          : l.state === 'skip'
            ? { state: 'skip', label: t('Data through the relay (TURN)'), detail: t('The school relay did not provide a TURN server') }
            : { state: 'fail', label: t('Data through the relay (TURN)'), detail: t('Failed: UDP/TCP port 3478 may be blocked') },
    )
  }
  sections.push({ title: t('Connections between browsers (WebRTC)'), rows })

  if (openRooms.size > 0) {
    const peers = r.peers
    sections.push({
      title: t('People in this document'),
      rows: !peers
        ? [pending(t('Connections'))]
        : peers.length === 0
          ? [{ state: 'skip', label: t('Nobody else is connected'), detail: t('Share the document to test a real connection') }]
          : peers.map(({ name, result }) => ({
              state: result.path === 'connecting' ? 'warn' : 'ok',
              label: name,
              detail: pathLabel(result) + (result.rttMs !== undefined ? ` · ${t('{ms} ms round trip', { ms: result.rttMs })}` : ''),
            })),
    })
  }
  return sections
}

function pathLabel(p: PeerResult): string {
  switch (p.path) {
    case 'lan':
      return t('Direct, local network')
    case 'internet':
      return t('Direct, over the Internet')
    case 'relay':
      return t('Through the relay (TURN)')
    default:
      return t('Connecting…')
  }
}

// Plain-text summary for the IT department.
function report(r: Results): string {
  const { verdict, text } = verdictOf(r)
  const relay = schoolRelay()
  const lines = [
    `${t('Connection test')} · Ofimeo · ${new Date().toISOString()}`,
    `${verdictTitle(verdict)}`,
    text,
    '',
    `${t('Page')}: ${location.origin}${location.pathname}`,
    `${t('Browser')}: ${navigator.userAgent}`,
    `${t('School relay')}: ${relay ? `${relay.address}${relay.only ? ` (${t('only')})` : ''}${relay.config?.version ? ` v${relay.config.version}` : ''}${relay.error ? ` · ${relay.error}` : ''}` : t('none')}`,
    urlRelays() ? `?relays=${urlRelays()!.join(',')}` : '',
    '',
  ]
  for (const section of rowsFor(r)) {
    lines.push(`## ${section.title}${section.note ? ` — ${section.note}` : ''}`)
    for (const row of section.rows) lines.push(`[${row.state === 'pending' ? '…' : STATE_LABEL[row.state]()}] ${row.label}: ${row.detail}`)
    lines.push('')
  }
  lines.push(`ICE servers: ${iceServers().flatMap((s) => [s.urls].flat()).join(', ')}`)
  if (r.ice) lines.push(`ICE: host=${r.ice.host} srflx=${r.ice.srflx} relay=${r.ice.relay}${r.ice.relayUrls.length ? ` (${r.ice.relayUrls.join(', ')})` : ''}`)
  if (r.loopback) lines.push(`TURN loopback: ${r.loopback.state}${r.loopback.ms ? ` ${r.loopback.ms} ms` : ''}${r.loopback.path ? ` via ${r.loopback.path}` : ''}${r.loopback.error ? ` (${r.loopback.error})` : ''}`)
  for (const p of r.peers ?? []) lines.push(`Peer ${p.result.id.slice(0, 8)}: ${p.result.path} local=${p.result.local ?? '-'} remote=${p.result.remote ?? '-'} rtt=${p.result.rttMs ?? '-'}ms`)
  lines.push('', `${t('Guide for the IT department')}: ${relayGuideUrl}`)
  return lines.filter((l, i, all) => !(l === '' && all[i - 1] === '')).join('\n')
}

// School relay settings: current relay, or a field to add one.
function relaySettings(onChange: () => void): HTMLElement {
  const box = el('section', { class: 'conn-relay' })
  let changed = false
  const render = (message?: { text: string; error?: boolean; link?: string }) => {
    const relay = schoolRelay()
    box.replaceChildren(el('h3', { textContent: t('School relay') }))
    if (relay) {
      const status = relay.error
        ? el('span', { class: 'conn-bad', textContent: t('Not reachable: {message}', { message: relay.error }) })
        : relay.config
          ? el('span', { textContent: [relay.config.name, relay.config.version && (/^\d/.test(relay.config.version) ? `v${relay.config.version}` : relay.config.version)].filter(Boolean).join(' ') })
          : null
      box.append(
        el(
          'p',
          {},
          relay.source === 'same-origin' ? t('This app is served by the school relay:') + ' ' : t('In use:') + ' ',
          el('code', { textContent: relay.address }),
          ' ',
          status,
          relay.source === 'school' && relayLocked ? lockedNote() : null,
        ),
      )
      const only = el('input', { type: 'checkbox', checked: relay.only, disabled: relayOnlyLocked })
      only.addEventListener('change', () => {
        setRelayOnly(only.checked)
        changed = true
        render()
        onChange()
      })
      box.append(el('label', { class: 'conn-check' }, only, t('Use only the school relay (not public servers)'), relayOnlyLocked ? lockedNote() : null))
      if (relay.source !== 'same-origin' && !relayLocked) {
        const forget = el('button', { type: 'button', textContent: t('Stop using it') })
        forget.addEventListener('click', () => {
          forgetSchoolRelay()
          changed = true
          render()
          onChange()
        })
        box.append(el('div', { class: 'conn-actions' }, forget))
      }
    } else {
      box.append(el('p', { class: 'hint', textContent: t('If your school installed Ofimeo Relay, paste its address here (your IT department can give it to you, or open a link that already includes it).') }))
      const input = el('input', { class: 'field mono', placeholder: 'https://relay.school.local:8443', spellcheck: false })
      input.setAttribute('aria-label', t('School relay address'))
      const use = el('button', { type: 'button', textContent: t('Use this relay') })
      // Inline error for an address that cannot work, shown before anything is fetched.
      const invalid = el('p', { class: 'conn-bad', id: 'conn-relay-error', role: 'alert', hidden: true })
      const showProblem = (text: string | null) => {
        invalid.hidden = !text
        invalid.textContent = text ?? ''
        if (text) {
          input.setAttribute('aria-invalid', 'true')
          input.setAttribute('aria-describedby', invalid.id)
        } else {
          input.removeAttribute('aria-invalid')
          input.removeAttribute('aria-describedby')
        }
      }
      input.addEventListener('input', () => showProblem(null))
      const submit = async () => {
        if (!input.value.trim()) return input.focus()
        const problem = relayAddressProblem(input.value)
        if (problem) {
          showProblem(
            problem === 'scheme'
              ? t('The address must start with https:// or wss:// (http:// or ws:// only on the school network).')
              : problem === 'insecure'
                ? t('This page uses https, so the browser only connects to a relay with an https:// or wss:// address.')
                : t('This is not a valid address. Example: https://relay.school.local:8443'),
          )
          return input.focus()
        }
        use.disabled = true
        use.textContent = t('Checking…')
        try {
          await setSchoolRelay(input.value, false)
          changed = true
          render()
          onChange()
        } catch (err) {
          const address = input.value.trim()
          render({
            text: t('Could not reach the relay ({message}). If it uses its own certificate, open its address in a new tab and follow the instructions to install the certificate, then try again.', { message: (err as Error).message }),
            error: true,
            link: /^https?:/i.test(address) ? address : `https://${address}`,
          })
          const field = box.querySelector<HTMLInputElement>('input.field')
          if (field) field.value = address
        }
      }
      use.addEventListener('click', () => void submit())
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          void submit()
        }
      })
      box.append(el('div', { class: 'code-row' }, input, use), invalid)
    }
    if (message) {
      const p = el('p', { class: message.error ? 'conn-bad' : 'hint', textContent: message.text })
      if (message.link) p.append(' ', el('a', { href: message.link, target: '_blank', rel: 'noopener', textContent: t('Open the relay') }))
      box.append(p)
    }
    if (changed && openRooms.size > 0) {
      const reload = el('button', { type: 'button', textContent: t('Reload') })
      reload.addEventListener('click', () => location.reload())
      box.append(el('p', { class: 'hint' }, t('Reload the page so the open document uses the new setting.') + ' ', reload))
    }
  }
  render()
  return box
}

let open = false

export async function openConnectionTest(_session?: Session): Promise<void> {
  if (open) return
  open = true
  const verdictBox = el('div', { class: 'conn-verdict', role: 'status' })
  verdictBox.setAttribute('aria-live', 'polite')
  const details = el('div', { class: 'conn-sections' })
  const copy = el('button', { type: 'button', textContent: t('Copy report') })
  const rerun = el('button', { type: 'button', textContent: t('Test again') })
  const guide = el('a', { href: relayGuideUrl, target: '_blank', rel: 'noopener', textContent: t('Guide: Ofimeo Relay for schools') })
  let latest: Results = { relays: [], done: false }

  const render = (r: Results) => {
    latest = r
    const { verdict, text } = verdictOf(r)
    verdictBox.className = `conn-verdict ${verdict}`
    verdictBox.replaceChildren(el('strong', { textContent: verdictTitle(verdict) }), el('p', { textContent: text }))
    if (verdict === 'blocked' || verdict === 'partial') verdictBox.append(el('p', {}, guide))
    details.replaceChildren(
      ...rowsFor(r).map((section) =>
        el(
          'section',
          { class: 'conn-section' },
          el('h3', { textContent: section.title }),
          section.note ? el('p', { class: 'hint', textContent: section.note }) : null,
          el(
            'ul',
            { class: 'conn-rows' },
            ...section.rows.map((row) =>
              el(
                'li',
                { class: `conn-row ${row.state}` },
                el('span', { class: 'conn-dot', title: row.state === 'pending' ? t('Testing…') : STATE_LABEL[row.state]() }),
                el('span', { class: 'conn-label', textContent: row.label }),
                el('span', { class: 'conn-detail', textContent: row.detail }),
              ),
            ),
          ),
        ),
      ),
    )
  }
  let running = false
  let again = false
  const run = async () => {
    if (running) return void (again = true)
    running = true
    rerun.disabled = true
    try {
      do {
        again = false
        await runChecks(render)
      } while (again)
    } finally {
      running = false
      rerun.disabled = false
    }
  }
  copy.addEventListener('click', async () => {
    const text = report(latest)
    try {
      await navigator.clipboard.writeText(text)
      toast(t('Report copied. Paste it in a message to your IT department.'))
    } catch {
      // No clipboard (plain http): show the text to copy by hand.
      const area = el('textarea', { class: 'field mono conn-report', value: text, rows: 10, readOnly: true })
      details.prepend(area)
      area.select()
    }
  })
  rerun.addEventListener('click', () => void run())

  const body = el(
    'div',
    { class: 'conn-test' },
    verdictBox,
    details,
    el('div', { class: 'conn-actions' }, copy, rerun),
    relaySettings(() => void run()),
    storeForwardSettings(_session),
  )
  const shown = showDialog(t('Connection test'), body, [{ label: t('Close'), value: 'close', primary: true }], true, 'network')
  void run()
  await shown
  open = false
}
