# Project review — 25 October 2026

Reviewed baseline: `3b0cedc`. Changes are local; this review does not publish
the application or change production accounts or documents. Browser tests use
isolated contexts, local servers and synthetic documents.

## Remediated findings

### Nextcloud upload redirects could forward document bodies

The shared request helper previously used `redirect: 'follow'`. A 307/308
response can preserve the PUT/POST body when following a redirect, including
to another origin that permits CORS. Stripping Authorization on a cross-origin
redirect does not protect the document body or a login token in a POST body.

Nextcloud API requests now use `redirect: 'error'`. Connections must use the
installation's canonical address. The existing connection diagnostic reports
redirect failures through the same network/CORS error path. New browser tests
exercise actual HTTP 307/308 responses and verify that a private upload fails
without reaching the redirect destination.

### WebDAV paths accepted dot segments

`encodeURIComponent` leaves `.` and `..` unchanged, and Fetch normalizes them
as URL path segments. A crafted stored remote path could therefore send a
write outside the intended user's WebDAV root. The client now rejects these
segments before creating the request. Literal percent signs remain encoded,
so a file name containing `%2e%2e` is sent as `%252e%252e`.

Server and public-share URL validation also rejects embedded credentials;
public-share links must use HTTP or HTTPS. Tests cover traversal refusal before
Fetch, valid installation subfolders, spaces, and invalid URL schemes.

## Dependency updates

All direct npm dependencies with newer published versions were updated using
exact versions, with the lockfile and third-party notices regenerated:

- Univer presets: 1.0.4 → 1.2.0, kept aligned across all eleven packages.
  [Upstream release notes](https://github.com/dream-num/univer/releases/tag/v1.2.0)
  describe spreadsheet/formula and drawing fixes; the Pro collaboration changes
  are not integrations used by this application.
- Trystero Nostr: 0.25.4 → 0.26.0. The local-only action fallback now includes
  the newly required `onReceive` field.
- Mermaid-to-Excalidraw 2.3.0, maxGraph 0.25.1, docx 9.14.0, Harper 2.13.0,
  KaTeX 0.19.1, Lucide 1.61.0, Marked 18.1.1 and MathLive 0.111.1.
- Playwright: 1.63.0 → 1.64.1, with the matching browser engines installed.
- Relay: btcec 2.5.1, secp256k1 4.4.1, DTLS 3.1.15, STUN 3.1.7,
  transport/v4 4.1.1 and x/net 0.61.0; `go mod tidy` refreshed the module graph.

## Validation

- Unit checks: 232 spelling rules, 27 core regressions and 10 Pages gates pass;
  all translation catalogs have zero missing keys or placeholder mismatches.
- Production build and TypeScript check pass, including PWA generation:
  932 precache entries, 40,261.87 KiB.
- All 587 production npm packages have license metadata.
- `npm audit --audit-level=low`: zero reported vulnerabilities.
- `npm outdated --json`: no outdated direct dependencies at review time.
- `go test ./...` and `go vet ./...`: pass.
- `govulncheck` 1.8.0: zero reachable vulnerabilities and zero affected imported
  packages. Module-level notice GO-2026-5932 concerns the unused OpenPGP package
  inside x/crypto; Ofimeo does not import it, and no fixed version is listed.
- New redirect regressions: six tests pass across Chromium, Firefox and WebKit.
- Full browser regression run (`npm run test:e2e -- --workers=2`): 236 pass,
  one skipped, zero failures across Chromium, Firefox and WebKit (15.2 minutes).
  The existing form-receipt test skips on this WebKit build because native
  X25519 is unavailable; that test passes in Chromium and Firefox.
- `git diff --check`: passes.

## Publication follow-up — 26 October 2026

The first hosted PR run passed 236 browser tests but failed the chart export
test on both attempts. Its screenshots showed an empty sheet: the test's
hard-coded canvas click had not focused a cell before typing. The local run
had passed, so its success did not establish that this coordinate worked on
the Linux runner. The test now fills and verifies each source cell through the
accessible table view, then selects `A1:B4` through the named reference box.
The chart preview, native XLSX/ODS export and chart reimport assertions remain.
Hosted CI must pass before this change is merged or published.

## Limits and retained scope

The previous exclusion of legacy-storage migration remains in place; its
previously documented reconciliation issue is not changed by this review.
No authenticated production Nextcloud/Moodle checks, hosted CI, deployment or
Docker build were performed. Docker is not installed in the current shell.
Build warnings about PDF.js resource directories and third-party `use client`
directives remain; a successful build alone does not establish every runtime
path or external service integration.
