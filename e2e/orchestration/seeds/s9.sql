-- S9 escalate-on-failure (real runs): same three-band roster as S8, but the
-- LOW band's agency_config points at a nonexistent opencode model so its real
-- run errors immediately. A low-priority task binds ag_opencode_e2e_low (tier
-- 'low'), the run fails, the dispatch lands 'failed' and the task parks
-- 'paused'. Requeueing the task to 'backlog' (user retry) lets the next intake
-- pass escalate required 'low' -> 'mid' off the terminally failed orchestrated
-- dispatch and rebind ag_opencode_e2e_mid for a real successful run.
BEGIN;

DELETE FROM task_topics WHERE task_id = 'task_s9';
DELETE FROM agent_operations WHERE task_id = 'task_s9';
DELETE FROM task_dispatches WHERE task_id = 'task_s9';
DELETE FROM tasks WHERE id = 'task_s9';

-- Working mid band; the low band gets the broken model for this scenario.
INSERT INTO agents (id, title, user_id, workspace_id, visibility, agency_config)
VALUES
  ('ag_opencode_e2e_low', 'opencode-e2e-low', 'user_agent_testing_001', 'ws_e2e', 'private',
   '{"boundDeviceId":"4531b4f34098d3f450abc7b1ea52d957","executionTarget":"device","heterogeneousProvider":{"type":"opencode","model":"opencode/e2e-missing-model"}}'),
  ('ag_opencode_e2e_mid', 'opencode-e2e-mid', 'user_agent_testing_001', 'ws_e2e', 'private',
   '{"boundDeviceId":"4531b4f34098d3f450abc7b1ea52d957","executionTarget":"device","heterogeneousProvider":{"type":"opencode","model":"opencode/big-pickle"}}')
ON CONFLICT (id) DO UPDATE SET agency_config = EXCLUDED.agency_config;

DELETE FROM project_agents WHERE project_id = 'prj_e2e';
INSERT INTO project_agents (project_id, agent_id, workspace_id, role, enabled, sort_order, tier)
VALUES
  ('prj_e2e', 'ag_opencode_e2e_low', 'ws_e2e', 'builder', true, 0, 'low'),
  ('prj_e2e', 'ag_opencode_e2e_mid', 'ws_e2e', 'builder', true, 1, 'mid'),
  ('prj_e2e', 'ag_opencode_e2e', 'ws_e2e', 'builder', true, 2, 'high');

INSERT INTO tasks
  (id, identifier, seq, instruction, name, status, workspace_id, assignee_agent_id,
   project_id, created_by_user_id, priority)
VALUES
  ('task_s9', 'E2EOC-95', 95,
   'write the file e2e-orchestration-s9.txt containing the word ok',
   'S9 escalate-on-failure task', 'backlog', 'ws_e2e', 'ag_opencode_e2e_low', 'prj_e2e',
   'user_agent_testing_001', 5);

COMMIT;
