// Mailbox keys and blob encryption for store-and-forward (docs/store-forward.md).
//
// A mailbox holds one channel of one document (the document itself, or its
// comments). Its id is public to the store, everything else is not:
//
//   pub     Ed25519 key that may write: the channel's signing key (edit key for
//           the document, comment key for comments); for documents without
//           permission keys, one derived from the room secret (everyone edits)
//   id      hex(SHA-256("ofimeo-store-id:v1" || pub)): opaque, the store checks
//           that writes are signed by the key whose hash is the id
//   aes     AES-256-GCM key, HKDF-SHA-256 of the room secret (the `key` every
//           link carries) and the document id + channel: anyone with any link
//           reads, the store never can
//
// Blob = 0x01 | 12-byte IV | AES-GCM(plaintext, AAD = id), and the plaintext
// is a list of entries (lib0 encoding): signed envelopes from network.ts for
// protected documents (verified again by every reader), raw Yjs updates for
// the others.

import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import { fromBase64Url, sign, signerFromSeed, toBase64Url } from '../keys'

const BLOB_VERSION = 1
const PLAIN_VERSION = 1
const utf8 = (s: string) => new TextEncoder().encode(s)

export interface Mailbox {
  id: string
  // base64url public key (sent with writes).
  pub: string
  // Present when this browser may write to the mailbox.
  signer?: CryptoKey
  aes: CryptoKey
}

export interface MailboxKeys {
  // Public key of the channel's signing key (protected documents).
  pub?: string
  signer?: CryptoKey
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

const sha256 = async (data: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', data as BufferSource))
const hex = (data: Uint8Array) => [...data].map((b) => b.toString(16).padStart(2, '0')).join('')

export async function mailboxId(pub: string): Promise<string> {
  return hex(await sha256(concat(utf8('ofimeo-store-id:v1'), fromBase64Url(pub))))
}

export async function openMailbox(docId: string, docKey: string, channel: string, keys: MailboxKeys): Promise<Mailbox> {
  let { pub, signer } = keys
  if (!pub) {
    // No permission keys: whoever has the link edits, so the write key comes from the room secret.
    const derived = await signerFromSeed(await sha256(utf8(`ofimeo-store-legacy:v1:${docId}:${channel}:${docKey}`)))
    pub = derived.pub
    signer = derived.key
  }
  const ikm = await crypto.subtle.importKey('raw', utf8(docKey) as BufferSource, 'HKDF', false, ['deriveKey'])
  const aes = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: utf8('ofimeo-store:v1') as BufferSource, info: utf8(`${docId}:${channel}`) as BufferSource },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
  return { id: await mailboxId(pub), pub, signer, aes }
}

export async function sealBlob(box: Mailbox, entries: Uint8Array[]): Promise<Uint8Array> {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, PLAIN_VERSION)
  encoding.writeVarUint(encoder, entries.length)
  for (const entry of entries) encoding.writeVarUint8Array(encoder, entry)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: utf8(box.id) as BufferSource }, box.aes, encoding.toUint8Array(encoder) as BufferSource)
  return concat(new Uint8Array([BLOB_VERSION]), iv, new Uint8Array(cipher))
}

// Decrypts a blob; throws when it was not made with this mailbox's key.
export async function openBlob(box: Mailbox, blob: Uint8Array): Promise<Uint8Array[]> {
  if (blob[0] !== BLOB_VERSION || blob.length < 13 + 16) throw new Error('Unknown blob format')
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.subarray(1, 13) as BufferSource, additionalData: utf8(box.id) as BufferSource }, box.aes, blob.subarray(13) as BufferSource),
  )
  const decoder = decoding.createDecoder(plain)
  if (decoding.readVarUint(decoder) !== PLAIN_VERSION) throw new Error('Unknown blob content')
  const count = decoding.readVarUint(decoder)
  const entries: Uint8Array[] = []
  for (let i = 0; i < count; i++) entries.push(decoding.readVarUint8Array(decoder))
  return entries
}

// Signature the relay store checks on writes (relay/store.go storeSignedMessage).
export async function signWrite(box: Mailbox, unix: number, base: string, body: Uint8Array): Promise<string> {
  if (!box.signer) throw new Error('This browser cannot write to this mailbox')
  const message = `ofimeo-store:v1\n${box.id}\n${unix}\n${base}\n${hex(await sha256(body))}`
  return toBase64Url(await sign(box.signer, utf8(message)))
}
