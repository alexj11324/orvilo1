import debug from 'debug';

import { NotificationModel } from '@/database/models/notification';
import { allocateFeedRevision } from '@/database/models/notificationFeed';
import { TaskModel } from '@/database/models/task';
import { claimDueTaskReminders, markTaskReminderDelivered } from '@/database/models/taskReminder';
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
 */
export const runTaskReminderSweep = async (
  options: { now?: Date } = {},
): Promise<{ claimed: number; delivered: number; skipped: number }> => {
  const db = await getServerDB();
  const now = options.now ?? new Date();
  let delivered = 0;
  let skipped = 0;

  const claimed = await db.transaction(async (tx) => {
    const executor = tx as OrviloDatabase;
    const rows = await claimDueTaskReminders(executor, { now });

    for (const row of rows) {
      const workspaceId = row.workspaceId ?? undefined;
      const task = await new TaskModel(executor, row.userId, workspaceId).findById(row.taskId);
      if (!task) {
        // No longer readable (deleted, workspace switch, visibility flip):
        // stamp delivered so the row leaves the pending index instead of
        // being re-claimed every sweep.
        await markTaskReminderDelivered(executor, row.id);
        skipped += 1;
        continue;
      }

      const revision = await allocateFeedRevision(executor, {
        userId: row.userId,
        workspaceId: row.workspaceId,
      });
      const taskTitle = task.name ?? task.identifier;
      const notification = await new NotificationModel(executor, row.userId, {
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
      await markTaskReminderDelivered(executor, row.id);
      if (notification) delivered += 1;
    }

    return rows.length;
  });

  log('sweep: claimed=%d delivered=%d skipped=%d', claimed, delivered, skipped);
  return { claimed, delivered, skipped };
};
