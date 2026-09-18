import type { NavigationFavoriteTargetType } from '@orvilo/types';
import { notificationScopeKey } from '@orvilo/types';
import { and, asc, eq, sql } from 'drizzle-orm';

import type { NavigationFavoriteItem } from '../schemas/workAttention';
import { navigationFavorites } from '../schemas/workAttention';
import type { OrviloDatabase } from '../type';
import { SavedViewModel } from './savedView';

export class NavigationFavoriteConflictError extends Error {
  readonly code = 'FAVORITE_REVISION_CONFLICT' as const;

  constructor() {
    super('FAVORITE_REVISION_CONFLICT');
    this.name = 'NavigationFavoriteConflictError';
  }
}

export class NavigationFavoriteModel {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly workspaceId?: string | null,
  ) {}

  private scopeKey = () => notificationScopeKey(this.workspaceId);

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

    const viewIds = rows.filter((row) => row.targetType === 'savedView').map((row) => row.targetId);
    if (viewIds.length === 0) return rows.map((row) => ({ ...row, title: null }));

    const readable = new Map(
      (await new SavedViewModel(this.db, this.userId, this.workspaceId ?? undefined).list()).map(
        (view) => [view.id, view.name],
      ),
    );
    return rows.map((row) => ({
      ...row,
      title: row.targetType === 'savedView' ? (readable.get(row.targetId) ?? null) : null,
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
