import type { TaskIssueRecurrenceCadence, TaskIssueTemplateDefinition } from '@orvilo/types';
import { and, eq, lte } from 'drizzle-orm';

import { taskIssueRecurrences } from '../schemas/taskIssueRecurrence';
import type { OrviloDatabase } from '../type';
import { buildWorkspaceWhere } from '../utils/workspace';
import { TaskModel } from './task';

export class TaskIssueRecurrenceModel {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly workspaceId?: string,
  ) {}

  private ownership() {
    return buildWorkspaceWhere(
      { userId: this.userId, workspaceId: this.workspaceId },
      taskIssueRecurrences,
    );
  }
  private async source(taskId: string) {
    const task = await new TaskModel(this.db, this.userId, this.workspaceId).resolve(taskId);
    if (!task || task.isDeleted || task.workspaceId !== (this.workspaceId ?? null))
      throw new Error('Task not found');
    return task;
  }

  async findForTask(taskId: string) {
    const task = await this.source(taskId);
    const [row] = await this.db
      .select()
      .from(taskIssueRecurrences)
      .where(and(eq(taskIssueRecurrences.sourceTaskId, task.id), this.ownership()))
      .limit(1);
    return row ?? null;
  }

  async set(
    taskId: string,
    input: {
      definition: TaskIssueTemplateDefinition;
      firstDueDate: string;
      cadence: TaskIssueRecurrenceCadence;
      interval: number;
      timezone: string;
      nextOccurrenceAt: Date;
    },
  ) {
    await new TaskModel(this.db, this.userId, this.workspaceId).assertWorkspaceAccess(true);
    const task = await this.source(taskId);
    const [row] = await this.db
      .insert(taskIssueRecurrences)
      .values({
        ...input,
        enabled: true,
        nextDueDate: input.firstDueDate,
        sourceTaskId: task.id,
        userId: this.userId,
        visibility: task.visibility,
        workspaceId: task.workspaceId,
      })
      .onConflictDoUpdate({
        target: taskIssueRecurrences.sourceTaskId,
        set: {
          ...input,
          enabled: true,
          lastError: null,
          nextDueDate: input.firstDueDate,
          updatedAt: new Date(),
          userId: this.userId,
          visibility: task.visibility,
        },
        setWhere: this.ownership(),
      })
      .returning();
    if (!row) throw new Error('Recurring issue not found');
    return row;
  }

  async setEnabled(taskId: string, enabled: boolean) {
    await new TaskModel(this.db, this.userId, this.workspaceId).assertWorkspaceAccess(true);
    const task = await this.source(taskId);
    const [row] = await this.db
      .update(taskIssueRecurrences)
      .set({ enabled, lastError: null, updatedAt: new Date() })
      .where(and(eq(taskIssueRecurrences.sourceTaskId, task.id), this.ownership()))
      .returning();
    if (!row) throw new Error('Recurring issue not found');
    return row;
  }

  async remove(taskId: string) {
    await new TaskModel(this.db, this.userId, this.workspaceId).assertWorkspaceAccess(true);
    const task = await this.source(taskId);
    const rows = await this.db
      .delete(taskIssueRecurrences)
      .where(and(eq(taskIssueRecurrences.sourceTaskId, task.id), this.ownership()))
      .returning({ id: taskIssueRecurrences.id });
    return rows.length > 0;
  }
}

/** Durable due-row claim shared by the existing local minute loop and Hatchet minute job. */
export const claimDueIssueRecurrences = (db: OrviloDatabase, now: Date) =>
  db
    .select()
    .from(taskIssueRecurrences)
    .where(
      and(eq(taskIssueRecurrences.enabled, true), lte(taskIssueRecurrences.nextOccurrenceAt, now)),
    )
    .orderBy(taskIssueRecurrences.nextOccurrenceAt, taskIssueRecurrences.id)
    .limit(100)
    .for('update', { skipLocked: true });
