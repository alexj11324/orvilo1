import type { OrviloDatabase } from '@orvilo/database';
import type {
  NewWorkspaceOwnershipTransfer,
  UserItem,
  WorkspaceItem,
  WorkspaceMemberItem,
  WorkspaceOwnershipTransferItem,
} from '@orvilo/database/schemas';
import {
  devices,
  executionGrants,
  projectMembers,
  projects,
  tasks,
  users,
  workspaceMembers,
  workspaceOwnershipTransfers,
  workspaces,
} from '@orvilo/database/schemas';
import type { TaskItem } from '@orvilo/types';
import { and, asc, count, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';

import { recordBulkTaskMutation } from '@/database/models/taskDomainMutation';

/** Task statuses that still carry a live responsibility; terminal states are not reassigned or counted. */
const OPEN_TASK_STATUSES = ['backlog', 'paused', 'running'] as const;

/** Bounded member directory page — workspaces past this get a follow-up cursor API. */
const MEMBER_LIST_LIMIT = 500;

/**
 * Lock the membership row for update regardless of soft-delete state so an
 * accept/remove flow can serialize on it. `getMemberForUpdate` on the model
 * filters `deleted_at IS NULL`, which cannot lock a removed member's row.
 */
export const lockMembershipForUpdate = (db: OrviloDatabase, workspaceId: string, userId: string) =>
  db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .for('update')
    .then((rows) => rows[0]);

/**
 * Non-locking read of the membership row regardless of lifecycle state —
 * removal preview needs the row even when the member is suspended (suspended
 * members are removable, and their impact is exactly what the preview shows).
 */
export const findMembershipRow = (db: OrviloDatabase, workspaceId: string, userId: string) =>
  db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .then((rows) => rows[0]);

/**
 * Lock the caller's project_members row for update regardless of lifecycle
 * state — mirroring `lockMembershipForUpdate`. Project-membership mutations
 * serialize on this row so a concurrent removal or downgrade of the caller
 * cannot slip a grant through after the permission check.
 */
export const lockProjectMembershipForUpdate = (
  db: OrviloDatabase,
  projectId: string,
  userId: string,
) =>
  db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .for('update')
    .then((rows) => rows[0]);

/**
 * Lock the workspace row first in every membership mutation — the fixed lock
 * order is workspace → invitation → membership.
 */
export const lockWorkspaceForUpdate = (db: OrviloDatabase, workspaceId: string) =>
  db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .for('update')
    .then((rows) => rows[0] as WorkspaceItem | undefined);

/**
 * Monotonic bump of the member's authorization version: revocation, suspend
 * and role-change paths all invalidate cached grants through this counter.
 * Returns the post-bump version (undefined when no membership row matched) so
 * emitted events can stamp the revocation barrier tickets compare against.
 */
export const bumpAuthzVersion = async (
  db: OrviloDatabase,
  workspaceId: string,
  userId: string,
): Promise<number | undefined> => {
  const [row] = await db
    .update(workspaceMembers)
    .set({
      authzVersion: sql`${workspaceMembers.authzVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .returning({ authzVersion: workspaceMembers.authzVersion });
  return row?.authzVersion;
};

export interface MemberWithProfile {
  member: WorkspaceMemberItem;
  user: Pick<UserItem, 'avatar' | 'email' | 'fullName' | 'id' | 'username'> | null;
}

export const listMembersWithProfiles = async (
  db: OrviloDatabase,
  workspaceId: string,
  includeDeleted: boolean,
): Promise<MemberWithProfile[]> => {
  const rows = await db
    // Flat columns + post-map: a nested `user: { avatar, ... }` select maps
    // the whole object to null whenever the nested selection's first field is
    // null (drizzle-orm 0.45.2), so any avatar-less member rendered nameless.
    .select({
      member: workspaceMembers,
      userAvatar: users.avatar,
      userEmail: users.email,
      userFullName: users.fullName,
      userId: users.id,
      userUsername: users.username,
    })
    .from(workspaceMembers)
    .leftJoin(users, eq(users.id, workspaceMembers.userId))
    .where(
      includeDeleted
        ? eq(workspaceMembers.workspaceId, workspaceId)
        : and(eq(workspaceMembers.workspaceId, workspaceId), isNull(workspaceMembers.deletedAt)),
    )
    .orderBy(asc(workspaceMembers.joinedAt), asc(workspaceMembers.userId))
    .limit(MEMBER_LIST_LIMIT);
  return rows.map(({ member, userAvatar, userEmail, userFullName, userId, userUsername }) => ({
    member,
    user: userId
      ? {
          avatar: userAvatar,
          email: userEmail,
          fullName: userFullName,
          id: userId,
          username: userUsername,
        }
      : null,
  }));
};

const openTaskWhere = (workspaceId: string, userId: string, column: 'assignee' | 'reviewer') =>
  and(
    eq(tasks.workspaceId, workspaceId),
    eq(column === 'assignee' ? tasks.assigneeUserId : tasks.reviewerUserId, userId),
    inArray(tasks.status, [...OPEN_TASK_STATUSES]),
    isNull(tasks.deletedAt),
  );

export const countOpenTasksAssignedTo = async (
  db: OrviloDatabase,
  workspaceId: string,
  userId: string,
) => {
  const [row] = await db
    .select({ total: count() })
    .from(tasks)
    .where(openTaskWhere(workspaceId, userId, 'assignee'));
  return Number(row?.total ?? 0);
};

export const countOpenTasksReviewedBy = async (
  db: OrviloDatabase,
  workspaceId: string,
  userId: string,
) => {
  const [row] = await db
    .select({ total: count() })
    .from(tasks)
    .where(openTaskWhere(workspaceId, userId, 'reviewer'));
  return Number(row?.total ?? 0);
};

export interface MemberWorkload {
  openAssignedCount: number;
  openReviewingCount: number;
  projectCount: number;
}

const EMPTY_WORKLOAD: MemberWorkload = {
  openAssignedCount: 0,
  openReviewingCount: 0,
  projectCount: 0,
};

/**
 * Per-member workload for the whole roster in three grouped aggregates —
 * project memberships, open assignee tasks, open reviewer tasks. One row per
 * member would N+1 the directory; grouping in SQL keeps it at three queries.
 */
export const countMemberWorkload = async (
  db: OrviloDatabase,
  workspaceId: string,
): Promise<Map<string, MemberWorkload>> => {
  const [projectRows, assignedRows, reviewingRows] = await Promise.all([
    db
      .select({ total: count(), userId: projectMembers.userId })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.workspaceId, workspaceId),
          isNull(projectMembers.deletedAt),
          isNull(projectMembers.suspendedAt),
        ),
      )
      .groupBy(projectMembers.userId),
    db
      .select({ total: count(), userId: tasks.assigneeUserId })
      .from(tasks)
      .where(
        and(
          eq(tasks.workspaceId, workspaceId),
          inArray(tasks.status, [...OPEN_TASK_STATUSES]),
          isNull(tasks.deletedAt),
          isNotNull(tasks.assigneeUserId),
        ),
      )
      .groupBy(tasks.assigneeUserId),
    db
      .select({ total: count(), userId: tasks.reviewerUserId })
      .from(tasks)
      .where(
        and(
          eq(tasks.workspaceId, workspaceId),
          inArray(tasks.status, [...OPEN_TASK_STATUSES]),
          isNull(tasks.deletedAt),
          isNotNull(tasks.reviewerUserId),
        ),
      )
      .groupBy(tasks.reviewerUserId),
  ]);

  const workload = new Map<string, MemberWorkload>();
  const merge = (userId: string | null, patch: Partial<MemberWorkload>) => {
    if (!userId) return;
    workload.set(userId, { ...(workload.get(userId) ?? EMPTY_WORKLOAD), ...patch });
  };
  for (const row of projectRows) merge(row.userId, { projectCount: Number(row.total) });
  for (const row of assignedRows) merge(row.userId, { openAssignedCount: Number(row.total) });
  for (const row of reviewingRows) merge(row.userId, { openReviewingCount: Number(row.total) });
  return workload;
};

export const listOpenAssignedTaskTitles = async (
  db: OrviloDatabase,
  workspaceId: string,
  userId: string,
  limit = 20,
) => {
  const rows = await db
    .select({ id: tasks.id, title: tasks.name })
    .from(tasks)
    .where(openTaskWhere(workspaceId, userId, 'assignee'))
    .orderBy(asc(tasks.createdAt), asc(tasks.id))
    .limit(limit);
  return rows.map((row) => ({ id: row.id, title: row.title ?? '' }));
};

/**
 * Active execution delegations where the departing member either initiated the
 * run or is the delegation subject — both become orphaned on removal.
 */
export const countActiveDelegations = async (
  db: OrviloDatabase,
  workspaceId: string,
  userId: string,
) => {
  const [row] = await db
    .select({ total: count() })
    .from(executionGrants)
    .where(
      and(
        eq(executionGrants.workspaceId, workspaceId),
        or(
          eq(executionGrants.initiatedBy, userId),
          eq(executionGrants.delegationSubjectId, userId),
        ),
        eq(executionGrants.status, 'active'),
      ),
    );
  return Number(row?.total ?? 0);
};

/**
 * Devices `WorkspaceMemberModel.removeMember` would delete for this member —
 * the same predicate (private enrollments plus devices shared out of their
 * personal list) so the preview never over-promises what removal touches.
 */
export const countMemberBoundDevices = async (
  db: OrviloDatabase,
  workspaceId: string,
  userId: string,
) => {
  const [row] = await db
    .select({ total: count() })
    .from(devices)
    .where(
      and(
        eq(devices.workspaceId, workspaceId),
        eq(devices.userId, userId),
        or(eq(devices.visibility, 'private'), isNotNull(devices.sharedFromDeviceId)),
      ),
    );
  return Number(row?.total ?? 0);
};

/**
 * Hand the departing member's open assignee tasks to `toUserId`. Reviewer
 * assignments are deliberately untouched — `removeMember` clears them
 * per-field and the contract only transfers assignee responsibility.
 */
export const reassignOpenAssignedTasks = async (
  db: OrviloDatabase,
  params: { fromUserId: string; toUserId: string; workspaceId: string },
) => {
  const moved: TaskItem[] = await db
    .update(tasks)
    .set({
      assigneeUserId: params.toUserId,
      domainRevision: sql`${tasks.domainRevision} + 1`,
      policyRevision: sql`${tasks.policyRevision} + 1`,
      updatedAt: new Date(),
    })
    .where(openTaskWhere(params.workspaceId, params.fromUserId, 'assignee'))
    .returning();

  await recordBulkTaskMutation(db, moved, {
    changedFields: ['assigneeUserId'],
    eventType: 'task.assigned',
    idempotencyKeyPrefix: `workspace-member-reassigned:${params.workspaceId}:${params.fromUserId}:${params.toUserId}`,
  });

  return moved.length;
};

/** The workspace's live hand-off request, if one exists (at most one — partial unique index). */
export const findPendingOwnershipTransfer = (
  db: OrviloDatabase,
  workspaceId: string,
): Promise<WorkspaceOwnershipTransferItem | undefined> =>
  db
    .select()
    .from(workspaceOwnershipTransfers)
    .where(
      and(
        eq(workspaceOwnershipTransfers.workspaceId, workspaceId),
        eq(workspaceOwnershipTransfers.status, 'pending'),
      ),
    )
    .then((rows) => rows[0]);

/** Same lookup under a row lock — respond/cancel paths serialize on it. */
export const lockPendingOwnershipTransferForUpdate = (
  db: OrviloDatabase,
  workspaceId: string,
): Promise<WorkspaceOwnershipTransferItem | undefined> =>
  db
    .select()
    .from(workspaceOwnershipTransfers)
    .where(
      and(
        eq(workspaceOwnershipTransfers.workspaceId, workspaceId),
        eq(workspaceOwnershipTransfers.status, 'pending'),
      ),
    )
    .for('update')
    .then((rows) => rows[0]);

export const insertOwnershipTransfer = (
  db: OrviloDatabase,
  row: Omit<NewWorkspaceOwnershipTransfer, 'id'>,
): Promise<WorkspaceOwnershipTransferItem> =>
  db
    .insert(workspaceOwnershipTransfers)
    .values(row)
    .returning()
    .then((rows) => rows[0]);

/** Terminal write for a pending transfer — pending → decided status. */
export const decideOwnershipTransfer = (
  db: OrviloDatabase,
  transferId: string,
  status: 'accepted' | 'cancelled' | 'declined' | 'expired',
) =>
  db
    .update(workspaceOwnershipTransfers)
    .set({ decidedAt: new Date(), status })
    .where(eq(workspaceOwnershipTransfers.id, transferId));

/** Public profile fields for a list of user ids — transfer counterparty display. */
export const findUserProfiles = (db: OrviloDatabase, userIds: string[]) =>
  userIds.length === 0
    ? Promise.resolve([])
    : db
        .select({
          avatar: users.avatar,
          fullName: users.fullName,
          id: users.id,
          username: users.username,
        })
        .from(users)
        .where(inArray(users.id, userIds));

export const findUserById = (db: OrviloDatabase, userId: string) =>
  db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then((rows) => rows[0] as UserItem | undefined);

/** Resolve accounts whose stored or normalized email matches the invitation target. */
export const findUsersByNormalizedEmail = (db: OrviloDatabase, emailNormalized: string) =>
  db
    .select()
    .from(users)
    .where(or(eq(users.normalizedEmail, emailNormalized), eq(users.email, emailNormalized)));

export const findProjectsByIds = (db: OrviloDatabase, projectIds: string[]) => {
  if (projectIds.length === 0) return Promise.resolve([]);
  return db.select().from(projects).where(inArray(projects.id, projectIds));
};
