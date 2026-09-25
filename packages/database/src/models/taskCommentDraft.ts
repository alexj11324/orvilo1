import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

import { type TaskCommentDraftItem, taskCommentDrafts } from '../schemas/taskCommentDraft';
import type { OrviloDatabase } from '../type';
import { TaskModel } from './task';

export type VisibleTaskCommentDraft = TaskCommentDraftItem & {
  taskIdentifier: string;
  taskName: string | null;
};

/** An actor's unsent comments in one workspace, filtered by current task access. */
export class TaskCommentDraftModel {
  private readonly taskModel: TaskModel;

  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly workspaceId?: string,
  ) {
    this.taskModel = new TaskModel(db, userId, workspaceId);
  }

  private authoredScope() {
    return eq(taskCommentDrafts.userId, this.userId);
  }

  private storedScope() {
    return and(
      this.authoredScope(),
      this.workspaceId
        ? eq(taskCommentDrafts.workspaceId, this.workspaceId)
        : isNull(taskCommentDrafts.workspaceId),
    );
  }

  private async resolveTask(idOrIdentifier: string) {
    // `resolveMany` checks both forms regardless of ID prefix. Imported tasks
    // can have IDs such as `taskparity0001` that do not start with `task_`.
    const matches = await this.taskModel.resolveMany([idOrIdentifier]);
    return (
      matches.find((task) => task.id === idOrIdentifier) ??
      matches.find((task) => task.workspaceId === this.workspaceId) ??
      matches[0] ??
      null
    );
  }

  async list(): Promise<VisibleTaskCommentDraft[]> {
    const rows = await this.db
      .select()
      .from(taskCommentDrafts)
      .where(this.authoredScope())
      .orderBy(desc(taskCommentDrafts.updatedAt));
    if (rows.length === 0) return [];

    // TaskModel applies visibility, team membership, and current workspace rules.
    // The task's current access, not the workspace captured when the draft was
    // saved, decides which workspace lists it after a move.
    const visibleTasks = await this.taskModel.findByIds(rows.map((row) => row.taskId));
    const byId = new Map(visibleTasks.map((task) => [task.id, task]));
    return rows.flatMap((row) => {
      const task = byId.get(row.taskId);
      return task ? [{ ...row, taskIdentifier: task.identifier, taskName: task.name }] : [];
    });
  }

  async count(): Promise<number> {
    return (await this.list()).length;
  }

  async get(taskId: string): Promise<VisibleTaskCommentDraft | null> {
    const task = await this.resolveTask(taskId);
    if (!task) return null;
    const [row] = await this.db
      .select()
      .from(taskCommentDrafts)
      .where(and(eq(taskCommentDrafts.taskId, task.id), this.authoredScope()))
      .limit(1);
    return row ? { ...row, taskIdentifier: task.identifier, taskName: task.name } : null;
  }

  async upsert(
    taskId: string,
    content: string,
    editorData?: unknown,
  ): Promise<VisibleTaskCommentDraft | null> {
    const task = await this.resolveTask(taskId);
    if (!task) return null;
    const [row] = await this.db
      .insert(taskCommentDrafts)
      .values({
        content,
        editorData: editorData ?? null,
        taskId: task.id,
        userId: this.userId,
        workspaceId: this.workspaceId ?? null,
      })
      .onConflictDoUpdate({
        target: [taskCommentDrafts.taskId, taskCommentDrafts.userId],
        // A task can move workspaces. The new authorized edit moves this
        // actor's one draft into the task's current workspace as well.
        set: {
          content,
          editorData: editorData ?? null,
          updatedAt: new Date(),
          workspaceId: this.workspaceId ?? null,
        },
      })
      .returning();
    return row ? { ...row, taskIdentifier: task.identifier, taskName: task.name } : null;
  }

  async delete(taskId: string): Promise<boolean> {
    const task = await this.resolveTask(taskId);
    // Own inaccessible drafts remain deletable when the caller still holds
    // their canonical ID; public identifiers require current task access.
    const canonicalId = task?.id ?? taskId;
    const deleted = await this.db
      .delete(taskCommentDrafts)
      .where(
        and(
          eq(taskCommentDrafts.taskId, canonicalId),
          task ? this.authoredScope() : this.storedScope(),
        ),
      )
      .returning({ id: taskCommentDrafts.id });
    return deleted.length > 0;
  }

  async deleteAll(): Promise<number> {
    const visible = await this.list();
    if (visible.length === 0) return 0;
    const deleted = await this.db
      .delete(taskCommentDrafts)
      .where(
        and(
          this.authoredScope(),
          inArray(
            taskCommentDrafts.id,
            visible.map((row) => row.id),
          ),
        ),
      )
      .returning({ id: taskCommentDrafts.id });
    return deleted.length;
  }
}
