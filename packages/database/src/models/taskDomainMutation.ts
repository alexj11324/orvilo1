import type { TaskDomainEventType, TaskItem } from '@orvilo/types';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { tasks } from '../schemas/task';
import type { OrviloDatabase } from '../type';
import { LinearSyncModel } from './linearSync';

/**
 * Finish a system-owned bulk task mutation inside the caller's transaction.
 *
 * A few ownership and membership workflows must update several tasks while
 * they hold their own enclosing locks. They cannot call TaskModel.update()
 * because that would open a nested transaction, but they still owe the same
 * domain-event, planner-wakeup, and Linear-outbox guarantees as an ordinary
 * task command.
 */
export const recordBulkTaskMutation = async (
  db: OrviloDatabase,
  taskRows: TaskItem[],
  input: {
    changedFields: string[];
    eventType: TaskDomainEventType;
    idempotencyKeyPrefix: string;
  },
) => {
  for (const task of taskRows) {
    if (!task.workspaceId) continue;

    await new LinearSyncModel(db, task.workspaceId).recordTaskChangeInTransaction(db, {
      changedFields: input.changedFields,
      eventType: input.eventType,
      idempotencyKey: `${input.idempotencyKeyPrefix}:${task.id}:${task.domainRevision}`,
      source: 'system',
      task,
    });
  }
};

/** Detach a departing member from human Issue assignments. */
export const detachMemberFromTasks = async (
  db: OrviloDatabase,
  input: { idempotencyKeyPrefix: string; userId: string; workspaceId: string },
) => {
  const held = await db
    .select({
      assigneeUserId: tasks.assigneeUserId,
      id: tasks.id,
    })
    .from(tasks)
    .where(and(eq(tasks.workspaceId, input.workspaceId), eq(tasks.assigneeUserId, input.userId)));
  if (held.length === 0) return;

  const beforeById = new Map(held.map((row) => [row.id, row]));

  const detached = await db
    .update(tasks)
    .set({
      assigneeUserId: sql`CASE WHEN ${tasks.assigneeUserId} = ${input.userId} THEN NULL ELSE ${tasks.assigneeUserId} END`,
      domainRevision: sql`${tasks.domainRevision} + 1`,
      policyRevision: sql`${tasks.policyRevision} + 1`,
      updatedAt: new Date(),
    })
    .where(
      inArray(
        tasks.id,
        held.map((row) => row.id),
      ),
    )
    .returning();

  for (const task of detached) {
    if (!task.workspaceId) continue;
    const prior = beforeById.get(task.id);
    const changedFields: string[] = [];
    if (prior?.assigneeUserId === input.userId) changedFields.push('assigneeUserId');
    if (changedFields.length === 0) continue;

    await new LinearSyncModel(db, task.workspaceId).recordTaskChangeInTransaction(db, {
      changedFields,
      eventType: 'task.assigned',
      idempotencyKey: `${input.idempotencyKeyPrefix}:${task.id}:${task.domainRevision}`,
      source: 'system',
      task,
    });
  }
};
