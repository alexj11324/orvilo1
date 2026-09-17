CREATE OR REPLACE FUNCTION enforce_task_pr_delivery_before_complete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  workspace_binding jsonb;
BEGIN
  IF NEW.status <> 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  -- Match TaskWorkspaceService inheritance semantics: the nearest task/ancestor
  -- carrying a concrete git workspace wins as one whole config.
  WITH RECURSIVE lineage AS (
    SELECT t.id, t.parent_task_id, t.config, 0 AS depth
    FROM tasks t
    WHERE t.id = NEW.id
    UNION ALL
    SELECT parent.id, parent.parent_task_id, parent.config, lineage.depth + 1
    FROM tasks parent
    JOIN lineage ON parent.id = lineage.parent_task_id
    WHERE lineage.depth < 10
  )
  SELECT config -> 'workspace'
  INTO workspace_binding
  FROM lineage
  WHERE config -> 'workspace' ->> 'provider' = 'git'
    AND (
      NULLIF(BTRIM(config -> 'workspace' ->> 'repo'), '') IS NOT NULL
      OR NULLIF(BTRIM(config -> 'workspace' ->> 'repoPath'), '') IS NOT NULL
    )
  ORDER BY depth ASC
  LIMIT 1;

  -- Non-repository tasks keep their existing completion semantics.
  IF workspace_binding IS NULL THEN
    RETURN NEW;
  END IF;

  IF NULLIF(BTRIM(workspace_binding ->> 'repo'), '') IS NULL THEN
    RAISE EXCEPTION 'Git task % requires config.workspace.repo before it can complete', NEW.identifier
      USING ERRCODE = '23514', CONSTRAINT = 'tasks_completed_requires_github_repo';
  END IF;

  -- The application writes this proof only after GitHub confirms the PR merged.
  -- URL alone is intentionally insufficient: the row must include the PR
  -- identity and an integrated, remotely-published delivery state.
  IF NOT EXISTS (
    SELECT 1
    FROM task_topics tt
    WHERE tt.task_id = NEW.id
      AND tt.integration IS NOT NULL
      AND tt.integration ->> 'repo' = workspace_binding ->> 'repo'
      AND NULLIF(tt.integration ->> 'prUrl', '') IS NOT NULL
      AND NULLIF(tt.integration ->> 'prNumber', '') IS NOT NULL
      AND tt.integration ->> 'state' = 'integrated'
      AND tt.integration ->> 'pushedToRemote' = 'true'
      AND NULLIF(tt.integration ->> 'expectedHeadSha', '') IS NOT NULL
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