# Project review — 5 October 2026

## Scope

Source review of application logic not covered by the September and October
reviews: rendering of shared and imported content, the signed sync protocol,
the relay's endpoints, dependency alerts published since, and accessibility of
the screens changed in September. Findings were reproduced in a production
build before being fixed.

## Findings and changes

| Priority | Finding | Change |
| --- | --- | --- |
| Critical | Diagram and presentation labels with `html=1` were inserted as HTML by maxGraph without sanitizing: `sanitizeHtml` only ran when a label was edited. An imported `.drawio` with `<img onerror>` in a label ran the handler (reproduced). Any editor of a shared diagram or presentation could do the same to everyone who opened it, view links included, and read the document keys in `localStorage`. Presentations also parsed labels in detached `div` elements, which load images and run handlers (reproduced in Chromium). | Sanitize HTML labels when drawn, in `applyLook` (diagrams, presentations, thumbnails, exports), with a cache; `%placeholder%` values are covered. Parse labels in an inert document (`createHTMLDocument`) in slide comments, the animation pane and list toggling. The sanitizer also removes `<base>` and `<frame>`. New e2e regression (fails without the fix). |
| Critical (deployment) | ofimeo.com still sent the September CSP with `script-src 'unsafe-inline'`, and GitHub Pages sends no CSP: neither blocked the handlers above. | ofimeo.com uses the repository CSP (Traefik), verified live (the malicious label no longer runs). The production build and the legal pages carry the script directives of that CSP (`script-src`, `object-src`, `base-uri`) in a `<meta>` tag, generated from `deploy/nginx/ofimeo-headers.inc`; an e2e test keeps them equal. Network rules stay in the server header: the full policy in a `<meta>` tag would block schools' own http servers (the Moodle and Nextcloud test mocks showed it). |
| High | A signed message's signature was marked as seen before it was verified. A peer in the room (a view link is enough) could relay a forged copy carrying a genuine signature first; the genuine change was then dropped. | Mark signatures as seen only after verification, and re-check before applying. New unit test reproduces the attack (fails without the fix). |
| High | A new advisory (GHSA-vfj7-8cjw-p6xm, no patched release) made `npm audit --audit-level=high` fail through `@excalidraw/excalidraw` → `sass` 1.51 → `chokidar` 3 → `braces`; the next CI run would have failed. Excalidraw does not import `sass` at runtime. | Override Excalidraw's `sass` with 1.105.1 (chokidar 5, no `braces`). `npm audit`: 0 vulnerabilities. Third-party notices regenerated. |
| Medium | The Pages workflow moved to `upload-pages-artifact@v5`, which leaves out hidden files: `/.well-known/security.txt` was missing from GitHub Pages (404). | `include-hidden-files: true`. |
| Medium | Notebook ink: the stroke width from the shared document reached SVG markup unescaped (printing). | Only numbers and escaped colors reach the markup. |
| Medium | Accessibility (axe): the selected home tab had 4.0:1 contrast; the document and notebook editors had no accessible name; the home screen had no `main` landmark; template cards (buttons) had the `listitem` role; empty lists contained only a message. | Selected tab text uses the text color (accent underline stays); editors are named; tab panels are in `main`; list items wrap the cards; lists drop the list role while empty. |

## Checked without changes

- Key model: access comes from the secrets a link holds; links cannot be
  upgraded; comment seeds derive one-way from edit seeds.
- Writer (Tiptap): `javascript:` links and `onerror` attributes from imported
  HTML are dropped (verified).
- PDF.js 6 no longer evaluates code from fonts (`isEvalSupported` is gone).
- Relay mailbox store: per-document and total quotas, time to live, signed
  writes with a clock-skew window and per-address rate limits.

## Not changed

- **Relay store total quota.** Many addresses together could fill the total
  quota (the disk stays bounded). A per-address mailbox limit would block
  schools where everyone shares one public address; the current per-address
  rate limits are kept.
- **Unused translations.** 43 catalog entries are no longer used. The catalogs
  are only changed through `apply-translations.py` (add-only, see
  CONTRIBUTING.md); a pruning option would be a separate tooling change.
- **Remote images in labels** remain allowed (`img-src https:`): diagrams use
  them, at the cost of possible tracking pixels in shared diagrams.

## Verification

Type checking, unit tests (232 spelling rules, 14 core tests including the new
signature test), translation catalogs, the production build and `npm audit`
(0 vulnerabilities) pass. The new e2e tests pass and were checked to fail
without their fix. The full Playwright suite was run with the CSP meta tag in
the production build: 89/89 pass. The axe helper of the sheet accessibility
test now loads axe through the test channel, since the page's CSP blocks
inline scripts. CI is the final gate.
