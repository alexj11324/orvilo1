import { and, eq, isNull } from 'drizzle-orm';

import type { TaskSubscriptionItem } from '../schemas/workAttention';
import { taskSubscriptions } from '../schemas/workAttention';
import type { OrviloDatabase } from '../type';

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
}
