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
- The setting is stored in `localStorage` (`ofimeo:webmcp`) and applies to
  every tab of the browser (other open tabs follow at once).
- Nothing WebMCP-related is loaded while it is off. When it is on, the runtime
  and the app's tool module are loaded lazily; the polyfill only if needed.

## Runtime

`src/core/webmcp/registry.ts` uses the browser's native `document.modelContext`
when present. Otherwise it loads the MIT-licensed
[`@mcp-b/global`](https://www.npmjs.com/package/@mcp-b/global) (pinned, 6.0.0;
types from `@mcp-b/webmcp-types` 6.0.0, which follows the standard
`webmcp-types`), which installs the same API and bridges it to MCP-B browser
extensions. Its transport is restricted to the page's own origin
(`tabServer.allowedOrigins = [origin]`) and the iframe transport is off, so a
page embedding Ofimeo cannot call the tools. Tools are registered with
`registerTool(tool, { signal })` and removed by aborting the signal (when the
switch is turned off). The end-to-end tests list and call them through the
standard `getTools()` and `executeTool(tool, input)`, which return the result
serialized as JSON.

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

## Confirmations, questions and limits

- Tools marked *destructive* (deleting, reverting) and large changes ask the
  user first in a dialog of the shared frame ("Allow this change?"); the
  assistant gets an error when the user does not allow it. `undo` asks only
  when the user changed the document after the assistant.
- `ask_user` shows the assistant's question (with up to 4 choices or a free
  answer) and `notify` a short notice. Dialogs are shown one at a time.
- Arguments are limited to 1,000,000 characters per call and changes to 120
  calls per minute.
- Read tools are registered with WebMCP's `untrustedContentHint`: what they
  return was written by people and may contain instructions the assistant
  must not follow. `get_document_info` says so too.
- The indicator's dialog lists the assistant's latest calls in the page
  (*Activity in this page*: time, tool, read / changed / failed / not allowed)
  and offers **Undo all AI changes…**, which restores the version saved before
  its first change (the current state is kept as a version).

## Review mode and batches

- **Review mode** (per browser; the checkbox *Review the assistant's changes
  before they are applied* in the indicator's dialog, editors only): changing
  calls are not applied but queued as **proposals** and the tool answers
  `{status: 'proposed', proposal}`. The *Changes proposed by the AI assistant*
  panel opens by itself, lists each proposal with a plain-language summary
  and offers Accept / Reject and Accept all / Reject all; the indicator shows
  the number waiting. An accepted proposal runs then, as one undo step and
  recorded as the assistant's. Destructive tools are proposals too (accepting
  is the confirmation). Writer text changes stay suggestions (`suggestion`
  tools are never queued). `list_proposals` gives the assistant the outcome.
  Proposals live in the page: reloading drops the pending ones.
- **`apply_batch`** runs up to 200 operations `{tool, args}` of the app as ONE
  step of the undo history and one version: Yjs undo managers merge the
  changes (writer, forms, notebook, PDF), Univer batches its undo items,
  maxGraph keeps one model update per page, and Excalidraw gets the scene
  once. Destructive operations make the whole batch confirmed once; in review
  mode the batch is one proposal. Stops at the first error unless
  `stop_on_error` is false; unknown or unavailable tools are refused before
  anything changes.

## Tools

All apps (by access):

| Tool | Access | What it does |
| --- | --- | --- |
| `get_document_info` | view | Title, app, access, language, versions count, app facts |
| `get_selection` | view | What the user selected (text, cells, shapes, elements, question, page) |
| `show` | view | Scrolls to and selects a place (app-specific arguments) |
| `ask_user`, `notify` | view | Question to the user; short notice |
| `list_participants` | comment | People with the document open (name, colour, access) |
| `undo`, `redo` | edit | One step of the app's undo history |
| `revert_ai_changes` | edit | Restores the version before the assistant's first change (confirmed) |
| `apply_batch`, `list_proposals` | edit | Several changes as one step; outcome of proposals |

Seeing the document (view access; only in apps that support each one):

| Tool | What it returns |
| --- | --- |
| `render` | A PNG (at most 2048 px): writer page (the exported PDF page), sheet range (a grid of its displayed values, at most 100 × 26), diagram page, slide, the whole drawing, notebook page (as printed), PDF page (without annotations). Forms have none. |
| `list_versions`, `diff_versions` | Saved versions; lines added/removed of a text form of the document between a version and another one or now, and who changed it (authors of the Yjs clients). Spreadsheets list the cells changed (the mutation log) instead. |
| `get_changes_since` | Without a token: a token (a snapshot kept in the page, at most 20). With it: what changed since and who, and a new token. |
| `get_spelling_issues` | The suite's own checker (Hunspell, rules, Harper; LanguageTool only if the user configured it) in the document's language with the user's settings: where, text, message, replacements. |
| `check_accessibility` | Writer: pictures without alt text (`set_alt_text`), skipped heading levels, tables without header row, vague link texts, long text without headings. Slides: no title, pictures, too much text. Sheet: charts without a title. Forms: questions without text. |
| `list_formula_errors` | Spreadsheet cells whose formula gives an error. |

**New documents:** `create_document` (any access; confirmed by the user)
makes a new document of the user's from the content in its arguments
(writer Markdown, sheet rows, slides outline, draw.io XML, drawing elements,
form questions with answer keys, notebook sections and pages), stores it in
this browser's library with new keys and opens it in a new tab. The assistant
gets neither its link nor its keys, and it never reads other documents.

Also in every app: `list_templates` and `create_from_template` (the user's own
templates; a new document, confirmed) and `get_assignments` (the user's Moodle
assignments as last loaded in this browser: course, name, due date, status,
instructions as text; the user allows every call; no credentials, nothing
fetched).

## People's data

Names of form respondents and of the people with the document open reach the
assistant as pseudonyms ("Respondent 3", by order of submission;
"Participant 2") unless the user ticks *Give the assistant people's real
names* in the indicator's dialog (per browser, `ofimeo:webmcp:names`). Comment
authors are shown as written. `summarize_responses` has no names at all.
Grades the assistant suggests (`propose_grade`) are stored in the editor's
private vault marked as AI suggestions (`Grade.ai`): the grading view shows
"Suggested by the AI assistant" until an editor changes or accepts them, and
releasing a grade with unreviewed suggestions asks first. The assistant never
releases grades and never reads answer keys (`set_answer_key` writes only).

Presentations add `next_slide`, `previous_slide`, `go_to_slide` and
`get_speaker_notes` while this browser runs the slide show (the tool list is
registered again when it starts and ends).

| App | Read (view) | Comment | Edit |
| --- | --- | --- | --- |
| Documents | `get_text` (Markdown with CriticMarkup `{++ins++}` `{--del--}` for pending suggestions, or plain), `get_outline`, `find`, `list_comments`, `list_references` | `add_comment` (on text or as a reply) | `insert_text`, `insert_markdown` (tables, lists, links…), `replace_range`, `delete_text` (suggestions); `apply_heading`, `format`, `set_alt_text`, `insert_equation` (LaTeX), `add_function_graph`, `add_reference`, `cite`, `insert_bibliography`, `insert_link`, `insert_chart` (direct, one undo step each); `insert_table` (suggestion); `resolve_comment` (comment); `list_suggestions`, `withdraw_suggestion` (only the assistant's own; an emptied table or list it inserted goes too), `get_stats` (counts and a readability score per language) |
| Spreadsheets | `list_sheets`, `read_range`, `list_comments` (cell notes), `list_formula_errors`, `describe_range` (statistics per column), `find` | – | `write_range` (values and `=` formulas), `add_sheet`, `insert_chart` (charts model of `src/apps/sheet/charts`), `add_comment` (cell note), `insert_rows`, `insert_columns`, `rename_sheet`, `duplicate_sheet`, `format_range`, `sort_range`, `freeze`, `add_conditional_format`, `create_pivot`; confirmed: `delete_rows`, `delete_columns`, `clear_range`, `delete_sheet` |
| Presentations | `list_slides`, `get_slide`, `list_comments` | `add_comment` | `add_slide`, `add_slides_from_outline`, `add_function_graph`, `set_text`, `set_layout`, `set_notes`, `add_text_box`, `insert_chart`, `set_transition`, `add_animation`, `apply_theme`, `move_object`, `move_slide`, `duplicate_slide`; confirmed: `delete_objects`, `delete_slide` |
| Diagrams | `get_diagram` (summary or draw.io XML) | – | `add_shape`, `connect`, `set_label`, `set_style`, `add_graph` (nodes and edges laid out in layers), `import_mermaid` (flowcharts, laid out by Mermaid), `import_drawio` (new pages), `move_object`, `add_page`, `rename_page`, `move_page`; confirmed: `delete_objects`, `delete_page` |
| Forms (editors) | `get_form` | – | `add_question`, `add_questions` (with answer keys; `src/apps/forms/spec.ts`), `update_question`, `move_question`, `set_answer_key`, `set_settings`, `get_responses` and `summarize_responses` (editors only), `propose_grade`, `create_variant` (shuffled copy, confirmed); confirmed: `delete_question` |
| PDF | `get_text` (per page), `list_comments`, `list_annotations`, `search` | `add_note`, `resolve_note` | `add_highlight`, `add_underline`, `add_strike`, `add_text` (text box), `add_stamp` (check, cross, good, revise, grade, custom); confirmed: `delete_annotation`. No signatures. |
| Drawings | `get_scene` | – | `add_element`, `add_elements`, `mermaid_to_drawing`, `update_element`; confirmed: `delete_elements` |
| Notebooks | `list_pages` (sections, pages, levels), `get_page` (Markdown, by id or title), `search`, `list_tagged` | – | `set_tag`, `toggle_checkbox`, `add_page` (with Markdown text), `append_text` (Markdown at the end of a page; direct edit, one undo step), `rename_page`, `move_page`; confirmed: `delete_page` |

Text is located by exact text (`match` + `occurrence`) rather than internal
positions where possible; `find` also returns positions usable until the next
edit. Results are JSON text; failures return `isError: true` with a message.

## Code

- `src/core/webmcp/index.ts`: `provideWebMcpTools(session, provider)`, the only
  import apps need; follows the switch and (re)registers.
- `src/core/webmcp/state.ts`: the per-browser switch.
- `src/core/webmcp/gate.ts`: permission gate and confirmations.
- `src/core/webmcp/confirm.ts`: confirmation and question dialogs.
- `src/core/webmcp/activity.ts`: activity log, rate limit, who changed last.
- `src/core/webmcp/proposals.ts`: review mode queue; `src/ui/webmcp-proposals.ts` its panel.
- `src/core/webmcp/undo.ts`: grouping Yjs undo items (apply_batch).
- `src/core/webmcp/see.ts`: render, versions, changes, spelling, accessibility;
  `diff.ts` the line diff; `render.ts` PDF page / cell grid pictures.
- `src/core/webmcp/create.ts`: `create_document`; `src/apps/forms/spec.ts`
  compact question specs (options and correct answers by label).
- `src/core/webmcp/registry.ts`: runtime (native or polyfill), registration,
  result format, attribution hooks.
- `src/core/webmcp/ai.ts`: attribution (names, pseudo author, versions,
  activity events).
- `src/core/webmcp/common.ts`: the tools every app offers.
- `src/core/webmcp/types.ts`: `OfimeoTool` (name, description, JSON schema,
  minimum `access`, `changesDocument`, `execute`) and argument helpers.
- `src/ui/webmcp.ts`: Tools menu entry, explanation dialog, indicator
  (added to every app by `mountFrame`).
- `src/apps/<app>/webmcp.ts`: the app's tools, registered in its `app.ts`:

```ts
provideWebMcpTools(session, () => import('./webmcp').then((m) => m.writerTools(ctx)))
```

A new tool is an `OfimeoTool` in the app's module with the least `access` it
needs and `changesDocument: true` when it changes the document itself;
`destructive` or `confirm(args)` when the user must allow it, `available()`
when it only makes sense in some states (with `AppTools.watch`). The app's
`AppTools` may also provide `selection`, `show` (+ `showSchema`), `undo` and
`redo` (default: the Edit menu given to the frame), `group` (apply_batch),
`render` (+ `renderSchema`), `serialize(doc)` or `diff(before, after)`
(versions), `paragraphs` (spelling) and `accessibility`.
Give changing tools a translated `summary(args)`: it is what the user reads
in confirmations and proposals. The core does the rest.

The help center has the user-facing article *AI assistants (WebMCP)*
(`ai-assistants`, linked from the WebMCP dialogs).

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
- Suggestions track text: a table or list the assistant inserts is removed with
  `withdraw_suggestion`, but when the user rejects its text in the review rail
  the empty structure stays (as with the user's own suggestions).
- Image results (`render`) are MCP image content: assistants that only read
  text get the caption.
- Proposals live in the page; reloading drops the pending ones.
