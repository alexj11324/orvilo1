import type { ConnectorModel, DecryptedConnector } from '@/database/models/connector';
import type { ConnectorCredentials } from '@/database/schemas';
import { ConnectorMcpConnectionType } from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import type { AuthConfig } from '@/libs/mcp';
import type { mcpService } from '@/server/services/mcp';

import { buildGitHubMcpParams, isGitHubMcpConnector } from './githubMcp';
import { ensureFreshConnectorToken } from './tokens';

export interface ConnectorToolSyncContext {
  connectorModel: ConnectorModel;
  serverDB: OrviloDatabase;
}

/** Build the MCP client connection params (with auth) from a connector row. */
export const buildConnectorMcpParams = (
  connector: DecryptedConnector,
): Parameters<typeof mcpService.listRawTools>[0] => {
  if (connector.mcpConnectionType === ConnectorMcpConnectionType.stdio) {
    if (!connector.mcpStdioConfig) throw new Error('Missing stdio config');
    return {
      args: connector.mcpStdioConfig.args ?? [],
      command: connector.mcpStdioConfig.command,
      env: connector.mcpStdioConfig.env,
      name: connector.name,
      type: 'stdio',
    };
  }
  if (!connector.mcpServerUrl) throw new Error('Connector has no MCP server URL configured');
  const { auth, headers } = buildHttpAuthFromCredentials(connector.credentials);
  // Custom headers live in `metadata.customHeaders` (plaintext, independent of
  // the single-kind `credentials` column) so they can coexist with any auth
  // type. Merge them on top of any header-type credential headers (older rows
  // stored custom headers as a 'header' credential before this split).
  const customHeaders = connector.metadata?.customHeaders as Record<string, string> | undefined;
  const mergedHeaders = headers || customHeaders ? { ...headers, ...customHeaders } : undefined;
  return {
    auth,
    headers: mergedHeaders,
    name: connector.name,
    type: 'http',
    url: connector.mcpServerUrl,
  };
};

/**
 * Map stored credentials into the HTTP MCP client's auth config + custom headers.
 *
 * The MCP client only understands `bearer`/`oauth2` auth (both become an
 * `Authorization: Bearer …` header), so:
 * - bearer / apikey → bearer auth
 * - header          → passed through verbatim as request headers
 */
export const buildHttpAuthFromCredentials = (
  credentials: ConnectorCredentials | null,
): { auth?: AuthConfig; headers?: Record<string, string> } => {
  if (!credentials) return {};

  switch (credentials.type) {
    case 'oauth2': {
      return {
        auth: {
          accessToken: credentials.accessToken,
          clientId: undefined,
          clientSecret: credentials.clientSecret,
          refreshToken: credentials.refreshToken,
          tokenExpiresAt: credentials.expiresAt,
          type: 'oauth2',
        },
      };
    }
    case 'bearer': {
      return { auth: { token: credentials.token, type: 'bearer' } };
    }
    case 'apikey': {
      return { auth: { token: credentials.apiKey, type: 'bearer' } };
    }
    case 'header': {
      return { headers: credentials.headers };
    }
    default: {
      return {};
    }
  }
};

/** Resolve machine-managed provider auth at the last responsible moment. */
export const resolveConnectorMcpParams = async (
  connector: DecryptedConnector,
  ctx: Pick<ConnectorToolSyncContext, 'connectorModel' | 'serverDB'>,
  expectedGitHubGrant?: { githubUserId: string; grantRevision: string },
): Promise<Parameters<typeof mcpService.listRawTools>[0]> => {
  if (isGitHubMcpConnector(connector)) {
    return buildGitHubMcpParams({
      connector,
      db: ctx.serverDB,
      expectedGrant: expectedGitHubGrant,
    });
  }

  const fresh = await ensureFreshConnectorToken(connector, ctx.connectorModel);
  return buildConnectorMcpParams(fresh);
};
