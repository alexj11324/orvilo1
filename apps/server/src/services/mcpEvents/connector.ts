import { isLocalOrPrivateUrl } from '@orvilo/utils';

import type { ConnectorModel } from '@/database/models/connector';
import { ConnectorMcpConnectionType, ConnectorStatus } from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import { resolveConnectorMcpParams } from '@/server/services/connector/sync';
import { mcpService } from '@/server/services/mcp';

import { McpEventsAdapter } from './adapter';
import { MCP_EVENTS_METHODS } from './protocol';

/** Resolve the authenticated connector for every request, including renewals. */
export function createConnectorEventsAdapter(
  connectorId: string,
  ctx: { connectorModel: ConnectorModel; serverDB: OrviloDatabase },
) {
  return new McpEventsAdapter({
    async request(method, params, options) {
      if (!Object.values(MCP_EVENTS_METHODS).includes(method as never)) {
        throw new Error('Unsupported event protocol method');
      }
      const connector = await ctx.connectorModel.findById(connectorId);
      if (
        !connector?.isEnabled ||
        connector.status !== ConnectorStatus.connected ||
        connector.agentId ||
        connector.metadata?.mountedByAgentId ||
        connector.mcpConnectionType === ConnectorMcpConnectionType.stdio ||
        !connector.mcpServerUrl ||
        isLocalOrPrivateUrl(connector.mcpServerUrl)
      ) {
        throw new Error('Event source is unavailable');
      }
      const connection = await resolveConnectorMcpParams(connector, ctx);
      return mcpService.requestEventProtocol(
        connection,
        method as (typeof MCP_EVENTS_METHODS)[keyof typeof MCP_EVENTS_METHODS],
        params,
        options,
      );
    },
  });
}
