-- S3 fence/supersede: one backlog task raced by concurrent runTask calls.
BEGIN;

DELETE FROM task_topics WHERE task_id = 'task_s3';
DELETE FROM agent_operations WHERE task_id = 'task_s3';
DELETE FROM task_dispatches WHERE task_id = 'task_s3';
DELETE FROM tasks WHERE id = 'task_s3';

INSERT INTO tasks
  (id, identifier, seq, instruction, name, status, workspace_id, assignee_agent_id,
   project_id, created_by_user_id)
VALUES
  ('task_s3', 'E2EOC-40', 40, 'Reply with the single word ok.', 'S3 fenced task',
   'backlog', 'ws_e2e', 'ag_opencode_e2e', 'prj_e2e', 'user_agent_testing_001');

COMMIT;
