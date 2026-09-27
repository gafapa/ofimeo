# Legal texts of Ofimeo

> **Disclaimer.** These texts are templates prepared from the behaviour of the code. They are **not legal advice** and must be reviewed by a lawyer and, for schools and education authorities, by their Data Protection Officer (DPD/DPO) before they are published or relied on. The owner is responsible for their accuracy: whenever the application changes (new services, storage, integrations), the texts must be reviewed again.

The **Spanish version is authoritative**; Galician, English, French and German are translations for information, and every translated page says so and links to the Spanish one.

## Files

| Path | What it is |
| --- | --- |
| `legal.config.json` | The only place with the owner's data (see [Placeholders](#placeholders)). Injected at build time. |
| `docs/legal/<lang>/notice.md` | Aviso legal / legal notice (LSSI-CE art. 10) |
| `docs/legal/<lang>/privacy.md` | Política de privacidad (GDPR arts. 13/14, LOPDGDD) |
| `docs/legal/<lang>/cookies.md` | Cookies and local storage (LSSI-CE art. 22.2) |
| `docs/legal/<lang>/terms.md` | Condiciones de uso / terms of use |
| `docs/legal/<lang>/accessibility.md` | Declaración de accesibilidad (RD 1112/2018, EN 301 549 / WCAG 2.1 AA) |
| `docs/legal/<lang>/schools.md` | Information for schools: data flows, roles, record of processing template, risks, recommended configuration, text for families |
| `docs/legal/<lang>/ai.md` | Note on artificial intelligence (AI Act transparency, WebMCP) |
| `scripts/third-party-notices.mjs` | Writes `THIRD_PARTY_NOTICES.md` from the production dependencies; fails if one has no license |
| `THIRD_PARTY_NOTICES.md` | Generated; commit it when dependencies change |
| `scripts/build-legal.mjs` | Builds `public/legal/**` (HTML pages, generated, git-ignored) and `public/.well-known/security.txt` |
| `src/legal/pages.css` | Style of the static pages (uses `src/ui/tokens.css`, copied next to it) |
| `src/legal/links.ts`, `src/legal/legal.css` | Links in the app: home screen footer and *About* dialog (`legalLinks()`, `legalLinksNav()`, `legalFooter()`) |

`<lang>` is `es` (authoritative), `gl`, `en`, `fr`, `de`.

## How the pages are built

`npm run legal` (run automatically by `npm run dev` and `npm run build` through `prepare:assets`):

1. `scripts/third-party-notices.mjs` reads `package-lock.json` (packages not marked `dev`) and each package's `package.json` and license/notice files, and writes `THIRD_PARTY_NOTICES.md`. It exits with an error if a production dependency declares no license and ships no license file (CI runs it with `--check` as its own step).
2. `scripts/build-legal.mjs` turns every `docs/legal/<lang>/*.md` into `public/legal/<lang>/<page>.html` (plus an index per language, `public/legal/index.html`, which opens the index in the interface language, and `public/legal/licenses.html` from `THIRD_PARTY_NOTICES.md`), and writes `public/.well-known/security.txt`.

The pages are plain HTML files, so the service worker precaches them with the rest of the build: they open offline. They follow the suite's theme and text size (Accessibility preferences). The app links to `legal/<interface language>/…` from the home screen footer and from *Help → About Ofimeo*.

Markdown syntax in the sources: `{{key}}` inserts a value of `legal.config.json` (dotted path); `{{#if key}}…{{else}}…{{/if}}` and `{{#if key=value}}…{{/if}}` keep text conditionally. ISO dates (`2026-09-26`) are written out in each language. Any value may be a string or an object with one value per language (`{"es": …, "en": …}`). French typography (no-break spaces) is applied automatically.

**Empty values** are rendered as highlighted placeholders (`[titular]`), the page shows a "draft" banner, and the build prints the list of missing keys. The GitHub Pages workflow builds with `LEGAL_STRICT=1`, which makes any empty value an error, so incomplete texts cannot be published by accident.

## Placeholders

All owner data live in `legal.config.json`. Status at the time of writing (2026-09-26):

| Key | Used for | Status |
| --- | --- | --- |
| `siteName` | Name of the service | Ofimeo |
| `siteUrl` | Site address; `Canonical` of security.txt | https://ofimeo.com |
| `lastUpdated` | "Last updated" of every page | 2026-09-26 (update on every change) |
| `owner.name` | Titular / data controller | Filled |
| `owner.nif` | NIF/CIF | Filled |
| `owner.address` | Domicilio | Filled |
| `owner.email` | Contact email | Filled |
| `owner.phone` | Phone (optional; row omitted when empty) | Empty (optional) |
| `owner.registry` | Registry details (companies; optional) | Empty (not applicable to a natural person) |
| `dpo.name`, `dpo.email` | Data Protection Officer | Empty: the texts say that none is designated and give `privacyEmail` |
| `privacyEmail` | Requests about personal data (falls back to `owner.email`) | Filled |
| `jurisdiction` | Optional forum clause (e.g. "los juzgados y tribunales de Pontevedra") | Empty: "the courts that have jurisdiction under the applicable law" |
| `hosting.provider`, `hosting.country`, `hosting.transfers`, `hosting.privacyUrl` | Web host and international transfer basis | GitHub Pages defaults; change if the site moves |
| `accessibility.status` | `partial` / `full` / `none` | `partial` |
| `accessibility.preparedOn` | Date of the accessibility statement | 2026-09-26 |
| `accessibility.reviewedOn` | Last review (optional) | Empty |
| `accessibility.method` | `self` (self-assessment) or `audit` | `self` |
| `accessibility.contactEmail` | Accessibility contact (falls back to `owner.email`) | Falls back |
| `accessibility.complaintBody` | Public sector only: body handling complaints | Empty: private owner, voluntary statement |
| `security.contact` | security.txt `Contact` | mailto:pablo@ofimeo.com |
| `security.expires` | security.txt `Expires` (empty = build date + 180 days) | Empty (auto) |
| `security.policy` | security.txt `Policy` URL (optional) | Empty |
| `security.languages` | security.txt `Preferred-Languages` | es, gl, en |

## What the owner must check or decide before publishing

1. **Legal review** of all seven texts in Spanish (authoritative) and of the translations.
2. **Publishing personal data.** The owner is a natural person: the legal notice publishes name, NIF and home address, as LSSI-CE art. 10 requires from information society service providers. Ask the lawyer whether the service (free, no economic activity) falls under LSSI-CE and whether a professional address or a company would be preferable.
3. **Hosting.** Confirm the actual host of `ofimeo.com` (GitHub Pages with a custom domain, or other), its log retention, that it sets no cookies, and its transfer mechanism (GitHub states it participates in the EU-U.S. Data Privacy Framework; verify the current certification). Update `hosting.*` if needed.
4. **Jurisdiction clause** (`jurisdiction`), if a specific forum is wanted and lawful (not against consumers).
5. **DPO.** Confirm that no DPO is required (GDPR art. 37, LOPDGDD art. 34). Schools and education authorities that deploy their own instance **must** fill in their DPO.
6. **Accessibility.** The list of non-accessible content comes from a code review, not an audit. Commission an EN 301 549 audit, then update `accessibility.*` and the list in `accessibility.md`, and review the statement at least once a year.
7. **WebMCP / AI.** At the time of writing the WebMCP integration was not present in the code base; the privacy policy, terms, AI note and school guide describe it as optional and off by default, and state that changes by assistants are recorded as suggestions or with their own authorship. Verify these statements when the feature lands, or remove them.
8. **Security wording.** The texts claim end-to-end encryption of collaboration (encrypted signalling with the document key, DTLS data channels) and Ed25519 signatures of document changes, which the code implements. They do **not** claim signed application updates: updates are delivered by the host over HTTPS. Do not add such a claim unless code signing is implemented.
9. **Storage list.** `cookies.md` lists the localStorage/IndexedDB/Cache Storage keys in the code on 2026-09-26. Review it when features add storage (search the code for `words-online:`).
10. **security.txt** must be served at `https://ofimeo.com/.well-known/security.txt` (domain root). It works when the build is published at the root of the domain; for a sub-path deployment (e.g. `user.github.io/repo/`) copy it to the domain root instead. `Expires` is renewed on each build; rebuild at least every six months or set `security.expires`.
11. Keep `lastUpdated` current and keep previous versions (git history) as evidence of what was published when.

## Third-party licenses: notes and risks

- **Coverage.** `THIRD_PARTY_NOTICES.md` lists every production package (a superset of what reaches the browser), the draw.io shape libraries (Apache-2.0 plus the stencil restriction, from `public/diagram-libs/LICENSE` and `NOTICE`), the Excalidraw fonts (OFL-1.1, Comic Shanns MIT; license attribution taken from the Excalidraw repository, verify when updating Excalidraw) and the spelling dictionaries. Standard MIT/ISC texts are printed once with each package's copyright line; the Apache-2.0 text once; NOTICE files in full.
- **Spelling dictionaries (GPL/LGPL/MPL).** They are served as separate data files loaded at run time (mere aggregation), not linked into the code, so they do not impose their license on Ofimeo's code. Obligations that remain: ship the license texts (done: `dictionaries/<lang>-LICENSE.txt` and the licenses page), mark them as modified (the conversion strips morphological fields; stated in the notices) and make the corresponding source available (the original `dictionary-*` packages plus `scripts/spell-dictionaries.mjs`; publishing the repository is enough, otherwise include a written offer). The German dictionary's license file is only a GPL notice without the full text; the full GPL-3.0 text is included in the licenses page (the dictionary is "GPL-2.0 or GPL-3.0"). Consider copying it next to `dictionaries/de-LICENSE.txt` in `scripts/spell-dictionaries.mjs`. The Spanish dictionaries are tri-licensed (GPL-3.0 / LGPL-3.0 / MPL-1.1): state which one you use (MPL-1.1 is the least demanding).
- **draw.io stencils and icons** carry a non-open-source restriction (no use in Atlassian products or marketplace). It passes on to anyone redistributing Ofimeo. Do not describe them as covered by Ofimeo's own license.
- **Fonts (OFL-1.1)** may be bundled and redistributed with software but not sold on their own; keep their license and do not rename modified versions under reserved font names.
- **Dual-licensed packages**: `jszip` (MIT or GPL-3.0-or-later) and `dompurify` (MPL-2.0 or Apache-2.0) are used under the permissive option.
- **`buffers` 0.1.1** (dependency of `exceljs` → `unzipper` → `binary`) declares no license. It is Node.js-only and not in the browser build (the browser build of exceljs does not include it), so it is listed as "not bundled" in `NOT_BUNDLED` in the script. Any other package without a license fails the build.
- **Ofimeo Relay** (`relay/`, Go) has its own Go module dependencies, which are not covered here. If the relay binary is distributed (and especially if it embeds the web app), generate its notices too (for example with `go-licenses`) and include this `THIRD_PARTY_NOTICES.md` with it.

## Project license (not decided)

The repository has no `LICENSE` file for Ofimeo's own code, so today **all rights are reserved** and nobody else may lawfully redistribute or modify it (the legal notice says so). All dependencies are compatible with each option below. The owner should choose one and add `LICENSE`:

| License | Type | Implications for Ofimeo |
| --- | --- | --- |
| **MIT** | Permissive | Simplest; anyone (including companies) can reuse, modify and relicense, even in closed products. No patent grant. Maximum adoption, no guarantee that improvements come back. |
| **Apache-2.0** | Permissive | Like MIT plus an explicit patent grant and patent-retaliation clause, a NOTICE mechanism and a requirement to mark changes. Same license as Univer, maxGraph and Harper. Compatible with GPL-3.0/AGPL-3.0 (not GPL-2.0-only). |
| **AGPL-3.0** | Strong copyleft, network clause | Anyone who modifies Ofimeo and offers it to users over a network (e.g. a company or administration hosting a modified instance) must publish the modified source. Keeps improvements open; may discourage some commercial or institutional reuse. Apache-2.0/MIT/ISC dependencies are compatible. |
| **EUPL-1.2** | Copyleft (weaker linking rules), EU public-sector licence | Created by the European Commission; official versions in all EU languages including Spanish, legally valid in EU law, covers network use (SaaS) as distribution. Explicit compatibility list (GPL-2.0/3.0, AGPL-3.0, LGPL, MPL-2.0, EPL, CeCILL…) allows combining with those. Well known by Spanish and Galician administrations (e.g. the CTT / Centro de Transferencia de Tecnología). |

Points to weigh: whether institutions (Consellería, other regions) should be able to adopt and adapt it freely (EUPL-1.2 or Apache-2.0 are common choices in the public sector), whether improvements by third parties must stay open (AGPL-3.0 or EUPL-1.2) and whether contributions need a contributor agreement (CLA/DCO) so the owner can relicense later. The name and logo can be protected separately (trademark), whatever the code license.
