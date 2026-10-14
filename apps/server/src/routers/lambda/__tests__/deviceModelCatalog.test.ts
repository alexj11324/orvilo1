// @vitest-environment node
import { GatewayHttpClient } from '@orvilo/device-gateway-client';
import type { HeterogeneousAgentModelCatalog } from '@orvilo/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DeviceModelModule from '@/database/models/device';
import type * as WorkspaceModelModule from '@/database/models/workspace';

import { deviceRouter } from '../device';

const mocks = vi.hoisted(() => ({
  findExecutionDeviceById: vi.fn(),
  membershipRole: vi.fn(),
  findOwned: vi.fn(),
  config: vi.fn(),
  assertUse: vi.fn(),
  canManage: vi.fn(),
  getMeta: vi.fn(),
}));

vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: () => ({}) }));
vi.mock('@/database/models/workspace', async (importOriginal) => ({
  ...(await importOriginal<typeof WorkspaceModelModule>()),
  getActiveWorkspaceMembershipRole: mocks.membershipRole,
}));
vi.mock('@/database/models/device', async (importOriginal) => ({
  ...(await importOriginal<typeof DeviceModelModule>()),
  DeviceModel: class {
    getBoundAgentIds = async () => ['authorized-agent'];
    findByDeviceId = mocks.findOwned;

    findExecutionDeviceById = mocks.findExecutionDeviceById;
    findSavedAgentDeviceById = (_agentId: string, deviceId: string) =>
      mocks.findExecutionDeviceById(deviceId);
  },
}));
vi.mock('@/database/models/agent', () => ({
  AgentModel: class {
    getAgentConfigForExecution = mocks.config;
    getAgentConfigById = mocks.config;
  },
}));
vi.mock('@/server/services/resourcePermission', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getResourceMeta: mocks.getMeta,
  canManageResourcePermission: mocks.canManage,
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
  mocks.canManage.mockResolvedValue(false);
  mocks.getMeta.mockResolvedValue({
    userId: 'enroller',
    workspaceId: 'workspace',
    visibility: 'public',
  });
  mocks.findExecutionDeviceById.mockResolvedValue({ deviceId: 'device', userId: 'enroller' });
  mocks.findOwned.mockResolvedValue(undefined);
  mocks.assertUse.mockResolvedValue(undefined);
  mocks.config.mockImplementation(async () => ({
    agencyConfig: {
      boundDeviceId: 'device',
      heterogeneousProvider: {
        type: 'codex',
        command: 'saved-command',
        args: ['--saved'],
        env: { SAVED: 'server-value' },
      },
    },
  }));
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

      mocks.config.mockResolvedValue({
        agencyConfig: {
          boundDeviceId: 'device',
          heterogeneousProvider: {
            type,
            command: type,
            args: ['--saved'],
            env: { SAVED: 'server-value' },
          },
        },
      });
      await expect(
        caller().listHeterogeneousAgentModels({
          agentId: 'authorized-agent',
          args: ['--test'],
          command: '/bin/sh',
          cwd: '/project',
          deviceId: 'device',
          env: { CATALOG_MODE: 'test' },
          type,
        }),
      ).resolves.toEqual(catalog);
      expect(invokeRpc).toHaveBeenCalledWith(
        { deviceId: 'device', timeout: 20_000, userId: 'enroller', workspaceId: undefined },
        {
          method: 'listHeterogeneousAgentModels',
          params: {
            args: ['--saved'],
            command: type,
            cwd: '/project',
            env: { SAVED: 'server-value' },
            type,
          },
        },
      );
    },
  );

  it('requires a requested Agent for a foreign host and checks its saved binding', async () => {
    const invokeRpc = vi.spyOn(GatewayHttpClient.prototype, 'invokeRpc');
    await expect(
      caller().listHeterogeneousAgentModels({ deviceId: 'device', type: 'codex' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    mocks.config.mockResolvedValue({
      agencyConfig: { boundDeviceId: 'other-host', heterogeneousProvider: { type: 'codex' } },
    });
    await expect(
      caller().listHeterogeneousAgentModels({
        agentId: 'authorized-agent',
        deviceId: 'device',
        type: 'codex',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(invokeRpc).not.toHaveBeenCalled();
  });

  it.each(['owner', 'admin'])(
    'allows a %s manager without Use to discover only the saved native catalog',
    async (role) => {
      mocks.membershipRole.mockResolvedValue(role);
      mocks.canManage.mockResolvedValue(true);
      mocks.assertUse.mockRejectedValue(new Error('Use denied'));
      const invokeRpc = vi
        .spyOn(GatewayHttpClient.prototype, 'invokeRpc')
        .mockResolvedValue({ data: [], success: true });
      await expect(
        caller().listHeterogeneousAgentPermissions({
          agentId: 'authorized-agent',
          deviceId: 'device',
          type: 'codex',
          command: '/bin/sh',
        }),
      ).resolves.toEqual([]);
      expect(mocks.assertUse).not.toHaveBeenCalled();
      expect(invokeRpc).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'enroller', workspaceId: undefined }),
        expect.objectContaining({ params: expect.objectContaining({ command: 'saved-command' }) }),
      );
    },
  );

  it('rejects a revoked Agent Use grant before catalog transport', async () => {
    const { TRPCError } = await import('@trpc/server');
    mocks.assertUse.mockRejectedValue(new TRPCError({ code: 'FORBIDDEN' }));
    const invokeRpc = vi.spyOn(GatewayHttpClient.prototype, 'invokeRpc');
    await expect(
      caller().listHeterogeneousAgentModels({
        agentId: 'authorized-agent',
        deviceId: 'device',
        type: 'codex',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(invokeRpc).not.toHaveBeenCalled();
  });

  it('keeps creation catalogs available on an owned host', async () => {
    mocks.findOwned.mockResolvedValue({ deviceId: 'device', userId: 'owner' });
    vi.spyOn(GatewayHttpClient.prototype, 'invokeRpc').mockResolvedValue({
      success: true,
      data: { models: [], status: 'success', updatedAt: 123 },
    });
    await expect(
      caller().listHeterogeneousAgentModels({ deviceId: 'device', type: 'codex' }),
    ).resolves.toMatchObject({ status: 'success' });
    expect(mocks.config).not.toHaveBeenCalled();
  });

  it('rejects an unknown provider before invoking the device', async () => {
    mocks.findOwned.mockResolvedValue({ deviceId: 'device', userId: 'owner' });
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
    mocks.findExecutionDeviceById.mockResolvedValue(undefined);
    const invokeRpc = vi.spyOn(GatewayHttpClient.prototype, 'invokeRpc');
    await expect(
      caller().listHeterogeneousAgentModels({ deviceId: 'hidden-device', type: 'opencode' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
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

vi.mock('../_helpers/workspaceAgentGuard', () => ({
  assertCanUseWorkspaceAgent: mocks.assertUse,
}));
