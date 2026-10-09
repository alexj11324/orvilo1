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
  it('re-enables an authorized but disabled connector without reopening OAuth', async () => {
    const openPopup = vi.spyOn(window, 'open').mockReturnValue(null);
    const connector = { id: 'connector-1', isEnabled: false, status: 'connected' };
    const actions = {
      createConnector: vi.fn(),
      fetchConnectors: vi.fn(),
      openExternalLink: vi.fn(),
      startConnectorOAuth: vi.fn(),
      updateConnector: vi.fn().mockImplementation(async (_id, patch) => {
        Object.assign(connector, patch);
      }),
    };

    await expect(connectLinearMcpPreset(linear, connector, actions)).resolves.toEqual({
      status: 'success',
    });
    expect(connector.isEnabled).toBe(true);
    expect(actions.updateConnector).toHaveBeenCalledExactlyOnceWith('connector-1', {
      isEnabled: true,
    });
    expect(actions.createConnector).not.toHaveBeenCalled();
    expect(actions.startConnectorOAuth).not.toHaveBeenCalled();
    expect(actions.openExternalLink).not.toHaveBeenCalled();
    expect(openPopup).not.toHaveBeenCalled();
  });

  it('propagates a failed re-enable and allows another attempt on the same connector', async () => {
    const openPopup = vi.spyOn(window, 'open').mockReturnValue(null);
    const connector = { id: 'connector-1', isEnabled: false, status: 'connected' };
    const actions = {
      createConnector: vi.fn(),
      fetchConnectors: vi.fn(),
      startConnectorOAuth: vi.fn(),
      updateConnector: vi
        .fn()
        .mockRejectedValueOnce(new Error('update failed'))
        .mockImplementationOnce(async (_id, patch) => {
          Object.assign(connector, patch);
        }),
    };

    await expect(connectLinearMcpPreset(linear, connector, actions)).rejects.toThrow(
      'update failed',
    );
    expect(connector.isEnabled).toBe(false);
    await expect(connectLinearMcpPreset(linear, connector, actions)).resolves.toEqual({
      status: 'success',
    });
    expect(connector.isEnabled).toBe(true);
    expect(actions.updateConnector).toHaveBeenCalledTimes(2);
    expect(actions.startConnectorOAuth).not.toHaveBeenCalled();
    expect(openPopup).not.toHaveBeenCalled();
  });

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
    let attempt = '';
    const startConnectorOAuth = vi.fn().mockImplementation((_id: string, oauthAttempt?: string) => {
      attempt = oauthAttempt ?? '';
      return Promise.resolve('https://linear.app/oauth/authorize');
    });

    const result = connectLinearMcpPreset(linear, undefined, {
      createConnector,
      fetchConnectors,
      startConnectorOAuth,
      updateConnector: vi.fn(),
    });
    await vi.waitFor(() => expect(popup.location.href).toBe('https://linear.app/oauth/authorize'));
    expect(createConnector).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'linear-mcp',
        mcpServerUrl: linear.url,
        oidcConfig: { scheme: 'dcr' },
      }),
    );
    expect(startConnectorOAuth).toHaveBeenCalledWith('connector-1', expect.any(String));

    const event = new MessageEvent('message', {
      data: {
        attempt,
        connectorId: 'connector-1',
        success: true,
        synced: true,
        type: 'orvilo-connector-oauth',
      },
      origin: window.location.origin,
    });
    Object.defineProperty(event, 'source', { configurable: true, value: popup });
    window.dispatchEvent(event);
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
      updateConnector: vi.fn(),
    });
    expect(result).toEqual({ status: 'blocked' });
    expect(createConnector).not.toHaveBeenCalled();
  });

  it('preserves OAuth success when the connector refresh fails', async () => {
    const popup = {
      closed: false,
      close: vi.fn(),
      location: { href: 'about:blank' },
    } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(popup);
    const fetchConnectors = vi.fn().mockRejectedValue(new Error('refresh failed'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    let attempt = '';

    const result = connectLinearMcpPreset(
      linear,
      { id: 'connector-1', isEnabled: true, status: 'disconnected' },
      {
        createConnector: vi.fn(),
        fetchConnectors,
        startConnectorOAuth: vi.fn().mockImplementation((_id: string, oauthAttempt?: string) => {
          attempt = oauthAttempt ?? '';
          return Promise.resolve('https://linear.app/oauth/authorize');
        }),
        updateConnector: vi.fn(),
      },
    );
    await vi.waitFor(() => expect(popup.location.href).toBe('https://linear.app/oauth/authorize'));
    const event = new MessageEvent('message', {
      data: {
        attempt,
        connectorId: 'connector-1',
        success: true,
        synced: true,
        type: 'orvilo-connector-oauth',
      },
      origin: window.location.origin,
    });
    Object.defineProperty(event, 'source', { configurable: true, value: popup });
    window.dispatchEvent(event);

    await expect(result).resolves.toEqual({
      refreshFailed: true,
      status: 'success',
      synced: true,
    });
    expect(fetchConnectors).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith(
      '[Connector] Failed to refresh connectors after OAuth:',
      expect.any(Error),
    );
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
      updateConnector: vi.fn(),
    });

    expect(result).toEqual({ status: 'external' });
    expect(openExternalLink).toHaveBeenCalledWith('https://linear.app/oauth/authorize');
    expect(openPopup).not.toHaveBeenCalled();
    expect(fetchConnectors).not.toHaveBeenCalled();
  });
});
