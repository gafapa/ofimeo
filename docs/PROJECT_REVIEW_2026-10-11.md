# Project review — 11 October 2026

Reviewed baseline commit: `0b64661`. The findings below record the initial
audit; the follow-up implements fixes for all seven findings and the local
CI, CSP, browser qualification and measurement improvements.
No real student data, production credentials, or remote deployments were used.

## Remediation

- IndexedDB requests now resolve only after transaction commit and reject
  late aborts. Durable reads and writes propagate errors. Connection caches
  reset after failed opens and close on database version changes.
- Index/library write failures produce a persistent `role="alert"` warning.
  Corrupt stored indexes block mutations and remain intact for recovery.
- Backup version 2 preserves editor-only form databases and private template
  bytes. Version 1 remains readable, repairs its numeric template-byte objects
  and warns that private form records were never included.
- Restores validate all document/template updates, identifiers, folder
  structure and existing signing identities before changing local data.
  Missing payloads and identity conflicts are rejected. A committed local
  recovery record retains the prepared archive until its database merges and
  index updates succeed. Interrupted work is retried by importing the same archive. These
  are recoverable per-document operations, not an atomic multi-database batch.
- Archive size and encryption parameters are bounded before extraction/key
  derivation. The document index is published only after durable content writes.
- Backup construction no longer changes reminder state. Automatic upload
  success updates it; upload failure preserves the prior timestamp.
- `source-map-js` is pinned to 1.2.2 and Mermaid's nested KaTeX to 0.18.2.
  The narrow KaTeX override crosses Mermaid's declared 0.16 range, so drawing
  and math regressions are part of validation. Excalidraw is not downgraded.
- Expanded Go scanning discovered 12 reachable standard-library advisories.
  Go and the Docker builder are updated to 1.27.2 and `x/net` to 0.60.0.
- All workflow actions use immutable SHAs; checkout credentials are not
  retained. Manual and automatic Pages publication require the latest CI run
  for the same commit to succeed, including protection against failed reruns
  and currently pending runs.
- Script `unsafe-eval` is removed from Apache/nginx and built-page CSP.
  Draw.io uses generated same-origin scripts; imported stencil evaluation is
  explicitly disabled. WebAssembly retains its separate CSP permission.
- Chromium runs the full E2E suite; Firefox and WebKit run portability and
  storage/security regressions. CI installs all three browser engines.
- Windows WebKit lacked native Ed25519, breaking protected document imports.
  A locally bundled `@noble/ed25519@3.2.0` fallback preserves the same signing
  keys, signatures and permission model. Tests check native/fallback
  interoperability and reject signing with viewer keys. Native X25519 remains
  necessary for the encrypted form-response workflow; its existing availability
  check still applies on platforms that do not implement it.
- Windows WebKit also lacked WebRTC. Sessions now permit local editing,
  backups and available store-and-forward backends without attempting a
  nonexistent peer connection. The status explicitly says "Local only".
- `npm run measure:install` records precached build bytes and the largest
  files without weakening the all-editors offline contract. The measured
  final build contains 885 precache entries, approximately 38.86 MiB uncompressed.

Final validation and environment limits are recorded at the end of this file.

## Priority findings

### 1. High: full backups omit private form data

Evidence: `src/core/backup.ts:177–195` exports the shared document, comments,
signed logs and templates, but never reads `store.privateDbName`. Forms keep
answer keys, responses, manual grades and private version snapshots in this
separate database (`src/apps/forms/state.ts`, `src/apps/forms/model.ts`).

Synthetic Chromium reproduction: create an indexed form, write an answer key
and response into its private database, then call `buildBackup` and `openBackup`.
The archive contains only `doc.yjs` and `comments.yjs` for that form. A recovery
on another browser therefore cannot recover those private records from it.

Recommended change: version the backup format to include private state for
each applicable document, restore it with explicit ownership/access checks,
and describe how older archives lack that data. Verify a clean-browser round
trip including responses, answer keys, grades and private version snapshots.

### 2. High: storage failures can be reported as successful restores

Evidence: `src/core/store.ts:171` catches and discards `localStorage.setItem`
errors. `restoreBackup` then appends the document to `report.added` without
checking whether `putDoc` persisted its index entry.

Synthetic Chromium reproduction: make `Storage.prototype.setItem` throw
`QuotaExceededError` during restoration. The result is `added: 1`, `failed: 0`,
but `store.listDocs().length` is zero. The restored data is not discoverable
through the document index. Ordinary document creation uses the same writer.

Recommended change: propagate persistence failures, show a recoverable error,
and only acknowledge a saved/restored item after its required writes succeed.
Include quota exhaustion and blocked storage in regression coverage.

### 3. High: IndexedDB helpers acknowledge requests before transaction commit

Evidence: `src/core/idb.ts:19–32` resolves on request success, without handling
transaction completion or abort. Write errors are also converted to
`undefined`. The library helper in `src/core/library.ts:223` has the same early
resolution pattern; `dbPut` propagates request errors but not a later abort.

Synthetic Chromium reproduction: attach a request-success listener that
aborts the write transaction. `await kvSet(...)` resolves, while a subsequent
`kvGet(...)` finds no record.

Recommended change: resolve writes on `transaction.oncomplete`; reject on
transaction abort/error. Keep optional cache reads separate from durable
writes for signed logs, templates and restoration. Add an abort-after-request
regression for both helpers.

### 4. High: dependency audit now fails the CI security threshold

`npm audit --json` reports five affected package entries: one high and four
low. These represent two underlying advisories, with the low finding
propagating through Mermaid and Excalidraw.

- `source-map-js@1.2.1`, pulled by Sass and PostCSS, is affected by
  [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).
  The published patched version is `1.2.2`. This is a source-map processing
  denial of service; browser exploitation in Ofimeo was not established.
- Mermaid uses nested `katex@0.16.47`, affected by
  [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7).
  The advisory requires existing prototype pollution. The application's
  direct `katex@0.19.0` does not remove the affected nested copy.

Recommended change: update the lockfile to a compatible patched source-map-js
release, then update or narrowly override Mermaid's KaTeX after checking its
declared range and rendering behavior. Avoid the audit tool's proposed major
Excalidraw downgrade. Verify a clean install, audit, build and drawing/math
tests. The existing CI audit gate already rejects high vulnerabilities.

### 5. Medium: form template private state does not survive backup serialization

`OwnTemplate.privateState` is a `Uint8Array`. `buildBackup` base64-encodes only
`state`, leaving `privateState` inside the spread object. JSON converts the
private bytes into an object with numeric keys. `restoreBackup` reconstructs
only `state`; the restored private field is not a `Uint8Array`.

Synthetic reproduction: a template with private bytes `[0, 0]` becomes
`"privateState": {"0": 0, "1": 0}` in `templates.json`.
`useOwnTemplate` passes that field to the private-state copy path, which
expects Yjs update bytes. The dedicated template-file exporter already
base64-encodes both fields and provides a useful model.

Recommended change: encode and decode both byte fields, validate them before
writing, and test that a restored quiz template creates a usable answer key.
Define a compatibility path for previously generated archives.

### 6. Medium: incomplete archives can create successful empty restorations

`openBackup` accepts a missing index as an empty document list.
`restoreBackup` treats missing `doc.yjs` and `comments.yjs` as optional and can
still report the entry as added. It also merges the library before validating
the document payloads and writes each payload separately, so a later failure
does not roll back earlier changes.

Synthetic reproduction: remove both Yjs files from an opened archive and
restore its indexed entry. The report still says `added: 1`, `failed: 0`.

Recommended change: prevalidate the index, identifiers, document types,
required payloads, Yjs updates and template records before mutation. Reject
incomplete documents explicitly. Stage changes or document and implement
per-document recovery semantics; compare existing type/key identity before
merging by id. Add malformed and truncated archive regressions.

### 7. Medium: a failed automatic upload can suppress backup reminders

Source-level finding: `runAutoBackup` builds its archive before uploading it.
`buildBackup` updates `lastBackup` and clears `dismissedAt` immediately. If the
Nextcloud upload fails, the catch records `lastError` but leaves `lastBackup`
updated. `reminderDue` therefore uses a recent timestamp even though no new
remote recovery artifact exists.

Recommended change: make archive generation free of backup-success bookkeeping.
Record success at the caller after delivery, particularly after a successful
remote upload. Test that a rejected upload preserves the previous successful
backup timestamp and reminder state.

## Additional improvements

- Add focused failure-path tests for storage and backups. The existing writer
  round-trip test passes but does not cover private form data or commit errors.
- Pin CI actions to immutable commit SHAs and disable checkout credential
  persistence where pushes are unnecessary.
- Make manual Pages deployment validate successful CI for the selected commit:
  `workflow_dispatch` currently bypasses the workflow-run success condition.
- Measure optional app installation before changing offline behavior. The
  current build precaches 884 entries, totaling 39,692.32 KiB, approximately
  38.8 MiB. Any reduction should retain an explicit offline contract.
- Isolate trusted draw.io shape execution if removing CSP `unsafe-eval` is a
  goal. It remains explicitly enabled in both deployment header files.
- Broaden browser qualification: Playwright currently configures Chromium
  only. Real Nextcloud/Moodle workflows and other browser engines were not
  verified in this review.

## Initial audit validation

- `npm run typecheck`: passed.
- `npm run test:unit`: 232/232 spelling tests and 15/15 core tests passed;
  all four translated catalogs had zero missing keys and placeholder mismatches.
- `npm run build`: passed, including assets, legal pages and service worker.
  Existing PDF.js URL and dependency bundling warnings remain.
- `go vet ./...` and `go test ./...` in `relay`: passed.
- `npm audit --json`: failed, with one high and four low package entries.
- Synthetic Chromium checks reproduced the backup omissions, incorrect private
  template serialization, false restore success and aborted write acknowledgment.
  These checks used an isolated browser context and bundled production modules;
  CSP was bypassed only in that context to inject the diagnostic bundle.
- Selected browser suite: all 11 library, security and smoke tests passed
  in 41.5 seconds. The full E2E suite, Docker build, govulncheck and
  production integration checks were not run.

## Suggested implementation order

1. Fix durable-write acknowledgment and explicit storage error reporting.
2. Add complete private-state backup support and template byte serialization.
3. Validate archives before mutations and fix backup-success bookkeeping.
4. Update vulnerable dependencies and run clean-install CI validation.
5. Improve workflow pinning, deployment gates and browser qualification.

## Follow-up validation

- Clean dependency installation passed. `npm audit --audit-level=low` reports
  zero vulnerabilities, including after adding the local Ed25519 fallback.
- Type checking passed. Fast checks passed: 232 spelling cases, 17 core cases
  (including native/fallback signature interoperability), 10 Pages gate cases
  and all four translated catalogs with no missing keys or placeholder errors.
- The production build passed with the stricter CSP and regenerated licenses;
  all 578 production packages have license metadata. Existing third-party
  module-directive and PDF.js URL bundling warnings are not build failures.
- The complete initial Chromium run passed all 103 tests. Its cross-engine
  continuation was interrupted to rebuild after identifying Windows WebKit's
  missing native Ed25519. The rebuilt application's selection passed 38
  Chromium and 29 Firefox cases, covering storage, security, library and smoke,
  plus Chromium collaboration, migration, encrypted forms, math and
  store-forward. WebKit then exposed missing WebRTC; after adding local-only
  operation, all 29 WebKit storage, security, library and smoke cases passed.
  After the final network change, the explicit missing-WebRTC regression passed
  in all three engines; all four Chromium collaboration/store-and-forward
  regressions also passed, using isolated synthetic relay/Nextcloud fixtures.
- A direct Chromium rendering check exercised Mermaid's patched nested KaTeX:
  a flowchart with a mathematical label rendered SVG and KaTeX content without
  script elements. This verifies the override beyond ordinary editor startup.
- Go 1.27.2 `go vet` and `go test` passed. `govulncheck` reports zero reachable
  vulnerabilities and zero affected imported packages. Its module-level note
  concerns unmaintained `x/crypto/openpgp`, which is not imported; this project
  uses `x/crypto/acme/autocert`. That advisory has no patched version.
- `npm run measure:install` reports 885 entries and 40,744,087 uncompressed
  build bytes (38.86 MiB). This does not measure transfer time on school networks.

Environment limits: Docker is not installed in this workspace, so its updated
builder was not exercised locally; the existing Docker CI job remains its
validation gate. GitHub-hosted CI and production deployment were not triggered.
Authenticated real Moodle/Nextcloud flows and physical Safari devices were not
used. Windows WebKit's missing X25519 still limits encrypted form responses;
its missing WebRTC limits real-time collaboration. Local editing and Ed25519
document signatures are now supported on that platform.

Cleanup limit: automatic command review rejected removal of the temporary
`test-results-integrity-final` directory without a further reason. That directory
contains synthetic test diagnostics from interrupted runs and remains untracked;
the loose review logs were removed.
