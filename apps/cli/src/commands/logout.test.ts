import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearCredentials, loadCredentials } from '../auth/credentials';
import { stopDaemon } from '../daemon/manager';
import { saveActiveWorkspace } from '../settings';
import { log } from '../utils/logger';
import { registerLogoutCommand } from './logout';

vi.mock('../auth/credentials', () => ({
  clearCredentials: vi.fn(),
  loadCredentials: vi.fn(),
}));

vi.mock('../daemon/manager', () => ({
  stopDaemon: vi.fn(),
}));

vi.mock('../settings', () => ({
  saveActiveWorkspace: vi.fn(),
  resolveServerUrl: vi.fn(() => 'https://server.test'),
}));

describe('logout command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = 0;
    vi.mocked(loadCredentials).mockReturnValue(null);
    vi.mocked(stopDaemon).mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.exitCode = 0;
  });

  function createProgram() {
    const program = new Command();
    program.exitOverride();
    registerLogoutCommand(program);
    return program;
  }

  it('cleans up and reports unknown revocation after a server holds the request until its deadline', async () => {
    vi.useFakeTimers();
    vi.mocked(loadCredentials).mockReturnValue({ accessToken: 'access', refreshToken: 'refresh' });
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
      const abort = new AbortController();
      setTimeout(() => abort.abort(new DOMException('Deadline', 'TimeoutError')), milliseconds);
      return abort.signal;
    });
    const aborted = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, options) =>
          new Promise((_resolve, reject) =>
            options.signal?.addEventListener(
              'abort',
              () => {
                aborted();
                reject(options.signal.reason);
              },
              { once: true },
            ),
          ),
      ),
    );
    let completed = false;
    const logout = createProgram()
      .parseAsync(['node', 'test', 'logout'])
      .then(() => {
        completed = true;
      });
    await vi.advanceTimersByTimeAsync(9_999);
    expect(completed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(completed).toBe(true);
    await logout;
    expect(timeout).toHaveBeenCalledWith(10_000);
    expect(aborted).toHaveBeenCalledOnce();
    expect(stopDaemon).toHaveBeenCalled();
    expect(clearCredentials).toHaveBeenCalled();
    expect(saveActiveWorkspace).toHaveBeenCalledWith(null);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('revocation failed'));
    expect(process.exitCode).toBe(1);
  });

  it('should log success when credentials are removed', async () => {
    vi.mocked(clearCredentials).mockReturnValue(true);

    const program = createProgram();
    await program.parseAsync(['node', 'test', 'logout']);

    expect(clearCredentials).toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('Logged out'));
  });

  it('revokes the refresh grant before removing credentials', async () => {
    vi.mocked(loadCredentials).mockReturnValue({ accessToken: 'access', refreshToken: 'refresh' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    await createProgram().parseAsync(['node', 'test', 'logout']);
    expect(fetch).toHaveBeenCalledWith(
      new URL('https://server.test/oidc/token/revocation'),
      expect.objectContaining({
        body: new URLSearchParams({
          client_id: 'orvilo-cli',
          token: 'refresh',
          token_type_hint: 'refresh_token',
        }),
      }),
    );
    expect(clearCredentials).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('reports failed remote revocation while cleaning up locally', async () => {
    vi.mocked(loadCredentials).mockReturnValue({ accessToken: 'access', refreshToken: 'refresh' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await createProgram().parseAsync(['node', 'test', 'logout']);
    expect(clearCredentials).toHaveBeenCalled();
    expect(stopDaemon).toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('revocation failed'));
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
    vi.unstubAllGlobals();
  });

  // The scope belongs to the account that set it; the next login may be someone
  // else, and a leftover scope would claim a workspace they aren't a member of.
  it('should clear the persisted workspace scope', async () => {
    vi.mocked(clearCredentials).mockReturnValue(true);

    await createProgram().parseAsync(['node', 'test', 'logout']);

    expect(saveActiveWorkspace).toHaveBeenCalledWith(null);
  });

  it('should log already logged out when no credentials', async () => {
    vi.mocked(clearCredentials).mockReturnValue(false);

    const program = createProgram();
    await program.parseAsync(['node', 'test', 'logout']);

    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('Already logged out'));
  });

  it('should stop the connect daemon before clearing credentials', async () => {
    vi.mocked(stopDaemon).mockReturnValue(true);
    vi.mocked(clearCredentials).mockReturnValue(true);

    const program = createProgram();
    await program.parseAsync(['node', 'test', 'logout']);

    expect(stopDaemon).toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('Disconnected device daemon'));
  });

  it('should still attempt daemon teardown when no credentials exist', async () => {
    vi.mocked(clearCredentials).mockReturnValue(false);

    const program = createProgram();
    await program.parseAsync(['node', 'test', 'logout']);

    expect(stopDaemon).toHaveBeenCalled();
  });
});
