import { BRANDING_URL } from '@orvilo/business-const';
import { TRACING_SCENARIOS } from '@orvilo/const';
import type { TracingOptions } from '@orvilo/llm-generation-tracing';
import {
  chainGenerateBrief,
  chainJudgeBriefEmit,
  chainTaskTopicHandoff,
  GENERATE_BRIEF_PROMPT_VERSION,
  GENERATE_BRIEF_SCHEMA,
  GENERATE_BRIEF_SCHEMA_NAME,
  JUDGE_BRIEF_EMIT_PROMPT_VERSION,
  JUDGE_BRIEF_EMIT_SCHEMA,
  JUDGE_BRIEF_EMIT_SCHEMA_NAME,
  TASK_TOPIC_HANDOFF_PROMPT_VERSION,
  TASK_TOPIC_HANDOFF_SCHEMA,
  TASK_TOPIC_HANDOFF_SCHEMA_NAME,
} from '@orvilo/prompts';
import type {
  BriefAction,
  BriefArtifacts,
  BriefDecision,
  TaskItem,
  TaskLifecycleAudit,
  TaskRunTrigger,
  TaskSchedulerContext,
  TaskTopicHandoff,
} from '@orvilo/types';
import { ChatErrorType, DEFAULT_BRIEF_ACTIONS } from '@orvilo/types';
import debug from 'debug';

import {
  notifyScheduledTaskCompleted,
  notifyScheduledTaskFailed,
} from '@/business/server/task/notifyScheduledTaskResult';
import { BriefModel } from '@/database/models/brief';
import { GoalModel } from '@/database/models/goal';
import { MessageModel } from '@/database/models/message';
import { TaskModel } from '@/database/models/task';
import { isTaskDependencyBlocked } from '@/database/models/taskDependency';
import { TaskDispatchModel } from '@/database/models/taskDispatch';
import { TaskTopicModel } from '@/database/models/taskTopic';
import { TopicModel } from '@/database/models/topic';
import { VerifyRunModel } from '@/database/models/verifyRun';
import type { LobeChatDatabase } from '@/database/type';
import { translation } from '@/libs/i18n/serverTranslation';
import { initModelRuntimeFromDB } from '@/server/modules/ModelRuntime';
import { SystemAgentService } from '@/server/services/systemAgent';
import { TaskIntegrationService } from '@/server/services/taskIntegration';
import { TaskResultBridgeService } from '@/server/services/taskResultBridge';
import { taskRunIdempotencyKey } from '@/server/services/taskRunner/idempotency';
import { createTaskSchedulerModule } from '@/server/services/taskScheduler';

import {
  isTrivialAssistantContent,
  selectBriefPriority,
  selectBriefType,
  shouldEmitTopicBrief,
} from './synthesize';

/**
 * Read the brief generation mode from `task.config.brief.mode`.
 *
 * Defaults to `'auto'` — programmatic synthesis in `synthesizeTopicBrief`
 * is the standard path. `'agent'` is an explicit escape hatch that re-enables
 * the legacy agent-driven `createBrief` tool flow.
 */
const getBriefMode = (task: TaskItem | null): 'agent' | 'auto' => {
  const mode = (task?.config as { brief?: { mode?: string } } | null)?.brief?.mode;
  return mode === 'agent' ? 'agent' : 'auto';
};

const log = debug('task-lifecycle');

const TERMINAL_STATUSES = new Set(['canceled', 'completed', 'failed']);
const isTerminal = (status: string) => TERMINAL_STATUSES.has(status);

// Consecutive automation-tick 'error' reasons after which we pause the task /
// stop re-arming and let the urgent brief surface for human attention. A single
// transient upstream hiccup (429 / network / upstream 500) must NOT permanently
// stop a recurring task — only this many *consecutive* failures do. Hardcoded
// for now; move to task.config later if it needs to be tunable per-task.
const AUTOMATION_FAILURE_FUSE = 3;

class TaskCompletionSupersededError extends Error {
  constructor() {
    super('Task completion generation was superseded');
    this.name = 'TaskCompletionSupersededError';
  }
}

// Terminal error codes whose fix lives in billing, not in a retry — running the
// same task again just reproduces the same wall. For these the error brief leads
// with an "Upgrade" remedy instead of a futile Retry (ux Feedback §4.2).
// Everything else keeps the default retry + feedback actions.
const BILLING_ERROR_CODES = new Set<string>([
  ChatErrorType.InsufficientBudgetForModel,
  ChatErrorType.FreePlanLimit,
  ChatErrorType.SubscriptionPlanLimit,
  ChatErrorType.WorkspaceSubscriptionInactive,
]);

export interface TopicCompleteParams {
  dispatchFence?: number;
  dispatchId?: string;
  /** Structured terminal error type (e.g. `InsufficientBudgetForModel`) from the
   *  completion lifecycle event, used to pick the error brief's remedy action. */
  errorCode?: string;
  errorMessage?: string;
  executionGeneration?: number;
  lastAssistantContent?: string;
  operationId: string;
  reason: string; // 'done' | 'error' | 'interrupted' | ...
  // What triggered the run. Manual "run now" failures are ad-hoc and must not
  // change an automation task's scheduling state. Undefined is
  // treated as 'manual' for backward compatibility with older callers.
  runTrigger?: TaskRunTrigger;
  taskId: string;
  taskIdentifier: string;
  topicId?: string;
}

/**
 * TaskLifecycleService handles task state transitions triggered by topic completion.
 * Used by both local onComplete hooks and production webhook callbacks.
 */
export class TaskLifecycleService {
  private briefModel: BriefModel;
  private db: LobeChatDatabase;
  private messageModel: MessageModel;
  private systemAgentService: SystemAgentService;
  private taskModel: TaskModel;
  private taskTopicModel: TaskTopicModel;
  private topicModel: TopicModel;
  private userId: string;

  private workspaceId?: string;

  constructor(db: LobeChatDatabase, userId: string, workspaceId?: string) {
    this.db = db;
    this.userId = userId;
    this.workspaceId = workspaceId;
    this.taskModel = new TaskModel(db, userId, workspaceId);
    this.taskTopicModel = new TaskTopicModel(db, userId, workspaceId);
    this.briefModel = new BriefModel(db, userId, workspaceId);
    this.messageModel = new MessageModel(db, userId, workspaceId);
    this.topicModel = new TopicModel(db, userId, workspaceId);
    this.systemAgentService = new SystemAgentService(db, userId, workspaceId);
  }

  /**
   * Handle topic completion — the core lifecycle method.
   *
   * Flow: updateHeartbeat → updateTopicStatus → handoff → review → checkpoint
   */
  async onTopicComplete(params: TopicCompleteParams): Promise<void> {
    const {
      taskId,
      taskIdentifier,
      topicId,
      reason: rawReason,
      lastAssistantContent,
      errorMessage,
      errorCode,
    } = params;
    const reason = rawReason === 'max_steps' || rawReason === 'cost_limit' ? 'done' : rawReason;

    const hasDispatchClaim =
      params.dispatchId !== undefined ||
      params.dispatchFence !== undefined ||
      params.executionGeneration !== undefined;
    if (hasDispatchClaim) {
      if (
        !params.dispatchId ||
        params.dispatchFence === undefined ||
        params.executionGeneration === undefined
      ) {
        throw new Error('Incomplete Task dispatch claim on completion');
      }
      const terminalPhase =
        reason === 'done' ? 'succeeded' : reason === 'interrupted' ? 'canceled' : 'failed';
      const settlement = await new TaskDispatchModel(this.db, this.workspaceId).settle({
        dispatchId: params.dispatchId,
        expected: ['dispatched', 'running', 'cancel_requested', 'outcome_unknown'],
        fence: params.dispatchFence,
        generation: params.executionGeneration,
        operationId: params.operationId,
        phase: terminalPhase,
      });
      if (!settlement) throw new Error('Task dispatch claim is stale or does not match this run');
      if (settlement.state === 'already_settled') {
        log(
          'Ignored replayed completion: task=%s dispatch=%s generation=%s',
          taskId,
          params.dispatchId,
          params.executionGeneration,
        );
        return;
      }
      if (!settlement.currentGeneration) {
        if (topicId) {
          const historicalStatus =
            reason === 'done' ? 'completed' : reason === 'interrupted' ? 'canceled' : 'failed';
          await this.taskTopicModel.settleHistoricalRun(
            taskId,
            topicId,
            {
              dispatchId: params.dispatchId,
              fence: params.dispatchFence,
              generation: params.executionGeneration,
            },
            historicalStatus,
            lastAssistantContent,
          );
        }
        log(
          'Ignored stale generation completion: task=%s dispatch=%s generation=%s',
          taskId,
          params.dispatchId,
          params.executionGeneration,
        );
        return;
      }
    }

    log('onTopicComplete: task=%s topic=%s reason=%s', taskIdentifier, topicId, reason);

    if (reason !== 'done' && reason !== 'error' && reason !== 'interrupted') {
      log('onTopicComplete: non-terminal task callback ignored reason=%s', reason);
      return;
    }

    const currentTask = await this.taskModel.findById(taskId);
    if (!currentTask) return;

    if (!topicId) {
      log('onTopicComplete: callback without topic ignored task=%s', taskIdentifier);
      return;
    }

    const claimed = await this.taskTopicModel.settleIfRunning(
      taskId,
      topicId,
      params.operationId,
      reason === 'done' ? 'completed' : reason === 'interrupted' ? 'canceled' : 'failed',
    );
    if (!claimed) {
      log(
        'onTopicComplete: duplicate or stale callback ignored task=%s currentTopic=%s receivedTopic=%s',
        taskIdentifier,
        currentTask.currentTopicId,
        topicId,
      );
      return;
    }

    if (reason === 'interrupted') {
      log('onTopicComplete: interrupted run settled without advancing task=%s', taskIdentifier);
      return;
    }

    // A duplicate completion callback can reclaim an expired `completion:*`
    // lease after the scheduler has moved the task back to `scheduled`. Keep
    // the CAS aligned with the status that settleIfRunning actually claimed;
    // requiring `running` here would strand that task with no next tick.
    const claimedTaskStatus = currentTask.status === 'scheduled' ? 'scheduled' : 'running';
    const updateOwnedStatus = async (
      status: string,
      extra?: { completedAt?: Date; error?: string | null },
    ) => {
      const updated = await this.taskModel.updateStatusIfReservation(
        taskId,
        claimed,
        claimedTaskStatus,
        status,
        extra,
      );
      if (!updated) throw new TaskCompletionSupersededError();
      return updated;
    };

    let verifyBound = false;
    let verifySettled = false;
    let lifecycleFailed = false;
    try {
      const integrationService = new TaskIntegrationService(this.db, this.userId, this.workspaceId);

      // Whether a confirmed verify plan owns this run's delivery acceptance. Set in
      // the 'done' branch; gates both the pause-for-review skip and (below) the
      // creator callback — for verify-bound runs the callback is deferred to the
      // verify settle path (driveTaskFromVerify) so the creator never consumes an
      // output before verify has accepted it.
      if (reason === 'done') {
        try {
          if (!(await integrationService.captureRemoteIdentityOnComplete(currentTask, topicId))) {
            await updateOwnedStatus('paused', {
              error: 'Could not freeze the remote delivery identity',
            });
            return;
          }
        } catch (error) {
          log('remote delivery identity capture failed for task=%s: %O', taskIdentifier, error);
          await updateOwnedStatus('paused', {
            error: 'Could not freeze the remote delivery identity',
          });
          return;
        }

        // 2. Generate handoff summary + topic title (best-effort LLM synthesis).
        if (topicId && lastAssistantContent) {
          await this.generateHandoff(
            taskId,
            taskIdentifier,
            topicId,
            lastAssistantContent,
            currentTask,
          );
        }

        // 2b. Persist the raw last message as the run card's result.
        //     Done independently of (and after) generateHandoff via a jsonb_set
        //     patch, so `handoff.content` is written even when the summary LLM in
        //     step 2 throws — otherwise a completed run would show no result.
        if (topicId && lastAssistantContent) {
          try {
            await this.taskTopicModel.updateHandoffContent(taskId, topicId, lastAssistantContent);
          } catch (e) {
            console.warn('[TaskLifecycle] persisting run last message failed:', e);
          }
        }

        // Resolve Verify ownership before any irreversible delivery action. A
        // confirmed plan must judge the exact run before its branch is merged.
        // A failed read is a gate failure, not evidence that verification is
        // absent.
        try {
          const verifyRun = await new VerifyRunModel(
            this.db,
            this.userId,
            this.workspaceId,
          ).findByOperation(params.operationId);
          verifyBound = Boolean(verifyRun?.planConfirmedAt);
          verifySettled =
            verifyRun?.status === 'passed' ||
            verifyRun?.status === 'failed' ||
            verifyRun?.status === 'errored';
        } catch (error) {
          log('verify-bound check failed for op=%s: %O', params.operationId, error);
          await updateOwnedStatus('paused', {
            error: 'Could not determine the delivery verification state',
          });
          return;
        }

        // A steer that landed after the run's last consumed step must continue
        // before integration. The continuation reuses this topic's worktree;
        // integrating first may publish and remove that directory underneath it.
        if (topicId && !verifyBound) {
          const steerMessageId = await this.findUnconsumedSteerMessageId(topicId);
          if (steerMessageId) {
            try {
              const { TaskRunnerService } = await import('../taskRunner');
              await new TaskRunnerService(this.db, this.userId, this.workspaceId).runTask({
                continueFromMessageId: steerMessageId,
                continueTopicId: topicId,
                idempotencyKey: taskRunIdempotencyKey.steerContinuation({
                  messageId: steerMessageId,
                  taskId,
                  topicId,
                }),
                replaceReservationId: claimed,
                taskId,
                trigger: params.runTrigger,
              });
              log(
                'onTopicComplete: continuing topic=%s off late steer message %s',
                topicId,
                steerMessageId,
              );
              return;
            } catch (error) {
              log(
                'onTopicComplete: late-steer continuation failed for topic=%s (non-fatal): %O',
                topicId,
                error,
              );
            }
          }
        }

        // 2c. Workspace-integration gate (CAID merge-back): a provisioned run's
        //    task branch must land on its base before the task may settle. A
        //    merge conflict holds the transition open (task stays 'running')
        //    while a corrective run resolves it in the integration worktree;
        //    exhausted attempts park the task 'paused'. Unprovisioned runs pass
        //    straight through.
        if (topicId && !verifyBound) {
          const integrationOutcome = await integrationService.integrateOnComplete({
            completionReservationId: claimed,
            task: currentTask,
            taskTopicId: topicId,
          });

          if (integrationOutcome !== 'hold') {
            const integration = (await this.taskTopicModel.findByTopicId(topicId))?.integration;
            if (integration?.verifyOperationId) {
              const { driveTaskFromVerify } = await import('../verify/settle');
              await driveTaskFromVerify(
                this.db,
                this.userId,
                integration.verifyOperationId,
                this.workspaceId,
              );
              return;
            }
          }

          if (integrationOutcome === 'blocked') {
            await updateOwnedStatus('paused', {
              error: 'Workspace merge could not be completed',
            });
            return;
          }
        if (integrationOutcome === 'hold' || integrationOutcome === 'stale') return;
        }

        // 3. Delivery acceptance now runs through Verify: the verify
        //    run settles asynchronously (agent verifier) and drives the task to its
        //    terminal state via `driveTaskFromVerify`. The legacy eval-rubric
        //    auto-review is removed; this branch only lets the task go on to the
        //    brief + post-tick transition, and the verify-bound check below makes it
        //    "let go" so verify owns the completion decision.

        // 4. Synthesize a programmatic brief for the user (auto mode only).
        //    The agent-driven `createBrief` tool path stays the default until
        //    the GrowthBook flag flips. See for the rollout plan.
        //
        //    Goal Task rounds are deliberately silent. The coordinator can run
        //    many attempts on one Task before it converges, and a card per round
        //    buries the one moment that actually needs the user — the decision
        //    gate the coordinator opens when the attempt budget runs out.
        const isGoalLoopRound =
          !!currentTask &&
          !!(await new GoalModel(this.db, this.userId, this.workspaceId).findByGraphTask(
            currentTask.id,
          ));
        if (
          !isGoalLoopRound &&
          getBriefMode(currentTask) === 'auto' &&
          currentTask &&
          topicId &&
          lastAssistantContent
        ) {
          await this.synthesizeTopicBrief(
            taskId,
            taskIdentifier,
            topicId,
            lastAssistantContent,
            reason,
            currentTask,
          );
        }

        // 5. Default post-tick transition.
        //    - Schedule-mode task that just consumed its final allowed run
        //      (count ≥ maxExecutions) → park at 'completed' so the UI reflects
        //      the cap immediately. Without this, a daily cron with
        //      maxExecutions=1 would advertise itself as 'scheduled' for
        //      another 24h before the pre-tick check in runScheduleTick
        //      noticed.
        //    - Other automation tasks (heartbeat, schedule under cap) loop
        //      running ↔ scheduled, so a successful tick parks them at
        //      'scheduled' to wait for the next tick. They never auto-pause
        //      on success — only `reason === 'error'` below puts them in
        //      'paused' for human attention.
        //    - Goal-owned root tasks complete immediately. The Goal coordinator
        //      owns the broader delivery decision and cannot consume a task that
        //      merely stays running after its topic has already finished.
        //    - Subtasks complete immediately. Their parent owns the broader
        //      delivery decision, so pausing every successful child for a second
        //      user review stalls an otherwise autonomous task graph. Completing
        //      the child also unlocks its downstream siblings.
        //    - Root non-automation tasks keep the legacy "pause for user review"
        //      behavior: their result is the user-facing delivery boundary.
        // "Let go" for verify-bound runs: when a confirmed verify plan exists for
        // this op, delivery acceptance is decided asynchronously by Verify
        // (driveTaskFromVerify completes / pauses the task on settle), so we must
        // NOT pause-for-review here — the task stays running until verify settles.
        if (currentTask) {
          const completionRequestedByCurrentOperation =
            (
              currentTask.context as {
                completion?: { requestedByOperationId?: string };
              } | null
            )?.completion?.requestedByOperationId === params.operationId;

          if (
            currentTask.automationMode === 'schedule' &&
            !verifyBound &&
            (await this.scheduleCapReached(currentTask))
          ) {
            log('cap reached for task=%s — marking completed post-tick', taskIdentifier);
            await updateOwnedStatus('completed', { completedAt: new Date() });
          } else if (currentTask.automationMode) {
            // A successful tick parks the automation task back at its resting
            // 'scheduled' state and clears the live error column. Before clearing
            // it, stamp a durable recovery marker + reset the failure fuse so the
            // recovery is auditable and a later query can still tell the task once
            // failed — the live `error` alone would silently self-heal.
            await this.recordAutomationRecovery(currentTask, claimed);
            await updateOwnedStatus('scheduled', { error: null });
          } else if (!verifyBound && completionRequestedByCurrentOperation) {
            if (currentTask.parentTaskId) {
              await this.completeSubtask(currentTask, claimed);
            } else {
              await updateOwnedStatus('completed', {
                completedAt: new Date(),
                error: null,
              });
            }
          } else if (!verifyBound && params.runTrigger === 'goal' && !currentTask.parentTaskId) {
            await updateOwnedStatus('completed', {
              completedAt: new Date(),
              error: null,
            });
          } else if (!verifyBound && currentTask.parentTaskId) {
            const checkpoint = this.taskModel.getCheckpointConfig(currentTask);
            if (checkpoint.topic?.after) {
              await updateOwnedStatus('paused', {
                error: null,
              });
            } else {
              await this.completeSubtask(currentTask, claimed);
            }
          } else if (!verifyBound && this.taskModel.shouldPauseOnTopicComplete(currentTask)) {
            await updateOwnedStatus('paused', { error: null });
          }
        }

        // 6. Recall the user when a scheduled tick lands: fire-and-forget through
        //    the `@/business` slot (default impl is a no-op; a notification
        //    failure must never affect the task lifecycle). Only genuine
        //    scheduled ticks notify — manual "run now" runs and high-frequency
        //    heartbeat ticks stay silent to avoid flooding the inbox.
        if (currentTask?.automationMode === 'schedule' && params.runTrigger === 'schedule') {
          void notifyScheduledTaskCompleted({
            agentId: currentTask.assigneeAgentId ?? undefined,
            lastAssistantContent,
            operationId: params.operationId,
            taskId,
            taskIdentifier,
            taskName: currentTask.name ?? undefined,
            topicId,
            userId: this.userId,
            workspaceId: this.workspaceId,
          }).catch((error) =>
            log(
              'scheduled-task success notification failed for task=%s (non-fatal): %O',
              taskIdentifier,
              error,
            ),
          );
        }
      } else if (reason === 'error') {
        const errorText = errorMessage || 'Unknown error';

        // A budget / plan failure won't clear on a blind Retry — lead the card with
        // the fix (Upgrade → plans page) instead. Other causes keep retry + feedback.
        const isBillingError = errorCode ? BILLING_ERROR_CODES.has(errorCode) : false;
        const errorActions: BriefAction[] =
          isBillingError && BRANDING_URL.subscription
            ? [
                {
                  key: 'upgrade',
                  label: 'Upgrade plan',
                  type: 'link',
                  url: BRANDING_URL.subscription,
                },
                { key: 'feedback', label: '💬 Feedback', type: 'comment' },
              ]
            : DEFAULT_BRIEF_ACTIONS['error'];

        // Resolve the user-facing copy in the user's language, at the source (not
        // by string-munging on the client):
        //  - title: a plain localized "run failed" — the task identity already sits
        //    in the card's meta row, so the headline needn't repeat it.
        //  - summary: map the structured error code to the same human, localized
        //    message the chat error card shows. The copy for a code lives in exactly
        //    one of two namespaces — `modelRuntime:<code>` (runtime codes) or
        //    `error:response.<code>` (HTTP status / Cloud ChatErrorType such as
        //    `InsufficientBudgetForModel`) — so try both and take whichever resolves
        //    (the server `t` returns the key unchanged when it has no entry). Fall
        //    back to the raw runtime message for codes with no friendly copy, or copy
        //    left with an unresolved `{{…}}` placeholder we can't fill here.
        const locale = await this.systemAgentService.getUserLocale();
        const [{ t: tHome }, { t: tRuntime }, { t: tError }] = await Promise.all([
          translation('home', locale),
          translation('modelRuntime', locale),
          translation('error', locale),
        ]);
        const resolveErrorSummary = () => {
          if (!errorCode) return errorText;
          const runtimeMsg = tRuntime(errorCode);
          if (runtimeMsg !== errorCode && !runtimeMsg.includes('{{')) return runtimeMsg;
          const responseKey = `response.${errorCode}`;
          const responseMsg = tError(responseKey);
          if (responseMsg !== responseKey && !responseMsg.includes('{{')) return responseMsg;
          return errorText;
        };
        const summary = resolveErrorSummary();

        // Always surface an urgent error brief — a failed run is visible to the
        // user regardless of what happens to the scheduling state below. The topic
        // id rides the structured `topicId` field (it also powers the card's
        // "View run" shortcut), never the headline.
        await this.briefModel.create({
          actions: errorActions,
          agentId: currentTask?.assigneeAgentId || undefined,
          // Persist the structured cause for observability / future remedy mapping.
          metadata: errorCode ? { error: { code: errorCode } } : undefined,
          priority: 'urgent',
          summary,
          taskId,
          title: tHome('inbox.error.title'),
          topicId,
          trigger: 'task',
          type: 'error',
        });

        const runTrigger = params.runTrigger ?? 'manual';
        const isAutomationTick = runTrigger === 'schedule' || runTrigger === 'heartbeat';

        // Captured by the schedule sub-branch below for the failure notification:
        // how deep into the fuse this failure is, and whether it blew the fuse
        // and auto-paused the task.
        let scheduleConsecutiveFailures: number | undefined;
        let pausedByFuse = false;

        if (!currentTask) {
          // Task vanished mid-run — nothing to transition.
        } else if (!currentTask.automationMode) {
          // Ad-hoc / dependency task: pause for user attention (legacy behavior).
          await this.recordAutomationError(currentTask, errorText, runTrigger, undefined, claimed);
          await updateOwnedStatus('paused', { error: errorText });
        } else if (!isAutomationTick) {
          // a manual "run now" of an automation task failed. This is
          // an ad-hoc debug/backfill run — its failure is NOT a health signal for
          // the automation. Restore the resting 'scheduled' state (the run had
          // flipped it to 'running') so the next scheduled tick still fires, and
          // record the error for visibility — but do NOT pause and do NOT touch
          // the consecutive-failure fuse (only automation ticks count).
          await this.recordAutomationError(currentTask, errorText, runTrigger, undefined, claimed);
          await updateOwnedStatus('scheduled', { error: errorText });
        } else if (currentTask.automationMode === 'schedule') {
          // a scheduled tick failed. A single transient error must not
          // permanently pause a recurring task. Count consecutive failures and
          // only pause once the fuse blows; otherwise keep the task 'scheduled' so
          // the next tick retries. (Heartbeat tasks are handled by
          // maybeRearmHeartbeat below, which owns their fuse + re-arm.)
          const ctx = (currentTask.context as { scheduler?: TaskSchedulerContext } | null) ?? {};
          const consecutiveFailures = (ctx.scheduler?.consecutiveFailures ?? 0) + 1;
          scheduleConsecutiveFailures = consecutiveFailures;

          if (consecutiveFailures >= AUTOMATION_FAILURE_FUSE) {
            pausedByFuse = true;
            log(
              'schedule fuse blown: task=%s consecutiveFailures=%d — pausing',
              taskIdentifier,
              consecutiveFailures,
            );
            await this.recordAutomationError(
              currentTask,
              errorText,
              runTrigger,
              {
                consecutiveFailures,
                pauseReason: `${consecutiveFailures} consecutive scheduled-run failures`,
              },
              claimed,
            );
            await updateOwnedStatus('paused', { error: errorText });
          } else {
            log(
              'schedule error (retryable): task=%s consecutiveFailures=%d/%d',
              taskIdentifier,
              consecutiveFailures,
              AUTOMATION_FAILURE_FUSE,
            );
            await this.recordAutomationError(
              currentTask,
              errorText,
              runTrigger,
              {
                consecutiveFailures,
              },
              claimed,
            );
            await updateOwnedStatus('scheduled', { error: errorText });
          }
        } else {
          // Heartbeat tick failed: record the error and keep the resting
          // 'scheduled' state. maybeRearmHeartbeat (below) owns the consecutive-
          // failure fuse and the re-arm decision for heartbeat tasks — mirror its
          // fuse arithmetic here (it reads the same pre-increment context) so the
          // notification below can tell a fuse-stop from a transient failure.
          const ctx = (currentTask.context as { scheduler?: TaskSchedulerContext } | null) ?? {};
          scheduleConsecutiveFailures = (ctx.scheduler?.consecutiveFailures ?? 0) + 1;
          pausedByFuse = scheduleConsecutiveFailures >= AUTOMATION_FAILURE_FUSE;
          await this.recordAutomationError(currentTask, errorText, runTrigger, undefined, claimed);
          await updateOwnedStatus('scheduled', { error: errorText });
        }

        // Tell the user their automation failed: fire-and-forget through the
        // `@/business` slot (default impl is a no-op; a notification failure
        // must never affect the task lifecycle). Manual "run now" failures are
        // ad-hoc debug runs — the error brief above already covers them, and
        // they are not an automation-health signal, so only automation ticks
        // notify. Heartbeat ticks can fire every few seconds, so they only
        // notify at the fuse-stop moment (the automation stopped re-arming);
        // low-frequency scheduled ticks notify on every failure. Only the
        // structured `errorCode` crosses the slot boundary; raw error text
        // stays in the brief.
        if (
          currentTask?.automationMode &&
          isAutomationTick &&
          (runTrigger === 'schedule' || pausedByFuse)
        ) {
          void notifyScheduledTaskFailed({
            agentId: currentTask.assigneeAgentId ?? undefined,
            consecutiveFailures: scheduleConsecutiveFailures,
            errorCode,
            operationId: params.operationId,
            paused: pausedByFuse,
            runTrigger: runTrigger === 'schedule' ? 'schedule' : 'heartbeat',
            taskId,
            taskIdentifier,
            taskName: currentTask.name ?? undefined,
            topicId,
            userId: this.userId,
            workspaceId: this.workspaceId,
          }).catch((error) =>
            log(
              'scheduled-task failure notification failed for task=%s (non-fatal): %O',
              taskIdentifier,
              error,
            ),
          );
        }
      }

      // Bridge the finished task's handoff back to the creator conversation
      // Runs HERE — after all status transitions above — so the
      // bridge reads the settled task status. Doing it as a separate webhook
      // racing `on-topic-complete` could observe the pre-transition status and
      // silently drop the only callback for automation tasks that become terminal
      // in this path (e.g. a scheduled task hitting its execution cap).
      //
      // Verify-bound runs DEFER the callback to the verify settle path
      // (driveTaskFromVerify): the delivery isn't accepted until verify settles, so
      // the creator must not receive/act on the output here — if verify later fails,
      // the unaccepted output would already have been consumed.
      if (verifyBound && verifySettled) {
        const { driveTaskFromVerify } = await import('../verify/settle');
        await driveTaskFromVerify(this.db, this.userId, params.operationId, this.workspaceId);
      }
      if (!verifyBound) await this.bridgeResultToCreator(params);

      // Heartbeat re-arm: re-read task state (status / context may have just
      // been mutated by the branches above) and decide whether to publish the
      // next tick.
      const finalTask = await this.taskModel.findById(taskId);
      if (finalTask && (!verifyBound || verifySettled)) {
        await this.maybeRearmHeartbeat(finalTask, reason, claimed);
      }
    } catch (error) {
      if (error instanceof TaskCompletionSupersededError) {
        log('onTopicComplete: generation superseded while processing task=%s', taskIdentifier);
        return;
      }
      if (isTaskDependencyBlocked(error)) {
        // The topic is settled, but its delivery cannot complete after an
        // upstream reopen. Park this generation for recovery, not as a ghost run.
        try {
          await this.taskModel.updateStatusIfReservation(
            taskId,
            claimed,
            claimedTaskStatus,
            'paused',
            {
              error:
                'A prerequisite changed during this run. Complete the prerequisites before resuming.',
            },
          );
          verifyBound = false;
          return;
        } catch (recoveryError) {
          lifecycleFailed = true;
          throw recoveryError;
        }
      }
      lifecycleFailed = true;
      throw error;
    } finally {
      // A confirmed Verify plan still owns this generation after the topic
      // callback returns. Keep its completion lease until the verdict drives
      // the task; otherwise a manual run or the next automation tick can replace
      // currentTopicId and permanently strand that verdict.
      if (!verifyBound && !lifecycleFailed) {
        await this.taskModel.releaseRunReservation(taskId, claimed);
      }
    }
  }

  /**
   * A steer message the just-finished run never saw: the spine tail is a
   * `metadata.steer` user row without a `steerConsumedBy` stamp (the stamp is
   * written by the runtime when it loads the message into the working set —
   * see `AgentRuntimeService.refreshMessagesFromDB`). Only the tail matters:
   * an earlier unconsumed steer is still inside the continued run's history.
   */
  private async findUnconsumedSteerMessageId(topicId: string): Promise<string | undefined> {
    const tailId = await this.messageModel
      .getLatestSpineMessageId({ topicId })
      .catch(() => undefined);
    if (!tailId) return undefined;

    const tail = await this.messageModel.findById(tailId).catch(() => undefined);
    if (tail?.role !== 'user') return undefined;

    const metadata = tail.metadata as
      { steer?: boolean; steerConsumedBy?: string } | null | undefined;
    if (metadata?.steer !== true || metadata.steerConsumedBy) return undefined;
    return tail.id;
  }

  /**
   * Settle a successful child task and advance its sibling dependency graph.
   *
   * This mirrors the completion side effects of TaskService.updateStatus
   * without importing TaskService here (TaskRunner already depends on this
   * lifecycle service). The dynamic import keeps that module cycle out of
   * initialization while preserving the runner's single cascade implementation.
   */
  private async completeSubtask(task: TaskItem, reservationId: string): Promise<void> {
    const completedTask = await this.taskModel.updateStatusIfReservation(
      task.id,
      reservationId,
      'running',
      'completed',
      {
        completedAt: new Date(),
        error: null,
      },
    );
    if (!completedTask) {
      log('subtask=%s no longer running — skipping completion cascade', task.identifier);
      return;
    }

    const parentTask = await this.taskModel.findById(completedTask.parentTaskId!);
    if (parentTask && this.taskModel.shouldPauseAfterComplete(parentTask, task.identifier)) {
      await this.taskModel.updateStatus(parentTask.id, 'paused');
    }

    const { TaskRunnerService } = await import('@/server/services/taskRunner');
    await new TaskRunnerService(this.db, this.userId, this.workspaceId).cascadeOnCompletion(
      task.id,
    );
  }

  /**
   * Deliver the finished task's result back to the conversation that created
   * it. Always best-effort: a bridge failure must never affect task status, so
   * it's wrapped here and the underlying service also avoids throwing.
   */
  private async bridgeResultToCreator(params: TopicCompleteParams): Promise<void> {
    try {
      await new TaskResultBridgeService(this.db, this.userId, this.workspaceId).deliver({
        errorMessage: params.errorMessage,
        lastAssistantContent: params.lastAssistantContent,
        operationId: params.operationId,
        reason: params.reason,
        taskId: params.taskId,
        taskIdentifier: params.taskIdentifier,
        topicId: params.topicId,
      });
    } catch (error) {
      log('result bridge failed for task=%s (non-fatal): %O', params.taskIdentifier, error);
    }
  }

  /**
   * Has the task already consumed every allowed scheduled execution?
   *
   * Counts `task_topics` rows created since `context.scheduler.scheduleStartedAt`
   * (stamped by `TaskService.updateStatus` on user-initiated start/restart) and
   * compares against `config.schedule.maxExecutions`. Returns false when:
   *   - the task isn't in schedule mode
   *   - no cap is configured (null / 0)
   *   - no `scheduleStartedAt` is stamped (pre-PR tasks fall through; enforcement
   *     begins only after the user pauses + restarts)
   *
   * Mirrors the pre-tick check in `runScheduleTick` so a daily cron with
   * `maxExecutions=1` doesn't sit in `scheduled` for 24h after consuming
   * its single allowed run.
   */
  async scheduleCapReached(task: TaskItem): Promise<boolean> {
    if (task.automationMode !== 'schedule') return false;
    const scheduleConfig =
      ((task.config as { schedule?: { maxExecutions?: number | null } } | null) ?? {}).schedule ??
      {};
    const maxExecutions = scheduleConfig.maxExecutions ?? null;
    if (maxExecutions == null || maxExecutions <= 0) return false;

    const scheduler =
      ((task.context as { scheduler?: { scheduleStartedAt?: string } } | null) ?? {}).scheduler ??
      {};
    const startedAtIso = scheduler.scheduleStartedAt;
    if (!startedAtIso) return false;

    const runCount = await this.taskTopicModel.countByTask(task.id, {
      since: new Date(startedAtIso),
      // Only scheduled ticks consume the quota — manual "run now" invocations
      // are ad-hoc and must not push the task toward its cap.
      triggers: ['schedule'],
    });
    return runCount >= maxExecutions;
  }

  /**
   * Append a failure to the durable lifecycle audit trail
   * (`context.lifecycle`). Unlike the live `tasks.error` column — cleared by
   * the next successful run — this history survives a later success so a missed
   * fire / prior pause stays diagnosable after the fact.
   *
   * When `extra.pauseReason` is set, also stamps `lastPausedAt`/`lastPauseReason`
   * (the failure fuse just auto-paused the task). When `extra.consecutiveFailures`
   * is set, mirrors it into `context.scheduler` so the schedule fuse persists.
   */
  private async recordAutomationError(
    task: TaskItem,
    errorText: string,
    trigger: TaskRunTrigger,
    extra?: { consecutiveFailures?: number; pauseReason?: string },
    reservationId?: string,
  ): Promise<void> {
    const ctx = (task.context as { lifecycle?: TaskLifecycleAudit } | null) ?? {};
    const now = new Date().toISOString();

    const lifecycle: TaskLifecycleAudit = {
      errorCount: (ctx.lifecycle?.errorCount ?? 0) + 1,
      lastError: { at: now, message: errorText, trigger },
    };
    if (extra?.pauseReason) {
      lifecycle.lastPausedAt = now;
      lifecycle.lastPauseReason = extra.pauseReason;
    }

    const patch: Record<string, unknown> = { lifecycle };
    if (extra?.consecutiveFailures !== undefined) {
      patch.scheduler = { consecutiveFailures: extra.consecutiveFailures };
    }

    if (reservationId) {
      if (!(await this.taskModel.updateContextIfReservation(task.id, reservationId, patch))) {
        throw new TaskCompletionSupersededError();
      }
    } else {
      await this.taskModel.updateContext(task.id, patch);
    }
  }

  /**
   * Stamp a durable recovery marker when a successful automation tick clears a
   * prior error, and reset the consecutive-failure fuse. Only writes when the
   * task was actually in an error state — a clean run after a clean run is a
   * no-op so the audit stays low-noise.
   */
  private async recordAutomationRecovery(task: TaskItem, reservationId?: string): Promise<void> {
    const ctx = (task.context as { scheduler?: TaskSchedulerContext } | null) ?? {};
    const consecutiveFailures = ctx.scheduler?.consecutiveFailures ?? 0;
    const wasErrored = !!task.error || consecutiveFailures > 0;
    if (!wasErrored) return;

    const patch: Record<string, unknown> = {
      lifecycle: { lastRecoveredAt: new Date().toISOString() },
    };
    if (consecutiveFailures > 0) patch.scheduler = { consecutiveFailures: 0 };

    if (reservationId) {
      if (!(await this.taskModel.updateContextIfReservation(task.id, reservationId, patch))) {
        throw new TaskCompletionSupersededError();
      }
    } else {
      await this.taskModel.updateContext(task.id, patch);
    }
  }

  /**
   * Re-arm the next heartbeat tick after `onTopicComplete`.
   *
   * Skips when:
   *   - task is not in heartbeat mode or has no positive interval
   *   - task hit a terminal status (completed / canceled / failed)
   *   - an unresolved urgent brief exists for this task (human is waiting)
   *   - consecutive failures hit the fuse threshold (gives up until the user
   *     resolves the urgent error brief)
   */
  private async maybeRearmHeartbeat(
    task: TaskItem,
    reason: string,
    reservationId?: string,
  ): Promise<void> {
    if (task.automationMode !== 'heartbeat') return;
    if (!task.heartbeatInterval || task.heartbeatInterval <= 0) return;
    if (isTerminal(task.status)) return;

    const ctx = (task.context as { scheduler?: TaskSchedulerContext } | null) ?? {};
    const sched = ctx.scheduler ?? {};
    let consecutiveFailures = sched.consecutiveFailures ?? 0;

    if (reason === 'error') {
      consecutiveFailures += 1;
      if (consecutiveFailures >= AUTOMATION_FAILURE_FUSE) {
        log(
          'fuse blown: task=%s consecutiveFailures=%d — not re-arming',
          task.identifier,
          consecutiveFailures,
        );
        const patch = { scheduler: { consecutiveFailures } };
        if (reservationId) {
          if (!(await this.taskModel.updateContextIfReservation(task.id, reservationId, patch))) {
            throw new TaskCompletionSupersededError();
          }
        } else {
          await this.taskModel.updateContext(task.id, patch);
        }
        return;
      }
    } else if (reason === 'done') {
      consecutiveFailures = 0;
    }

    // Exclude `error` briefs from the human-waiting check: error briefs are
    // created on every error and are governed by the fuse counter above.
    // Without this exclusion, the urgent error brief from the *just-completed*
    // failure would block re-arm and the fuse threshold would be unreachable.
    if (await this.briefModel.hasUnresolvedUrgentByTask(task.id, { excludeTypes: ['error'] })) {
      log('skip re-arm: task=%s has unresolved urgent brief', task.identifier);
      const patch = { scheduler: { consecutiveFailures } };
      if (reservationId) {
        if (!(await this.taskModel.updateContextIfReservation(task.id, reservationId, patch))) {
          throw new TaskCompletionSupersededError();
        }
      } else {
        await this.taskModel.updateContext(task.id, patch);
      }
      return;
    }

    try {
      const scheduler = createTaskSchedulerModule();
      const tickRevision = (sched.tickRevision ?? 0) + 1;
      const tickToken = `heartbeat:task:${task.id}:revision:${tickRevision}`;

      // Cancel any prior tick (defensive — we usually wouldn't have one
      // pending here, since the prior tick has already fired to bring us
      // into onTopicComplete).
      if (sched.tickMessageId) {
        await scheduler.cancelScheduled(sched.tickMessageId).catch(() => undefined);
      }

      const tickMessageId = await scheduler.scheduleNextTopic({
        delay: task.heartbeatInterval,
        taskId: task.id,
        tickToken,
        userId: this.userId,
      });

      const schedulerPatch = {
        scheduler: {
          consecutiveFailures,
          scheduledAt: new Date().toISOString(),
          tickMessageId,
          tickRevision,
          tickToken,
        },
      };
      if (reservationId) {
        if (
          !(await this.taskModel.updateContextIfReservation(task.id, reservationId, schedulerPatch))
        ) {
          await scheduler.cancelScheduled(tickMessageId).catch(() => undefined);
          throw new TaskCompletionSupersededError();
        }
      } else {
        if (!(await this.taskModel.updateContextIfStatus(task.id, 'scheduled', schedulerPatch))) {
          await scheduler.cancelScheduled(tickMessageId).catch(() => undefined);
          return;
        }
      }

      log(
        're-armed task=%s delay=%ds messageId=%s',
        task.identifier,
        task.heartbeatInterval,
        tickMessageId,
      );
    } catch (e) {
      console.warn('[TaskLifecycle] re-arm failed:', e);
    }
  }

  /** Re-arm a Verify-bound heartbeat only after Verify releases its completion lease. */
  async rearmHeartbeatAfterVerify(taskId: string): Promise<void> {
    const task = await this.taskModel.findById(taskId);
    if (task?.status === 'scheduled') await this.maybeRearmHeartbeat(task, 'done');
  }

  /**
   * Generate handoff summary and update topic title via LLM.
   * Writes to task_topics handoff fields + updates topic title.
   */
  private async generateHandoff(
    taskId: string,
    taskIdentifier: string,
    topicId: string,
    lastAssistantContent: string,
    currentTask: any,
  ): Promise<void> {
    try {
      const [{ model, provider }, responseLanguage] = await Promise.all([
        (this.systemAgentService as any).getTaskModelConfig('topic'),
        this.systemAgentService.getUserLocale(),
      ]);

      const payload = chainTaskTopicHandoff({
        lastAssistantContent,
        responseLanguage,
        taskInstruction: currentTask?.instruction || '',
        taskName: currentTask?.name || taskIdentifier,
      });

      const modelRuntime = await initModelRuntimeFromDB(
        this.db,
        this.userId,
        provider,
        this.workspaceId,
      );
      const result = await modelRuntime.generateObject(
        {
          messages: payload.messages as any[],
          model,
          schema: { name: TASK_TOPIC_HANDOFF_SCHEMA_NAME, schema: TASK_TOPIC_HANDOFF_SCHEMA },
        },
        {
          metadata: { trigger: 'task_handoff' },
          tracing: {
            promptVersion: TASK_TOPIC_HANDOFF_PROMPT_VERSION,
            scenario: TRACING_SCENARIOS.TaskHandoff,
            schemaName: TASK_TOPIC_HANDOFF_SCHEMA_NAME,
          } satisfies TracingOptions,
        },
      );

      const handoff = result as {
        keyFindings?: string[];
        nextAction?: string;
        summary?: string;
        title?: string;
      };

      // Update topic title
      if (handoff.title) {
        await this.topicModel.update(topicId, { title: handoff.title });
      }

      // Store handoff in task_topics dedicated fields. `handoff.content` (the raw
      // last message) is persisted separately in onTopicComplete so it survives
      // even when this LLM synthesis throws.
      await this.taskTopicModel.updateHandoff(taskId, topicId, handoff);

      log('handoff generated for topic %s: title=%s', topicId, handoff.title);
    } catch (e) {
      console.warn('[TaskLifecycle] handoff generation failed:', e);
    }
  }

  /**
   * Programmatic brief synthesis for a completed topic.
   *
   * Fired only in `brief.mode === 'auto'` and only when neither the error nor
   * the judge path has already produced a brief. Two-stage decision:
   *  1. Rule layer (`shouldEmitTopicBrief`) — deterministic. Returns
   *     `'yes'` / `'no'` (caller persists the verdict and is done with the
   *     decision phase) or `'unknown'` (defer to LLM).
   *  2. LLM judge (`chainJudgeBriefEmit`) — semantic. Runs only on the
   *     `'unknown'` branch, returns `{emit, reason}` for content the rule
   *     can't classify (manual/non-scheduled topic with non-trivial output).
   *
   * The verdict (rule or LLM) is persisted to `taskTopics.handoff.briefDecision`
   * so the emit/skip outcome is auditable per topic. Generation
   * (`chainGenerateBrief`) is a separate LLM call that runs only when the
   * decision is `emit: true` — never wasting tokens drafting copy for a
   * brief that won't be persisted.
   *
   * Failures are swallowed — a missing brief should never block the task
   * lifecycle. The caller still proceeds to the post-tick state transition.
   */
  private async synthesizeTopicBrief(
    taskId: string,
    taskIdentifier: string,
    topicId: string,
    lastAssistantContent: string,
    reason: string,
    currentTask: TaskItem,
  ): Promise<void> {
    try {
      const reviewConfig = this.taskModel.getReviewConfig(currentTask);
      const decisionInput = {
        hasReviewConfigEnabled: !!reviewConfig?.enabled,
        isTrivialContent: isTrivialAssistantContent(lastAssistantContent),
        reason,
        // We've already returned upstream when reviewTerminated was true; the
        // remaining decision lives in shouldEmitTopicBrief itself.
        reviewTerminated: false,
        task: currentTask,
      };

      const ruleVerdict = shouldEmitTopicBrief(decisionInput);

      // Inputs needed by both the LLM judge (when ruleVerdict === 'unknown')
      // and by chainGenerateBrief (when emit ends up true). Hoisted so we
      // only fetch them once.
      const topicLink = await this.taskTopicModel.findByTopicId(topicId);
      const topicStartedAt = topicLink?.createdAt ?? new Date(0);
      const pinnedDocs = await this.taskModel.getDocumentsPinnedSince(taskId, topicStartedAt);
      const artifacts: BriefArtifacts = { documents: pinnedDocs };
      const handoff = (topicLink?.handoff as TaskTopicHandoff | null) ?? null;

      const [{ model, provider }, responseLanguage] = await Promise.all([
        (this.systemAgentService as any).getTaskModelConfig('topic'),
        this.systemAgentService.getUserLocale(),
      ]);

      let decision: BriefDecision;
      if (ruleVerdict.emit === 'unknown') {
        // Rule can't decide — ask the LLM judge. Title/summary are NOT
        // produced here; they come from chainGenerateBrief if emit=true.
        const judgePayload = chainJudgeBriefEmit({
          artifacts,
          handoff,
          lastAssistantContent,
          taskInstruction: currentTask.instruction || '',
          taskName: currentTask.name || taskIdentifier,
        });

        const modelRuntime = await initModelRuntimeFromDB(
          this.db,
          this.userId,
          provider,
          this.workspaceId,
        );
        const judgeResult = (await modelRuntime.generateObject(
          {
            messages: judgePayload.messages as any[],
            model,
            schema: { name: JUDGE_BRIEF_EMIT_SCHEMA_NAME, schema: JUDGE_BRIEF_EMIT_SCHEMA },
          },
          {
            metadata: { trigger: 'task_brief_judge' },
            tracing: {
              promptVersion: JUDGE_BRIEF_EMIT_PROMPT_VERSION,
              scenario: TRACING_SCENARIOS.TaskBriefJudge,
              schemaName: JUDGE_BRIEF_EMIT_SCHEMA_NAME,
            } satisfies TracingOptions,
          },
        )) as { emit?: boolean; reason?: string };

        decision = {
          decidedAt: new Date().toISOString(),
          emit: judgeResult.emit === true,
          model,
          reason: judgeResult.reason || 'llm-judge-unknown',
          source: 'llm-judge',
        };
      } else {
        decision = {
          decidedAt: new Date().toISOString(),
          emit: ruleVerdict.emit === 'yes',
          reason: ruleVerdict.reason,
          source: 'rule',
        };
      }

      // Persist the decision regardless of outcome — gives the operator a
      // per-topic audit trail of why a brief was or wasn't produced.
      await this.taskTopicModel.updateBriefDecision(taskId, topicId, decision);

      if (!decision.emit) {
        log(
          'synthesize: skip task=%s topic=%s source=%s reason=%s',
          taskIdentifier,
          topicId,
          decision.source,
          decision.reason,
        );
        return;
      }

      const briefType = selectBriefType(decisionInput);
      const priority = selectBriefPriority(decisionInput);

      const payload = chainGenerateBrief({
        artifacts,
        handoff,
        lastAssistantContent,
        responseLanguage,
        taskInstruction: currentTask.instruction || '',
        taskName: currentTask.name || taskIdentifier,
      });

      const modelRuntime = await initModelRuntimeFromDB(
        this.db,
        this.userId,
        provider,
        this.workspaceId,
      );
      const result = await modelRuntime.generateObject(
        {
          messages: payload.messages as any[],
          model,
          schema: { name: GENERATE_BRIEF_SCHEMA_NAME, schema: GENERATE_BRIEF_SCHEMA },
        },
        {
          metadata: { trigger: 'task_brief' },
          tracing: {
            promptVersion: GENERATE_BRIEF_PROMPT_VERSION,
            scenario: TRACING_SCENARIOS.TaskBrief,
            schemaName: GENERATE_BRIEF_SCHEMA_NAME,
          } satisfies TracingOptions,
        },
      );

      const generated = result as { summary?: string; title?: string };
      if (!generated.title || !generated.summary) {
        log(
          'synthesize: LLM returned empty title/summary task=%s topic=%s',
          taskIdentifier,
          topicId,
        );
        return;
      }

      // `result` briefs render a fixed approval UI and intentionally have no
      // default actions — see DEFAULT_BRIEF_ACTIONS comment.
      const actions = briefType === 'result' ? null : (DEFAULT_BRIEF_ACTIONS[briefType] ?? null);

      await this.briefModel.create({
        actions,
        agentId: currentTask.assigneeAgentId || undefined,
        artifacts,
        priority,
        summary: generated.summary,
        taskId,
        title: generated.title,
        topicId,
        trigger: 'task',
        type: briefType,
      });

      log('synthesize: brief created task=%s topic=%s type=%s', taskIdentifier, topicId, briefType);
    } catch (e) {
      console.warn('[TaskLifecycle] brief synthesis failed:', e);
    }
  }
}
