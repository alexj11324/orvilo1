import type { LobeChatDatabase } from '@orvilo/database';
import type { UserItem, WorkspaceItem, WorkspaceMemberItem } from '@orvilo/database/schemas';
import type { TaskItem } from '@orvilo/types';
import { and, asc, count, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';

import { recordBulkTaskMutation } from '@/database/models/taskDomainMutation';
import { devices } from '@orvilo/database/schemas';
import { executionGrants } from '@orvilo/database/schemas';
import { projects } from '@orvilo/database/schemas';
import { tasks } from '@orvilo/database/schemas';
import { users } from '@orvilo/database/schemas';
import { workspaceMembers, workspaces } from '@orvilo/database/schemas';

/** Task statuses that still carry a live responsibility; terminal states are not reassigned or counted. */
const OPEN_TASK_STATUSES = ['backlog', 'paused', 'running'] as const;

/** Bounded member directory page — workspaces past this get a follow-up cursor API. */
const MEMBER_LIST_LIMIT = 500;

/**
 * Lock the membership row for update regardless of soft-delete state so an
 * accept/remove flow can serialize on it. `getMemberForUpdate` on the model
 * filters `deleted_at IS NULL`, which cannot lock a removed member's row.
 */
export const lockMembershipForUpdate = (
  db: LobeChatDatabase,
  workspaceId: string,
  userId: string,
) =>
  db
    .select()
    .from(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
    )
    .for('update')
    .then((rows) => rows[0]);

/**
 * Non-locking read of the membership row regardless of lifecycle state —
 * removal preview needs the row even when the member is suspended (suspended
 * members are removable, and their impact is exactly what the preview shows).
 */
export const findMembershipRow = (db: LobeChatDatabase, workspaceId: string, userId: string) =>
  db
    .select()
    .from(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
    )
    .then((rows) => rows[0]);

/**
 * Lock the workspace row first in every membership mutation — the fixed lock
 * order is workspace → invitation → membership.
 */
export const lockWorkspaceForUpdate = (db: LobeChatDatabase, workspaceId: string) =>
  db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .for('update')
    .then((rows) => rows[0] as WorkspaceItem | undefined);

/**
 * Monotonic bump of the member's authorization version: revocation, suspend
 * and role-change paths all invalidate cached grants through this counter.
 */
export const bumpAuthzVersion = async (
  db: LobeChatDatabase,
  workspaceId: string,
  userId: string,
) => {
  await db
    .update(workspaceMembers)
    .set({
      authzVersion: sql`${workspaceMembers.authzVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
    );
};

export interface MemberWithProfile {
  member: WorkspaceMemberItem;
  user: Pick<UserItem, 'avatar' | 'email' | 'fullName' | 'id' | 'username'> | null;
}

export const listMembersWithProfiles = async (
  db: LobeChatDatabase,
  workspaceId: string,
  includeDeleted: boolean,
): Promise<MemberWithProfile[]> => {
  const rows = await db
    .select({
      member: workspaceMembers,
      user: {
        avatar: users.avatar,
        email: users.email,
        fullName: users.fullName,
        id: users.id,
        username: users.username,
      },
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
  return rows;
};

const openTaskWhere = (workspaceId: string, userId: string, column: 'assignee' | 'reviewer') =>
  and(
    eq(tasks.workspaceId, workspaceId),
    eq(column === 'assignee' ? tasks.assigneeUserId : tasks.reviewerUserId, userId),
    inArray(tasks.status, [...OPEN_TASK_STATUSES]),
    isNull(tasks.deletedAt),
  );

export const countOpenTasksAssignedTo = async (
  db: LobeChatDatabase,
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
  db: LobeChatDatabase,
  workspaceId: string,
  userId: string,
) => {
  const [row] = await db
    .select({ total: count() })
    .from(tasks)
    .where(openTaskWhere(workspaceId, userId, 'reviewer'));
  return Number(row?.total ?? 0);
};

export const listOpenAssignedTaskTitles = async (
  db: LobeChatDatabase,
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
  db: LobeChatDatabase,
  workspaceId: string,
  userId: string,
) => {
  const [row] = await db
    .select({ total: count() })
    .from(executionGrants)
    .where(
      and(
        eq(executionGrants.workspaceId, workspaceId),
        or(eq(executionGrants.initiatedBy, userId), eq(executionGrants.delegationSubjectId, userId)),
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
  db: LobeChatDatabase,
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
  db: LobeChatDatabase,
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

export const findUserById = (db: LobeChatDatabase, userId: string) =>
  db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then((rows) => rows[0] as UserItem | undefined);

/** Resolve accounts whose stored or normalized email matches the invitation target. */
export const findUsersByNormalizedEmail = (db: LobeChatDatabase, emailNormalized: string) =>
  db
    .select()
    .from(users)
    .where(or(eq(users.normalizedEmail, emailNormalized), eq(users.email, emailNormalized)));

export const findProjectsByIds = (db: LobeChatDatabase, projectIds: string[]) => {
  if (projectIds.length === 0) return Promise.resolve([]);
  return db.select().from(projects).where(inArray(projects.id, projectIds));
};
