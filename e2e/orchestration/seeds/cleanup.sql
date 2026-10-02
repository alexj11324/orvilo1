-- Teardown shared by every scenario: settle any still-live rows the previous
-- scenario left behind. The project orchestration policy defaults to
-- concurrencyLimit=1, so a leftover live dispatch parks every later intake at
-- 'waiting'. This only touches scenario-owned ids.
BEGIN;

UPDATE task_dispatches
SET phase = 'canceled', lease_expires_at = NULL, lease_owner = NULL
WHERE phase NOT IN ('succeeded', 'failed', 'canceled', 'abandoned')
  AND task_id IN ('task_s1a','task_s1b','task_s2p','task_s2c','task_s3','task_s4','task_s5');

UPDATE agent_operations
SET status = 'interrupted'
WHERE status NOT IN ('done', 'error', 'interrupted', 'abandoned')
  AND task_id IN ('task_s1a','task_s1b','task_s2p','task_s2c','task_s3','task_s4','task_s5');

UPDATE task_topics
SET status = 'canceled'
WHERE status NOT IN ('completed', 'canceled', 'failed')
  AND task_id IN ('task_s1a','task_s1b','task_s2p','task_s2c','task_s3','task_s4','task_s5');

-- Park leftover backlog tasks too: every intake gate stays satisfied, so a
-- 'backlog' leftover would just be re-dispatched by the next pass and keep
-- hogging the project slot.
UPDATE tasks SET status = 'paused'
WHERE status IN ('running', 'backlog')
  AND id IN ('task_s1a','task_s1b','task_s2p','task_s2c','task_s3','task_s4','task_s5');

COMMIT;
