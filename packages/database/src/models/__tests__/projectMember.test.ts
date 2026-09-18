import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import {
  agents,
  projectMembers,
  projects,
  users,
  workspaceMembers,
  workspaces,
} from '../../schemas';
import type { LobeChatDatabase } from '../../type';
import { ProjectMemberModel } from '../projectMember';

const serverDB: LobeChatDatabase = await getTestDB();

const ownerId = 'pm-owner';
const memberId = 'pm-member';
const otherUserId = 'pm-other-user';
const workspaceId = 'pm-workspace';
const projectId = 'pm-project';
const otherProjectId = 'pm-other-project';
const coordinatorAgentId = 'pm-coordinator';
const otherCoordinatorAgentId = 'pm-coordinator-2';

beforeEach(async () => {
  await serverDB.delete(users);
  await serverDB.insert(users).values([{ id: ownerId }, { id: memberId }, { id: otherUserId }]);
  await serverDB
    .insert(workspaces)
    .values({ id: workspaceId, name: 'WS', primaryOwnerId: ownerId, slug: 'pm-ws' });
  await serverDB.insert(workspaceMembers).values([
    { role: 'owner', userId: ownerId, workspaceId },
    { role: 'member', userId: memberId, workspaceId },
    { role: 'member', userId: otherUserId, workspaceId },
  ]);
  // projects.coordinatorAgentId is unique — each project needs its own agent.
  await serverDB.insert(agents).values([
    { id: coordinatorAgentId, slug: coordinatorAgentId, userId: ownerId },
    { id: otherCoordinatorAgentId, slug: otherCoordinatorAgentId, userId: ownerId },
  ]);
  await serverDB.insert(projects).values([
    {
      coordinatorAgentId,
      id: projectId,
      identifier: 'PMP',
      name: 'PM project',
      userId: ownerId,
      workspaceId,
    },
    {
      coordinatorAgentId: otherCoordinatorAgentId,
      id: otherProjectId,
      identifier: 'PMO',
      name: 'Other project',
      userId: ownerId,
      workspaceId,
    },
  ]);
});

afterEach(async () => {
  await serverDB.delete(users);
});

const getRow = async (pid: string, uid: string) => {
  const [row] = await serverDB
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, pid), eq(projectMembers.userId, uid)));
  return row;
};

describe('ProjectMemberModel', () => {
  describe('add', () => {
    it('creates an active membership with the granted role', async () => {
      const model = new ProjectMemberModel(serverDB, ownerId);

      const row = await model.add({ projectId, userId: memberId, workspaceId });

      expect(row.role).toBe('contributor');
      expect(row.workspaceId).toBe(workspaceId);
      expect(row.deletedAt).toBeNull();
      expect(row.suspendedAt).toBeNull();
      expect(row.authzVersion).toBe(1);
      expect(row.createdBy).toBe(ownerId);
    });

    it('upserts onto the (project, user) uniqueness instead of duplicating', async () => {
      const model = new ProjectMemberModel(serverDB, ownerId);
      await model.add({ projectId, role: 'viewer', userId: memberId, workspaceId });

      const again = await model.add({ projectId, role: 'manager', userId: memberId, workspaceId });

      expect(again.role).toBe('manager');
      expect(again.authzVersion).toBe(2);
      expect(await model.listByProject(projectId)).toHaveLength(1);
    });

    it('restores a removed member without reviving old suspension state', async () => {
      const model = new ProjectMemberModel(serverDB, ownerId);
      await model.add({ projectId, role: 'viewer', userId: memberId, workspaceId });
      await serverDB
        .update(projectMembers)
        .set({ suspendedAt: new Date() })
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, memberId)));
      await model.remove(projectId, memberId);

      const restored = await model.add({
        projectId,
        role: 'commenter',
        userId: memberId,
        workspaceId,
      });

      expect(restored.deletedAt).toBeNull();
      expect(restored.suspendedAt).toBeNull();
      expect(restored.role).toBe('commenter');
      // add(1) → remove(2) → restore(3); the raw suspendedAt write did not bump.
      expect(restored.authzVersion).toBe(3);
    });

    it('rejects a membership whose project lives in another workspace', async () => {
      const otherWorkspaceId = 'pm-other-workspace';
      await serverDB
        .insert(workspaces)
        .values({ id: otherWorkspaceId, name: 'WS2', primaryOwnerId: ownerId, slug: 'pm-ws-2' });
      await serverDB.insert(workspaceMembers).values([
        { role: 'owner', userId: ownerId, workspaceId: otherWorkspaceId },
        // memberId belongs to both workspaces, so the composite
        // (workspace_id, user_id) FK alone cannot stop the cross-tenant
        // insert — only the project↔workspace consistency check can.
        { role: 'member', userId: memberId, workspaceId: otherWorkspaceId },
      ]);

      const model = new ProjectMemberModel(serverDB, ownerId);

      // projectId lives in `workspaceId`; recording it under another
      // workspace must fail instead of minting a cross-tenant grant.
      await expect(
        model.add({ projectId, userId: memberId, workspaceId: otherWorkspaceId }),
      ).rejects.toThrow('Project does not belong to the supplied workspace');
      expect(await model.listByProject(projectId)).toHaveLength(0);
    });
  });

  describe('remove', () => {
    it('soft-deletes the membership and bumps authzVersion', async () => {
      const model = new ProjectMemberModel(serverDB, ownerId);
      await model.add({ projectId, userId: memberId, workspaceId });

      const removed = await model.remove(projectId, memberId);

      expect(removed).toHaveLength(1);
      expect(removed[0].deletedAt).not.toBeNull();
      expect(removed[0].authzVersion).toBe(2);
      expect(await model.getRole(projectId, memberId)).toBeNull();
      // The row is hidden from listings but still exists for `add` to restore.
      expect(await model.listByProject(projectId)).toHaveLength(0);
      expect((await getRow(projectId, memberId))?.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('changeRole', () => {
    it('changes the role and bumps authzVersion', async () => {
      const model = new ProjectMemberModel(serverDB, ownerId);
      await model.add({ projectId, role: 'viewer', userId: memberId, workspaceId });

      const updated = await model.changeRole(projectId, memberId, 'manager');

      expect(updated).toHaveLength(1);
      expect(updated[0].role).toBe('manager');
      expect(updated[0].authzVersion).toBe(2);
      expect(await model.getRole(projectId, memberId)).toBe('manager');
    });
  });

  describe('getRole', () => {
    it('returns null for a suspended member even though the row exists', async () => {
      const model = new ProjectMemberModel(serverDB, ownerId);
      await model.add({ projectId, userId: memberId, workspaceId });
      await serverDB
        .update(projectMembers)
        .set({ suspendedAt: new Date() })
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, memberId)));

      expect(await model.getRole(projectId, memberId)).toBeNull();
    });

    it('returns null for non-members', async () => {
      const model = new ProjectMemberModel(serverDB, ownerId);

      expect(await model.getRole(projectId, memberId)).toBeNull();
    });
  });

  describe('listByProject / listByUser', () => {
    it('lists only non-deleted members of the project', async () => {
      const model = new ProjectMemberModel(serverDB, ownerId);
      await model.add({ projectId, userId: memberId, workspaceId });
      await model.add({ projectId, userId: otherUserId, workspaceId });
      await model.remove(projectId, otherUserId);

      const rows = await model.listByProject(projectId);

      expect(rows).toHaveLength(1);
      expect(rows[0].userId).toBe(memberId);
    });

    it('lists the user’s memberships inside the workspace only', async () => {
      const model = new ProjectMemberModel(serverDB, ownerId);
      await model.add({ projectId, userId: memberId, workspaceId });
      await model.add({ projectId: otherProjectId, userId: memberId, workspaceId });

      const rows = await model.listByUser(workspaceId, memberId);

      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.workspaceId === workspaceId)).toBe(true);
    });
  });
});
