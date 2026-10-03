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

export interface DeviceCandidateInventory {
  candidates: DeviceCandidate[];
  /**
   * `false` when the registry query failed — the set is partial and must never
   * be read as 0/1 candidates or auto-bound from.
   */
  inventoryComplete: boolean;
}

/**
 * The authorized execution candidates for this principal + scope, built the
 * same way `getScopedOnlineDevices` builds the settings/picker list: registry
 * rows merged with live gateway presence (workspace scope keeps only rows the
 * registry knows — a gateway-only connection is never executable).
 *
 * Scope IS the authorization: a workspace run only sees that workspace's
 * registered devices, a personal run only the caller's own. Capability and
 * version checks are `true` until devices report per-agent capabilities — the
 * honest answer today is "no probe exists", not a fabricated rejection.
 */
export const listAuthorizedDeviceCandidates = async (
  serverDB: OrviloDatabase,
  userId: string,
  workspaceId?: string,
  localDeviceId?: string,
): Promise<DeviceCandidateInventory> => {
  const deviceModel = new DeviceModel(serverDB, userId, workspaceId);
  const scope: 'personal' | 'workspace' = workspaceId ? 'workspace' : 'personal';

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
  if (!inventoryComplete) return { candidates: [], inventoryComplete };

  const registeredDeviceIds = new Set(rows.map((device) => device.deviceId));
  const authorizedOnline = filterAuthorizedDevicePresence(registeredDeviceIds, online, scope);
  const liveById = new Map(authorizedOnline.map((d) => [d.deviceId, d]));
  const seen = new Set<string>();
  const fromDb = rows.map((row): DeviceCandidate => {
    seen.add(row.deviceId);
    const live = liveById.get(row.deviceId);
    return {
      capabilityOk: true,
      deviceId: row.deviceId,
      isLocalMachine: row.deviceId === localDeviceId,
      online: !!live,
      scopeOk: true,
      versionOk: true,
    };
  });
  // Personal clients register immediately before opening their socket, but a
  // short race can still expose the live connection first — keep the same
  // gateway-transient compatibility window `getScopedOnlineDevices` allows
  // (personal scope only; workspace rows ARE the authorization).
  const transient = authorizedOnline
    .filter((d) => !seen.has(d.deviceId))
    .map((d): DeviceCandidate => ({
      capabilityOk: true,
      deviceId: d.deviceId,
      isLocalMachine: d.deviceId === localDeviceId,
      online: true,
      scopeOk: true,
      versionOk: true,
    }));

  return { candidates: [...fromDb, ...transient], inventoryComplete };
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
      candidate: DeviceCandidate;
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
  requestTrigger?: RequestTrigger;
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

  if (target === 'sandbox') return { kind: 'sandbox' };

  if (!params.canUseDevice) {
    // Device access denied: the only surfaces a denied sender may still reach
    // are the explicit sandbox grant (share visitors) or a sandbox-capable
    // family — never a device, never the viewing client's machine.
    if (params.sandboxExecutionAvailable || params.sandboxFallback) return { kind: 'sandbox' };
    return {
      code: 'DEVICE_ACCESS_DENIED',
      detail: 'This sender is not allowed to run agents on a bound device.',
      kind: 'blocked',
    };
  }

  const wantsDevice =
    !!params.explicitDeviceId || target === 'device' || target === 'local' || target === 'auto';
  if (!wantsDevice) {
    // Stored 'none' is an explicit opt-out — the run stays pending until the
    // user picks a device or sandbox; it never auto-binds. An UNSET target
    // (no history: never selected, no session pin) still consults the
    // candidate set below so a single legitimate device may conditionally
    // resolve — but a shared/pinned scope never auto-binds off the shared row.
    const hasNoSelectionHistory =
      agencyConfig?.executionTarget === undefined && !params.sessionBoundDeviceId;
    if (!hasNoSelectionHistory || params.workspaceScoped || isFixedPolicy) {
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
    params.localDeviceId,
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

  // 'local' names the requester's own machine (localDeviceId); when no
  // requester device is attached (bot/web call) the stored boundDeviceId is
  // the durable stand-in — the picker stamps the chosen desktop's id there,
  // which is exactly what the legacy `local`→`device` coercion honoured.
  const agentDefaultDeviceId = memberPicked
    ? undefined
    : target === 'device'
      ? agencyConfig?.boundDeviceId
      : target === 'local'
        ? (params.localDeviceId ?? agencyConfig?.boundDeviceId)
        : undefined;

  // `auto` explicitly re-picks every run — a leftover binding must not pin it.
  const sessionBoundDeviceId =
    target === 'auto' ? undefined : (params.sessionBoundDeviceId ?? undefined);

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
      // anyway so a future contract change never reads undefined.
      candidate: candidate ?? {
        capabilityOk: true,
        deviceId: resolution.deviceId,
        isLocalMachine: resolution.deviceId === params.localDeviceId,
        online: false,
        scopeOk: true,
        versionOk: true,
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
 * Conditional first-bind (plan §5.1/§5.2): when unified admission resolves to
 * the ONLY legitimate candidate (`single_candidate`), the server writes that
 * device into the conversation's executionConfig — but ONLY if no binding
 * exists yet. The `WHERE` clause makes the write a real CAS: two concurrent
 * first-binds cannot overwrite each other, and a binding already set by the
 * picker (or an earlier run) is never clobbered.
 *
 * Returns `true` when THIS call installed the binding; `false` when one
 * already existed (the caller may re-read to see the winner's value).
 */
export const bindTopicDeviceIfUnset = async (
  serverDB: OrviloDatabase,
  params: {
    deviceId: string;
    topicId: string;
    userId: string;
    workspaceId?: string;
  },
): Promise<boolean> => {
  try {
    const updated = await serverDB
      .update(topics)
      .set({
        metadata: sql`jsonb_set(
          coalesce(${topics.metadata}, '{}'::jsonb),
          '{executionConfig,boundDeviceId}',
          to_jsonb(${params.deviceId}::text),
          true
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
      .returning({ id: topics.id });
    return updated.length > 0;
  } catch (err) {
    // The bind is an audit/convenience write — losing it is a missing
    // optimization, not a lost execution decision (the run already resolved).
    log(
      'bindTopicDeviceIfUnset failed topic=%s device=%s: %O',
      params.topicId,
      params.deviceId,
      err,
    );
    return false;
  }
};
