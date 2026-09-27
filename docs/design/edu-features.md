# Education features — shared rules for all agents

Project: /home/user/ofimeo — browser-only collaborative office suite (Vite 8 + TypeScript, no backend,
PWA, Yjs + y-indexeddb, P2P over Trystero/Nostr WebRTC). Apps: writer (TipTap 3), sheet (Univer), draw
(Excalidraw), diagram (own editor on maxGraph). Read README.md (architecture) first.

Several agents work IN PARALLEL in the SAME working tree. Rules:
- Only edit the files/areas you own (listed in your task). If you must touch a file owned by another agent,
  keep it to a minimal additive change, re-read the file right before editing, and mention it in your report.
- Dependencies are already installed (mathlive, katex, pptxgenjs, @fontsource/opendyslexic,
  @fontsource/atkinson-hyperlegible, roughjs, …). Do NOT run `npm install`/change package.json unless strictly
  needed; if needed, say so in the report instead.
- Code, identifiers, comments and README in English; no semicolons, 2 spaces, single quotes, concise comments,
  match surrounding style. UI strings: write them in English for now, and wrap every NEW user-visible string
  with `t('…')` from `src/core/i18n.ts` (a stub exists: `t(key: string, vars?)` returns the English text with
  {var} interpolation; a later agent will add Spanish and Galician translations for all strings).
- Session contract (core agent implements it, others consume it): `session.access: 'edit' | 'comment' | 'view'`
  (from the link). Apps must make the editor read-only when access !== 'edit' (writer: comment mode allows
  adding comments only). Until the core agent lands it, read it as `(session as any).access ?? 'edit'`.
- Tests: Playwright global (`require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright')`),
  Chromium preinstalled, never `playwright install`. Use a UNIQUE vite port (given in your task) with
  `npx vite --port <port> --strictPort`. Local Nostr relay for two-browser tests:
  `node (working notes) relay.cjs <port>`
  and open pages with `?relays=ws://localhost:<port>#app=…`. Never kill processes with pkill -f/pgrep -f
  (it kills your own shell); kill by PID.
- Scratch files only under (working notes) <your-folder>/.
- `npx tsc --noEmit` must be clean for your files. Do NOT commit or push.
- Update README.md only in the section(s) about your feature (short, additive).
- Final report: what works, what not, files changed, test evidence (screenshot paths).

## Update (wave 2)
- The suite is now "Ofimeo". A shared app frame exists: read scratchpad/ui-foundation/API.md and the comments at the top of
  src/ui/frame.ts, menus.ts, shortcuts.ts, toolbar.ts, statusbar.ts, zoom.ts; tokens in src/ui/tokens.css. The writer and home
  are the reference implementations. New/migrated UI must use them (no hard-coded colors; confirmDialog, not confirm()).
- Translations: do NOT hand-edit src/core/locales/*.ts. Put your new keys in YOUR OWN source files in
  scratchpad/i18n-frde/ (e.g. tr-<yourname>.txt with `key ||| es ||| gl` and fdk-<yourname>.txt with `key ||| fr ||| de`),
  then run gen_esgl.py, gen.py and keys.mjs there (they merge all source files); 0 missing for your keys at the end.
- Several agents run at once: if the type check fails only in files you don't own (another agent mid-edit), verify in a copy of
  the tree (see how scratchpad/ui-foundation/tree was made) and say so in your report.

## IMPORTANT (translations, supersedes the wave-2 note)
Do NOT run gen.py / gen_esgl.py (they rebuild the whole catalogs and drop entries other agents added). Instead add ONLY your
new keys with scratchpad/i18n-frde/apply_tr.py <tr-file> <fdk-file> (additive: inserts missing keys, never removes), using your own tr-<name>.txt /
fdk-<name>.txt source files, then run keys.mjs to check your keys are 0 missing.
