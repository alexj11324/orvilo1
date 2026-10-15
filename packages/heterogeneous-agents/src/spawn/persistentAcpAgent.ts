import type { AskUserBridge } from '../askUser/AskUserBridge';
import { resolveHeterogeneousAgentCommand } from '../config';
import type { HeterogeneousAgentPermission } from '../types';
import { ACP_RUNTIME_AGENT_TYPES } from './acpRuntime';
import type { UploadHeterogeneousImage } from './agentStreamPipeline';
import { readCodexSessionModel } from './codexModel';
import type { AgentPromptInput, BuildAgentInputOptions } from './input';
import type { HeterogeneousAgentRuntimeStatus } from './runtimeStatus';
import type { AcpSpawnSession, SpawnAgentHandle } from './spawnAgent';
import {
  createAcpSpawnBridge,
  createAcpSpawnHandle,
  resolveVendorCommand,
  teeAcpRawStdout,
} from './spawnAgent';
import {
  createStandardAcpSession,
  extractStandardAcpSelectors,
  resolveAcpSpawnTarget,
} from './standardAcpAgents';
import type { StandardAcpConfigOption, StandardAcpSession } from './standardAcpSession';
import { assertSpawnableWorkingDirectory } from './workingDirectory';

/**
 * Process-level options of a persistent standard-ACP agent. Fixed for the
 * agent's lifetime: anything here that changes requires a new agent (the pool
 * fingerprints these).
 */
export interface PersistentAcpAgentOptions {
  /** One of `ACP_RUNTIME_AGENT_TYPES`. */
  agentType: string;
  clientVersion?: string;
  /** Vendor CLI override (same meaning as `SpawnAgentOptions.command`). */
  command?: string;
  configOptions?: StandardAcpConfigOption[];
  cwd: string;
  /** Own Unix process group (default true) so cancel can confirm the whole tree exited. */
  detached?: boolean;
  env?: Record<string, string>;
  /** Selector/native args, lifted the same way `spawnAgent` does. */
  extraArgs?: string[];
  initialModel?: string;
  initialPermission?: HeterogeneousAgentPermission;
  inputOptions?: BuildAgentInputOptions;
  /** `session/new` mcpServers. Fixed at session creation — use a stable route URL. */
  mcpServers?: Record<string, unknown>[];
  onRuntimeStatus?: (status: HeterogeneousAgentRuntimeStatus) => void;
  /** Resume this native session on the first turn (`session/resume` or `session/load`). */
  resumeSessionId?: string;
  /** How long an idle agent keeps its process for the next turn. */
  warmIdleMs?: number;
}

/** Per-turn bindings: everything that changes with each operation. */
export interface AcpTurnBindings {
  askUserBridge?: AskUserBridge;
  onRawStdout?: (chunk: Buffer) => void;
  operationId: string;
  prompt: AgentPromptInput;
  uploadImage?: UploadHeterogeneousImage;
}

/**
 * A standard-ACP agent whose process and ACP session outlive one turn. The
 * first `runTurn` spawns + `initialize` + `session/new|resume|load`; later
 * turns on a still-`reusable` agent send only `session/prompt`.
 */
export interface PersistentAcpAgent {
  /** A turn is in flight. One `session/prompt` at a time per ACP session. */
  readonly busy: boolean;
  /** Host-forced shutdown of the process. Idempotent. */
  close: () => void;
  /** Cancel the in-flight turn (or kill an idle process); resolves true once the process is gone. */
  interrupt: () => Promise<boolean>;
  readonly pid: number | undefined;
  /** True when the next `runTurn` can reuse the live process (idle, alive, not interrupted). */
  readonly reusable: boolean;
  /**
   * Run one turn. Rejects when busy, or when the agent already ran a turn and
   * is no longer `reusable` (callers then create a new agent). The handle's
   * `exit` resolves at TURN end; the process may stay alive afterwards.
   */
  runTurn: (turn: AcpTurnBindings) => Promise<SpawnAgentHandle>;
  /** Native ACP session id once the first turn established it. */
  readonly sessionId: string | undefined;
}

/** Idle hold used when {@link PersistentAcpAgentOptions.warmIdleMs} is unset. */
export const DEFAULT_PERSISTENT_ACP_WARM_IDLE_MS = 600_000;

type AcpSpawnBridge = ReturnType<typeof createAcpSpawnBridge>;

interface ActiveTurn {
  bridge: AcpSpawnBridge;
  kill: SpawnAgentHandle['kill'];
  onRawMessage: (line: string) => void;
}

/**
 * Create (but do not start) a persistent standard-ACP agent.
 *
 * Process-level resolution (command, cwd, bridge/package-runner target,
 * selector lifting, Codex resume usage seed) happens here, so a missing
 * bridge surfaces before any turn. The process is spawned by the first
 * `runTurn`.
 *
 * Turn isolation: the session's callbacks are fixed dispatchers that forward
 * only to the turn currently in flight. Each turn gets its own spawn bridge
 * (events queue, stderr stream, exit), ended when that turn settles; nothing
 * emitted between turns can reach a finished turn's handle. A session title
 * the agent reports between turns is held and delivered as the first event
 * of the next turn.
 *
 * Idle lifetime: after a turn ends with `end_turn` the process is held for
 * `warmIdleMs` (default {@link DEFAULT_PERSISTENT_ACP_WARM_IDLE_MS}) and then
 * closed. Engines whose cache policy enables keep-alive pings keep their
 * per-engine default: an armed keeper owns the idle hold instead (its
 * residency window replaces `warmIdleMs`), and the next turn adopts the live
 * child from it. Disable it per host with `ORVILO_CACHE_KEEPALIVE=0` in `env`.
 *
 * Capabilities negotiated at `initialize` (e.g. form elicitation, advertised
 * only when the first turn has an `askUserBridge`) stay fixed for the
 * process; hosts should pass an `askUserBridge` on every turn or none.
 */
export const createPersistentAcpAgent = async (
  options: PersistentAcpAgentOptions,
): Promise<PersistentAcpAgent> => {
  const { agentType } = options;
  if (!ACP_RUNTIME_AGENT_TYPES.has(agentType)) {
    throw new Error(
      `createPersistentAcpAgent: unsupported agent type "${agentType}" (standard ACP agents only)`,
    );
  }

  const cwd = options.cwd || process.cwd();
  assertSpawnableWorkingDirectory(cwd);
  const vendorCommand = resolveVendorCommand(
    resolveHeterogeneousAgentCommand(agentType, options.command),
    cwd,
  );
  const childEnv: NodeJS.ProcessEnv = { ...process.env, ...options.env };
  const target = await resolveAcpSpawnTarget(agentType, vendorCommand, childEnv);
  const readCodexCumulativeUsage = async (sessionId: string | undefined) =>
    agentType === 'codex' && sessionId
      ? (await readCodexSessionModel(sessionId, { env: childEnv }))?.cumulativeUsage
      : undefined;
  // Codex reports cumulative usage per thread; seed the first turn of a
  // resumed thread (and, below, every warm turn) with the prior totals.
  const initialCumulativeUsage = await readCodexCumulativeUsage(options.resumeSessionId);
  const selectors = extractStandardAcpSelectors(agentType, options.extraArgs);
  const configOptions = [...selectors.configOptions, ...(options.configOptions ?? [])];

  let session: StandardAcpSession | undefined;
  let active: ActiveTurn | undefined;
  let busy = false;
  let closed = false;
  let interrupted = false;
  let interrupting: Promise<boolean> | undefined;
  /** Title reported while no turn was in flight; delivered to the next turn. */
  let pendingTitle: string | undefined;

  const onSessionTitle = (title: string): void => {
    if (active) active.bridge.onSessionTitle(title);
    else pendingTitle = title;
  };

  const closeSession = (signal?: NodeJS.Signals): void => {
    closed = true;
    session?.close(signal);
  };

  const interruptSession = (): Promise<boolean> => {
    interrupted = true;
    interrupting ??= session ? session.interrupt() : Promise.resolve(true);
    if (!session) closed = true;
    return interrupting;
  };

  const startTurn = async (turn: AcpTurnBindings): Promise<SpawnAgentHandle> => {
    const warm = session !== undefined;
    const warmCumulativeUsage = warm
      ? await readCodexCumulativeUsage(session?.nativeSessionId)
      : undefined;
    if (closed || interrupted) throw new Error('Persistent ACP agent was closed');
    if (session && !session.reusable) throw new Error('Persistent ACP agent is no longer reusable');

    const bridge = createAcpSpawnBridge(turn.operationId);
    const current: ActiveTurn = {
      bridge,
      kill: () => {},
      onRawMessage: teeAcpRawStdout(turn.onRawStdout),
    };

    if (!session) {
      session = createStandardAcpSession(agentType, {
        args: selectors.args,
        askUserBridge: turn.askUserBridge,
        clientVersion: options.clientVersion ?? 'orvilo-cli',
        commandArgs: target.commandArgs,
        commandPath: target.commandPath,
        configOptions,
        cwd,
        detached: options.detached ?? true,
        env: target.env,
        initialCumulativeUsage,
        initialModel: options.initialModel ?? selectors.initialModel,
        initialPermission: options.initialPermission,
        inputOptions: options.inputOptions,
        mcpServers: options.mcpServers,
        // Fixed dispatchers: they only ever reach the turn in flight.
        onEvents: (events) => active?.bridge.onEvents(events),
        onRawMessage: (line) => active?.onRawMessage(line),
        onRuntimeStatus: (status) => options.onRuntimeStatus?.(status),
        onSessionId: () => {},
        onSessionTitle,
        onStderr: (data) => active?.bridge.onStderr(data),
        operationId: turn.operationId,
        prompt: turn.prompt,
        resumeSessionId: options.resumeSessionId,
        sessionId: turn.operationId,
        uploadImage: turn.uploadImage,
        warmIdleMs: options.warmIdleMs ?? DEFAULT_PERSISTENT_ACP_WARM_IDLE_MS,
      });
    }
    const owner = session;

    const run = async (): Promise<void> => {
      try {
        if (warm) {
          await owner.runWarm({
            askUserBridge: turn.askUserBridge,
            operationId: turn.operationId,
            prompt: turn.prompt,
            sessionId: turn.operationId,
            uploadImage: turn.uploadImage,
            ...(warmCumulativeUsage ? { initialCumulativeUsage: warmCumulativeUsage } : {}),
          });
        } else {
          await owner.run();
        }
      } finally {
        if (active === current) active = undefined;
        busy = false;
      }
    };

    active = current;
    if (pendingTitle !== undefined) {
      bridge.onSessionTitle(pendingTitle);
      pendingTitle = undefined;
    }

    const turnSession: AcpSpawnSession = {
      close: (signal) => closeSession(signal),
      interrupt: () => interruptSession(),
      get pid() {
        return owner.pid;
      },
      run,
    };
    const handle = createAcpSpawnHandle(bridge, turnSession, () => owner.nativeSessionId);
    current.kill = handle.kill;
    return handle;
  };

  const agent: PersistentAcpAgent = {
    get busy() {
      return busy;
    },
    close: () => {
      if (closed) return;
      // Route a mid-turn close through the turn's handle so its `exit`
      // reports the host signal instead of a clean finish.
      if (active) active.kill('SIGTERM');
      else closeSession();
    },
    interrupt: () => {
      if (active) {
        // Marks the turn's exit as host-interrupted and starts the cancel.
        active.kill('SIGINT');
      }
      return interruptSession();
    },
    get pid() {
      return session?.pid;
    },
    get reusable() {
      return !busy && !closed && !interrupted && session !== undefined && session.reusable;
    },
    runTurn: async (turn) => {
      if (busy) throw new Error('Persistent ACP agent is busy with another turn');
      if (closed || interrupted) throw new Error('Persistent ACP agent was closed');
      if (session && !session.reusable) {
        throw new Error('Persistent ACP agent is no longer reusable');
      }
      busy = true;
      try {
        return await startTurn(turn);
      } catch (error) {
        busy = false;
        active = undefined;
        throw error;
      }
    },
    get sessionId() {
      return session?.nativeSessionId;
    },
  };
  return agent;
};
