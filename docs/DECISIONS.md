# Decision log

Why Ofimeo is built the way it is. Each entry: the decision, the reason, and
what it costs. Newest decisions are at the end of each section. When a decision
changes, add a new entry that supersedes the old one instead of rewriting it.

## Product

**D1. Browser-only, no backend.** Everything runs in the browser as a PWA;
documents live in IndexedDB. *Why:* schools can use it without accounts,
servers or data-protection paperwork; it works offline; nothing to operate.
*Cost:* no central index, no server-side search, sync needs peers online (see
D9, D10), large bundles.

**D2. Schools first.** Features are chosen for teachers and students
(hand in, correction, quizzes, PDF marking, Moodle, accessibility, es/gl/fr/de
UI). *Why:* the owner's target audience. *Cost:* general office features
(macros, advanced layout) have lower priority.

**D3. Name: Ofimeo.** Chosen after several candidates were taken; ofimeo.com
was free. Legal owner data lives in `legal.config.json`.

**D4. Interoperability with Office and LibreOffice formats** (DOCX/ODT,
XLSX/ODS, PPTX/ODP, draw.io, Visio import, legacy .doc/.xls/.ppt import).
Converters are our own code, tested by round trips and with LibreOffice.
*Cost:* fidelity limits are listed in README › Limitations.

## Collaboration and security

**D5. Yjs CRDT per document + y-indexeddb.** Offline-first merging without a
server.

**D6. P2P over WebRTC with Nostr signalling (Trystero).** Public Nostr relays
by default, several at once. *Why:* no infrastructure. *Cost:* restrictive
networks; solved by D8.

**D7. Permission links signed with Ed25519** (`src/core/keys.ts`). The link
carries the room secret plus the edit or comment key; peers verify every
update. Viewers cannot forge edits. Comments live in a separate `commentsDoc`
signed with the comment key. *Cost:* whoever holds a key can do everything
that key allows (no per-user identity); a modified client with a comment key
can delete comments/chat messages.

**D8. Ofimeo Relay (Go, single binary).** Optional school relay: Nostr relay,
TURN, HTTPS, serving the app, `/ofimeo/config`. *Why:* school networks block
public relays or WebRTC; one binary for Windows/Linux/Raspberry Pi.

**D9. Store-and-forward sync** (`docs/store-forward.md`). End-to-end
encrypted mailboxes on the relay or in a Nextcloud folder, so devices converge
without being online together. The relay sees only opaque ids, sizes and
timing; writes must be signed by the edit/comment key. Public Nostr relays are
not used for storage.

**D10. Nextcloud via WebDAV + CORS**, not a Nextcloud app. *Why:* works with
any existing Nextcloud; admins only add CORS headers (`docs/nextcloud.md`).
*Cost:* whole-file save/open, one account per browser.

## Apps and engines

**D11. Writer on TipTap 3 / ProseMirror** with our own pagination
(absolutely placed blocks per page and column), our own PDF writer (tagged,
subset fonts) and metric-compatible fonts (Carlito, Caladea, Arimo, Tinos,
Cousine) so documents paginate the same everywhere. *Cost:* paragraphs are not
split across pages.

**D12. Spreadsheet: Univer OSS 1.0.2, pinned.** Evaluated against
alternatives when charts were requested; kept Univer and added our own charts
(ECharts, float DOM), formula-based pivot tables and statistics aliases.
Univer internal command ids are pinned; `missingCommands()` shows what to
recheck on upgrade. Univer's paid features are not used. *Cost:* ~2 MB gzipped
bundle; canvas grid needs the accessible table view (D24).

**D13. Diagrams: our own editor on maxGraph** replacing embedded draw.io, with
draw.io's shape libraries loaded on demand and `.drawio` compatibility.
*Why:* no iframe, real collaboration, consistent UI. Slides reuse the same
editor.

**D14. Drawing: Excalidraw.**

**D15. Forms: responses encrypted in the respondent's browser** (X25519 +
HKDF + AES-GCM) to a key only editors can derive; answer keys and grades live
in a private Yjs doc synced only between editors.

**D16. PDF: pdf.js 5.x legacy build + pdf-lib.** pdf.js 6 needs APIs missing
in Playwright's Chromium. Password-protected PDFs keep the original encrypted
bytes; the password is never stored in the document (sessionStorage only).

**D17. Math graphs: own compact parser and SVG renderer** instead of JSXGraph
or mathjs (hundreds of KB each). Stored as an image with the construction JSON
in its title, so DOCX/ODT/PPTX round trips restore it.

**D18. Spelling: own Hunspell engine in a worker** + Harper (English grammar)
+ offline rules, dictionaries as separate cached assets
(`src/core/spell`, UI in `src/ui/spell`). One engine for every app; the
document language is per document, the personal dictionary per browser.

## UI

**D19. Shared app frame** (`src/ui/frame.ts`, API in `docs/ui-frame-api.md`):
same menus, toolbar, status bar, zoom, shortcuts, Help and File order in every
app. New apps must use it.

**D20. i18n with English source strings.** `t('English text')`; catalogs for
es, gl, fr, de in `src/core/locales/`. Translations are added only with
`scripts/i18n/apply-translations.py` (additive), checked in CI by
`scripts/i18n/check-keys.mjs`. Never regenerate catalogs wholesale.

**D21. Read-only must be enforced, not styled.** View/comment links: real
`disabled` state and command guards, including toolbar overflow panels,
shortcuts and WebMCP tools (found by the September 2026 review).

## AI and integrations

**D22. WebMCP, off by default.** Per-browser switch, visible indicator;
tools filtered by access level; writer changes become tracked suggestions
attributed to "AI assistant"; never exposes keys or links. Schools can forbid
it in `ofimeo.config.json`.

**D23. Moodle through its mobile web services**, not LTI or a plugin
(`docs/moodle.md`). Student signs in once (token kept in the browser, never the
password); home shows their tasks (informational); "Hand in to Moodle" uploads
the current document to any open assignment. Direct CORS first, school relay
forwarding as fallback, only to the configured Moodle. *Chosen over* a closed
"assignment" workflow inside Ofimeo (paused by the owner) and over LTI/plugins
(need Moodle admin work). *Cost:* no SSO yet.

**D24. Accessibility is a feature, not a polish item**: accessible table view
for the canvas spreadsheet, keyboard navigation of diagram/slide canvases,
keyboard creation of PDF annotations, live regions, high-contrast themes.

**D25. Import from Google/Microsoft links by guided download**; browsers block
cross-origin export URLs, so an optional relay proxy (allowlisted hosts, off by
default) exists for schools.

## Deployment and process

**D26. School configuration file `ofimeo.config.json`**
(`docs/ofimeo.config.schema.json`): defaults, relays, Nextcloud presets, store,
Moodle, feature toggles and locked settings, loaded before first render and
cached offline. Only trusted from the app's own origin or its configured relay.

**D27. Docker image = web app + relay** (distroless, non-root), plus static
hosting configs for nginx/Apache (`docs/deploy-school.md`). GitHub Pages
deploys `main`.

**D28. Permissive dependencies only** in the shipped app (MIT, BSD, Apache,
ISC, OFL); exceptions are data files under their own licences (dictionaries,
draw.io stencils) served separately with their licence. axe-core (MPL-2.0) is
used only in tests. `THIRD_PARTY_NOTICES.md` is generated and checked in CI.

**D29. Tests:** Playwright e2e against the production build with a local
relay (never public relays), Go tests for the relay, rule tests for spelling,
i18n key check; all in CI. Temporary Playwright configs are git-ignored.
