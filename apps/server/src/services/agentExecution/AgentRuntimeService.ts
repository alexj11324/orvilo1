import { type AgentState } from '@orvilo/agent-execution';
import debug from 'debug';

import { AgentOperationModel } from '@/database/models/agentOperation';
import { MessageModel } from '@/database/models/message';
import { type OrviloDatabase } from '@/database/type';
import {
  createAgentStateManager,
  createStreamEventManager,
} from '@/server/modules/AgentExecution/factory';
import {
  type IAgentStateManager,
  type IStreamEventManager,
} from '@/server/modules/AgentExecution/types';

import { ChildRunService } from './ChildRunService';
import { InterventionService } from './InterventionService';
import { OperationInterruptService } from './OperationInterruptService';
import { OperationStatusService } from './OperationStatusService';
import {
  type AgentExecutionServiceDeps,
  AgentStartError,
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
 * Agent Runtime facade (P70d: ACP-era internals; P02: forwarding shell).
 *
 * The lobehub-inherited procedure surface is preserved verbatim — existing
 * callers keep invoking `getOperationStatus`, `getPendingInterventions`,
 * `interruptOperation`, the completion bridges, and `startExecution` on this
 * class while each duty lives in its own `services/agentExecution/` service:
 *
 *   - {@link OperationStatusService}  — status queries / snapshot reads
 *   - {@link InterventionService}     — pending approvals + continuation proof
 *   - {@link OperationInterruptService} — cancel bookkeeping
 *   - {@link ChildRunService}         — sub-agent/group bridges + async resume
 *
 * The in-process lobehub model loop is deleted; every run dispatches through
 * `dispatchHeteroAgent` onto an ACP execution binding. New code should depend
 * on the `services/agentExecution` services directly — this class only exists
 * so the old procedure surface keeps working during the migration window.
 */
export class AgentRuntimeService {
  private agentOperationModel: AgentOperationModel;
  private serverDB: OrviloDatabase;
  private stateManager: IAgentStateManager;
  private userId: string;
  private workspaceId?: string;

  private readonly childRuns: ChildRunService;
  private readonly interventions: InterventionService;
  private readonly interrupt: OperationInterruptService;
  private readonly status: OperationStatusService;

  constructor(db: OrviloDatabase, userId: string, options?: AgentRuntimeServiceOptions) {
    this.serverDB = db;
    this.userId = userId;
    this.workspaceId = options?.workspaceId;
    this.stateManager = options?.stateManager ?? createAgentStateManager();
    const streamManager = options?.streamEventManager ?? createStreamEventManager();
    const workspaceId = this.workspaceId;
    const includeShareVisitor = options?.includeShareVisitor ?? false;
    this.agentOperationModel = new AgentOperationModel(db, this.userId, workspaceId);
    const messageModel = new MessageModel(db, this.userId, workspaceId, undefined, {
      includeShareVisitor,
    });

    const deps: AgentExecutionServiceDeps = {
      agentOperationModel: this.agentOperationModel,
      messageModel,
      serverDB: db,
      stateManager: this.stateManager,
      streamManager,
      userId,
      workspaceId,
    };
    this.childRuns = new ChildRunService(deps);
    this.interventions = new InterventionService(deps);
    this.interrupt = new OperationInterruptService(deps);
    this.status = new OperationStatusService(deps);
  }

  // ==================== Operation Interruption ====================

  /** Forwards to {@link OperationInterruptService.interruptOperation}. */
  async interruptOperation(operationId: string): Promise<boolean> {
    return this.interrupt.interruptOperation(operationId);
  }

  // ==================== Intervention Continuation ====================

  /** Forwards to {@link InterventionService.loadInterventionContinuationState}. */
  async loadInterventionContinuationState(operationId: string): Promise<AgentState | null> {
    return this.interventions.loadInterventionContinuationState(operationId);
  }

  /** Forwards to {@link OperationStatusService.loadAgentState}. */
  async loadAgentState(operationId: string): Promise<AgentState | null> {
    return this.status.loadAgentState(operationId);
  }

  /** Forwards to {@link InterventionService.ensureInterventionContinuationStarted}. */
  async ensureInterventionContinuationStarted(
    operationId: string,
  ): Promise<'already_started' | 'missing' | 'scheduled'> {
    return this.interventions.ensureInterventionContinuationStarted(operationId);
  }

  // ==================== Operation Status (lobehub procedure surface) ====================

  /** Forwards to {@link OperationStatusService.getOperationStatus}. */
  async getOperationStatus(params: {
    historyLimit?: number;
    includeHistory?: boolean;
    operationId: string;
  }): Promise<OperationStatusResult | null> {
    return this.status.getOperationStatus(params);
  }

  /** Forwards to {@link InterventionService.getPendingInterventions}. */
  async getPendingInterventions(params: {
    operationId?: string;
    userId?: string;
  }): Promise<PendingInterventionsResult> {
    return this.interventions.getPendingInterventions(params);
  }

  /**
   * Assert an operation's run is started (idempotent start intent).
   *
   * Under ACP every operation is dispatched synchronously inside `execAgent`
   * (hetero `recordStart` writes the durable row already `running`) — there
   * is no queued step this method could release, so it can NEVER mint a new
   * run. The contract is therefore "ensure started":
   *
   *   - live op (durable `running` / `waiting_for_*`) → idempotent ack
   *     `{ alreadyStarted: true, scheduled: false }`; repeat intents return
   *     the same result and never dispatch a second run;
   *   - terminal op (`done` / `error` / `interrupted` / `abandoned`) →
   *     `AgentStartError('terminal')`;
   *   - `idle` op or orphan metadata → `AgentStartError('never_dispatched')`:
   *     the intent was prepared but no dispatch exists to release, and there
   *     is no server-side way to start it — the caller must submit a fresh
   *     run instead of reading `success:true` as one;
   *   - unknown operation → `AgentStartError('not_found')`.
   */
  async startExecution(params: StartExecutionParams): Promise<StartExecutionResult> {
    const { operationId } = params;

    try {
      log('Start requested for operation %s', operationId);

      const operationMetadata = await this.stateManager.getOperationMetadata(operationId);
      const operation = await this.agentOperationModel.findById(operationId);
      if (!operationMetadata && !operation) {
        throw new AgentStartError('not_found', `Operation ${operationId} not found`);
      }

      // The durable operation row is the only authority on whether a run
      // exists. A state snapshot is historical read input: a stale 'running'
      // snapshot over an `idle` or absent durable row must never mint an
      // `alreadyStarted` ack for a dispatch that does not exist.
      const status = operation?.status;
      if (
        status === 'running' ||
        status === 'waiting_for_human' ||
        status === 'waiting_for_async_tool'
      ) {
        return {
          alreadyStarted: true,
          operationId,
          scheduled: false,
          success: true,
        };
      }
      if (
        status === 'done' ||
        status === 'error' ||
        status === 'interrupted' ||
        status === 'abandoned'
      ) {
        throw new AgentStartError(
          'terminal',
          `Operation ${operationId} already finished with status '${status}'`,
        );
      }

      throw new AgentStartError(
        'never_dispatched',
        `Operation ${operationId} was never dispatched and cannot be started; submit a new run instead`,
      );
    } catch (error) {
      log('Failed to start execution for operation %s: %O', operationId, error);
      throw error;
    }
  }

  // ==================== Sub-agent / Group Completion Bridges ====================

  /** Forwards to {@link ChildRunService.completeSubAgentBridge}. */
  async completeSubAgentBridge(params: SubAgentBridgeParams): Promise<boolean> {
    return this.childRuns.completeSubAgentBridge(params);
  }

  /** Forwards to {@link ChildRunService.completeGroupActionMember}. */
  async completeGroupActionMember(params: GroupActionMemberBridgeParams): Promise<boolean> {
    return this.childRuns.completeGroupActionMember(params);
  }

  /** Forwards to {@link ChildRunService.tryResumeParentFromAsyncTool}. */
  async tryResumeParentFromAsyncTool(
    params: { parentOperationId: string },
    options?: {
      knownFulfilledMessageId?: string;
      onComplete?: GroupActionOnComplete;
    },
  ): Promise<boolean> {
    return this.childRuns.tryResumeParentFromAsyncTool(params, options);
  }
}
