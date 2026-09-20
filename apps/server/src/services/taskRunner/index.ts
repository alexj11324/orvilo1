import { randomUUID } from 'node:crypto';

import { TaskIdentifier as TaskSkillIdentifier } from '@orvilo/builtin-skills';
import { AcceptanceEvidenceIdentifier } from '@orvilo/builtin-tool-acceptance-evidence';
import { BriefIdentifier } from '@orvilo/builtin-tool-brief';
import { INBOX_SESSION_ID } from '@orvilo/const';
import type {
  ExecAgentResult,
  TaskExecutionContract,
  TaskExecutionEnvironmentSnapshot,
  TaskItem,
  TaskRunTrigger,
  TaskTopicIntegration,
  WorkingDirConfig,
} from '@orvilo/types';
import { TRPCError } from '@trpc/server';
import debug from 'debug';

import { TopicTrigger } from '@/const/topic';
import { AgentModel } from '@/database/models/agent';
import { BriefModel } from '@/database/models/brief';
import { TaskModel } from '@/database/models/task';
import { isTaskDependencyBlocked, TaskDependencyError } from '@/database/models/taskDependency';
import { TaskTopicModel } from '@/database/models/taskTopic';
import type { OrviloDatabase } from '@/database/type';
import { AgentDelegationService } from '@/server/services/agentDelegation';
import { AiAgentService } from '@/server/services/aiAgent';
import {
  type PreparedTaskDispatch,
  TaskDispatchConflictError,
  TaskDispatchService,
  TaskDispatchWaitingError,
} from '@/server/services/taskDispatch';
import { TaskLifecycleService } from '@/server/services/taskLifecycle';
import { type ProvisionedWorkspace, TaskWorkspaceService } from '@/server/services/taskWorkspace';

import { buildTaskExecutionContract } from './buildTaskExecutionContract';
import { buildTaskPrompt } from './buildTaskPrompt';
import { taskRunIdempotencyKey } from './idempotency';

const log = debug('task-runner');
const RUN_KICKOFF_CLAIM_TTL_MS = 15 * 60 * 1000;

export interface RunTaskParams {
  continueTopicId?: string;
  /**
   * Delegated execution: the validated execution grant this run consumes.
   * The run executes as `agentId` — the delegate the grant was minted for —
   * never the task's stored assignee or the inbox fallback, and its
   * task_topics run row is epoch-fenced to `grantId` so a superseded
   * delegation cannot commit.
   */
  delegation?: { agentId: string; grantId: string };
  extraPrompt?: string;
  /** Stable identity supplied by the originating command or scheduler tick. */
  idempotencyKey?: string;
  /**
   * Workspace-integration record persisted on this run's task_topics row —
   * set by the workspace provisioner or by TaskIntegrationService when it
   * dispatches a corrective merge run.
   */
  integrationSeed?: TaskTopicIntegration;
  /** Optional per-operation cap. Omitted means the agent runtime remains uncapped. */
  maxSteps?: number;
  /** Parent delivery operation for internal corrective runs. */
  parentOperationId?: string;
  planRevision?: number;
  /** Atomically transfer a completion lease into this continuation dispatch. */
  replaceReservationId?: string;
  requestedBy?: string;
  /** Internal corrective runs stay bound to the original task Verify plan. */
  skipTaskVerification?: boolean;
  taskId: string;
  /**
   * What triggered this run. Defaults to `'manual'` — the ad-hoc "run now"
   * path (TRPC `task.run`, agent `runTask` tool). The scheduler ticks pass
   * `'schedule'` / `'heartbeat'` so the lifecycle can tell an ad-hoc run apart
   * from an automation tick ().
   */
  trigger?: TaskRunTrigger;
  /**
   * Pin the run's topic workspace directly, bypassing workspace provisioning —
   * used by TaskIntegrationService to run a corrective merge inside the shared
   * integration worktree (device) or against a remote clone (sandbox).
   */
  workspaceOverride?: {
    /**
     * GitHub repos the topic must carry for the cloud sandbox to pre-clone
     * (sandbox-contract integrator runs only).
     */
    repos?: string[];
    workingDirectory: string;
    workingDirectoryConfig: WorkingDirConfig;
  };
}

export interface RunTaskResult extends ExecAgentResult {
  taskId: string;
  taskIdentifier: string;
}

/**
 * TaskRunnerService — orchestrates a single Task run.
 *
 * Used by:
 *   - `task.run` TRPC mutation (user-triggered)
 *   - `heartbeat-tick` workflow handler (QStash self-rescheduling)
 */
export class TaskRunnerService {
  private agentModel: AgentModel;
  private briefModel: BriefModel;
  private db: OrviloDatabase;
  private delegationService: AgentDelegationService;
  private taskLifecycle: TaskLifecycleService;
  private taskDispatch: TaskDispatchService;
  private taskModel: TaskModel;
  private taskTopicModel: TaskTopicModel;
  private taskWorkspace: TaskWorkspaceService;
  private userId: string;

  private workspaceId?: string;

  constructor(db: OrviloDatabase, userId: string, workspaceId?: string) {
    this.db = db;
    this.userId = userId;
    this.workspaceId = workspaceId;
    this.agentModel = new AgentModel(db, userId, workspaceId);
    this.taskModel = new TaskModel(db, userId, workspaceId);
    this.taskTopicModel = new TaskTopicModel(db, userId, workspaceId);
    this.briefModel = new BriefModel(db, userId, workspaceId);
    this.delegationService = new AgentDelegationService(db, userId, workspaceId);
    this.taskLifecycle = new TaskLifecycleService(db, userId, workspaceId);
    this.taskDispatch = new TaskDispatchService(db, workspaceId);
    this.taskWorkspace = new TaskWorkspaceService(db, userId, workspaceId);
  }

  async runTask(params: RunTaskParams): Promise<RunTaskResult> {
    const {
      taskId: idOrIdentifier,
      continueTopicId,
      delegation,
      extraPrompt,
      integrationSeed,
      idempotencyKey,
      maxSteps,
      parentOperationId,
      planRevision,
      replaceReservationId,
      requestedBy = this.userId,
      skipTaskVerification,
      trigger = 'manual',
      workspaceOverride,
    } = params;

    const resolvedTask = await this.taskModel.resolve(idOrIdentifier);
    if (!resolvedTask) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
    }
    let task: TaskItem = resolvedTask;

    // Settlement/corrective runs (integration merges, delivery-review fixes,
    // reservation takeovers) carry verifiable markers — they continue work an
    // earlier dispatch already started, so the CAID admission gate must not
    // count them as new orchestrated claims.
    const internalSettlement = Boolean(
      workspaceOverride ||
      integrationSeed ||
      replaceReservationId ||
      parentOperationId ||
      skipTaskVerification,
    );

    // Automated callers must provide a durable command identity. Manual
    // callers retain one-request-per-click behavior for older clients.
    const resolvedIdempotencyKey =
      idempotencyKey ?? (trigger === 'manual' ? `manual:${task.id}:${randomUUID()}` : undefined);
    if (!resolvedIdempotencyKey) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Task runs triggered by ${trigger} require a stable idempotency key`,
      });
    }

    // Preflight before assignment/provisioning; reserveRun repeats this check
    // under the dependency graph lock so a concurrent edit cannot bypass it.
    if (!(await this.taskModel.areAllDependenciesCompleted(task.id))) {
      throw new TaskDependencyError(
        'Complete all prerequisite tasks before starting this task.',
        'PRECONDITION_FAILED',
      );
    }

    // The token is the only authority to release or roll back this dispatch.
    // A later generation replaces it, so a slow failure cannot pause that run.
    const reservationId = randomUUID();
    let ownsReservation = false;
    let dispatchedOperationId: string | undefined;
    let dispatchedTopicId: string | undefined;
    let dispatchService: AiAgentService | undefined;
    let provisioned: ProvisionedWorkspace | undefined;
    let provisionedRegistered = false;
    // Keep the legacy kickoff claim until the task-row reservation and topic
    // registration both settle; the two fences protect different rollout
    // generations during the watchdog transition.
    const kickoffClaimToken = randomUUID();
    let ownsKickoffClaim = false;
    let preparedDispatch: PreparedTaskDispatch | undefined;
    let runtimeDispatchStarted = false;

    // Persist the executing agent's model snapshot before the dispatch
    // contract is captured. updateTaskConfig is a task policy mutation; doing
    // it after prepare() would advance policyRevision and make this same run
    // look stale at the first dispatch transition. A delegated run executes
    // as the grant's agent — pin ITS model, not the stored assignee's.
    const modelSnapshotAgentId = delegation?.agentId ?? task.assigneeAgentId;
    if (modelSnapshotAgentId) {
      const taskConfig = (task.config ?? {}) as Record<string, unknown>;
      if (typeof taskConfig.model !== 'string' || typeof taskConfig.provider !== 'string') {
        const snapshot = await this.agentModel.getAgentModelConfig(modelSnapshotAgentId);
        if (snapshot) {
          const updated = await this.taskModel.updateTaskConfig(task.id, snapshot);
          if (updated) task = updated;
        }
      }
    }

    try {
      try {
        preparedDispatch = await this.taskDispatch.prepare({
          idempotencyKey: resolvedIdempotencyKey,
          // Execution origin for the shared admission boundary. `internal`
          // covers settlement/corrective runs (verify markers, not caller
          // claims); anything else reaching a CAID-orchestrated trigger is a
          // new orchestrated writer and must pass the rollout gate.
          origin: internalSettlement
            ? 'internal'
            : trigger === 'orchestrator' || trigger === 'goal'
              ? 'caid'
              : 'external',
          planRevision,
          requestedBy,
          task,
          trigger,
        });
      } catch (error) {
        if (error instanceof TaskDispatchConflictError) {
          throw new TRPCError({ code: 'CONFLICT', message: error.message });
        }
        if (error instanceof TaskDispatchWaitingError) {
          // Keep the typed cause: callers like the completion cascade treat a
          // held dispatch differently from a hard failure — the task must stay
          // claimable, not get relabeled paused-with-error.
          throw new TRPCError({
            cause: error,
            code: 'PRECONDITION_FAILED',
            message: error.message,
          });
        }
        throw error;
      }
      // prepare() re-reads and locks the Task. Continue only with that
      // authoritative assignee/revision snapshot, never the earlier resolve.
      task = preparedDispatch!.task;

      // A delegated run executes as the grant's agent — the task's stored
      // assignee and the inbox fallback are never substitutes for the
      // delegate the grant was minted for.
      let executingAgentId = delegation?.agentId ?? task.assigneeAgentId;
      if (!executingAgentId) {
        const inboxAgent = await this.agentModel.getBuiltinAgent(INBOX_SESSION_ID);
        if (!inboxAgent) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to resolve fallback inbox agent for task',
          });
        }
        // A human-assigned task still executes via the inbox agent, but the
        // fallback must stay ephemeral — persisting it would silently replace
        // the member assignment on the first run.
        if (!task.assigneeUserId) {
          // Goes through the logging path like every other assignee write: the
          // chip visibly flips from unassigned to the inbox agent, so the feed
          // has to be able to say who did it. No actor — nobody asked for this
          // one, the runner needed an agent to execute with.
          await this.taskModel.updateWithLog(task.id, { assigneeAgentId: inboxAgent.id }, {});
        }
        task.assigneeAgentId = inboxAgent.id;
        executingAgentId = inboxAgent.id;
        await this.taskDispatch.transition(preparedDispatch!, {
          agentId: inboxAgent.id,
          expected: ['claimed'],
          phase: 'claimed',
        });
      }

      ownsKickoffClaim = await this.taskModel.claimRunKickoff(
        task.id,
        kickoffClaimToken,
        new Date(Date.now() - RUN_KICKOFF_CLAIM_TTL_MS),
      );
      if (!ownsKickoffClaim) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Another run is already starting for this task.',
        });
      }

      let existingTopics = await this.taskTopicModel.findByTaskId(task.id);

      // Recover expired runs before deciding whether another run conflicts.
      // The previous ordering rejected every stale `running` topic first, so
      // the timeout cleanup below was unreachable for the case it existed to
      // repair. Re-read after the conditional update so concurrent callers all
      // make their decision from the persisted state.
      if (task.lastHeartbeatAt && task.heartbeatTimeout) {
        const elapsed = (Date.now() - new Date(task.lastHeartbeatAt).getTime()) / 1000;
        if (elapsed > task.heartbeatTimeout) {
          await this.taskTopicModel.timeoutRunning(task.id);
          existingTopics = await this.taskTopicModel.findByTaskId(task.id);
        }
      }

      // Recover a dead generation before checking for an in-flight topic. The
      // old ordering rejected on the stale running row first, so timeout
      // cleanup below was unreachable precisely when it was needed.
      if (task.lastHeartbeatAt && task.heartbeatTimeout) {
        const now = Date.now();
        const elapsed = (now - new Date(task.lastHeartbeatAt).getTime()) / 1000;
        const hasRunningTopic = existingTopics.some((topic) => topic.status === 'running');
        const hasActiveReservation =
          Boolean(task.runReservationId) &&
          !!task.runReservationExpiresAt &&
          new Date(task.runReservationExpiresAt).getTime() > now;
        if (
          task.status === 'running' &&
          (hasRunningTopic || hasActiveReservation) &&
          elapsed > task.heartbeatTimeout
        ) {
          // A stale heartbeat is evidence that the run needs attention, not
          // proof that its external writer has stopped. Starting a replacement
          // here can put two agents in the same delivery pipeline. Keep the
          // durable generation authoritative until its operation is explicitly
          // cancelled and confirmed stopped.
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'The previous run timed out and must be stopped before retrying.',
          });
        }
      }
      const continuedTopic = continueTopicId
        ? existingTopics.find((topic) => topic.topicId === continueTopicId)
        : undefined;

      if (continueTopicId) {
        if (continuedTopic?.status === 'running') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Topic ${continueTopicId} is already running.`,
          });
        }
      } else {
        const runningTopic = existingTopics.find((t) => t.status === 'running');
        if (runningTopic) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Task already has a running topic (${runningTopic.topicId}). Cancel it first or use --continue.`,
          });
        }
      }

      // The task row is the single run reservation. This conditional update is
      // the concurrency boundary: only one invocation may provision a
      // worktree or dispatch an agent for a non-running task.
      const reserved = await this.taskModel.reserveRun(
        task.id,
        reservationId,
        new Date(),
        undefined,
        replaceReservationId,
      );
      if (!reserved) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Task already has a run being prepared or in flight.',
        });
      }
      ownsReservation = true;
      // Workspace provisioning (CAID isolation): a fresh run on a
      // workspace-bound task gets its own git worktree on the bound device —
      // or, when no device exists and the run resolves to the cloud sandbox,
      // the remote contract (pre-cloned repo + task branch + push/PR). A
      // `workspaceOverride` (corrective merge runs) skips provisioning — the
      // caller already owns the workspace description. Runs before prompt
      // building so the contract can ride into the prompt via extraPrompt.
      if (!workspaceOverride && !continueTopicId) {
        try {
          await this.taskDispatch.transition(preparedDispatch!, {
            expected: ['claimed'],
            phase: 'provisioning',
          });
          provisioned = await this.taskWorkspace.provision({
            dispatchId: preparedDispatch!.dispatch.id,
            generation: preparedDispatch!.dispatch.generation,
            seq: (task.totalTopics || 0) + 1,
            task,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Workspace provisioning failed';
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message });
        }
      }

      // A continuation inherits the persisted contract content: instruction,
      // verify gate and dependency receipts re-render from the contract, so
      // editing the Task mid-flight cannot silently rewrite this attempt.
      // Changing constraints requires a new contract revision — a fresh run.
      const inheritedContractContent =
        continueTopicId && continuedTopic?.contract?.content
          ? continuedTopic.contract.content
          : undefined;
      const {
        acceptanceEnabled,
        contractContent,
        fileIds: attachmentFileIds,
        goalLoop,
        prompt,
      } = await buildTaskPrompt(
        task,
        {
          briefModel: this.briefModel,
          db: this.db,
          taskModel: this.taskModel,
          taskTopicModel: this.taskTopicModel,
          userId: this.userId,
          workspaceId: this.workspaceId,
        },
        [extraPrompt, provisioned?.prompt].filter(Boolean).join('\n\n') || undefined,
        { contractContent: inheritedContractContent },
      );

      const agentRef = executingAgentId;
      const isSlug = !agentRef.startsWith('agt_');

      const aiAgentService = new AiAgentService(this.db, this.userId, {
        workspaceId: this.workspaceId,
      });
      dispatchService = aiAgentService;
      const taskId = task.id;
      const taskIdentifier = task.identifier;
      const taskLifecycle = this.taskLifecycle;
      const userId = this.userId;
      let registrationComplete = false;
      // Fencing token claimed on this run's task_topics row for a delegated
      // run; asserted just before the registration commits (below).
      let delegatedEpoch: number | undefined;
      let earlyCompletion:
        | {
            dispatchFence?: number;
            dispatchId?: string;
            errorCode?: string;
            errorMessage?: string;
            executionGeneration?: number;
            lastAssistantContent?: string;
            operationId: string;
            reason: string;
            topicId?: string;
          }
        | undefined;
      const handleCompletion = async (event: NonNullable<typeof earlyCompletion>) => {
        await taskLifecycle.onTopicComplete({
          dispatchFence: event.dispatchFence,
          dispatchId: event.dispatchId,
          errorCode: event.errorCode,
          errorMessage: event.errorMessage,
          executionGeneration: event.executionGeneration,
          lastAssistantContent: event.lastAssistantContent,
          operationId: event.operationId,
          reason: event.reason,
          runTrigger: trigger,
          taskId,
          taskIdentifier,
          topicId: event.topicId,
        });
      };

      const checkpoint = this.taskModel.getCheckpointConfig(task);
      const reviewConfig = this.taskModel.getReviewConfig(task);
      // Default mode is 'auto' — brief synthesis happens programmatically in
      // TaskLifecycleService.synthesizeTopicBrief. 'agent' is an explicit
      // escape hatch that re-mounts the legacy createBrief tool surface.
      const briefMode = (
        (task.config as { brief?: { mode?: string } } | null)?.brief?.mode === 'agent'
          ? 'agent'
          : 'auto'
      ) as 'agent' | 'auto';
      const pluginIds = [TaskSkillIdentifier];
      // Mount BriefIdentifier (createBrief + requestCheckpoint) only in the
      // legacy 'agent' path; in 'auto' the agent must not also call
      // createBrief or we'd double up.
      if (briefMode === 'agent' && !reviewConfig?.enabled && checkpoint.onAgentRequest !== false) {
        pluginIds.push(BriefIdentifier);
      }
      // The Acceptance runs inside the Task, so the builder needs listCriteria +
      // submitEvidence for the whole run — not only in the post-run evidence
      // turn, which mounts this tool exclusively and therefore can only ever
      // restate text it already wrote.
      if (acceptanceEnabled) pluginIds.push(AcceptanceEvidenceIdentifier);

      const taskConfig = (task.config ?? {}) as Record<string, unknown>;

      const initialWorkingDirectory =
        workspaceOverride?.workingDirectory ?? provisioned?.workingDirectory;
      const initialWorkingDirectoryConfig =
        workspaceOverride?.workingDirectoryConfig ?? provisioned?.workingDirectoryConfig;
      const initialRepos = workspaceOverride?.repos ?? provisioned?.repos;
      const runIntegration = integrationSeed ?? provisioned?.integration;
      const environmentSnapshot: TaskExecutionEnvironmentSnapshot = {
        branch: runIntegration?.branch,
        deviceId: runIntegration?.deviceId,
        repo: runIntegration?.repo,
        workingDirectory: initialWorkingDirectory ?? initialWorkingDirectoryConfig?.path,
      };

      // Freeze the run contract alongside the environment snapshot — retries,
      // continuations and corrective runs rebind to this persisted row rather
      // than re-deriving constraints from mutable task config.
      // Contract lineage: a continuation descends from the continued topic's
      // contract; a fresh repair/retry still binds the previous attempt's
      // contract as its source so `sourceContractId` always names the prior
      // policy this run replaces.
      const priorContract = (continuedTopic?.contract ??
        [...existingTopics].sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0)).find((t) => t.contract)
          ?.contract) as TaskExecutionContract | undefined;
      const executionContract = buildTaskExecutionContract(task, {
        acceptanceEnabled,
        content: contractContent,
        contractId: randomUUID(),
        contractRevision: (priorContract?.revision ?? 0) + 1,
        dispatch: preparedDispatch!.dispatch,
        sourceContractId: priorContract?.contractId,
        environment: environmentSnapshot,
        goalLoop,
        grantId: delegation?.grantId,
        integration: runIntegration,
        tools: pluginIds,
      });

      log('runTask: %s (continue=%s)', taskIdentifier, continueTopicId);

      await this.taskDispatch.transition(preparedDispatch!, {
        environmentSnapshot,
        expected: ['claimed', 'provisioning'],
        phase: 'dispatched',
      });
      let taskTopicStarted = false;

      if (!(await this.taskModel.renewRunReservation(task.id, reservationId))) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Task run reservation expired before dispatch.',
        });
      }

      const result = await aiAgentService.execAgent({
        ...(isSlug ? { slug: agentRef } : { agentId: agentRef }),
        // Task contract tools are admission requirements, not hints: a run
        // whose evidence/brief surface cannot mount must be refused before
        // dispatch instead of executing without them. Sourced from the
        // persisted contract so admission and the contract cannot diverge.
        requiredToolIds: executionContract.tools,
        ...(typeof taskConfig.model === 'string' && { model: taskConfig.model }),
        ...(typeof taskConfig.provider === 'string' && { provider: taskConfig.provider }),
        skipTaskVerification,
        beforeOperationStart: async ({ operationId, topicId }) => {
          await this.db.transaction(async (tx) => {
            const dispatch = new TaskDispatchService(tx, this.workspaceId);
            const taskModel = new TaskModel(tx, this.userId, this.workspaceId);
            const taskTopicModel = new TaskTopicModel(tx, this.userId, this.workspaceId);

            // Revalidate the task reservation in the same transaction that
            // publishes the running topic. A concurrent terminal cascade
            // locks and clears this reservation before changing status, so a
            // dispatched operation cannot register after cancellation wins.
            if (!(await taskModel.renewRunReservation(task.id, reservationId))) {
              throw new TRPCError({
                code: 'CONFLICT',
                message: 'Task run reservation was lost before operation registration.',
              });
            }
            await dispatch.transition(preparedDispatch!, {
              environmentSnapshot,
              expected: ['dispatched'],
              operationId,
              phase: 'running',
            });
            await taskTopicModel.startRun(task.id, topicId, {
              contract: executionContract,
              dispatch: {
                ...preparedDispatch!.dispatch,
                fence: preparedDispatch!.fence,
              },
              environmentSnapshot,
              integration: runIntegration,
              operationId,
              seq: continuedTopic?.seq ?? (task.totalTopics || 0) + 1,
              trigger,
            });
            // Bind the run row to the grant inside the same commit that
            // creates it — the epoch never exists unbound for a delegated run.
            if (delegation) {
              delegatedEpoch = await this.delegationService.claimExecutionEpoch(
                { grantId: delegation.grantId, taskId: task.id, topicId },
                tx,
              );
            }
            if (!continueTopicId) await taskModel.incrementTopicCount(task.id);
            await taskModel.updateCurrentTopic(task.id, topicId);
          });
          taskTopicStarted = true;
          runtimeDispatchStarted = true;
        },
        hooks: [
          {
            handler: async (event) => {
              const completion = {
                dispatchFence: preparedDispatch!.fence,
                dispatchId: preparedDispatch!.dispatch.id,
                errorCode: event.errorType,
                errorMessage: event.errorMessage,
                executionGeneration: preparedDispatch!.dispatch.generation,
                lastAssistantContent: event.lastAssistantContent,
                operationId: event.operationId,
                reason:
                  event.reason === 'max_steps' || event.reason === 'cost_limit'
                    ? 'done'
                    : event.reason || 'done',
                topicId: event.topicId,
              };
              if (!registrationComplete) {
                earlyCompletion = completion;
                return;
              }
              await handleCompletion(completion);
            },
            id: 'task-on-complete',
            type: 'onComplete' as const,
            webhook: {
              // `runTrigger` rides in the static body so the production webhook
              // callback (which reconstructs onTopicComplete params server-side)
              // knows whether this was a manual run or an automation tick.
              body: {
                dispatchFence: preparedDispatch!.fence,
                dispatchId: preparedDispatch!.dispatch.id,
                executionGeneration: preparedDispatch!.dispatch.generation,
                runTrigger: trigger,
                taskId,
                taskIdentifier,
                userId,
              },
              delivery: 'hatchet' as const,
              fallback: 'none' as const,
              url: '/api/workflows/task/on-topic-complete',
            },
          },
        ],
        ...(attachmentFileIds.length > 0 ? { fileIds: attachmentFileIds } : {}),
        ...(maxSteps ? { maxSteps } : {}),
        ...(parentOperationId ? { parentOperationId } : {}),
        prompt,
        taskId: task.id,
        title: extraPrompt ? extraPrompt.slice(0, 100) : task.name || task.identifier,
        trigger: TopicTrigger.RunTask,
        userInterventionConfig: { approvalMode: 'headless' },
        appContext: {
          dispatchFence: preparedDispatch!.fence,
          dispatchId: preparedDispatch!.dispatch.id,
          executionGeneration: preparedDispatch!.dispatch.generation,
          ...(continueTopicId ? { topicId: continueTopicId } : {}),
          ...((initialWorkingDirectory ||
            initialWorkingDirectoryConfig ||
            initialRepos?.length) && {
            initialTopicMetadata: {
              ...(initialRepos?.length ? { repos: initialRepos } : {}),
              ...(initialWorkingDirectory ? { workingDirectory: initialWorkingDirectory } : {}),
              ...(initialWorkingDirectoryConfig
                ? { workingDirectoryConfig: initialWorkingDirectoryConfig }
                : {}),
            },
          }),
        },
      });
      dispatchedOperationId = result.operationId;
      dispatchedTopicId = result.topicId;
      if (!(await this.taskModel.renewRunReservation(task.id, reservationId))) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Task run reservation was lost during dispatch.',
        });
      }

      // Register the dispatched topic as a visible run attempt — shared by
      // the outcome_unknown park and the confirmed-failure path below.
      const registerDispatchedAttempt = async () => {
        if (!result.topicId || taskTopicStarted) return;
        await this.taskModel.updateCurrentTopic(task.id, result.topicId);
        await this.taskTopicModel.startRun(task.id, result.topicId, {
          contract: executionContract,
          dispatch: {
            ...preparedDispatch!.dispatch,
            fence: preparedDispatch!.fence,
          },
          environmentSnapshot,
          integration: runIntegration,
          operationId: result.operationId,
          seq: continuedTopic?.seq ?? (task.totalTopics || 0) + 1,
          trigger,
        });
        if (delegation) {
          try {
            delegatedEpoch = await this.delegationService.claimExecutionEpoch({
              grantId: delegation.grantId,
              taskId: task.id,
              topicId: result.topicId,
            });
          } catch (claimError) {
            // The topic row already says 'running' — a grant that died
            // between validateGrantForRun and registration must still settle
            // it, or the row lingers until the watchdog reaps it. Dispatch
            // settle/reservation bookkeeping stays with the outer catch.
            await this.taskTopicModel
              .updateStatus(task.id, result.topicId, 'failed')
              .catch(() => {});
            throw claimError;
          }
        }
        provisionedRegistered = true;
        if (!continueTopicId) await this.taskModel.incrementTopicCount(task.id);
        taskTopicStarted = true;
      };

      if (result.remoteAdmission === 'unknown') {
        // The device may still be executing — this is not a confirmed
        // failure. Keep the topic run open, park the dispatch at
        // outcome_unknown, release the kickoff claims, and let the host's
        // terminal callback or the reconciler settle it. Marking it failed
        // here would orphan a possibly-live writer.
        await registerDispatchedAttempt();
        await this.taskDispatch.transition(preparedDispatch!, {
          expected: ['dispatched', 'running', 'waiting', 'outcome_unknown'],
          operationId: result.operationId,
          phase: 'outcome_unknown',
          waitingReason:
            result.message || 'Dispatch acknowledgement lost; run may still be executing',
        });
        await this.taskModel.updateHeartbeat(task.id);
        registrationComplete = true;
        // A host that completed while the ack was still in flight buffered its
        // completion in `earlyCompletion` — replay it now that registration is
        // durable so the topic run and dispatch actually settle.
        if (earlyCompletion) await handleCompletion(earlyCompletion);
        await this.taskModel.releaseRunReservation(task.id, reservationId);
        ownsReservation = false;
        await this.taskModel
          .releaseRunKickoff(task.id, kickoffClaimToken)
          .catch((releaseError) =>
            log('runTask: failed to release kickoff claim for %s — %O', task.id, releaseError),
          );
        ownsKickoffClaim = false;
        return {
          ...result,
          taskId: task.id,
          taskIdentifier: task.identifier,
        };
      }

      if (!result.success) {
        // execAgent reports a dispatch or startup failure as a result rather
        // than a throw (`startOperation`, `heteroDispatch`): the assistant
        // bubble already carries the error and the run's lifecycle hooks have
        // fired. Booking that dead operation as a running topic would leave
        // the Task looking in flight — a goal coordinator would even record a
        // `started_run` for it — with nothing left to ever settle it. Keep the
        // attempt visible as a failed run, then fail the kickoff like any other.
        await registerDispatchedAttempt();
        if (result.topicId) {
          await this.taskTopicModel.updateStatus(task.id, result.topicId, 'failed');
        }
        await this.taskDispatch.settle(preparedDispatch!, 'failed');
        runtimeDispatchStarted = false;
        throw new Error(result.error || result.message || 'Agent run failed to start');
      }

      if (!taskTopicStarted) {
        if (!result.topicId) throw new Error('Agent run started without a topic id');
        await this.db.transaction(async (tx) => {
          const dispatch = new TaskDispatchService(tx, this.workspaceId);
          const taskModel = new TaskModel(tx, this.userId, this.workspaceId);
          const taskTopicModel = new TaskTopicModel(tx, this.userId, this.workspaceId);

          if (!(await taskModel.renewRunReservation(task.id, reservationId))) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'Task run reservation was lost before operation registration.',
            });
          }
          await dispatch.transition(preparedDispatch!, {
            environmentSnapshot,
            expected: ['dispatched'],
            operationId: result.operationId,
            phase: 'running',
          });
          await taskModel.updateCurrentTopic(task.id, result.topicId);
          await taskTopicModel.startRun(task.id, result.topicId, {
            dispatch: { ...preparedDispatch!.dispatch, fence: preparedDispatch!.fence },
            environmentSnapshot,
            integration: runIntegration,
            operationId: result.operationId,
            seq: continuedTopic?.seq ?? (task.totalTopics || 0) + 1,
            trigger,
          });
          if (delegation) {
            delegatedEpoch = await this.delegationService.claimExecutionEpoch(
              {
                grantId: delegation.grantId,
                taskId: task.id,
                topicId: result.topicId,
              },
              tx,
            );
          }
          if (!continueTopicId) await taskModel.incrementTopicCount(task.id);
        });
        taskTopicStarted = true;
        runtimeDispatchStarted = true;
        provisionedRegistered = true;
      }
      // Commit fence for delegated runs: the epoch claimed on this run's
      // task_topics row must still be current AND the grant still live before
      // the registration becomes durable — a superseding delegation fences
      // this dispatch off here, and a revoke/expiry/membership loss that
      // landed after the claim is caught by the grant revalidation inside
      // assertMayCommit. The catch below interrupts the orphan.
      if (delegation) {
        if (delegatedEpoch === undefined || !dispatchedTopicId) {
          throw new Error('Delegated run registered no execution epoch');
        }
        await this.delegationService.assertMayCommit({
          epoch: delegatedEpoch,
          grantId: delegation.grantId,
          taskId: task.id,
          topicId: dispatchedTopicId,
        });
      }
      await this.taskModel.updateHeartbeat(task.id);
      registrationComplete = true;
      if (earlyCompletion) await handleCompletion(earlyCompletion);
      await this.taskModel.releaseRunReservation(task.id, reservationId);
      ownsReservation = false;
      await this.taskModel
        .releaseRunKickoff(task.id, kickoffClaimToken)
        .catch((releaseError) =>
          log('runTask: failed to release kickoff claim for %s — %O', task.id, releaseError),
        );
      ownsKickoffClaim = false;

      return {
        ...result,
        taskId: task.id,
        taskIdentifier: task.identifier,
      };
    } catch (error) {
      if (preparedDispatch) {
        try {
          if (runtimeDispatchStarted) {
            await this.taskDispatch.transition(preparedDispatch, {
              expected: ['dispatched', 'running'],
              phase: 'outcome_unknown',
              waitingReason: error instanceof Error ? error.message : 'Dispatch outcome unknown',
            });
          } else {
            await this.taskDispatch.settle(preparedDispatch, 'failed');
          }
        } catch {
          // Preserve the original runner error; recovery will reconcile the dispatch.
        }
      }
      if (ownsKickoffClaim) {
        await this.taskModel
          .releaseRunKickoff(task.id, kickoffClaimToken)
          .catch((releaseError) =>
            log('runTask: failed to release kickoff claim for %s — %O', task.id, releaseError),
          );
      }
      // A dispatch can succeed before the task-topic registration write. Keep
      // that provisioned worktree until the operation has physically stopped;
      // deleting it first lets a still-running device command write into (or
      // recreate) a path that is no longer owned by the task.
      const requiresPhysicalExitConfirmation = Boolean(provisioned?.integration.deviceId);
      let orphanInterruptionConfirmed = !dispatchedOperationId;
      if (dispatchedOperationId && dispatchService) {
        try {
          const interruption = await dispatchService.interruptTask({
            operationId: dispatchedOperationId,
            topicId: dispatchedTopicId,
          });
          // Prefer the P20 cancel tri-state when present: only `confirmed`
          // satisfies a physical-exit requirement; `unknown` (signal never
          // provably landed) must preserve the worktree either way.
          orphanInterruptionConfirmed =
            interruption.success &&
            (interruption.cancelState !== undefined
              ? requiresPhysicalExitConfirmation
                ? interruption.cancelState === 'confirmed'
                : interruption.cancelState !== 'unknown'
              : requiresPhysicalExitConfirmation
                ? interruption.deviceCancellationConfirmed === true
                : interruption.deviceCancellationConfirmed !== false);
          if (!orphanInterruptionConfirmed) {
            log(
              'runTask: orphaned operation %s did not confirm interruption; preserving worktree',
              dispatchedOperationId,
            );
          }
        } catch (interruptError) {
          log(
            'runTask: failed to interrupt orphaned operation %s — %O',
            dispatchedOperationId,
            interruptError,
          );
        }
      }

      if (provisioned && !provisionedRegistered && orphanInterruptionConfirmed) {
        await this.taskWorkspace
          .discardUnregistered(provisioned)
          .catch((cleanupError) =>
            log('runTask: failed to remove unregistered task worktree — %O', cleanupError),
          );
      }
      if (ownsReservation) {
        try {
          const errorText = error instanceof Error ? error.message : 'Unknown error';
          // A failed kickoff must not kill an automation task's schedule. The
          // token-fenced update is a no-op if another generation took over.
          await this.taskModel.failRunReservation(
            task.id,
            reservationId,
            task.automationMode ? 'scheduled' : 'paused',
            errorText,
          );
        } catch {
          // Rollback itself failed, ignore
        }
      }

      throw error;
    }
  }

  /**
   * Result of cascading kickoff after a task transitions to `completed`.
   * Mirrors the legacy unlock-only response so callers can keep their
   * payload shape unchanged.
   */
  static cascadeEmpty(): CascadeResult {
    return { failed: [], paused: [], started: [] };
  }

  /**
   * After a task transitions to `completed`, find downstream tasks whose
   * dependencies are now fully met and *actually run them*.
   *
   * Why this matters: the legacy code path flipped unlocked tasks to `running`
   * in the DB but never created a topic — so they appeared running while no
   * agent execution was in flight. This method bridges the gap.
   *
   * - Honors parent `beforeIds` checkpoints by leaving such tasks `paused`.
   * - If `runTask` throws (e.g. no assignee), the task is left in `paused`
   *   with the error recorded — the same fallback used by the runner itself.
   */
  async cascadeOnCompletion(completedTaskId: string): Promise<CascadeResult> {
    return this.cascadeOnCompletionMany([completedTaskId]);
  }

  /**
   * Batched variant of {@link cascadeOnCompletion} for family-wide status
   * cascades: dependents are discovered across all completed ids in one pass,
   * so completing N tasks costs a constant number of discovery queries instead
   * of N dependency walks.
   */
  async cascadeOnCompletionMany(completedTaskIds: string[]): Promise<CascadeResult> {
    await this.markStaleDependencyInputs(completedTaskIds);
    const unlocked = await this.taskModel.getUnlockedTasksForMany(completedTaskIds);
    if (unlocked.length === 0) return TaskRunnerService.cascadeEmpty();

    const result: CascadeResult = { failed: [], paused: [], started: [] };

    for (const task of unlocked) {
      const runner =
        task.createdByUserId && task.createdByUserId !== this.userId
          ? new TaskRunnerService(this.db, task.createdByUserId, this.workspaceId)
          : this;
      if (await runner.shouldHoldForCheckpoint(task)) {
        await runner.taskModel.updateStatusIfCurrent(task.id, 'backlog', 'paused');
        result.paused.push(task.identifier);
        continue;
      }

      try {
        await runner.runTask({
          idempotencyKey: taskRunIdempotencyKey.dependencyCascade({
            completedTaskIds,
            executionGeneration: task.executionGeneration ?? 0,
            taskId: task.id,
            taskRevision: task.domainRevision ?? 0,
          }),
          taskId: task.id,
          trigger: 'orchestrator',
        });
        result.started.push(task.identifier);
      } catch (error) {
        // Readiness can change after discovery. No execution happened: leave
        // backlog intact so the next upstream completion can discover it again.
        if (isTaskDependencyBlocked(error)) continue;
        if (error instanceof TRPCError && error.code === 'CONFLICT') {
          // Another cascade/manual request won the atomic run reservation.
          // Its task is live; the loser must not pause or relabel it.
          continue;
        }
        if (error instanceof TRPCError && error.cause instanceof TaskDispatchWaitingError) {
          // The admission gate (or project/goal policy) held this dispatch —
          // the intent is persisted as `waiting`, the task stays claimable,
          // and nothing may be marked paused/failed for a policy hold.
          continue;
        }
        const message = error instanceof Error ? error.message : 'Failed to start task';
        log('cascadeOnCompletion: runTask failed for %s: %s', task.identifier, message);
        // Best-effort: mark as paused so the user can see why it didn't run.
        try {
          await runner.taskModel.updateStatusIfCurrent(task.id, 'backlog', 'paused', {
            error: message,
          });
        } catch {
          /* ignore — surfaced via failed list */
        }
        result.failed.push({ error: message, identifier: task.identifier });
      }
    }

    return result;
  }

  private async shouldHoldForCheckpoint(task: TaskItem): Promise<boolean> {
    if (!task.parentTaskId) return false;
    const parent = await this.taskModel.findById(task.parentTaskId);
    if (!parent) return false;
    return this.taskModel.shouldPauseBeforeStart(parent, task.identifier);
  }

  /**
   * When an upstream task completes (fresh delivery or a re-delivery after a
   * rollback), dependents whose in-flight run was dispatched against a
   * different dependency receipt are marked `inputStale` on their running
   * topic — the recorded receipt no longer names the upstream's latest
   * delivery. New dispatches always freeze the freshest receipts, so the flag
   * is the audit trail that separates "built on the delivery that exists" from
   * "built on a delivery that was superseded mid-flight".
   */
  private async markStaleDependencyInputs(completedTaskIds: string[]): Promise<void> {
    for (const completedTaskId of completedTaskIds) {
      const [upstreamTopics, dependents] = await Promise.all([
        this.taskTopicModel.findByTaskId(completedTaskId).catch(() => []),
        this.taskModel.getDependents(completedTaskId).catch(() => []),
      ]);
      const latestDelivery = upstreamTopics.find((topic) => topic.status === 'completed');
      const observedDelivery = latestDelivery
        ? {
            integratedSha: latestDelivery.integration?.integratedSha,
            operationId: latestDelivery.operationId ?? undefined,
            seq: latestDelivery.seq ?? undefined,
            sourceSha: latestDelivery.integration?.expectedHeadSha,
            topicId: latestDelivery.topicId,
          }
        : undefined;

      for (const dep of dependents) {
        if (dep.type !== 'blocks') continue;
        const runningTopics = await this.taskTopicModel
          .findRunningByTaskIds([dep.taskId])
          .catch(() => []);
        for (const topic of runningTopics) {
          if (!topic.topicId) continue;
          const recorded = topic.contract?.content?.dependencies?.find(
            (receipt) => receipt.dependsOnId === completedTaskId,
          );
          if (!recorded) continue;
          // Stale = the delivery this attempt was built on is not the delivery
          // that now exists (redelivery), or the upstream has none at all
          // (rollback). A same-topic redelivery of identical SHAs is not stale.
          const sameDelivery =
            recorded.delivery?.topicId === observedDelivery?.topicId &&
            (!observedDelivery ||
              (recorded.delivery?.sourceSha === observedDelivery.sourceSha &&
                recorded.delivery?.integratedSha === observedDelivery.integratedSha));
          if (sameDelivery) continue;
          await this.taskTopicModel
            .markInputStale(dep.taskId, topic.topicId, {
              dependsOnId: completedTaskId,
              detectedAt: new Date().toISOString(),
              expectedDelivery: recorded.delivery ?? null,
              observedDelivery: observedDelivery ?? null,
            })
            .catch((error) =>
              log(
                'markStaleDependencyInputs: failed for %s/%s — %O',
                dep.taskId,
                topic.topicId,
                error,
              ),
            );
        }
      }
    }
  }
}

export interface CascadeResult {
  /** Tasks where kickoff threw and were marked paused with an error. */
  failed: { error: string; identifier: string }[];
  /** Tasks held back by a parent's `beforeIds` checkpoint. */
  paused: string[];
  /** Tasks that were successfully kicked off (topic created). */
  started: string[];
}
