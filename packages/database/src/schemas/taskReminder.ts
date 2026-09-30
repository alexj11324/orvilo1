import { isNull } from 'drizzle-orm';
import { index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { timestamps, timestamptz } from './_helpers';
import { tasks } from './task';
import { users } from './user';
import { workspaces } from './workspace';

/**
 * Per-user reminders on a task — Linear's "Remind me". One row per
 * (task, user): re-setting the reminder replaces `remind_at` rather than
 * stacking rows, so the unique key doubles as the upsert target.
 *
 * `remind_at` is an instant (timestamptz), unlike `tasks.due_date` which is a
 * calendar date: a reminder fires at a concrete time (e.g. "in 1 hour"),
 * and the sweep locks every row whose `remind_at <= now()` with no
 * `delivered_at`.
 *
 * `workspace_id` is nullable to mirror `tasks.workspace_id` (personal tasks
 * have no workspace); it denormalizes the parent task's scope so the sweep
 * does not need the join to filter.
 */
export const taskReminders = pgTable(
  'task_reminders',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    taskId: text('task_id')
      .references(() => tasks.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    remindAt: timestamptz('remind_at').notNull(),
    deliveredAt: timestamptz('delivered_at'),
    // Delivery retry bookkeeping: a failed attempt bumps `attemptCount` and
    // re-arms `nextAttemptAt` on a bounded backoff; the sweep re-claims the
    // row then. Rows past the attempt cap get `deliveredAt` so they cannot
    // head-block the pending index forever.
    attemptCount: integer('attempt_count').notNull().default(0),
    nextAttemptAt: timestamptz('next_attempt_at'),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('task_reminders_task_user_unique').on(t.taskId, t.userId),
    index('task_reminders_user_id_idx').on(t.userId),
    // The delivery sweep's hot path: undelivered rows ordered by fire time.
    index('task_reminders_pending_idx').on(t.remindAt).where(isNull(t.deliveredAt)),
  ],
);

export type NewTaskReminder = typeof taskReminders.$inferInsert;
export type TaskReminderItem = typeof taskReminders.$inferSelect;
