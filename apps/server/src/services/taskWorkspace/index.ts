import { randomUUID } from 'node:crypto';

import type {
  DeviceGitRemoteBranchListItem,
  OrviloAgentAgencyConfig,
  TaskItem,
  TaskTopicIntegration,
  TaskWorkspaceConfig,
  WorkingDirConfig,
} from '@orvilo/types';
import { cloudSandboxRepoPath, deriveWorktreePath } from '@orvilo/types';
import { isRecord } from '@orvilo/utils/object';
import debug from 'debug';

import { AgentModel } from '@/database/models/agent';
import { RepositoryModel } from '@/database/models/repository';
import { TaskModel } from '@/database/models/task';
import {
  taskWorkspaceClaimKey,
  TaskWorkspaceClaimModel,
} from '@/database/models/taskWorkspaceClaim';
import type { OrviloDatabase } from '@/database/type';
import { resolveExecutionPlan } from '@/helpers/executionTarget';
import { supportsCloudHeterogeneousSandbox } from '@/server/services/aiAgent/helpers/heteroErrors';
import { deviceGateway } from '@/server/services/deviceGateway';
import {
  getRemoteBranchSha,
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
  private claimModel: TaskWorkspaceClaimModel;
  private db: OrviloDatabase;
  private taskModel: TaskModel;
  private userId: string;
  private workspaceId?: string;

  constructor(db: OrviloDatabase, userId: string, workspaceId?: string) {
    this.db = db;
    this.userId = userId;
    this.workspaceId = workspaceId;
    this.agentModel = new AgentModel(db, userId, workspaceId);
    this.claimModel = new TaskWorkspaceClaimModel(db);
    this.taskModel = new TaskModel(db, userId, workspaceId);
  }

  async discardUnregistered(workspace: ProvisionedWorkspace): Promise<boolean> {
    const { deviceId, repoPath, worktreePath } = workspace.integration;
    if (!deviceId || !repoPath || !worktreePath || worktreePath === repoPath) return true;

    const claimKey = taskWorkspaceClaimKey({ deviceId, repoPath, worktreePath });
    const claim = await this.claimModel.lookup(claimKey);
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
      return false;
    }
    if (claim) await this.claimModel.release(claimKey, claim.ownerToken);
    return true;
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

    // Association fallback (linear-workspace-v3): no explicit binding on the
    // task or its ancestors — ask the deterministic resolver. A resolved
    // repository produces a remote-coordinate binding; `ambiguous`/`unresolved`
    // stays unbound rather than silently picking a candidate.
    if (this.workspaceId && (task.projectId || task.teamId)) {
      const repositoryModel = new RepositoryModel(this.db, this.userId, this.workspaceId);
      const resolution = await repositoryModel.resolveForTask(task.id);
      if (resolution.ok) {
        const repository = await repositoryModel.findById(resolution.repositoryId);
        if (!repository) return undefined;

        const boundDeviceId = task.assigneeAgentId
          ? (await this.agentModel.getAgentConfig(task.assigneeAgentId))?.agencyConfig
              ?.boundDeviceId
          : undefined;
        const checkouts = await repositoryModel.listCheckouts(repository.id);
        const checkout =
          checkouts.find(
            (candidate) => boundDeviceId !== undefined && candidate.deviceId === boundDeviceId,
          ) ?? (checkouts.length === 1 ? checkouts[0] : undefined);
        if (checkout) {
          return {
            baseBranch: repository.coordinate.defaultBranch ?? undefined,
            deviceId: checkout.deviceId ?? undefined,
            provider: 'git',
            repoPath: checkout.canonicalPath,
          };
        }

        // A coordinate without a verified remote identity is only a display
        // snapshot. Never turn a local-only repository name into a GitHub clone
        // target; require an authorized checkout or a verified remote row.
        const { owner, name } = repository.coordinate;
        if (repository.remoteRepositoryId && owner && name) {
          return {
            baseBranch: repository.coordinate.defaultBranch ?? undefined,
            provider: 'git',
            repo: `${owner}/${name}`,
          };
        }
      }
    }
    return undefined;
  }

  async provision(params: {
    dispatchId: string;
    generation: number;
    seq: number;
    task: TaskItem;
  }): Promise<ProvisionedWorkspace | undefined> {
    const { task, seq, dispatchId, generation } = params;
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

    if (config.repo && runsInSandbox(agent?.agencyConfig ?? undefined, config.deviceId)) {
      return this.provisionOnRemote({
        config,
        credKey: agent?.agencyConfig?.heterogeneousProvider?.env?.GITHUB_CRED_KEY,
        seq,
        task,
      });
    }

    if (config.repoPath && deviceId) {
      return this.provisionOnDevice({ config, deviceId, dispatchId, generation, seq, task });
    }

    const reason =
      config.repoPath && !deviceId
        ? 'Workspace device is unavailable or not configured'
        : 'Workspace binding does not match the selected execution target';
    log('provision: %s cannot provision workspace — %s', task.identifier, reason);
    throw new Error(reason);
  }

  /**
   * Create a run-owned worktree. When `repo` is present it is also PR-bound.
   *
   * Ownership is a durable claim, not a name match: before touching the path
   * this mints a persisted claim keyed by (deviceId, repoPath, worktreePath)
   * carrying (taskId, dispatchId, generation, ownerToken, expectedBaseSha).
   * Reuse is allowed only when the persisted claim matches this dispatch AND
   * the device reports a clean tree on the pinned base AND no live writer —
   * every other outcome blocks and queues manual recovery instead of touching
   * foreign content.
   */
  private async provisionOnDevice(params: {
    config: TaskWorkspaceConfig;
    deviceId: string;
    dispatchId: string;
    generation: number;
    seq: number;
    task: TaskItem;
  }): Promise<ProvisionedWorkspace> {
    const { config, deviceId, seq, task, dispatchId, generation } = params;
    const repoPath = config.repoPath!;
    // `deriveWorktreePath` composes a sibling directory of the repo path; a
    // relative or bare name would silently land somewhere else on the device.
    const looksAbsolute =
      repoPath.startsWith('/') || /^[a-z]:[\\/]/i.test(repoPath) || repoPath.startsWith('\\\\');
    if (!looksAbsolute) {
      throw new Error(`Workspace repoPath must be an absolute path on the device: ${repoPath}`);
    }
    // Resolve the base commit BEFORE any `worktree add` — `origin/<base>` is a
    // mutable ref, so the pinned SHA is what the add must land on and what the
    // post-add verification compares against.
    const { baseBranch, expectedBaseSha } = await this.resolveBase(
      task,
      config,
      repoPath,
      deviceId,
    );

    const branch = taskBranchName(task.identifier, seq);
    // The task id fragment keeps the on-disk path unique across workspaces that
    // share a repo and a human-readable task identifier — a path that matches
    // the naming convention is a hint, never proof of ownership.
    const worktreePath = deriveWorktreePath(repoPath, `${branch}@${task.id.slice(0, 8)}`);

    // Mint the durable claim first: insert-or-read against the unique physical
    // key. A row held by a different dispatch is a claim conflict — the
    // occupant (whatever it is) is preserved and queued for a human.
    const claim = await this.claimModel.mint({
      deviceId,
      dispatchId,
      expectedBaseSha,
      generation,
      ownerToken: randomUUID(),
      repoPath,
      taskId: task.id,
      workspaceId: this.workspaceId,
      worktreePath,
    });
    const owner = { dispatchId, generation, taskId: task.id };
    if (!this.claimModel.matches(claim, owner)) {
      await this.requestRecovery({
        detail: { claimedByDispatchId: claim.dispatchId, claimedTaskId: claim.taskId },
        deviceId,
        kind: 'claim_conflict',
        repoPath,
        taskId: task.id,
        worktreePath,
      });
      throw new Error(
        `Failed to provision task workspace: ${worktreePath} is claimed by another dispatch ` +
          `(${claim.taskId}/${claim.dispatchId}) — preserved for manual resolution`,
      );
    }

    const inspection = await deviceGateway.inspectGitWorktreePath({
      deviceId,
      path: repoPath,
      userId: this.userId,
      worktreePath,
      workspaceId: this.workspaceId,
    });
    if (!inspection) {
      // An unanswered RPC means an older host that predates this capability —
      // never conflate it with "the directory is absent".
      throw new Error(
        `Failed to provision task workspace: the device client does not support ` +
          `worktree inspection (unsupported capability) for ${worktreePath}`,
      );
    }

    switch (inspection.kind) {
      case 'listed': {
        const listed = inspection.listed!;
        const writerNote =
          inspection.activeWriter === undefined
            ? 'writer presence unverifiable'
            : inspection.activeWriter
              ? `live writer (op=${inspection.activeWriter.operationId ?? 'unknown'})`
              : undefined;
        const reusable =
          !writerNote &&
          listed.branch === branch &&
          listed.head === claim.expectedBaseSha &&
          !listed.locked &&
          !listed.prunable &&
          listed.status?.clean === true;
        if (!reusable) {
          await this.requestRecovery({
            detail: {
              activeWriter: inspection.activeWriter ?? undefined,
              branch: listed.branch,
              clean: listed.status?.clean,
              head: listed.head,
              locked: listed.locked,
              prunable: listed.prunable,
            },
            deviceId,
            kind: 'orphan_directory',
            repoPath,
            taskId: task.id,
            worktreePath,
          });
          throw new Error(
            `Failed to provision task workspace: ${worktreePath} is occupied by ` +
              `an unrelated or modified worktree (branch ${listed.branch ?? '(detached)'}` +
              `${listed.head && listed.head !== claim.expectedBaseSha ? `, head ${listed.head} ≠ claimed base` : ''}` +
              `${listed.locked ? ', locked' : ''}${listed.status?.clean === false ? ', dirty' : ''}` +
              `${writerNote ? `, ${writerNote}` : ''}) — preserved for manual resolution`,
          );
        }
        // Same attempt replaying after a crash between add and registration.
        break;
      }
      case 'absent': {
        const added = await deviceGateway.addGitWorktree({
          branch,
          deviceId,
          path: repoPath,
          // Pin the resolved commit, not the mutable ref — a fetch racing the
          // add cannot shift the checkout away from the claimed base.
          ref: expectedBaseSha,
          userId: this.userId,
          workspaceId: this.workspaceId,
          worktreePath,
        });
        if (!added.success) {
          const lastError = added.error ?? 'worktree add failed';
          // A leftover branch under our convention name may carry work we
          // cannot verify — stop with an explicit error, don't retry `add -b`.
          if (lastError.includes('already exists')) {
            throw new Error(
              `Failed to provision task workspace: ${lastError} — resolve or rename the leftover branch manually`,
            );
          }
          throw new Error(`Failed to provision task workspace: ${lastError}`);
        }
        break;
      }
      case 'unknown': {
        await this.requestRecovery({
          detail: { error: inspection.error },
          deviceId,
          kind: 'inspection_unknown',
          repoPath,
          taskId: task.id,
          worktreePath,
        });
        throw new Error(
          `Failed to provision task workspace: cannot inspect ${worktreePath} on the device` +
            (inspection.error ? ` (${inspection.error})` : ''),
        );
      }
      default: {
        // `orphan-safe` / `orphan-foreign`: never delete automatically. Queue a
        // manual cleanup request and stop — the directory's content belongs to
        // someone until a human proves otherwise.
        await this.requestRecovery({
          detail: { kind: inspection.kind },
          deviceId,
          kind: 'orphan_directory',
          repoPath,
          taskId: task.id,
          worktreePath,
        });
        throw new Error(
          `Failed to provision task workspace: ${worktreePath} contains an unregistered ` +
            'directory that cannot be proven ours — queued for manual cleanup',
        );
      }
    }

    // Post-provision verification: re-inspect the worktree and require the
    // checkout to sit on the pinned base — never record whatever HEAD happens
    // to be as the run's baseSha after the fact.
    const checkout = await deviceGateway.inspectGitWorktreePath({
      deviceId,
      path: repoPath,
      userId: this.userId,
      workspaceId: this.workspaceId,
      worktreePath,
    });
    if (checkout?.kind !== 'listed' || checkout.listed?.branch !== branch) {
      throw new Error(
        `Failed to provision task workspace: could not verify the new checkout at ${worktreePath}`,
      );
    }
    if (checkout.listed.head !== expectedBaseSha) {
      throw new Error(
        `Failed to provision task workspace: ${worktreePath} checked out ` +
          `${checkout.listed.head ?? '(unknown)'} instead of the pinned base ${expectedBaseSha}`,
      );
    }
    const baseSha = expectedBaseSha;

    const workingDirectoryConfig: WorkingDirConfig = {
      git: { branch, isWorktree: true },
      path: worktreePath,
      repoType: 'git',
    };
    const integration: TaskTopicIntegration = {
      attempts: 0,
      baseBranch,
      baseSha,
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
    // Pin the remote base commit before the sandbox clones — the agent fetches
    // a mutable `origin/<base>` ref, but the delivery must stay traceable to
    // the exact commit the run was built from. An unresolvable SHA blocks the
    // provision; continuing without the pin loses provenance.
    const baseSha = await getRemoteBranchSha(repo, baseBranch, token).catch(() => undefined);
    if (!baseSha) {
      throw new Error(
        `Could not resolve the remote base commit for ${repo}#${baseBranch} — provision blocked`,
      );
    }
    const integration: TaskTopicIntegration = {
      attempts: 0,
      baseBranch,
      baseSha,
      branch,
      repo,
      role: 'task',
      state: 'pending',
    };

    return {
      baseBranch,
      branch,
      integration,
      prompt: buildRemoteContractPrompt({
        baseBranch,
        baseSha,
        branch,
        repo,
        workingDirectory,
      }),
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
  ): Promise<{ baseBranch: string; expectedBaseSha: string }> {
    // The listing doubles as the availability preflight: a repo that cannot
    // answer it cannot provision a worktree either, and an explicit baseBranch
    // must name a real `origin/<base>` ref instead of failing mid-add.
    let remotes: DeviceGitRemoteBranchListItem[] | undefined;
    try {
      remotes = await deviceGateway.listGitRemoteBranches({
        deviceId,
        path: repoPath,
        userId: this.userId,
        workspaceId: this.workspaceId,
      });
    } catch (error) {
      log('resolveBase: remote lookup failed for %s — %O', task.identifier, error);
    }

    const refName = config.baseBranch
      ? `origin/${config.baseBranch}`
      : remotes?.find((b) => b.isDefault)?.name;

    if (
      config.baseBranch &&
      remotes &&
      remotes.length > 0 &&
      !remotes.some((b) => b.name === refName)
    ) {
      throw new Error(`Workspace base branch "${refName}" does not exist on the device repository`);
    }
    if (!refName) {
      throw new Error(
        `Could not resolve a remote base branch for ${task.identifier}; configure baseBranch explicitly`,
      );
    }

    // Pin the physical commit before `worktree add` — the ref is mutable and
    // the add must not float to whatever it points at later. A ref that
    // resolves without a SHA (lookup failure, or an older device client that
    // predates the field) is a resolution failure: block, never continue.
    const expectedBaseSha = remotes?.find((b) => b.name === refName)?.sha;
    if (!expectedBaseSha) {
      throw new Error(
        `Could not resolve the remote base commit for ${refName} on the device — provision blocked`,
      );
    }
    return { baseBranch: config.baseBranch ?? refName.replace(/^origin\//, ''), expectedBaseSha };
  }

  /** Queue one manual cleanup/recovery row — the only terminal for content we cannot prove ours. */
  private async requestRecovery(params: {
    detail?: Record<string, unknown>;
    deviceId: string;
    kind: 'claim_conflict' | 'inspection_unknown' | 'orphan_directory';
    repoPath: string;
    taskId: string;
    worktreePath: string;
  }): Promise<void> {
    try {
      await this.claimModel.requestRecovery({ ...params, workspaceId: this.workspaceId });
    } catch (error) {
      // Recovery persistence must not mask the block itself — the provision
      // still throws with the occupant preserved even if the queue write fails.
      log('requestRecovery: failed to persist %s — %O', params.worktreePath, error);
    }
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
  agencyConfig: OrviloAgentAgencyConfig | undefined,
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
  baseSha?: string;
  branch: string;
  repo: string;
  workingDirectory: string;
}): string =>
  [
    '[Workspace contract] This code task is delivered through one GitHub pull request.',
    `- Repository: \`${params.repo}\`; working directory: \`${params.workingDirectory}\`.`,
    `- Before editing, fetch \`origin/${params.baseBranch}\` and work only on \`${params.branch}\`. If the branch does not exist yet, create it from \`origin/${params.baseBranch}\`.${
      params.baseSha ? ` The recorded base commit is \`${params.baseSha}\`.` : ''
    }`,
    `- Commit changes on \`${params.branch}\` and push with \`git push -u origin ${params.branch}\`. Never push directly to \`${params.baseBranch}\`.`,
    `- Ensure exactly one pull request exists from \`${params.branch}\` to \`${params.baseBranch}\` (create it with \`gh pr create\` if needed).`,
    '- Leave the PR open. Do not merge it yourself. Orvilo will move the task into review, process CI and review comments on the same PR, and merge only after the gates pass.',
    '- A run is not a delivery until its commits are pushed. Preserve the branch/PR identity across review fixes.',
  ].join('\n');
