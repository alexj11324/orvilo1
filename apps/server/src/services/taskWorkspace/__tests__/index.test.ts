// @vitest-environment node
import type { TaskItem } from '@orvilo/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentModel } from '@/database/models/agent';
import { TaskModel } from '@/database/models/task';
import { deviceGateway } from '@/server/services/deviceGateway';

import { TaskWorkspaceService } from '../index';

const mockTaskModel = {
  findById: vi.fn(),
};
const mockAgentModel = {
  getAgentConfig: vi.fn(),
};

vi.mock('@/database/models/task', () => ({
  TaskModel: vi.fn(),
}));

vi.mock('@/database/models/agent', () => ({
  AgentModel: vi.fn(),
}));

vi.mock('@/server/services/deviceGateway', () => ({
  deviceGateway: {
    addGitWorktree: vi.fn(),
    listGitRemoteBranches: vi.fn(),
  },
}));

const baseTask = (overrides: Partial<TaskItem> = {}): TaskItem =>
  ({
    assigneeAgentId: 'agt_1',
    config: {},
    id: 'task_1',
    identifier: 'T-1',
    totalTopics: 0,
    ...overrides,
  }) as TaskItem;

const workspaceConfig = {
  provider: 'git',
  repoPath: '/repos/orvilo',
};

describe('TaskWorkspaceService', () => {
  let service: TaskWorkspaceService;

  beforeEach(() => {
    vi.clearAllMocks();
    (TaskModel as any).mockImplementation(function () {
      return mockTaskModel;
    });
    (AgentModel as any).mockImplementation(function () {
      return mockAgentModel;
    });
    service = new TaskWorkspaceService({} as any, 'user-1', 'ws-1');
    mockAgentModel.getAgentConfig.mockResolvedValue({
      agencyConfig: { boundDeviceId: 'dev-1' },
    });
    vi.mocked(deviceGateway.listGitRemoteBranches).mockResolvedValue([
      { isDefault: true, name: 'origin/main' },
    ]);
    vi.mocked(deviceGateway.addGitWorktree).mockResolvedValue({ success: true });
  });

  describe('resolveWorkspaceConfig', () => {
    it('returns the task own workspace config', async () => {
      const task = baseTask({ config: { workspace: workspaceConfig } });
      expect(await service.resolveWorkspaceConfig(task)).toEqual(workspaceConfig);
    });

    it('inherits the workspace config from a parent task', async () => {
      mockTaskModel.findById.mockResolvedValue(
        baseTask({ config: { workspace: workspaceConfig }, id: 'task_parent' }),
      );
      const task = baseTask({ parentTaskId: 'task_parent' });
      expect(await service.resolveWorkspaceConfig(task)).toEqual(workspaceConfig);
    });

    it('returns undefined when no ancestor carries a binding', async () => {
      mockTaskModel.findById.mockResolvedValue(baseTask({ id: 'task_parent' }));
      const task = baseTask({ parentTaskId: 'task_parent' });
      expect(await service.resolveWorkspaceConfig(task)).toBeUndefined();
    });

    it('ignores malformed workspace configs', async () => {
      const task = baseTask({ config: { workspace: { provider: 's3', repoPath: '/x' } } });
      expect(await service.resolveWorkspaceConfig(task)).toBeUndefined();
    });
  });

  describe('provision', () => {
    it('creates a worktree on the resolved device and seeds the integration record', async () => {
      const task = baseTask({ config: { workspace: workspaceConfig } });

      const result = await service.provision({ seq: 1, task });

      expect(deviceGateway.addGitWorktree).toHaveBeenCalledWith({
        branch: 'task/T-1',
        deviceId: 'dev-1',
        path: '/repos/orvilo',
        ref: 'origin/main',
        userId: 'user-1',
        workspaceId: 'ws-1',
        worktreePath: '/repos/orvilo-task-T-1',
      });
      expect(result?.workingDirectory).toBe('/repos/orvilo-task-T-1');
      expect(result?.integration).toMatchObject({
        attempts: 0,
        baseBranch: 'main',
        branch: 'task/T-1',
        deviceId: 'dev-1',
        role: 'task',
        state: 'pending',
      });
    });

    it('suffices the branch with the run seq on retries', async () => {
      const task = baseTask({ config: { workspace: workspaceConfig } });
      const result = await service.provision({ seq: 3, task });
      expect(result?.branch).toBe('task/T-1-r3');
    });

    it('prefers an explicit baseBranch and deviceId over inferred ones', async () => {
      const task = baseTask({
        config: {
          workspace: { ...workspaceConfig, baseBranch: 'canary', deviceId: 'dev-explicit' },
        },
      });

      const result = await service.provision({ seq: 1, task });

      expect(deviceGateway.addGitWorktree).toHaveBeenCalledWith(
        expect.objectContaining({ deviceId: 'dev-explicit', ref: 'origin/canary' }),
      );
      expect(result?.baseBranch).toBe('canary');
      expect(mockAgentModel.getAgentConfig).not.toHaveBeenCalled();
    });

    it('returns undefined when the task has no workspace binding', async () => {
      const result = await service.provision({ seq: 1, task: baseTask() });
      expect(result).toBeUndefined();
      expect(deviceGateway.addGitWorktree).not.toHaveBeenCalled();
    });

    it('returns undefined when no concrete device can be resolved', async () => {
      mockAgentModel.getAgentConfig.mockResolvedValue({ agencyConfig: {} });
      const task = baseTask({ config: { workspace: workspaceConfig } });
      const result = await service.provision({ seq: 1, task });
      expect(result).toBeUndefined();
      expect(deviceGateway.addGitWorktree).not.toHaveBeenCalled();
    });

    it('throws when the worktree RPC fails', async () => {
      vi.mocked(deviceGateway.addGitWorktree).mockResolvedValue({
        error: 'worktree add failed: already exists',
        success: false,
      });
      const task = baseTask({ config: { workspace: workspaceConfig } });
      await expect(service.provision({ seq: 1, task })).rejects.toThrow(
        'Failed to provision task workspace',
      );
    });

    it('falls back to HEAD when no remote default branch resolves', async () => {
      vi.mocked(deviceGateway.listGitRemoteBranches).mockResolvedValue([]);
      const task = baseTask({ config: { workspace: workspaceConfig } });
      const result = await service.provision({ seq: 1, task });
      expect(result?.baseBranch).toBe('HEAD');
      expect(deviceGateway.addGitWorktree).toHaveBeenCalledWith(
        expect.objectContaining({ ref: undefined }),
      );
    });
  });
});
