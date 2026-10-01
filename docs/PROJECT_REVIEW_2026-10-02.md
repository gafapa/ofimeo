# October maintenance review

## Implemented

- Update React and React DOM together to 19.3.0, with matching type packages.
  Override Excalidraw's older Radix tabs dependency with the compatible 1.1.21
  release. Group future React upgrades in Dependabot.
- Update all direct npm dependencies reported as outdated, including the
  coordinated Tiptap 3.31.4 and Univer 1.0.3 packages, Playwright 1.63.0,
  marked 18.0.14, KaTeX 0.19.0, MathLive 0.111.0 and Vite 8.3.2. Pin direct
  versions for reproducible upgrades.
- Update the Go toolchain to 1.27.1 and the available relay dependency updates.
  Use Node 24 in CI and Docker; update GitHub Actions. Pages deployment now
  follows a successful CI push run for the same main-branch commit.
- Recheck the word under the caret once typing stops. Invalidate checks on
  input and avoid caching spreadsheet results while dictionaries are loading.
- Restore quick-start focus after canvas menu processing. Add an explicit
  accessible name to the Nextcloud account selector.
- Make new Moodle and Nextcloud connections session-only by default, with
  explicit opt-in persistence. Preserve existing remembered accounts. Moodle
  task caches follow the same storage policy; disconnect clears both stores.
  Repair Nextcloud's fallback when browser storage rejects writes.
- Add Nextcloud account selection and an Add account action. Linked documents
  continue to use their saved account identifier.
- Block public TURN access to private networks unless explicitly enabled with
  `allow_private_peers`. Block link-local destinations, including cloud
  metadata addresses. Keep the relay's own advertised address available for
  connections between TURN allocations. Document the policy and firewall need.
- Extract legal-page scripts into same-origin files and remove script
  `unsafe-inline` from the recommended Apache and nginx CSP.
- Replace automatic PWA activation with a user-controlled update offered on
  the home screen. Keep the full suite precached for offline use.
- Supply PDF.js standard fonts and CMaps from the application origin. Precache
  standard fonts, cache CMaps on use, and destroy failed PDF loading tasks.
- Delete local store-and-forward cursor/shadow records on permanent document
  deletion while preserving other documents and remote mailboxes.
- Make the translation update script work on Windows as well as Unix.
- Apply the owner's selected Apache-2.0 project license, add NOTICE and retain
  third-party component licensing separately.
- Add 13 fast core regressions covering permission derivation, unrelated key
  rejection, actual Ed25519 signature validation, malicious import URLs and
  credential storage failures. Add browser coverage for account switching,
  persistent Moodle opt-in, sync-state deletion and legal pages under CSP.

## Verification

Type checking, 232 spelling rule tests, 13 core tests, all four translation
catalogs, the production build and Go vet/tests passed. npm audit found no
vulnerabilities; govulncheck found no reachable vulnerabilities. The full local
browser run initially passed 83 tests and exposed three failures, subsequently
fixed: the account selector's accessible name and Windows relay executable
handling. Focused reruns also exposed a Windows process-cleanup race; teardown
now waits for relay exit before removing its temporary directory. All 16
focused browser cases passed after the affected relay cases were rerun. The expanded
suite contains 87 browser tests, including a production service-worker update
test with two tabs and an open editor. CI is the final publication gate.

The changed account dialogs were inspected at 1366px and 390px without
horizontal overflow or uncaught page errors; the interface detector reported
no findings.

Read-only SSH inspection confirmed Moodle Aula 4.5.14 and Nextcloud 33.0.5 are
healthy. Moodle mobile web services and REST are enabled; its login/token and
REST endpoints allow browser CORS. Its public-configuration AJAX endpoint
does not. Nextcloud WebDAV does not currently allow the Ofimeo browser origin.
The supplied Apache CORS configuration restricts access to the two registered
Ofimeo origins and passed syntax validation against the live Apache image;
it has not yet been activated.

## Remaining work and external decisions

- **Real integrations:** authenticated workflows are covered by local mocks.
  The owner authorized temporary credential access, but automatic approval
  review rejected application-password decryption and login testing without
  providing a specific reason. SSH health checks succeeded. Real sign-in,
  file operations and submissions remain unverified. A dedicated authorized
  course/assignment is still needed for real submission testing.
- **Moodle SSO:** native mobile deep-link callbacks are not a working browser
  SSO implementation. A verified server-side callback/bridge is still needed.
- **CSP evaluation:** `unsafe-eval` remains necessary for trusted draw.io shape
  scripts. Removing it requires isolating or replacing that execution path;
  `wasm-unsafe-eval` remains needed for the grammar checker.
- **Installation performance:** the suite remains about 39 MiB precached.
  Optional editor caching needs a separate product decision and measurements
  on actual school networks; it would change the current offline guarantee.
- **Feature roadmap:** PDF CJK/emoji annotation export and form-field editing,
  finer writer pagination, legacy format fidelity, spreadsheet merged-cell
  accessibility and the other documented features remain development work.
- **Publication review:** legal ownership/DPO details, desktop office
  interoperability, physical device testing and a tagged relay binary release
  still need the applicable real environments or owner decisions.

These limits are not recorded as completed fixes in the roadmap.
