import { type OrviloDatabase } from '@orvilo/database';
import type {
  DeviceCandidate,
  DeviceCapabilitySnapshot,
  DeviceResolutionErrorCode,
  DeviceResolutionReason,
  OrviloAgentAgencyConfig,
  RequestTrigger,
} from '@orvilo/types';
import { resolveExecutionDevice } from '@orvilo/types';
import debug from 'debug';

import { DeviceModel } from '@/database/models/device';
import type { DeviceItem } from '@/database/schemas';
import { resolveExecutionTarget } from '@/helpers/executionTarget';

import { deviceGateway } from './index';
import {
  type DeviceRuntimeRequirement,
  verifyDeviceRuntimeInstallation,
} from './installedRuntimeEvidence';
import { filterAuthorizedDevicePresence } from './scopedDevicePresence';

const log = debug('orvilo-server:execution-admission');

/** Admission validates the saved Agent device against the caller's authorized inventory. */

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
 * Whether the caller's Agent permission context is ready. Failed permission
 * loading blocks execution before any candidates are considered.
 */

export interface AdmissionCandidatePolicy {
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
   * workspace row. Stored Agent bindings never expand the caller's authority.
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
  | 'query-failed'
  | 'runtime-unverified';

export interface DeviceCandidateInventory {
  candidates: AdmissionDeviceCandidate[];
  /**
   * `false` when the registry query failed — the set is partial and must never
   * be read as 0/1 candidates or auto-bound from.
   */
  inventoryComplete: boolean;
  inventoryState: DeviceInventoryState;
  runtimeInventoryError?: string;
  runtimeInventoryOfflineOnly?: boolean;
}

/**
 * How long a registry-stored capability report stays admissible as evidence.
 * Registration refreshes `lastVerifiedAt` on every connect and every live
 * probe rewrites it, so a row older than this describes a device that has
 * not been heard from — its snapshot is treated as absent, never trusted.
 */
export const CAPABILITY_EVIDENCE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * `x[.y[.z]]` numeric-tuple comparison — `current` satisfies `min` when it is
 * greater-or-equal segment by segment. Unparseable input never satisfies:
 * an honest `pending` beats a coerced verdict.
 */
export const satisfiesMinAdapterVersion = (current: string, min: string): boolean => {
  const parse = (value: string) => {
    const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(value.trim());
    return match ? [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)] : undefined;
  };
  const currentTuple = parse(current);
  const minTuple = parse(min);
  if (!currentTuple || !minTuple) return false;
  for (let segment = 0; segment < 3; segment += 1) {
    if (currentTuple[segment] !== minTuple[segment]) {
      return currentTuple[segment] > minTuple[segment];
    }
  }
  return true;
};

/**
 * One bounded capability/version verdict for one device. Registry evidence
 * (the enrollment row, including the persisted capability snapshot and
 * self-reported adapter version) plus optional live-probe evidence
 * (`supportedTools` from `queryDeviceSystemInfo`) — never a fabricated
 * `true`.
 */
const verifyCandidate = (params: {
  deviceId: string;
  /** The operation the candidate must be able to run. */
  requiredOperation?: AdmissionRequiredOperation;
  scopeSource: AdmissionDeviceCandidate['scopeSource'];
  /** Live evidence from a `queryDeviceSystemInfo` probe, when collected. */
  systemInfo?: { supportedTools?: string[] };
  /** Persisted registry evidence from the devices row, when present. */
  registryEvidence?: {
    adapterVersion?: string | null;
    capabilitySnapshot?: DeviceCapabilitySnapshot | null;
    lastVerifiedAt?: Date | string | null;
  };
  owner: { userId: string; workspaceId: string | null };
  isLocalMachine: boolean;
  online: boolean;
}): AdmissionDeviceCandidate => {
  const { requiredOperation } = params;
  const checkedAt = new Date().toISOString();

  const verifiedAt = params.registryEvidence?.lastVerifiedAt;
  const evidenceFresh =
    !!verifiedAt && Date.now() - new Date(verifiedAt).getTime() <= CAPABILITY_EVIDENCE_TTL_MS;

  let capabilityStatus: AdmissionVerificationStatus;
  let versionStatus: AdmissionVerificationStatus;
  let verification: AdmissionDeviceCandidate['verification'];

  if (!requiredOperation || requiredOperation.kind === 'agent-run') {
    // Agent-run contract: a registry-authorized (or verified-referenced) row
    // IS the capability evidence — the device enrolled as an execution host
    // and its own admission verifies the adapter/artifact at launch
    // (PrimeRunDescriptor). `minAdapterVersion` is proven from the version
    // the device reported at registration — absent or non-satisfying stays
    // honest pending, never assumed.
    capabilityStatus = 'verified';
    const storedAdapterVersion = params.registryEvidence?.adapterVersion;
    const versionProven =
      !!requiredOperation?.minAdapterVersion &&
      !!storedAdapterVersion &&
      evidenceFresh &&
      satisfiesMinAdapterVersion(storedAdapterVersion, requiredOperation.minAdapterVersion);
    versionStatus = requiredOperation?.minAdapterVersion
      ? versionProven
        ? 'verified'
        : 'pending'
      : 'verified';
    verification = {
      adapter: requiredOperation?.adapter ?? undefined,
      checkedAt,
      delegated: !versionProven,
      mode: 'registry',
      source:
        versionProven || (requiredOperation?.minAdapterVersion && storedAdapterVersion)
          ? 'registry:adapterVersion'
          : params.scopeSource === 'referenced'
            ? 'registry:verified-reference'
            : 'registry:row',
    };
  } else {
    // Tool/operation requirements need real per-device evidence — the live
    // supportedTools probe first, then the persisted registry snapshot when
    // the device cannot answer right now. Advertised → verified;
    // advertised-and-absent → incompatible; no evidence → pending.
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
      const snapshotTools =
        evidenceFresh === true
          ? params.registryEvidence?.capabilitySnapshot?.supportedTools
          : undefined;
      if (Array.isArray(snapshotTools)) {
        capabilityStatus = snapshotTools.includes(required) ? 'verified' : 'incompatible';
        verification = {
          checkedAt,
          mode: 'registry',
          source: 'registry:snapshot',
        };
      } else {
        capabilityStatus = 'pending';
        verification = {
          checkedAt,
          mode: 'none',
          source: params.systemInfo ? 'gateway:systemInfo (no supportedTools)' : undefined,
        };
      }
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
 * Device ownership grants direct access; an authorized shared Agent permits
 * execution on its saved host while both members remain active. Capability and
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
    /** Trusted saved host from an authorized Agent configuration lookup, never client input. */
    configurationHost?: DeviceItem;
    /** Agent metadata only; never authority to access its creator's machine. */
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
     * registry and the run's workspace registry. A stored Agent binding never
     * expands that authority. A referenced device that verifies nowhere is
     * NOT a candidate — the resolver blocks it honestly instead of trusting a
     * stale reference.
     */
    referencedDevices?: ReadonlyArray<{
      deviceId?: string | null;
    }>;
    /** What the candidate set must be able to run — see {@link AdmissionRequiredOperation}. */
    requiredOperation?: AdmissionRequiredOperation;
    /** Installed runtime eligibility for settings and never-bound automatic selection only. */
    runtimeRequirement?: DeviceRuntimeRequirement;
  },
): Promise<DeviceCandidateInventory> => {
  const deviceModel = new DeviceModel(serverDB, userId, workspaceId);
  const localDeviceId = options?.localDeviceId;
  const requiredOperation = options?.requiredOperation ?? { kind: 'agent-run' };

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
    deviceModel.query().catch((error) => {
      inventoryComplete = false;
      log('device registry lookup failed; inventory incomplete: %O', error);
      return [] as Awaited<ReturnType<typeof deviceModel.query>>;
    }),
    deviceGateway.queryDeviceList(userId),
  ]);
  if (!inventoryComplete)
    return { candidates: [], inventoryComplete, inventoryState: 'query-failed' };

  const executableRows = rows;

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
  const authorizedOnline = filterAuthorizedDevicePresence(registeredDeviceIds, online);
  const liveById = new Map(authorizedOnline.map((d) => [d.deviceId, d]));
  if (probeNeeded) {
    const toProbe = authorizedOnline.slice(0, PROBE_BUDGET).map((d) => d.deviceId);
    await Promise.all(
      toProbe.map(async (deviceId) => {
        const info = await probeSystemInfo(deviceId).catch(() => undefined);
        probedInfo.set(deviceId, info);
        if (info?.supportedTools) {
          // Refresh the stored snapshot so a later offline-but-authorized
          // device can still be judged from evidence it actually reported.
          // Fire-and-forget: a write failure must not stall admission.
          void deviceModel
            .updateCapabilityEvidence(deviceId, { supportedTools: info.supportedTools })
            .catch(() => undefined);
        }
      }),
    );
  }

  const seen = new Set<string>();
  const runtimeSnapshots = new Map<string, DeviceCapabilitySnapshot | null | undefined>();
  const fromDb = executableRows.map((row): AdmissionDeviceCandidate => {
    seen.add(row.deviceId);
    runtimeSnapshots.set(row.deviceId, row.capabilitySnapshot);
    const live = liveById.get(row.deviceId);
    return verifyCandidate({
      deviceId: row.deviceId,
      isLocalMachine: row.deviceId === localDeviceId,
      online: !!live,
      owner: { userId: row.userId, workspaceId: null },
      registryEvidence: {
        adapterVersion: row.adapterVersion,
        capabilitySnapshot: row.capabilitySnapshot,
        lastVerifiedAt: row.lastVerifiedAt,
      },
      requiredOperation,
      scopeSource: 'registry',
      systemInfo: probedInfo.get(row.deviceId),
    });
  });
  const candidates = fromDb;
  for (const device of candidates) seen.add(device.deviceId);

  // Referenced-device verification: a stored binding, session pin or caller
  // reference may name a device outside the scoped list — the caller's personal
  // device bound to a workspace agent, or the caller's own desktop on a
  // `local` run. It joins the candidate set only when a registry lookup
  // confirms it exists (the same find-by-id calls dispatch itself trusts); an
  // unverifiable reference stays unauthorized.
  const references = options?.referencedDevices ?? [];
  for (const ref of references) {
    if (!ref?.deviceId || seen.has(ref.deviceId)) continue;
    try {
      const verifiedRow =
        (options?.configurationHost?.deviceId === ref.deviceId
          ? options.configurationHost
          : undefined) ??
        (await deviceModel.findByDeviceId(ref.deviceId)) ??
        (workspaceId ? await deviceModel.findExecutionDeviceById(ref.deviceId) : undefined);
      if (!verifiedRow) continue;
      seen.add(ref.deviceId);
      runtimeSnapshots.set(ref.deviceId, verifiedRow.capabilitySnapshot);
      // A verified reference can belong to the caller's personal registry
      // during a workspace-private run. Presence must use that row's principal;
      // workspace presence cannot establish personal-device liveness.
      const referencePresence =
        verifiedRow.userId === userId
          ? online
          : await deviceGateway.queryDeviceList(verifiedRow.userId);
      const isOnline = referencePresence.some((device) => device.deviceId === ref.deviceId);
      // Probe a referenced device that needs live evidence and is online.
      if (probeNeeded && isOnline && !probedInfo.has(ref.deviceId)) {
        const info = await probeSystemInfo(ref.deviceId).catch(() => undefined);
        probedInfo.set(ref.deviceId, info);
        if (info?.supportedTools) {
          void deviceModel
            .updateCapabilityEvidence(ref.deviceId, { supportedTools: info.supportedTools })
            .catch(() => undefined);
        }
      }
      candidates.push(
        verifyCandidate({
          deviceId: ref.deviceId,
          isLocalMachine: ref.deviceId === localDeviceId,
          online: isOnline,
          owner: { userId: verifiedRow.userId, workspaceId: null },
          registryEvidence: {
            adapterVersion: verifiedRow.adapterVersion,
            capabilitySnapshot: verifiedRow.capabilitySnapshot,
            lastVerifiedAt: verifiedRow.lastVerifiedAt,
          },
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

  let runtimeInventoryError: string | undefined;
  let runtimeInventoryOfflineOnly = true;
  if (options?.runtimeRequirement) {
    const requirement = options.runtimeRequirement;
    await Promise.all(
      candidates.map(async (candidate) => {
        try {
          const result = await verifyDeviceRuntimeInstallation({
            db: serverDB,
            online: candidate.online,
            owner: {
              deviceId: candidate.deviceId,
              userId: candidate.owner.userId,
              workspaceId: candidate.owner.workspaceId ?? undefined,
            },
            requirement,
            snapshot: runtimeSnapshots.get(candidate.deviceId),
          });
          candidate.capabilityStatus =
            result.installed === 'unknown'
              ? 'pending'
              : result.installed
                ? 'verified'
                : 'incompatible';
          candidate.capabilityOk = result.installed === true;
          candidate.verification = {
            ...candidate.verification,
            adapter: requirement.agentType,
            mode:
              candidate.online && !result.error
                ? 'live-probe'
                : result.installed === 'unknown'
                  ? 'none'
                  : 'registry',
            source:
              candidate.online && !result.error
                ? 'gateway:runtime-installation'
                : result.installed === 'unknown'
                  ? 'runtime:unverified'
                  : 'registry:installedRuntimes',
          };
          if (result.installed === 'unknown' || result.error) {
            inventoryComplete = false;
            if (candidate.online) runtimeInventoryOfflineOnly = false;
            runtimeInventoryError ??=
              result.error ?? 'An authorized device has no verified installation for this runtime';
          }
        } catch (error) {
          console.error('[device:runtimeInstallation]', error);
          runtimeInventoryOfflineOnly = false;
          candidate.capabilityStatus = 'pending';
          candidate.capabilityOk = false;
          inventoryComplete = false;
          runtimeInventoryError ??=
            error instanceof Error ? error.message : 'Device runtime verification failed';
        }
      }),
    );
  }

  return {
    candidates,
    inventoryComplete,
    inventoryState: !inventoryComplete
      ? 'runtime-unverified'
      : candidates.length === 0
        ? 'empty'
        : 'complete',
    ...(runtimeInventoryError ? { runtimeInventoryError, runtimeInventoryOfflineOnly } : {}),
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
  /** Saved Agent execution configuration. */
  agencyConfig?: OrviloAgentAgencyConfig;
  /** The Agent owner is metadata; execution authorization remains caller-scoped. */
  agentOwnerId?: string;
  canUseDevice: boolean;
  localDeviceId?: string;
  policy?: AdmissionCandidatePolicy;
  requestTrigger?: RequestTrigger;
  requiredOperation?: AdmissionRequiredOperation;
  sandboxExecutionAvailable: boolean;
  sandboxFallback?: boolean;
  userId: string;
  workspaceId?: string;
}

export const resolveHeteroExecutionPlan = async (
  serverDB: OrviloDatabase,
  params: ResolveHeteroExecutionPlanParams,
): Promise<HeteroExecutionPlan> => {
  const { agencyConfig } = params;
  const target = resolveExecutionTarget(agencyConfig, {
    clientExecutionAvailable: true,
    isHetero: true,
    sandboxExecutionAvailable: params.sandboxExecutionAvailable,
    trigger: params.requestTrigger,
    workspaceScoped: false,
  });
  if (target === 'sandbox') return { kind: 'sandbox' };
  if (!params.canUseDevice) {
    if (params.sandboxFallback) return { kind: 'sandbox' };
    return {
      code: 'DEVICE_ACCESS_DENIED',
      detail: 'This sender is not allowed to run agents on the saved device.',
      kind: 'blocked',
    };
  }
  if (!['device', 'local'].includes(target) || !agencyConfig?.boundDeviceId) {
    return {
      code: 'EXECUTION_TARGET_NONE',
      detail: 'Select a run device in the Agent settings.',
      kind: 'blocked',
    };
  }
  const { candidates, inventoryComplete } = await listAuthorizedDeviceCandidates(
    serverDB,
    params.userId,
    params.workspaceId,
    {
      agentOwnerId: params.agentOwnerId,
      localDeviceId: params.localDeviceId,
      policy: params.policy,
      referencedDevices: [{ deviceId: agencyConfig.boundDeviceId }],
      requiredOperation: params.requiredOperation ?? { kind: 'agent-run' },
    },
  );
  const resolution = resolveExecutionDevice(
    {
      // Strict binding validation prevents fallback when the saved Agent device is revoked.
      sessionBoundDeviceId: agencyConfig.boundDeviceId,
      deviceInventoryComplete: inventoryComplete,
      explicitRequestAllowed: false,
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
      reason: 'agent_default',
    };
  }

  return {
    code: resolution.code,
    detail:
      resolution.code === 'DEVICE_BINDING_INVALID'
        ? 'The Agent saved device is no longer authorized or registered — change it in Agent settings.'
        : resolution.code === 'DEVICE_REQUEST_UNAUTHORIZED'
          ? 'The requested device is not in the authorized device set for this run.'
          : resolution.code === 'DEVICE_INVENTORY_INCOMPLETE'
            ? 'The device inventory could not be loaded — no device was bound or picked.'
            : resolution.code === 'DEVICE_SELECTION_REQUIRED'
              ? 'Select a run device in the Agent settings.'
              : 'No device is bound or available for this agent.',
    kind: 'blocked',
    ...(resolution.repairCandidates ? { repairCandidates: resolution.repairCandidates } : {}),
  };
};
