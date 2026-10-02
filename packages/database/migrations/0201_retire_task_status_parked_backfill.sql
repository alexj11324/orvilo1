-- `tasks.status` is retired as a status source: the Issue Status lives on
-- `workflow_category`/`workflow_state_ref_id`, execution state on
-- `task_dispatches.phase`/`task_topics.run_state`, and the parked hold on
-- `context->'execution'->'parked'`. This converges historical rows whose only
-- record of those facts is the legacy column. The column itself is kept for
-- historical reads and receives no further writes (schema drop is a separate
-- decision, noted in docs/development/state-model.md).
--
-- All statements are idempotent: re-running skips rows that already carry a
-- parked marker or a non-default workflow category.

-- 1. Parked hold: legacy 'paused'/'failed' rows get the canonical
--    context.execution.parked marker. `at` reuses the row's last update as the
--    best available park timestamp. The marker is merged one path level at a
--    time (matching parkMarkerSet in models/taskExecutionSql.ts) — engines that
--    do not create intermediate jsonb_set path segments still converge.
UPDATE "tasks" SET "context" = jsonb_set(
  coalesce("context", '{}'::jsonb),
  '{execution}',
  coalesce("context" -> 'execution', '{}'::jsonb)
    || jsonb_build_object(
         'parked',
         jsonb_build_object('at', to_char("updated_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
       )
)
WHERE "status" = 'paused'
  AND "context" #>> '{execution,parked}' IS NULL;--> statement-breakpoint

UPDATE "tasks" SET "context" = jsonb_set(
  coalesce("context", '{}'::jsonb),
  '{execution}',
  coalesce("context" -> 'execution', '{}'::jsonb)
    || jsonb_build_object(
         'parked',
         jsonb_build_object(
           'at', to_char("updated_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
           'reason', 'failed'
         )
       )
)
WHERE "status" = 'failed'
  AND "context" #>> '{execution,parked}' IS NULL;--> statement-breakpoint

-- 2. Terminal Issue Status: rows whose last synced truth was
--    completed/canceled but that predate `workflow_category` (or were touched
--    by a path that only wrote the legacy column) converge to the matching
--    canonical category. Rows the workflow layer ever explicitly placed
--    (workflow_category <> 'backlog') keep their placement.
UPDATE "tasks" SET "workflow_category" = 'done'
WHERE "status" = 'completed' AND "workflow_category" = 'backlog';--> statement-breakpoint

UPDATE "tasks" SET "workflow_category" = 'canceled'
WHERE "status" = 'canceled' AND "workflow_category" = 'backlog';
