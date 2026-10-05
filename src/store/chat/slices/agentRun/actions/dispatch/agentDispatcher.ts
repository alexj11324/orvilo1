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
 * - `gateway`: server-admitted execution via Gateway WebSocket — sandbox,
 *   remote `orvilo connect` device, or this desktop dispatched back to itself
 *   through `agent_run_request` (unified admission → device → ingest)
 * - `hetero`: transport/event marker ONLY — the device-side heterogeneous
 *   lifecycle (Claude Code, Codex, …) as attributed by ingest/gateway events.
 *   `selectRuntimeType` never returns it: no product entry may spawn the
 *   renderer IPC session, because that lifecycle bypassed server admission
 *   (F03). If a genuinely offline/local-only mode is ever productized it must
 *   be an explicitly-gated opt-in — the retired entry branches that called
 *   `executeHeterogeneousAgent` are the seam, not a live fallback.
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
   * Per-agent execution device choice from the composer's Execution Device
   * switcher. Only meaningful when `heterogeneousProvider` is a local CLI
   * (claude-code / codex). Routes through Gateway for every value — `'device'`
   * / `'sandbox'` / `'local'` alike — so the server's unified admission makes
   * the authorization and lifecycle decision (device reachability included).
   * The socket state of the viewing client must NEVER factor into routing:
   * dispatching back onto this desktop through `agent_run_request` vs refusing
   * with a typed blocked result is the server's call, not a local fork.
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
   * override. It no longer unlocks a local spawn — it only feeds the
   * api-mode personal-provider guard below; whether a workspace run may
   * execute on this machine is the server admission's call.
   */
  isWorkspaceAgent?: boolean;
  /**
   * Explicit override that wins over automatic selection.
   *
   * Used by sub-agent dispatches (`directMentionRoute`, `callAgent`) so child
   * operations inherit the parent operation's runtime instead of re-running
   * the global decision — a sub-agent spawned inside a Gateway run should
   * stay on Gateway, even if its own agent config would say otherwise.
   * A stale/forced `'hetero'` is coerced to `'gateway'` rather than passed
   * through: inheriting "run it the same way" from a device-side hetero
   * parent means unified admission, never the retired renderer IPC spawn.
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
 * resume, continue, sub-agent dispatch, cancel, reconnect …) so adding a new
 * entry point does not require re-deriving the routing rules.
 *
 * Priority: `parentRuntime` > `gateway` > `client`. Every heterogeneous
 * provider — local CLI and remote platform alike — routes to `gateway` so the
 * server's unified admission owns authorization and lifecycle (FIX-C: the
 * renderer IPC `hetero` spawn that bypassed admission for workspace agents
 * and socket-down desktops is removed, not gated). A refusal is a typed
 * blocked result from the server, never a transport downgrade to local IPC.
 */
export const selectRuntimeType = (
  ctx: RuntimeSelectionContext,
  { isDesktop = defaultIsDesktop }: SelectRuntimeTypeOptions = {},
): AgentRuntimeType => {
  if (ctx.heterogeneousProvider?.authMode === 'api') {
    // Personal-scope invariant: Desktop main resolves the binding's providerId
    // with NO workspace header (see `providerBindingPort`), while a workspace
    // agent's binding was configured against workspace-scoped providers. The
    // author (or an explicitly overriding member) CAN execute a workspace
    // agent on their own machine — `workspaceScoped` alone does not block
    // them — so a colliding personal provider id (e.g. builtin `anthropic`)
    // would silently supply different credentials. Reject before any spawn.
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

  // `parentRuntime === 'hetero'` is a stale marker, not a transport to
  // re-enter: the parent ran on a device through server admission, so the
  // child inherits `gateway` — the same admission decision — rather than
  // resurrecting the removed renderer IPC spawn.
  if (ctx.parentRuntime) return ctx.parentRuntime === 'hetero' ? 'gateway' : ctx.parentRuntime;
  // Notify-based platform agents (openclaw / hermes) use the gateway transport for both
  // targets: `local` presets this desktop's personal device ID on the request, while
  // `device` dispatches to the configured remote device. They do not implement the
  // JSONL/session protocol consumed by the in-process `hetero` transport.
  if (ctx.heterogeneousProvider && isRemoteHeterogeneousType(ctx.heterogeneousProvider.type)) {
    return 'gateway';
  }
  // Local CLI hetero (Amp / Claude Code / Codex) — every resolved target
  // routes through Gateway. For `local` on a desktop the server dispatches the
  // run back onto this very machine via `agent_run_request` →
  // `orvilo hetero exec` → heteroIngest — the same admission/ledger lifecycle
  // every other surface uses, so web observes the desktop-local run
  // identically and the desktop main spawns only under a verified execution
  // identity (device authorization + run generation fence). When this
  // machine's device socket is down, admission cannot reach it and the run
  // surfaces as a typed blocked/unknown result — never a silent IPC spawn.
  // Workspace agents get the same treatment: whether a member's personal
  // desktop may execute a workspace run is an authorization question the
  // server answers (enrollment/grant surfaced through the blocked result),
  // not something the client pre-decides by spawning privately.
  if (ctx.heterogeneousProvider) return 'gateway';
  if (ctx.isGatewayMode) return 'gateway';
  return 'client';
};
