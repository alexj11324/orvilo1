import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const {
  mockConnectorConstructor,
  mockConsume,
  mockExchange,
  mockFindById,
  mockGetMember,
  mockSync,
  mockToolConstructor,
  mockUpdate,
} = vi.hoisted(() => ({
  mockConnectorConstructor: vi.fn(),
  mockConsume: vi.fn(),
  mockExchange: vi.fn(),
  mockFindById: vi.fn(),
  mockGetMember: vi.fn(),
  mockSync: vi.fn(),
  mockToolConstructor: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock('@/database/server', () => ({ serverDB: {} }));
vi.mock('@/envs/app', () => ({ appEnv: { APP_URL: 'https://app.example.com' } }));
vi.mock('@/server/modules/KeyVaultsEncrypt', () => ({
  KeyVaultsGateKeeper: { initWithEnvKey: vi.fn().mockResolvedValue({}) },
}));
vi.mock('@modelcontextprotocol/sdk/client/auth.js', () => ({
  discoverAuthorizationServerMetadata: vi
    .fn()
    .mockResolvedValue({ token_endpoint: 'https://as/token' }),
}));
vi.mock('@/server/services/connector/oauth', () => ({
  exchangeConnectorCode: mockExchange,
}));
vi.mock('@/server/services/connector/tokens', () => ({
  tokensToCredentials: vi
    .fn()
    .mockReturnValue({ credentials: { accessToken: 'tok', type: 'oauth2' }, tokenExpiresAt: null }),
}));
vi.mock('@/server/services/connector/stateStore', () => ({
  consumeConnectorOAuthState: mockConsume,
}));
vi.mock('@/database/models/connector', () => ({
  ConnectorModel: vi.fn(function (...args: unknown[]) {
    mockConnectorConstructor(...args);
    return { findById: mockFindById, update: mockUpdate };
  }),
}));
vi.mock('@/database/models/connectorTool', () => ({
  ConnectorToolModel: vi.fn(function (...args: unknown[]) {
    mockToolConstructor(...args);
  }),
}));
vi.mock('@/database/models/workspaceMember', () => ({
  WorkspaceMemberModel: vi.fn(function () {
    return { getMember: mockGetMember };
  }),
}));
vi.mock('@/server/services/connector/sync', () => ({ syncConnectorToolsById: mockSync }));

const makeReq = () =>
  ({ nextUrl: { searchParams: new URLSearchParams('code=abc&state=xyz') } }) as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockConsume.mockResolvedValue({
    authorizationServerUrl: 'https://as',
    codeVerifier: 'v',
    connectorId: 'c1',
    orviloUserId: 'u1',
    workspaceId: 'w1',
  });
  mockFindById.mockResolvedValue({
    id: 'c1',
    mcpServerUrl: 'https://mcp.example.com',
    oidcConfig: {
      clientId: 'cid',
      redirectUri: 'https://app.example.com/oauth/connector/callback',
    },
    userId: 'u1',
  });
  mockExchange.mockResolvedValue({ access_token: 'tok' });
  mockGetMember.mockResolvedValue({ role: 'member' });
  mockUpdate.mockResolvedValue(undefined);
});

describe('connector OAuth callback', () => {
  it('reports synced:false when auth succeeds but tool sync fails', async () => {
    mockSync.mockRejectedValue(new Error('mcp down'));

    const body = await (await GET(makeReq())).text();

    expect(body).toContain('"success":true');
    expect(body).toContain('"synced":false');
    expect(mockConnectorConstructor).toHaveBeenCalledWith({}, 'u1', 'w1', {});
    expect(mockToolConstructor).toHaveBeenCalledWith({}, 'u1', 'w1');
  });

  it('reports synced:true when auth and tool sync both succeed', async () => {
    mockSync.mockResolvedValue({ toolCount: 5 });

    const body = await (await GET(makeReq())).text();

    expect(body).toContain('"success":true');
    expect(body).toContain('"synced":true');
  });

  it('rejects a user whose live workspace role no longer permits writes', async () => {
    mockGetMember.mockResolvedValue({ role: 'viewer' });

    const body = await (await GET(makeReq())).text();

    expect(body).toContain('workspace_access_denied');
    expect(mockExchange).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects a member authorizing another creator's workspace connector", async () => {
    mockFindById.mockResolvedValue({
      id: 'c1',
      mcpServerUrl: 'https://mcp.example.com',
      oidcConfig: {
        clientId: 'cid',
        redirectUri: 'https://app.example.com/oauth/connector/callback',
      },
      userId: 'u2',
    });

    const body = await (await GET(makeReq())).text();

    expect(body).toContain('workspace_access_denied');
    expect(mockExchange).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("allows a workspace owner to authorize another creator's connector", async () => {
    mockFindById.mockResolvedValue({
      id: 'c1',
      mcpServerUrl: 'https://mcp.example.com',
      oidcConfig: {
        clientId: 'cid',
        redirectUri: 'https://app.example.com/oauth/connector/callback',
      },
      userId: 'u2',
    });
    mockGetMember.mockResolvedValue({ role: 'owner' });
    mockSync.mockResolvedValue({ toolCount: 5 });

    const body = await (await GET(makeReq())).text();

    expect(body).toContain('"success":true');
    expect(mockUpdate).toHaveBeenCalledOnce();
  });

  it('rechecks workspace authorization after exchange before persisting credentials', async () => {
    mockGetMember.mockResolvedValueOnce({ role: 'member' }).mockResolvedValueOnce(undefined);

    const body = await (await GET(makeReq())).text();

    expect(body).toContain('workspace_access_denied');
    expect(mockExchange).toHaveBeenCalledOnce();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
