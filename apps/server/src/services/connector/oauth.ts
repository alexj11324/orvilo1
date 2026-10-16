import { refreshAuthorization } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  AuthorizationServerMetadata,
  OAuthClientInformationMixed,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';

export const buildOAuthClientInformation = (params: {
  clientId: string;
  clientSecret?: string;
  tokenEndpointAuthMethod?: string;
}): OAuthClientInformationMixed => ({
  client_id: params.clientId,
  client_secret: params.clientSecret,
  token_endpoint_auth_method: params.tokenEndpointAuthMethod,
});

/** Refresh an expired access token using the stored refresh token. */
export const refreshConnectorToken = async (params: {
  authorizationServerUrl: string;
  clientInformation: OAuthClientInformationMixed;
  metadata: AuthorizationServerMetadata;
  refreshToken: string;
  resource?: string;
}): Promise<OAuthTokens> => {
  return refreshAuthorization(params.authorizationServerUrl, {
    clientInformation: params.clientInformation,
    metadata: params.metadata,
    refreshToken: params.refreshToken,
    resource: params.resource ? new URL(params.resource) : undefined,
  });
};
