import { and, eq, isNull, lte, or } from 'drizzle-orm';

import type { NewTaskReminder, TaskReminderItem } from '../schemas/taskReminder';
import { taskReminders } from '../schemas/taskReminder';
import type { OrviloDatabase, Transaction } from '../type';

/**
 * Per-user reminders on a task — Linear's "Remind me". One row per
 * (task, user): re-setting replaces `remindAt` rather than stacking rows.
 * User-facing methods are scoped to the owner; the delivery sweep uses the
 * standalone claim/mark helpers below, which run as the system.
 */
export class TaskReminderModel {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly workspaceId?: string,
  ) {}

  setReminder = async (taskId: string, remindAt: Date): Promise<TaskReminderItem> => {
    const [row] = await this.db
      .insert(taskReminders)
      .values({
        remindAt,
        taskId,
        userId: this.userId,
        workspaceId: this.workspaceId ?? null,
      })
      .onConflictDoUpdate({
        set: {
          // A re-set is a fresh fire time — delivery state resets with it.
          attemptCount: 0,
          deliveredAt: null,
          nextAttemptAt: null,
          remindAt,
          updatedAt: new Date(),
          workspaceId: this.workspaceId ?? null,
        },
        target: [taskReminders.taskId, taskReminders.userId],
      })
      .returning();
    return row;
  };

  clearReminder = async (taskId: string): Promise<boolean> => {
    const deleted = await this.db
      .delete(taskReminders)
      .where(and(eq(taskReminders.taskId, taskId), eq(taskReminders.userId, this.userId)))
      .returning({ id: taskReminders.id });
    return deleted.length > 0;
  };

  getReminder = async (taskId: string): Promise<TaskReminderItem | null> => {
    const [row] = await this.db
      .select()
      .from(taskReminders)
      .where(
        and(
          eq(taskReminders.taskId, taskId),
          eq(taskReminders.userId, this.userId),
          isNull(taskReminders.deliveredAt),
        ),
      )
      .limit(1);
    return row ?? null;
  };
}

const REMINDER_SWEEP_BATCH = 100;

/**
 * Claim due reminders for delivery. Runs inside the caller's transaction —
 * the `FOR UPDATE SKIP LOCKED` locks must stay held while the rows are
 * processed so a concurrent sweep instance picks a disjoint set.
 */
export const claimDueTaskReminders = async (
  executor: Transaction | OrviloDatabase,
  options: { limit?: number; now: Date },
): Promise<TaskReminderItem[]> => {
  const rows = await executor
    .select()
    .from(taskReminders)
    .where(
      and(
        isNull(taskReminders.deliveredAt),
        lte(taskReminders.remindAt, options.now),
        or(isNull(taskReminders.nextAttemptAt), lte(taskReminders.nextAttemptAt, options.now)),
      ),
    )
    .orderBy(taskReminders.remindAt)
    .limit(options.limit ?? REMINDER_SWEEP_BATCH)
    .for('update', { skipLocked: true });
  return rows;
};

export const markTaskReminderDelivered = async (
  executor: Transaction | OrviloDatabase,
  id: string,
): Promise<void> => {
  await executor
    .update(taskReminders)
    .set({ deliveredAt: new Date(), updatedAt: new Date() })
    .where(eq(taskReminders.id, id));
};

export const recordTaskReminderAttempt = async (
  executor: Transaction | OrviloDatabase,
  id: string,
  attemptCount: number,
  nextAttemptAt: Date,
): Promise<void> => {
  await executor
    .update(taskReminders)
    .set({ attemptCount, nextAttemptAt, updatedAt: new Date() })
    .where(eq(taskReminders.id, id));
};

export type { NewTaskReminder, TaskReminderItem };
