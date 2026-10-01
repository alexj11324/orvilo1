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
  taskId: string;
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

export type RuntimeEvent =
  | { type: 'text'; sessionId: string; text: string }
  | { type: 'turn-ended'; sessionId: string; reason: 'end_turn' | 'gate' | 'budget' | 'cancelled' }
  | {
      type: 'usage';
      sessionId: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens?: number;
      cost?: {
        input?: number;
        output?: number;
        cacheRead?: number;
        cacheWrite?: number;
        total?: number;
      };
    }
  | { type: 'error'; sessionId: string; error: ControlError };

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

/** Provider credentials and endpoint selection stay in the trusted broker. */
export interface InferenceRequest {
  bindingRevision: number;
  fence: ExecutionFence;
  maxOutputTokens: number;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  modelRoute: string;
  requestId: string;
  schemaVersion: typeof CONTROL_PLANE_VERSION;
}

export type InferenceEvent =
  | { type: 'text'; text: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'error'; error: ControlError };

export interface InferenceBroker {
  infer: (request: InferenceRequest) => AsyncIterable<InferenceEvent>;
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
  images: boolean;
  maxOutputTokens: number;
  modelRoute: string;
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
