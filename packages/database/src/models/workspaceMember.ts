import { INVITATION_EXPIRY_DAYS } from '@orvilo/const';
import { canWorkspaceRoleBeTaskAssignee } from '@orvilo/const/rbac';
import { and, asc, count, eq, exists, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';

import { devices } from '../schemas/device';
import { messengerAccountLinks } from '../schemas/messengerAccountLink';
import { tasks } from '../schemas/task';
import { users } from '../schemas/user';
import { workspaceInvitations, workspaceMembers } from '../schemas/workspace';
import type { LobeChatDatabase } from '../type';
import { ResourcePermissionModel } from './resourcePermission';
import { detachMemberFromTasks } from './taskDomainMutation';
import { WorkspaceInvitationModel } from './workspaceInvitation';

type MemberRole = 'admin' | 'member' | 'viewer';

// The built-in roles a `workspace_members.role` row can hold; narrowed at load
// time to the ones that may own a task so the directory lookup can gate on the
// column in SQL instead of filtering every row after the fact.
const ASSIGNABLE_MEMBER_ROLES = (['owner', 'admin', 'member', 'viewer'] as const).filter((role) =>
  canWorkspaceRoleBeTaskAssignee(role),
);

const escapeLike = (value: string): string => value.replaceAll(/[\\%_]/g, (c) => `\\${c}`);
const containsIgnoreCase = (column: unknown, needle: string) =>
  sql<boolean>`${column} ILIKE ${`%${escapeLike(needle)}%`} ESCAPE '\\'`;

export class WorkspaceMemberModel {
  private readonly db: LobeChatDatabase;
  private readonly userId: string;

  constructor(db: LobeChatDatabase, userId: string) {
    this.db = db;
    this.userId = userId;
  }

  // ===== Members ===== //

  addMember = async (params: { role?: MemberRole; userId: string; workspaceId: string }) => {
    const [result] = await this.db
      .insert(workspaceMembers)
      .values({
        role: params.role ?? 'member',
        userId: params.userId,
        workspaceId: params.workspaceId,
      })
      .onConflictDoUpdate({
        set: {
          authzVersion: sql`${workspaceMembers.authzVersion} + 1`,
          deletedAt: null,
          joinedAt: new Date(),
          role: params.role ?? 'member',
          // A rejoin starts from the new invitation only: it never revives a
          // suspension and never restores grants removed with the old row.
          suspendedAt: null,
        },
        target: [workspaceMembers.workspaceId, workspaceMembers.userId],
      })
      .returning();
    return result;
  };

  getMember = async (workspaceId: string, userId: string) => {
    return this.db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
        isNull(workspaceMembers.deletedAt),
        isNull(workspaceMembers.suspendedAt),
      ),
    });
  };

  /** Lock an active membership row. Call only from an enclosing transaction. */
  getMemberForUpdate = async (workspaceId: string, userId: string) => {
    const [member] = await this.db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, userId),
          isNull(workspaceMembers.deletedAt),
          isNull(workspaceMembers.suspendedAt),
        ),
      )
      .for('update');
    return member;
  };

  listMembers = async (workspaceId: string, options: { includeDeleted?: boolean } = {}) => {
    return this.db.query.workspaceMembers.findMany({
      where: options.includeDeleted
        ? eq(workspaceMembers.workspaceId, workspaceId)
        : and(
            eq(workspaceMembers.workspaceId, workspaceId),
            isNull(workspaceMembers.deletedAt),
            isNull(workspaceMembers.suspendedAt),
          ),
    });
  };

  /**
   * Bounded assignee directory: active members whose role may own a task,
   * optionally narrowed by `query` — an exact (case-folded) user id, or a
   * case-insensitive part of the display name, @handle, email, or a messenger
   * identity linked under this workspace's scope — and capped by `limit`.
   * The narrowing and the cap run in SQL so a large workspace costs one page
   * plus a count, never a full member scan on the application side. `total`
   * is the number of matches before the cap.
   */
  searchAssignableMembers = async (
    workspaceId: string,
    options: { limit: number; query?: string },
  ): Promise<{ rows: Array<{ role: string; userId: string }>; total: number }> => {
    const { limit, query } = options;
    if (ASSIGNABLE_MEMBER_ROLES.length === 0 || limit <= 0) return { rows: [], total: 0 };

    const matchesQuery = query
      ? or(
          sql`lower(${users.id}) = ${query}`,
          containsIgnoreCase(users.fullName, query),
          containsIgnoreCase(users.username, query),
          containsIgnoreCase(users.email, query),
          // Same scope rule as `MessengerAccountLinkModel.findByUserIds`: only
          // identities active under this workspace take part in resolution.
          exists(
            this.db
              .select({ one: sql`1` })
              .from(messengerAccountLinks)
              .where(
                and(
                  eq(messengerAccountLinks.userId, workspaceMembers.userId),
                  eq(messengerAccountLinks.workspaceId, workspaceId),
                  or(
                    containsIgnoreCase(messengerAccountLinks.platformUsername, query),
                    sql`lower(${messengerAccountLinks.platformUserId}) = ${query}`,
                  ),
                ),
              ),
          ),
        )
      : undefined;
    const where = and(
      eq(workspaceMembers.workspaceId, workspaceId),
      isNull(workspaceMembers.deletedAt),
      isNull(workspaceMembers.suspendedAt),
      inArray(workspaceMembers.role, ASSIGNABLE_MEMBER_ROLES),
      matchesQuery,
    );

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({ role: workspaceMembers.role, userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .innerJoin(users, eq(users.id, workspaceMembers.userId))
        .where(where)
        .orderBy(asc(users.fullName), asc(users.username), asc(workspaceMembers.userId))
        .limit(limit),
      this.db
        .select({ total: count() })
        .from(workspaceMembers)
        .innerJoin(users, eq(users.id, workspaceMembers.userId))
        .where(where),
    ]);

    return { rows, total: Number(total) };
  };

  removeMember = async (workspaceId: string, userId: string) => {
    // Departed-member device cleanup: drop the enrollments that only make sense
    // while they belong to the workspace — their private enrollments and any
    // device shared from their personal device list (the machine stays under
    // their exclusive control, so keeping the row would leave a permanently
    // dead — and security-ambiguous — entry). Devices they enrolled directly on
    // the machine as 'public' are shared infra and stay; their `userId` merely
    // records the first enroller.
    const removedDevices = await this.db
      .delete(devices)
      .where(
        and(
          eq(devices.workspaceId, workspaceId),
          eq(devices.userId, userId),
          or(eq(devices.visibility, 'private'), isNotNull(devices.sharedFromDeviceId)),
        ),
      )
      .returning({ deviceId: devices.deviceId });

    // Same reasoning one level up: a per-member resource grant only means
    // anything while they belong to the workspace, and the soft delete is
    // reactivated by `addMember`, so a grant left behind would silently restore
    // their old access on re-invite. Workspace-wide rows carry no subject and
    // stay.
    //
    // Soft-delete first, then revoke, both in one transaction: the update takes
    // the membership row lock that a concurrent grant waits on, so a grant can
    // never land in the window between the two statements. Reversing the order
    // would leave exactly that gap.
    await this.db.transaction(async (tx) => {
      await tx
        .update(workspaceMembers)
        .set({
          authzVersion: sql`${workspaceMembers.authzVersion} + 1`,
          deletedAt: new Date(),
        })
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspaceId),
            eq(workspaceMembers.userId, userId),
            isNull(workspaceMembers.deletedAt),
          ),
        );

      await new ResourcePermissionModel(tx, workspaceId).removeMemberGrants(userId);

      // The two responsibility fields detach independently: clearing both
      // wherever EITHER matched would strip the surviving teammate's role
      // alongside the departing member's. A task where the member was
      // assignee keeps its reviewer and vice versa.
      await detachMemberFromTasks(tx, {
        idempotencyKeyPrefix: `workspace-member-removed:${workspaceId}:${userId}`,
        userId,
        workspaceId,
      });
    });

    // Surfaced so callers can best-effort unenroll any still-connected gateway
    // socket for these devices: deleting the row alone also removes it from the
    // workspace hidden set, so a live socket would resurface to remaining
    // members as an online transient until its connect token expires.
    return { removedDeviceIds: removedDevices.map((d) => d.deviceId) };
  };

  updateMemberRole = async (workspaceId: string, userId: string, role: MemberRole) => {
    return this.db.transaction(async (tx) => {
      const updatedMembers = await tx
        .update(workspaceMembers)
        .set({
          authzVersion: sql`${workspaceMembers.authzVersion} + 1`,
          role,
        })
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspaceId),
            eq(workspaceMembers.userId, userId),
            isNull(workspaceMembers.deletedAt),
          ),
        )
        .returning({ userId: workspaceMembers.userId });

      if (updatedMembers.length > 0 && !canWorkspaceRoleBeTaskAssignee(role)) {
        // Same per-field detach as `removeMember`: downgrading must not clear
        // a reviewer slot held by a different member (and vice versa).
        await detachMemberFromTasks(tx, {
          idempotencyKeyPrefix: `workspace-member-role:${workspaceId}:${userId}:${role}`,
          userId,
          workspaceId,
        });
      }

      return updatedMembers;
    });
  };

  /**
   * Temporarily revoke a member's access without deleting the membership —
   * every active-membership check filters `suspendedAt IS NULL`, so existing
   * sessions stop authorizing while the row (and its history) stays put.
   */
  suspendMember = async (workspaceId: string, userId: string) => {
    return this.db
      .update(workspaceMembers)
      .set({
        authzVersion: sql`${workspaceMembers.authzVersion} + 1`,
        suspendedAt: new Date(),
      })
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, userId),
          isNull(workspaceMembers.deletedAt),
          isNull(workspaceMembers.suspendedAt),
        ),
      )
      .returning();
  };

  /** Lift a suspension; the member becomes active again at the bumped version. */
  resumeMember = async (workspaceId: string, userId: string) => {
    return this.db
      .update(workspaceMembers)
      .set({
        authzVersion: sql`${workspaceMembers.authzVersion} + 1`,
        suspendedAt: null,
      })
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, userId),
          isNull(workspaceMembers.deletedAt),
          isNotNull(workspaceMembers.suspendedAt),
        ),
      )
      .returning();
  };

  // ===== Invitations ===== //

  private get invitationModel() {
    return new WorkspaceInvitationModel(this.db, this.userId);
  }

  /**
   * Legacy surface over `WorkspaceInvitationModel`: the secure token flow is
   * shared, so the raw token still reaches the caller once (this method's
   * historical return shape) while the row persists only `tokenHash`.
   */
  createInvitation = async (params: { email?: string; role?: MemberRole; workspaceId: string }) => {
    const { invitation, token } = await this.invitationModel.createInvitation({
      email: params.email,
      expiresAt: (() => {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS);
        return expiresAt;
      })(),
      role: params.role,
      workspaceId: params.workspaceId,
    });
    return { ...invitation, token };
  };

  findInvitationByToken = async (token: string) => {
    return this.invitationModel.findByToken(token);
  };

  listPendingInvitations = async (workspaceId: string) => {
    const rows = await this.invitationModel.listPendingByWorkspace(workspaceId);
    return rows.map((row) => row.invitation);
  };

  revokeInvitation = async (id: string) => {
    await this.invitationModel.revoke(id, { revokedBy: this.userId });
  };

  updateInvitationStatus = async (id: string, status: 'accepted' | 'expired' | 'revoked') => {
    switch (status) {
      case 'accepted': {
        await this.invitationModel.markAccepted(id, { acceptedBy: this.userId });
        return;
      }
      case 'revoked': {
        await this.invitationModel.revoke(id, { revokedBy: this.userId });
        return;
      }
      case 'expired': {
        await this.db
          .update(workspaceInvitations)
          .set({ status: 'expired' })
          .where(and(eq(workspaceInvitations.id, id), eq(workspaceInvitations.status, 'pending')));
        return;
      }
    }
  };
}
