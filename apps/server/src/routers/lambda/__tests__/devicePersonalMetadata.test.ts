// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DeviceModelModule from '@/database/models/device';
import type * as WorkspaceModelModule from '@/database/models/workspace';

import { deviceRouter } from '../device';

const mocks = vi.hoisted(() => ({
  delete: vi.fn(),
  executeToolCall: vi.fn(),
  findByDeviceId: vi.fn(),
  findWorkspaceDeviceById: vi.fn(),
  hasFixedAgentBinding: vi.fn(),
  membershipRole: vi.fn(),
  queryPersonal: vi.fn(),
  setWorkspaceDeviceVisibility: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: () => ({}) }));
vi.mock('@/database/models/workspace', async (importOriginal) => ({
  ...(await importOriginal<typeof WorkspaceModelModule>()),
  getActiveWorkspaceMembershipRole: mocks.membershipRole,
}));
vi.mock('@/database/models/device', async (importOriginal) => ({
  ...(await importOriginal<typeof DeviceModelModule>()),
  DeviceModel: class {
    delete = mocks.delete;
    findByDeviceId = mocks.findByDeviceId;
    findWorkspaceDeviceById = mocks.findWorkspaceDeviceById;
    hasFixedAgentBinding = mocks.hasFixedAgentBinding;
    queryPersonal = mocks.queryPersonal;
    setWorkspaceDeviceVisibility = mocks.setWorkspaceDeviceVisibility;
    update = mocks.update;
  },
}));
vi.mock('@/server/services/deviceGateway', () => ({
  deviceGateway: { executeToolCall: mocks.executeToolCall },
  isPathWithinRoot: () => true,
}));

const caller = () =>
  deviceRouter.createCaller({ userId: 'owner', workspaceId: 'active-workspace' } as never);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.membershipRole.mockResolvedValue('member');
  mocks.findWorkspaceDeviceById.mockResolvedValue(undefined);
  mocks.queryPersonal.mockResolvedValue([{ deviceId: 'personal-device', workingDirs: [] }]);
});

describe('personal device metadata with an active workspace selector', () => {
  it('allows the owner to save a personal default directory', async () => {
    await expect(
      caller().updateDevice({ deviceId: 'personal-device', defaultCwd: '/tmp/my-project' }),
    ).resolves.toEqual({ success: true });
    expect(mocks.update).toHaveBeenCalledWith('personal-device', {
      defaultCwd: '/tmp/my-project',
      workingDirs: undefined,
    });
  });

  it('removes a personal device without requiring a workspace enrollment', async () => {
    await expect(caller().removeDevice({ deviceId: 'personal-device' })).resolves.toEqual({
      success: true,
    });
    expect(mocks.delete).toHaveBeenCalledWith('personal-device');
  });

  it('preserves directory cache from the personal row rather than a same-ID workspace row', async () => {
    const personalCache = { path: '/tmp/project', workspace: { source: 'personal' } };
    mocks.queryPersonal.mockResolvedValue([
      { deviceId: 'personal-device', workingDirs: [personalCache] },
    ]);
    mocks.findByDeviceId.mockResolvedValue({
      workingDirs: [{ path: '/tmp/project', workspace: { source: 'workspace' } }],
    });

    await caller().updateDevice({
      deviceId: 'personal-device',
      workingDirs: [{ path: '/tmp/project' }],
    });

    expect(mocks.update).toHaveBeenCalledWith('personal-device', {
      workingDirs: [{ ...personalCache, workspaceScannedAt: undefined }],
    });
  });

  it.each(['hidden-workspace-device', 'unknown-device'])(
    'still refuses workspace scanning of %s before forwarding an RPC',
    async (deviceId) => {
      await expect(caller().scanAgents({ deviceId })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(mocks.executeToolCall).not.toHaveBeenCalled();
    },
  );

  it('still refuses hiding a workspace device bound to a fixed Agent', async () => {
    mocks.findWorkspaceDeviceById.mockResolvedValue({ userId: 'owner', visibility: 'public' });
    mocks.hasFixedAgentBinding.mockResolvedValue(true);

    await expect(
      caller().setWorkspaceDeviceVisibility({
        deviceId: 'workspace-device',
        visibility: 'private',
      }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(mocks.setWorkspaceDeviceVisibility).not.toHaveBeenCalled();
  });

  it('requires authentication for personal metadata', async () => {
    const anonymous = deviceRouter.createCaller({ workspaceId: 'active-workspace' } as never);
    await expect(
      anonymous.updateDevice({ deviceId: 'personal-device', defaultCwd: '/tmp/project' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
