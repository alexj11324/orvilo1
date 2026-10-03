import { type OrviloDatabase } from '@orvilo/database';
import type {
  AgentDeviceOverride,
  DeviceCandidate,
  DeviceResolutionErrorCode,
  DeviceResolutionReason,
  OrviloAgentAgencyConfig,
  RequestTrigger,
} from '@orvilo/types';
import { resolveExecutionDevice } from '@orvilo/types';
import debug from 'debug';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { DeviceModel } from '@/database/models/device';
import { topics } from '@/database/schemas';
import { resolveExecutionTarget } from '@/helpers/executionTarget';

import { deviceGateway } from './index';
import { filterAuthorizedDevicePresence } from './scopedDevicePresence';

const log = debug('orvilo-server:execution-admission');

/**
 * Unified execution admission — the ONE place an agent run resolves where it
 * executes (see docs/development/device-execution-contract.md + plan §5).
 *
 * The flow splits into two honest steps:
 *
 * 1. `resolveExecutionTarget` answers the STORED intent — 'device' / 'local' /
 *    'sandbox' / 'auto' / 'none' — including the fixed-policy, workspaceScoped,
 *    and bot-trigger coercions. The sandbox and `canUseDevice` exits short
 *    circuit here; they never touch a device so they never consult the
 *    candidate set.
 * 2. For every device-bearing intent, `resolveExecutionDevice` (the ONLY
 *    resolver) answers WHICH device — fed the authorized candidate set plus
 *    the real inputs (session binding, explicit request, member preference,
 *    agent default, inventory completeness). A blocked answer is returned
 *    verbatim: never downgraded to a default, never silently re-bound.
 *
 * The caller (`dispatchHeteroAgent`) consumes exactly this plan — there is no
 * second device pick downstream.
 */

// ─── Candidate inventory ─────────────────────────────────────────────────────

/**
 * The operation a candidate is being judged for. `agent-run` is dispatch —
 * registration as an execution device IS the capability contract and the
 * device-side admission (PrimeRunDescriptor digest+pin) verifies the adapter
 * at launch, so the server verdict is `verified` with `delegated` marked.
 * `device-tool-call` / `device-operation` need per-device evidence — the
 * device must advertise the tool/operation in its live `supportedTools`.
 */
export type AdmissionRequiredOperation =
  | { adapter?: string | null; kind: 'agent-run'; minAdapterVersion?: string }
  | { kind: 'device-tool-call'; toolName: string }
  | { kind: 'device-operation'; operation: string };

/**
 * The caller's grant context. `devicePermissions` is a caller-computed
 * execute/view map (e.g. from a device-grants table): a device granted only
 * 'view' never enters an EXECUTION candidate set at all. `permissionsReady:
 * false` means the grant context could not be evaluated — the inventory
 * reports `permissions-unready`, distinguishable from a failed query and
 * from a genuinely empty set.
 */
export interface AdmissionCandidatePolicy {
  devicePermissions?: Readonly<Record<string, 'execute' | 'view'>>;
  permissionsReady?: boolean;
}

/**
 * `pending` is a real verdict — "we could not verify this" — never recorded
 * as `capabilityOk: true`. Verification is bounded (one probe per candidate,
 * no retry loop); an unverifiable capability stays pending rather than
 * faking readiness.
 */
export type AdmissionVerificationStatus = 'pending' | 'verified' | 'incompatible';

/**
 * The execution-candidate row — the SAME shape the resolver consumes
 * (`DeviceCandidate`) plus the evidence trail: how capability/version were
 * verified, who owns/authorized the row, and which grant rides it. Owner and
 * routing identity ride the candidate — nothing downstream may infer them
 * from `resolution.reason`.
 */
export interface AdmissionDeviceCandidate extends DeviceCandidate {
  /** The real capability verdict behind `capabilityOk`. */
  capabilityStatus: AdmissionVerificationStatus;
  /**
   * The principal + registry the row was authorized under — the device
   * owner in a personal scope, the enrolling member + workspace for a
   * workspace row, the agent owner's registry for a verified stored binding.
   */
  owner: { userId: string; workspaceId: string | null };
  /** The grant this candidate carries — only 'execute' rows ever appear. */
  permission: 'execute';
  requiredOperation?: AdmissionRequiredOperation;
  /** Which authorized source produced the row — registry list vs verified reference. */
  scopeSource: 'referenced' | 'registry' | 'transient';
  verification: {
    /** The adapter family the verdict covers (from the required operation). */
    adapter?: string | null;
    checkedAt: string;
    /**
     * `true` when the verdict rests on the registration contract and the
     * device-side admission check at launch — a connected heartbeat never
     * proves runner availability, so the server delegates the
     * adapter/version proof to the device that actually starts the run.
     */
    delegated?: boolean;
    mode: 'live-probe' | 'registry' | 'none';
    /** e.g. 'gateway:systemInfo' | 'registry:row' */
    source?: string;
  };
  /** The real protocol/version verdict behind `versionOk`. */
  versionStatus: AdmissionVerificationStatus;
}

/**
 * Why the candidate set has the shape it does — `query-error`,
 * `permissions-unready` and `pagination-incomplete` all stay distinguishable
 * from a GENUINELY empty authorized set and from a set the caller never asked
 * for. (`inventoryComplete` is the derived bool the resolver consumes.)
 */
export type DeviceInventoryState =
  | 'complete'
  | 'empty'
  | 'not-requested'
  | 'pagination-incomplete'
  | 'permissions-unready'
  | 'query-failed';

export interface DeviceCandidateInventory {
  candidates: AdmissionDeviceCandidate[];
  /**
   * `false` when the registry query failed — the set is partial and must never
   * be read as 0/1 candidates or auto-bound from.
   */
  inventoryComplete: boolean;
  inventoryState: DeviceInventoryState;
}

/**
 * One bounded capability/version verdict for one device. Registry evidence
 * (the enrollment row) plus optional live-probe evidence (`supportedTools`
 * from `queryDeviceSystemInfo`) — never a fabricated `true`.
 */
const verifyCandidate = (params: {
  deviceId: string;
  /** The operation the candidate must be able to run. */
  requiredOperation?: AdmissionRequiredOperation;
  scopeSource: AdmissionDeviceCandidate['scopeSource'];
  /** Live evidence from a `queryDeviceSystemInfo` probe, when collected. */
  systemInfo?: { supportedTools?: string[] };
  owner: { userId: string; workspaceId: string | null };
  isLocalMachine: boolean;
  online: boolean;
}): AdmissionDeviceCandidate => {
  const { requiredOperation } = params;
  const checkedAt = new Date().toISOString();

  let capabilityStatus: AdmissionVerificationStatus;
  let versionStatus: AdmissionVerificationStatus;
  let verification: AdmissionDeviceCandidate['verification'];

  if (!requiredOperation || requiredOperation.kind === 'agent-run') {
    // Agent-run contract: a registry-authorized (or verified-referenced) row
    // IS the capability evidence — the device enrolled as an execution host
    // and its own admission verifies the adapter/artifact at launch
    // (PrimeRunDescriptor). An explicit minAdapterVersion cannot be proven
    // from any stored signal yet — honest pending, never assumed.
    capabilityStatus = 'verified';
    versionStatus = requiredOperation?.minAdapterVersion ? 'pending' : 'verified';
    verification = {
      adapter: requiredOperation?.adapter ?? undefined,
      checkedAt,
      delegated: true,
      mode: 'registry',
      source: params.scopeSource === 'referenced' ? 'registry:verified-reference' : 'registry:row',
    };
  } else {
    // Tool/operation requirements need real per-device evidence — the live
    // supportedTools probe. Advertised → verified; advertised-and-absent →
    // incompatible; no probe or older client without the field → pending.
    const required =
      requiredOperation.kind === 'device-tool-call'
        ? requiredOperation.toolName
        : requiredOperation.operation;
    const supported = params.systemInfo?.supportedTools;
    if (Array.isArray(supported)) {
      capabilityStatus = supported.includes(required) ? 'verified' : 'incompatible';
      verification = {
        checkedAt,
        mode: 'live-probe',
        source: 'gateway:systemInfo',
      };
    } else {
      capabilityStatus = 'pending';
      verification = {
        checkedAt,
        mode: 'none',
        source: params.systemInfo ? 'gateway:systemInfo (no supportedTools)' : undefined,
      };
    }
    versionStatus = capabilityStatus === 'verified' ? 'verified' : 'pending';
  }

  return {
    capabilityOk: capabilityStatus === 'verified',
    capabilityStatus,
    deviceId: params.deviceId,
    isLocalMachine: params.isLocalMachine,
    online: params.online,
    owner: params.owner,
    permission: 'execute',
    requiredOperation,
    scopeOk: true,
    scopeSource: params.scopeSource,
    verification,
    versionOk: versionStatus === 'verified',
    versionStatus,
  };
};

/**
 * The authorized execution candidates for this principal + scope, built the
 * same way `getScopedOnlineDevices` builds the settings/picker list: registry
 * rows merged with live gateway presence (workspace scope keeps only rows the
 * registry knows — a gateway-only connection is never executable). Settings,
 * the chat picker and this admission query all run the SAME permission rule,
 * so every surface returns the identical candidate id set — UI grouping may
 * change display order, never membership.
 *
 * Scope IS the authorization: a workspace run only sees that workspace's
 * registered devices, a personal run only the caller's own. Capability and
 * version are no longer assumed — each row carries a real verdict
 * (`capabilityStatus` / `versionStatus` + `verification` evidence). For
 * `agent-run` the registry contract verifies, delegated to device-side
 * admission at launch; a tool/operation requirement probes live
 * `supportedTools` once per candidate — unknown is `pending`, never `true`,
 * and never `runnable`.
 */
export const listAuthorizedDeviceCandidates = async (
  serverDB: OrviloDatabase,
  userId: string,
  workspaceId: string | undefined,
  options?: {
    /**
     * The agent owner's user id — the registry where a shared `boundDeviceId`
     * naturally lives (an author binds their own devices to a public agent).
     */
    agentOwnerId?: string;
    localDeviceId?: string;
    /** The caller's grant context — see {@link AdmissionCandidatePolicy}. */
    policy?: AdmissionCandidatePolicy;
    /**
     * Live system-info probe used for tool/operation requirements. Defaults to
     * `deviceGateway.queryDeviceSystemInfo` — injectable for tests.
     */
    probeSystemInfo?: (deviceId: string) => Promise<{ supportedTools?: string[] } | undefined>;
    /**
     * Devices the resolution inputs name (stored binding, session pin, member
     * pick, request, caller's own machine). A referenced id that is not in the
     * scoped registry list is verified individually — caller's personal
     * registry, the run's workspace registry, and (for stored bindings only)
     * the agent owner's registry. A referenced device that verifies nowhere is
     * NOT a candidate — the resolver blocks it honestly instead of trusting a
     * stale reference.
     */
    referencedDevices?: ReadonlyArray<{
      deviceId?: string | null;
      /** Also probe the agent owner's personal registry (stored bindings). */
      ownerRegistry?: boolean;
    }>;
    /** What the candidate set must be able to run — see {@link AdmissionRequiredOperation}. */
    requiredOperation?: AdmissionRequiredOperation;
  },
): Promise<DeviceCandidateInventory> => {
  const deviceModel = new DeviceModel(serverDB, userId, workspaceId);
  const localDeviceId = options?.localDeviceId;
  const scope: 'personal' | 'workspace' = workspaceId ? 'workspace' : 'personal';
  const requiredOperation = options?.requiredOperation ?? { kind: 'agent-run' };
  const devicePermissions = options?.policy?.devicePermissions;

  // The grant context must be READY before any candidacy is computed — a
  // caller whose permissions failed to load gets 'permissions-unready', not a
  // partial set that accidentally grants execution.
  if (options?.policy && options.policy.permissionsReady === false) {
    return {
      candidates: [],
      inventoryComplete: false,
      inventoryState: 'permissions-unready',
    };
  }

  let inventoryComplete = true;
  const [rows, online] = await Promise.all([
    (workspaceId ? deviceModel.queryWorkspaceDevices() : deviceModel.queryPersonal()).catch(
      (error) => {
        // The registry is authoritative for candidacy. A failed read is an
        // INCOMPLETE inventory — never "zero devices" — so resolution blocks
        // instead of auto-binding from a partial set.
        inventoryComplete = false;
        log('device registry lookup failed (scope=%s); inventory incomplete: %O', scope, error);
        return [] as Awaited<ReturnType<typeof deviceModel.queryPersonal>>;
      },
    ),
    // The gateway only answers liveness; a failed/empty list marks devices
    // offline but does not shrink candidacy (offline devices stay selectable —
    // dispatch then fails honestly at the gateway).
    deviceGateway.queryDeviceList(userId, workspaceId),
  ]);
  if (!inventoryComplete)
    return { candidates: [], inventoryComplete, inventoryState: 'query-failed' };

  // A device granted only 'view' never enters an EXECUTION candidate set —
  // the grant is membership, not a flag the resolver might skip.
  const executableRows = devicePermissions
    ? rows.filter((row) => devicePermissions[row.deviceId] !== 'view')
    : rows;

  // One bounded probe per ONLINE candidate, only when the required operation
  // needs live evidence. Probe budget is capped — beyond it a device is
  // 'pending', never assumed ready.
  const probeNeeded = requiredOperation.kind !== 'agent-run';
  const probeSystemInfo =
    options?.probeSystemInfo ??
    ((deviceId: string) => deviceGateway.queryDeviceSystemInfo(userId, deviceId, workspaceId));
  const PROBE_BUDGET = 8;
  const probedInfo = new Map<string, { supportedTools?: string[] } | undefined>();

  const registeredDeviceIds = new Set(executableRows.map((device) => device.deviceId));
  const authorizedOnline = filterAuthorizedDevicePresence(registeredDeviceIds, online, scope);
  const liveById = new Map(authorizedOnline.map((d) => [d.deviceId, d]));
  if (probeNeeded) {
    const toProbe = authorizedOnline.slice(0, PROBE_BUDGET).map((d) => d.deviceId);
    await Promise.all(
      toProbe.map(async (deviceId) => {
        probedInfo.set(deviceId, await probeSystemInfo(deviceId).catch(() => undefined));
      }),
    );
  }

  const seen = new Set<string>();
  const fromDb = executableRows.map((row): AdmissionDeviceCandidate => {
    seen.add(row.deviceId);
    const live = liveById.get(row.deviceId);
    return verifyCandidate({
      deviceId: row.deviceId,
      isLocalMachine: row.deviceId === localDeviceId,
      online: !!live,
      owner: { userId: row.userId, workspaceId: row.workspaceId ?? null },
      requiredOperation,
      scopeSource: 'registry',
      systemInfo: probedInfo.get(row.deviceId),
    });
  });
  // Personal clients register immediately before opening their socket, but a
  // short race can still expose the live connection first — keep the same
  // gateway-transient compatibility window `getScopedOnlineDevices` allows
  // (personal scope only; workspace rows ARE the authorization). A transient
  // row under a 'view' grant stays excluded — presence is not a grant.
  const transient = authorizedOnline
    .filter((d) => !seen.has(d.deviceId) && devicePermissions?.[d.deviceId] !== 'view')
    .map((d): AdmissionDeviceCandidate =>
      verifyCandidate({
        deviceId: d.deviceId,
        isLocalMachine: d.deviceId === localDeviceId,
        online: true,
        owner: { userId, workspaceId: workspaceId ?? null },
        requiredOperation,
        scopeSource: 'transient',
        systemInfo: probedInfo.get(d.deviceId),
      }),
    );
  const candidates = [...fromDb, ...transient];
  for (const device of candidates) seen.add(device.deviceId);

  // Referenced-device verification: a stored binding, session pin or caller
  // reference may name a device outside the scoped list — an author's personal
  // device bound to a public workspace agent, or the caller's own desktop on a
  // `local` run. It joins the candidate set only when a registry lookup
  // confirms it exists (the same find-by-id calls dispatch itself trusts); an
  // unverifiable reference stays unauthorized.
  const ownerModel =
    options?.agentOwnerId && options.agentOwnerId !== userId
      ? new DeviceModel(serverDB, options.agentOwnerId)
      : undefined;
  for (const ref of options?.referencedDevices ?? []) {
    if (!ref?.deviceId || seen.has(ref.deviceId)) continue;
    // A 'view'-granted reference never enters the execution set either.
    if (devicePermissions?.[ref.deviceId] === 'view') continue;
    try {
      const verifiedRow =
        (await deviceModel.findByDeviceId(ref.deviceId)) ??
        (workspaceId ? await deviceModel.findWorkspaceDeviceById(ref.deviceId) : undefined) ??
        (ref.ownerRegistry && ownerModel
          ? await ownerModel.findByDeviceId(ref.deviceId)
          : undefined);
      if (!verifiedRow) continue;
      seen.add(ref.deviceId);
      const isOnline = !!liveById.get(ref.deviceId);
      // Probe a referenced device that needs live evidence and is online.
      if (probeNeeded && isOnline && !probedInfo.has(ref.deviceId)) {
        probedInfo.set(ref.deviceId, await probeSystemInfo(ref.deviceId).catch(() => undefined));
      }
      candidates.push(
        verifyCandidate({
          deviceId: ref.deviceId,
          isLocalMachine: ref.deviceId === localDeviceId,
          online: isOnline,
          owner: { userId: verifiedRow.userId, workspaceId: verifiedRow.workspaceId ?? null },
          requiredOperation,
          scopeSource: 'referenced',
          systemInfo: probedInfo.get(ref.deviceId),
        }),
      );
    } catch (err) {
      // A failed probe only skips THIS reference — it never shrinks the set
      // built from the authoritative list (that failure is inventoryComplete).
      log('referenced device probe failed id=%s: %O', ref.deviceId, err);
    }
  }

  return {
    candidates,
    inventoryComplete,
    inventoryState: candidates.length === 0 ? 'empty' : 'complete',
  };
};

// ─── Unified admission ───────────────────────────────────────────────────────

/**
 * Outcomes the executor branch must handle. `device` carries the admitted
 * host; `sandbox` is an explicit/sanctioned cloud exit; `blocked` is terminal
 * for THIS run — the caller finalizes with the code's honest detail instead
 * of a generic "no bound device".
 */
export type HeteroExecutionPlan =
  | {
      candidate: AdmissionDeviceCandidate;
      deviceId: string;
      kind: 'device';
      reason: DeviceResolutionReason;
    }
  | {
      code: DeviceResolutionErrorCode | 'DEVICE_ACCESS_DENIED' | 'EXECUTION_TARGET_NONE';
      detail: string;
      kind: 'blocked';
      repairCandidates?: string[];
    }
  | { kind: 'sandbox' };

export interface ResolveHeteroExecutionPlanParams {
  /**
   * The merged agency config for THIS run — already carries the topic pin
   * (executionConfig) and the caller's member override via
   * `resolveAgentAgencyConfig`. Member-shadowing is applied below: when a
   * member override resolved, the shared-row default is never consulted.
   */
  agencyConfig?: OrviloAgentAgencyConfig;
  /**
   * The agent owner's user id — stored bindings verify against THEIR
   * personal registry (an author's own device bound to a public workspace
   * agent stays executable by every authorized member).
   */
  agentOwnerId?: string;
  /**
   * External senders (bot/IM/task surfaces without device grants) pass false —
   * they degrade to the sandbox when available and are denied otherwise.
   */
  canUseDevice: boolean;
  /**
   * The raw per-request device id the caller sent (e.g. the `deviceId`
   * execAgent param). NOT the topic pin — the pin is `sessionBoundDeviceId`.
   */
  explicitDeviceId?: string;
  /** Remote notify-based families (openclaw/hermes) never consume a stale bound id for `local`. */
  isPlatformTask: boolean;
  /**
   * The requesting client's own registered deviceId — the "this machine" a
   * stored `local` target (and a member's own `local` override) resolves to.
   */
  localDeviceId?: string;
  /** The caller's resolved `agentDeviceOverrides[agentId]` — undefined when absent. */
  memberDeviceOverride?: AgentDeviceOverride | null;
  /**
   * The caller's grant context for candidate construction — view-only
   * grants never enter the execution set; an unready grant context makes
   * the whole inventory 'permissions-unready' (never an accidental set).
   */
  policy?: AdmissionCandidatePolicy;
  requestTrigger?: RequestTrigger;
  /**
   * The operation the run needs — defaults to `{kind:'agent-run'}`: the
   * registry contract verifies, adapter/version delegated to device-side
   * admission at launch. A tool/operation requirement probes each online
   * candidate's advertised `supportedTools`.
   */
  requiredOperation?: AdmissionRequiredOperation;
  /**
   * Whether this agent family may execute in the cloud sandbox at all
   * (`supportsCloudHeterogeneousSandbox` for local CLI kinds).
   */
  sandboxExecutionAvailable: boolean;
  /**
   * The creator granted `orvilo-cloud-sandbox` on an agent-share visitor run —
   * the only surface where `canUseDevice === false` may still execute.
   */
  sandboxFallback?: boolean;
  /**
   * The conversation's durable device pin — `topic.metadata.executionConfig
   * .boundDeviceId` (`turn.topicBoundDeviceId`). This is the session binding
   * the resolver consults FIRST; an invalid pin blocks, an explicit request
   * in the same call is a repair proposal, not a takeover.
   */
  sessionBoundDeviceId?: string | null;
  userId: string;
  workspaceId?: string;
  /** Shared-row coercion — a member without their own override never executes the shared config. */
  workspaceScoped: boolean;
}

export const resolveHeteroExecutionPlan = async (
  serverDB: OrviloDatabase,
  params: ResolveHeteroExecutionPlanParams,
): Promise<HeteroExecutionPlan> => {
  const { agencyConfig } = params;
  const isFixedPolicy = agencyConfig?.executionTargetSelectionPolicy === 'fixed';
  // The server IS the execution host resolver: a device-gateway dispatch IS
  // "local execution" for target resolution — `clientExecutionAvailable`
  // here means "the gateway can reach a machine", not "the sender is a
  // desktop" (the old platformPlan passed `Boolean(localDeviceId)`, which let
  // the same stored target resolve differently by sending surface).
  const target = resolveExecutionTarget(agencyConfig, {
    clientExecutionAvailable: true,
    isHetero: true,
    sandboxExecutionAvailable: params.sandboxExecutionAvailable,
    trigger: params.requestTrigger,
    workspaceScoped: params.workspaceScoped,
  });

  // An explicit request counts toward device intent ONLY when the run allows
  // member-initiated requests (mirroring the legacy fixed-policy strip): a
  // disallowed request is ignored, never a silent override and never an error
  // — the resolver gates it the same way below.
  const explicitRequestAllowed = !isFixedPolicy && !params.workspaceScoped;
  const effectiveExplicitDeviceId = explicitRequestAllowed ? params.explicitDeviceId : undefined;
  const wantsDevice =
    !!effectiveExplicitDeviceId || target === 'device' || target === 'local' || target === 'auto';

  if (!wantsDevice || !params.canUseDevice) {
    if (target === 'sandbox') return { kind: 'sandbox' };
    if (!params.canUseDevice) {
      // Device access denied: the only surfaces a denied sender may still
      // reach are the explicit sandbox grant (share visitors) or a
      // sandbox-capable family — never a device, never the viewing client's
      // machine.
      if (params.sandboxExecutionAvailable || params.sandboxFallback) return { kind: 'sandbox' };
      return {
        code: 'DEVICE_ACCESS_DENIED',
        detail: 'This sender is not allowed to run agents on a bound device.',
        kind: 'blocked',
      };
    }
    // Stored 'none' is an explicit opt-out — the run stays pending until the
    // user picks a device or sandbox; it never auto-binds. An UNSET target
    // still consults the candidate set below: a session pin IS selection
    // history (the second message needn't re-send a deviceId), and with no
    // pin the 0/1/N rules answer honestly — blocking here would strand a
    // bound conversation on EXECUTION_TARGET_NONE forever. Only a STORED
    // intent short-circuits; a shared/pinned scope never auto-binds off the
    // shared row either way.
    const hasStoredIntent = agencyConfig?.executionTarget !== undefined;
    if (hasStoredIntent || params.workspaceScoped || isFixedPolicy) {
      return {
        code: 'EXECUTION_TARGET_NONE',
        detail: 'No execution target is selected for this agent — pick a device or cloud sandbox.',
        kind: 'blocked',
      };
    }
  }

  const { candidates, inventoryComplete } = await listAuthorizedDeviceCandidates(
    serverDB,
    params.userId,
    params.workspaceId,
    {
      agentOwnerId: params.agentOwnerId,
      localDeviceId: params.localDeviceId,
      policy: params.policy,
      requiredOperation: params.requiredOperation ?? { kind: 'agent-run' },
      referencedDevices: [
        // Stored bindings resolve in the owner's registry — the agent's
        // configured host is a prior authorization act.
        { deviceId: agencyConfig?.boundDeviceId, ownerRegistry: true },
        { deviceId: params.sessionBoundDeviceId, ownerRegistry: true },
        { deviceId: params.memberDeviceOverride?.boundDeviceId, ownerRegistry: true },
        // The caller's own machine and their explicit request verify only
        // against the caller's + workspace registries — a member cannot
        // request the author's personal device by id.
        { deviceId: params.localDeviceId },
        { deviceId: effectiveExplicitDeviceId },
      ],
    },
  );

  // A member override that resolved (executionTarget set) fully shadows the
  // shared default — a member's `local` pick must not fall back to the shared
  // `device` binding when the member has no desktop attached. Under a pinned
  // policy the member override never resolves (only admins can pick), so it
  // cannot shadow the pinned default either.
  const memberPicked = !isFixedPolicy && params.memberDeviceOverride?.executionTarget !== undefined;
  const memberTarget = params.memberDeviceOverride?.executionTarget;
  const userAgentPreferenceDeviceId = memberPicked
    ? memberTarget === 'local'
      ? params.localDeviceId
      : memberTarget === 'device'
        ? params.memberDeviceOverride?.boundDeviceId
        : undefined
    : undefined;

  // 'local' names the requester's own machine (localDeviceId). A PINNED
  // policy resolves the pinned `boundDeviceId` instead — the caller's machine
  // is not a sanctioned stand-in for a fixed contract. Off-desktop
  // (bot/web call) the stored boundDeviceId is the durable stand-in — the
  // picker stamps the chosen desktop's id there — EXCEPT for platform task
  // families (openclaw/hermes), where a stale bound id must not hijack a
  // `local` intent.
  const agentDefaultDeviceId = memberPicked
    ? undefined
    : target === 'device'
      ? agencyConfig?.boundDeviceId
      : target === 'local'
        ? isFixedPolicy
          ? agencyConfig?.boundDeviceId
          : params.localDeviceId ||
            (params.isPlatformTask ? undefined : agencyConfig?.boundDeviceId)
        : undefined;

  // A session pin is the conversation's device — `auto` only decides for a
  // session that has NO binding yet. It never re-picks mid-conversation and
  // never silently moves a bound run; an invalid pin still blocks below as
  // DEVICE_BINDING_INVALID rather than erasing the evidence.
  const sessionBoundDeviceId = params.sessionBoundDeviceId ?? undefined;

  const resolution = resolveExecutionDevice(
    {
      agentDefaultDeviceId,
      deviceInventoryComplete: inventoryComplete,
      explicitDeviceId: params.explicitDeviceId,
      explicitRequestAllowed: !isFixedPolicy && !params.workspaceScoped,
      sessionBoundDeviceId,
      userAgentPreferenceDeviceId,
    },
    candidates,
  );

  if (resolution.status === 'resolved') {
    const candidate = candidates.find((d) => d.deviceId === resolution.deviceId);
    return {
      // Resolver only returns selectable ids — the lookup cannot miss; guard
      // anyway so a future contract change never reads undefined. The
      // fallback row still reports the honest pending verdict — never a
      // fabricated verified.
      candidate: candidate ?? {
        capabilityOk: false,
        capabilityStatus: 'pending',
        deviceId: resolution.deviceId,
        isLocalMachine: resolution.deviceId === params.localDeviceId,
        online: false,
        owner: { userId: params.userId, workspaceId: params.workspaceId ?? null },
        permission: 'execute',
        scopeOk: true,
        scopeSource: 'registry',
        verification: { checkedAt: new Date().toISOString(), mode: 'none' },
        versionOk: false,
        versionStatus: 'pending',
      },
      deviceId: resolution.deviceId,
      kind: 'device',
      reason: resolution.reason,
    };
  }

  return {
    code: resolution.code,
    detail:
      resolution.code === 'DEVICE_BINDING_INVALID'
        ? 'The device this conversation is bound to is no longer authorized or registered — repair the binding with an explicit device selection.'
        : resolution.code === 'DEVICE_REQUEST_UNAUTHORIZED'
          ? 'The requested device is not in the authorized device set for this run.'
          : resolution.code === 'DEVICE_INVENTORY_INCOMPLETE'
            ? 'The device inventory could not be loaded — no device was bound or picked.'
            : resolution.code === 'DEVICE_SELECTION_REQUIRED'
              ? 'Multiple devices are authorized — pick one in the Execution Device switcher.'
              : 'No device is bound or available for this agent.',
    kind: 'blocked',
    ...(resolution.repairCandidates ? { repairCandidates: resolution.repairCandidates } : {}),
  };
};

// ─── Conditional first-bind ──────────────────────────────────────────────────

/**
 * The persisted device binding after the atomic first-bind attempt.
 */
export interface TopicDeviceBindResult {
  /** The binding now persisted — the winner's, which may differ from the request. */
  boundDeviceId: string;
  /** `bound`: this call installed the pin. `occupied`: the CAS lost — the
   * returned id is the pre-existing winner's (adopt it or refuse, never overwrite). */
  outcome: 'bound' | 'occupied';
}

/**
 * Atomic conditional first-bind (plan §5.1/§5.2): when unified admission
 * resolves to the ONLY legitimate candidate (`single_candidate`), the server
 * writes that device into the conversation — but ONLY if no binding exists
 * yet, and the binding it writes is the CANONICAL one:
 * `executionConfig.boundDeviceId` + `executionConfig.executionTarget='device'`
 * plus the legacy top-level `metadata.boundDeviceId` mirror (scheduled
 * dispatch still reads it). One UPDATE installs all three so they can never
 * diverge; the `WHERE` clause makes it a real CAS — two concurrent
 * first-binds cannot overwrite each other, and a binding already set by the
 * picker (or an earlier run) is never clobbered.
 *
 * Returns the binding actually persisted — on a CAS loss the winner's pin is
 * re-read and returned, so the caller compares instead of assuming. A
 * write or re-read failure THROWS: persisting the run's device identity is
 * part of admission, not an optional audit — a caller that cannot persist
 * must not spawn.
 */
export const bindTopicDeviceAtomically = async (
  serverDB: OrviloDatabase,
  params: {
    deviceId: string;
    topicId: string;
    userId: string;
    workspaceId?: string;
  },
): Promise<TopicDeviceBindResult> => {
  const updated = await serverDB
    .update(topics)
    .set({
      metadata: sql`
        coalesce(${topics.metadata}, '{}'::jsonb)
        || jsonb_build_object(
          'boundDeviceId', to_jsonb(${params.deviceId}::text),
          'executionConfig',
            coalesce(${topics.metadata} -> 'executionConfig', '{}'::jsonb)
            || jsonb_build_object(
              'boundDeviceId', to_jsonb(${params.deviceId}::text),
              'executionTarget', to_jsonb('device'::text)
            )
        )`,
    })
    .where(
      and(
        eq(topics.id, params.topicId),
        eq(topics.userId, params.userId),
        params.workspaceId
          ? eq(topics.workspaceId, params.workspaceId)
          : isNull(topics.workspaceId),
        // CAS guard: both the top-level legacy pin and the executionConfig
        // pin must currently be empty, or the write is dropped.
        sql`coalesce(${topics.metadata} -> 'executionConfig' ->> 'boundDeviceId', '') = ''`,
        sql`coalesce(${topics.metadata} ->> 'boundDeviceId', '') = ''`,
      ),
    )
    .returning({
      boundDeviceId: sql<string>`${topics.metadata} -> 'executionConfig' ->> 'boundDeviceId'`,
    });
  if (updated.length > 0) {
    return { boundDeviceId: updated[0].boundDeviceId, outcome: 'bound' };
  }

  // CAS lost — re-read the winner. Another writer (the picker, a concurrent
  // run) persisted a pin first; its value is the truth this run must adopt
  // or refuse — never overwrite. A row that still shows no binding means the
  // guards rejected a malformed topic (wrong owner/workspace or missing
  // row): surface that honestly instead of guessing.
  const rows = await serverDB
    .select({
      boundDeviceId: sql<
        string | undefined
      >`coalesce(${topics.metadata} -> 'executionConfig' ->> 'boundDeviceId', ${topics.metadata} ->> 'boundDeviceId')`,
    })
    .from(topics)
    .where(and(eq(topics.id, params.topicId), eq(topics.userId, params.userId)))
    .limit(1);
  const winner = rows[0]?.boundDeviceId;
  if (!winner) {
    throw new Error(
      `Topic device bind rejected for ${params.topicId}: no binding persisted (topic missing or malformed)`,
    );
  }
  return { boundDeviceId: winner, outcome: 'occupied' };
};
