# Issue detail page layout

The issue detail page (`/task/[tid]` and the chat-side portal) follows the
layout Plane (makeplane/plane) uses for an issue: title and description on the
left, a property column and a relations section, then sub-issues, artifacts,
and activity.

## Relations

Relations replace the old prerequisite rail. The section is collapsible and
holds one tinted group bar per relation kind — Blocked by, Blocking, and
Relates to — with a plus menu to add a link and a per-row menu to copy the
issue link or remove the relation. The schema only has `blocks` and `relates`
edges, so there is no duplicate type; a "blocking" link is stored on the other
issue and the current detail refreshes.

An issue that only blocks other issues is not treated as blocked. An issue
with open blockers shows "Blocked until every prerequisite is completed.";
when every blocker is done it shows "All prerequisites completed." Missing,
trashed, inaccessible, canceled, and failed prerequisites still block.

## Run gating

The separate acceptance section is no longer on the issue page — the
description is the instruction, and the result panel still mounts the
checklist. Manual Run / Pause is gone from the issue page and the context
menu. Entering In Progress or In Review starts the run unless the issue is
already running or scheduled, has an automation, or still has an open
blocker.

## Properties

Property rows follow Plane's sidebar: a 120px tertiary label column (16px
icon plus the name) and a 13px regular value. Empty values render in the
placeholder color; a due date uses the danger color once it is overdue. A due
date counts as overdue only after that calendar day has passed, and never
when the issue is done or canceled. Row order is State, Assignee, Priority,
Due date, Labels, then Reviewer and Schedule.

The status chip is the status-menu trigger. On workflow-linked issues the
execution-status hint sits on the glyph so the chip still opens the menu.

## Title and activity

The issue title is a borderless 20px medium field. On narrow layouts the
order is title, description, properties, then relations. The activity feed
can be filtered to all, comments, or updates.

Still out of scope: start date, parent picker, attachment list, external
links, subscribe, archive, reactions, description history, cycles, and
modules.
