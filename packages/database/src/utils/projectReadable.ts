import { and, eq, exists, isNull, or, type SQL, sql } from 'drizzle-orm';

import { projects } from '../schemas/project';
import { projectMembers } from '../schemas/projectMember';
import type { OrviloDatabase } from '../type';
import { buildWorkspaceWhere } from './workspace';

/**
 * Same read ACL as `ProjectModel.readable`: workspace public / own private
 * rows, plus an ACTIVE `project_members` grant on a private project.
 */
export const buildProjectReadableWhere = (
  db: OrviloDatabase,
  ctx: { userId: string; workspaceId?: string },
): SQL => {
  const base = buildWorkspaceWhere({ userId: ctx.userId, workspaceId: ctx.workspaceId }, projects);
  if (!ctx.workspaceId) return base;

  const grantedRead = exists(
    db
      .select({ one: sql`1` })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projects.id),
          eq(projectMembers.userId, ctx.userId),
          isNull(projectMembers.deletedAt),
          isNull(projectMembers.suspendedAt),
        ),
      ),
  );
  return or(base, and(eq(projects.workspaceId, ctx.workspaceId), grantedRead)) as SQL;
};
