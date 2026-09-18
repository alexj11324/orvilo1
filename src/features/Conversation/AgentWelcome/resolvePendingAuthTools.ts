import type {
  ComposioAppType,
  ConnectorCatalogAvailability,
  OrviloSkillProviderType,
} from '@orvilo/const';
import { resolveConnectorCatalogItem } from '@orvilo/const';

import type { ComposioServer } from '@/store/tool/slices/composioStore';
import { ComposioServerStatus } from '@/store/tool/slices/composioStore';
import type { OrviloSkillServer } from '@/store/tool/slices/orviloSkillStore/types';
import { OrviloSkillStatus } from '@/store/tool/slices/orviloSkillStore/types';

/** A Composio connector that still requires authorization. */
export interface PendingComposioTool extends ComposioAppType {
  /** Authorization system used by the alert row. */
  authType: 'composio';
  /** Existing pending connection, when one has already been created. */
  server?: ComposioServer;
}

/** A Orvilo Market connector that still requires provider authorization. */
export interface PendingOrviloTool extends OrviloSkillProviderType {
  /** Authorization system used by the alert row. */
  authType: 'orvilo';
  /** Current provider connection state, when it has already been checked. */
  server?: OrviloSkillServer;
}

/** A built-in capability that requires the shared Market session. */
export interface PendingMarketTool {
  /** Authorization system used by the alert row. */
  authType: 'market';
  /** Display avatar for the built-in capability. */
  avatar: string;
  /** Agent plugin identifier. */
  identifier: string;
  /** User-facing capability name. */
  label: string;
}

/** One unresolved authorization requirement displayed by the agent welcome card. */
export type PendingAuthTool = PendingComposioTool | PendingOrviloTool | PendingMarketTool;

/** Inputs needed to derive pending authorization rows without reading React stores. */
export interface ResolvePendingAuthToolsInput {
  /** Enabled connector systems for canonical source resolution. */
  availability: ConnectorCatalogAvailability;
  /** Whether the first Composio connection request has settled. */
  composioInitialized: boolean;
  /** Current Composio connection states. */
  composioServers: ComposioServer[];
  /** Whether the shared Market session is authenticated. */
  marketAuthenticated: boolean;
  /** Built-in capabilities gated only by the shared Market session. */
  marketTools: PendingMarketTool[];
  /** Whether the first Orvilo Market connection request has settled. */
  orviloInitialized: boolean;
  /** Current Orvilo Market connection states. */
  orviloServers: OrviloSkillServer[];
  /** Active agent plugin identifiers. */
  plugins: string[];
}

/**
 * Resolves agent plugin identifiers into their pending authorization rows.
 *
 * Use when:
 * - Agent configuration stores unqualified connector identifiers
 * - The welcome card must choose exactly one OAuth system for each identifier
 *
 * Expects:
 * - Connection initialization flags prevent transient false unauthorized rows
 * - Connector catalog ownership is resolved before legacy Market-only tools
 *
 * Returns:
 * - Deduplicated pending rows in agent plugin order
 */
export const resolvePendingAuthTools = ({
  availability,
  composioInitialized,
  composioServers,
  orviloInitialized,
  orviloServers,
  marketAuthenticated,
  marketTools,
  plugins,
}: ResolvePendingAuthToolsInput): PendingAuthTool[] => {
  const pending: PendingAuthTool[] = [];
  const seenIdentifiers = new Set<string>();

  for (const identifier of plugins) {
    if (seenIdentifiers.has(identifier)) continue;
    seenIdentifiers.add(identifier);

    const composioServer = composioServers.find((item) => item.identifier === identifier);
    const orviloServer = orviloServers.find((item) => item.identifier === identifier);

    const connector = resolveConnectorCatalogItem(identifier, availability);
    if (connector?.type === 'orvilo') {
      if (!orviloInitialized) continue;
      if (orviloServer?.status !== OrviloSkillStatus.CONNECTED) {
        pending.push({ ...connector.provider, authType: 'orvilo', server: orviloServer });
      }
      continue;
    }

    if (connector?.type === 'composio') {
      if (!composioInitialized) continue;
      if (!composioServer || composioServer.status === ComposioServerStatus.PENDING_AUTH) {
        pending.push({ ...connector.serverType, authType: 'composio', server: composioServer });
      }
      continue;
    }

    const marketTool = marketTools.find((item) => item.identifier === identifier);
    if (marketTool && !marketAuthenticated) pending.push(marketTool);
  }

  return pending;
};
