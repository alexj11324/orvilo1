import { cloudSandboxRepoPath, type TaskItem, type TaskTopicIntegration } from '@orvilo/types';
import { and, eq, isNull, or } from 'drizzle-orm';
import debug from 'debug';

import { AgentModel } from '@/database/models/agent';
import { TaskModel } from '@/database/models/task';
import { TaskTopicModel } from '@/database/models/taskTopic';
import { tasks } from '@/database/schemas/task';
import type { LobeChatDatabase } from '@/database/type';
import {
  createPullRequestForBranch,
  getPullRequestReviewSnapshot,
  getRemoteBranchSha,
  mergePullRequest,
  resolveGithubAccessToken,
  type RemotePrReviewSnapshot,
} from '@/server/services/githubRepo';
import { TaskService } from '@/server/services/task';
import { TaskRunnerService } from '@/server/services/taskRunner';

const log = debug('task-delivery-review');
const MAX_REVIEW_CORRECTIVE_ATTEMPTS = 5;
const REVIEW_SCAN_LIMIT = 50;

interface DeliveryReviewContext {
  handledFeedbackIds?: string[];
  lastConflictHeadSha?: string;
  lastFailedHeadSha?: string;
  lastMergeError?: string;
  lastReviewedHeadSha?: string;
}

export interface TaskDeliveryReviewSweepOptions {
  createdByUserId?: string;
  workspaceId?: string;
}

export interface TaskDeliveryReviewSweepResult {
  checked: number;
  corrected: string[];
  merged: string[];
  paused: string[];
  waiting: string[];
}

const reviewContext = (task: TaskItem): DeliveryReviewContext => {
  const context = (task.context as { deliveryReview?: DeliveryReviewContext } | null) ?? {};
  return context.deliveryReview ?? {};
};

const activeDeliveryRow = (
  rows: Awaited<ReturnType<TaskTopicModel['findByTaskId']>>,
) =>
  [...rows]
    .filter(
      (row) =>
        row.topicId &&
        row.integration?.repo &&
        row.integration.state === 'verification_pending',
    )
    .sort((a, b) => b.seq - a.seq)[0];

const allFeedbackIds = (snapshot: RemotePrReviewSnapshot): string[] => [
  ...snapshot.humanCommentIds,
  ...snapshot.requestedChangeReviewIds,
  ...snapshot.unresolvedThreadIds.map((id) => `thread:${id}`),
];

const getCredentialKey = async (
  db: LobeChatDatabase,
  task: TaskItem,
  workspaceId?: string,
): Promise<string> => {
  if (!task.assigneeAgentId) return 'github';
  const agent = await new AgentModel(db, task.createdByUserId, workspaceId)
    .getAgentConfig(task.assigneeAgentId)
    .catch(() => null);
  return agent?.agencyConfig?.heterogeneousProvider?.env?.GITHUB_CRED_KEY ?? 'github';
};

const persistReviewContext = async (
  taskModel: TaskModel,
  taskId: string,
  patch: DeliveryReviewContext,
): Promise<void> => {
  await taskModel.updateContext(taskId, { deliveryReview: patch });
};

const markDeliveryMerged = async (params: {
  db: LobeChatDatabase;
  mergeSha?: string;
  record: TaskTopicIntegration;
  snapshot: RemotePrReviewSnapshot;
  task: TaskItem;
  topicModel: TaskTopicModel;
  workspaceId?: string;
}): Promise<void> => {
  const { db, mergeSha, record, snapshot, task, topicModel, workspaceId } = params;
  const rows = await topicModel.findByTaskId(task.id);
  for (const row of rows) {
    if (!row.topicId || row.integration?.branch !== record.branch) continue;
    await topicModel.updateIntegration(task.id, row.topicId, {
      expectedBaseSha: snapshot.baseSha,
      expectedHeadSha: snapshot.headSha,
      integratedSha: mergeSha ?? snapshot.mergeCommitSha,
      lastError: null,
      lastErrorCode: null,
      prNumber: snapshot.number,
      prUrl: snapshot.url,
      pushedToRemote: true,
      state: 'integrated',
    });
  }

  await new TaskService(db, task.createdByUserId, workspaceId).updateStatus({
    id: task.id,
    status: 'completed',
  });
};

const buildCorrectivePrompt = (params: {
  record: TaskTopicIntegration;
  snapshot: RemotePrReviewSnapshot;
  task: TaskItem;
}): string => {
  const { record, snapshot, task } = params;
  const failed = snapshot.checks.failed.length
    ? `\nFailed CI checks:\n${snapshot.checks.failed.map((name) => `- ${name}`).join('\n')}`
    : '';
  const threads = snapshot.unresolvedThreadIds.length
    ? `\nUnresolved GitHub review thread node ids:\n${snapshot.unresolvedThreadIds.map((id) => `- ${id}`).join('\n')}`
    : '';
  const changeRequests = snapshot.requestedChangeReviewIds.length
    ? `\nFormal change-request reviews: ${snapshot.requestedChangeReviewIds.join(', ')}`
    : '';

  return [
    `[PR review corrective run] Continue delivery for ${task.identifier} on the EXISTING PR ${snapshot.url}.`,
    `Repository: ${record.repo}. Base: ${record.baseBranch}. Delivery branch: ${record.branch}.`,
    'Do not create a new issue, task, branch, or pull request. Do not merge the PR yourself.',
    `Start by fetching the remote and checking out ${record.branch}; make sure the checkout is based on origin/${record.branch}, not a stale local branch.`,
    'Read the PR conversation, inline review comments, formal reviews, and current CI output before editing. Treat the task instruction and existing accepted scope as authoritative.',
    `${failed}${changeRequests}${threads}`.trim(),
    'Fix the actionable findings only, run the focused tests plus any checks required by the repository, commit, and push back to the SAME delivery branch.',
    'For each addressed inline review thread, reply with the concrete fix/evidence. Resolve a GitHub review thread only after its requested change is actually satisfied; use the thread node id above with the GitHub GraphQL resolveReviewThread mutation when appropriate.',
    'Leave the PR open. The Orvilo delivery controller will re-read the new head SHA, wait for CI/review gates, and perform the merge only when every gate is satisfied.',
  ]
    .filter(Boolean)
    .join('\n');
};

const dispatchCorrective = async (params: {
  db: LobeChatDatabase;
  record: TaskTopicIntegration;
  row: Awaited<ReturnType<TaskTopicModel['findByTaskId']>>[number];
  snapshot: RemotePrReviewSnapshot;
  task: TaskItem;
  workspaceId?: string;
}): Promise<void> => {
  const { db, record, row, snapshot, task, workspaceId } = params;
  if (!record.repo || !row.topicId) throw new Error('Review delivery is missing its repository/topic');
  if (record.attempts >= MAX_REVIEW_CORRECTIVE_ATTEMPTS) {
    throw new Error(`PR review still requires changes after ${MAX_REVIEW_CORRECTIVE_ATTEMPTS} corrective runs`);
  }

  const workingDirectory = record.worktreePath ?? cloudSandboxRepoPath(record.repo);
  const workspaceOverride = record.deviceId && record.worktreePath
    ? {
        workingDirectory,
        workingDirectoryConfig: {
          git: { branch: record.branch, isWorktree: true, upstream: { branch: record.branch, remote: 'origin' } },
          path: workingDirectory,
          repoType: 'git' as const,
        },
      }
    : {
        repos: [record.repo],
        workingDirectory,
        workingDirectoryConfig: {
          git: { branch: record.branch, upstream: { branch: record.branch, remote: 'origin' } },
          path: workingDirectory,
          repoType: 'git' as const,
        },
      };

  await new TaskRunnerService(db, task.createdByUserId, workspaceId).runTask({
    extraPrompt: buildCorrectivePrompt({ record, snapshot, task }),
    integrationSeed: {
      ...record,
      attempts: record.attempts + 1,
      expectedBaseSha: undefined,
      expectedHeadSha: undefined,
      role: 'integrate',
      runTopicId: row.topicId,
      state: 'merging',
    },
    parentOperationId: row.operationId ?? undefined,
    skipTaskVerification: true,
    taskId: task.id,
    workspaceOverride,
  });
};

const ensureReviewTaskPaused = async (
  db: LobeChatDatabase,
  task: TaskItem,
  rows: Awaited<ReturnType<TaskTopicModel['findByTaskId']>>,
  workspaceId?: string,
): Promise<boolean> => {
  if (task.status === 'paused') return true;
  if (task.status !== 'running' || rows.some((row) => row.status === 'running')) return false;
  await new TaskService(db, task.createdByUserId, workspaceId).updateStatus({
    id: task.id,
    status: 'paused',
  });
  return true;
};

/**
 * Reconcile PR-bound code deliveries. `paused` remains the existing task-level
 * Pending Review state; only a task with a `verification_pending` integration
 * row participates, so ordinary manual pauses are never auto-resumed or merged.
 *
 * The controller is deliberately pull-based in addition to webhook-friendly:
 * every pass re-reads GitHub's authoritative PR revision, CI, comments and
 * review threads. Repeated executions are idempotent through persisted feedback
 * ids/head SHAs and the TaskRunner single-writer reservation.
 */
export const runTaskDeliveryReviewSweep = async (
  db: LobeChatDatabase,
  options: TaskDeliveryReviewSweepOptions = {},
): Promise<TaskDeliveryReviewSweepResult> => {
  const filters = [
    or(isNull(tasks.isDeleted), eq(tasks.isDeleted, false)),
    or(eq(tasks.status, 'running'), eq(tasks.status, 'paused')),
  ];
  if (options.createdByUserId) {
    filters.push(eq(tasks.createdByUserId, options.createdByUserId));
    filters.push(options.workspaceId ? eq(tasks.workspaceId, options.workspaceId) : isNull(tasks.workspaceId));
  }

  const candidates = await db.select().from(tasks).where(and(...filters)).limit(REVIEW_SCAN_LIMIT);
  const result: TaskDeliveryReviewSweepResult = {
    checked: 0,
    corrected: [],
    merged: [],
    paused: [],
    waiting: [],
  };

  for (const task of candidates) {
    const workspaceId = task.workspaceId ?? undefined;
    const topicModel = new TaskTopicModel(db, task.createdByUserId, workspaceId);
    const taskModel = new TaskModel(db, task.createdByUserId, workspaceId);
    const rows = await topicModel.findByTaskId(task.id);
    const row = activeDeliveryRow(rows);
    if (!row?.topicId || !row.integration?.repo) continue;
    const record = row.integration;
    result.checked += 1;

    if (!(await ensureReviewTaskPaused(db, task, rows, workspaceId))) {
      result.waiting.push(task.identifier);
      continue;
    }

    try {
      const credKey = await getCredentialKey(db, task, workspaceId);
      const token = await resolveGithubAccessToken({
        credKey,
        db,
        userId: task.createdByUserId,
        workspaceId,
      });

      let prNumber = record.prNumber;
      let prUrl = record.prUrl;
      if (!prNumber) {
        const remoteHead = await getRemoteBranchSha(record.repo, record.branch, token);
        if (remoteHead) {
          const created = await createPullRequestForBranch({
            baseBranch: record.baseBranch,
            body: `Automated delivery for Orvilo task ${task.identifier}. This PR remains open while CI and review feedback are processed.`,
            headBranch: record.branch,
            repo: record.repo,
            title: `${task.identifier}: ${task.name || task.instruction.slice(0, 80)}`,
            token,
          });
          prNumber = created?.number;
          prUrl = created?.url;
          if (prNumber && prUrl) {
            await topicModel.updateIntegration(task.id, row.topicId, {
              expectedHeadSha: remoteHead,
              prNumber,
              prUrl,
            });
          }
        }
      }

      if (!prNumber) {
        await taskModel.update(task.id, {
          error: 'Pull request required: push the delivery branch to GitHub before review can continue.',
        });
        result.paused.push(task.identifier);
        continue;
      }

      const snapshot = await getPullRequestReviewSnapshot(record.repo, prNumber, token);
      if (!snapshot) {
        await taskModel.update(task.id, {
          error: 'GitHub delivery state is temporarily unavailable; review will retry automatically.',
        });
        result.waiting.push(task.identifier);
        continue;
      }

      if (snapshot.baseBranch !== record.baseBranch) {
        await topicModel.updateIntegration(task.id, row.topicId, {
          lastError: `PR targets ${snapshot.baseBranch}, expected ${record.baseBranch}`,
          state: 'blocked',
        });
        await taskModel.update(task.id, {
          error: `Pull request must target ${record.baseBranch} before this task can finish.`,
        });
        result.paused.push(task.identifier);
        continue;
      }

      if (snapshot.merged) {
        await markDeliveryMerged({
          db,
          mergeSha: snapshot.mergeCommitSha,
          record,
          snapshot,
          task,
          topicModel,
          workspaceId,
        });
        result.merged.push(task.identifier);
        continue;
      }
      if (!snapshot.open) {
        await topicModel.updateIntegration(task.id, row.topicId, {
          lastError: 'Pull request was closed without being merged',
          state: 'blocked',
        });
        await taskModel.update(task.id, { error: 'Pull request was closed without being merged.' });
        result.paused.push(task.identifier);
        continue;
      }

      const context = reviewContext(task);
      const handled = new Set(context.handledFeedbackIds ?? []);
      const feedback = allFeedbackIds(snapshot);
      const newFeedback = feedback.filter((id) => !handled.has(id));
      const needsConflictRepair =
        snapshot.mergeable === false || snapshot.mergeableState === 'dirty' || snapshot.mergeableState === 'behind';
      const failedThisHead = snapshot.checks.failed.length > 0 && context.lastFailedHeadSha !== snapshot.headSha;
      const conflictThisHead = needsConflictRepair && context.lastConflictHeadSha !== snapshot.headSha;
      const needsCorrection = newFeedback.length > 0 || failedThisHead || conflictThisHead;

      if (needsCorrection) {
        const nextContext: DeliveryReviewContext = {
          ...context,
          handledFeedbackIds: [...new Set([...(context.handledFeedbackIds ?? []), ...newFeedback])],
          lastConflictHeadSha: conflictThisHead ? snapshot.headSha : context.lastConflictHeadSha,
          lastFailedHeadSha: failedThisHead ? snapshot.headSha : context.lastFailedHeadSha,
          lastReviewedHeadSha: snapshot.headSha,
        };
        await persistReviewContext(taskModel, task.id, nextContext);
        await taskModel.update(task.id, { error: null });
        await dispatchCorrective({ db, record, row, snapshot, task, workspaceId });
        result.corrected.push(task.identifier);
        continue;
      }

      const reviewStillBlocking =
        snapshot.draft ||
        snapshot.mergeable === null ||
        snapshot.requestedChangeReviewIds.length > 0 ||
        snapshot.requestedReviewers.length > 0 ||
        snapshot.unresolvedThreadIds.length > 0 ||
        snapshot.checks.pending.length > 0 ||
        snapshot.checks.failed.length > 0 ||
        snapshot.checks.successful.length === 0 ||
        needsConflictRepair;
      if (reviewStillBlocking) {
        await taskModel.update(task.id, { error: null });
        result.waiting.push(task.identifier);
        continue;
      }

      const merge = await mergePullRequest({
        expectedHeadSha: snapshot.headSha,
        mergeMethod: 'squash',
        prNumber: snapshot.number,
        repo: record.repo,
        token,
      });
      if (!merge.merged) {
        await persistReviewContext(taskModel, task.id, {
          ...context,
          lastMergeError: merge.message ?? 'GitHub rejected the merge request',
          lastReviewedHeadSha: snapshot.headSha,
        });
        await taskModel.update(task.id, {
          error: merge.message ? `Waiting to merge: ${merge.message}` : 'Waiting for GitHub merge gates.',
        });
        result.waiting.push(task.identifier);
        continue;
      }

      const confirmed = await getPullRequestReviewSnapshot(record.repo, snapshot.number, token);
      if (!confirmed?.merged) {
        await taskModel.update(task.id, {
          error: 'GitHub accepted the merge request, but merge confirmation is pending.',
        });
        result.waiting.push(task.identifier);
        continue;
      }

      await markDeliveryMerged({
        db,
        mergeSha: merge.sha ?? confirmed.mergeCommitSha,
        record,
        snapshot: confirmed,
        task,
        topicModel,
        workspaceId,
      });
      result.merged.push(task.identifier);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log('review sweep failed for %s — %s', task.identifier, message);
      await taskModel.update(task.id, { error: `PR review orchestration: ${message}` }).catch(() => null);
      result.waiting.push(task.identifier);
    }
  }

  return result;
};