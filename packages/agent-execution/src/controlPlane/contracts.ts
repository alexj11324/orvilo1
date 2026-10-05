/** Orvilo owns authorization and completion; runtimes never mint authority. */
export const CONTROL_PLANE_VERSION = 1 as const;

export interface ExecutionFence {
  epoch: number;
  grantId: string;
  leaseId: string;
  ownerId: string;
  policyRevision: number;
  principalId: string;
  stateRevision: number;
  /**
   * The fenced task subject id — `null` when the run's subject is a
   * conversation (RunSubject {kind:'conversation'}): a conversation id is
   * never a task id, so no placeholder leaks into task authorization or
   * device leases (docs/development/device-execution-contract.md).
   */
  taskId: string | null;
  tenantId: string;
}

export type ControlErrorCode =
  | 'unsupported_version'
  | 'invalid_request'
  | 'unauthorized'
  | 'revoked'
  | 'stale_fence'
  | 'lease_expired'
  | 'policy_denied'
  | 'isolation_unavailable'
  | 'idempotency_conflict'
  | 'postcondition_failed'
  | 'unsupported_capability'
  | 'not_quiescent'
  | 'handoff_conflict'
  | 'verification_required'
  | 'outcome_unknown'
  | 'runtime_failed';

export interface ControlError {
  code: ControlErrorCode;
  message: string;
  retryable: boolean;
}

export type ControlResult<T> = { ok: true; value: T } | { ok: false; error: ControlError };

export type TypedAction =
  | { kind: 'file.write'; path: string; content: string }
  | { kind: 'git.commit'; repository: string; message: string; expectedHead: string }
  | {
      kind: 'task.transition';
      taskId: string;
      target: 'blocked' | 'review';
      expectedRevision: number;
    }
  | { kind: 'issue.update'; provider: string; issueId: string; patch: Record<string, string> }
  | { kind: 'deploy'; target: string; artifactDigest: string };

export interface Postcondition {
  expected: string;
  /** Opaque identifier resolved by the trusted verifier, never executable agent code. */
  verifierId: string;
}

export interface Commitment {
  actionKinds: TypedAction['kind'][];
  id: string;
  postconditions: Postcondition[];
  taskId: string;
}

export interface ActionRequest {
  action: TypedAction;
  commitmentId: string;
  fence: ExecutionFence;
  idempotencyKey: string;
  schemaVersion: typeof CONTROL_PLANE_VERSION;
}

export interface DurableReceipt {
  actionKind: TypedAction['kind'];
  commitmentId: string;
  createdAt: number;
  error?: ControlError;
  evidence: string[];
  fence: ExecutionFence;
  id: string;
  idempotencyKey: string;
  requestDigest: string;
  schemaVersion: typeof CONTROL_PLANE_VERSION;
  status: 'prepared' | 'applied' | 'verified' | 'failed' | 'outcome_unknown';
  updatedAt: number;
}

export interface ActionGateway {
  execute: (request: ActionRequest) => Promise<ControlResult<DurableReceipt>>;
}

/** Launch evidence comes from a trusted OS supervisor outside the runtime tree. */
export interface IsolationEvidence {
  credentialsExcluded: boolean;
  enforced: boolean;
  filesystem: boolean;
  network: boolean;
  processes: boolean;
  sanitizedEnvironment: boolean;
  supervisorId: string;
  treeId: string;
}

export interface RuntimeCapabilities {
  cancel: boolean;
  isolation: 'unavailable' | 'os-process-tree';
  /** stableACP on pinned Prime is false. Never synthesize session/load. */
  loadSession: boolean;
  prompt: boolean;
  resume: 'none' | 'acp-load' | 'session-path' | 'rpc-switch';
  schemaVersion: typeof CONTROL_PLANE_VERSION;
  shutdown: boolean;
  start: boolean;
  stream: boolean;
}

export interface RuntimeSession {
  fence: ExecutionFence;
  runtimeId: string;
  sessionId: string;
}

/**
 * RLM child-session context stamped on runtime events originating from a
 * spawned sub-agent (or an update about one). `childId` is the child's
 * stable node id — the ledger maps it onto hetero `parentToolCallId` for
 * Thread routing.
 */
export interface RuntimeSubagentContext {
  childId: string;
  name?: string;
  parentId?: string;
}

/** RLM child lifecycle snapshot, verbatim from the harness wire. */
export interface RuntimeSubagentSnapshot {
  activeSessionId?: string;
  activity?: { kind: string; toolName?: string };
  answerPreview?: string;
  durationMs?: number;
  error?: string;
  id: string;
  label?: string;
  model?: string;
  parentId?: string;
  progressNote?: string;
  prompt?: string;
  sessionDir?: string;
  sessionName?: string;
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled';
  toolUseCount?: number;
}

export type RuntimeEvent =
  | { type: 'text'; sessionId: string; text: string; subagent?: RuntimeSubagentContext }
  | { type: 'thinking'; sessionId: string; text: string; subagent?: RuntimeSubagentContext }
  | {
      type: 'subagent_update';
      sessionId: string;
      child: RuntimeSubagentSnapshot;
      /** Emitting scope when the update arrives on a child's own stream —
       * routes into the emitter's Thread, not the snapshot subject's. */
      subagent?: RuntimeSubagentContext;
    }
  | { type: 'turn-ended'; sessionId: string; reason: 'end_turn' | 'gate' | 'budget' | 'cancelled' }
  | {
      /** A tool call entered execution inside the runtime's session. */
      args: unknown;
      sessionId: string;
      subagent?: RuntimeSubagentContext;
      toolCallId: string;
      toolName: string;
      type: 'tool_call';
    }
  | {
      /** In-flight partial result while a tool call executes. */
      partialResult: unknown;
      sessionId: string;
      subagent?: RuntimeSubagentContext;
      toolCallId: string;
      toolName: string;
      type: 'tool_progress';
    }
  | {
      /** A tool call finished executing inside the runtime's session. */
      isError: boolean;
      result: unknown;
      sessionId: string;
      subagent?: RuntimeSubagentContext;
      toolCallId: string;
      toolName: string;
      type: 'tool_result';
    }
  | {
      type: 'usage';
      sessionId: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens?: number;
      subagent?: RuntimeSubagentContext;
      cost?: {
        input?: number;
        output?: number;
        cacheRead?: number;
        cacheWrite?: number;
        total?: number;
      };
    }
  | { type: 'error'; sessionId: string; error: ControlError; subagent?: RuntimeSubagentContext };

export interface QuiescenceProof {
  observedAt: number;
  pendingActions: number;
  remainingProcesses: number;
  supervisorId: string;
  treeId: string;
}

export interface ExecutionRuntime {
  cancel: (session: RuntimeSession) => Promise<ControlResult<QuiescenceProof>>;
  capabilities: () => RuntimeCapabilities;
  prompt: (session: RuntimeSession, text: string) => AsyncIterable<RuntimeEvent>;
  resume: (input: {
    session: RuntimeSession;
    sessionPath?: string;
  }) => Promise<ControlResult<RuntimeSession>>;
  shutdown: (session: RuntimeSession) => Promise<ControlResult<QuiescenceProof>>;
  start: (input: {
    fence: ExecutionFence;
    workspace: string;
  }) => Promise<ControlResult<RuntimeSession>>;
}

export interface InferenceTextContent {
  text: string;
  type: 'text';
}

export interface InferenceThinkingContent {
  thinking: string;
  type: 'thinking';
}

export interface InferenceImageContent {
  data: string;
  mimeType: string;
  type: 'image';
}

export interface InferenceToolCall {
  arguments: Record<string, unknown>;
  id: string;
  name: string;
  type?: 'toolCall';
}

export type InferenceContentBlock =
  | InferenceTextContent
  | InferenceThinkingContent
  | InferenceImageContent
  | (InferenceToolCall & { type: 'toolCall' });

/** Plain string (most messages) or upstream content blocks — mirrors pi-ai. */
export type InferenceMessageContent = string | InferenceContentBlock[];

export type InferenceMessage =
  | { content: InferenceMessageContent; role: 'system' | 'user' }
  | { content: InferenceMessageContent; role: 'assistant' }
  | {
      content: InferenceMessageContent;
      isError?: boolean;
      role: 'tool';
      toolCallId: string;
      toolName?: string;
    };

/**
 * Copy a wire message into the contract shape preserving the discriminated
 * union — `tool` messages keep `toolCallId`/`toolName`/`isError`.
 */
export const toInferenceMessage = (message: InferenceMessage): InferenceMessage => {
  if (message.role === 'tool') {
    return {
      content: message.content,
      isError: message.isError,
      role: 'tool',
      toolCallId: message.toolCallId,
      toolName: message.toolName,
    };
  }
  return { content: message.content, role: message.role };
};

/** A tool schema the model may call (upstream `Tool` minus executor). */
export interface InferenceToolDefinition {
  description?: string;
  name: string;
  parameters: unknown;
}

/** Provider credentials and endpoint selection stay in the trusted broker. */
export interface InferenceRequest {
  bindingRevision: number;
  fence: ExecutionFence;
  maxOutputTokens: number;
  messages: InferenceMessage[];
  modelRoute: string;
  /** Provider options the binding granted (opaque pass-through). */
  providerOptions?: Record<string, unknown>;
  requestId: string;
  schemaVersion: typeof CONTROL_PLANE_VERSION;
  serviceTier?: string;
  thinkingLevel?: string;
  /** Tool definitions the model may call. */
  tools?: InferenceToolDefinition[];
}

export type InferenceEvent =
  | { type: 'text'; text: string }
  | { text: string; type: 'thinking' }
  | { index?: number; name?: string; toolCallId?: string; type: 'toolcall_start' }
  | { argumentsDelta: string; index?: number; toolCallId?: string; type: 'toolcall_delta' }
  | { index?: number; toolCall: InferenceToolCall; type: 'toolcall_end' }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'error'; error: ControlError };

export interface InferenceBroker {
  infer: (
    request: InferenceRequest,
    options?: { signal?: AbortSignal },
  ) => AsyncIterable<InferenceEvent>;
}

/** Settings requests have their own server-derived scope; no fabricated task fence. */
export interface ProviderConfigurationScope {
  authorityRevision: number;
  ownerId: string;
  principalId: string;
  tenantId: string;
}

export interface ProviderBinding {
  bindingId: string;
  modelRoutes: string[];
  ownerId: string;
  providerId: string;
  revision: number;
  schemaVersion: typeof CONTROL_PLANE_VERSION;
  /** Vault reference only; never a credential or endpoint. Trusted side only. */
  secretReference: string;
  tenantId: string;
}

export interface ProviderBindingRequest {
  bindingId: string;
  bindingRevision: number;
  schemaVersion: typeof CONTROL_PLANE_VERSION;
  scope: ProviderConfigurationScope;
}

export interface ProviderModelCapability {
  /** Context window in tokens, when the provider catalog declares it. */
  contextWindow?: number;
  images: boolean;
  maxOutputTokens: number;
  modelRoute: string;
  /** True when the provider catalog declares reasoning support for the route. */
  reasoning?: boolean;
  text: boolean;
  tools: boolean;
}

export interface ProviderBindingCheck {
  bindingId: string;
  bindingRevision: number;
  checkedAt: number;
  /** Only a successful real provider request may produce ready. */
  status: 'ready' | 'unavailable';
}

/** Implemented in the trusted broker; listings exclude endpoints, headers and secrets. */
export interface ProviderConfigurationBroker {
  capabilities: (
    request: ProviderBindingRequest,
  ) => Promise<ControlResult<ProviderModelCapability[]>>;
  checkBinding: (request: ProviderBindingRequest) => Promise<ControlResult<ProviderBindingCheck>>;
}

export type DispatchAdmissionErrorCode =
  | 'stale-binding'
  | 'revoked'
  | 'tenant-mismatch'
  | 'loop'
  | 'admission-held'
  | 'runtime-unavailable'
  | 'idempotency-conflict'
  | 'unsupported-version'
  | 'invalid-event';

/** All identities/refs are server bound after durable inbox signature validation. */
export interface EventDispatchAdmissionRequest {
  causationId?: string;
  eventId: string;
  idempotencyKey: string;
  inboxRef: string;
  rootDispatchId?: string;
  schemaVersion: typeof CONTROL_PLANE_VERSION;
  sourceId: string;
  subscriptionId: string;
  taskId: string;
  tenantId: string;
  triggerId: string;
  triggerRevision: number;
  userId: string;
  workspaceId: string;
}

export type EventDispatchAdmissionResult =
  | { status: 'accepted'; dispatchId: string; operationId?: string }
  | { status: 'duplicate'; dispatchId: string }
  | { status: 'waiting'; reason: DispatchAdmissionErrorCode; retryable: boolean }
  | { status: 'denied'; reason: DispatchAdmissionErrorCode };

/** Adapter must reauthorize through TaskDispatch/TaskRunner/outbox, never a second runner. */
export interface EventDispatchAdmission {
  admit: (request: EventDispatchAdmissionRequest) => Promise<EventDispatchAdmissionResult>;
}

export type HandoffPhase = 'prepared' | 'quiescing' | 'quiescent' | 'transferred' | 'resumed';

export interface HandoffRecord {
  id: string;
  phase: HandoffPhase;
  quiescence?: QuiescenceProof;
  revision: number;
  schemaVersion: typeof CONTROL_PLANE_VERSION;
  source: ExecutionFence;
  successor?: ExecutionFence;
  successorOwnerId: string;
  taskId: string;
}

export interface VerificationEvidence {
  acceptedDecisionId: string;
  commitmentIds: string[];
  dependencyAcceptanceIds: string[];
  fence: ExecutionFence;
  receiptIds: string[];
  taskId: string;
}
