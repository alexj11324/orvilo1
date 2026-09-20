// @vitest-environment node
import type { TaskItem } from '@orvilo/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentModel } from '@/database/models/agent';
import { RepositoryModel } from '@/database/models/repository';
import { TaskModel } from '@/database/models/task';
import { TaskWorkspaceClaimModel } from '@/database/models/taskWorkspaceClaim';
import { deviceGateway } from '@/server/services/deviceGateway';
import {
  getRemoteBranchSha,
  getRepoDefaultBranch,
  resolveGithubAccessToken,
} from '@/server/services/githubRepo';

import { TaskWorkspaceService } from '../index';

const mockTaskModel = {
  findById: vi.fn(),
};
const mockAgentModel = {
  getAgentConfig: vi.fn(),
};
const mockRepositoryModel = {
  findById: vi.fn(),
  listCheckouts: vi.fn(),
  resolveForTask: vi.fn(),
};
const mockClaimModel = {
  lookup: vi.fn(),
  matches: vi.fn(),
  mint: vi.fn(),
  release: vi.fn(),
  requestRecovery: vi.fn(),
};

vi.mock('@/database/models/task', () => ({
  TaskModel: vi.fn(),
}));

vi.mock('@/database/models/agent', () => ({
  AgentModel: vi.fn(),
}));

vi.mock('@/database/models/repository', () => ({
  RepositoryModel: vi.fn(),
}));

vi.mock('@/database/models/taskWorkspaceClaim', () => ({
  TaskWorkspaceClaimModel: vi.fn(),
  taskWorkspaceClaimKey: ({
    deviceId,
    repoPath,
    worktreePath,
  }: {
    deviceId: string;
    repoPath: string;
    worktreePath: string;
  }) => `${deviceId}:${repoPath}::${worktreePath}`,
}));

vi.mock('@/server/services/deviceGateway', () => ({
  deviceGateway: {
    addGitWorktree: vi.fn(),
    inspectGitWorktreePath: vi.fn(),
    isConfigured: false,
    listGitRemoteBranches: vi.fn(),
    removeGitWorktree: vi.fn(),
  },
}));

vi.mock('@/server/services/githubRepo', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getRemoteBranchSha: vi.fn(),
    getRepoDefaultBranch: vi.fn(),
    resolveGithubAccessToken: vi.fn(),
  };
});

/** Whether the last `addGitWorktree` landed — drives the post-add inspection. */
let worktreeAdded = false;
let worktreeBranch: string | undefined;
/** The pinned ref the add checked out — becomes the listed HEAD. */
let worktreeHead: string | undefined;

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
    (RepositoryModel as any).mockImplementation(function () {
      return mockRepositoryModel;
    });
    (TaskWorkspaceClaimModel as any).mockImplementation(function () {
      return mockClaimModel;
    });
    worktreeAdded = false;
    worktreeBranch = undefined;
    worktreeHead = undefined;
    service = new TaskWorkspaceService({} as any, 'user-1', 'ws-1');
    mockAgentModel.getAgentConfig.mockResolvedValue({
      agencyConfig: { boundDeviceId: 'dev-1' },
    });
    mockRepositoryModel.resolveForTask.mockReset();
    mockRepositoryModel.findById.mockReset();
    mockRepositoryModel.listCheckouts.mockReset();
    vi.mocked(deviceGateway.listGitRemoteBranches).mockResolvedValue([
      { isDefault: true, name: 'origin/main', sha: 'sha-base-1' },
    ]);
    // Post-provision verification re-inspects the path: absent until the add
    // succeeds, then the fresh worktree lists with its checkout HEAD pinned
    // as the run's immutable baseSha.
    vi.mocked(deviceGateway.inspectGitWorktreePath).mockImplementation(async () => {
      if (!worktreeAdded) return { kind: 'absent' };
      return {
        activeWriter: null,
        kind: 'listed',
        listed: {
          branch: worktreeBranch,
          current: false,
          head: worktreeHead ?? 'sha-base-1',
          path: `/repos/orvilo-${worktreeBranch?.replace('/', '-')}@task_1`,
          status: { added: 0, clean: true, deleted: 0, modified: 0, total: 0 },
        },
      };
    });
    vi.mocked(deviceGateway.addGitWorktree).mockImplementation(async ({ branch, ref }) => {
      worktreeAdded = true;
      worktreeBranch = branch;
      worktreeHead = ref;
      return { success: true };
    });
    vi.mocked(deviceGateway.removeGitWorktree).mockResolvedValue({ success: true });
    // The claim mint resolves to a row owned by this dispatch — the default
    // happy path. Individual tests re-mock mint/lookup to seed foreign claims.
    mockClaimModel.mint.mockImplementation(async (params: Record<string, unknown>) => ({
      deviceId: params.deviceId,
      dispatchId: params.dispatchId,
      expectedBaseSha: params.expectedBaseSha,
      generation: params.generation,
      key: 'dev-1:/repos/orvilo::/repos/orvilo-task-T-1@task_1',
      ownerToken: 'tok-1',
      repoPath: params.repoPath,
      taskId: params.taskId,
      worktreePath: params.worktreePath,
    }));
    mockClaimModel.matches.mockImplementation(
      (
        row: { dispatchId: string; generation: number; taskId: string },
        owner: { dispatchId: string; generation: number; taskId: string },
      ) =>
        row.taskId === owner.taskId &&
        row.dispatchId === owner.dispatchId &&
        row.generation === owner.generation,
    );
    mockClaimModel.lookup.mockResolvedValue(undefined);
    mockClaimModel.release.mockResolvedValue(undefined);
    mockClaimModel.requestRecovery.mockResolvedValue(undefined);
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

    it('uses an authorized local checkout instead of cloning a local-only coordinate', async () => {
      mockRepositoryModel.resolveForTask.mockResolvedValue({
        ok: true,
        repositoryId: 'repo-local',
      });
      mockRepositoryModel.findById.mockResolvedValue({
        coordinate: { defaultBranch: 'main', name: 'widgets', owner: 'acme' },
        remoteRepositoryId: null,
      });
      mockRepositoryModel.listCheckouts.mockResolvedValue([
        { canonicalPath: '/authorized/widgets', deviceId: 'dev-1' },
      ]);

      await expect(
        service.resolveWorkspaceConfig(baseTask({ projectId: 'project-1' })),
      ).resolves.toEqual({
        baseBranch: 'main',
        deviceId: 'dev-1',
        provider: 'git',
        repoPath: '/authorized/widgets',
      });
    });
  });

  describe('provision', () => {
    it('removes a device worktree that failed before topic registration', async () => {
      const task = baseTask({ config: { workspace: workspaceConfig } });
      const provisioned = await service.provision({
        dispatchId: 'disp-1',
        generation: 1,
        seq: 1,
        task,
      });

      await expect(service.discardUnregistered(provisioned!)).resolves.toBe(true);
      expect(deviceGateway.removeGitWorktree).toHaveBeenCalledWith({
        deviceId: 'dev-1',
        path: '/repos/orvilo',
        userId: 'user-1',
        workspaceId: 'ws-1',
        worktreePath: '/repos/orvilo-task-T-1@task_1',
      });
    });

    it('creates a worktree on the resolved device and seeds the integration record', async () => {
      const task = baseTask({ config: { workspace: workspaceConfig } });

      const result = await service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task });

      // F07: the add is pinned to the resolved commit — the mutable ref is
      // only used for `baseBranch` bookkeeping, never as the checkout target.
      expect(deviceGateway.addGitWorktree).toHaveBeenCalledWith({
        branch: 'task/T-1',
        deviceId: 'dev-1',
        path: '/repos/orvilo',
        ref: 'sha-base-1',
        userId: 'user-1',
        workspaceId: 'ws-1',
        worktreePath: '/repos/orvilo-task-T-1@task_1',
      });
      expect(mockClaimModel.mint).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceId: 'dev-1',
          dispatchId: 'disp-1',
          expectedBaseSha: 'sha-base-1',
          generation: 1,
          taskId: 'task_1',
          worktreePath: '/repos/orvilo-task-T-1@task_1',
        }),
      );
      expect(result?.workingDirectory).toBe('/repos/orvilo-task-T-1@task_1');
      expect(result?.integration).toMatchObject({
        attempts: 0,
        baseBranch: 'main',
        baseSha: 'sha-base-1',
        branch: 'task/T-1',
        deviceId: 'dev-1',
        role: 'task',
        state: 'pending',
      });
    });

    it('pins the checked-out base commit and fails when the checkout cannot be verified', async () => {
      const task = baseTask({ config: { workspace: workspaceConfig } });

      const ok = await service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task });
      expect(ok?.integration.baseSha).toBe('sha-base-1');

      // The add landed but the re-inspection shows a different branch — the
      // checkout is not what the contract asked for, so provisioning refuses.
      worktreeAdded = false;
      vi.mocked(deviceGateway.inspectGitWorktreePath).mockImplementation(async () => {
        if (!worktreeAdded) return { kind: 'absent' };
        return {
          kind: 'listed',
          listed: {
            branch: 'task/T-9',
            current: false,
            head: 'sha-other',
            path: '/repos/orvilo-task-T-1@task_1',
            status: { added: 0, clean: true, deleted: 0, modified: 0, total: 0 },
          },
        };
      });
      await expect(
        service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task }),
      ).rejects.toThrow('could not verify the new checkout');
    });

    it('suffices the branch with the run seq on retries', async () => {
      const task = baseTask({ config: { workspace: workspaceConfig } });
      const result = await service.provision({ dispatchId: 'disp-1', generation: 1, seq: 3, task });
      expect(result?.branch).toBe('task/T-1-r3');
    });

    it('prefers an explicit baseBranch and deviceId over inferred ones', async () => {
      vi.mocked(deviceGateway.listGitRemoteBranches).mockResolvedValue([
        { isDefault: true, name: 'origin/main', sha: 'sha-base-1' },
        { isDefault: false, name: 'origin/canary', sha: 'sha-canary-1' },
      ]);
      const task = baseTask({
        config: {
          workspace: { ...workspaceConfig, baseBranch: 'canary', deviceId: 'dev-explicit' },
        },
      });

      const result = await service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task });

      expect(deviceGateway.addGitWorktree).toHaveBeenCalledWith(
        expect.objectContaining({ deviceId: 'dev-explicit', ref: 'sha-canary-1' }),
      );
      expect(result?.baseBranch).toBe('canary');
      expect(mockAgentModel.getAgentConfig).not.toHaveBeenCalled();
    });

    it('returns undefined when the task has no workspace binding', async () => {
      const result = await service.provision({
        dispatchId: 'disp-1',
        generation: 1,
        seq: 1,
        task: baseTask(),
      });
      expect(result).toBeUndefined();
      expect(deviceGateway.addGitWorktree).not.toHaveBeenCalled();
    });

    it('fails when a bound device workspace has no concrete device', async () => {
      mockAgentModel.getAgentConfig.mockResolvedValue({ agencyConfig: {} });
      const task = baseTask({ config: { workspace: workspaceConfig } });
      await expect(
        service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task }),
      ).rejects.toThrow('Workspace device is unavailable');
      expect(deviceGateway.addGitWorktree).not.toHaveBeenCalled();
    });

    it('fails an explicit baseBranch that does not exist on the device repo', async () => {
      const task = baseTask({
        config: { workspace: { ...workspaceConfig, baseBranch: 'release-9' } },
      });
      await expect(
        service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task }),
      ).rejects.toThrow('origin/release-9');
      expect(deviceGateway.addGitWorktree).not.toHaveBeenCalled();
    });

    it('rejects a relative repoPath before touching the device', async () => {
      const task = baseTask({
        config: { workspace: { provider: 'git', repoPath: 'repos/orvilo' } },
      });
      await expect(
        service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task }),
      ).rejects.toThrow('absolute path');
      expect(deviceGateway.addGitWorktree).not.toHaveBeenCalled();
    });

    it('reuses the same-path worktree when an identical provision replays after a crash', async () => {
      vi.mocked(deviceGateway.inspectGitWorktreePath).mockResolvedValue({
        activeWriter: null,
        kind: 'listed',
        listed: {
          branch: 'task/T-1',
          current: false,
          head: 'sha-base-1',
          path: '/repos/orvilo-task-T-1@task_1',
          status: { added: 0, clean: true, deleted: 0, modified: 0, total: 0 },
        },
      });
      const task = baseTask({ config: { workspace: workspaceConfig } });

      const result = await service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task });

      expect(result?.workingDirectory).toBe('/repos/orvilo-task-T-1@task_1');
      expect(deviceGateway.addGitWorktree).not.toHaveBeenCalled();
      expect(deviceGateway.removeGitWorktree).not.toHaveBeenCalled();
    });

    it('A01: refuses reuse when the path is claimed by another dispatch — content preserved', async () => {
      // mint reports the row back as-is; seed a foreign-dispatch claim.
      mockClaimModel.mint.mockResolvedValue({
        deviceId: 'dev-1',
        dispatchId: 'disp-other',
        expectedBaseSha: 'sha-base-1',
        generation: 2,
        ownerToken: 'tok-other',
        taskId: 'task_1',
      });
      const task = baseTask({ config: { workspace: workspaceConfig } });

      await expect(
        service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task }),
      ).rejects.toThrowError('claimed by another dispatch');

      expect(deviceGateway.addGitWorktree).not.toHaveBeenCalled();
      expect(deviceGateway.removeGitWorktree).not.toHaveBeenCalled();
      expect(deviceGateway.inspectGitWorktreePath).not.toHaveBeenCalled();
      expect(mockClaimModel.requestRecovery).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'claim_conflict' }),
      );
    });

    it('A02: refuses reuse of a clean worktree while a live writer owns it', async () => {
      vi.mocked(deviceGateway.inspectGitWorktreePath).mockResolvedValue({
        activeWriter: { operationId: 'op-live', pid: 4242 },
        kind: 'listed',
        listed: {
          branch: 'task/T-1',
          current: false,
          head: 'sha-base-1',
          path: '/repos/orvilo-task-T-1@task_1',
          status: { added: 0, clean: true, deleted: 0, modified: 0, total: 0 },
        },
      } as any);
      const task = baseTask({ config: { workspace: workspaceConfig } });

      await expect(
        service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task }),
      ).rejects.toThrowError('live writer');

      expect(deviceGateway.addGitWorktree).not.toHaveBeenCalled();
      expect(mockClaimModel.requestRecovery).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'orphan_directory' }),
      );
    });

    it('A03: refuses reuse when the same-branch HEAD differs from the claimed base', async () => {
      vi.mocked(deviceGateway.inspectGitWorktreePath).mockResolvedValue({
        activeWriter: null,
        kind: 'listed',
        listed: {
          branch: 'task/T-1',
          current: false,
          head: 'sha-drifted',
          path: '/repos/orvilo-task-T-1@task_1',
          status: { added: 0, clean: true, deleted: 0, modified: 0, total: 0 },
        },
      } as any);
      const task = baseTask({ config: { workspace: workspaceConfig } });

      await expect(
        service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task }),
      ).rejects.toThrowError('preserved for manual resolution');

      expect(deviceGateway.addGitWorktree).not.toHaveBeenCalled();
    });

    it('blocks on a same-path worktree checked out to a different branch', async () => {
      // F01: a matching directory name is never proof of ownership — the
      // occupant is preserved, not force-removed.
      vi.mocked(deviceGateway.inspectGitWorktreePath).mockResolvedValue({
        activeWriter: null,
        kind: 'listed',
        listed: {
          branch: 'task/T-9',
          current: false,
          path: '/repos/orvilo-task-T-1@task_1',
          status: { added: 0, clean: true, deleted: 0, modified: 0, total: 0 },
        },
      });
      const task = baseTask({ config: { workspace: workspaceConfig } });

      await expect(
        service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task }),
      ).rejects.toThrow('preserved for manual resolution');
      expect(deviceGateway.removeGitWorktree).not.toHaveBeenCalled();
      expect(deviceGateway.addGitWorktree).not.toHaveBeenCalled();
      expect(mockClaimModel.requestRecovery).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'orphan_directory' }),
      );
    });

    it('blocks on a same-branch worktree that is dirty or locked', async () => {
      vi.mocked(deviceGateway.inspectGitWorktreePath).mockResolvedValue({
        activeWriter: null,
        kind: 'listed',
        listed: {
          branch: 'task/T-1',
          current: false,
          path: '/repos/orvilo-task-T-1@task_1',
          status: { added: 0, clean: false, deleted: 0, modified: 2, total: 2 },
        },
      });
      const task = baseTask({ config: { workspace: workspaceConfig } });

      await expect(
        service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task }),
      ).rejects.toThrow('preserved for manual resolution');
      expect(deviceGateway.removeGitWorktree).not.toHaveBeenCalled();
      expect(deviceGateway.addGitWorktree).not.toHaveBeenCalled();
    });

    it.each(['orphan-safe', 'orphan-foreign'] as const)(
      'A04/A05: queues an %s path for manual recovery — never auto-deletes',
      async (kind) => {
        vi.mocked(deviceGateway.inspectGitWorktreePath).mockResolvedValue({ kind });
        const task = baseTask({ config: { workspace: workspaceConfig } });

        await expect(
          service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task }),
        ).rejects.toThrowError('queued for manual cleanup');

        expect(mockClaimModel.requestRecovery).toHaveBeenCalledWith(
          expect.objectContaining({
            kind: 'orphan_directory',
            taskId: 'task_1',
            worktreePath: '/repos/orvilo-task-T-1@task_1',
          }),
        );
        expect(deviceGateway.addGitWorktree).not.toHaveBeenCalled();
        expect(deviceGateway.removeGitWorktree).not.toHaveBeenCalled();
      },
    );

    it('blocks when the inspection itself fails instead of treating the path as free', async () => {
      vi.mocked(deviceGateway.inspectGitWorktreePath).mockResolvedValue({
        error: 'spawn git ENOENT',
        kind: 'unknown',
      });
      const task = baseTask({ config: { workspace: workspaceConfig } });

      await expect(
        service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task }),
      ).rejects.toThrow('cannot inspect');
      expect(deviceGateway.addGitWorktree).not.toHaveBeenCalled();
    });

    it('A06: blocks with an explicit capability error when the host lacks inspect', async () => {
      vi.mocked(deviceGateway.inspectGitWorktreePath).mockResolvedValue(undefined);
      const task = baseTask({ config: { workspace: workspaceConfig } });

      await expect(
        service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task }),
      ).rejects.toThrow('does not support worktree inspection');
      expect(deviceGateway.addGitWorktree).not.toHaveBeenCalled();
    });

    it('blocks when an unknown inspection is queued for recovery', async () => {
      vi.mocked(deviceGateway.inspectGitWorktreePath).mockResolvedValue({
        error: 'spawn git ENOENT',
        kind: 'unknown',
      });
      const task = baseTask({ config: { workspace: workspaceConfig } });

      await expect(
        service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task }),
      ).rejects.toThrow('cannot inspect');
      expect(mockClaimModel.requestRecovery).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'inspection_unknown' }),
      );
      expect(deviceGateway.addGitWorktree).not.toHaveBeenCalled();
    });

    it('E02: pins the resolved SHA even if the ref advances before the add', async () => {
      // The add lands but the post-add inspection reports a newer HEAD than
      // the claim's pinned base — the run refuses to adopt drifted state.
      vi.mocked(deviceGateway.inspectGitWorktreePath)
        .mockResolvedValueOnce({ kind: 'absent' })
        .mockResolvedValue({
          activeWriter: null,
          kind: 'listed',
          listed: {
            branch: 'task/T-1',
            current: false,
            head: 'sha-newer',
            path: '/repos/orvilo-task-T-1@task_1',
            status: { added: 0, clean: true, deleted: 0, modified: 0, total: 0 },
          },
        });
      const task = baseTask({ config: { workspace: workspaceConfig } });

      await expect(
        service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task }),
      ).rejects.toThrowError('instead of the pinned base sha-base-1');
      expect(deviceGateway.addGitWorktree).toHaveBeenCalledWith(
        expect.objectContaining({ ref: 'sha-base-1' }),
      );
    });

    it('E03: blocks when the remote SHA cannot be resolved on the device', async () => {
      vi.mocked(deviceGateway.listGitRemoteBranches).mockResolvedValue([
        { isDefault: true, name: 'origin/main' },
      ]);
      const task = baseTask({ config: { workspace: workspaceConfig } });

      await expect(
        service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task }),
      ).rejects.toThrow('Could not resolve the remote base commit');
      expect(mockClaimModel.mint).not.toHaveBeenCalled();
      expect(deviceGateway.addGitWorktree).not.toHaveBeenCalled();
    });

    it('stops with an explicit error when a leftover branch already exists', async () => {
      vi.mocked(deviceGateway.addGitWorktree).mockResolvedValue({
        error: "branch 'task/T-1' already exists",
        success: false,
      });
      const task = baseTask({ config: { workspace: workspaceConfig } });

      await expect(
        service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task }),
      ).rejects.toThrow('resolve or rename the leftover branch manually');
      expect(deviceGateway.addGitWorktree).toHaveBeenCalledTimes(1);
    });

    it('surfaces the add failure when the re-inspection cannot clear it', async () => {
      vi.mocked(deviceGateway.addGitWorktree).mockResolvedValue({
        error: 'permission denied',
        success: false,
      });
      const task = baseTask({ config: { workspace: workspaceConfig } });
      await expect(
        service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task }),
      ).rejects.toThrow('permission denied');
    });

    it('fails when no remote default branch resolves on the device', async () => {
      vi.mocked(deviceGateway.listGitRemoteBranches).mockResolvedValue([]);
      const task = baseTask({ config: { workspace: workspaceConfig } });
      await expect(
        service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task }),
      ).rejects.toThrow('configure baseBranch explicitly');
      expect(deviceGateway.addGitWorktree).not.toHaveBeenCalled();
    });
  });

  describe('provision — remote (sandbox) contract', () => {
    beforeEach(() => {
      vi.mocked(resolveGithubAccessToken).mockResolvedValue('gh-token');
      vi.mocked(getRepoDefaultBranch).mockResolvedValue('main');
      vi.mocked(getRemoteBranchSha).mockResolvedValue('sha-remote-base');
      mockAgentModel.getAgentConfig.mockResolvedValue(sandboxAgent);
    });

    it('binds a sandbox-resolved assignee to the remote repo contract', async () => {
      const task = baseTask({ config: { workspace: remoteWorkspaceConfig } });

      const result = await service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task });

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

      const result = await service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task });

      expect(result?.prompt).toContain('fetch `origin/main` and work only on `task/T-1`');
      expect(result?.prompt).toContain('git push -u origin task/T-1');
      expect(result?.prompt).toContain('gh pr create');
      expect(result?.prompt).toContain('Do not merge it yourself');
    });

    it('pins the remote base SHA on the integration record before the sandbox runs', async () => {
      vi.mocked(getRemoteBranchSha).mockResolvedValue('sha-remote-base');
      const task = baseTask({ config: { workspace: remoteWorkspaceConfig } });

      const result = await service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task });

      expect(getRemoteBranchSha).toHaveBeenCalledWith('acme/widgets', 'main', 'gh-token');
      expect(result?.integration.baseSha).toBe('sha-remote-base');
      expect(result?.prompt).toContain('`sha-remote-base`');
    });

    it('E03: blocks when the remote base SHA cannot be resolved', async () => {
      vi.mocked(getRemoteBranchSha).mockResolvedValue(undefined);
      const task = baseTask({ config: { workspace: remoteWorkspaceConfig } });

      await expect(
        service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task }),
      ).rejects.toThrow('Could not resolve the remote base commit');
    });

    it('suffixes the remote branch with the run seq on retries', async () => {
      const task = baseTask({ config: { workspace: remoteWorkspaceConfig } });
      const result = await service.provision({ dispatchId: 'disp-1', generation: 1, seq: 2, task });
      expect(result?.branch).toBe('task/T-1-r2');
      expect(result?.integration.branch).toBe('task/T-1-r2');
    });

    it('prefers an explicit baseBranch over the API-resolved default', async () => {
      const task = baseTask({
        config: { workspace: { ...remoteWorkspaceConfig, baseBranch: 'canary' } },
      });

      const result = await service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task });

      expect(result?.baseBranch).toBe('canary');
      expect(getRepoDefaultBranch).not.toHaveBeenCalled();
    });

    it('fails when the API cannot resolve a default branch', async () => {
      vi.mocked(getRepoDefaultBranch).mockResolvedValue(undefined);
      const task = baseTask({ config: { workspace: remoteWorkspaceConfig } });
      await expect(
        service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task }),
      ).rejects.toThrow('Could not resolve the default branch');
    });

    it('accepts a full GitHub URL and derives the same sandbox path', async () => {
      const task = baseTask({
        config: {
          workspace: { provider: 'git', repo: 'https://github.com/acme/widgets.git' },
        },
      });
      const result = await service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task });
      expect(result?.workingDirectory).toBe('/workspace/widgets');
      expect(result?.repos).toEqual(['https://github.com/acme/widgets.git']);
    });

    it('fails when the assignee does not resolve to the sandbox', async () => {
      mockAgentModel.getAgentConfig.mockResolvedValue({
        agencyConfig: { executionTarget: 'none' },
      });
      const task = baseTask({ config: { workspace: remoteWorkspaceConfig } });

      await expect(
        service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task }),
      ).rejects.toThrow('does not match the selected execution target');
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

      const result = await service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task });

      expect(deviceGateway.addGitWorktree).toHaveBeenCalled();
      expect(result?.repos).toBeUndefined();
      expect(result?.workingDirectory).toBe('/repos/orvilo-task-T-1@task_1');
    });

    it('fails a default (unset-target) hetero assignee even with the gateway configured', async () => {
      // An unset/`none` target is a pending state — dispatch fails loudly and
      // asks the owner to pick a device or the cloud sandbox, so provisioning
      // must not silently emit the remote contract either, even when the
      // device gateway is configured.
      (deviceGateway as { isConfigured: boolean }).isConfigured = true;
      try {
        mockAgentModel.getAgentConfig.mockResolvedValue({
          agencyConfig: { heterogeneousProvider: { type: 'claude-code' } },
        });
        const task = baseTask({ config: { workspace: remoteWorkspaceConfig } });

        await expect(
          service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task }),
        ).rejects.toThrow('does not match the selected execution target');
        expect(deviceGateway.addGitWorktree).not.toHaveBeenCalled();
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

      await expect(
        service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task }),
      ).rejects.toThrow('does not match the selected execution target');
    });

    it('fails when the repo coordinate is unparseable', async () => {
      const task = baseTask({
        config: { workspace: { provider: 'git', repo: 'not-a-repo' } },
      });
      await expect(
        service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task }),
      ).rejects.toThrow('not a valid GitHub coordinate');
      expect(deviceGateway.addGitWorktree).not.toHaveBeenCalled();
    });

    it('fails a git binding with neither repoPath nor repo', async () => {
      const task = baseTask({ config: { workspace: { provider: 'git' } } });
      await expect(service.resolveWorkspaceConfig(task)).rejects.toThrow(
        'must provide repoPath or repo',
      );
      await expect(
        service.provision({ dispatchId: 'disp-1', generation: 1, seq: 1, task }),
      ).rejects.toThrow('must provide repoPath or repo');
    });
  });
});
