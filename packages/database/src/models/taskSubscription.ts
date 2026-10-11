import { and, eq, inArray, isNotNull, isNull, or } from 'drizzle-orm';

import { tasks } from '../schemas/task';
import type { TaskSubscriptionItem } from '../schemas/workAttention';
import { taskSubscriptions } from '../schemas/workAttention';
import type { OrviloDatabase } from '../type';

/** Why an automatic rule subscribed someone; a manual follow stores `manual`. */
export type TaskSubscriptionAutoReason = 'assigned' | 'commented' | 'mentioned' | 'reviewer';

export class TaskSubscriptionModel {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly workspaceId?: string,
  ) {}

  subscribe = async (taskId: string, reason = 'manual'): Promise<TaskSubscriptionItem> => {
    const [row] = await this.db
      .insert(taskSubscriptions)
      .values({
        reason,
        taskId,
        userId: this.userId,
        workspaceId: this.workspaceId ?? null,
      })
      .onConflictDoUpdate({
        // The workspace is rewritten too: recipients are matched on it, and a
        // row written under another scope would otherwise never notify.
        set: { unsubscribedAt: null, updatedAt: new Date(), workspaceId: this.workspaceId ?? null },
        target: [taskSubscriptions.taskId, taskSubscriptions.userId],
      })
      .returning();
    return row;
  };

  /**
   * Subscribe people who became involved in an Issue (commented, mentioned,
   * assigned, reviewer). Unlike {@link subscribe} this never touches an
   * existing row: an explicit unsubscribe (`unsubscribedAt`) is the person's
   * own decision and an automatic rule must not undo it. `workspaceId` is the
   * Issue's own, because recipients are matched on it at notification time.
   */
  ensureSubscribed = async (
    taskId: string,
    userIds: readonly (string | null | undefined)[],
    reason: TaskSubscriptionAutoReason,
  ): Promise<void> => {
    const unique = [...new Set(userIds.filter((id): id is string => !!id))];
    if (unique.length === 0) return;
    await this.db
      .insert(taskSubscriptions)
      .values(
        unique.map((userId) => ({
          reason,
          taskId,
          userId,
          workspaceId: this.workspaceId ?? null,
        })),
      )
      .onConflictDoNothing({ target: [taskSubscriptions.taskId, taskSubscriptions.userId] });
  };

  isSubscribed = async (taskId: string): Promise<boolean> =>
    (await this.listActiveForTaskIds([taskId])).length > 0;

  /**
   * Record the caller's opt-out. The Issue's creator and assignee are notified
   * without a row (see {@link listActiveForTaskIds}), so this writes one when
   * none exists; otherwise there would be nothing to switch off.
   */
  unsubscribe = async (taskId: string): Promise<boolean> => {
    const now = new Date();
    const updated = await this.db
      .insert(taskSubscriptions)
      .values({
        taskId,
        unsubscribedAt: now,
        userId: this.userId,
        workspaceId: this.workspaceId ?? null,
      })
      .onConflictDoUpdate({
        set: { unsubscribedAt: now, updatedAt: now },
        setWhere: isNull(taskSubscriptions.unsubscribedAt),
        target: [taskSubscriptions.taskId, taskSubscriptions.userId],
      })
      .returning({ id: taskSubscriptions.id });
    return updated.length > 0;
  };

  listActiveTaskIds = async (): Promise<string[]> => {
    const rows = await this.db
      .select({ taskId: taskSubscriptions.taskId })
      .from(taskSubscriptions)
      .where(
        and(eq(taskSubscriptions.userId, this.userId), isNull(taskSubscriptions.unsubscribedAt)),
      );
    return rows.map((row) => row.taskId);
  };

  /**
   * The Issues among `taskIds` the caller is notified about: those with an
   * active row, plus those they created or are assigned to and have not opted
   * out of. This is the same rule the notification projection applies.
   */
  listActiveForTaskIds = async (taskIds: string[]): Promise<string[]> => {
    if (taskIds.length === 0) return [];
    const rows = await this.db
      .select({ taskId: tasks.id })
      .from(tasks)
      .leftJoin(
        taskSubscriptions,
        and(eq(taskSubscriptions.taskId, tasks.id), eq(taskSubscriptions.userId, this.userId)),
      )
      .where(
        and(
          inArray(tasks.id, taskIds),
          or(
            and(isNotNull(taskSubscriptions.id), isNull(taskSubscriptions.unsubscribedAt)),
            and(
              isNull(taskSubscriptions.id),
              or(eq(tasks.createdByUserId, this.userId), eq(tasks.assigneeUserId, this.userId)),
            ),
          ),
        ),
      );
    return rows.map((row) => row.taskId);
  };
}
