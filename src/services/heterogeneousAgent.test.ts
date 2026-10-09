import { beforeEach, describe, expect, it, vi } from 'vitest';

import { heterogeneousAgentCatalogService } from './heterogeneousAgent';

const mocks = vi.hoisted(() => ({
  electronListModels: vi.fn(),
  electronListPermissions: vi.fn(),
  remoteListPermissions: vi.fn(),
  remoteListModels: vi.fn(),
  scopedModels: vi.fn(),
}));

// The Electron IPC leg is the desktop-local transport — the test stands in
// for the desktop build, where `isDesktop` lets the guard pass.
vi.mock('@orvilo/const', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  isDesktop: true,
}));

vi.mock('@/libs/trpc/client', () => ({
  createWorkspaceLambdaClient: (scope: string | null) => ({
    device: {
      listHeterogeneousAgentModels: {
        query: async (params: unknown) => mocks.scopedModels(scope, params),
      },
    },
  }),
  lambdaClient: {
    device: {
      listHeterogeneousAgentModels: { query: mocks.remoteListModels },
      listHeterogeneousAgentPermissions: { query: mocks.remoteListPermissions },
    },
  },
}));

vi.mock('@/services/electron/heterogeneousAgent', () => ({
  heterogeneousAgentService: {
    listModels: mocks.electronListModels,
    listPermissions: mocks.electronListPermissions,
  },
}));

// Stand in for a host whose handshake proved a local device id — the IPC leg
// is the desktop-local transport it authorizes.
vi.mock('@/services/localExecutionIdentity', () => ({
  resolveLocalExecutionIdentity: vi.fn(async () => ({ localDeviceId: 'local-device' })),
}));

describe('heterogeneousAgentCatalogService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the advertised permission catalog from the selected transport', async () => {
    const catalogs = [
      {
        configId: 'permission_mode',
        currentValue: 'default',
        name: 'Permission mode',
        options: [{ name: 'Default', value: 'default' }],
      },
    ];
    mocks.electronListPermissions.mockResolvedValue(catalogs);
    mocks.remoteListPermissions.mockResolvedValue(catalogs);
    await expect(
      heterogeneousAgentCatalogService.listPermissions({ type: 'claude-code' }),
    ).resolves.toEqual(catalogs);
    await expect(
      heterogeneousAgentCatalogService.listPermissions({ deviceId: 'device-1', type: 'codex' }),
    ).resolves.toEqual(catalogs);
  });

  it('preserves permission discovery failures instead of returning an empty catalog', async () => {
    mocks.remoteListPermissions.mockRejectedValue(new Error('device offline'));
    await expect(
      heterogeneousAgentCatalogService.listPermissions({ deviceId: 'device-1', type: 'codex' }),
    ).rejects.toThrow('device offline');
  });

  it('uses Electron IPC for the current Desktop', async () => {
    const catalog = { models: [], status: 'success', updatedAt: 1 };
    mocks.electronListModels.mockResolvedValue(catalog);
    const params = { cwd: '/repo', type: 'opencode' as const };

    await expect(heterogeneousAgentCatalogService.listModels(params)).resolves.toEqual(catalog);
    expect(mocks.electronListModels).toHaveBeenCalledWith(params);
    expect(mocks.remoteListModels).not.toHaveBeenCalled();
  });

  it('uses the device RPC for a bound execution target', async () => {
    const catalog = { models: [], status: 'success', updatedAt: 1 };
    mocks.remoteListModels.mockResolvedValue(catalog);

    await expect(
      heterogeneousAgentCatalogService.listModels({
        cwd: '/repo',
        deviceId: 'device-1',
        type: 'opencode',
      }),
    ).resolves.toEqual(catalog);
    expect(mocks.remoteListModels).toHaveBeenCalledWith({
      cwd: '/repo',
      deviceId: 'device-1',
      type: 'opencode',
    });
    expect(mocks.electronListModels).not.toHaveBeenCalled();
  });
});

it('discovers models on the public source target workspace instead of the active scope', async () => {
  mocks.scopedModels.mockImplementation(async (scope) => ({
    models: [{ id: scope }],
    status: 'success',
    updatedAt: 1,
  }));
  await expect(
    heterogeneousAgentCatalogService.listModels(
      { deviceId: 'public-device', type: 'opencode' },
      'new-workspace',
    ),
  ).resolves.toMatchObject({ models: [{ id: 'new-workspace' }] });
});
