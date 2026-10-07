// @vitest-environment node
import { GatewayHttpClient } from '@orvilo/device-gateway-client';
import type { HeterogeneousAgentModelCatalog } from '@orvilo/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DeviceModelModule from '@/database/models/device';
import type * as WorkspaceModelModule from '@/database/models/workspace';

import { deviceRouter } from '../device';

const mocks = vi.hoisted(() => ({
  findWorkspaceDeviceById: vi.fn(),
  membershipRole: vi.fn(),
}));

vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: () => ({}) }));
vi.mock('@/database/models/workspace', async (importOriginal) => ({
  ...(await importOriginal<typeof WorkspaceModelModule>()),
  getActiveWorkspaceMembershipRole: mocks.membershipRole,
}));
vi.mock('@/database/models/device', async (importOriginal) => ({
  ...(await importOriginal<typeof DeviceModelModule>()),
  DeviceModel: class {
    findWorkspaceDeviceById = mocks.findWorkspaceDeviceById;
  },
}));
vi.mock('@/envs/gateway', () => ({
  gatewayEnv: {
    DEVICE_GATEWAY_SERVICE_TOKEN: 'unit-test-token',
    DEVICE_GATEWAY_URL: 'http://gateway.invalid',
  },
}));

const caller = () =>
  deviceRouter.createCaller({ userId: 'owner', workspaceId: 'workspace' } as never);

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  mocks.membershipRole.mockResolvedValue('member');
  mocks.findWorkspaceDeviceById.mockResolvedValue({ deviceId: 'device', visibility: 'public' });
});

describe('device model catalog RPC contract', () => {
  it.each(['claude-code', 'codex'] as const)(
    'returns the %s catalog from the selected execution device',
    async (type) => {
      const catalog: HeterogeneousAgentModelCatalog = {
        models: [{ id: 'model', modelId: 'model', providerId: type }],
        status: 'success',
        updatedAt: 123,
      };
      const invokeRpc = vi
        .spyOn(GatewayHttpClient.prototype, 'invokeRpc')
        .mockResolvedValue({ data: catalog, success: true });

      await expect(
        caller().listHeterogeneousAgentModels({
          args: ['--test'],
          command: type,
          cwd: '/project',
          deviceId: 'device',
          env: { CATALOG_MODE: 'test' },
          type,
        }),
      ).resolves.toEqual(catalog);
      expect(invokeRpc).toHaveBeenCalledWith(
        { deviceId: 'device', timeout: 20_000, userId: 'owner', workspaceId: 'workspace' },
        {
          method: 'listHeterogeneousAgentModels',
          params: {
            args: ['--test'],
            command: type,
            cwd: '/project',
            env: { CATALOG_MODE: 'test' },
            type,
          },
        },
      );
    },
  );

  it('rejects an unknown provider before invoking the device', async () => {
    const invokeRpc = vi.spyOn(GatewayHttpClient.prototype, 'invokeRpc');
    await expect(
      caller().listHeterogeneousAgentModels({
        deviceId: 'device',
        // @ts-expect-error Exercise untrusted input outside the catalog provider contract.
        type: 'unknown-provider',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(invokeRpc).not.toHaveBeenCalled();
  });

  it('rejects an invisible device before invoking the catalog RPC', async () => {
    mocks.findWorkspaceDeviceById.mockResolvedValue(undefined);
    const invokeRpc = vi.spyOn(GatewayHttpClient.prototype, 'invokeRpc');
    await expect(
      caller().listHeterogeneousAgentModels({ deviceId: 'hidden-device', type: 'opencode' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(invokeRpc).not.toHaveBeenCalled();
  });

  it('requires authentication before invoking the catalog RPC', async () => {
    const invokeRpc = vi.spyOn(GatewayHttpClient.prototype, 'invokeRpc');
    const anonymous = deviceRouter.createCaller({ workspaceId: 'workspace' } as never);
    await expect(
      anonymous.listHeterogeneousAgentModels({ deviceId: 'device', type: 'opencode' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(invokeRpc).not.toHaveBeenCalled();
  });
});
