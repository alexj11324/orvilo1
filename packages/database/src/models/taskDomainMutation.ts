import type { TaskDomainEventType, TaskItem } from '@orvilo/types';

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
