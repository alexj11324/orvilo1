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
import type { TaskWorkspaceClaimItem } from '@/database/schemas';
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
  /**
   * The durable claim this provision minted or re-adopted — carries the
   * claim id/key, the immutable `ownerToken` fencing cleanup, and the
   * dispatch/generation ownership triple. Absent for sandbox provisions.
   */
  claim?: TaskWorkspaceClaimItem;
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

    // Cleanup is fenced on the immutable token minted with THIS provision —
    // never the row's current `ownerToken`, which a newer dispatch may
    // already hold. Without that proof the directory is not ours to touch.
    const claim = workspace.claim;
    if (!claim) {
      log('discardUnregistered: %s carries no claim identity — preserving', worktreePath);
      return false;
    }
    const row = await this.claimModel.lookup(claim.key);
    if (row && row.ownerToken !== claim.ownerToken) {
      // The key was reclaimed after this provision's claim was released — the
      // worktree belongs to the new owner now, not to this cleanup.
      log(
        'discardUnregistered: %s reclaimed by %s/%s — leaving it alone',
        worktreePath,
        row.taskId,
        row.dispatchId,
      );
      return true;
    }

    // The writer bound to this claim must be provably stopped: `undefined`
    // means the host cannot answer — never read it as "no writer".
    const inspection = await deviceGateway.inspectGitWorktreePath({
      deviceId,
      path: repoPath,
      userId: this.userId,
      worktreePath,
      workspaceId: this.workspaceId,
    });
    if (!inspection || inspection.activeWriter === undefined || inspection.activeWriter) {
      log(
        'discardUnregistered: writer presence unproven or a live writer owns %s — preserving',
        worktreePath,
      );
      return false;
    }
    if (inspection.kind === 'absent') {
      // Nothing left on the device — just release our own claim.
      await this.claimModel.release(claim.key, claim.ownerToken);
      return true;
    }

    const removed = await deviceGateway.removeGitWorktree({
      claimToken: claim.ownerToken,
      deviceId,
      path: repoPath,
      userId: this.userId,
      workspaceId: this.workspaceId,
      worktreePath,
    });
    if (!removed.success || removed.claimTokenVerified !== true) {
      // A host that silently ignores the token reports no verification — the
      // claim stays so a later cleanup retry can complete the proof.
      log(
        'discardUnregistered: remove failed or unverified for %s — %s',
        worktreePath,
        removed.error ?? 'unknown error',
      );
      return false;
    }
    await this.claimModel.release(claim.key, claim.ownerToken);
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
   * Ownership is a durable claim bound to physical identity: the device
   * inspection proves the repo's canonical common-dir and the worktree path's
   * canonical spelling BEFORE any claim is minted, and the claim key binds
   * those — aliases of the same directory share one claim, and an existing
   * directory without a live claim is never adopted by minting after the
   * fact. A replay of the same dispatch reuses the claim's pinned
   * `expectedBaseSha`; only a fresh attempt resolves a new base.
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

    const branch = taskBranchName(task.identifier, seq);
    // The task id fragment keeps the on-disk path unique across workspaces that
    // share a repo and a human-readable task identifier — a path that matches
    // the naming convention is a hint, never proof of ownership.
    const worktreePath = deriveWorktreePath(repoPath, `${branch}@${task.id.slice(0, 8)}`);

    // Inspect before claiming: the answer proves the physical identity
    // (canonical worktree path + git common-dir) the claim key binds.
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
    if (inspection.kind === 'unknown') {
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
    if (!inspection.repoCommonDir || !inspection.canonicalWorktreePath) {
      // A host that answers inspection without identity fields predates the
      // claim binding — block instead of keying a claim on raw spellings.
      throw new Error(
        `Failed to provision task workspace: the device client does not report ` +
          `canonical path identity (unsupported capability) for ${worktreePath}`,
      );
    }

    const claimKey = taskWorkspaceClaimKey({
      deviceId,
      repoCommonDir: inspection.repoCommonDir,
      worktreePath: inspection.canonicalWorktreePath,
    });
    const stored = await this.claimModel.lookup(claimKey);
    const liveClaim = stored && !stored.releasedAt ? stored : undefined;
    const owner = { dispatchId, generation, taskId: task.id };
    const ownClaim = liveClaim && this.claimModel.matches(liveClaim, owner) ? liveClaim : undefined;
    let claim = ownClaim;

    const conflicted = async (row: TaskWorkspaceClaimItem): Promise<never> => {
      await this.requestRecovery({
        detail: { claimedByDispatchId: row.dispatchId, claimedTaskId: row.taskId },
        deviceId,
        kind: 'claim_conflict',
        repoPath,
        taskId: task.id,
        worktreePath,
      });
      throw new Error(
        `Failed to provision task workspace: ${worktreePath} is claimed by another dispatch ` +
          `(${row.taskId}/${row.dispatchId}) — preserved for manual resolution`,
      );
    };

    switch (inspection.kind) {
      case 'listed': {
        const listed = inspection.listed!;
        if (!liveClaim) {
          // A registered worktree with no claim row at all — minting one now
          // would adopt a directory we never proved ours. Queue a human.
          await this.requestRecovery({
            detail: { branch: listed.branch, head: listed.head, reason: 'listed_without_claim' },
            deviceId,
            kind: 'orphan_directory',
            repoPath,
            taskId: task.id,
            worktreePath,
          });
          throw new Error(
            `Failed to provision task workspace: ${worktreePath} holds a worktree with no ` +
              'registered claim — preserved for manual resolution',
          );
        }
        if (!ownClaim) return conflicted(liveClaim);
        if (!ownClaim.expectedBaseSha) {
          await this.requestRecovery({
            detail: { branch: listed.branch, head: listed.head, reason: 'claim_without_base' },
            deviceId,
            kind: 'orphan_directory',
            repoPath,
            taskId: task.id,
            worktreePath,
          });
          throw new Error(
            `Failed to provision task workspace: the claim on ${worktreePath} carries no ` +
              'pinned base — preserved for manual resolution',
          );
        }
        const writerNote =
          inspection.activeWriter === undefined
            ? 'writer presence unverifiable'
            : inspection.activeWriter
              ? `live writer (op=${inspection.activeWriter.operationId ?? 'unknown'})`
              : undefined;
        const reusable =
          !writerNote &&
          listed.branch === branch &&
          listed.head === ownClaim.expectedBaseSha &&
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
              `${listed.head && listed.head !== ownClaim.expectedBaseSha ? `, head ${listed.head} ≠ claimed base` : ''}` +
              `${listed.locked ? ', locked' : ''}${listed.status?.clean === false ? ', dirty' : ''}` +
              `${writerNote ? `, ${writerNote}` : ''}) — preserved for manual resolution`,
          );
        }
        // Same attempt replaying after a crash between add and registration.
        break;
      }
      case 'absent': {
        if (liveClaim && !ownClaim) return conflicted(liveClaim);
        if (!ownClaim) {
          // A fresh attempt — the ONLY place a new base resolves. `origin/<base>`
          // is a mutable ref, so the pinned SHA is what the add must land on
          // and what replays compare against, forever fixed on the claim row.
          const { baseBranch, expectedBaseSha } = await this.resolveBase(
            task,
            config,
            repoPath,
            deviceId,
          );
          const minted = await this.claimModel.mint({
            baseBranch,
            deviceId,
            dispatchId,
            expectedBaseSha,
            generation,
            ownerToken: randomUUID(),
            repoCommonDir: inspection.repoCommonDir,
            repoPath,
            taskId: task.id,
            workspaceId: this.workspaceId,
            worktreePath: inspection.canonicalWorktreePath,
          });
          if (!this.claimModel.matches(minted, owner)) return conflicted(minted);
          claim = minted;
        }
        if (!claim) {
          // Unreachable — either ownClaim was live or mint produced a row.
          throw new Error(
            `Failed to provision task workspace: no claim could be established for ${worktreePath}`,
          );
        }
        if (!claim.expectedBaseSha) {
          await this.requestRecovery({
            detail: { reason: 'claim_without_base' },
            deviceId,
            kind: 'orphan_directory',
            repoPath,
            taskId: task.id,
            worktreePath,
          });
          throw new Error(
            `Failed to provision task workspace: the claim on ${worktreePath} carries no ` +
              'pinned base — preserved for manual resolution',
          );
        }
        const added = await deviceGateway.addGitWorktree({
          branch,
          deviceId,
          path: repoPath,
          // Pin the claim's commit, not the mutable ref — a fetch racing the
          // add cannot shift the checkout away from the claimed base, and a
          // replay lands on the same pin even after the remote moved.
          ref: claim.expectedBaseSha,
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
      default: {
        // `orphan-safe` / `orphan-foreign`: never delete automatically. A live
        // foreign claim reports as a conflict; anything else queues a manual
        // cleanup request — the directory's content belongs to someone until
        // a human proves otherwise.
        if (liveClaim && !ownClaim) return conflicted(liveClaim);
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

    if (!claim?.expectedBaseSha || !claim.baseBranch) {
      // Unreachable on every switch arm — kept as the terminal guard so the
      // integration below never reads an unpinned claim.
      throw new Error(
        `Failed to provision task workspace: the claim on ${worktreePath} cannot prove its pinned base`,
      );
    }

    // Post-provision verification: re-inspect the worktree and require the
    // checkout to sit on the claim's pinned base — never record whatever HEAD
    // happens to be as the run's baseSha after the fact.
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
    if (checkout.listed.head !== claim.expectedBaseSha) {
      throw new Error(
        `Failed to provision task workspace: ${worktreePath} checked out ` +
          `${checkout.listed.head ?? '(unknown)'} instead of the pinned base ${claim.expectedBaseSha}`,
      );
    }
    const baseBranch = claim.baseBranch;
    const baseSha = claim.expectedBaseSha;

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
      claim,
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
