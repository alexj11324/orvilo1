import { notificationScopeKey } from '@orvilo/types';
import { and, eq, sql } from 'drizzle-orm';

import { notificationFeedState } from '../schemas/workAttention';
import type { OrviloDatabase, Transaction } from '../type';

/** Allocate the next feed revision for one user/scope under a row lock. */
export const allocateFeedRevision = async (
  executor: Transaction | OrviloDatabase,
  params: { userId: string; workspaceId?: string | null },
): Promise<number> => {
  const scopeKey = notificationScopeKey(params.workspaceId);
  const [row] = await executor
    .insert(notificationFeedState)
    .values({ revision: 1, scopeKey, userId: params.userId })
    .onConflictDoUpdate({
      set: { revision: sql`${notificationFeedState.revision} + 1` },
      target: [notificationFeedState.userId, notificationFeedState.scopeKey],
    })
    .returning({ revision: notificationFeedState.revision });
  return row.revision;
};

export const currentFeedRevision = async (
  db: OrviloDatabase,
  params: { userId: string; workspaceId?: string | null },
): Promise<number> => {
  const scopeKey = notificationScopeKey(params.workspaceId);
  const [row] = await db
    .select({ revision: notificationFeedState.revision })
    .from(notificationFeedState)
    .where(
      and(
        eq(notificationFeedState.userId, params.userId),
        eq(notificationFeedState.scopeKey, scopeKey),
      ),
    )
    .limit(1);
  return row?.revision ?? 0;
};
