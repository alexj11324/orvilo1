import type { TaskItem, TaskTopicIntegration, WorkingDirConfig } from '@orvilo/types';
import { deriveWorktreePath } from '@orvilo/types';
import debug from 'debug';

import { TaskModel } from '@/database/models/task';
import { TaskTopicModel } from '@/database/models/taskTopic';
import type { LobeChatDatabase } from '@/database/type';
import { deviceGateway } from '@/server/services/deviceGateway';
import { TaskRunnerService } from '@/server/services/taskRunner';

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

  constructor(db: LobeChatDatabase, userId: string, workspaceId?: string) {
    this.db = db;
    this.userId = userId;
    this.workspaceId = workspaceId;
    this.taskModel = new TaskModel(db, userId, workspaceId);
    this.taskTopicModel = new TaskTopicModel(db, userId, workspaceId);
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
    try {
      if (record.role === 'task') {
        return await this.integrateTaskRun(task, topicId, record);
      }
      return await this.finalizeCorrectiveRun(task, topicId, record);
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

  /** First integration attempt for a fresh task run. */
  private async integrateTaskRun(
    task: TaskItem,
    topicId: string,
    record: TaskTopicIntegration,
  ): Promise<IntegrationOutcome> {
    const integrationWorktreePath =
      record.integrationWorktreePath ??
      deriveWorktreePath(record.repoPath, `integration-${record.baseBranch.replaceAll('/', '-')}`);

    const ensured = await this.ensureIntegrationWorktree(record, integrationWorktreePath);
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

  /** Check the merge state after a corrective run returned. */
  private async finalizeCorrectiveRun(
    task: TaskItem,
    topicId: string,
    record: TaskTopicIntegration,
  ): Promise<IntegrationOutcome> {
    const finalized = await deviceGateway.finalizeGitMerge({
      deviceId: record.deviceId,
      path: record.integrationWorktreePath ?? record.worktreePath,
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

    // Only attempt a remote publish when the base actually names a branch —
    // a 'HEAD' fallback base means the workspace has no remote tracking ref
    // worth pushing to.
    if (record.baseBranch !== 'HEAD') {
      const pushed = await deviceGateway.pushGitBranch({
        deviceId: record.deviceId,
        path: record.integrationWorktreePath ?? record.worktreePath,
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
   * Kick off a corrective run inside the integration worktree. The run is a
   * normal task run (new topic, new seq) but bound to the merge worktree via
   * `workspaceOverride`, and its task_topics row carries the same integration
   * record with `role: 'integrate'` so its completion re-enters this service's
   * finalize path.
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

    const integrationWorktreePath =
      context?.integrationWorktreePath ?? record.integrationWorktreePath;
    if (!integrationWorktreePath) {
      await this.taskTopicModel.updateIntegration(task.id, topicId, {
        lastError: 'No integration worktree to correct in',
        state: 'blocked',
      });
      return 'blocked';
    }

    const workingDirectoryConfig: WorkingDirConfig = {
      git: { detached: true, isWorktree: true },
      path: integrationWorktreePath,
      repoType: 'git',
    };

    const conflictList = context?.conflicts?.length
      ? `Conflicting paths:\n${context.conflicts.map((f) => `- ${f}`).join('\n')}`
      : 'A merge is in progress in this worktree.';

    const extraPrompt = [
      `[Workspace integration] Your previous run finished on branch \`${record.branch}\`.`,
      `Merging it into \`${record.baseBranch}\` hit conflicts in the shared integration worktree — the working directory you are in now.`,
      conflictList,
      'Resolve the conflicts (look for <<<<<<< conflict markers), `git add` the resolved files, and commit to complete the merge. Do not start unrelated work.',
    ].join('\n');

    const runner = new TaskRunnerService(this.db, this.userId, this.workspaceId);
    await runner.runTask({
      extraPrompt,
      integrationSeed: {
        ...record,
        attempts,
        conflicts: context?.conflicts,
        integrationWorktreePath,
        role: 'integrate',
        runTopicId: topicId,
        state: 'merging',
        worktreePath: integrationWorktreePath,
      },
      taskId: task.id,
      workspaceOverride: {
        workingDirectory: integrationWorktreePath,
        workingDirectoryConfig,
      },
    });

    await this.taskTopicModel.updateIntegration(task.id, topicId, {
      attempts,
      state: 'conflict',
    });

    return 'hold';
  }

  /** Create the detached integration worktree; tolerate one already on disk. */
  private async ensureIntegrationWorktree(
    record: TaskTopicIntegration,
    integrationWorktreePath: string,
  ): Promise<boolean> {
    const added = await deviceGateway.addGitWorktree({
      branch: '',
      detach: true,
      deviceId: record.deviceId,
      path: record.repoPath,
      ref: this.baseRef(record),
      userId: this.userId,
      workspaceId: this.workspaceId,
      worktreePath: integrationWorktreePath,
    });
    if (added.success) return true;
    // Reuse an existing directory — e.g. a stale worktree from an earlier run.
    if (added.error && /already exists/i.test(added.error)) return true;
    log('ensureIntegrationWorktree: add failed for %s — %s', record.repoPath, added.error);
    return false;
  }

  /** Prefer the remote-tracking ref so merges land on the published tip. */
  private baseRef(record: TaskTopicIntegration): string {
    return record.baseBranch === 'HEAD' ? 'HEAD' : `origin/${record.baseBranch}`;
  }
}
