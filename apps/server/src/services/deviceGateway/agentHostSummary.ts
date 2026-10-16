import type { OrviloDatabase } from '@orvilo/database';

import { DeviceModel } from '@/database/models/device';

import { deviceGateway } from './index';

export interface AgentHostSummary {
  id: string;
  name: string;
  online: boolean;
}

/**
 * User-facing device name: the alias the user set, else the reported hostname,
 * else the id (only when the registry has neither).
 */
export const getDeviceDisplayName = (device: {
  deviceId: string;
  friendlyName?: string | null;
  hostname?: string | null;
}): string => device.friendlyName || device.hostname || device.deviceId;

/**
 * Resolve the display name of a device by id. Returns `undefined` when the
 * registry row is gone or the lookup fails — callers then fall back to a
 * nameless message rather than failing the run path.
 */
export const resolveDeviceName = async (
  db: OrviloDatabase,
  userId: string,
  deviceId: string,
  workspaceId?: string,
): Promise<string | undefined> => {
  try {
    const row = await new DeviceModel(db, userId, workspaceId).findAgentHostSummary(deviceId);
    return row ? getDeviceDisplayName(row) : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Read-only `{ id, name, online }` projection of the device an Agent is saved on,
 * for members who may Use the Agent but not edit it.
 *
 * Deliberately returns nothing else: no hostname, cwd, owner, channels, env or
 * capability data. Liveness is read from the same workspace gateway pool as
 * `device.listDevices`, and only counts a connection whose device has a registry
 * row in the workspace.
 */
export const resolveAgentHostSummary = async (
  db: OrviloDatabase,
  userId: string,
  deviceId: string,
  workspaceId?: string,
): Promise<AgentHostSummary | undefined> => {
  const row = await new DeviceModel(db, userId, workspaceId).findAgentHostSummary(deviceId);
  if (!row) return undefined;

  let online: boolean;
  try {
    // Workspace presence is keyed by the principal that opened the connection; the
    // caller's principal is what `listDevices` and dispatch use today.
    const live = await deviceGateway.queryDeviceList(userId, workspaceId);
    online = live.some((d) => d.deviceId === deviceId);
  } catch {
    online = false;
  }

  return { id: row.deviceId, name: getDeviceDisplayName(row), online };
};
