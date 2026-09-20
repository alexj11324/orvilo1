import { type AgentState, isParkedStatus } from '@orvilo/agent-execution';
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

import { ChildRunService } from '../agentExecution/ChildRunService';
import { InterventionService } from '../agentExecution/InterventionService';
import { OperationInterruptService } from '../agentExecution/OperationInterruptService';
import { OperationStatusService } from '../agentExecution/OperationStatusService';
import {
  type AgentExecutionServiceDeps,
  type GroupActionMemberBridgeParams,
  type GroupActionOnComplete,
  type OperationStatusResult,
  type PendingInterventionsResult,
  type StartExecutionParams,
  type StartExecutionResult,
  type SubAgentBridgeParams,
} from '../agentExecution/types';

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
