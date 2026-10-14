import type * as DeviceIdentityModule from '@orvilo/device-identity';
import { describe, expect, it, vi } from 'vitest';

import { resolveDeviceIdentity } from './register';

vi.mock('@orvilo/device-identity', async (importOriginal) => ({
  ...(await importOriginal<typeof DeviceIdentityModule>()),
  resolvePersistentDeviceIdentity: vi.fn(async (principal: string) => ({
    deviceId: `persistent:${principal}`,
    identitySource: 'fallback',
  })),
}));

describe('persistent device identity', () => {
  it('reuses the shared personal fallback across resolutions', async () => {
    const expected = { deviceId: 'persistent:user-1', identitySource: 'fallback' };
    expect(await resolveDeviceIdentity('user-1')).toEqual(expected);
    expect(await resolveDeviceIdentity('user-1')).toEqual(expected);
  });

  it('preserves explicit IDs and missing personal principals', async () => {
    const expected = { deviceId: 'pinned-device', identitySource: 'fallback' };
    expect(await resolveDeviceIdentity(undefined, 'pinned-device')).toEqual(expected);
    expect(await resolveDeviceIdentity(undefined)).toBeUndefined();
  });
});
