CREATE OR REPLACE FUNCTION enforce_task_pr_delivery_before_complete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  workspace_binding jsonb;
  binding_repo text;
BEGIN
  IF NEW.status <> 'completed' OR OLD.status = 'completed' THEN
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
--> statement-breakpoint
DROP TRIGGER IF EXISTS tasks_pr_delivery_completion_gate ON tasks;
--> statement-breakpoint
CREATE TRIGGER tasks_pr_delivery_completion_gate
BEFORE UPDATE OF status ON tasks
FOR EACH ROW
EXECUTE FUNCTION enforce_task_pr_delivery_before_complete();
