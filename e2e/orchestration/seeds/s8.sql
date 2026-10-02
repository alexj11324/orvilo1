-- S8 tier matching (real runs): three enabled roster rows, one per tier band
-- (low/mid/high), all device-bound opencode agents running big-pickle. The
-- intake matcher must route by priority:
--   task_s8_high (priority 1 -> required 'high'), seeded on the LOW agent ->
--     rebinds to ag_opencode_e2e (tier 'high').
--   task_s8_low  (priority 5 -> required 'low'),  seeded on the HIGH agent ->
--     rebinds to ag_opencode_e2e_low (cheapest satisfying band).
-- Both binding decisions are asserted off task_dispatches.agent_id + tier,
-- and both dispatches execute real opencode runs.
BEGIN;

DELETE FROM task_topics WHERE task_id IN ('task_s8_high', 'task_s8_low');
DELETE FROM agent_operations WHERE task_id IN ('task_s8_high', 'task_s8_low');
DELETE FROM task_dispatches WHERE task_id IN ('task_s8_high', 'task_s8_low');
DELETE FROM tasks WHERE id IN ('task_s8_high', 'task_s8_low');

-- Agents are upserted (not deleted): task/dispatch/agent_operations rows from
-- earlier runs keep FK references to them. agency_config is rewritten
-- wholesale so a rerun always restores the working model.
INSERT INTO agents (id, title, user_id, workspace_id, visibility, agency_config)
VALUES
  ('ag_opencode_e2e_low', 'opencode-e2e-low', 'user_agent_testing_001', 'ws_e2e', 'private',
   '{"boundDeviceId":"4531b4f34098d3f450abc7b1ea52d957","executionTarget":"device","heterogeneousProvider":{"type":"opencode","model":"opencode/big-pickle"}}'),
  ('ag_opencode_e2e_mid', 'opencode-e2e-mid', 'user_agent_testing_001', 'ws_e2e', 'private',
   '{"boundDeviceId":"4531b4f34098d3f450abc7b1ea52d957","executionTarget":"device","heterogeneousProvider":{"type":"opencode","model":"opencode/big-pickle"}}')
ON CONFLICT (id) DO UPDATE SET agency_config = EXCLUDED.agency_config;

-- Scenario-owned roster: exactly one row per band, nothing else.
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
  ('task_s8_high', 'E2EOC-90', 90,
   'write the file e2e-orchestration-s8-high.txt containing the word ok',
   'S8 high-priority task', 'backlog', 'ws_e2e', 'ag_opencode_e2e_low', 'prj_e2e',
   'user_agent_testing_001', 1),
  ('task_s8_low', 'E2EOC-91', 91,
   'write the file e2e-orchestration-s8-low.txt containing the word ok',
   'S8 low-priority task', 'backlog', 'ws_e2e', 'ag_opencode_e2e', 'prj_e2e',
   'user_agent_testing_001', 5);

COMMIT;
