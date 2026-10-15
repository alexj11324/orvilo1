import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildGitHubMcpParams,
  findExistingGitHubMcpConnector,
  GITHUB_MCP_SERVER_URL,
  GITHUB_MCP_TRUSTED_HEADERS,
  reconcileGitHubMcpAvailability,
} from './githubMcp';

const { getGrantIdentity, getValidGrant } = vi.hoisted(() => ({
  getGrantIdentity: vi.fn(),
  getValidGrant: vi.fn(),
}));

vi.mock('@/server/services/githubOAuth', () => ({
  getGitHubOAuthGrantIdentity: getGrantIdentity,
  getValidGitHubAccessGrant: getValidGrant,
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

describe('GitHub MCP provider connector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getGrantIdentity.mockResolvedValue(identity);
    getValidGrant.mockResolvedValue({ ...identity, accessToken: 'server-only-access-token' });
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
});
