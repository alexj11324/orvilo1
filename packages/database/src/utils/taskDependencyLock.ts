import { sql } from 'drizzle-orm';

import type { OrviloDatabase } from '../type';

/** The lock scope a request writes in: its workspace, or the caller's personal space. */
export const taskDependencyRequestScope = (userId: string, workspaceId?: string | null): string =>
  workspaceId ? `workspace:${workspaceId}` : `user:${userId}`;

/**
 * The lock scope a task row itself lives in. A caller's unfiled rows
 * (`workspace_id IS NULL`) are writable from personal mode and from every
 * workspace the caller belongs to, so the request's scope alone does not name
 * them: two requests in different contexts would take different locks for the
 * same rows.
 */
export const taskDependencyRowScope = (row: {
  createdByUserId?: string | null;
  workspaceId?: string | null;
}): string | null =>
  row.workspaceId
    ? `workspace:${row.workspaceId}`
    : row.createdByUserId
      ? `user:${row.createdByUserId}`
      : null;

/**
 * Every scope a tree write must hold: the request's own (what every other
 * graph writer takes) plus the scope of each row it links. Sorted and
 * de-duplicated so any two writers acquire shared scopes in the same order.
 */
export const taskDependencyLockScopes = (
  requestScope: string,
  rows: { createdByUserId?: string | null; workspaceId?: string | null }[],
): string[] =>
  [
    ...new Set([
      requestScope,
      ...rows.flatMap((row) => {
        const scope = taskDependencyRowScope(row);
        return scope ? [scope] : [];
      }),
    ]),
  ].sort();

const lockScope = (db: Pick<OrviloDatabase, 'execute'>, scope: string) =>
  db.execute(sql`select pg_advisory_xact_lock(hashtext('task-prerequisites'), hashtext(${scope}))`);

/** Shared graph-before-row lock order for task mutations and issue conversion commands. */
export const lockTaskDependencyGraph = async (
  db: OrviloDatabase,
  userId: string,
  workspaceId?: string,
) => {
  await lockScope(db, taskDependencyRequestScope(userId, workspaceId));
};

/**
 * Take the graph lock for a write that links specific rows — see
 * `taskDependencyLockScopes`. Must run inside the transaction that validates
 * and writes; the locks release when it ends.
 */
export const lockTaskDependencyGraphForRows = async (
  db: Pick<OrviloDatabase, 'execute'>,
  request: { userId: string; workspaceId?: string | null },
  rows: { createdByUserId?: string | null; workspaceId?: string | null }[],
): Promise<string[]> => {
  const scopes = taskDependencyLockScopes(
    taskDependencyRequestScope(request.userId, request.workspaceId),
    rows,
  );
  for (const scope of scopes) await lockScope(db, scope);
  return scopes;
};
