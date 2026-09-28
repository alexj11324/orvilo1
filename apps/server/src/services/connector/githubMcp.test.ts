import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildGitHubMcpParams,
  findExistingGitHubMcpConnector,
  GITHUB_MCP_SERVER_URL,
  GITHUB_MCP_TRUSTED_HEADERS,
  reconcileGitHubMcpAvailability,
} from './githubMcp';
import { activateGitHubMcpConnector } from './githubMcpActivation';

const {
  fetchSyncInputs,
  getGrantIdentity,
  getValidGrant,
  persistSyncInputs,
  startOAuth,
  syncTools,
} = vi.hoisted(() => ({
  fetchSyncInputs: vi.fn(),
  getGrantIdentity: vi.fn(),
  getValidGrant: vi.fn(),
  persistSyncInputs: vi.fn(),
  startOAuth: vi.fn(),
  syncTools: vi.fn(),
}));

vi.mock('@/server/services/githubOAuth', () => ({
  getGitHubOAuthGrantIdentity: getGrantIdentity,
  getValidGitHubAccessGrant: getValidGrant,
  startGitHubOAuth: startOAuth,
}));
vi.mock('./sync', () => ({
  fetchConnectorToolSyncInputs: fetchSyncInputs,
  persistConnectorToolSyncInputs: persistSyncInputs,
  syncConnectorToolsById: syncTools,
}));

const identity = {
  githubUserId: '42',
  grantRevision: '017b0e96-af23-453e-a561-2d969e7b978b',
  login: 'octocat',
};

const providerConnector = {
  credentials: null,
  id: 'connector-1',
  identifier: 'github-mcp',
  metadata: {
    githubMcp: { grantOwnerUserId: 'user-1', type: 'github_user_connection' },
  },
  name: 'GitHub',
  status: 'connected',
} as any;

const context = () => {
  const connectorModel = {
    create: vi.fn().mockResolvedValue({ id: 'connector-1' }),
    update: vi.fn(),
    updateStatus: vi.fn(),
  };
  const connectorToolModel = {};
  const txConnectorModel = {
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
  };
  const txConnectorToolModel = {};
  const ctx = {
    connectorModel,
    connectorToolModel,
    runInTransaction: vi.fn(async (callback) =>
      callback({
        connectorModel: txConnectorModel,
        connectorToolModel: txConnectorToolModel,
        serverDB: {},
      }),
    ),
    serverDB: {},
    txConnectorModel,
    txConnectorToolModel,
  };
  return ctx;
};

describe('GitHub MCP provider connector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getGrantIdentity.mockResolvedValue(identity);
    getValidGrant.mockResolvedValue({ ...identity, accessToken: 'server-only-access-token' });
    startOAuth.mockResolvedValue('https://github.com/login/oauth/authorize?state=once');
    fetchSyncInputs.mockResolvedValue([{ crudType: 'read', toolName: 'pull_request_read' }]);
    persistSyncInputs.mockResolvedValue(undefined);
    syncTools.mockResolvedValue({ toolCount: 4 });
  });

  it('builds a one-shot read-only pull_requests transport with a fresh in-memory token', async () => {
    const params = await buildGitHubMcpParams({
      connector: providerConnector,
      db: {} as never,
      expectedGrant: identity,
    });

    expect(getValidGrant).toHaveBeenCalledWith({
      db: {},
      expected: identity,
      userId: 'user-1',
    });
    expect(params).toEqual({
      auth: { accessToken: 'server-only-access-token', type: 'oauth2' },
      cacheMode: 'ephemeral',
      headers: GITHUB_MCP_TRUSTED_HEADERS,
      name: 'github-mcp',
      type: 'http',
      url: GITHUB_MCP_SERVER_URL,
    });
  });

  it('forwards the pinned identity and grant revision so a swap fails before MCP execution', async () => {
    getValidGrant.mockRejectedValueOnce(new Error('GitHub authorization changed'));

    await expect(
      buildGitHubMcpParams({
        connector: providerConnector,
        db: {} as never,
        expectedGrant: identity,
      }),
    ).rejects.toThrow('authorization changed');
    expect(getValidGrant).toHaveBeenCalledWith(
      expect.objectContaining({ expected: identity, userId: 'user-1' }),
    );
  });

  it('resolves a renamed legacy preset row by the official GitHub endpoint', () => {
    const renamed = {
      id: 'legacy-row',
      identifier: 'my-github',
      mcpServerUrl: 'HTTPS://API.GITHUBCOPILOT.COM/mcp',
    } as any;

    expect(findExistingGitHubMcpConnector([renamed])).toBe(renamed);
  });

  it('prefers the canonical connector when a legacy duplicate already exists', () => {
    const renamed = {
      identifier: 'my-github',
      mcpServerUrl: GITHUB_MCP_SERVER_URL,
    } as any;
    const canonical = {
      identifier: 'github-mcp',
      mcpServerUrl: GITHUB_MCP_SERVER_URL,
    } as any;

    expect(findExistingGitHubMcpConnector([renamed, canonical])).toBe(canonical);
  });

  it('reports a shared connector as disconnected when its recorded owner grant is gone', async () => {
    getGrantIdentity.mockResolvedValueOnce(null);

    await expect(
      reconcileGitHubMcpAvailability({ connectors: [providerConnector], db: {} as never }),
    ).resolves.toEqual([{ ...providerConnector, status: 'disconnected' }]);
    expect(getGrantIdentity).toHaveBeenCalledWith({ db: {}, userId: 'user-1' });
  });

  it('starts the existing GitHub OAuth flow when no Reviews grant exists', async () => {
    getGrantIdentity.mockResolvedValueOnce(null);
    const ctx = context();

    const result = await activateGitHubMcpConnector({
      ctx: ctx as any,
      existing: null,
      userId: 'user-1',
    });

    expect(result).toEqual({
      authorizationUrl: 'https://github.com/login/oauth/authorize?state=once',
      status: 'authorization_required',
    });
    expect(ctx.connectorModel.create).not.toHaveBeenCalled();
    expect(syncTools).not.toHaveBeenCalled();
  });

  it('creates a provider reference without persisting token material', async () => {
    const ctx = context();

    const result = await activateGitHubMcpConnector({
      ctx: ctx as any,
      existing: null,
      userId: 'user-1',
    });

    expect(result).toEqual({ connectorId: 'connector-1', status: 'connected', toolCount: 4 });
    const createInput = ctx.connectorModel.create.mock.calls[0][0];
    expect(createInput).toMatchObject({
      credentials: null,
      mcpServerUrl: GITHUB_MCP_SERVER_URL,
      metadata: {
        grantEpoch: identity.grantRevision,
        githubMcp: { grantOwnerUserId: 'user-1', type: 'github_user_connection' },
      },
      tokenExpiresAt: null,
    });
    expect(JSON.stringify(createInput)).not.toContain('server-only-access-token');
  });

  it('clears a legacy PAT and untrusted headers when activating an existing preset row', async () => {
    const ctx = context();
    const existing = {
      ...providerConnector,
      credentials: { token: 'legacy-pat', type: 'bearer' },
      identifier: 'my-github',
      metadata: {
        customHeaders: { Authorization: 'Bearer legacy-header-token' },
        description: 'GitHub connector',
      },
    };

    await activateGitHubMcpConnector({
      ctx: ctx as any,
      existing,
      userId: 'user-1',
    });

    expect(ctx.connectorModel.create).not.toHaveBeenCalled();
    expect(ctx.runInTransaction).toHaveBeenCalledOnce();
    expect(ctx.connectorModel.update).not.toHaveBeenCalled();
    expect(ctx.txConnectorModel.update).toHaveBeenCalledWith('connector-1', expect.any(Object));
    const patch = ctx.txConnectorModel.update.mock.calls[0][1];
    expect(patch.credentials).toBeNull();
    expect(patch.tokenExpiresAt).toBeNull();
    expect(patch.metadata.customHeaders).toBeUndefined();
    expect(patch.metadata.githubMcp).toEqual({
      grantOwnerUserId: 'user-1',
      type: 'github_user_connection',
    });
    expect(JSON.stringify(patch)).not.toMatch(/legacy-pat|legacy-header-token/);
  });

  it('restores a legacy PAT connector when managed synchronization fails', async () => {
    const ctx = context();
    const existing = {
      ...providerConnector,
      credentials: { token: 'legacy-pat', type: 'bearer' },
      identifier: 'my-github',
      isEnabled: true,
      mcpConnectionType: 'http',
      mcpServerUrl: GITHUB_MCP_SERVER_URL,
      metadata: { customHeaders: { Authorization: 'Bearer legacy-header-token' } },
      oidcConfig: null,
      sourceType: 'custom',
      status: 'connected',
      tokenExpiresAt: null,
    };
    persistSyncInputs.mockRejectedValueOnce(new Error('tool replacement failed'));

    await expect(
      activateGitHubMcpConnector({ ctx: ctx as any, existing, userId: 'user-1' }),
    ).rejects.toThrow('tool replacement failed');

    expect(ctx.runInTransaction).toHaveBeenCalledOnce();
    expect(ctx.connectorModel.update).not.toHaveBeenCalled();
    expect(ctx.txConnectorModel.update).toHaveBeenCalledOnce();
    expect(persistSyncInputs).toHaveBeenCalledWith(
      'connector-1',
      expect.objectContaining({ credentials: null, status: 'disconnected' }),
      expect.any(Array),
      expect.objectContaining({ connectorModel: ctx.txConnectorModel }),
    );
  });
});
