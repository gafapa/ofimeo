# Architecture

How Ofimeo works at runtime. The module-by-module tree is in README ›
Architecture; the reasons behind these choices are in
[DECISIONS.md](DECISIONS.md).

## Overview

```
Browser (PWA, one origin)
 ├─ main.ts ── router (#app=…&doc=…&key=…) ── home/ or apps/<app>/index.ts (dynamic import)
 ├─ core/session.ts ── Y.Doc + commentsDoc ── DocumentPersistence (local, offline)
 │        │                     └─ awareness (cursors, names)
 │        ├─ network.ts ── Trystero: Nostr signalling → WebRTC data channels to peers
 │        │                (every update Ed25519-signed; peers verify)
 │        └─ store-forward/ ── encrypted mailbox on Ofimeo Relay or Nextcloud
 ├─ ui/frame.ts ── shared menus, toolbar, status bar, share, hand in, help, chat, WebMCP
 └─ service worker ── offline app shell and lazily cached assets

Optional servers (never required):
 ├─ Nostr relays (public, or the school's Ofimeo Relay)
 ├─ Ofimeo Relay (Go): Nostr + TURN + HTTPS + app hosting + store + Moodle/import forwarding
 ├─ Nextcloud (WebDAV + CORS): open/save files, store-and-forward folder
 └─ Moodle (mobile web services): task list, hand in
```

## Document lifecycle

1. **Create/open.** The router reads `#app`, `doc` and keys from the link
   (`core/router.ts`). `core/store.ts` keeps the local index (title, type,
   access, folder, tags, trash).
2. **Session.** `core/session.ts` creates the `Y.Doc` (content), a separate
   `commentsDoc` (comments, chat, annotations), awareness, IndexedDB
   persistence and the P2P room. It exposes `access`, `canEdit`,
   `canComment`, `hooks`, `shareUrl()`, `copyUrl()`, `storeForward`.
3. **App mount.** `apps/<app>/index.ts` mounts the editor on the frame and
   registers hooks (export formats, hand in, print, restore, WebMCP tools).
4. **Sync.** Local changes → IndexedDB immediately → signed updates to peers
   in the room → (if enabled) encrypted mailbox for offline peers.
5. **Versions.** `core/versions.ts` stores named snapshots; restore is generic
     (apps may add `hooks.privateState`, e.g. forms' answer key).

`core/document-persistence.ts` uses the existing y-indexeddb database schema,
but acknowledges writes only after the IndexedDB transaction commits. The
session's `flushStorage()` waits for document and comment commits; the shared
save indicator uses it instead of a timer and retains the unsaved state after
a failure. Drains resume edits queued while a previous write promise settles.
Failed updates remain queued in memory, raise the persistent storage warning, and are
retried on the next edit or explicit `flush()`. Reads and log compaction also
wait for transaction completion; compaction includes other tabs' committed
updates in the same transaction. Copies enter the document index only after
both public content and any private state are durable. Form response receipts
wait for a successful private-state flush.

## Permissions

A link carries a room secret and, depending on access, the Ed25519 private
key for edits and/or comments (`core/keys.ts`). Every update from a peer is
verified against the public key; unsigned or wrongly signed updates are
dropped. View links hold no private key, so they cannot write for others;
apps also disable editing UI (enforced in code, see D21). Forms use an extra
private Yjs doc for editors only and encrypt responses to editors.

## Apps

| App | Engine | Folder |
| --- | --- | --- |
| Writer | TipTap 3 / ProseMirror, own pagination and PDF writer | `src/apps/writer` |
| Sheet | Univer (pinned in package.json) + ECharts charts, formula pivots | `src/apps/sheet` |
| Draw | Excalidraw | `src/apps/draw` |
| Diagram | Own editor on maxGraph, draw.io libraries | `src/apps/diagram` |
| Slides | Diagram editor per slide + player/presenter | `src/apps/slides` |
| Forms | Own editor/renderer, encrypted responses | `src/apps/forms` |
| PDF | pdf.js (view) + pdf-lib (export) | `src/apps/pdf` |
| Notebook | TipTap pages + ink layer | `src/apps/notebook` |

Shared: `src/apps/charts` (charts for writer/slides), `src/ui/mathgraph`,
`src/core/spell` + `src/ui/spell`, `src/help`, `src/templates`.

Converter contracts live with the implementation: writer formats and types in
`src/apps/writer/formats/`, spreadsheet formats in `src/apps/sheet/formats/`
(Univer workbook snapshots), diagram records in `src/apps/diagram/model.ts`
and draw.io/Visio readers in `src/apps/diagram/formats/`. Slides reuse the
diagram editor. Preserve format compatibility through import/export round trips
and realistic fixtures; supported features and omissions are listed in README.
Original engine evaluations and migration briefs remain in Git history.

Gantt pages inside Diagrams use per-task/per-field Yjs maps. Scheduling is
derived deterministically from calendar dates and finish-to-start dependencies;
exports generate ordinary diagram records plus a versioned task snapshot.
See [gantt.md](gantt.md) for the data model, user flow and limits.

See [security.md](security.md) for backup recovery, imported-content handling
and the unresolved legacy-storage coexistence risk.

## Configuration

School configuration (`core/school-config.ts`) merges, section by section,
the `school` object of a trusted relay's `/ofimeo/config` (only a relay that
serves the app or is named by the file; never one from `?relay=`) and then
`ofimeo.config.json` next to `index.html` (later wins). It is loaded before
the first render and cached for offline use. Settings the school locks cannot
be changed per browser; unlocked ones are defaults that per-browser settings
(localStorage) override. Without a file, built-in defaults apply.

## Relay (Go, `relay/`)

`main.go` flags/env → `config.go`; `nostr.go` relay; `turnserver.go` TURN with
time-limited credentials; `web.go`/`mux.go` HTTPS, `/ofimeo/config`, app
hosting (`webapp.go`, `embed_app.go`), and one TLS port shared by HTTPS and
TURN (`mux.go`); `store.go` encrypted mailboxes; `school.go` school config;
`moodle.go` Moodle forwarding; `proxy.go` import proxy; `certs.go` TLS;
`service.go` system service (systemd, launchd, Windows); `pages.go` offline
status pages.
