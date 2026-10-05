-- Teardown shared by every scenario: settle any still-live rows the previous
-- scenario left behind. The project orchestration policy defaults to
-- concurrencyLimit=1, so a leftover live dispatch parks every later intake at
-- 'waiting'. This only touches scenario-owned ids.
BEGIN;

UPDATE task_dispatches
SET phase = 'canceled', lease_expires_at = NULL, lease_owner = NULL
WHERE phase NOT IN ('succeeded', 'failed', 'canceled', 'abandoned')
  AND task_id IN ('task_s1a','task_s1b','task_s2p','task_s2c','task_s3','task_s4','task_s5',
                 'task_s6a','task_s6b','task_s7p','task_s7c','task_s8_high','task_s8_low','task_s9');

UPDATE agent_operations
SET status = 'interrupted'
WHERE status NOT IN ('done', 'error', 'interrupted', 'abandoned')
  AND task_id IN ('task_s1a','task_s1b','task_s2p','task_s2c','task_s3','task_s4','task_s5',
                 'task_s6a','task_s6b','task_s7p','task_s7c','task_s8_high','task_s8_low','task_s9');

UPDATE task_topics
SET status = 'canceled'
WHERE status NOT IN ('completed', 'canceled', 'failed')
  AND task_id IN ('task_s1a','task_s1b','task_s2p','task_s2c','task_s3','task_s4','task_s5',
                 'task_s6a','task_s6b','task_s7p','task_s7c','task_s8_high','task_s8_low','task_s9');

-- Park leftover backlog tasks too: every intake gate stays satisfied, so a
-- 'backlog' leftover would just be re-dispatched by the next pass and keep
-- hogging the project slot.
UPDATE tasks SET status = 'paused'
WHERE status IN ('running', 'backlog')
  AND id IN ('task_s1a','task_s1b','task_s2p','task_s2c','task_s3','task_s4','task_s5',
             'task_s6a','task_s6b','task_s7p','task_s7c','task_s8_high','task_s8_low','task_s9');

-- Restore the fixture roster: S8/S9 replace it with a three-band tiered
-- roster, and leaving tiers installed would silently change S1-S5 routing on
-- rerun. The extra agent rows stay (agents carry FK references from old task
-- and dispatch rows, so they are upserted rather than deleted in seeds).
DELETE FROM project_agents WHERE project_id = 'prj_e2e';
INSERT INTO project_agents (project_id, agent_id, workspace_id, role, enabled)
VALUES ('prj_e2e', 'ag_opencode_e2e', 'ws_e2e', 'builder', true)
ON CONFLICT DO NOTHING;

-- The orchestration policy's default executionBudget (maxRuns=10) counts
-- task_topics cumulatively across the project — the real-agent scenarios
-- exceed it within a couple of suite runs and every later mint parks at
-- 'waiting' with project_run_budget_exhausted. The harness opts the fixture
-- project into a large budget so runs aren't capped mid-suite (the budget
-- guardrail itself is verified by the product code, not by this suite).
UPDATE projects
SET orchestration_policy = '{"autoDispatch": true, "executionBudget": {"maxRuns": 200, "maxCost": 100}}'::jsonb
WHERE id = 'prj_e2e';

COMMIT;
