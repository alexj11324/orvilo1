import { cloudSandboxRepoPath, type TaskItem, type TaskTopicIntegration } from '@orvilo/types';
import debug from 'debug';
import { and, asc, eq, isNull, or } from 'drizzle-orm';

import { AgentModel } from '@/database/models/agent';
import { TaskModel } from '@/database/models/task';
import { TaskTopicModel } from '@/database/models/taskTopic';
import { tasks } from '@/database/schemas/task';
import type { LobeChatDatabase } from '@/database/type';
import {
  createPullRequestForBranch,
  getPullRequestReviewSnapshot,
  getRemoteBranchSha,
  isRemotePrMergeReady,
  mergePullRequest,
  type RemotePrReviewSnapshot,
  resolveGithubAccessToken,
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

const activeDeliveryRow = (rows: Awaited<ReturnType<TaskTopicModel['findByTaskId']>>) => {
  // Pick the newest code delivery FIRST. Filtering by phase first can resurrect an
  // older pending delivery after its successor has already merged, failed or started.
  const latest = [...rows]
    .filter((row) => row.topicId && row.integration?.repo)
    .sort((a, b) => b.seq - a.seq)[0];
  return latest?.integration?.state === 'verification_pending' ? latest : undefined;
};

const allFeedbackIds = (snapshot: RemotePrReviewSnapshot): string[] => [
  ...snapshot.humanFeedbackIds,
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
  record: TaskTopicIntegration;
  snapshot: RemotePrReviewSnapshot;
  task: TaskItem;
  topicModel: TaskTopicModel;
  workspaceId?: string;
}): Promise<void> => {
  const { db, record, snapshot, task, topicModel, workspaceId } = params;
  if (
    !snapshot.merged ||
    !snapshot.mergedAt ||
    !snapshot.mergeCommitSha ||
    snapshot.baseBranch !== record.baseBranch ||
    snapshot.headBranch !== record.branch ||
    snapshot.number !== record.prNumber ||
    !record.expectedHeadSha ||
    snapshot.headSha !== record.expectedHeadSha
  ) {
    throw new Error('Merged PR does not match the accepted delivery identity and commit');
  }
  let updated = 0;
  const rows = await topicModel.findByTaskId(task.id);
  for (const row of rows) {
    if (
      !row.topicId ||
      row.integration?.branch !== record.branch ||
      row.integration.repo !== record.repo ||
      row.integration.baseBranch !== record.baseBranch ||
      row.integration.prNumber !== snapshot.number
    )
      continue;
    const persisted = await topicModel.updateIntegration(task.id, row.topicId, {
      expectedBaseSha: snapshot.baseSha,
      expectedHeadSha: snapshot.headSha,
      integratedSha: snapshot.mergeCommitSha,
      lastError: null,
      lastErrorCode: null,
      prNumber: snapshot.number,
      prUrl: snapshot.url,
      pushedToRemote: true,
      state: 'integrated',
    });
    if (!persisted) throw new Error('Delivery proof could not be persisted');
    updated += 1;
  }
  if (updated === 0) throw new Error('No matching delivery row remains for merge confirmation');

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
  const mergeState = snapshot.mergeableState
    ? `\nGitHub mergeability state: ${snapshot.mergeableState}`
    : '';

  return [
    `[PR review corrective run] Continue delivery for ${task.identifier} on the EXISTING PR ${snapshot.url}.`,
    `Repository: ${record.repo}. Base: ${record.baseBranch}. Delivery branch: ${record.branch}.`,
    'Do not create a new issue, task, branch, or pull request. Do not merge the PR yourself.',
    `Start by fetching the remote and checking out ${record.branch}; make sure the checkout is based on origin/${record.branch}, not a stale local branch.`,
    `If the PR is behind or conflicted, update ${record.branch} with the current origin/${record.baseBranch}, resolve conflicts on the delivery branch, and never push the base branch.`,
    'Read the PR conversation, inline review comments, formal reviews, and current CI output before editing. Treat the task instruction and existing accepted scope as authoritative.',
    `${failed}${changeRequests}${threads}${mergeState}`.trim(),
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
  if (!record.repo || !row.topicId)
    throw new Error('Review delivery is missing its repository/topic');
  if (record.attempts >= MAX_REVIEW_CORRECTIVE_ATTEMPTS) {
    throw new Error(
      `PR review still requires changes after ${MAX_REVIEW_CORRECTIVE_ATTEMPTS} corrective runs`,
    );
  }

  const workingDirectory = record.worktreePath ?? cloudSandboxRepoPath(record.repo);
  const workspaceOverride =
    record.deviceId && record.worktreePath
      ? {
          workingDirectory,
          workingDirectoryConfig: {
            git: {
              branch: record.branch,
              isWorktree: true,
              upstream: { branch: record.branch, remote: 'origin' },
            },
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
  // A paused task can still have a live topic while cancellation settles.
  if (rows.some((row) => row.status === 'running')) return false;
  if (task.status === 'paused') return true;
  if (task.status !== 'running') return false;
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
 * Every pass re-reads GitHub's authoritative PR revision, CI, comments and
 * review threads. The scan is oldest-first so the bounded batch cannot starve
 * long-waiting reviews. Feedback is acknowledged only after the corrective run
 * was successfully reserved/dispatched, preventing lost comments on dispatch
 * failures.
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
    filters.push(
      options.workspaceId ? eq(tasks.workspaceId, options.workspaceId) : isNull(tasks.workspaceId),
    );
  }

  const candidates = await db
    .select()
    .from(tasks)
    .where(and(...filters))
    .orderBy(asc(tasks.updatedAt))
    .limit(REVIEW_SCAN_LIMIT);
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
    const repo = row.integration.repo;
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
        const remoteHead = await getRemoteBranchSha(repo, record.branch, token);
        if (remoteHead) {
          const created = await createPullRequestForBranch({
            baseBranch: record.baseBranch,
            body: `Automated delivery for Orvilo task ${task.identifier}. This PR remains open while CI and review feedback are processed.`,
            headBranch: record.branch,
            repo,
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
          error:
            'Pull request required: push the delivery branch to GitHub before review can continue.',
        });
        result.paused.push(task.identifier);
        continue;
      }

      const snapshot = await getPullRequestReviewSnapshot(repo, prNumber, token, {
        baseBranch: record.baseBranch,
        headBranch: record.branch,
        sameRepository: true,
      });
      if (!snapshot) {
        await taskModel.update(task.id, {
          error:
            'GitHub PR identity or revision could not be verified; review remains blocked and will retry.',
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
          record: { ...record, prNumber },
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
        snapshot.mergeable === false ||
        snapshot.mergeableState === 'dirty' ||
        snapshot.mergeableState === 'behind';
      const failedThisHead =
        snapshot.checks.failed.length > 0 && context.lastFailedHeadSha !== snapshot.headSha;
      const conflictThisHead =
        needsConflictRepair && context.lastConflictHeadSha !== snapshot.headSha;
      const needsCorrection = newFeedback.length > 0 || failedThisHead || conflictThisHead;

      if (needsCorrection) {
        // Dispatch first. Only after TaskRunner accepted the corrective attempt
        // do we advance the dedupe cursor; otherwise a transient dispatch error
        // would permanently hide the CI failure/review comment.
        await taskModel.update(task.id, { error: null });
        await dispatchCorrective({ db, record, row, snapshot, task, workspaceId });
        await persistReviewContext(taskModel, task.id, {
          ...context,
          handledFeedbackIds: [...new Set([...(context.handledFeedbackIds ?? []), ...newFeedback])],
          lastConflictHeadSha: conflictThisHead ? snapshot.headSha : context.lastConflictHeadSha,
          lastFailedHeadSha: failedThisHead ? snapshot.headSha : context.lastFailedHeadSha,
          lastReviewedHeadSha: snapshot.headSha,
        });
        result.corrected.push(task.identifier);
        continue;
      }

      const reviewStillBlocking = !isRemotePrMergeReady(snapshot);
      if (reviewStillBlocking) {
        await taskModel.update(task.id, { error: null });
        result.waiting.push(task.identifier);
        continue;
      }

      const merge = await mergePullRequest({
        expectedHeadSha: snapshot.headSha,
        mergeMethod: 'squash',
        prNumber: snapshot.number,
        repo,
        token,
      });
      if (!merge.merged) {
        await persistReviewContext(taskModel, task.id, {
          ...context,
          lastMergeError: merge.message ?? 'GitHub rejected the merge request',
          lastReviewedHeadSha: snapshot.headSha,
        });
        await taskModel.update(task.id, {
          error: merge.message
            ? `Waiting to merge: ${merge.message}`
            : 'Waiting for GitHub merge gates.',
        });
        result.waiting.push(task.identifier);
        continue;
      }

      const confirmed = await getPullRequestReviewSnapshot(repo, snapshot.number, token, {
        baseBranch: snapshot.baseBranch,
        headBranch: snapshot.headBranch,
        headSha: snapshot.headSha,
        nodeId: snapshot.nodeId,
        repositoryId: snapshot.repositoryId,
        sameRepository: true,
      });
      if (!confirmed?.merged) {
        await taskModel.update(task.id, {
          error: 'GitHub accepted the merge request, but merge confirmation is pending.',
        });
        result.waiting.push(task.identifier);
        continue;
      }

      await markDeliveryMerged({
        db,
        record: { ...record, expectedHeadSha: snapshot.headSha, prNumber: snapshot.number },
        snapshot: confirmed,
        task,
        topicModel,
        workspaceId,
      });
      result.merged.push(task.identifier);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log('review sweep failed for %s — %s', task.identifier, message);
      await taskModel
        .update(task.id, { error: `PR review orchestration: ${message}` })
        .catch(() => null);
      result.waiting.push(task.identifier);
    }
  }

  return result;
};
