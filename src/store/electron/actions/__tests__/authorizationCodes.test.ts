import { describe, expect, it, vi } from 'vitest';

import { ElectronRemoteServerActionImpl } from '../sync';

const service = vi.hoisted(() => ({
  getRemoteServerConfig: vi.fn().mockResolvedValue({ storageMode: 'cloud' }),
  requestAuthorization: vi.fn(),
  setRemoteServerConfig: vi.fn(),
}));
vi.mock('@/services/electron/remoteServer', () => ({ remoteServerService: service }));
vi.mock('@/store/user', () => ({ useUserStore: {} }));

describe('desktop authorization code propagation', () => {
  it('rejects an empty self-hosted server URL with invalid_url', async () => {
    const action = new ElectronRemoteServerActionImpl(vi.fn() as any, (() => ({})) as any);
    await expect(
      action.connectRemoteServer({ storageMode: 'selfHost', remoteServerUrl: '' }),
    ).rejects.toMatchObject({ code: 'invalid_url' });
  });

  it.each(['timeout', 'network', 'invalid_url', 'denied', 'server_error'])(
    'preserves %s on the rejected error and stored failure',
    async (code) => {
      service.requestAuthorization.mockResolvedValue({
        code,
        error: 'Localized text',
        success: false,
      });
      const set = vi.fn();
      const get = () => ({ clearRemoteServerSyncError: vi.fn(), refreshServerConfig: vi.fn() });
      const action = new ElectronRemoteServerActionImpl(set as any, get as any);
      await expect(action.connectRemoteServer({ storageMode: 'cloud' })).rejects.toMatchObject({
        code,
      });
      expect(set).toHaveBeenCalledWith({
        remoteServerSyncError: { code, message: 'Localized text', type: 'AUTH_ERROR' },
      });
    },
  );
});
