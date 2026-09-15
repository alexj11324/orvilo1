import type { TaskItem, TaskTopicIntegration } from '@orvilo/types';
import { cloudSandboxRepoPath, deriveWorktreePath } from '@orvilo/types';
import debug from 'debug';

import { AgentModel } from '@/database/models/agent';
import { TaskModel } from '@/database/models/task';
import { TaskTopicModel } from '@/database/models/taskTopic';
import type { LobeChatDatabase } from '@/database/type';
import { deviceGateway } from '@/server/services/deviceGateway';
import {
  findBranchPr,
  isBranchMergedInto,
  parseGithubRepo,
  resolveGithubAccessToken,
} from '@/server/services/githubRepo';
import { TaskRunnerService } from '@/server/services/taskRunner';
import { TaskWorkspaceService } from '@/server/services/taskWorkspace';

const log = debug('task-integration');

/** Corrective merge runs dispatched per task run before the task blocks. */
const MAX_CORRECTIVE_ATTEMPTS = 3;

/**
 * What the integration gate concluded for a completed run:
 * - 'settled' — nothing pending (unprovisioned run) or the branch merged/pushed;
 *   the lifecycle may proceed to its normal post-run transition.
 * - 'hold' — a merge conflict keeps the run's work outstanding and a corrective
 *   run is in flight; the task stays 'running' and the caller returns early.
 * - 'blocked' — corrective attempts exhausted or the device path failed; the
 *   caller parks the task 'paused' with the recorded error.
 */
export type IntegrationOutcome = 'settled' | 'hold' | 'blocked';

/**
 * TaskIntegrationService — lands a provisioned run's task branch back onto its
 * base branch when the run's topic completes (CAID branch-and-merge).
 *
 * Merges happen in a detached, system-owned integration worktree
 * (`<repo>-integration-<base>`) so the base branch can stay checked out in a
 * user-facing worktree. A conflict is not a failure — it dispatches a
 * corrective run bound to that worktree so an engineer agent resolves the
 * conflicted paths and commits; after {@link MAX_CORRECTIVE_ATTEMPTS} the task
 * blocks for human attention.
 */
export class TaskIntegrationService {
  private db: LobeChatDatabase;
  private taskModel: TaskModel;
  private taskTopicModel: TaskTopicModel;
  private userId: string;
  private workspaceId?: string;
  private workspaceService: TaskWorkspaceService;

  constructor(db: LobeChatDatabase, userId: string, workspaceId?: string) {
    this.db = db;
    this.userId = userId;
    this.workspaceId = workspaceId;
    this.taskModel = new TaskModel(db, userId, workspaceId);
    this.taskTopicModel = new TaskTopicModel(db, userId, workspaceId);
    this.workspaceService = new TaskWorkspaceService(db, userId, workspaceId);
  }

  /**
   * Gate evaluated inside `onTopicComplete` for a 'done' run, after the topic
   * and handoff are persisted and before the task's post-run transition.
   */
  async integrateOnComplete(params: {
    task: TaskItem;
    taskTopicId: string;
  }): Promise<IntegrationOutcome> {
    const { task, taskTopicId } = params;

    // Cheap bail: only workspace-bound tasks can have anything to integrate,
    // so unbound runs skip the topic read entirely. Resolution failure is
    // fail-open — a pending record left behind is recoverable, pausing a
    // completed run on a transient read error is not.
    let workspace;
    try {
      workspace = await this.workspaceService.resolveWorkspaceConfig(task);
    } catch (error) {
      log('integrateOnComplete: workspace resolution failed for %s — %O', task.identifier, error);
      return 'settled';
    }
    if (!workspace) return 'settled';

    try {
      const taskTopic = await this.taskTopicModel.findByTopicId(taskTopicId);
      const record = taskTopic?.integration;
      if (
        !record ||
        !taskTopic?.topicId ||
        (record.role === 'task' && record.state !== 'pending' && record.state !== 'conflict')
      ) {
        return 'settled';
      }
      if (record.role === 'integrate' && record.state !== 'merging') return 'settled';

      const topicId = taskTopic.topicId;
      if (record.role === 'task') {
        return record.repo
          ? await this.integrateRemoteRun(task, topicId, record)
          : await this.integrateTaskRun(task, topicId, record);
      }
      return record.repo
        ? await this.finalizeRemoteCorrectiveRun(task, topicId, record)
        : await this.finalizeCorrectiveRun(task, topicId, record);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Integration failed';
      log('integrateOnComplete: %s failed — %s', task.identifier, message);
      await this.taskTopicModel.updateIntegration(task.id, taskTopicId, {
        lastError: message,
        state: 'blocked',
      });
      return 'blocked';
    }
  }

  /** First integration attempt for a fresh task run (device worktree path). */
  private async integrateTaskRun(
    task: TaskItem,
    topicId: string,
    record: TaskTopicIntegration,
  ): Promise<IntegrationOutcome> {
    if (!record.deviceId || !record.repoPath || !record.worktreePath) {
      await this.taskTopicModel.updateIntegration(task.id, topicId, {
        lastError: 'Integration record is missing its device workspace fields',
        state: 'blocked',
      });
      return 'blocked';
    }

    const integrationWorktreePath =
      record.integrationWorktreePath ??
      deriveWorktreePath(record.repoPath, `integration-${record.baseBranch.replaceAll('/', '-')}`);

    const ensured = await this.ensureIntegrationWorktree({
      baseRef: this.baseRef(record),
      deviceId: record.deviceId,
      integrationWorktreePath,
      repoPath: record.repoPath,
    });
    if (!ensured) {
      await this.taskTopicModel.updateIntegration(task.id, topicId, {
        integrationWorktreePath,
        lastError: 'Failed to create integration worktree',
        state: 'blocked',
      });
      return 'blocked';
    }

    const merged = await deviceGateway.mergeGitBranch({
      baseRef: this.baseRef(record),
      branch: record.branch,
      deviceId: record.deviceId,
      path: integrationWorktreePath,
      userId: this.userId,
      workspaceId: this.workspaceId,
    });

    if (merged.state === 'merged') {
      return this.landMerge(task, topicId, record, merged.sha);
    }

    if (merged.state === 'in-progress') {
      // A previous merge is still open in this worktree — hand it to the
      // corrective path as-is rather than discarding it.
      return this.dispatchCorrective(task, topicId, record, {
        conflicts: merged.conflicts,
        integrationWorktreePath,
      });
    }

    await this.taskTopicModel.updateIntegration(task.id, topicId, {
      conflicts: merged.conflicts,
      integrationWorktreePath,
      lastError: merged.error,
      state: 'conflict',
    });
    return this.dispatchCorrective(task, topicId, record, {
      conflicts: merged.conflicts,
      integrationWorktreePath,
    });
  }

  /**
   * Sandbox-contract integration: the run's branch lives on the remote, not a
   * device worktree. Verify whether it already landed (the agent may have
   * merged its own PR); otherwise hand the merge to a corrective run — itself
   * a sandbox run, since the original sandbox is long gone.
   */
  private async integrateRemoteRun(
    task: TaskItem,
    topicId: string,
    record: TaskTopicIntegration,
  ): Promise<IntegrationOutcome> {
    if (!parseGithubRepo(record.repo!)) {
      // An unparseable coordinate can never verify or merge — block now rather
      // than burning corrective runs on it.
      await this.taskTopicModel.updateIntegration(task.id, topicId, {
        lastError: `Integration repo is not a GitHub coordinate: ${record.repo}`,
        state: 'blocked',
      });
      return 'blocked';
    }

    const check = await this.verifyRemoteMerge(record, task);
    const patch: Partial<TaskTopicIntegration> = {};
    if (check.prUrl) patch.prUrl = check.prUrl;
    // Record *why* a merge run is being dispatched — an unverifiable remote
    // state (rate limit, outage, missing cred) spends an integrator run and
    // must not be invisible.
    if (check.error) patch.lastError = check.error;
    if (Object.keys(patch).length > 0) {
      await this.taskTopicModel.updateIntegration(task.id, topicId, patch);
    }
    if (check.merged) {
      await this.landRemoteMerge(task.id, topicId, record, check);
      return 'settled';
    }
    return this.dispatchCorrective(task, topicId, record);
  }

  /** Check the remote merge state after an integrator run returned. */
  private async finalizeRemoteCorrectiveRun(
    task: TaskItem,
    topicId: string,
    record: TaskTopicIntegration,
  ): Promise<IntegrationOutcome> {
    const check = await this.verifyRemoteMerge(record, task);
    const patch: Partial<TaskTopicIntegration> = {};
    if (check.prUrl) patch.prUrl = check.prUrl;
    if (check.error) patch.lastError = check.error;

    if (check.merged) {
      await this.landRemoteMerge(task.id, topicId, record, check);
      return 'settled';
    }

    if (record.attempts >= MAX_CORRECTIVE_ATTEMPTS) {
      const lastError =
        check.error ?? `Remote merge not landed after ${record.attempts} integrator runs`;
      await this.taskTopicModel.updateIntegration(task.id, topicId, {
        ...patch,
        lastError,
        state: 'blocked',
      });
      if (record.runTopicId) {
        await this.taskTopicModel.updateIntegration(task.id, record.runTopicId, {
          lastError,
          state: 'blocked',
        });
      }
      return 'blocked';
    }

    if (Object.keys(patch).length > 0) {
      await this.taskTopicModel.updateIntegration(task.id, topicId, patch);
    }
    return this.dispatchCorrective(task, topicId, record);
  }

  /**
   * Verify on the remote that `record.branch` landed on `record.baseBranch`:
   * a merged PR for the branch wins (covers squash merges that leave no
   * ancestry), otherwise an ancestry compare decides. API failures report
   * `merged: false` + `error` — the caller treats them as "not landed yet".
   */
  private async verifyRemoteMerge(
    record: TaskTopicIntegration,
    task: TaskItem,
  ): Promise<{
    error?: string;
    merged: boolean;
    prUrl?: string;
    sha?: string;
  }> {
    if (!record.repo) return { error: 'Remote record is missing its repo', merged: false };

    // The assignee's `env.GITHUB_CRED_KEY` override must drive verify the same
    // way it drives the sandbox run — verifying against the default 'github'
    // cred while the run pushed under another account misreads private-repo
    // merges as 'unknown' forever.
    const credKey = task.assigneeAgentId
      ? ((
          await new AgentModel(this.db, this.userId, this.workspaceId)
            .getAgentConfig(task.assigneeAgentId)
            .catch(() => null)
        )?.agencyConfig?.heterogeneousProvider?.env?.GITHUB_CRED_KEY ?? 'github')
      : 'github';
    const token = await resolveGithubAccessToken({
      credKey,
      db: this.db,
      userId: this.userId,
      workspaceId: this.workspaceId,
    });

    const pr = await findBranchPr(record.repo, record.branch, token);
    if (pr?.merged) return { merged: true, prUrl: pr.url, sha: pr.sha };

    const state = await isBranchMergedInto({
      base: record.baseBranch,
      head: record.branch,
      repo: record.repo,
      token,
    });
    if (state === 'merged') return { merged: true, prUrl: pr?.url };
    if (state === 'unmerged') return { merged: false, prUrl: pr?.url };
    return {
      error: 'Could not verify the remote merge state via the GitHub API',
      merged: false,
      prUrl: pr?.url,
    };
  }

  /** Remote merge verified: stamp every row tracking this branch. */
  private async landRemoteMerge(
    taskId: string,
    topicId: string,
    record: TaskTopicIntegration,
    check: { prUrl?: string; sha?: string },
  ): Promise<void> {
    const patch: Partial<TaskTopicIntegration> = {
      integratedSha: check.sha,
      prUrl: check.prUrl,
      pushedToRemote: true,
      state: 'integrated',
    };
    // Multi-hop corrective chains (task → integrate → integrate → …) must all
    // land — `runTopicId` alone only walks one hop back and would strand the
    // original run's row at 'merging' after a 3+-hop chain. Fan out by branch
    // like the device path's publish loop does.
    const rows = await this.taskTopicModel.findByTaskId(taskId);
    for (const row of rows) {
      if (
        row.topicId &&
        row.integration?.branch === record.branch &&
        row.integration.state !== 'blocked'
      ) {
        await this.taskTopicModel.updateIntegration(taskId, row.topicId, patch);
      }
    }
  }

  /** Check the merge state after a corrective run returned. */
  private async finalizeCorrectiveRun(
    task: TaskItem,
    topicId: string,
    record: TaskTopicIntegration,
  ): Promise<IntegrationOutcome> {
    const finalizePath = record.integrationWorktreePath ?? record.worktreePath;
    if (!record.deviceId || !finalizePath) {
      await this.taskTopicModel.updateIntegration(task.id, topicId, {
        lastError: 'Integration record is missing its device workspace fields',
        state: 'blocked',
      });
      return 'blocked';
    }

    const finalized = await deviceGateway.finalizeGitMerge({
      deviceId: record.deviceId,
      path: finalizePath,
      userId: this.userId,
      workspaceId: this.workspaceId,
    });

    if (finalized.state === 'integrated') {
      await this.taskTopicModel.updateIntegration(task.id, topicId, {
        integratedSha: finalized.sha,
        state: 'integrated',
      });
      // Advance the original task run's record so its run card reflects the
      // merge too.
      if (record.runTopicId) {
        await this.taskTopicModel.updateIntegration(task.id, record.runTopicId, {
          integratedSha: finalized.sha,
          state: 'integrated',
        });
      }
      await this.publishAndCleanup(task.id, record, finalized.sha);
      return 'settled';
    }

    if (record.attempts >= MAX_CORRECTIVE_ATTEMPTS) {
      const lastError = `Merge conflicts remain after ${record.attempts} corrective runs`;
      await this.taskTopicModel.updateIntegration(task.id, topicId, {
        conflicts: finalized.conflicts,
        lastError,
        state: 'blocked',
      });
      if (record.runTopicId) {
        await this.taskTopicModel.updateIntegration(task.id, record.runTopicId, {
          lastError,
          state: 'blocked',
        });
      }
      return 'blocked';
    }

    await this.taskTopicModel.updateIntegration(task.id, topicId, {
      conflicts: finalized.conflicts,
      state: 'conflict',
    });
    return this.dispatchCorrective(task, topicId, record);
  }

  /**
   * Merge landed: push the result to `origin/<base>` when the repo has a
   * remote, then drop the task's worktree. Push failure doesn't undo the local
   * merge — it's recorded on the record for a human to re-push.
   */
  private async landMerge(
    task: TaskItem,
    topicId: string,
    record: TaskTopicIntegration,
    sha?: string,
  ): Promise<IntegrationOutcome> {
    await this.taskTopicModel.updateIntegration(task.id, topicId, {
      integratedSha: sha,
      state: 'integrated',
    });
    await this.publishAndCleanup(task.id, record, sha);
    return 'settled';
  }

  private async publishAndCleanup(
    taskId: string,
    record: TaskTopicIntegration,
    _sha?: string,
  ): Promise<void> {
    const patch: Partial<TaskTopicIntegration> = {};

    if (record.repo) {
      // Sandbox-contract record: the integrator run pushed the base branch
      // itself and `verifyRemoteMerge` proved it landed — nothing is left to
      // publish, and there is no device worktree to remove.
      patch.pushedToRemote = true;
    } else if (
      record.deviceId &&
      record.baseBranch !== 'HEAD' &&
      // Only attempt a remote publish when the base actually names a branch —
      // a 'HEAD' fallback base means the workspace has no remote tracking ref
      // worth pushing to.
      (record.integrationWorktreePath ?? record.worktreePath)
    ) {
      const publishPath = (record.integrationWorktreePath ?? record.worktreePath)!;
      const pushed = await deviceGateway.pushGitBranch({
        deviceId: record.deviceId,
        path: publishPath,
        remoteBranch: record.baseBranch,
        userId: this.userId,
        workspaceId: this.workspaceId,
      });
      patch.pushedToRemote = !!pushed.success;
      if (!pushed.success) {
        log(
          'publishAndCleanup: push to origin/%s failed for task %s — %s',
          record.baseBranch,
          taskId,
          pushed.error,
        );
        patch.lastError = `Merged locally; push to origin/${record.baseBranch} failed: ${pushed.error ?? 'unknown'}`;
      }
    }

    if (record.deviceId && record.repoPath && record.worktreePath) {
      const removed = await deviceGateway.removeGitWorktree({
        deviceId: record.deviceId,
        path: record.repoPath,
        userId: this.userId,
        workspaceId: this.workspaceId,
        worktreePath: record.worktreePath,
      });
      patch.worktreeCleaned = !!removed.success;
      if (!removed.success) {
        log('publishAndCleanup: worktree cleanup failed for task %s — %s', taskId, removed.error);
      }
    }

    // Persist onto every task_topics row tracking this branch's integration
    // (the task run and any corrective runs), so all run cards agree.
    const rows = await this.taskTopicModel.findByTaskId(taskId);
    for (const row of rows) {
      if (
        row.topicId &&
        row.integration?.branch === record.branch &&
        row.integration.state !== 'blocked'
      ) {
        await this.taskTopicModel.updateIntegration(taskId, row.topicId, patch);
      }
    }
  }

  /**
   * Kick off a corrective run that finishes the merge. The run is a normal
   * task run (new topic, new seq) whose task_topics row carries the same
   * integration record with `role: 'integrate'` so its completion re-enters
   * this service's finalize path.
   *
   * - Device records: bound to the shared integration worktree via
   *   `workspaceOverride`; the agent resolves the open conflict there.
   * - Remote records (sandbox contract): bound to a fresh sandbox pre-clone of
   *   `record.repo`; the agent performs the whole merge and pushes the base.
   */
  private async dispatchCorrective(
    task: TaskItem,
    topicId: string,
    record: TaskTopicIntegration,
    context?: { conflicts?: string[]; integrationWorktreePath?: string },
  ): Promise<IntegrationOutcome> {
    const attempts = record.attempts + 1;
    if (attempts > MAX_CORRECTIVE_ATTEMPTS) {
      const lastError = `Merge conflicts remain after ${MAX_CORRECTIVE_ATTEMPTS} corrective runs`;
      await this.taskTopicModel.updateIntegration(task.id, topicId, {
        lastError,
        state: 'blocked',
      });
      return 'blocked';
    }

    const isRemote = !!record.repo;
    const integrationWorktreePath =
      context?.integrationWorktreePath ?? record.integrationWorktreePath;
    if (!isRemote && !integrationWorktreePath) {
      await this.taskTopicModel.updateIntegration(task.id, topicId, {
        lastError: 'No integration worktree to correct in',
        state: 'blocked',
      });
      return 'blocked';
    }

    let extraPrompt: string;
    let workspaceOverride: NonNullable<
      Parameters<TaskRunnerService['runTask']>[0]['workspaceOverride']
    >;
    let seedOverrides: Partial<TaskTopicIntegration>;

    if (isRemote) {
      const workingDirectory = cloudSandboxRepoPath(record.repo!);
      workspaceOverride = {
        repos: [record.repo!],
        workingDirectory,
        workingDirectoryConfig: {
          git: {
            branch: record.baseBranch,
            upstream: { branch: record.baseBranch, remote: 'origin' },
          },
          path: workingDirectory,
          repoType: 'git',
        },
      };
      extraPrompt = buildRemoteMergePrompt(record, context?.conflicts);
      seedOverrides = {};
    } else {
      workspaceOverride = {
        workingDirectory: integrationWorktreePath!,
        workingDirectoryConfig: {
          git: { detached: true, isWorktree: true },
          path: integrationWorktreePath!,
          repoType: 'git',
        },
      };

      const conflictList = context?.conflicts?.length
        ? `Conflicting paths:\n${context.conflicts.map((f) => `- ${f}`).join('\n')}`
        : 'A merge is in progress in this worktree.';
      extraPrompt = [
        `[Workspace integration] Your previous run finished on branch \`${record.branch}\`.`,
        `Merging it into \`${record.baseBranch}\` hit conflicts in the shared integration worktree — the working directory you are in now.`,
        conflictList,
        'Resolve the conflicts (look for <<<<<<< conflict markers), `git add` the resolved files, and commit to complete the merge. Do not start unrelated work.',
      ].join('\n');
      seedOverrides = {
        integrationWorktreePath: integrationWorktreePath!,
        worktreePath: integrationWorktreePath!,
      };
    }

    const runner = new TaskRunnerService(this.db, this.userId, this.workspaceId);
    await runner.runTask({
      extraPrompt,
      integrationSeed: {
        ...record,
        ...seedOverrides,
        attempts,
        conflicts: context?.conflicts,
        role: 'integrate',
        runTopicId: topicId,
        state: 'merging',
      },
      taskId: task.id,
      workspaceOverride,
    });

    await this.taskTopicModel.updateIntegration(task.id, topicId, {
      attempts,
      // Remote dispatches mean a merge run is in flight — not necessarily a
      // conflict; 'merging' reports that honestly. Device rows keep 'conflict'
      // since they only dispatch after a conflicted merge.
      state: isRemote ? 'merging' : 'conflict',
    });

    return 'hold';
  }

  /** Create the detached integration worktree; tolerate one already on disk. */
  private async ensureIntegrationWorktree(params: {
    baseRef: string;
    deviceId: string;
    integrationWorktreePath: string;
    repoPath: string;
  }): Promise<boolean> {
    const added = await deviceGateway.addGitWorktree({
      branch: '',
      detach: true,
      deviceId: params.deviceId,
      path: params.repoPath,
      ref: params.baseRef,
      userId: this.userId,
      workspaceId: this.workspaceId,
      worktreePath: params.integrationWorktreePath,
    });
    if (added.success) return true;
    // Reuse an existing directory — e.g. a stale worktree from an earlier run.
    if (added.error && /already exists/i.test(added.error)) return true;
    log('ensureIntegrationWorktree: add failed for %s — %s', params.repoPath, added.error);
    return false;
  }

  /** Prefer the remote-tracking ref so merges land on the published tip. */
  private baseRef(record: TaskTopicIntegration): string {
    return record.baseBranch === 'HEAD' ? 'HEAD' : `origin/${record.baseBranch}`;
  }
}

/** Merge instructions for a remote (sandbox-contract) integrator run. */
const buildRemoteMergePrompt = (record: TaskTopicIntegration, conflicts?: string[]): string =>
  [
    `[Workspace integration] Land the task branch onto the base branch of \`${record.repo}\`.`,
    `- The repo should be pre-cloned at \`${cloudSandboxRepoPath(record.repo!)}\` — clone it there yourself if it is missing.`,
    `- Steps: \`git fetch origin\` → \`git checkout -B ${record.baseBranch} origin/${record.baseBranch}\` → \`git merge --no-ff origin/${record.branch}\` → resolve any conflicts → \`git push origin ${record.baseBranch}\`.`,
    `- If a pull request exists for \`${record.branch}\`, landing it with \`gh pr merge --merge\` is equivalent.`,
    ...(conflicts?.length
      ? [`The previous attempt reported conflicts:\n${conflicts.map((f) => `- ${f}`).join('\n')}`]
      : []),
    'Do not start unrelated work. The run is complete only once the merge is pushed to the remote.',
  ].join('\n');
