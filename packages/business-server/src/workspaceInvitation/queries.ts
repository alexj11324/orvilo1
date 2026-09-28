import type { OrviloDatabase } from '@orvilo/database';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';

import {
  projects,
  workspaceInvitationProjects,
  workspaceInvitations,
} from '@orvilo/database/schemas';

/** Project grants attached to a set of invitations, joined to the project name for display. */
export const listInvitationProjectGrants = async (
  db: OrviloDatabase,
  invitationIds: string[],
) => {
  if (invitationIds.length === 0) return [];
  return db
    .select({
      invitationId: workspaceInvitationProjects.invitationId,
      projectId: workspaceInvitationProjects.projectId,
      projectName: projects.name,
      role: workspaceInvitationProjects.role,
    })
    .from(workspaceInvitationProjects)
    .leftJoin(projects, eq(projects.id, workspaceInvitationProjects.projectId))
    .where(inArray(workspaceInvitationProjects.invitationId, invitationIds));
};

/** Bounded window of non-pending invitations so the admin list shows recent terminal states too. */
export const listRecentTerminalInvitations = async (
  db: OrviloDatabase,
  workspaceId: string,
  limit = 50,
) =>
  db
    .select()
    .from(workspaceInvitations)
    .where(
      and(eq(workspaceInvitations.workspaceId, workspaceId), ne(workspaceInvitations.status, 'pending')),
    )
    .orderBy(desc(workspaceInvitations.updatedAt))
    .limit(limit);

/**
 * Delivery bookkeeping, deliberately separate from business state: the send
 * attempt happened whether or not the invite is ever accepted. Best-effort —
 * a failed update must not fail the invite flow.
 */
export const markInvitationSent = async (
  db: OrviloDatabase,
  invitationId: string,
  sentAt: Date,
) => {
  try {
    await db
      .update(workspaceInvitations)
      .set({ lastSentAt: sentAt })
      .where(eq(workspaceInvitations.id, invitationId));
  } catch (error) {
    console.error('[workspaceInvitation:markInvitationSent]', error);
  }
};
