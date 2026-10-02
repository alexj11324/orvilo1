-- S2 subtask completion: parent P paused; child C backlog with parent_task_id=P
-- and every intake gate satisfied.
BEGIN;

DELETE FROM task_topics WHERE task_id IN ('task_s2p', 'task_s2c');
DELETE FROM agent_operations WHERE task_id IN ('task_s2p', 'task_s2c');
DELETE FROM task_dispatches WHERE task_id IN ('task_s2p', 'task_s2c');
DELETE FROM tasks WHERE id IN ('task_s2p', 'task_s2c');

INSERT INTO tasks
  (id, identifier, seq, instruction, name, status, workspace_id, assignee_agent_id,
   project_id, created_by_user_id)
VALUES
  ('task_s2p', 'E2EOC-30', 30, 'Parent task for S2.', 'S2 parent (paused)',
   'paused', 'ws_e2e', 'ag_opencode_e2e', 'prj_e2e', 'user_agent_testing_001'),
  ('task_s2c', 'E2EOC-31', 31, 'Reply with the single word ok.', 'S2 child',
   'backlog', 'ws_e2e', 'ag_opencode_e2e', 'prj_e2e', 'user_agent_testing_001');

UPDATE tasks SET parent_task_id = 'task_s2p' WHERE id = 'task_s2c';

COMMIT;
