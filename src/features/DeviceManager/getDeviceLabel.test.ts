import type { DeviceListItem } from '@orvilo/types';
import { expect, it } from 'vitest';

import { getDeviceLabel } from './getDeviceLabel';

it('distinguishes CLI and Desktop connections with the same hostname', () => {
  const device = (channel: string) =>
    ({ hostname: 'Mac', deviceId: channel, channels: [{ channel }] }) as DeviceListItem;
  expect(getDeviceLabel(device('cli'), 'Desktop')).toBe('Mac · CLI');
  expect(getDeviceLabel(device('desktop-dev'), 'Desktop')).toBe('Mac · Desktop');
});
