/**
 * Prime embedded harness wire protocol — the host↔runner vocabulary carried
 * over the bounded ndjson JSON-RPC transport (harnessTransport.ts).
 *
 * The runner (`@orvilo/prime-harness`) is the container PID 1; the host side is
 * `PrimeEmbeddedRuntime`. Direction matters for request admission:
 *
 *   host → runner requests:      harness.init, session.prompt, session.abort
 *   runner → host requests:      broker.infer, broker.cancel
 *   runner → host notifications: harness.event
 *   host → runner notifications: broker.event
 *
 * Everything else on the wire is a protocol violation — the transport answers
 * unadvertised reverse requests with -32601 and the runtime treats malformed
 * payloads as a fail-closed `protocol_violation`.
 */

import { isNonEmptyString, isRecord } from '@orvilo/utils/object';

import { CONTROL_PLANE_VERSION } from './contracts';

export const HARNESS_PROTOCOL_VERSION = 2 as const;

export const HARNESS_MAX_FRAME_BYTES = 1_048_576;
export const HARNESS_MAX_PENDING_REQUESTS = 16;
export const HARNESS_REQUEST_TIMEOUT_MS = 30_000;

export const HARNESS_INIT_METHOD = 'harness.init' as const;
export const HARNESS_PROMPT_METHOD = 'session.prompt' as const;
export const HARNESS_ABORT_METHOD = 'session.abort' as const;
export const HARNESS_RESUME_METHOD = 'session.resume' as const;
export const HARNESS_LIST_SESSIONS_METHOD = 'session.list' as const;
export const HARNESS_EVENT_NOTIFICATION = 'harness.event' as const;
export const BROKER_INFER_METHOD = 'broker.infer' as const;
export const BROKER_CANCEL_METHOD = 'broker.cancel' as const;
export const BROKER_EVENT_NOTIFICATION = 'broker.event' as const;

export const HARNESS_FORWARD_METHODS = [
  HARNESS_INIT_METHOD,
  HARNESS_PROMPT_METHOD,
  HARNESS_ABORT_METHOD,
  HARNESS_RESUME_METHOD,
  HARNESS_LIST_SESSIONS_METHOD,
] as const;

/** Reverse requests the host will actually answer; everything else gets -32601. */
export const HARNESS_REVERSE_METHODS = [BROKER_INFER_METHOD, BROKER_CANCEL_METHOD] as const;

export type HarnessForwardMethod = (typeof HARNESS_FORWARD_METHODS)[number];
export type HarnessReverseMethod = (typeof HARNESS_REVERSE_METHODS)[number];

// ---------- host → runner ----------

/**
 * Model identity the host pins into the handshake — resolved host-side from the
 * issued provider binding, so the runner presents the real route upstream and
 * `broker.infer` requests carry a `modelRoute` the authority actually granted.
 * Runner-visible metadata only; never an endpoint or credential.
 */
export interface HarnessInitModel {
  /** Context window in tokens, when the issued capability declares it. */
  contextWindow?: number;
  id: string;
  /** Input modalities the route accepts, e.g. `['text','image']`. */
  input?: string[];
  maxOutputTokens: number;
  /** True when the issued binding's model capability declares reasoning. */
  reasoning?: boolean;
}

/**
 * Upstream autonomous-continuation policy (AgentAutonomousConfig). Absent →
 * disabled: the host owns the turn lifecycle, so continuation stays an
 * explicit host decision rather than an upstream default.
 */
export interface HarnessInitAutonomousConfig {
  continuationPrompt?: string;
  enabled?: boolean;
  gates?: {
    commands?: string[];
    maxRetries?: number;
    timeoutMs?: number;
  };
  maxContinuations?: number;
  maxTokens?: number;
  maxTurns?: number;
  subagentKeepAliveMs?: number;
  timeoutMs?: number;
}

/** Seed goal for a new depth-0 session (upstream initialGoal). */
export interface HarnessInitGoal {
  objective: string;
  tokenBudget?: number;
}

/**
 * Host-pinnable subset of the upstream tool surface. `allowed` caps the
 * tools the session may ever activate (upstream `allowedToolNames`);
 * `active` overrides the initial active set (upstream
 * `initialActiveToolNames`, default `['ipython']`).
 */
export interface HarnessInitToolPolicy {
  active?: string[];
  allowed?: string[];
}

export interface HarnessInitParams {
  /** Autonomous-continuation policy pass-through; absent keeps it disabled. */
  autonomous?: HarnessInitAutonomousConfig;
  controlPlaneVersion: number;
  /** Seed goal for a fresh top-level session; ignored on resume. */
  goal?: HarnessInitGoal;
  model: HarnessInitModel;
  /** Source pin echo — the runner must return it verbatim. */
  pin: { commit: string; version: string; license: string };
  protocolVersion: number;
  /**
   * Upstream session file id (`<sessionDir>/<id>.jsonl`) the runner should
   * reopen instead of minting a fresh session — real resume across a runner
   * restart. Absent or unmatched → fresh session; the ack's `sessionId`
   * reports which branch happened (equal id = resumed, new id = rebuilt).
   */
  resumeSessionId?: string;
  /** RLM sub-agent policy. `maxDepth` pins upstream `rlmMaxDepth`
   * (upstream default 2); children always spawn under device stateDir. */
  rlm?: { maxDepth?: number };
  /** Host-supplied runner state dir. Optional for embedded parity — the
   * runner falls back to its local default when the host does not supply
   * one; device hosts always pass an explicit device-resolved path. */
  stateDir?: string;
  /** Reasoning effort for the session (upstream `thinkingLevel`). */
  thinkingLevel?: string;
  /** Host-pinnable tool allowlist/active subset; absent → upstream defaults. */
  toolPolicy?: HarnessInitToolPolicy;
  workspace: string;
}

/**
 * The host-pinnable slice of `harness.init` — policy fields a composer may
 * set without re-deriving the handshake identity fields (pin/model/versions/
 * workspace). Binding rows, descriptors and embedded compositions carry this
 * shape; the init request spreads it under the identity fields.
 */
export type HarnessInitPolicy = Pick<
  HarnessInitParams,
  'autonomous' | 'goal' | 'rlm' | 'thinkingLevel' | 'toolPolicy'
>;

/**
 * Product effort pin (`provider_bindings.config.selection.effort`) → upstream
 * `ThinkingLevel` (`'minimal'|'low'|'medium'|'high'|'xhigh'|'max'`). `'default'`
 * maps to `undefined` — upstream's own clamp keeps the model's default level;
 * `'ultra'` clamps to upstream's ceiling `'max'`.
 */
export const thinkingLevelForEffort = (effort?: string): string | undefined => {
  switch (effort) {
    case 'low':
    case 'medium':
    case 'high':
    case 'xhigh':
    case 'max': {
      return effort;
    }
    case 'ultra': {
      return 'max';
    }
    default: {
      return undefined;
    }
  }
};

export interface HarnessInitAck {
  capabilities: {
    prompt: boolean;
    stream: boolean;
    cancel: boolean;
    /** Tool names the runner will actually execute (empty while tools are sealed). */
    tools: string[];
    /** Reverse request methods the runner may issue (v1: broker.infer, broker.cancel). */
    requests: string[];
  };
  pin: { commit: string; version: string; license: string };
  protocolVersion: number;
  sessionId: string;
}

export interface HarnessPromptParams {
  /** Ephemeral host-owned Orvilo callback endpoint, released after this turn. */
  builtinMcp?: { operationId: string; url: string };
  sessionId: string;
  text: string;
}

export interface HarnessResumeParams {
  /** Upstream session file id to reopen under the runner's session dir. */
  resumeSessionId: string;
  sessionId: string;
}

export interface HarnessResumeResult {
  resumed: boolean;
  /** The session id now bound to this runner — equal to resumeSessionId on
   * a real resume, a fresh id when no matching session file existed. */
  sessionId: string;
}

export interface HarnessListSessionsParams {
  sessionId: string;
}

export interface HarnessListSessionsResult {
  /** Upstream session file ids persisted under the runner's session dir. */
  sessions: string[];
}

export type HarnessStopReason = 'end_turn' | 'cancelled' | 'budget' | 'error';

export interface HarnessPromptResult {
  error?: string;
  stopReason: HarnessStopReason;
}

export interface HarnessAbortParams {
  sessionId: string;
}

// ---------- runner → host notifications ----------

/**
 * Provenance for an event that originated inside an RLM sub-agent session
 * rather than the run's root session. `childId` is the spawn's stable
 * identifier (the RLM child node id) — it plays the same Thread-routing role
 * as hetero's `parent_tool_use_id` on subagent stream chunks.
 */
export interface HarnessSubagentContext {
  childId: string;
  name?: string;
  /** Upstream session id of the spawning parent, when known. */
  parentId?: string;
}

export type HarnessSessionEvent =
  | { kind: 'text'; text: string; subagent?: HarnessSubagentContext }
  | {
      kind: 'usage';
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
      subagent?: HarnessSubagentContext;
    }
  | {
      /** Model reasoning text (thinking block delta). */
      kind: 'thinking';
      text: string;
      subagent?: HarnessSubagentContext;
    }
  | {
      /** A tool call entered execution inside the runner (tool_execution_start). */
      args: unknown;
      kind: 'tool_call';
      toolCallId: string;
      toolName: string;
      subagent?: HarnessSubagentContext;
    }
  | {
      /** In-flight partial result while a tool call executes (tool_execution_update). */
      kind: 'tool_progress';
      partialResult: unknown;
      toolCallId: string;
      toolName: string;
      subagent?: HarnessSubagentContext;
    }
  | {
      /** A tool call finished executing inside the runner (tool_execution_end). */
      isError: boolean;
      kind: 'tool_result';
      result: unknown;
      toolCallId: string;
      toolName: string;
      subagent?: HarnessSubagentContext;
    }
  | {
      /**
       * Lifecycle/status snapshot of an RLM sub-agent (upstream
       * `rlm_child_update`). `prompt` is present only on the first update —
       * it seeds the subagent Thread's user message the way hetero
       * `spawnMetadata.prompt` does.
       */
      child: {
        id: string;
        parentId?: string;
        activeSessionId?: string;
        sessionName?: string;
        model?: string;
        label?: string;
        status: 'queued' | 'running' | 'done' | 'error' | 'cancelled';
        activity?: { kind: 'waiting' | 'writing' | 'executing'; toolName?: string };
        durationMs?: number;
        answerPreview?: string;
        toolUseCount?: number;
        progressNote?: string;
        error?: string;
        sessionDir?: string;
        prompt?: string;
      };
      kind: 'subagent_update';
      /**
       * Emitting scope when this update arrives on a child's own stream
       * (a sub-agent reporting on ITS child) — the ledger routes it into
       * the emitter's Thread rather than the snapshot subject's.
       */
      subagent?: HarnessSubagentContext;
    }
  | {
      /**
       * A tool event fired for a name outside the session's tool allowlist —
       * kept as the fail-closed invariant for undeclared tools, not the
       * normal path for negotiated tools.
       */
      kind: 'tool-violation';
      subagent?: HarnessSubagentContext;
      toolName: string;
      event:
        | 'tool_execution_start'
        | 'tool_execution_update'
        | 'tool_execution_end'
        | 'toolcall_start'
        | 'toolcall_delta'
        | 'toolcall_end';
    }
  | { kind: 'error'; message: string; subagent?: HarnessSubagentContext };

export interface HarnessEventParams {
  event: HarnessSessionEvent;
  sessionId: string;
}

// ---------- runner → host broker requests ----------

export interface SanitizedTextContent {
  text: string;
  type: 'text';
}

export interface SanitizedThinkingContent {
  thinking: string;
  type: 'thinking';
}

export interface SanitizedImageContent {
  data: string;
  mimeType: string;
  type: 'image';
}

export interface SanitizedToolCall {
  arguments: Record<string, unknown>;
  id: string;
  name: string;
  type: 'toolCall';
}

export type SanitizedContentBlock =
  SanitizedTextContent | SanitizedThinkingContent | SanitizedImageContent | SanitizedToolCall;

/**
 * Message content on the wire: either the legacy plain string (most
 * messages) or upstream content blocks (text/thinking/image/toolCall),
 * mirroring pi-ai's `Message.content` shape.
 */
export type SanitizedMessageContent = string | SanitizedContentBlock[];

export type SanitizedInferenceMessage =
  | { content: SanitizedMessageContent; role: 'system' | 'user' }
  | { content: SanitizedMessageContent; role: 'assistant' }
  | {
      content: SanitizedMessageContent;
      isError?: boolean;
      role: 'tool';
      toolCallId: string;
      toolName?: string;
    };

/** A tool definition the model may see (upstream `Tool` minus executor). */
export interface SanitizedToolDefinition {
  description?: string;
  name: string;
  parameters: unknown;
}

/**
 * The runner-side view of an inference request. This is deliberately the
 * sanitized shape of `InferenceRequest` from contracts.ts: no binding, fence,
 * endpoint, headers or credentials ever reach the runner.
 */
export interface SanitizedInferenceRequest {
  maxOutputTokens: number;
  messages: SanitizedInferenceMessage[];
  modelRoute: string;
  /** Provider options the binding granted (opaque pass-through). */
  providerOptions?: Record<string, unknown>;
  requestId: string;
  /** Service tier for providers that support one. */
  serviceTier?: string;
  /** Upstream thinking level the session negotiated (`off`..`xhigh`). */
  thinkingLevel?: string;
  /** Tool definitions the model may call — upstream `Tool` schemas. */
  tools?: SanitizedToolDefinition[];
}

export interface BrokerInferParams {
  request: SanitizedInferenceRequest;
  sessionId: string;
}

export interface BrokerInferAck {
  accepted: true;
  requestId: string;
}

export interface BrokerCancelParams {
  requestId: string;
}

export type BrokerStreamEvent =
  | { type: 'text'; text: string }
  | {
      /** Model reasoning stream — relays the provider's thinking deltas. */
      text: string;
      type: 'thinking_delta';
    }
  | {
      /** A streamed tool call began (`index` disambiguates parallel calls). */
      index?: number;
      name?: string;
      toolCallId?: string;
      type: 'toolcall_start';
    }
  | { argumentsDelta: string; index?: number; toolCallId?: string; type: 'toolcall_delta' }
  | { index?: number; toolCall: SanitizedToolCall; type: 'toolcall_end' }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'error'; code: string; message: string }
  | { type: 'end' };

export interface BrokerEventParams {
  event: BrokerStreamEvent;
  requestId: string;
}

// ---------- validation helpers ----------

const isString = (value: unknown): value is string => typeof value === 'string';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isPinEcho = (pin: unknown): pin is HarnessInitAck['pin'] =>
  isRecord(pin) &&
  isNonEmptyString(pin.commit) &&
  isNonEmptyString(pin.version) &&
  isNonEmptyString(pin.license);

export const isHarnessInitAck = (value: unknown): value is HarnessInitAck => {
  if (!isRecord(value)) return false;
  if (value.protocolVersion !== HARNESS_PROTOCOL_VERSION) return false;
  if (!isNonEmptyString(value.sessionId)) return false;
  if (!isPinEcho(value.pin)) return false;
  const caps = value.capabilities;
  if (!isRecord(caps)) return false;
  if (caps.prompt !== true || caps.stream !== true || caps.cancel !== true) return false;
  if (!Array.isArray(caps.tools) || !caps.tools.every(isString)) return false;
  if (!Array.isArray(caps.requests) || !caps.requests.every(isString)) return false;
  return true;
};

const HARNESS_STOP_REASONS: ReadonlySet<string> = new Set([
  'end_turn',
  'cancelled',
  'budget',
  'error',
]);

export const isHarnessPromptResult = (value: unknown): value is HarnessPromptResult =>
  isRecord(value) && isString(value.stopReason) && HARNESS_STOP_REASONS.has(value.stopReason);

const isHarnessSessionEvent = (event: unknown): event is HarnessSessionEvent => {
  if (!isRecord(event) || !isString(event.kind)) return false;
  switch (event.kind) {
    case 'text': {
      return isString(event.text);
    }
    case 'usage': {
      return isFiniteNumber(event.inputTokens) && isFiniteNumber(event.outputTokens);
    }
    case 'thinking': {
      return isString(event.text);
    }
    case 'tool_call': {
      return isNonEmptyString(event.toolCallId) && isNonEmptyString(event.toolName);
    }
    case 'tool_progress': {
      return isNonEmptyString(event.toolCallId) && isNonEmptyString(event.toolName);
    }
    case 'tool_result': {
      return (
        isNonEmptyString(event.toolCallId) &&
        isNonEmptyString(event.toolName) &&
        typeof event.isError === 'boolean'
      );
    }
    case 'tool-violation': {
      return isNonEmptyString(event.toolName) && isNonEmptyString(event.event);
    }
    case 'error': {
      return isNonEmptyString(event.message);
    }
    default: {
      return false;
    }
  }
};

export const isHarnessEventParams = (params: unknown): params is HarnessEventParams =>
  isRecord(params) && isNonEmptyString(params.sessionId) && isHarnessSessionEvent(params.event);

export const isHarnessResumeParams = (params: unknown): params is HarnessResumeParams =>
  isRecord(params) &&
  isNonEmptyString(params.sessionId) &&
  isNonEmptyString(params.resumeSessionId);

export const isHarnessResumeResult = (value: unknown): value is HarnessResumeResult =>
  isRecord(value) && isNonEmptyString(value.sessionId) && typeof value.resumed === 'boolean';

export const isHarnessListSessionsResult = (value: unknown): value is HarnessListSessionsResult =>
  isRecord(value) && Array.isArray(value.sessions) && value.sessions.every(isString);

const isSanitizedToolCall = (value: unknown): value is SanitizedToolCall =>
  isRecord(value) &&
  isNonEmptyString(value.id) &&
  isNonEmptyString(value.name) &&
  isRecord(value.arguments);

const isSanitizedContentBlock = (value: unknown): value is SanitizedContentBlock => {
  if (!isRecord(value) || !isString(value.type)) return false;
  switch (value.type) {
    case 'text': {
      return isString(value.text);
    }
    case 'thinking': {
      return isString(value.thinking);
    }
    case 'image': {
      return isNonEmptyString(value.data) && isNonEmptyString(value.mimeType);
    }
    case 'toolCall': {
      return isSanitizedToolCall(value);
    }
    default: {
      return false;
    }
  }
};

const isSanitizedMessageContent = (value: unknown): value is SanitizedMessageContent =>
  isString(value) || (Array.isArray(value) && value.every(isSanitizedContentBlock));

const isSanitizedInferenceMessage = (value: unknown): value is SanitizedInferenceMessage => {
  if (!isRecord(value) || !isString(value.role)) return false;
  switch (value.role) {
    case 'system':
    case 'user':
    case 'assistant': {
      return isSanitizedMessageContent(value.content);
    }
    case 'tool': {
      return isNonEmptyString(value.toolCallId) && isSanitizedMessageContent(value.content);
    }
    default: {
      return false;
    }
  }
};

const isSanitizedToolDefinition = (value: unknown): value is SanitizedToolDefinition =>
  isRecord(value) && isNonEmptyString(value.name) && value.parameters !== undefined;

export const isSanitizedInferenceRequest = (value: unknown): value is SanitizedInferenceRequest => {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.requestId)) return false;
  if (!isNonEmptyString(value.modelRoute)) return false;
  if (!isFiniteNumber(value.maxOutputTokens) || value.maxOutputTokens < 1) return false;
  if (!Array.isArray(value.messages) || value.messages.length === 0) return false;
  if (!value.messages.every(isSanitizedInferenceMessage)) return false;
  if (
    value.tools !== undefined &&
    (!Array.isArray(value.tools) || !value.tools.every(isSanitizedToolDefinition))
  ) {
    return false;
  }
  if (value.thinkingLevel !== undefined && !isString(value.thinkingLevel)) return false;
  if (value.serviceTier !== undefined && !isString(value.serviceTier)) return false;
  if (value.providerOptions !== undefined && !isRecord(value.providerOptions)) return false;
  return true;
};

export const isBrokerInferParams = (params: unknown): params is BrokerInferParams =>
  isRecord(params) &&
  isNonEmptyString(params.sessionId) &&
  isSanitizedInferenceRequest(params.request);

export const isBrokerCancelParams = (params: unknown): params is BrokerCancelParams =>
  isRecord(params) && isNonEmptyString(params.requestId);

export const isBrokerStreamEvent = (value: unknown): value is BrokerStreamEvent => {
  if (!isRecord(value) || !isString(value.type)) return false;
  switch (value.type) {
    case 'text': {
      return isString(value.text);
    }
    case 'thinking_delta': {
      return isString(value.text);
    }
    case 'toolcall_start': {
      return (
        (value.toolCallId === undefined || isString(value.toolCallId)) &&
        (value.name === undefined || isString(value.name)) &&
        (value.index === undefined || isFiniteNumber(value.index))
      );
    }
    case 'toolcall_delta': {
      return (
        isString(value.argumentsDelta) &&
        (value.toolCallId === undefined || isString(value.toolCallId)) &&
        (value.index === undefined || isFiniteNumber(value.index))
      );
    }
    case 'toolcall_end': {
      return (
        isSanitizedToolCall(value.toolCall) &&
        (value.index === undefined || isFiniteNumber(value.index))
      );
    }
    case 'usage': {
      return isFiniteNumber(value.inputTokens) && isFiniteNumber(value.outputTokens);
    }
    case 'error': {
      return isNonEmptyString(value.code) && isString(value.message);
    }
    case 'end': {
      return true;
    }
    default: {
      return false;
    }
  }
};

export const harnessProtocolSummary = () =>
  `harness-v${HARNESS_PROTOCOL_VERSION}/cpv-${CONTROL_PLANE_VERSION}`;
