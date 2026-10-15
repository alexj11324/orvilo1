// @vitest-environment node
import type { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import {
  agentOperations,
  agents,
  projectMembers,
  projects,
  resourcePermissions,
  tasks,
  taskTopics,
  topics,
  users,
  workspaceMembers,
  workspaces,
} from '@/database/schemas';

import { assertCanUseOperationAgent } from './nativeInterventionInput';

const db = await getTestDB();
const owner = 'native-card-owner';
const member = 'native-card-member';
const workspaceId = 'native-card-workspace';
const agentId = 'native-card-agent';
const topicId = 'native-card-topic';
const taskId = 'native-card-task';
const operationId = 'native-card-operation';
const projectId = 'native-card-project';

const cleanup = async () => {
  await db.delete(users).where(eq(users.id, owner));
  await db.delete(users).where(eq(users.id, member));
};

beforeEach(async () => {
  await cleanup();
  await db.insert(users).values([{ id: owner }, { id: member }]);
  await db
    .insert(workspaces)
    .values({ id: workspaceId, name: 'Cards', slug: workspaceId, primaryOwnerId: owner });
  await db.insert(workspaceMembers).values([
    { role: 'owner', userId: owner, workspaceId },
    { role: 'member', userId: member, workspaceId },
  ]);
  await db.insert(projects).values({
    id: projectId,
    identifier: 'CARD',
    name: 'Private',
    userId: owner,
    visibility: 'private',
    workspaceId,
  });
  await db.insert(agents).values({
    id: agentId,
    slug: agentId,
    title: 'Card agent',
    userId: owner,
    visibility: 'public',
    workspaceId,
  });
  await db.insert(topics).values({ id: topicId, userId: owner, workspaceId });
  await db.insert(tasks).values({
    assigneeAgentId: agentId,
    assigneeUserId: member,
    createdByUserId: owner,
    currentTopicId: topicId,
    id: taskId,
    identifier: 'CARD1',
    instruction: 'Private issue',
    projectId,
    seq: 1,
    visibility: 'public',
    workspaceId,
  });
  await db.insert(taskTopics).values({
    operationId,
    seq: 1,
    taskId,
    topicId,
    userId: owner,
    visibility: 'public',
    workspaceId,
  });
  await db.insert(agentOperations).values({
    agentId,
    id: operationId,
    status: 'waiting_for_human',
    topicId,
    userId: owner,
    workspaceId,
  });
  await db.insert(resourcePermissions).values({
    accessLevel: 'use',
    createdBy: owner,
    resourceId: agentId,
    resourceType: 'agent',
    userId: member,
    workspaceId,
  });
});

afterEach(cleanup);

describe('assertCanUseOperationAgent', () => {
  it('refuses a private Project run until the caller can read that Project', async () => {
    await expect(
      assertCanUseOperationAgent({ db, operationId, userId: member, workspaceId }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Operation is outside the caller scope',
    } satisfies Partial<TRPCError>);

    await db.insert(projectMembers).values({
      projectId,
      role: 'contributor',
      userId: member,
      workspaceId,
    });

    await expect(
      assertCanUseOperationAgent({ db, operationId, userId: member, workspaceId }),
    ).resolves.toMatchObject({ agentId, topicId, userId: owner });
  });
});
