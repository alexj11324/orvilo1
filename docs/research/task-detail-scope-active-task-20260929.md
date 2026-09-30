# Task detail scope: binding reads to the mounted host's task

Audit item R01 — shared `activeTaskId` cross-talk between detail hosts.

## Reachability (verified)

Two detail hosts mount simultaneously for different tasks:

- `AgentScopedTaskDetailPage` renders `TaskDetailPage` (route task) next to
  `MobilePortal`; at mobile widths `PortalContent` mounts
  `Portal/TaskDetail/Body` for `PortalViewType.TaskDetail` with the portal's
  own `taskDetailId` — a different task than the route's.
- `IssueContent` is additionally embedded by `Projects/Issues/IssueDetailPane`,
  `MyWork/MyWorkIssuePane` and `WorkInboxPage`, any of which can sit beside
  another host's subtree.

Every `useActiveTaskDetail(taskId)` mount wrote the global `activeTaskId` and
its cleanup cleared it unconditionally, so:

- mounting a second host redirected every `activeTaskX` selector read in the
  first host's subtree to the second task (title, properties, schedule,
  verify config, run/pause availability);
- unmounting the newer host cleared the slot entirely, blanking the surviving
  host's fields until it remounted;
- mutations read `activeTaskId` at call time, so a save could bind to the
  wrong entity.

## Fix

- `TaskDetailScope` (`AgentTaskDetail/TaskDetailScope`) provides the host's
  `taskId` through context. `useTaskDetailTaskId()` returns the scoped id and
  falls back to `activeTaskId` outside a scope; `useTaskDetailSelector` runs a
  `taskX(state, taskId)` selector bound to that id, so the subscription never
  follows the global slot.
- `detailSelectors` / `activitySelectors` now expose entity-scoped
  `taskX(state, taskId)` pairs; the `activeTaskX` entries remain as thin
  delegates (`taskX(s, s.activeTaskId)`) for genuinely global consumers
  (kanban highlight, control bar, overlays, live run).
- Hosts wrap their subtree: `TaskDetailPage`, `Portal/TaskDetail/Body`,
  `AutomationDetailPage`, and `IssueContent` (covers the inbox/My-Work/
  project panes). The innermost scope wins.
- `useActiveTaskDetail` cleanup now clears `activeTaskId` only when the slot
  still points at its own task — a transitional guard for the global
  consumers that remain.
- `useActiveTaskProject(taskId?)` accepts the scoped id.

## Tests

- `TaskDetailScope.test.ts` (renderHook): scoped reads ignore `activeTaskId`
  flips, fallback outside a scope, innermost-wins nesting.
- `useActiveTaskDetail.test.ts` gains cleanup-guard cases: the slot is only
  cleared while it still belongs to the unmounting host.
