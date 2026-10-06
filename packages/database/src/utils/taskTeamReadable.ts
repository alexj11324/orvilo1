import { and, eq, exists, isNull, or, type SQL, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { tasks } from '../schemas/task';
import { teamMembers, teams } from '../schemas/team';
import { workspaceMembers, workspaces } from '../schemas/workspace';
import type { OrviloDatabase } from '../type';
import { buildWorkspaceWhere } from './workspace';

type TaskReadColumns = {
  assigneeUserId: AnyPgColumn;
  createdByUserId: AnyPgColumn;
  reviewerUserId: AnyPgColumn;
  teamId: AnyPgColumn;
  workspaceId: AnyPgColumn;
};

/** Workspace tasks are shared work; team membership remains an independent ACL. */
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

/**
 * Private-team tasks stay readable only when the viewer can still see the
 * team, administer the workspace, or personally own the work (assignee /
 * reviewer / creator). Matches Inbox `resourceReadable` (TRI05 / SEC06).
 *
 * `target` defaults to the tasks table; pass a `alias(tasks, …)` table to
 * apply the same predicate to a joined/aliased task row (e.g. the downstream
 * task inside an EXISTS leg).
 */
export const buildTaskTeamReadableWhere = (
  db: OrviloDatabase,
  userId: string,
  target: TaskReadColumns = tasks,
): SQL =>
  or(
    isNull(target.teamId),
    exists(
      db
        .select({ one: sql`1` })
        .from(teams)
        .where(and(eq(teams.id, target.teamId), eq(teams.visibility, 'public'))),
    ),
    exists(
      db
        .select({ one: sql`1` })
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, target.teamId), eq(teamMembers.userId, userId))),
    ),
    exists(
      db
        .select({ one: sql`1` })
        .from(workspaceMembers)
        .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
        .where(
          and(
            eq(workspaceMembers.workspaceId, target.workspaceId),
            eq(workspaceMembers.userId, userId),
            isNull(workspaceMembers.deletedAt),
            isNull(workspaceMembers.suspendedAt),
            or(
              eq(workspaceMembers.role, 'admin'),
              and(eq(workspaceMembers.role, 'owner'), eq(workspaces.primaryOwnerId, userId)),
            ),
          ),
        ),
    ),
    eq(target.assigneeUserId, userId),
    eq(target.reviewerUserId, userId),
    eq(target.createdByUserId, userId),
  )!;
