-- S6 blocked-by cascade (real runs): A + B both backlog; B is gated by a
-- task_dependencies 'blocks' edge on A. Intake may only dispatch A; after A's
-- real opencode run finishes and A is force-completed, the cascade path must
-- unlock B and dispatch a real run for it too.
BEGIN;

DELETE FROM task_dependencies
 WHERE task_id IN ('task_s6a', 'task_s6b')
    OR depends_on_id IN ('task_s6a', 'task_s6b');
DELETE FROM task_topics WHERE task_id IN ('task_s6a', 'task_s6b');
DELETE FROM agent_operations WHERE task_id IN ('task_s6a', 'task_s6b');
DELETE FROM task_dispatches WHERE task_id IN ('task_s6a', 'task_s6b');
DELETE FROM tasks WHERE id IN ('task_s6a', 'task_s6b');

INSERT INTO tasks
  (id, identifier, seq, instruction, name, status, workspace_id, assignee_agent_id,
   project_id, created_by_user_id)
VALUES
  ('task_s6a', 'E2EOC-70', 70,
   'write the file e2e-orchestration-s6a.txt containing the word ok',
   'S6 task A (blocker)', 'backlog', 'ws_e2e', 'ag_opencode_e2e', 'prj_e2e',
   'user_agent_testing_001'),
  ('task_s6b', 'E2EOC-71', 71,
   'write the file e2e-orchestration-s6b.txt containing the word ok',
   'S6 task B (blocked by A)', 'backlog', 'ws_e2e', 'ag_opencode_e2e', 'prj_e2e',
   'user_agent_testing_001');

INSERT INTO task_dependencies (task_id, depends_on_id, user_id, workspace_id, type)
VALUES ('task_s6b', 'task_s6a', 'user_agent_testing_001', 'ws_e2e', 'blocks');

COMMIT;
