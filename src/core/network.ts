// Yjs provider over WebRTC using Trystero. Public Nostr relays (WebSocket)
// are only used to discover peers and exchange connection offers, encrypted
// with the room key; document data flows directly between browsers.
// Every peer also relays what it receives to its other peers, so the
// document converges even if some pair of peers cannot connect directly.
//
// One room carries several channels (one Trystero action each): the document
// ('yjs', with awareness) and the comments document ('cmt').
//
// Protected documents (see keys.ts) use signed sync instead of plain Yjs sync:
// - A change is only applied when it arrives as an envelope signed with the
//   channel's signing key (edit key for the document, comment key for the
//   comments). Signatures cover a context (document id + channel) and the update.
// - Holders of the signing key sign their local changes (batched) and answer a
//   peer's state vector with a freshly signed diff.
// - Everyone else never sends its own changes (a viewer who forces a local
//   edit keeps it to itself). It forwards verified envelopes verbatim and keeps
//   them in a signed log (IndexedDB), which it replays to peers that join, so
//   viewers relay the document even while no editor is online.
// - Signers periodically broadcast a signed checkpoint (the full state);
//   receivers then drop logged envelopes the checkpoint contains, which keeps
//   the log bounded.
// - Awareness (presence, cursors) is not signed: it never changes documents.
// Legacy documents (no keys) use the plain y-protocols sync, as before.
//
// A school relay (connectivity.ts) adds its Nostr relay and its STUN/TURN
// servers; without one, Trystero's defaults are used.
//
// Store-and-forward (store-forward/) keeps encrypted copies of the channels in
// mailboxes, for people who are never online at the same time. It uses
// Channel.sealForStore (signers) and Channel.receiveStored (everyone).

import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import { joinRoom, type MessageAction, type Room } from '@trystero-p2p/nostr'
import { APP_ID, nostrRelays, rtcConfig } from './connectivity'
import { kvGet, kvSet } from './idb'
import { sign, toBase64Url, verify } from './keys'

const MSG_SYNC = 0
const MSG_AWARENESS = 1
const MSG_SIGNED = 2
const KIND_UPDATE = 0
const KIND_CHECKPOINT = 1
// Signed messages seen (own or relayed) before a signer sends a checkpoint.
const CHECKPOINT_AFTER = 60
const CHECKPOINT_IDLE_MS = 8000
const EMPTY_UPDATE = [0, 0]

// Used as Yjs transaction / awareness origin to know where a change came from.
class RemotePeer {
  readonly clientIds = new Set<number>()
  constructor(readonly id: string) {}
}

// True for Yjs transactions applied from the network.
export const isRemoteOrigin = (origin: unknown) => origin instanceof RemotePeer

// Origin of changes pulled from a store-and-forward mailbox (store-forward/).
// Like a peer that is never in the room: what it brings is relayed to everyone.
export const STORE_ORIGIN: unknown = new RemotePeer('store')

export interface ChannelSecurity {
  // Verifies envelopes; its presence switches the channel to signed sync.
  verifier: CryptoKey
  // Present when this browser may change the channel's document.
  signer?: CryptoKey
  // Bound into every signature (document id + channel name).
  context: string
  // IndexedDB key of the signed log kept by non-signers (omit: in memory only).
  logKey?: string
}

export interface RoomOptions {
  roomId: string
  password: string
  // Optional custom Nostr relays (default: the school relay and/or Trystero's public list).
  relays?: string[]
  // Signed sync for the document channel (omit for legacy documents).
  security?: ChannelSecurity
}

// Rooms open in this page (for the connection test).
export const openRooms = new Set<RoomProvider>()

export class RoomProvider {
  private readonly room: Room
  readonly peers = new Map<string, RemotePeer>()
  private readonly channels: Channel[] = []
  private listeners: ((count: number) => void)[] = []
  private readonly main: Channel

  constructor(
    readonly doc: Y.Doc,
    readonly awareness: awarenessProtocol.Awareness,
    options: RoomOptions,
  ) {
    const relays = nostrRelays(options.relays)
    const rtc = rtcConfig()
    this.room = joinRoom(
      {
        appId: APP_ID,
        password: options.password,
        ...(relays?.length ? { relayConfig: { urls: relays, redundancy: relays.length } } : {}),
        ...(rtc ? { rtcConfig: rtc } : {}),
      },
      options.roomId,
    )
    openRooms.add(this)
    this.main = this.addChannel('yjs', doc, options.security, awareness)

    this.room.onPeerJoin = (peerId) => {
      this.peers.set(peerId, new RemotePeer(peerId))
      this.emitPeers()
      this.channels.forEach((c) => c.greet(peerId))
    }

    this.room.onPeerLeave = (peerId) => {
      const peer = this.peers.get(peerId)
      if (!peer) return
      this.peers.delete(peerId)
      // Drop presence only for clients no other peer can still vouch for.
      const stillReachable = new Set([...this.peers.values()].flatMap((p) => [...p.clientIds]))
      const gone = [...peer.clientIds].filter((id) => id !== doc.clientID && !stillReachable.has(id))
      awarenessProtocol.removeAwarenessStates(awareness, gone, peer)
      this.emitPeers()
    }
  }

  // Syncs another document in the same room (e.g. comments). `name` is the
  // Trystero action name (at most 12 bytes).
  addChannel(name: string, doc: Y.Doc, security?: ChannelSecurity, awareness?: awarenessProtocol.Awareness): Channel {
    const channel = new Channel(this, this.room.makeAction<Uint8Array>(name), doc, security, awareness)
    this.channels.push(channel)
    return channel
  }

  // Raw message action for app protocols that are not a Yjs document (e.g. form
  // responses, forms/transport.ts). `name` is the Trystero action name (at most 12 bytes).
  makeAction(name: string): MessageAction<Uint8Array> {
    return this.room.makeAction<Uint8Array>(name)
  }

  // Resolves when signed logs are loaded (call before relying on relaying).
  whenReady(): Promise<void> {
    return Promise.all(this.channels.map((c) => c.ready)).then(() => undefined)
  }

  get peerCount(): number {
    return this.peers.size
  }

  // WebRTC connections to the peers in this room, by peer id.
  connections(): Record<string, RTCPeerConnection> {
    return this.room.getPeers()
  }

  onPeersChange(listener: (count: number) => void): void {
    this.listeners.push(listener)
  }

  async destroy(): Promise<void> {
    openRooms.delete(this)
    this.channels.forEach((c) => c.destroy())
    await this.room.leave()
  }

  peer(peerId: string): RemotePeer {
    let peer = this.peers.get(peerId)
    if (!peer) {
      peer = new RemotePeer(peerId)
      this.peers.set(peerId, peer)
      this.emitPeers()
    }
    return peer
  }

  private emitPeers(): void {
    this.listeners.forEach((l) => l(this.peers.size))
  }

  // Development aid: the document channel.
  get mainChannel(): Channel {
    return this.main
  }
}

export class Channel {
  readonly ready: Promise<void>
  private readonly log: SignedLog | null
  private readonly seen = new Set<string>()
  private readonly context: Uint8Array
  private pending: Uint8Array[] = []
  private flushTimer = 0
  private signing: Promise<unknown> = Promise.resolve()
  private sinceCheckpoint = 0
  private checkpointTimer = 0
  // Origin of changes replayed from the signed log.
  private readonly logOrigin = new RemotePeer('signed-log')

  constructor(
    private readonly provider: RoomProvider,
    private readonly action: MessageAction<Uint8Array>,
    readonly doc: Y.Doc,
    readonly security?: ChannelSecurity,
    readonly awareness?: awarenessProtocol.Awareness,
  ) {
    // Signature context, kept from the project's former name: stored signed logs depend on it.
    this.context = new TextEncoder().encode(`words-online:v1:${security?.context ?? ''}:`)
    action.onMessage = (data, { peerId }) => this.onMessage(peerId, toBytes(data))
    // Non-signers keep verified envelopes to relay them to later peers.
    this.log = security && !security.signer ? new SignedLog(security.logKey) : null
    this.ready = this.log ? this.log.load().then(() => this.replayLog()) : Promise.resolve()
    doc.on('update', this.onDocUpdate)
    awareness?.on('update', this.onAwarenessUpdate)
  }

  get signed(): boolean {
    return !!this.security
  }

  get canWrite(): boolean {
    return !this.security || !!this.security.signer
  }

  destroy(): void {
    this.doc.off('update', this.onDocUpdate)
    this.awareness?.off('update', this.onAwarenessUpdate)
    clearTimeout(this.flushTimer)
    clearTimeout(this.checkpointTimer)
  }

  // First messages to a peer that just joined.
  greet(peerId: string): void {
    const sync = encoding.createEncoder()
    encoding.writeVarUint(sync, MSG_SYNC)
    syncProtocol.writeSyncStep1(sync, this.doc)
    this.send(encoding.toUint8Array(sync), peerId)
    if (this.awareness) {
      const states = [...this.awareness.getStates().keys()]
      if (states.length > 0) this.send(this.encodeAwareness(states), peerId)
    }
  }

  private onMessage(peerId: string, data: Uint8Array): void {
    const peer = this.provider.peer(peerId)
    try {
      const decoder = decoding.createDecoder(data)
      const type = decoding.readVarUint(decoder)
      if (type === MSG_AWARENESS) {
        if (this.awareness) awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), peer)
      } else if (type === MSG_SYNC) {
        if (!this.security) {
          const reply = encoding.createEncoder()
          encoding.writeVarUint(reply, MSG_SYNC)
          syncProtocol.readSyncMessage(decoder, reply, this.doc, peer)
          if (encoding.length(reply) > 1) this.send(encoding.toUint8Array(reply), peerId)
        } else if (decoding.readVarUint(decoder) === syncProtocol.messageYjsSyncStep1) {
          // Unsigned state (step 2, updates) is never accepted here.
          void this.answerStep1(peerId, decoding.readVarUint8Array(decoder))
        }
      } else if (type === MSG_SIGNED && this.security) {
        void this.receiveSigned(peer, data)
      }
    } catch (err) {
      console.warn('Ignoring malformed message', err)
    }
  }

  // A peer told us its state: send what it misses, signed.
  private async answerStep1(peerId: string, stateVector: Uint8Array): Promise<void> {
    await this.ready
    if (this.security?.signer) {
      const diff = Y.encodeStateAsUpdate(this.doc, stateVector)
      if (isEmptyUpdate(diff)) return
      const full = Y.decodeStateVector(stateVector).size === 0
      this.send(await this.seal(full ? KIND_CHECKPOINT : KIND_UPDATE, diff), peerId)
    } else if (this.log) {
      for (const entry of this.log.entries) this.send(entry, peerId)
    }
  }

  // A signed envelope for the store: a diff, or the full state (checkpoint).
  async sealForStore(update: Uint8Array, checkpoint = false): Promise<Uint8Array> {
    if (!this.security?.signer) throw new Error('This browser cannot sign changes')
    const sealed = this.signing.then(() => this.seal(checkpoint ? KIND_CHECKPOINT : KIND_UPDATE, update))
    this.signing = sealed.catch(() => undefined)
    return sealed
  }

  // Applies a signed envelope pulled from a store (and relays it to the peers
  // here). Returns its update when the signature is valid, else null.
  async receiveStored(data: Uint8Array): Promise<Uint8Array | null> {
    if (!this.security) return null
    const envelope = parseEnvelope(data)
    if (!envelope) return null
    await this.ready
    if (!(await verify(this.security.verifier, envelope.signature, this.signedBytes(envelope.kind, envelope.update)))) {
      console.warn('Rejected a stored change with an invalid signature')
      return null
    }
    const id = toBase64Url(envelope.signature)
    if (!this.seen.has(id)) {
      this.seen.add(id)
      Y.applyUpdate(this.doc, envelope.update, STORE_ORIGIN)
      this.log?.add(data, envelope)
      this.broadcast(data, null)
    }
    return envelope.update
  }

  private async receiveSigned(peer: RemotePeer, data: Uint8Array): Promise<void> {
    const envelope = parseEnvelope(data)
    if (!envelope) return
    await this.ready
    const id = toBase64Url(envelope.signature)
    if (this.seen.has(id)) return
    this.seen.add(id)
    if (!(await verify(this.security!.verifier, envelope.signature, this.signedBytes(envelope.kind, envelope.update)))) {
      console.warn('Rejected a change with an invalid signature')
      return
    }
    Y.applyUpdate(this.doc, envelope.update, peer)
    this.log?.add(data, envelope)
    this.broadcast(data, peer)
    if (envelope.kind === KIND_CHECKPOINT) this.sinceCheckpoint = 0
    else this.noteActivity()
  }

  private onDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (!this.security) {
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MSG_SYNC)
      syncProtocol.writeUpdate(encoder, update)
      this.broadcast(encoding.toUint8Array(encoder), origin)
      return
    }
    // Remote changes were relayed verbatim on arrival; changes without the
    // signing key stay in this browser.
    if (origin instanceof RemotePeer || !this.security.signer) return
    this.pending.push(update)
    if (!this.flushTimer) this.flushTimer = window.setTimeout(this.flush, 30)
  }

  private flush = (): void => {
    this.flushTimer = 0
    const updates = this.pending
    this.pending = []
    if (!updates.length) return
    const update = updates.length === 1 ? updates[0] : Y.mergeUpdates(updates)
    this.signing = this.signing.then(async () => {
      this.broadcast(await this.seal(KIND_UPDATE, update), null)
      this.noteActivity()
    })
  }

  // Signers send a checkpoint after enough activity, once things are quiet.
  private noteActivity(): void {
    this.sinceCheckpoint++
    if (!this.security?.signer || this.sinceCheckpoint < CHECKPOINT_AFTER) return
    clearTimeout(this.checkpointTimer)
    // Jitter, so several editors rarely send one at the same time.
    this.checkpointTimer = window.setTimeout(() => {
      if (this.sinceCheckpoint < CHECKPOINT_AFTER || this.provider.peerCount === 0) return
      this.sinceCheckpoint = 0
      this.signing = this.signing.then(async () => this.broadcast(await this.seal(KIND_CHECKPOINT, Y.encodeStateAsUpdate(this.doc)), null))
    }, CHECKPOINT_IDLE_MS + Math.random() * 4000)
  }

  private async seal(kind: number, update: Uint8Array): Promise<Uint8Array> {
    const signature = await sign(this.security!.signer!, this.signedBytes(kind, update))
    this.seen.add(toBase64Url(signature))
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MSG_SIGNED)
    encoding.writeVarUint(encoder, kind)
    encoding.writeVarUint8Array(encoder, update)
    encoding.writeVarUint8Array(encoder, signature)
    return encoding.toUint8Array(encoder)
  }

  private signedBytes(kind: number, update: Uint8Array): Uint8Array {
    const out = new Uint8Array(this.context.length + 1 + update.length)
    out.set(this.context)
    out[this.context.length] = kind
    out.set(update, this.context.length + 1)
    return out
  }

  // Applies the stored (already verified) envelopes, in case the local copy lacks them.
  private replayLog(): void {
    if (!this.log) return
    for (const entry of this.log.entries) {
      const envelope = parseEnvelope(entry)
      if (!envelope) continue
      this.seen.add(toBase64Url(envelope.signature))
      Y.applyUpdate(this.doc, envelope.update, this.logOrigin)
    }
  }

  private onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ): void => {
    if (origin instanceof RemotePeer) {
      added.forEach((id) => origin.clientIds.add(id))
      updated.forEach((id) => origin.clientIds.add(id))
      removed.forEach((id) => origin.clientIds.delete(id))
    }
    this.broadcast(this.encodeAwareness([...added, ...updated, ...removed]), origin)
  }

  private encodeAwareness(clients: number[]): Uint8Array {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MSG_AWARENESS)
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness!, clients))
    return encoding.toUint8Array(encoder)
  }

  private broadcast(data: Uint8Array, except: unknown): void {
    const targets = [...this.provider.peers.values()].filter((p) => p !== except).map((p) => p.id)
    if (targets.length > 0) this.send(data, targets)
  }

  private send(data: Uint8Array, target: string | string[]): void {
    this.action.send(data, { target }).catch(() => {
      // Peer vanished mid-send; the next sync on reconnect recovers the state.
    })
  }
}

interface Envelope {
  kind: number
  update: Uint8Array
  signature: Uint8Array
}

function parseEnvelope(data: Uint8Array): Envelope | null {
  try {
    const decoder = decoding.createDecoder(data)
    if (decoding.readVarUint(decoder) !== MSG_SIGNED) return null
    const kind = decoding.readVarUint(decoder)
    const update = decoding.readVarUint8Array(decoder)
    const signature = decoding.readVarUint8Array(decoder)
    return { kind, update, signature }
  } catch {
    return null
  }
}

// Verified envelopes kept by browsers that cannot sign, persisted in IndexedDB.
class SignedLog {
  entries: Uint8Array[] = []
  private saveTimer = 0

  constructor(private readonly key?: string) {}

  async load(): Promise<void> {
    if (!this.key) return
    const stored = await kvGet<Uint8Array[]>(this.key)
    if (Array.isArray(stored)) this.entries = stored
  }

  add(data: Uint8Array, envelope: Envelope): void {
    if (envelope.kind === KIND_CHECKPOINT) this.entries = this.entries.filter((e) => !containedIn(e, envelope.update))
    this.entries.push(data)
    this.save()
  }

  private save(): void {
    if (!this.key) return
    clearTimeout(this.saveTimer)
    this.saveTimer = window.setTimeout(() => void kvSet(this.key!, this.entries), 1000)
  }
}

// Whether an envelope's changes are all part of a checkpoint state.
function containedIn(entry: Uint8Array, checkpoint: Uint8Array): boolean {
  const envelope = parseEnvelope(entry)
  if (!envelope) return true
  const doc = new Y.Doc()
  Y.applyUpdate(doc, checkpoint)
  let changed = false
  doc.on('update', () => (changed = true))
  Y.applyUpdate(doc, envelope.update)
  const pending = doc.store.pendingStructs !== null || doc.store.pendingDs !== null
  doc.destroy()
  return !changed && !pending
}

function isEmptyUpdate(update: Uint8Array): boolean {
  return update.length === EMPTY_UPDATE.length && update.every((b, i) => b === EMPTY_UPDATE[i])
}

function toBytes(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  throw new Error('Unexpected payload type')
}
