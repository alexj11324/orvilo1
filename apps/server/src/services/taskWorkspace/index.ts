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
import { resolveExecutionTarget } from '@/helpers/executionTarget';
import { deviceGateway } from '@/server/services/deviceGateway';
import { getRepoDefaultBranch, resolveGithubAccessToken } from '@/server/services/githubRepo';

const log = debug('task-workspace');

/** Max hops up the parentTaskId chain when inheriting a workspace binding. */
const WORKSPACE_INHERIT_DEPTH = 10;

export interface ProvisionedWorkspace {
  baseBranch: string;
  branch: string;
  /**
   * Device hosting the worktree. Absent on remote provisions — the workspace
   * lives inside the ephemeral cloud sandbox instead.
   */
  deviceId?: string;
  /** Seed record the runner persists on `task_topics.integration`. */
  integration: TaskTopicIntegration;
  /**
   * Contract appended to the task prompt (remote provisions only): the
   * branch/push/PR instructions the sandbox agent must follow for the
   * integration run to be able to land the work later.
   */
  prompt?: string;
  /**
   * GitHub repos the run's topic must carry (`initialTopicMetadata.repos`) so
   * the cloud sandbox pre-clones them — remote provisions only.
   */
  repos?: string[];
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
   * Provision the run's workspace and return the topic working directory +
   * integration seed. Returns `undefined` when the task carries no workspace
   * binding or neither provisioning mode applies.
   *
   * Two modes:
   * - **device** — `repoPath` + a resolvable device → `addGitWorktree` RPC.
   *   Throws when the RPC fails (the caller pauses the task), since silently
   *   running in the source checkout would corrupt the isolation guarantee.
   * - **remote** — `repo` set, no device, and the assignee's execution target
   *   resolves to `sandbox` → the cloud sandbox pre-clones the repo and the
   *   contract prompt has the agent push `task/<id>` + open a PR; a later
   *   integrator run lands it (CAID branch-and-merge without a device).
   */
  async provision(params: {
    seq: number;
    task: TaskItem;
  }): Promise<ProvisionedWorkspace | undefined> {
    const { task, seq } = params;

    const config = await this.resolveWorkspaceConfig(task);
    if (!config) return undefined;

    // The agent lookup is only needed for its bound-device fallback, or to
    // resolve the execution target when a remote (`repo`) binding exists —
    // a device-pinned, repoPath-only binding needs neither.
    const needsAgent = !config.deviceId || !!config.repo;
    const agent =
      needsAgent && task.assigneeAgentId
        ? await this.agentModel.getAgentConfig(task.assigneeAgentId).catch(() => undefined)
        : undefined;
    const deviceId = config.deviceId ?? agent?.agencyConfig?.boundDeviceId;

    // Follow where the run actually executes: a sandbox-resolved run takes the
    // remote contract (a bound device is irrelevant to it), everything else
    // falls back to the device worktree path.
    if (config.repo && runsInSandbox(agent?.agencyConfig ?? undefined)) {
      return this.provisionOnRemote({ config, seq, task });
    }

    if (config.repoPath && deviceId) {
      return this.provisionOnDevice({ config, deviceId, seq, task });
    }

    log(
      'provision: %s has a workspace binding but no provisionable target — running unprovisioned',
      task.identifier,
    );
    return undefined;
  }

  /** Create the run's worktree on the bound device. */
  private async provisionOnDevice(params: {
    config: TaskWorkspaceConfig;
    deviceId: string;
    seq: number;
    task: TaskItem;
  }): Promise<ProvisionedWorkspace> {
    const { config, deviceId, seq, task } = params;
    const repoPath = config.repoPath!;

    const { baseBranch, forkRef } = await this.resolveBase(task, config, repoPath, deviceId);

    // Retried runs get their own branch so an earlier attempt's commits stay
    // inspectable and the fresh worktree never collides with a leftover one.
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
      workingDirectory: worktreePath,
      workingDirectoryConfig,
    };
  }

  /**
   * Bind the run to the repo's remote: the sandbox pre-clones `config.repo`
   * (via topic `repos` metadata) and the contract prompt has the agent isolate
   * work on `task/<id>`, push it, and open a PR. The merge itself is deferred
   * to a later integrator run — the sandbox is gone by then.
   */
  private async provisionOnRemote(params: {
    config: TaskWorkspaceConfig;
    seq: number;
    task: TaskItem;
  }): Promise<ProvisionedWorkspace> {
    const { config, seq, task } = params;
    const repo = config.repo!;

    const token = await resolveGithubAccessToken({
      db: this.db,
      userId: this.userId,
      workspaceId: this.workspaceId,
    });
    const baseBranch = config.baseBranch ?? (await getRepoDefaultBranch(repo, token)) ?? 'main';

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

  /**
   * The branch the task branch must merge back into. Explicit
   * `config.baseBranch` wins; otherwise the remote default when `origin/HEAD`
   * resolves, else the source checkout's current branch. The fork ref prefers
   * the remote-tracking ref so worktrees start from the published tip.
   */
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

    return { baseBranch: 'HEAD', forkRef: undefined };
  }
}

const parseWorkspaceConfig = (config: unknown): TaskWorkspaceConfig | undefined => {
  if (!isRecord(config)) return undefined;
  const workspace = config.workspace;
  if (!isRecord(workspace)) return undefined;
  if (workspace.provider !== 'git') return undefined;
  const repoPath =
    typeof workspace.repoPath === 'string' && workspace.repoPath.trim()
      ? workspace.repoPath
      : undefined;
  const repo =
    typeof workspace.repo === 'string' && workspace.repo.trim() ? workspace.repo : undefined;
  // A binding must identify the repo somehow: a device path for worktree
  // provisioning, or a remote coordinate for the sandbox contract.
  if (!repoPath && !repo) return undefined;
  return {
    baseBranch: typeof workspace.baseBranch === 'string' ? workspace.baseBranch : undefined,
    deviceId: typeof workspace.deviceId === 'string' ? workspace.deviceId : undefined,
    provider: 'git',
    repo,
    repoPath,
  };
};

/** Branch a run works on: `task/<identifier>` (+ `-r<n>` on retry attempts). */
const taskBranchName = (identifier: string, seq: number): string =>
  seq > 1 ? `task/${identifier}-r${seq}` : `task/${identifier}`;

/**
 * Whether a run by this assignee resolves to the cloud sandbox — the only
 * target the remote contract can bind to. Mirrors the server-side resolution
 * in `toolDiscovery`/`heteroDispatch`: `clientExecutionAvailable` is the
 * device-gateway flag (a gateway tunnels a stored `local` target to a real
 * device, so only a gateway-less server coerces it to sandbox).
 */
const runsInSandbox = (agencyConfig: LobeAgentAgencyConfig | undefined): boolean =>
  resolveExecutionTarget(agencyConfig, {
    clientExecutionAvailable: deviceGateway.isConfigured,
    isHetero: !!agencyConfig?.heterogeneousProvider,
  }) === 'sandbox';

/** Branch/push/PR contract appended to the task prompt for remote runs. */
const buildRemoteContractPrompt = (params: {
  baseBranch: string;
  branch: string;
  repo: string;
  workingDirectory: string;
}): string =>
  [
    '[Workspace contract] This task runs against an isolated branch of a bound repository.',
    `- Repository: \`${params.repo}\` — when pre-cloned it lives at \`${params.workingDirectory}\`; if the directory is missing, clone the repo there first.`,
    `- Before editing, create the task branch off the base: \`git fetch origin ${params.baseBranch}\` then \`git checkout -B ${params.branch} origin/${params.baseBranch}\`.`,
    `- Commit your changes on \`${params.branch}\` and push with \`git push -u origin ${params.branch}\`. Do NOT commit to or push \`${params.baseBranch}\` directly.`,
    `- Open a pull request targeting the base branch: \`gh pr create --base ${params.baseBranch} --head ${params.branch}\`.`,
    'A separate integration run merges the branch back — work that is not pushed is permanently lost when the sandbox is reclaimed.',
  ].join('\n');
