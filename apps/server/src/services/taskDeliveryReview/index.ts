import {
  cloudSandboxRepoPath,
  type TaskItem,
  type TaskTopicIntegration,
  type VerificationPollStage,
} from '@orvilo/types';
import debug from 'debug';
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';

import { AgentModel } from '@/database/models/agent';
import { TaskModel } from '@/database/models/task';
import { TaskTopicModel } from '@/database/models/taskTopic';
import { tasks } from '@/database/schemas/task';
import type { OrviloDatabase } from '@/database/type';
import {
  createPullRequestForBranch,
  findBranchPr,
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
/**
 * Consecutive remote-read failures a pending delivery may accumulate before it
 * stops waiting and goes to 'blocked' for human attention. Auth, permission
 * and quota failures do not self-heal inside the sweep, and each pass would
 * otherwise burn the sweep budget re-reading the same doomed credential.
 */
const MAX_VERIFICATION_POLL_FAILURES = 10;
const REVIEW_SCAN_LIMIT = 50;
// The sweep runs inside the 15-minute watchdog execution window alongside the
// heartbeat/cancellation scans. A sequential pass of GitHub reads (each with
// its own request timeout) must leave headroom for the rest of the watchdog,
// so the sweep stops taking new candidates once the budget is spent — the
// oldest-first ordering lets the next sweep resume where this one stopped.
const REVIEW_SWEEP_BUDGET_MS = 10 * 60 * 1000;

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
  task: TaskItem,
) => {
  // Pick the newest repository-bound delivery FIRST. Filtering by phase first
  // can resurrect an older pending delivery after its successor has already
  // merged, failed or started.
  const latest = [...rows]
    .filter((row) => row.topicId && row.integration?.repo)
    .sort((a, b) => b.seq - a.seq)[0];
  if (!latest?.topicId) return undefined;
  // Only the current execution generation owns a delivery. Rows stamped with
  // an older generation belong to a superseded run and must not steer this
  // run's review or completion.
  if (latest.executionGeneration !== task.executionGeneration) return undefined;
  const state = latest.integration?.state;
  if (state === 'verification_pending') return latest;
  // The merge proof can land while the completion update does not (a crash
  // between updateIntegration and updateStatus): an integrated row on an
  // uncompleted task retries the completion transition instead of stranding.
  if (state === 'integrated') return latest;
  // A repository-bound delivery whose run ended before its PR identity became
  // durable (e.g. deployed mid-flight) is adopted into review: the sweep
  // establishes the missing PR instead of dead-ending the task.
  if (
    !latest.integration?.prNumber &&
    (state === 'pending' ||
      state === 'merging' ||
      state === 'publish_failed' ||
      state === 'conflict')
  ) {
    return latest;
  }
  return undefined;
};

const allFeedbackIds = (snapshot: RemotePrReviewSnapshot): string[] => [
  ...snapshot.humanFeedbackIds,
  ...snapshot.requestedChangeReviewIds,
  ...snapshot.unresolvedThreadIds.map((id) => `thread:${id}`),
];

const getCredentialKey = async (
  db: OrviloDatabase,
  ownerId: string,
  task: TaskItem,
  workspaceId?: string,
): Promise<string> => {
  if (!task.assigneeAgentId) return 'github';
  const agent = await new AgentModel(db, ownerId, workspaceId)
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

/**
 * Bounded handling for "we cannot observe the remote truth" outcomes: a
 * missing branch/PR read, a snapshot that cannot be verified, a merge
 * decision or confirmation that comes back unreadable, or an exception thrown
 * mid-review. Each pass increments the failing `stage`'s counter on the
 * durable record (per-stage budgets — a healthy first snapshot must not
 * clear merge-boundary failures); reaching the cap parks the delivery at
 * 'blocked' with the counter map kept as evidence instead of waiting
 * silently forever — auth, permission and quota failures do not self-heal.
 */
/**
 * Mixed-version reader for the per-stage poll-failure counters. The map now
 * lives under `verificationPollFailureStages`; the legacy
 * `verificationPollFailures` key carried a bare number (pre-R07) or an
 * unversioned map (R07), so old rows still count correctly instead of being
 * silently dropped — and a rolled-back reader never sees a map under the
 * key it expects to be a number.
 */
const normalizedPollFailureStages = (
  record: TaskTopicIntegration,
): Partial<Record<VerificationPollStage, number>> | undefined => {
  if (record.verificationPollFailureStages) return record.verificationPollFailureStages;
  const legacy = record.verificationPollFailures;
  // The pre-map scalar normalizes to a 'sweep' bucket — the SAME shape the
  // SQL-side CAS guard normalizes it to, so comparisons stay consistent.
  if (typeof legacy === 'number') return { sweep: legacy };
  return legacy;
};

const noteVerificationPollFailure = async (params: {
  detail: string;
  record: TaskTopicIntegration;
  row: Awaited<ReturnType<TaskTopicModel['findByTaskId']>>[number];
  stage: VerificationPollStage;
  task: TaskItem;
  taskModel: TaskModel;
  topicModel: TaskTopicModel;
}): Promise<'blocked' | 'waiting'> => {
  const { detail, record, row, stage, task, taskModel, topicModel } = params;
  // A row with no topicId cannot be patched — the failure stays a waiting
  // outcome on the task's error field rather than a counter that cannot
  // persist.
  if (!row.topicId) {
    await taskModel.update(task.id, { error: detail });
    return 'waiting';
  }
  // A legacy scalar counter also bounds the failing stage — the scalar
  // counted any stage's failures, so it must not silently reset the budget
  // of whichever stage runs next.
  const legacyScalar =
    typeof record.verificationPollFailures === 'number' ? record.verificationPollFailures : 0;
  const normalized = normalizedPollFailureStages(record);
  const failures = Math.max(normalized?.[stage] ?? 0, legacyScalar) + 1;
  const lastError = `${detail} (${stage} poll ${failures}/${MAX_VERIFICATION_POLL_FAILURES})`;
  const next = { ...normalized, [stage]: failures };
  const persisted = await topicModel.updateIntegration(
    task.id,
    row.topicId,
    // The null patch on the legacy key removes it — old-shaped rows are
    // upgraded in place so no version ever reads both keys at once.
    failures >= MAX_VERIFICATION_POLL_FAILURES
      ? {
          lastError,
          lastErrorCode: 'remote_verification_unavailable',
          state: 'blocked',
          verificationPollFailures: null,
          verificationPollFailureStages: next,
        }
      : {
          lastError,
          verificationPollFailures: null,
          verificationPollFailureStages: next,
        },
    normalized ?? null,
  );
  // A concurrent pass already moved the counters — keep waiting; the next
  // sweep re-reads the fresh record rather than double-counting.
  if (!persisted) {
    await taskModel.update(task.id, { error: lastError });
    return 'waiting';
  }
  await taskModel.update(task.id, { error: lastError });
  return failures >= MAX_VERIFICATION_POLL_FAILURES ? 'blocked' : 'waiting';
};

/**
 * A successful read clears the budgets of every stage it proves healthy — a
 * stage that was skipped because durable identity already exists is also
 * cleared (valid stage advance). Bounded by CAS: if a concurrent pass moved
 * the counters, this pass keeps its stale view and defers to the next sweep.
 */
const clearVerificationPollStages = async (params: {
  record: TaskTopicIntegration;
  row: Awaited<ReturnType<TaskTopicModel['findByTaskId']>>[number];
  stages: VerificationPollStage[];
  task: TaskItem;
  topicModel: TaskTopicModel;
}): Promise<TaskTopicIntegration> => {
  const { record, row, stages, task, topicModel } = params;
  const failures = normalizedPollFailureStages(record);
  if (!row.topicId || !failures || !stages.some((stage) => failures[stage])) return record;
  const next = { ...failures };
  for (const stage of stages) delete next[stage];
  const persisted = await topicModel.updateIntegration(
    task.id,
    row.topicId,
    { verificationPollFailures: null, verificationPollFailureStages: next },
    failures,
  );
  return persisted
    ? {
        ...record,
        verificationPollFailures: undefined,
        verificationPollFailureStages: next,
      }
    : record;
};

const markDeliveryMerged = async (params: {
  db: OrviloDatabase;
  ownerId: string;
  record: TaskTopicIntegration;
  snapshot: RemotePrReviewSnapshot;
  task: TaskItem;
  topicModel: TaskTopicModel;
  workspaceId?: string;
}): Promise<void> => {
  const { db, ownerId, record, snapshot, task, topicModel, workspaceId } = params;
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

  await new TaskService(db, ownerId, workspaceId).updateStatus({
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
  db: OrviloDatabase;
  ownerId: string;
  record: TaskTopicIntegration;
  row: Awaited<ReturnType<TaskTopicModel['findByTaskId']>>[number];
  snapshot: RemotePrReviewSnapshot;
  task: TaskItem;
  workspaceId?: string;
}): Promise<void> => {
  const { db, ownerId, record, row, snapshot, task, workspaceId } = params;
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

  await new TaskRunnerService(db, ownerId, workspaceId).runTask({
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
  db: OrviloDatabase,
  ownerId: string,
  task: TaskItem,
  rows: Awaited<ReturnType<TaskTopicModel['findByTaskId']>>,
  workspaceId?: string,
): Promise<boolean> => {
  // A paused task can still have a live topic while cancellation settles.
  if (rows.some((row) => row.status === 'running')) return false;
  if (task.status === 'paused') return true;
  if (task.status !== 'running') return false;
  await new TaskService(db, ownerId, workspaceId).updateStatus({
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
  db: OrviloDatabase,
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

  // Prefilter to tasks that actually own a repository-bound delivery row in
  // the current generation. The bounded scan must not spend its limit on the
  // 50 oldest ordinary running/paused tasks while real deliveries wait.
  const candidates = await db
    .select()
    .from(tasks)
    .where(
      and(
        ...filters,
        sql`exists (
          select 1 from task_topics tt
          where tt.task_id = ${tasks.id}
            and tt.execution_generation = ${tasks.executionGeneration}
            and nullif(btrim(coalesce(tt.integration ->> 'repo', '')), '') is not null
            and tt.integration ->> 'state' in (
              'verification_pending',
              'integrated',
              'pending',
              'merging',
              'publish_failed',
              'conflict'
            )
        )`,
      ),
    )
    .orderBy(asc(tasks.updatedAt))
    .limit(REVIEW_SCAN_LIMIT);
  const result: TaskDeliveryReviewSweepResult = {
    checked: 0,
    corrected: [],
    merged: [],
    paused: [],
    waiting: [],
  };

  const deadline = Date.now() + REVIEW_SWEEP_BUDGET_MS;

  for (const task of candidates) {
    // Each candidate costs several sequential GitHub reads; once the sweep
    // budget is spent the remaining candidates defer to the next watchdog run
    // rather than being killed mid-request by the execution timeout.
    if (Date.now() >= deadline) break;
    // Ownerless rows cannot hold a verifiable delivery — the credential
    // lookup and every model below require a real user scope.
    const ownerId = task.createdByUserId;
    if (!ownerId) continue;
    const workspaceId = task.workspaceId ?? undefined;
    const topicModel = new TaskTopicModel(db, ownerId, workspaceId);
    const taskModel = new TaskModel(db, ownerId, workspaceId);
    const rows = await topicModel.findByTaskId(task.id);
    const row = activeDeliveryRow(rows, task);
    if (!row?.topicId || !row.integration?.repo) continue;
    const record = row.integration;
    const repo = row.integration.repo;
    result.checked += 1;

    // Review snapshots must describe an immutable candidate. If any task run
    // is still live, do not read/act on GitHub review state yet.
    if (rows.some((candidate) => candidate.status === 'running')) {
      result.waiting.push(task.identifier);
      continue;
    }

    try {
      // A delivery that already produced its merge proof retries the
      // completion transition. The database gate re-verifies that the merged
      // PR belongs to the current execution generation before letting it
      // through, so a stale row cannot complete a rerun task.
      if (record.state === 'integrated') {
        await new TaskService(db, ownerId, workspaceId).updateStatus({
          id: task.id,
          status: 'completed',
        });
        result.merged.push(task.identifier);
        continue;
      }

      const credKey = await getCredentialKey(db, ownerId, task, workspaceId);
      const token = await resolveGithubAccessToken({
        credKey,
        db,
        userId: ownerId,
        workspaceId,
      });

      // A task is not in delivery review until the remote branch and canonical
      // PR identity are durable. This also recovers the cross-system half-fail
      // where GitHub created the PR but the database write was interrupted.
      let deliveryRecord = record;
      let prNumber = record.prNumber;
      let prUrl = record.prUrl;
      if (!prNumber) {
        const remoteHead = await getRemoteBranchSha(repo, record.branch, token);
        if (!remoteHead) {
          const outcome = await noteVerificationPollFailure({
            detail: 'Delivery branch is not published to GitHub yet; review has not started.',
            record,
            row,
            stage: 'branch_read',
            task,
            taskModel,
            topicModel,
          });
          result[outcome === 'blocked' ? 'paused' : 'waiting'].push(task.identifier);
          continue;
        }
        const existing = await findBranchPr(repo, record.branch, record.baseBranch, token);
        const bound =
          existing ??
          (await createPullRequestForBranch({
            baseBranch: record.baseBranch,
            body: `Automated delivery for Orvilo task ${task.identifier}. This PR remains open while CI and review feedback are processed.`,
            headBranch: record.branch,
            repo,
            title: `${task.identifier}: ${task.name || task.instruction.slice(0, 80)}`,
            token,
          }));
        prNumber = bound?.number;
        prUrl = bound?.url;
        if (prNumber && prUrl) {
          const persisted = await topicModel.updateIntegration(task.id, row.topicId, {
            expectedHeadSha: remoteHead,
            prNumber,
            prUrl,
          });
          if (!persisted) throw new Error('Pull request identity could not be persisted');
          deliveryRecord = { ...record, expectedHeadSha: remoteHead, prNumber, prUrl };
        }
      }

      if (!prNumber) {
        const outcome = await noteVerificationPollFailure({
          detail: 'Pull request could not be established; review has not started.',
          record,
          row,
          stage: 'pr_establish',
          task,
          taskModel,
          topicModel,
        });
        result[outcome === 'blocked' ? 'paused' : 'waiting'].push(task.identifier);
        continue;
      }

      const snapshot = await getPullRequestReviewSnapshot(repo, prNumber, token, {
        baseBranch: record.baseBranch,
        headBranch: record.branch,
        sameRepository: true,
      });
      if (!snapshot) {
        const outcome = await noteVerificationPollFailure({
          detail:
            'GitHub PR identity or revision could not be verified; review remains blocked and will retry.',
          record,
          row,
          stage: 'snapshot',
          task,
          taskModel,
          topicModel,
        });
        result[outcome === 'blocked' ? 'paused' : 'waiting'].push(task.identifier);
        continue;
      }
      // Reaching a verified snapshot proves the pre-merge read chain healthy —
      // clear those stages' budgets. Merge-boundary stages keep theirs.
      deliveryRecord = await clearVerificationPollStages({
        record: deliveryRecord,
        row,
        stages: ['branch_read', 'pr_establish', 'snapshot'],
        task,
        topicModel,
      });

      // Read the canonical PR even when its head moved, then reject the moved
      // revision explicitly. Returning generic "unavailable" would hide a
      // manually advanced or otherwise unaccepted delivery head.
      if (deliveryRecord.expectedHeadSha && snapshot.headSha !== deliveryRecord.expectedHeadSha) {
        await taskModel.update(task.id, {
          error: `Pull request head ${snapshot.headSha} does not match accepted delivery ${deliveryRecord.expectedHeadSha}.`,
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

      if (!deliveryRecord.expectedHeadSha) {
        const persisted = await topicModel.updateIntegration(task.id, row.topicId, {
          expectedBaseSha: snapshot.baseSha,
          expectedHeadSha: snapshot.headSha,
          prNumber: snapshot.number,
          prUrl: snapshot.url,
        });
        if (!persisted) throw new Error('Pull request identity could not be persisted');
        deliveryRecord = {
          ...deliveryRecord,
          expectedBaseSha: snapshot.baseSha,
          expectedHeadSha: snapshot.headSha,
          prNumber: snapshot.number,
          prUrl: snapshot.url,
        };
      }

      // Only now does the task cross the user-visible Pending Review boundary.
      // If a run is still live, keep waiting rather than reviewing mutable code.
      if (!(await ensureReviewTaskPaused(db, ownerId, task, rows, workspaceId))) {
        result.waiting.push(task.identifier);
        continue;
      }

      if (snapshot.merged) {
        await markDeliveryMerged({
          db,
          ownerId,
          record: { ...deliveryRecord, prNumber },
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
        await dispatchCorrective({
          db,
          ownerId,
          record: deliveryRecord,
          row,
          snapshot,
          task,
          workspaceId,
        });
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

      // Fence the merge against the CURRENT execution contract: the task row
      // read at scan time may be stale — a restart, cancellation or deletion
      // since then means this snapshot no longer owns the outcome.
      const fresh = await taskModel.findById(task.id);
      if (
        !fresh ||
        fresh.isDeleted === true ||
        fresh.executionGeneration !== row.executionGeneration ||
        (fresh.status !== 'paused' && fresh.status !== 'running')
      ) {
        result.waiting.push(task.identifier);
        continue;
      }

      // CI and review state were read earlier in this sweep; re-read the
      // decision at the merge boundary so a late-registered pending check or
      // a new blocking review cannot ride a stale green verdict into the
      // merge. The expected identity pins the read to the accepted revision.
      const decision = await getPullRequestReviewSnapshot(repo, snapshot.number, token, {
        baseBranch: snapshot.baseBranch,
        headBranch: snapshot.headBranch,
        headSha: snapshot.headSha,
        nodeId: snapshot.nodeId,
        repositoryId: snapshot.repositoryId,
        sameRepository: true,
      });
      if (!decision) {
        const outcome = await noteVerificationPollFailure({
          detail:
            'GitHub PR state could not be re-verified at the merge boundary; the next sweep will retry.',
          record: deliveryRecord,
          row,
          stage: 'merge_decision',
          task,
          taskModel,
          topicModel,
        });
        result[outcome === 'blocked' ? 'paused' : 'waiting'].push(task.identifier);
        continue;
      }
      deliveryRecord = await clearVerificationPollStages({
        record: deliveryRecord,
        row,
        stages: ['merge_decision'],
        task,
        topicModel,
      });
      if (decision.merged) {
        await markDeliveryMerged({
          db,
          ownerId,
          record: { ...deliveryRecord, prNumber: decision.number },
          snapshot: decision,
          task,
          topicModel,
          workspaceId,
        });
        result.merged.push(task.identifier);
        continue;
      }
      if (!decision.open || !isRemotePrMergeReady(decision)) {
        result.waiting.push(task.identifier);
        continue;
      }

      // A merge GitHub already accepted must not be re-issued — a lost
      // confirmation would otherwise double-request the merge. The durable
      // `mergeIssuedAt` intent is claimed BEFORE the remote call via CAS: a
      // pass that loses the claim never issues a mutation, and a lost merge
      // acknowledgement leaves the marker persisted so the next sweep
      // reconciles by re-reading the merged state only.
      if (!deliveryRecord.mergeIssuedAt) {
        const intentIssuedAt = new Date().toISOString();
        const claimed = await topicModel.updateIntegration(
          task.id,
          row.topicId,
          { mergeIssuedAt: intentIssuedAt },
          undefined,
          null,
        );
        if (!claimed) {
          // Another sweep owns the intent (or the record moved) — defer to it.
          result.waiting.push(task.identifier);
          continue;
        }
        deliveryRecord = { ...deliveryRecord, mergeIssuedAt: intentIssuedAt };
        let merge: Awaited<ReturnType<typeof mergePullRequest>>;
        try {
          merge = await mergePullRequest({
            expectedHeadSha: decision.headSha,
            mergeMethod: 'squash',
            prNumber: snapshot.number,
            repo,
            token,
          });
        } catch (error) {
          // Unknown outcome with a persisted intent — the next sweep
          // reconciles by reading merged state, never by re-issuing.
          log(
            'merge request outcome unknown for %s — intent persisted — %O',
            task.identifier,
            error,
          );
          const outcome = await noteVerificationPollFailure({
            detail: `Merge request acknowledgement lost: ${error instanceof Error ? error.message : String(error)}`,
            record: deliveryRecord,
            row,
            stage: 'merge_decision',
            task,
            taskModel,
            topicModel,
          });
          result[outcome === 'blocked' ? 'paused' : 'waiting'].push(task.identifier);
          continue;
        }
        if (!merge.merged) {
          // Explicit refusal — the intent is released (CAS back to unset) so
          // the next sweep may retry once remote gates allow the merge again.
          const released = await topicModel.updateIntegration(
            task.id,
            row.topicId,
            { mergeIssuedAt: null },
            undefined,
            intentIssuedAt,
          );
          if (!released) {
            log(
              'merge-intent release lost its CAS for %s — leaving marker for reconcile path',
              task.identifier,
            );
          } else {
            deliveryRecord = { ...deliveryRecord, mergeIssuedAt: undefined };
          }
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
        const outcome = await noteVerificationPollFailure({
          detail: 'GitHub accepted the merge request, but merge confirmation is pending.',
          record: deliveryRecord,
          row,
          stage: 'merge_confirm',
          task,
          taskModel,
          topicModel,
        });
        result[outcome === 'blocked' ? 'paused' : 'waiting'].push(task.identifier);
        continue;
      }
      deliveryRecord = await clearVerificationPollStages({
        record: deliveryRecord,
        row,
        stages: ['merge_confirm'],
        task,
        topicModel,
      });

      await markDeliveryMerged({
        db,
        ownerId,
        record: { ...deliveryRecord, expectedHeadSha: snapshot.headSha, prNumber: snapshot.number },
        snapshot: confirmed,
        task,
        topicModel,
        workspaceId,
      });
      result.merged.push(task.identifier);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log('review sweep failed for %s — %s', task.identifier, message);
      const outcome = await noteVerificationPollFailure({
        detail: `PR review orchestration: ${message}`,
        record,
        row,
        stage: 'sweep',
        task,
        taskModel,
        topicModel,
      }).catch(() => 'waiting' as const);
      result[outcome === 'blocked' ? 'paused' : 'waiting'].push(task.identifier);
    }
  }

  return result;
};
