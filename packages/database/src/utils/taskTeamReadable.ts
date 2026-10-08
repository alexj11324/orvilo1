import { and, eq, exists, isNull, or, type SQL, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { tasks } from '../schemas/task';
import { workspaceMembers } from '../schemas/workspace';
import type { OrviloDatabase } from '../type';
import { buildWorkspaceWhere } from './workspace';

type TaskReadColumns = {
  assigneeUserId: AnyPgColumn;
  createdByUserId: AnyPgColumn;
  reviewerUserId: AnyPgColumn;
  teamId: AnyPgColumn;
  workspaceId: AnyPgColumn;
};

/** Workspace Issues are shared work; active workspace membership is required. */
export const buildTaskReadableWhere = (
  db: OrviloDatabase,
  ctx: { userId: string; workspaceId?: string },
  target: TaskReadColumns = tasks,
): SQL => {
  const scope = buildWorkspaceWhere(ctx, {
    userId: target.createdByUserId,
    workspaceId: target.workspaceId,
  });
  return ctx.workspaceId ? and(scope, buildTaskTeamReadableWhere(db, ctx.userId, target))! : scope;
};

/** Interpret legacy private flags without rewriting historical rows or execution topics. */
export const taskVisibilitySql = (
  target: { visibility: AnyPgColumn; workspaceId: AnyPgColumn } = tasks,
) =>
  sql<
    'private' | 'public'
  >`case when ${target.workspaceId} is not null then 'public' else ${target.visibility} end`;

/** Issue dialogue is workspace-shared independently of Team resource ACL. */
export const buildTaskTeamReadableWhere = (
  db: OrviloDatabase,
  userId: string,
  target: TaskReadColumns = tasks,
): SQL =>
  or(
    and(isNull(target.workspaceId), eq(target.createdByUserId, userId)),
    exists(
      db
        .select({ one: sql`1` })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, target.workspaceId),
            eq(workspaceMembers.userId, userId),
            isNull(workspaceMembers.deletedAt),
            isNull(workspaceMembers.suspendedAt),
          ),
        ),
    ),
  )!;
