# AI assistants (WebMCP)

Ofimeo can offer the open document to an AI assistant that the user runs in
their own browser (a browser extension or the browser's built-in agent) through
[WebMCP](https://webmachinelearning.github.io/webmcp/), the W3C draft that lets
a page register "tools" an agent can call. Ofimeo itself contains no AI and
talks to no AI service: the assistant runs in the user's browser, and its
provider handles what it reads (see the *Note on artificial intelligence* in
`docs/legal/<lang>/ai.md`).

## Turning it on

- **Off by default.** It is turned on per browser with **Tools → Allow AI
  assistants (WebMCP)…** in every app on the shared frame. A dialog explains
  what the assistant will be able to do with the access the current link
  grants, and that it never gets share links, keys or other documents; nothing
  happens until the user presses *Allow*.
- While it is on, an **"AI access on"** indicator is shown in the app bar
  (an icon only on phones). It pulses when a tool is called and a toast
  announces every change; clicking it shows the tools offered and a *Turn off*
  button. *Tools → Allow AI assistants* again also turns it off.
- The setting is stored in `localStorage` (`words-online:webmcp`) and applies to
  every tab of the browser (other open tabs follow at once).
- Nothing WebMCP-related is loaded while it is off. When it is on, the runtime
  and the app's tool module are loaded lazily; the polyfill only if needed.

## Runtime

`src/core/webmcp/registry.ts` uses the browser's native `document.modelContext`
(or the older `navigator.modelContext`) when present. Otherwise it loads the
MIT-licensed [`@mcp-b/global`](https://www.npmjs.com/package/@mcp-b/global)
(pinned, 5.1.0; types from `@mcp-b/webmcp-types` 5.1.0), which implements the
same API and bridges it to MCP-B browser extensions. Its transport is
restricted to the page's own origin (`tabServer.allowedOrigins = [origin]`)
and the iframe transport is off, so a page embedding Ofimeo cannot call the
tools. Tools are registered with `registerTool(tool, { signal })` and removed by
aborting the signal (when the switch is turned off). The polyfill also installs
`navigator.modelContextTesting` (`listTools()`, `executeTool(name, json)`),
which the end-to-end tests use.

## Permissions

The tools offered depend on the access of the link this browser has
(`session.access`), checked when registering and again on every call
(`src/core/webmcp/gate.ts`):

| Link | Tools |
| --- | --- |
| view | read tools only |
| comment | read tools + comments (`add_comment`, `add_note`) |
| edit | read + comment + tools that change the document |

Changes a lower-access browser made anyway would never reach other people (they
are not signed), but the tools are not even offered. Forms respondents (view
links) get no tools at all, so an assistant cannot fill in a quiz for them;
form responses are only readable by editors and answer keys never.

**Never exposed:** share links, permission keys, the room password, other
documents in the browser, the user's settings, Nextcloud credentials.
`get_document_info` returns the title, the app, the access level and a few
counts only.

## Attribution and undo

- **Documents (writer):** text changes (`insert_text`, `replace_range`) are
  always tracked **suggestions**, whatever the user's editing mode, authored
  "AI assistant (*user name*)" in the assistant's own colour; the user accepts
  or rejects them in the review rail. The inserted text carries authorship
  marks of a reserved client named "AI assistant" (*Show authorship*).
  Headings and character formatting are not tracked by suggestions, so
  `apply_heading` and `format` are applied directly as one undo step.
- **Other apps:** every change is one step of the app's undo history (one
  Univer command, one maxGraph batch, one Excalidraw history entry, one Yjs
  undo item).
- **Version history:** before the assistant's first change in a page session a
  version "Before changes by the AI assistant" is saved; after a burst of
  changes (15 s without more, or when the page is closed) a version "Changes by
  the AI assistant" authored "AI assistant (*user*)" is saved. Restoring the
  first one undoes everything the assistant did.
- **Comments** written by the assistant are signed "AI assistant (*user*)"
  (in the spreadsheet, the note text starts with it).

## Tools

All apps: `get_document_info`.

| App | Read (view) | Comment | Edit |
| --- | --- | --- | --- |
| Documents | `get_text` (Markdown with CriticMarkup `{++ins++}` `{--del--}` for pending suggestions, or plain), `get_outline`, `find`, `list_comments` | `add_comment` (on text or as a reply) | `insert_text`, `replace_range` (suggestions), `apply_heading`, `format` |
| Spreadsheets | `list_sheets`, `read_range`, `list_comments` (cell notes) | – | `write_range` (values and `=` formulas), `add_sheet`, `insert_chart` (charts model of `src/apps/sheet/charts`), `add_comment` (cell note) |
| Presentations | `list_slides`, `get_slide`, `list_comments` | `add_comment` | `add_slide`, `set_text` |
| Diagrams | `get_diagram` (summary or draw.io XML) | – | `add_shape`, `connect`, `set_label` |
| Forms (editors) | `get_form` | – | `add_question`, `get_responses` (editors only) |
| PDF | `get_text` (per page), `list_comments` | `add_note` | `add_highlight` |
| Drawings | `get_scene` | – | `add_element` |

Text is located by exact text (`match` + `occurrence`) rather than internal
positions where possible; `find` also returns positions usable until the next
edit. Results are JSON text; failures return `isError: true` with a message.

## Code

- `src/core/webmcp/index.ts`: `provideWebMcpTools(session, provider)`, the only
  import apps need; follows the switch and (re)registers.
- `src/core/webmcp/state.ts`: the per-browser switch.
- `src/core/webmcp/gate.ts`: permission gate.
- `src/core/webmcp/registry.ts`: runtime (native or polyfill), registration,
  result format, attribution hooks.
- `src/core/webmcp/ai.ts`: attribution (names, pseudo author, versions,
  activity events).
- `src/core/webmcp/common.ts`: `get_document_info`.
- `src/core/webmcp/types.ts`: `OfimeoTool` (name, description, JSON schema,
  minimum `access`, `changesDocument`, `execute`) and argument helpers.
- `src/ui/webmcp.ts`: Tools menu entry, explanation dialog, indicator
  (added to every app by `mountFrame`).
- `src/apps/<app>/webmcp.ts`: the app's tools, registered in its `app.ts`:

```ts
provideWebMcpTools(session, () => import('./webmcp').then((m) => m.writerTools(ctx)))
```

A new tool is an `OfimeoTool` in the app's module with the least `access` it
needs and `changesDocument: true` when it changes the document itself; the
core does the rest.

## Limitations

- WebMCP is a draft; native support is behind flags in Chromium. Assistants
  that do not implement WebMCP (or the MCP-B extension protocol) see nothing.
- Once loaded, the polyfill's bridge stays in the page until it is reloaded
  (with no tools after turning the switch off).
- In the writer, changing a paragraph into a heading re-creates it in Yjs, so
  comments anchored inside that paragraph lose their anchor (same as when the
  user does it).
- Spreadsheet notes are part of the workbook, so `add_comment` there needs edit
  access; diagrams and drawings have no comments.
- Diagram and presentation edits act on the page/slide shown (the tools switch
  to the requested one).
