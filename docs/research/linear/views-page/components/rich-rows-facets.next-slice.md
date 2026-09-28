# Next slice: rich view rows and facet details

## Observed gap

The delivered shell supplies populated groups, owner filter/display controls and a
responsive details pane. It does not match the populated Linear screenshot's row property
chips or the Assignees / Labels / Projects / Teams facet tabs. ORV-142 must remain open.

## Data already available on every evaluated task

`SavedViewEvaluation.tasks/groups` return the complete task row (participants are optional):

- identity/content: `id`, `identifier`, `name`, `description`;
- state: `status`, `workflowCategory`, `workflowStateId`, `triageStatus`, `priority`;
- hierarchy/progress: `parentTaskId`, `subtaskProgress`;
- assignments: `assigneeUserId`, `assigneeAgentId`, `reviewerUserId`, creator fields;
- scopes: `projectId`, `projectMilestoneId`, `teamId`, `cycleRefId`, `visibility`;
- timestamps: `createdAt`, `updatedAt`, `completedAt`, `startedAt`;
- execution metadata: automation/schedule, current topic, external Linear sync state.

`AgentTaskItem` already renders priority, execution status, workflow badge, identifier,
title, subtask progress, assignee(s), schedule and updated date. It does not render the
Linear screenshot's project/team chips or labels, and its row geometry remains 38/44px
Block composition rather than Linear's explicit subgrid tracks.

## Aggregate data already available

`workAttentionService.facet` / `WorkQueryModel.facetTasks` can return complete-query totals
for `projectId`, `status`, `teamId`, and `workflowCategory`, including readable project/team
names and restricted counts. This is safe for Projects/Teams/status facets.

The current facet contract does **not** support `assigneeUserId` or labels. Labels are not
part of `TaskItem`; deriving their totals from the first loaded page would be incorrect.
Owner display names for another user's shared view are also not included in `SavedViewItem`.

## Bounded implementation plan

1. Add parallel facet requests for project/team/status/workflow category keyed by the
   evaluated query hash; retain restricted buckets explicitly.
2. Add details tabs for the supported Projects and Teams facets first. Do not display
   Assignees or Labels until their server contracts return full-query totals.
3. Define one saved-view row grid using the existing task fields and resolved facet maps:
   checkbox, priority, identifier, workflow status, title, subtask progress, project/team,
   assignee, updated date.
4. Preserve existing task actions/status changes and selection semantics; do not replace
   them with inert chips.
5. Extend the server facet allowlist for assignee and introduce a real label relation only
   as separate data-model work. Then add the remaining tabs.

## Acceptance

- Row height, column tracks, truncation, hover/select and group-header geometry measured
  against the same populated reference viewport.
- Facet totals use the complete query, survive reload, and never expose restricted names.
- Narrow details overlay keeps controls visible and page `scrollWidth === innerWidth`.
- Tests cover facet authorization/restricted counts, query-hash invalidation, row mapping,
  and empty/one/many buckets.
