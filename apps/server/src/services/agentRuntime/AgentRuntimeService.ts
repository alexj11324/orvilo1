import { type AgentState, isParkedStatus } from '@orvilo/agent-execution';
import { parse } from '@orvilo/conversation-flow';
import { asyncToolResumeCounter } from '@orvilo/observability-otel/modules/agent-runtime';
import { type ChatToolPayload } from '@orvilo/types';
import debug from 'debug';
import { and, eq, gt } from 'drizzle-orm';

import {
  deriveAgentInterventionQueueDeduplicationId,
  matchesAgentInterventionContinuationProvenance,
} from '@/business/server/agent-run/agentInterventionIdentity';
import { AgentOperationModel } from '@/database/models/agentOperation';
import { MessageModel } from '@/database/models/message';
import { agentInterventions } from '@/database/schemas/agentIntervention';
import { type OrviloDatabase } from '@/database/type';
import {
  createAgentStateManager,
  createStreamEventManager,
} from '@/server/modules/AgentExecution/factory';
import {
  type IAgentStateManager,
  type IStreamEventManager,
} from '@/server/modules/AgentExecution/types';
import { FileService } from '@/server/services/file';
import { loadRemoteExecutionStatus } from '@/server/services/heterogeneousAgent/runAdmission';

import {
  extractTextFromMessage,
  findLastAssistantMessage,
  normalizeCompletionMessages,
} from '../agentExecution/CompletionLifecycle';
import {
  type GroupActionMemberBridgeParams,
  type GroupActionOnComplete,
  type OperationStatusResult,
  type PendingInterventionsResult,
  type StartExecutionParams,
  type StartExecutionResult,
  type SubAgentBridgeParams,
} from './types';

if (process.env.VERCEL) {
  debug.log = console.info.bind(console);
}

const log = debug('orvilo-server:agent-runtime-service');

/**
 * Format error for storage in message pluginError metadata.
 * Handles Error objects which don't serialize properly with JSON.stringify.
 */
const formatErrorForMetadata = (error: unknown): Record<string, any> | undefined => {
  if (!error) return undefined;
  if (error instanceof Error) return { message: error.message, name: error.name };
  if (typeof error === 'object' && 'message' in error) return error as Record<string, any>;
  return { message: String(error) };
};

/**
 * Extract a short, human-readable reason string from a failed operation's
 * `state.error`, for inlining into the tool-result `content` a parent agent
 * sees. The full structured error still rides on `pluginError`.
 */
const formatSubAgentErrorReason = (error: unknown): string | undefined => {
  const message = formatErrorForMetadata(error)?.message;
  if (typeof message !== 'string') return undefined;
  const trimmed = message.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export interface AgentRuntimeServiceOptions {
  /**
   * Opt IN to agent-share visitor rows for the models this service owns.
   * Reserved for share-runtime entry points that drive a visitor turn under
   * the CREATOR's `userId`. Defaults to false. See
   * {@link import('@/database/models/message').MessageModelOptions}.
   */
  includeShareVisitor?: boolean;
  /**
   * Inject a custom state manager (tests). Defaults to the singleton from
   * `createAgentStateManager()` (Redis-backed when configured, in-memory
   * otherwise).
   */
  stateManager?: IAgentStateManager;
  /**
   * Inject a custom stream event manager (tests). Defaults to
   * `createStreamEventManager()`.
   */
  streamEventManager?: IStreamEventManager;
  /**
   * Workspace id for scoping all DB reads/writes (messages, agent_operations).
   * Falls back to user-personal scope when omitted.
   */
  workspaceId?: string;
}

/**
 * Agent Runtime facade (P70d: ACP-era internals).
 *
 * The lobehub-inherited procedure surface is preserved verbatim —
 * `getOperationStatus`, `getPendingInterventions`, `processHumanIntervention`,
 * `startExecution`, plus the internal sub-agent/group completion bridges the
 * hetero `onComplete` hooks still call. The in-process lobehub model loop
 * (`createOperation`/`executeStep`/`executeSync`, the step queue tails, and
 * everything in `modules/AgentRuntime`) is deleted: every run now dispatches
 * through `dispatchHeteroAgent` onto an ACP execution binding, so this class
 * reads the data sources that still exist — the state manager's metadata,
 * `agent_operations`, `agent_interventions`, and the remote-admission ledger —
 * instead of engine-private step state.
 */
export class AgentRuntimeService {
  private agentOperationModel: AgentOperationModel;
  private serverDB: OrviloDatabase;
  private stateManager: IAgentStateManager;
  private streamManager: IStreamEventManager;
  private userId: string;
  private workspaceId?: string;
  private messageModel: MessageModel;

  constructor(db: OrviloDatabase, userId: string, options?: AgentRuntimeServiceOptions) {
    this.serverDB = db;
    this.userId = userId;
    this.workspaceId = options?.workspaceId;
    this.stateManager = options?.stateManager ?? createAgentStateManager();
    this.streamManager = options?.streamEventManager ?? createStreamEventManager();
    const workspaceId = this.workspaceId;
    const includeShareVisitor = options?.includeShareVisitor ?? false;
    this.agentOperationModel = new AgentOperationModel(db, this.userId, workspaceId);
    this.messageModel = new MessageModel(db, this.userId, workspaceId, undefined, {
      includeShareVisitor,
    });
  }

  // ==================== Operation Interruption ====================

  /**
   * Interrupt a running agent operation by setting its state to 'interrupted'.
   * Works with both Redis and InMemory state managers via the stateManager.
   * For remote/hetero ops the InterventionController cancels the host task
   * first (device gateway SIGINT); this call then writes the bookkeeping
   * interrupted state for ops that still carry a state snapshot.
   *
   * @returns true if the operation was interrupted, false if already in a terminal state or not found
   */
  async interruptOperation(operationId: string): Promise<boolean> {
    const state = await this.stateManager.loadAgentState(operationId);
    if (!state) return false;

    if (state.status === 'done' || state.status === 'error' || state.status === 'interrupted') {
      return false;
    }

    // Sentinel FIRST: the poller and the step-boundary check read only the
    // sentinel, so it must become visible no later than the interrupted
    // state — otherwise a boundary check landing between the two writes
    // reads false and the following saveStepResult clobbers the
    // interruption. Writing it first also keeps failure atomic: if the
    // sentinel write throws, the state below is never marked either, so the
    // two never diverge. A sentinel that lands without the state save
    // (crash between the writes) only stops the op earlier than the record
    // shows — the step-boundary check then persists the interrupted state.
    await this.stateManager.markInterrupted(operationId);

    await this.stateManager.saveAgentState(operationId, {
      ...state,
      lastModified: new Date().toISOString(),
      status: 'interrupted',
    });

    log('[%s] Operation interrupted', operationId);
    return true;
  }

  // ==================== Intervention Continuation ====================

  /** Load the authoritative runtime state for a deterministic intervention continuation. */
  async loadInterventionContinuationState(operationId: string): Promise<AgentState | null> {
    return this.stateManager.loadAgentState(operationId);
  }

  /**
   * Generic state snapshot lookup — null for ACP-era hetero runs, which never
   * write a state blob (their durable op row + remote admission ledger are the
   * source of truth; see {@link getOperationStatus}).
   */
  async loadAgentState(operationId: string): Promise<AgentState | null> {
    return this.stateManager.loadAgentState(operationId);
  }

  /**
   * Verify that a prepared intervention continuation has actually been
   * dispatched. Under ACP there is no step queue: `dispatchHeteroAgent`
   * writes the durable `agent_operations` row and flips it past 'idle' at
   * recordStart, so a post-'idle' row IS the dispatch proof (the queue-ACK
   * `agentInterventionDispatch` marker has no ACP writer — it was only
   * stamped by the retired schedule path).
   *
   * A row still 'idle' means the continuation was prepared but never
   * dispatched (engine-era leftover or a crashed dispatch); there is no
   * server-side way to start it — report 'missing' so callers fail closed
   * instead of re-queueing a step nobody will run.
   */
  async ensureInterventionContinuationStarted(
    operationId: string,
  ): Promise<'already_started' | 'missing' | 'scheduled'> {
    const state = await this.stateManager.loadAgentState(operationId);
    if (!state) return 'missing';

    const provenance = state.origin?.continuation as
      | {
          resolutionRequestId?: unknown;
          sourceOperationId?: unknown;
          sourceToolMessageIds?: unknown;
        }
      | undefined;
    const preparation = state.metadata?.agentInterventionPreparation as
      | {
          deduplicationId?: unknown;
          resolutionRequestId?: unknown;
          state?: unknown;
          stepIndex?: unknown;
        }
      | undefined;
    if (
      typeof provenance?.resolutionRequestId !== 'string' ||
      typeof provenance.sourceOperationId !== 'string' ||
      !Array.isArray(provenance.sourceToolMessageIds) ||
      !provenance.sourceToolMessageIds.every((id) => typeof id === 'string')
    ) {
      throw new Error(`Intervention continuation provenance missing: ${operationId}`);
    }
    if (
      preparation?.state !== 'ready' ||
      preparation.resolutionRequestId !== provenance.resolutionRequestId ||
      typeof preparation.stepIndex !== 'number' ||
      !Number.isSafeInteger(preparation.stepIndex) ||
      preparation.stepIndex < 0
    ) {
      throw new Error(`Intervention continuation is not ready to schedule: ${operationId}`);
    }
    const stepIndex = preparation.stepIndex;
    const deduplicationId = deriveAgentInterventionQueueDeduplicationId(operationId, stepIndex);
    if (preparation.deduplicationId !== deduplicationId) {
      throw new Error(`Intervention continuation dedupe provenance conflict: ${operationId}`);
    }
    const operation = await this.agentOperationModel.findById(operationId);
    if (
      !operation ||
      !matchesAgentInterventionContinuationProvenance(
        operation.metadata?.agentInterventionContinuation,
        provenance as {
          resolutionRequestId: string;
          sourceOperationId: string;
          sourceToolMessageIds: string[];
        },
      )
    ) {
      throw new Error(`Intervention continuation durable provenance conflict: ${operationId}`);
    }
    const durablePreparation = operation.metadata?.agentInterventionPreparation as
      | {
          deduplicationId?: unknown;
          resolutionRequestId?: unknown;
          state?: unknown;
          stepIndex?: unknown;
        }
      | undefined;
    if (
      durablePreparation &&
      (durablePreparation.state !== 'ready' ||
        durablePreparation.resolutionRequestId !== provenance.resolutionRequestId ||
        durablePreparation.stepIndex !== stepIndex ||
        durablePreparation.deduplicationId !== deduplicationId)
    ) {
      throw new Error(`Intervention continuation durable preparation conflict: ${operationId}`);
    }
    if (!durablePreparation) {
      const persisted = await this.agentOperationModel.recordAgentInterventionPreparation(
        operationId,
        {
          deduplicationId,
          resolutionRequestId: provenance.resolutionRequestId,
          state: 'ready',
          stepIndex,
        },
      );
      if (!persisted) {
        throw new Error(`Failed to backfill intervention preparation: ${operationId}`);
      }
    }
    const dispatchMarker = operation.metadata?.agentInterventionDispatch as
      | {
          deduplicationId?: unknown;
          messageId?: unknown;
          resolutionRequestId?: unknown;
          state?: unknown;
        }
      | undefined;
    if (dispatchMarker) {
      if (
        dispatchMarker.state !== 'scheduled' ||
        dispatchMarker.resolutionRequestId !== provenance.resolutionRequestId ||
        dispatchMarker.deduplicationId !== deduplicationId
      ) {
        throw new Error(`Intervention continuation dispatch marker conflict: ${operationId}`);
      }
      return 'already_started';
    }

    // No queue ACK marker and no step queue: the durable op row's post-'idle'
    // status is the only remaining dispatch proof. 'idle' means prepared but
    // never dispatched — unrecoverable server-side under ACP, so report
    // 'missing' and let the caller rebuild the continuation through execAgent.
    return operation.status === 'idle' ? 'missing' : 'already_started';
  }

  // ==================== Operation Status (lobehub procedure surface) ====================

  /**
   * Get operation status. Reads the state-manager snapshot + metadata, and —
   * for remote/hetero runs — the durable remote-admission ledger so a finished
   * run keeps a truthful status surface after its state snapshot expires.
   */
  async getOperationStatus(params: {
    historyLimit?: number;
    includeHistory?: boolean;
    operationId: string;
  }): Promise<OperationStatusResult | null> {
    const { operationId, includeHistory = false, historyLimit = 10 } = params;

    try {
      log('Getting operation status for %s', operationId);

      const [currentState, operationMetadata, remoteExecution] = await Promise.all([
        this.stateManager.loadAgentState(operationId),
        this.stateManager.getOperationMetadata(operationId),
        loadRemoteExecutionStatus(this.serverDB, this.streamManager, operationId).catch((error) => {
          log('Failed to load remote execution status for %s: %O', operationId, error);
          return undefined;
        }),
      ]);

      // Operation may have expired or does not exist — unless a
      // remote-admitted run is still in flight. Its device writes through
      // ingest/finish callbacks, not a local state snapshot, so the durable
      // admission ledger is the remaining source of truth a reconnect polls.
      if (!currentState || !operationMetadata) {
        if (!remoteExecution) {
          log('Operation %s not found (may have expired)', operationId);
          return null;
        }

        // The admission ledger is not settled on normal completion — a
        // finished remote run keeps `state: 'running'` while only the durable
        // operation row carries the terminal status. Derive liveness from
        // both, or a completed run would report `running` forever.
        const durableStatus = remoteExecution.durableStatus;
        const durableTerminal = ['abandoned', 'done', 'error', 'interrupted'].includes(
          durableStatus ?? '',
        );
        const remoteActive =
          !durableTerminal && !['offline', 'rejected'].includes(remoteExecution.admission.state);
        const status = remoteActive
          ? 'running'
          : durableTerminal
            ? (durableStatus as 'abandoned' | 'done' | 'error' | 'interrupted')
            : 'error';

        return {
          currentState: {
            lastModified: remoteExecution.admission.updatedAt,
            status,
            stepCount: 0,
          },
          hasError: status === 'error',
          isActive: remoteActive,
          isCompleted: status === 'done',
          metadata: {},
          needsHumanInput: false,
          operationId,
          remoteExecution,
          stats: {
            lastActiveTime: 0,
            totalCost: 0,
            totalMessages: 0,
            totalSteps: 0,
            uptime: 0,
          },
        };
      }

      let executionHistory;
      if (includeHistory) {
        try {
          executionHistory = await this.stateManager.getExecutionHistory(operationId, historyLimit);
        } catch (error) {
          log('Failed to load execution history: %O', error);
          executionHistory = [];
        }
      }

      let recentEvents;
      if (includeHistory) {
        try {
          recentEvents = await this.streamManager.getStreamHistory(operationId, 20);
        } catch (error) {
          log('Failed to load recent events: %O', error);
          recentEvents = [];
        }
      }

      const stats = {
        lastActiveTime: operationMetadata.lastActiveAt
          ? Date.now() - new Date(operationMetadata.lastActiveAt).getTime()
          : 0,
        totalCost: currentState.cost?.total || 0,
        totalMessages: currentState.messages?.length || 0,
        totalSteps: currentState.stepCount || 0,
        uptime: operationMetadata.createdAt
          ? Date.now() - new Date(operationMetadata.createdAt).getTime()
          : 0,
      };

      return {
        currentState: {
          cost: currentState.cost,
          costLimit: currentState.costLimit,
          error: currentState.error,
          interruption: currentState.interruption,
          lastModified: currentState.lastModified,
          maxSteps: currentState.maxSteps,
          pendingHumanPrompt: currentState.pendingHumanPrompt,
          pendingHumanSelect: currentState.pendingHumanSelect,
          pendingToolsCalling: currentState.pendingToolsCalling,
          status: currentState.status,
          stepCount: currentState.stepCount,
          usage: currentState.usage,
        },
        executionHistory: executionHistory?.slice(0, historyLimit),
        hasError: currentState.status === 'error',
        isActive: currentState.status === 'running' || isParkedStatus(currentState.status),
        isCompleted: currentState.status === 'done',
        metadata: operationMetadata,
        needsHumanInput: currentState.status === 'waiting_for_human',
        operationId,
        recentEvents: recentEvents?.slice(0, 10),
        remoteExecution,
        stats,
      };
    } catch (error) {
      log('Failed to get operation status for %s: %O', operationId, error);
      throw error;
    }
  }

  /**
   * List pending human interventions. Under ACP the durable
   * `agent_interventions` rows (status 'pending', unexpired) are the source of
   * truth — hetero runs don't write `waiting_for_human` state snapshots. For a
   * single `operationId` we additionally merge a legacy snapshot entry if one
   * still exists, so an in-flight pre-migration op keeps reporting.
   */
  async getPendingInterventions(params: {
    operationId?: string;
    userId?: string;
  }): Promise<PendingInterventionsResult> {
    const { operationId, userId } = params;

    try {
      log('Getting pending interventions for operationId: %s, userId: %s', operationId, userId);

      const pendingInterventions: PendingInterventionsResult['pendingInterventions'] = [];
      const seenOperations = new Set<string>();

      // Durable rows — the ACP source of truth.
      const conditions = [eq(agentInterventions.status, 'pending')];
      if (operationId) {
        conditions.push(eq(agentInterventions.operationId, operationId));
      } else if (userId) {
        conditions.push(eq(agentInterventions.userId, userId));
        if (this.workspaceId) {
          conditions.push(eq(agentInterventions.workspaceId, this.workspaceId));
        }
      }
      conditions.push(gt(agentInterventions.deadline, new Date()));

      const rows = await this.serverDB
        .select()
        .from(agentInterventions)
        .where(and(...conditions));

      const rowsByOperation = new Map<string, typeof rows>();
      for (const row of rows) {
        const list = rowsByOperation.get(row.operationId) ?? [];
        list.push(row);
        rowsByOperation.set(row.operationId, list);
      }

      const metas = new Map<string, { modelRuntimeConfig?: unknown; userId?: string } | null>();
      for (const [opId, opRows] of rowsByOperation) {
        let metadata = metas.get(opId);
        if (metadata === undefined) {
          metadata = await this.stateManager.getOperationMetadata(opId).catch(() => null);
          metas.set(opId, metadata);
        }
        seenOperations.add(opId);
        for (const row of opRows) {
          pendingInterventions.push({
            lastModified: row.updatedAt.toISOString(),
            modelRuntimeConfig: metadata?.modelRuntimeConfig,
            operationId: row.operationId,
            pendingToolsCalling:
              row.interactionKind === 'tool_approval'
                ? [
                    {
                      apiName: row.sanitizedRequest.apiName ?? row.canonicalToolKey ?? '',
                      id: row.toolCallId,
                      identifier: row.sanitizedRequest.identifier ?? row.canonicalToolKey ?? '',
                      type: 'default',
                    },
                  ]
                : undefined,
            pendingHumanPrompt:
              row.interactionKind === 'tool_approval' ? undefined : row.sanitizedRequest,
            status: 'waiting_for_human',
            stepCount: row.stepIndex,
            type: row.interactionKind === 'tool_approval' ? 'tool_approval' : 'human_prompt',
            userId: row.userId,
          });
        }
      }

      // Legacy snapshot merge (single-op reads only): a pre-ACP run parked at
      // waiting_for_human carries no durable rows, so keep reporting it.
      if (operationId && !seenOperations.has(operationId)) {
        try {
          const [state, metadata] = await Promise.all([
            this.stateManager.loadAgentState(operationId),
            this.stateManager.getOperationMetadata(operationId),
          ]);

          if (state?.status === 'waiting_for_human') {
            const intervention: PendingInterventionsResult['pendingInterventions'][number] = {
              lastModified: state.lastModified,
              modelRuntimeConfig: metadata?.modelRuntimeConfig,
              operationId,
              status: state.status,
              stepCount: state.stepCount,
              type: 'tool_approval',
              userId: metadata?.userId,
            };
            if (state.pendingToolsCalling) {
              intervention.type = 'tool_approval';
              intervention.pendingToolsCalling = state.pendingToolsCalling;
            } else if (state.pendingHumanPrompt) {
              intervention.type = 'human_prompt';
              intervention.pendingHumanPrompt = state.pendingHumanPrompt;
            } else if (state.pendingHumanSelect) {
              intervention.type = 'human_select';
              intervention.pendingHumanSelect = state.pendingHumanSelect;
            }
            pendingInterventions.push(intervention);
          }
        } catch (error) {
          log('Failed to get state for operation %s: %O', operationId, error);
        }
      }

      return {
        pendingInterventions,
        timestamp: new Date().toISOString(),
        totalCount: pendingInterventions.length,
      };
    } catch (error) {
      log('Failed to get pending interventions: %O', error);
      throw error;
    }
  }

  /**
   * Explicitly start operation execution.
   *
   * Under ACP every operation is dispatched synchronously inside `execAgent`
   * (hetero `recordStart`) — there is no queued step to kick off. An existing
   * op is therefore already started: the method validates existence/state like
   * the lobehub original and reports `scheduled: false` rather than enqueueing
   * a step nobody would consume.
   */
  async startExecution(params: StartExecutionParams): Promise<StartExecutionResult> {
    const { operationId } = params;

    try {
      log('Starting execution for operation %s', operationId);

      const operationMetadata = await this.stateManager.getOperationMetadata(operationId);
      const operation = await this.agentOperationModel.findById(operationId);
      if (!operationMetadata && !operation) {
        throw new Error(`Operation ${operationId} not found`);
      }

      const currentState = await this.stateManager.loadAgentState(operationId);
      const status = currentState?.status ?? operation?.status;
      if (status === 'running' || isParkedStatus(status as AgentState['status'])) {
        throw new Error(`Operation ${operationId} is already running`);
      }
      if (status === 'done') {
        throw new Error(`Operation ${operationId} is already completed`);
      }
      if (status === 'error') {
        throw new Error(`Operation ${operationId} is in error state`);
      }
      if (status === 'interrupted') {
        throw new Error(`Operation ${operationId} is interrupted`);
      }

      return {
        operationId,
        scheduled: false,
        success: true,
      };
    } catch (error) {
      log('Failed to start execution for operation %s: %O', operationId, error);
      throw error;
    }
  }

  // ==================== Sub-agent / Group Completion Bridges ====================

  /**
   * Sub-agent completion bridge for the server `callSubAgent` deferred-tool
   * path. Runs when a child sub-agent op reaches a terminal state — invoked
   * in-process by the child's serialized `onComplete` hook (hetero children
   * finish through `CompletionLifecycle.dispatchHooks`).
   *
   *   1. Backfill the parent's placeholder tool message with the sub-agent's
   *      final answer (success) or an error note (failure), plus pluginState
   *      so the UI render can resolve the isolation thread.
   *   2. Resume the parked parent: barrier-check + CAS via
   *      `tryResumeParentFromAsyncTool`.
   *
   * THROWS on infrastructure failure so the caller can retry — the backfill
   * rewrites the same content and the resume is CAS-guarded, so redelivery is
   * safe.
   */
  async completeSubAgentBridge(params: SubAgentBridgeParams): Promise<boolean> {
    const { operationId, parentOperationId, reason, threadId, toolMessageId } = params;
    const failed = reason === 'error' || reason === 'interrupted';

    const finalState =
      params.finalState ?? (await this.stateManager.loadAgentState(operationId)) ?? undefined;

    log(
      '[%s] sub-agent bridge → parent %s (reason: %s, state: %s)',
      operationId,
      parentOperationId,
      reason,
      finalState ? 'loaded' : 'missing',
    );

    let lastAssistant: unknown;
    if (!failed && finalState && !Array.isArray(finalState.messages)) {
      try {
        lastAssistant = await this.resolveLastAssistantMessageFromDB(finalState);
      } catch (error) {
        console.error(
          '[%s] sub-agent bridge: failed to resolve final assistant from DB: %O',
          operationId,
          error,
        );
      }
    }
    const messages = Array.isArray(finalState?.messages) ? finalState.messages : [];
    lastAssistant ??= findLastAssistantMessage(normalizeCompletionMessages(messages));
    let lastAssistantContent = extractTextFromMessage(lastAssistant);

    if (!failed && !finalState && threadId) {
      try {
        lastAssistantContent = await this.resolveLastAssistantContentFromThread(threadId);
      } catch (error) {
        console.error(
          '[%s] sub-agent bridge: failed to resolve content from thread %s: %O',
          operationId,
          threadId,
          error,
        );
      }
    }
    const errorReason = failed ? formatSubAgentErrorReason(finalState?.error) : undefined;
    const content = failed
      ? errorReason
        ? `Sub-agent did not complete (${reason}): ${errorReason}`
        : `Sub-agent did not complete (${reason}).`
      : lastAssistantContent || 'Sub-agent completed without a textual answer.';

    const backfill = await this.messageModel.updateToolMessage(toolMessageId, {
      content,
      pluginError: failed ? formatErrorForMetadata(finalState?.error) : undefined,
      pluginState: {
        model: finalState?.modelRuntimeConfig?.model,
        status: failed ? 'error' : 'completed',
        threadId,
        // The child's spend rides on this anchor row so the parent's usage tray can
        // account for it. The tray sums per-MESSAGE usage, and the child's own
        // assistant messages live in an isolation thread the parent never loads —
        // this row is the only place the child's cost surfaces in the parent's own
        // message list.
        totalCost: finalState?.cost?.total,
        totalInputTokens: finalState?.usage?.llm?.tokens?.input,
        totalOutputTokens: finalState?.usage?.llm?.tokens?.output,
        totalToolCalls: finalState?.usage?.tools?.totalCalls,
        totalTokens: finalState?.usage?.llm?.tokens?.total,
      },
    });
    if (!backfill.success) {
      throw new Error(
        `Sub-agent bridge: failed to backfill tool message ${toolMessageId} for parent ${parentOperationId}`,
      );
    }

    return this.tryResumeParentFromAsyncTool(
      { parentOperationId },
      { knownFulfilledMessageId: toolMessageId },
    );
  }

  /**
   * Completion bridge for the group orchestration "call agent member" path
   * (`orvilo-group-management`: speak / broadcast / delegate /
   * executeAgentTask(s)). Mirrors {@link completeSubAgentBridge} but enforces
   * a K=N member barrier.
   */
  async completeGroupActionMember(params: GroupActionMemberBridgeParams): Promise<boolean> {
    const {
      anchorMessageId,
      expectedMembers,
      groupToolMessageId,
      mode,
      operationId,
      parentOperationId,
      reason,
      threadId,
    } = params;
    const failed = reason === 'error' || reason === 'interrupted' || reason === 'timeout';

    const finalState =
      params.finalState ?? (await this.stateManager.loadAgentState(operationId)) ?? undefined;

    log(
      '[%s] group-member bridge → parent %s (mode: %s, reason: %s, %d members)',
      operationId,
      parentOperationId,
      mode,
      reason,
      expectedMembers,
    );

    let lastAssistant: unknown;
    if (!failed && mode !== 'in_group' && finalState && !Array.isArray(finalState.messages)) {
      try {
        lastAssistant = await this.resolveLastAssistantMessageFromDB(finalState);
      } catch (error) {
        console.error(
          '[%s] group-member bridge: failed to resolve final assistant from DB: %O',
          operationId,
          error,
        );
      }
    }
    const messages = Array.isArray(finalState?.messages) ? finalState.messages : [];
    lastAssistant ??= findLastAssistantMessage(normalizeCompletionMessages(messages));
    let lastAssistantContent = extractTextFromMessage(lastAssistant);

    if (!failed && mode !== 'in_group' && !finalState && threadId) {
      try {
        lastAssistantContent = await this.resolveLastAssistantContentFromThread(threadId);
      } catch (error) {
        console.error(
          '[%s] group-member bridge: failed to resolve content from thread %s: %O',
          operationId,
          threadId,
          error,
        );
      }
    }
    const agentLabel = (finalState?.origin?.agentId as string | undefined) ?? 'member';
    const memberErrorReason = failed ? formatSubAgentErrorReason(finalState?.error) : undefined;
    const anchorContent = failed
      ? memberErrorReason
        ? `Agent member did not complete (${reason}): ${memberErrorReason}`
        : `Agent member did not complete (${reason}).`
      : mode === 'in_group'
        ? `Agent ${agentLabel} responded in the group.`
        : lastAssistantContent || 'Agent member completed without a textual answer.';

    const anchorBackfill = await this.messageModel.updateToolMessage(anchorMessageId, {
      content: anchorContent,
      pluginError: failed ? formatErrorForMetadata(finalState?.error) : undefined,
      pluginState: {
        model: finalState?.modelRuntimeConfig?.model,
        status: failed ? 'error' : 'completed',
        threadId,
        totalCost: finalState?.cost?.total,
        totalInputTokens: finalState?.usage?.llm?.tokens?.input,
        totalOutputTokens: finalState?.usage?.llm?.tokens?.output,
        totalToolCalls: finalState?.usage?.tools?.totalCalls,
        totalTokens: finalState?.usage?.llm?.tokens?.total,
      },
    });
    if (!anchorBackfill.success) {
      throw new Error(
        `Group-member bridge: failed to backfill anchor ${anchorMessageId} for parent ${parentOperationId}`,
      );
    }

    // K=N member barrier (multi-member actions only — single-member actions
    // use the group tool call itself as the anchor, already backfilled above).
    if (expectedMembers > 1 && anchorMessageId !== groupToolMessageId) {
      const fulfilled = await this.countFulfilledMemberAnchors(groupToolMessageId);
      if (fulfilled < expectedMembers) {
        log(
          '[%s] group-member barrier %d/%d, holding parent %s',
          operationId,
          fulfilled,
          expectedMembers,
          parentOperationId,
        );
        return false;
      }

      const groupBackfill = await this.messageModel.updateToolMessage(groupToolMessageId, {
        content: `All ${expectedMembers} agent members completed.`,
        pluginState: { expectedMembers, status: 'completed' },
      });
      if (!groupBackfill.success) {
        throw new Error(
          `Group-member bridge: failed to backfill group tool ${groupToolMessageId} for parent ${parentOperationId}`,
        );
      }
    }

    return this.tryResumeParentFromAsyncTool({ parentOperationId }, {});
  }

  /**
   * Completion-bridge resume for async-tool parents.
   *
   * Under ACP the parked parent runs on a host that tracks its own deferred
   * tool calls — the server-side step-queue wake the engine used no longer
   * exists, and hetero runs never write `waiting_for_async_tool` snapshots,
   * so a missing blob short-circuits straight to `false`. The state check +
   * pendingToolsCalling barrier + durable CAS are kept verbatim so any
   * surviving pre-migration parked op still completes its accounting; its
   * resume itself was never recoverable once the engine retired.
   */
  async tryResumeParentFromAsyncTool(
    params: { parentOperationId: string },
    options?: {
      /**
       * Message id of a tool placeholder the caller just backfilled to a
       * terminal state. Trusted by the barrier as fulfilled without re-reading
       * `message_plugins` — closes the read-your-writes gap where the barrier
       * query hits a read replica that hasn't seen the just-committed write.
       */
      knownFulfilledMessageId?: string;
      /** Group orchestration disposition (skipCallSupervisor / delegate → finish). */
      onComplete?: GroupActionOnComplete;
    },
  ): Promise<boolean> {
    const { parentOperationId } = params;

    const state = await this.stateManager.loadAgentState(parentOperationId);
    if (!state) {
      log('[%s] async-tool resume: parent state missing, no-op', parentOperationId);
      asyncToolResumeCounter.add(1, { outcome: 'no_state' });
      return false;
    }

    if (state.status !== 'waiting_for_async_tool') {
      return false;
    }

    const pending = (state.pendingToolsCalling ?? []) as ChatToolPayload[];
    if (pending.length === 0) {
      log('[%s] async-tool resume: parked op has no pending tools', parentOperationId);
      asyncToolResumeCounter.add(1, { outcome: 'no_pending' });
      return false;
    }

    const allFulfilled = await this.allPendingToolsFulfilled(
      pending,
      options?.knownFulfilledMessageId,
    );
    if (!allFulfilled) {
      log('[%s] async-tool barrier not yet satisfied, holding', parentOperationId);
      asyncToolResumeCounter.add(1, { outcome: 'barrier_held' });
      return false;
    }

    const won = await new AgentOperationModel(this.serverDB, this.userId).tryResumeFromAsyncTool(
      parentOperationId,
    );
    if (!won) {
      log('[%s] lost async-tool resume CAS, no-op', parentOperationId);
      asyncToolResumeCounter.add(1, { outcome: 'lost_cas' });
      return false;
    }

    asyncToolResumeCounter.add(1, { outcome: 'resumed' });
    log('[%s] won async-tool resume CAS (ACP: host owns the wake)', parentOperationId);
    return true;
  }

  /**
   * Whether every pending tool call has a fulfilled tool_result message — i.e.
   * a tool message exists for its `tool_call_id` with non-empty content or a
   * terminal pluginState.
   */
  private async allPendingToolsFulfilled(
    pending: ChatToolPayload[],
    knownFulfilledMessageId?: string,
  ): Promise<boolean> {
    for (const tc of pending) {
      const plugin = await this.serverDB.query.messagePlugins.findFirst({
        where: (mp, { eq }) => eq(mp.toolCallId, tc.id),
      });
      if (!plugin) return false;

      // Trust the caller's own just-committed backfill (read-your-writes).
      if (knownFulfilledMessageId && plugin.id === knownFulfilledMessageId) continue;

      const message = await this.messageModel.findById(plugin.id);
      const pluginState = plugin.state as { status?: string } | null;
      const fulfilled =
        pluginState?.status === 'completed' ||
        pluginState?.status === 'error' ||
        (typeof message?.content === 'string' && message.content.length > 0);
      if (!fulfilled) return false;
    }
    return true;
  }

  /**
   * Resolve the group-orchestration disposition persisted on a parked tool
   * message's pluginState (`onComplete: 'finish'` for skipCallSupervisor /
   * delegate, else 'resume').
   */
  private async resolveAsyncToolOnComplete(
    pending: ChatToolPayload[],
  ): Promise<GroupActionOnComplete> {
    for (const tool of pending) {
      const plugin = await this.serverDB.query.messagePlugins.findFirst({
        where: (mp, { eq }) => eq(mp.toolCallId, tool.id),
      });
      const pluginState = plugin?.state as { onComplete?: string } | null;
      if (pluginState?.onComplete === 'finish') return 'finish';
    }
    return 'resume';
  }

  /**
   * Count fulfilled member anchors under a group-management tool call — child
   * `role: 'tool'` messages whose content is non-empty or whose pluginState is
   * terminal.
   */
  private async countFulfilledMemberAnchors(groupToolMessageId: string): Promise<number> {
    const children = await this.serverDB.query.messages.findMany({
      where: (m, { and, eq }) => and(eq(m.parentId, groupToolMessageId), eq(m.role, 'tool')),
    });
    let fulfilled = 0;
    for (const child of children) {
      if (child.content && child.content.length > 0) {
        fulfilled += 1;
        continue;
      }
      const plugin = await this.serverDB.query.messagePlugins.findFirst({
        where: (mp, { eq }) => eq(mp.id, child.id),
      });
      const pluginState = plugin?.state as { status?: string } | null;
      if (pluginState?.status === 'completed' || pluginState?.status === 'error') fulfilled += 1;
    }
    return fulfilled;
  }

  private async queryMessagesFromDB(state: AgentState) {
    let postProcessUrl: ((path: string | null) => Promise<string>) | undefined;
    try {
      const fileService = new FileService(this.serverDB, this.userId);
      postProcessUrl = (path: string | null) => fileService.getFullFileUrl(path);
    } catch {
      postProcessUrl = undefined;
    }

    return this.messageModel.query(
      {
        agentId: state.origin?.agentId,
        // Group runs must pass groupId, else the query filters `groupId IS NULL`.
        groupId: state.origin?.groupId,
        threadId: state.origin?.threadId,
        topicId: state.origin?.topicId,
      },
      { allowShareVisitor: true, postProcessUrl },
    );
  }

  /**
   * Use conversation-flow to select the active final assistant leaf, then
   * recover that leaf from the original query result.
   */
  private async resolveLastAssistantMessageFromDB(state: AgentState): Promise<unknown> {
    const dbMessages = await this.queryMessagesFromDB(state);
    const { flatList } = parse(dbMessages);
    const lastAssistant = findLastAssistantMessage(normalizeCompletionMessages(flatList));
    const lastAssistantId = typeof lastAssistant?.id === 'string' ? lastAssistant.id : undefined;

    return (
      (lastAssistantId
        ? dbMessages.find((message) => message.id === lastAssistantId)
        : undefined) ?? lastAssistant
    );
  }

  /**
   * Fallback content resolution for a heterogeneous (CLI-driven) sub-agent
   * child: its own conversation is queryable directly by the isolation
   * `threadId` (the same source `heteroFinish` reads before completion).
   */
  private async resolveLastAssistantContentFromThread(
    threadId: string,
  ): Promise<string | undefined> {
    const messages = await this.messageModel.query({ threadId }, { allowShareVisitor: true });
    const lastAssistant = findLastAssistantMessage(normalizeCompletionMessages(messages));
    return extractTextFromMessage(lastAssistant) || undefined;
  }
}
