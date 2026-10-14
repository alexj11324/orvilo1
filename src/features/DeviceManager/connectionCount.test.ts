import type { DeviceListItem } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import { getDeviceConnectionCount, getDeviceConnectionState } from './connectionCount';

const row = (deviceId: string, count: number) =>
  ({ deviceId, channels: Array.from({ length: count }, () => ({})) }) as DeviceListItem;
describe('unified connected device presence', () => {
  it('counts every connected registered device, including a member’s own machine in a workspace', () => {
    const devices = [row('desktop', 1), row('server', 2), row('offline', 0)];
    expect(getDeviceConnectionCount(devices)).toBe(3);
    expect(getDeviceConnectionCount(devices, 'desktop')).toBe(1);
    expect(getDeviceConnectionState(devices, false, undefined)).toBe('connected');
  });
  it('distinguishes failed or pending inventory from a known offline set', () => {
    expect(getDeviceConnectionState(undefined, false, new Error('failed'))).toBe('unavailable');
    expect(getDeviceConnectionState(undefined, true, undefined)).toBe('connecting');
    expect(getDeviceConnectionState([row('offline', 0)], false, undefined)).toBe('disconnected');
  });
});
