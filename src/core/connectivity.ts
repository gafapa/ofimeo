// Network settings and diagnostics.
//
// School relay (Ofimeo Relay, see relay/ and docs/relay.md): a small program
// on the school network that provides a Nostr relay (to find each other) and a
// TURN server (to relay WebRTC when devices cannot reach each other). It is
// configured by its address (https://host[:port]), from
//   - the URL: ?relay=https://host:port (saved; ?relay=off forgets it),
//   - the Connection test dialog ("Use a school relay"),
//   - automatically when the app is served by the relay itself (index.html
//     carries <meta name="ofimeo-relay">; same origin /ofimeo/config).
// GET <address>/ofimeo/config returns its Nostr relays and ICE servers with
// time-limited TURN credentials, refreshed here before they expire. Nothing
// changes when no school relay is configured.
//
// A school configuration (school-config.ts) can name the school relay
// (relay.url, used unless the person chose another one; with "relay" locked,
// always), add Nostr relays and STUN/TURN servers, and forbid the public ones
// (features.publicRelays: false). The `school` object of a trusted relay's
// /ofimeo/config is remembered for the next start.
//
// Development aid: ?ice=relay forces relayed (TURN) connections.

import { defaultRelayUrls } from '@trystero-p2p/nostr'
import { isLocked, publicRelaysAllowed, rememberRelaySchoolConfig, schoolConfig } from './school-config'

export const APP_ID = 'words-online'
const STORAGE_KEY = 'words-online:school-relay'
const GUIDE_URL = 'https://github.com/gafapa/words-online/blob/main/docs/relay.md'
export const relayGuideUrl = GUIDE_URL

export interface RelayConfig {
  name?: string
  // School configuration served by the relay (--school-config), see school-config.ts.
  school?: unknown
  version?: string
  relays: string[]
  iceServers: RTCIceServer[]
  ttl: number
  // Unix seconds when the TURN credentials expire.
  expires: number
}

export type RelaySource = 'url' | 'stored' | 'same-origin' | 'school'

export interface SchoolRelay {
  address: string
  // Use only the school relay for signaling (no public Nostr relays).
  only: boolean
  config?: RelayConfig
  source: RelaySource
  // Last error when fetching the configuration.
  error?: string
}

interface Stored {
  address: string
  only?: boolean
  config?: RelayConfig
  // Last time the configuration could not be fetched.
  failedAt?: number
}

const params = new URLSearchParams(location.search)

function load(): Stored | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as Stored | null
    return value?.address ? value : null
  } catch {
    return null
  }
}

function save(value: Stored | null): void {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Private mode: the setting lasts only for this page.
  }
}

// https://host[:port] from what people paste ("host", "host:8443", a full URL…).
// Why a typed school relay address cannot be used (null: it looks fine).
//   scheme    not https://, http://, wss:// or ws://
//   invalid   not an address (spaces, no host, a bare word without scheme or port)
//   insecure  http:// or ws:// from a page served over https (the browser blocks it),
//             except for this computer (localhost)
export type RelayAddressProblem = 'scheme' | 'invalid' | 'insecure'

export function relayAddressProblem(input: string): RelayAddressProblem | null {
  const text = input.trim()
  if (/\s/.test(text)) return 'invalid'
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(text)?.[1]?.toLowerCase()
  if (scheme && !['https', 'http', 'wss', 'ws'].includes(scheme)) return 'scheme'
  if (!scheme && /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(text)) return 'scheme'
  const address = normalizeAddress(text)
  if (!address) return 'invalid'
  const url = new URL(address)
  const host = url.hostname
  const local = host === 'localhost' || /^127\./.test(host) || host === '[::1]'
  const ip = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')
  const named = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i.test(host)
  if (!ip && !named) return 'invalid'
  // A bare word ("relay") is only taken with a scheme or a port.
  if (!ip && !local && !host.includes('.') && !scheme && !url.port) return 'invalid'
  if (url.protocol === 'http:' && location.protocol === 'https:' && !local) return 'insecure'
  return null
}

export function normalizeAddress(input: string): string | null {
  let text = input.trim()
  if (!text) return null
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`
  try {
    const url = new URL(text.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:'))
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.origin
  } catch {
    return null
  }
}

// From the school configuration.
const school = schoolConfig()
const schoolAddress = school.relay?.url ? normalizeAddress(school.relay.url) : null
// Public relays forbidden: only the school's servers, always.
const forcedOnly = !publicRelaysAllowed()
// The person cannot choose another relay (or none), nor "only".
export const relayLocked = isLocked('relay') && !!schoolAddress
export const relayOnlyLocked = forcedOnly || (relayLocked && school.relay?.only !== undefined)

function fromSchool(stored: Stored | null): SchoolRelay | null {
  if (!schoolAddress) return null
  const same = stored?.address === schoolAddress
  const only = relayOnlyLocked ? forcedOnly || !!school.relay?.only : same && stored.only !== undefined ? stored.only : !!school.relay?.only
  return { address: schoolAddress, only, config: same ? stored.config : undefined, source: 'school' }
}

function initial(): SchoolRelay | null {
  const value = choose()
  return value && forcedOnly ? { ...value, only: true } : value
}

function choose(): SchoolRelay | null {
  const stored = load()
  if (document.querySelector('meta[name="ofimeo-relay"]')) {
    const config = stored?.address === location.origin ? stored.config : undefined
    return { address: location.origin, only: params.get('relaymode') === 'only' || !!stored?.only, config, source: 'same-origin' }
  }
  if (relayLocked) return fromSchool(stored)
  const fromUrl = params.get('relay')
  if (fromUrl && /^(off|none)$/i.test(fromUrl)) {
    save(null)
    return null
  }
  const address = fromUrl ? normalizeAddress(fromUrl) : null
  if (address) {
    const only = params.has('relaymode') ? params.get('relaymode') === 'only' : stored?.address === address && !!stored.only
    const config = stored?.address === address ? stored.config : undefined
    save({ address, only, config })
    return { address, only, config, source: 'url' }
  }
  if (stored && stored.address === schoolAddress) return fromSchool(stored)
  return stored ? { address: stored.address, only: !!stored.only, config: stored.config, source: 'stored' } : fromSchool(null)
}

let relay = initial()

export function schoolRelay(): SchoolRelay | null {
  return relay
}

// Share links carry the relay address (docPath() keeps location.search), so
// people who open them get it too.
function addToUrl(): void {
  if (!relay || relay.source === 'same-origin' || relay.source === 'school') return
  const search = new URLSearchParams(location.search)
  if (search.get('relay') === relay.address) return
  search.set('relay', relay.address)
  history.replaceState(history.state, '', `${location.pathname}?${search}${location.hash}`)
}

function removeFromUrl(): void {
  const search = new URLSearchParams(location.search)
  if (!search.has('relay') && !search.has('relaymode')) return
  search.delete('relay')
  search.delete('relaymode')
  const query = search.toString()
  history.replaceState(history.state, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`)
}

export async function fetchRelayConfig(address: string, timeoutMs = 8000): Promise<RelayConfig> {
  const response = await fetch(`${address}/ofimeo/config`, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const config = (await response.json()) as RelayConfig
  if (!Array.isArray(config.relays) || !Array.isArray(config.iceServers)) throw new Error('Not an Ofimeo Relay')
  // Applied at the next start, and only for a relay this app trusts (school-config.ts).
  rememberRelaySchoolConfig(normalizeAddress(address) ?? address, config.school ?? null)
  return config
}

let refreshTimer = 0

// Fetches fresh credentials now, and schedules the next refresh halfway
// through their validity (retrying every few minutes after a failure).
export async function refreshSchoolRelay(): Promise<SchoolRelay | null> {
  const current = relay
  if (!current) return null
  clearTimeout(refreshTimer)
  try {
    const config = await fetchRelayConfig(current.address)
    if (relay !== current) return relay
    relay = { ...current, config, error: undefined }
    save({ address: current.address, only: current.only, config })
    const halfLife = Math.max(60, Math.min(config.ttl / 2, config.expires - Date.now() / 1000 - 60))
    refreshTimer = window.setTimeout(() => void refreshSchoolRelay(), halfLife * 1000)
  } catch (err) {
    if (relay === current) {
      relay = { ...current, error: (err as Error).message }
      save({ address: current.address, only: current.only, config: current.config, failedAt: Date.now() })
    }
    refreshTimer = window.setTimeout(() => void refreshSchoolRelay(), 5 * 60_000)
  }
  return relay
}

// Saves a school relay after checking it answers; throws when it does not.
export async function setSchoolRelay(input: string, only: boolean): Promise<SchoolRelay> {
  if (relayLocked) throw new Error('set by your school')
  if (forcedOnly) only = true
  const address = normalizeAddress(input)
  if (!address) throw new Error('invalid address')
  const config = await fetchRelayConfig(address)
  relay = { address, only, config, source: relay?.source === 'same-origin' && address === location.origin ? 'same-origin' : 'stored' }
  save({ address, only, config })
  addToUrl()
  return relay
}

export function setRelayOnly(only: boolean): void {
  if (!relay || relayOnlyLocked) return
  relay = { ...relay, only }
  save({ address: relay.address, only, config: relay.config })
}

export function forgetSchoolRelay(): void {
  if (relayLocked) return
  relay = null
  clearTimeout(refreshTimer)
  save(null)
  removeFromUrl()
}

// The Nostr relay of a school relay, known even before its config arrives.
function schoolNostrRelays(r: SchoolRelay): string[] {
  return r.config?.relays.length ? r.config.relays : [`${r.address.replace(/^http/, 'ws')}/nostr`]
}

// Trystero's default public relays for this app (the same selection it makes).
export function publicRelays(): string[] {
  let seed = [...APP_ID].reduce((a, c) => a + c.charCodeAt(0), 0) % Number.MAX_SAFE_INTEGER
  const list = [...defaultRelayUrls]
  const rand = () => {
    const x = Math.sin(seed++) * 1e4
    return x - Math.floor(x)
  }
  for (let i = list.length; i; ) {
    const j = Math.floor(rand() * i--)
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list.slice(0, 5)
}

// Custom relays from the URL (?relays=wss://a,wss://b), used instead of the public ones.
export function urlRelays(): string[] | undefined {
  const list = params.get('relays')?.split(',').filter(Boolean)
  return list?.length ? list : undefined
}

// Nostr relays for rooms: explicit ones win; a school relay is used with the
// public ones (or alone); undefined keeps Trystero's defaults.
export function nostrRelays(explicit?: string[]): string[] | undefined {
  if (explicit?.length) return explicit
  // Nostr relays of the school configuration, with the school relay's.
  const extra = school.nostr?.relays ?? []
  if (!relay) return extra.length ? (forcedOnly ? extra : [...extra, ...publicRelays()]) : undefined
  const own = [...new Set([...schoolNostrRelays(relay), ...extra])]
  return relay.only ? own : [...own, ...publicRelays()]
}

// Every relay the app would use, for the connection test.
export function effectiveRelays(): string[] {
  return nostrRelays(urlRelays()) ?? publicRelays()
}

// Trystero's default STUN servers (used unless only the school relay is used).
export const PUBLIC_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
]

export const forceRelay = params.get('ice') === 'relay'

export function iceServers(): RTCIceServer[] {
  const own = [...(relay?.config?.iceServers ?? []), ...(school.iceServers ?? [])]
  return relay?.only || forcedOnly ? own : [...PUBLIC_ICE_SERVERS, ...own]
}

// WebRTC configuration for Trystero, or undefined to keep its defaults. The
// getter is read each time a connection is created, so fresh credentials apply.
export function rtcConfig(): RTCConfiguration | undefined {
  if (!relay && !forceRelay && !school.iceServers?.length && !forcedOnly) return undefined
  const config: RTCConfiguration = {}
  Object.defineProperty(config, 'iceServers', { enumerable: true, get: iceServers })
  if (forceRelay) config.iceTransportPolicy = 'relay'
  return config
}

if (relay) {
  addToUrl()
  window.addEventListener('online', () => void refreshSchoolRelay())
  const config = relay.config
  const now = Date.now() / 1000
  if (config && config.expires - now > 600) {
    // Valid credentials are used right away; refreshed halfway through their life.
    refreshTimer = window.setTimeout(() => void refreshSchoolRelay(), Math.max(0, config.expires - now - config.ttl / 2) * 1000)
  } else if (Date.now() - (load()?.failedAt ?? 0) > 10 * 60_000) {
    // Rooms prepare connection offers as soon as they open, so wait briefly
    // for the first configuration (not again for a while if the relay is
    // unreachable, e.g. at home).
    await Promise.race([refreshSchoolRelay(), new Promise((resolve) => setTimeout(resolve, 3000))])
  } else void refreshSchoolRelay()
}

// ---------- Diagnostics ----------

export type CheckState = 'ok' | 'warn' | 'fail' | 'skip'

export interface InternetResult {
  state: CheckState
  ms?: number
}

// Opaque requests to two well-known sites: any answer means Internet works.
export async function checkInternet(timeoutMs = 6000): Promise<InternetResult> {
  if (!navigator.onLine) return { state: 'fail' }
  const start = performance.now()
  const probe = (url: string) => fetch(url, { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) })
  try {
    await Promise.any([probe('https://www.gstatic.com/generate_204'), probe('https://cloudflare.com/cdn-cgi/trace')])
    return { state: 'ok', ms: Math.round(performance.now() - start) }
  } catch {
    return { state: 'fail' }
  }
}

export interface RelayResult {
  url: string
  state: CheckState
  // Time until the relay answered a subscription (EOSE).
  ms?: number
  error?: string
  school: boolean
}

// Opens a WebSocket to a Nostr relay and times a subscription until EOSE.
export function checkNostrRelay(url: string, timeoutMs = 8000): Promise<Omit<RelayResult, 'school'>> {
  return new Promise((resolve) => {
    const start = performance.now()
    let ws: WebSocket
    const done = (result: Omit<RelayResult, 'school'>) => {
      clearTimeout(timer)
      try {
        ws.close()
      } catch {
        // Already closed.
      }
      resolve(result)
    }
    const timer = window.setTimeout(() => done({ url, state: 'fail', error: 'timeout' }), timeoutMs)
    try {
      ws = new WebSocket(url)
    } catch (err) {
      done({ url, state: 'fail', error: (err as Error).message })
      return
    }
    const sub = `ofimeo-test-${Math.random().toString(36).slice(2, 10)}`
    ws.onopen = () => ws.send(JSON.stringify(['REQ', sub, { kinds: [29999], since: Math.floor(Date.now() / 1000), limit: 1 }]))
    ws.onmessage = (e) => {
      try {
        const [type, id] = JSON.parse(String(e.data)) as [string, string]
        if (type === 'EOSE' && id === sub) {
          ws.send(JSON.stringify(['CLOSE', sub]))
          done({ url, state: 'ok', ms: Math.round(performance.now() - start) })
        }
      } catch {
        // Ignore other messages.
      }
    }
    ws.onerror = () => done({ url, state: 'fail', error: 'error' })
    ws.onclose = () => done({ url, state: 'fail', error: 'closed' })
  })
}

export interface IceResult {
  // Local network addresses (host candidates).
  host: number
  // Public address found through STUN (server reflexive).
  srflx: number
  // Relay candidates, per TURN server URL.
  relay: number
  relayUrls: string[]
  error?: string
}

// Gathers ICE candidates with the given servers and counts them by type.
export async function gatherCandidates(servers: RTCIceServer[], timeoutMs = 8000): Promise<IceResult> {
  const result: IceResult = { host: 0, srflx: 0, relay: 0, relayUrls: [] }
  let pc: RTCPeerConnection
  try {
    pc = new RTCPeerConnection({ iceServers: servers })
  } catch (err) {
    return { ...result, error: (err as Error).message }
  }
  try {
    pc.createDataChannel('probe')
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, timeoutMs)
      pc.onicecandidate = (e) => {
        if (!e.candidate) {
          clearTimeout(timer)
          resolve()
          return
        }
        const type = e.candidate.type ?? /typ (\w+)/.exec(e.candidate.candidate)?.[1]
        if (type === 'host') result.host++
        else if (type === 'srflx' || type === 'prflx') result.srflx++
        else if (type === 'relay') {
          result.relay++
          const url = (e as RTCPeerConnectionIceEvent & { url?: string }).url
          if (url && !result.relayUrls.includes(url)) result.relayUrls.push(url)
        }
      }
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch((err: Error) => {
          result.error = err.message
          resolve()
        })
    })
  } finally {
    pc.close()
  }
  return result
}

export interface LoopbackResult {
  state: CheckState
  ms?: number
  // Candidate type of the pair that carried the data ('relay' proves TURN).
  path?: string
  error?: string
}

// Connects two peer connections inside this page through the TURN server only
// (iceTransportPolicy 'relay') and sends a message over a data channel.
export async function turnLoopback(servers: RTCIceServer[], timeoutMs = 12000): Promise<LoopbackResult> {
  const turnServers = servers.filter((s) => [s.urls].flat().some((u) => /^turns?:/.test(u)))
  if (!turnServers.length) return { state: 'skip' }
  const config: RTCConfiguration = { iceServers: turnServers, iceTransportPolicy: 'relay' }
  const a = new RTCPeerConnection(config)
  const b = new RTCPeerConnection(config)
  const start = performance.now()
  try {
    a.onicecandidate = (e) => e.candidate && void b.addIceCandidate(e.candidate).catch(() => {})
    b.onicecandidate = (e) => e.candidate && void a.addIceCandidate(e.candidate).catch(() => {})
    const channel = a.createDataChannel('ofimeo-turn-test')
    const echoed = new Promise<void>((resolve) => {
      b.ondatachannel = (e) => (e.channel.onmessage = (m) => e.channel.send(String(m.data)))
      channel.onopen = () => channel.send('ping')
      channel.onmessage = () => resolve()
    })
    await a.setLocalDescription(await a.createOffer())
    await b.setRemoteDescription(a.localDescription!)
    await b.setLocalDescription(await b.createAnswer())
    await a.setRemoteDescription(b.localDescription!)
    let timer = 0
    const timeout = new Promise<'timeout'>((resolve) => (timer = window.setTimeout(() => resolve('timeout'), timeoutMs)))
    const outcome = await Promise.race([echoed, timeout])
    clearTimeout(timer)
    if (outcome === 'timeout') return { state: 'fail', error: 'timeout' }
    const ms = Math.round(performance.now() - start)
    const info = await selectedPair(a)
    return { state: 'ok', ms, path: info?.local }
  } catch (err) {
    return { state: 'fail', error: (err as Error).message }
  } finally {
    a.close()
    b.close()
  }
}

export type PeerPath = 'lan' | 'internet' | 'relay' | 'connecting'

export interface PeerResult {
  id: string
  path: PeerPath
  rttMs?: number
  local?: string
  remote?: string
}

interface PairInfo {
  local: string
  remote: string
  localAddress?: string
  remoteAddress?: string
  rtt?: number
}

async function selectedPair(pc: RTCPeerConnection): Promise<PairInfo | null> {
  const stats = await pc.getStats()
  let pair: Record<string, unknown> | undefined
  stats.forEach((s) => {
    if (s.type === 'transport' && s.selectedCandidatePairId) pair = stats.get(s.selectedCandidatePairId)
  })
  if (!pair) {
    stats.forEach((s) => {
      if (!pair && s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') pair = s
    })
  }
  if (!pair) return null
  const local = stats.get(pair.localCandidateId as string)
  const remote = stats.get(pair.remoteCandidateId as string)
  return {
    local: local?.candidateType ?? '?',
    remote: remote?.candidateType ?? '?',
    localAddress: local?.address ?? local?.ip,
    remoteAddress: remote?.address ?? remote?.ip,
    rtt: typeof pair.currentRoundTripTime === 'number' ? Math.round(pair.currentRoundTripTime * 1000) : undefined,
  }
}

const PRIVATE_ADDRESS = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|127\.|fc|fd|fe80:|::1$)|\.local$/i

// How a connected peer is reached: over the local network, over the Internet
// or through a TURN relay.
export async function peerPath(id: string, pc: RTCPeerConnection): Promise<PeerResult> {
  const info = pc.connectionState === 'connected' || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed' ? await selectedPair(pc) : null
  if (!info) return { id, path: 'connecting' }
  const viaRelay = info.local === 'relay' || info.remote === 'relay'
  const local = !viaRelay && [info.localAddress, info.remoteAddress].every((a) => !a || PRIVATE_ADDRESS.test(a)) && info.local === 'host'
  return { id, path: viaRelay ? 'relay' : local ? 'lan' : 'internet', rttMs: info.rtt, local: info.local, remote: info.remote }
}
