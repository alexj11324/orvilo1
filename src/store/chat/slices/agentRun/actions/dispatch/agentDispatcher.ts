import { isDesktop as defaultIsDesktop } from '@orvilo/const';
import {
  HETEROGENEOUS_PROVIDER_BINDING_LOCAL_ONLY_ERROR,
  HETEROGENEOUS_PROVIDER_BINDING_PERSONAL_ONLY_ERROR,
  isRemoteHeterogeneousType,
} from '@orvilo/heterogeneous-agents';
import { type DeviceExecutionTarget, type HeterogeneousProviderConfig } from '@orvilo/types';

import { resolveExecutionTarget } from '@/helpers/executionTarget';

/**
 * Error thrown when no runtime can execute an agent: the agent has no
 * heterogeneous (ACP) provider binding and gateway mode is not enabled.
 * Surfaces as an explicit configuration failure — there is no in-browser
 * LLM fallback anymore.
 */
export const AGENT_BINDING_REQUIRED_ERROR =
  'AGENT_BINDING_REQUIRED: This agent has no execution binding. Bind an ACP/heterogeneous agent or enable gateway mode.';

/**
 * Error thrown when a group supervisor turn cannot find an orchestrating
 * runtime. Group orchestration (speak / broadcast / delegate / task fan-out)
 * is driven by the server's `agentMember` runner; the in-browser
 * GroupOrchestrationRuntime was retired with the client LLM runtime, so a
 * supervisor turn MUST execute through Gateway. Without it there is no
 * callback that can schedule member runs — better to fail the send loudly
 * than let the supervisor's orchestration tools report fake success.
 */
export const GROUP_SUPERVISOR_REQUIRES_GATEWAY_ERROR =
  'GROUP_SUPERVISOR_REQUIRES_GATEWAY: Group orchestration requires gateway mode. Enable gateway mode for this agent to run a supervisor turn.';

/**
 * Which agent runtime should handle an operation.
 *
 * - `client`: in-browser AgentRuntime (default)
 * - `gateway`: cloud sandbox via Gateway WebSocket
 * - `hetero`: heterogeneous CLI agent (Claude Code, Codex, …) via desktop IPC or sandbox
 */
export type AgentRuntimeType = 'client' | 'gateway' | 'hetero';

/**
 * Unified intent for a non-hetero, non-group sub-agent invocation.
 *
 * All three caller patterns (`callSubAgent` / `callAgent` / `@agent`) map
 * their parameters into this shape before handing off to
 * `dispatchNonHeteroSubAgent`. Runtime routing is entirely the dispatcher's
 * responsibility — callers only declare *what* they want, not *how* to run it.
 *
 * Excluded from this contract:
 * - Hetero agents (handled by the heterogeneous pipeline)
 * - Group orchestration (handled by `groupOrchestration.triggerSpeak`)
 * - Async task mode (handled by the `execSubAgent` executor via state.type)
 */
export interface AgentInvocationIntent {
  /**
   * Instruction delivered to the sub-agent.
   * In client mode it is injected as a virtual user message prepended to the
   * existing message history. In gateway mode it becomes the `message` param
   * of `executeGatewayAgent` (i.e. a real user message on the server).
   */
  instruction: string;
  /**
   * Which invocation pattern produced this intent.
   * Preserved for logging / debugging; has no effect on runtime selection.
   */
  kind: 'callAgent' | 'callSubAgent' | 'mention';
  /**
   * ID of the tool result message that triggered this invocation.
   * Used as `parentMessageId` by the client executor.
   */
  parentMessageId: string;
  /** Target agent to execute. */
  targetAgentId: string;
}

export interface RuntimeSelectionContext {
  /** Device bound by the execution switcher. Used when desktop `local` syncs to web. */
  boundDeviceId?: string;
  /**
   * Whether this desktop's device-gateway socket is currently connected — the
   * server can reach this machine as a registered execution device. Read
   * synchronously from the electron store by callers (`getElectronStoreState()`)
   * so resume paths without async affordance get the same answer. Web surfaces
   * never set it — a browser has no device socket.
   */
  deviceGatewayConnected?: boolean;
  /**
   * Per-agent execution device choice from the composer's Execution Device
   * switcher. Only meaningful when `heterogeneousProvider` is a local CLI
   * (claude-code / codex). Controls the desktop fork:
   *   - `'device'` / `'sandbox'` → route through Gateway so the server can
   *     dispatch to an `orvilo connect` device or spawn a sandbox.
   *   - `'local'`  → desktop prefers `gateway` when its device socket is
   *     connected (server dispatches back onto this machine — unified
   *     admission + ledger lifecycle); falls back to `hetero` in-process
   *     spawn only when the socket is down, and on workspace agents.
   *   - `undefined` → resolves to `none` / `auto` per resolveExecutionTarget.
   */
  executionTarget?: DeviceExecutionTarget;
  /** Per-agent heterogeneous provider config (desktop only — takes priority over gateway). */
  heterogeneousProvider?: HeterogeneousProviderConfig;
  /** Result of `chatStore.isGatewayModeEnabled()`. */
  isGatewayMode: boolean;
  /**
   * The run is a group supervisor turn (`group.supervisorAgentId === agentId`).
   * Supervisors orchestrate members through server-side group callbacks, so
   * they must execute on Gateway — a local hetero spawn has no
   * `groupOrchestration` surface to schedule member runs.
   */
  isGroupSupervisor?: boolean;
  /**
   * The agent is workspace-scoped (`agent.workspaceId` set), regardless of
   * authorship or per-member overrides. Unlike `workspaceScoped`, this stays
   * true for the agent's author and for members with an explicit local
   * override — the cases that CAN spawn a workspace agent in-process.
   */
  isWorkspaceAgent?: boolean;
  /**
   * Explicit override that wins over automatic selection.
   *
   * Used by sub-agent dispatches (`directMentionRoute`, `callAgent`) so child
   * operations inherit the parent operation's runtime instead of re-running
   * the global decision — a sub-agent spawned inside a Gateway run should
   * stay on Gateway, even if its own agent config would say otherwise.
   */
  parentRuntime?: AgentRuntimeType;
  /**
   * The shared-row safety coercion still applies: a member without an explicit
   * `executionTarget` override never executes the shared config on their own
   * client (see `resolveWorkspaceScoped` / `resolveExecutionTarget`). False
   * for the author or an explicitly overriding member even when
   * `isWorkspaceAgent` is true.
   */
  workspaceScoped?: boolean;
}

interface SelectRuntimeTypeOptions {
  /** Override of `isDesktop` for testability. Defaults to the build-time const. */
  isDesktop?: boolean;
}

/**
 * Centralized "which runtime should run this agent operation" decision.
 *
 * The same priority is applied at every entry point (sendMessage, regenerate,
 * resume, continue, sub-agent dispatch, …) so adding a new entry point does
 * not require re-deriving the routing rules.
 *
 * Priority: `parentRuntime` > `hetero` (desktop IPC fallback only) >
 * `gateway` > `client`. `local`-intent hetero routes to `gateway` whenever
 * the device socket can carry the run back to this desktop — the SAME final
 * execution context (server admission → device → ingest) for send, resume,
 * cancel and subtask alike; IPC `hetero` is the degraded local-only path.
 */
export const selectRuntimeType = (
  ctx: RuntimeSelectionContext,
  { isDesktop = defaultIsDesktop }: SelectRuntimeTypeOptions = {},
): AgentRuntimeType => {
  if (ctx.heterogeneousProvider?.authMode === 'api') {
    // Personal-scope invariant: Desktop main resolves the binding's providerId
    // with NO workspace header (see `providerBindingPort`), while a workspace
    // agent's binding was configured against workspace-scoped providers. The
    // author (or an explicitly overriding member) CAN spawn a workspace agent
    // in-process — `workspaceScoped` alone does not block them — so a colliding
    // personal provider id (e.g. builtin `anthropic`) would silently supply
    // different credentials. Reject before any IPC.
    // The deployment-default API source uses deployment-owned credentials
    // rather than a user provider id, so this guard stays on user-provider
    // bindings only.
    if (
      ctx.heterogeneousProvider.apiConfig &&
      ctx.heterogeneousProvider.apiConfig?.source !== 'server-default' &&
      ctx.isWorkspaceAgent
    ) {
      throw new Error(HETEROGENEOUS_PROVIDER_BINDING_PERSONAL_ONLY_ERROR);
    }
    const target = resolveExecutionTarget(
      {
        boundDeviceId: ctx.boundDeviceId,
        executionTarget: ctx.executionTarget,
        heterogeneousProvider: ctx.heterogeneousProvider,
      },
      {
        isHetero: true,
        clientExecutionAvailable: isDesktop,
        workspaceScoped: ctx.workspaceScoped,
      },
    );
    if (target !== 'local' || (ctx.parentRuntime && ctx.parentRuntime !== 'hetero')) {
      throw new Error(HETEROGENEOUS_PROVIDER_BINDING_LOCAL_ONLY_ERROR);
    }
  }

  // Group supervisor turns orchestrate members via server-side callbacks
  // (`ctx.agentMember` in the group-management server runtime). The retired
  // client runtime used to supply `groupOrchestration` locally; a local hetero
  // spawn has none, so the supervisor must run on Gateway — without it the
  // orchestration tools could only pretend to schedule member work.
  if (ctx.isGroupSupervisor) {
    if (ctx.isGatewayMode) return 'gateway';
    throw new Error(GROUP_SUPERVISOR_REQUIRES_GATEWAY_ERROR);
  }

  // Prime is a device-hosted runner, not an ACP session. Its native local
  // selection still uses Gateway; IPC cannot launch it, even as a child.
  if (ctx.heterogeneousProvider?.type === 'orvilo') return 'gateway';

  if (ctx.parentRuntime) return ctx.parentRuntime;
  // Notify-based platform agents (openclaw / hermes) use the gateway transport for both
  // targets: `local` presets this desktop's personal device ID on the request, while
  // `device` dispatches to the configured remote device. They do not implement the
  // JSONL/session protocol consumed by the in-process `hetero` transport.
  if (ctx.heterogeneousProvider && isRemoteHeterogeneousType(ctx.heterogeneousProvider.type)) {
    return 'gateway';
  }
  // Local CLI hetero (Amp / Claude Code / Codex) — route by the resolved
  // execution target (shared resolution with the server / the device switcher
  // UI). `device` / `sandbox` need server-side dispatch. `local` on a desktop
  // now prefers the GATEWAY transport when this machine's device socket is
  // connected: the server dispatches the run back onto this very desktop via
  // `agent_run_request` → `orvilo hetero exec` → heteroIngest — the same
  // admission/ledger lifecycle every other surface uses, so a web client
  // observes the desktop-local run identically (W2-E convergence: `local`
  // becomes a transport difference, not a private lifecycle). IPC `hetero`
  // remains only when the gateway cannot reach this machine (socket down —
  // dispatch would land nowhere) and, for now, on workspace agents, where a
  // member's personal desktop is not a workspace-authorized device candidate
  // (documented remainder: workspace runs on unenrolled personal machines
  // stay in-process until workspace admission covers them).
  // Unset targets resolve to the pending `none` state on every client — the
  // viewer's platform never picks an execution host.
  if (ctx.heterogeneousProvider) {
    const target = resolveExecutionTarget(
      {
        boundDeviceId: ctx.boundDeviceId,
        executionTarget: ctx.executionTarget,
        heterogeneousProvider: ctx.heterogeneousProvider,
      },
      // on the client the desktop build IS where local execution is available
      {
        isHetero: true,
        clientExecutionAvailable: isDesktop,
        workspaceScoped: ctx.workspaceScoped,
      },
    );
    if (target === 'local' && isDesktop) {
      const ownDeviceReachable = ctx.deviceGatewayConnected === true;
      return ownDeviceReachable && !ctx.isWorkspaceAgent ? 'gateway' : 'hetero';
    }
    return 'gateway';
  }
  if (ctx.isGatewayMode) return 'gateway';
  return 'client';
};
