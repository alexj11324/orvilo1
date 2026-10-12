import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getScopedOnlineDevices } from './scopedDevices';

const mocks = vi.hoisted(() => ({ rows: vi.fn(), online: vi.fn() }));
vi.mock('@/database/models/device', () => ({
  DeviceModel: class {
    queryForExecution = mocks.rows;
  },
}));
vi.mock('./index', () => ({ deviceGateway: { queryDeviceList: mocks.online } }));
const row = (deviceId: string, userId: string) => ({
  deviceId,
  userId,
  friendlyName: 'Owner Mac',
  hostname: 'host',
  platform: 'darwin',
  lastSeenAt: new Date(0),
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows.mockResolvedValue([row('saved', 'owner'), row('mine', 'member')]);
  mocks.online.mockImplementation(async (userId: string) =>
    userId === 'owner'
      ? [
          {
            deviceId: 'saved',
            online: true,
            hostname: 'host',
            platform: 'darwin',
            lastSeen: new Date(1).toISOString(),
          },
        ]
      : [{ deviceId: 'unregistered', online: true }],
  );
});
describe('saved Agent execution hosts', () => {
  it('combines the registered hosts with each enrolling member’s one live connection', async () => {
    const result = await getScopedOnlineDevices({} as never, 'member', 'workspace');
    expect(mocks.online).toHaveBeenCalledWith('owner');
    expect(mocks.online).toHaveBeenCalledWith('member');
    expect(result.map((d) => [d.deviceId, d.online])).toEqual([
      ['saved', true],
      ['mine', false],
    ]);
    expect(result[0].friendlyName).toBe('Owner Mac');
    expect(result.some((d) => d.deviceId === 'unregistered')).toBe(false);
  });
  it('fails closed when the registry cannot verify the execution hosts', async () => {
    mocks.rows.mockRejectedValue(new Error('database unavailable'));
    await expect(getScopedOnlineDevices({} as never, 'member', 'workspace')).rejects.toThrow(
      'database unavailable',
    );
  });
});
