import type { DeviceAttachment } from '@orvilo/builtin-tool-remote-device';
import type { OrviloDatabase } from '@orvilo/database';
import { sortDevicesByActivity } from '@orvilo/types';

import { DeviceModel } from '@/database/models/device';

import { deviceGateway } from './index';

/** Agent execution sees owned devices and registered hosts bound to accessible Agents. */
export const getScopedOnlineDevices = async (
  db: OrviloDatabase,
  userId: string,
  workspaceId?: string,
): Promise<DeviceAttachment[]> => {
  const rows = await new DeviceModel(db, userId, workspaceId).queryForExecution();
  const owners = [...new Set(rows.map((row) => row.userId))];
  const online = (
    await Promise.all(owners.map((owner) => deviceGateway.queryDeviceList(owner)))
  ).flat();
  const liveById = new Map(online.map((device) => [device.deviceId, device]));
  return sortDevicesByActivity(
    rows.map((row) => {
      const live = liveById.get(row.deviceId);
      return {
        deviceId: row.deviceId,
        friendlyName: row.friendlyName,
        hostname: live?.hostname ?? row.hostname ?? '',
        platform: live?.platform ?? row.platform ?? '',
        lastSeen: live?.lastSeen ?? row.lastSeenAt.toISOString(),
        online: !!live,
        channels: live?.channels,
      };
    }),
  );
};
