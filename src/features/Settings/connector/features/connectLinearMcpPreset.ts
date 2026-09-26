import { getMcpPresetConnectorIdentifier, type McpPresetConnector } from '@orvilo/const';

import { ConnectorSourceType } from '@/database/schemas';
import {
  type OAuthPopupResult,
  waitForOAuthPopup,
} from '@/features/Connectors/CustomConnectorModal/oauthPopup';

interface ConnectorOAuthActions {
  createConnector: (params: {
    identifier: string;
    mcpConnectionType: 'http';
    mcpServerUrl: string;
    name: string;
    oidcConfig: { scheme: 'dcr' };
    sourceType: typeof ConnectorSourceType.custom;
  }) => Promise<{ id: string; isNew: boolean }>;
  fetchConnectors: () => Promise<void>;
  openExternalLink?: (url: string) => Promise<void>;
  startConnectorOAuth: (id: string) => Promise<string>;
}

/** Called directly from the click handler so the web popup opens before any await. */
export const connectLinearMcpPreset = async (
  preset: McpPresetConnector,
  existingConnectorId: string | undefined,
  actions: ConnectorOAuthActions,
): Promise<OAuthPopupResult | { status: 'blocked' | 'external' }> => {
  const popup = actions.openExternalLink
    ? null
    : window.open('about:blank', 'orvilo-connector-oauth', 'width=600,height=720');
  if (!actions.openExternalLink && !popup) return { status: 'blocked' };

  try {
    const id =
      existingConnectorId ??
      (
        await actions.createConnector({
          identifier: getMcpPresetConnectorIdentifier(preset),
          mcpConnectionType: 'http',
          mcpServerUrl: preset.url,
          name: preset.label,
          oidcConfig: { scheme: 'dcr' },
          sourceType: ConnectorSourceType.custom,
        })
      ).id;
    const authorizationUrl = await actions.startConnectorOAuth(id);
    if (actions.openExternalLink) {
      await actions.openExternalLink(authorizationUrl);
      return { status: 'external' };
    }

    popup!.location.href = authorizationUrl;
    const result = await waitForOAuthPopup(popup!, id);
    await actions.fetchConnectors();
    return result;
  } catch (error) {
    if (popup && !popup.closed) popup.close();
    throw error;
  }
};
