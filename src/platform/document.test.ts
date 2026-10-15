import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDesktopHostPort } from './desktop';
import { getHostPort, setHostPortForTesting } from './host';
import { createWebHostPort } from './web';

const mocks = vi.hoisted(() => ({
  exportMarkdown: vi.fn(),
  remoteServerUrl: vi.fn(),
  state: { dataSyncConfig: { storageMode: 'selfHost' } },
}));

vi.mock('@/services/electron/autoUpdate', () => ({ autoUpdateService: {} }));
vi.mock('@/services/electron/desktopExportService', () => ({
  desktopExportService: { exportMarkdown: mocks.exportMarkdown },
}));
vi.mock('@/services/electron/desktopNotification', () => ({ desktopNotificationService: {} }));
vi.mock('@/services/electron/gatewayConnection', () => ({ gatewayConnectionService: {} }));
vi.mock('@/services/electron/openInApp', () => ({ electronOpenInAppService: {} }));
vi.mock('@/services/electron/settings', () => ({ desktopSettingsService: {} }));
vi.mock('@/services/electron/system', () => ({ electronSystemService: {} }));
vi.mock('@/services/electron/tray', () => ({ desktopTrayService: {} }));
vi.mock('@/store/electron', () => ({ getElectronStoreState: () => mocks.state }));
vi.mock('@/store/electron/selectors', () => ({
  electronSyncSelectors: { remoteServerUrl: mocks.remoteServerUrl },
}));

afterEach(() => {
  setHostPortForTesting(undefined);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('document host actions', () => {
  it('fails closed when no host has registered', async () => {
    await expect(getHostPort().document.resolveLink('/pages/a')).resolves.toMatchObject({
      capability: 'link.resolvePublic',
      status: 'unsupported',
    });
    await expect(
      getHostPort().document.exportMarkdown({ content: '# A', fileName: 'A.md' }),
    ).resolves.toMatchObject({ capability: 'file.exportText', status: 'unsupported' });
  });

  it('resolves web links against the browser origin', async () => {
    const host = createWebHostPort();
    expect(host.has('link.resolvePublic')).toBe(true);
    await expect(host.document.resolveLink('/pages/a')).resolves.toBe(
      `${window.location.origin}/pages/a`,
    );
    expect(mocks.remoteServerUrl).not.toHaveBeenCalled();
  });

  it('reads the current configured desktop public origin on each action', async () => {
    mocks.remoteServerUrl
      .mockReturnValueOnce('https://first.example')
      .mockReturnValueOnce('https://second.example');
    const host = createDesktopHostPort();
    await expect(host.document.resolveLink('/pages/a')).resolves.toBe(
      'https://first.example/pages/a',
    );
    await expect(host.document.resolveLink('/pages/a')).resolves.toBe(
      'https://second.example/pages/a',
    );
    expect(mocks.remoteServerUrl).toHaveBeenCalledWith(mocks.state);
  });

  it('delegates desktop save, cancellation and failure to the real service owner', async () => {
    const host = createDesktopHostPort();
    const options = { content: '# 雪\n', fileName: '雪.md' };
    mocks.exportMarkdown.mockResolvedValueOnce({ canceled: true });
    await expect(host.document.exportMarkdown(options)).resolves.toEqual({ canceled: true });
    expect(mocks.exportMarkdown).toHaveBeenCalledWith(options);
    mocks.exportMarkdown.mockRejectedValueOnce(new Error('save failed'));
    await expect(host.document.exportMarkdown(options)).rejects.toThrow('save failed');
  });

  it.each([false, true])(
    'cleans up browser download resources when click fails: %s',
    async (fail) => {
      const createObjectURL = vi.fn((_blob: Blob) => 'blob:markdown');
      const revokeObjectURL = vi.fn();
      vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
      let clicked: HTMLAnchorElement | undefined;
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        clicked = document.querySelector<HTMLAnchorElement>('a[download]') ?? undefined;
        expect(document.body.contains(this)).toBe(true);
        if (fail) throw new Error('download failed');
      });
      const promise = createWebHostPort().document.exportMarkdown({
        content: '# 雪\n',
        fileName: '雪.md',
      });
      if (fail) await expect(promise).rejects.toThrow('download failed');
      else await expect(promise).resolves.toEqual({ canceled: false });
      expect(clicked?.download).toBe('雪.md');
      expect(clicked?.isConnected).toBe(false);
      expect(createObjectURL.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
      expect((createObjectURL.mock.calls[0]?.[0] as Blob).type).toBe('text/markdown');
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:markdown');
      expect(mocks.exportMarkdown).not.toHaveBeenCalled();
    },
  );
});
