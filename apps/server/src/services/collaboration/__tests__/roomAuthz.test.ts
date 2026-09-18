// @vitest-environment node
import { getTestDB } from '@orvilo/database/test-utils';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { OrviloDatabase } from '@/database/type';
import { cleanupTestUser, createTestUser } from '@/server/routers/lambda/__tests__/integration/setup';
import { uuid } from '@/utils/uuid';

import { agents, projects, tasks, workspaceMembers, workspaces } from '../contractTables';
import { assertRoomAccess } from '../roomAuthz';

describe('assertRoomAccess (integration)', () => {
  let db: OrviloDatabase;
  let memberId: string;
  let ownerId: string;
  let outsiderId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;

  beforeEach(async () => {
    db = await getTestDB();
    [ownerId, memberId, outsiderId] = await Promise.all([
      createTestUser(db),
      createTestUser(db),
      createTestUser(db),
    ]);
    const [workspace] = await db
      .insert(workspaces)
      .values({ name: 'Rooms', primaryOwnerId: ownerId, slug: `rooms-${uuid()}` })
      .returning();
    workspaceId = workspace.id;
    const [other] = await db
      .insert(workspaces)
      .values({ name: 'Other', primaryOwnerId: outsiderId, slug: `other-${uuid()}` })
      .returning();
    otherWorkspaceId = other.id;

    await db.insert(workspaceMembers).values([
      { role: 'owner', userId: ownerId, workspaceId },
      { role: 'member', userId: memberId, workspaceId },
      { role: 'owner', userId: outsiderId, workspaceId: otherWorkspaceId },
    ]);
  });

  afterEach(async () => {
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(workspaces).where(eq(workspaces.id, otherWorkspaceId));
    await Promise.all([ownerId, memberId, outsiderId].map((id) => cleanupTestUser(db, id)));
  });

  const insertTask = async (params: { creatorId: string; visibility?: 'private' | 'public'; workspaceId: string }) => {
    const [task] = await db
      .insert(tasks)
      .values({
        createdByUserId: params.creatorId,
        identifier: `T-${uuid().slice(0, 6)}`,
        instruction: 'x',
        seq: 1,
        visibility: params.visibility ?? 'public',
        workspaceId: params.workspaceId,
      })
      .returning();
    return task;
  };

  it('lets an active member authorize the workspace room', async () => {
    await expect(
      assertRoomAccess(db, { userId: memberId, workspaceId }, { id: workspaceId, scope: 'workspace' }),
    ).resolves.toBeUndefined();
  });

  it('rejects a non-member naming the workspace room', async () => {
    await expect(
      assertRoomAccess(db, { userId: outsiderId, workspaceId }, { id: workspaceId, scope: 'workspace' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects a member naming a different workspace room', async () => {
    await expect(
      assertRoomAccess(db, { userId: memberId, workspaceId }, { id: otherWorkspaceId, scope: 'workspace' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects a task room from another workspace', async () => {
    const foreignTask = await insertTask({ creatorId: outsiderId, workspaceId: otherWorkspaceId });
    await expect(
      assertRoomAccess(db, { userId: memberId, workspaceId }, { id: foreignTask.id, scope: 'task' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  const insertProject = async (params: {
    ownerId: string;
    visibility?: 'private' | 'public';
    workspaceId: string;
  }) => {
    const agentId = `agt_${uuid()}`;
    await db.insert(agents).values({ id: agentId, userId: params.ownerId, workspaceId: params.workspaceId });
    const [project] = await db
      .insert(projects)
      .values({
        coordinatorAgentId: agentId,
        identifier: uuid().slice(0, 6).toUpperCase(),
        name: 'Room project',
        userId: params.ownerId,
        visibility: params.visibility ?? 'public',
        workspaceId: params.workspaceId,
      })
      .returning();
    return project;
  };

  it('lets a member join a public project room but not another member\'s private project', async () => {
    const publicProject = await insertProject({ ownerId, workspaceId });
    await expect(
      assertRoomAccess(db, { userId: memberId, workspaceId }, { id: publicProject.id, scope: 'project' }),
    ).resolves.toBeUndefined();

    const privateProject = await insertProject({ ownerId, visibility: 'private', workspaceId });
    await expect(
      assertRoomAccess(db, { userId: memberId, workspaceId }, { id: privateProject.id, scope: 'project' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      assertRoomAccess(db, { userId: ownerId, workspaceId }, { id: privateProject.id, scope: 'project' }),
    ).resolves.toBeUndefined();
  });

  it('rejects a project room from another workspace', async () => {
    const foreignProject = await insertProject({ ownerId: outsiderId, workspaceId: otherWorkspaceId });
    await expect(
      assertRoomAccess(db, { userId: memberId, workspaceId }, { id: foreignProject.id, scope: 'project' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('lets a member join a public task room but not another member\'s private task', async () => {
    const publicTask = await insertTask({ creatorId: ownerId, workspaceId });
    await expect(
      assertRoomAccess(db, { userId: memberId, workspaceId }, { id: publicTask.id, scope: 'task' }),
    ).resolves.toBeUndefined();

    const privateTask = await insertTask({ creatorId: ownerId, visibility: 'private', workspaceId });
    await expect(
      assertRoomAccess(db, { userId: memberId, workspaceId }, { id: privateTask.id, scope: 'task' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // …but the creator keeps access to their own private task room.
    await expect(
      assertRoomAccess(db, { userId: ownerId, workspaceId }, { id: privateTask.id, scope: 'task' }),
    ).resolves.toBeUndefined();
  });

  it('rejects a removed member even for the workspace room', async () => {
    await db
      .update(workspaceMembers)
      .set({ deletedAt: new Date() })
      .where(eq(workspaceMembers.userId, memberId));
    await expect(
      assertRoomAccess(db, { userId: memberId, workspaceId }, { id: workspaceId, scope: 'workspace' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
