import type { DecryptedConnector } from '@/database/models/connector';
import type { OrviloDatabase } from '@/database/type';
import type { HttpMCPClientParams } from '@/libs/mcp';
import {
  getGitHubOAuthGrantIdentity,
  getValidGitHubAccessGrant,
  type GitHubOAuthGrantIdentity,
} from '@/server/services/githubOAuth';

export const GITHUB_MCP_CONNECTOR_IDENTIFIER = 'github-mcp';
export const GITHUB_MCP_SERVER_URL = 'https://api.githubcopilot.com/mcp/';

/** GitHub documents these headers for restricting its hosted MCP server. */
export const GITHUB_MCP_TRUSTED_HEADERS = {
  'X-MCP-Readonly': 'true',
  'X-MCP-Toolsets': 'pull_requests',
} as const;

export const isGitHubMcpConnector = (connector: Pick<DecryptedConnector, 'metadata'>): boolean =>
  connector.metadata?.githubMcp?.type === 'github_user_connection';

const grantOwner = (connector: Pick<DecryptedConnector, 'metadata'>): string => {
  const owner = connector.metadata?.githubMcp?.grantOwnerUserId;
  if (!owner) throw new Error('GitHub MCP connector has no grant owner');
  return owner;
};

export const getGitHubMcpGrantIdentity = async (input: {
  connector: Pick<DecryptedConnector, 'metadata'>;
  db: OrviloDatabase;
}): Promise<GitHubOAuthGrantIdentity | null> =>
  getGitHubOAuthGrantIdentity({ db: input.db, userId: grantOwner(input.connector) });

/**
 * Resolve a fresh token into a one-shot MCP transport. The provider marker is
 * server-owned, and both endpoint and limiting headers are constants: edits to
 * ordinary connector fields cannot widen this surface.
 */
export const buildGitHubMcpParams = async (input: {
  connector: DecryptedConnector;
  db: OrviloDatabase;
  expectedGrant?: Pick<GitHubOAuthGrantIdentity, 'githubUserId' | 'grantRevision'>;
}): Promise<HttpMCPClientParams> => {
  const grant = await getValidGitHubAccessGrant({
    db: input.db,
    expected: input.expectedGrant,
    userId: grantOwner(input.connector),
  });
  if (!grant) throw new Error('GitHub authorization is required');

  return {
    auth: { accessToken: grant.accessToken, type: 'oauth2' },
    cacheMode: 'ephemeral',
    headers: { ...GITHUB_MCP_TRUSTED_HEADERS },
    name: input.connector.identifier,
    type: 'http',
    url: GITHUB_MCP_SERVER_URL,
  };
};
