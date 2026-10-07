// @vitest-environment node
import type { OrviloDatabase } from '@orvilo/database';
import {
  agentOperations,
  agents,
  resourcePermissions,
  tasks,
  taskTopics,
  topics,
  workspaceMembers,
  workspaces,
} from '@orvilo/database/schemas';
import { getTestDB } from '@orvilo/database/test-utils';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskService } from '@/server/services/task';
import { TaskDispatchService } from '@/server/services/taskDispatch';

import { taskRouter } from '../task';
import { cleanupTestUser, createTestUser } from './integration/setup';

let testDB: OrviloDatabase;
vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: vi.fn(() => testDB) }));

describe('Task execution Agent Use before effects', () => {
  let ownerId: string;
  let memberId: string;
  let workspaceId: string;
  let agentId: string;
  let taskId: string;
  let topicId: string;
  let caller: ReturnType<typeof taskRouter.createCaller>;
  let pause: ReturnType<typeof vi.spyOn>;
  let cancel: ReturnType<typeof vi.spyOn>;
  let handoff: ReturnType<typeof vi.spyOn>;
  let prepare: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    testDB = await getTestDB();
    ownerId = await createTestUser(testDB);
    memberId = await createTestUser(testDB);
    const [workspace] = await testDB
      .insert(workspaces)
      .values({
        name: 'Task Use guard',
        primaryOwnerId: ownerId,
        slug: `task-use-${crypto.randomUUID()}`,
      })
      .returning();
    workspaceId = workspace.id;
    await testDB.insert(workspaceMembers).values([
      { role: 'owner', userId: ownerId, workspaceId },
      { role: 'member', userId: memberId, workspaceId },
    ]);
    const [agent] = await testDB
      .insert(agents)
      .values({
        userId: ownerId,
        workspaceId,
        visibility: 'private',
        title: 'Private executor',
        model: 'gpt-4o',
        provider: 'openai',
      })
      .returning();
    agentId = agent.id;
    const [task] = await testDB
      .insert(tasks)
      .values({
        identifier: 'USE-1',
        seq: 1,
        createdByUserId: ownerId,
        workspaceId,
        visibility: 'public',
        assigneeAgentId: agentId,
        assigneeUserId: ownerId,
        name: 'Use guard',
        instruction: 'Verify permissions',
      })
      .returning();
    taskId = task.id;
    const [topic] = await testDB
      .insert(topics)
      .values({ userId: ownerId, workspaceId, agentId, title: 'Current run' })
      .returning();
    topicId = topic.id;
    await testDB.insert(taskTopics).values({
      taskId,
      topicId,
      userId: ownerId,
      workspaceId,
      visibility: 'private',
      status: 'running',
      seq: 1,
    });
    caller = taskRouter.createCaller({
      userId: memberId,
      jwtPayload: { userId: memberId },
      workspaceId,
    });
    pause = vi.spyOn(TaskService.prototype, 'updateStatus').mockResolvedValue({
      task,
      unlocked: [],
      paused: [],
      checkpointTriggered: false,
      allSubtasksDone: false,
    } as never);
    cancel = vi.spyOn(TaskService.prototype, 'cancelTopic').mockResolvedValue(undefined);
    handoff = vi
      .spyOn(TaskService.prototype, 'handoffTask')
      .mockResolvedValue({ state: 'parked', task } as never);
    prepare = vi
      .spyOn(TaskDispatchService.prototype, 'prepare')
      .mockRejectedValue(new Error('Unexpected dispatch'));
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await testDB.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await cleanupTestUser(testDB, memberId);
    await cleanupTestUser(testDB, ownerId);
  });

  const grant = async (agent: string) =>
    testDB.insert(resourcePermissions).values({
      accessLevel: 'use',
      createdBy: ownerId,
      resourceId: agent,
      resourceType: 'agent',
      userId: memberId,
      workspaceId,
    });

  it.each(['member', 'admin'] as const)(
    'denies %s without Use before pause, cancellation, handoff or run preparation',
    async (role) => {
      await testDB
        .update(workspaceMembers)
        .set({ role })
        .where(eq(workspaceMembers.userId, memberId));
      await expect(caller.updateStatus({ id: taskId, status: 'paused' })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      await expect(caller.cancelTopic({ topicId })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(
        caller.handoff({ taskId, toAgentId: null, expectedDomainRevision: 1 }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(caller.run({ id: taskId })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(pause).not.toHaveBeenCalled();
      expect(cancel).not.toHaveBeenCalled();
      expect(handoff).not.toHaveBeenCalled();
      expect(prepare).not.toHaveBeenCalled();
    },
  );

  it('allows a selected member without management authority to pause, cancel and park', async () => {
    await grant(agentId);
    await expect(caller.updateStatus({ id: taskId, status: 'paused' })).resolves.toMatchObject({
      success: true,
    });
    await expect(caller.cancelTopic({ topicId })).resolves.toMatchObject({ success: true });
    await expect(
      caller.handoff({ taskId, toAgentId: null, expectedDomainRevision: 1 }),
    ).resolves.toMatchObject({ success: true });
    expect(pause).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
    expect(handoff).toHaveBeenCalledOnce();
  });

  it('requires Use on the sealed executor instead of a subsequently edited assignee', async () => {
    const [assignee] = await testDB
      .insert(agents)
      .values({ userId: ownerId, workspaceId, visibility: 'public', title: 'New field assignee' })
      .returning();
    await testDB.update(tasks).set({ assigneeAgentId: assignee.id }).where(eq(tasks.id, taskId));
    await grant(assignee.id);
    await expect(caller.updateStatus({ id: taskId, status: 'paused' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(pause).not.toHaveBeenCalled();
    await testDB.delete(resourcePermissions).where(eq(resourcePermissions.resourceId, assignee.id));
    await grant(agentId);
    await expect(caller.updateStatus({ id: taskId, status: 'paused' })).resolves.toMatchObject({
      success: true,
    });
  });

  it('retains personal ownership checks before stopping a foreign personal executor', async () => {
    await testDB.update(agents).set({ workspaceId: null }).where(eq(agents.id, agentId));
    await testDB
      .update(tasks)
      .set({ workspaceId: null, createdByUserId: memberId })
      .where(eq(tasks.id, taskId));
    await testDB
      .update(topics)
      .set({ workspaceId: null, userId: memberId })
      .where(eq(topics.id, topicId));
    await testDB
      .update(taskTopics)
      .set({ workspaceId: null, userId: memberId })
      .where(eq(taskTopics.taskId, taskId));
    const personalCaller = taskRouter.createCaller({
      userId: memberId,
      jwtPayload: { userId: memberId },
    });
    await expect(personalCaller.cancelTopic({ topicId })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(cancel).not.toHaveBeenCalled();
  });

  it('rejects an operation from another workspace before cancellation', async () => {
    await grant(agentId);
    const operationId = `op-wrong-scope-${crypto.randomUUID()}`;
    await testDB.insert(agentOperations).values({
      id: operationId,
      userId: ownerId,
      agentId,
      topicId,
      type: 'execAgent',
      status: 'running',
    });
    await testDB.update(taskTopics).set({ operationId }).where(eq(taskTopics.taskId, taskId));
    await expect(caller.cancelTopic({ topicId })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(cancel).not.toHaveBeenCalled();
  });
});
