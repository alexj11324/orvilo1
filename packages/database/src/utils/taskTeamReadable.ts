import { and, eq, exists, isNull, or, type SQL, sql } from 'drizzle-orm';

import { tasks } from '../schemas/task';
import { teamMembers, teams } from '../schemas/team';
import { workspaceMembers, workspaces } from '../schemas/workspace';
import type { OrviloDatabase } from '../type';

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
  target: typeof tasks = tasks,
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
