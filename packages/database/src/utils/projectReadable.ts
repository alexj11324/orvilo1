import { and, eq, exists, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';

import { projects } from '../schemas/project';
import { projectMembers } from '../schemas/projectMember';
import { workspaceMembers } from '../schemas/workspace';
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
  return and(
    or(base, and(eq(projects.workspaceId, ctx.workspaceId), grantedRead)),
    or(
      isNull(projects.workspaceId),
      exists(
        db
          .select({ one: sql`1` })
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, projects.workspaceId),
              eq(workspaceMembers.userId, ctx.userId),
              isNull(workspaceMembers.deletedAt),
              isNull(workspaceMembers.suspendedAt),
            ),
          ),
      ),
    ),
  ) as SQL;
};

export const buildProjectCommentableWhere = (
  db: OrviloDatabase,
  ctx: { userId: string; workspaceId?: string },
) => {
  return and(
    buildProjectReadableWhere(db, ctx),
    or(
      isNull(projects.workspaceId),
      exists(
        db
          .select({ one: sql`1` })
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, projects.workspaceId),
              eq(workspaceMembers.userId, ctx.userId),
              inArray(workspaceMembers.role, ['owner', 'admin', 'member']),
              isNull(workspaceMembers.deletedAt),
              isNull(workspaceMembers.suspendedAt),
            ),
          ),
      ),
    ),
  );
};

export const buildProjectManageableWhere = (
  db: OrviloDatabase,
  ctx: { userId: string; workspaceId?: string },
) => {
  return and(
    buildProjectCommentableWhere(db, ctx),
    or(
      and(isNull(projects.workspaceId), eq(projects.userId, ctx.userId)),
      exists(
        db
          .select({ one: sql`1` })
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, projects.workspaceId),
              eq(workspaceMembers.userId, ctx.userId),
              inArray(workspaceMembers.role, ['owner', 'admin']),
              isNull(workspaceMembers.deletedAt),
              isNull(workspaceMembers.suspendedAt),
            ),
          ),
      ),
      exists(
        db
          .select({ one: sql`1` })
          .from(projectMembers)
          .where(
            and(
              eq(projectMembers.projectId, projects.id),
              eq(projectMembers.workspaceId, projects.workspaceId),
              eq(projectMembers.userId, ctx.userId),
              eq(projectMembers.role, 'manager'),
              isNull(projectMembers.deletedAt),
              isNull(projectMembers.suspendedAt),
            ),
          ),
      ),
    ),
  );
};
