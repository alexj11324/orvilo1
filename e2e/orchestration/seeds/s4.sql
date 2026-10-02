-- S4 orphan recovery: fabricated running dispatch+op whose lease expired and
-- whose heartbeat is dead — the executor vanished without settling the op.
BEGIN;

DELETE FROM task_topics WHERE task_id = 'task_s4';
DELETE FROM agent_operations WHERE task_id = 'task_s4';
DELETE FROM task_dispatches WHERE task_id = 'task_s4';
DELETE FROM topics WHERE id = 'tpc_s4';
DELETE FROM tasks WHERE id = 'task_s4';

INSERT INTO tasks
  (id, identifier, seq, instruction, name, status, workspace_id, assignee_agent_id,
   project_id, created_by_user_id, execution_generation, requirement_revision,
   policy_revision, current_topic_id, last_heartbeat_at, heartbeat_timeout)
VALUES
  ('task_s4', 'E2EOC-50', 50, 'Reply with the single word ok.', 'S4 orphaned run',
   'running', 'ws_e2e', 'ag_opencode_e2e', 'prj_e2e', 'user_agent_testing_001',
   1, 1, 1, NULL, now() - interval '1 hour', 60);

INSERT INTO task_dispatches
  (id, task_id, generation, fence, task_revision, requirement_revision, policy_revision,
   idempotency_key, requested_by, phase, operation_id, agent_id, workspace_id,
   lease_expires_at, updated_at)
VALUES
  ('dsp_s4', 'task_s4', 1, 1, 1, 1, 1, 'orch-scenario4:dsp_s4',
   'orchestrator:backlog_intake', 'running', 'op_s4', 'ag_opencode_e2e', 'ws_e2e',
   now() - interval '10 minutes', now() - interval '10 minutes');

INSERT INTO topics (id, user_id, workspace_id, agent_id)
VALUES ('tpc_s4', 'user_agent_testing_001', 'ws_e2e', 'ag_opencode_e2e');

UPDATE tasks SET current_topic_id = 'tpc_s4' WHERE id = 'task_s4';

INSERT INTO task_topics
  (seq, task_id, topic_id, user_id, operation_id, status, dispatch_id, task_revision,
   requirement_revision, policy_revision, execution_generation, dispatch_fence, trigger)
VALUES
  (1, 'task_s4', 'tpc_s4', 'user_agent_testing_001', 'op_s4', 'running', 'dsp_s4',
   1, 1, 1, 1, 1, 'orchestrator');

-- Op stays 'running' forever: the dead executor never reported a terminal state.
INSERT INTO agent_operations
  (id, user_id, status, task_id, topic_id, workspace_id, agent_id, app_context)
VALUES
  ('op_s4', 'user_agent_testing_001', 'running', 'task_s4', 'tpc_s4', 'ws_e2e',
   'ag_opencode_e2e',
   '{"dispatchId":"dsp_s4","dispatchFence":1,"executionGeneration":1}');

COMMIT;
