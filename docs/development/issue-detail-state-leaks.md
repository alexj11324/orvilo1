# Issue detail: state leaks and first paint

## Revealed properties belong to one Issue

`TaskProperties` keeps the optional fields opened with "+ Add property" (due
date, labels, schedule, relation kinds). Peek panes (`MyWorkIssuePane`,
`IssueDetailPane`) mount `IssueContent` without a `key`, so the chain
`IssueContent -> TaskDetailSections -> TaskProperties` is reused when `taskId`
changes. It only remounted incidentally, when the next Issue was not cached and
the skeleton briefly replaced the sections; for a cached Issue the revealed set
leaked.

Fix: `taskPropertyReveal.ts` holds the set tagged with its `taskId`. The
component reconciles it during render (`reconcilePropertyReveal`), so there is
no effect and no frame of the previous Issue's fields. No `key` is added above,
so editors keep their drafts. Returning to an earlier Issue is not remembered
(same as opening it fresh); Plane has no equivalent.

Other local state in `TaskProperties.tsx`: none. The only `useState` was the
reveal set; the dropdown/picker open state lives inside their own components.

## First paint no longer waits for the assignee Agent config

`useActiveTaskDetail` used to keep the skeleton until the assignee agent config
hydrated. The history is a squash import and carries no rationale beyond the
comment (model picker). Consumers of the config inside the Issue detail:

- `shared/useAgentDisplayMeta.ts` (assignee row, avatar, name): falls back to
  the sidebar agent list, so it renders without the config.
- `TaskVerifyConfig.tsx` model/provider: only used by criteria generation,
  which already returns early when `!model || !provider`, so a missing config
  can never send a wrong model.
- `TaskDetailRunPauseAction.tsx` reads only the inbox agent id, not the config.

The gate is therefore dropped; hydration still runs in the background. The page
decision is the pure `isTaskDetailResolving` in `taskDetailReadiness.ts`. One
visible edge: for the short window before the config lands, "Generate" in the
acceptance section does nothing (no model resolved yet).
