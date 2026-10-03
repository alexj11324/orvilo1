import type { OrviloDatabase } from '@orvilo/database';
import type { DeviceUnavailableErrorData } from '@orvilo/types';

import { DeviceModel } from '@/database/models/device';

/**
 * Rechecks registry authority immediately before device dispatch — the same
 * contract for workspace-scoped and personal-scoped runs.
 *
 * Use when:
 * - A previously selected device is about to receive new work
 * - Unshare/revoke may have raced with a long-running agent operation
 *
 * Expects:
 * - The caller has already passed the scope's membership checks
 * - `workspaceId`, when present, is the principal used for Gateway routing;
 *   absent means the conversation runs in the user's personal device pool
 *
 * Returns:
 * - Structured `DEVICE_BINDING_INVALID` context when the visible registry row
 *   no longer exists — the binding WAS valid when the run's device was
 *   chosen, so the contract's explicit-repair outcome applies (with the
 *   other selectable devices in the SAME scope as `repairCandidates`), never
 *   a silent re-bind. `DEVICE_NOT_FOUND` is reserved for transports that
 *   couldn't address a device at all.
 */
export const resolveDeviceDispatchAuthorizationFailure = async (
  serverDB: OrviloDatabase | undefined,
  userId: string,
  deviceId: string,
  workspaceId?: string,
): Promise<DeviceUnavailableErrorData | undefined> => {
  const scope: DeviceUnavailableErrorData['scope'] = workspaceId ? 'workspace' : 'personal';
  const model = serverDB ? new DeviceModel(serverDB, userId, workspaceId) : undefined;

  const device = model
    ? workspaceId
      ? await model.findWorkspaceDeviceById(deviceId)
      : await model.findByDeviceId(deviceId)
    : undefined;
  if (device) return undefined;

  const repairCandidates = model
    ? (await (workspaceId ? model.queryWorkspaceDevices() : model.queryPersonal()))
        .filter((candidate) => candidate.deviceId !== deviceId)
        .map((candidate) => candidate.deviceId)
        .slice(0, 8)
    : [];

  return {
    code: 'DEVICE_BINDING_INVALID',
    deviceId,
    repairCandidates,
    retryable: true,
    scope,
    ...(workspaceId ? { workspaceId } : {}),
  };
};
