import type {
  TaskItem,
  TaskTopicIntegration,
  TaskWorkspaceConfig,
  WorkingDirConfig,
} from '@orvilo/types';
import { deriveWorktreePath } from '@orvilo/types';
import { isRecord } from '@orvilo/utils/object';
import debug from 'debug';

import { AgentModel } from '@/database/models/agent';
import { TaskModel } from '@/database/models/task';
import type { LobeChatDatabase } from '@/database/type';
import { deviceGateway } from '@/server/services/deviceGateway';

const log = debug('task-workspace');

/** Max hops up the parentTaskId chain when inheriting a workspace binding. */
const WORKSPACE_INHERIT_DEPTH = 10;

export interface ProvisionedWorkspace {
  baseBranch: string;
  branch: string;
  deviceId: string;
  /** Seed record the runner persists on `task_topics.integration`. */
  integration: TaskTopicIntegration;
  workingDirectory: string;
  workingDirectoryConfig: WorkingDirConfig;
}

/**
 * TaskWorkspaceService — resolves a task's `config.workspace` repo binding and
 * provisions an isolated git worktree on the bound device for each fresh run
 * (branch `task/<identifier>`), so parallel runs never share one checkout.
 * Provisioning is best-effort on device resolution — a task whose assignee has
 * no concrete device runs unprovisioned — but a resolved device that fails to
 * create the worktree fails the run (the caller pauses the task), since
 * silently running in the source checkout would corrupt the isolation
 * guarantee the binding exists to provide.
 */
export class TaskWorkspaceService {
  private agentModel: AgentModel;
  private taskModel: TaskModel;
  private userId: string;
  private workspaceId?: string;

  constructor(db: LobeChatDatabase, userId: string, workspaceId?: string) {
    this.userId = userId;
    this.workspaceId = workspaceId;
    this.agentModel = new AgentModel(db, userId, workspaceId);
    this.taskModel = new TaskModel(db, userId, workspaceId);
  }

  /**
   * Read `config.workspace` off the task or its nearest ancestor. Subtasks of
   * a workspace-bound root share the repo binding — they get their own
   * branch/worktree rather than each needing the config repeated.
   */
  async resolveWorkspaceConfig(task: TaskItem): Promise<TaskWorkspaceConfig | undefined> {
    let current: TaskItem | null = task;
    for (let depth = 0; current && depth < WORKSPACE_INHERIT_DEPTH; depth += 1) {
      const config = parseWorkspaceConfig(current.config);
      if (config) return config;
      if (!current.parentTaskId) break;
      current = await this.taskModel.findById(current.parentTaskId);
    }
    return undefined;
  }

  /**
   * Create the run's worktree on the bound device and return the topic working
   * directory + integration seed. Returns `undefined` when the task carries no
   * workspace binding or no concrete device can be resolved. Throws when the
   * binding is present and provisionable but the device RPC fails.
   */
  async provision(params: {
    seq: number;
    task: TaskItem;
  }): Promise<ProvisionedWorkspace | undefined> {
    const { task, seq } = params;

    const config = await this.resolveWorkspaceConfig(task);
    if (!config) return undefined;

    const deviceId = config.deviceId ?? (await this.resolveAssigneeDeviceId(task));
    if (!deviceId) {
      log(
        'provision: %s has a workspace binding but no device — running unprovisioned',
        task.identifier,
      );
      return undefined;
    }

    const { baseBranch, forkRef } = await this.resolveBase(task, config, deviceId);

    // Retried runs get their own branch so an earlier attempt's commits stay
    // inspectable and the fresh worktree never collides with a leftover one.
    const branch = seq > 1 ? `task/${task.identifier}-r${seq}` : `task/${task.identifier}`;
    const worktreePath = deriveWorktreePath(config.repoPath, branch);

    const added = await deviceGateway.addGitWorktree({
      branch,
      deviceId,
      path: config.repoPath,
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
      repoPath: config.repoPath,
      role: 'task',
      state: 'pending',
      worktreePath,
    };

    return {
      baseBranch,
      branch,
      deviceId,
      integration,
      workingDirectory: worktreePath,
      workingDirectoryConfig,
    };
  }

  private async resolveAssigneeDeviceId(task: TaskItem): Promise<string | undefined> {
    if (!task.assigneeAgentId) return undefined;
    const agent = await this.agentModel.getAgentConfig(task.assigneeAgentId);
    return agent?.agencyConfig?.boundDeviceId;
  }

  /**
   * The branch the task branch must merge back into. Explicit
   * `config.baseBranch` wins; otherwise the remote default when `origin/HEAD`
   * resolves, else the source checkout's current branch. The fork ref prefers
   * the remote-tracking ref so worktrees start from the published tip.
   */
  private async resolveBase(
    task: TaskItem,
    config: TaskWorkspaceConfig,
    deviceId: string,
  ): Promise<{ baseBranch: string; forkRef?: string }> {
    if (config.baseBranch)
      return { baseBranch: config.baseBranch, forkRef: `origin/${config.baseBranch}` };

    try {
      const remotes = await deviceGateway.listGitRemoteBranches({
        deviceId,
        path: config.repoPath,
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

    return { baseBranch: 'HEAD', forkRef: undefined };
  }
}

const parseWorkspaceConfig = (config: unknown): TaskWorkspaceConfig | undefined => {
  if (!isRecord(config)) return undefined;
  const workspace = config.workspace;
  if (!isRecord(workspace)) return undefined;
  if (workspace.provider !== 'git') return undefined;
  if (typeof workspace.repoPath !== 'string' || !workspace.repoPath.trim()) return undefined;
  return {
    baseBranch: typeof workspace.baseBranch === 'string' ? workspace.baseBranch : undefined,
    deviceId: typeof workspace.deviceId === 'string' ? workspace.deviceId : undefined,
    provider: 'git',
    repoPath: workspace.repoPath,
  };
};
