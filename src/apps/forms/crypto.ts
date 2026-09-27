// Cryptography of forms (WebCrypto only):
//
// - Everything editors share privately comes from the edit seed of the link
//   (keys.ts), which only edit links carry:
//     vault key     AES-GCM, encrypts the private document sync between editors
//     response key  X25519 key pair; its public half is published (signed) in
//                   the form, so respondents encrypt their answers to it
// - A respondent makes an X25519 key pair per response, derives a shared AES
//   key with the form's public key (ECDH + HKDF) and sends only the ciphertext.
//   Editors derive the same key with the private half. Released grades are
//   encrypted with the same shared secret, so only that respondent can read them.
// - The form definition itself is signed by the edit key (signed sync in
//   network.ts); fingerprint() shows respondents a short code of that key.

import { fromBase64Url, toBase64Url } from '../../core/keys'

const X25519 = { name: 'X25519' }
// PKCS#8 header for a raw 32-byte X25519 private key.
const PKCS8_X25519 = new Uint8Array([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x04, 0x22, 0x04, 0x20])
const enc = new TextEncoder()
const dec = new TextDecoder()

export interface EditorKeys {
  vault: CryptoKey
  responsePrivate: CryptoKey
  responsePublic: string
}

const buf = (b: Uint8Array) => b as BufferSource

async function hkdf(secret: Uint8Array, info: string, usage: 'aes' | 'bits'): Promise<CryptoKey | Uint8Array> {
  const base = await crypto.subtle.importKey('raw', buf(secret), 'HKDF', false, ['deriveBits', 'deriveKey'])
  const params = { name: 'HKDF', hash: 'SHA-256', salt: buf(enc.encode('ofimeo-forms')), info: buf(enc.encode(info)) }
  if (usage === 'bits') return new Uint8Array(await crypto.subtle.deriveBits(params, base, 256))
  return crypto.subtle.deriveKey(params, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

// Keys derived from the edit seed (base64url, from session.keys.link.edit).
export async function editorKeys(editSeed: string): Promise<EditorKeys> {
  const seed = fromBase64Url(editSeed)
  const vault = (await hkdf(seed, 'vault', 'aes')) as CryptoKey
  const priv = (await hkdf(seed, 'response-key', 'bits')) as Uint8Array
  const pkcs8 = new Uint8Array(PKCS8_X25519.length + 32)
  pkcs8.set(PKCS8_X25519)
  pkcs8.set(priv, PKCS8_X25519.length)
  const responsePrivate = await crypto.subtle.importKey('pkcs8', pkcs8, X25519, true, ['deriveBits'])
  const jwk = await crypto.subtle.exportKey('jwk', responsePrivate)
  return { vault, responsePrivate, responsePublic: jwk.x! }
}

export const x25519Available = async (): Promise<boolean> => {
  try {
    await crypto.subtle.generateKey(X25519, false, ['deriveBits'])
    return true
  } catch {
    return false
  }
}

async function sharedKey(priv: CryptoKey, pub: string, info: string): Promise<CryptoKey> {
  const pubKey = await crypto.subtle.importKey('raw', buf(fromBase64Url(pub)), X25519, true, [])
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'X25519', public: pubKey } as EcdhKeyDeriveParams, priv, 256))
  return (await hkdf(bits, info, 'aes')) as CryptoKey
}

async function aesSeal(key: CryptoKey, data: Uint8Array, aad: string): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: buf(enc.encode(aad)) }, key, buf(data)))
  const out = new Uint8Array(12 + ct.length)
  out.set(iv)
  out.set(ct, 12)
  return out
}

async function aesOpen(key: CryptoKey, data: Uint8Array, aad: string): Promise<Uint8Array> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf(data.slice(0, 12)), additionalData: buf(enc.encode(aad)) }, key, buf(data.slice(12)))
  return new Uint8Array(plain)
}

// ---------- Vault (private document sync between editors) ----------

export const vaultSeal = (key: CryptoKey, data: Uint8Array, docId: string) => aesSeal(key, data, `vault:${docId}`)
export const vaultOpen = (key: CryptoKey, data: Uint8Array, docId: string) => aesOpen(key, data, `vault:${docId}`)

// ---------- Responses ----------

export interface SealedResponse {
  v: 1
  form: string
  // Respondent's public key (base64url) and the ciphertext (base64url).
  epk: string
  ct: string
}

// Encrypts a response to the form's public key. The respondent keeps `privateKey`
// (JWK) to read a released grade later.
export async function sealResponse(formId: string, formPublic: string, payload: unknown): Promise<{ sealed: SealedResponse; privateKey: JsonWebKey; epk: string }> {
  const pair = (await crypto.subtle.generateKey(X25519, true, ['deriveBits'])) as CryptoKeyPair
  const epk = toBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)))
  const key = await sharedKey(pair.privateKey, formPublic, 'response')
  const ct = await aesSeal(key, enc.encode(JSON.stringify({ ...(payload as object), epk })), `response:${formId}`)
  return { sealed: { v: 1, form: formId, epk, ct: toBase64Url(ct) }, privateKey: await crypto.subtle.exportKey('jwk', pair.privateKey), epk }
}

export async function openResponse<T>(formId: string, responsePrivate: CryptoKey, sealed: SealedResponse): Promise<T> {
  if (sealed.form !== formId) throw new Error('Response for another form')
  const key = await sharedKey(responsePrivate, sealed.epk, 'response')
  const data = JSON.parse(dec.decode(await aesOpen(key, fromBase64Url(sealed.ct), `response:${formId}`))) as T & { epk: string }
  if (data.epk !== sealed.epk) throw new Error('Key mismatch')
  return data
}

// A released grade, readable only by the respondent (and editors).
export async function sealResult(formId: string, responsePrivate: CryptoKey, epk: string, payload: unknown): Promise<string> {
  const key = await sharedKey(responsePrivate, epk, 'result')
  return toBase64Url(await aesSeal(key, enc.encode(JSON.stringify(payload)), `result:${formId}`))
}

export async function openResult<T>(formId: string, privateKey: JsonWebKey, formPublic: string, sealed: string): Promise<T> {
  const priv = await crypto.subtle.importKey('jwk', privateKey, X25519, false, ['deriveBits'])
  const key = await sharedKey(priv, formPublic, 'result')
  return JSON.parse(dec.decode(await aesOpen(key, fromBase64Url(sealed), `result:${formId}`))) as T
}

// Short code of the form owner's signing key, e.g. "K3F9-2QXA-7M1C".
export async function fingerprint(verifyKey: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', buf(enc.encode(`ofimeo-form:${verifyKey}`))))
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
  const chars = [...hash.slice(0, 12)].map((b) => alphabet[b % 32]).join('')
  return chars.match(/.{4}/g)!.join('-')
}
