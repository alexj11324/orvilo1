import { and, eq, exists, isNull, or, type SQL, sql } from 'drizzle-orm';

import { tasks } from '../schemas/task';
import { teamMembers, teams } from '../schemas/team';
import { workspaceMembers, workspaces } from '../schemas/workspace';
import type { OrviloDatabase } from '../type';

/**
 * Private-team tasks stay readable only when the viewer can still see the
 * team, administer the workspace, or personally own the work (assignee /
 * reviewer / creator). Matches Inbox `resourceReadable` (TRI05 / SEC06).
 */
export const buildTaskTeamReadableWhere = (db: OrviloDatabase, userId: string): SQL =>
  or(
    isNull(tasks.teamId),
    exists(
      db
        .select({ one: sql`1` })
        .from(teams)
        .where(and(eq(teams.id, tasks.teamId), eq(teams.visibility, 'public'))),
    ),
    exists(
      db
        .select({ one: sql`1` })
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, tasks.teamId), eq(teamMembers.userId, userId))),
    ),
    exists(
      db
        .select({ one: sql`1` })
        .from(workspaceMembers)
        .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
        .where(
          and(
            eq(workspaceMembers.workspaceId, tasks.workspaceId),
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
    eq(tasks.assigneeUserId, userId),
    eq(tasks.reviewerUserId, userId),
    eq(tasks.createdByUserId, userId),
  )!;
