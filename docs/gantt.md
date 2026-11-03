# Gantt project schedules

Gantt is a structured page type inside Ofimeo Diagrams. Create one through
**Insert → Gantt chart**, the calendar toolbar button, **Page → Gantt chart**,
or the **Gantt chart** template in the home gallery. Ordinary diagram pages
and Gantt pages can coexist in the same document.

## Tasks and dates

Click a task name to edit its name, responsible person, earliest start date,
duration in calendar days, completion percentage and predecessors. A milestone
has zero duration and appears as a diamond. Add tasks with **Add task**.
Deleting a task removes its dependency references after confirmation.

Dependencies are finish-to-start: each task starts at the later of its
requested date and all its predecessors' finish boundaries. Displayed end dates
are inclusive; the next task normally starts the following day. A milestone
can be followed by a task on the same date. Weekends count; this is not a
working-day or holiday calendar. Dates are computed as UTC calendar-day
integers, independently of browser timezones and daylight-saving changes.

Move bars by dragging, resize them from the right edge, or focus a bar and use
Left/Right (move) and Shift+Left/Right (resize). Enter opens its editor. The
task editor provides the same operations without dragging. Short bars have a
separate resize grip beside the bar to keep move and resize targets distinct.
Select days, weeks or months for the calendar scale. The calendar expands to
fill the available width and scrolls horizontally for longer schedules. On
narrow screens the task table and calendar stack, with horizontal scrolling
inside each surface.

An earliest start date is retained when dependencies delay a task. Moving a
predecessor back can move its successors earlier, down to their requested dates.
Moving a dependent task before a predecessor's finish cannot violate that
constraint. Progress is entered manually, not inferred from elapsed time.

## Persistence, collaboration and permissions

Tasks live in `diagram-gantt:<page-id>` Yjs maps, with one nested map per task.
Edits write only changed fields; independent task/field edits merge through the
same signed collaboration and durable document persistence as other diagrams.
Per-page undo history tracks this browser's edits and preserves peer edits.
View and comment links display schedules without editing controls or writable
task operations.

Local changes reject cycles, invalid dates and missing predecessors before
mutation. Concurrent independent dependency edits can still introduce a cycle,
or reference a concurrently deleted task. The task data remains intact and an
error replaces the calendar until a user repairs the affected dependencies.
The task table and editor remain available: uncheck invalid predecessors,
including entries labeled **Deleted task**. Dependency-only changes that remove
existing errors without adding new ones can be saved incrementally, even when
other cycles remain. Concurrent additions that exceed the task limit remain
listed so users can delete tasks to restore a valid schedule.

Limits are 200 tasks, a ten-year schedule span, dates in 1970–2100 and completion
between 0 and 100 percent.

Library search indexes page names and structured task names, responsible people
and requested start dates, rather than the generated diagram shapes.

## Files and interoperability

The `.drawio` export includes a versioned JSON `ofimeoGantt` attribute on each
Gantt page's `mxGraphModel`, alongside generated ordinary shapes. Version 1
stores task IDs, names, requested start dates, durations, owners, progress,
milestone flags, predecessor IDs and ordering. Ofimeo reopens the structured
schedule; other draw.io editors can display its visual representation. Editing
those generated shapes
externally does not update the structured task model. Keep the attribute when
round-tripping through another editor to retain editable tasks in Ofimeo.
Removing it leaves only an ordinary diagram; unsupported metadata versions or
invalid structured schedules are rejected on import.

SVG/PNG export and printing render the current schedule. PDF and hand-in exports
include generated views of every page. Page duplication creates independent
task maps; library copies, backups and versions include task data through the
standard Yjs document state. No new server or runtime dependency is required.

WebMCP supports `add_page` with `kind: "gantt"`, `get_gantt`, `add_gantt_task`,
`update_gantt_task` and `delete_gantt_task`, under the existing access and
confirmation gates. Freeform shape mutations are unavailable on Gantt pages.
Spreadsheet task import, working calendars, critical paths, baselines and
resource balancing are not implemented.
