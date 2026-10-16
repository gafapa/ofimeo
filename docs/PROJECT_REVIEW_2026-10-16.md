# Project review — 16 October 2026

Reviewed baseline commit: `353566c`. The follow-up below changes application
code locally and does not publish a deployment. Browser diagnostics used isolated Chromium contexts and
synthetic data; no existing browser documents or production accounts were used.

## Follow-up scope and remediation

The user authorized fixing the findings and explicitly excluded legacy
migration. Finding 2 remains outside the implementation scope; its migration
module is unchanged.

- Finding 1: live document, comment and private-form persistence now waits for
  transaction completion. Aborted/request-failed writes raise the persistent
  warning, remain queued in memory, and can be retried on the next edit or
  explicit flush. Log compaction reads other tabs' updates within the same
  transaction. Copy creation waits for public and private writes before
  publishing its index entry. Form receipts wait for durable private storage;
  a failed answer can be retried, including immediate grade release.
- Finding 3: uploads use only the ETag returned with their PUT response. Missing
  version tokens are not replaced by a later metadata read. The existing
  create-only path blocks automatic overwrites without a verified token and
  requires explicit replacement during a manual save. Opening a remote file
  likewise uses only its download response's version, not a prior listing.
- Architecture and Nextcloud documentation describe these guarantees and the
  CORS response headers required for conditional saving.

The original findings below retain the evidence from the reviewed baseline.

## Findings

### 1. High: ordinary editor writes can fail without a storage warning

Locations: `src/core/session.ts:111–118`, `src/apps/forms/state.ts:48–49`,
`src/core/copy.ts:50–60`, and `src/core/session.ts:197–215`.

The durable transaction helper used by backup restoration is not the write path
used by normal editing. Sessions and private form state still instantiate
`IndexeddbPersistence` directly. Its update listener issues `addAutoKey` without
awaiting transaction completion or forwarding transaction aborts to
`reportStorageError`. The session's update listener only checks the separate
localStorage index write. A successful index write therefore does not establish
that document content was saved.

Reproduction using the installed production persistence library in Chromium:
open a document, wait for its initial synchronization, intercept `add` on the
`updates` store and abort its transaction on request success, then make a Yjs
edit. After closing persistence and reopening the same database, the in-memory
text is present but the reopened value is absent. The isolated persistence
fixture produces no storage alert; inspection confirms that the application
does not attach a transaction-error bridge to these persistence instances.
This was a persistence-path reproduction, not a full editor UI fault-injection
test.

Private form responses use the same persistence path. In addition,
`src/apps/forms/state.ts:115–119` publishes a receipt immediately after modifying
the private Y.Doc, without awaiting durable storage. A receipt consequently does
not establish that the received answer survived a failed storage transaction.

Recommended fix: provide a shared persistence adapter that tracks committed
writes and reports errors for document, comment and private-state databases.
Await durable storage before acknowledging received answers or completing a
copy. Preserve in-memory recovery data after failure. Add editor and private-form
tests for request errors and aborts after request success; the existing tests
of `mergeState` alone do not cover this path.

### 2. High: legacy migration discards conflicting old data

Locations: `src/core/legacy-storage.ts:21–24`, `87–90`, `107`.

When both prefixes exist, localStorage migration retains the current value and
unconditionally removes the legacy key. This loses old document-index entries
instead of merging them or retaining a recoverable conflict. Database migration
also skips records whose primary keys already exist in the target and then
deletes the entire legacy database. Independently created auto-incremented Yjs
update logs can share numeric primary keys without containing the same update.

Chromium reproduction with the actual bundled migration module:

- Old document index: `[{"id":"old-only"}]`; current document index:
  `[{"id":"new-only"}]`. After importing the module, the old index is absent
  and the current index contains only `new-only`.
- Old and current `updates` stores each have primary key `1`, with distinct
  synthetic values. After migration, only the current value remains and the
  legacy database no longer exists. This database test uses opaque synthetic
  records to demonstrate the migration's key-collision behavior.

Recommended fix: retain original storage until reconciliation is verified;
merge indexes by document identity with explicit conflict handling. For Yjs
logs, merge decoded document states rather than treating database sequence keys
as update identities. Test coexistence, interrupted migration and conflicts.

### 3. High: Nextcloud ETag fallback can adopt another writer's version

Locations: `src/core/nextcloud.ts:354–362`,
`src/ui/nextcloud.ts:837–846` and `891–900`.

When a successful PUT does not expose an ETag through CORS, `upload` performs a
separate PROPFIND and returns its ETag as the uploaded version. A different
writer can update the file between those requests. The UI then stores the
other writer's ETag alongside the local document's saved state vector. The next
conditional PUT can overwrite that other writer's content without a conflict.

Chromium reproduction with the actual client module and a mocked fetch:
the conditional PUT succeeds with status 204 and no ETag; the following PROPFIND
returns `"concurrent-version"`. `upload` returns that ETag even though it was
not associated with the PUT response. Inspection confirms that the save UI
persists this returned token for its next `If-Match`. No real Nextcloud server
was contacted, and the complete two-writer UI flow was not exercised.

Recommended fix: require a write-associated version token or leave the remote
version unverified and block automatic overwrites until reconciliation. Do not
adopt a subsequent metadata read as proof of the uploaded content. Test an
intervening remote edit between PUT and PROPFIND with hidden response headers.

## Initial review validation

- `npm run typecheck`: passed.
- `npm run test:unit`: passed, including 232 spelling rules, 23 core tests,
  10 Pages-gate tests and all four translation catalogs.
- `npm audit --json`: zero reported vulnerabilities.
- `go test ./...`: passed (cached).
- `go vet ./...`: passed.
- Three isolated Chromium diagnostics reproduced the behaviors above.
- `npm run build`: passed, including PWA generation (928 precache entries,
  40,094.69 KiB). Build warnings include unresolved PDF.js resource-directory
  URLs and dependency module directives; these warnings were not independently
  qualified as runtime defects in this review.

## Remediation validation

- Final production build, including type checking and PWA generation: passed
  (930 precache entries, 40,096.03 KiB).
- Unit checks: 232 spelling rules, 25 core tests, 10 Pages gates and all four
  translation catalogs passed. New Nextcloud tests verify missing upload ETags,
  preservation of write-associated ETags and rejection of create-only collisions.
- Isolated storage diagnostics: 61 passed and one X25519 test was skipped on
  Windows WebKit. One additional test's teardown initially failed because a
  second Playwright run reused its artifact directory. Repeating that case in
  an independent directory passed. The strengthened receipt/retry/immediate-grade
  case also passed in Chromium and Firefox; WebKit skips it without X25519.
- Integration tests against the final production build: 33 passed. Chromium
  verified real-time collaboration and the two-student encrypted quiz workflow
  with grading/export. Chromium, Firefox and WebKit verified the application
  smoke suite, local-only operation, accessible storage warnings, and recovery
  of an aborted live-editor write across a reload.
- `git diff --check` passed; `src/core/legacy-storage.ts` has no changes.

No legacy migration code was changed. No deployment, Docker qualification,
authenticated Moodle workflow or authenticated Nextcloud workflow is claimed.
Browser validation covers selected suites, not the complete E2E suite.
