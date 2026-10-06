import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { PrimeRunDescriptor } from '@orvilo/device-gateway-client';
import { openPrimeDeviceRun } from '@orvilo/device-prime-host';
import { decodeAcpBuiltinToolSpecs } from '@orvilo/heterogeneous-agents/builtinMcp';
import { isNonEmptyString, isRecord } from '@orvilo/utils/object';
import type { Command } from 'commander';

import { drivePrimeRun, resolvePrimeRunnerArtifact } from '../device/primeRun';
import { resolveServerUrl } from '../settings';
import { log } from '../utils/logger';

/**
 * `orvilo prime exec` — the device-facing one-shot Prime runner.
 *
 * The CLI device daemon hosts Prime in-process (`admitPrimeDeviceRun` inside
 * the serialized `agentRun` lifecycle). Desktop can't link apps/cli internals
 * but already supervises spawned children — so it launches this command on
 * the bundled CLI instead: one process = one supervised device run, same
 * kill contract as `orvilo hetero exec`.
 *
 * The stdin payload carries the descriptor the server's dispatch composed —
 * artifact pin, bound broker credential, lease, model, subject — never raw
 * provider keys. Ingest goes through the same TrpcIngestSink/heteroFinish
 * pipeline as every hetero run, authenticated by ORVILO_OPERATION_JWT or
 * ORVILO_JWT like `hetero exec`.
 */
interface PrimeExecPayload {
  descriptor: PrimeRunDescriptor;
  prompt: string;
  systemContext?: string;
}

const parsePrimeExecPayload = (parsed: unknown): PrimeExecPayload => {
  if (!isRecord(parsed)) throw new Error('Invalid prime exec payload: expected an object.');
  const descriptor = parsed.descriptor;
  if (
    !isRecord(descriptor) ||
    !isRecord(descriptor.broker) ||
    !isNonEmptyString(descriptor.broker.credential) ||
    !isRecord(descriptor.model) ||
    !isNonEmptyString(descriptor.model.id) ||
    !isRecord(descriptor.artifact) ||
    !isNonEmptyString(descriptor.artifact.sha256) ||
    !isRecord(descriptor.lease) ||
    !Number.isSafeInteger(descriptor.lease.ttlMs)
  )
    throw new Error('Invalid prime exec payload: descriptor is incomplete.');
  if (!isNonEmptyString(parsed.prompt))
    throw new Error('Invalid prime exec payload: prompt is required.');
  return {
    descriptor: descriptor as unknown as PrimeRunDescriptor,
    prompt: parsed.prompt,
    ...(isNonEmptyString(parsed.systemContext) ? { systemContext: parsed.systemContext } : {}),
  };
};

interface PrimeExecOptions {
  assistantMessageId?: string;
  cwd?: string;
  inputJson?: string;
  operationId: string;
  runGeneration?: string;
  topic: string;
  workspace?: string;
}

const readInput = async (location: string): Promise<string> => {
  if (location === '-' || location === '') {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString('utf8');
  }
  return readFile(location, 'utf8');
};

const primeExec = async (options: PrimeExecOptions): Promise<void> => {
  const token = process.env.ORVILO_OPERATION_JWT ?? process.env.ORVILO_JWT;
  if (!token) {
    log.error('ORVILO_JWT is required — this command is launched by an Orvilo device host.');
    process.exit(2);
  }

  let payload: PrimeExecPayload;
  try {
    const raw = await readInput(options.inputJson ?? '-');
    payload = parsePrimeExecPayload(JSON.parse(raw));
  } catch (err) {
    log.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }

  const artifact = resolvePrimeRunnerArtifact();
  if (!artifact) {
    log.error(
      'prime runner artifact is not present on this device (set ORVILO_PRIME_RUNNER for packaged installs)',
    );
    process.exit(2);
  }

  const serverUrl = resolveServerUrl();
  const workDir = options.cwd ?? process.cwd();
  const stateDir = path.join(os.homedir(), '.orvilo', 'prime-state', options.operationId);
  mkdirSync(stateDir, { recursive: true });

  const opened = await openPrimeDeviceRun({
    artifact,
    brokerUrl: `${serverUrl.replace(/\/$/, '')}/api/agent/prime-broker`,
    descriptor: payload.descriptor,
    executable: process.execPath,
    log: { error: (msg) => log.error(msg), log: (msg) => log.info(msg) },
    operationId: options.operationId,
    stateDir,
    workspace: workDir,
  });
  if (!opened.ok) {
    log.error(opened.error?.message ?? 'prime run open failed');
    process.exit(1);
  }
  const run = opened.value;

  // Supervisor liveness = this process's lease renewal source: while the
  // parent host (desktop / device daemon) is alive the run may have
  // side-effects; a dead parent lets the lease lapse and the host tears the
  // run down per policy instead of running uncontrolled.
  const parentPid = process.ppid;
  const parentWatch = setInterval(() => {
    try {
      process.kill(parentPid, 0);
      run.renewLease();
    } catch {
      void run.abort();
    }
  }, 10_000);
  parentWatch.unref();
  run.leaseExpired
    .then(() => log.error('prime run lease lapsed — run killed'))
    .catch(() => undefined);

  let signalled = false;
  const onSignal = () => {
    if (signalled) return;
    signalled = true;
    void run.abort();
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  const runGeneration =
    options.runGeneration === undefined ? undefined : Number.parseInt(options.runGeneration, 10);

  const result = await drivePrimeRun({
    builtinTools: decodeAcpBuiltinToolSpecs(process.env.ORVILO_BUILTIN_TOOLS),
    assistantMessageId: options.assistantMessageId,
    jwt: token,
    operationId: options.operationId,
    prompt: payload.prompt,
    run,
    ...(runGeneration !== undefined && Number.isSafeInteger(runGeneration)
      ? { runGeneration }
      : {}),
    serverUrl,
    systemContext: payload.systemContext,
    topicId: options.topic,
    workspaceId: options.workspace,
  });

  clearInterval(parentWatch);
  await run.kill();
  process.exit(result === 'error' ? 1 : 0);
};

export function registerPrimeCommand(program: Command) {
  const prime = program
    .command('prime')
    .description('Internal Prime harness device-execution commands');

  prime
    .command('exec')
    .description(
      'Run one Prime device execution. Internal: launched by an Orvilo device host (desktop or CLI daemon), not for direct use.',
    )
    .requiredOption('--operation-id <id>', 'Operation id for ingest/finish accounting')
    .requiredOption('--topic <topicId>', 'Server topic id for ingest')
    .option('-d, --cwd <path>', 'Working directory for the spawned runner')
    .option('--workspace <id>', 'Workspace id for ingest')
    .option('--assistant-message-id <id>', 'Assistant message id for ingest')
    .option('--run-generation <n>', 'Run generation fence from the dispatch')
    .option(
      '--input-json <path>',
      'JSON payload {descriptor, prompt, systemContext?}. Use `-` for stdin (default).',
    )
    .action(primeExec);
}
