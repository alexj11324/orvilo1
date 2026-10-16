// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as AgentModelModule from '@/database/models/agent';
import { TaskModel } from '@/database/models/task';
import type * as WorkspaceModelModule from '@/database/models/workspace';

import { assertCanUseOperationAgent } from '../_helpers/nativeInterventionInput';
import { taskRouter } from '../task';
import { createTestContext } from './integration/setup';

const mocks = vi.hoisted(() => ({
  findTopic: vi.fn(),
  avatars: vi.fn(),
  run: vi.fn(),
  runners: [] as string[],
}));
vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: () => ({}) }));
vi.mock('@/database/models/agent', async (importOriginal) => {
  const original = await importOriginal<typeof AgentModelModule>();
  return {
    ...original,
    AgentModel: class extends original.AgentModel {
      getAgentAvatarsByIds = mocks.avatars;
    },
  };
});
vi.mock('@/database/models/workspace', async (importOriginal) => ({
  ...(await importOriginal<typeof WorkspaceModelModule>()),
  getActiveWorkspaceMembershipRole: vi.fn().mockResolvedValue('member'),
}));
vi.mock('@/business/server/trpc-middlewares/rbacPermission', () => ({
  withScopedPermission:
    () =>
    ({ next }: { next: () => unknown }) =>
      next(),
}));
vi.mock('@/database/models/taskTopic', () => ({
  TaskTopicModel: vi.fn().mockImplementation(function () {
    return { findByTopicId: mocks.findTopic };
  }),
}));
vi.mock('@/server/services/taskRunner', () => ({
  TaskRunnerService: vi.fn().mockImplementation(function (_db, userId: string) {
    mocks.runners.push(userId);
    return { runTask: mocks.run };
  }),
}));
vi.mock('../_helpers/nativeInterventionInput', () => ({ assertCanUseOperationAgent: vi.fn() }));
const caller = () =>
  taskRouter.createCaller({ ...createTestContext('new-assignee'), workspaceId: 'workspace' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.runners.length = 0;
  const task = {
    id: 'issue',
    assigneeAgentId: 'agent',
    assigneeUserId: 'new-assignee',
    currentTopicId: 'topic',
    workspaceId: 'workspace',
    createdByUserId: 'new-assignee',
  };
  vi.spyOn(TaskModel.prototype, 'resolve').mockResolvedValue(task as never);
  vi.spyOn(TaskModel.prototype, 'findById').mockResolvedValue(task as never);
  mocks.avatars.mockResolvedValue([{ id: 'agent', title: 'Saved Agent' }]);
  mocks.findTopic.mockResolvedValue({ taskId: 'issue', operationId: 'original-operation' });
  mocks.run.mockResolvedValue({ success: true, topicId: 'topic' });
  vi.mocked(assertCanUseOperationAgent).mockResolvedValue({
    agentId: 'agent',
    userId: 'original-caller',
    workspaceId: 'workspace',
    topicId: 'topic',
    status: 'done',
    groupId: null,
  });
});

describe('task.run explicit Activity input', () => {
  it('offers only an authorized current Agent and hides the candidate after authorization denial', async () => {
    await expect(caller().getInstructionTarget({ id: 'issue' })).resolves.toMatchObject({
      data: { agentId: 'agent', topicId: 'topic', name: 'Saved Agent' },
      success: true,
    });
    const { TRPCError } = await import('@trpc/server');
    vi.mocked(assertCanUseOperationAgent).mockRejectedValueOnce(
      new TRPCError({ code: 'FORBIDDEN' }),
    );
    await expect(caller().getInstructionTarget({ id: 'issue' })).resolves.toEqual({
      data: null,
      success: true,
    });
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it('keeps plain discussion on the comment path without native dispatch', async () => {
    vi.spyOn(TaskModel.prototype, 'addComment').mockResolvedValue({ id: 'comment' } as never);
    await expect(
      caller().addComment({ id: 'issue', content: 'Discuss this result' }),
    ).resolves.toMatchObject({ success: true });
    expect(mocks.run).not.toHaveBeenCalled();
    expect(assertCanUseOperationAgent).not.toHaveBeenCalled();
  });
  it('keeps a changed assignee continuation on the original execution identity', async () => {
    await expect(
      caller().run({ id: 'issue', continueTopicId: 'topic', prompt: 'Inspect current output' }),
    ).resolves.toMatchObject({ success: true, topicId: 'topic' });
    expect(mocks.runners).toEqual(['original-caller']);
    expect(mocks.run).toHaveBeenCalledWith(
      expect.objectContaining({ requestedBy: 'new-assignee' }),
    );
  });
  it('does not dispatch for an editor outside the current assignee/Agent authorization', async () => {
    vi.mocked(assertCanUseOperationAgent).mockRejectedValueOnce(
      new Error('Current assignee required'),
    );
    await expect(
      caller().run({ id: 'issue', continueTopicId: 'topic', prompt: 'Inspect current output' }),
    ).rejects.toThrow();
    expect(mocks.run).not.toHaveBeenCalled();
  });
});
