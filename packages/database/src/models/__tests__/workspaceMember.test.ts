import { INVITATION_EXPIRY_DAYS } from '@orvilo/const';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import {
  agents,
  devices,
  messengerAccountLinks,
  projectMembers,
  projects,
  resourcePermissions,
  taskDomainEvents,
  tasks,
  users,
  workspaceInvitations,
  workspaceMembers,
  workspaces,
} from '../../schemas';
import type { OrviloDatabase } from '../../type';
import { ProjectMemberModel } from '../projectMember';
import { WorkspaceMemberModel } from '../workspaceMember';

const serverDB: OrviloDatabase = await getTestDB();

const inviterId = 'wm-inviter';
const memberId = 'wm-member';
const otherUserId = 'wm-other-user';
const workspaceId = 'wm-workspace';
const otherWorkspaceId = 'wm-other-workspace';

beforeEach(async () => {
  await serverDB.delete(users);
  await serverDB.insert(users).values([{ id: inviterId }, { id: memberId }, { id: otherUserId }]);
  await serverDB.insert(workspaces).values([
    { id: workspaceId, name: 'WS', primaryOwnerId: inviterId, slug: 'ws' },
    { id: otherWorkspaceId, name: 'Other WS', primaryOwnerId: otherUserId, slug: 'other-ws' },
  ]);
});

afterEach(async () => {
  await serverDB.delete(users);
});

describe('WorkspaceMemberModel', () => {
  describe('addMember', () => {
    it('adds a member with the default role when none is provided', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);

      const result = await model.addMember({ userId: memberId, workspaceId });

      expect(result.workspaceId).toBe(workspaceId);
      expect(result.userId).toBe(memberId);
      expect(result.role).toBe('member');
      expect(result.deletedAt).toBeNull();
    });

    it('adds a member with an explicit role', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);

      const result = await model.addMember({ role: 'admin', userId: memberId, workspaceId });

      expect(result.role).toBe('admin');
    });

    it('upserts the role and revives a soft-deleted member on conflict', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);

      await model.addMember({ role: 'member', userId: memberId, workspaceId });
      await model.removeMember(workspaceId, memberId);

      // soft-deleted now; re-adding should revive and update the role
      const revived = await model.addMember({ role: 'admin', userId: memberId, workspaceId });

      expect(revived.role).toBe('admin');
      expect(revived.deletedAt).toBeNull();

      // composite PK guarantees a single row per (workspace, user)
      const rows = await serverDB
        .select()
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, workspaceId));
      expect(rows).toHaveLength(1);
    });

    it('falls back to the default role when reviving without an explicit role', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);

      await model.addMember({ role: 'admin', userId: memberId, workspaceId });
      const revived = await model.addMember({ userId: memberId, workspaceId });

      expect(revived.role).toBe('member');
    });
  });

  describe('getMember', () => {
    it('returns the active member', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);
      await model.addMember({ role: 'viewer', userId: memberId, workspaceId });

      const found = await model.getMember(workspaceId, memberId);

      expect(found?.userId).toBe(memberId);
      expect(found?.role).toBe('viewer');
    });

    it('returns undefined for a soft-deleted member', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);
      await model.addMember({ userId: memberId, workspaceId });
      await model.removeMember(workspaceId, memberId);

      expect(await model.getMember(workspaceId, memberId)).toBeUndefined();
    });

    it('returns undefined when the member does not exist', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);

      expect(await model.getMember(workspaceId, 'nobody')).toBeUndefined();
    });

    it('isolates members across workspaces', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);
      await model.addMember({ userId: memberId, workspaceId });

      expect(await model.getMember(otherWorkspaceId, memberId)).toBeUndefined();
    });
  });

  describe('listMembers', () => {
    it('lists only active members by default', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);
      await model.addMember({ userId: inviterId, workspaceId });
      await model.addMember({ userId: memberId, workspaceId });
      await model.removeMember(workspaceId, memberId);

      const rows = await model.listMembers(workspaceId);

      expect(rows).toHaveLength(1);
      expect(rows[0].userId).toBe(inviterId);
    });

    it('includes soft-deleted members when includeDeleted is true', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);
      await model.addMember({ userId: inviterId, workspaceId });
      await model.addMember({ userId: memberId, workspaceId });
      await model.removeMember(workspaceId, memberId);

      const rows = await model.listMembers(workspaceId, { includeDeleted: true });

      expect(rows.map((r) => r.userId).sort()).toEqual([inviterId, memberId].sort());
    });

    it('does not leak members from other workspaces', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);
      await model.addMember({ userId: memberId, workspaceId });
      await model.addMember({ userId: otherUserId, workspaceId: otherWorkspaceId });

      const rows = await model.listMembers(workspaceId);

      expect(rows).toHaveLength(1);
      expect(rows[0].userId).toBe(memberId);
    });

    it('returns an empty list for a workspace with no members', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);

      expect(await model.listMembers(workspaceId)).toEqual([]);
    });
  });

  describe('searchAssignableMembers', () => {
    const viewerId = 'wm-viewer';

    const seedDirectory = async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);
      await serverDB.insert(users).values({ id: viewerId });
      await serverDB
        .update(users)
        .set({ email: 'alice@orvilo.aspectlylabs.com', fullName: 'Alice Chen', username: 'alice' })
        .where(eq(users.id, memberId));
      await serverDB
        .update(users)
        .set({ fullName: 'Bob Li', username: 'bob' })
        .where(eq(users.id, otherUserId));
      // `addMember` only hands out non-owner roles; seed the owner row directly.
      await serverDB
        .insert(workspaceMembers)
        .values({ role: 'owner', userId: inviterId, workspaceId });
      await model.addMember({ userId: memberId, workspaceId });
      await model.addMember({ userId: otherUserId, workspaceId });
      await model.addMember({ role: 'viewer', userId: viewerId, workspaceId });
      // Alice's Discord identity is active in this workspace; her Telegram one
      // belongs to another workspace and must stay invisible here.
      await serverDB.insert(messengerAccountLinks).values([
        {
          platform: 'discord',
          platformUserId: '4521',
          platformUsername: 'Neko',
          userId: memberId,
          workspaceId,
        },
        {
          platform: 'telegram',
          platformUserId: 'tg-777',
          platformUsername: 'alice_tg',
          userId: memberId,
          workspaceId: otherWorkspaceId,
        },
      ]);
      return model;
    };

    it('lists active members whose role can own a task, name-ordered with a total', async () => {
      const model = await seedDirectory();

      const { rows, total } = await model.searchAssignableMembers(workspaceId, { limit: 50 });

      // Viewers cannot own tasks; members without a name sort last.
      expect(rows.map((r) => r.userId)).toEqual([memberId, otherUserId, inviterId]);
      expect(rows.find((r) => r.userId === inviterId)?.role).toBe('owner');
      expect(total).toBe(3);
    });

    it('narrows by id, name, handle, email or an IM identity linked under this workspace', async () => {
      const model = await seedDirectory();
      const ids = async (query: string) =>
        (await model.searchAssignableMembers(workspaceId, { limit: 50, query })).rows.map(
          (r) => r.userId,
        );

      expect(await ids('chen')).toEqual([memberId]);
      expect(await ids('bob')).toEqual([otherUserId]);
      expect(await ids('alice@orvilo.aspectlylabs.com')).toEqual([memberId]);
      expect(await ids(memberId)).toEqual([memberId]);
      expect(await ids('neko')).toEqual([memberId]);
      expect(await ids('4521')).toEqual([memberId]);
      // The Telegram identity is scoped to another workspace: no match here.
      expect(await ids('alice_tg')).toEqual([]);
      expect(await ids('tg-777')).toEqual([]);
      // LIKE wildcards are literal characters, not patterns.
      expect(await ids('%')).toEqual([]);
      expect(await ids('_')).toEqual([]);
    });

    it('caps the page with limit and reports the total before the cap', async () => {
      const model = await seedDirectory();

      const { rows, total } = await model.searchAssignableMembers(workspaceId, { limit: 1 });

      expect(rows).toEqual([{ role: 'member', userId: memberId }]);
      expect(total).toBe(3);
    });

    it('ignores soft-deleted members and other workspaces', async () => {
      const model = await seedDirectory();
      await model.removeMember(workspaceId, otherUserId);
      await model.addMember({ userId: otherUserId, workspaceId: otherWorkspaceId });

      const { rows, total } = await model.searchAssignableMembers(workspaceId, { limit: 50 });

      expect(rows.map((r) => r.userId)).toEqual([memberId, inviterId]);
      expect(total).toBe(2);
    });
  });

  describe('removeMember', () => {
    it('soft-deletes an active member', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);
      await model.addMember({ userId: memberId, workspaceId });

      await model.removeMember(workspaceId, memberId);

      const [row] = await serverDB
        .select()
        .from(workspaceMembers)
        .where(
          and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, memberId)),
        );
      expect(row.deletedAt).not.toBeNull();
    });

    it('does not touch members of other workspaces', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);
      await model.addMember({ userId: otherUserId, workspaceId: otherWorkspaceId });

      await model.removeMember(workspaceId, otherUserId);

      const [row] = await serverDB
        .select()
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, otherWorkspaceId));
      expect(row.deletedAt).toBeNull();
    });

    it('drops the departing member private + shared-from-personal devices, keeps shared infra', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);
      await model.addMember({ userId: memberId, workspaceId });
      await serverDB.insert(devices).values([
        // their private enrollment — dropped
        {
          deviceId: 'dep-private',
          identitySource: 'machine-id',
          userId: memberId,
          visibility: 'private',
          workspaceId,
        },
        // shared from their personal list (even if published) — dropped
        {
          deviceId: 'dep-shared',
          identitySource: 'machine-id',
          sharedFromDeviceId: 'dep-personal',
          userId: memberId,
          visibility: 'public',
          workspaceId,
        },
        // public machine they enrolled directly (shared infra) — stays
        {
          deviceId: 'team-box',
          identitySource: 'machine-id',
          userId: memberId,
          visibility: 'public',
          workspaceId,
        },
        // their personal row — untouched
        { deviceId: 'dep-personal', identitySource: 'machine-id', userId: memberId },
        // same-shape rows in another workspace — untouched
        {
          deviceId: 'other-ws-private',
          identitySource: 'machine-id',
          userId: memberId,
          visibility: 'private',
          workspaceId: otherWorkspaceId,
        },
      ]);

      const { removedDeviceIds } = await model.removeMember(workspaceId, memberId);

      // surfaced so callers can best-effort unenroll live gateway sockets
      expect(removedDeviceIds.sort()).toEqual(['dep-private', 'dep-shared']);

      const remaining = (await serverDB.select({ deviceId: devices.deviceId }).from(devices))
        .map((d) => d.deviceId)
        .sort();
      expect(remaining).toEqual(['dep-personal', 'other-ws-private', 'team-box']);
    });

    it('revokes the departing member grants, so a re-invite does not restore them', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);
      await model.addMember({ userId: memberId, workspaceId });
      await serverDB.insert(resourcePermissions).values([
        // the departing member's grant, and one in another workspace
        {
          accessLevel: 'edit',
          resourceId: 'kb-1',
          resourceType: 'knowledgeBase',
          userId: memberId,
          workspaceId,
        },
        {
          accessLevel: 'edit',
          resourceId: 'kb-9',
          resourceType: 'knowledgeBase',
          userId: memberId,
          workspaceId: otherWorkspaceId,
        },
        // another member's grant, and the workspace-wide row on the same resource
        {
          accessLevel: 'edit',
          resourceId: 'kb-1',
          resourceType: 'knowledgeBase',
          userId: otherUserId,
          workspaceId,
        },
        { accessLevel: 'use', resourceId: 'kb-1', resourceType: 'knowledgeBase', workspaceId },
      ]);

      await model.removeMember(workspaceId, memberId);
      // membership is only soft-deleted, and re-inviting revives that same row
      await model.addMember({ userId: memberId, workspaceId });

      const remaining = await serverDB
        .select({
          resourceId: resourcePermissions.resourceId,
          userId: resourcePermissions.userId,
          workspaceId: resourcePermissions.workspaceId,
        })
        .from(resourcePermissions);
      expect(remaining).toEqual(
        expect.arrayContaining([
          { resourceId: 'kb-9', userId: memberId, workspaceId: otherWorkspaceId },
          { resourceId: 'kb-1', userId: otherUserId, workspaceId },
          { resourceId: 'kb-1', userId: null, workspaceId },
        ]),
      );
      expect(remaining).toHaveLength(3);
    });

    it('revokes the departing member project grants, so a re-invite does not restore them', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);
      const pmModel = new ProjectMemberModel(serverDB, inviterId);
      await model.addMember({ userId: memberId, workspaceId });
      // projects.coordinatorAgentId is unique — each project needs its own agent.
      await serverDB.insert(agents).values([
        { id: 'wm-coordinator', slug: 'wm-coordinator', userId: inviterId },
        { id: 'wm-coordinator-2', slug: 'wm-coordinator-2', userId: inviterId },
      ]);
      await serverDB.insert(projects).values([
        {
          coordinatorAgentId: 'wm-coordinator',
          id: 'wm-project',
          identifier: 'WMP',
          name: 'WM project',
          userId: inviterId,
          workspaceId,
        },
        {
          coordinatorAgentId: 'wm-coordinator-2',
          id: 'wm-project-other-ws',
          identifier: 'WMO',
          name: 'Other WS project',
          userId: inviterId,
          workspaceId: otherWorkspaceId,
        },
      ]);
      await pmModel.add({
        projectId: 'wm-project',
        role: 'manager',
        userId: memberId,
        workspaceId,
      });
      // project_members FK requires the user to be a workspace member there too
      await model.addMember({ userId: memberId, workspaceId: otherWorkspaceId });
      await pmModel.add({
        projectId: 'wm-project-other-ws',
        role: 'manager',
        userId: memberId,
        workspaceId: otherWorkspaceId,
      });

      await model.removeMember(workspaceId, memberId);
      // re-invite revives the workspace row; the project grant must stay dead
      await model.addMember({ userId: memberId, workspaceId });

      expect(await pmModel.getRole('wm-project', memberId)).toBeNull();
      const [removedRow] = await serverDB
        .select()
        .from(projectMembers)
        .where(eq(projectMembers.projectId, 'wm-project'));
      expect(removedRow.deletedAt).not.toBeNull();
      // grants in another workspace are untouched
      expect(await pmModel.getRole('wm-project-other-ws', memberId)).toBe('manager');
    });

    it('clears only the departing member task assignments in that workspace', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);
      await model.addMember({ userId: memberId, workspaceId });
      await serverDB.insert(tasks).values([
        {
          assigneeUserId: memberId,
          createdByUserId: inviterId,
          id: 'wm-task-departing-member',
          identifier: 'WM-1',
          instruction: 'Assigned to the departing member',
          reviewerUserId: memberId,
          seq: 1,
          workspaceId,
        },
        {
          assigneeUserId: otherUserId,
          createdByUserId: inviterId,
          id: 'wm-task-other-member',
          identifier: 'WM-2',
          instruction: 'Assigned to another member',
          seq: 2,
          workspaceId,
        },
        {
          assigneeUserId: memberId,
          createdByUserId: otherUserId,
          id: 'wm-task-other-workspace',
          identifier: 'OTHER-1',
          instruction: 'Assigned in another workspace',
          seq: 1,
          workspaceId: otherWorkspaceId,
        },
      ]);

      await model.removeMember(workspaceId, memberId);

      const taskRows = await serverDB.select().from(tasks);
      expect(
        taskRows.find((task) => task.id === 'wm-task-departing-member')?.assigneeUserId,
      ).toBeNull();
      expect(
        taskRows.find((task) => task.id === 'wm-task-departing-member')?.reviewerUserId,
      ).toBeNull();
      expect(taskRows.find((task) => task.id === 'wm-task-other-member')?.assigneeUserId).toBe(
        otherUserId,
      );
      expect(taskRows.find((task) => task.id === 'wm-task-other-workspace')?.assigneeUserId).toBe(
        memberId,
      );
    });

    // Regression: the old OR-predicate update cleared BOTH responsibility
    // fields wherever EITHER matched, so removing an assignee also clobbered
    // a different member's reviewer slot (and vice versa).
    it('keeps a different teammate reviewer when only the assignee departs', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);
      await model.addMember({ userId: memberId, workspaceId });
      await model.addMember({ userId: otherUserId, workspaceId });
      await serverDB.insert(tasks).values({
        assigneeUserId: memberId,
        createdByUserId: inviterId,
        id: 'wm-task-split-assignee',
        identifier: 'WM-SPLIT-1',
        instruction: 'Sam assigns, Alex reviews',
        reviewerUserId: otherUserId,
        seq: 1,
        workspaceId,
      });

      await model.removeMember(workspaceId, memberId);

      const [task] = await serverDB
        .select()
        .from(tasks)
        .where(eq(tasks.id, 'wm-task-split-assignee'));
      expect(task.assigneeUserId).toBeNull();
      expect(task.reviewerUserId).toBe(otherUserId);
    });

    it('keeps a different teammate assignee when only the reviewer departs', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);
      await model.addMember({ userId: memberId, workspaceId });
      await model.addMember({ userId: otherUserId, workspaceId });
      await serverDB.insert(tasks).values({
        assigneeUserId: otherUserId,
        createdByUserId: inviterId,
        id: 'wm-task-split-reviewer',
        identifier: 'WM-SPLIT-2',
        instruction: 'Alex assigns, Sam reviews',
        reviewerUserId: memberId,
        seq: 1,
        workspaceId,
      });

      await model.removeMember(workspaceId, memberId);

      const [task] = await serverDB
        .select()
        .from(tasks)
        .where(eq(tasks.id, 'wm-task-split-reviewer'));
      expect(task.assigneeUserId).toBe(otherUserId);
      expect(task.reviewerUserId).toBeNull();
    });

    it('bumps authzVersion so cached authorizations invalidate on removal', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);
      await model.addMember({ userId: memberId, workspaceId });

      await model.removeMember(workspaceId, memberId);

      const [row] = await serverDB
        .select()
        .from(workspaceMembers)
        .where(
          and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, memberId)),
        );
      expect(row.authzVersion).toBe(2);
    });
  });

  describe('updateMemberRole', () => {
    it('updates the role of an active member', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);
      await model.addMember({ role: 'member', userId: memberId, workspaceId });

      await model.updateMemberRole(workspaceId, memberId, 'admin');

      const found = await model.getMember(workspaceId, memberId);
      expect(found?.role).toBe('admin');
    });

    it('does not update the role of a soft-deleted member', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);
      await model.addMember({ role: 'member', userId: memberId, workspaceId });
      await model.removeMember(workspaceId, memberId);

      await model.updateMemberRole(workspaceId, memberId, 'admin');

      const [row] = await serverDB
        .select()
        .from(workspaceMembers)
        .where(eq(workspaceMembers.userId, memberId));
      expect(row.role).toBe('member');
    });

    it('clears task assignments when a member becomes a viewer', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);
      await model.addMember({ role: 'member', userId: memberId, workspaceId });
      await serverDB.insert(tasks).values({
        assigneeUserId: memberId,
        createdByUserId: inviterId,
        id: 'wm-task-role-downgrade',
        identifier: 'WM-ROLE-1',
        instruction: 'Assigned before the role downgrade',
        reviewerUserId: memberId,
        seq: 1,
        workspaceId,
      });

      await model.updateMemberRole(workspaceId, memberId, 'viewer');

      const [task] = await serverDB
        .select()
        .from(tasks)
        .where(eq(tasks.id, 'wm-task-role-downgrade'));
      expect(task.assigneeUserId).toBeNull();
      expect(task.domainRevision).toBe(2);
      expect(task.reviewerUserId).toBeNull();
      await expect(
        serverDB.select().from(taskDomainEvents).where(eq(taskDomainEvents.taskId, task.id)),
      ).resolves.toEqual([expect.objectContaining({ source: 'system', type: 'task.assigned' })]);
    });

    it('preserves task assignments when a member changes to another eligible role', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);
      await model.addMember({ role: 'member', userId: memberId, workspaceId });
      await serverDB.insert(tasks).values({
        assigneeUserId: memberId,
        createdByUserId: inviterId,
        id: 'wm-task-eligible-role',
        identifier: 'WM-ROLE-2',
        instruction: 'Assigned before the eligible role change',
        reviewerUserId: memberId,
        seq: 1,
        workspaceId,
      });

      await model.updateMemberRole(workspaceId, memberId, 'admin');

      const [task] = await serverDB
        .select()
        .from(tasks)
        .where(eq(tasks.id, 'wm-task-eligible-role'));
      expect(task.assigneeUserId).toBe(memberId);
      expect(task.reviewerUserId).toBe(memberId);
    });

    // Same independent-detach regression as removeMember: downgrading the
    // assignee must not clobber a different member's reviewer slot.
    it('keeps a different teammate reviewer when the assignee is downgraded', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);
      await model.addMember({ role: 'member', userId: memberId, workspaceId });
      await model.addMember({ role: 'member', userId: otherUserId, workspaceId });
      await serverDB.insert(tasks).values({
        assigneeUserId: memberId,
        createdByUserId: inviterId,
        id: 'wm-task-role-split',
        identifier: 'WM-ROLE-3',
        instruction: 'Sam assigned, Alex reviewing',
        reviewerUserId: otherUserId,
        seq: 1,
        workspaceId,
      });

      await model.updateMemberRole(workspaceId, memberId, 'viewer');

      const [task] = await serverDB.select().from(tasks).where(eq(tasks.id, 'wm-task-role-split'));
      expect(task.assigneeUserId).toBeNull();
      expect(task.reviewerUserId).toBe(otherUserId);
    });
  });

  describe('suspendMember / resumeMember', () => {
    it('suspends an active member so authorization checks fail while the row stays', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);
      await model.addMember({ userId: memberId, workspaceId });

      const suspended = await model.suspendMember(workspaceId, memberId);

      expect(suspended).toHaveLength(1);
      expect(suspended[0].suspendedAt).not.toBeNull();
      expect(suspended[0].authzVersion).toBe(2);
      expect(suspended[0].deletedAt).toBeNull();
      // The permission-checking read must fail closed on suspension.
      expect(await model.getMember(workspaceId, memberId)).toBeUndefined();
      // Active-member listing hides the suspended row too …
      expect(
        (await model.listMembers(workspaceId)).find((row) => row.userId === memberId),
      ).toBeUndefined();
      // …while the raw row is still there for management views.
      const rows = await model.listMembers(workspaceId, { includeDeleted: true });
      expect(rows.find((row) => row.userId === memberId)?.suspendedAt).not.toBeNull();
    });

    it('resumes a suspended member and bumps authzVersion again', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);
      await model.addMember({ userId: memberId, workspaceId });
      await model.suspendMember(workspaceId, memberId);

      const resumed = await model.resumeMember(workspaceId, memberId);

      expect(resumed).toHaveLength(1);
      expect(resumed[0].suspendedAt).toBeNull();
      expect(resumed[0].authzVersion).toBe(3);
      expect((await model.getMember(workspaceId, memberId))?.userId).toBe(memberId);
    });

    it('re-adding a removed member clears suspension state and bumps authzVersion', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);
      await model.addMember({ role: 'admin', userId: memberId, workspaceId });
      await model.suspendMember(workspaceId, memberId);
      await model.removeMember(workspaceId, memberId);

      const readded = await model.addMember({ role: 'viewer', userId: memberId, workspaceId });

      expect(readded.deletedAt).toBeNull();
      expect(readded.suspendedAt).toBeNull();
      expect(readded.role).toBe('viewer');
      expect(readded.authzVersion).toBe(4);
    });

    it('is a no-op when suspending an already suspended member', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);
      await model.addMember({ userId: memberId, workspaceId });
      await model.suspendMember(workspaceId, memberId);

      expect(await model.suspendMember(workspaceId, memberId)).toHaveLength(0);
    });
  });

  describe('createInvitation', () => {
    it('creates an invitation with the default role and a pending status', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);

      const result = await model.createInvitation({ email: 'a@b.com', workspaceId });

      expect(result.workspaceId).toBe(workspaceId);
      expect(result.inviterId).toBe(inviterId);
      expect(result.email).toBe('a@b.com');
      expect(result.role).toBe('member');
      expect(result.status).toBe('pending');
      // 32 random bytes, base64url-encoded — returned exactly once.
      expect(result.token).toHaveLength(43);
    });

    it('persists only the token digest, never the raw bearer token', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);

      const result = await model.createInvitation({ email: 'Hash@Test.com ', workspaceId });

      const [row] = await serverDB
        .select()
        .from(workspaceInvitations)
        .where(eq(workspaceInvitations.id, result.id));
      expect(row.token).toBeNull();
      expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.tokenHash).not.toBe(result.token);
      expect(row.emailNormalized).toBe('hash@test.com');
      expect(row.generation).toBe(1);
    });

    it('creates an invitation with an explicit role and an expiry INVITATION_EXPIRY_DAYS out', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);
      const before = Date.now();

      const result = await model.createInvitation({ role: 'admin', workspaceId });

      expect(result.role).toBe('admin');
      expect(result.email).toBeNull();
      const expectedMs = INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
      const diff = result.expiresAt.getTime() - before;
      // allow generous slack for test execution time
      expect(diff).toBeGreaterThan(expectedMs - 60_000);
      expect(diff).toBeLessThan(expectedMs + 60_000);
    });

    it('generates a unique token per invitation', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);

      const a = await model.createInvitation({ workspaceId });
      const b = await model.createInvitation({ workspaceId });

      expect(a.token).not.toBe(b.token);
    });
  });

  describe('findInvitationByToken', () => {
    it('finds an invitation by its token', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);
      const created = await model.createInvitation({ workspaceId });

      const found = await model.findInvitationByToken(created.token);

      expect(found?.id).toBe(created.id);
    });

    it('returns undefined for an unknown token', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);

      expect(await model.findInvitationByToken('does-not-exist')).toBeUndefined();
    });
  });

  describe('listPendingInvitations', () => {
    it('lists only pending invitations for the workspace', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);
      const pending = await model.createInvitation({ workspaceId });
      const accepted = await model.createInvitation({ workspaceId });
      await model.updateInvitationStatus(accepted.id, 'accepted');

      const rows = await model.listPendingInvitations(workspaceId);

      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(pending.id);
    });

    it('does not include invitations from other workspaces', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);
      await model.createInvitation({ workspaceId });
      const otherModel = new WorkspaceMemberModel(serverDB, otherUserId);
      await otherModel.createInvitation({ workspaceId: otherWorkspaceId });

      const rows = await model.listPendingInvitations(workspaceId);

      expect(rows).toHaveLength(1);
      expect(rows[0].workspaceId).toBe(workspaceId);
    });

    it('returns an empty list when there are no pending invitations', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);

      expect(await model.listPendingInvitations(workspaceId)).toEqual([]);
    });
  });

  describe('revokeInvitation', () => {
    it('sets the invitation status to revoked', async () => {
      const model = new WorkspaceMemberModel(serverDB, inviterId);
      const created = await model.createInvitation({ workspaceId });

      await model.revokeInvitation(created.id);

      const [row] = await serverDB
        .select()
        .from(workspaceInvitations)
        .where(eq(workspaceInvitations.id, created.id));
      expect(row.status).toBe('revoked');
    });
  });

  describe('updateInvitationStatus', () => {
    it.each(['accepted', 'expired', 'revoked'] as const)(
      'updates the invitation status to %s',
      async (status) => {
        const model = new WorkspaceMemberModel(serverDB, inviterId);
        const created = await model.createInvitation({ workspaceId });

        await model.updateInvitationStatus(created.id, status);

        const found = await model.findInvitationByToken(created.token);
        expect(found?.status).toBe(status);
      },
    );
  });
});
