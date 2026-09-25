# Linear parity: project page header, rail progress and milestones

Issue list task 11a. Verdicts verified against the live Linear workspace
(`bdiverifier`, team `ORV`) on 2026-09-25 — the ACP Harness project for the
0-milestone case and Daymark for a project that has milestones.

## Header (J5, J7)

Linear's header-left is exactly `[project switcher, ☆ Add to favorites, ⋯
Project actions]`; header-right is `[🔗 Copy page URL, 🔔 notifications, │
rail-collapse]`. Orvilo's extras — the status pill and the member avatar
stack — carried no counterpart there and were removed (status lives in the
rail's Properties card).

The ⋯ menu in Linear reads: Copy ▸, Favorite, Subscribe ▸, Remind me ▸,
Change update schedule…, Configure Slack notifications…, Show description
history, Show updates and activity, Delete. Orvilo renders the honest
subset — Favorite/Unfavorite, Copy page URL, Show updates and activity (→
the Activity tab), and owner-gated Delete (the same `userId` check the
projects list applies). Subscribe/Slack/schedule/history items are not
modeled and are omitted rather than stubbed (J4 stays deferred).

The rail-collapse button toggles a panel-open state owned by the project
layout — deliberately not the app-shell right-panel store it was previously
shipped against.

J7: the project switcher's trigger passed the project _name_ into
`avatar`, rendering clipped text ("ger Laun") for any project without an
avatar URL. Now `|| undefined` so `Avatar` falls back to name initials;
switcher menu items got the same fix.

## Progress card (J6)

The rail's Progress card matches the measured anatomy:

- legend row (Scope / Started / Completed counts — unchanged semantics)
- a 362×200-style burnup: three overlapping gradient areas (scope grey,
  started amber, completed purple) with a 1.5px line per series, three
  x-axis date labels (first / midpoint / today) and a today marker at the
  right edge. Hand-rolled SVG — the repo ships no chart library.
- in-card `Assignees` | `Labels` toggle pills; one breakdown expands at a
  time, default none expanded
- breakdown rows: `icon name | {percent}% of {count}` with a hover `See
issues` control

Data: `projectIssueBurnupSeries` walks cumulative daily counts from the
earliest `createdAt` through today; `startedAt` falls back to `createdAt`
for issues already in a started-or-later bucket, `completedAt` to
`updatedAt`. `projectIssueAssigneeBreakdown` /
`projectIssueLabelBreakdown` count per group (`completed / scope`, scope
descending, the "none" bucket first, multi-labeled issues counted in each
label). Any unclassifiable `workflowCategory` returns `null` — the card
renders its existing unavailable readout rather than a wrong number. The
backend `detail` response now carries `assignees` (display-only user/agent
profiles: `getDisplayInfoByIds` + `getAgentAvatarsByIds`) and `taskLabels`
(`listForTasks` join) so rows resolve names without per-row hooks.

`See issues` deep-links the project issues page with the existing
`?filter=<type>:<csv>` encoding — `assignee:<id>` / `agent:<id>` /
`labels:<id>` / `…:none`.

## Milestones (J1)

On a 0-milestone project Linear shows **no** overview-body Milestones
section at all (no heading, no empty text, no add button); the rail's
Milestones card keeps its empty-state line and gains a header `+` that
opens an inline composer **inside the rail card**. Orvilo mirrors both:
`ProjectMilestones` returns `null` when the list is empty (creation moves
to the rail `+`, owner-gated by the same `userId` check the body used) and
`ProjectSidePanel` hosts the `+` and the composer. The composer was
extracted to `Workspace/MilestoneComposer.tsx` and is shared by the body
cards' edit path and the rail create path.

## Explicitly not done

- J2 (rail Activity card): live probe invalidated the earlier hypothesis —
  the reference rail _does_ keep an Activity card; no change.
- J3 (Slack channel rail row) and J4 (project subscribe/notification
  backend): not modeled; deferred pending product decision.
- The 🔔 notification bell between Copy page URL and rail-collapse is a
  J4 surface and stays out with it.

## Bugs found during runtime verification

- **Detail refresh dropped slug-keyed views**: `refreshDetailAfterWrite`
  revalidated only `project/detail/<scope>/<write-id>`, while views fetch
  under the route param (slug). Milestone create/update/delete left the
  rail and body lists stale until reload. The helper now revalidates every
  retained alias whose `detail.project.id` matches the write — verified
  live: rail `+` create and row-menu delete refresh instantly.
- **Icon buttons rendered without accessible names**: `@lobehub/ui`
  `ActionIcon` only emits `aria-label` for popup triggers (`title` feeds a
  tooltip only). Added explicit `aria-label` to the header copy/star
  buttons, the rail `+`, and `ToggleRightPanelButton` (derived from its
  title, so every existing callsite gains a name too).

## Review follow-ups (post-#253)

- **One workflow classifier.** `workflowBucket` moved to
  `packages/types/src/task` and is now shared by the Progress card
  (`projectIssueProgress`), the burnup/breakdown helpers
  (`projectIssueBurnup`), and `ProjectModel.listMilestoneProgress` — a new
  `TaskWorkflowCategory` member is triaged in one place instead of three.
- **Burnup loop hoisting.** Per-day counts reuse a hoisted `createdTimes`
  array instead of re-mapping every issue every day.
- **Axis tick dedupe.** A short series no longer prints the same date twice
  (midpoint index collided with day 0); labels are axis ends plus at most
  one distinct interior day.
- **Gradient area fills.** The burnup under-line areas use `linearGradient`
  defs fading to transparent, matching the reference's fill treatment
  (per-instance `useId` keeps the ids unique).
- **`See issues` keyboard access.** The breakdown-row deep links no longer
  carry `tabIndex={-1}`; reveal switched from `display:none` to
  `opacity`/`pointer-events`, so a focused link surfaces via
  `:focus-within` and stays a real tab stop.
- **Rail collapse toggle.** The header button now switches its label
  between "Close/Show project details" with the panel state and no longer
  advertises the global ToggleRightPanel hotkey, which drives the global
  right panel, not this local one (`showHotkey` prop).
