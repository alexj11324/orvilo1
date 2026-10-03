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
 */
import { existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

/** Live Prime runs by operationId — the daemon's renewal surface. */
const devicePrimeRuns = new Map<string, PrimeDeviceRun>();

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
  const candidates = [
    override,
    path.resolve(import.meta.dirname, 'runner.mjs'),
    path.resolve(
      import.meta.dirname,
      '..',
      '..',
      '..',
      '..',
      'packages',
      'prime-harness',
      'dist',
      'runner.mjs',
    ),
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
 * Admit a Prime device run inside the serialized `agentRun` lifecycle.
 * Resolves `accepted` only after the runner verified, spawned, initialized,
 * and reported its activation — a rejected ack still surfaces the precise
 * refusal (bad digest, refused activation, missing artifact).
 */
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

  const artifact = resolvePrimeRunnerArtifact();
  if (!artifact)
    return {
      reason: 'prime runner artifact is not present on this device',
      status: 'rejected',
    };

  const stateDir = path.join(os.homedir(), '.orvilo', 'prime-state', operationId);
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
    stateDir,
    workspace: workDir,
  });
  if (!opened.ok)
    return { reason: opened.error?.message ?? 'prime run open failed', status: 'rejected' };
  const run = opened.value;

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
  run.leaseExpired
    .then(() => logger?.error?.(`prime run lease lapsed (op=${operationId}) — run killed`))
    .catch(() => undefined);

  void drivePrimeRun({
    assistantMessageId,
    operationId,
    prompt,
    run,
    runGeneration,
    serverUrl,
    systemContext,
    topicId,
    workspaceId,
    jwt,
  }).catch((error) =>
    logger?.error?.(
      `prime run driver failed (op=${operationId}): ${error instanceof Error ? error.message : String(error)}`,
    ),
  );

  return { status: 'accepted' };
};

/**
 * Pump `harness.event` into the standard ingest pipeline, drive the single
 * prompt to completion, then report through `heteroFinish` — identical
 * accounting to the wrapper CLI path.
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
}): Promise<'success' | 'error' | 'cancelled'> => {
  const {
    assistantMessageId,
    jwt,
    operationId,
    prompt,
    run,
    runGeneration,
    serverUrl,
    systemContext,
    topicId,
    workspaceId,
  } = input;

  const client = createLambdaClient({ serverUrl, token: jwt, tokenType: 'jwt' }, workspaceId);
  const sink = new TrpcIngestSink(
    client,
    'orvilo',
    operationId,
    topicId,
    assistantMessageId,
    runGeneration,
  );
  const ingester = new CoalescingBatchIngester(sink);

  let result: 'success' | 'error' | 'cancelled' = 'success';
  let finishError: { message: string; type: string } | undefined;
  let usage: { inputTokens: number; outputTokens: number } | undefined;

  const finish = async () => {
    try {
      await ingester.drain();
    } finally {
      await sink
        .finish({
          error: finishError,
          result,
          sessionId: run.activation.sessionId,
        })
        .catch(() => undefined);
      devicePrimeRuns.delete(operationId);
    }
  };

  ingester.push(
    makeEvent(operationId, 'stream_start', {
      provider: 'prime',
      sessionId: run.activation.sessionId,
    }),
  );
  const pumpEvents = (async () => {
    for await (const event of run.events) {
      switch (event.kind) {
        case 'text': {
          ingester.push(
            makeEvent(operationId, 'stream_chunk', { chunkType: 'text', content: event.text }),
          );
          break;
        }
        case 'usage': {
          usage = { inputTokens: event.inputTokens, outputTokens: event.outputTokens };
          break;
        }
        case 'tool-violation': {
          ingester.push(
            makeEvent(operationId, 'error', {
              message: `tool-violation: ${event.toolName} ${event.event}`,
            }),
          );
          break;
        }
        case 'error': {
          ingester.push(makeEvent(operationId, 'error', { message: event.message }));
          break;
        }
      }
    }
  })();

  const promptResult = await run.prompt([systemContext, prompt].filter(Boolean).join('\n\n'));
  if (!promptResult.ok) {
    result = 'error';
    finishError = {
      message: promptResult.error?.message ?? 'prime prompt failed',
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
  await pumpEvents;
  ingester.push(makeEvent(operationId, 'stream_end', { usage }));
  ingester.push(makeEvent(operationId, 'agent_runtime_end', {}));
  await finish();
  return result;
};
