import { type AgentRuntimeContext, type AgentState } from '@orvilo/agent-runtime';
import type { EvalToolForwardingConfig, RemoteExecutionStatus } from '@orvilo/types';

// ==================== Step Lifecycle Callbacks ====================

// Canonical home: services/agentExecution/stepTypes.ts. Re-exported here for
// the consumers that still reference this module.
export type {
  StepCompletionReason,
  StepLifecycleCallbacks,
  StepPresentationData,
} from '../agentExecution/stepTypes';

/**
 * Params for the sub-agent completion bridge — see
 * `AgentRuntimeService.completeSubAgentBridge`.
 */
export interface SubAgentBridgeParams {
  /** Child op's final state — passed in-process when available; loaded from the state manager otherwise. */
  finalState?: AgentState;
  /** Child (sub-agent) operation ID. */
  operationId: string;
  parentOperationId: string;
  reason: string;
  threadId: string;
  /** The parent's placeholder `role: 'tool'` message to backfill. */
  toolMessageId: string;
}

// ==================== Group Orchestration (call agent member) ====================

/** Whether a group member runs in the shared group session or an isolated thread. */
export type GroupActionMemberMode = 'in_group' | 'isolated';

/** Whether the supervisor resumes or finishes once all members complete. */
export type GroupActionOnComplete = 'resume' | 'finish';

/**
 * Params for the group-action member completion bridge — see
 * `AgentRuntimeService.completeGroupActionMember`. Mirrors the sub-agent bridge
 * but enforces a K=N member barrier: each member backfills its own anchor, and
 * the supervisor's group tool message is only backfilled (which satisfies the
 * parked op's barrier) once every member's anchor is fulfilled.
 */
export interface GroupActionMemberBridgeParams {
  /**
   * The per-member anchor `role: 'tool'` message to backfill. Equals
   * `groupToolMessageId` when `expectedMembers === 1` (single-member actions
   * collapse the anchor onto the group tool call itself).
   */
  anchorMessageId: string;
  /** Total members forked under this group tool call — the K=N barrier target. */
  expectedMembers: number;
  /** Child member op's final state — passed in-process when available; loaded otherwise. */
  finalState?: AgentState;
  /** The supervisor's parked group-management tool message (`tool_call_id` = call id). */
  groupToolMessageId: string;
  /** in_group → backfill a short note; isolated → backfill the member's final answer. */
  mode: GroupActionMemberMode;
  /** Resume the supervisor LLM, or finish the orchestration (skipCallSupervisor/delegate). */
  onComplete: GroupActionOnComplete;
  /** Child (member) operation ID. */
  operationId: string;
  parentOperationId: string;
  reason: string;
  /** Isolation thread id (isolated mode only). */
  threadId?: string;
}

/**
 * Params handed to the `execGroupMember` callback — fork one group member
 * (in-group or isolated) under a group-management tool call, installing the
 * group-action member completion bridge.
 */
export interface ExecGroupMemberParams {
  /** Member agent id. */
  agentId: string;
  /** Per-member anchor message id the bridge backfills. */
  anchorMessageId: string;
  /** Disable tools for this member (broadcast — voice opinions only). */
  disableTools?: boolean;
  /** K=N barrier target stored on the group tool message. */
  expectedMembers: number;
  /** Group id. */
  groupId: string;
  /** Supervisor's group-management tool message id (the parked tool call). */
  groupToolMessageId: string;
  /** Optional supervisor instruction guiding the member's response. */
  instruction?: string;
  /** in_group (non-isolated group session) or isolated (own thread). */
  mode: GroupActionMemberMode;
  /** Resume or finish the supervisor once all members complete. */
  onComplete: GroupActionOnComplete;
  /** Parent (supervisor) operation id. */
  parentOperationId: string;
  /**
   * Supervisor ASSISTANT message id that owns the group-management tool call.
   * In-group council members parent their response to THIS message — so the
   * member assistants are siblings of the council tool under the supervisor
   * turn and the renderer groups them into one council — while the per-member
   * anchors stay under `groupToolMessageId` for the K=N barrier.
   */
  supervisorMessageId?: string;
  /** Per-member timeout (ms), isolated mode. */
  timeout?: number;
  /** Group topic id. */
  topicId: string;
}

export interface ExecGroupMemberResult {
  error?: string;
  /** Forked member operation id (when started). */
  operationId?: string;
  /** Whether the member op was forked. */
  started: boolean;
  /** Isolation thread id (isolated mode only). */
  threadId?: string;
}

export interface OperationStatusResult {
  currentState: {
    cost?: any;
    costLimit?: any;
    error?: string;
    interruption?: any;
    lastModified: string;
    maxSteps?: number;
    pendingHumanPrompt?: any;
    pendingHumanSelect?: any;
    pendingToolsCalling?: any;
    status: string;
    stepCount: number;
    usage?: any;
  };
  executionHistory?: any[];
  hasError: boolean;
  isActive: boolean;
  isCompleted: boolean;
  metadata: any;
  needsHumanInput: boolean;
  operationId: string;
  recentEvents?: any[];
  /**
   * Remote-execution surface: the durable admission + cancel ledger for
   * device/sandbox-dispatched runs, plus the stream tail cursor a reconnect
   * would resume from. Absent for runs with no remote admission record.
   */
  remoteExecution?: RemoteExecutionStatus;
  stats: {
    lastActiveTime: number;
    totalCost: number;
    totalMessages: number;
    totalSteps: number;
    uptime: number;
  };
}

export interface PendingInterventionsResult {
  pendingInterventions: Array<{
    lastModified: string;
    modelRuntimeConfig?: any;
    operationId: string;
    pendingHumanPrompt?: any;
    pendingHumanSelect?: any;
    pendingToolsCalling?: any[];
    status: string;
    stepCount: number;
    type: 'tool_approval' | 'human_prompt' | 'human_select';
    userId?: string;
  }>;
  timestamp: string;
  totalCount: number;
}

export interface StartExecutionParams {
  context?: AgentRuntimeContext;
  delay?: number;
  operationId: string;
  priority?: 'high' | 'normal' | 'low';
}

export interface StartExecutionResult {
  messageId?: string;
  operationId: string;
  scheduled: boolean;
  success: boolean;
}

export interface EvalRuntimeContext {
  caseId?: string;
  toolForwarding?: EvalToolForwardingConfig;
}
