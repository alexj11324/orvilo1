/**
 * Prime device-run adapter — replaces the `orvilo hetero exec` wrapper as the
 * launcher for `type:'orvilo'` device dispatches.
 *
 * Everything except the launcher is the existing `agentRun` lifecycle: the
 * caller still serializes admission per operation, dedupes/supersedes on the
 * task registry, and cancels through `cancelAgentRun` on the registered
 * runner child (a detached process-group leader — the same kill contract as
 * a wrapper CLI). No parallel Prime cancel-registry/settle system.
 *
 * The adapter itself owns three things:
 * 1. Device-side artifact resolution — the shipped `runner.mjs`, never a
 *    dev-repo-relative path baked into a convention. `ORVILO_PRIME_RUNNER`
 *    overrides for packaged releases; the dev checkout path is the fallback.
 * 2. Ingest — harness events map onto the SAME `TrpcIngestSink` /
 *    `CoalescingBatchIngester` / `heteroFinish` pipeline `hetero exec` uses
 *    (`agentType: 'orvilo'` — the honest producer label).
 * 3. Lease — the daemon re-arms `run.renewLease()` on each control-side
 *    liveness signal (see `renewDevicePrimeRuns`); lapse kills the run.
 *
 * Turn continuity: the runner holds a single in-memory session, so a turn
 * carrying `resumeSessionId` resumes by REUSING the live session's runner
 * (`harness.prompt` is serialized per session — one turn at a time). A
 * resume whose session is dead takes the explicit rebuild path: a fresh
 * runner + session prompted with `resumeFallbackSystemContext` (the
 * server's history-carrying fallback) and finished with
 * `resumeSessionInvalidated` so the persisted session pointer clears.
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import {
  createPrimeStreamState,
  mapHarnessSessionEvent,
  type PrimeStreamState,
  subagentContext,
} from '@orvilo/agent-execution/controlPlane/primeStreamMapping';
import { openPrimeDeviceRun, type PrimeDeviceRun } from '@orvilo/device-prime-host';
import type { AgentStreamEvent } from '@orvilo/heterogeneous-agents/spawn';

import { createLambdaClient } from '../api/client';
import { saveTask } from '../daemon/taskRegistry';
import { CoalescingBatchIngester } from '../utils/CoalescingBatchIngester';
import { TrpcIngestSink } from '../utils/TrpcIngestSink';
import type { AgentRunAckResult, SpawnHeteroAgentRunParams } from './agentRun';
import { registerAgentRun } from './agentRunRegistry';

interface PrimeRunLogger {
  error?: (msg: string) => void;
  info?: (msg: string) => void;
}

type PrimeRunResult = 'success' | 'error' | 'cancelled';

/** A single device op's view onto a shared runner session. */
interface PrimeRunOperation {
  /** Runner death observed while this op was in flight — lease lapse or exit. */
  abortReason?: string;
  ingester: CoalescingBatchIngester;
  operationId: string;
  settled: boolean;
  /** Per-turn cumulative tool/stream bookkeeping for the ledger mapping. */
  streamState: PrimeStreamState;
  usage?: { inputTokens: number; outputTokens: number };
  /** Woken once when the session dies mid-op — races the prompt request. */
  waiters: Array<() => void>;
}

/**
 * One live runner process = one Prime session. Turn ops serialize on `chain`
 * (the runner rejects concurrent prompts) and share the single event pump —
 * `run.events` is a single-consumer queue, so per-op pumping would let one
 * op steal another op's events.
 */
interface PrimeRunSession {
  chain: Promise<void>;
  currentOp?: PrimeRunOperation;
  run: PrimeDeviceRun;
}

/** Live Prime runs by operationId — the daemon's renewal surface. */
const devicePrimeRuns = new Map<string, PrimeDeviceRun>();
/** Live runner sessions by the session id the server resumes on. */
const primeSessions = new Map<string, PrimeRunSession>();

/**
 * Await a session's queued turns — the admission API resolves `accepted` as
 * soon as the op is queued on the session chain, so drivers/tests that need
 * the turn's terminal outcome wait here rather than racing the pump.
 */
export const waitPrimeSessionIdle = async (sessionId: string): Promise<void> => {
  await primeSessions.get(sessionId)?.chain;
};

/** Re-arm every live run's side-effect lease (call on heartbeat ack). */
export const renewDevicePrimeRuns = (): void => {
  for (const run of devicePrimeRuns.values()) run.renewLease();
};

/**
 * Device-resolved runner artifact. `ORVILO_PRIME_RUNNER` overrides for
 * packaged releases; the staged sibling (`runner.mjs` next to the bundle —
 * `dist/` for the npm CLI, `Resources/bin/` embedded in the desktop app)
 * covers every shipped layout; a dev checkout falls back to the workspace's
 * `packages/prime-harness/dist` build output.
 */
export const resolvePrimeRunnerArtifact = (): string | null => {
  const override = process.env.ORVILO_PRIME_RUNNER;
  // `import.meta.dirname` is absent in some runners (bundlers that stub
  // import.meta, tsx/vitest variants) — fall back through import.meta.url.
  let bundleDir: string | undefined = import.meta.dirname;
  if (!bundleDir) {
    try {
      bundleDir = path.dirname(fileURLToPath(import.meta.url));
    } catch {
      bundleDir = undefined;
    }
  }
  const candidates = [
    override,
    ...(bundleDir
      ? [
          path.resolve(bundleDir, 'runner.mjs'),
          path.resolve(
            bundleDir,
            '..',
            '..',
            '..',
            '..',
            'packages',
            'prime-harness',
            'dist',
            'runner.mjs',
          ),
        ]
      : []),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (existsSync(candidate)) return candidate;
  }
  return null;
};

const makeEvent = (
  operationId: string,
  type: AgentStreamEvent['type'],
  data: unknown,
  stepIndex = 0,
): AgentStreamEvent => ({ data, operationId, stepIndex, timestamp: Date.now(), type });

/**
 * The session's single event pump: routes `harness.event`s to whichever op
 * currently owns the session, then — on stream close — settles the in-flight
 * op as aborted instead of leaving it a `running` zombie or reporting the
 * kill as a clean `done`.
 */
const startSessionPump = (session: PrimeRunSession, logger?: PrimeRunLogger): void => {
  void (async () => {
    try {
      for await (const event of session.run.events) {
        const op = session.currentOp;
        if (!op || op.settled) continue;
        switch (event.kind) {
          case 'text': {
            const subagent = subagentContext(op.streamState, event.subagent);
            op.ingester.push(
              makeEvent(op.operationId, 'stream_chunk', {
                chunkType: 'text',
                content: event.text,
                ...(subagent ? { subagent } : {}),
              }),
            );
            break;
          }
          case 'usage': {
            op.usage = { inputTokens: event.inputTokens, outputTokens: event.outputTokens };
            break;
          }
          case 'subagent_update':
          case 'thinking':
          case 'tool_call':
          case 'tool_progress':
          case 'tool_result': {
            for (const emission of mapHarnessSessionEvent(op.streamState, event))
              op.ingester.push(makeEvent(op.operationId, emission.type, emission.data));
            break;
          }
          case 'tool-violation': {
            op.ingester.push(
              makeEvent(op.operationId, 'error', {
                message: `tool-violation: ${event.toolName} ${event.event}`,
              }),
            );
            break;
          }
          case 'error': {
            const subagent = subagentContext(op.streamState, event.subagent);
            op.ingester.push(
              makeEvent(op.operationId, 'error', {
                message: event.message,
                ...(subagent ? { subagent } : {}),
              }),
            );
            break;
          }
        }
      }
    } catch (error) {
      logger?.error?.(
        `prime run event pump failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      primeSessions.delete(session.run.activation.sessionId);
      const op = session.currentOp;
      if (op && !op.settled) {
        op.abortReason = session.run.leaseLapsed
          ? 'device lease lapsed — prime run stopped'
          : 'prime runner terminated';
        for (const wake of op.waiters.splice(0)) wake();
      }
      session.currentOp = undefined;
    }
  })();
};

/**
 * Events of a turn precede the prompt response on the same NDJSON stream, so
 * once `harness.prompt` resolves every turn event is already queued — the op
 * waits only for the pump to route the backlog (or the stream to close).
 */
const drainTurnEvents = async (session: PrimeRunSession): Promise<void> => {
  while (!session.run.closed && session.run.pendingEvents() > 0) await sleep(2);
};

const settleOperation = async (
  session: PrimeRunSession,
  op: PrimeRunOperation,
  sink: TrpcIngestSink,
  result: PrimeRunResult,
  finishError?: { message: string; type: string },
  resumeSessionInvalidated?: boolean,
): Promise<void> => {
  if (op.settled) return;
  op.settled = true;
  if (session.currentOp === op) session.currentOp = undefined;
  try {
    await op.ingester.drain();
  } finally {
    await sink
      .finish({
        error: finishError,
        result,
        resumeSessionInvalidated,
        sessionId: session.run.activation.sessionId,
      })
      .catch(() => undefined);
    devicePrimeRuns.delete(op.operationId);
  }
};

interface PrimeRunOpInput {
  assistantMessageId?: string;
  jwt: string;
  operationId: string;
  promptText: string;
  /** Resume provenance for the stream_start event — the turn's honest answer
   * to "did this op continue the requested session". */
  resumeOutcome: 'fresh' | 'rebuilt' | 'resumed';
  resumeSessionId?: string;
  runGeneration?: number;
  serverUrl: string;
  systemContext?: string;
  topicId: string;
  workspaceId?: string;
}

/**
 * One operation's turn on a session: stream_start → serialized prompt →
 * drain → stream_end/runtime_end → `heteroFinish`. A runner death mid-turn
 * aborts the op (`cancelled`, never `done`); a rebuilt resume reports
 * `resumeSessionInvalidated` so the server clears the dead session pointer.
 */
const runOperationOnSession = async (
  session: PrimeRunSession,
  input: PrimeRunOpInput,
): Promise<PrimeRunResult> => {
  const { operationId } = input;
  const client = createLambdaClient(
    { serverUrl: input.serverUrl, token: input.jwt, tokenType: 'jwt' },
    input.workspaceId,
  );
  const sink = new TrpcIngestSink(
    client,
    'orvilo',
    operationId,
    input.topicId,
    input.assistantMessageId,
    input.runGeneration,
  );
  const ingester = new CoalescingBatchIngester(sink);
  const op: PrimeRunOperation = {
    ingester,
    operationId,
    settled: false,
    streamState: createPrimeStreamState(),
    waiters: [],
  };

  if (session.run.closed) {
    op.ingester.push(makeEvent(operationId, 'stream_end', {}));
    op.ingester.push(makeEvent(operationId, 'agent_runtime_end', {}));
    await settleOperation(session, op, sink, 'cancelled', {
      message: 'prime runner terminated before the operation started',
      type: 'process_error',
    });
    return 'cancelled';
  }

  session.currentOp = op;
  ingester.push(
    makeEvent(operationId, 'stream_start', {
      provider: 'prime',
      resumeSessionId: input.resumeSessionId,
      resumed: input.resumeOutcome === 'resumed',
      sessionId: session.run.activation.sessionId,
    }),
  );

  let promptResult: Awaited<ReturnType<PrimeDeviceRun['prompt']>> | undefined;
  const aborted = new Promise<'aborted'>((resolve) => {
    op.waiters.push(() => resolve('aborted'));
  });
  const outcome = await Promise.race([
    session.run.prompt(input.promptText).then((r) => {
      promptResult = r;
      return 'prompt' as const;
    }),
    aborted,
  ]);
  await drainTurnEvents(session);

  let result: PrimeRunResult = 'success';
  let finishError: { message: string; type: string } | undefined;
  if (op.abortReason || outcome === 'aborted') {
    result = 'cancelled';
    finishError = {
      message: op.abortReason ?? 'prime runner terminated',
      type: 'process_error',
    };
  } else if (!promptResult?.ok) {
    result = 'error';
    finishError = {
      message: promptResult?.error?.message ?? 'prime prompt failed',
      type: 'process_error',
    };
  } else {
    const stop = promptResult.value;
    if (stop.stopReason === 'cancelled') result = 'cancelled';
    else if (stop.stopReason === 'error' || stop.stopReason === 'budget') {
      result = 'error';
      finishError = {
        message: stop.error ?? `prime run stopped: ${stop.stopReason}`,
        type: 'process_error',
      };
    }
  }

  // A resumed turn that errors indicts the session itself — the persisted
  // pointer would trap every later turn on the same broken session, so the
  // op invalidates it like a rebuild and the local session closes: queued
  // and future turns rebuild instead of resuming a dead runner.
  const resumeSessionInvalidated =
    input.resumeOutcome === 'rebuilt' || (input.resumeOutcome === 'resumed' && result === 'error');

  ingester.push(makeEvent(operationId, 'stream_end', { usage: op.usage }));
  ingester.push(makeEvent(operationId, 'agent_runtime_end', {}));
  await settleOperation(
    session,
    op,
    sink,
    result,
    finishError,
    resumeSessionInvalidated ? true : undefined,
  );
  if (input.resumeOutcome === 'resumed' && result === 'error') {
    primeSessions.delete(session.run.activation.sessionId);
    void session.run.kill();
  }
  return result;
};

/**
 * Admit a Prime device run inside the serialized `agentRun` lifecycle.
 * Resolves `accepted` only after the runner verified, spawned, initialized,
 * and reported its activation — a rejected ack still surfaces the precise
 * refusal (bad digest, refused activation, missing artifact). A
 * `resumeSessionId` matching a live session reuses its runner instead of
 * spawning; a dead session takes the explicit rebuild path.
 */
const PRIME_STATE_ROOT = path.join(os.homedir(), '.orvilo', 'prime-state');

/** Locate the stateDir that persisted `<dir>/sessions/<sessionId>.jsonl`. */
const findPersistedSessionDir = (sessionId: string): string | undefined => {
  try {
    for (const entry of readdirSync(PRIME_STATE_ROOT, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(PRIME_STATE_ROOT, entry.name);
      if (existsSync(path.join(dir, 'sessions', `${sessionId}.jsonl`))) return dir;
    }
  } catch {
    // prime-state root absent — nothing persisted on this device.
  }
  return undefined;
};

export const admitPrimeDeviceRun = async (
  params: SpawnHeteroAgentRunParams,
  workDir: string,
  logger?: PrimeRunLogger,
): Promise<AgentRunAckResult> => {
  const {
    agentType,
    assistantMessageId,
    imageList,
    jwt,
    operationId,
    prompt,
    resumeFallbackSystemContext,
    resumeSessionId,
    runGeneration,
    serverUrl,
    systemContext,
    topicId,
    workspaceId,
  } = params;
  const descriptor = params.prime;
  if (!descriptor) return { reason: 'prime descriptor missing', status: 'rejected' };
  if (imageList?.length)
    return {
      reason: 'prime runs do not carry image inputs yet',
      status: 'rejected',
    };

  let session = resumeSessionId ? primeSessions.get(resumeSessionId) : undefined;
  if (session?.run.closed) session = undefined;
  let resumeOutcome: PrimeRunOpInput['resumeOutcome'] = !resumeSessionId
    ? 'fresh'
    : session
      ? 'resumed'
      : 'rebuilt';
  if (resumeOutcome === 'rebuilt') {
    primeSessions.delete(resumeSessionId!);
    logger?.info?.(
      `prime resume requested for dead session ${resumeSessionId} — explicit rebuild (op=${operationId})`,
    );
  }

  if (!session) {
    const artifact = resolvePrimeRunnerArtifact();
    if (!artifact)
      return {
        reason: 'prime runner artifact is not present on this device',
        status: 'rejected',
      };

    // Persistent sessions: a dead session's jsonl survives under its original
    // operation's stateDir (`<stateDir>/sessions/<id>.jsonl`). On rebuild,
    // reopen it there so the new runner resumes the real upstream session;
    // when nothing persisted, the op gets its own fresh stateDir.
    const resumedStateDir =
      resumeOutcome === 'rebuilt' ? findPersistedSessionDir(resumeSessionId!) : undefined;
    const stateDir =
      resumedStateDir ?? path.join(os.homedir(), '.orvilo', 'prime-state', operationId);
    mkdirSync(stateDir, { recursive: true });

    const opened = await openPrimeDeviceRun({
      artifact,
      brokerUrl: `${serverUrl.replace(/\/$/, '')}/api/agent/prime-broker`,
      descriptor,
      executable: process.execPath,
      log: {
        error: (msg) => logger?.error?.(msg),
        log: (msg) => logger?.info?.(msg),
      },
      operationId,
      resumeSessionId: resumedStateDir ? resumeSessionId : undefined,
      stateDir,
      workspace: workDir,
    });
    if (!opened.ok)
      return { reason: opened.error?.message ?? 'prime run open failed', status: 'rejected' };
    // The ack's sessionId is the truth oracle: echoing the requested id means
    // the runner reopened the persisted session — a real resume, so the
    // fallback system context does not get re-injected into live history.
    if (resumeOutcome === 'rebuilt' && opened.value.activation.sessionId === resumeSessionId) {
      resumeOutcome = 'resumed';
      logger?.info?.(`prime session ${resumeSessionId} resumed from disk (op=${operationId})`);
    }
    session = { chain: Promise.resolve(), run: opened.value };
    primeSessions.set(opened.value.activation.sessionId, session);
    startSessionPump(session, logger);
    opened.value.leaseExpired
      .then(() => logger?.error?.(`prime run lease lapsed (op=${operationId}) — run killed`))
      .catch(() => undefined);
  } else {
    // The server records activation evidence per operation — a resumed turn
    // re-activates the shared session under THIS op's bound credential (which
    // also rotates the bridge credential /infer carries).
    const reactivated = await session.run.reactivate(descriptor.broker.credential);
    if (!reactivated.ok) {
      // The control plane refused this op on that session — the pointer must
      // not survive to trap the next turn, and the local session is dead to
      // us: drop it so the next resume takes the rebuild path.
      primeSessions.delete(resumeSessionId!);
      void session.run.kill();
      return {
        reason: reactivated.error?.message ?? 'prime session re-activation failed',
        status: 'rejected',
      };
    }
  }
  const run = session.run;

  registerAgentRun(operationId, run.child);
  devicePrimeRuns.set(operationId, run);
  if (run.child.pid !== undefined) {
    saveTask({
      agentType,
      cwd: workDir,
      operationId,
      pid: run.child.pid,
      runGeneration,
      startedAt: new Date().toISOString(),
      taskId: operationId,
      topicId,
      workspaceId,
    });
  }

  // Queue the turn onto the session — the runner rejects concurrent prompts,
  // so resumed ops run strictly after the in-flight turn.
  const opInput: PrimeRunOpInput = {
    assistantMessageId,
    jwt,
    operationId,
    promptText: [
      resumeOutcome === 'rebuilt' ? (resumeFallbackSystemContext ?? systemContext) : systemContext,
      prompt,
    ]
      .filter(Boolean)
      .join('\n\n'),
    resumeOutcome,
    resumeSessionId,
    runGeneration,
    serverUrl,
    systemContext,
    topicId,
    workspaceId,
  };
  const current = session;
  session.chain = session.chain
    .then(async () => {
      await runOperationOnSession(current, opInput);
    })
    .catch((error) =>
      logger?.error?.(
        `prime run driver failed (op=${operationId}): ${error instanceof Error ? error.message : String(error)}`,
      ),
    );

  return { status: 'accepted' };
};

/**
 * One-shot driver used by `orvilo prime exec` (an already-opened run, no
 * resume): the same serialized op path the adapter uses internally.
 */
export const drivePrimeRun = async (input: {
  assistantMessageId?: string;
  jwt: string;
  operationId: string;
  prompt: string;
  run: PrimeDeviceRun;
  runGeneration?: number;
  serverUrl: string;
  systemContext?: string;
  topicId: string;
  workspaceId?: string;
}): Promise<PrimeRunResult> => {
  const session: PrimeRunSession = { chain: Promise.resolve(), run: input.run };
  primeSessions.set(input.run.activation.sessionId, session);
  startSessionPump(session);
  return runOperationOnSession(session, {
    assistantMessageId: input.assistantMessageId,
    jwt: input.jwt,
    operationId: input.operationId,
    promptText: [input.systemContext, input.prompt].filter(Boolean).join('\n\n'),
    resumeOutcome: 'fresh',
    runGeneration: input.runGeneration,
    serverUrl: input.serverUrl,
    systemContext: input.systemContext,
    topicId: input.topicId,
    workspaceId: input.workspaceId,
  });
};
