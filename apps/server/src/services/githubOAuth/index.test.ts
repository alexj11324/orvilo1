import { beforeEach, describe, expect, it, vi } from 'vitest';

const { saveState, consumeState, exchangeCode, getGitHubUser, refreshToken } = vi.hoisted(() => ({
  saveState: vi.fn(),
  consumeState: vi.fn(),
  exchangeCode: vi.fn(),
  getGitHubUser: vi.fn(),
  refreshToken: vi.fn(),
}));

vi.mock('./state', () => ({ saveState, consumeState }));
vi.mock('./provider', () => ({
  createPkce: () => ({ challenge: 'challenge', verifier: 'verifier' }),
  getConfig: () => ({
    clientId: 'app-client',
    clientSecret: 'secret',
    redirectUri: 'https://orvilo.test/oauth/github/callback',
  }),
  exchangeCode,
  getGitHubUser,
  refreshToken,
  GitHubOAuthTokenError: class GitHubOAuthTokenError extends Error {
    constructor(
      readonly status: number,
      readonly code?: string,
    ) {
      super('GitHub token exchange failed');
    }
  },
}));
vi.mock('@/server/modules/KeyVaultsEncrypt', () => ({
  KeyVaultsGateKeeper: {
    initWithEnvKey: async () => ({
      encrypt: async (token: string) => `encrypted:${token}`,
      decrypt: async (ciphertext: string) => ({
        plaintext: ciphertext.replace('encrypted:', ''),
        wasAuthentic: true,
      }),
    }),
  },
}));

const { GitHubOAuthTokenError } = await import('./provider');
const { startGitHubOAuth, completeGitHubOAuth, getGitHubOAuthStatus, getValidGitHubAccessToken } =
  await import('./index');

describe('GitHub OAuth flow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('binds a random state and PKCE verifier to the Orvilo user', async () => {
    const url = new URL(await startGitHubOAuth('user-one'));
    expect(url.origin).toBe('https://github.com');
    expect(url.searchParams.get('code_challenge')).toBe('challenge');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    const state = url.searchParams.get('state');
    expect(state).toMatch(/^[\w-]{40,}$/);
    expect(saveState).toHaveBeenCalledWith(state, {
      clientId: 'app-client',
      redirectUri: 'https://orvilo.test/oauth/github/callback',
      userId: 'user-one',
      verifier: 'verifier',
    });
  });

  it('rejects a replay before exchanging a code', async () => {
    consumeState.mockResolvedValue(null);
    await expect(
      completeGitHubOAuth({
        code: 'code',
        db: {} as never,
        sessionUserId: 'user-one',
        state: 'used',
      }),
    ).rejects.toThrow('Invalid or expired OAuth state');
    expect(exchangeCode).not.toHaveBeenCalled();
  });

  it('persists encrypted tokens for the state owner after GitHub identity verification', async () => {
    consumeState.mockResolvedValue({
      clientId: 'app-client',
      redirectUri: 'https://orvilo.test/oauth/github/callback',
      userId: 'user-one',
      verifier: 'verifier',
    });
    exchangeCode.mockResolvedValue({
      access_token: 'access',
      refresh_token: 'refresh',
      expires_in: 3600,
    });
    getGitHubUser.mockResolvedValue({ id: '42', login: 'owner', avatarUrl: null });
    const onConflictDoUpdate = vi.fn((_input: { set: Record<string, unknown> }) => undefined);
    const values = vi.fn((_input: Record<string, unknown>) => ({ onConflictDoUpdate }));
    const db = { insert: vi.fn(() => ({ values })) };
    await completeGitHubOAuth({
      code: 'code',
      db: db as never,
      sessionUserId: 'user-one',
      state: 'once',
    });
    expect(exchangeCode).toHaveBeenCalledWith({
      code: 'code',
      verifier: 'verifier',
      redirectUri: 'https://orvilo.test/oauth/github/callback',
    });
    expect(getGitHubUser).toHaveBeenCalledWith('access');
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-one',
        githubUserId: '42',
        accessTokenCiphertext: 'encrypted:access',
        refreshTokenCiphertext: 'encrypted:refresh',
      }),
    );
    expect(onConflictDoUpdate).toHaveBeenCalled();
    const firstRevision = values.mock.calls[0][0].grantRevision;
    expect(firstRevision).toMatch(/^[0-9a-f-]{36}$/);
    expect(onConflictDoUpdate.mock.calls[0][0].set.grantRevision).toBe(firstRevision);
    await completeGitHubOAuth({
      code: 'another-code',
      db: db as never,
      sessionUserId: 'user-one',
      state: 'another-state',
    });
    expect(values.mock.calls[1][0].grantRevision).not.toBe(firstRevision);
  });

  it('reports the active grant revision without exposing token material', async () => {
    const row = {
      clientId: 'app-client',
      login: 'owner',
      avatarUrl: null,
      grantRevision: '017b0e96-af23-453e-a561-2d969e7b978b',
      accessTokenExpiresAt: new Date(Date.now() + 60_000),
      refreshTokenCiphertext: 'encrypted:secret',
      refreshTokenExpiresAt: null,
    };
    const db = {
      select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: async () => [row] }) }) })),
    };
    expect(await getGitHubOAuthStatus({ db: db as never, userId: 'user-one' })).toEqual({
      connected: true,
      login: 'owner',
      avatarUrl: undefined,
      grantRevision: row.grantRevision,
    });
  });

  it('rejects a callback opened in a different signed-in browser before token exchange', async () => {
    consumeState.mockResolvedValue({
      clientId: 'app-client',
      redirectUri: 'https://orvilo.test/oauth/github/callback',
      userId: 'user-one',
      verifier: 'verifier',
    });
    const db = { insert: vi.fn() };
    await expect(
      completeGitHubOAuth({
        code: 'forwarded-code',
        db: db as never,
        sessionUserId: 'user-two',
        state: 'forwarded-state',
      }),
    ).rejects.toThrow('session does not match');
    expect(exchangeCode).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('treats an unusable expired grant as disconnected and never returns its token', async () => {
    const row = {
      clientId: 'app-client',
      login: 'owner',
      avatarUrl: null,
      accessTokenCiphertext: 'encrypted:expired',
      accessTokenExpiresAt: new Date(0),
      refreshTokenCiphertext: null,
      refreshTokenExpiresAt: null,
    };
    const limit = vi.fn().mockResolvedValue([row]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    const db = { select: vi.fn(() => ({ from })) };
    expect(await getGitHubOAuthStatus({ db: db as never, userId: 'user-one' })).toEqual({
      connected: false,
    });
    expect(await getValidGitHubAccessToken({ db: db as never, userId: 'user-one' })).toBeNull();
  });

  it('disconnects a rejected refresh token without deleting a newer authorization', async () => {
    const row = {
      userId: 'user-one',
      clientId: 'app-client',
      tokenVersion: 3,
      accessTokenCiphertext: 'encrypted:expired',
      accessTokenExpiresAt: new Date(0),
      refreshTokenCiphertext: 'encrypted:refresh',
      refreshTokenExpiresAt: new Date(Date.now() + 60_000),
    };
    const selectLimit = vi.fn().mockResolvedValue([row]);
    const selectWhere = vi.fn(() => ({ limit: selectLimit }));
    const claimReturning = vi.fn().mockResolvedValue([{ userId: 'user-one' }]);
    const claimWhere = vi.fn(() => ({ returning: claimReturning }));
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const db = {
      select: vi.fn(() => ({ from: () => ({ where: selectWhere }) })),
      update: vi.fn(() => ({ set: () => ({ where: claimWhere }) })),
      delete: vi.fn(() => ({ where: deleteWhere })),
    };
    refreshToken.mockRejectedValue(new GitHubOAuthTokenError(200, 'bad_refresh_token'));
    expect(await getValidGitHubAccessToken({ db: db as never, userId: 'user-one' })).toBeNull();
    expect(db.delete).toHaveBeenCalledOnce();
    expect(deleteWhere).toHaveBeenCalledOnce();
  });

  it('keeps a connection after a temporary GitHub refresh failure', async () => {
    const row = {
      userId: 'user-one',
      clientId: 'app-client',
      tokenVersion: 3,
      accessTokenCiphertext: 'encrypted:expired',
      accessTokenExpiresAt: new Date(0),
      refreshTokenCiphertext: 'encrypted:refresh',
      refreshTokenExpiresAt: new Date(Date.now() + 60_000),
    };
    const claimReturning = vi.fn().mockResolvedValue([{ userId: 'user-one' }]);
    const claimWhere = vi.fn(() => ({ returning: claimReturning }));
    const releaseWhere = vi.fn().mockResolvedValue(undefined);
    const db = {
      select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: async () => [row] }) }) })),
      update: vi
        .fn()
        .mockImplementationOnce(() => ({ set: () => ({ where: claimWhere }) }))
        .mockImplementationOnce(() => ({ set: () => ({ where: releaseWhere }) })),
      delete: vi.fn(),
    };
    refreshToken.mockRejectedValue(new GitHubOAuthTokenError(503, 'server_error'));
    await expect(
      getValidGitHubAccessToken({ db: db as never, userId: 'user-one' }),
    ).rejects.toThrow('GitHub token exchange failed');
    expect(db.delete).not.toHaveBeenCalled();
    expect(releaseWhere).toHaveBeenCalledOnce();
  });
});
