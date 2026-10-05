import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDeviceInfo: vi.fn(),
  ownerId: 'owner-A' as string | undefined,
}));

vi.mock('@orvilo/const', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  isDesktop: true,
}));

vi.mock('@/services/electron/gatewayConnection', () => ({
  gatewayConnectionService: { getDeviceInfo: mocks.getDeviceInfo },
}));

vi.mock('@/store/user', () => ({
  useUserStore: { getState: () => ({ user: mocks.ownerId ? { id: mocks.ownerId } : undefined }) },
}));

describe('localExecutionIdentity', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.ownerId = 'owner-A';
  });

  it('resolves the host device id through the handshake IPC', async () => {
    mocks.getDeviceInfo.mockResolvedValue({ deviceId: 'local-device-1', userId: 'owner-A' });
    const { resolveLocalExecutionIdentity } = await import('./localExecutionIdentity');

    await expect(resolveLocalExecutionIdentity()).resolves.toEqual({
      localDeviceId: 'local-device-1',
    });
    expect(mocks.getDeviceInfo).toHaveBeenCalledTimes(1);
  });

  it('caches a proven identity and deduplicates the handshake', async () => {
    mocks.getDeviceInfo.mockResolvedValue({ deviceId: 'local-device-1', userId: 'owner-A' });
    const { resolveLocalExecutionIdentity } = await import('./localExecutionIdentity');

    const [a, b, c] = await Promise.all([
      resolveLocalExecutionIdentity(),
      resolveLocalExecutionIdentity(),
      resolveLocalExecutionIdentity(),
    ]);
    expect(a).toEqual({ localDeviceId: 'local-device-1' });
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(mocks.getDeviceInfo).toHaveBeenCalledTimes(1);
  });

  it('treats the main-process "unknown" sentinel as unproven', async () => {
    mocks.getDeviceInfo.mockResolvedValue({ deviceId: 'unknown' });
    const { requireProvenLocalDeviceId, resolveLocalExecutionIdentity } =
      await import('./localExecutionIdentity');

    await expect(resolveLocalExecutionIdentity()).resolves.toEqual({});
    await expect(requireProvenLocalDeviceId('probe')).rejects.toMatchObject({
      code: 'TARGET_REQUIRED',
    });
  });

  it('does not cache a handshake failure — the next call retries', async () => {
    mocks.getDeviceInfo
      .mockRejectedValueOnce(new Error('ipc down'))
      .mockResolvedValueOnce({ deviceId: 'local-device-2', userId: 'owner-A' });
    const { requireProvenLocalDeviceId, resolveLocalExecutionIdentity } =
      await import('./localExecutionIdentity');

    await expect(resolveLocalExecutionIdentity()).resolves.toEqual({});
    await expect(requireProvenLocalDeviceId('probe')).resolves.toBe('local-device-2');
    expect(mocks.getDeviceInfo).toHaveBeenCalledTimes(2);
  });

  it('primes the cache from handshake evidence and rejects "unknown"', async () => {
    const { primeLocalExecutionIdentity, resolveLocalExecutionIdentity } =
      await import('./localExecutionIdentity');

    primeLocalExecutionIdentity('primed-device');
    await expect(resolveLocalExecutionIdentity()).resolves.toEqual({
      localDeviceId: 'primed-device',
    });
    expect(mocks.getDeviceInfo).not.toHaveBeenCalled();
  });

  it('requireProvenLocalDeviceId returns the proven id', async () => {
    const { primeLocalExecutionIdentity, requireProvenLocalDeviceId } =
      await import('./localExecutionIdentity');

    primeLocalExecutionIdentity('primed-device');
    await expect(requireProvenLocalDeviceId('probe')).resolves.toBe('primed-device');
  });

  it('does not reuse another account identity or a pre-login connection UUID', async () => {
    const { primeLocalExecutionIdentity, resolveLocalExecutionIdentity } =
      await import('./localExecutionIdentity');
    primeLocalExecutionIdentity('owner-A-device');
    mocks.ownerId = 'owner-B';
    mocks.getDeviceInfo.mockResolvedValue({ deviceId: 'owner-B-device', userId: 'owner-B' });
    await expect(resolveLocalExecutionIdentity()).resolves.toEqual({
      localDeviceId: 'owner-B-device',
    });
    mocks.ownerId = undefined;
    await expect(resolveLocalExecutionIdentity()).resolves.toEqual({});
    expect(mocks.getDeviceInfo).toHaveBeenCalledTimes(1);
  });

  it('rejects an IPC identity arriving after the authenticated owner changes', async () => {
    let finish!: (value: { deviceId: string; userId: string }) => void;
    mocks.getDeviceInfo.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { resolveLocalExecutionIdentity } = await import('./localExecutionIdentity');
    const pending = resolveLocalExecutionIdentity();
    mocks.ownerId = 'owner-B';
    finish({ deviceId: 'owner-A-device', userId: 'owner-A' });
    await expect(pending).resolves.toEqual({});
    mocks.getDeviceInfo.mockResolvedValue({ deviceId: 'owner-B-device', userId: 'owner-B' });
    await expect(resolveLocalExecutionIdentity()).resolves.toEqual({
      localDeviceId: 'owner-B-device',
    });
  });

  it('rejects a main-process response for a different authenticated account', async () => {
    const { resolveLocalExecutionIdentity } = await import('./localExecutionIdentity');
    mocks.ownerId = 'owner-B';
    mocks.getDeviceInfo.mockResolvedValue({ deviceId: 'owner-A-device', userId: 'owner-A' });
    await expect(resolveLocalExecutionIdentity()).resolves.toEqual({});
    mocks.getDeviceInfo.mockResolvedValue({ deviceId: 'owner-B-device', userId: 'owner-B' });
    await expect(resolveLocalExecutionIdentity()).resolves.toEqual({
      localDeviceId: 'owner-B-device',
    });
  });

  it('revalidates ownership after IPC resolves before returning to a caller', async () => {
    let finish!: (value: { deviceId: string; userId: string }) => void;
    mocks.getDeviceInfo.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { resolveLocalExecutionIdentity } = await import('./localExecutionIdentity');
    const pending = resolveLocalExecutionIdentity();
    finish({ deviceId: 'owner-A-device', userId: 'owner-A' });
    queueMicrotask(() => {
      mocks.ownerId = 'owner-B';
    });
    await expect(pending).resolves.toEqual({});
  });
});
