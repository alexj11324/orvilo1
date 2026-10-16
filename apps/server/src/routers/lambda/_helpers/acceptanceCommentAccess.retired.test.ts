// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

import { canReadVerifyRunArchive } from '@/server/services/verify/archiveAccess';

import { resolveAcceptanceCommentAccess } from './acceptanceCommentAccess';

const mocks = vi.hoisted(() => ({
  topic: vi.fn(),
  taskTopic: vi.fn(),
  goal: vi.fn(),
  task: vi.fn(),
  project: vi.fn(),
  member: vi.fn(),
}));
vi.mock('@/database/models/topic', () => ({
  TopicModel: class {
    findById = mocks.topic;
  },
}));
vi.mock('@/database/models/taskTopic', () => ({
  TaskTopicModel: class {
    findByTopicId = mocks.taskTopic;
  },
}));
vi.mock('@/database/models/goal', () => ({
  GoalModel: class {
    findById = mocks.goal;
  },
}));
vi.mock('@/database/models/task', () => ({
  TaskModel: class {
    findById = mocks.task;
  },
}));
vi.mock('@/database/models/project', () => ({
  ProjectModel: class {
    findById = mocks.project;
  },
}));
vi.mock('@/database/models/workspaceMember', () => ({
  WorkspaceMemberModel: class {
    getMember = mocks.member;
  },
}));
const id = '80b70eec-e109-45af-b363-0c6ab9c3e909';
let acceptance: Record<string, unknown>;
const db = {
  select: () => ({ from: () => ({ where: () => ({ limit: async () => [acceptance] }) }) }),
} as never;
beforeEach(() => {
  vi.clearAllMocks();
  acceptance = {
    id,
    userId: 'owner',
    workspaceId: 'workspace',
    visibility: 'public',
    subjectType: 'task',
    subjectId: 'issue',
  };
  mocks.task.mockResolvedValue({ id: 'issue', projectId: 'private-project' });
  mocks.project.mockResolvedValue(undefined);
  mocks.member.mockResolvedValue({ role: 'member' });
});
it.each(['owner', 'teammate'])(
  'does not let %s bypass a private Project through public archive metadata',
  async (userId) => {
    await expect(resolveAcceptanceCommentAccess(db, userId, id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  },
);
it('keeps an authorized Issue archive readable without any comment or approval rights', async () => {
  mocks.project.mockResolvedValue({ id: 'private-project' });
  await expect(resolveAcceptanceCommentAccess(db, 'teammate', id)).resolves.toMatchObject({
    canComment: false,
    canApprove: false,
    acceptance,
  });
});
it('preserves anonymous public standalone history', async () => {
  acceptance = { ...acceptance, subjectType: 'standalone', projectId: null };
  await expect(resolveAcceptanceCommentAccess(db, null, id)).resolves.toMatchObject({
    canComment: false,
    canApprove: false,
    acceptance,
  });
  expect(mocks.task).not.toHaveBeenCalled();
});

it('resolves the historical Goal Project before allowing archive comments to be read', async () => {
  acceptance = { ...acceptance, subjectType: 'goal', subjectId: 'goal' };
  mocks.goal.mockResolvedValue({ id: 'goal', projectId: 'private-project' });
  await expect(resolveAcceptanceCommentAccess(db, 'teammate', id)).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  mocks.project.mockResolvedValue({ id: 'private-project' });
  await expect(resolveAcceptanceCommentAccess(db, 'teammate', id)).resolves.toMatchObject({
    canComment: false,
    acceptance,
  });
});

it('enforces a Topic own private Project even when it has no TaskTopic', async () => {
  acceptance = { ...acceptance, subjectType: 'topic', subjectId: 'topic' };
  mocks.topic.mockResolvedValue({ id: 'topic', projectId: 'private-project' });
  mocks.taskTopic.mockResolvedValue(undefined);
  await expect(resolveAcceptanceCommentAccess(db, 'teammate', id)).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  mocks.project.mockResolvedValue({ id: 'private-project' });
  await expect(resolveAcceptanceCommentAccess(db, 'teammate', id)).resolves.toMatchObject({
    canComment: false,
    acceptance,
  });
});

it('applies the Issue Project ceiling to an old run linked only through its operation', async () => {
  const serverDB = {
    query: {
      agentOperations: { findFirst: vi.fn().mockResolvedValue({ taskId: 'issue', topicId: null }) },
    },
  } as never;
  const run = {
    acceptanceId: null,
    operationId: 'operation',
    userId: 'owner',
    workspaceId: 'workspace',
    visibility: 'public',
  } as const;
  await expect(canReadVerifyRunArchive({ serverDB, userId: 'owner' }, run)).resolves.toBe(false);
  mocks.project.mockResolvedValue({ id: 'private-project' });
  await expect(canReadVerifyRunArchive({ serverDB, userId: 'owner' }, run)).resolves.toBe(true);
});
