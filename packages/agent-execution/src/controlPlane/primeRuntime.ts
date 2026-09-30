import { isRecord } from '@orvilo/utils/object';

import type {
  ControlErrorCode,
  ControlResult,
  ExecutionFence,
  ExecutionRuntime,
  IsolationEvidence,
  QuiescenceProof,
  RuntimeCapabilities,
  RuntimeEvent,
  RuntimeSession,
} from './contracts';
import { CONTROL_PLANE_VERSION } from './contracts';
import type { ProcessTreeSupervisor } from './isolation';
import { sanitizedRuntimeEnvironment, verifiedIsolation } from './isolation';

export const PRIME_RUNTIME_PIN = {
  commit: '7d442aafa985f9342134fac16c2ef41f03fb45c1',
  version: '0.9.8',
  license: 'MIT',
} as const;

/** Connect only to the supervisor-owned tree. Implementations must not spawn a
 * second unconfined process, inherit credentials, or auto-approve reverse ACP
 * permission/fs/terminal requests. Inference and mutations use trusted brokers. */
export interface PrimeAcpTransport {
  /** Close settles every outstanding request; this does not prove tree exit. */
  close: () => void;
  request: (
    method: 'initialize' | 'session/new' | 'session/prompt',
    params: unknown,
  ) => Promise<unknown>;
  subscribe: (listener: (notification: { method: string; params: unknown }) => void) => () => void;
}

export interface PrimeRuntimeOptions {
  /** Authoritative tenant/principal/task/grant/lease/epoch/policy check.
   * Revocation must additionally stop the tree; brokers recheck every effect. */
  authorize: (fence: ExecutionFence) => Promise<ControlResult<true>>;
  connect: (treeId: string) => Promise<PrimeAcpTransport>;
  executable: string;
  home: string;
  now?: () => number;
  /** Trusted supervisor mapping of the host workspace into the isolated tree. */
  runtimeWorkspace?: string;
  supervisor: ProcessTreeSupervisor;
  temp: string;
  /** Trusted artifact verification, not the child reporting its own commit. */
  verifyArtifact: (
    executable: string,
    pin: typeof PRIME_RUNTIME_PIN,
  ) => Promise<ControlResult<true>>;
}

interface Entry {
  interrupt?: () => void;
  isolation: IsolationEvidence;
  prompting: boolean;
  proof?: QuiescenceProof;
  session: RuntimeSession;
  stop?: Promise<ControlResult<QuiescenceProof>>;
  stopping: boolean;
  transport: PrimeAcpTransport;
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

/** ACP adapter only. No host launcher is supplied by default, and no task done
 * transition exists here. This intentionally leaves unaccepted resume disabled. */
export class PrimeExecutionRuntime implements ExecutionRuntime {
  private readonly sessions = new Map<string, Entry>();
  private negotiated = false;

  constructor(private readonly options?: PrimeRuntimeOptions) {}

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
        'Approved Prime supervisor and broker transport required',
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
    let transport: PrimeAcpTransport | undefined;
    try {
      const authorization = await options.authorize({ ...fence });
      if (!authorization.ok) return authorization;
      const artifact = await options.verifyArtifact(options.executable, PRIME_RUNTIME_PIN);
      if (!artifact.ok) return artifact;
      const launched = await options.supervisor.launch({
        executable: options.executable,
        args: ['--mode', 'acp'],
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
      const initialized = record(
        await transport.request('initialize', {
          protocolVersion: 1,
          clientInfo: { name: 'orvilo', version: String(CONTROL_PLANE_VERSION) },
          clientCapabilities: {
            fs: { readTextFile: false, writeTextFile: false },
            terminal: false,
          },
        }),
      );
      const agentInfo = record(initialized?.agentInfo);
      const capabilities = record(initialized?.agentCapabilities);
      if (
        initialized?.protocolVersion !== 1 ||
        agentInfo?.name !== 'prime-agent' ||
        agentInfo?.version !== PRIME_RUNTIME_PIN.version ||
        capabilities?.loadSession !== false
      ) {
        transport.close();
        const cleanup = await this.terminate(isolation);
        return cleanup.ok
          ? failure('unsupported_capability', 'Pinned Prime stable ACP handshake required')
          : cleanup;
      }
      // Recheck after asynchronous artifact/launch/initialize work, before opening a session.
      const admitted = await options.authorize({ ...fence });
      if (!admitted.ok) {
        transport.close();
        const cleanup = await this.terminate(isolation);
        return cleanup.ok ? admitted : cleanup;
      }
      const created = record(
        await transport.request('session/new', {
          cwd: options.runtimeWorkspace ?? input.workspace,
          mcpServers: [],
        }),
      );
      if (
        typeof created?.sessionId !== 'string' ||
        !created.sessionId ||
        this.sessions.has(created.sessionId)
      ) {
        throw new Error('Invalid or duplicate session');
      }
      const finalAdmission = await options.authorize({ ...fence });
      if (!finalAdmission.ok) {
        transport.close();
        const cleanup = await this.terminate(isolation);
        return cleanup.ok ? finalAdmission : cleanup;
      }
      // No await between the final uniqueness check and registration: concurrent
      // starts can return the same child-generated ID during authorization.
      if (this.sessions.has(created.sessionId)) throw new Error('Duplicate session');
      const session: RuntimeSession = {
        runtimeId: 'prime-agent',
        sessionId: created.sessionId,
        fence,
      };
      this.sessions.set(session.sessionId, {
        session,
        isolation,
        transport,
        prompting: false,
        stopping: false,
      });
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
      return failure('runtime_failed', 'Prime startup failed');
    }
  }

  async resume(_input: {
    session: RuntimeSession;
    sessionPath?: string;
  }): Promise<ControlResult<RuntimeSession>> {
    return failure(
      'unsupported_capability',
      'Prime stable ACP cannot load sessions; CLI/RPC resume requires cloud acceptance',
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
        if (notification.method !== 'session/update' || entry.stopping) return;
        const params = record(notification.params);
        if (params?.sessionId !== session.sessionId) return;
        const update = record(params.update);
        const content = record(update?.content);
        if (
          update?.sessionUpdate === 'agent_message_chunk' &&
          content?.type === 'text' &&
          typeof content.text === 'string'
        ) {
          push({ type: 'text', sessionId: session.sessionId, text: content.text });
        }
      });
      void entry.transport
        .request('session/prompt', {
          sessionId: session.sessionId,
          prompt: [{ type: 'text', text }],
        })
        .then(
          (value) => {
            const reason = record(value)?.stopReason;
            if (
              reason === 'end_turn' ||
              reason === 'cancelled' ||
              reason === 'max_tokens' ||
              reason === 'max_turn_requests'
            ) {
              finish({
                type: 'turn-ended',
                sessionId: session.sessionId,
                reason:
                  reason === 'max_tokens' || reason === 'max_turn_requests' ? 'budget' : reason,
              });
            } else {
              const denied = failure(
                'runtime_failed',
                'Prime returned an unsupported terminal reason',
              );
              if (!denied.ok)
                finish({ type: 'error', sessionId: session.sessionId, error: denied.error });
            }
          },
          () => {
            const denied = failure('runtime_failed', 'Prime prompt failed');
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
      const denied = failure('runtime_failed', 'Prime stream failed');
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

  private entry(session: RuntimeSession): ControlResult<Entry> {
    if (!session || !record(session.fence))
      return failure('invalid_request', 'Complete runtime session required');
    const entry = this.sessions.get(session.sessionId);
    if (!entry || session.runtimeId !== 'prime-agent')
      return failure('invalid_request', 'Unknown Prime runtime session');
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
