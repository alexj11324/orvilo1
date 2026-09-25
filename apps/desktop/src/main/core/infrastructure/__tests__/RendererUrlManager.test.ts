import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPathExistsSync = vi.fn();
const mockProtocolHandle = vi.fn();
const mockGetPath = vi.fn((_name: string) => '/instance/ud-10');
const mockStatSync = vi.fn((_file: string): { mtimeMs: number } => {
  throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
});
const mockReadFileSync = vi.fn();

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => mockGetPath(name),
    isReady: vi.fn(() => true),
    whenReady: vi.fn(() => Promise.resolve()),
  },
  net: {
    fetch: vi.fn(),
  },
  protocol: {
    handle: mockProtocolHandle,
  },
}));

vi.mock('node:fs', () => ({
  existsSync: (...args: any[]) => mockPathExistsSync(...args),
  readFileSync: (...args: any[]) => mockReadFileSync(...args),
  // No dev renderer override file unless a test provides one.
  statSync: (file: string) => mockStatSync(file),
}));

vi.mock('@/const/dir', () => ({
  rendererDir: '/mock/export/out',
  // Captured before pre-app-init applies the per-instance path — must not be used.
  userDataDir: '/stale/default-user-data',
}));

let mockIsDev = false;

vi.mock('@/const/env', () => ({
  get isDev() {
    return mockIsDev;
  },
}));

vi.mock('@/env', () => ({
  getDesktopEnv: vi.fn(() => ({ DESKTOP_RENDERER_STATIC: false })),
}));

describe('RendererUrlManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathExistsSync.mockReset();
    mockProtocolHandle.mockReset();
    mockIsDev = false;
    delete process.env['ELECTRON_RENDERER_URL'];
  });

  describe('resolveRendererFilePath', () => {
    it('should resolve asset requests directly', async () => {
      const { RendererUrlManager } = await import('../RendererUrlManager');
      const manager = new RendererUrlManager();

      mockPathExistsSync.mockImplementation(
        (p: string) => p === '/mock/export/out/en-US__0__light.txt',
      );

      const resolved = await manager.resolveRendererFilePath(
        new URL('app://renderer/en-US__0__light.txt'),
      );

      expect(resolved).toBe('/mock/export/out/en-US__0__light.txt');
    });

    it('should fall back to index.html for app routes', async () => {
      const { RendererUrlManager } = await import('../RendererUrlManager');
      const manager = new RendererUrlManager();

      mockPathExistsSync.mockImplementation(
        (p: string) => p === '/mock/export/out/apps/desktop/index.html',
      );

      const resolved = await manager.resolveRendererFilePath(new URL('app://renderer/settings'));

      expect(resolved).toBe('/mock/export/out/apps/desktop/index.html');
    });
  });

  describe('buildRendererUrl', () => {
    it('always returns app://renderer regardless of dev/prod', async () => {
      const { RendererUrlManager } = await import('../RendererUrlManager');
      const prodManager = new RendererUrlManager();
      expect(prodManager.buildRendererUrl('/')).toBe('app://renderer/');
      expect(prodManager.buildRendererUrl('/settings')).toBe('app://renderer/settings');

      mockIsDev = true;
      process.env['ELECTRON_RENDERER_URL'] = 'http://localhost:5173';
      const devManager = new RendererUrlManager();
      expect(devManager.buildRendererUrl('/')).toBe('app://renderer/');
      expect(devManager.buildRendererUrl('/settings')).toBe('app://renderer/settings');
    });

    it('prefixes a slash when the input lacks one', async () => {
      const { RendererUrlManager } = await import('../RendererUrlManager');
      const manager = new RendererUrlManager();
      expect(manager.buildRendererUrl('settings')).toBe('app://renderer/settings');
    });
  });

  describe('configureRendererLoader', () => {
    it('registers the app:// protocol handler in prod', async () => {
      mockIsDev = false;
      const { RendererUrlManager } = await import('../RendererUrlManager');
      const manager = new RendererUrlManager();
      manager.configureRendererLoader();

      expect(mockProtocolHandle).toHaveBeenCalledTimes(1);
      expect(mockProtocolHandle.mock.calls[0][0]).toBe('app');
    });

    it('registers the app:// protocol handler in dev (Vite fallback)', async () => {
      mockIsDev = true;
      process.env['ELECTRON_RENDERER_URL'] = 'http://localhost:5173';

      const { RendererUrlManager } = await import('../RendererUrlManager');
      const manager = new RendererUrlManager();
      manager.configureRendererLoader();

      expect(mockProtocolHandle).toHaveBeenCalledTimes(1);
      expect(mockProtocolHandle.mock.calls[0][0]).toBe('app');
    });

    it('reads the dev renderer override from the live userData path', async () => {
      mockIsDev = true;
      process.env['ELECTRON_RENDERER_URL'] = 'http://127.0.0.1:5183';
      mockStatSync.mockImplementation((file: string) => {
        if (file === '/instance/ud-10/dev-renderer-url') return { mtimeMs: 1 };
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });
      mockReadFileSync.mockReturnValue('http://127.0.0.1:5554\n');
      const fetchMock = vi.fn(async () => new Response('ok'));
      vi.stubGlobal('fetch', fetchMock);

      const { RendererUrlManager } = await import('../RendererUrlManager');
      const manager = new RendererUrlManager();
      manager.configureRendererLoader();
      const handler = mockProtocolHandle.mock.calls[0][1];
      await handler({ headers: new Headers(), method: 'GET', url: 'app://renderer/src/x.ts' });

      expect(fetchMock.mock.calls[0]![0]).toBe('http://127.0.0.1:5554/src/x.ts');
      vi.unstubAllGlobals();
    });

    it('still registers in dev when ELECTRON_RENDERER_URL is missing (static fallback)', async () => {
      mockIsDev = true;
      const { RendererUrlManager } = await import('../RendererUrlManager');
      const manager = new RendererUrlManager();
      manager.configureRendererLoader();

      expect(mockProtocolHandle).toHaveBeenCalledTimes(1);
    });

    it('uses static fallback when DESKTOP_RENDERER_STATIC overrides ELECTRON_RENDERER_URL', async () => {
      mockIsDev = true;
      process.env['ELECTRON_RENDERER_URL'] = 'http://localhost:5173';

      const { getDesktopEnv } = await import('@/env');
      vi.mocked(getDesktopEnv).mockReturnValue({ DESKTOP_RENDERER_STATIC: true } as any);

      const { RendererUrlManager } = await import('../RendererUrlManager');
      const manager = new RendererUrlManager();
      manager.configureRendererLoader();

      expect(manager.buildRendererUrl('/')).toBe('app://renderer/');
      expect(mockProtocolHandle).toHaveBeenCalledTimes(1);
    });
  });
});
