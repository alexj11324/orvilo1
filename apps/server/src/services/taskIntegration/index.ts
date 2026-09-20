import { randomUUID } from 'node:crypto';

import type { IntegrationLeasePhase, TaskItem, TaskTopicIntegration } from '@orvilo/types';
import { cloudSandboxRepoPath, deriveWorktreePath } from '@orvilo/types';
import debug from 'debug';

import { AgentModel } from '@/database/models/agent';
import { IntegrationLeaseModel } from '@/database/models/integrationLease';
import { TaskModel } from '@/database/models/task';
import { TaskDispatchModel } from '@/database/models/taskDispatch';
import { TaskTopicModel } from '@/database/models/taskTopic';
import { VerifyRunModel } from '@/database/models/verifyRun';
import type { IntegrationLeaseItem } from '@/database/schemas';
import type { TaskTopicItem } from '@/database/schemas/task';
import type { OrviloDatabase } from '@/database/type';
import { deviceGateway } from '@/server/services/deviceGateway';
import {
  findBranchPr,
  getRemoteBranchSha,
  isBranchMergedInto,
  parseGithubRepo,
  resolveGithubAccessToken,
} from '@/server/services/githubRepo';
import { TaskRunnerService } from '@/server/services/taskRunner';
import { taskRunIdempotencyKey } from '@/server/services/taskRunner/idempotency';
import { TaskWorkspaceService } from '@/server/services/taskWorkspace';
import { runVerifyOnCompletion } from '@/server/services/verify';
import { after } from '@/server/utils/scheduleAfterResponse';

const log = debug('task-integration');

/** Corrective merge runs dispatched per task run before the task blocks. */
const MAX_CORRECTIVE_ATTEMPTS = 3;
const INTEGRATION_CLAIM_TTL_MS = 15 * 60 * 1000;
/**
 * Repo/ref lease pacing. The TTL bounds each heartbeat window — a holder that
 * stops renewing becomes stealable; WAIT bounds how long a waiter polls inline
 * before deferring itself; DEFER is the re-entry delay. None of these hold a
 * database connection while waiting (F03).
 */
const REPO_REF_LEASE_TTL_MS = 60 * 1000;
const REPO_REF_LEASE_WAIT_MS = 2 * 60 * 1000;
const REPO_REF_LEASE_POLL_MS = 750;
const REPO_REF_LEASE_DEFER_MS = 5 * 1000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The lease was stolen or expired underneath the holder — stop, don't write. */
class RepoRefLeaseLostError extends Error {
  constructor(key: string) {
    super(`repo/ref integration lease lost: ${key}`);
    this.name = 'RepoRefLeaseLostError';
  }
}

/**
 * Handle handed to the lease-protected section. `assert` renews the deadline
 * and proves ownership in one short statement — every remote side effect
 * calls it immediately before issuing the write so a stolen lease can never
 * double-publish.
 */
interface RepoRefLeaseHandle {
  assert: (phase: IntegrationLeasePhase) => Promise<void>;
  id: string;
  /** Last mutation phase asserted on this handle ('claimed' = none so far). */
  phase: IntegrationLeasePhase;
}

/** Lease pacing knobs — tests inject smaller windows; production uses defaults. */
interface RepoRefLeasePacing {
  deferMs: number;
  pollMs: number;
  ttlMs: number;
  waitMs: number;
}
/** Push rejections that mean the recorded merge commit's base moved. */
const NON_FAST_FORWARD_PUSH = /non-fast-forward|fetch first|stale info|\[rejected\]/i;

/**
 * Re-baselining must never erase provenance: when a check advances
 * `expectedBaseSha` past the recorded value, the superseded commit is kept on
 * `baseShaHistory` (oldest first) so a delivery stays traceable to the base it
 * was originally verified against.
 */
const withBaseShaHistory = (
  patch: Partial<TaskTopicIntegration>,
  record: TaskTopicIntegration,
): Partial<TaskTopicIntegration> => {
  if (!patch.expectedBaseSha || patch.expectedBaseSha === record.expectedBaseSha) return patch;
  const history = [...(record.baseShaHistory ?? [])];
  if (record.expectedBaseSha && !history.some((entry) => entry.sha === record.expectedBaseSha)) {
    history.push({ observedAt: new Date().toISOString(), sha: record.expectedBaseSha });
  }
  return history.length > 0 ? { ...patch, baseShaHistory: history } : patch;
};

/**
 * What the integration gate concluded for a completed run:
 * - 'settled' — nothing pending (unprovisioned run) or the branch merged/pushed;
 *   the lifecycle may proceed to its normal post-run transition.
 * - 'hold' — a merge conflict keeps the run's work outstanding and a corrective
 *   run is in flight; the task stays 'running' and the caller returns early.
 * - 'blocked' — corrective attempts exhausted or the device path failed; the
 *   caller parks the task 'paused' with the recorded error.
 */
export type IntegrationOutcome = 'settled' | 'hold' | 'blocked' | 'stale';

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
  private db: OrviloDatabase;
  private leaseModel: IntegrationLeaseModel;
  private pacing: RepoRefLeasePacing;
  private taskModel: TaskModel;
  private taskDispatchModel: TaskDispatchModel;
  private taskTopicModel: TaskTopicModel;
  private userId: string;
  private workspaceId?: string;
  private workspaceService: TaskWorkspaceService;

  constructor(
    db: OrviloDatabase,
    userId: string,
    workspaceId?: string,
    pacing?: Partial<RepoRefLeasePacing>,
  ) {
    this.db = db;
    this.userId = userId;
    this.workspaceId = workspaceId;
    this.leaseModel = new IntegrationLeaseModel(db);
    this.pacing = {
      deferMs: pacing?.deferMs ?? REPO_REF_LEASE_DEFER_MS,
      pollMs: pacing?.pollMs ?? REPO_REF_LEASE_POLL_MS,
      ttlMs: pacing?.ttlMs ?? REPO_REF_LEASE_TTL_MS,
      waitMs: pacing?.waitMs ?? REPO_REF_LEASE_WAIT_MS,
    };
    this.taskModel = new TaskModel(db, userId, workspaceId);
    this.taskDispatchModel = new TaskDispatchModel(db, workspaceId);
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
    const updated = await this.taskTopicModel.updateIntegration(
      task.id,
      topicId,
      withBaseShaHistory(
        {
          expectedBaseSha: check.expectedBaseSha,
          expectedHeadSha: check.expectedHeadSha,
          lastError,
          prNumber: check.prNumber,
          prUrl: check.prUrl,
          ...(complete ? {} : { state: 'blocked' as const }),
        },
        record,
      ),
    );
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
    const { taskTopicId } = params;

    const initialTopic = await this.taskTopicModel.findByTopicId(taskTopicId);
    const initialRecord = initialTopic?.integration;
    const initialStateIsProcessable =
      !!initialRecord &&
      (initialRecord.state === 'publish_failed' ||
        initialRecord.state === 'verification_pending' ||
        initialRecord.state === 'conflict' ||
        initialRecord.state === 'merging' ||
        (initialRecord.role === 'task' && initialRecord.state === 'pending'));
    if (!initialTopic?.topicId || !initialStateIsProcessable) {
      return 'settled';
    }

    // Completion callbacks may carry an old task snapshot. Re-read the task,
    // topic and dispatch owner before any merge, remote check, or success fact.
    const owner = await this.resolveCurrentOwner(params.task.id, taskTopicId, initialTopic);
    if (!owner) {
      await this.taskTopicModel.updateIntegration(params.task.id, taskTopicId, {
        lastError: 'Integration result is stale or no longer owns the task dispatch',
        state: 'skipped',
      });
      return 'stale';
    }
    const task = owner.task;

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
      const taskTopic = owner.topic;
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
        record.state === 'integrated' ||
        record.state === 'skipped'
      ) {
        return 'settled';
      }

      const topicId = taskTopic.topicId;
      const relatedRows =
        record.role === 'integrate' || !record.integrationOwnerTopicId
          ? await this.taskTopicModel.findByTaskId(task.id)
          : undefined;

      // Once a corrective row has spawned a successor, its completion is
      // historical. Queue/webhook redelivery must leave the active child in
      // charge instead of finalizing or redispatching the parent again.
      if (
        record.role === 'integrate' &&
        this.hasCorrectiveSuccessor(topicId, record, relatedRows ?? [])
      ) {
        return 'hold';
      }
      if (record.state === 'blocked') return 'blocked';

      // A task row in conflict already has a corrective run in flight. A
      // repeated completion callback must not dispatch another one.
      if (record.role === 'task' && record.state === 'conflict') {
        return 'hold';
      }
      const processable =
        record.state === 'publish_failed' ||
        record.state === 'verification_pending' ||
        (record.role === 'task'
          ? record.state === 'pending' || record.state === 'merging'
          : record.state === 'merging');
      if (!processable) return 'blocked';

      const integrationOwnerTopicId =
        record.integrationOwnerTopicId ??
        this.resolveIntegrationOwnerTopicId(topicId, record, relatedRows ?? []);
      const activeRecord =
        record.integrationOwnerTopicId === integrationOwnerTopicId
          ? record
          : { ...record, integrationOwnerTopicId };
      const claimToken = randomUUID();
      const claimed = await this.taskTopicModel.claimIntegration(
        task.id,
        topicId,
        activeRecord.state,
        claimToken,
        new Date(Date.now() - INTEGRATION_CLAIM_TTL_MS),
        integrationOwnerTopicId,
      );
      if (!claimed) {
        const latest = await this.taskTopicModel.findByTopicId(topicId);
        return latest?.integration?.state === 'integrated' ||
          latest?.integration?.state === 'skipped'
          ? 'settled'
          : 'hold';
      }

      let outcome: IntegrationOutcome;
      try {
        // Serializing per repo/ref keeps engineer runs parallel while
        // integrations onto the same base queue up: the next merge
        // re-baselines onto the ref this section just published instead of
        // producing an unpublishable non-fast-forward commit.
        outcome = await this.withRepoRefLease(
          activeRecord,
          { params, taskId: task.id, topicId },
          async (lease) => {
            // Close the query/claim race: a child may be inserted after the
            // first successor read but before this invocation acquires the
            // chain lease.
            if (
              activeRecord.role === 'integrate' &&
              this.hasCorrectiveSuccessor(
                topicId,
                activeRecord,
                await this.taskTopicModel.findByTaskId(task.id),
              )
            ) {
              return 'hold';
            }
            return activeRecord.state === 'publish_failed'
              ? await this.retryLocalPublish(
                  task,
                  topicId,
                  activeRecord,
                  params.completionReservationId,
                  lease,
                )
              : activeRecord.role === 'task'
                ? activeRecord.state === 'merging'
                  ? activeRecord.repo
                    ? await this.dispatchCorrective(
                        task,
                        topicId,
                        activeRecord,
                        undefined,
                        params.completionReservationId,
                        lease,
                      )
                    : activeRecord.integratedSha
                      ? await this.publishAndCleanup(
                          task.id,
                          activeRecord,
                          activeRecord.integratedSha,
                          lease,
                        )
                      : 'blocked'
                  : activeRecord.repo
                    ? await this.integrateRemoteRun(
                        task,
                        topicId,
                        activeRecord,
                        params.completionReservationId,
                        lease,
                      )
                    : await this.integrateTaskRun(
                        task,
                        topicId,
                        activeRecord,
                        params.completionReservationId,
                        lease,
                      )
                : activeRecord.repo
                  ? await this.finalizeRemoteCorrectiveRun(
                      task,
                      topicId,
                      activeRecord,
                      params.completionReservationId,
                      lease,
                    )
                  : await this.finalizeCorrectiveRun(
                      task,
                      topicId,
                      activeRecord,
                      params.completionReservationId,
                      lease,
                    );
          },
        );
      } finally {
        await this.taskTopicModel
          .releaseIntegration(task.id, integrationOwnerTopicId, claimToken)
          .catch((error) =>
            log(
              'integrateOnComplete: failed to release claim for %s/%s — %O',
              task.id,
              topicId,
              error,
            ),
          );
      }
      const latest = await this.taskTopicModel.findByTopicId(topicId).catch((error) => {
        log(
          'integrateOnComplete: failed to refresh integration state for %s/%s — %O',
          task.id,
          topicId,
          error,
        );
        return undefined;
      });
      // A terminal 'blocked' abandons the merge pipeline: tear down the run's
      // task worktree and its topic-owned integration worktree so neither leaks.
      // A successful publish also leaves no work for either checkout. Cleanup
      // runs only after releasing this invocation's lease so it atomically
      // excludes concurrent completion/retry work.
      if (outcome === 'blocked') {
        await this.blockRelated(task.id, record.branch);
      }
      if (outcome === 'blocked' || latest?.integration?.state === 'integrated') {
        await this.cleanupTaskWorktrees(task.id);
      }
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

  /**
   * Serialize the merge+publish critical section per target repo/ref (R02).
   *
   * The lease is a durable `integration_leases` row, not a held transaction:
   * claim and fencing are single short statements, so neither the holder nor
   * a queued waiter pins a pool connection across device/GitHub I/O. Every
   * remote side effect calls `lease.assert(phase)` immediately beforehand —
   * the same statement renews the deadline and re-proves ownership, so a
   * stolen or expired lease can never issue another write.
   *
   * Losing the DB connection mid-flight does not undo remote state: a holder
   * that crashes leaves an expired, unreleased row and a mutation-phase
   * failure leaves `outcomeUnknown`; either way the next claimant reconciles
   * by construction — the run body's verify/merge-status reads come before
   * any write, and a repeat push of the same SHA is a no-op.
   *
   * Waiters poll connection-free and defer one re-entry past the wait budget
   * instead of dying with the request, so a busy ref still settles.
   */
  private async withRepoRefLease(
    record: TaskTopicIntegration,
    ctx: {
      params: {
        completionReservationId?: string;
        task: TaskItem;
        taskTopicId: string;
        verifyOperationId?: string;
      };
      taskId: string;
      topicId: string;
    },
    run: (lease: RepoRefLeaseHandle) => Promise<IntegrationOutcome>,
  ): Promise<IntegrationOutcome> {
    const target = record.repo ?? `${record.deviceId}:${record.repoPath}`;
    const key = `${this.workspaceId ?? 'global'}:${target}#${record.baseBranch}`;
    const ownerToken = randomUUID();
    const deadline = () => new Date(Date.now() + this.pacing.ttlMs);
    const waitUntil = Date.now() + this.pacing.waitMs;

    let lease: IntegrationLeaseItem | undefined;
    let prior: IntegrationLeaseItem | undefined;
    for (;;) {
      ({ lease, prior } = await this.leaseModel.acquire({
        deadline: deadline(),
        expectedBaseSha: record.expectedBaseSha,
        expectedHeadSha: record.expectedHeadSha,
        key,
        ownerTaskId: ctx.taskId,
        ownerToken,
        ownerTopicId: ctx.topicId,
        ref: record.baseBranch,
        target,
        workspaceId: this.workspaceId,
      }));
      if (lease) break;
      if (Date.now() >= waitUntil) {
        // Re-enter after a short defer instead of dying with this completion
        // callback — the record's own claim/state checks still gate the retry.
        log(
          'repo/ref lease %s held past %dms — deferring %s',
          key,
          this.pacing.waitMs,
          ctx.topicId,
        );
        after(async () => {
          await sleep(this.pacing.deferMs);
          await this.integrateOnComplete({
            completionReservationId: ctx.params.completionReservationId,
            task: ctx.params.task,
            taskTopicId: ctx.params.taskTopicId,
            verifyOperationId: ctx.params.verifyOperationId,
          });
        });
        return 'hold';
      }
      await sleep(this.pacing.pollMs);
    }

    if (prior && (prior.outcomeUnknown || !prior.releasedAt)) {
      log(
        'repo/ref lease %s reclaimed from an ambiguous owner (phase=%s, outcomeUnknown=%s) — run body reconciles before writing',
        key,
        prior.phase,
        prior.outcomeUnknown,
      );
    }

    const leaseId = lease.id;
    const handle: RepoRefLeaseHandle = {
      assert: async (phase) => {
        const ok = await this.leaseModel.renew(leaseId, ownerToken, deadline(), phase);
        if (!ok) throw new RepoRefLeaseLostError(key);
        handle.phase = phase;
      },
      id: leaseId,
      phase: 'claimed',
    };
    let ambiguousOutcome = false;

    try {
      // The queue wait may have superseded this owner — re-verify the dispatch
      // fence before running, so a callback that lost its window never writes.
      if (!(await this.resolveCurrentOwner(ctx.taskId, ctx.topicId))) {
        return 'stale';
      }
      return await run(handle);
    } catch (error) {
      if (error instanceof RepoRefLeaseLostError) {
        log('repo/ref lease %s lost mid-run for %s — stopping without writes', key, ctx.topicId);
        return 'stale';
      }
      // A mutation-phase failure leaves the remote outcome ambiguous: keep the
      // row with outcomeUnknown so the next claimant reconciles first.
      ambiguousOutcome = handle.phase !== 'claimed';
      if (ambiguousOutcome) {
        await this.leaseModel
          .markOutcomeUnknown(leaseId, ownerToken)
          .catch((e) => log('repo/ref lease %s outcome_unknown mark failed — %O', key, e));
      }
      throw error;
    } finally {
      // Skip the clean release when outcome_unknown was just recorded — the
      // flag must survive for the next claimant; the row frees on deadline.
      if (!ambiguousOutcome) {
        await this.leaseModel
          .release(leaseId, ownerToken)
          .catch((e) => log('repo/ref lease %s release failed — expires at deadline: %O', key, e));
      }
    }
  }

  /** Resolve the task/topic dispatch owner before accepting an integration result. */
  private async resolveCurrentOwner(
    taskId: string,
    topicId: string,
    topicSnapshot?: TaskTopicItem | null,
  ): Promise<{ task: TaskItem; topic: TaskTopicItem } | null> {
    const topic = topicSnapshot ?? (await this.taskTopicModel.findByTopicId(topicId));
    if (!topic || topic.taskId !== taskId || !topic.dispatchId) return null;

    const [task, dispatch] = await Promise.all([
      this.taskModel.findById(taskId),
      this.taskDispatchModel.findById(topic.dispatchId),
    ]);
    if (!task || !dispatch || dispatch.taskId !== taskId) return null;

    const ownsCurrentDispatch =
      dispatch.phase === 'succeeded' &&
      task.executionGeneration === dispatch.generation &&
      topic.executionGeneration === dispatch.generation &&
      topic.dispatchFence === dispatch.fence &&
      topic.taskRevision === dispatch.taskRevision &&
      topic.requirementRevision === dispatch.requirementRevision &&
      topic.policyRevision === dispatch.policyRevision &&
      task.requirementRevision === dispatch.requirementRevision &&
      task.policyRevision === dispatch.policyRevision &&
      task.assigneeAgentId === dispatch.agentId;

    return ownsCurrentDispatch ? { task, topic } : null;
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
   * clone lived inside an ephemeral sandbox. Integration worktrees are scoped
   * to one owning topic, so both the task checkout and its integration checkout
   * can be reclaimed without affecting another task.
   *
   * Never throws. Returns false when an active owner, lease contention, or a
   * removal failure leaves durable worktree metadata for a later retry. Delete
   * callers use that result to retain the task rows; cancel/status callers can
   * keep cleanup best-effort.
   */
  async snapshotTaskWorktrees(taskId: string) {
    return this.taskTopicModel.findByTaskId(taskId);
  }

  async cleanupTaskWorktrees(
    taskId: string,
    snapshot?: Awaited<ReturnType<TaskTopicModel['findByTaskId']>>,
  ): Promise<boolean> {
    const cleanupClaims = new Map<string, string>();
    let cleanupComplete = true;
    const fromSnapshot = snapshot !== undefined;
    try {
      const rows = snapshot ?? (await this.taskTopicModel.findByTaskId(taskId));
      const candidates: {
        integrationPaths: string[];
        taskPaths: string[];
        topicId: string;
      }[] = [];
      const removals = new Map<string, { deviceId: string; force: boolean; repoPath: string }>();
      const rowsByTopicId = new Map(
        rows.flatMap((row) => (row.topicId ? [[row.topicId, row] as const] : [])),
      );
      const activeOwnerTopicIds = new Set(
        rows.flatMap((row) =>
          row.status === 'running' && row.topicId
            ? [row.integration?.integrationOwnerTopicId ?? row.topicId]
            : [],
        ),
      );

      for (const row of rows) {
        const record = row.integration;
        if (!row.topicId || !record || record.repo) continue;
        if (!record.deviceId || !record.repoPath) continue;
        const taskPaths = [record.role === 'task' ? record.worktreePath : undefined].filter(
          (path): path is string =>
            !!path && path !== record.repoPath && record.worktreeCleaned !== true,
        );
        const legacySharedIntegrationPath = deriveWorktreePath(
          record.repoPath,
          `integration-${record.baseBranch.replaceAll('/', '-')}`,
        );
        if (
          record.integrationWorktreePath === legacySharedIntegrationPath &&
          record.integrationWorktreeCleaned !== true
        ) {
          // This pre-topic ownership path may still be shared by another run.
          // Preserve both the checkout and its metadata rather than reporting a
          // deletion-safe cleanup that would orphan the shared directory.
          cleanupComplete = false;
        }
        const integrationPaths = [record.integrationWorktreePath].filter(
          (path): path is string =>
            !!path &&
            path !== record.repoPath &&
            path !== legacySharedIntegrationPath &&
            // Records created before topic-owned integration worktrees used a
            // shared `integration-<base>` path. A later claim can backfill an
            // owner marker onto that row, so the path itself is the durable
            // signal that another in-flight task may still be using it.
            (fromSnapshot || !!record.integrationOwnerTopicId) &&
            record.integrationWorktreeCleaned !== true,
        );
        const paths = [...new Set([...taskPaths, ...integrationPaths])];
        if (paths.length === 0) continue;
        const ownerTopicId = record.integrationOwnerTopicId ?? row.topicId;
        if (activeOwnerTopicIds.has(ownerTopicId)) {
          cleanupComplete = false;
          continue;
        }

        if (!fromSnapshot && !cleanupClaims.has(ownerTopicId)) {
          const ownerRecord = rowsByTopicId.get(ownerTopicId)?.integration;
          if (!ownerRecord) {
            cleanupComplete = false;
            continue;
          }
          const cleanupToken = randomUUID();
          const claimed = await this.taskTopicModel.claimIntegration(
            taskId,
            ownerTopicId,
            ownerRecord.state,
            cleanupToken,
            new Date(Date.now() - INTEGRATION_CLAIM_TTL_MS),
          );
          if (!claimed) {
            cleanupComplete = false;
            continue;
          }
          cleanupClaims.set(ownerTopicId, cleanupToken);
        }

        candidates.push({ integrationPaths, taskPaths, topicId: row.topicId });
        for (const worktreePath of paths) {
          const existing = removals.get(worktreePath);
          removals.set(worktreePath, {
            deviceId: record.deviceId,
            // A blocked merge can leave its system-owned integration checkout
            // dirty. Task worktrees remain non-forced because they may contain
            // user-authored changes that were never part of integration. The
            // owner lease acquired above excludes active retries while a forced
            // integration-worktree removal is in progress.
            force: (existing?.force ?? false) || integrationPaths.includes(worktreePath),
            repoPath: record.repoPath,
          });
        }
      }
      if (candidates.length === 0) return cleanupComplete;

      const removed = new Map<string, boolean>();
      for (const [worktreePath, target] of removals) {
        const result = await deviceGateway.removeGitWorktree({
          deviceId: target.deviceId,
          path: target.repoPath,
          userId: this.userId,
          workspaceId: this.workspaceId,
          worktreePath,
          force: target.force,
        });
        removed.set(worktreePath, result.success);
        if (!result.success) {
          cleanupComplete = false;
          log(
            'cleanupTaskWorktrees: remove failed for task %s path %s — %s',
            taskId,
            worktreePath,
            result.error,
          );
        }
      }

      if (fromSnapshot) return cleanupComplete;

      for (const { integrationPaths, taskPaths, topicId } of candidates) {
        await this.taskTopicModel
          .updateIntegration(taskId, topicId, {
            ...(integrationPaths.length > 0
              ? {
                  integrationWorktreeCleaned: integrationPaths.every(
                    (path) => removed.get(path) === true,
                  ),
                }
              : {}),
            ...(taskPaths.length > 0
              ? { worktreeCleaned: taskPaths.every((path) => removed.get(path) === true) }
              : {}),
          })
          .catch((error) => {
            cleanupComplete = false;
            log('cleanupTaskWorktrees: flag update failed for %s/%s — %O', taskId, topicId, error);
          });
      }
      return cleanupComplete;
    } catch (error) {
      log('cleanupTaskWorktrees: failed for task %s — %O', taskId, error);
      return false;
    } finally {
      await Promise.allSettled(
        [...cleanupClaims].map(([topicId, token]) =>
          this.taskTopicModel.releaseIntegration(taskId, topicId, token),
        ),
      );
    }
  }

  /** First integration attempt for a fresh task run (device worktree path). */
  private async integrateTaskRun(
    task: TaskItem,
    topicId: string,
    record: TaskTopicIntegration,
    completionReservationId: string | undefined,
    lease: RepoRefLeaseHandle,
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
    const activeRecord: TaskTopicIntegration = {
      ...record,
      integrationOwnerTopicId: record.integrationOwnerTopicId ?? topicId,
      integrationWorktreePath,
    };

    // Fence before provisioning device state: a stolen lease must not create
    // an integration worktree for a section it no longer owns.
    await lease.assert('prepare');
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
      integrationOwnerTopicId: activeRecord.integrationOwnerTopicId,
      integrationWorktreePath,
    });

    await lease.assert('merge');
    const merged = await deviceGateway.mergeGitBranch({
      baseRef: this.baseRef(record),
      branch: record.branch,
      deviceId: record.deviceId,
      // Refresh the tracking ref so the serialized merge re-baselines onto the
      // published tip rather than a stale `origin/<base>`.
      fetchBase: record.baseBranch !== 'HEAD',
      path: integrationWorktreePath,
      userId: this.userId,
      workspaceId: this.workspaceId,
    });
    const deliveryRecord: TaskTopicIntegration = {
      ...activeRecord,
      expectedHeadSha: merged.headSha ?? record.expectedHeadSha,
      integrationWorktreePath,
    };
    await this.updateIntegrationOrThrow(task.id, topicId, {
      expectedHeadSha: deliveryRecord.expectedHeadSha,
    });

    if (merged.state === 'merged') {
      return this.landMerge(task, topicId, deliveryRecord, merged.sha, lease);
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
        lease,
      );
    }

    await this.updateIntegrationOrThrow(task.id, topicId, {
      conflicts: merged.conflicts,
      integrationWorktreePath,
      lastErrorCode: 'merge_conflict',
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
      lease,
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
    completionReservationId: string | undefined,
    lease: RepoRefLeaseHandle,
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
    if (check.error) {
      patch.lastError = check.error;
      patch.lastErrorCode = 'remote_verification_unavailable';
      patch.state = check.fatal ? 'blocked' : 'verification_pending';
    }
    const historyPatch = withBaseShaHistory(patch, record);
    if (Object.keys(historyPatch).length > 0) {
      await this.updateIntegrationOrThrow(task.id, topicId, historyPatch);
    }
    if (check.merged) {
      await this.landRemoteMerge(task.id, topicId, record, check);
      return (await this.scheduleDeferredVerify(task, record)) ? 'hold' : 'settled';
    }
    if (check.error) {
      await this.updateIntegrationOrThrow(task.id, topicId, {
        ...historyPatch,
      });
      return check.fatal ? 'blocked' : 'hold';
    }
    return this.dispatchCorrective(
      task,
      topicId,
      { ...record, ...historyPatch },
      undefined,
      completionReservationId,
      lease,
    );
  }

  /** Check the remote merge state after an integrator run returned. */
  private async finalizeRemoteCorrectiveRun(
    task: TaskItem,
    topicId: string,
    record: TaskTopicIntegration,
    completionReservationId: string | undefined,
    lease: RepoRefLeaseHandle,
  ): Promise<IntegrationOutcome> {
    const check = await this.verifyRemoteMerge(record, task);
    const patch: Partial<TaskTopicIntegration> = {};
    if (check.expectedBaseSha) patch.expectedBaseSha = check.expectedBaseSha;
    if (check.prUrl) patch.prUrl = check.prUrl;
    if (check.prNumber) patch.prNumber = check.prNumber;
    if (check.expectedHeadSha) patch.expectedHeadSha = check.expectedHeadSha;
    if (check.error) {
      patch.lastError = check.error;
      patch.lastErrorCode = 'remote_verification_unavailable';
      patch.state = check.fatal ? 'blocked' : 'verification_pending';
    }
    Object.assign(patch, withBaseShaHistory(patch, record));

    if (check.merged) {
      await this.landRemoteMerge(task.id, topicId, record, check);
      return (await this.scheduleDeferredVerify(task, record)) ? 'hold' : 'settled';
    }

    if (check.error) {
      await this.updateIntegrationOrThrow(task.id, topicId, patch);
      if (check.fatal && record.runTopicId) {
        await this.updateIntegrationOrThrow(task.id, record.runTopicId, {
          lastError: check.error,
          state: 'blocked',
        });
      }
      return check.fatal ? 'blocked' : 'hold';
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
    return this.dispatchCorrective(
      task,
      topicId,
      record,
      undefined,
      completionReservationId,
      lease,
    );
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
    fatal?: boolean;
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
        fatal: true,
        merged: false,
      };
    }
    if (record.prNumber && pr && pr.number !== record.prNumber) {
      return {
        ...identity,
        error: `Task delivery is bound to PR #${record.prNumber}, not PR #${pr.number}`,
        fatal: true,
        merged: false,
      };
    }
    if (pr?.merged) {
      if (pr.headSha !== expectedHeadSha) {
        return {
          ...identity,
          error: `Merged PR #${pr.number} contains ${pr.headSha}, not accepted commit ${expectedHeadSha}`,
          fatal: true,
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
      lastError: null,
      lastErrorCode: null,
      prNumber: check.prNumber,
      prUrl: check.prUrl,
      pushedToRemote: true,
      state: 'integrated',
    };
    // Multi-hop corrective chains (task → integrate → integrate → …) must all
    // land — `runTopicId` alone only walks one hop back and would strand the
    // original run's row at 'merging' after a 3+-hop chain. Fan out by branch
    // like the device path's publish loop does. Each row's own recorded base is
    // what the history preserves, so history is computed per row, not once.
    const rows = await this.taskTopicModel.findByTaskId(taskId);
    for (const row of rows) {
      if (
        row.topicId &&
        row.integration?.branch === record.branch &&
        row.integration.state !== 'blocked'
      ) {
        await this.updateIntegrationOrThrow(
          taskId,
          row.topicId,
          withBaseShaHistory(patch, row.integration),
        );
      }
    }
  }

  /** Check the merge state after a corrective run returned. */
  private async finalizeCorrectiveRun(
    task: TaskItem,
    topicId: string,
    record: TaskTopicIntegration,
    completionReservationId: string | undefined,
    lease: RepoRefLeaseHandle,
  ): Promise<IntegrationOutcome> {
    const finalizePath = record.integrationWorktreePath ?? record.worktreePath;
    if (!record.deviceId || !finalizePath || !record.expectedHeadSha) {
      await this.updateIntegrationOrThrow(task.id, topicId, {
        lastError: 'Integration record is missing its device workspace fields or accepted commit',
        state: 'blocked',
      });
      return 'blocked';
    }

    await lease.assert('merge');
    const finalized = await deviceGateway.finalizeGitMerge({
      deviceId: record.deviceId,
      expectedHead: record.expectedHeadSha,
      path: finalizePath,
      userId: this.userId,
      workspaceId: this.workspaceId,
    });

    if (finalized.state === 'integrated' && finalized.validatedExpectedHead) {
      return this.landMerge(task, topicId, record, finalized.sha, lease);
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
    return this.dispatchCorrective(
      task,
      topicId,
      record,
      undefined,
      completionReservationId,
      lease,
    );
  }

  /**
   * Merge landed: push the result to `origin/<base>` when the repo has a
   * remote, then drop the task's worktree. Push failure doesn't undo the local
   * merge — it's recorded on the record for a human to re-push.
   *
   * Both run-owned worktrees are removed only after the exact candidate commit
   * has been pushed successfully. A failed push remains recoverable and keeps
   * the integration worktree for an exact-SHA retry.
   */
  private async landMerge(
    task: TaskItem,
    topicId: string,
    record: TaskTopicIntegration,
    sha: string | undefined,
    lease: RepoRefLeaseHandle,
  ): Promise<IntegrationOutcome> {
    if (!sha) {
      await this.updateIntegrationOrThrow(task.id, topicId, {
        lastError: 'Merge completed without a verifiable integration commit',
        state: 'blocked',
      });
      return 'blocked';
    }
    await this.updateIntegrationOrThrow(task.id, topicId, {
      integratedSha: sha,
      state: 'merging',
    });
    const outcome = await this.publishAndCleanup(task.id, record, sha, lease);
    if (outcome !== 'settled') return outcome;
    return (await this.scheduleDeferredVerify(task, record)) ? 'hold' : outcome;
  }

  /**
   * Retry publishing a recorded local merge commit. A transient failure
   * re-pushes the same SHA; a non-fast-forward rejection means the base moved
   * under the (serialized) merge — for the original task row re-enter the
   * merge stage so `mergeGitBranch` re-baselines onto the refreshed
   * `origin/<base>` and produces a new merge commit instead of re-pushing an
   * unpublishable one forever. Corrective-row records keep the plain re-push:
   * their merge state lives inside the integration worktree and re-merging
   * would discard the resolved content.
   */
  private async retryLocalPublish(
    task: TaskItem,
    topicId: string,
    record: TaskTopicIntegration,
    completionReservationId: string | undefined,
    lease: RepoRefLeaseHandle,
  ): Promise<IntegrationOutcome> {
    if (record.repo || !record.integratedSha) {
      await this.updateIntegrationOrThrow(task.id, topicId, {
        lastError: 'Publish retry is missing its local integration commit',
        state: 'blocked',
      });
      return 'blocked';
    }
    const outcome = await this.landMerge(task, topicId, record, record.integratedSha, lease);
    if (outcome !== 'hold' || record.role !== 'task') return outcome;

    const latest = (await this.taskTopicModel.findByTopicId(topicId))?.integration;
    if (
      !latest ||
      latest.state !== 'publish_failed' ||
      !NON_FAST_FORWARD_PUSH.test(latest.lastError ?? '')
    ) {
      return outcome;
    }
    return this.integrateTaskRun(
      task,
      topicId,
      { ...record, integratedSha: latest.integratedSha },
      completionReservationId,
      lease,
    );
  }

  private async publishAndCleanup(
    taskId: string,
    record: TaskTopicIntegration,
    sha: string,
    lease: RepoRefLeaseHandle,
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
        await this.updateIntegrationOrThrow(taskId, row.topicId!, patch);
      }
    };

    const publishPath = record.integrationWorktreePath ?? record.worktreePath;
    if (!record.deviceId || !record.repoPath || !publishPath) {
      await updateRelated({
        integratedSha: sha,
        lastError: 'Integration candidate is missing the device path or commit SHA',
        state: 'blocked',
      });
      return 'blocked';
    }

    let pushedToRemote: boolean | undefined;
    if (record.baseBranch !== 'HEAD') {
      await lease.assert('publish');
      const pushed = await deviceGateway.pushGitBranch({
        deviceId: record.deviceId,
        expectedSha: sha,
        path: publishPath,
        remoteBranch: record.baseBranch,
        sourceRef: sha,
        userId: this.userId,
        workspaceId: this.workspaceId,
      });
      if (!pushed.success || pushed.pushedSourceRef !== sha) {
        const immutableSourceUnconfirmed = pushed.success && pushed.pushedSourceRef !== sha;
        const reason = immutableSourceUnconfirmed
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
          lastErrorCode: immutableSourceUnconfirmed ? 'workspace_unavailable' : 'publish_failed',
          pushedToRemote: false,
          state: immutableSourceUnconfirmed ? 'blocked' : 'publish_failed',
        });
        if (immutableSourceUnconfirmed) return 'blocked';
        await this.cleanupTaskRunWorktrees(taskId, record.branch);
        return 'hold';
      }
      pushedToRemote = true;
    }

    await updateRelated({
      conflicts: null,
      integratedSha: sha,
      lastError: null,
      lastErrorCode: null,
      pushedToRemote,
      state: 'integrated',
    });
    return 'settled';
  }

  /** Remove completed task worktrees while retaining the integration checkout for publish retry. */
  private async cleanupTaskRunWorktrees(taskId: string, branch: string): Promise<void> {
    const rows = await this.taskTopicModel.findByTaskId(taskId);
    for (const row of rows) {
      const candidate = row.integration;
      if (
        !row.topicId ||
        candidate?.branch !== branch ||
        candidate.role !== 'task' ||
        !candidate.deviceId ||
        !candidate.repoPath ||
        !candidate.worktreePath ||
        candidate.worktreeCleaned === true
      )
        continue;
      const removed = await deviceGateway.removeGitWorktree({
        deviceId: candidate.deviceId,
        path: candidate.repoPath,
        userId: this.userId,
        workspaceId: this.workspaceId,
        worktreePath: candidate.worktreePath,
      });
      await this.updateIntegrationOrThrow(taskId, row.topicId, {
        worktreeCleaned: removed.success,
      });
    }
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
    context: { conflicts?: string[]; integrationWorktreePath?: string } | undefined,
    completionReservationId: string | undefined,
    lease: RepoRefLeaseHandle,
  ): Promise<IntegrationOutcome> {
    // Dispatching a corrective run is itself a side effect on the serialized
    // merge pipeline — fence before any row write or runner invocation.
    await lease.assert('dispatch');
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
    const relatedRows = await this.taskTopicModel.findByTaskId(task.id);
    const originalRun = relatedRows.find(
      (row) => row.integration?.branch === record.branch && row.integration.role === 'task',
    );
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
      parentOperationId: originalRun?.operationId ?? undefined,
      replaceReservationId: completionReservationId,
      skipTaskVerification: true,
      idempotencyKey: taskRunIdempotencyKey.integrationCorrection({
        attempt: attempts,
        taskId: task.id,
        taskRevision: task.domainRevision ?? 0,
        topicId,
      }),
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

  private hasCorrectiveSuccessor(
    topicId: string,
    record: TaskTopicIntegration,
    rows: Awaited<ReturnType<TaskTopicModel['findByTaskId']>>,
  ): boolean {
    return rows.some(
      (row) =>
        row.topicId !== topicId &&
        row.integration?.role === 'integrate' &&
        row.integration.runTopicId === topicId &&
        row.integration.branch === record.branch,
    );
  }

  /** Follow corrective parent links back to the task row that owns the chain lease. */
  private resolveIntegrationOwnerTopicId(
    topicId: string,
    record: TaskTopicIntegration,
    rows: Awaited<ReturnType<TaskTopicModel['findByTaskId']>>,
  ): string {
    if (record.role === 'task') return topicId;

    const byTopicId = new Map(rows.map((row) => [row.topicId, row.integration]));
    const visited = new Set<string>([topicId]);
    let ownerTopicId = topicId;
    let current: TaskTopicIntegration | null | undefined = record;
    while (current?.role === 'integrate' && current.runTopicId) {
      if (visited.has(current.runTopicId)) break;
      visited.add(current.runTopicId);
      ownerTopicId = current.runTopicId;
      current = byTopicId.get(ownerTopicId);
    }
    return ownerTopicId;
  }

  /**
   * A completion whose integration previously held never reached the runtime's
   * normal verify scheduler. Once recovery or a corrective run publishes the
   * branch, resume the original run's confirmed Verify plan and keep this
   * lifecycle invocation from settling the Task independently.
   */
  private async scheduleDeferredVerify(
    task: TaskItem,
    record: TaskTopicIntegration,
  ): Promise<boolean> {
    const rows = await this.taskTopicModel.findByTaskId(task.id);
    const originalRun = rows.find(
      (row) =>
        row.operationId &&
        row.integration?.branch === record.branch &&
        row.integration.role === 'task',
    );
    if (!originalRun?.operationId) return false;

    const verifyRun = await new VerifyRunModel(
      this.db,
      this.userId,
      this.workspaceId,
    ).findByOperation(originalRun.operationId);
    if (!verifyRun?.planConfirmedAt) return false;

    const handoff = originalRun.handoff as { content?: string } | null;
    after(() =>
      runVerifyOnCompletion(
        this.db,
        this.userId,
        {
          deliverable: handoff?.content ?? '',
          goal: task.instruction,
          operationId: originalRun.operationId!,
        },
        this.workspaceId,
      ),
    );
    return true;
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
