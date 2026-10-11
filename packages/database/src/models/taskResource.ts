import type { TaskResourceKind } from '@orvilo/types';
import { and, asc, eq } from 'drizzle-orm';

import { taskResources } from '../schemas/taskResource';
import type { OrviloDatabase } from '../type';
import { taskActivityActor, TaskModel } from './task';

export class TaskResourceModel {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly workspaceId?: string,
  ) {}

  private async resolve(taskId: string, write = false) {
    const model = new TaskModel(this.db, this.userId, this.workspaceId);
    await model.assertWorkspaceAccess(write);
    const task = await model.resolve(taskId);
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
    const task = await this.resolve(taskId, true);
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
    const [existing] = await this.db
      .select({ id: taskResources.id })
      .from(taskResources)
      .where(
        and(
          eq(taskResources.taskId, task.id),
          eq(taskResources.kind, input.kind),
          eq(taskResources.url, normalizedUrl),
        ),
      )
      .limit(1);
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
    // Adding the same URL again only refreshes its title — nothing new was attached.
    if (!existing) await this.logResourceChange('resource_added', task.id, row);
    return row;
  }

  /**
   * Every caller of this model is the signed-in person acting on their own
   * request, so the row is theirs. Title and URL are copied in: once the
   * resource is removed there is nothing left to look them up from.
   */
  private async logResourceChange(
    type: 'resource_added' | 'resource_removed',
    taskId: string,
    resource: { kind: string; title: string | null; url: string },
  ) {
    const { actorKind, ...actorColumns } = taskActivityActor({ userId: this.userId });
    await new TaskModel(this.db, this.userId, this.workspaceId).addActivity({
      ...actorColumns,
      payload: {
        actorKind,
        resourceKind: resource.kind === 'pull_request' ? 'pull_request' : 'link',
        toLabel: resource.title,
        url: resource.url,
      },
      taskId,
      type,
    });
  }

  async remove(taskId: string, resourceId: string) {
    const task = await this.resolve(taskId, true);
    const rows = await this.db
      .delete(taskResources)
      .where(and(eq(taskResources.taskId, task.id), eq(taskResources.id, resourceId)))
      .returning({
        id: taskResources.id,
        kind: taskResources.kind,
        title: taskResources.title,
        url: taskResources.url,
      });
    for (const row of rows) await this.logResourceChange('resource_removed', task.id, row);
    return rows.length > 0;
  }
}
