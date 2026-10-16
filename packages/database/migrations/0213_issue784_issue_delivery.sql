ALTER TABLE "slack_channel_bindings" ADD COLUMN IF NOT EXISTS "project_id" text;--> statement-breakpoint
ALTER TABLE "slack_channel_bindings" ADD COLUMN IF NOT EXISTS "repository_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "reviewer_agent_id" text;--> statement-breakpoint
ALTER TABLE "slack_channel_bindings" DROP CONSTRAINT IF EXISTS "slack_channel_bindings_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "slack_channel_bindings" ADD CONSTRAINT "slack_channel_bindings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_channel_bindings" DROP CONSTRAINT IF EXISTS "slack_channel_bindings_repository_id_repositories_id_fk";
--> statement-breakpoint
ALTER TABLE "slack_channel_bindings" ADD CONSTRAINT "slack_channel_bindings_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_reviewer_agent_id_agents_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_reviewer_agent_id_agents_id_fk" FOREIGN KEY ("reviewer_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_in_review_reviewer_required";
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_in_review_reviewer_required" CHECK ("tasks"."workflow_category" <> 'in_review' OR "tasks"."reviewer_agent_id" IS NOT NULL) NOT VALID;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_task_pr_delivery_before_complete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  workspace_binding jsonb;
  binding_repo text;
BEGIN
  IF NEW.workflow_category <> 'done' OR OLD.workflow_category = 'done' THEN
    RETURN NEW;
  END IF;

  -- A confirmed report may inherit its group's repository context without
  -- producing a PR. Only the accepted current artifact ledger is a substitute.
  IF EXISTS (
    SELECT 1
    FROM acceptances a
    JOIN verify_runs vr ON vr.acceptance_id = a.id
    JOIN task_topics tt ON tt.task_id = NEW.id AND tt.operation_id = vr.operation_id
    WHERE a.subject_type = 'task' AND a.subject_id = NEW.id
      AND a.user_id = NEW.created_by_user_id
      AND a.workspace_id IS NOT DISTINCT FROM NEW.workspace_id
      AND a.metadata #>> '{issueChecklist,deliveryKind}' = 'artifact'
      AND NULLIF(a.metadata #>> '{issueChecklist,confirmedAt}', '') IS NOT NULL
      AND tt.status = 'completed' AND tt.execution_generation = NEW.execution_generation
      AND tt.seq = (SELECT max(latest.seq) FROM task_topics latest WHERE latest.task_id = NEW.id)
      AND coalesce(jsonb_array_length(tt.handoff -> 'inputStale'), 0) = 0
      AND vr.status = 'passed' AND vr.user_decision = 'accept'
      AND vr.metadata #>> '{issueDelivery,taskId}' = NEW.id
      AND vr.metadata #>> '{issueDelivery,deliveryKind}' = 'artifact'
      AND vr.metadata #>> '{issueDelivery,deliveryOperationId}' = tt.operation_id
      AND vr.metadata #>> '{issueDelivery,topicId}' = tt.topic_id
      AND vr.metadata #>> '{issueDelivery,executionGeneration}' = NEW.execution_generation::text
      AND vr.metadata #>> '{issueDelivery,dispatchId}' IS NOT DISTINCT FROM tt.dispatch_id
      AND vr.metadata #>> '{issueDelivery,checklistRevision}' = a.metadata #>> '{issueChecklist,revision}'
      AND vr.metadata #>> '{issueReviewer,verdict}' = 'pass'
      AND NULLIF(vr.metadata #>> '{issueReviewer,operationId}', '') IS NOT NULL
      AND NEW.config #>> '{issueReview,state}' = 'submitted'
      AND NEW.config #>> '{issueReview,verdict}' = 'pass'
      AND NEW.config #>> '{issueReview,reviewerOperationId}' = vr.metadata #>> '{issueReviewer,operationId}'
      AND NEW.config #>> '{issueReview,cycleId}' = vr.metadata #>> '{issueReviewer,cycleId}'
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(vr.plan, '[]'::jsonb)) item
                  WHERE item ->> 'required' = 'true')
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(coalesce(vr.plan, '[]'::jsonb)) item
        WHERE item ->> 'required' = 'true' AND NOT EXISTS (
          SELECT 1 FROM verify_check_results result
          WHERE result.verify_run_id = vr.id AND result.check_item_id = item ->> 'id'
            AND result.status = 'passed' AND result.verdict = 'passed'
            AND result.user_decision = 'accepted'
            AND result.verifier_operation_id = vr.metadata #>> '{issueReviewer,operationId}'
            AND EXISTS (SELECT 1 FROM verify_evidence evidence WHERE evidence.check_result_id = result.id
                        AND (evidence.file_id IS NOT NULL OR NULLIF(BTRIM(evidence.content), '') IS NOT NULL))
        )
      )
  ) THEN
    RETURN NEW;
  END IF;

  -- Match TaskWorkspaceService inheritance semantics exactly: the resolver
  -- checks the task plus nine ancestors (WORKSPACE_INHERIT_DEPTH covers
  -- depths 0..9). The nearest task/ancestor that declares provider=git owns
  -- the whole workspace config.
  WITH RECURSIVE lineage AS (
    SELECT t.id, t.parent_task_id, t.config, 0 AS depth
    FROM tasks t
    WHERE t.id = NEW.id
    UNION ALL
    SELECT parent.id, parent.parent_task_id, parent.config, lineage.depth + 1
    FROM tasks parent
    JOIN lineage ON parent.id = lineage.parent_task_id
    WHERE lineage.depth < 9
  )
  SELECT config -> 'workspace'
  INTO workspace_binding
  FROM lineage
  WHERE config -> 'workspace' ->> 'provider' = 'git'
  ORDER BY depth ASC
  LIMIT 1;

  binding_repo := NULLIF(BTRIM(COALESCE(workspace_binding ->> 'repo', '')), '');

  -- A git binding that names neither a remote repo nor a local checkout is
  -- malformed; mirror resolveWorkspaceConfig's fail-closed parse rather than
  -- silently falling through to a valid ancestor binding.
  IF workspace_binding IS NOT NULL
     AND binding_repo IS NULL
     AND NULLIF(BTRIM(COALESCE(workspace_binding ->> 'repoPath', '')), '') IS NULL THEN
    RAISE EXCEPTION 'Git task % requires config.workspace.repo or repoPath before it can complete', NEW.identifier
      USING ERRCODE = '23514', CONSTRAINT = 'tasks_completed_requires_git_target';
  END IF;

  -- PR proof is required when the effective binding is remote-bound, or when
  -- the CURRENT execution produced a repository-bound delivery through a
  -- project/team repository association (no explicit config.workspace row
  -- exists in that case — the evidence lives on the delivery topic). A
  -- local-only git checkout keeps its existing completion semantics, and
  -- deliveries from earlier generations are history, not blockers.
  IF binding_repo IS NULL AND NOT EXISTS (
    SELECT 1
    FROM task_topics tt
    WHERE tt.task_id = NEW.id
      AND tt.execution_generation = NEW.execution_generation
      AND NULLIF(BTRIM(COALESCE(tt.integration ->> 'repo', '')), '') IS NOT NULL
  ) THEN
    RETURN NEW;
  END IF;

  -- The proof must come from the SAME execution generation that is
  -- completing: a historical merged PR cannot stand in for a rerun's pending
  -- delivery. The application writes this row only after GitHub confirms the
  -- PR merged; URL alone is intentionally insufficient — the row must carry
  -- the PR identity and an integrated, remotely-published delivery state.
  IF NOT EXISTS (
    SELECT 1
    FROM task_topics tt
    WHERE tt.task_id = NEW.id
      AND tt.execution_generation = NEW.execution_generation
      AND tt.integration IS NOT NULL
      AND NULLIF(BTRIM(COALESCE(tt.integration ->> 'repo', '')), '') IS NOT NULL
      AND (binding_repo IS NULL OR tt.integration ->> 'repo' = binding_repo)
      AND NULLIF(BTRIM(COALESCE(tt.integration ->> 'prUrl', '')), '') IS NOT NULL
      AND NULLIF(BTRIM(COALESCE(tt.integration ->> 'prNumber', '')), '') IS NOT NULL
      AND tt.integration ->> 'state' = 'integrated'
      AND tt.integration ->> 'pushedToRemote' = 'true'
      AND NULLIF(BTRIM(COALESCE(tt.integration ->> 'expectedHeadSha', '')), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Git task % cannot complete until its pull request is merged', NEW.identifier
      USING ERRCODE = '23514', CONSTRAINT = 'tasks_completed_requires_merged_pr';
  END IF;

  RETURN NEW;
END;
$$;
