import type { DeviceListItem } from '@orvilo/types';

/** Count all live connections for the caller’s registered devices. */
export const getDeviceConnectionCount = (
  devices: DeviceListItem[] | undefined,
  deviceId?: string,
): number | undefined => {
  if (!devices) return undefined;

  return devices
    .filter((device) => !deviceId || device.deviceId === deviceId)
    .reduce((count, device) => count + device.channels.length, 0);
};

/** Distinguish query failure/loading from an authoritative offline result. */
export const getDeviceConnectionState = (
  devices: DeviceListItem[] | undefined,
  isLoading: boolean,
  error: unknown,
): 'connected' | 'connecting' | 'disconnected' | 'unavailable' => {
  if (!devices && error) return 'unavailable';
  if (!devices && isLoading) return 'connecting';

  return getDeviceConnectionCount(devices) ? 'connected' : 'disconnected';
};
