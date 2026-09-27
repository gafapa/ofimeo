# Diagram editor rewrite (maxGraph) — shared spec

Project: /home/user/words-online (Vite + TypeScript, browser-only office suite). We are replacing the embedded draw.io
iframe with our own diagram editor built on **@maxgraph/core 0.24** (Apache-2.0, installed; TypeScript successor of
mxGraph, the engine of draw.io). Files must stay compatible with draw.io (`.drawio` / mxGraphModel XML, style strings).

Shared model: `src/apps/diagram/model.ts` (read it first; do not change its exported API — additions are OK only if
clearly needed, and mention them in your report). Cells are plain records: `CellRecord { id, parent?, previous?, vertex?,
edge?, value?, style? (draw.io style string), geometry? (JSON of GeometryRecord), source?, target?, connectable?,
collapsed?, visible?, data? (JSON of user-object attributes) }`, grouped in `PageRecord { id, name, cells }`.
Cell order: `previous` = id of the previous sibling under the same parent (absent for the first child).

Reference implementation for behaviour/visuals: the draw.io web app is available locally (for testing only; it will be
removed from the product) at `public/drawio/` (served by the Vite dev server at `/drawio/index.html`), unminified
sources in `(working notes) drawio/war/js/`
(`grapheditor/Shapes.js`, `grapheditor/Sidebar.js`, `diagramly/sidebar/*.js`, `grapheditor/Graph.js`), stencils in
`public/drawio/stencils/*.xml`, and hundreds of real diagrams in `public/drawio/templates/**/*.xml` (use them as fixtures).
draw.io is Apache-2.0: porting code is allowed; keep a short attribution comment at the top of ported files.

Rules: code/comments/names in English, match project style (no semicolons, 2 spaces, single quotes, concise comments).
Only touch your own files. `npx tsc --noEmit` must be clean for your files (other files may be mid-rewrite: ignore
errors outside yours). Tests with Playwright (global: `require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright')`,
Chromium preinstalled; never `playwright install`) against `npx vite --port <unique port> --strictPort`; in a page you can
`await import('/src/apps/diagram/…ts')` (Vite resolves bare imports inside project modules). Scratch files only under
(working notes) <your-name>/. Do not commit.
Final report: what is supported, what is not, test evidence.
