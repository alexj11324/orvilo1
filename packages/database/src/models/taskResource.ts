import type { TaskResourceKind } from '@orvilo/types';
import { and, asc, eq } from 'drizzle-orm';

import { taskResources } from '../schemas/taskResource';
import type { OrviloDatabase } from '../type';
import { TaskModel } from './task';

export class TaskResourceModel {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly workspaceId?: string,
  ) {}

  private async resolve(taskId: string) {
    const task = await new TaskModel(this.db, this.userId, this.workspaceId).resolve(taskId);
    if (!task || task.isDeleted) throw new Error('Task not found');
    return task;
  }

  async list(taskId: string) {
    const task = await this.resolve(taskId);
    return this.db
      .select()
      .from(taskResources)
      .where(eq(taskResources.taskId, task.id))
      .orderBy(asc(taskResources.createdAt));
  }

  async add(taskId: string, input: { kind: TaskResourceKind; title?: string; url: string }) {
    await new TaskModel(this.db, this.userId, this.workspaceId).assertWorkspaceAccess(true);
    const task = await this.resolve(taskId);
    const url = new URL(input.url);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      input.url.length > 2048
    ) {
      throw new Error('Use an HTTP or HTTPS URL without embedded credentials');
    }
    if (
      input.kind === 'pull_request' &&
      (url.hostname !== 'github.com' || !/^\/[^/]+\/[^/]+\/pull\/[1-9]\d*\/?$/.test(url.pathname))
    ) {
      throw new Error('Use a GitHub pull request URL');
    }
    const normalizedUrl = url.href;
    const [row] = await this.db
      .insert(taskResources)
      .values({
        addedByUserId: this.userId,
        kind: input.kind,
        taskId: task.id,
        title: input.title?.trim() || normalizedUrl,
        url: normalizedUrl,
      })
      .onConflictDoUpdate({
        target: [taskResources.taskId, taskResources.kind, taskResources.url],
        set: { title: input.title?.trim() || normalizedUrl, updatedAt: new Date() },
      })
      .returning();
    return row;
  }

  async remove(taskId: string, resourceId: string) {
    await new TaskModel(this.db, this.userId, this.workspaceId).assertWorkspaceAccess(true);
    const task = await this.resolve(taskId);
    const rows = await this.db
      .delete(taskResources)
      .where(and(eq(taskResources.taskId, task.id), eq(taskResources.id, resourceId)))
      .returning({ id: taskResources.id });
    return rows.length > 0;
  }
}
