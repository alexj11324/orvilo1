// @vitest-environment node
import type { TaskItem, TaskTopicIntegration } from '@orvilo/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskModel } from '@/database/models/task';
import { TaskTopicModel } from '@/database/models/taskTopic';
import type { TaskTopicItem } from '@/database/schemas/task';
import { deviceGateway } from '@/server/services/deviceGateway';
import {
  findBranchPr,
  isBranchMergedInto,
  resolveGithubAccessToken,
} from '@/server/services/githubRepo';
import { TaskRunnerService } from '@/server/services/taskRunner';
import { TaskWorkspaceService } from '@/server/services/taskWorkspace';

import { TaskIntegrationService } from '../index';

const mockTaskModel = {
  updateStatus: vi.fn(),
};
const mockTaskTopicModel = {
  findByTaskId: vi.fn(),
  findByTopicId: vi.fn(),
  updateIntegration: vi.fn(),
};
const mockRunner = {
  runTask: vi.fn(),
};
const mockWorkspaceService = {
  resolveWorkspaceConfig: vi.fn(),
};

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
    service = new TaskIntegrationService({} as any, 'user-1', 'ws-1');
    vi.mocked(deviceGateway.addGitWorktree).mockResolvedValue({ success: true });
    vi.mocked(deviceGateway.pushGitBranch).mockResolvedValue({ success: true });
    vi.mocked(deviceGateway.removeGitWorktree).mockResolvedValue({ success: true });
    mockTaskTopicModel.findByTaskId.mockResolvedValue([]);
    mockRunner.runTask.mockResolvedValue({ success: true, topicId: 'topic_2' });
  });

  it('settles without touching task_topics when the task has no workspace binding', async () => {
    mockWorkspaceService.resolveWorkspaceConfig.mockResolvedValue(undefined);
    expect(await service.integrateOnComplete({ task: baseTask(), taskTopicId: 'topic_1' })).toBe(
      'settled',
    );
    expect(mockTaskTopicModel.findByTopicId).not.toHaveBeenCalled();
  });

  it('settles immediately for a run with no integration record', async () => {
    mockTaskTopicModel.findByTopicId.mockResolvedValue(asTopic(null));
    expect(await service.integrateOnComplete({ task: baseTask(), taskTopicId: 'topic_1' })).toBe(
      'settled',
    );
    expect(deviceGateway.mergeGitBranch).not.toHaveBeenCalled();
  });

  it('merges, pushes, cleans up and settles on a clean merge', async () => {
    mockTaskTopicModel.findByTopicId.mockResolvedValue(asTopic(seedRecord()));
    vi.mocked(deviceGateway.mergeGitBranch).mockResolvedValue({
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
        worktreePath: '/repos/orvilo-integration-main',
      }),
    );
    expect(deviceGateway.mergeGitBranch).toHaveBeenCalledWith(
      expect.objectContaining({ baseRef: 'origin/main', branch: 'task/T-1' }),
    );
    expect(deviceGateway.pushGitBranch).toHaveBeenCalledWith(
      expect.objectContaining({ remoteBranch: 'main' }),
    );
    expect(deviceGateway.removeGitWorktree).toHaveBeenCalledWith(
      expect.objectContaining({ worktreePath: '/repos/orvilo-task-T-1' }),
    );
    expect(mockTaskTopicModel.updateIntegration).toHaveBeenCalledWith(
      'task_1',
      'topic_1',
      expect.objectContaining({ integratedSha: 'abc123', state: 'integrated' }),
    );
  });

  it('dispatches a corrective run bound to the integration worktree on conflict', async () => {
    mockTaskTopicModel.findByTopicId.mockResolvedValue(asTopic(seedRecord()));
    vi.mocked(deviceGateway.mergeGitBranch).mockResolvedValue({
      conflicts: ['src/a.ts'],
      state: 'conflict',
      success: false,
    });

    const outcome = await service.integrateOnComplete({
      task: baseTask(),
      taskTopicId: 'topic_1',
    });

    expect(outcome).toBe('hold');
    expect(mockRunner.runTask).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task_1',
        workspaceOverride: {
          workingDirectory: '/repos/orvilo-integration-main',
          workingDirectoryConfig: expect.objectContaining({ repoType: 'git' }),
        },
      }),
    );
    const seed = mockRunner.runTask.mock.calls[0][0].integrationSeed;
    expect(seed).toMatchObject({
      attempts: 1,
      role: 'integrate',
      runTopicId: 'topic_1',
      state: 'merging',
      worktreePath: '/repos/orvilo-integration-main',
    });
    expect(mockRunner.runTask.mock.calls[0][0].extraPrompt).toContain('src/a.ts');
  });

  it('settles when the corrective run finalized the merge', async () => {
    const record = seedRecord({
      attempts: 1,
      integrationWorktreePath: '/repos/orvilo-integration-main',
      role: 'integrate',
      runTopicId: 'topic_0',
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

    expect(outcome).toBe('settled');
    expect(deviceGateway.finalizeGitMerge).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/repos/orvilo-integration-main' }),
    );
    // Original run's record advanced too.
    expect(mockTaskTopicModel.updateIntegration).toHaveBeenCalledWith(
      'task_1',
      'topic_0',
      expect.objectContaining({ state: 'integrated' }),
    );
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

  it('reuses an existing integration worktree directory', async () => {
    mockTaskTopicModel.findByTopicId.mockResolvedValue(asTopic(seedRecord()));
    vi.mocked(deviceGateway.addGitWorktree).mockResolvedValue({
      error: "fatal: 'worktree already exists'",
      success: false,
    });
    vi.mocked(deviceGateway.mergeGitBranch).mockResolvedValue({
      sha: 'abc',
      state: 'merged',
      success: true,
    });

    expect(await service.integrateOnComplete({ task: baseTask(), taskTopicId: 'topic_1' })).toBe(
      'settled',
    );
  });

  describe('remote (sandbox-contract) records', () => {
    beforeEach(() => {
      mockWorkspaceService.resolveWorkspaceConfig.mockResolvedValue({
        provider: 'git',
        repo: 'acme/widgets',
      });
      vi.mocked(resolveGithubAccessToken).mockResolvedValue('gh-token');
      vi.mocked(findBranchPr).mockResolvedValue(undefined);
      vi.mocked(isBranchMergedInto).mockResolvedValue('unmerged');
    });

    it('settles a task run whose branch already landed on the remote', async () => {
      mockTaskTopicModel.findByTopicId.mockResolvedValue(asTopic(remoteRecord()));
      mockTaskTopicModel.findByTaskId.mockResolvedValue([asTopic(remoteRecord())]);
      vi.mocked(findBranchPr).mockResolvedValue({
        merged: true,
        sha: 'merge123',
        url: 'https://github.com/acme/widgets/pull/7',
      });

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
});
