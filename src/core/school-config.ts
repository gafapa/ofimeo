// School configuration (docs/deploy-school.md, schema in
// docs/ofimeo.config.schema.json): a school that hosts Ofimeo puts an
// ofimeo.config.json next to index.html (or runs Ofimeo Relay with
// --school-config, which serves it at the same address and inside
// /ofimeo/config). It sets the school's name and logo, default languages, the
// school relay, Nextcloud servers, which features are available and which
// settings people cannot change.
//
// Loaded here with a top-level await, before any other module reads a setting
// (i18n.ts imports this module first), so it applies before the first render.
// The last copy is kept in localStorage and the service worker caches the file
// (NetworkFirst), so it applies offline too. Without a file nothing changes.
//
// Sources, merged in this order (later wins, section by section):
//   1. the `school` object of a school relay's /ofimeo/config, remembered from
//      the last visit, but only when that relay serves this app (same origin)
//      or is the relay named by the file below; a relay given in a link
//      (?relay=) cannot lock anything;
//   2. <app folder>/ofimeo.config.json.

export type LockKey = 'language' | 'webmcp' | 'relay' | 'nextcloud'
export const LOCK_KEYS: LockKey[] = ['language', 'webmcp', 'relay', 'nextcloud']

const UI_LANGUAGES = ['en', 'es', 'gl', 'fr', 'de'] as const
const APP_TYPES = ['writer', 'sheet', 'draw', 'diagram', 'slides', 'forms', 'pdf', 'notebook'] as const

export interface NextcloudPreset {
  name?: string
  url: string
}

export interface SchoolConfig {
  version?: number
  school?: {
    name?: string
    // Image URL, relative to the app folder (e.g. "school/logo.svg") or absolute.
    logo?: string
    // School website, linked from the name.
    url?: string
  }
  defaults?: {
    // Interface language when the person has not chosen one.
    language?: (typeof UI_LANGUAGES)[number]
    // Language of new text (spelling), a code or a regional tag: "gl", "es-MX".
    documentLanguage?: string
  }
  relay?: {
    // Ofimeo Relay address (https://host[:port]); used unless the person set another one.
    url?: string
    // Use only the school relay for signaling (no public Nostr relays or STUN servers).
    only?: boolean
  }
  // Extra Nostr relays (wss://) and STUN/TURN servers used together with the school relay.
  nostr?: { relays?: string[] }
  iceServers?: RTCIceServer[]
  // Store-and-forward backends (implemented by the sync layer): whether documents may be
  // left encrypted on the school relay and/or in a Nextcloud folder for peers who are offline.
  store?: {
    relay?: boolean
    nextcloud?: { enabled?: boolean; folder?: string }
  }
  nextcloud?: {
    // Servers offered in "Connect to Nextcloud"; the first one is filled in.
    servers?: NextcloudPreset[]
  }
  features?: {
    // AI assistants through WebMCP (default true).
    webmcp?: boolean
    // Any AI feature; false also forbids WebMCP (default true).
    ai?: boolean
    // Public Nostr relays and STUN servers (default true); false: only the school's servers.
    publicRelays?: boolean
    // Template gallery: "all" (default), "none" or a list of template ids.
    templates?: 'all' | 'none' | string[]
    // Apps not offered for new documents (existing documents still open).
    hiddenApps?: string[]
  }
  legal?: {
    // Shown in the footer and the About dialog; the built-in legal pages stay available.
    organization?: string
    contactEmail?: string
    privacyEmail?: string
    dpoEmail?: string
    privacyUrl?: string
    legalNoticeUrl?: string
  }
  // Settings people cannot change in this browser.
  locked?: LockKey[]
}

const CACHE_KEY = 'words-online:school-config'
const RELAY_CACHE_KEY = 'words-online:school-config:relay'

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown, max = 500): string | undefined => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : undefined)
const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined)
const strList = (v: unknown, max = 200): string[] | undefined => (Array.isArray(v) ? v.map((x) => str(x)).filter((x): x is string => !!x).slice(0, max) : undefined)
const httpUrl = (v: unknown): string | undefined => {
  const s = str(v, 2000)
  return s && /^https?:\/\//i.test(s) ? s : undefined
}
// Relative (same site) or http(s) URL, for the logo.
const safeUrl = (v: unknown): string | undefined => {
  const s = str(v, 2000)
  if (!s) return undefined
  return /^[a-z][a-z0-9+.-]*:/i.test(s) ? httpUrl(s) : s.startsWith('//') ? undefined : s
}
const email = (v: unknown): string | undefined => {
  const s = str(v, 200)
  return s && /^[^\s@]+@[^\s@]+$/.test(s) ? s : undefined
}
const clean = <T extends Record<string, unknown>>(o: T): T | undefined => {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]
  return Object.keys(o).length ? o : undefined
}

// Keeps only well-formed values; anything unknown or of the wrong type is ignored.
export function sanitizeSchoolConfig(raw: unknown): SchoolConfig {
  if (!isObject(raw)) return {}
  const school = isObject(raw.school) ? raw.school : {}
  const defaults = isObject(raw.defaults) ? raw.defaults : {}
  const relay = isObject(raw.relay) ? raw.relay : {}
  const nostr = isObject(raw.nostr) ? raw.nostr : {}
  const store = isObject(raw.store) ? raw.store : {}
  const nextcloud = isObject(raw.nextcloud) ? raw.nextcloud : {}
  const features = isObject(raw.features) ? raw.features : {}
  const legal = isObject(raw.legal) ? raw.legal : {}
  const storeNc = isObject(store.nextcloud) ? store.nextcloud : {}
  const language = str(defaults.language)
  const docLanguage = str(defaults.documentLanguage, 20)
  const templates = features.templates
  const ice = Array.isArray(raw.iceServers)
    ? raw.iceServers
        .filter(isObject)
        .map((s) => {
          const urls = (Array.isArray(s.urls) ? s.urls : [s.urls]).map((u) => str(u)).filter((u): u is string => !!u && /^(stun|turns?):/i.test(u))
          return urls.length ? (clean({ urls, username: str(s.username), credential: str(s.credential) }) as RTCIceServer) : null
        })
        .filter((s): s is RTCIceServer => !!s)
    : undefined
  const config: SchoolConfig = {
    version: typeof raw.version === 'number' ? raw.version : undefined,
    school: clean({ name: str(school.name, 120), logo: safeUrl(school.logo), url: httpUrl(school.url) }),
    defaults: clean({
      language: UI_LANGUAGES.find((l) => l === language),
      documentLanguage: docLanguage && /^[a-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/.test(docLanguage) ? docLanguage : undefined,
    }),
    relay: clean({ url: httpUrl(relay.url), only: bool(relay.only) }),
    nostr: clean({ relays: strList(nostr.relays, 20)?.filter((u) => /^wss?:\/\//i.test(u)) }),
    iceServers: ice?.length ? ice : undefined,
    store: clean({
      relay: bool(store.relay),
      nextcloud: store.nextcloud === false ? { enabled: false } : clean({ enabled: bool(storeNc.enabled), folder: str(storeNc.folder) }),
    }),
    nextcloud: clean({
      servers: Array.isArray(nextcloud.servers)
        ? nextcloud.servers
            .map((s) => (typeof s === 'string' ? { url: s } : s))
            .filter(isObject)
            .map((s) => ({ name: str(s.name, 120), url: httpUrl(s.url) }))
            .filter((s) => !!s.url)
            .map((s) => clean(s) as NextcloudPreset)
            .slice(0, 20)
        : undefined,
    }),
    features: clean({
      webmcp: bool(features.webmcp),
      ai: bool(features.ai),
      publicRelays: bool(features.publicRelays),
      templates: templates === 'all' || templates === 'none' ? templates : strList(templates, 500),
      hiddenApps: strList(features.hiddenApps)?.filter((a) => (APP_TYPES as readonly string[]).includes(a)),
    }),
    legal: clean({
      organization: str(legal.organization, 200),
      contactEmail: email(legal.contactEmail),
      privacyEmail: email(legal.privacyEmail),
      dpoEmail: email(legal.dpoEmail),
      privacyUrl: httpUrl(legal.privacyUrl),
      legalNoticeUrl: httpUrl(legal.legalNoticeUrl),
    }),
    locked: strList(raw.locked)?.filter((k): k is LockKey => (LOCK_KEYS as string[]).includes(k)),
  }
  return clean(config as Record<string, unknown>) ?? {}
}

// Section by section: b's sections replace a's.
function merge(a: SchoolConfig, b: SchoolConfig): SchoolConfig {
  const out: Record<string, unknown> = { ...a }
  for (const [k, v] of Object.entries(b)) {
    const prev = out[k]
    out[k] = isObject(prev) && isObject(v) ? { ...prev, ...v } : v
  }
  if (a.locked || b.locked) out.locked = [...new Set([...(a.locked ?? []), ...(b.locked ?? [])])]
  return out as SchoolConfig
}

function readJson(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null')
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private mode: only this page has it.
  }
}

export const configUrl = (): string => new URL('ofimeo.config.json', document.baseURI).href

type FileResult = { state: 'ok'; config: SchoolConfig } | { state: 'none' } | { state: 'unreachable' }

async function fetchFile(timeoutMs: number): Promise<FileResult> {
  try {
    const response = await fetch(configUrl(), { cache: 'no-cache', credentials: 'same-origin', signal: AbortSignal.timeout(timeoutMs) })
    if (response.status === 404 || response.status === 410) return { state: 'none' }
    if (!response.ok) return { state: 'unreachable' }
    // Hosts that answer every path with index.html: no file.
    const text = await response.text()
    try {
      return { state: 'ok', config: sanitizeSchoolConfig(JSON.parse(text)) }
    } catch {
      return { state: 'none' }
    }
  } catch {
    return { state: 'unreachable' }
  }
}

async function loadFile(): Promise<SchoolConfig> {
  const cached = readJson(CACHE_KEY)
  if (typeof document === 'undefined' || typeof fetch === 'undefined') return {}
  // With a copy from the last visit, wait only briefly (a slow network must not hold up the app).
  const result = await fetchFile(cached ? 1500 : 4000)
  if (result.state === 'ok') {
    writeJson(CACHE_KEY, result.config)
    return result.config
  }
  if (result.state === 'none') {
    writeJson(CACHE_KEY, null)
    return {}
  }
  return sanitizeSchoolConfig(cached)
}

const fileConfig = await loadFile()

function trustedRelay(address: string): boolean {
  if (address === location.origin) return true
  const named = fileConfig.relay?.url
  try {
    return !!named && new URL(named).origin === address
  } catch {
    return false
  }
}

function relayConfig(): SchoolConfig {
  const cached = readJson(RELAY_CACHE_KEY) as { address?: string; config?: unknown } | null
  return cached?.address && trustedRelay(cached.address) ? sanitizeSchoolConfig(cached.config) : {}
}

const config: SchoolConfig = merge(relayConfig(), fileConfig)

// Called by connectivity.ts with the `school` object of a relay's /ofimeo/config.
// Remembered for the next start (settings apply before the first render);
// returns true when it differs from what is applied now.
export function rememberRelaySchoolConfig(address: string, raw: unknown): boolean {
  if (!trustedRelay(address)) return false
  const next = sanitizeSchoolConfig(raw)
  const prev = readJson(RELAY_CACHE_KEY) as { address?: string; config?: unknown } | null
  const changed = JSON.stringify(prev?.address === address ? sanitizeSchoolConfig(prev.config) : {}) !== JSON.stringify(next)
  writeJson(RELAY_CACHE_KEY, Object.keys(next).length ? { address, config: next } : null)
  return changed
}

export function schoolConfig(): SchoolConfig {
  return config
}

// True when the school set this configuration (any source).
export const hasSchoolConfig = (): boolean => Object.keys(config).length > 0

export function isLocked(key: LockKey): boolean {
  return !!config.locked?.includes(key)
}

export function webMcpForbidden(): boolean {
  return config.features?.webmcp === false || config.features?.ai === false || isLocked('webmcp')
}

export function aiAllowed(): boolean {
  return config.features?.ai !== false
}

export function publicRelaysAllowed(): boolean {
  return config.features?.publicRelays !== false
}

export function appHidden(type: string): boolean {
  return !!config.features?.hiddenApps?.includes(type)
}

export function templateAllowed(id: string): boolean {
  const list = config.features?.templates
  if (!list || list === 'all') return true
  if (list === 'none') return false
  return list.includes(id)
}

// Store-and-forward backends for the sync layer (defaults: allowed).
export function storeBackends(): { relay: boolean; nextcloud: boolean; nextcloudFolder?: string } {
  const s = config.store
  return { relay: s?.relay !== false, nextcloud: s?.nextcloud?.enabled !== false, nextcloudFolder: s?.nextcloud?.folder }
}
