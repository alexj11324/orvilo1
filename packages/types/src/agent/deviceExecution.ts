/**
 * Device-execution contract — the shared resolution surface every entry point
 * (normal chat, task/Issue execution, automation, sub-tasks, resume) consumes.
 * Normative source: docs/development/device-execution-contract.md.
 *
 * The contract fixes three dimensions separately: Harness (agent loop —
 * fixed Prime for the builtin agent, external for Claude Code / Codex),
 * Model (inference route — a user setting), and Device (the machine the
 * harness actually runs on — always resolved to a real device, never an
 * implicit backend).
 */

import type { HeterogeneousAgentType } from './heterogeneousAgent';

// ─── Run subject ────────────────────────────────────────────────────────────

/**
 * What a run executes for. Chat and task subjects are explicitly distinct:
 * a conversation run is keyed by its topic, a task run by its task +
 * dispatch. Placeholder identities must never leak into task authorization
 * or device leases — a conversation subject carries no `taskId`.
 */
export type RunSubject =
  { kind: 'conversation'; topicId: string } | { dispatchId: string; kind: 'task'; taskId: string };

// ─── Dispatch execution identity ────────────────────────────────────────────

/**
 * The canonical execution identity persisted on the operation row as
 * `metadata.executionPlan` before any spawn (FIX-A / plan §5.3): every
 * surface — web observing a desktop-started run, cancel, status, resume —
 * addresses the SAME operation/device/generation instead of re-deriving a
 * device or guessing a harness. `harnessId` records the adapter the run was
 * resolved onto (evidence, not a configurable setting); `executionGeneration`
 * is the fence stale callbacks must not overwrite.
 */
export interface DispatchExecutionIdentity {
  agentId: string;
  /** The admitted execution host; absent only on embedded/sandbox channels. */
  deviceId?: string;
  executionGeneration: number;
  harnessId: HarnessAdapterId;
  modelRoute?: { model?: string; provider?: string };
  operationId: string;
  /**
   * How the execution host was admitted (resolution provenance). `blocked`
   * appears only on the in-memory plan before dispatch — a persisted
   * admission identity is always a channel.
   */
  resolution?: {
    kind: 'blocked' | 'device' | 'embedded' | 'sandbox';
    reason?: DeviceResolutionReason;
  };
  /**
   * A {@link RunSubject} with `dispatchId` optional — automation dispatches
   * minted before the registry record carry taskId only. Conversation
   * subjects still carry no task identity at all.
   */
  subject:
    | { kind: 'conversation'; topicId: string }
    | { dispatchId?: string; kind: 'task'; taskId: string };
  /** The working-directory binding the run launches inside, when scoped. */
  workingDirectoryBinding?: string;
}

// ─── Harness adapter map ────────────────────────────────────────────────────

/**
 * The fixed agent-type → harness-adapter map (`type → adapter` — there is no
 * `harness` field to contradict it). The builtin Orvilo agent is always
 * `'prime'`; external CLI agents map to their own families.
 */
export type HarnessAdapterId = 'claude-code' | 'codex' | 'prime' | (string & {});

export const HARNESS_ADAPTER_BY_AGENT_TYPE: Record<string, HarnessAdapterId> = {
  'claude-code': 'claude-code',
  'codex': 'codex',
  'orvilo': 'prime',
};

/** The adapter a device picks for a declared agent type. Fixed, never configured. */
export const resolveHarnessAdapter = (type: HeterogeneousAgentType | string): HarnessAdapterId =>
  HARNESS_ADAPTER_BY_AGENT_TYPE[type] ?? type;

// ─── Device candidate sets ──────────────────────────────────────────────────

/**
 * A device as seen by execution resolution. `selectable` and `runnable` are
 * deliberately separate: an offline device stays a *candidate* (the user
 * still owns it and may select it — it just cannot start right now), while
 * runnable is the subset that can launch immediately.
 */
export interface DeviceCandidate {
  /** Whether the adapter map + reported capabilities can run this agent. */
  capabilityOk: boolean;
  deviceId: string;
  /** Unified list entry — the local machine carries a stable deviceId and is flagged, not duplicated. */
  isLocalMachine: boolean;
  /** Online and can start a run now (`runnableDevices` membership). */
  online: boolean;
  /** Scope is legal for this execution context (personal vs workspace). */
  scopeOk: boolean;
  /** Agent-protocol / artifact version on the device is compatible. */
  versionOk: boolean;
}

/** `selectableDevices` — execution authorization + legal scope + capability + version. */
export const isSelectableDevice = (device: DeviceCandidate): boolean =>
  device.scopeOk && device.capabilityOk && device.versionOk;

/** `runnableDevices` — the selectable subset that is online and can start. */
export const isRunnableDevice = (device: DeviceCandidate): boolean =>
  isSelectableDevice(device) && device.online;

// ─── Resolution errors ─────────────────────────────────────────────────────

/**
 * Blocking outcomes. These are the ONLY "no device" answers — there is no
 * managed-Prime / implicit-sandbox / automatic-server fallback.
 */
export type DeviceResolutionErrorCode =
  /** Bound device was deleted, revoked, or became incompatible — never auto-rebound. */
  | 'DEVICE_BINDING_INVALID'
  /**
   * The device inventory query has not settled (loading, failed, or partially
   * paged). An incomplete inventory is never read as 0 or 1 candidates, and
   * never auto-binds — resolution waits for an authoritative candidate set.
   */
  | 'DEVICE_INVENTORY_INCOMPLETE'
  /**
   * The request explicitly named a device that is not in the principal's
   * authorized candidate set. Rejected outright — never silently swapped for
   * an available default.
   */
  | 'DEVICE_REQUEST_UNAUTHORIZED'
  /** Zero legitimate candidates. */
  | 'DEVICE_REQUIRED'
  /** Multiple candidates and no applicable default — the user must choose. */
  | 'DEVICE_SELECTION_REQUIRED';

export interface DeviceResolutionBlocked {
  code: DeviceResolutionErrorCode;
  /** When DEVICE_BINDING_INVALID: the candidates an explicit repair may pick. */
  repairCandidates?: string[];
  status: 'blocked';
}

export interface DeviceResolutionResolved {
  deviceId: string;
  reason: DeviceResolutionReason;
  status: 'resolved';
}

export type DeviceResolution = DeviceResolutionBlocked | DeviceResolutionResolved;

/** Why the resolved device won — the contract's priority chain, in order. */
export type DeviceResolutionReason =
  | 'agent_default'
  | 'explicit_request'
  | 'session_bound'
  | 'single_candidate'
  | 'user_agent_preference';

export interface ResolveExecutionDeviceInput {
  /** Workspace/agent shared default (admins set it; members may not override when policy-fixed). */
  agentDefaultDeviceId?: string;
  /**
   * The candidate inventory behind `candidates` is authoritative. Pass `false`
   * while the device list is still loading, failed, or partially paged — an
   * incomplete inventory resolves to `DEVICE_INVENTORY_INCOMPLETE`, never to a
   * guessed 0/1 answer and never to an auto-bind. Defaults to `true`: the
   * server-side admission path always has an authoritative set.
   */
  deviceInventoryComplete?: boolean;
  /** Request-supplied device — honored only when `explicitRequestAllowed`. */
  explicitDeviceId?: string;
  /**
   * Policy (e.g. `executionTargetSelectionPolicy !== 'fixed'`) permits member
   * choice. When `false`, BOTH explicit requests and member preferences are
   * skipped — a pinned policy cannot be overridden through either door.
   */
  explicitRequestAllowed?: boolean;
  /**
   * The device this execution session is already bound to. A valid binding
   * always wins; an invalid one blocks with `DEVICE_BINDING_INVALID` — it is
   * never quietly re-resolved onto another device, and an explicit request in
   * the same call is a repair proposal, not a normal resume.
   */
  sessionBoundDeviceId?: string;
  /** The user's personal preference for this agent (`agentDeviceOverrides`). */
  userAgentPreferenceDeviceId?: string;
}

/**
 * Unified device resolution — the contract's priority chain, in order:
 *   0. an incomplete inventory blocks first (never read as 0/1 candidates),
 *   1. session-bound device (invalid binding blocks: DEVICE_BINDING_INVALID),
 *   2. explicit request (policy permitting; unauthorized: DEVICE_REQUEST_UNAUTHORIZED),
 *   3. the user's per-agent device preference (skipped when policy is pinned),
 *   4. agent/workspace default,
 *   5. the single legitimate candidate,
 *   6. otherwise DEVICE_REQUIRED / DEVICE_SELECTION_REQUIRED.
 *
 * "Current desktop", "first online device" and "array item zero" are never
 * unconditional defaults. An existing-but-invalid binding resolves to
 * DEVICE_BINDING_INVALID (explicit repair), never a silent re-bind.
 */
export const resolveExecutionDevice = (
  input: ResolveExecutionDeviceInput,
  candidates: readonly DeviceCandidate[],
): DeviceResolution => {
  // 0. The inventory must be authoritative before any 0/1/N judgment or
  //    auto-bind. Loading / failed / partial-paging is never "zero devices".
  if (input.deviceInventoryComplete === false)
    return { code: 'DEVICE_INVENTORY_INCOMPLETE', status: 'blocked' };

  const selectable = candidates.filter(isSelectableDevice);
  const selectableIds = new Set(selectable.map((device) => device.deviceId));

  const pick = (deviceId: string | undefined, reason: DeviceResolutionReason) =>
    deviceId && selectableIds.has(deviceId)
      ? ({ deviceId, reason, status: 'resolved' } as const)
      : undefined;

  // 1. A session-bound device wins while still legitimate. An invalid binding
  //    (deleted / revoked / incompatible) blocks outright: it is repaired by an
  //    explicit authorized action, never silently re-bound by falling through
  //    to defaults — even when the request also carries an explicit device.
  if (input.sessionBoundDeviceId !== undefined) {
    const bound = pick(input.sessionBoundDeviceId, 'session_bound');
    if (bound) return bound;
    return {
      code: 'DEVICE_BINDING_INVALID',
      repairCandidates: selectable.map((device) => device.deviceId),
      status: 'blocked',
    };
  }

  const policyAllowsChoice = input.explicitRequestAllowed !== false;

  // 2. An explicit request is honored only when it names an authorized
  //    candidate; an unauthorized pick is rejected, not silently replaced by
  //    an available default.
  if (policyAllowsChoice && input.explicitDeviceId) {
    const explicit = pick(input.explicitDeviceId, 'explicit_request');
    if (explicit) return explicit;
    return { code: 'DEVICE_REQUEST_UNAUTHORIZED', status: 'blocked' };
  }

  // 3. The user's own preference for this agent (member overrides ride here).
  //    A pinned policy skips this door too — members cannot override a fixed
  //    workspace default through their personal preference.
  if (policyAllowsChoice) {
    const preference = pick(input.userAgentPreferenceDeviceId, 'user_agent_preference');
    if (preference) return preference;
  }

  // 4. Agent/workspace default.
  const agentDefault = pick(input.agentDefaultDeviceId, 'agent_default');
  if (agentDefault) return agentDefault;

  // 5. A never-bound (or cleared) context may auto-resolve to exactly one
  //    candidate — auto-binding is conditional, never a silent re-bind.
  if (selectable.length === 1)
    return { deviceId: selectable[0].deviceId, reason: 'single_candidate', status: 'resolved' };

  // 6. Nothing resolved.
  if (selectable.length === 0) return { code: 'DEVICE_REQUIRED', status: 'blocked' };
  return { code: 'DEVICE_SELECTION_REQUIRED', status: 'blocked' };
};

/**
 * Whether a persisted `boundDeviceId` that no longer resolves is an invalid
 * binding (explicit repair) rather than "never bound" (auto-resolve). A
 * stale binding never silently re-binds.
 *
 * Thin predicate for UI repair surfaces. The authoritative enforcement lives
 * inside {@link resolveExecutionDevice} itself (step 1) — callers must not
 * resolve around it by hand.
 */
export const isDeviceBindingInvalid = (
  boundDeviceId: string | undefined,
  candidates: readonly DeviceCandidate[],
): boundDeviceId is string =>
  !!boundDeviceId &&
  !candidates.some((device) => isSelectableDevice(device) && device.deviceId === boundDeviceId);

// ─── Selector visibility ────────────────────────────────────────────────────

export interface ShowDeviceSelectorInput {
  /** The principal may change the device (not policy-fixed / has permission). */
  canSelectDevice: boolean;
  /** The device inventory query settled — loading/failure is never 0 or 1. */
  deviceInventoryComplete: boolean;
  permissionsLoaded: boolean;
  selectableDeviceCount: number;
}

/**
 * `showDeviceSelector = permissionsLoaded && deviceInventoryComplete &&
 * canSelectDevice && selectableDevices.length > 1`. Hiding the picker never
 * unbinds the device.
 */
export const shouldShowDeviceSelector = (input: ShowDeviceSelectorInput): boolean =>
  input.permissionsLoaded &&
  input.deviceInventoryComplete &&
  input.canSelectDevice &&
  input.selectableDeviceCount > 1;
