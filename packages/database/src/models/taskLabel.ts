import type { TaskLabelSummary } from '@orvilo/types';
import { and, asc, eq, inArray } from 'drizzle-orm';

import type { TaskLabelItem } from '../schemas';
import { taskLabelBindings, taskLabels } from '../schemas';
import type { OrviloDatabase } from '../type';
import { buildWorkspacePayload, buildWorkspaceWhere } from '../utils/workspace';
import { TaskModel } from './task';

/** Slim the registry row to the wire shape used by detail payloads and row chips. */
export const toTaskLabelSummary = (label: TaskLabelItem): TaskLabelSummary => ({
  color: label.color,
  id: label.id,
  name: label.name,
});

export class TaskLabelModel {
  private userId: string;
  private db: OrviloDatabase;
  private workspaceId?: string;

  constructor(db: OrviloDatabase, userId: string, workspaceId?: string) {
    this.userId = userId;
    this.db = db;
    this.workspaceId = workspaceId;
  }

  // Labels are a workspace-level registry: every member sees and shares the
  // same label set (no per-member visibility). Personal mode falls back to
  // `user_id = ? AND workspace_id IS NULL`.
  private ownership = () =>
    buildWorkspaceWhere(
      { userId: this.userId, workspaceId: this.workspaceId },
      { userId: taskLabels.userId, workspaceId: taskLabels.workspaceId },
    );

  private bindingOwnership = () =>
    buildWorkspaceWhere(
      { userId: this.userId, workspaceId: this.workspaceId },
      { userId: taskLabelBindings.userId, workspaceId: taskLabelBindings.workspaceId },
    );

  list = async (): Promise<TaskLabelItem[]> => {
    return this.db.select().from(taskLabels).where(this.ownership()).orderBy(asc(taskLabels.name));
  };

  findById = async (id: string): Promise<TaskLabelItem | undefined> => {
    const [result] = await this.db
      .select()
      .from(taskLabels)
      .where(and(eq(taskLabels.id, id), this.ownership()))
      .limit(1);

    return result;
  };

  create = async (params: { color?: string | null; name: string }): Promise<TaskLabelItem> => {
    const [result] = await this.db
      .insert(taskLabels)
      .values(
        buildWorkspacePayload(
          { userId: this.userId, workspaceId: this.workspaceId },
          { color: params.color ?? null, name: params.name.trim() },
        ),
      )
      .returning();

    return result;
  };

  /**
   * Labels assigned to one task (scope-checked on the binding and the label).
   * The caller is expected to have resolved the task under the same scope
   * first — this answers "which labels does this task carry", not "can the
   * caller see this task".
   */
  listForTask = async (taskId: string): Promise<TaskLabelItem[]> => {
    const rows = await this.db
      .select({ label: taskLabels })
      .from(taskLabelBindings)
      .innerJoin(taskLabels, and(eq(taskLabels.id, taskLabelBindings.labelId), this.ownership()))
      .where(and(eq(taskLabelBindings.taskId, taskId), this.bindingOwnership()))
      .orderBy(asc(taskLabels.name));

    return rows.map((row) => row.label);
  };

  /**
   * Batched variant of {@link listForTask} for list/board hydration — one
   * `IN` query grouped by task id instead of a query per row.
   */
  listForTasks = async (taskIds: string[]): Promise<Map<string, TaskLabelItem[]>> => {
    const map = new Map<string, TaskLabelItem[]>();
    if (taskIds.length === 0) return map;

    const rows = await this.db
      .select({ label: taskLabels, taskId: taskLabelBindings.taskId })
      .from(taskLabelBindings)
      .innerJoin(taskLabels, and(eq(taskLabels.id, taskLabelBindings.labelId), this.ownership()))
      .where(and(inArray(taskLabelBindings.taskId, taskIds), this.bindingOwnership()))
      .orderBy(asc(taskLabels.name));

    for (const row of rows) {
      const list = map.get(row.taskId);
      if (list) {
        list.push(row.label);
      } else {
        map.set(row.taskId, [row.label]);
      }
    }

    return map;
  };

  /**
   * Apply a label to a task. Idempotent — a duplicate assignment is a no-op.
   * Accepts either the task id or its identifier (`TASK-1`), resolved under
   * the caller's task read scope so a binding can never be written onto a
   * task the caller cannot see.
   */
  assign = async (taskIdOrIdentifier: string, labelId: string): Promise<TaskLabelItem[]> => {
    const task = await this.resolveTask(taskIdOrIdentifier);
    await this.assertLabelInScope(labelId);

    await this.db
      .insert(taskLabelBindings)
      .values(
        buildWorkspacePayload(
          { userId: this.userId, workspaceId: this.workspaceId },
          { labelId, taskId: task.id },
        ),
      )
      .onConflictDoNothing();

    return this.listForTask(task.id);
  };

  /**
   * Remove a label from a task. Idempotent — unassigning a label the task
   * does not carry is a no-op.
   */
  unassign = async (taskIdOrIdentifier: string, labelId: string): Promise<TaskLabelItem[]> => {
    const task = await this.resolveTask(taskIdOrIdentifier);

    await this.db
      .delete(taskLabelBindings)
      .where(
        and(
          eq(taskLabelBindings.taskId, task.id),
          eq(taskLabelBindings.labelId, labelId),
          this.bindingOwnership(),
        ),
      );

    return this.listForTask(task.id);
  };

  private resolveTask = async (taskIdOrIdentifier: string) => {
    // TaskModel.resolve owns identifier-vs-id dispatch and applies the full
    // task read predicate (visibility-aware + team-readable), matching what
    // the task detail screen itself admits.
    const task = await new TaskModel(this.db, this.userId, this.workspaceId).resolve(
      taskIdOrIdentifier,
    );
    if (!task) throw new Error(`Task not found in current scope: ${taskIdOrIdentifier}`);
    return task;
  };

  private assertLabelInScope = async (labelId: string) => {
    const label = await this.findById(labelId);
    if (!label) throw new Error(`Task label not found in current scope: ${labelId}`);
  };
}
