import type { AskUserBridge } from '../askUser/AskUserBridge';
import type { AgentPromptInput, AgentStreamEvent, UploadHeterogeneousImage } from '../spawn';
import type { PersistentAcpAgent } from '../spawn/persistentAcpAgent';
import { CoalescingBatchIngester } from './CoalescingBatchIngester';
import { createOperationHeartbeat } from './OperationHeartbeat';
import { type HeteroIngestClient, type IngestAgentType, TrpcIngestSink } from './TrpcIngestSink';
import {
  buildHeteroFinishError,
  consumeTurnEvents,
  deriveTurnOutcome,
  type HeteroFinishError,
  looksLikeNeedsRetryWithoutResume,
} from './turnOutcome';

/** Server procedures an in-process run needs: ingest/finish plus the intervention long-poll. */
export interface HeteroRunClient {
  aiAgent: HeteroIngestClient['aiAgent'] & {
    waitInterventionResponse: {
      query: (input: { lastEventId: string; operationId: string }) => Promise<{
        events: Array<{ data: unknown }>;
        lastEventId: string;
      }>;
    };
  };
}

/** Where the runner gets the agent for each attempt. Implemented by the desktop pool. */
export interface HeteroTurnAgentSource {
  /**
   * Agent for this attempt. `fresh: true` (the resume retry) must discard any
   * live agent and start a new native session without resuming.
   */
  acquire: (params: { fresh: boolean; resumeSessionId?: string }) => Promise<PersistentAcpAgent>;
}

export interface RunHeteroTurnParams {
  agents: HeteroTurnAgentSource;
  agentType: string;
  assistantMessageId?: string;
  /**
   * The turn's AskUser bridge. The runner forwards its events into ingest and
   * long-polls `waitInterventionResponse` while a question is pending — the
   * same contract `hetero exec` uses.
   */
  bridge?: AskUserBridge;
  client: HeteroRunClient;
  /** Vendor command override, used only to classify process failures. */
  command?: string;
  log?: {
    error: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
  };
  /** Called with each attempt's agent once its turn started (pid registration). */
  onAgentStarted?: (agent: PersistentAcpAgent) => void;
  operationId: string;
  prompt: AgentPromptInput;
  resumeFallbackPrompt?: AgentPromptInput;
  resumeSessionId?: string;
  runGeneration?: number;
  /** Abort → interrupt the in-flight turn; the run finishes as `cancelled`. */
  signal?: AbortSignal;
  topicId: string;
  uploadImage?: UploadHeterogeneousImage;
}

export interface HeteroTurnResult {
  error?: HeteroFinishError;
  /** `heteroFinish` could not be delivered after retries. */
  finishDeliveryFailed: boolean;
  result: 'cancelled' | 'error' | 'success';
  resumeSessionInvalidated: boolean;
  sessionId?: string;
}

/**
 * Run one gateway operation in-process on a (possibly warm) persistent ACP
 * agent and report it to the server exactly as `orvilo hetero exec` does.
 * Never throws: every failure ends in a `heteroFinish` attempt and a result.
 */
export const runHeteroTurn = async (params: RunHeteroTurnParams): Promise<HeteroTurnResult> => {
  const log = params.log ?? NOOP_LOG;
  try {
    return await runHeteroTurnUnsafe(params, log);
  } catch (err) {
    // Last-resort guard: every expected failure is handled inside; this only
    // catches a programming error so the Electron main process never sees a throw.
    log.error('runHeteroTurn: unexpected failure', errorMessage(err));
    return {
      error: { message: errorMessage(err), type: 'AgentRuntimeError' },
      finishDeliveryFailed: true,
      result: 'error',
      resumeSessionInvalidated: false,
    };
  }
};

const NOOP_LOG: NonNullable<RunHeteroTurnParams['log']> = {
  error: () => {},
  info: () => {},
  warn: () => {},
};

/** Same cap as `hetero exec`: enough for a classification tail, bounded on chatty runs. */
const STDERR_CAP = 8 * 1024;
/** Max wait after turn end for buffered stderr (the stream of a live process never ends). */
const STDERR_SETTLE_MS = 100;
const INTERVENTION_IDLE_POLL_MS = 200;
const INTERVENTION_ERROR_BACKOFF_MS = 1000;

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

const errnoCodeOf = (err: unknown): string | undefined =>
  typeof err === 'object' && err && 'code' in err && typeof err.code === 'string'
    ? err.code
    : undefined;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** One attempt either ran to turn end, or failed before/while streaming (no retry). */
type AttemptOutcome =
  | {
      kind: 'completed';
      code: number | null;
      resumeNotFound: boolean;
      sawTerminalError: boolean;
      sessionId: string | undefined;
      signal: NodeJS.Signals | null;
      stderrContent: string;
      terminalErrorData: Record<string, unknown> | undefined;
      terminalErrorMessage: string | undefined;
    }
  /** Aborted before the agent started its turn. */
  | { kind: 'not_started' }
  /** `acquire` / `runTurn` rejected, or the event stream threw. */
  | { error: HeteroFinishError; kind: 'failed'; sessionId: string | undefined };

const runHeteroTurnUnsafe = async (
  params: RunHeteroTurnParams,
  log: NonNullable<RunHeteroTurnParams['log']>,
): Promise<HeteroTurnResult> => {
  const { agentType, agents, bridge, client, command, operationId, signal } = params;
  const classifyParams = { agentType, command };

  const sink = new TrpcIngestSink(
    client,
    agentType as IngestAgentType,
    operationId,
    params.topicId,
    params.assistantMessageId,
    params.runGeneration,
  );
  const ingester = new CoalescingBatchIngester(sink);
  const heartbeat = createOperationHeartbeat({
    operationId,
    push: (event) => ingester.push(event),
  });

  // ─── AskUser bridge: forward its events, long-poll answers while pending ───
  let pollStopped = false;
  let bridgePump: Promise<void> = Promise.resolve();
  if (bridge) {
    // Ends when the bridge is `cancelAll`ed in the teardown below.
    bridgePump = (async () => {
      for await (const event of bridge.events()) ingester.push(event as AgentStreamEvent);
    })().catch((err) => log.warn('AskUser bridge pump failed:', errorMessage(err)));

    void (async () => {
      // `0-0`, not `$`: a response published between `pendingCount` flipping and
      // the first read must not be skipped. Stale ids are harmless (`resolve` no-ops).
      let lastEventId = '0-0';
      while (!pollStopped) {
        if (bridge.pendingCount === 0) {
          await sleep(INTERVENTION_IDLE_POLL_MS);
          continue;
        }
        try {
          const res = await client.aiAgent.waitInterventionResponse.query({
            lastEventId,
            operationId,
          });
          if (pollStopped) break;
          lastEventId = res.lastEventId;
          for (const event of res.events) {
            const data = event.data as {
              cancelReason?: 'session_ended' | 'timeout' | 'user_cancelled';
              cancelled?: boolean;
              result?: unknown;
              resolutionRequestId?: string;
              toolCallId: string;
            };
            bridge.resolve(data.toolCallId, {
              cancelReason: data.cancelReason,
              cancelled: data.cancelled,
              result: data.result,
              resolutionRequestId: data.resolutionRequestId,
            });
          }
        } catch {
          // Transient (server hiccup / token refresh). The bridge timeout bounds the wait.
          await sleep(INTERVENTION_ERROR_BACKOFF_MS);
        }
      }
    })().catch((err) => log.warn('Intervention poll failed:', errorMessage(err)));
  }

  // ─── Cancellation ──────────────────────────────────────────────────────────
  let inFlight: PersistentAcpAgent | undefined;
  const interrupt = (agent: PersistentAcpAgent) => {
    try {
      void agent.interrupt().catch((err) => log.warn('Agent interrupt failed:', errorMessage(err)));
    } catch (err) {
      log.warn('Agent interrupt failed:', errorMessage(err));
    }
  };
  const onAbort = () => {
    if (inFlight) interrupt(inFlight);
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  // ─── One attempt ───────────────────────────────────────────────────────────
  const runAttempt = async (
    attempt: { fresh: boolean; resumeSessionId?: string },
    prompt: AgentPromptInput,
    interceptResumeErrors: boolean,
  ): Promise<AttemptOutcome> => {
    if (signal?.aborted) return { kind: 'not_started' };

    let agent: PersistentAcpAgent;
    let handle: Awaited<ReturnType<PersistentAcpAgent['runTurn']>>;
    try {
      agent = await agents.acquire(attempt);
      if (signal?.aborted) return { kind: 'not_started' };
      handle = await agent.runTurn({
        askUserBridge: bridge,
        operationId,
        prompt,
        uploadImage: params.uploadImage,
      });
    } catch (err) {
      const message = errorMessage(err);
      log.error('Failed to start agent:', message);
      return {
        error: buildHeteroFinishError(classifyParams, message, 'AgentRuntimeError', errnoCodeOf(err)),
        kind: 'failed',
        sessionId: undefined,
      };
    }

    inFlight = agent;
    // Aborted while `runTurn` was starting: the listener saw no agent yet.
    if (signal?.aborted) interrupt(agent);
    try {
      params.onAgentStarted?.(agent);
    } catch (err) {
      log.warn('onAgentStarted failed:', errorMessage(err));
    }

    // Collect stderr for resume detection and the error detail. The process may
    // outlive the turn, so its stderr need not end: rather than awaiting `end`
    // as `hetero exec` does for its per-run process, wait for `end` at most a
    // short grace (late chunks of a dying process) and then detach.
    let stderrContent = '';
    const onStderr = (chunk: Buffer | string) => {
      if (stderrContent.length < STDERR_CAP) stderrContent += chunk.toString();
    };
    let markStderrEnded: () => void = () => {};
    const stderrEnded = new Promise<void>((resolve) => {
      markStderrEnded = resolve;
    });
    const onStderrEnd = () => markStderrEnded();
    const onStderrError = () => markStderrEnded();
    handle.stderr.on('data', onStderr);
    handle.stderr.on('end', onStderrEnd);
    handle.stderr.on('error', onStderrError);
    const settleStderr = async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        stderrEnded,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, STDERR_SETTLE_MS);
        }),
      ]);
      clearTimeout(timer);
    };
    const detachStderr = () => {
      handle.stderr.off('data', onStderr);
      handle.stderr.off('end', onStderrEnd);
      // Keep a no-op `error` listener: a late stream error must not become an
      // uncaught EventEmitter error in the main process.
      handle.stderr.off('error', onStderrError);
      handle.stderr.on('error', () => {});
    };
    // Observe `exit` immediately so a rejection is never unhandled.
    const exit = handle.exit.catch((err) => {
      const message = errorMessage(err);
      if (stderrContent.length < STDERR_CAP) {
        stderrContent += `${stderrContent ? '\n' : ''}${message}`;
      }
      return { code: 1, signal: null as NodeJS.Signals | null };
    });

    try {
      let summary: Awaited<ReturnType<typeof consumeTurnEvents>>;
      try {
        summary = await consumeTurnEvents(handle.events, {
          interceptResumeErrors,
          onEvent: (event) => {
            heartbeat.observe(event);
            ingester.push(event);
          },
        });
      } catch (err) {
        log.error('Stream error from agent:', errorMessage(err));
        // The turn's state is unknown: stop it rather than leave a busy agent.
        interrupt(agent);
        return {
          error: buildHeteroFinishError(
            classifyParams,
            String(err),
            'stream_error',
            (err as NodeJS.ErrnoException | null)?.code,
          ),
          kind: 'failed',
          sessionId: handle.sessionId,
        };
      }

      const { code, signal: exitSignal } = await exit;
      await settleStderr();
      let { resumeNotFound } = summary;
      // Fallback: the agent may exit non-zero without a structured error event.
      if (
        interceptResumeErrors &&
        !resumeNotFound &&
        code !== 0 &&
        looksLikeNeedsRetryWithoutResume(stderrContent)
      ) {
        resumeNotFound = true;
      }
      return {
        code,
        kind: 'completed',
        resumeNotFound,
        sawTerminalError: summary.sawTerminalError,
        sessionId: handle.sessionId,
        signal: exitSignal,
        stderrContent,
        terminalErrorData: summary.terminalErrorData,
        terminalErrorMessage: summary.terminalErrorMessage,
      };
    } finally {
      detachStderr();
      inFlight = undefined;
    }
  };

  // ─── Attempts ──────────────────────────────────────────────────────────────
  const first = await runAttempt(
    { fresh: false, resumeSessionId: params.resumeSessionId },
    params.prompt,
    !!params.resumeSessionId,
  );
  const firstResumeNotFound = first.kind === 'completed' && first.resumeNotFound;

  let last = first;
  if (firstResumeNotFound && !signal?.aborted) {
    log.info('Resume failed (session not found or context overflow) — retrying without resume');
    last = await runAttempt(
      { fresh: true },
      params.resumeFallbackPrompt ?? params.prompt,
      false,
    );
  }

  // ─── Teardown + drain + finish ─────────────────────────────────────────────
  heartbeat.stop();
  signal?.removeEventListener('abort', onAbort);
  pollStopped = true;
  if (bridge) {
    // The turn is over: settle any orphaned question (its MCP tool returns
    // cleanly) and end the event iterator, so the pump finishes and the
    // cancellation echoes are ingested BEFORE the finish receipt. Idempotent
    // with the caller's later route release (`unregisterOperation`).
    try {
      bridge.cancelAll('session_ended');
    } catch (err) {
      log.warn('AskUser bridge cancelAll failed:', errorMessage(err));
    }
    await bridgePump;
  }

  let ingestError = false;
  try {
    await ingester.drain();
  } catch (err) {
    log.error('Failed to flush events to server:', errorMessage(err));
    ingestError = true;
  }

  const cancelled = !!signal?.aborted;
  let error: HeteroFinishError | undefined;
  let result: HeteroTurnResult['result'];
  let sessionId: string | undefined;
  if (last.kind === 'failed') {
    // Aborting can surface as a start/stream failure (the interrupted agent).
    result = cancelled ? 'cancelled' : 'error';
    error = cancelled ? undefined : last.error;
    sessionId = last.sessionId;
  } else if (last.kind === 'not_started') {
    result = 'cancelled';
  } else {
    ({ error, result } = deriveTurnOutcome(classifyParams, {
      cancelled,
      code: last.code,
      ingestError,
      sawTerminalError: last.sawTerminalError,
      signal: last.signal,
      stderrContent: last.stderrContent,
      terminalErrorData: last.terminalErrorData,
      terminalErrorMessage: last.terminalErrorMessage,
    }));
    sessionId = last.sessionId;
  }

  let finishDeliveryFailed = false;
  try {
    await sink.finish({
      error,
      resumeSessionInvalidated: firstResumeNotFound || undefined,
      result,
      sessionId,
    });
  } catch (err) {
    finishDeliveryFailed = true;
    log.error('Failed to send heteroFinish:', errorMessage(err));
  }

  return {
    error,
    finishDeliveryFailed,
    result,
    resumeSessionInvalidated: firstResumeNotFound,
    sessionId,
  };
};
