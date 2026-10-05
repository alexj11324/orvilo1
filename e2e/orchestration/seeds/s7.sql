-- S7 subtask completion (real run): parent P paused at its checkpoint; child C
-- backlog with parent_task_id=P and every intake gate satisfied. C's real
-- opencode run finishes -> C settles 'completed' via completeSubtask (NOT the
-- root-task 'paused' review boundary); P stays paused (tasks.afterIds unset).
BEGIN;

DELETE FROM task_topics WHERE task_id IN ('task_s7p', 'task_s7c');
DELETE FROM agent_operations WHERE task_id IN ('task_s7p', 'task_s7c');
DELETE FROM task_dispatches WHERE task_id IN ('task_s7p', 'task_s7c');
DELETE FROM tasks WHERE id IN ('task_s7p', 'task_s7c');

INSERT INTO tasks
  (id, identifier, seq, instruction, name, status, workspace_id, assignee_agent_id,
   project_id, created_by_user_id)
VALUES
  ('task_s7p', 'E2EOC-80', 80, 'Parent task for S7.', 'S7 parent (paused)',
   'paused', 'ws_e2e', 'ag_opencode_e2e', 'prj_e2e', 'user_agent_testing_001'),
  ('task_s7c', 'E2EOC-81', 81,
   'write the file e2e-orchestration-s7.txt containing the word ok',
   'S7 child', 'backlog', 'ws_e2e', 'ag_opencode_e2e', 'prj_e2e',
   'user_agent_testing_001');

UPDATE tasks SET parent_task_id = 'task_s7p' WHERE id = 'task_s7c';

COMMIT;
