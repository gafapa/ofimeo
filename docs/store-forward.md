# Store-and-forward sync (encrypted mailboxes)

Ofimeo syncs documents directly between browsers (WebRTC). That only works
while two people have the document open at the same time. Store-and-forward
closes the gap: a student edits in class and continues at home, a teacher
corrects at night, and everyone gets the others' changes even though they were
never online together.

Each browser that may change a document leaves its changes, **encrypted**, in a
*mailbox*; whoever opens the document later pulls what they missed and merges
it (Yjs CRDT, so the order does not matter). Two kinds of store are supported:

| Store | Where | Who can write | Turned on by |
| --- | --- | --- | --- |
| **Ofimeo Relay** | `<relay>/ofimeo/store`, files in the relay's data folder | holders of the edit key (comments: the comment key) — checked by the relay | the browser (connection test), the relay (`--store-default-on`) or the school config (`store.relay`) |
| **Nextcloud** | a folder of the user's Nextcloud (WebDAV), default `/Ofimeo/Sync` | whoever may write in that folder (Nextcloud permissions); readers still verify every change | the browser, or the school config (`store.nextcloud`) |

Public Nostr relays are **never** used for storage.

## What is stored

For every document there are two mailboxes: the document itself and its
comments. For each mailbox:

- **Mailbox id**: `hex(SHA-256("ofimeo-store-id:v1" ‖ pub))`, where `pub` is
  the Ed25519 public key allowed to write: the document's edit key (the
  `verify` value in links), the comment key for comments, or — for older
  documents without permission keys, where everyone edits — a key derived from
  the room secret. The id is opaque: it reveals nothing about the document.
- **Blobs**: `0x01 ‖ IV (12 bytes) ‖ AES-256-GCM(plaintext, AAD = mailbox id)`.
  The AES key is HKDF-SHA-256 of the room secret (the `key` parameter every
  link carries, never sent to any server — it is in the URL fragment), with
  salt `ofimeo-store:v1` and info `<document id>:<channel>`.
- **Plaintext**: a list of entries. For protected documents each entry is a
  signed envelope (the same Ed25519-signed Yjs update peers exchange); readers
  verify the signature before applying it, exactly as for a peer. For older
  documents, raw Yjs updates.

Code: `src/core/store-forward/` (`crypto.ts` keys and formats, `backends.ts`
relay and Nextcloud, `index.ts` the sync engine), `relay/store.go`.

## How syncing works

The browser keeps, per store and mailbox, a cursor (what it has read) and a
*shadow* of what the mailbox contains (IndexedDB).

- **Pull** on open, when the connection comes back, when the tab becomes
  visible and every minute while it is visible. New blobs are decrypted,
  verified and applied; they are also relayed to the people connected in real
  time.
- **Push** (only browsers that can sign): shortly after a change (at most one
  upload every 1.5 s while typing, and right away when the tab is hidden), the
  part of the document the shadow lacks is signed and uploaded as one blob.
  Offline, changes simply stay in the document and are uploaded later: the
  queue survives reloads because it is computed from the document itself.
- **Compaction**: after 40 blobs (or when the relay answers that the mailbox is
  full) a writer uploads the full signed state as a snapshot that replaces
  exactly the blobs it had read (`X-Ofimeo-Base` on the relay; the listed files
  on Nextcloud), so changes written meanwhile by someone else are kept.
- Failures back off (5 s, doubling to 5 minutes).

The status next to the save state shows, per store: *Synced to …*, *Not yet
synced to …* (a change waiting to be uploaded), *Waiting to sync to …*
(offline or unreachable), *Up to date from …* (view links) or *Could not sync
to …*. Clicking it opens the connection test, whose section **Sync without
being online together** has the settings and a *Sync now* button.

## Permissions

- **View links** have the room secret (so they decrypt) and the public keys
  (so they can compute mailbox ids and verify), but no private key: they
  **pull only**. The relay rejects any write that is not signed by the key
  whose hash is the mailbox id, and every reader rejects entries with an
  invalid signature, so even a store that accepted a forged blob could not
  change the document.
- **Comment links** push to the comments mailbox only.
- **Edit links** push both.
- Nextcloud has no signature check of its own; access to the folder is what
  Nextcloud allows. Share a folder with the class (read-only for those who
  only read). Signatures inside the blobs still protect protected documents.

## Threat model

| Party | Sees | Cannot |
| --- | --- | --- |
| Relay operator / Nextcloud admin | opaque mailbox ids, the writer's public key (relay), blob sizes and times, client IP addresses | read content, titles or comments; forge changes (no signing key; readers verify); link a mailbox to a document without having its link |
| Someone with a view link | the whole document (as intended) | write to any mailbox; make readers accept a change |
| Network attacker | TLS-protected traffic only | anything more than the relay operator |

Not protected against: a store **withholding or deleting** blobs (availability;
peers and other stores still sync), replay of old blobs (harmless for a CRDT:
merging old state changes nothing), and traffic analysis (who writes when, how
much). Losing the room secret means the data cannot be decrypted by anyone;
leaking a link gives its holder the access of that link, as always.

## Ofimeo Relay store

HTTP API (same port as the rest of the relay, CORS open, local network only
unless `--public`):

- `GET /ofimeo/store` → `{"enabled", "default_on", "max_blob_bytes",
  "max_doc_bytes", "max_blobs", "ttl_days"}` (also in `/ofimeo/config` as
  `store`).
- `GET /ofimeo/store/<id>?after=<seq>` → `{"blobs":[{"seq","data"(base64)}],
  "last","count","bytes"}`; an unknown mailbox is empty.
- `POST /ofimeo/store/<id>` with the blob as body and `X-Ofimeo-Key`
  (base64url public key), `X-Ofimeo-Time` (unix seconds, ±15 min),
  optional `X-Ofimeo-Base` (snapshot: drop blobs with seq ≤ base) and
  `X-Ofimeo-Signature` = Ed25519 over
  `"ofimeo-store:v1\n<id>\n<time>\n<base or empty>\n<hex SHA-256 of body>"`.

Storage: `<data>/store/<id[0:2]>/<id>/` with one file per blob and
`meta.json` (public key, next sequence, last write). Writes are atomic
(temporary file + rename). Limits (file key `store` in `ofimeo-relay.json`):

| Setting | Default | Flag / environment |
| --- | --- | --- |
| `enabled` | true | `--store=false`, `OFIMEO_STORE=off` |
| `default_on` (browsers use it unless turned off there) | false | `--store-default-on`, `OFIMEO_STORE_DEFAULT_ON=on` |
| `max_blob_bytes` | 8 MB | |
| `max_doc_bytes` (per mailbox) | 32 MB | `--store-max-doc`, `OFIMEO_STORE_MAX_DOC` |
| `max_total_bytes` | 4 GB | `--store-max-total`, `OFIMEO_STORE_MAX_TOTAL` |
| `max_blobs_per_doc` (then a snapshot is required) | 500 | |
| `ttl` (deleted after this long without writes) | 4320h (180 days) | `--store-ttl`, `OFIMEO_STORE_TTL` |
| `writes_per_minute`, `reads_per_minute` (per address) | 600, 1200 | |

Writes are also limited to 120 per minute per mailbox. A full mailbox answers
413 (the browser then compacts), a full disk 507.

For students at home the relay must be reachable from the Internet
(`--public`, a real certificate, a firewall in front); on the school network
only, store-and-forward still helps between lessons and devices at school.

## Nextcloud store

Mailboxes are subfolders of the chosen folder (default `/Ofimeo/Sync`), one
file per blob, named `<time in base 36>-<random>.bin`. The browser uses the
account connected in *File → Nextcloud account…* (see
[nextcloud.md](nextcloud.md) for CORS). To sync between people, each of them
chooses a folder shared among them (for example a class folder, or a Group
folder); the school config can set it:

```json
"store": { "relay": true, "nextcloud": { "enabled": true, "folder": "/Class 3B/Ofimeo" } }
```

`"relay": false` or `"nextcloud": false` forbids a store in that school;
`true` turns it on by default (people can still turn it off in their browser).

## Testing

- `cd relay && go test ./...`: appends, snapshots, reload from disk, wrong keys
  and signatures, stale requests, quotas, TTL, HTTP and CORS, environment.
- `tests/e2e/sync.spec.ts`: two browsers never open at the same time converge
  through the real relay (built with Go) and through a mock WebDAV server;
  stored data contains no plaintext; a view link reads but its writes are
  rejected; compaction; offline changes are uploaded later.
- Development aid: `?sfcompact=<n>` compacts after `n` blobs.
