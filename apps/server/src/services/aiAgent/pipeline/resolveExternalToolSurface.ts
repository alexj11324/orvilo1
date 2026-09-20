import debug from 'debug';

import { ConnectorModel } from '@/database/models/connector';
import { ConnectorToolModel } from '@/database/models/connectorTool';
import { PluginModel } from '@/database/models/plugin';
import type { OrviloDatabase } from '@/database/type';

import {
  connectorAuthRevision,
  type ExternalToolPins,
  pluginInstallPin,
  surfaceSchemaDigests,
} from './externalToolPins';
import type { ExternalToolSurfaceEntry } from './runToolSurface';

const log = debug('orvilo-server:ai-agent:external-tool-surface');

/**
 * Resolve non-builtin tool identifiers to their callable surface.
 *
 * Two sources, in precedence order:
 *   - `user_connectors` + `user_connector_tools` (agent-aware via
 *     `resolveByIdentifiers` — an agent-scoped connector beats the shared one):
 *     mounted only when the connector is enabled and has synced, non-disabled
 *     tools. Calls at exec time go through `callConnectorToolById`-equivalent
 *     credential/permission resolution.
 *   - `user_installed_plugins` (`PluginModel`): mounted only when the install
 *     row carries a manifest api list AND callable MCP transport params
 *     (`customParams.mcp`), which the exec path re-reads — the surface never
 *     persists the params themselves.
 *
 * Ids that resolve to neither are simply absent from the returned map —
 * `resolveRunToolSurface` marks them `plugin-not-installed`.
 */
export const resolveExternalToolSurface = async (input: {
  agentId?: string;
  candidateIds: string[];
  db: OrviloDatabase;
  userId: string;
  workspaceId?: string;
}): Promise<Record<string, ExternalToolSurfaceEntry>> => {
  const { agentId, candidateIds, db, userId, workspaceId } = input;
  const result: Record<string, ExternalToolSurfaceEntry> = {};
  const ids = [...new Set(candidateIds)];
  if (!ids.length) return result;

  const connectorModel = new ConnectorModel(db, userId, workspaceId);
  const connectors = await connectorModel.resolveByIdentifiers(ids, agentId).catch((error) => {
    log('connector resolution failed: %O', error);
    return [] as Awaited<ReturnType<ConnectorModel['resolveByIdentifiers']>>;
  });
  const enabled = connectors.filter((c) => c.isEnabled);
  if (enabled.length) {
    const connectorToolModel = new ConnectorToolModel(db, userId, workspaceId);
    const tools = await connectorToolModel
      .queryByConnectorIds(enabled.map((c) => c.id))
      .catch((error) => {
        log('connector tool resolution failed: %O', error);
        return [] as Awaited<ReturnType<ConnectorToolModel['queryByConnectorIds']>>;
      });
    const toolsByConnector = new Map<string, typeof tools>();
    for (const tool of tools) {
      const list = toolsByConnector.get(tool.userConnectorId) ?? [];
      list.push(tool);
      toolsByConnector.set(tool.userConnectorId, list);
    }
    for (const connector of enabled) {
      const apis = (toolsByConnector.get(connector.id) ?? []).map((tool) => ({
        description: tool.description ?? undefined,
        name: tool.toolName,
        parameters: tool.inputSchema as Record<string, unknown> | undefined,
      }));
      // Pin the exact authorized connection + grant revision + per-api schema
      // digests so exec re-authorizes THIS row — a re-linked, re-synced or
      // re-authorized same-identifier connection is refused, not substituted.
      const pins: ExternalToolPins = {
        authRevision: connectorAuthRevision(connector),
        connectorId: connector.id,
        schemaDigests: surfaceSchemaDigests(apis),
      };
      result[connector.identifier] = { apis, callable: true, pins, source: 'connector' };
    }
  }

  const pluginModel = new PluginModel(db, userId, workspaceId);
  for (const identifier of ids) {
    if (result[identifier]) continue;
    let plugin: Awaited<ReturnType<PluginModel['findById']>> | undefined;
    try {
      plugin = await pluginModel.findById(identifier);
    } catch (error) {
      log('plugin resolution failed for %s: %O', identifier, error);
      continue;
    }
    const apis = plugin?.manifest?.api;
    if (!plugin || !apis?.length) continue;
    const mcpParams =
      plugin.customParams?.mcp ?? (plugin.manifest as { mcpParams?: unknown })?.mcpParams;
    const mountedApis = apis.map((api) => ({
      description: api.description,
      name: api.name,
      parameters: api.parameters as Record<string, unknown> | undefined,
    }));
    result[identifier] = {
      apis: mountedApis,
      callable: Boolean(mcpParams),
      pins: {
        pluginInstallId: pluginInstallPin(plugin),
        schemaDigests: surfaceSchemaDigests(mountedApis),
      } satisfies ExternalToolPins,
      source: 'mcp-plugin',
    };
  }

  return result;
};
