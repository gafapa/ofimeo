import { t } from './i18n'
// Permission keys carried by document links, and Ed25519 signing.
//
// A protected document has two key pairs, both derived from random seeds:
//   E (edit):    signs changes to the document itself
//   C (comment): signs changes to the comments channel (session.commentsDoc)
// The C seed is derived from the E seed, so an edit link carries one secret.
//
//   edit link     key, edit=<E seed>                         (everything is derived)
//   comment link  key, comment=<C seed>, verify=<E public>
//   view link     key, verify=<E public>, cverify=<C public>
//
// `key` is the room password (needed to connect at all). Access comes from the
// secrets a link holds, never from a flag, so editing a lower-access URL cannot
// upgrade it: without the seed nobody can produce signatures peers accept.
// Links without any of these parameters are legacy documents: unsigned, full edit.

export type Access = 'edit' | 'comment' | 'view'

// Key material as it appears in links and in the local document index.
export interface LinkKeys {
  edit?: string
  comment?: string
  verify?: string
  cverify?: string
}

export interface DocKeys {
  access: Access
  // False for legacy documents (no keys): no signatures, everyone edits.
  signed: boolean
  // Complete key material this browser holds (secrets only up to its access).
  link: LinkKeys
  editSigner?: CryptoKey
  editVerifier?: CryptoKey
  commentSigner?: CryptoKey
  commentVerifier?: CryptoKey
}

export const KEY_PARAMS = ['edit', 'comment', 'verify', 'cverify'] as const

// PKCS#8 header for a raw 32-byte Ed25519 private key (seed).
const PKCS8_PREFIX = new Uint8Array([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20])
const ALGO = { name: 'Ed25519' }

// WebCrypto only exists on secure origins (https, localhost).
export const cryptoAvailable = () => typeof crypto !== 'undefined' && !!crypto.subtle

// A new edit seed for a new protected document, or {} (legacy) where WebCrypto is unavailable.
export function newLinkKeys(): LinkKeys {
  return cryptoAvailable() ? { edit: toBase64Url(crypto.getRandomValues(new Uint8Array(32))) } : {}
}

export function linkKeysFromParams(params: URLSearchParams): LinkKeys {
  const keys: LinkKeys = {}
  for (const name of KEY_PARAMS) {
    const value = params.get(name)
    if (value) keys[name] = value
  }
  return keys
}

export const hasKeys = (keys: LinkKeys | undefined) => !!keys && KEY_PARAMS.some((k) => keys[k])

// The access a set of keys grants (without checking consistency).
export function accessOf(keys: LinkKeys | undefined): Access {
  if (!hasKeys(keys) || keys!.edit) return 'edit'
  if (keys!.comment) return 'comment'
  return 'view'
}

const RANK: Record<Access, number> = { view: 0, comment: 1, edit: 2 }
export const accessRank = (a: Access) => RANK[a]

// Link parameters granting `access` (never more than what `keys` holds).
export function keysForAccess(keys: LinkKeys, access: Access): LinkKeys {
  if (!hasKeys(keys)) return {}
  if (access === 'edit' && keys.edit) return { edit: keys.edit }
  if (access !== 'view' && keys.comment) return { comment: keys.comment, verify: keys.verify }
  return { verify: keys.verify, cverify: keys.cverify }
}

// Derives every key a link allows. Throws when the link is inconsistent
// (e.g. a secret that does not match the public key it came with).
export async function resolveKeys(input: LinkKeys): Promise<DocKeys> {
  if (!hasKeys(input)) return { access: 'edit', signed: false, link: {} }
  if (!cryptoAvailable()) throw new Error(t('Protected documents need a secure (https) connection'))
  const link: LinkKeys = {}
  const out: DocKeys = { access: 'view', signed: true, link }
  if (input.edit) {
    const edit = await signerFromSeed(fromBase64Url(input.edit))
    if (input.verify && input.verify !== edit.pub) throw new Error(t('The edit key does not belong to this document'))
    link.edit = input.edit
    link.verify = edit.pub
    out.editSigner = edit.key
    link.comment = toBase64Url(await deriveCommentSeed(fromBase64Url(input.edit)))
    out.access = 'edit'
  } else {
    link.verify = input.verify
  }
  const commentSeed = link.comment ?? input.comment
  if (commentSeed) {
    const comment = await signerFromSeed(fromBase64Url(commentSeed))
    if (input.cverify && input.cverify !== comment.pub) throw new Error(t('The comment key does not belong to this document'))
    link.comment = commentSeed
    link.cverify = comment.pub
    out.commentSigner = comment.key
    if (out.access === 'view') out.access = 'comment'
  } else {
    link.cverify = input.cverify
  }
  if (!link.verify || !link.cverify) throw new Error(t('The link is incomplete'))
  out.editVerifier = await importVerifier(link.verify)
  out.commentVerifier = await importVerifier(link.cverify)
  return out
}

// Combines keys stored in this browser (null: unknown document) with keys from
// a link. Stored public keys win: a link carrying different keys for the same
// document (or keys for a known legacy document) is ignored.
export async function mergeKeys(stored: LinkKeys | null, fromLink: LinkKeys): Promise<{ keys: DocKeys; ignoredLink: boolean }> {
  if (!stored) return { keys: await resolveKeys(fromLink), ignoredLink: false }
  const base = await resolveKeys(stored)
  if (!base.signed) return { keys: base, ignoredLink: hasKeys(fromLink) }
  if (!hasKeys(fromLink)) return { keys: base, ignoredLink: false }
  try {
    const other = await resolveKeys({ ...fromLink, verify: fromLink.verify ?? base.link.verify, cverify: fromLink.cverify ?? base.link.cverify })
    if (other.link.verify !== base.link.verify || other.link.cverify !== base.link.cverify) return { keys: base, ignoredLink: true }
    return { keys: accessRank(other.access) > accessRank(base.access) ? other : base, ignoredLink: false }
  } catch {
    return { keys: base, ignoredLink: true }
  }
}

export async function signerFromSeed(seed: Uint8Array): Promise<{ key: CryptoKey; pub: string }> {
  if (seed.length !== 32) throw new Error(t('Invalid key'))
  const pkcs8 = new Uint8Array(PKCS8_PREFIX.length + 32)
  pkcs8.set(PKCS8_PREFIX)
  pkcs8.set(seed, PKCS8_PREFIX.length)
  // Extractable only to read the public half (JWK "x"); the key never leaves this module.
  const key = await crypto.subtle.importKey('pkcs8', pkcs8, ALGO, true, ['sign'])
  const jwk = await crypto.subtle.exportKey('jwk', key)
  return { key, pub: jwk.x! }
}

function importVerifier(pub: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', fromBase64Url(pub) as BufferSource, ALGO, false, ['verify'])
}

async function deriveCommentSeed(editSeed: Uint8Array): Promise<Uint8Array> {
  // Kept from the project's former name: existing comment links derive from it.
  const label = new TextEncoder().encode('words-online:comment-key:')
  const data = new Uint8Array(label.length + editSeed.length)
  data.set(label)
  data.set(editSeed, label.length)
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data))
}

export async function sign(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign(ALGO, key, data as BufferSource))
}

export async function verify(key: CryptoKey, signature: Uint8Array, data: Uint8Array): Promise<boolean> {
  try {
    return await crypto.subtle.verify(ALGO, key, signature as BufferSource, data as BufferSource)
  } catch {
    return false
  }
}

export function toBase64Url(data: Uint8Array): string {
  let s = ''
  for (const b of data) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(text: string): Uint8Array {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}
