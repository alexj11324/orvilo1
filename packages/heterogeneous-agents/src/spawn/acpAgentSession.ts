import type { AgentStreamEvent } from '@orvilo/agent-gateway-client';
import { isRecord } from '@orvilo/utils/object';

import { parseAcpSessionTitleMessage } from '../adapters/acpCommon';
import type { AcpRpcMessage } from './acpStdioClient';
import { AcpStdioClient } from './acpStdioClient';
import type { AgentStreamPipelineOptions } from './agentStreamPipeline';
import { AgentStreamPipeline } from './agentStreamPipeline';
import {
  CACHE_KEEPALIVE_PROMPT_TEXT,
  CACHE_KEEPALIVE_PROMPT_TIMEOUT_MS,
  CacheKeepaliveController,
  type CacheKeepaliveDisarmReason,
} from './cacheKeepalive';
import type { CacheKeepaliveOverrides, ResolvedCacheKeepalive } from './cachePolicy';
import type {
  HeterogeneousAgentCacheKeepaliveStatus,
  HeterogeneousAgentRuntimeStatus,
} from './runtimeStatus';

/** The ACP major protocol version this client speaks (https://agentclientprotocol.com). */
export const ACP_PROTOCOL_VERSION = 1;

const DEFAULT_CANCEL_GRACE_MS = 2_000;

/** One entry of a `session/request_permission` `options` array. */
export interface AcpPermissionOption {
  kind?: unknown;
  optionId?: unknown;
}

/** Parse the `options` array of a `session/request_permission` request. */
export const parseAcpPermissionOptions = (params: unknown): AcpPermissionOption[] => {
  const options = isRecord(params) ? params.options : undefined;
  if (!Array.isArray(options)) return [];
  return options.flatMap((value) => (isRecord(value) ? [value as AcpPermissionOption] : []));
};

/**
 * Pick a permission option by ordered preference tiers. Returns the winning
 * option's id, or `undefined` when no tier matched — or when the first
 * matching tier's option carries no usable string `optionId` (mirrors the
 * `a ?? b ?? c` fall-through the per-agent policies used before extraction:
 * later tiers are not consulted once an earlier tier matched).
 */
export const selectAcpPermissionOption = (
  params: unknown,
  preferences: ((option: AcpPermissionOption) => boolean)[],
): string | undefined => {
  const options = parseAcpPermissionOptions(params);
  for (const matches of preferences) {
    const selected = options.find((option) => matches(option));
    if (selected) return typeof selected.optionId === 'string' ? selected.optionId : undefined;
  }
  return undefined;
};

/**
 * How long a finished turn's bridge process is kept alive for the title it
 * generates in the background (claude-agent-acp: ~2s after turn end). The wait
 * ends earlier when a title arrives.
 */
export const SESSION_TITLE_LINGER_MS = 5000;

/** Options shared by every ACP agent session, independent of the vendor. */
export interface AcpAgentSessionOptions {
  args: string[];
  /**
   * Cache keep-alive overrides for this session (tests / per-spawn tuning),
   * merged over the env-derived per-engine policy; `clock` drives all timers.
   */
  cacheKeepalive?: CacheKeepaliveOverrides;
  clientVersion: string;
  commandPath: string;
  cwd: string;
  /** Create a dedicated Unix process group. Disable beneath a detached wrapper. */
  detached?: boolean;
  env: NodeJS.ProcessEnv;
  onEvents: (events: AgentStreamEvent[]) => Promise<void> | void;
  onRawMessage: (line: string) => Promise<void> | void;
  onRuntimeStatus: (status: HeterogeneousAgentRuntimeStatus) => void;
  onSessionId: (sessionId: string) => void;
  /**
   * Title the agent reported for this session (`session_info_update`). A
   * side channel, deliberately outside `onEvents`: the title describes the
   * session, not the turn, so it is delivered whenever it arrives while the
   * process is alive, and it never enters the persisted/ingested event stream.
   */
  onSessionTitle?: (title: string) => void;
  onStderr: (data: string) => Promise<void> | void;
  operationId: string;
  requestTimeoutMs?: number;
  resumeSessionId?: string;
  sessionId: string;
}

/** Per-agent invariants a subclass passes to the base constructor. */
export interface AcpAgentSessionConfig {
  /** Full child argv (agent-fixed flags already applied around user args). */
  args: string[];
  /** Grace period between `session/cancel` and force-closing the process. */
  cancelGraceMs?: number;
  /** `AgentStreamPipeline` construction params (`operationId` is appended from options). */
  pipeline: Omit<AgentStreamPipelineOptions, 'operationId'>;
  processLabel: string;
  transport: HeterogeneousAgentRuntimeStatus['transport'];
}

/**
 * Shared ACP v1 agent lifecycle layered on {@link AcpStdioClient}:
 *
 *   initialize (+ version/capability validation) → session/new | session/load
 *   → session/prompt → session/update streaming → session/cancel
 *
 * The base owns everything the protocol standardizes — transport wiring,
 * request/notification plumbing, prompt-turn settlement, cancellation grace,
 * and runtime-status reporting. Vendor deltas (extension `_meta` payloads,
 * auth, model selection, replay policy, reverse-request policy) live in the
 * protocol-phase hooks implemented by each agent's subclass.
 */
export abstract class AcpAgentSession<
  TInitializeResult,
  TOptions extends AcpAgentSessionOptions = AcpAgentSessionOptions,
> {
  protected readonly client: AcpStdioClient;
  protected readonly pipeline: AgentStreamPipeline;
  /** The agent-native session id, set as soon as session setup resolves it. */
  protected acpSessionId?: string;

  private cacheKeepalive?: CacheKeepaliveController;
  private cacheKeepaliveStats?: HeterogeneousAgentCacheKeepaliveStatus;
  private readonly cancelGraceMs: number;
  private inInertTurnActive = false;
  private readonly transport: HeterogeneousAgentRuntimeStatus['transport'];
  private hostClosed = false;
  private lastSessionTitle?: string;
  private titleLingerTimer?: ReturnType<typeof setTimeout>;
  private interruptRequested = false;
  /** Set once `session/prompt` is about to be sent; earlier updates are `session/load` replay. */
  private promptStarted = false;
  private lastStatus?: HeterogeneousAgentRuntimeStatus['state'];

  protected constructor(
    protected readonly options: TOptions,
    config: AcpAgentSessionConfig,
  ) {
    this.cancelGraceMs = config.cancelGraceMs ?? DEFAULT_CANCEL_GRACE_MS;
    this.transport = config.transport;
    this.pipeline = new AgentStreamPipeline({
      ...config.pipeline,
      operationId: options.operationId,
    });
    this.client = new AcpStdioClient({
      args: config.args,
      commandPath: options.commandPath,
      cwd: options.cwd,
      detached: options.detached,
      env: options.env,
      onMessage: (message) => {
        this.forwardSessionTitle(message);
        return this.handleAgentMessage(message);
      },
      onRawMessage: options.onRawMessage,
      onServerRequest: (message) => this.handleServerRequest(message),
      onStderr: options.onStderr,
      processLabel: config.processLabel,
      requestTimeoutMs: options.requestTimeoutMs,
    });
  }

  get pid(): number | undefined {
    return this.client.pid;
  }

  /** True while the keep-alive scheduler holds the child alive post-turn. */
  get keepaliveArmed(): boolean {
    return this.cacheKeepalive?.armed === true;
  }

  /** Keep-alive counters for run metadata; undefined when never armed. */
  get cacheKeepaliveTelemetry(): HeterogeneousAgentCacheKeepaliveStatus | undefined {
    if (this.cacheKeepaliveStats) return this.cacheKeepaliveStats;
    return this.cacheKeepalive ? { pings: this.cacheKeepalive.pings } : undefined;
  }

  protected get closedByHost(): boolean {
    return this.hostClosed;
  }

  /** True while an inert keep-alive `session/prompt` turn is in flight. */
  protected get inInertTurn(): boolean {
    return this.inInertTurnActive;
  }

  /** Run one full prompt turn. Resolves silently when the host closed the session mid-run. */
  async run(): Promise<void> {
    let completedNormally = false;
    this.emitStatus('starting');
    try {
      await this.prepareRun?.();
      const initialized = await this.initializeConnection();
      const sessionId = await this.establishSession(initialized);
      this.acpSessionId = sessionId;
      this.emitStatus('running');
      this.onBeforePrompt?.();
      this.promptStarted = true;
      const result = await this.client.request<unknown>(
        'session/prompt',
        await this.buildPromptParams(sessionId),
        false,
      );
      completedNormally = isRecord(result) && result.stopReason === 'end_turn';
      await this.settlePrompt(result);
      if (this.hostClosed) return;
      await this.emitEvents(await this.pipeline.flush());
      if (this.hostClosed) return;
      const keepalive = this.armCacheKeepalive();
      this.emitStatus(
        'idle',
        keepalive?.windowEndsAt === undefined
          ? undefined
          : { idleDeadlineAt: keepalive.windowEndsAt },
      );
    } catch (cause) {
      if (this.hostClosed) return;
      const error = cause instanceof Error ? cause : new Error(String(cause));
      await this.onRunFailure?.(error);
      this.emitStatus('error');
      throw error;
    } finally {
      // An armed keeper owns the child from here on — it disposes the client
      // itself when the scheduler disarms.
      if (!this.keepaliveArmed) {
        if (completedNormally && this.shouldLingerForTitle()) this.beginTitleLinger();
        else {
          this.client.close();
          this.emitStatus('closed');
        }
      }
    }
  }

  /**
   * Request graceful cancellation via the `session/cancel` notification; the
   * agent is expected to resolve the pending `session/prompt` with the
   * `cancelled` stop reason. Then confirm the child actually exited: bounded
   * grace → SIGTERM → bounded wait → SIGKILL → bounded wait.
   *
   * Resolves `true` only once the process is gone — callers deciding whether
   * a replacement writer may start ("Send now") get a real answer instead of
   * an optimistic ack. Never rejects; a `false` result means the child
   * survived SIGKILL and the caller should surface the cancel as unconfirmed.
   */
  async interrupt(): Promise<boolean> {
    this.interruptRequested = true;
    if (this.titleLingering) {
      this.close();
      return this.waitForExit(this.cancelGraceMs);
    }
    if (this.cacheKeepalive) {
      // No turn is in flight while the keeper holds the child — skip
      // session/cancel and go straight to the kill escalation.
      this.cacheKeepalive.dispose('closed');
      if (await this.waitForExit(this.cancelGraceMs)) return true;
      this.client.signal('SIGKILL');
      return this.waitForExit(this.cancelGraceMs);
    }
    const sessionId = this.acpSessionId;
    if (!sessionId) {
      this.close();
      return true;
    }
    this.client.notify('session/cancel', this.buildCancelParams(sessionId));
    if (await this.waitForExit(this.cancelGraceMs)) return true;

    this.close('SIGTERM');
    if (await this.waitForExit(this.cancelGraceMs)) return true;

    this.client.signal('SIGKILL');
    return this.waitForExit(this.cancelGraceMs);
  }

  private waitForExit(ms: number): Promise<boolean> {
    return Promise.race([
      this.client.exited.then(() => true as const),
      new Promise<false>((resolve) => {
        const timer = setTimeout(() => resolve(false), ms);
        timer.unref?.();
      }),
    ]);
  }

  /** Host-forced shutdown: suppresses further events and kills the child. */
  close(signal: NodeJS.Signals = 'SIGTERM'): void {
    if (this.hostClosed) return;
    this.hostClosed = true;
    this.clearTitleLinger();
    this.cacheKeepalive?.dispose('closed');
    this.onHostClose?.();
    this.client.close(signal);
    this.emitStatus('closed');
  }

  /** True while a finished turn's process is kept alive only to wait for the session title. */
  get titleLingering(): boolean {
    return this.titleLingerTimer !== undefined;
  }

  /**
   * Graceful close for a session whose turn is over. If the bridge is still
   * waiting for its title this joins the pending linger (no new timer, no
   * early cut); otherwise it closes like {@link close}. Forced stops (cancel,
   * app quit, a new prompt for the same session) call {@link close} instead,
   * which always kills immediately.
   */
  release(): void {
    if (this.titleLingering) return;
    this.close();
  }

  private shouldLingerForTitle(): boolean {
    return (
      !!this.options.onSessionTitle &&
      this.lastSessionTitle === undefined &&
      !this.hostClosed &&
      !this.interruptRequested
    );
  }

  /** Keep the child alive for up to {@link SESSION_TITLE_LINGER_MS}; never delays `run()` settling. */
  private beginTitleLinger(): void {
    this.titleLingerTimer = setTimeout(() => this.endTitleLinger(), SESSION_TITLE_LINGER_MS);
    this.titleLingerTimer.unref?.();
  }

  private clearTitleLinger(): void {
    if (this.titleLingerTimer === undefined) return;
    clearTimeout(this.titleLingerTimer);
    this.titleLingerTimer = undefined;
  }

  /** The linger is over (title arrived or cap hit): close exactly as a finished turn would. */
  private endTitleLinger(): void {
    if (!this.titleLingering) return;
    this.clearTitleLinger();
    this.hostClosed = true;
    this.client.close();
    this.emitStatus('closed');
  }

  /**
   * Arm per-engine cache keep-alive after a settled turn: the child stays
   * alive past `run()` resolution and receives inert `session/prompt` turns
   * on the same ACP session until a disarm condition is hit. Engines with no
   * provider cache worth warming resolve no config and exit at turn end as
   * before.
   */
  private armCacheKeepalive(): CacheKeepaliveController | undefined {
    if (this.hostClosed || this.cacheKeepalive) return undefined;
    const resolved = this.resolveCacheKeepalive?.();
    if (!resolved?.enabled) return undefined;

    const controller = new CacheKeepaliveController({
      clock: resolved.clock,
      maxPings: resolved.maxPings,
      maxWindowMs: resolved.maxWindowMs,
      onDisarm: (reason) => this.handleKeepaliveDisarm(controller, reason),
      pingIntervalMs: resolved.pingIntervalMs,
      sendPing: () => this.sendKeepalivePing(),
    });
    this.cacheKeepalive = controller;
    controller.arm();
    return controller;
  }

  private handleKeepaliveDisarm(
    controller: CacheKeepaliveController,
    reason: CacheKeepaliveDisarmReason,
  ): void {
    if (this.cacheKeepalive !== controller) return;
    this.cacheKeepalive = undefined;
    this.cacheKeepaliveStats = {
      ...this.cacheKeepaliveStats,
      disarmReason: reason,
      pings: controller.pings,
    };
    this.hostClosed = true;
    this.client.close();
    this.emitStatus('closed', { cacheKeepalive: this.cacheKeepaliveStats });
  }

  /**
   * One inert turn through the same `session/prompt` path — refreshes the
   * provider cache chain of this session's prefix. Subclasses suppress
   * `session/update` emission and answer reverse requests non-interactively
   * while `inInertTurn` is set. Resolves false on any failure so the
   * scheduler disarms instead of burning retries on a dead session.
   */
  private async sendKeepalivePing(): Promise<boolean> {
    const sessionId = this.acpSessionId;
    if (!sessionId || this.hostClosed) return false;
    this.inInertTurnActive = true;
    try {
      const result = await this.client.request<unknown>(
        'session/prompt',
        await this.buildKeepalivePromptParams(sessionId),
        CACHE_KEEPALIVE_PROMPT_TIMEOUT_MS,
      );
      const usage = isRecord(result) ? result.usage : undefined;
      if (isRecord(usage)) {
        this.cacheKeepaliveStats = {
          ...this.cacheKeepaliveStats,
          lastUsage: usage,
          pings: this.cacheKeepalive?.pings ?? 0,
        };
      }
      await this.client.drain();
      return true;
    } catch {
      return false;
    } finally {
      this.inInertTurnActive = false;
    }
  }

  /** Start the child (idempotent), send `initialize`, and validate the result. */
  protected async initializeConnection(): Promise<TInitializeResult> {
    await this.client.start();
    const initialized = await this.client.request<TInitializeResult>(
      'initialize',
      this.buildInitializeParams(),
    );
    this.validateInitialized(initialized);
    return initialized;
  }

  /**
   * Settle the prompt turn after the `session/prompt` response arrives. The
   * default drains the already-received message queue; agents whose CLIs leak
   * trailing notifications or need synthetic terminal events override this.
   */
  protected async settlePrompt(_result: unknown): Promise<void> {
    await this.client.drain();
  }

  /** `session/cancel` params; agents append extension `_meta` by overriding. */
  protected buildCancelParams(sessionId: string): unknown {
    return { sessionId };
  }

  /**
   * Hand an agent-reported session title to `onSessionTitle`. Runs before the
   * subclass sees the message and is gated only on the host still owning the
   * session: not on the turn lifecycle (a title can follow the prompt
   * response), not on the keep-alive gate, not on the event stream. Replayed
   * history and unchanged titles are ignored; a throwing callback never breaks
   * the stream.
   */
  private forwardSessionTitle(message: AcpRpcMessage): void {
    if (!this.options.onSessionTitle || !this.promptStarted || this.hostClosed) return;
    const title = parseAcpSessionTitleMessage(message);
    if (!title || title === this.lastSessionTitle) return;

    this.lastSessionTitle = title;
    try {
      this.options.onSessionTitle(title);
    } catch (error) {
      console.error('[acp] onSessionTitle failed:', error);
    } finally {
      this.endTitleLinger();
    }
  }

  /** Serialize a payload as one JSONL line into the adapter pipeline and emit the result. */
  protected async pushToPipeline(payload: unknown): Promise<void> {
    if (this.hostClosed) return;
    const events = await this.pipeline.push(`${JSON.stringify(payload)}\n`);
    await this.emitEvents(events);
  }

  protected async emitEvents(events: AgentStreamEvent[]): Promise<void> {
    if (!this.hostClosed && !this.cacheKeepalive && events.length > 0) {
      await this.options.onEvents(events);
    }
  }

  protected emitStatus(
    state: HeterogeneousAgentRuntimeStatus['state'],
    extra?: Pick<HeterogeneousAgentRuntimeStatus, 'cacheKeepalive' | 'idleDeadlineAt'>,
  ): void {
    if (this.lastStatus === 'closed' || state === this.lastStatus) return;
    this.lastStatus = state;
    this.options.onRuntimeStatus({
      activeTasks: [],
      ...extra,
      lastEventAt: Date.now(),
      operationId: this.options.operationId,
      sessionId: this.options.sessionId,
      state,
      transport: this.transport,
    });
  }

  /** `initialize` request params (client capabilities, client info, extensions). */
  protected abstract buildInitializeParams(): unknown;

  /**
   * Validate the `initialize` response — protocol version and any
   * capabilities the pending run depends on. Throw to abort before any
   * session is created.
   */
  protected abstract validateInitialized(initialized: TInitializeResult): void;

  /**
   * Everything between `initialize` and `session/prompt`: authentication,
   * `session/new` / `session/load`, model selection, and `onSessionId`
   * notification. Returns the agent-native session id to prompt against.
   */
  protected abstract establishSession(initialized: TInitializeResult): Promise<string>;

  /** `session/prompt` request params. */
  protected abstract buildPromptParams(sessionId: string): Promise<unknown> | unknown;

  /**
   * `session/prompt` params for an inert keep-alive turn — same session,
   * same prefix chain. The default is the text-block shape every ACP
   * adapter shares; subclasses override when their prompt shape differs.
   */
  protected buildKeepalivePromptParams(sessionId: string): Promise<unknown> | unknown {
    return { prompt: [{ text: CACHE_KEEPALIVE_PROMPT_TEXT, type: 'text' }], sessionId };
  }

  /**
   * Per-engine cache keep-alive configuration resolved from the policy
   * table + env + per-session overrides. Sessions that cannot warm a
   * provider cache leave this undefined and exit at turn end as before.
   */
  protected resolveCacheKeepalive?(): ResolvedCacheKeepalive | undefined;

  /** Route an agent-initiated message (notification or response) into the pipeline. */
  protected abstract handleAgentMessage(message: AcpRpcMessage): Promise<void> | void;

  /** Answer an agent→client request (`session/request_permission`, extensions). */
  protected abstract handleServerRequest(message: AcpRpcMessage): Promise<unknown> | unknown;

  /** Optional async setup that must precede spawning the child (e.g. prompt materialization). */
  protected prepareRun?(): Promise<void>;

  /** Invoked right before the `session/prompt` request is written. */
  protected onBeforePrompt?(): void;

  /** Emit synthetic terminal events for a failed run before the error is rethrown. */
  protected onRunFailure?(error: Error): Promise<void>;

  /** Extra cleanup when the host force-closes the session. */
  protected onHostClose?(): void;
}
