import { spawn } from 'node:child_process';

import {
  buildHeteroExecStdinPayload,
  HETERO_EXEC_INHERIT_PROCESS_GROUP_ENV,
  type HeteroExecImageRef,
} from '@orvilo/heterogeneous-agents/protocol';
import { resolveHeteroSpawnCwd } from '@orvilo/heterogeneous-agents/workingDirectory';
import type { AcpBuiltinToolSpec } from '@orvilo/types';

import { getTask, removeTask, saveTask } from '../daemon/taskRegistry';
import { cancelAgentRun, registerAgentRun } from './agentRunRegistry';

/** Liveness probe for a detached run — the wrapper pid is a process-group leader. */
function isProcessGroupAlive(pid: number): boolean {
  try {
    process.kill(process.platform === 'win32' ? pid : -pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

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
export async function spawnHeteroAgentRun(
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
    if (existingAlive && !superseded) {
      logger?.info?.(
        `hetero exec dedupe (op=${operationId}): run already active pid=${existing.pid}`,
      );
      return { status: 'accepted' };
    }
    if (existingAlive) {
      await cancelAgentRun(operationId, 'SIGINT');
      if (isProcessGroupAlive(existing.pid)) {
        try {
          process.kill(process.platform === 'win32' ? existing.pid : -existing.pid, 'SIGKILL');
        } catch {
          // The group exited between the graceful cancel and the escalation.
        }
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
