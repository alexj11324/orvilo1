/**
 * Prime embedded harness runtime — the first-party ExecutionRuntime that
 * drives `@orvilo/prime-harness` (container PID 1) over the bounded ndjson
 * JSON-RPC transport instead of ACP.
 *
 * Same admission order as PrimeExecutionRuntime: authorize → verifyArtifact →
 * supervisor.launch → verifiedIsolation → connect → handshake → authorize
 * re-check → register. The vocabulary is the harness protocol
 * (harnessProtocol.ts); the runner may issue only `broker.*` reverse requests,
 * which are answered by a trusted broker bridge — never by handing the runner
 * endpoints, headers or credentials.
 */
import { isNonEmptyString, isRecord } from '@orvilo/utils/object';

import type {
  ControlErrorCode,
  ControlResult,
  ExecutionFence,
  ExecutionRuntime,
  InferenceBroker,
  InferenceRequest,
  IsolationEvidence,
  QuiescenceProof,
  RuntimeCapabilities,
  RuntimeEvent,
  RuntimeSession,
} from './contracts';
import { CONTROL_PLANE_VERSION } from './contracts';
import type {
  HarnessInitModel,
  HarnessSessionEvent,
  SanitizedInferenceRequest,
} from './harnessProtocol';
import {
  BROKER_CANCEL_METHOD,
  BROKER_EVENT_NOTIFICATION,
  BROKER_INFER_METHOD,
  HARNESS_ABORT_METHOD,
  HARNESS_EVENT_NOTIFICATION,
  HARNESS_INIT_METHOD,
  HARNESS_PROMPT_METHOD,
  HARNESS_PROTOCOL_VERSION,
  isBrokerCancelParams,
  isBrokerInferParams,
  isHarnessEventParams,
  isHarnessInitAck,
  isHarnessPromptResult,
} from './harnessProtocol';
import type { HarnessChannel } from './harnessTransport';
import type { ProcessTreeSupervisor } from './isolation';
import { sanitizedRuntimeEnvironment, verifiedIsolation } from './isolation';

export const PRIME_EMBEDDED_PIN = {
  commit: '7d442aafa985f9342134fac16c2ef41f03fb45c1',
  version: '0.9.8',
  license: 'MIT',
  protocol: HARNESS_PROTOCOL_VERSION,
} as const;

/**
 * Host-side seam for turning a runner-issued sanitized request into a trusted
 * `InferenceRequest`. Phase 3 binds this to SqlTrustedProviderBackend
 * resolution; the default wires the session fence and a stub bindingRevision.
 */
export type BuildInferenceRequest = (input: {
  request: SanitizedInferenceRequest;
  session: RuntimeSession;
}) => ControlResult<InferenceRequest>;

/**
 * Fallback model pin for composition-less sessions (tests and the phase-2 stub
 * seam). The phase-3 bridge always supplies `initModel` — a mismatched default
 * fails closed at the first `broker.infer` route check.
 */
export const DEFAULT_EMBEDDED_INIT_MODEL: HarnessInitModel = {
  id: 'orvilo-broker',
  maxOutputTokens: 8192,
};

export interface PrimeEmbeddedRuntimeOptions {
  /** Runner arguments; defaults to [artifact]. */
  args?: string[];
  /** Runner bundle path (or digest) hashed by verifyArtifact before launch. */
  artifact: string;
  /** Authoritative tenant/principal/task/grant/lease/epoch/policy check.
   * Revocation must additionally stop the tree; brokers recheck every effect. */
  authorize: (fence: ExecutionFence) => Promise<ControlResult<true>>;
  /** Phase-3 seam: trusted fence/binding resolution for runner requests. */
  buildInferenceRequest?: BuildInferenceRequest;
  connect: (treeId: string) => Promise<HarnessChannel>;
  /** Executable inside the isolated tree (e.g. /usr/local/bin/node). */
  executable: string;
  home: string;
  /** Trusted inference broker port; runner inference is denied without it. */
  inferenceBroker?: InferenceBroker;
  /** Model identity pinned into harness.init — resolved from the issued binding. */
  initModel?: HarnessInitModel;
  now?: () => number;
  /** Trusted supervisor mapping of the host workspace into the isolated tree. */
  runtimeWorkspace?: string;
  supervisor: ProcessTreeSupervisor;
  temp: string;
  /** Trusted artifact verification, not the child reporting its own commit. */
  verifyArtifact: (
    artifact: string,
    pin: typeof PRIME_EMBEDDED_PIN,
  ) => Promise<ControlResult<true>>;
}

interface Entry {
  /** Wakes the pump for an in-flight infer so it can drop the backend stream. */
  brokerCancels?: Map<string, () => void>;
  brokerStreams?: Set<string>;
  interrupt?: () => void;
  isolation: IsolationEvidence;
  prompting: boolean;
  proof?: QuiescenceProof;
  session: RuntimeSession;
  stop?: Promise<ControlResult<QuiescenceProof>>;
  stopping: boolean;
  transport: HarnessChannel;
}

const failure = (code: ControlErrorCode, message: string): ControlResult<never> => ({
  ok: false,
  error: { code, message, retryable: false },
});
const record = (value: unknown): Record<string, unknown> | undefined =>
  isRecord(value) ? value : undefined;
const fenceKeys: (keyof ExecutionFence)[] = [
  'tenantId',
  'principalId',
  'taskId',
  'grantId',
  'ownerId',
  'leaseId',
  'epoch',
  'policyRevision',
  'stateRevision',
];

const RUNTIME_ID = 'prime-embedded' as const;

/** Prompts are bounded by cancel()/tree-kill, not by the transport's 30 s default. */
const PROMPT_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/**
 * First-party runtime. Sessions come from the runner's init handshake; resume
 * stays 'none' in v1 (in-memory SessionManager — nothing to reload).
 */
export class PrimeEmbeddedRuntime implements ExecutionRuntime {
  private readonly sessions = new Map<string, Entry>();
  private negotiated = false;

  constructor(private readonly options?: PrimeEmbeddedRuntimeOptions) {}

  capabilities(): RuntimeCapabilities {
    return {
      schemaVersion: CONTROL_PLANE_VERSION,
      start: Boolean(this.options),
      prompt: this.negotiated,
      stream: this.negotiated,
      cancel: Boolean(this.options),
      shutdown: Boolean(this.options),
      resume: 'none',
      loadSession: false,
      isolation: this.negotiated ? 'os-process-tree' : 'unavailable',
    };
  }

  async start(input: {
    fence: ExecutionFence;
    workspace: string;
  }): Promise<ControlResult<RuntimeSession>> {
    const options = this.options;
    if (!options)
      return failure(
        'isolation_unavailable',
        'Approved Prime embedded supervisor and broker transport required',
      );
    if (
      !input ||
      typeof input.workspace !== 'string' ||
      !input.workspace ||
      !record(input.fence) ||
      fenceKeys.some((key) => {
        const value = input.fence[key];
        return typeof value === 'number'
          ? !Number.isSafeInteger(value) || value < 0
          : typeof value !== 'string' || !value;
      })
    )
      return failure('invalid_request', 'Workspace and complete execution fence required');
    const fence = { ...input.fence };
    let isolation: IsolationEvidence | undefined;
    let transport: HarnessChannel | undefined;
    try {
      const authorization = await options.authorize({ ...fence });
      if (!authorization.ok) return authorization;
      const artifact = await options.verifyArtifact(options.artifact, PRIME_EMBEDDED_PIN);
      if (!artifact.ok) return artifact;
      const launched = await options.supervisor.launch({
        executable: options.executable,
        args: options.args ?? [options.artifact],
        workspace: input.workspace,
        environment: sanitizedRuntimeEnvironment({ home: options.home, temp: options.temp }),
      });
      if (!launched.ok) return launched;
      isolation = { ...launched.value };
      if (!verifiedIsolation(isolation)) {
        const cleanup = await this.terminate(isolation);
        return cleanup.ok
          ? failure('isolation_unavailable', 'Incomplete OS isolation evidence')
          : cleanup;
      }
      transport = await options.connect(isolation.treeId);
      const ack = await transport.request(HARNESS_INIT_METHOD, {
        protocolVersion: HARNESS_PROTOCOL_VERSION,
        controlPlaneVersion: CONTROL_PLANE_VERSION,
        model: options.initModel ?? DEFAULT_EMBEDDED_INIT_MODEL,
        pin: {
          commit: PRIME_EMBEDDED_PIN.commit,
          version: PRIME_EMBEDDED_PIN.version,
          license: PRIME_EMBEDDED_PIN.license,
        },
        workspace: options.runtimeWorkspace ?? input.workspace,
      });
      if (
        !isHarnessInitAck(ack) ||
        ack.pin.commit !== PRIME_EMBEDDED_PIN.commit ||
        ack.pin.version !== PRIME_EMBEDDED_PIN.version ||
        ack.pin.license !== PRIME_EMBEDDED_PIN.license ||
        ack.capabilities.tools.length !== 0
      ) {
        transport.close();
        const cleanup = await this.terminate(isolation);
        return cleanup.ok
          ? failure('unsupported_capability', 'Pinned embedded harness handshake required')
          : cleanup;
      }
      // Recheck after asynchronous artifact/launch/handshake work, before registering.
      const admitted = await options.authorize({ ...fence });
      if (!admitted.ok) {
        transport.close();
        const cleanup = await this.terminate(isolation);
        return cleanup.ok ? admitted : cleanup;
      }
      if (this.sessions.has(ack.sessionId)) {
        transport.close();
        const cleanup = await this.terminate(isolation);
        return cleanup.ok ? failure('runtime_failed', 'Duplicate session id') : cleanup;
      }
      const finalAdmission = await options.authorize({ ...fence });
      if (!finalAdmission.ok) {
        transport.close();
        const cleanup = await this.terminate(isolation);
        return cleanup.ok ? finalAdmission : cleanup;
      }
      // No await between the final uniqueness check and registration: concurrent
      // starts can return the same child-generated ID during authorization.
      if (this.sessions.has(ack.sessionId)) {
        transport.close();
        const cleanup = await this.terminate(isolation);
        return cleanup.ok ? failure('runtime_failed', 'Duplicate session id') : cleanup;
      }
      const session: RuntimeSession = {
        runtimeId: RUNTIME_ID,
        sessionId: ack.sessionId,
        fence,
      };
      const entry: Entry = {
        session,
        isolation,
        transport,
        prompting: false,
        stopping: false,
        brokerCancels: new Map(),
        brokerStreams: new Set(),
      };
      transport.setReverseHandler((method, params) =>
        this.handleRunnerRequest(entry, method, params),
      );
      this.sessions.set(session.sessionId, entry);
      this.negotiated = true;
      return { ok: true, value: { ...session, fence: { ...fence } } };
    } catch {
      try {
        transport?.close();
      } catch {
        /* Supervisor still owns cleanup. */
      }
      if (isolation) {
        const cleanup = await this.terminate(isolation);
        if (!cleanup.ok) return cleanup;
      }
      return failure('runtime_failed', 'Prime embedded harness startup failed');
    }
  }

  async resume(_input: {
    session: RuntimeSession;
    sessionPath?: string;
  }): Promise<ControlResult<RuntimeSession>> {
    return failure(
      'unsupported_capability',
      'Embedded harness v1 keeps sessions in memory; resume lands with durable sessions',
    );
  }

  async *prompt(session: RuntimeSession, text: string): AsyncIterable<RuntimeEvent> {
    const found = this.entry(session);
    if (!found.ok) {
      yield { type: 'error', sessionId: session.sessionId, error: found.error };
      return;
    }
    const entry = found.value;
    if (entry.stopping || entry.prompting || typeof text !== 'string' || !text.trim()) {
      const denied = failure(
        'invalid_request',
        'Session stopped, prompt already active, or empty prompt',
      );
      if (!denied.ok) yield { type: 'error', sessionId: session.sessionId, error: denied.error };
      return;
    }
    // Reserve before any await: two callers must never dispatch concurrent turns.
    entry.prompting = true;
    const events: RuntimeEvent[] = [];
    let wake: (() => void) | undefined;
    let ended = false;
    let requiresTermination = false;
    const push = (event: RuntimeEvent) => {
      if (!ended) {
        events.push(event);
        wake?.();
      }
    };
    const finish = (event: RuntimeEvent) => {
      if (event.type === 'error' || (event.type === 'turn-ended' && event.reason === 'cancelled'))
        requiresTermination = true;
      push(event);
      ended = true;
      wake?.();
    };
    let unsubscribe: (() => void) | undefined;
    try {
      const authorization = await this.options!.authorize({ ...entry.session.fence });
      if (!authorization.ok) {
        yield { type: 'error', sessionId: session.sessionId, error: authorization.error };
        return;
      }
      if (entry.stopping) return;
      entry.interrupt = () =>
        finish({ type: 'turn-ended', sessionId: session.sessionId, reason: 'cancelled' });
      unsubscribe = entry.transport.subscribe((notification) => {
        if (notification.method !== HARNESS_EVENT_NOTIFICATION || entry.stopping) return;
        const params = notification.params;
        if (!isHarnessEventParams(params) || params.sessionId !== session.sessionId) return;
        this.onHarnessEvent(session.sessionId, params.event, push, finish);
      });
      void entry.transport
        .request(
          HARNESS_PROMPT_METHOD,
          { sessionId: session.sessionId, text },
          { timeoutMs: PROMPT_TIMEOUT_MS },
        )
        .then(
          (value) => {
            if (!isHarnessPromptResult(value)) {
              const denied = failure(
                'runtime_failed',
                'Embedded harness returned a malformed prompt result',
              );
              if (!denied.ok)
                finish({ type: 'error', sessionId: session.sessionId, error: denied.error });
              return;
            }
            if (value.stopReason === 'end_turn' || value.stopReason === 'cancelled') {
              finish({
                type: 'turn-ended',
                sessionId: session.sessionId,
                reason: value.stopReason,
              });
            } else if (value.stopReason === 'budget') {
              finish({
                type: 'turn-ended',
                sessionId: session.sessionId,
                reason: 'budget',
              });
            } else {
              const denied = failure(
                'runtime_failed',
                isNonEmptyString(value.error)
                  ? `Embedded harness turn failed: ${value.error}`
                  : 'Embedded harness turn failed',
              );
              if (!denied.ok)
                finish({ type: 'error', sessionId: session.sessionId, error: denied.error });
            }
          },
          () => {
            const denied = failure('runtime_failed', 'Embedded harness prompt failed');
            if (!denied.ok)
              finish({ type: 'error', sessionId: session.sessionId, error: denied.error });
          },
        );
      while (!ended || events.length) {
        if (events.length) yield events.shift()!;
        else
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
      }
    } catch {
      const denied = failure('runtime_failed', 'Embedded harness stream failed');
      if (!denied.ok) yield { type: 'error', sessionId: session.sessionId, error: denied.error };
    } finally {
      try {
        unsubscribe?.();
      } finally {
        entry.interrupt = undefined;
        entry.prompting = false;
        // Abandoning a stream cannot leave a writer running behind its caller.
        if ((!ended || requiresTermination) && !entry.stopping) {
          const stopped = await this.cancel(session);
          if (!stopped.ok)
            yield { type: 'error', sessionId: session.sessionId, error: stopped.error };
        }
      }
    }
  }

  cancel(session: RuntimeSession): Promise<ControlResult<QuiescenceProof>> {
    const found = this.entry(session);
    if (!found.ok) return Promise.resolve(found);
    const entry = found.value;
    if (entry.proof) return Promise.resolve({ ok: true, value: { ...entry.proof } });
    if (entry.stop) return entry.stop;
    entry.stopping = true;
    entry.interrupt?.();
    // Wake in-flight infer pumps so they unwind the backend stream now rather
    // than at the next provider event.
    if (entry.brokerCancels) {
      for (const cancel of entry.brokerCancels.values()) cancel();
      entry.brokerCancels.clear();
    }
    // Deny further runner reverse requests before closing the channel.
    try {
      entry.transport.setReverseHandler(undefined);
    } catch {
      /* Closing below is still mandatory. */
    }
    try {
      entry.transport.notify(HARNESS_ABORT_METHOD, { sessionId: entry.session.sessionId });
    } catch {
      /* Best-effort runner-side cancellation; the tree kill is authoritative. */
    }
    try {
      entry.transport.close();
    } catch {
      /* Killing the tree is still mandatory. */
    }
    entry.stop = this.terminate(entry.isolation).then((result) => {
      if (result.ok) entry.proof = { ...result.value };
      // Failed termination can be retried; admission remains closed.
      entry.stop = undefined;
      return result;
    });
    return entry.stop;
  }

  shutdown(session: RuntimeSession): Promise<ControlResult<QuiescenceProof>> {
    return this.cancel(session);
  }

  // ---------- runner event mapping ----------

  private onHarnessEvent(
    sessionId: string,
    event: HarnessSessionEvent,
    push: (event: RuntimeEvent) => void,
    finish: (event: RuntimeEvent) => void,
  ): void {
    switch (event.kind) {
      case 'text': {
        push({ type: 'text', sessionId, text: event.text });
        return;
      }
      case 'usage': {
        push({
          type: 'usage',
          sessionId,
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          ...(event.totalTokens !== undefined ? { totalTokens: event.totalTokens } : {}),
          ...(event.cost !== undefined ? { cost: { ...event.cost } } : {}),
        });
        return;
      }
      case 'tool-violation': {
        // Tools are fail-closed in v1: a tool execution the runner reports means
        // upstream escaped the empty allowlist — terminate rather than flatten.
        const denied = failure(
          'unsupported_capability',
          `Embedded harness reported tool execution (${event.event}: ${event.toolName})`,
        );
        if (!denied.ok) finish({ type: 'error', sessionId, error: denied.error });
        return;
      }
      case 'error': {
        const denied = failure('runtime_failed', `Embedded harness error: ${event.message}`);
        if (!denied.ok) finish({ type: 'error', sessionId, error: denied.error });
        return;
      }
    }
  }

  // ---------- broker bridge ----------

  private handleRunnerRequest(
    entry: Entry,
    method: string,
    params: unknown,
  ): { result?: unknown; error?: { code: number; message: string } } | undefined {
    if (entry.stopping) {
      return { error: { code: -32603, message: 'Session stopping' } };
    }
    switch (method) {
      case BROKER_INFER_METHOD: {
        return this.onBrokerInfer(entry, params);
      }
      case BROKER_CANCEL_METHOD: {
        return this.onBrokerCancel(entry, params);
      }
      default: {
        return undefined;
      }
    }
  }

  private onBrokerInfer(
    entry: Entry,
    params: unknown,
  ): { result?: unknown; error?: { code: number; message: string } } {
    if (!isBrokerInferParams(params))
      return { error: { code: -32602, message: 'Invalid broker.infer params' } };
    if (params.sessionId !== entry.session.sessionId)
      return { error: { code: -32602, message: 'Broker session mismatch' } };
    const options = this.options;
    if (!options?.inferenceBroker)
      return { error: { code: -32603, message: 'Inference broker unavailable' } };
    const request = this.buildInferenceRequest(entry, params.request);
    if (!request.ok) return { error: { code: -32603, message: request.error.message } };
    const requestId = params.request.requestId;
    entry.brokerStreams?.add(requestId);
    void this.pumpBrokerEvents(entry, requestId, request.value);
    return { result: { requestId, accepted: true } };
  }

  private onBrokerCancel(
    entry: Entry,
    params: unknown,
  ): { result?: unknown; error?: { code: number; message: string } } {
    if (!isBrokerCancelParams(params))
      return { error: { code: -32602, message: 'Invalid broker.cancel params' } };
    entry.brokerStreams?.delete(params.requestId);
    entry.brokerCancels?.get(params.requestId)?.();
    return { result: { ok: true } };
  }

  private buildInferenceRequest(
    entry: Entry,
    request: SanitizedInferenceRequest,
  ): ControlResult<InferenceRequest> {
    const build = this.options?.buildInferenceRequest;
    if (build) return build({ request, session: entry.session });
    // Default seam: session fence + stub binding revision. Phase 3 replaces
    // this with SqlTrustedProviderBackend binding resolution.
    return {
      ok: true,
      value: {
        bindingRevision: 0,
        fence: { ...entry.session.fence },
        maxOutputTokens: request.maxOutputTokens,
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
        modelRoute: request.modelRoute,
        requestId: request.requestId,
        schemaVersion: CONTROL_PLANE_VERSION,
      },
    };
  }

  private async pumpBrokerEvents(
    entry: Entry,
    requestId: string,
    request: InferenceRequest,
  ): Promise<void> {
    const broker = this.options?.inferenceBroker;
    if (!broker) return;
    const cancelController = new AbortController();
    const cancelled = new Promise<'cancelled'>((resolve) => {
      entry.brokerCancels?.set(requestId, () => {
        // Closing the broker generator's iterator alone cannot abort the
        // backend: while it is suspended on a pending provider read, .return()
        // queues behind that read instead of running its finally block. The
        // signal reaches the backend's own abort path directly.
        cancelController.abort();
        resolve('cancelled');
      });
    });
    const inference = broker.infer(request, { signal: cancelController.signal });
    const iterator = inference[Symbol.asyncIterator]();
    try {
      for (;;) {
        // `for await` cannot interrupt a pending next() — race it against the
        // cancel latch and unwind the backend stream on session.abort/close.
        const step = await Promise.race([iterator.next(), cancelled]);
        if (step === 'cancelled') {
          await iterator.return?.();
          return;
        }
        if (step.done) break;
        if (entry.stopping || !entry.brokerStreams?.has(requestId)) {
          cancelController.abort();
          await iterator.return?.();
          return;
        }
        // The broker stream contract is InferenceEvent; the wire contract is
        // BrokerStreamEvent, whose error shape is flat ({code, message}). The
        // runner drops error events in any other shape, so translate here —
        // a missed error event leaves the runner's infer pump hung.
        entry.transport.notify(BROKER_EVENT_NOTIFICATION, {
          requestId,
          event:
            step.value.type === 'error'
              ? {
                  type: 'error',
                  code: step.value.error.code,
                  message: step.value.error.message,
                }
              : step.value,
        });
      }
      if (entry.stopping || !entry.brokerStreams?.has(requestId)) return;
      entry.transport.notify(BROKER_EVENT_NOTIFICATION, { requestId, event: { type: 'end' } });
    } catch (error) {
      if (entry.stopping) return;
      entry.transport.notify(BROKER_EVENT_NOTIFICATION, {
        requestId,
        event: {
          type: 'error',
          code: 'runtime_failed',
          message: 'Broker stream failed',
        },
      });
      console.error('prime-embedded broker pump failed', error);
    } finally {
      entry.brokerCancels?.delete(requestId);
      entry.brokerStreams?.delete(requestId);
    }
  }

  // ---------- admission + quiescence ----------

  private entry(session: RuntimeSession): ControlResult<Entry> {
    if (!session || !record(session.fence))
      return failure('invalid_request', 'Complete runtime session required');
    const entry = this.sessions.get(session.sessionId);
    if (!entry || session.runtimeId !== RUNTIME_ID)
      return failure('invalid_request', 'Unknown embedded harness runtime session');
    if (fenceKeys.some((key) => entry.session.fence[key] !== session.fence[key])) {
      return failure('stale_fence', 'Runtime session fence mismatch');
    }
    return { ok: true, value: entry };
  }

  private async terminate(isolation: IsolationEvidence): Promise<ControlResult<QuiescenceProof>> {
    if (!this.options) return failure('not_quiescent', 'No supervisor available');
    const now = this.options.now ?? Date.now;
    const startedAt = now();
    try {
      const result = await this.options.supervisor.terminate(isolation.treeId);
      if (!result.ok) return result;
      const proof = result.value;
      if (
        proof.treeId !== isolation.treeId ||
        proof.supervisorId !== isolation.supervisorId ||
        proof.remainingProcesses !== 0 ||
        proof.pendingActions !== 0 ||
        !Number.isFinite(proof.observedAt) ||
        proof.observedAt < startedAt ||
        proof.observedAt > now()
      ) {
        return failure('not_quiescent', 'Supervisor did not prove current whole-tree quiescence');
      }
      return { ok: true, value: { ...proof } };
    } catch {
      return failure('not_quiescent', 'Supervisor termination failed');
    }
  }
}
