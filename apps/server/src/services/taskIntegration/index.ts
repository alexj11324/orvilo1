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
  getRemoteBranchSha,
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
 * Merges happen in a detached integration worktree owned by one task run, so
 * the base branch can stay checked out in a user-facing worktree and parallel
 * runs cannot share mutable merge state. A conflict dispatches a
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

  private async updateIntegrationOrThrow(
    taskId: string,
    topicId: string,
    patch: { [K in keyof TaskTopicIntegration]?: TaskTopicIntegration[K] | null },
  ): Promise<void> {
    if (!(await this.taskTopicModel.updateIntegration(taskId, topicId, patch))) {
      throw new Error(`Integration row disappeared for task ${taskId} topic ${topicId}`);
    }
  }

  /**
   * Freeze a sandbox run's remote delivery identity at the terminal callback
   * boundary, before handoff generation or verification can introduce a delay.
   * Later integration checks may observe the remote again, but they can only
   * compare against these accepted head/base/PR values.
   */
  async captureRemoteIdentityOnComplete(task: TaskItem, topicId: string): Promise<boolean> {
    const taskTopic = await this.taskTopicModel.findByTopicId(topicId);
    const record = taskTopic?.integration;
    if (!record?.repo || record.role !== 'task') return true;
    if (record.expectedHeadSha && record.expectedBaseSha) return true;

    const check = await this.verifyRemoteMerge(record, task);
    const complete = !!check.expectedHeadSha && !!check.expectedBaseSha;
    const lastError = complete
      ? null
      : (check.error ?? 'Could not freeze the remote delivery commit and base at run completion');
    const updated = await this.taskTopicModel.updateIntegration(task.id, topicId, {
      expectedBaseSha: check.expectedBaseSha,
      expectedHeadSha: check.expectedHeadSha,
      lastError,
      prNumber: check.prNumber,
      prUrl: check.prUrl,
      ...(complete ? {} : { state: 'blocked' as const }),
    });
    return complete && updated;
  }

  /**
   * Gate evaluated inside `onTopicComplete` for a 'done' run, after the topic
   * and handoff are persisted and before the task's post-run transition.
   */
  async integrateOnComplete(params: {
    completionReservationId?: string;
    task: TaskItem;
    taskTopicId: string;
    verifyOperationId?: string;
  }): Promise<IntegrationOutcome> {
    const { task, taskTopicId } = params;

    // Cheap bail: only workspace-bound tasks can have anything to integrate,
    // so unbound runs skip the topic read entirely. Resolution failure is
    // fail closed: the binding exists precisely to control where delivery is
    // published, so an unreadable binding cannot be treated as unprovisioned.
    let workspace;
    try {
      workspace = await this.workspaceService.resolveWorkspaceConfig(task);
    } catch (error) {
      log('integrateOnComplete: workspace resolution failed for %s — %O', task.identifier, error);
      return 'blocked';
    }
    if (!workspace) return 'settled';

    try {
      const taskTopic = await this.taskTopicModel.findByTopicId(taskTopicId);
      const storedRecord = taskTopic?.integration;
      const record = storedRecord
        ? {
            ...storedRecord,
            verifyOperationId: params.verifyOperationId ?? storedRecord.verifyOperationId,
          }
        : undefined;
      if (record && params.verifyOperationId !== storedRecord?.verifyOperationId) {
        await this.updateIntegrationOrThrow(task.id, taskTopicId, {
          verifyOperationId: params.verifyOperationId,
        });
      }
      if (
        !record ||
        !taskTopic?.topicId ||
        (record.role === 'task' && record.state === 'integrated')
      ) {
        return 'settled';
      }
      if (record.state === 'blocked') return 'blocked';
      if (
        record.role === 'task' &&
        record.state !== 'pending' &&
        record.state !== 'conflict' &&
        record.state !== 'merging'
      ) {
        return 'settled';
      }
      if (record.role === 'integrate' && record.state !== 'merging') return 'settled';

      const topicId = taskTopic.topicId;
      const outcome =
        record.role === 'task'
          ? record.state === 'merging'
            ? record.repo
              ? await this.dispatchCorrective(
                  task,
                  topicId,
                  record,
                  undefined,
                  params.completionReservationId,
                )
              : record.integratedSha
                ? await this.publishAndCleanup(task.id, record, record.integratedSha)
                : 'blocked'
            : record.repo
              ? await this.integrateRemoteRun(task, topicId, record, params.completionReservationId)
              : await this.integrateTaskRun(task, topicId, record, params.completionReservationId)
          : record.repo
            ? await this.finalizeRemoteCorrectiveRun(
                task,
                topicId,
                record,
                params.completionReservationId,
              )
            : await this.finalizeCorrectiveRun(
                task,
                topicId,
                record,
                params.completionReservationId,
              );
      if (outcome === 'blocked') await this.blockRelated(task.id, record.branch);
      return outcome;
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

  private async blockRelated(taskId: string, branch: string): Promise<void> {
    const rows = await this.taskTopicModel.findByTaskId(taskId);
    for (const row of rows) {
      if (row.topicId && row.integration?.branch === branch) {
        await this.updateIntegrationOrThrow(taskId, row.topicId, { state: 'blocked' });
      }
    }
  }

  /**
   * Best-effort teardown of a task's leftover device worktrees — invoked when
   * the task is canceled or deleted, and internally when a merge blocks.
   *
   * A `task_topics` row is a cleanup candidate when its integration record is
   * device-bound and may still own an on-disk worktree: a non-terminal record
   * (pending / merging / conflict) abandoned mid-pipeline, or a terminal one
   * whose earlier cleanup never ran or failed (`worktreeCleaned !== true`).
   * Each candidate contributes its `worktreePath` and recorded
   * `integrationWorktreePath` to a deduped removal set — corrective rows alias
   * the integration worktree under `worktreePath`, so the set prevents a
   * double-removal.
   *
   * Remote records (`repo`, no device fields) never touch device RPCs — their
   * clone lived inside an ephemeral sandbox. The detached integration
   * integration worktree is run-scoped too and is safe to remove with the task
   * worktree once the candidate no longer needs recovery.
   *
   * Never throws — cleanup runs on cancel/delete paths where a failure must
   * not break the primary operation. A removal that fails leaves
   * `worktreeCleaned` false so a later pass can retry.
   */
  async snapshotTaskWorktrees(taskId: string) {
    return this.taskTopicModel.findByTaskId(taskId);
  }

  async cleanupTaskWorktrees(
    taskId: string,
    snapshot?: Awaited<ReturnType<TaskTopicModel['findByTaskId']>>,
  ): Promise<void> {
    try {
      // Delete callers capture records first, commit the guarded deletion, and
      // only then perform irreversible device cleanup from that snapshot.
      const rows = snapshot ?? (await this.taskTopicModel.findByTaskId(taskId));
      const candidates: { paths: string[]; topicId: string }[] = [];
      const removals = new Map<string, { deviceId: string; repoPath: string }>();

      for (const row of rows) {
        const record = row.integration;
        if (!row.topicId || !record || record.repo) continue;
        if (!record.deviceId || !record.repoPath) continue;
        const stale =
          record.state === 'pending' ||
          record.state === 'merging' ||
          record.state === 'conflict' ||
          record.worktreeCleaned !== true;
        if (!stale) continue;

        const paths = [record.worktreePath, record.integrationWorktreePath].filter(
          (path): path is string => !!path && path !== record.repoPath,
        );
        if (paths.length === 0) continue;

        candidates.push({ paths, topicId: row.topicId });
        for (const worktreePath of paths) {
          removals.set(worktreePath, { deviceId: record.deviceId, repoPath: record.repoPath });
        }
      }
      if (candidates.length === 0) return;

      const removed = new Map<string, boolean>();
      for (const [worktreePath, target] of removals) {
        const result = await deviceGateway.removeGitWorktree({
          deviceId: target.deviceId,
          path: target.repoPath,
          userId: this.userId,
          workspaceId: this.workspaceId,
          worktreePath,
        });
        removed.set(worktreePath, result.success);
        if (!result.success) {
          log(
            'cleanupTaskWorktrees: remove failed for task %s path %s — %s',
            taskId,
            worktreePath,
            result.error,
          );
        }
      }

      if (snapshot) return; // The task_topics rows were already deleted.
      for (const { paths, topicId } of candidates) {
        await this.taskTopicModel
          .updateIntegration(taskId, topicId, {
            worktreeCleaned: paths.every((path) => removed.get(path) === true),
          })
          .catch((error) =>
            log('cleanupTaskWorktrees: flag update failed for %s/%s — %O', taskId, topicId, error),
          );
      }
    } catch (error) {
      log('cleanupTaskWorktrees: failed for task %s — %O', taskId, error);
    }
  }

  /** First integration attempt for a fresh task run (device worktree path). */
  private async integrateTaskRun(
    task: TaskItem,
    topicId: string,
    record: TaskTopicIntegration,
    completionReservationId?: string,
  ): Promise<IntegrationOutcome> {
    if (!record.deviceId || !record.repoPath || !record.worktreePath) {
      await this.updateIntegrationOrThrow(task.id, topicId, {
        lastError: 'Integration record is missing its device workspace fields',
        state: 'blocked',
      });
      return 'blocked';
    }

    const ownedIntegrationWorktreePath = deriveWorktreePath(
      record.repoPath,
      `integration-${record.baseBranch.replaceAll('/', '-')}-${topicId}`,
    );
    if (
      record.integrationWorktreePath &&
      record.integrationWorktreePath !== ownedIntegrationWorktreePath
    ) {
      await this.updateIntegrationOrThrow(task.id, topicId, {
        lastError:
          'Legacy shared integration worktree cannot be resumed safely; retry the task run',
        state: 'blocked',
      });
      return 'blocked';
    }
    const integrationWorktreePath = record.integrationWorktreePath ?? ownedIntegrationWorktreePath;

    const ensured = await this.ensureIntegrationWorktree({
      baseRef: this.baseRef(record),
      deviceId: record.deviceId,
      integrationWorktreePath,
      repoPath: record.repoPath,
    });
    if (!ensured) {
      await this.updateIntegrationOrThrow(task.id, topicId, {
        integrationWorktreePath,
        lastError: 'Failed to create integration worktree',
        state: 'blocked',
      });
      return 'blocked';
    }

    // Record the integration worktree as soon as it exists so a later
    // blocked/cancel cleanup can find it — the merge-report branches below
    // only persist it on conflict.
    await this.updateIntegrationOrThrow(task.id, topicId, {
      integrationWorktreePath,
    });

    const merged = await deviceGateway.mergeGitBranch({
      baseRef: this.baseRef(record),
      branch: record.branch,
      deviceId: record.deviceId,
      path: integrationWorktreePath,
      userId: this.userId,
      workspaceId: this.workspaceId,
    });
    const deliveryRecord: TaskTopicIntegration = {
      ...record,
      expectedHeadSha: merged.headSha ?? record.expectedHeadSha,
      integrationWorktreePath,
    };
    await this.updateIntegrationOrThrow(task.id, topicId, {
      expectedHeadSha: deliveryRecord.expectedHeadSha,
    });

    if (merged.state === 'merged') {
      return this.landMerge(task, topicId, deliveryRecord, merged.sha);
    }

    if (merged.state === 'in-progress') {
      // A previous merge is still open in this worktree — hand it to the
      // corrective path as-is rather than discarding it.
      return this.dispatchCorrective(
        task,
        topicId,
        deliveryRecord,
        {
          conflicts: merged.conflicts,
          integrationWorktreePath,
        },
        completionReservationId,
      );
    }

    await this.updateIntegrationOrThrow(task.id, topicId, {
      conflicts: merged.conflicts,
      integrationWorktreePath,
      lastError: merged.error,
      state: 'conflict',
    });
    return this.dispatchCorrective(
      task,
      topicId,
      deliveryRecord,
      {
        conflicts: merged.conflicts,
        integrationWorktreePath,
      },
      completionReservationId,
    );
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
    completionReservationId?: string,
  ): Promise<IntegrationOutcome> {
    if (!parseGithubRepo(record.repo!)) {
      // An unparseable coordinate can never verify or merge — block now rather
      // than burning corrective runs on it.
      await this.updateIntegrationOrThrow(task.id, topicId, {
        lastError: `Integration repo is not a GitHub coordinate: ${record.repo}`,
        state: 'blocked',
      });
      return 'blocked';
    }

    const check = await this.verifyRemoteMerge(record, task);
    const patch: Partial<TaskTopicIntegration> = {};
    if (check.expectedBaseSha) patch.expectedBaseSha = check.expectedBaseSha;
    if (check.prUrl) patch.prUrl = check.prUrl;
    if (check.prNumber) patch.prNumber = check.prNumber;
    if (check.expectedHeadSha) patch.expectedHeadSha = check.expectedHeadSha;
    if (check.error) patch.lastError = check.error;
    if (Object.keys(patch).length > 0) {
      await this.updateIntegrationOrThrow(task.id, topicId, patch);
    }
    if (check.merged) {
      await this.landRemoteMerge(task.id, topicId, record, check);
      return 'settled';
    }
    if (check.error) {
      await this.updateIntegrationOrThrow(task.id, topicId, {
        ...patch,
        state: 'blocked',
      });
      return 'blocked';
    }
    return this.dispatchCorrective(
      task,
      topicId,
      { ...record, ...patch },
      undefined,
      completionReservationId,
    );
  }

  /** Check the remote merge state after an integrator run returned. */
  private async finalizeRemoteCorrectiveRun(
    task: TaskItem,
    topicId: string,
    record: TaskTopicIntegration,
    completionReservationId?: string,
  ): Promise<IntegrationOutcome> {
    const check = await this.verifyRemoteMerge(record, task);
    const patch: Partial<TaskTopicIntegration> = {};
    if (check.expectedBaseSha) patch.expectedBaseSha = check.expectedBaseSha;
    if (check.prUrl) patch.prUrl = check.prUrl;
    if (check.prNumber) patch.prNumber = check.prNumber;
    if (check.expectedHeadSha) patch.expectedHeadSha = check.expectedHeadSha;
    if (check.error) patch.lastError = check.error;

    if (check.merged) {
      await this.landRemoteMerge(task.id, topicId, record, check);
      return 'settled';
    }

    if (check.error) {
      const lastError = check.error;
      await this.updateIntegrationOrThrow(task.id, topicId, {
        ...patch,
        lastError,
        state: 'blocked',
      });
      if (record.runTopicId) {
        await this.updateIntegrationOrThrow(task.id, record.runTopicId, {
          lastError,
          state: 'blocked',
        });
      }
      return 'blocked';
    }

    if (record.attempts >= MAX_CORRECTIVE_ATTEMPTS) {
      const lastError =
        check.error ?? `Remote merge not landed after ${record.attempts} integrator runs`;
      await this.updateIntegrationOrThrow(task.id, topicId, {
        ...patch,
        lastError,
        state: 'blocked',
      });
      if (record.runTopicId) {
        await this.updateIntegrationOrThrow(task.id, record.runTopicId, {
          lastError,
          state: 'blocked',
        });
      }
      return 'blocked';
    }

    if (Object.keys(patch).length > 0) {
      await this.updateIntegrationOrThrow(task.id, topicId, patch);
    }
    return this.dispatchCorrective(task, topicId, record, undefined, completionReservationId);
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
    expectedBaseSha?: string;
    expectedHeadSha?: string;
    merged: boolean;
    prNumber?: number;
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

    const pr = await findBranchPr(record.repo, record.branch, record.baseBranch, token);
    const currentHeadSha = await getRemoteBranchSha(record.repo, record.branch, token);
    const currentBaseSha = await getRemoteBranchSha(record.repo, record.baseBranch, token);
    const expectedHeadSha = record.expectedHeadSha ?? currentHeadSha ?? pr?.headSha;
    const expectedBaseSha = record.expectedBaseSha ?? currentBaseSha;
    const identity = {
      expectedBaseSha,
      expectedHeadSha,
      prNumber: pr?.number,
      prUrl: pr?.url,
    };

    if (!expectedHeadSha) {
      return {
        ...identity,
        error: 'Could not resolve the task branch commit via the GitHub API',
        merged: false,
      };
    }
    if (record.expectedHeadSha && currentHeadSha && currentHeadSha !== record.expectedHeadSha) {
      return {
        ...identity,
        error: `Task branch advanced from accepted commit ${record.expectedHeadSha} to ${currentHeadSha}`,
        merged: false,
      };
    }
    if (record.prNumber && pr && pr.number !== record.prNumber) {
      return {
        ...identity,
        error: `Task delivery is bound to PR #${record.prNumber}, not PR #${pr.number}`,
        merged: false,
      };
    }
    if (pr?.merged) {
      if (pr.headSha !== expectedHeadSha) {
        return {
          ...identity,
          error: `Merged PR #${pr.number} contains ${pr.headSha}, not accepted commit ${expectedHeadSha}`,
          merged: false,
        };
      }
      return { ...identity, merged: true, sha: pr.sha };
    }

    const state = await isBranchMergedInto({
      base: record.baseBranch,
      head: expectedHeadSha,
      repo: record.repo,
      token,
    });
    if (state === 'merged') return { ...identity, merged: true };
    if (state === 'unmerged') return { ...identity, merged: false };
    return {
      ...identity,
      error: 'Could not verify the remote merge state via the GitHub API',
      merged: false,
    };
  }

  /** Remote merge verified: stamp every row tracking this branch. */
  private async landRemoteMerge(
    taskId: string,
    topicId: string,
    record: TaskTopicIntegration,
    check: {
      expectedBaseSha?: string;
      expectedHeadSha?: string;
      prNumber?: number;
      prUrl?: string;
      sha?: string;
    },
  ): Promise<void> {
    const patch: Partial<TaskTopicIntegration> = {
      integratedSha: check.sha,
      expectedBaseSha: check.expectedBaseSha,
      expectedHeadSha: check.expectedHeadSha,
      prNumber: check.prNumber,
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
        await this.updateIntegrationOrThrow(taskId, row.topicId, patch);
      }
    }
  }

  /** Check the merge state after a corrective run returned. */
  private async finalizeCorrectiveRun(
    task: TaskItem,
    topicId: string,
    record: TaskTopicIntegration,
    completionReservationId?: string,
  ): Promise<IntegrationOutcome> {
    const finalizePath = record.integrationWorktreePath ?? record.worktreePath;
    if (!record.deviceId || !finalizePath || !record.expectedHeadSha) {
      await this.updateIntegrationOrThrow(task.id, topicId, {
        lastError: 'Integration record is missing its device workspace fields or accepted commit',
        state: 'blocked',
      });
      return 'blocked';
    }

    const finalized = await deviceGateway.finalizeGitMerge({
      deviceId: record.deviceId,
      expectedHead: record.expectedHeadSha,
      path: finalizePath,
      userId: this.userId,
      workspaceId: this.workspaceId,
    });

    if (finalized.state === 'integrated' && finalized.validatedExpectedHead) {
      return this.publishAndCleanup(task.id, record, finalized.sha);
    }

    if (finalized.state === 'integrated') {
      await this.updateIntegrationOrThrow(task.id, topicId, {
        lastError:
          'Connected device did not verify the accepted task commit; update the device client',
        state: 'blocked',
      });
      return 'blocked';
    }

    if (record.attempts >= MAX_CORRECTIVE_ATTEMPTS) {
      const lastError = `Merge conflicts remain after ${record.attempts} corrective runs`;
      await this.updateIntegrationOrThrow(task.id, topicId, {
        conflicts: finalized.conflicts,
        lastError,
        state: 'blocked',
      });
      if (record.runTopicId) {
        await this.updateIntegrationOrThrow(task.id, record.runTopicId, {
          lastError,
          state: 'blocked',
        });
      }
      return 'blocked';
    }

    await this.updateIntegrationOrThrow(task.id, topicId, {
      conflicts: finalized.conflicts,
      state: 'conflict',
    });
    return this.dispatchCorrective(task, topicId, record, undefined, completionReservationId);
  }

  /**
   * Merge landed: push the result to `origin/<base>` when the repo has a
   * remote, then drop the task's worktree. Push failure doesn't undo the local
   * merge — it's recorded on the record for a human to re-push.
   *
   * Both run-owned worktrees are removed only after the exact candidate commit
   * has been pushed successfully. A failed push retains them for recovery.
   */
  private async landMerge(
    task: TaskItem,
    topicId: string,
    record: TaskTopicIntegration,
    sha?: string,
  ): Promise<IntegrationOutcome> {
    const persisted = await this.taskTopicModel.updateIntegration(task.id, topicId, {
      integratedSha: sha,
      state: 'merging',
    });
    if (!persisted) {
      log(
        'landMerge: integration row disappeared before publish task=%s topic=%s',
        task.id,
        topicId,
      );
      return 'blocked';
    }
    return this.publishAndCleanup(task.id, record, sha);
  }

  private async publishAndCleanup(
    taskId: string,
    record: TaskTopicIntegration,
    sha?: string,
  ): Promise<IntegrationOutcome> {
    const rows = await this.taskTopicModel.findByTaskId(taskId);
    const related = rows.filter((row) => row.topicId && row.integration?.branch === record.branch);
    if (related.length === 0) {
      log(
        'publishAndCleanup: no integration rows remain for task=%s branch=%s',
        taskId,
        record.branch,
      );
      return 'blocked';
    }
    const updateRelated = async (patch: Partial<TaskTopicIntegration>) => {
      for (const row of related) {
        const updated = await this.taskTopicModel.updateIntegration(taskId, row.topicId!, patch);
        if (!updated) {
          throw new Error(`Integration row disappeared for task ${taskId} topic ${row.topicId}`);
        }
      }
    };

    const publishPath = record.integrationWorktreePath ?? record.worktreePath;
    if (!record.deviceId || !record.repoPath || !publishPath || !sha) {
      await updateRelated({
        integratedSha: sha,
        lastError: 'Integration candidate is missing the device path or commit SHA',
        state: 'blocked',
      });
      return 'blocked';
    }

    let pushedToRemote: boolean | undefined;
    if (record.baseBranch !== 'HEAD') {
      const pushed = await deviceGateway.pushGitBranch({
        deviceId: record.deviceId,
        path: publishPath,
        remoteBranch: record.baseBranch,
        sourceRef: sha,
        userId: this.userId,
        workspaceId: this.workspaceId,
      });
      if (!pushed.success || pushed.pushedSourceRef !== sha) {
        const reason = pushed.success
          ? 'device client did not confirm the immutable source commit'
          : (pushed.error ?? 'unknown');
        const lastError = `Merged locally; push to origin/${record.baseBranch} failed: ${reason}`;
        log(
          'publishAndCleanup: push to origin/%s failed for task %s — %s',
          record.baseBranch,
          taskId,
          reason,
        );
        await updateRelated({
          integratedSha: sha,
          lastError,
          pushedToRemote: false,
          state: 'blocked',
        });
        return 'blocked';
      }
      pushedToRemote = true;
    }

    const paths = new Set<string>();
    for (const row of related) {
      const integration = row.integration!;
      if (integration.worktreePath && integration.worktreePath !== integration.repoPath) {
        paths.add(integration.worktreePath);
      }
      if (
        integration.integrationWorktreePath &&
        integration.integrationWorktreePath !== integration.repoPath
      ) {
        paths.add(integration.integrationWorktreePath);
      }
    }
    let worktreeCleaned = true;
    for (const worktreePath of paths) {
      const removed = await deviceGateway.removeGitWorktree({
        deviceId: record.deviceId,
        path: record.repoPath,
        userId: this.userId,
        workspaceId: this.workspaceId,
        worktreePath,
      });
      worktreeCleaned &&= !!removed.success;
      if (!removed.success) {
        log('publishAndCleanup: worktree cleanup failed for task %s — %s', taskId, removed.error);
      }
    }

    await updateRelated({
      conflicts: null,
      integratedSha: sha,
      lastError: null,
      pushedToRemote,
      state: 'integrated',
      worktreeCleaned,
    });
    return 'settled';
  }

  /**
   * Kick off a corrective run that finishes the merge. The run is a normal
   * task run (new topic, new seq) whose task_topics row carries the same
   * integration record with `role: 'integrate'` so its completion re-enters
   * this service's finalize path.
   *
   * - Device records: bound to the run-owned integration worktree via
   *   `workspaceOverride`; the agent resolves the open conflict there.
   * - Remote records (sandbox contract): bound to a fresh sandbox pre-clone of
   *   `record.repo`; the agent performs the whole merge and pushes the base.
   */
  private async dispatchCorrective(
    task: TaskItem,
    topicId: string,
    record: TaskTopicIntegration,
    context?: { conflicts?: string[]; integrationWorktreePath?: string },
    completionReservationId?: string,
  ): Promise<IntegrationOutcome> {
    const attempts = record.attempts + 1;
    if (attempts > MAX_CORRECTIVE_ATTEMPTS) {
      const lastError = `Merge conflicts remain after ${MAX_CORRECTIVE_ATTEMPTS} corrective runs`;
      await this.updateIntegrationOrThrow(task.id, topicId, {
        lastError,
        state: 'blocked',
      });
      return 'blocked';
    }

    const isRemote = !!record.repo;
    const integrationWorktreePath =
      context?.integrationWorktreePath ?? record.integrationWorktreePath;
    if (!isRemote && !integrationWorktreePath) {
      await this.updateIntegrationOrThrow(task.id, topicId, {
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
        `Merging it into \`${record.baseBranch}\` hit conflicts in this run's integration worktree — the working directory you are in now.`,
        conflictList,
        'Resolve the conflicts (look for <<<<<<< conflict markers), `git add` the resolved files, and commit to complete the merge. Do not start unrelated work.',
      ].join('\n');
      seedOverrides = {
        integrationWorktreePath: integrationWorktreePath!,
        worktreePath: integrationWorktreePath!,
      };
    }

    await this.updateIntegrationOrThrow(task.id, topicId, {
      attempts,
      // Persist the parent state before dispatch. A very fast corrective run
      // can finish inside runTask's callback replay; writing this afterward
      // would regress an already integrated row back to merging/conflict.
      state: isRemote ? 'merging' : 'conflict',
      verifyOperationId: record.verifyOperationId,
    });

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
      replaceReservationId: completionReservationId,
      skipTaskVerification: true,
      taskId: task.id,
      workspaceOverride,
    });

    return 'hold';
  }

  /** Create the detached run-owned integration worktree; tolerate a retry. */
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
    // Reuse this run's existing directory after a redelivery or crash retry.
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
