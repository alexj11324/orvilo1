// @vitest-environment node
import type { TaskItem } from '@orvilo/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentModel } from '@/database/models/agent';
import { TaskModel } from '@/database/models/task';
import { deviceGateway } from '@/server/services/deviceGateway';
import { getRepoDefaultBranch, resolveGithubAccessToken } from '@/server/services/githubRepo';

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
    isConfigured: false,
    listGitRemoteBranches: vi.fn(),
    removeGitWorktree: vi.fn(),
  },
}));

vi.mock('@/server/services/githubRepo', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getRepoDefaultBranch: vi.fn(),
    resolveGithubAccessToken: vi.fn(),
  };
});

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

const remoteWorkspaceConfig = {
  provider: 'git',
  repo: 'acme/widgets',
};

const sandboxAgent = {
  agencyConfig: {
    executionTarget: 'sandbox',
    heterogeneousProvider: { type: 'claude-code' },
  },
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
    vi.mocked(deviceGateway.removeGitWorktree).mockResolvedValue({ success: true });
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
    it('removes a device worktree that failed before topic registration', async () => {
      const task = baseTask({ config: { workspace: workspaceConfig } });
      const provisioned = await service.provision({ seq: 1, task });

      await expect(service.discardUnregistered(provisioned!)).resolves.toBe(true);
      expect(deviceGateway.removeGitWorktree).toHaveBeenCalledWith({
        deviceId: 'dev-1',
        path: '/repos/orvilo',
        userId: 'user-1',
        workspaceId: 'ws-1',
        worktreePath: '/repos/orvilo-task-T-1',
      });
    });

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

    it('fails when a bound device workspace has no concrete device', async () => {
      mockAgentModel.getAgentConfig.mockResolvedValue({ agencyConfig: {} });
      const task = baseTask({ config: { workspace: workspaceConfig } });
      await expect(service.provision({ seq: 1, task })).rejects.toThrow(
        'Workspace device is unavailable',
      );
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

    it('fails when no remote default branch resolves on the device', async () => {
      vi.mocked(deviceGateway.listGitRemoteBranches).mockResolvedValue([]);
      const task = baseTask({ config: { workspace: workspaceConfig } });
      await expect(service.provision({ seq: 1, task })).rejects.toThrow(
        'configure baseBranch explicitly',
      );
      expect(deviceGateway.addGitWorktree).not.toHaveBeenCalled();
    });
  });

  describe('provision — remote (sandbox) contract', () => {
    beforeEach(() => {
      vi.mocked(resolveGithubAccessToken).mockResolvedValue('gh-token');
      vi.mocked(getRepoDefaultBranch).mockResolvedValue('main');
      mockAgentModel.getAgentConfig.mockResolvedValue(sandboxAgent);
    });

    it('binds a sandbox-resolved assignee to the remote repo contract', async () => {
      const task = baseTask({ config: { workspace: remoteWorkspaceConfig } });

      const result = await service.provision({ seq: 1, task });

      expect(deviceGateway.addGitWorktree).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        baseBranch: 'main',
        branch: 'task/T-1',
        repos: ['acme/widgets'],
        workingDirectory: '/workspace/widgets',
      });
      expect(result?.deviceId).toBeUndefined();
      expect(result?.integration).toMatchObject({
        attempts: 0,
        baseBranch: 'main',
        branch: 'task/T-1',
        repo: 'acme/widgets',
        role: 'task',
        state: 'pending',
      });
      expect(result?.integration.deviceId).toBeUndefined();
      expect(result?.integration.repoPath).toBeUndefined();
      expect(result?.integration.worktreePath).toBeUndefined();
      expect(result?.workingDirectoryConfig).toEqual({
        git: { branch: 'task/T-1', upstream: { branch: 'task/T-1', remote: 'origin' } },
        path: '/workspace/widgets',
        repoType: 'git',
      });
    });

    it('spells out the branch/push/PR contract in the provision prompt', async () => {
      const task = baseTask({ config: { workspace: remoteWorkspaceConfig } });

      const result = await service.provision({ seq: 1, task });

      expect(result?.prompt).toContain('git checkout -B task/T-1 origin/main');
      expect(result?.prompt).toContain('git push -u origin task/T-1');
      expect(result?.prompt).toContain('gh pr create --base main --head task/T-1');
    });

    it('suffixes the remote branch with the run seq on retries', async () => {
      const task = baseTask({ config: { workspace: remoteWorkspaceConfig } });
      const result = await service.provision({ seq: 2, task });
      expect(result?.branch).toBe('task/T-1-r2');
      expect(result?.integration.branch).toBe('task/T-1-r2');
    });

    it('prefers an explicit baseBranch over the API-resolved default', async () => {
      const task = baseTask({
        config: { workspace: { ...remoteWorkspaceConfig, baseBranch: 'canary' } },
      });

      const result = await service.provision({ seq: 1, task });

      expect(result?.baseBranch).toBe('canary');
      expect(getRepoDefaultBranch).not.toHaveBeenCalled();
    });

    it('fails when the API cannot resolve a default branch', async () => {
      vi.mocked(getRepoDefaultBranch).mockResolvedValue(undefined);
      const task = baseTask({ config: { workspace: remoteWorkspaceConfig } });
      await expect(service.provision({ seq: 1, task })).rejects.toThrow(
        'Could not resolve the default branch',
      );
    });

    it('accepts a full GitHub URL and derives the same sandbox path', async () => {
      const task = baseTask({
        config: {
          workspace: { provider: 'git', repo: 'https://github.com/acme/widgets.git' },
        },
      });
      const result = await service.provision({ seq: 1, task });
      expect(result?.workingDirectory).toBe('/workspace/widgets');
      expect(result?.repos).toEqual(['https://github.com/acme/widgets.git']);
    });

    it('fails when the assignee does not resolve to the sandbox', async () => {
      mockAgentModel.getAgentConfig.mockResolvedValue({
        agencyConfig: { executionTarget: 'none' },
      });
      const task = baseTask({ config: { workspace: remoteWorkspaceConfig } });

      await expect(service.provision({ seq: 1, task })).rejects.toThrow(
        'does not match the selected execution target',
      );
      expect(deviceGateway.addGitWorktree).not.toHaveBeenCalled();
    });

    it('still prefers the device worktree when repoPath + device resolve', async () => {
      mockAgentModel.getAgentConfig.mockResolvedValue({
        agencyConfig: {
          boundDeviceId: 'dev-1',
          executionTarget: 'device',
          heterogeneousProvider: { type: 'claude-code' },
        },
      });
      const task = baseTask({
        config: { workspace: { ...remoteWorkspaceConfig, ...workspaceConfig } },
      });

      const result = await service.provision({ seq: 1, task });

      expect(deviceGateway.addGitWorktree).toHaveBeenCalled();
      expect(result?.repos).toBeUndefined();
      expect(result?.workingDirectory).toBe('/repos/orvilo-task-T-1');
    });

    it('emits the contract for a default (unset-target) hetero assignee even with the gateway configured', async () => {
      // Dispatch resolves unset/`none` targets to the sandbox because it
      // hardcodes clientExecutionAvailable=false — a gateway-configured server
      // must not fool provisioning into the device path and lose the run's
      // work to the ephemeral sandbox.
      (deviceGateway as { isConfigured: boolean }).isConfigured = true;
      try {
        mockAgentModel.getAgentConfig.mockResolvedValue({
          agencyConfig: { heterogeneousProvider: { type: 'claude-code' } },
        });
        const task = baseTask({ config: { workspace: remoteWorkspaceConfig } });

        const result = await service.provision({ seq: 1, task });

        expect(result?.repos).toEqual(['acme/widgets']);
        expect(result?.workingDirectory).toBe('/workspace/widgets');
      } finally {
        (deviceGateway as { isConfigured: boolean }).isConfigured = false;
      }
    });

    it('fails a remote binding for a non-hetero assignee', async () => {
      // `repos` pre-clone + GITHUB_TOKEN only exist on the hetero sandbox path;
      // a plain agent on 'sandbox' could never honour the contract.
      mockAgentModel.getAgentConfig.mockResolvedValue({
        agencyConfig: { executionTarget: 'sandbox' },
      });
      const task = baseTask({ config: { workspace: remoteWorkspaceConfig } });

      await expect(service.provision({ seq: 1, task })).rejects.toThrow(
        'does not match the selected execution target',
      );
    });

    it('fails when the repo coordinate is unparseable', async () => {
      const task = baseTask({
        config: { workspace: { provider: 'git', repo: 'not-a-repo' } },
      });
      await expect(service.provision({ seq: 1, task })).rejects.toThrow(
        'not a valid GitHub coordinate',
      );
      expect(deviceGateway.addGitWorktree).not.toHaveBeenCalled();
    });

    it('fails a git binding with neither repoPath nor repo', async () => {
      const task = baseTask({ config: { workspace: { provider: 'git' } } });
      await expect(service.resolveWorkspaceConfig(task)).rejects.toThrow(
        'must provide repoPath or repo',
      );
      await expect(service.provision({ seq: 1, task })).rejects.toThrow(
        'must provide repoPath or repo',
      );
    });
  });
});
