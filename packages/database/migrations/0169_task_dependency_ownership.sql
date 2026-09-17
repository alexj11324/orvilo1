-- Legacy edges recorded the member who added them rather than the dependent's
-- creator. Re-home them before ON DELETE CASCADE can erase another owner's
-- prerequisite when that member deletes their account. Safe to replay.
UPDATE "task_dependencies" AS dependency
SET "user_id" = task.created_by_user_id
FROM "tasks" AS task
WHERE dependency.task_id = task.id
  AND dependency.user_id IS DISTINCT FROM task.created_by_user_id;
