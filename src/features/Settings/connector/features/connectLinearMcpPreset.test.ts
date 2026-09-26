/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { connectLinearMcpPreset } from './connectLinearMcpPreset';

const linear = {
  authType: 'oauth2' as const,
  description: 'Linear',
  icon: '/linear.png',
  id: 'linear',
  label: 'Linear',
  url: 'https://mcp.linear.app/mcp',
};

afterEach(() => vi.restoreAllMocks());

describe('connectLinearMcpPreset', () => {
  it('opens a popup before creating the DCR connector and refreshes after the callback', async () => {
    const popup = {
      closed: false,
      close: vi.fn(),
      location: { href: 'about:blank' },
    } as unknown as Window;
    const createConnector = vi.fn().mockResolvedValue({ id: 'connector-1', isNew: true });
    vi.spyOn(window, 'open').mockImplementation(() => {
      expect(createConnector).not.toHaveBeenCalled();
      return popup;
    });
    const fetchConnectors = vi.fn().mockResolvedValue(undefined);
    const startConnectorOAuth = vi.fn().mockResolvedValue('https://linear.app/oauth/authorize');

    const result = connectLinearMcpPreset(linear, undefined, {
      createConnector,
      fetchConnectors,
      startConnectorOAuth,
    });
    await vi.waitFor(() => expect(popup.location.href).toBe('https://linear.app/oauth/authorize'));
    expect(createConnector).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'linear-mcp',
        mcpServerUrl: linear.url,
        oidcConfig: { scheme: 'dcr' },
      }),
    );

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          connectorId: 'connector-1',
          success: true,
          synced: true,
          type: 'orvilo-connector-oauth',
        },
        origin: window.location.origin,
      }),
    );
    await expect(result).resolves.toEqual({ status: 'success', synced: true });
    expect(fetchConnectors).toHaveBeenCalledOnce();
  });

  it('leaves connector creation untouched when popups are blocked', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const createConnector = vi.fn();
    const result = await connectLinearMcpPreset(linear, undefined, {
      createConnector,
      fetchConnectors: vi.fn(),
      startConnectorOAuth: vi.fn(),
    });
    expect(result).toEqual({ status: 'blocked' });
    expect(createConnector).not.toHaveBeenCalled();
  });

  it('opens Electron OAuth externally without creating an in-app popup', async () => {
    const openPopup = vi.spyOn(window, 'open');
    const createConnector = vi.fn().mockResolvedValue({ id: 'connector-1', isNew: true });
    const fetchConnectors = vi.fn().mockResolvedValue(undefined);
    const openExternalLink = vi.fn().mockResolvedValue(undefined);
    const startConnectorOAuth = vi.fn().mockResolvedValue('https://linear.app/oauth/authorize');

    const result = await connectLinearMcpPreset(linear, undefined, {
      createConnector,
      fetchConnectors,
      openExternalLink,
      startConnectorOAuth,
    });

    expect(result).toEqual({ status: 'external' });
    expect(openExternalLink).toHaveBeenCalledWith('https://linear.app/oauth/authorize');
    expect(openPopup).not.toHaveBeenCalled();
    expect(fetchConnectors).not.toHaveBeenCalled();
  });
});
