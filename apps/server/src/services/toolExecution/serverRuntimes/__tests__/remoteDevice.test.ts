import type { RemoteDeviceExecutionRuntime } from '@orvilo/builtin-tool-remote-device/executionRuntime';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { remoteDeviceRuntime } from '../remoteDevice';

const inventory = vi.hoisted(() => vi.fn());
vi.mock('@/server/services/deviceGateway/scopedDevices', () => ({
  getScopedOnlineDevices: inventory,
}));
beforeEach(() => {
  inventory.mockReset().mockResolvedValue([
    {
      deviceId: 'owner-device',
      hostname: 'Owner Mac',
      friendlyName: 'Owner Mac',
      platform: 'darwin',
      lastSeen: new Date(0).toISOString(),
      online: true,
    },
    {
      deviceId: 'offline-device',
      hostname: 'Offline Mac',
      platform: 'darwin',
      lastSeen: new Date(0).toISOString(),
      online: false,
    },
  ]);
});
describe('Agent remote device inventory', () => {
  it('requires an authenticated user', () => {
    expect(() => remoteDeviceRuntime.factory({ toolManifestMap: {} })).toThrow(
      'userId is required',
    );
  });
  it('uses the authorized saved-host inventory while preserving the run workspace', async () => {
    const db = {} as never;
    const runtime = remoteDeviceRuntime.factory({
      userId: 'member',
      workspaceId: 'workspace',
      serverDB: db,
      toolManifestMap: {},
    }) as RemoteDeviceExecutionRuntime;
    const result = await runtime.listOnlineDevices();
    expect(inventory).toHaveBeenCalledWith(db, 'member', 'workspace');
    expect(result.success).toBe(true);
    expect(result.state).toMatchObject({ devices: [{ deviceId: 'owner-device' }] });
  });
  it('does not substitute unregistered gateway presence when registry authorization is unavailable', async () => {
    const runtime = remoteDeviceRuntime.factory({
      userId: 'member',
      workspaceId: 'workspace',
      toolManifestMap: {},
    }) as RemoteDeviceExecutionRuntime;
    const result = await runtime.listOnlineDevices();
    expect(inventory).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });
});
