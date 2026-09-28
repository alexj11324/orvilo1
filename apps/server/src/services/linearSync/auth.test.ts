import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LinearInstallationAuth, LinearTokenRefreshInProgressError } from './auth';

const model = vi.hoisted(() => ({
  claimTokenRefresh: vi.fn(),
  findInstallationForAuth: vi.fn(),
  markInstallationUnavailable: vi.fn(),
  persistTokenRefresh: vi.fn(),
  releaseTokenRefresh: vi.fn(),
}));
const refresh = vi.hoisted(() => vi.fn());

vi.mock('@/database/models/linearSync', () => ({
  LinearSyncModel: class {
    constructor() {
      Object.assign(this, model);
    }
  },
}));
vi.mock('./oauth', () => ({
  LinearOAuthError: class LinearOAuthError extends Error {
    status?: number;
    errorCode?: string;

    constructor(message: string, options: { errorCode?: string; status?: number } = {}) {
      super(message);
      this.status = options.status;
      this.errorCode = options.errorCode;
    }
  },
  getLinearOAuthConfig: () => ({ clientId: 'client-1', clientSecret: 'secret-1' }),
  normalizeLinearScopes: (scope: unknown, fallback: string[]) =>
    typeof scope === 'string' ? scope.split(' ') : fallback,
  refreshLinearAccessToken: refresh,
}));

const gateKeeper = {
  decrypt: vi.fn(async (ciphertext: string) => ({ plaintext: ciphertext.replace('cipher:', '') })),
  encrypt: vi.fn(async (plaintext: string) => `cipher:${plaintext}`),
};

const expiredInstallation = {
  accessTokenCiphertext: 'cipher:old-access',
  accessTokenExpiresAt: new Date(0),
  actor: 'app',
  oauthClientId: 'client-1',
  refreshTokenCiphertext: 'cipher:old-refresh',
  scopes: ['read', 'write'],
  status: 'active',
  tokenVersion: 3,
  workspaceId: 'workspace-1',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LinearInstallationAuth', () => {
  it('shares one refresh across concurrent catalog reads', async () => {
    model.findInstallationForAuth.mockResolvedValue(expiredInstallation);
    model.claimTokenRefresh
      .mockResolvedValueOnce({ refreshFence: 8, tokenVersion: 3 })
      .mockResolvedValue(null);
    model.persistTokenRefresh.mockResolvedValue({ tokenVersion: 4 });
    let resolveRefresh!: (tokens: {
      access_token: string;
      expires_in: number;
      refresh_token: string;
      scope: string;
    }) => void;
    refresh.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const auth = new LinearInstallationAuth('db' as never, 'workspace-1', 'installation-1', {
      gateKeeper,
      now: () => 100_000,
      refresh,
    });

    const result = Promise.all([
      auth.getAccessToken(),
      auth.getAccessToken(),
      auth.getAccessToken(),
      auth.getAccessToken(),
    ]);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    resolveRefresh({
      access_token: 'new-access',
      expires_in: 3600,
      refresh_token: 'new-refresh',
      scope: 'read write',
    });

    await expect(result).resolves.toEqual(['new-access', 'new-access', 'new-access', 'new-access']);
    expect(model.claimTokenRefresh).toHaveBeenCalledTimes(1);
    expect(model.persistTokenRefresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes once and persists the rotated refresh token behind the CAS fence', async () => {
    model.findInstallationForAuth.mockResolvedValue(expiredInstallation);
    model.claimTokenRefresh.mockResolvedValue({ refreshFence: 8, tokenVersion: 3 });
    model.persistTokenRefresh.mockResolvedValue({ tokenVersion: 4 });
    refresh.mockResolvedValue({
      access_token: 'new-access',
      expires_in: 3600,
      refresh_token: 'new-refresh',
      scope: 'read write',
    });

    const auth = new LinearInstallationAuth('db' as never, 'workspace-1', 'installation-1', {
      gateKeeper,
      now: () => 100_000,
      refresh,
    });

    await expect(auth.getAccessToken()).resolves.toBe('new-access');
    expect(model.claimTokenRefresh).toHaveBeenCalledWith(
      'installation-1',
      3,
      expect.any(String),
      120_000,
    );
    expect(refresh).toHaveBeenCalledWith({
      clientId: 'client-1',
      clientSecret: 'secret-1',
      refreshToken: 'old-refresh',
    });
    expect(model.persistTokenRefresh).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedTokenVersion: 3,
        refreshFence: 8,
        refreshTokenCiphertext: 'cipher:new-refresh',
      }),
    );
  });

  it('uses a newer fenced token when another owner won the refresh race', async () => {
    model.findInstallationForAuth.mockResolvedValueOnce(expiredInstallation).mockResolvedValueOnce({
      ...expiredInstallation,
      accessTokenCiphertext: 'cipher:winning-access',
      accessTokenExpiresAt: new Date(10_000_000),
      tokenVersion: 4,
    });
    model.claimTokenRefresh.mockResolvedValue(null);

    const auth = new LinearInstallationAuth('db' as never, 'workspace-1', 'installation-1', {
      gateKeeper,
      now: () => 100_000,
      refresh,
    });

    await expect(auth.getAccessToken()).resolves.toBe('winning-access');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not silently proceed while the previous token owner still holds the lease', async () => {
    model.findInstallationForAuth
      .mockResolvedValueOnce(expiredInstallation)
      .mockResolvedValueOnce(expiredInstallation);
    model.claimTokenRefresh.mockResolvedValue(null);

    const auth = new LinearInstallationAuth('db' as never, 'workspace-1', 'installation-1', {
      gateKeeper,
      now: () => 100_000,
      refresh,
    });

    await expect(auth.getAccessToken()).rejects.toBeInstanceOf(LinearTokenRefreshInProgressError);
  });

  it('keeps a transient response-loss failure active so the same refresh token can replay', async () => {
    model.findInstallationForAuth.mockResolvedValue(expiredInstallation);
    model.claimTokenRefresh
      .mockResolvedValueOnce({ refreshFence: 8, tokenVersion: 3 })
      .mockResolvedValueOnce({ refreshFence: 9, tokenVersion: 3 });
    model.persistTokenRefresh.mockResolvedValue({ tokenVersion: 4 });
    refresh.mockRejectedValueOnce(new Error('upstream response lost')).mockResolvedValueOnce({
      access_token: 'replayed-access',
      expires_in: 3600,
      refresh_token: 'replayed-refresh',
      scope: 'read write',
    });

    const auth = new LinearInstallationAuth('db' as never, 'workspace-1', 'installation-1', {
      gateKeeper,
      now: () => 100_000,
      refresh,
    });

    await expect(auth.getAccessToken()).rejects.toThrow('upstream response lost');
    expect(model.releaseTokenRefresh).toHaveBeenCalledWith('installation-1', expect.any(String), 8);
    expect(model.markInstallationUnavailable).not.toHaveBeenCalled();
    expect(expiredInstallation.status).toBe('active');
    expect(expiredInstallation.tokenVersion).toBe(3);

    await expect(auth.getAccessToken()).resolves.toBe('replayed-access');
    expect(refresh).toHaveBeenNthCalledWith(2, {
      clientId: 'client-1',
      clientSecret: 'secret-1',
      refreshToken: 'old-refresh',
    });
    expect(model.persistTokenRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ expectedTokenVersion: 3, refreshFence: 9 }),
    );
  });

  it('does not revoke the user grant for a refresh 401 invalid_client response', async () => {
    model.findInstallationForAuth.mockResolvedValue(expiredInstallation);
    model.claimTokenRefresh.mockResolvedValue({ refreshFence: 8, tokenVersion: 3 });
    refresh.mockRejectedValue(
      new (await import('./oauth')).LinearOAuthError('client rejected', {
        errorCode: 'invalid_client',
        status: 401,
      }),
    );

    const auth = new LinearInstallationAuth('db' as never, 'workspace-1', 'installation-1', {
      gateKeeper,
      now: () => 100_000,
      refresh,
    });

    await expect(auth.getAccessToken()).rejects.toThrow('client rejected');
    expect(model.markInstallationUnavailable).toHaveBeenCalledWith('installation-1', {
      message: 'client rejected',
      reason: 'refresh_client_rejected',
      status: 'error',
    });
  });

  it('revokes only when Linear explicitly reports invalid_grant', async () => {
    model.findInstallationForAuth.mockResolvedValue(expiredInstallation);
    model.claimTokenRefresh.mockResolvedValue({ refreshFence: 8, tokenVersion: 3 });
    refresh.mockRejectedValue(
      new (await import('./oauth')).LinearOAuthError('grant revoked', {
        errorCode: 'invalid_grant',
        status: 400,
      }),
    );

    const auth = new LinearInstallationAuth('db' as never, 'workspace-1', 'installation-1', {
      gateKeeper,
      now: () => 100_000,
      refresh,
    });

    await expect(auth.getAccessToken()).rejects.toThrow('grant revoked');
    expect(model.markInstallationUnavailable).toHaveBeenCalledWith('installation-1', {
      message: 'grant revoked',
      reason: 'refresh_token_revoked',
      status: 'revoked',
    });
  });

  it('marks a refresh 403 as an installation error without revoking the grant', async () => {
    model.findInstallationForAuth.mockResolvedValue(expiredInstallation);
    model.claimTokenRefresh.mockResolvedValue({ refreshFence: 8, tokenVersion: 3 });
    refresh.mockRejectedValue(
      new (await import('./oauth')).LinearOAuthError('forbidden', { status: 403 }),
    );

    const auth = new LinearInstallationAuth('db' as never, 'workspace-1', 'installation-1', {
      gateKeeper,
      now: () => 100_000,
      refresh,
    });

    await expect(auth.getAccessToken()).rejects.toThrow('forbidden');
    expect(model.markInstallationUnavailable).toHaveBeenCalledWith('installation-1', {
      message: 'forbidden',
      reason: 'refresh_permission_denied',
      status: 'error',
    });
  });

  it('stops provider authentication for a revoked installation', async () => {
    model.findInstallationForAuth.mockResolvedValue({
      ...expiredInstallation,
      status: 'revoked',
    });

    const auth = new LinearInstallationAuth('db' as never, 'workspace-1', 'installation-1', {
      gateKeeper,
      now: () => 100_000,
      refresh,
    });

    await expect(auth.getAccessToken()).rejects.toThrow('revoked');
    expect(refresh).not.toHaveBeenCalled();
    expect(model.claimTokenRefresh).not.toHaveBeenCalled();
  });
});
