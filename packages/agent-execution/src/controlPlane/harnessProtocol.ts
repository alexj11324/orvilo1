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

export const HARNESS_PROTOCOL_VERSION = 1 as const;

export const HARNESS_MAX_FRAME_BYTES = 1_048_576;
export const HARNESS_MAX_PENDING_REQUESTS = 16;
export const HARNESS_REQUEST_TIMEOUT_MS = 30_000;

export const HARNESS_INIT_METHOD = 'harness.init' as const;
export const HARNESS_PROMPT_METHOD = 'session.prompt' as const;
export const HARNESS_ABORT_METHOD = 'session.abort' as const;
export const HARNESS_EVENT_NOTIFICATION = 'harness.event' as const;
export const BROKER_INFER_METHOD = 'broker.infer' as const;
export const BROKER_CANCEL_METHOD = 'broker.cancel' as const;
export const BROKER_EVENT_NOTIFICATION = 'broker.event' as const;

export const HARNESS_FORWARD_METHODS = [
  HARNESS_INIT_METHOD,
  HARNESS_PROMPT_METHOD,
  HARNESS_ABORT_METHOD,
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
  id: string;
  maxOutputTokens: number;
}

export interface HarnessInitParams {
  controlPlaneVersion: number;
  model: HarnessInitModel;
  /** Source pin echo — the runner must return it verbatim. */
  pin: { commit: string; version: string; license: string };
  protocolVersion: number;
  workspace: string;
}

export interface HarnessInitAck {
  capabilities: {
    prompt: boolean;
    stream: boolean;
    cancel: boolean;
    /** Tool names the runner will actually execute (v1: always empty). */
    tools: string[];
    /** Reverse request methods the runner may issue (v1: broker.infer, broker.cancel). */
    requests: string[];
  };
  pin: { commit: string; version: string; license: string };
  protocolVersion: number;
  sessionId: string;
}

export interface HarnessPromptParams {
  sessionId: string;
  text: string;
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

export type HarnessSessionEvent =
  | { kind: 'text'; text: string }
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
    }
  | {
      kind: 'tool-violation';
      toolName: string;
      event:
        | 'tool_execution_start'
        | 'tool_execution_update'
        | 'tool_execution_end'
        | 'toolcall_start'
        | 'toolcall_delta'
        | 'toolcall_end';
    }
  | { kind: 'error'; message: string };

export interface HarnessEventParams {
  event: HarnessSessionEvent;
  sessionId: string;
}

// ---------- runner → host broker requests ----------

export interface SanitizedInferenceMessage {
  content: string;
  role: 'system' | 'user' | 'assistant';
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
  requestId: string;
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

const INFERENCE_ROLES: ReadonlySet<string> = new Set(['system', 'user', 'assistant']);

export const isSanitizedInferenceRequest = (value: unknown): value is SanitizedInferenceRequest => {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.requestId)) return false;
  if (!isNonEmptyString(value.modelRoute)) return false;
  if (!isFiniteNumber(value.maxOutputTokens) || value.maxOutputTokens < 1) return false;
  if (!Array.isArray(value.messages) || value.messages.length === 0) return false;
  return value.messages.every(
    (m) => isRecord(m) && INFERENCE_ROLES.has(m.role as string) && isString(m.content),
  );
};

export const isBrokerInferParams = (params: unknown): params is BrokerInferParams =>
  isRecord(params) &&
  isNonEmptyString(params.sessionId) &&
  isSanitizedInferenceRequest(params.request);

export const isBrokerCancelParams = (params: unknown): params is BrokerCancelParams =>
  isRecord(params) && isNonEmptyString(params.requestId);

export const harnessProtocolSummary = () =>
  `harness-v${HARNESS_PROTOCOL_VERSION}/cpv-${CONTROL_PLANE_VERSION}`;
