import type {
  LobeAgentAgencyConfig,
  TaskItem,
  TaskTopicIntegration,
  TaskWorkspaceConfig,
  WorkingDirConfig,
} from '@orvilo/types';
import { cloudSandboxRepoPath, deriveWorktreePath } from '@orvilo/types';
import { isRecord } from '@orvilo/utils/object';
import debug from 'debug';

import { AgentModel } from '@/database/models/agent';
import { TaskModel } from '@/database/models/task';
import type { LobeChatDatabase } from '@/database/type';
import { resolveExecutionPlan } from '@/helpers/executionTarget';
import { supportsCloudHeterogeneousSandbox } from '@/server/services/aiAgent/helpers/heteroErrors';
import { deviceGateway } from '@/server/services/deviceGateway';
import {
  getRepoDefaultBranch,
  parseGithubRepo,
  resolveGithubAccessToken,
} from '@/server/services/githubRepo';

const log = debug('task-workspace');
const WORKSPACE_INHERIT_DEPTH = 10;

export interface ProvisionedWorkspace {
  baseBranch: string;
  branch: string;
  deviceId?: string;
  integration: TaskTopicIntegration;
  /** Branch/push/PR delivery contract appended to the task prompt. */
  prompt?: string;
  /** Repos a cloud sandbox must pre-clone. */
  repos?: string[];
  workingDirectory: string;
  workingDirectoryConfig: WorkingDirConfig;
}

/**
 * Resolve a Task's repo binding and give every fresh run an isolated checkout.
 * A binding with a GitHub `repo` also carries the PR-first delivery contract:
 * the run may push only its task branch and must leave the base branch for the
 * review controller to merge after CI/comments/review gates settle.
 */
export class TaskWorkspaceService {
  private agentModel: AgentModel;
  private db: LobeChatDatabase;
  private taskModel: TaskModel;
  private userId: string;
  private workspaceId?: string;

  constructor(db: LobeChatDatabase, userId: string, workspaceId?: string) {
    this.db = db;
    this.userId = userId;
    this.workspaceId = workspaceId;
    this.agentModel = new AgentModel(db, userId, workspaceId);
    this.taskModel = new TaskModel(db, userId, workspaceId);
  }

  async discardUnregistered(workspace: ProvisionedWorkspace): Promise<boolean> {
    const { deviceId, repoPath, worktreePath } = workspace.integration;
    if (!deviceId || !repoPath || !worktreePath || worktreePath === repoPath) return true;

    const removed = await deviceGateway.removeGitWorktree({
      deviceId,
      path: repoPath,
      userId: this.userId,
      workspaceId: this.workspaceId,
      worktreePath,
    });
    if (!removed.success) {
      log(
        'discardUnregistered: remove failed for %s — %s',
        worktreePath,
        removed.error ?? 'unknown error',
      );
    }
    return removed.success;
  }

  async resolveWorkspaceConfig(task: TaskItem): Promise<TaskWorkspaceConfig | undefined> {
    let current: TaskItem | null = task;
    for (let depth = 0; current && depth < WORKSPACE_INHERIT_DEPTH; depth += 1) {
      const config = parseWorkspaceConfig(current.config);
      if (config) return config;
      const rawConfig = current.config as Record<string, unknown> | null;
      const rawWorkspace = rawConfig?.workspace;
      if (isRecord(rawWorkspace) && rawWorkspace.provider === 'git') {
        throw new Error('Git workspace binding must provide repoPath or repo');
      }
      if (!current.parentTaskId) break;
      current = await this.taskModel.findById(current.parentTaskId);
    }
    return undefined;
  }

  async provision(params: {
    seq: number;
    task: TaskItem;
  }): Promise<ProvisionedWorkspace | undefined> {
    const { task, seq } = params;
    const config = await this.resolveWorkspaceConfig(task);
    if (!config) return undefined;

    if (config.repo && !parseGithubRepo(config.repo)) {
      throw new Error(`Workspace repository is not a valid GitHub coordinate: ${config.repo}`);
    }

    const needsAgent = !config.deviceId || !!config.repo;
    const agent =
      needsAgent && task.assigneeAgentId
        ? await this.agentModel.getAgentConfig(task.assigneeAgentId)
        : null;
    const deviceId = config.deviceId ?? agent?.agencyConfig?.boundDeviceId;

    if (
      config.repo &&
      runsInSandbox(agent?.agencyConfig ?? undefined, config.deviceId)
    ) {
      return this.provisionOnRemote({
        config,
        credKey: agent?.agencyConfig?.heterogeneousProvider?.env?.GITHUB_CRED_KEY,
        seq,
        task,
      });
    }

    if (config.repoPath && deviceId) {
      return this.provisionOnDevice({ config, deviceId, seq, task });
    }

    const reason = config.repoPath && !deviceId
      ? 'Workspace device is unavailable or not configured'
      : 'Workspace binding does not match the selected execution target';
    log('provision: %s cannot provision workspace — %s', task.identifier, reason);
    throw new Error(reason);
  }

  /** Create a run-owned worktree. When `repo` is present it is also PR-bound. */
  private async provisionOnDevice(params: {
    config: TaskWorkspaceConfig;
    deviceId: string;
    seq: number;
    task: TaskItem;
  }): Promise<ProvisionedWorkspace> {
    const { config, deviceId, seq, task } = params;
    const repoPath = config.repoPath!;
    const { baseBranch, forkRef } = await this.resolveBase(task, config, repoPath, deviceId);

    const branch = taskBranchName(task.identifier, seq);
    const worktreePath = deriveWorktreePath(repoPath, branch);
    const added = await deviceGateway.addGitWorktree({
      branch,
      deviceId,
      path: repoPath,
      ref: forkRef,
      userId: this.userId,
      workspaceId: this.workspaceId,
      worktreePath,
    });
    if (!added.success) {
      throw new Error(
        `Failed to provision task workspace: ${added.error ?? 'worktree add failed'}`,
      );
    }

    const workingDirectoryConfig: WorkingDirConfig = {
      git: { branch, isWorktree: true },
      path: worktreePath,
      repoType: 'git',
    };
    const integration: TaskTopicIntegration = {
      attempts: 0,
      baseBranch,
      branch,
      deviceId,
      repo: config.repo,
      repoPath,
      role: 'task',
      state: 'pending',
      worktreePath,
    };

    return {
      baseBranch,
      branch,
      deviceId,
      integration,
      prompt: config.repo
        ? buildRemoteContractPrompt({
            baseBranch,
            branch,
            repo: config.repo,
            workingDirectory: worktreePath,
          })
        : undefined,
      workingDirectory: worktreePath,
      workingDirectoryConfig,
    };
  }

  private async provisionOnRemote(params: {
    config: TaskWorkspaceConfig;
    credKey?: string;
    seq: number;
    task: TaskItem;
  }): Promise<ProvisionedWorkspace> {
    const { config, seq, task } = params;
    const repo = config.repo!;

    const token = await resolveGithubAccessToken({
      credKey: params.credKey,
      db: this.db,
      userId: this.userId,
      workspaceId: this.workspaceId,
    });
    const baseBranch = config.baseBranch ?? (await getRepoDefaultBranch(repo, token));
    if (!baseBranch) {
      throw new Error(`Could not resolve the default branch for workspace repository ${repo}`);
    }

    const branch = taskBranchName(task.identifier, seq);
    const workingDirectory = cloudSandboxRepoPath(repo);
    const integration: TaskTopicIntegration = {
      attempts: 0,
      baseBranch,
      branch,
      repo,
      role: 'task',
      state: 'pending',
    };

    return {
      baseBranch,
      branch,
      integration,
      prompt: buildRemoteContractPrompt({ baseBranch, branch, repo, workingDirectory }),
      repos: [repo],
      workingDirectory,
      workingDirectoryConfig: {
        git: { branch, upstream: { branch, remote: 'origin' } },
        path: workingDirectory,
        repoType: 'git',
      },
    };
  }

  private async resolveBase(
    task: TaskItem,
    config: TaskWorkspaceConfig,
    repoPath: string,
    deviceId: string,
  ): Promise<{ baseBranch: string; forkRef?: string }> {
    if (config.baseBranch)
      return { baseBranch: config.baseBranch, forkRef: `origin/${config.baseBranch}` };

    try {
      const remotes = await deviceGateway.listGitRemoteBranches({
        deviceId,
        path: repoPath,
        userId: this.userId,
        workspaceId: this.workspaceId,
      });
      const defaultRemote = remotes?.find((b) => b.isDefault)?.name;
      if (defaultRemote) {
        const baseBranch = defaultRemote.replace(/^origin\//, '');
        return { baseBranch, forkRef: defaultRemote };
      }
    } catch (error) {
      log('resolveBase: remote lookup failed for %s — %O', task.identifier, error);
    }

    throw new Error(
      `Could not resolve a remote base branch for ${task.identifier}; configure baseBranch explicitly`,
    );
  }
}

const parseWorkspaceConfig = (config: unknown): TaskWorkspaceConfig | undefined => {
  if (!isRecord(config)) return undefined;
  const workspace = config.workspace;
  if (!isRecord(workspace) || workspace.provider !== 'git') return undefined;
  const repoPath =
    typeof workspace.repoPath === 'string' && workspace.repoPath.trim()
      ? workspace.repoPath
      : undefined;
  const repo =
    typeof workspace.repo === 'string' && workspace.repo.trim() ? workspace.repo : undefined;
  if (!repoPath && !repo) return undefined;
  return {
    baseBranch: typeof workspace.baseBranch === 'string' ? workspace.baseBranch : undefined,
    deviceId: typeof workspace.deviceId === 'string' ? workspace.deviceId : undefined,
    provider: 'git',
    repo,
    repoPath,
  };
};

/** A fresh delivery attempt owns a fresh worktree/branch; review fixes reuse it. */
const taskBranchName = (identifier: string, seq: number): string =>
  seq > 1 ? `task/${identifier}-r${seq}` : `task/${identifier}`;

const runsInSandbox = (
  agencyConfig: LobeAgentAgencyConfig | undefined,
  requestedDeviceId?: string,
): boolean => {
  const heteroType = agencyConfig?.heterogeneousProvider?.type;
  const heteroEngine = agencyConfig?.heterogeneousProvider?.engine;
  if (!heteroType || !supportsCloudHeterogeneousSandbox(heteroType, heteroEngine)) return false;
  return (
    resolveExecutionPlan({
      agencyConfig,
      clientExecutionAvailable: false,
      isHetero: true,
      requestedDeviceId,
      sandboxExecutionAvailable: supportsCloudHeterogeneousSandbox(heteroType, heteroEngine),
    }).kind === 'sandbox'
  );
};

const buildRemoteContractPrompt = (params: {
  baseBranch: string;
  branch: string;
  repo: string;
  workingDirectory: string;
}): string =>
  [
    '[Workspace contract] This code task is delivered through one GitHub pull request.',
    `- Repository: \`${params.repo}\`; working directory: \`${params.workingDirectory}\`.`,
    `- Before editing, fetch \`origin/${params.baseBranch}\` and work only on \`${params.branch}\`. If the branch does not exist yet, create it from \`origin/${params.baseBranch}\`.`,
    `- Commit changes on \`${params.branch}\` and push with \`git push -u origin ${params.branch}\`. Never push directly to \`${params.baseBranch}\`.`,
    `- Ensure exactly one pull request exists from \`${params.branch}\` to \`${params.baseBranch}\` (create it with \`gh pr create\` if needed).`,
    '- Leave the PR open. Do not merge it yourself. Orvilo will move the task into review, process CI and review comments on the same PR, and merge only after the gates pass.',
    '- A run is not a delivery until its commits are pushed. Preserve the branch/PR identity across review fixes.',
  ].join('\n');