CREATE OR REPLACE FUNCTION enforce_task_resolved_input_before_done()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.workflow_category = 'done' AND has_task_unresolved_input(NEW.id) THEN
    RAISE EXCEPTION 'This task still needs input: its question must receive a producer-acknowledged answer before completion'
      USING ERRCODE = '23514', CONSTRAINT = 'tasks_done_requires_resolved_input';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS tasks_resolved_input_completion_gate ON tasks;
--> statement-breakpoint
CREATE TRIGGER tasks_resolved_input_completion_gate
BEFORE INSERT OR UPDATE OF workflow_category ON tasks
FOR EACH ROW EXECUTE FUNCTION enforce_task_resolved_input_before_done();

--> statement-breakpoint
-- Workflow entry and board readers share the same real execution correlation.
-- Registration marks operations/dispatches running before spawn; only producer
-- activity (ingested turn or remote running admission) establishes execution.
CREATE OR REPLACE FUNCTION has_task_live_executor(
  p_task_id text, p_agent_id text, p_human_id text, p_current_topic_id text, p_generation integer
) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT p_agent_id IS NOT NULL AND p_human_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM tasks t
    JOIN task_topics tt ON tt.task_id = t.id AND tt.topic_id = p_current_topic_id
    JOIN task_dispatches d ON d.id = tt.dispatch_id AND d.task_id = t.id
    JOIN agent_operations op ON op.id = tt.operation_id
    JOIN topics topic ON topic.id = tt.topic_id
    WHERE t.id = p_task_id
      AND NOT has_task_unresolved_input(p_task_id, op.id)
      AND d.agent_id = p_agent_id AND op.agent_id = p_agent_id
      AND d.operation_id = op.id
      AND op.task_id = p_task_id AND op.topic_id = p_current_topic_id
      AND op.workspace_id IS NOT DISTINCT FROM t.workspace_id
      AND tt.workspace_id IS NOT DISTINCT FROM t.workspace_id
      AND d.workspace_id IS NOT DISTINCT FROM t.workspace_id
      AND tt.execution_generation = p_generation AND d.generation = p_generation
      AND tt.dispatch_fence = d.fence
      AND op.app_context ->> 'dispatchId' = d.id
      AND op.app_context ->> 'executionGeneration' = p_generation::text
      AND op.app_context ->> 'dispatchFence' = d.fence::text
      AND d.phase = 'running' AND tt.run_state = 'running'
      AND op.status = 'running' AND op.completed_at IS NULL
      AND (
        topic.metadata #>> '{heteroCurrentMsgId,operationId}' = op.id
        OR op.metadata #>> '{remoteAdmission,state}' = 'running'
      )
  );
$$;
