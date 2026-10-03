import type { OrviloDatabase } from '@orvilo/database';
import type { DeviceUnavailableErrorData } from '@orvilo/types';

import { DeviceModel } from '@/database/models/device';

/**
 * Rechecks workspace registry authority immediately before device dispatch.
 *
 * Use when:
 * - A previously selected workspace device is about to receive new work
 * - Unshare may have raced with a long-running agent operation
 *
 * Expects:
 * - The caller has already passed workspace membership checks
 * - `workspaceId` is the principal used for Gateway routing
 *
 * Returns:
 * - Structured `DEVICE_BINDING_INVALID` context when the visible registry row
 *   no longer exists — the binding WAS valid when the run's device was
 *   chosen, so the contract's explicit-repair outcome applies (with the
 *   other selectable workspace devices as `repairCandidates`), never a
 *   silent re-bind. `DEVICE_NOT_FOUND` is reserved for transports that
 *   couldn't address a device at all.
 */
export const resolveDeviceDispatchAuthorizationFailure = async (
  serverDB: OrviloDatabase | undefined,
  userId: string,
  deviceId: string,
  workspaceId?: string,
): Promise<DeviceUnavailableErrorData | undefined> => {
  if (!workspaceId) return undefined;

  const model = serverDB ? new DeviceModel(serverDB, userId, workspaceId) : undefined;
  const device = model ? await model.findWorkspaceDeviceById(deviceId) : undefined;
  if (device) return undefined;

  const repairCandidates = model
    ? (await model.queryWorkspaceDevices())
        .filter((candidate) => candidate.deviceId !== deviceId)
        .map((candidate) => candidate.deviceId)
        .slice(0, 8)
    : [];

  return {
    code: 'DEVICE_BINDING_INVALID',
    deviceId,
    repairCandidates,
    retryable: true,
    scope: 'workspace',
    workspaceId,
  };
};
