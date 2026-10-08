import { eq } from 'drizzle-orm';

import { TaskModel } from '@/database/models/task';
import { claimDueIssueRecurrences } from '@/database/models/taskIssueRecurrence';
import { taskIssueRecurrences } from '@/database/schemas/taskIssueRecurrence';
import { getServerDB } from '@/database/server';
import type { OrviloDatabase } from '@/database/type';

import { TaskIssueDefinitionService } from '../taskIssueDefinition';
import { hasWorkspaceScopedPermission } from '../workspacePermission';
import { issueRecurrenceCreationAt, nextIssueRecurrenceDue } from './dates';

/** Creates only fresh inactive issues. The existing minute schedulers invoke this same handler. */
export const runTaskIssueRecurrenceSweep = async (
  options: { db?: OrviloDatabase; now?: Date } = {},
) => {
  const db = options.db ?? (await getServerDB());
  const now = options.now ?? new Date();
  let created = 0;
  let skipped = 0;
  let failed = 0;
  const claimed = await db.transaction(async (tx) => {
    const executor = tx as OrviloDatabase;
    const rows = await claimDueIssueRecurrences(executor, now);
    for (const row of rows) {
      try {
        await tx.transaction(async (rowTx) => {
          const db = rowTx as OrviloDatabase;
          const workspaceId = row.workspaceId ?? undefined;
          const source = await new TaskModel(db, row.userId, workspaceId).findById(
            row.sourceTaskId,
          );
          const permitted =
            !row.workspaceId ||
            (await hasWorkspaceScopedPermission({
              action: 'AGENT_UPDATE',
              db,
              userId: row.userId,
              workspaceId: row.workspaceId,
            }));
          if (!source || source.isDeleted || !permitted) {
            await db
              .update(taskIssueRecurrences)
              .set({
                enabled: false,
                lastError: 'Source issue or creation permission is unavailable',
                updatedAt: new Date(),
              })
              .where(eq(taskIssueRecurrences.id, row.id));
            skipped += 1;
            return;
          }
          const dueDate = nextIssueRecurrenceDue({
            firstDueDate: row.firstDueDate,
            currentDueDate: row.nextDueDate,
            cadence: row.cadence,
            interval: row.interval,
            timezone: row.timezone,
            now,
          });
          const task = await new TaskIssueDefinitionService(
            db,
            row.userId,
            workspaceId,
          ).createFromDefinition(row.definition, { dueDate, visibility: row.visibility });
          await db
            .update(taskIssueRecurrences)
            .set({
              lastError: null,
              lastOccurrenceAt: row.nextOccurrenceAt,
              lastTaskId: task.id,
              nextDueDate: dueDate,
              nextOccurrenceAt: issueRecurrenceCreationAt(dueDate, row.timezone),
              updatedAt: new Date(),
            })
            .where(eq(taskIssueRecurrences.id, row.id));
          created += 1;
        });
      } catch (error) {
        console.error('[task-issue-recurrence] creation failed', error);
        await executor
          .update(taskIssueRecurrences)
          .set({
            enabled: false,
            lastError: 'Issue creation failed. Edit or resume this recurrence to try again.',
            updatedAt: new Date(),
          })
          .where(eq(taskIssueRecurrences.id, row.id));
        failed += 1;
      }
    }
    return rows.length;
  });
  return { claimed, created, failed, skipped };
};
