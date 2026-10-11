import { and, eq, inArray, isNull } from 'drizzle-orm';

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
        set: { unsubscribedAt: null, updatedAt: new Date() },
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

  unsubscribe = async (taskId: string): Promise<boolean> => {
    const updated = await this.db
      .update(taskSubscriptions)
      .set({ unsubscribedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(taskSubscriptions.taskId, taskId),
          eq(taskSubscriptions.userId, this.userId),
          isNull(taskSubscriptions.unsubscribedAt),
        ),
      )
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

  listActiveForTaskIds = async (taskIds: string[]): Promise<string[]> => {
    if (taskIds.length === 0) return [];
    const rows = await this.db
      .select({ taskId: taskSubscriptions.taskId })
      .from(taskSubscriptions)
      .where(
        and(
          eq(taskSubscriptions.userId, this.userId),
          isNull(taskSubscriptions.unsubscribedAt),
          inArray(taskSubscriptions.taskId, taskIds),
        ),
      );
    return rows.map((row) => row.taskId);
  };
}
