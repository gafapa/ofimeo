# Contributing

## Setup

Requirements: Node 24 or later, npm; Go 1.27.1 or later for the relay; Chromium for e2e tests
(`npx playwright install chromium` on a fresh machine).

```bash
npm install
npm run dev        # dev server on the LAN (runs prepare:assets first)
npm run build      # type check + production build into dist/
npm run preview    # serve dist/
```

`prepare:assets` copies Excalidraw fonts, builds draw.io shape libraries into
`public/diagram-libs` (download cached in `node_modules/.cache`), and builds
the legal pages and third-party notices. Generated files are not committed.

Relay: `cd relay && go build -o ofimeo-relay . && ./ofimeo-relay --help`
(see [docs/relay.md](docs/relay.md)). Docker: `docker compose up --build`
(see [docs/deploy-school.md](docs/deploy-school.md)).

## Checks (all run in CI)

```bash
npm run typecheck
npm run test:unit      # spelling rule tests + i18n key check
npm run build
npm run test:e2e       # Playwright against dist/ + tests/relay.mjs on 7790
cd relay && go vet ./... && go test ./...
```

- Run one spec: `npx playwright test tests/e2e/writer-toc-pdf.spec.ts`.
- Parallel runs on other ports: copy `playwright.config.ts` to
  `playwright.<name>.config.ts` (git-ignored), change the ports, and set
  `E2E_RELAY_PORT` / `E2E_RELAYS`.
- e2e tests never use public relays; open pages through `tests/e2e/helpers.ts`.
- Onboarding (tour, quick starts) is skipped under WebDriver; add `?tour` to
  force it.

## Code conventions

- TypeScript, no semicolons, 2 spaces, single quotes; comments and identifiers
  in English; match the surrounding code.
- New apps and UI use the shared frame ([docs/ui-frame-api.md](docs/ui-frame-api.md))
  and theme tokens (`src/ui/tokens.css`); no hard-coded colours, no
  `confirm()`/`alert()`.
- Read-only must be enforced in code (disabled controls, command guards,
  shortcuts, WebMCP tools), not only by CSS.
- Dependencies: permissive licences only; pin versions; run
  `npm run legal` after adding one.
- Adding an app: follow how `forms`, `pdf` or `notebook` were added (registry,
  `DocType`, Nextcloud `SAVE_EXTS`, content search, templates, WebMCP tools,
  help article, quick start, README).

## Translations

UI strings are English source text wrapped in `t('…')` / `tn(n, '…', '…')`
(`src/core/i18n.ts`). Catalogs: `src/core/locales/{es,gl,fr,de}.ts`.

1. Write your keys in two files under `scripts/i18n/sources/`:
   `tr-<topic>.txt` with `English ||| Spanish ||| Galician` and
   `fdk-<topic>.txt` with `English ||| French ||| German`, one per line.
2. `python3 scripts/i18n/apply-translations.py tr-<topic>.txt fdk-<topic>.txt`
   (adds missing keys only; never removes).
3. `npm run i18n:check` must report 0 missing and 0 placeholder mismatches.

Help articles are per-language TypeScript files in `src/help/articles/`
(all five languages must have every article; the type system enforces it).

## Documentation

- Feature docs: README.md. Admin docs: `docs/*.md`.
- Record design decisions in [docs/DECISIONS.md](docs/DECISIONS.md) and plans
  in [docs/ROADMAP.md](docs/ROADMAP.md).
- Historical design briefs and review reports: [docs/design/](docs/design/).
