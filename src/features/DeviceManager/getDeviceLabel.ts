import type { DeviceListItem } from '@orvilo/types';

export const getDeviceLabel = (device: DeviceListItem, desktopLabel: string): string => {
  const name = device.friendlyName || device.hostname || device.deviceId;
  const channels = [
    ...new Set(
      device.channels
        .map(({ channel }) =>
          channel?.startsWith('desktop')
            ? desktopLabel
            : channel?.startsWith('cli')
              ? 'CLI'
              : channel,
        )
        .filter(Boolean),
    ),
  ];
  return channels.length ? `${name} · ${channels.join(', ')}` : name;
};
