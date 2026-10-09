import { and, desc, eq, lt } from 'drizzle-orm';

import { taskDescriptionHistories } from '../schemas/taskDescriptionHistory';
import type { OrviloDatabase } from '../type';
import { buildWorkspaceWhere } from '../utils/workspace';
import { TaskModel, TaskRevisionConflictError } from './task';

export class TaskDescriptionHistoryModel {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly workspaceId?: string,
  ) {}

  private ownership() {
    return buildWorkspaceWhere(
      { userId: this.userId, workspaceId: this.workspaceId },
      taskDescriptionHistories,
    );
  }

  async list(taskId: string, options: { beforeRevision?: number; limit?: number } = {}) {
    const model = new TaskModel(this.db, this.userId, this.workspaceId);
    await model.assertWorkspaceAccess();
    const task = await model.resolve(taskId);
    if (!task || task.isDeleted) throw new Error('Task not found');
    const versions = await this.db
      .select()
      .from(taskDescriptionHistories)
      .where(
        and(
          eq(taskDescriptionHistories.taskId, task.id),
          this.ownership(),
          options.beforeRevision === undefined
            ? undefined
            : lt(taskDescriptionHistories.domainRevision, options.beforeRevision),
        ),
      )
      .orderBy(desc(taskDescriptionHistories.domainRevision))
      .limit(Math.min(100, Math.max(1, options.limit ?? 50)));
    return {
      current: {
        domainRevision: task.domainRevision,
        editorData: task.editorData,
        instruction: task.instruction,
        updatedAt: task.updatedAt,
      },
      versions,
    };
  }

  async restore(taskId: string, historyId: string, expectedDomainRevision: number) {
    const taskModel = new TaskModel(this.db, this.userId, this.workspaceId);
    await taskModel.assertWorkspaceAccess(true);
    const task = await taskModel.resolve(taskId);
    if (!task || task.isDeleted) throw new Error('Task not found');
    const [version] = await this.db
      .select()
      .from(taskDescriptionHistories)
      .where(
        and(
          eq(taskDescriptionHistories.id, historyId),
          eq(taskDescriptionHistories.taskId, task.id),
          this.ownership(),
        ),
      )
      .limit(1);
    if (!version) throw new Error('Description version not found');
    if (task.domainRevision !== expectedDomainRevision) throw new TaskRevisionConflictError();
    if (
      version.instruction === task.instruction &&
      JSON.stringify(version.editorData) === JSON.stringify(task.editorData)
    ) {
      throw new Error('This is the current description version');
    }
    return taskModel.update(
      task.id,
      { editorData: version.editorData, instruction: version.instruction },
      { expectedDomainRevision, source: 'user' },
    );
  }
}
