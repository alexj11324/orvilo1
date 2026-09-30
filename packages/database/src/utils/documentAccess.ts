import { and, eq, exists, isNull, or, type SQL, sql } from 'drizzle-orm';

import { documents } from '../schemas/file';
import { teamMembers, teams } from '../schemas/team';
import { workspaceMembers } from '../schemas/workspace';
import type { OrviloDatabase } from '../type';
import { buildWorkspaceWhere } from './workspace';

export interface DocumentAccessContext {
  callerAgentVisibility?: 'private' | 'public' | null;
  userId: string;
  workspaceId?: string;
}

const teamAccess = (
  db: OrviloDatabase,
  context: DocumentAccessContext,
  mode: 'read' | 'write',
): SQL => {
  const activeWorkspaceMember = exists(
    db
      .select({ one: sql`1` })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, documents.workspaceId),
          eq(workspaceMembers.userId, context.userId),
          isNull(workspaceMembers.deletedAt),
          isNull(workspaceMembers.suspendedAt),
        ),
      ),
  );
  const admin = exists(
    db
      .select({ one: sql`1` })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, documents.workspaceId),
          eq(workspaceMembers.userId, context.userId),
          isNull(workspaceMembers.deletedAt),
          isNull(workspaceMembers.suspendedAt),
          or(eq(workspaceMembers.role, 'admin'), eq(workspaceMembers.role, 'owner')),
        ),
      ),
  );
  const member = exists(
    db
      .select({ one: sql`1` })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, documents.teamId),
          eq(teamMembers.workspaceId, documents.workspaceId),
          eq(teamMembers.userId, context.userId),
        ),
      ),
  );
  const teamReadable = exists(
    db
      .select({ one: sql`1` })
      .from(teams)
      .where(
        and(
          eq(teams.id, documents.teamId),
          eq(teams.workspaceId, documents.workspaceId),
          mode === 'read' ? or(eq(teams.visibility, 'public'), member, admin) : or(member, admin),
        ),
      ),
  );
  return and(
    eq(documents.workspaceId, context.workspaceId!),
    eq(documents.visibility, 'team'),
    activeWorkspaceMember,
    teamReadable,
  )!;
};

/** Team Pages are readable through their current team, never creator ownership alone. */
export const buildDocumentReadableWhere = (
  db: OrviloDatabase,
  context: DocumentAccessContext,
): SQL => {
  const ordinary = buildWorkspaceWhere(context, documents);
  if (!context.workspaceId || context.callerAgentVisibility === 'public') return ordinary;
  return or(ordinary, teamAccess(db, context, 'read'))!;
};

/** Team Page writes require current team membership or workspace administration. */
export const buildDocumentWritableWhere = (
  db: OrviloDatabase,
  context: DocumentAccessContext,
): SQL => {
  const ordinary = buildWorkspaceWhere(context, documents);
  if (!context.workspaceId || context.callerAgentVisibility === 'public') return ordinary;
  return or(ordinary, teamAccess(db, context, 'write'))!;
};
