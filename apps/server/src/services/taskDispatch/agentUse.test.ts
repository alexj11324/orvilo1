// @vitest-environment node
import type { OrviloDatabase } from '@orvilo/database';
import {
  agents,
  resourcePermissions,
  taskDispatches,
  tasks,
  workspaceMembers,
  workspaces,
} from '@orvilo/database/schemas';
import { getTestDB } from '@orvilo/database/test-utils';
import type { TaskItem } from '@orvilo/types';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cleanupTestUser, createTestUser } from '../../routers/lambda/__tests__/integration/setup';
import { TaskDispatchService } from './index';

// Exercise the real reservation transaction, rather than stopping at Runner's
// front gate. Private selected Agents must reach the same durable claim path.
describe('TaskDispatch reservation Agent Use', () => {
  let db: OrviloDatabase;
  let ownerId: string;
  let memberId: string;
  let workspaceId: string;
  let agentId: string;
  let task: TaskItem;
  beforeEach(async () => {
    db = await getTestDB();
    ownerId = await createTestUser(db);
    memberId = await createTestUser(db);
    const [workspace] = await db
      .insert(workspaces)
      .values({
        name: 'Reservation Use',
        primaryOwnerId: ownerId,
        slug: `reservation-use-${crypto.randomUUID()}`,
      })
      .returning();
    workspaceId = workspace.id;
    await db.insert(workspaceMembers).values([
      { userId: ownerId, workspaceId, role: 'owner' },
      { userId: memberId, workspaceId, role: 'member' },
    ]);
    const [agent] = await db
      .insert(agents)
      .values({
        userId: ownerId,
        workspaceId,
        visibility: 'private',
        title: 'Selected private Agent',
      })
      .returning();
    agentId = agent.id;
    const [row] = await db
      .insert(tasks)
      .values({
        identifier: 'RES-1',
        seq: 1,
        name: 'Reservation',
        instruction: 'Check authorization',
        createdByUserId: ownerId,
        assigneeUserId: ownerId,
        assigneeAgentId: agentId,
        workspaceId,
        visibility: 'public',
      })
      .returning();
    task = row as TaskItem;
  });
  afterEach(async () => {
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await cleanupTestUser(db, memberId);
    await cleanupTestUser(db, ownerId);
  });
  const grant = async () =>
    db.insert(resourcePermissions).values({
      accessLevel: 'use',
      createdBy: ownerId,
      resourceId: agentId,
      resourceType: 'agent',
      userId: memberId,
      workspaceId,
    });
  const prepare = () =>
    new TaskDispatchService(db, workspaceId).prepare({
      task,
      trigger: 'manual',
      origin: 'external',
      executionUserId: memberId,
      initiator: memberId,
      requestedBy: `manual:${memberId}`,
      idempotencyKey: crypto.randomUUID(),
    });
  const unchanged = async () => {
    expect(
      await db.select().from(taskDispatches).where(eq(taskDispatches.taskId, task.id)),
    ).toHaveLength(0);
    expect(
      (await db.select().from(tasks).where(eq(tasks.id, task.id)))[0].executionGeneration,
    ).toBe(0);
  };

  it('reserves a selected private workspace Agent under the actual member principal', async () => {
    await grant();
    const result = await prepare();
    expect(result.dispatch.agentId).toBe(agentId);
    expect(result.dispatch.initiator).toBe(memberId);
    expect(result.dispatch.phase).toBe('claimed');
    expect(result.task.assigneeUserId).toBe(ownerId);
  });

  it('denies a member without Use before inserting a dispatch or advancing generation', async () => {
    await expect(prepare()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await unchanged();
  });

  it('authorizes the locked assignee after the caller snapshot becomes stale', async () => {
    await grant();
    const [otherAgent] = await db
      .insert(agents)
      .values({ userId: ownerId, workspaceId, visibility: 'private', title: 'Changed assignee' })
      .returning();
    await db.update(tasks).set({ assigneeAgentId: otherAgent.id }).where(eq(tasks.id, task.id));
    await expect(prepare()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await unchanged();
  });
});
