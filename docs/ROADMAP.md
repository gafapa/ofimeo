# Roadmap

State as of October 2026 and the path forward. Decisions behind the current
design are in [DECISIONS.md](DECISIONS.md); feature limits are in README ›
Limitations.

## Current state

Eight apps (writer, sheet, draw, diagram, slides, forms, PDF, notebook) on a
shared frame, UI in en/es/gl/fr/de, P2P collaboration with signed permission
links, store-and-forward sync, Nextcloud, Moodle, WebMCP, school config and
Docker deployment. CI: type check, spelling rule tests, i18n key check, build,
87 Playwright tests, permission/storage regressions, relay Go tests, Docker image build.

## Owner actions (not code)

- [x] Publish the reviewed application on `main`.
- [x] Enable GitHub Pages (*Settings → Pages → Source: GitHub Actions*).
- [x] Choose Apache-2.0 and add `LICENSE` and `NOTICE`.
- [ ] Legal review of `docs/legal/` and `legal.config.json`.
- [ ] Tag `relay-v*` to publish relay binaries.
- [x] Rename the GitHub repository to `ofimeo`.

## Verify with real services

Read-only server checks confirmed Moodle Aula and Nextcloud are healthy.
Moodle login and REST endpoints allow CORS. Nextcloud WebDAV still needs the
prepared origin-restricted Apache configuration. Authenticated workflows below
remain unverified; see [the October review](PROJECT_REVIEW_2026-10-02.md).

- [ ] Nextcloud: sign-in, open/save, share-link upload, store-forward folder.
- [ ] Moodle: direct CORS on `login/token.php` and `webservice/rest/server.php`
      (the code assumes Moodle's mobile-web CORS header), task list, hand in,
      submission statement; with and without the relay.
- [ ] Word and LibreOffice opening native charts written by the writer (DOCX)
      and slides (PPTX).
- [ ] Text-to-speech voices and dictation on real devices.
- [ ] Docker image on a Raspberry Pi and on Windows with the relay binary.

## Next (proposed priorities)

1. **Moodle SSO** (Google / regional identity providers): Moodle's
   `launch.php` + `urlscheme` token flow or a relay-assisted redirect.
2. **Classroom assignments inside Ofimeo** — paused by the owner; Moodle
   covers it for now. Decide whether a lighter "copy for each student + inbox"
   is still wanted for schools without Moodle.
3. **PDF**: CJK/emoji fonts in export (currently "?"), fillable PDF form
   fields. Standard PDF fonts and CMaps now load from the app origin.
4. **Sheet**: right-click spelling suggestions in the cell editor; accessible
   view support for merged cells and hidden rows; "warn before editing" ranges
   and linked chart ranges should follow row/column inserts.
5. **Diagram/draw PDF export as vectors** (now ~300 dpi images).
6. **Math graphs**: in Draw; intersections of general curves; animation in
   documents.
7. **Notebook**: ink anchored to text; OneNote import.
8. **Store-and-forward**: local sync state is now removed on permanent
   deletion. Public TURN destination restrictions are documented in the relay guide.
9. **Nextcloud**: account selection and session-only connections are implemented;
   verify them against real school deployments.
10. **Performance**: sheet bundle size, cold-start time on low-end
   Chromebooks.

## Ideas (not scheduled)

- Graphing calculator as a standalone app.
- Rubrics shared across apps (writer/PDF correction with a rubric panel).
- Offline dictation via on-device models when browsers support them.
- LTI 1.3 for LMSs other than Moodle.

## How to pick up work

Read [CONTRIBUTING.md](../CONTRIBUTING.md) for setup, tests and the i18n
workflow. The September 2026 review reports in
[design/review-2026-09/](design/review-2026-09/) list every finding and its
fix; use them as a checklist for regressions.

## October maintenance

See [PROJECT_REVIEW_2026-10-02.md](PROJECT_REVIEW_2026-10-02.md) for coordinated
dependency upgrades, security fixes, regression coverage and remaining limits.
