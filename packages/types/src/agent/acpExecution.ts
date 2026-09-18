/**
 * ACP execution contract — shared vocabulary frozen by work package P05 of the
 * all-ACP migration.
 *
 * Boundary rules these types encode (plan §3.1–§3.4):
 *
 * - Orvilo's only execution boundary to an external Agent is ACP. Vendor SDK or
 *   CLI specifics live inside upstream ACP adapters/sessions; nothing here
 *   names a vendor transport.
 * - `operationId` (one logical run), ACP `sessionId` (one agent session), the
 *   gateway connection id, and `taskId` are DISTINCT identifiers. A reconnect
 *   re-subscribes to an existing operation; it never mints a new run.
 * - `targetDeviceId` is the machine that executes — never inferred from the
 *   device the operator's UI happens to run on.
 * - Cancellation distinguishes "request sent" from "execution confirmed
 *   stopped"; an unconfirmable stop is `outcome_unknown`, not success.
 * - No field here may carry provider keys, raw client-supplied command strings,
 *   or any path back into the retired LLM-provider execution chain.
 */

import type {
  LocalHeterogeneousAgentType,
  RemoteHeterogeneousAgentType,
} from './heterogeneousAgent';

/**
 * Agent kinds that can back an ACP installation ref: real installable external
 * agents (local CLI/desktop or remote platform). Builtin managed engines
 * (e.g. 'orvilo') have no binary to pin and are excluded by construction.
 */
export type AcpInstallableAgentType =
  | LocalHeterogeneousAgentType
  | RemoteHeterogeneousAgentType;

/** The only execution protocol at the Orvilo → external-Agent boundary. */
export type AgentExecutionProtocol = 'acp';

/**
 * Identity of the Agent installation that will run on the execution machine.
 * `installationId` + `configRevision` pin *what* was authorized to launch so a
 * run cannot silently pick up a different binary/config after reconnect.
 */
export interface AgentInstallationRef {
  /** Installed agent kind (registry type — e.g. 'claude-code', 'codex'). */
  agentType: AcpInstallableAgentType;
  /** Revision of the binding/launch config used for this run. */
  configRevision: string;
  /** Install descriptor id on the execution machine. */
  installationId: string;
}

/**
 * Binding between a work-management agent and the ACP-capable installation
 * that executes it. Replaces the retired provider/model binding: there is no
 * `provider`, `apiKey`, `baseUrl`, or platform model-table reference here —
 * model/mode choices come from the agent's own advertised options.
 */
export interface AgentExecutionBinding {
  /** Work-management executor identity (not the human owner). */
  agentId: string;
  /** Negotiated capability snapshot id captured at bind/launch time. */
  capabilitySnapshotId?: string;
  /** Always 'acp' post-migration; kept explicit for persisted rows. */
  executionProtocol: AgentExecutionProtocol;
  /** Installation authorized to launch on the execution machine. */
  installation: AgentInstallationRef;
  /** Device that executes. Absent only when resolution is still pending. */
  targetDeviceId?: string;
  /** Owning workspace scope of the binding. */
  workspaceId?: string;
}

/**
 * Fixed attribution of a single run. Everything needed to attribute results,
 * re-subscribe, and fence duplicate writers — without conflating the business
 * operation with the ACP session or the transport connection.
 */
export interface AgentRunIdentity {
  /** ACP session id — empty before handshake completes, then fixed. */
  acpSessionId?: string;
  /** Binding revision the run was admitted under. */
  bindingRevision?: string;
  /** Absolute cwd resolved on the EXECUTION machine (machine B), not the operator's. */
  executionCwd?: string;
  /** Execution workspace/worktree id on the execution machine. */
  executionWorkspaceId?: string;
  /** Idempotency key of the admission request. */
  idempotencyKey?: string;
  /**
   * Stable run identity shared by server, gateway, and device. Reconnects and
   * event replays key off this — a transport reconnect never mints a new one.
   */
  operationId: string;
  /** Run generation/fence for stale-writer detection. */
  runGeneration?: number;
  /** Task this run serves, when any (free chat runs have none). */
  taskId?: string;
  /** Device that owns execution; the workspace root lives there. */
  targetDeviceId?: string;
}

/**
 * Cancellation state of a run — three-way, never collapsed to a boolean.
 *
 * `requested`  — a cancel signal was sent to the execution host.
 * `confirmed`  — the host confirmed the agent process actually stopped.
 * `unknown`    — the host outcome could not be confirmed; the run must be
 *                treated as potentially still writing (see `outcome_unknown`).
 */
export type AgentRunCancelState = 'confirmed' | 'none' | 'requested' | 'unknown';

/**
 * Subscription handle for observing a run. Reconnect = re-subscribe by
 * `operationId` + `eventCursor`; never re-send the prompt.
 */
export interface AgentRunSubscription {
  /** Last consumed event cursor; replay dedupes everything at/before it. */
  eventCursor?: string;
  operationId: string;
}

/**
 * Approval/permission binding — a single approval is scoped to exactly one
 * run + tool call + generation and is single-use. Observers may subscribe to
 * events but can never approve.
 */
export interface AgentRunApprovalRef {
  /** Device where the action will execute. */
  deviceId?: string;
  /** Run generation the approval is valid for; stale generations can't reuse it. */
  generation: number;
  operationId: string;
  /** Host-assigned request id (e.g. ACP `session/request_permission` id). */
  requestId: string;
  /** Tool call the approval authorizes. */
  toolCallId?: string;
  workspaceId?: string;
}

/**
 * Error classification for execution-admission and run control. UI and API
 * must be able to distinguish these; they map onto surfaced statuses.
 */
export type AgentExecutionErrorCode =
  /** ACP handshake/transport could not be established on the target. */
  | 'ACP_UNAVAILABLE'
  /** Agent's ACP protocol version is incompatible with the host. */
  | 'ACP_VERSION_UNSUPPORTED'
  /** The agent requires interactive authentication before it can run. */
  | 'AUTH_REQUIRED'
  /** Agent lacks a capability the run requires (fs/terminal/model/etc.). */
  | 'CAPABILITY_UNSUPPORTED'
  /** Target device is offline; run waits or fails — never falls back. */
  | 'DEVICE_OFFLINE'
  /** Run outcome cannot be confirmed (e.g. lost ack); forbid new writers on its worktree. */
  | 'OUTCOME_UNKNOWN'
  /** Persisted config predates the ACP migration and needs explicit re-binding. */
  | 'RUNTIME_MIGRATION_REQUIRED'
  /** A newer generation fenced this run; it must not write or report. */
  | 'STALE_RUN';

export interface AgentExecutionError {
  code: AgentExecutionErrorCode;
  /** Non-secret diagnostic detail; never carries credentials or prompts. */
  message?: string;
}
