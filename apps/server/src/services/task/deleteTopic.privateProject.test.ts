// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { TaskModel } from '@/database/models/task';
import { TaskTopicModel } from '@/database/models/taskTopic';
import {
  projectMembers,
  projects,
  taskTopics,
  topics,
  users,
  workspaceMembers,
  workspaces,
} from '@/database/schemas';

import { TaskService } from './index';

const db = await getTestDB();
const owner = 'delete-topic-owner';
const member = 'delete-topic-member';
const workspaceId = 'delete-topic-workspace';
const projectId = 'delete-topic-project';
const topicId = 'delete-topic-private';

const cleanup = async () => {
  await db.delete(users).where(eq(users.id, owner));
  await db.delete(users).where(eq(users.id, member));
};

beforeEach(async () => {
  await cleanup();
  await db.insert(users).values([{ id: owner }, { id: member }]);
  await db.insert(workspaces).values({
    id: workspaceId,
    name: 'Delete topic',
    primaryOwnerId: owner,
    slug: workspaceId,
  });
  await db.insert(workspaceMembers).values([
    { role: 'owner', userId: owner, workspaceId },
    { role: 'member', userId: member, workspaceId },
  ]);
  await db.insert(projects).values({
    id: projectId,
    identifier: 'DELT',
    name: 'Private delete',
    userId: owner,
    visibility: 'private',
    workspaceId,
  });
  const task = await new TaskModel(db, owner, workspaceId).create({
    instruction: 'Private run',
    name: 'Private run',
    projectId,
  });
  await db.insert(topics).values({ id: topicId, userId: owner, workspaceId });
  await new TaskTopicModel(db, owner, workspaceId).add(task.id, topicId, { seq: 1 });
});

afterEach(cleanup);

describe('TaskService.deleteTopic private Project ceiling', () => {
  it('keeps a private Project run until the member has a grant', async () => {
    const memberService = new TaskService(db, member, workspaceId);
    await expect(memberService.deleteTopic(topicId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(await db.select().from(taskTopics).where(eq(taskTopics.topicId, topicId))).toHaveLength(
      1,
    );

    await db.insert(projectMembers).values({
      projectId,
      role: 'contributor',
      userId: member,
      workspaceId,
    });
    await memberService.deleteTopic(topicId);
    expect(await db.select().from(taskTopics).where(eq(taskTopics.topicId, topicId))).toHaveLength(
      0,
    );
  });
});
