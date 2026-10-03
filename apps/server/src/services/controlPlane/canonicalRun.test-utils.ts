import { randomUUID } from 'node:crypto';

import type { RunSubject } from '@orvilo/types';
import { sql } from 'drizzle-orm';

import { ChatExecutionControlModel } from '@/database/models/chatExecutionControl';
import { TaskExecutionControlModel } from '@/database/models/taskExecutionControl';
import {
  agentOperations,
  agents,
  taskDispatches,
  tasks,
  taskTopics,
  topics,
  workspaceMembers,
  workspaces,
} from '@/database/schemas';
import { TASK_EXECUTION_CONTROL_CANDIDATE_SQL } from '@/database/schemas/taskExecutionControl';
import type { OrviloDatabase } from '@/database/type';
import { createTestUser } from '@/server/routers/lambda/__tests__/integration/setup';
import { AgentDelegationService } from '@/server/services/agentDelegation/executionGrants';

import type { CanonicalChatRunBinding } from './canonicalChatRun';
import type { CanonicalRunBinding } from './canonicalRun';

/** Seeds actual canonical rows only in the disposable acceptance database. */
export async function createCanonicalRunFixture(
  db: OrviloDatabase,
  state: 'registering' | 'running' = 'running',
): Promise<CanonicalRunBinding> {
  for (const statement of TASK_EXECUTION_CONTROL_CANDIDATE_SQL) {
    await db.execute(sql.raw(statement));
  }
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
    leaseExpiresAt: new Date(Date.now() + 300_000),
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
    expiresAt: new Date(Date.now() + 300_000),
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
    subject: { dispatchId, kind: 'task', taskId: task.id },
    dispatchId,
    dispatchFence: 2,
    generation: 1,
    operationId,
    topicId,
    grantId: grant.id,
    executionEpoch,
    runtimeRegistrationId: randomUUID(),
    runtimeOwnerId: 'registered-core-host',
    runtimeLeaseId: randomUUID(),
    policyRevision: task.policyRevision,
    stateRevision: task.domainRevision,
  };
  const registration = new TaskExecutionControlModel(db, userId, workspace.id);
  await registration.register(binding, 300_000);
  // Canonical guard fixtures only. Real host acceptance uses registering and
  // supplies actual supervisor proof by launching pinned Prime.
  if (state === 'running')
    await registration.activate(binding, {
      treeId: 'fixture-tree',
      supervisorId: 'fixture-supervisor',
      sessionId: 'fixture-session',
    });
  return binding;
}

/** Fixture bindings built here are task-shaped — narrow the explicit subject
 * for task-side reads (a conversation subject has no task id to return). */
export const fixtureTaskId = (binding: { subject: RunSubject }): string =>
  binding.subject.kind === 'task' ? binding.subject.taskId : 'unreachable';

/**
 * The chat-parallel of `createCanonicalRunFixture`: a live `agent_operations`
 * run on a chat topic (no task/dispatch/taskTopics rows, no grant row), with
 * `metadata.executionControl` registered through `ChatExecutionControlModel`.
 * `workspace: false` seeds a personal-scope chat (tenant `personal:<userId>`).
 */
export async function createCanonicalChatRunFixture(
  db: OrviloDatabase,
  options: { state?: 'registering' | 'running'; workspace?: boolean } = {},
): Promise<CanonicalChatRunBinding> {
  const userId = await createTestUser(db);
  let chatWorkspaceId: string | null = null;
  if (options.workspace !== false) {
    const [workspace] = await db
      .insert(workspaces)
      .values({ name: 'Chat', primaryOwnerId: userId, slug: randomUUID() })
      .returning();
    await db.insert(workspaceMembers).values({ userId, workspaceId: workspace.id, role: 'owner' });
    chatWorkspaceId = workspace.id;
  }
  const agentId = `agt_${randomUUID()}`;
  await db.insert(agents).values({ id: agentId, userId, workspaceId: chatWorkspaceId });
  const topicId = `tpc_${randomUUID()}`;
  await db.insert(topics).values({ agentId, id: topicId, userId, workspaceId: chatWorkspaceId });
  const operationId = `op_${randomUUID()}`;
  await db.insert(agentOperations).values({
    agentId,
    id: operationId,
    status: 'running',
    taskId: null,
    topicId,
    userId,
    workspaceId: chatWorkspaceId,
  });
  const binding: CanonicalChatRunBinding = {
    chatAgentId: agentId,
    chatWorkspaceId,
    dispatchFence: 0,
    dispatchId: operationId,
    executionEpoch: 1,
    generation: 1,
    grantId: operationId,
    operationId,
    policyRevision: 0,
    runExpiresAt: Date.now() + 300_000,
    runtimeLeaseId: randomUUID(),
    runtimeOwnerId: 'registered-chat-host',
    runtimeRegistrationId: randomUUID(),
    stateRevision: 0,
    subject: { kind: 'conversation', topicId },
    topicId,
    userId,
    workspaceId: chatWorkspaceId ?? `personal:${userId}`,
  };
  const registration = new ChatExecutionControlModel(db, userId, binding.workspaceId);
  await registration.register(binding, 300_000);
  if (options.state !== 'registering')
    await registration.activate(binding, {
      treeId: 'fixture-chat-tree',
      supervisorId: 'fixture-chat-supervisor',
      sessionId: 'fixture-chat-session',
    });
  return binding;
}
