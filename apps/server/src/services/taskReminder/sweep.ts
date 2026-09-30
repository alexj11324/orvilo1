import debug from 'debug';

import { NotificationModel } from '@/database/models/notification';
import { allocateFeedRevision } from '@/database/models/notificationFeed';
import { TaskModel } from '@/database/models/task';
import {
  claimDueTaskReminders,
  markTaskReminderDelivered,
  recordTaskReminderAttempt,
} from '@/database/models/taskReminder';
import { getServerDB } from '@/database/server';
import type { OrviloDatabase } from '@/database/type';

const log = debug('orvilo-server:task-reminder:sweep');

/**
 * Deliver due task reminders to their owners' inboxes. Runs every minute via
 * Hatchet (`orvilo-task-reminder-sweep`) and via the local loop for runtimes
 * without a queue — the (userId, dedupeKey) insert conflict plus the
 * `deliveredAt` claim predicate make a double fire harmless.
 *
 * Per batch (≤100 rows, `FOR UPDATE SKIP LOCKED`):
 *   1. Re-verify the recipient still passes the task read ACL — a reminder
 *      is no proof of access. Failures are stamped delivered so they never
 *      hot-loop.
 *   2. `allocateFeedRevision` bumps the recipient's feed clock.
 *   3. `NotificationModel.create` writes one `update` card per
 *      (reminderId, remindAt) — the dedupe key makes retries and the
 *      two-runner overlap idempotent.
 *   4. `deliveredAt` stamps the row out of the pending index.
 *
 * Each row runs inside a nested savepoint so a poisoned row (bad notification
 * payload, constraint violation, ...) rolls back only its own writes, not the
 * batch's other deliveries. A thrown row is rescheduled on a bounded
 * exponential backoff (`attemptCount`/`nextAttemptAt`) so transient failures
 * retry without holding up the batch; once it exhausts MAX_ATTEMPTS it is
 * stamped `deliveredAt` — a permanently bad row must leave the pending index
 * instead of retrying forever at the head of `remindAt ASC` ordering and
 * starving every row queued behind it.
 */
const MAX_ATTEMPTS = 8;
const RETRY_BASE_MS = 60_000;
const RETRY_MAX_DELAY_MS = 30 * 60_000;

const retryDelayMs = (attempt: number) =>
  Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), RETRY_MAX_DELAY_MS);
export const runTaskReminderSweep = async (
  options: { now?: Date } = {},
): Promise<{
  claimed: number;
  delivered: number;
  skipped: number;
  failed: number;
  retrying: number;
}> => {
  const db = await getServerDB();
  const now = options.now ?? new Date();
  let delivered = 0;
  let skipped = 0;
  let failed = 0;
  let retrying = 0;

  const claimed = await db.transaction(async (tx) => {
    const executor = tx as OrviloDatabase;
    const rows = await claimDueTaskReminders(executor, { now });

    for (const row of rows) {
      try {
        await tx.transaction(async (rowTx) => {
          const rowExecutor = rowTx as OrviloDatabase;
          const workspaceId = row.workspaceId ?? undefined;
          const task = await new TaskModel(rowExecutor, row.userId, workspaceId).findById(
            row.taskId,
          );
          if (!task) {
            // No longer readable (deleted, workspace switch, visibility
            // flip): stamp delivered so the row leaves the pending index
            // instead of being re-claimed every sweep.
            await markTaskReminderDelivered(rowExecutor, row.id);
            skipped += 1;
            return;
          }

          const revision = await allocateFeedRevision(rowExecutor, {
            userId: row.userId,
            workspaceId: row.workspaceId,
          });
          const taskTitle = task.name ?? task.identifier;
          const notification = await new NotificationModel(rowExecutor, row.userId, {
            workspaceId: row.workspaceId,
          }).create({
            activityVersion: 1,
            category: 'workspace',
            content: `Reminder: ${taskTitle}`,
            dedupeKey: `task-reminder:${row.id}:${row.remindAt.toISOString()}`,
            episodeKey: `task-reminder:${row.id}`,
            kind: 'update',
            lastActivityAt: new Date(),
            latestFeedRevision: revision,
            resourceId: task.id,
            resourceType: 'task',
            title: `Reminder: ${taskTitle}`,
            type: 'task_reminder',
            workspaceId: row.workspaceId,
          });

          // create() can no-op on the dedupe conflict — the row is still
          // delivered: a second fire of the same remindAt must not keep
          // retrying forever.
          await markTaskReminderDelivered(rowExecutor, row.id);
          if (notification) delivered += 1;
        });
      } catch (error) {
        // The savepoint already rolled back this row's writes. Reschedule on
        // a bounded backoff; after the attempt cap the row is stamped
        // delivered so it leaves the pending index rather than starving the
        // rows queued behind it (claims order by remindAt ASC).
        const attempt = row.attemptCount + 1;
        if (attempt >= MAX_ATTEMPTS) {
          failed += 1;
          log(
            'sweep: reminder %s gave up after %d attempts; stamping delivered: %o',
            row.id,
            attempt,
            error,
          );
          await markTaskReminderDelivered(executor, row.id);
        } else {
          retrying += 1;
          const nextAttemptAt = new Date(now.getTime() + retryDelayMs(attempt));
          log(
            'sweep: reminder %s attempt %d failed; next attempt at %s: %o',
            row.id,
            attempt,
            nextAttemptAt.toISOString(),
            error,
          );
          await recordTaskReminderAttempt(executor, row.id, attempt, nextAttemptAt);
        }
      }
    }

    return rows.length;
  });

  log(
    'sweep: claimed=%d delivered=%d skipped=%d retrying=%d failed=%d',
    claimed,
    delivered,
    skipped,
    retrying,
    failed,
  );
  return { claimed, delivered, skipped, failed, retrying };
};
