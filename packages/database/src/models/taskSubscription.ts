import { and, eq, inArray, isNull } from 'drizzle-orm';

import type { TaskSubscriptionItem } from '../schemas/workAttention';
import { taskSubscriptions } from '../schemas/workAttention';
import type { OrviloDatabase } from '../type';

export class TaskSubscriptionModel {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly workspaceId?: string,
  ) {}

  /**
   * The user's own subscribe/unsubscribe ride on the bound userId; the
   * `*ForUser` variants are for the issue-level subscribers manager, which
   * any workspace member may run on anyone's row.
   */
  subscribe = async (taskId: string, reason = 'manual'): Promise<TaskSubscriptionItem> =>
    this.subscribeForUser(taskId, this.userId, reason);

  subscribeForUser = async (
    taskId: string,
    userId: string,
    reason = 'manual',
  ): Promise<TaskSubscriptionItem> => {
    const [row] = await this.db
      .insert(taskSubscriptions)
      .values({
        reason,
        taskId,
        userId,
        workspaceId: this.workspaceId ?? null,
      })
      .onConflictDoUpdate({
        set: { unsubscribedAt: null, updatedAt: new Date() },
        target: [taskSubscriptions.taskId, taskSubscriptions.userId],
      })
      .returning();
    return row;
  };

  unsubscribe = async (taskId: string): Promise<boolean> =>
    this.unsubscribeForUser(taskId, this.userId);

  unsubscribeForUser = async (taskId: string, userId: string): Promise<boolean> => {
    const updated = await this.db
      .update(taskSubscriptions)
      .set({ unsubscribedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(taskSubscriptions.taskId, taskId),
          eq(taskSubscriptions.userId, userId),
          isNull(taskSubscriptions.unsubscribedAt),
        ),
      )
      .returning({ id: taskSubscriptions.id });
    return updated.length > 0;
  };

  /** Everyone currently subscribed to one task — the issue's subscribers row. */
  listByTask = async (taskId: string): Promise<TaskSubscriptionItem[]> =>
    this.db
      .select()
      .from(taskSubscriptions)
      .where(and(eq(taskSubscriptions.taskId, taskId), isNull(taskSubscriptions.unsubscribedAt)));

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
