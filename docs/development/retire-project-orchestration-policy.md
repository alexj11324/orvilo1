# Project orchestration policy retirement

The Project Overview no longer exposes a per-project orchestration policy or coordinator
controls. Orchestration belongs to the board across projects and its policy is internal. There is
no replacement per-project settings entry.

## What is removed

- The Overview card `src/features/Projects/Workspace/OrchestrationPolicyCard.tsx` and its mount in
  `src/features/Projects/Workspace/index.tsx`.
- The client reader and writer: `projectService.getOrchestrationPolicy` /
  `updateOrchestrationPolicy`, and the store members `useFetchProjectOrchestrationPolicy` /
  `updateProjectOrchestrationPolicy` plus the `ProjectOrchestrationPolicyView` type export.
- The API procedures `project.getOrchestrationPolicy` and `project.updateOrchestrationPolicy`,
  their input schema and the admin-only `projectPolicyProcedure`. Calling either name now resolves
  to `NOT_FOUND` (`apps/server/src/routers/lambda/__tests__/projectPolicy.retired.test.ts`).
- The model methods `ProjectModel.getOrchestrationPolicy` / `updateOrchestrationPolicy`, their
  validation helper and view types.
- The `orchestration.*` keys of the `project` locale namespace (default, `en-US`, `zh-CN`). The
  daily i18n workflow prunes the generated locales.

The router context member that carries the workspace-admin moderation ACL for project updates is
renamed from `projectPolicyModel` to `projectModerationModel`; its behavior is unchanged.

## What stays

This is a public-surface retirement. It does not replace the internal Project execution policy and
does not change any execution or settlement chain:

- The `projects.orchestration_policy`, `orchestration_policy_revision` and `coordinator_agent_id`
  columns, `DEFAULT_PROJECT_ORCHESTRATION_POLICY`, `normalizeProjectOrchestrationPolicy`,
  `projectRequiresHumanReview` and `projectEffectiveRequireHumanReview` remain. New projects still
  receive the default policy.
- Backlog intake still selects assigned tasks in Projects whose stored policy opted into
  auto-dispatch, and tiered assignment still reads the Project roster and the stored
  `allowedAgentIds` / `allowedRoles`.
- Linear planning still reads the Project or Team policy and its revision for consistency checks.
- Task settlement (`apps/server/src/services/taskSettlement`) still honors the stored
  `requireHumanReview` flag. Budgets, stop, dependency and permission guards are untouched.
- Team-level `orchestrationPolicy` (for example `triageEnabled`) is a different feature and is not
  affected.
- The Project roster store actions `addProjectAgent` / `removeProjectAgent` and their API remain;
  the retired card was their only UI caller.

Existing stored policies keep their current values. There is no longer a product surface that
edits them.
