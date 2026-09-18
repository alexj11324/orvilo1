import urlJoin from 'url-join';

import { OFFICIAL_SITE } from '@/const/url';

import { type ToolStoreState } from '../../initialState';
import { type OrviloSkillServer } from './types';
import { OrviloSkillStatus } from './types';

/**
 * Orvilo Skill Store Selectors
 */
export const orviloSkillStoreSelectors = {
  /**
   * Get all Orvilo Skill server identifiers as a set
   */
  getAllServerIdentifiers: (s: ToolStoreState): Set<string> => {
    const servers = s.orviloSkillServers || [];
    return new Set(servers.map((server) => server.identifier));
  },

  /**
   * Get all available tools from all connected servers
   */
  getAllTools: (s: ToolStoreState) => {
    const connectedServers = orviloSkillStoreSelectors.getConnectedServers(s);
    return connectedServers.flatMap((server) =>
      (server.tools || []).map((tool) => ({
        ...tool,
        provider: server.identifier,
      })),
    );
  },

  /**
   * Get all connected servers
   */
  getConnectedServers: (s: ToolStoreState): OrviloSkillServer[] =>
    (s.orviloSkillServers || []).filter((server) => server.status === OrviloSkillStatus.CONNECTED),

  /**
   * Get server by identifier
   * @param identifier - Provider identifier (e.g., 'linear')
   */
  getServerByIdentifier: (identifier: string) => (s: ToolStoreState) =>
    s.orviloSkillServers?.find((server) => server.identifier === identifier),

  /**
   * Get all Orvilo Skill servers
   */
  getServers: (s: ToolStoreState): OrviloSkillServer[] => s.orviloSkillServers || [],

  /**
   * Check if the given identifier is a Orvilo Skill server
   * @param identifier - Provider identifier (e.g., 'linear')
   */
  isOrviloSkillServer:
    (identifier: string) =>
    (s: ToolStoreState): boolean => {
      const servers = s.orviloSkillServers || [];
      return servers.some((server) => server.identifier === identifier);
    },

  /**
   * Check if a server is loading
   * @param identifier - Provider identifier (e.g., 'linear')
   */
  isServerLoading: (identifier: string) => (s: ToolStoreState) =>
    s.orviloSkillLoadingIds?.has(identifier) || false,

  /**
   * Check if a tool is currently executing
   */
  isToolExecuting: (provider: string, toolName: string) => (s: ToolStoreState) => {
    const toolId = `${provider}:${toolName}`;
    return s.orviloSkillExecutingToolIds?.has(toolId) || false;
  },

  /**
   * Get all Orvilo Skill tools as OrviloTool format for agent use
   * Converts Orvilo Skill tools into the format expected by ToolNameResolver
   */
  orviloSkillAsOrviloTools: (s: ToolStoreState) => {
    const servers = s.orviloSkillServers || [];
    const tools: any[] = [];

    for (const server of servers) {
      if (!server.tools || server.status !== OrviloSkillStatus.CONNECTED) continue;

      const apis = server.tools.map((tool) => ({
        description: tool.description || '',
        name: tool.name,
        parameters: tool.inputSchema || {},
      }));

      if (apis.length > 0) {
        tools.push({
          identifier: server.identifier,
          manifest: {
            api: apis,
            author: 'Orvilo Market',
            homepage: urlJoin(OFFICIAL_SITE, 'market'),
            identifier: server.identifier,
            meta: {
              avatar: server.icon || '🔗',
              description: `Orvilo Skill: ${server.name}`,
              tags: ['orvilo-skill', server.identifier],
              title: server.name,
            },
            type: 'builtin',
            version: '1.0.0',
          },
          type: 'plugin',
        });
      }
    }

    return tools;
  },

  /**
   * Get metadata list for all connected Orvilo Skill servers
   * Used by toolSelectors.metaList for unified tool metadata resolution
   */
  metaList: (s: ToolStoreState) => {
    const servers = s.orviloSkillServers || [];

    return servers
      .filter((server) => server.status === OrviloSkillStatus.CONNECTED)
      .map((server) => ({
        identifier: server.identifier,
        meta: {
          avatar: server.icon || '🔗',
          description: `Orvilo Skill: ${server.name}`,
          title: server.name,
        },
      }));
  },
};
