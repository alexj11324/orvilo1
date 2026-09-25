# Linear parity — issue status popover decisions

Decisions from the status-popover section of the two-way audit (issue-list.md
P1–P4), verified against the live Linear workspace (ORV-24 status menu:
`Backlog, Todo, In Progress, In Review, Done, Canceled, Duplicate, Triage`
as `role=listbox` + `role=option`, 13px/450, unnamed listbox, digit hotkeys
rendered 12px/500).

- **Duplicate + Triage entries added** (P1): appended after the four
  execution statuses, in Linear's order, wherever the caller can supply
  `{ id, teamId, domainRevision }` — the issue rail (TaskProperties), list
  rows (AgentTaskItem) and sub-task rows (TaskSubtasks). Both write through
  the existing `workAttention.triage` mutation: `duplicate` (via
  `MarkDuplicateModal` for the canonical pick) and the new `retriage` action,
  which moves the issue back to intake (`triageStatus: 'untriaged'`) and
  clears `duplicateOfTaskId`. The entries only render for team tasks — the
  mutation requires team write access plus the CAS revision token, so
  surfaces that cannot prove all three fields omit them.
- **Digit hotkey hints styled + '0' convention** (P2): the shortcut span
  in the shared `renderMenuExtra` renders 12px/500 like Linear. Digit
  assignment follows Linear's scheme, verified live 2026-09-25: statuses
  take positional digits 1–N, `Duplicate` the next positional digit, and
  `Triage` the dedicated key `0` (issue menu `… Canceled 6, Duplicate 7,
Triage 0`); the priority menu's digits are the level values themselves
  (`No priority 0, Urgent 1, High 2, Medium 3, Low 4`), so '0' selects
  No priority in both the priority dropdown and the context-menu submenu.
- **Context-menu Status submenu carries the same extras**: verified live
  that Linear's right-click `Status ▸` submenu ends with `Duplicate 7 /
Triage 0`. `useTaskItemContextMenu` appends the same pair whenever the
  task supplies `{ id, teamId, domainRevision }` — the list-row context
  menu is the only additional surface that can, since
  `TaskContextMenuTarget` now projects the three triage fields.
- **Triage-capable gating**: both the issue-page menu and the context menu
  hide the intake entries when the owning team sets
  `orchestrationPolicy.triageEnabled === false` (the server rejects every
  triage write with `PRECONDITION_FAILED`, and the repo's other surfaces
  hide the affordance on that flag). Resolved through the shared
  `['team', workspaceId, teamId]` SWR; until it lands, entries render —
  matching the `!== false` convention used elsewhere.
- **CAS conflict surfaces properly**: triage writes that lose a
  `domainRevision` race toast `teams.transferConflict` ("This issue
  changed. Refresh and move it again.") instead of the generic
  update-failed copy, matching `TeamTriageRow`'s mapping.
- **Menu semantics + item type** (P3): the dropdown was rebuilt on the
  `@lobehub/ui` compound atoms (`DropdownMenuRoot/Trigger/Portal/Positioner/
Popup/Item`) instead of the `items` array API, so the popup carries
  `role=listbox` and each row `role=option` + `aria-selected`, matching
  Linear's status menu. Item text runs 13px/450 via a `[role='option']`
  descendant override (the library's `styles.item` defaults to 14px/400).
- **Unnamed listbox** (P4): `aria-labelledby=""` on the popup drops
  base-ui's auto label from the trigger, matching Linear's anonymous listbox.
- **`TaskDetailData`/`TaskDetailSubtask` projections** now ship `id`,
  `teamId` and `domainRevision` so the detail surface can pass the triage
  context; selectors `activeTaskTeamId`/`activeTaskDomainRevision` were
  added alongside.
- **Out of scope here**: the priority menu still renders through the
  `items` API (`role=menu`, 14px items). Linear's own priority menu was not
  separately audited in the issue list — refactor it the same way when that
  surface is measured.
