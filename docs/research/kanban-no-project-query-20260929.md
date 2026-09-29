# Kanban group query projectId contract

## Observed gap

`buildKanbanGroupQuery` decides the board scope with `if (projectId)`. A
`projectId` filter is a three-state value — `undefined` = unscoped, `null` =
the "No project" chip, a string = that project — but the truthiness test
swallowed `null` on every non-MyTasks branch and silently widened the query to
the agent or all-agents scope. `useFetchTaskGroupList` already honors `null`
(it keys a `project:no-project` list and forwards `projectId` to
`taskService.groupList`), so the builder was the only layer collapsing it.

## Reachability

`buildKanbanGroupQuery` has exactly one caller, `KanbanBoard`. Its non-external
mounts are `AgentTasksPage` (`projectId?: string` — a route param that is never
`null`; the `myTaskScope` board omits `projectId`) and `WorkQueryResults`
(`external` mode supplies groups and skips the builder). `projectId: null` only
reaches the builder through `myTaskScope` — My Work's No-project chip — the
branch that already forwarded it. No live caller could hit the widened query;
the change is contract hardening so a future caller cannot ship the bug.

## Contract

- `myTaskScope` composes with `projectId` (including `null`) and drops
  `agentId`, matching the fetch hook's scoped list key.
- Without a scope, `projectId !== undefined` (id or `null`) produces a project
  board query and wins over `agentId`, the same precedence the fetch hook
  applies when deriving its list key.
- `projectId === undefined` preserves the previous agent / all-agents
  selection.

## Verification

A table-driven test pins `undefined`/`null`/id × global/Agent/MyTasks. The two
`null` rows under non-MyTasks scopes fail on the previous implementation; the
existing My Work regression tests pass unchanged.
