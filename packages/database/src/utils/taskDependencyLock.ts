import { sql } from 'drizzle-orm';

import type { OrviloDatabase } from '../type';

/** Shared graph-before-row lock order for task mutations and issue conversion commands. */
export const lockTaskDependencyGraph = async (
  db: OrviloDatabase,
  userId: string,
  workspaceId?: string,
) => {
  const scope = workspaceId ? `workspace:${workspaceId}` : `user:${userId}`;
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtext('task-prerequisites'), hashtext(${scope}))`,
  );
};
