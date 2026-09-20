import path from 'node:path';
import { PassThrough } from 'node:stream';

import type { AgentStreamEvent } from '@orvilo/agent-gateway-client';

import type { AskUserBridge } from '../askUser/AskUserBridge';
import { resolveHeterogeneousAgentCommand } from '../config';
import { ACP_RUNTIME_AGENT_TYPES } from './acpRuntime';
import type { UploadHeterogeneousImage } from './agentStreamPipeline';
import { isPathLikeCommand } from './cliSpawn';
import { readCodexSessionModel } from './codexModel';
import { buildCursorAcpPrompt, CursorAcpSession } from './cursorAcpSession';
import { buildDevinAcpPrompt, DevinAcpSession } from './devinAcpSession';
import { buildDroidAcpPrompt, DroidAcpSession } from './droidAcpSession';
import { buildGrokAcpPrompt, GrokAcpSession } from './grokAcpSession';
import type { AgentPromptInput, BuildAgentInputOptions } from './input';
import {
  createStandardAcpSession,
  extractStandardAcpSelectors,
  resolveAcpSpawnTarget,
} from './standardAcpAgents';
import type { StandardAcpConfigOption } from './standardAcpSession';
import { TraeAcpSession } from './traeAcpSession';
import { assertSpawnableWorkingDirectory } from './workingDirectory';

export interface SpawnAgentOptions {
  /** Registered local heterogeneous-agent type key. */
  agentType: string;
  /** Bridge for bidirectional question/permission requests emitted by ACP agents. */
  askUserBridge?: AskUserBridge;
  /**
   * Override the agent CLI binary name. Defaults to the agent's standard
   * executable. For bridge agents (`claude-code`, `codex`, `amp`, `pi`) this
   * names the *vendor* CLI the bridge drives — not the bridge binary.
   */
  command?: string;
  /**
   * Additional `session/set_config_option` applications merged after the
   * agent's defaults (e.g. `reasoning_effort`, `effort`, `fast-mode`).
   * Caller-supplied entries are required — a rejection fails the run; selector
   * flags lifted out of `extraArgs` arrive pre-marked `optional` instead.
   * Standard-ACP agents only.
   */
  configOptions?: StandardAcpConfigOption[];
  /** Working directory for the spawned child. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Create a dedicated Unix process group. Disable beneath a detached wrapper. */
  detached?: boolean;
  /** Extra environment variables merged on top of `process.env`. */
  env?: Record<string, string>;
  /**
   * Extra CLI arguments appended after the agent's ACP-mode flags (native
   * runtimes only — bridge binaries own their argv). Selector flags such as
   * `--model`, `--effort`, `--mode`, and codex `-c key=value` are lifted onto
   * `session/set_config_option` by `extractStandardAcpSelectors` before spawn.
   */
  extraArgs?: string[];
  /** Initial model selected through the agent protocol after session setup. */
  initialModel?: string;
  /**
   * Image normalization options (URL fetch + on-disk cache + path
   * materialization). Forwarded to the prompt builder. When `prompt` is a
   * plain string this is unused.
   */
  inputOptions?: BuildAgentInputOptions;
  /**
   * ACP `session/new` `mcpServers` entries (e.g. the local `orvilo_cc`
   * AskUserQuestion/browser-tools HTTP server). Standard-ACP agents only.
   */
  mcpServers?: Record<string, unknown>[];
  /**
   * Optional tee for the ACP wire traffic — every raw JSON-RPC line the agent
   * writes, BEFORE the adapter sees it. `lh hetero exec --raw-dump` wires it
   * to a file writer so the untouched stream can be inspected after the fact.
   */
  onRawStdout?: (chunk: Buffer) => void;
  /**
   * Operation id stamped onto every emitted `AgentStreamEvent`. For ingest-
   * connected runs this is the server-allocated op id; for standalone runs
   * (no `--topic` / `--operation-id`) the CLI generates a fresh uuid so
   * events still carry the conventional shape.
   */
  operationId: string;
  /** (Devin ACP only) Global `--permission-mode` value, placed before `acp`. */
  permissionMode?: string;
  /**
   * User prompt. A plain string is sugar for a single text block; the array
   * form supports mixed text + image content blocks (URL / path / base64).
   */
  prompt: AgentPromptInput;
  /** Resume an existing agent session by its native session id. */
  resumeSessionId?: string;
  /**
   * Runtime uploader for tool_result images (e.g. `Read` on an image file).
   * The adapter emits the raw base64 on `pluginState.images`; the pipeline
   * calls this to swap each entry for an uploaded `{ fileId, url }` reference
   * before the event is persisted, so heavy base64 never reaches the ingest
   * sinks. Omit in standalone/offline runs — the pipeline then drops the
   * image and leaves the `[Image: …]` text placeholder as the fallback.
   */
  uploadImage?: UploadHeterogeneousImage;
}

export interface SpawnAgentHandle {
  /**
   * Async iterable of `AgentStreamEvent`s adapted from the agent's ACP
   * `session/update` traffic. Yields events as they arrive; iteration ends
   * once the turn settles AND the adapter's `flush()` events are delivered.
   */
  events: AsyncIterable<AgentStreamEvent>;
  /**
   * Resolves once the agent runtime exits. Consumers should iterate `events`
   * to completion BEFORE awaiting `exit` if they care about ordering.
   */
  exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  /**
   * Interrupt the turn (`SIGINT` → `session/cancel`, other signals → force
   * close). A dedicated Unix process group is signaled as a tree.
   */
  kill: (signal?: NodeJS.Signals) => void;
  /** Spawned child PID, undefined if spawn failed pre-PID. */
  pid: number | undefined;
  /**
   * The agent's native session id, reported by `session/new` / `session/load`.
   * Available after the `events` async iterable has been fully consumed.
   * Used by `lh hetero exec` to pass `sessionId` to `heteroFinish` so the
   * server can persist it for `--resume` on the next turn.
   */
  readonly sessionId: string | undefined;
  /**
   * The agent's stderr stream — caller can pipe to its own stderr or
   * collect for error reporting. The pipeline does not consume stderr.
   */
  stderr: NodeJS.ReadableStream;
}

/** Guarded raw-wire tee: diagnostic sink failures must not affect the ACP run. */
const teeAcpRawStdout =
  (onRawStdout?: (chunk: Buffer) => void) =>
  (line: string): void => {
    if (!onRawStdout) return;
    try {
      onRawStdout(Buffer.from(line));
    } catch {
      // raw dump is diagnostic-only; never let it disrupt the run
    }
  };

/**
 * Bridge a bidirectional ACP session onto the ordinary `SpawnAgentHandle`
 * contract shared by the one-shot CLI spawns.
 *
 * Exit/error policy (uniform for every ACP agent):
 * - Host kills resolve `exit` as `{ code: null, signal }`.
 * - ACP request failures are first adapted into a terminal error event and
 *   then reject the session's run() promise. Once that structured event is
 *   queued, the iterable ends normally so callers can apply their error
 *   policy; transport failures with no terminal event still throw from the
 *   iterator.
 */
const createAcpSpawnBridge = () => {
  const stderr = new PassThrough();
  const queue: AgentStreamEvent[] = [];
  let emittedTerminalError = false;
  let hostSignal: NodeJS.Signals | null = null;
  let streamEnded = false;
  let streamError: Error | undefined;
  let wakeup: (() => void) | undefined;

  const wake = () => {
    const resolve = wakeup;
    wakeup = undefined;
    resolve?.();
  };
  const getHostExit = (): { code: null; signal: NodeJS.Signals } | undefined =>
    hostSignal ? { code: null, signal: hostSignal } : undefined;

  const onEvents = (events: AgentStreamEvent[]): void => {
    if (events.some(({ type }) => type === 'error')) emittedTerminalError = true;
    queue.push(...events);
    wake();
  };
  const onStderr = (data: string): void => {
    stderr.write(data);
  };

  const events: AsyncIterable<AgentStreamEvent> = {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<AgentStreamEvent>> {
          while (true) {
            const event = queue.shift();
            if (event) return { done: false, value: event };
            if (streamError) throw streamError;
            if (streamEnded) return { done: true, value: undefined };
            await new Promise<void>((resolve) => {
              wakeup = resolve;
            });
          }
        },
      };
    },
  };

  const attach = (session: {
    close: (signal?: NodeJS.Signals) => void;
    interrupt: () => void;
    run: () => Promise<void>;
  }): Pick<SpawnAgentHandle, 'exit' | 'kill'> => {
    const exit: SpawnAgentHandle['exit'] = session
      .run()
      .then(() => getHostExit() ?? { code: 0, signal: null })
      .catch((error) => {
        const hostExit = getHostExit();
        if (hostExit) return hostExit;

        if (!emittedTerminalError) {
          streamError = error instanceof Error ? error : new Error(String(error));
        }
        return { code: 1, signal: null };
      })
      .finally(() => {
        streamEnded = true;
        stderr.end();
        wake();
      });

    const kill = (signal: NodeJS.Signals = 'SIGINT'): void => {
      hostSignal = signal;
      if (signal === 'SIGINT') void session.interrupt();
      else session.close(signal);
    };
    return { exit, kill };
  };

  return { attach, events, onEvents, onStderr, stderr };
};

interface AcpSpawnSession {
  close: (signal?: NodeJS.Signals) => void;
  interrupt: () => Promise<boolean>;
  pid?: number;
  run: () => Promise<void>;
  sessionId?: string;
}

const createAcpSpawnHandle = (
  bridge: ReturnType<typeof createAcpSpawnBridge>,
  session: AcpSpawnSession,
  getSessionId: () => string | undefined = () => session.sessionId,
): SpawnAgentHandle => {
  const { exit, kill } = bridge.attach(session);

  return {
    events: bridge.events,
    exit,
    kill,
    get pid() {
      return session.pid;
    },
    get sessionId() {
      return getSessionId();
    },
    stderr: bridge.stderr,
  };
};

/** Normalize a user-configured command: relative path-like commands resolve against cwd. */
const resolveVendorCommand = (command: string, cwd: string): string =>
  isPathLikeCommand(command) && !path.isAbsolute(command) ? path.resolve(cwd, command) : command;

const spawnGrokAcpAgent = async (
  options: SpawnAgentOptions,
  command: string,
  cwd: string,
): Promise<SpawnAgentHandle> => {
  const prompt = await buildGrokAcpPrompt(options.prompt, options.inputOptions);
  const bridge = createAcpSpawnBridge();
  const session = new GrokAcpSession({
    args: options.extraArgs ?? [],
    clientVersion: 'orvilo-cli',
    commandPath: command,
    cwd,
    detached: options.detached,
    env: { ...process.env, ...options.env },
    onEvents: bridge.onEvents,
    onRawMessage: teeAcpRawStdout(options.onRawStdout),
    onRuntimeStatus: () => {},
    onSessionId: () => {},
    onStderr: bridge.onStderr,
    operationId: options.operationId,
    prompt,
    resumeSessionId: options.resumeSessionId,
    sessionId: options.operationId,
  });
  return createAcpSpawnHandle(bridge, session);
};

const spawnCursorAcpAgent = async (
  options: SpawnAgentOptions,
  command: string,
  cwd: string,
): Promise<SpawnAgentHandle> => {
  const prompt = buildCursorAcpPrompt(options.prompt);
  const bridge = createAcpSpawnBridge();
  const session = new CursorAcpSession({
    args: options.extraArgs ?? [],
    askUserBridge: options.askUserBridge,
    clientVersion: 'orvilo-cli',
    commandPath: command,
    cwd,
    detached: options.detached,
    env: { ...process.env, ...options.env },
    onEvents: bridge.onEvents,
    onRawMessage: teeAcpRawStdout(options.onRawStdout),
    onRuntimeStatus: () => {},
    onSessionId: () => {},
    onStderr: bridge.onStderr,
    operationId: options.operationId,
    prompt,
    resumeSessionId: options.resumeSessionId,
    sessionId: options.operationId,
  });
  return createAcpSpawnHandle(bridge, session);
};

const spawnDroidAcpAgent = async (
  options: SpawnAgentOptions,
  command: string,
  cwd: string,
): Promise<SpawnAgentHandle> => {
  const prompt = await buildDroidAcpPrompt(options.prompt, options.inputOptions);
  const bridge = createAcpSpawnBridge();
  const session = new DroidAcpSession({
    args: options.extraArgs ?? [],
    askUserBridge: options.askUserBridge,
    clientVersion: 'orvilo-cli',
    commandPath: command,
    cwd,
    env: { ...process.env, ...options.env },
    initialModel: options.initialModel,
    onEvents: bridge.onEvents,
    onRawMessage: teeAcpRawStdout(options.onRawStdout),
    onRuntimeStatus: () => {},
    onSessionId: () => {},
    onStderr: bridge.onStderr,
    operationId: options.operationId,
    prompt,
    resumeSessionId: options.resumeSessionId,
    sessionId: options.operationId,
  });
  return createAcpSpawnHandle(bridge, session, () => session.nativeSessionId);
};

const spawnDevinAcpAgent = async (
  options: SpawnAgentOptions,
  command: string,
  cwd: string,
): Promise<SpawnAgentHandle> => {
  const prompt = await buildDevinAcpPrompt(options.prompt, options.inputOptions);
  const bridge = createAcpSpawnBridge();
  const session = new DevinAcpSession({
    args: options.extraArgs ?? [],
    askUserBridge: options.askUserBridge,
    clientVersion: 'orvilo-cli',
    commandPath: command,
    cwd,
    detached: options.detached,
    env: { ...process.env, ...options.env },
    initialModel: options.initialModel,
    onEvents: bridge.onEvents,
    permissionMode: options.permissionMode,
    onRawMessage: teeAcpRawStdout(options.onRawStdout),
    onRuntimeStatus: () => {},
    onSessionId: () => {},
    onStderr: bridge.onStderr,
    operationId: options.operationId,
    prompt,
    resumeSessionId: options.resumeSessionId,
    sessionId: options.operationId,
  });
  return createAcpSpawnHandle(bridge, session);
};

/**
 * The eight agents standardized on {@link StandardAcpSession}: native ACP
 * runtimes (`kimi acp`, `opencode acp`, `qoder --acp`, `codebuddy --acp`) and
 * upstream bridges (`claude-agent-acp`, `codex-acp`, `amp-acp`, `pi-acp`).
 */
const spawnStandardAcpAgent = async (
  options: SpawnAgentOptions,
  vendorCommand: string,
  cwd: string,
): Promise<SpawnAgentHandle> => {
  const childEnv = { ...process.env, ...options.env };
  const target = await resolveAcpSpawnTarget(options.agentType, vendorCommand, childEnv);

  // Codex rollouts still report cumulative usage; seed the pipeline so a
  // resumed turn continues the counters instead of restarting at zero.
  const initialCumulativeUsage =
    options.agentType === 'codex' && options.resumeSessionId
      ? (await readCodexSessionModel(options.resumeSessionId, { env: childEnv }))?.cumulativeUsage
      : undefined;

  // Legacy selector flags (`--model`, codex `-c key=value`, …) in extraArgs
  // are lifted onto the ACP session-config surface so the same CLI vocabulary
  // keeps working through bridge binaries that own their own argv.
  const selectors = extractStandardAcpSelectors(options.agentType, options.extraArgs);
  const configOptions = [...selectors.configOptions, ...(options.configOptions ?? [])];

  const bridge = createAcpSpawnBridge();
  const session = createStandardAcpSession(options.agentType, {
    args: selectors.args,
    askUserBridge: options.askUserBridge,
    clientVersion: 'lobehub-cli',
    commandArgs: target.commandArgs,
    commandPath: target.commandPath,
    configOptions,
    cwd,
    detached: options.detached,
    env: target.env,
    initialCumulativeUsage,
    initialModel: options.initialModel ?? selectors.initialModel,
    inputOptions: options.inputOptions,
    mcpServers: options.mcpServers,
    onEvents: bridge.onEvents,
    onRawMessage: teeAcpRawStdout(options.onRawStdout),
    onRuntimeStatus: () => {},
    onSessionId: () => {},
    onStderr: bridge.onStderr,
    operationId: options.operationId,
    prompt: options.prompt,
    resumeSessionId: options.resumeSessionId,
    sessionId: options.operationId,
    uploadImage: options.uploadImage,
  });
  return createAcpSpawnHandle(bridge, session, () => session.nativeSessionId);
};

/**
 * Spawn an external agent through its ACP v1 session — every locally
 * executed agent type runs the shared initialize → session/new|load →
 * session/prompt lifecycle. Used by `lh hetero exec` for both standalone
 * terminal runs and sandbox-driven runs that ingest into the server.
 *
 * Stays minimal on purpose — no on-disk tracing, no proxy env composition,
 * no CLI-not-found classification beyond ACP bridge detection. Those host
 * concerns live in the desktop main controller, which has its own dispatch
 * on top of the same sessions.
 *
 * Returns a Promise because bridge detection and image normalization are
 * async; the spawn itself happens after resolution so a missing bridge or
 * failed image fetch surfaces before the child starts.
 */
export const spawnAgent = async (options: SpawnAgentOptions): Promise<SpawnAgentHandle> => {
  if (options.agentType === 'trae') return spawnTraeAcpAgent(options);

  const command = resolveHeterogeneousAgentCommand(options.agentType, options.command);
  const cwd = options.cwd || process.cwd();
  assertSpawnableWorkingDirectory(cwd);

  if (ACP_RUNTIME_AGENT_TYPES.has(options.agentType)) {
    return spawnStandardAcpAgent(options, resolveVendorCommand(command, cwd), cwd);
  }

  switch (options.agentType) {
    case 'cursor': {
      return spawnCursorAcpAgent(options, command, cwd);
    }
    case 'devin': {
      return spawnDevinAcpAgent(options, command, cwd);
    }
    case 'droid': {
      return spawnDroidAcpAgent(options, command, cwd);
    }
    case 'grok-build': {
      return spawnGrokAcpAgent(options, command, cwd);
    }
    default: {
      throw new Error(`spawnAgent: unsupported agent type "${options.agentType}"`);
    }
  }
};

/** Spawn TRAE's bidirectional ACP runtime behind the ordinary SpawnAgentHandle contract. */
export const spawnTraeAcpAgent = async (options: SpawnAgentOptions): Promise<SpawnAgentHandle> => {
  const requestedCommand = resolveHeterogeneousAgentCommand('trae', options.command);
  const cwd = options.cwd || process.cwd();
  assertSpawnableWorkingDirectory(cwd);
  const command = resolveVendorCommand(requestedCommand, cwd);
  const childEnv = { ...process.env, ...options.env };
  const { detectHeterogeneousCliCommand } = await import('./resolveCliCommand');
  const commandStatus = await detectHeterogeneousCliCommand('trae', command, childEnv);
  if (!commandStatus.available || !commandStatus.path) {
    throw new Error(`TRAE command does not expose the required ACP runtime: ${requestedCommand}`);
  }

  const bridge = createAcpSpawnBridge();
  const session = new TraeAcpSession({
    args: options.extraArgs ?? [],
    clientVersion: '1.0.0',
    commandPath: commandStatus.path,
    cwd,
    detached: options.detached,
    env: {
      ...childEnv,
      ...(commandStatus.resolvedPathEnv ? { PATH: commandStatus.resolvedPathEnv } : {}),
    },
    initialModel: options.initialModel,
    onEvents: bridge.onEvents,
    onRawMessage: teeAcpRawStdout(options.onRawStdout),
    onRuntimeStatus: () => {},
    onSessionId: () => {},
    onStderr: bridge.onStderr,
    operationId: options.operationId,
    prompt: options.prompt,
    resumeSessionId: options.resumeSessionId,
    sessionId: options.operationId,
  });
  return createAcpSpawnHandle(bridge, session, () => session.nativeSessionId);
};
