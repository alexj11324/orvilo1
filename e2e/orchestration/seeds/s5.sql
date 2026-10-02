-- S5 real opencode run: fresh backlog task bound to the e2e device agent.
BEGIN;

DELETE FROM task_topics WHERE task_id IN ('task_s5', 'task_s5_opencode');
DELETE FROM agent_operations WHERE task_id IN ('task_s5', 'task_s5_opencode');
DELETE FROM task_dispatches WHERE task_id IN ('task_s5', 'task_s5_opencode');
DELETE FROM topics WHERE id IN ('tpc_s5');
DELETE FROM tasks WHERE id IN ('task_s5', 'task_s5_opencode');

INSERT INTO tasks
  (id, identifier, seq, instruction, name, status, workspace_id, assignee_agent_id,
   project_id, created_by_user_id)
VALUES
  ('task_s5', 'E2EOC-60', 60,
   'Run exactly this shell command and nothing else: printf "orch-ok\n" > e2e-scenario5.txt',
   'S5 real opencode run', 'backlog', 'ws_e2e', 'ag_opencode_e2e', 'prj_e2e',
   'user_agent_testing_001');

COMMIT;
