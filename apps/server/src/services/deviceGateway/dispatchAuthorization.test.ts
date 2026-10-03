import type { OrviloDatabase } from '@orvilo/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findByDeviceId: vi.fn(),
  findWorkspaceDeviceById: vi.fn(),
  queryPersonal: vi.fn(async () => [] as Array<{ deviceId: string }>),
  queryWorkspaceDevices: vi.fn(async () => [] as Array<{ deviceId: string }>),
}));

vi.mock('@/database/models/device', () => ({
  DeviceModel: vi.fn().mockImplementation(function () {
    return {
      findByDeviceId: mocks.findByDeviceId,
      findWorkspaceDeviceById: mocks.findWorkspaceDeviceById,
      queryPersonal: mocks.queryPersonal,
      queryWorkspaceDevices: mocks.queryWorkspaceDevices,
    };
  }),
}));

const { resolveDeviceDispatchAuthorizationFailure } = await import('./dispatchAuthorization');
const serverDB = {} as OrviloDatabase;

describe('resolveDeviceDispatchAuthorizationFailure', () => {
  beforeEach(() => vi.clearAllMocks());

  /** @example A visible personal registration permits the selected device dispatch. */
  it('allows personal dispatch while its registry row remains visible', async () => {
    mocks.findByDeviceId.mockResolvedValue({ deviceId: 'device-1' });

    await expect(
      resolveDeviceDispatchAuthorizationFailure(serverDB, 'user-1', 'device-1'),
    ).resolves.toBeUndefined();
    expect(mocks.findByDeviceId).toHaveBeenCalledWith('device-1');
    expect(mocks.findWorkspaceDeviceById).not.toHaveBeenCalled();
  });

  /** @example Conversation dispatch on a revoked personal device gets the repair contract. */
  it('returns the binding-invalid contract for a missing personal device', async () => {
    // ROOT CAUSE: personal-scope conversation runs skipped the authorization
    // boundary entirely (`!workspaceId` early-returned), so the caller got a
    // bare DEVICE_NOT_FOUND with no repair path — the conversation path must
    // carry the same contract as tool calls.
    mocks.findByDeviceId.mockResolvedValue(undefined);
    mocks.queryPersonal.mockResolvedValue([{ deviceId: 'device-1' }, { deviceId: 'device-9' }]);

    await expect(
      resolveDeviceDispatchAuthorizationFailure(serverDB, 'user-1', 'device-1'),
    ).resolves.toEqual({
      code: 'DEVICE_BINDING_INVALID',
      deviceId: 'device-1',
      repairCandidates: ['device-9'],
      retryable: true,
      scope: 'personal',
    });
  });

  /** @example A visible workspace registration permits the selected device dispatch. */
  it('allows workspace dispatch while its registry row remains visible', async () => {
    mocks.findWorkspaceDeviceById.mockResolvedValue({ deviceId: 'device-1' });

    await expect(
      resolveDeviceDispatchAuthorizationFailure(serverDB, 'user-1', 'device-1', 'workspace-1'),
    ).resolves.toBeUndefined();
    expect(mocks.findWorkspaceDeviceById).toHaveBeenCalledWith('device-1');
  });

  /** @example Unshare revokes a previously selected target before its next tool call. */
  it('returns the binding-invalid contract after the workspace row is removed', async () => {
    // ROOT CAUSE:
    //
    // Target discovery was checked once, but a later tool call reused activeDeviceId directly.
    // Unshare could delete the registry row while a stale socket remained, allowing new work.
    // The dispatch boundary now rechecks the visible workspace row before every new call.
    mocks.findWorkspaceDeviceById.mockResolvedValue(undefined);

    await expect(
      resolveDeviceDispatchAuthorizationFailure(serverDB, 'user-1', 'device-1', 'workspace-1'),
    ).resolves.toEqual({
      code: 'DEVICE_BINDING_INVALID',
      deviceId: 'device-1',
      repairCandidates: [],
      retryable: true,
      scope: 'workspace',
      workspaceId: 'workspace-1',
    });
  });

  /** @example The contract's explicit-repair path carries the other selectable devices. */
  it('surfaces repair candidates so callers can render the repair path', async () => {
    mocks.findWorkspaceDeviceById.mockResolvedValue(undefined);
    mocks.queryWorkspaceDevices.mockResolvedValue([
      { deviceId: 'device-1' },
      { deviceId: 'device-2' },
      { deviceId: 'device-3' },
    ]);

    const result = await resolveDeviceDispatchAuthorizationFailure(
      serverDB,
      'user-1',
      'device-1',
      'workspace-1',
    );

    // The invalidated binding itself is not a repair option.
    expect(result?.code).toBe('DEVICE_BINDING_INVALID');
    expect(result?.repairCandidates).toEqual(['device-2', 'device-3']);
  });
});
