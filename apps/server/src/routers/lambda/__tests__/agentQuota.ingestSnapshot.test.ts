// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// serverDatabase middleware calls getServerDB(); stub it (the model mocks
// ignore the db handle anyway).
vi.mock('@/database/core/db-adaptor', () => ({
  getServerDB: vi.fn(function () {
    return {};
  }),
}));

vi.mock('@/business/server/trpc-middlewares/rbacPermission', () => ({
  withScopedPermission: vi.fn(function () {
    return (opts: any) => opts.next({ ctx: opts.ctx });
  }),
}));

const mockFindByDeviceId = vi.fn();
const mockIngestSnapshot = vi.fn(async () => ({ ok: true }));

vi.mock('@/database/models/device', () => ({
  DeviceModel: vi.fn(function () {
    return {
      findExecutionDeviceById: mockFindByDeviceId,
    };
  }),
}));

vi.mock('@/database/models/agentQuota', () => ({
  AgentProviderAccountModel: vi.fn(function () {
    return {};
  }),
  AgentQuotaWindowModel: vi.fn(function () {
    return {};
  }),
}));

vi.mock('@/server/services/agentQuota', () => ({
  AgentQuotaService: vi.fn(function () {
    return { ingestSnapshot: mockIngestSnapshot };
  }),
}));

const { agentQuotaRouter } = await import('../agentQuota');

const createCaller = (workspaceId?: string) =>
  agentQuotaRouter.createCaller({ serverDB: {}, userId: 'user-1', workspaceId } as any);

const READINGS = [
  {
    capturedAt: 1_700_000_000_000,
    limitType: 'session',
    resetsAt: null,
    scopeKey: '',
    utilization: 5,
  },
];

const ingest = (deviceId?: string, workspaceId?: string) =>
  createCaller(workspaceId).ingestSnapshot({
    deviceId,
    identity: { externalAccountId: 'ext-1' },
    provider: 'claude-code',
    readings: READINGS,
  });

describe('agentQuota.ingestSnapshot device resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves the gateway device id to the devices row uuid', async () => {
    // Clients only know the gateway id stored in `agencyConfig.boundDeviceId`;
    // snapshots reference `devices.id`. Passing the gateway id straight through
    // fails the uuid/foreign-key check and takes the whole ingest down.
    mockFindByDeviceId.mockResolvedValue({ id: '7b9a6767-9d4c-4924-86ff-135be4b2101a' });

    await ingest('agent-testing-quota-device');

    expect(mockFindByDeviceId).toHaveBeenCalledWith('agent-testing-quota-device');
    expect(mockIngestSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: '7b9a6767-9d4c-4924-86ff-135be4b2101a' }),
    );
  });

  it('still persists the reading when the device cannot be resolved', async () => {
    mockFindByDeviceId.mockResolvedValue(undefined);

    await ingest('unknown-device');

    expect(mockIngestSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: undefined, readings: READINGS }),
    );
  });

  it('skips the device lookup entirely for a local (deviceless) sample', async () => {
    await ingest(undefined);

    expect(mockFindByDeviceId).not.toHaveBeenCalled();
    expect(mockIngestSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: undefined }),
    );
  });

  it('resolves an authorized saved Agent host in a workspace', async () => {
    mockFindByDeviceId.mockResolvedValue({ id: 'authorized-device-uuid' });
    await ingest('shared-build-server', 'ws-1');
    expect(mockIngestSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: 'authorized-device-uuid' }),
    );
  });

  it('does not attribute a sample to an unauthorized workspace host', async () => {
    mockFindByDeviceId.mockResolvedValue(undefined);
    await ingest('foreign-host', 'ws-1');
    expect(mockIngestSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: undefined, readings: READINGS }),
    );
  });
});
