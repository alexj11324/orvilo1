import { RemoteDeviceIdentifier } from '@orvilo/builtin-tool-remote-device';
import type { RemoteDeviceExecutionRuntime } from '@orvilo/builtin-tool-remote-device/executionRuntime';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OrviloDatabase } from '@/database/type';

import type { ToolExecutionContext } from '../../types';
import { remoteDeviceRuntime } from '../remoteDevice';

const mocks = vi.hoisted(() => ({ devices: vi.fn(), online: vi.fn() }));
vi.mock('@/server/services/deviceGateway', () => ({
  deviceGateway: { queryDeviceList: mocks.online },
}));
vi.mock('@/database/models/device', () => ({
  DeviceModel: class {
    queryForExecution = mocks.devices;
  },
}));

beforeEach(() => {
  mocks.devices.mockReset().mockResolvedValue([]);
  mocks.online.mockReset().mockResolvedValue([]);
});

describe('remoteDeviceRuntime', () => {
  it('has the remote device identifier and requires a caller', () => {
    expect(remoteDeviceRuntime.identifier).toBe(RemoteDeviceIdentifier);
    expect(() => remoteDeviceRuntime.factory({ toolManifestMap: {} })).toThrow(
      'userId is required for Remote Device execution',
    );
  });

  it.each([undefined, 'workspace-1'])(
    'does not expose gateway presence without a registry database (workspace: %s)',
    async (workspaceId) => {
      mocks.online.mockResolvedValue([{ deviceId: 'unregistered-host', online: true }]);
      const context: ToolExecutionContext = {
        toolManifestMap: {},
        userId: 'caller',
        workspaceId,
      };
      const runtime = remoteDeviceRuntime.factory(context) as RemoteDeviceExecutionRuntime;
      const result = await runtime.listOnlineDevices();

      expect(result.state).toEqual({ devices: [] });
      expect(mocks.online).not.toHaveBeenCalled();
    },
  );

  it('lists registered online hosts with their alias and excludes unregistered gateway hosts', async () => {
    mocks.devices.mockResolvedValue([
      {
        deviceId: 'saved-host',
        friendlyName: 'Build Server',
        hostname: 'registered-host',
        lastSeenAt: new Date('2026-10-14T00:00:00Z'),
        platform: 'linux',
        userId: 'host-owner',
      },
      {
        deviceId: 'offline-host',
        hostname: 'offline',
        lastSeenAt: new Date('2026-10-14T00:00:00Z'),
        platform: 'linux',
        userId: 'host-owner',
      },
    ]);
    mocks.online.mockResolvedValue([
      {
        deviceId: 'saved-host',
        hostname: 'live-host',
        lastSeen: '2026-10-14T01:00:00Z',
        online: true,
        platform: 'linux',
      },
      { deviceId: 'unregistered-host', online: true },
    ]);
    const runtime = remoteDeviceRuntime.factory({
      serverDB: {} as OrviloDatabase,
      toolManifestMap: {},
      userId: 'caller',
      workspaceId: 'workspace-1',
    }) as RemoteDeviceExecutionRuntime;
    const result = await runtime.listOnlineDevices();

    expect(result.success).toBe(true);
    expect(JSON.parse(result.content)).toEqual([
      expect.objectContaining({
        deviceId: 'saved-host',
        friendlyName: 'Build Server',
        hostname: 'live-host',
        online: true,
      }),
    ]);
    expect(mocks.online).toHaveBeenCalledWith('host-owner');
  });
});
