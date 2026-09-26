import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const mocks = vi.hoisted(() => ({
  canManageInstallation: vi.fn(),
  consume: vi.fn(),
  exchange: vi.fn(),
  validate: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('@/database/server', () => ({ serverDB: {} }));
vi.mock('@/envs/app', () => ({ appEnv: { APP_URL: 'https://orvilo.example' } }));
vi.mock('@/server/modules/KeyVaultsEncrypt', () => ({
  KeyVaultsGateKeeper: {
    initWithEnvKey: vi.fn().mockResolvedValue({
      encrypt: vi.fn(async (value: string) => `cipher:${value}`),
    }),
  },
}));
vi.mock('@/server/services/linearSync/oauthState', () => ({
  consumeLinearOAuthState: mocks.consume,
}));
vi.mock('@/server/services/workspacePermission', () => ({
  hasWorkspaceScopedPermission: mocks.canManageInstallation,
}));
vi.mock('@/server/services/linearSync/oauth', () => ({
  exchangeLinearAuthorizationCode: mocks.exchange,
  getLinearOAuthConfig: vi.fn(() => ({ clientId: 'client-1', scopes: ['read', 'write'] })),
  normalizeLinearScopes: vi.fn((_scope: unknown, fallback: string[]) => fallback),
  validateLinearOAuthInstallation: mocks.validate,
}));
vi.mock('@/database/models/linearSync', () => ({
  LinearSyncModel: class {
    upsertOAuthInstallation = mocks.upsert;
  },
}));

describe('Linear OAuth callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canManageInstallation.mockResolvedValue(true);
    mocks.consume.mockResolvedValue({
      actor: 'app',
      clientId: 'client-1',
      codeVerifier: 'verifier-1',
      lobeUserId: 'user-1',
      redirectUri: 'https://orvilo.example/oauth/linear/callback',
      scopes: ['read', 'write'],
      workspaceId: 'workspace-1',
    });
    mocks.exchange.mockResolvedValue({
      access_token: 'access-secret',
      expires_in: 3600,
      refresh_token: 'refresh-secret',
      scope: 'read write',
    });
    mocks.validate.mockResolvedValue({
      appActorId: 'app-user-1',
      appActorName: 'Orvilo',
      organizationId: 'org-1',
      organizationName: 'Acme',
    });
    mocks.upsert.mockResolvedValue({ id: 'installation-1' });
  });

  it('keeps tokens server-side and persists only provider-validated identity', async () => {
    const response = await GET(
      new NextRequest('https://orvilo.example/oauth/linear/callback?code=code-1&state=state-1'),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).not.toContain('access-secret');
    expect(body).not.toContain('refresh-secret');
    expect(mocks.exchange).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'code-1', codeVerifier: 'verifier-1' }),
    );
    expect(mocks.validate).toHaveBeenCalledWith({
      accessToken: 'access-secret',
    });
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        appActorId: 'app-user-1',
        installedByUserId: 'user-1',
        organizationId: 'org-1',
        refreshTokenCiphertext: 'cipher:refresh-secret',
      }),
    );
  });

  it('rechecks live workspace settings permission before exchanging the code', async () => {
    mocks.canManageInstallation.mockResolvedValue(false);

    const response = await GET(
      new NextRequest('https://orvilo.example/oauth/linear/callback?code=code-1&state=state-1'),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('workspace_access_denied');
    expect(mocks.canManageInstallation).toHaveBeenCalledWith({
      action: 'WORKSPACE_SETTINGS_UPDATE',
      db: {},
      scopes: ['ALL'],
      userId: 'user-1',
      workspaceId: 'workspace-1',
    });
    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('rechecks permission again before persisting a completed exchange', async () => {
    mocks.canManageInstallation.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const response = await GET(
      new NextRequest('https://orvilo.example/oauth/linear/callback?code=code-1&state=state-1'),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('workspace_access_denied');
    expect(mocks.exchange).toHaveBeenCalledOnce();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
