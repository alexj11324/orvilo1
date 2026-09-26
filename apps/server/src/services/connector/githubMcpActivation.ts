import type { DecryptedConnector } from '@/database/models/connector';
import {
  ConnectorMcpConnectionType,
  ConnectorSourceType,
  ConnectorStatus,
} from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import { getGitHubOAuthGrantIdentity, startGitHubOAuth } from '@/server/services/githubOAuth';

import { GITHUB_MCP_CONNECTOR_IDENTIFIER, GITHUB_MCP_SERVER_URL } from './githubMcp';
import {
  type ConnectorToolSyncContext,
  fetchConnectorToolSyncInputs,
  persistConnectorToolSyncInputs,
  syncConnectorToolsById,
} from './sync';

interface GitHubMcpActivationContext extends ConnectorToolSyncContext {
  runInTransaction: <T>(callback: (ctx: ConnectorToolSyncContext) => Promise<T>) => Promise<T>;
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
    const managedPatch = {
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
    };
    const managedConnector = { ...input.existing, ...managedPatch } as DecryptedConnector;
    const syncInputs = await fetchConnectorToolSyncInputs(managedConnector, input.ctx);
    await input.ctx.runInTransaction(async (txCtx) => {
      await txCtx.connectorModel.update(connectorId, managedPatch);
      await persistConnectorToolSyncInputs(connectorId, managedConnector, syncInputs, txCtx);
    });
    return { connectorId, status: 'connected', toolCount: syncInputs.length };
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
