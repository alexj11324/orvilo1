import type { AskUserBridge } from '../askUser/AskUserBridge';
import type { HeterogeneousAgentPermission } from '../types';
import type { UploadHeterogeneousImage } from './agentStreamPipeline';
import type { AgentPromptInput, BuildAgentInputOptions } from './input';
import type { HeterogeneousAgentRuntimeStatus } from './runtimeStatus';
import type { SpawnAgentHandle } from './spawnAgent';
import type { StandardAcpConfigOption } from './standardAcpSession';

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

/** Create (but do not start) a persistent standard-ACP agent. */
export const createPersistentAcpAgent = async (
  _options: PersistentAcpAgentOptions,
): Promise<PersistentAcpAgent> => {
  throw new Error('createPersistentAcpAgent: not implemented');
};
