import type { McpPresetConnector } from '@orvilo/const';

import type { ConnectorWithTools } from '@/store/tool/slices/connector/types';

interface McpPresetConnectionStateInput {
  connector?: ConnectorWithTools;
  currentUserId?: string;
  managedAuth?: McpPresetConnector['managedAuth'];
  providerConnected?: boolean;
}

/**
 * A workspace GitHub connector executes with its recorded grant owner. The
 * current viewer's personal GitHub status is relevant only when they own that
 * grant; otherwise the durable connector state remains authoritative.
 */
export const isMcpPresetConnected = ({
  connector,
  currentUserId,
  managedAuth,
  providerConnected,
}: McpPresetConnectionStateInput): boolean => {
  if (!connector?.isEnabled || connector.status !== 'connected') return false;
  if (managedAuth !== 'github-app') return true;

  const grantOwnerUserId = (
    connector.metadata?.githubMcp as { grantOwnerUserId?: string } | undefined
  )?.grantOwnerUserId;
  if (grantOwnerUserId && (!currentUserId || grantOwnerUserId !== currentUserId)) return true;

  return providerConnected !== false;
};
