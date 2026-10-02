-- S1 blocked-by cascade: A running with an active dispatch+op; B backlog,
-- blocked by A via task_dependencies (type='blocks').
BEGIN;

DELETE FROM task_dependencies WHERE task_id = 'task_s1b' OR depends_on_id = 'task_s1a';
DELETE FROM task_topics WHERE task_id IN ('task_s1a', 'task_s1b');
DELETE FROM agent_operations WHERE task_id IN ('task_s1a', 'task_s1b');
DELETE FROM task_dispatches WHERE task_id IN ('task_s1a', 'task_s1b');
DELETE FROM topics WHERE id IN ('tpc_s1a');
DELETE FROM tasks WHERE id IN ('task_s1a', 'task_s1b');

-- A: running, current generation 1, completion already requested by its op so
-- onTopicComplete settles it to 'completed' (root task, context.completion path).
INSERT INTO tasks
  (id, identifier, seq, instruction, name, status, workspace_id, assignee_agent_id,
   project_id, created_by_user_id, execution_generation, requirement_revision,
   policy_revision, current_topic_id, context, last_heartbeat_at)
VALUES
  ('task_s1a', 'E2EOC-20', 20, 'Reply with the single word ok.', 'S1 task A (running)',
   'running', 'ws_e2e', 'ag_opencode_e2e', 'prj_e2e', 'user_agent_testing_001',
   1, 1, 1, NULL, '{"completion":{"requestedByOperationId":"op_s1a"}}', now());

-- B: backlog, every intake gate satisfied except the dependency edge.
INSERT INTO tasks
  (id, identifier, seq, instruction, name, status, workspace_id, assignee_agent_id,
   project_id, created_by_user_id)
VALUES
  ('task_s1b', 'E2EOC-21', 21, 'Reply with the single word ok.', 'S1 task B (blocked by A)',
   'backlog', 'ws_e2e', 'ag_opencode_e2e', 'prj_e2e', 'user_agent_testing_001');

INSERT INTO task_dependencies (task_id, depends_on_id, user_id, workspace_id, type)
VALUES ('task_s1b', 'task_s1a', 'user_agent_testing_001', 'ws_e2e', 'blocks');

-- A's fabricated active run: live lease so the recovery sweep leaves it alone.
INSERT INTO task_dispatches
  (id, task_id, generation, fence, task_revision, requirement_revision, policy_revision,
   idempotency_key, requested_by, phase, operation_id, agent_id, workspace_id,
   lease_expires_at)
VALUES
  ('dsp_s1a', 'task_s1a', 1, 1, 1, 1, 1, 'orch-scenario1:dsp_s1a',
   'orchestrator:backlog_intake', 'running', 'op_s1a', 'ag_opencode_e2e', 'ws_e2e',
   now() + interval '1 hour');

INSERT INTO topics (id, user_id, workspace_id, agent_id)
VALUES ('tpc_s1a', 'user_agent_testing_001', 'ws_e2e', 'ag_opencode_e2e');

UPDATE tasks SET current_topic_id = 'tpc_s1a' WHERE id = 'task_s1a';

INSERT INTO task_topics
  (seq, task_id, topic_id, user_id, operation_id, status, dispatch_id, task_revision,
   requirement_revision, policy_revision, execution_generation, dispatch_fence, trigger)
VALUES
  (1, 'task_s1a', 'tpc_s1a', 'user_agent_testing_001', 'op_s1a', 'running', 'dsp_s1a',
   1, 1, 1, 1, 1, 'orchestrator');

INSERT INTO agent_operations
  (id, user_id, status, task_id, topic_id, workspace_id, agent_id, app_context)
VALUES
  ('op_s1a', 'user_agent_testing_001', 'running', 'task_s1a', 'tpc_s1a', 'ws_e2e',
   'ag_opencode_e2e',
   '{"dispatchId":"dsp_s1a","dispatchFence":1,"executionGeneration":1}');

COMMIT;
