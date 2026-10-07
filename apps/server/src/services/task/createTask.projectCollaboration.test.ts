// @vitest-environment node
import {
  projectMembers,
  projects,
  tasks,
  users,
  workspaceMembers,
  workspaces,
} from '@orvilo/database/schemas';
import { getTestDB } from '@orvilo/database/test-utils';
import { eq, inArray } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { ProjectModel } from '@/database/models/project';

import { TaskService } from './index';

// Ordinary Issue creation does not enter these runtime/provider boundaries.
vi.mock('../aiAgent', () => ({ AiAgentService: vi.fn() }));
vi.mock('../taskRunner', () => ({ TaskRunnerService: vi.fn() }));
vi.mock('../taskIntegration', () => ({ TaskIntegrationService: vi.fn() }));
vi.mock('../taskReview', () => ({ TaskReviewService: vi.fn() }));
vi.mock('../file/resolveAttachments', () => ({ resolveAttachmentMetadata: vi.fn() }));
vi.mock('../verify/taskAcceptance', () => ({ resolveTaskAcceptance: vi.fn() }));
vi.mock('../taskScheduler', () => ({ createTaskSchedulerModule: vi.fn() }));

const db = await getTestDB();
const owner = 'issue-create-owner';
const member = 'issue-create-member';
const viewer = 'issue-create-viewer';
const inactive = 'issue-create-inactive';
const workspaceId = 'issue-create-workspace';
const projectId = 'issue-create-project';
const privateProjectId = 'issue-create-private-project';
const personalProjectId = 'issue-create-personal-project';
const actorIds = [owner, member, viewer, inactive];
const cleanup = async () => {
  await db.delete(projects).where(eq(projects.id, personalProjectId));
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(users).where(inArray(users.id, actorIds));
};

beforeEach(async () => {
  await cleanup();
  await db.insert(users).values(actorIds.map((id) => ({ id })));
  await db.insert(workspaces).values({
    id: workspaceId,
    name: 'Issue creation collaboration',
    primaryOwnerId: owner,
    slug: workspaceId,
  });
  await db.insert(workspaceMembers).values(
    actorIds.map((userId) => ({
      role: userId === owner ? 'owner' : userId === viewer ? 'viewer' : 'member',
      suspendedAt: userId === inactive ? new Date() : null,
      userId,
      workspaceId,
    })),
  );
  await db.insert(projects).values([
    {
      id: projectId,
      identifier: 'COL',
      name: 'Public',
      userId: owner,
      visibility: 'public',
      workspaceId,
    },
    {
      id: privateProjectId,
      identifier: 'LEG',
      name: 'Legacy',
      userId: owner,
      visibility: 'private',
      workspaceId,
    },
    {
      id: personalProjectId,
      identifier: 'PER',
      name: 'Personal',
      userId: member,
      visibility: 'private',
    },
  ]);
  await db.insert(projectMembers).values({
    projectId: privateProjectId,
    role: 'commenter',
    userId: member,
    workspaceId,
  });
});
afterEach(cleanup);

it('allows a nonparticipant Member to create an ordinary Issue while retaining Project edit boundaries', async () => {
  const projectModel = new ProjectModel(db, member, workspaceId);
  expect(await projectModel.getCapabilities(projectId)).toEqual({
    canComment: true,
    canEdit: true,
    canManage: false,
  });
  expect(
    await db.select().from(projectMembers).where(eq(projectMembers.projectId, projectId)),
  ).toEqual([]);
  const input = {
    instruction: 'A harmless ordinary requirement',
    name: 'Member Issue',
    projectId,
    visibility: 'public' as const,
    workflowCategory: 'backlog' as const,
  };
  const task = await new TaskService(db, member, workspaceId).createTask(input);
  expect(task).toMatchObject({
    createdByUserId: member,
    identifier: 'COL-1',
    projectId,
    visibility: 'public',
    workflowCategory: 'backlog',
    workspaceId,
  });
  expect(await db.select().from(tasks).where(eq(tasks.id, task.id))).toHaveLength(1);

  for (const [userId, scope, target] of [
    [viewer, workspaceId, projectId],
    [inactive, workspaceId, projectId],
    [member, 'other-workspace', projectId],
    [member, workspaceId, privateProjectId],
    [owner, undefined, personalProjectId],
  ] as const) {
    await expect(
      new TaskService(db, userId, scope).createTask({ ...input, projectId: target }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  }
  expect(await db.select().from(tasks).where(eq(tasks.workspaceId, workspaceId))).toHaveLength(1);
  const personalTask = await new TaskService(db, member).createTask({
    ...input,
    projectId: personalProjectId,
    visibility: 'private',
  });
  expect(personalTask).toMatchObject({
    createdByUserId: member,
    projectId: personalProjectId,
    visibility: 'private',
    workspaceId: null,
  });
});
