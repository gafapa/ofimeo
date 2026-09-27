// Form messages over the document's peer-to-peer room (one Trystero action, 'form'):
//
//   SUBMIT  a sealed response (crypto.ts), broadcast by the respondent until an
//           editor acknowledges it; only editors can open it
//   VAULT   the private document sync between editors (y-protocols sync
//           messages encrypted with the vault key); others cannot decrypt it
//
// Nothing here is stored by respondents: they only send their own responses.

import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import type { Session } from '../../core/session'
import { vaultOpen, vaultSeal, type SealedResponse } from './crypto'

const TAG_SUBMIT = 1
const TAG_VAULT = 2
export const VAULT_ORIGIN = Symbol('forms-vault')
const enc = new TextEncoder()
const dec = new TextDecoder()

export interface Vault {
  key: CryptoKey
  doc: Y.Doc
}

export class FormsTransport {
  private readonly action
  private readonly known = new Set<string>()
  private readonly heard = new Set<string>()
  private joinListeners: (() => void)[] = []
  private timer = 0
  onSubmit?: (sealed: SealedResponse) => void
  // Development aid (tests): every payload this browser received.
  readonly received: Uint8Array[] = []

  constructor(
    private readonly session: Session,
    private readonly vault?: Vault,
  ) {
    this.action = session.room.makeAction('form')
    this.action.onMessage = (data, { peerId }) => void this.onMessage(peerId, toBytes(data))
    session.room.onPeersChange(() => this.checkPeers())
    vault?.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === VAULT_ORIGIN) return
      const encoder = encoding.createEncoder()
      syncProtocol.writeUpdate(encoder, update)
      void this.sendVault(encoding.toUint8Array(encoder), null)
    })
    this.checkPeers()
    // Peers that joined before their app registered this action missed the greeting.
    this.timer = window.setInterval(() => this.greetAll(), 15000)
  }

  destroy(): void {
    clearInterval(this.timer)
  }

  get peerCount(): number {
    return this.session.room.peerCount
  }

  // Called when a peer joins (respondents flush their outbox).
  onPeerJoin(listener: () => void): void {
    this.joinListeners.push(listener)
  }

  submit(sealed: SealedResponse): void {
    this.send(frame(TAG_SUBMIT, enc.encode(JSON.stringify(sealed))), null)
  }

  private checkPeers(): void {
    const ids = [...this.session.room.peers.keys()]
    let joined = false
    for (const id of ids) {
      if (this.known.has(id)) continue
      this.known.add(id)
      this.greet(id)
      joined = true
    }
    for (const id of [...this.known]) if (!ids.includes(id)) (this.known.delete(id), this.heard.delete(id))
    if (joined) this.joinListeners.forEach((l) => l())
  }

  private greetAll(): void {
    for (const id of this.session.room.peers.keys()) this.greet(id)
  }

  private greet(peerId: string): void {
    if (!this.vault) return
    const encoder = encoding.createEncoder()
    syncProtocol.writeSyncStep1(encoder, this.vault.doc)
    void this.sendVault(encoding.toUint8Array(encoder), peerId)
  }

  private async onMessage(peerId: string, data: Uint8Array): Promise<void> {
    if (import.meta.env.DEV) this.received.push(data)
    if (!this.heard.has(peerId)) {
      // First message from this peer: it is listening now, greet it (again).
      this.heard.add(peerId)
      this.greet(peerId)
      this.joinListeners.forEach((l) => l())
    }
    const tag = data[0]
    const body = data.subarray(1)
    if (tag === TAG_SUBMIT) {
      if (!this.onSubmit) return
      try {
        this.onSubmit(JSON.parse(dec.decode(body)) as SealedResponse)
      } catch {
        // Malformed.
      }
    } else if (tag === TAG_VAULT && this.vault) {
      let plain: Uint8Array
      try {
        plain = await vaultOpen(this.vault.key, body, this.session.docId)
      } catch {
        return // not for us (another form, or not an editor)
      }
      try {
        const reply = encoding.createEncoder()
        syncProtocol.readSyncMessage(decoding.createDecoder(plain), reply, this.vault.doc, VAULT_ORIGIN)
        if (encoding.length(reply) > 0) void this.sendVault(encoding.toUint8Array(reply), peerId)
      } catch (err) {
        console.warn('Ignoring malformed form message', err)
      }
    }
  }

  private async sendVault(message: Uint8Array, target: string | null): Promise<void> {
    if (!this.vault) return
    this.send(frame(TAG_VAULT, await vaultSeal(this.vault.key, message, this.session.docId)), target)
  }

  private send(data: Uint8Array, target: string | null): void {
    if (!this.session.room.peerCount) return
    this.action.send(data, target ? { target } : undefined).catch(() => {
      // Peer gone; retried later.
    })
  }
}

function frame(tag: number, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(body.length + 1)
  out[0] = tag
  out.set(body, 1)
  return out
}

function toBytes(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  return new Uint8Array()
}
