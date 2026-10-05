# Nextcloud and Moodle integration review — 6 October 2026

Source review of `src/core/nextcloud.ts`, `src/ui/nextcloud.ts`,
`src/core/moodle.ts`, `src/ui/moodle.ts`, the Nextcloud store-and-forward
backend and `relay/moodle.go`, plus unauthenticated CORS checks from the
`https://ofimeo.com` origin against the deployed Moodle Aula
(`aula.gallego.top`) and Nextcloud (`drive.gallego.top`).

## Live servers

| Endpoint | Allows ofimeo.com | Effect |
| --- | --- | --- |
| Nextcloud `status.php` | yes (`*`) | the connection test finds the server |
| Nextcloud WebDAV (preflight) | **no** (401, no CORS headers) | browsing, opening and saving fail |
| Nextcloud `index.php/login/v2` | **no** | Login Flow fails |
| Moodle `login/token.php`, `webservice/rest/server.php`, `webservice/upload.php`, `webservice/pluginfile.php` | yes (`*`) | sign-in, tasks, hand-in and attachments work directly |
| Moodle `lib/ajax/service-nologin.php` | no | single sign-on cannot be detected (Aula uses passwords) |

Nextcloud needs `deploy/nextcloud-apache-cors.conf` activated on the server.

## Findings and changes

| Priority | Finding | Change |
| --- | --- | --- |
| High | The prepared Apache CORS file matched `/login/v2` only; Ofimeo calls `/index.php/login/v2` and `/index.php/login/v2/poll`, so Login Flow would have stayed blocked once activated. | Patterns include `(?:index.php/)?login/v2`. |
| Medium | Moodle attachment links (and `pluginfile` links in descriptions) carried the mobile token (`?token=`) in a URL the browser keeps (history, downloads list): on a shared school computer anyone could reuse it. | Links point to the normal Moodle address (no token); clicking downloads through `downloadFile` (token in the request only, direct or via the relay). |
| Low | The Nextcloud Login Flow opened the `login` address the server returned without checking it, in a tab that shares the app's origin; a `javascript:` address would run as Ofimeo (the CSP blocks it). | Only `http(s)` addresses are accepted. Unit test. |

## Checked without changes

- Nextcloud requests never send cookies; Basic authentication with app
  passwords; `If-Match` / `If-None-Match` against overwriting; XML parsed with
  `DOMParser` (no entities); diagnosis tells CORS from wrong address, mixed
  content and maintenance; app passwords from Login Flow are revoked on sign
  out; connections are session-only unless remembered.
- Store-and-forward in Nextcloud keeps only encrypted blobs under opaque ids.
- Moodle: simple requests (no preflight), `credentials: 'omit'`,
  `referrerPolicy: 'no-referrer'`; the relay is used only when advertised for
  the same site and, unless set by the school, after consent; file downloads
  are limited to the connected site; descriptions and feedback are rebuilt
  from an allowlist (http(s) links and images only).
- Relay Moodle proxy: only the configured site, a fixed list of web service
  functions, no redirects, size/time/concurrency limits, file answers as
  sandboxed attachments, logs without tokens.

## Not changed

- Images in Moodle descriptions keep the token in their address (not kept in
  history), as in the Moodle app.
- Moodle single sign-on remains unsupported in the browser (see the
  2 October review).
