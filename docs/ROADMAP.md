# Roadmap

Maintained priorities as of 3 November 2026. Decisions behind the current
design are in [DECISIONS.md](DECISIONS.md); feature limits are in README ›
Limitations.

## Current state

Eight apps (writer, sheet, draw, diagram, slides, forms, PDF, notebook) on a
shared frame, UI in en/es/gl/fr/de, P2P collaboration with signed permission
links, store-and-forward sync, Nextcloud, Moodle, WebMCP (about 140 tools:
review mode, batches, pictures, versions, new documents, teaching tools,
pseudonyms; see [webmcp.md](webmcp.md)), school config and Docker deployment. CI: type check, spelling rule tests, i18n key check, build,
browser permission/storage regressions, relay Go tests and Docker startup.
Use `npx playwright test --list` for the current browser matrix.

## Owner actions (not code)

- [ ] Legal review of `docs/legal/` and `legal.config.json`.
- [ ] Tag `relay-v*` to publish relay binaries.

## Verify with real services

Authenticated workflows below still require qualification in the intended
school environment. Earlier server-health and CORS observations were snapshots,
not current deployment guarantees. Follow [nextcloud.md](nextcloud.md) and
[moodle.md](moodle.md), and verify the actual server configuration before use.

- [ ] Nextcloud: sign-in, open/save, share-link upload, store-forward folder.
- [ ] Moodle: direct CORS on `login/token.php` and `webservice/rest/server.php`
      (the code assumes Moodle's mobile-web CORS header), task list, hand in,
      submission statement; with and without the relay.
- [ ] Word and LibreOffice opening native charts written by the writer (DOCX)
      and slides (PPTX).
- [ ] Text-to-speech voices and dictation on real devices.
- [ ] Docker image on a Raspberry Pi and on Windows with the relay binary.
- [ ] WebMCP with a real assistant (MCP-B extension, Chromium's built-in
      agent): image results, confirmations and review mode end to end.

## Next (proposed priorities)

Legacy migration now retains original indexes and databases and copies new
databases atomically. A reviewable recovery interface for comparing coexisting
old/current indexes and Yjs histories is still needed; automatic history merging
is intentionally avoided. See [security.md](security.md).

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
8. **Performance**: sheet bundle size and cold-start time on low-end
   Chromebooks. Measure with `npm run measure:install` and actual school
   networks before changing the full-suite offline caching contract.

## Ideas (not scheduled)

- Graphing calculator as a standalone app.
- Rubrics shared across apps (writer/PDF correction with a rubric panel).
- Offline dictation via on-device models when browsers support them.
- LTI 1.3 for LMSs other than Moodle.

## How to pick up work

Read [CONTRIBUTING.md](../CONTRIBUTING.md) for setup, tests and the i18n
workflow. Use [security.md](security.md) for maintained guarantees and known
risks, and the checked-in tests for executable regressions. Historical audits
and superseded implementation briefs are available in Git history.
