import type { DecryptedConnector } from '@/database/models/connector';
import {
  ConnectorMcpConnectionType,
  ConnectorSourceType,
  ConnectorStatus,
} from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import { getGitHubOAuthGrantIdentity, startGitHubOAuth } from '@/server/services/githubOAuth';

import { GITHUB_MCP_CONNECTOR_IDENTIFIER, GITHUB_MCP_SERVER_URL } from './githubMcp';
import { type ConnectorToolSyncContext, syncConnectorToolsById } from './sync';

interface GitHubMcpActivationContext extends ConnectorToolSyncContext {
  serverDB: OrviloDatabase;
}

/**
 * Create or reactivate the provider-backed row after the existing Reviews
 * grant is present. No token material is written to `user_connectors`.
 */
export const activateGitHubMcpConnector = async (input: {
  ctx: GitHubMcpActivationContext;
  existing: DecryptedConnector | null;
  userId: string;
}): Promise<
  | { authorizationUrl: string; status: 'authorization_required' }
  | { connectorId: string; status: 'connected'; toolCount: number }
> => {
  const identity = await getGitHubOAuthGrantIdentity({
    db: input.ctx.serverDB,
    userId: input.userId,
  });
  if (!identity) {
    return {
      authorizationUrl: await startGitHubOAuth(input.userId),
      status: 'authorization_required',
    };
  }

  const existingMetadata = input.existing?.metadata ?? {};
  const {
    composio: _composio,
    customHeaders: _customHeaders,
    githubMcp: _githubMcp,
    ...displayMetadata
  } = existingMetadata;
  const metadata = {
    ...displayMetadata,
    grantEpoch: identity.grantRevision,
    githubMcp: {
      grantOwnerUserId: input.userId,
      type: 'github_user_connection' as const,
    },
  };

  let connectorId: string;
  if (input.existing) {
    connectorId = input.existing.id;
    await input.ctx.connectorModel.update(connectorId, {
      credentials: null,
      isEnabled: true,
      mcpConnectionType: ConnectorMcpConnectionType.http,
      mcpServerUrl: GITHUB_MCP_SERVER_URL,
      mcpStdioConfig: null,
      metadata,
      name: 'GitHub',
      oidcConfig: null,
      sourceType: ConnectorSourceType.custom,
      status: ConnectorStatus.disconnected,
      tokenExpiresAt: null,
    });
  } else {
    const created = await input.ctx.connectorModel.create({
      credentials: null,
      identifier: GITHUB_MCP_CONNECTOR_IDENTIFIER,
      isEnabled: true,
      mcpConnectionType: ConnectorMcpConnectionType.http,
      mcpServerUrl: GITHUB_MCP_SERVER_URL,
      mcpStdioConfig: null,
      metadata,
      name: 'GitHub',
      oidcConfig: null,
      sourceType: ConnectorSourceType.custom,
      status: ConnectorStatus.disconnected,
      tokenExpiresAt: null,
    });
    connectorId = created.id;
  }

  const { toolCount } = await syncConnectorToolsById(connectorId, input.ctx);
  return { connectorId, status: 'connected', toolCount };
};
