# Ofimeo — notes for AI coding agents

Browser-only collaborative office suite for schools (Vite + TypeScript PWA, no
backend; Yjs + WebRTC; optional Go relay in `relay/`). Start with
[README.md](README.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md),
[docs/DECISIONS.md](docs/DECISIONS.md) and [docs/ROADMAP.md](docs/ROADMAP.md).

## Rules

- Code, identifiers, comments and docs in English. No semicolons, 2 spaces,
  single quotes; match surrounding style.
- UI strings: `t('English text')`. Add translations only with
  `python3 scripts/i18n/apply-translations.py <tr file> <fdk file>` (see
  CONTRIBUTING.md); never rewrite the locale catalogs. `npm run i18n:check`
  must pass. Help articles exist in all five languages.
- Use the shared frame (`src/ui/frame.ts`, `docs/ui-frame-api.md`) and theme
  tokens; no `confirm()`/`alert()`.
- Respect `session.access`: view/comment links must not reach edit paths
  (toolbar, overflow panel, shortcuts, menus, WebMCP). Enforce in code.
- Nothing leaves the browser except to peers, the configured relay,
  Nextcloud or Moodle. No third-party services.
- Permissive dependency licences only; pin versions; `npm run legal` after
  adding one.

## Checks before committing

```bash
npm run typecheck && npm run test:unit && npm run build
npx playwright test            # or a single spec
cd relay && go vet ./... && go test ./...
```

Temporary Playwright configs (`playwright.*.config.ts`) are git-ignored; never
commit build output, relay binaries or `public/legal`.
