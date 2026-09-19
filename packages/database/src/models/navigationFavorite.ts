import type { NavigationFavoriteTargetType } from '@orvilo/types';
import { notificationScopeKey } from '@orvilo/types';
import { and, asc, eq, sql } from 'drizzle-orm';

import type { NavigationFavoriteItem } from '../schemas/workAttention';
import { navigationFavorites } from '../schemas/workAttention';
import type { OrviloDatabase } from '../type';
import { ProjectModel } from './project';
import { SavedViewModel } from './savedView';
import { TaskModel } from './task';
import { TeamModel } from './team';

export class NavigationFavoriteConflictError extends Error {
  readonly code = 'FAVORITE_REVISION_CONFLICT' as const;

  constructor() {
    super('FAVORITE_REVISION_CONFLICT');
    this.name = 'NavigationFavoriteConflictError';
  }
}

const favoriteKey = (type: NavigationFavoriteTargetType, id: string) => `${type}:${id}`;

const taskTitle = (task: { instruction?: string | null; name?: string | null }) => {
  const name = task.name?.trim();
  if (name) return name;
  const instruction = task.instruction?.trim();
  return instruction || null;
};

export class NavigationFavoriteModel {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly workspaceId?: string | null,
  ) {}

  private scopeKey = () => notificationScopeKey(this.workspaceId);

  private resolveTitles = async (rows: NavigationFavoriteItem[]) => {
    const titles = new Map<string, string>();
    const idsFor = (type: NavigationFavoriteTargetType) =>
      rows.filter((row) => row.targetType === type).map((row) => row.targetId);

    const viewIds = idsFor('savedView');
    const taskIds = idsFor('task');
    const teamIds = idsFor('team');
    const projectIds = idsFor('project');
    const workspaceId = this.workspaceId ?? undefined;

    const [views, tasks, readableTeams, projects] = await Promise.all([
      viewIds.length > 0
        ? new SavedViewModel(this.db, this.userId, workspaceId).list()
        : Promise.resolve([]),
      taskIds.length > 0
        ? new TaskModel(this.db, this.userId, workspaceId).findByIds(taskIds)
        : Promise.resolve([]),
      teamIds.length > 0 && workspaceId
        ? new TeamModel(this.db, this.userId, workspaceId).listReadable()
        : Promise.resolve([]),
      projectIds.length > 0
        ? new ProjectModel(this.db, this.userId, workspaceId).findByIds(projectIds)
        : Promise.resolve([]),
    ]);

    const wantedViews = new Set(viewIds);
    for (const view of views) {
      if (wantedViews.has(view.id)) titles.set(favoriteKey('savedView', view.id), view.name);
    }
    for (const task of tasks) {
      const title = taskTitle(task);
      if (title) titles.set(favoriteKey('task', task.id), title);
    }
    const wantedTeams = new Set(teamIds);
    for (const team of readableTeams) {
      if (wantedTeams.has(team.id)) titles.set(favoriteKey('team', team.id), team.name);
    }
    for (const project of projects) {
      titles.set(favoriteKey('project', project.id), project.name);
    }
    return titles;
  };

  list = async (): Promise<Array<NavigationFavoriteItem & { title: string | null }>> => {
    const rows = await this.db
      .select()
      .from(navigationFavorites)
      .where(
        and(
          eq(navigationFavorites.userId, this.userId),
          eq(navigationFavorites.scopeKey, this.scopeKey()),
        ),
      )
      .orderBy(asc(navigationFavorites.rank), asc(navigationFavorites.createdAt));

    const titles = await this.resolveTitles(rows);
    return rows.map((row) => ({
      ...row,
      title: titles.get(favoriteKey(row.targetType, row.targetId)) ?? null,
    }));
  };

  pin = async (params: {
    rank?: number;
    targetId: string;
    targetType: NavigationFavoriteTargetType;
  }): Promise<NavigationFavoriteItem> => {
    const [row] = await this.db
      .insert(navigationFavorites)
      .values({
        rank: params.rank ?? 0,
        scopeKey: this.scopeKey(),
        targetId: params.targetId,
        targetType: params.targetType,
        userId: this.userId,
      })
      .onConflictDoUpdate({
        set: {
          rank: params.rank ?? sql`${navigationFavorites.rank}`,
          version: sql`${navigationFavorites.version} + 1`,
        },
        target: [
          navigationFavorites.userId,
          navigationFavorites.scopeKey,
          navigationFavorites.targetType,
          navigationFavorites.targetId,
        ],
      })
      .returning();
    return row;
  };

  unpin = async (params: {
    targetId: string;
    targetType: NavigationFavoriteTargetType;
  }): Promise<boolean> => {
    const deleted = await this.db
      .delete(navigationFavorites)
      .where(
        and(
          eq(navigationFavorites.userId, this.userId),
          eq(navigationFavorites.scopeKey, this.scopeKey()),
          eq(navigationFavorites.targetType, params.targetType),
          eq(navigationFavorites.targetId, params.targetId),
        ),
      )
      .returning({ id: navigationFavorites.id });
    return deleted.length > 0;
  };

  reorder = async (params: {
    items: Array<{
      expectedVersion: number;
      rank: number;
      targetId: string;
      targetType: NavigationFavoriteTargetType;
    }>;
  }): Promise<NavigationFavoriteItem[]> => {
    return this.db.transaction(async (tx) => {
      const rows: NavigationFavoriteItem[] = [];
      for (const item of params.items) {
        const [row] = await tx
          .update(navigationFavorites)
          .set({
            rank: item.rank,
            version: sql`${navigationFavorites.version} + 1`,
          })
          .where(
            and(
              eq(navigationFavorites.userId, this.userId),
              eq(navigationFavorites.scopeKey, this.scopeKey()),
              eq(navigationFavorites.targetType, item.targetType),
              eq(navigationFavorites.targetId, item.targetId),
              eq(navigationFavorites.version, item.expectedVersion),
            ),
          )
          .returning();
        if (!row) throw new NavigationFavoriteConflictError();
        rows.push(row);
      }
      return rows;
    });
  };
}
