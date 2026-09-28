import { execFileSync, spawn } from 'node:child_process';

import {
  buildHeteroExecStdinPayload,
  HETERO_EXEC_INHERIT_PROCESS_GROUP_ENV,
  type HeteroExecImageRef,
} from '@orvilo/heterogeneous-agents/protocol';
import { resolveHeteroSpawnCwd } from '@orvilo/heterogeneous-agents/workingDirectory';
import type { AcpBuiltinToolSpec } from '@orvilo/types';
import { sleep } from '@orvilo/utils/sleep';

import { getTask, removeTask, saveTask, type TaskEntry } from '../daemon/taskRegistry';
import { cancelAgentRun, getAgentRun, registerAgentRun } from './agentRunRegistry';

/** Liveness probe for a detached run — the wrapper pid is a process-group leader. */
function isProcessGroupAlive(pid: number): boolean {
  try {
    process.kill(process.platform === 'win32' ? pid : -pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

/** Poll interval while confirming a killed process group is really gone. */
const PROCESS_GROUP_POLL_MS = 50;
/** Bounded window to observe the exit after the forced kill — same contract as `lh task cancel`. */
const KILL_CONFIRM_TIMEOUT_MS = 3000;

const waitForProcessGroupExit = async (pid: number, timeoutMs: number): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  while (isProcessGroupAlive(pid)) {
    if (Date.now() >= deadline) return false;
    await sleep(PROCESS_GROUP_POLL_MS);
  }
  return true;
};

/**
 * Best-effort read of the recorded group leader's command line. A registry
 * entry can outlive its writer (daemon restart): if the pid now belongs to an
 * unrelated process, signaling its group would kill innocent processes.
 * Returns null when the leader is gone or the platform probe is unavailable —
 * an unreadable cmdline keeps the conservative kill path (a foreign process
 * cannot realistically inherit the pgid of a leader that never existed).
 */
const readLeaderCommandLine = (pid: number): string | null => {
  try {
    const output =
      process.platform === 'win32'
        ? execFileSync(
            'powershell',
            [
              '-NoProfile',
              '-Command',
              `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
            ],
            { encoding: 'utf8', timeout: 5000 },
          )
        : execFileSync('ps', ['-p', String(pid), '-o', 'args='], { encoding: 'utf8' });
    return output.trim() || null;
  } catch {
    return null;
  }
};

const killWindowsProcessTree = (pid: number): Promise<boolean> =>
  new Promise((resolve) => {
    const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    killer.once('error', () => resolve(false));
    killer.once('exit', (code) => resolve(code === 0));
  });

/**
 * Forced kill of the whole process group (POSIX) or tree (Windows). Returns
 * false when the signal itself could not be delivered for a reason other than
 * "already gone" (EPERM, taskkill denied) — an undelivered kill can never
 * confirm exit, so the caller must refuse the replacement.
 */
const forceKillGroup = async (
  pid: number,
  logger?: SpawnHeteroAgentRunLogger,
): Promise<boolean> => {
  if (process.platform === 'win32') {
    const killed = await killWindowsProcessTree(pid);
    if (!killed && isProcessGroupAlive(pid)) {
      logger?.error?.(`taskkill failed for old run pid=${pid}`);
      return false;
    }
    return true;
  }
  try {
    process.kill(-pid, 'SIGKILL');
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return true; // the group exited between probe and kill
    logger?.error?.(`SIGKILL failed for old run group pid=${pid}: ${code ?? String(err)}`);
    return false;
  }
};

/**
 * Stop the recorded writer and CONFIRM its exit before returning true.
 * Graceful drain first (`cancelAgentRun` lets an in-process wrapper forward
 * SIGINT and drain terminal callbacks), then a forced group kill with a
 * bounded exit wait. False means the old writer's fate is unknown — the
 * caller must keep its record and refuse to spawn a second writer.
 */
const stopTrackedRun = async (
  entry: TaskEntry,
  operationId: string,
  logger?: SpawnHeteroAgentRunLogger,
): Promise<boolean> => {
  await cancelAgentRun(operationId, 'SIGINT');
  if (!isProcessGroupAlive(entry.pid)) return true;

  if (!(await forceKillGroup(entry.pid, logger))) return false;
  return waitForProcessGroupExit(entry.pid, KILL_CONFIRM_TIMEOUT_MS);
};

export interface SpawnHeteroAgentRunParams {
  agentType: string;
  /** Resolved `lh hetero exec` wrapper args. */
  args?: string[];
  assistantMessageId?: string;
  /** Server-backed builtin tool surface for the per-run `orvilo_cc` MCP server. */
  builtinTools?: AcpBuiltinToolSpec[];
  cwd?: string;
  /** Image attachments (signed URLs) appended as image content blocks. */
  imageList?: HeteroExecImageRef[];
  jwt: string;
  operationId: string;
  /**
   * Operation-scoped token forwarded as `ORVILO_OPERATION_JWT` for builtin
   * tool callbacks. `jwt` on this path is already the operation token, but
   * the field is kept explicit so all three hosts (device daemon / desktop /
   * sandbox) share the same env contract.
   */
  operationJwt?: string;
  prompt: string;
  /** System context used only by the automatic retry without native resume. */
  resumeFallbackSystemContext?: string;
  resumeSessionId?: string;
  /** Admission fence relayed to `lh hetero exec` via `ORVILO_RUN_GENERATION`. */
  runGeneration?: number;
  serverUrl: string;
  systemContext?: string;
  topicId: string;
  /** Topic/run workspace — forwarded as `ORVILO_WORKSPACE_ID` for ingest. */
  workspaceId?: string;
}

export interface AgentRunAckResult {
  reason?: string;
  status: 'accepted' | 'rejected';
}

interface SpawnHeteroAgentRunLogger {
  error?: (msg: string) => void;
  info?: (msg: string) => void;
}

/**
 * Spawn `lh hetero exec` for a gateway-dispatched agent run. Mirrors the
 * desktop app's `spawnLhHeteroExec`: the spawned CLI owns the full pipeline
 * (spawn -> adapt -> BatchIngester -> server ingest), so the connect daemon
 * needs no local stream handling — it only kicks off the process.
 *
 * Re-invokes the current CLI entry (`process.execPath` + `process.argv[1]`)
 * instead of relying on `lh` being on `PATH`, so it also works inside the
 * detached `lh connect --daemon` child where `PATH` may be minimal.
 *
 * Resolves only once the child's outcome is known: `accepted` on the `spawn`
 * event, `rejected` on an early wrapper-process `error`. A missing target cwd
 * is handled inside `lh hetero exec`, which can classify it and emit
 * `heteroFinish`; other wrapper spawn failures flow back as rejected dispatches.
 */
/**
 * One in-flight admission per operation. Two dispatches racing the same
 * operationId must not interleave between the liveness probe, the kill
 * confirm, and the respawn — each sees the predecessor's outcome as the
 * "existing" record, so concurrent same-generation retries dedupe and
 * concurrent superseding generations replace exactly once.
 */
const admissions = new Map<string, Promise<AgentRunAckResult>>();

export async function spawnHeteroAgentRun(
  params: SpawnHeteroAgentRunParams,
  logger?: SpawnHeteroAgentRunLogger,
): Promise<AgentRunAckResult> {
  const previous = admissions.get(params.operationId);
  const run = () => admitHeteroAgentRun(params, logger);
  // A free slot admits synchronously (the dispatch ack path expects spawn to
  // start inside the call); a busy slot chains behind the in-flight
  // admission — a failed predecessor never blocks the next one.
  const next: Promise<AgentRunAckResult> =
    previous === undefined ? run() : previous.catch(() => undefined).then(run);
  admissions.set(params.operationId, next);
  try {
    return await next;
  } finally {
    if (admissions.get(params.operationId) === next) admissions.delete(params.operationId);
  }
}

async function admitHeteroAgentRun(
  params: SpawnHeteroAgentRunParams,
  logger?: SpawnHeteroAgentRunLogger,
): Promise<AgentRunAckResult> {
  const {
    agentType,
    assistantMessageId,
    args: extraArgs,
    builtinTools,
    cwd,
    imageList,
    jwt,
    operationId,
    operationJwt,
    prompt,
    resumeFallbackSystemContext,
    resumeSessionId,
    runGeneration,
    serverUrl,
    systemContext,
    topicId,
    workspaceId,
  } = params;
  const workDir = cwd ?? process.cwd();

  // Idempotent redelivery: the gateway retries `agent_run_request` after a
  // lost ack with the same idempotency key (= operationId). A live run
  // already tracking this operation IS the accepted run — ack it instead of
  // spawning a duplicate. A higher runGeneration supersedes: the server
  // fenced the stale writer off, so it is stopped before the respawn.
  const existing = getTask(operationId);
  if (existing) {
    const superseded =
      runGeneration != null &&
      existing.runGeneration != null &&
      runGeneration > existing.runGeneration;
    const existingAlive = isProcessGroupAlive(existing.pid);
    // A record restored from disk can outlive its writer: the pid may have
    // been recycled by an unrelated process. Runs this daemon spawned need
    // no probe (their pgid was minted at spawn); anything else verifies the
    // group leader's cmdline — a foreign pid is a stale record, not a writer
    // to kill. An unverifiable cmdline keeps the conservative kill path.
    const foreign =
      existingAlive &&
      !getAgentRun(operationId) &&
      readLeaderCommandLine(existing.pid)?.includes(operationId) === false;

    if (existingAlive && !foreign) {
      if (!superseded) {
        logger?.info?.(
          `hetero exec dedupe (op=${operationId}): run already active pid=${existing.pid}`,
        );
        return { status: 'accepted' };
      }
      // Replacing a live writer is allowed only once its process group is
      // CONFIRMED gone. An undelivered kill or a group that never reports
      // exit leaves the writer's fate unknown — refuse the admission and
      // keep the record so a later dispatch can retry instead of spawning a
      // second writer over a live one.
      const stopped = await stopTrackedRun(existing, operationId, logger);
      if (!stopped) {
        logger?.error?.(
          `hetero exec replace blocked (op=${operationId}): previous run pid=${existing.pid} has not confirmed exit`,
        );
        return { reason: 'previous run has not confirmed exit', status: 'rejected' };
      }
    }
    removeTask(operationId);
  }

  // A stale project path must not prevent the wrapper CLI from starting: the
  // inner spawnAgent preflight owns cwd classification and reports the
  // structured working_directory_not_found error through heteroFinish.
  const spawnCwd = resolveHeteroSpawnCwd(workDir);

  // Server-ingest mode (--topic + --operation-id): events are batch-POSTed to
  // the server, not rendered. `--input-json -` reads the prompt from stdin.
  const cliArgs = [
    process.argv[1],
    'hetero',
    'exec',
    '--type',
    agentType,
    '--operation-id',
    operationId,
    '--topic',
    topicId,
    '--render',
    'none',
    '--input-json',
    '-',
    '--cwd',
    workDir,
    ...(resumeSessionId ? ['--resume', resumeSessionId] : []),
    ...(extraArgs ?? []),
  ];

  // systemContext / image attachments turn the payload into a content-block
  // array: context block first, then the user's prompt, then images — mirrors
  // the desktop path. `lh hetero exec` coerces both shapes via
  // coerceJsonPrompt.
  const stdinPayload = buildHeteroExecStdinPayload({
    imageList,
    prompt,
    resumeFallbackSystemContext,
    systemContext,
  });

  // A connector can itself be started inside another agent run. Its ambient
  // identity belongs to the launcher, not this dispatched conversation; CLI
  // evidence commands must never attach this run's outputs to that ancestor.
  const childEnv = { ...process.env };
  for (const key of [
    'ORVILO_AGENT_ID',
    'ORVILO_ASSISTANT_MESSAGE_ID',
    'ORVILO_BUILTIN_TOOLS',
    'ORVILO_OPERATION_JWT',
    'ORVILO_RUN_GENERATION',
    'ORVILO_TASK_ID',
    'ORVILO_WORKSPACE_ID',
  ]) {
    delete childEnv[key];
  }

  return new Promise<AgentRunAckResult>((resolve) => {
    let settled = false;
    const settle = (result: AgentRunAckResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let pid: number | undefined;
    const child = spawn(process.execPath, [...process.execArgv, ...cliArgs], {
      cwd: spawnCwd,
      detached: true,
      env: {
        ...childEnv,
        ...(assistantMessageId ? { ORVILO_ASSISTANT_MESSAGE_ID: assistantMessageId } : {}),
        [HETERO_EXEC_INHERIT_PROCESS_GROUP_ENV]: '1',
        ORVILO_JWT: jwt,
        // The operation token is `jwt` on this path; forwarded under its own
        // key so the CLI's builtin-tool callback path is host-agnostic.
        ...(operationJwt ? { ORVILO_OPERATION_JWT: operationJwt } : {}),
        ...(builtinTools?.length
          ? { ORVILO_BUILTIN_TOOLS: Buffer.from(JSON.stringify(builtinTools)).toString('base64') }
          : {}),
        ORVILO_OPERATION_ID: operationId,
        ...(runGeneration != null ? { ORVILO_RUN_GENERATION: String(runGeneration) } : {}),
        ORVILO_SERVER: serverUrl,
        ORVILO_TOPIC_ID: topicId,
        ...(workspaceId ? { ORVILO_WORKSPACE_ID: workspaceId } : {}),
      },
      stdio: ['pipe', 'inherit', 'inherit'],
      windowsHide: true,
    });

    child.once('spawn', () => {
      registerAgentRun(operationId, child);
      // Register the child into the task registry so `cancelHeteroTask`
      // dispatched from the server can resolve it by operationId and signal
      // the whole process group. `detached: true` places the CLI in its own
      // group; the inherited-group env contract keeps its agent descendants
      // in that same group without affecting the connect daemon.
      pid = child.pid;
      if (pid !== undefined) {
        saveTask({
          agentType,
          cwd: workDir,
          operationId,
          pid,
          runGeneration,
          startedAt: new Date().toISOString(),
          taskId: operationId,
          topicId,
          workspaceId,
        });
      }

      // Only safe to write stdin once the process actually started.
      try {
        child.stdin?.write(stdinPayload);
        child.stdin?.end();
      } catch (err) {
        logger?.error?.(
          `hetero exec stdin write failed (op=${operationId}): ${(err as Error).message}`,
        );
      }
      settle({ status: 'accepted' });
    });

    child.once('error', (err) => {
      logger?.error?.(`hetero exec spawn failed (op=${operationId}): ${err.message}`);
      settle({ reason: err.message, status: 'rejected' });
    });

    child.once('exit', () => {
      // A child that dies before either 'spawn' or 'error' would leave this
      // admission pending forever — every later dispatch for the operation
      // chains behind it. Settle it rejected so the slot frees up; the
      // registry-cleanup 'exit' listener below still runs independently.
      settle({ reason: 'process exited before spawn completed', status: 'rejected' });
    });

    child.on('exit', (code, signal) => {
      // Only remove the registry entry if the exiting PID still owns this
      // task — a newer run that reused the same operationId must not be
      // cleared by a stale exit event.
      if (pid !== undefined && getTask(operationId)?.pid === pid) {
        removeTask(operationId);
      }
      logger?.info?.(`hetero exec exited (op=${operationId}) code=${code} signal=${signal}`);
    });
  });
}
