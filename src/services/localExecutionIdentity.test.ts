import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDeviceInfo: vi.fn(),
}));

vi.mock('@orvilo/const', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  isDesktop: true,
}));

vi.mock('@/services/electron/gatewayConnection', () => ({
  gatewayConnectionService: { getDeviceInfo: mocks.getDeviceInfo },
}));

describe('localExecutionIdentity', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('resolves the host device id through the handshake IPC', async () => {
    mocks.getDeviceInfo.mockResolvedValue({ deviceId: 'local-device-1' });
    const { resolveLocalExecutionIdentity } = await import('./localExecutionIdentity');

    await expect(resolveLocalExecutionIdentity()).resolves.toEqual({
      localDeviceId: 'local-device-1',
    });
    expect(mocks.getDeviceInfo).toHaveBeenCalledTimes(1);
  });

  it('caches a proven identity and deduplicates the handshake', async () => {
    mocks.getDeviceInfo.mockResolvedValue({ deviceId: 'local-device-1' });
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
      .mockResolvedValueOnce({ deviceId: 'local-device-2' });
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
});
