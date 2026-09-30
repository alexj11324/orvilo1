import { randomUUID } from 'node:crypto';

import {
  agents,
  taskDispatches,
  tasks,
  taskTopics,
  topics,
  workspaceMembers,
  workspaces,
} from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import { createTestUser } from '@/server/routers/lambda/__tests__/integration/setup';
import { AgentDelegationService } from '@/server/services/agentDelegation/executionGrants';

import type { CanonicalRunBinding } from './canonicalRun';

/** Seeds actual canonical rows only in the disposable acceptance database. */
export async function createCanonicalRunFixture(db: OrviloDatabase): Promise<CanonicalRunBinding> {
  const userId = await createTestUser(db);
  const [workspace] = await db
    .insert(workspaces)
    .values({ name: 'Core', primaryOwnerId: userId, slug: randomUUID() })
    .returning();
  await db.insert(workspaceMembers).values({ userId, workspaceId: workspace.id, role: 'owner' });
  const agentId = `agt_${randomUUID()}`;
  await db.insert(agents).values({ id: agentId, userId, workspaceId: workspace.id });
  const topicId = `tpc_${randomUUID()}`;
  await db.insert(topics).values({ id: topicId, userId, workspaceId: workspace.id });
  const [task] = await db
    .insert(tasks)
    .values({
      createdByUserId: userId,
      workspaceId: workspace.id,
      identifier: 'CORE-1',
      seq: 1,
      instruction: 'test',
      status: 'running',
      assigneeAgentId: agentId,
      executionGeneration: 1,
      currentTopicId: topicId,
    })
    .returning();
  const dispatchId = randomUUID();
  const operationId = randomUUID();
  await db.insert(taskDispatches).values({
    id: dispatchId,
    workspaceId: workspace.id,
    taskId: task.id,
    agentId,
    phase: 'running',
    generation: 1,
    fence: 2,
    taskRevision: task.domainRevision,
    policyRevision: task.policyRevision,
    requirementRevision: task.requirementRevision,
    operationId,
    idempotencyKey: randomUUID(),
    requestedBy: `manual:${userId}`,
    leaseOwner: 'registered-core-host',
    leaseExpiresAt: new Date(Date.now() + 60_000),
  });
  await db.insert(taskTopics).values({
    taskId: task.id,
    topicId,
    userId,
    workspaceId: workspace.id,
    seq: 1,
    operationId,
    dispatchId,
    dispatchFence: 2,
    executionGeneration: 1,
    policyRevision: task.policyRevision,
    requirementRevision: task.requirementRevision,
  });
  const service = new AgentDelegationService(db, userId, workspace.id);
  const grant = await service.createGrant({
    agentId,
    allowedActions: ['run', 'file.write'],
    expiresAt: new Date(Date.now() + 60_000),
    task: { id: task.id, projectId: null, workspaceId: workspace.id },
  });
  const executionEpoch = await service.claimExecutionEpoch({
    grantId: grant.id,
    taskId: task.id,
    topicId,
  });
  const binding: CanonicalRunBinding = {
    workspaceId: workspace.id,
    userId,
    taskId: task.id,
    dispatchId,
    dispatchFence: 2,
    generation: 1,
    operationId,
    topicId,
    grantId: grant.id,
    executionEpoch,
    leaseOwner: 'registered-core-host',
    policyRevision: task.policyRevision,
    stateRevision: task.domainRevision,
  };
  return binding;
}
