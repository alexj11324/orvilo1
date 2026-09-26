import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureFreshConnectorToken } from './tokens';

const mocks = vi.hoisted(() => ({
  discoverAuthorizationServerMetadata: vi.fn(),
  refreshConnectorToken: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/client/auth.js', () => ({
  discoverAuthorizationServerMetadata: mocks.discoverAuthorizationServerMetadata,
}));
vi.mock('./oauth', () => ({
  buildOAuthClientInformation: (params: {
    clientId: string;
    clientSecret?: string;
    tokenEndpointAuthMethod?: string;
  }) => ({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    token_endpoint_auth_method: params.tokenEndpointAuthMethod,
  }),
  refreshConnectorToken: mocks.refreshConnectorToken,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.discoverAuthorizationServerMetadata.mockResolvedValue({
    token_endpoint: 'https://auth.example.com/token',
  });
  mocks.refreshConnectorToken.mockResolvedValue({
    access_token: 'new-access-token',
    refresh_token: 'new-refresh-token',
    token_type: 'bearer',
  });
});

describe('ensureFreshConnectorToken', () => {
  it('reuses the DCR token endpoint auth method during refresh', async () => {
    const update = vi.fn();
    const connector = {
      credentials: {
        accessToken: 'expired-access-token',
        expiresAt: 0,
        refreshToken: 'refresh-token',
        type: 'oauth2',
      },
      id: 'connector-1',
      mcpServerUrl: 'https://mcp.example.com',
      oidcConfig: {
        clientId: 'dcr-client',
        clientSecret: 'dcr-secret',
        issuer: 'https://auth.example.com',
        scheme: 'dcr',
        tokenEndpointAuthMethod: 'client_secret_post',
      },
    } as any;

    await ensureFreshConnectorToken(connector, { update } as any);

    expect(mocks.refreshConnectorToken).toHaveBeenCalledWith(
      expect.objectContaining({
        clientInformation: {
          client_id: 'dcr-client',
          client_secret: 'dcr-secret',
          token_endpoint_auth_method: 'client_secret_post',
        },
      }),
    );
    expect(update).toHaveBeenCalledOnce();
  });
});
