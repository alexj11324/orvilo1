// @vitest-environment node
import { randomUUID } from 'node:crypto';

import type { OrviloDatabase } from '@orvilo/database';
import {
  agentOperations,
  agents,
  messagePlugins,
  messages,
  projects,
  tasks,
  taskTopics,
  topics,
  users,
  workspaceMembers,
  workspaces,
} from '@orvilo/database/schemas';
import { getTestDB } from '@orvilo/database/test-utils';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResourcePermissionModel } from '@/database/models/resourcePermission';

import { resolvePendingSlackReply, submitPendingSlackReply } from './nativeReply';

const endpoint = vi.hoisted(() => ({ createCaller: vi.fn(), submit: vi.fn() }));
vi.mock('@/server/routers/lambda/aiAgent', () => ({
  aiAgentRouter: { createCaller: endpoint.createCaller },
}));

let db: OrviloDatabase;
let actor: string;
let owner: string;
let workspaceId: string;
let agentId: string;
let taskId: string;
let topicId: string;
let operationId: string;
let toolMessageId: string;
const sourceTopicId = 'slack-source-discussion';
const toolCallId = 'native-tool-call';
const nativeQuestion = 'Write the requested file?';
const form = {
  questions: [
    {
      header: 'Native permission',
      question: nativeQuestion,
      multiSelect: false,
      options: [
        { id: 'allow_once', label: 'Allow once' },
        { id: 'reject', label: 'Reject' },
      ],
      unknown: 'discarded-question-field',
    },
  ],
  credentials: 'discarded-private-field',
};
const scope = () => ({ db, userId: actor, workspaceId, agentId, sourceTopicId });
const reply = () => ({
  ...scope(),
  topicId,
  operationId,
  toolCallId,
  toolMessageId,
  optionId: 'allow_once',
  resolutionRequestId: randomUUID(),
});

beforeEach(async () => {
  db = await getTestDB();
  actor = randomUUID();
  owner = randomUUID();
  workspaceId = `native-${actor}`;
  agentId = `agent-${actor}`;
  taskId = `task-${actor}`;
  topicId = `topic-${actor}`;
  operationId = `operation-${actor}`;
  toolMessageId = `message-${actor}`;
  await db.insert(users).values([{ id: actor }, { id: owner }]);
  await db
    .insert(workspaces)
    .values({ id: workspaceId, name: 'Native replies', slug: workspaceId, primaryOwnerId: owner });
  await db.insert(workspaceMembers).values([
    { workspaceId, userId: actor, role: 'member' },
    { workspaceId, userId: owner, role: 'owner' },
  ]);
  await db.insert(agents).values({ id: agentId, userId: owner, workspaceId, visibility: 'public' });
  await new ResourcePermissionModel(db, workspaceId).upsertCollaborators({
    accessLevel: 'use',
    createdBy: owner,
    resourceType: 'agent',
    resourceId: agentId,
    userIds: [actor],
  });
  await db.insert(topics).values({ id: topicId, userId: owner, workspaceId, agentId });
  await db.insert(tasks).values({
    id: taskId,
    createdByUserId: owner,
    workspaceId,
    identifier: 'NATIVE-1',
    seq: 1,
    instruction: 'Issue',
    currentTopicId: topicId,
    assigneeUserId: actor,
    assigneeAgentId: agentId,
    context: { origin: { topicId: sourceTopicId, agentId } },
  });
  await db
    .insert(agentOperations)
    .values({ id: operationId, userId: owner, workspaceId, agentId, topicId, status: 'running' });
  await db
    .insert(taskTopics)
    .values({ taskId, topicId, operationId, userId: owner, workspaceId, seq: 1 });
  await db.insert(messages).values({
    id: toolMessageId,
    role: 'tool',
    userId: owner,
    workspaceId,
    topicId,
    agentId,
    content: '',
  });
  await db.insert(messagePlugins).values({
    id: toolMessageId,
    userId: owner,
    workspaceId,
    apiName: 'askUserQuestion',
    identifier: 'codex',
    toolCallId,
    arguments: JSON.stringify(form),
    intervention: { operationId, status: 'pending' },
    state: {
      heterogeneousIntervention: {
        interactionKind: 'permission',
        provider: 'codex',
        deadline: Date.now() + 60_000,
      },
      credentials: 'discarded-runtime-field',
    },
  });
  endpoint.createCaller.mockReturnValue({ submitHeteroIntervention: endpoint.submit });
  endpoint.submit.mockResolvedValue({ success: true, status: 'resolving' });
});
afterEach(async () => {
  await db.delete(agentOperations).where(eq(agentOperations.workspaceId, workspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(users).where(eq(users.id, actor));
  await db.delete(users).where(eq(users.id, owner));
  vi.clearAllMocks();
});

describe('Slack native replies bound to the recorded Issue origin', () => {
  it('returns exact native choices to the authorized current assignee without Run metadata', async () => {
    const pending = await resolvePendingSlackReply(scope());
    expect(pending).toMatchObject({
      operationId,
      toolMessageId,
      toolCallId,
      taskId,
      topicId,
      interactionKind: 'permission',
      prompt: nativeQuestion,
      options: [
        { id: 'allow_once', label: 'Allow once' },
        { id: 'reject', label: 'Reject' },
      ],
    });
    expect(JSON.stringify(pending)).not.toContain('discarded-');
    expect(pending).not.toHaveProperty('userId');
  });

  it('publishes exact provider consent with the replying actor and original Run target', async () => {
    await expect(submitPendingSlackReply(reply())).resolves.toMatchObject({
      success: true,
      status: 'resolving',
    });
    expect(endpoint.createCaller).toHaveBeenCalledWith({ userId: actor, workspaceId });
    expect(endpoint.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId,
        toolMessageId,
        toolCallId,
        result: { [nativeQuestion]: 'allow_once' },
      }),
    );
    const [operation] = await db
      .select()
      .from(agentOperations)
      .where(eq(agentOperations.id, operationId));
    expect(operation.userId).toBe(owner);
  });

  it('authorizes the actual saved Run Agent when it differs from the Slack channel Agent', async () => {
    const runAgentId = `run-agent-${actor}`;
    await db
      .insert(agents)
      .values({ id: runAgentId, userId: owner, workspaceId, visibility: 'public' });
    await new ResourcePermissionModel(db, workspaceId).upsertCollaborators({
      accessLevel: 'use',
      createdBy: owner,
      resourceType: 'agent',
      resourceId: runAgentId,
      userIds: [actor],
    });
    await db
      .update(agentOperations)
      .set({ agentId: runAgentId })
      .where(eq(agentOperations.id, operationId));
    await db.update(topics).set({ agentId: runAgentId }).where(eq(topics.id, topicId));
    await db.update(messages).set({ agentId: runAgentId }).where(eq(messages.id, toolMessageId));
    await db.update(tasks).set({ assigneeAgentId: runAgentId }).where(eq(tasks.id, taskId));
    expect(await resolvePendingSlackReply(scope())).toMatchObject({ operationId, topicId });
    await new ResourcePermissionModel(db, workspaceId).upsertCollaborators({
      accessLevel: 'view',
      createdBy: owner,
      resourceType: 'agent',
      resourceId: runAgentId,
      userIds: [actor],
    });
    await expect(resolvePendingSlackReply(scope())).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('maps structured questions without converting provider ids to labels', async () => {
    await db
      .update(messagePlugins)
      .set({
        state: {
          heterogeneousIntervention: {
            interactionKind: 'question',
            provider: 'codex',
            deadline: Date.now() + 60_000,
          },
        },
      })
      .where(eq(messagePlugins.id, toolMessageId));
    const { optionId: _option, ...input } = reply();
    await submitPendingSlackReply({ ...input, answers: { [nativeQuestion]: 'Specific answer' } });
    expect(endpoint.submit).toHaveBeenCalledWith(
      expect.objectContaining({ result: { [nativeQuestion]: 'Specific answer' } }),
    );
  });

  it.each(['source', 'agent', 'workspace', 'topic'] as const)(
    'refuses an unrelated %s locator',
    async (field) => {
      const overrides = {
        source: { sourceTopicId: 'another-thread' },
        agent: { agentId: 'another-agent' },
        workspace: { workspaceId: 'another-workspace' },
        topic: { topicId: 'another-run' },
      };
      expect(await resolvePendingSlackReply({ ...scope(), ...overrides[field] })).toBeNull();
      expect(endpoint.submit).not.toHaveBeenCalled();
    },
  );

  it('refuses standalone private conversations and ambiguous linked Issues', async () => {
    await db.delete(taskTopics).where(eq(taskTopics.taskId, taskId));
    expect(await resolvePendingSlackReply(scope())).toBeNull();
    await db
      .insert(taskTopics)
      .values({ taskId, topicId, operationId, userId: owner, workspaceId, seq: 1 });
    const secondTask = `task2-${actor}`;
    await db.insert(tasks).values({
      id: secondTask,
      createdByUserId: owner,
      workspaceId,
      identifier: 'NATIVE-2',
      seq: 2,
      instruction: 'Other Issue',
      currentTopicId: topicId,
      context: { origin: { topicId: sourceTopicId, agentId } },
    });
    await db
      .insert(taskTopics)
      .values({ taskId: secondTask, topicId, operationId, userId: owner, workspaceId, seq: 1 });
    expect(await resolvePendingSlackReply(scope())).toBeNull();
  });

  it('denies a non-assignee, revoked Use and removed membership', async () => {
    await db.update(tasks).set({ assigneeUserId: owner }).where(eq(tasks.id, taskId));
    await expect(resolvePendingSlackReply(scope())).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await db.update(tasks).set({ assigneeUserId: actor }).where(eq(tasks.id, taskId));
    await new ResourcePermissionModel(db, workspaceId).upsertCollaborators({
      accessLevel: 'view',
      createdBy: owner,
      resourceType: 'agent',
      resourceId: agentId,
      userIds: [actor],
    });
    await expect(resolvePendingSlackReply(scope())).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await db
      .update(workspaceMembers)
      .set({ deletedAt: new Date() })
      .where(eq(workspaceMembers.userId, actor));
    expect(await resolvePendingSlackReply(scope())).toBeNull();
    expect(endpoint.submit).not.toHaveBeenCalled();
  });

  it('keeps a private Project above its otherwise readable Issue', async () => {
    const projectId = `project-${actor}`;
    await db.insert(projects).values({
      id: projectId,
      identifier: 'PRIV',
      name: 'Private Project',
      userId: owner,
      workspaceId,
      visibility: 'private',
    });
    await db.update(tasks).set({ projectId }).where(eq(tasks.id, taskId));
    expect(await resolvePendingSlackReply(scope())).toBeNull();
    await expect(submitPendingSlackReply(reply())).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(endpoint.submit).not.toHaveBeenCalled();
  });

  it.each(['operation', 'card', 'call', 'option'] as const)(
    'rejects a mismatched reply %s',
    async (field) => {
      const overrides = {
        operation: { operationId: 'another-operation' },
        card: { toolMessageId: 'another-card' },
        call: { toolCallId: 'another-call' },
        option: { optionId: 'Allow once' },
      };
      await expect(
        submitPendingSlackReply({ ...reply(), ...overrides[field] }),
      ).rejects.toMatchObject({ code: field === 'option' ? 'BAD_REQUEST' : 'CONFLICT' });
      expect(endpoint.submit).not.toHaveBeenCalled();
    },
  );

  it.each(['terminal', 'expired', 'resolved', 'owner'] as const)(
    'refuses a %s source before submission',
    async (state) => {
      if (state === 'terminal')
        await db
          .update(agentOperations)
          .set({ status: 'done' })
          .where(eq(agentOperations.id, operationId));
      if (state === 'expired')
        await db
          .update(messagePlugins)
          .set({
            state: {
              heterogeneousIntervention: {
                interactionKind: 'permission',
                provider: 'codex',
                deadline: Date.now() - 1,
              },
            },
          })
          .where(eq(messagePlugins.id, toolMessageId));
      if (state === 'resolved')
        await db
          .update(messagePlugins)
          .set({ intervention: { operationId, status: 'approved' } })
          .where(eq(messagePlugins.id, toolMessageId));
      if (state === 'owner')
        await db
          .update(messagePlugins)
          .set({ userId: actor })
          .where(eq(messagePlugins.id, toolMessageId));
      expect(await resolvePendingSlackReply(scope())).toBeNull();
      await expect(submitPendingSlackReply(reply())).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(endpoint.submit).not.toHaveBeenCalled();
    },
  );

  it('preserves the receipt window and rejects a stale reply window', async () => {
    await db
      .update(messagePlugins)
      .set({
        state: {
          heterogeneousIntervention: {
            interactionKind: 'permission',
            provider: 'codex',
            deadline: Date.now() + 60_000,
            windowId: 'native-window',
          },
        },
      })
      .where(eq(messagePlugins.id, toolMessageId));
    expect(await resolvePendingSlackReply(scope())).toMatchObject({ windowId: 'native-window' });
    await expect(submitPendingSlackReply(reply())).rejects.toMatchObject({ code: 'CONFLICT' });
    await submitPendingSlackReply({ ...reply(), windowId: 'native-window' });
    expect(endpoint.submit).toHaveBeenCalledWith(
      expect.objectContaining({ windowId: 'native-window' }),
    );
  });
});
