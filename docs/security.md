# Security and data integrity

This guide records maintained behavior and known limits. It replaces dated
review reports as the starting point for maintenance; original findings and
validation records remain in Git history. It is not a penetration-test report
or a statement that production services have been checked.

## Local persistence and backups

- `src/core/document-persistence.ts` preserves the y-indexeddb schema and
  acknowledges document, comment and private-form writes after transaction
  completion. Failed updates remain queued in memory, raise a persistent
  warning and can be retried on an edit or explicit flush. Closing a tab before
  successful retry can still lose those in-memory updates.
- The shared save indicator waits for committed document and comment writes,
  not an elapsed timer. A failed flush keeps the unsaved state; a later edit
  retries retained updates. It does not guarantee saving after a tab closes.
  Successful drains also resume writes queued at the promise-settlement
  boundary, and an explicit flush waits until that backlog is committed.
- IndexedDB helpers wait for transaction completion, including late aborts.
  Corrupt local indexes block mutations and remain available for recovery.
  Copies enter the index after their public and private content is durable;
  form response receipts wait for private-state persistence.
- Backup version 2 includes editor-only form state and private template bytes.
  Version 1 remains readable but cannot recover private form data it omitted.
  Restoration validates payloads, identifiers, structure and signing identity
  before writing, and retains a local recovery record until completion.
  Recovery is per document across multiple databases, not an atomic batch;
  retry interrupted work by importing the same archive.
- Automatic backup success bookkeeping follows successful upload, so a failed
  upload does not suppress reminders by pretending a new backup exists.

## Permissions and imported content

Edit and comment updates use Ed25519 signatures; signature deduplication follows
verification. View links cannot sign edits. Commands, toolbar overflow controls,
shortcuts and WebMCP tools must enforce access in code. Forms have separate
editor-only state and encrypted responses.

Diagram and slide HTML labels are sanitized when rendered, including imported
content and placeholders. Notebook print output escapes untrusted markup.
Recommended server policies and built pages disallow inline script execution
and JavaScript `unsafe-eval`; trusted draw.io definitions are generated as
same-origin scripts and imported stencil evaluation is disabled. WebAssembly
retains its separate CSP permission. See the deployment configurations for the
full network policy. Remote HTTPS images can still reveal a viewer's network
address to the image host.

## Connections and relay

Nextcloud connections are session-only unless explicitly remembered. WebDAV
paths reject dot segments, server/share URLs reject embedded credentials and
non-HTTP(S) schemes, and API requests reject redirects to protect upload bodies
and credentials. Conditional saves use the ETag from the actual download or PUT
response, never a later metadata lookup. Without a verified version token,
automatic overwrites are blocked. See [nextcloud.md](nextcloud.md) for CORS and
account handling.

Moodle direct and relay requests reject redirects, including login, API,
uploads and file downloads, so 307/308 responses cannot forward credentials or
private bodies. Configure the final canonical Moodle and relay addresses.
Moodle site comparisons preserve case-sensitive installation paths and reject
invalid URLs and embedded credentials.
Moodle downloads avoid retaining mobile tokens in ordinary attachment links;
description images can still carry tokens in request URLs. The optional relay
restricts forwarding to the configured Moodle site and allowed functions,
rejects redirects and bounds resource use. Import proxy logs omit private
upstream URLs. Public TURN mode restricts private destinations unless explicitly
enabled and blocks link-local destinations. Mailbox quotas bound disk use but
do not guarantee availability against coordinated abuse. See
[moodle.md](moodle.md), [relay.md](relay.md) and
[store-forward.md](store-forward.md).

## Legacy storage and compatibility

`src/core/legacy-storage.ts` migrates the former `words-online` storage names.
It remains necessary for existing users and links. Migration copies missing
localStorage keys and absent databases, and retains every original. Existing
current databases are kept intact: sequential Yjs update keys and signing-log
keys from independent histories cannot be merged by matching record keys.
All stores and indexes of a new copy are created and populated in one committed
versionchange transaction; an abort rolls back the whole copy for retry.
Database-listing fallbacks inspect both document indexes independently.
Migration receipts prevent retained legacy credentials and databases from
reappearing after a current connection is removed or a document is deleted.
Explicit account changes retire the corresponding legacy credentials too:
Moodle disconnect removes its old token/cache and Nextcloud removes only the
selected legacy account, preserving other accounts for recovery.
LocalStorage copy intent is recorded before the copy: if it is interrupted or
storage is full, the original remains available for explicit recovery rather
than silently restoring credentials on a later visit.

Coexisting document indexes and histories still require explicit recovery and
comparison; they are not automatically merged or all displayed in the current
library. Export the current library before recovering legacy records. Keep
the original `words-online:*` / `words-online-*` browser stores and use an
isolated browser profile or a dedicated recovery tool to inspect a copy. Do
not clear either store set or downgrade in the same profile to resolve a
conflict. A legacy tab can keep writing its original after the snapshot; those
later edits remain in the legacy source and are not copied over an existing
current target. Do not remove this compatibility code or its regressions as
part of file cleanup.

Windows WebKit may lack WebRTC and native X25519. Local editing and the bundled
Ed25519 fallback support document persistence and signatures; real-time peer
collaboration and encrypted form responses depend on the available browser
APIs. Automated browser engines do not qualify physical Safari devices.

## Verification and remaining qualification

### Dependency review, 3 November 2026

The dependency update pins current compatible Tiptap, Univer, DOCX, Markdown,
MathLive, PDF.js, icons and WebSocket releases. The relay updates Pion transport
and `golang.org/x/net`. Glob 14.0.2 and Minimatch 11.0.1 address
[traversal after cancellation](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4)
and [pattern amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249).
Archiver utilities use Glob 14's compatible synchronous API and ExcelJS uses
Unzipper 0.12 to remove the remaining glob 7 dependency rather than force a new
Minimatch API into glob 7's incompatible internals. ExcelJS's existing Archiver
release is retained for compatibility with its custom worksheet streams.

The upstream advisory
[GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)
affects `deepmerge` 4.3.1, with no upstream patched release published at review
time. An explicit npm override replaces it with the private, locally maintained
[`@ofimeo/deepmerge` security patch](../vendor/deepmerge/README.md), derived from
the MIT-licensed 4.3.1 distribution. Both target and source traversal discard
prototype-control keys at every recursive merge; output writes use own data
properties so inherited setters cannot change the output prototype.

The resolver uses this function only to clone its constant defaults while
constructing the service worker. It does not merge document content in the
browser. Regressions exercise poisoned source/target objects, null-prototype
inputs, nested objects and arrays, and the actual resolver dependency path.
The all-severity npm audit gate remains enabled without exceptions. This is
a repository-maintained patch, not a claim that upstream is fixed; remove it
when the resolver has a maintained patched dependency and repeat the clean
install, dependency, build and offline-browser checks. Docker copies the local
package before `npm ci`, keeping container builds reproducible.

Harper 3 and mermaid-to-excalidraw 3 are separate major-version migrations;
they remain pinned to the existing releases pending API and output
qualification. Dependency scans and version availability must be refreshed
for each release.

### Validation scope

PDF text-box creation commits its final content as one undoable change rather
than persisting an empty placeholder before text entry. Long editing sessions
and empty drafts have explicit browser regression coverage; existing text-box
edits form separate undo steps.
The document title remains disabled until its save handler is attached;
browser migration tests verify the saved title and content before moving any
fixture stores, so startup races are distinguished from migration failures.

CI checks type safety, spelling/core/workflow regressions, translation keys,
third-party licenses, npm advisories, a production build, browser tests, Go
tests/vet, reachable Go vulnerabilities and Docker startup. Pages publication
requires successful CI for the same commit. The workflow files and
[CONTRIBUTING.md](../CONTRIBUTING.md) define the commands; test counts and scan
results are properties of an individual run, not permanent security guarantees.

Relevant regressions include `tests/e2e/storage-integrity.spec.ts`,
`legacy-storage.spec.ts`, `nextcloud-security.spec.ts`, `moodle-security.spec.ts`, `security.spec.ts`,
`accounts.spec.ts`, `offline-update.spec.ts`, `tests/unit/core.ts` and relay
proxy/store tests. Use [ROADMAP.md](ROADMAP.md) for remaining real-service,
device, interoperability and legal qualification. Local mocks and synthetic
documents do not establish authenticated production behavior.
