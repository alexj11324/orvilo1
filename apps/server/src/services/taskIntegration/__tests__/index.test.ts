// @vitest-environment node
import type { TaskItem, TaskTopicIntegration } from '@orvilo/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskModel } from '@/database/models/task';
import { TaskTopicModel } from '@/database/models/taskTopic';
import type { TaskTopicItem } from '@/database/schemas/task';
import { deviceGateway } from '@/server/services/deviceGateway';
import {
  findBranchPr,
  getBranchHead,
  getRemoteBranchSha,
  isBranchMergedInto,
  resolveGithubAccessToken,
} from '@/server/services/githubRepo';
import { TaskRunnerService } from '@/server/services/taskRunner';
import { TaskWorkspaceService } from '@/server/services/taskWorkspace';
import { runVerifyOnCompletion } from '@/server/services/verify';

import { TaskIntegrationService } from '../index';

const mockTaskModel = {
  updateStatus: vi.fn(),
};
const mockTaskTopicModel = {
  claimIntegration: vi.fn(),
  findByTaskId: vi.fn(),
  findByTopicId: vi.fn(),
  releaseIntegration: vi.fn(),
  updateIntegration: vi.fn(),
};
const mockRunner = {
  runTask: vi.fn(),
};
const mockVerifyRunModel = {
  findByOperation: vi.fn(),
};
const mockWorkspaceService = {
  resolveWorkspaceConfig: vi.fn(),
};
const { mockAfter } = vi.hoisted(() => ({ mockAfter: vi.fn() }));

vi.mock('@/database/models/task', () => ({
  TaskModel: vi.fn(),
}));

vi.mock('@/database/models/taskTopic', () => ({
  TaskTopicModel: vi.fn(),
}));

vi.mock('@/server/services/taskRunner', () => ({
  TaskRunnerService: vi.fn(),
}));
vi.mock('@/server/services/taskWorkspace', () => ({
  TaskWorkspaceService: vi.fn(),
}));
vi.mock('@/database/models/verifyRun', () => ({
  VerifyRunModel: vi.fn(function () {
    return mockVerifyRunModel;
  }),
}));
vi.mock('@/server/utils/scheduleAfterResponse', () => ({ after: mockAfter }));
vi.mock('@/server/services/verify', () => ({ runVerifyOnCompletion: vi.fn() }));

vi.mock('@/server/services/deviceGateway', () => ({
  deviceGateway: {
    addGitWorktree: vi.fn(),
    finalizeGitMerge: vi.fn(),
    mergeGitBranch: vi.fn(),
    pushGitBranch: vi.fn(),
    removeGitWorktree: vi.fn(),
  },
}));

vi.mock('@/server/services/githubRepo', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    findBranchPr: vi.fn(),
    getBranchHead: vi.fn(),
    getRemoteBranchSha: vi.fn(),
    isBranchMergedInto: vi.fn(),
    resolveGithubAccessToken: vi.fn(),
  };
});

const baseTask = (): TaskItem =>
  ({ id: 'task_1', identifier: 'T-1', status: 'running' }) as TaskItem;

const seedRecord = (overrides: Partial<TaskTopicIntegration> = {}): TaskTopicIntegration => ({
  attempts: 0,
  baseBranch: 'main',
  branch: 'task/T-1',
  deviceId: 'dev-1',
  repoPath: '/repos/orvilo',
  role: 'task',
  state: 'pending',
  worktreePath: '/repos/orvilo-task-T-1',
  ...overrides,
});

const asTopic = (integration: TaskTopicIntegration | null): TaskTopicItem =>
  ({ integration, topicId: 'topic_1' }) as TaskTopicItem;

const remoteRecord = (overrides: Partial<TaskTopicIntegration> = {}): TaskTopicIntegration => ({
  attempts: 0,
  baseBranch: 'main',
  branch: 'task/T-1',
  repo: 'acme/widgets',
  role: 'task',
  state: 'pending',
  ...overrides,
});

describe('TaskIntegrationService', () => {
  let service: TaskIntegrationService;

  beforeEach(() => {
    vi.clearAllMocks();
    (TaskModel as any).mockImplementation(function () {
      return mockTaskModel;
    });
    (TaskTopicModel as any).mockImplementation(function () {
      return mockTaskTopicModel;
    });
    (TaskRunnerService as any).mockImplementation(function () {
      return mockRunner;
    });
    (TaskWorkspaceService as any).mockImplementation(function () {
      return mockWorkspaceService;
    });
    mockWorkspaceService.resolveWorkspaceConfig.mockResolvedValue({
      provider: 'git',
      repoPath: '/repos/orvilo',
    });
    mockTaskTopicModel.updateIntegration.mockResolvedValue(true);
    service = new TaskIntegrationService({} as any, 'user-1', 'ws-1');
    vi.mocked(deviceGateway.addGitWorktree).mockResolvedValue({ success: true });
    vi.mocked(deviceGateway.pushGitBranch).mockImplementation(async ({ sourceRef }) => ({
      pushedSourceRef: sourceRef,
      success: true,
    }));
    vi.mocked(deviceGateway.removeGitWorktree).mockResolvedValue({ success: true });
    mockTaskTopicModel.findByTaskId.mockResolvedValue([asTopic(seedRecord())]);
    mockTaskTopicModel.claimIntegration.mockResolvedValue(true);
    mockTaskTopicModel.releaseIntegration.mockResolvedValue(undefined);
    mockTaskTopicModel.updateIntegration.mockResolvedValue(undefined);
    mockVerifyRunModel.findByOperation.mockResolvedValue(null);
    mockRunner.runTask.mockResolvedValue({ success: true, topicId: 'topic_2' });
  });

  it('settles from the persisted run snapshot when there is no integration record', async () => {
    mockTaskTopicModel.findByTopicId.mockResolvedValue(asTopic(null));
    expect(await service.integrateOnComplete({ task: baseTask(), taskTopicId: 'topic_1' })).toBe(
      'settled',
    );
    expect(mockTaskTopicModel.findByTopicId).toHaveBeenCalledWith('topic_1');
  });

  it('settles immediately for a run with no integration record', async () => {
    mockTaskTopicModel.findByTopicId.mockResolvedValue(asTopic(null));
    expect(await service.integrateOnComplete({ task: baseTask(), taskTopicId: 'topic_1' })).toBe(
      'settled',
    );
    expect(deviceGateway.mergeGitBranch).not.toHaveBeenCalled();
  });

  it('lets only one duplicate completion callback process an integration state', async () => {
    mockTaskTopicModel.findByTopicId.mockResolvedValue(asTopic(seedRecord()));
    mockTaskTopicModel.claimIntegration.mockResolvedValue(false);

    expect(await service.integrateOnComplete({ task: baseTask(), taskTopicId: 'topic_1' })).toBe(
      'hold',
    );
    expect(deviceGateway.addGitWorktree).not.toHaveBeenCalled();
    expect(deviceGateway.mergeGitBranch).not.toHaveBeenCalled();
    expect(mockRunner.runTask).not.toHaveBeenCalled();
  });

  it.each([
    [
      'device',
      seedRecord({ attempts: 1, role: 'integrate', runTopicId: 'topic_0', state: 'conflict' }),
    ],
    [
      'remote',
      remoteRecord({ attempts: 1, role: 'integrate', runTopicId: 'topic_0', state: 'merging' }),
    ],
  ])('holds a stale %s corrective callback once it has a successor', async (_kind, record) => {
    mockTaskTopicModel.findByTopicId.mockResolvedValue(asTopic(record));
    mockTaskTopicModel.findByTaskId.mockResolvedValue([
      { integration: record, topicId: 'topic_1' } as TaskTopicItem,
      {
        integration: {
          ...record,
          attempts: 2,
          role: 'integrate',
          runTopicId: 'topic_1',
          state: 'merging',
        },
        topicId: 'topic_2',
      } as TaskTopicItem,
    ]);

    await expect(
      service.integrateOnComplete({ task: baseTask(), taskTopicId: 'topic_1' }),
    ).resolves.toBe('hold');

    expect(mockTaskTopicModel.claimIntegration).not.toHaveBeenCalled();
    expect(deviceGateway.finalizeGitMerge).not.toHaveBeenCalled();
    expect(findBranchPr).not.toHaveBeenCalled();
    expect(mockRunner.runTask).not.toHaveBeenCalled();
    expect(deviceGateway.removeGitWorktree).not.toHaveBeenCalled();
  });

  it('rechecks for a corrective successor after acquiring the chain lease', async () => {
    const record = remoteRecord({
      attempts: 1,
      integrationOwnerTopicId: 'topic_0',
      role: 'integrate',
      runTopicId: 'topic_0',
      state: 'merging',
    });
    const child = {
      integration: {
        ...record,
        attempts: 2,
        role: 'integrate',
        runTopicId: 'topic_1',
      },
      topicId: 'topic_2',
    } as TaskTopicItem;
    mockTaskTopicModel.findByTopicId.mockResolvedValue(asTopic(record));
    mockTaskTopicModel.findByTaskId.mockResolvedValueOnce([]).mockResolvedValueOnce([child]);

    await expect(
      service.integrateOnComplete({ task: baseTask(), taskTopicId: 'topic_1' }),
    ).resolves.toBe('hold');

    expect(mockTaskTopicModel.claimIntegration).toHaveBeenCalledTimes(1);
    expect(mockTaskTopicModel.releaseIntegration).toHaveBeenCalledWith(
      'task_1',
      'topic_0',
      expect.any(String),
    );
    expect(findBranchPr).not.toHaveBeenCalled();
    expect(mockRunner.runTask).not.toHaveBeenCalled();
  });

  it('merges, pushes, cleans up and settles on a clean merge', async () => {
    const persisted = asTopic(
      seedRecord({
        integrationOwnerTopicId: 'topic_1',
        integrationWorktreePath: '/repos/orvilo-integration-main-topic_1',
        state: 'integrated',
      }),
    );
    mockTaskTopicModel.findByTopicId.mockResolvedValueOnce(asTopic(seedRecord())).mockResolvedValue(
      asTopic(
        seedRecord({
          integrationOwnerTopicId: 'topic_1',
          integrationWorktreePath: '/repos/orvilo-integration-main-topic_1',
          state: 'integrated',
        }),
      ),
    );
    mockTaskTopicModel.findByTaskId.mockResolvedValue([persisted]);
    vi.mocked(deviceGateway.mergeGitBranch).mockResolvedValue({
      headSha: 'task123',
      sha: 'abc123',
      state: 'merged',
      success: true,
    });

    const outcome = await service.integrateOnComplete({
      task: baseTask(),
      taskTopicId: 'topic_1',
    });

    expect(outcome).toBe('settled');
    // Detached integration worktree provisioned off origin/main.
    expect(deviceGateway.addGitWorktree).toHaveBeenCalledWith(
      expect.objectContaining({
        detach: true,
        path: '/repos/orvilo',
        ref: 'origin/main',
        worktreePath: '/repos/orvilo-integration-main-topic_1',
      }),
    );
    expect(deviceGateway.mergeGitBranch).toHaveBeenCalledWith(
      expect.objectContaining({ baseRef: 'origin/main', branch: 'task/T-1' }),
    );
    expect(deviceGateway.pushGitBranch).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedSha: 'abc123',
        path: '/repos/orvilo-integration-main-topic_1',
        remoteBranch: 'main',
        sourceRef: 'abc123',
      }),
    );
    expect(deviceGateway.removeGitWorktree).toHaveBeenCalledWith(
      expect.objectContaining({ worktreePath: '/repos/orvilo-task-T-1' }),
    );
    expect(deviceGateway.removeGitWorktree).toHaveBeenCalledWith(
      expect.objectContaining({ worktreePath: '/repos/orvilo-integration-main-topic_1' }),
    );
    expect(mockTaskTopicModel.updateIntegration).toHaveBeenCalledWith(
      'task_1',
      'topic_1',
      expect.objectContaining({ integratedSha: 'abc123', state: 'integrated' }),
    );
    expect(mockTaskTopicModel.releaseIntegration.mock.invocationCallOrder[0]).toBeLessThan(
      mockTaskTopicModel.claimIntegration.mock.invocationCallOrder[1],
    );
  });

  it('resumes a confirmed Verify plan after the initial clean merge publishes', async () => {
    const record = seedRecord();
    mockTaskTopicModel.findByTopicId.mockResolvedValue(asTopic(record));
    mockTaskTopicModel.findByTaskId.mockResolvedValue([
      {
        handoff: { content: 'delivered result' },
        integration: record,
        operationId: 'op-original',
        topicId: 'topic_1',
      } as TaskTopicItem,
    ]);
    mockVerifyRunModel.findByOperation.mockResolvedValue({ planConfirmedAt: new Date() });
    vi.mocked(deviceGateway.mergeGitBranch).mockResolvedValue({
      sha: 'abc123',
      state: 'merged',
      success: true,
    });

    const outcome = await service.integrateOnComplete({
      task: { ...baseTask(), instruction: 'ship it' },
      taskTopicId: 'topic_1',
    });

    expect(outcome).toBe('hold');
    expect(mockAfter).toHaveBeenCalledTimes(1);
    await mockAfter.mock.calls[0][0]();
    expect(runVerifyOnCompletion).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      {
        deliverable: 'delivered result',
        goal: 'ship it',
        operationId: 'op-original',
      },
      'ws-1',
    );
  });

  it('resumes publishing an already merged candidate after callback recovery', async () => {
    const recovering = seedRecord({
      integratedSha: 'candidate123',
      integrationWorktreePath: '/repos/orvilo-integration-main-topic_1',
      state: 'merging',
    });
    mockTaskTopicModel.findByTopicId.mockResolvedValue(asTopic(recovering));
    mockTaskTopicModel.findByTaskId.mockResolvedValue([asTopic(recovering)]);

    const outcome = await service.integrateOnComplete({
      task: baseTask(),
      taskTopicId: 'topic_1',
    });

    expect(outcome).toBe('settled');
    expect(deviceGateway.mergeGitBranch).not.toHaveBeenCalled();
    expect(deviceGateway.pushGitBranch).toHaveBeenCalledWith(
      expect.objectContaining({ sourceRef: 'candidate123' }),
    );
  });

  it('dispatches a corrective run bound to the integration worktree on conflict', async () => {
    mockTaskTopicModel.findByTopicId.mockResolvedValue(asTopic(seedRecord()));
    vi.mocked(deviceGateway.mergeGitBranch).mockResolvedValue({
      conflicts: ['src/a.ts'],
      headSha: 'task123',
      state: 'conflict',
      success: false,
    });

    const outcome = await service.integrateOnComplete({
      completionReservationId: 'completion:op-verified',
      task: baseTask(),
      taskTopicId: 'topic_1',
      verifyOperationId: 'op-verified',
    });

    expect(outcome).toBe('hold');
    expect(mockRunner.runTask).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task_1',
        workspaceOverride: {
          workingDirectory: '/repos/orvilo-integration-main-topic_1',
          workingDirectoryConfig: expect.objectContaining({ repoType: 'git' }),
        },
      }),
    );
    const seed = mockRunner.runTask.mock.calls[0][0].integrationSeed;
    expect(seed).toMatchObject({
      attempts: 1,
      expectedHeadSha: 'task123',
      role: 'integrate',
      runTopicId: 'topic_1',
      state: 'merging',
      verifyOperationId: 'op-verified',
      worktreePath: '/repos/orvilo-integration-main-topic_1',
    });
    expect(mockRunner.runTask.mock.calls[0][0].replaceReservationId).toBe('completion:op-verified');
    expect(mockRunner.runTask.mock.calls[0][0].skipTaskVerification).toBe(true);
    const parentStateWrite = mockTaskTopicModel.updateIntegration.mock.calls.findIndex(
      ([, , patch]) => patch.attempts === 1 && patch.verifyOperationId === 'op-verified',
    );
    expect(parentStateWrite).toBeGreaterThanOrEqual(0);
    expect(
      mockTaskTopicModel.updateIntegration.mock.invocationCallOrder[parentStateWrite],
    ).toBeLessThan(mockRunner.runTask.mock.invocationCallOrder[0]);
    expect(mockRunner.runTask.mock.calls[0][0].extraPrompt).toContain('src/a.ts');
  });

  it('holds the integration worktree for retry when the candidate push fails', async () => {
    mockTaskTopicModel.findByTopicId.mockResolvedValue(asTopic(seedRecord()));
    mockTaskTopicModel.findByTaskId.mockResolvedValue([asTopic(seedRecord())]);
    vi.mocked(deviceGateway.mergeGitBranch).mockResolvedValue({
      headSha: 'task123',
      sha: 'candidate123',
      state: 'merged',
      success: true,
    });
    vi.mocked(deviceGateway.pushGitBranch).mockResolvedValue({
      error: 'non-fast-forward',
      success: false,
    });

    const outcome = await service.integrateOnComplete({
      task: baseTask(),
      taskTopicId: 'topic_1',
    });

    expect(outcome).toBe('hold');
    expect(mockTaskTopicModel.updateIntegration).toHaveBeenCalledWith(
      'task_1',
      'topic_1',
      expect.objectContaining({
        integratedSha: 'candidate123',
        lastErrorCode: 'publish_failed',
        pushedToRemote: false,
        state: 'publish_failed',
      }),
    );
    expect(deviceGateway.removeGitWorktree).not.toHaveBeenCalled();
  });

  it('does not push when the integration row disappeared before publish', async () => {
    mockTaskTopicModel.findByTopicId.mockResolvedValue(asTopic(seedRecord()));
    vi.mocked(deviceGateway.mergeGitBranch).mockResolvedValue({
      headSha: 'task123',
      sha: 'candidate123',
      state: 'merged',
      success: true,
    });
    mockTaskTopicModel.updateIntegration.mockImplementation(
      async (_taskId: string, _topicId: string, patch: Partial<TaskTopicIntegration>) =>
        patch.state !== 'merging',
    );

    const outcome = await service.integrateOnComplete({
      task: baseTask(),
      taskTopicId: 'topic_1',
    });

    expect(outcome).toBe('blocked');
    expect(deviceGateway.pushGitBranch).not.toHaveBeenCalled();
  });

  it('blocks and retains worktrees when an older device cannot confirm the pushed commit', async () => {
    mockTaskTopicModel.findByTopicId.mockResolvedValue(asTopic(seedRecord()));
    mockTaskTopicModel.findByTaskId.mockResolvedValue([asTopic(seedRecord())]);
    vi.mocked(deviceGateway.mergeGitBranch).mockResolvedValue({
      headSha: 'task123',
      sha: 'candidate123',
      state: 'merged',
      success: true,
    });
    vi.mocked(deviceGateway.pushGitBranch).mockResolvedValue({ success: true });

    const outcome = await service.integrateOnComplete({
      task: baseTask(),
      taskTopicId: 'topic_1',
    });

    expect(outcome).toBe('blocked');
    expect(mockTaskTopicModel.updateIntegration).toHaveBeenCalledWith(
      'task_1',
      'topic_1',
      expect.objectContaining({
        lastError: expect.stringContaining('immutable source commit'),
        pushedToRemote: false,
        state: 'blocked',
      }),
    );
    expect(deviceGateway.removeGitWorktree).not.toHaveBeenCalled();
  });

  it('settles when the corrective run finalized the merge', async () => {
    const record = seedRecord({
      attempts: 1,
      expectedHeadSha: 'task123',
      integrationWorktreePath: '/repos/orvilo-integration-main',
      role: 'integrate',
      runTopicId: 'topic_0',
      state: 'merging',
      worktreePath: '/repos/orvilo-integration-main',
    });
    mockTaskTopicModel.findByTopicId.mockResolvedValue(asTopic(record));
    mockTaskTopicModel.findByTaskId.mockResolvedValue([
      asTopic(record),
      { integration: seedRecord(), topicId: 'topic_0' } as TaskTopicItem,
    ]);
    vi.mocked(deviceGateway.finalizeGitMerge).mockResolvedValue({
      sha: 'def456',
      state: 'integrated',
      success: true,
      validatedExpectedHead: true,
    });

    const outcome = await service.integrateOnComplete({
      task: baseTask(),
      taskTopicId: 'topic_1',
    });

    expect(outcome).toBe('settled');
    expect(deviceGateway.finalizeGitMerge).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedHead: 'task123',
        path: '/repos/orvilo-integration-main',
      }),
    );
    // Original run's record advanced too.
    expect(mockTaskTopicModel.updateIntegration).toHaveBeenCalledWith(
      'task_1',
      'topic_0',
      expect.objectContaining({ state: 'integrated' }),
    );
  });

  it('blocks an older device client that did not enforce the accepted commit', async () => {
    const record = seedRecord({
      attempts: 1,
      expectedHeadSha: 'task123',
      integrationWorktreePath: '/repos/orvilo-integration-main',
      role: 'integrate',
      state: 'merging',
      worktreePath: '/repos/orvilo-integration-main',
    });
    mockTaskTopicModel.findByTopicId.mockResolvedValue(asTopic(record));
    vi.mocked(deviceGateway.finalizeGitMerge).mockResolvedValue({
      sha: 'def456',
      state: 'integrated',
      success: true,
    });

    const outcome = await service.integrateOnComplete({
      task: baseTask(),
      taskTopicId: 'topic_1',
    });

    expect(outcome).toBe('blocked');
    expect(deviceGateway.pushGitBranch).not.toHaveBeenCalled();
    expect(mockTaskTopicModel.updateIntegration).toHaveBeenCalledWith(
      'task_1',
      'topic_1',
      expect.objectContaining({ lastError: expect.stringContaining('update'), state: 'blocked' }),
    );
  });

  it('resumes the original Verify plan only after a corrective merge publishes', async () => {
    const corrective = seedRecord({
      attempts: 1,
      integrationWorktreePath: '/repos/orvilo-integration-main-topic_0',
      role: 'integrate',
      runTopicId: 'topic_0',
      state: 'merging',
      worktreePath: '/repos/orvilo-integration-main-topic_0',
    });
    const original = seedRecord({
      integrationOwnerTopicId: 'topic_0',
      integrationWorktreePath: '/repos/orvilo-integration-main-topic_0',
      state: 'conflict',
    });
    mockTaskTopicModel.findByTopicId.mockResolvedValue(asTopic(corrective));
    mockTaskTopicModel.findByTaskId.mockResolvedValue([
      {
        handoff: { content: 'delivered result' },
        integration: original,
        operationId: 'op-original',
        topicId: 'topic_0',
      } as TaskTopicItem,
      { integration: corrective, topicId: 'topic_1' } as TaskTopicItem,
    ]);
    mockVerifyRunModel.findByOperation.mockResolvedValue({ planConfirmedAt: new Date() });
    vi.mocked(deviceGateway.finalizeGitMerge).mockResolvedValue({
      sha: 'def456',
      state: 'integrated',
      success: true,
    });

    const outcome = await service.integrateOnComplete({
      task: { ...baseTask(), instruction: 'ship it' },
      taskTopicId: 'topic_1',
    });

    expect(outcome).toBe('hold');
    expect(mockAfter).toHaveBeenCalledTimes(1);
  });

  it('blocks when corrective attempts are exhausted', async () => {
    const record = seedRecord({
      attempts: 3,
      integrationWorktreePath: '/repos/orvilo-integration-main',
      role: 'integrate',
      state: 'merging',
      worktreePath: '/repos/orvilo-integration-main',
    });
    mockTaskTopicModel.findByTopicId.mockResolvedValue(asTopic(record));
    vi.mocked(deviceGateway.finalizeGitMerge).mockResolvedValue({
      conflicts: ['src/a.ts'],
      state: 'conflict',
      success: false,
    });

    const outcome = await service.integrateOnComplete({
      task: baseTask(),
      taskTopicId: 'topic_1',
    });

    expect(outcome).toBe('blocked');
    expect(mockRunner.runTask).not.toHaveBeenCalled();
    expect(mockTaskTopicModel.updateIntegration).toHaveBeenCalledWith(
      'task_1',
      'topic_1',
      expect.objectContaining({ state: 'blocked' }),
    );
  });

  it('blocks (without throwing) when the merge RPC throws', async () => {
    mockTaskTopicModel.findByTopicId.mockResolvedValue(asTopic(seedRecord()));
    vi.mocked(deviceGateway.mergeGitBranch).mockRejectedValue(new Error('device offline'));

    const outcome = await service.integrateOnComplete({
      task: baseTask(),
      taskTopicId: 'topic_1',
    });

    expect(outcome).toBe('blocked');
    expect(mockTaskTopicModel.updateIntegration).toHaveBeenCalledWith(
      'task_1',
      'topic_1',
      expect.objectContaining({ lastError: 'device offline', state: 'blocked' }),
    );
  });

  it('holds a locally merged run when publish fails and preserves the integration worktree', async () => {
    const persisted = seedRecord({
      integrationOwnerTopicId: 'topic_1',
      integrationWorktreePath: '/repos/orvilo-integration-main-topic_1',
    });
    mockTaskTopicModel.findByTopicId.mockResolvedValue(asTopic(seedRecord()));
    mockTaskTopicModel.findByTaskId.mockResolvedValue([
      { integration: persisted, topicId: 'topic_1' } as TaskTopicItem,
    ]);
    vi.mocked(deviceGateway.mergeGitBranch).mockResolvedValue({
      sha: 'abc123',
      state: 'merged',
      success: true,
    });
    vi.mocked(deviceGateway.pushGitBranch).mockResolvedValue({
      error: 'non-fast-forward',
      success: false,
    });

    expect(await service.integrateOnComplete({ task: baseTask(), taskTopicId: 'topic_1' })).toBe(
      'hold',
    );
    expect(mockTaskTopicModel.updateIntegration).toHaveBeenCalledWith(
      'task_1',
      'topic_1',
      expect.objectContaining({
        integratedSha: 'abc123',
        lastErrorCode: 'publish_failed',
        pushedToRemote: false,
        state: 'publish_failed',
      }),
    );
    expect(deviceGateway.removeGitWorktree).toHaveBeenCalledWith(
      expect.objectContaining({ worktreePath: '/repos/orvilo-task-T-1' }),
    );
    expect(deviceGateway.removeGitWorktree).not.toHaveBeenCalledWith(
      expect.objectContaining({ worktreePath: '/repos/orvilo-integration-main-topic_1' }),
    );
  });

  it('retries only the exact failed publish and then cleans both worktrees', async () => {
    const record = seedRecord({
      integratedSha: 'abc123',
      integrationOwnerTopicId: 'topic_1',
      integrationWorktreePath: '/repos/orvilo-integration-main-topic_1',
      state: 'publish_failed',
    });
    mockTaskTopicModel.findByTopicId.mockResolvedValue(asTopic(record));
    mockTaskTopicModel.findByTaskId.mockResolvedValue([
      { integration: record, topicId: 'topic_1' } as TaskTopicItem,
    ]);

    expect(await service.integrateOnComplete({ task: baseTask(), taskTopicId: 'topic_1' })).toBe(
      'settled',
    );
    expect(deviceGateway.mergeGitBranch).not.toHaveBeenCalled();
    expect(deviceGateway.pushGitBranch).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedSha: 'abc123',
        path: '/repos/orvilo-integration-main-topic_1',
      }),
    );
    expect(mockTaskTopicModel.updateIntegration).toHaveBeenCalledWith(
      'task_1',
      'topic_1',
      expect.objectContaining({ lastError: null, state: 'integrated' }),
    );
  });

  it('reuses an existing integration worktree directory', async () => {
    mockTaskTopicModel.findByTopicId.mockResolvedValue(asTopic(seedRecord()));
    vi.mocked(deviceGateway.addGitWorktree).mockResolvedValue({
      error: "fatal: 'worktree already exists'",
      success: false,
    });
    vi.mocked(deviceGateway.mergeGitBranch).mockResolvedValue({
      headSha: 'task123',
      sha: 'abc',
      state: 'merged',
      success: true,
    });

    expect(await service.integrateOnComplete({ task: baseTask(), taskTopicId: 'topic_1' })).toBe(
      'settled',
    );
  });

  it('blocks a legacy shared integration worktree instead of reusing it', async () => {
    mockTaskTopicModel.findByTopicId.mockResolvedValue(
      asTopic(seedRecord({ integrationWorktreePath: '/repos/orvilo-integration-main' })),
    );

    expect(await service.integrateOnComplete({ task: baseTask(), taskTopicId: 'topic_1' })).toBe(
      'blocked',
    );
    expect(deviceGateway.addGitWorktree).not.toHaveBeenCalled();
    expect(mockTaskTopicModel.updateIntegration).toHaveBeenCalledWith(
      'task_1',
      'topic_1',
      expect.objectContaining({
        lastError: expect.stringContaining('Legacy shared'),
        state: 'blocked',
      }),
    );
  });

  describe('remote (sandbox-contract) records', () => {
    beforeEach(() => {
      vi.mocked(resolveGithubAccessToken).mockResolvedValue('gh-token');
      vi.mocked(findBranchPr).mockResolvedValue(undefined);
      vi.mocked(getRemoteBranchSha).mockImplementation(async (_repo, branch) =>
        branch === 'main' ? 'base123' : 'head123',
      );
      vi.mocked(getBranchHead).mockResolvedValue({ state: 'missing' });
      vi.mocked(isBranchMergedInto).mockResolvedValue('unmerged');
    });

    it('settles a task run whose branch already landed on the remote', async () => {
      mockTaskTopicModel.findByTopicId.mockResolvedValue(asTopic(remoteRecord()));
      mockTaskTopicModel.findByTaskId.mockResolvedValue([asTopic(remoteRecord())]);
      vi.mocked(findBranchPr).mockResolvedValue({
        baseBranch: 'main',
        headSha: 'head123',
        merged: true,
        number: 7,
        sha: 'merge123',
        url: 'https://github.com/acme/widgets/pull/7',
      });
      vi.mocked(isBranchMergedInto).mockResolvedValue('unmerged');

      const outcome = await service.integrateOnComplete({
        task: baseTask(),
        taskTopicId: 'topic_1',
      });

      expect(outcome).toBe('settled');
      expect(mockTaskTopicModel.updateIntegration).toHaveBeenCalledWith(
        'task_1',
        'topic_1',
        expect.objectContaining({
          integratedSha: 'merge123',
          prUrl: 'https://github.com/acme/widgets/pull/7',
          pushedToRemote: true,
          state: 'integrated',
        }),
      );
      // No device worktree machinery runs for a remote record.
      expect(deviceGateway.addGitWorktree).not.toHaveBeenCalled();
      expect(deviceGateway.mergeGitBranch).not.toHaveBeenCalled();
      expect(deviceGateway.removeGitWorktree).not.toHaveBeenCalled();
      expect(mockRunner.runTask).not.toHaveBeenCalled();
    });

    it('dispatches a sandbox integrator run when the branch is not yet merged', async () => {
      mockTaskTopicModel.findByTopicId.mockResolvedValue(asTopic(remoteRecord()));

      const outcome = await service.integrateOnComplete({
        task: baseTask(),
        taskTopicId: 'topic_1',
      });

      expect(outcome).toBe('hold');
      const call = mockRunner.runTask.mock.calls[0][0];
      expect(call.taskId).toBe('task_1');
      expect(call.workspaceOverride).toEqual({
        repos: ['acme/widgets'],
        workingDirectory: '/workspace/widgets',
        workingDirectoryConfig: {
          git: { branch: 'main', upstream: { branch: 'main', remote: 'origin' } },
          path: '/workspace/widgets',
          repoType: 'git',
        },
      });
      expect(call.extraPrompt).toContain('git merge --no-ff origin/task/T-1');
      expect(call.extraPrompt).toContain('git push origin main');
      expect(call.integrationSeed).toMatchObject({
        attempts: 1,
        expectedBaseSha: 'base123',
        expectedHeadSha: 'head123',
        repo: 'acme/widgets',
        role: 'integrate',
        runTopicId: 'topic_1',
        state: 'merging',
      });
      // The task run's row reports the in-flight merge, not a conflict.
      expect(mockTaskTopicModel.updateIntegration).toHaveBeenCalledWith(
        'task_1',
        'topic_1',
        expect.objectContaining({ attempts: 1, state: 'merging' }),
      );
    });

    it('holds for a remote verification failure without dispatching a corrective run', async () => {
      mockTaskTopicModel.findByTopicId.mockResolvedValue(asTopic(remoteRecord()));
      vi.mocked(isBranchMergedInto).mockResolvedValue('unknown');

      expect(await service.integrateOnComplete({ task: baseTask(), taskTopicId: 'topic_1' })).toBe(
        'hold',
      );
      expect(mockRunner.runTask).not.toHaveBeenCalled();
      expect(mockTaskTopicModel.updateIntegration).toHaveBeenCalledWith(
        'task_1',
        'topic_1',
        expect.objectContaining({
          lastErrorCode: 'remote_verification_unavailable',
          state: 'verification_pending',
        }),
      );
    });

    it('accepts a merged PR with a deleted source branch when comparison is unknown', async () => {
      mockTaskTopicModel.findByTopicId.mockResolvedValue(asTopic(remoteRecord()));
      mockTaskTopicModel.findByTaskId.mockResolvedValue([asTopic(remoteRecord())]);
      vi.mocked(findBranchPr).mockResolvedValue({
        baseBranch: 'main',
        headSha: 'branch123',
        merged: true,
        sha: 'merge123',
        url: 'https://github.com/acme/widgets/pull/7',
      });
      vi.mocked(getBranchHead).mockResolvedValue({ state: 'missing' });
      vi.mocked(isBranchMergedInto).mockResolvedValue('unknown');

      expect(await service.integrateOnComplete({ task: baseTask(), taskTopicId: 'topic_1' })).toBe(
        'settled',
      );
      expect(mockRunner.runTask).not.toHaveBeenCalled();
      expect(mockTaskTopicModel.updateIntegration).toHaveBeenCalledWith(
        'task_1',
        'topic_1',
        expect.objectContaining({
          integratedSha: 'merge123',
          state: 'integrated',
        }),
      );
    });

    it('does not accept a merged PR when the source branch advanced afterward', async () => {
      mockTaskTopicModel.findByTopicId.mockResolvedValue(asTopic(remoteRecord()));
      vi.mocked(findBranchPr).mockResolvedValue({
        baseBranch: 'main',
        headSha: 'old-head',
        merged: true,
        sha: 'merge123',
        url: 'https://github.com/acme/widgets/pull/7',
      });
      vi.mocked(getBranchHead).mockResolvedValue({ sha: 'new-head', state: 'found' });
      vi.mocked(isBranchMergedInto).mockResolvedValue('unmerged');

      expect(await service.integrateOnComplete({ task: baseTask(), taskTopicId: 'topic_1' })).toBe(
        'hold',
      );
      expect(mockRunner.runTask).toHaveBeenCalledTimes(1);
      expect(mockTaskTopicModel.updateIntegration).not.toHaveBeenCalledWith(
        'task_1',
        'topic_1',
        expect.objectContaining({ state: 'integrated' }),
      );
    });

    it('settles an integrator run once the remote merge is verified', async () => {
      const record = remoteRecord({
        attempts: 1,
        role: 'integrate',
        runTopicId: 'topic_0',
        state: 'merging',
      });
      mockTaskTopicModel.findByTopicId.mockResolvedValue(asTopic(record));
      // Both rows tracking this branch land — the integrator's and the
      // original run's.
      mockTaskTopicModel.findByTaskId.mockResolvedValue([
        asTopic(record),
        { integration: remoteRecord(), topicId: 'topic_0' } as TaskTopicItem,
      ]);
      vi.mocked(isBranchMergedInto).mockResolvedValue('merged');

      const outcome = await service.integrateOnComplete({
        task: baseTask(),
        taskTopicId: 'topic_1',
      });

      expect(outcome).toBe('settled');
      // Both the integrator's row and the original run's row advance.
      expect(mockTaskTopicModel.updateIntegration).toHaveBeenCalledWith(
        'task_1',
        'topic_1',
        expect.objectContaining({ pushedToRemote: true, state: 'integrated' }),
      );
      expect(mockTaskTopicModel.updateIntegration).toHaveBeenCalledWith(
        'task_1',
        'topic_0',
        expect.objectContaining({ pushedToRemote: true, state: 'integrated' }),
      );
    });

    it('re-dispatches while the remote merge is still pending', async () => {
      const record = remoteRecord({
        attempts: 1,
        role: 'integrate',
        runTopicId: 'topic_0',
        state: 'merging',
      });
      mockTaskTopicModel.findByTopicId.mockResolvedValue(asTopic(record));
      vi.mocked(isBranchMergedInto).mockResolvedValue('unmerged');

      const outcome = await service.integrateOnComplete({
        task: baseTask(),
        taskTopicId: 'topic_1',
      });

      expect(outcome).toBe('hold');
      expect(mockRunner.runTask).toHaveBeenCalledWith(
        expect.objectContaining({
          integrationSeed: expect.objectContaining({ attempts: 2, state: 'merging' }),
        }),
      );
    });

    it('blocks when the task branch advanced after its accepted commit', async () => {
      mockTaskTopicModel.findByTopicId.mockResolvedValue(
        asTopic(remoteRecord({ expectedHeadSha: 'accepted123' })),
      );
      vi.mocked(getRemoteBranchSha).mockImplementation(async (_repo, branch) =>
        branch === 'main' ? 'base123' : 'new456',
      );

      const outcome = await service.integrateOnComplete({
        task: baseTask(),
        taskTopicId: 'topic_1',
      });

      expect(outcome).toBe('blocked');
      expect(mockRunner.runTask).not.toHaveBeenCalled();
      expect(mockTaskTopicModel.updateIntegration).toHaveBeenCalledWith(
        'task_1',
        'topic_1',
        expect.objectContaining({
          lastError: expect.stringContaining('advanced'),
          state: 'blocked',
        }),
      );
    });

    it('blocks immediately on an unparseable repo coordinate', async () => {
      mockTaskTopicModel.findByTopicId.mockResolvedValue(
        asTopic(remoteRecord({ repo: 'not-a-repo' })),
      );

      const outcome = await service.integrateOnComplete({
        task: baseTask(),
        taskTopicId: 'topic_1',
      });

      expect(outcome).toBe('blocked');
      expect(mockRunner.runTask).not.toHaveBeenCalled();
      expect(mockTaskTopicModel.updateIntegration).toHaveBeenCalledWith(
        'task_1',
        'topic_1',
        expect.objectContaining({ state: 'blocked' }),
      );
    });

    it('blocks after the integrator attempts are exhausted', async () => {
      const record = remoteRecord({
        attempts: 3,
        role: 'integrate',
        runTopicId: 'topic_0',
        state: 'merging',
      });
      mockTaskTopicModel.findByTopicId.mockResolvedValue(asTopic(record));
      vi.mocked(isBranchMergedInto).mockResolvedValue('unmerged');

      const outcome = await service.integrateOnComplete({
        task: baseTask(),
        taskTopicId: 'topic_1',
      });

      expect(outcome).toBe('blocked');
      expect(mockRunner.runTask).not.toHaveBeenCalled();
      expect(mockTaskTopicModel.updateIntegration).toHaveBeenCalledWith(
        'task_1',
        'topic_0',
        expect.objectContaining({ state: 'blocked' }),
      );
    });
  });

  describe('cleanupTaskWorktrees', () => {
    it('removes a stale task worktree and flags the record cleaned', async () => {
      mockTaskTopicModel.findByTaskId.mockResolvedValue([asTopic(seedRecord())]);

      await expect(service.cleanupTaskWorktrees('task_1')).resolves.toBe(true);

      expect(deviceGateway.removeGitWorktree).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceId: 'dev-1',
          path: '/repos/orvilo',
          worktreePath: '/repos/orvilo-task-T-1',
        }),
      );
      expect(mockTaskTopicModel.updateIntegration).toHaveBeenCalledWith('task_1', 'topic_1', {
        worktreeCleaned: true,
      });
    });

    it('removes the run-scoped integration worktree', async () => {
      mockTaskTopicModel.findByTaskId.mockResolvedValue([
        // The task row knows the integration worktree once a merge started…
        asTopic(
          seedRecord({
            integrationOwnerTopicId: 'topic_1',
            integrationWorktreePath: '/repos/orvilo-integration-main-topic_1',
            state: 'conflict',
          }),
        ),
        // …and the corrective row aliases it under `worktreePath`.
        {
          integration: seedRecord({
            integrationOwnerTopicId: 'topic_1',
            integrationWorktreePath: '/repos/orvilo-integration-main-topic_1',
            role: 'integrate',
            state: 'merging',
            worktreePath: '/repos/orvilo-integration-main-topic_1',
          }),
          topicId: 'topic_2',
        } as TaskTopicItem,
      ]);

      await expect(service.cleanupTaskWorktrees('task_1')).resolves.toBe(true);

      expect(deviceGateway.removeGitWorktree).toHaveBeenCalledTimes(2);
      expect(deviceGateway.removeGitWorktree).toHaveBeenCalledWith(
        expect.objectContaining({ force: false, worktreePath: '/repos/orvilo-task-T-1' }),
      );
      expect(deviceGateway.removeGitWorktree).toHaveBeenCalledWith(
        expect.objectContaining({
          force: true,
          worktreePath: '/repos/orvilo-integration-main-topic_1',
        }),
      );
    });

    it('preserves a legacy shared integration worktree after owner backfill', async () => {
      mockTaskTopicModel.findByTaskId.mockResolvedValue([
        asTopic(
          seedRecord({
            integrationOwnerTopicId: 'topic_1',
            integrationWorktreePath: '/repos/orvilo-integration-main',
            state: 'conflict',
          }),
        ),
      ]);

      await expect(service.cleanupTaskWorktrees('task_1')).resolves.toBe(false);

      expect(deviceGateway.removeGitWorktree).toHaveBeenCalledTimes(1);
      expect(deviceGateway.removeGitWorktree).toHaveBeenCalledWith(
        expect.objectContaining({ force: false, worktreePath: '/repos/orvilo-task-T-1' }),
      );
      expect(deviceGateway.removeGitWorktree).not.toHaveBeenCalledWith(
        expect.objectContaining({ worktreePath: '/repos/orvilo-integration-main' }),
      );
      expect(mockTaskTopicModel.updateIntegration).toHaveBeenCalledWith('task_1', 'topic_1', {
        worktreeCleaned: true,
      });
    });

    it('does not force-remove an integration worktree while its corrective run is active', async () => {
      const integrationWorktreePath = '/repos/orvilo-integration-main-topic_1';
      mockTaskTopicModel.findByTaskId.mockResolvedValue([
        asTopic(
          seedRecord({
            integrationOwnerTopicId: 'topic_1',
            integrationWorktreePath,
            state: 'conflict',
          }),
        ),
        {
          integration: seedRecord({
            integrationOwnerTopicId: 'topic_1',
            integrationWorktreePath,
            role: 'integrate',
            state: 'merging',
            worktreePath: integrationWorktreePath,
          }),
          status: 'running',
          topicId: 'topic_2',
        } as TaskTopicItem,
      ]);

      await expect(service.cleanupTaskWorktrees('task_1')).resolves.toBe(false);

      expect(mockTaskTopicModel.claimIntegration).not.toHaveBeenCalled();
      expect(deviceGateway.removeGitWorktree).not.toHaveBeenCalled();
    });

    it('does not remove an integration worktree when a completed retry wins the cleanup race', async () => {
      const integrationWorktreePath = '/repos/orvilo-integration-main-topic_1';
      mockTaskTopicModel.findByTaskId.mockResolvedValue([
        {
          integration: seedRecord({
            integrationOwnerTopicId: 'topic_1',
            integrationWorktreePath,
            state: 'publish_failed',
          }),
          status: 'completed',
          topicId: 'topic_1',
        } as TaskTopicItem,
      ]);
      mockTaskTopicModel.claimIntegration.mockResolvedValue(false);

      await expect(service.cleanupTaskWorktrees('task_1')).resolves.toBe(false);

      expect(mockTaskTopicModel.claimIntegration).toHaveBeenCalledWith(
        'task_1',
        'topic_1',
        'publish_failed',
        expect.any(String),
        expect.any(Date),
      );
      expect(deviceGateway.removeGitWorktree).not.toHaveBeenCalled();
    });

    it('cleans the remaining integration checkout after the task checkout was already cleaned', async () => {
      const integrationWorktreePath = '/repos/orvilo-integration-main-topic_1';
      mockTaskTopicModel.findByTaskId.mockResolvedValue([
        asTopic(
          seedRecord({
            integrationOwnerTopicId: 'topic_1',
            integrationWorktreePath,
            state: 'publish_failed',
            worktreeCleaned: true,
          }),
        ),
      ]);

      await expect(service.cleanupTaskWorktrees('task_1')).resolves.toBe(true);

      expect(deviceGateway.removeGitWorktree).toHaveBeenCalledTimes(1);
      expect(deviceGateway.removeGitWorktree).toHaveBeenCalledWith(
        expect.objectContaining({ force: true, worktreePath: integrationWorktreePath }),
      );
    });

    it('retries the task checkout after only the integration checkout was cleaned', async () => {
      const integrationWorktreePath = '/repos/orvilo-integration-main-topic_1';
      const record = seedRecord({
        integrationOwnerTopicId: 'topic_1',
        integrationWorktreePath,
        state: 'publish_failed',
      });
      mockTaskTopicModel.findByTaskId.mockResolvedValue([asTopic(record)]);
      vi.mocked(deviceGateway.removeGitWorktree).mockImplementation(async ({ worktreePath }) =>
        worktreePath === integrationWorktreePath
          ? { success: true }
          : { error: 'device busy', success: false },
      );

      await expect(service.cleanupTaskWorktrees('task_1')).resolves.toBe(false);
      expect(mockTaskTopicModel.updateIntegration).toHaveBeenCalledWith(
        'task_1',
        'topic_1',
        expect.objectContaining({ integrationWorktreeCleaned: true, worktreeCleaned: false }),
      );

      mockTaskTopicModel.findByTaskId.mockResolvedValue([
        asTopic(
          seedRecord({
            integrationOwnerTopicId: 'topic_1',
            integrationWorktreeCleaned: true,
            integrationWorktreePath,
            state: 'publish_failed',
            worktreeCleaned: false,
          }),
        ),
      ]);
      vi.mocked(deviceGateway.removeGitWorktree).mockClear().mockResolvedValue({ success: true });

      await expect(service.cleanupTaskWorktrees('task_1')).resolves.toBe(true);
      expect(deviceGateway.removeGitWorktree).toHaveBeenCalledTimes(1);
      expect(deviceGateway.removeGitWorktree).toHaveBeenCalledWith(
        expect.objectContaining({ force: false, worktreePath: '/repos/orvilo-task-T-1' }),
      );
    });

    it('skips remote records — the sandbox clone never touched a device', async () => {
      mockTaskTopicModel.findByTaskId.mockResolvedValue([asTopic(remoteRecord())]);

      await service.cleanupTaskWorktrees('task_1');

      expect(deviceGateway.removeGitWorktree).not.toHaveBeenCalled();
      expect(mockTaskTopicModel.updateIntegration).not.toHaveBeenCalled();
    });

    it('skips records whose worktree was already cleaned', async () => {
      mockTaskTopicModel.findByTaskId.mockResolvedValue([
        asTopic(seedRecord({ state: 'integrated', worktreeCleaned: true })),
      ]);

      await service.cleanupTaskWorktrees('task_1');

      expect(deviceGateway.removeGitWorktree).not.toHaveBeenCalled();
    });

    it('leaves worktreeCleaned false when the removal RPC fails', async () => {
      mockTaskTopicModel.findByTaskId.mockResolvedValue([asTopic(seedRecord())]);
      vi.mocked(deviceGateway.removeGitWorktree).mockResolvedValue({
        error: 'device offline',
        success: false,
      });

      await service.cleanupTaskWorktrees('task_1');

      expect(mockTaskTopicModel.updateIntegration).toHaveBeenCalledWith('task_1', 'topic_1', {
        worktreeCleaned: false,
      });
    });
  });
});
